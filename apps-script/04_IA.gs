/**
 * 04_IA.gs — Gemini para audios, fotos de tickets y frases que las reglas no pescan.
 * Es OPCIONAL: si no hay API key, el bot funciona igual con el parser de texto.
 * Key gratuita: https://aistudio.google.com/apikey
 */

var GEMINI_URL_ = 'https://generativelanguage.googleapis.com/v1beta/models/';

function modeloGemini_() { return getProp_('GEMINI_MODEL', 'gemini-2.5-flash'); }
function hayIA_() { return !!getProp_('GEMINI_API_KEY'); }

/** partes: [{text}] o [{inline_data:{mime_type,data}}]. esquema: JSON Schema (opcional). */
function llamarGemini_(partes, esquema) {
  var key = getProp_('GEMINI_API_KEY');
  if (!key) return null;

  var cuerpo = {
    contents: [{ role: 'user', parts: partes }],
    generationConfig: { temperature: 0 }
  };
  if (esquema) {
    cuerpo.generationConfig.responseMimeType = 'application/json';
    cuerpo.generationConfig.responseSchema = esquema;
  }

  try {
    var r = UrlFetchApp.fetch(GEMINI_URL_ + modeloGemini_() + ':generateContent?key=' + key, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true
    });
    if (r.getResponseCode() !== 200) {
      Logger.log('Gemini ' + r.getResponseCode() + ': ' + r.getContentText().substring(0, 500));
      return null;
    }
    var data = JSON.parse(r.getContentText());
    var txt = data.candidates && data.candidates[0] &&
      data.candidates[0].content && data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
    if (!txt) return null;
    return esquema ? JSON.parse(txt) : txt;
  } catch (e) {
    Logger.log('Error Gemini: ' + e);
    return null;
  }
}

var ESQUEMA_GASTO_ = {
  type: 'OBJECT',
  properties: {
    monto: { type: 'NUMBER' },
    moneda: { type: 'STRING' },
    fecha: { type: 'STRING' },
    categoria: { type: 'STRING' },
    descripcion: { type: 'STRING' },
    medio: { type: 'STRING' },
    esIngreso: { type: 'BOOLEAN' },
    persona: { type: 'STRING' },
    cuotas: { type: 'INTEGER' }
  },
  required: ['monto', 'descripcion']
};

function contextoPrompt_(categorias, hoy) {
  var f = Utilities.formatDate(hoy || new Date(), ZONA, 'yyyy-MM-dd');
  var personas = leerPersonas_();
  return 'Sos un asistente que registra los movimientos de finanzas personales de alguien ' +
    'que vive en Argentina.\n' +
    'Hoy es ' + f + '.\n' +
    'Categorías válidas (elegí exactamente una, tal cual está escrita): ' +
    categorias.map(function (c) { return c.nombre; }).join(' | ') + '\n' +
    'Medios de pago válidos: ' + MEDIOS.join(' | ') + ' (o vacío si no se menciona).\n' +
    (personas.length
      ? 'Personas con cuenta abierta: ' + personas.map(function (p) {
          return p.nombre + ' (' + p.vinculo + ', ' + p.concepto + ')';
        }).join(' | ') + '. Completá "persona" solo si el movimiento la involucra.\n'
      : '') +
    'esIngreso: true si es plata que ENTRA (sueldo, cobro, devolución, reintegro), ' +
    'false si es plata que sale.\n' +
    'Moneda: "ARS" salvo que hable de dólares, en cuyo caso "USD".\n' +
    'Montos: vienen en formato argentino (1.234,56 = mil doscientos treinta y cuatro con 56). ' +
    '"luca"/"k"/"mil" = x1000, "palo" = x1000000.\n' +
    'La fecha va en formato yyyy-MM-dd. Si no se menciona, usá hoy.\n' +
    'El monto siempre positivo; el signo lo pone el sistema.\n' +
    'cuotas: la cantidad de cuotas si es un plan ("en 6 cuotas", "seis pagos"); ' +
    'si no hay cuotas, 0 o vacío. Cuando hay cuotas, "monto" tiene que ser el ' +
    'TOTAL de la compra: si te dicen el valor de cada cuota, multiplicá.\n' +
    'La descripción tiene que ser corta (2 a 5 palabras), sin el monto ni la fecha.\n';
}

/** Fallback cuando el parser de reglas no encuentra monto o categoría. */
function iaParsearTexto_(texto, categorias, hoy) {
  if (!hayIA_()) return null;
  var r = llamarGemini_([{
    text: contextoPrompt_(categorias, hoy) +
      '\nExtraé el gasto de este mensaje:\n"""' + texto + '"""'
  }], ESQUEMA_GASTO_);
  return normalizarSalidaIA_(r, categorias, hoy);
}

/** Transcribe una nota de voz y devuelve el gasto. */
function iaAudioAGasto_(base64, mime, categorias, hoy) {
  if (!hayIA_()) return null;
  var r = llamarGemini_([
    { text: contextoPrompt_(categorias, hoy) + '\nEscuchá el audio y extraé el gasto que menciona.' },
    { inline_data: { mime_type: mime || 'audio/ogg', data: base64 } }
  ], ESQUEMA_GASTO_);
  return normalizarSalidaIA_(r, categorias, hoy);
}

/** Lee la foto de un ticket / comprobante. */
function iaTicketAGasto_(base64, mime, categorias, hoy) {
  if (!hayIA_()) return null;
  var r = llamarGemini_([
    {
      text: contextoPrompt_(categorias, hoy) +
        '\nEsta es la foto de un ticket o comprobante. Extraé el TOTAL final (no los items sueltos, ' +
        'no el subtotal), el comercio como descripción y la fecha del ticket si se ve.'
    },
    { inline_data: { mime_type: mime || 'image/jpeg', data: base64 } }
  ], ESQUEMA_GASTO_);
  return normalizarSalidaIA_(r, categorias, hoy);
}

function normalizarSalidaIA_(r, categorias, hoy) {
  if (!r || !r.monto || isNaN(Number(r.monto))) return null;
  var fecha;
  if (r.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) fecha = new Date(r.fecha + 'T12:00:00');
  else fecha = hoy ? new Date(hoy.getTime()) : new Date();

  var nombres = categorias.map(function (c) { return c.nombre; });
  var cat = (r.categoria && nombres.indexOf(r.categoria) >= 0)
    ? catPorNombre_(r.categoria, categorias)
    : categorizarObj_(r.descripcion || '', categorias);

  var personas = leerPersonas_();
  var persona = '';
  personas.forEach(function (p) {
    if (r.persona && normalizar_(r.persona) === normalizar_(p.nombre)) persona = p.nombre;
    if (!persona && cat && cat.tipo && cat.tipo === p.tipo) persona = p.nombre;
  });

  var tipo = cat ? cat.tipo : '';
  var cuotas = parseInt(r.cuotas, 10);
  if (!(cuotas >= 2 && cuotas <= 60)) cuotas = 0;
  return {
    ok: true,
    cuotas: cuotas,
    monto: Math.abs(Math.round(Number(r.monto) * 100) / 100),
    moneda: (r.moneda === 'USD') ? 'USD' : MONEDA_DEFAULT,
    fecha: fecha,
    categoria: cat ? cat.nombre : '',
    tipo: tipo,
    persona: persona,
    esIngreso: r.esIngreso === true || (tipo && tipo.indexOf('01.') === 0),
    descripcion: String(r.descripcion || '').trim(),
    medio: (r.medio && MEDIOS.indexOf(r.medio) >= 0) ? r.medio : '',
    confianza: 'ia'
  };
}

/**
 * Parser combinado: primero reglas (instantáneo y gratis), IA solo si hace falta.
 */
function interpretarTexto_(texto, categorias, hoy) {
  var opts = {
    categorias: categorias, personas: leerPersonas_(),
    hoy: hoy, monedaDefault: MONEDA_DEFAULT
  };
  var r = parsearGasto_(texto, opts);
  if (r.ok && r.categoria && r.descripcion) return r;

  var ia = iaParsearTexto_(texto, categorias, hoy);
  if (ia) return ia;

  if (r.ok) {
    r.categoria = r.categoria || CATEGORIA_OTROS;
    r.tipo = r.tipo || tipoDeCategoria_(r.categoria, categorias);
    return r;
  }
  return r;
}
