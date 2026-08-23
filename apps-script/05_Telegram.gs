/**
 * 05_Telegram.gs — El bot. Es la vía principal de carga.
 */

function tgUrl_(metodo) {
  return 'https://api.telegram.org/bot' + getProp_('TELEGRAM_TOKEN') + '/' + metodo;
}

function tgLlamar_(metodo, payload) {
  try {
    var r = UrlFetchApp.fetch(tgUrl_(metodo), {
      method: 'post', contentType: 'application/json',
      payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    return JSON.parse(r.getContentText());
  } catch (e) {
    Logger.log('Telegram ' + metodo + ': ' + e);
    return null;
  }
}

function tgEnviar_(chatId, texto, teclado) {
  var p = { chat_id: chatId, text: texto, parse_mode: 'HTML', disable_web_page_preview: true };
  if (teclado) p.reply_markup = { inline_keyboard: teclado };
  return tgLlamar_('sendMessage', p);
}

function tgEditar_(chatId, messageId, texto, teclado) {
  var p = { chat_id: chatId, message_id: messageId, text: texto, parse_mode: 'HTML' };
  if (teclado) p.reply_markup = { inline_keyboard: teclado };
  return tgLlamar_('editMessageText', p);
}

function tgResponderCallback_(id, texto) {
  return tgLlamar_('answerCallbackQuery', { callback_query_id: id, text: texto || '' });
}

function tgDescargar_(fileId) {
  var info = tgLlamar_('getFile', { file_id: fileId });
  if (!info || !info.ok) return null;
  var url = 'https://api.telegram.org/file/bot' + getProp_('TELEGRAM_TOKEN') + '/' + info.result.file_path;
  var blob = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getBlob();
  return { base64: Utilities.base64Encode(blob.getBytes()) };
}

function chatAutorizado_(chatId) {
  var ids = getProp_('TELEGRAM_CHAT_IDS', '').split(',').map(function (s) { return s.trim(); });
  return ids.indexOf(String(chatId)) >= 0;
}

// ---------------------------------------------------------------- webhook

function activarWebhook() {
  var token = getProp_('TELEGRAM_TOKEN');
  if (!token) { SpreadsheetApp.getUi().alert('Falta el token (paso 2).'); return; }

  var sugerida = '';
  try { sugerida = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (sugerida.indexOf('/exec') < 0) sugerida = '';

  var url = pedirTexto_('Conectar el bot',
    'Pegá la URL de la aplicación web (la que termina en /exec).\n\n' +
    'La sacás de "Implementar" → "Gestionar implementaciones".' +
    (sugerida ? '\n\nSugerencia:\n' + sugerida : ''));
  if (url === null) return;
  if (!url) url = sugerida;

  if (!url || url.indexOf('/exec') < 0) {
    SpreadsheetApp.getUi().alert(
      'Necesito la URL que termina en /exec.\n\n' +
      'Andá a "Implementar" → "Nueva implementación" → tipo "Aplicación web",\n' +
      'ejecutar como TÚ, acceso "Cualquier usuario". Copiá la URL y volvé acá.');
    return;
  }

  var r = tgLlamar_('setWebhook', {
    url: url, allowed_updates: ['message', 'edited_message', 'callback_query'],
    drop_pending_updates: true
  });
  if (r && r.ok) {
    setProp_('WEBHOOK_URL', url);
    setProp_('API_URL', url);
    SpreadsheetApp.getUi().alert('Bot conectado ✅\n\nProbá mandarle "2500 nafta" por Telegram.');
  } else {
    SpreadsheetApp.getUi().alert('No pude conectar el bot:\n' + JSON.stringify(r));
  }
}

/**
 * Le pregunta a Telegram cómo ve las cosas de su lado. Es lo primero que hay
 * que mirar cuando el bot no contesta: casi siempre la respuesta está acá.
 */
function infoWebhook_() {
  var r = tgLlamar_('getWebhookInfo', {});
  if (!r || !r.ok) return null;
  return r.result;
}

/**
 * Chequeo de archivos.
 *
 * En Apps Script todos los .gs comparten el mismo espacio: si falta uno, o
 * quedó una versión vieja, no te enterás hasta que algo explota en el medio
 * de un mensaje. Acá probamos una función que solo existe en la versión
 * actual de cada archivo, y decimos cuál falta.
 *
 * Van envueltas en función para que la referencia se evalúe recién al
 * llamarla: si el archivo no está, tira ReferenceError y lo atajamos.
 */
var PIEZAS_ = [
  ['00_Config',   function () { return getProp_; }],
  ['01_Setup',    function () { return prepararPlanilla; }],
  ['02_Parser',   function () { return paraBuscar_; }],
  ['03_Datos',    function () { return crearPlanEnCuotas_; }],
  ['04_IA',       function () { return interpretarTexto_; }],
  ['05_Telegram', function () { return textoPlan_; }],
  ['06_Api',      function () { return opSugerir_; }]
];

function archivosCargados_() {
  return PIEZAS_.map(function (p) {
    var ok = false;
    try { ok = typeof p[1]() === 'function'; } catch (e) { ok = false; }
    return { archivo: p[0], ok: ok };
  });
}

function textoDiagnostico_() {
  var l = [];
  var token = getProp_('TELEGRAM_TOKEN');
  l.push('<b>Diagnóstico</b>\n');
  l.push('Versión del código: <b>' + VERSION + '</b>');

  var piezas = archivosCargados_();
  var faltan = piezas.filter(function (p) { return !p.ok; });
  if (faltan.length) {
    l.push('\n<b>❌ Archivos que faltan o están viejos</b>');
    faltan.forEach(function (p) { l.push('   · <code>' + p.archivo + '.gs</code>'); });
    l.push('<i>Pegalos de nuevo y volvé a implementar con versión nueva.</i>');
  } else {
    l.push('Archivos: ✅ los ' + piezas.length + ' al día');
  }

  l.push('');
  l.push('Token: ' + (token ? '✅' : '❌ falta'));
  l.push('Chats autorizados: ' + (getProp_('TELEGRAM_CHAT_IDS') || '❌ falta'));
  l.push('Gemini: ' + (getProp_('GEMINI_API_KEY') ? '✅' : '➖ sin key'));
  l.push('Clave de la app: ' + (getProp_('API_SECRET') ? '✅' : '❌ falta'));

  var w = infoWebhook_();
  if (!w) { l.push('\n❌ No pude hablar con Telegram. ¿El token es correcto?'); return l.join('\n'); }

  l.push('\n<b>Webhook</b>');
  l.push('URL: ' + (w.url ? '<code>' + w.url + '</code>' : '❌ sin conectar'));
  l.push('En cola: ' + (w.pending_update_count || 0) + ' mensajes');
  if (w.last_error_message) {
    var cuando = w.last_error_date
      ? Utilities.formatDate(new Date(w.last_error_date * 1000), ZONA, 'dd/MM HH:mm') : '?';
    l.push('⚠️ Último error (' + cuando + '):\n<code>' + w.last_error_message + '</code>');
    if (w.last_error_message.indexOf('302') >= 0) {
      l.push('\n<i>El 302 pasa cuando doPost devuelve algo con ContentService: ' +
        'Apps Script redirige y Telegram lo toma como falla. La rama de Telegram ' +
        'tiene que terminar en un return pelado. Si ves esto con el código al día, ' +
        'la fecha del error es vieja: mandá otro mensaje y volvé a mirar.</i>');
    }
  } else {
    l.push('Sin errores ✅');
  }

  var guardada = getProp_('WEBHOOK_URL');
  if (guardada && w.url && guardada !== w.url) {
    l.push('\n⚠️ La URL que tiene Telegram no es la última que implementaste.');
  }
  l.push('\n<b>Planilla</b>');
  l.push('Movimientos: ' + Math.max(0, hojaMov_().getLastRow() - 1));
  l.push('Categorías: ' + leerCategorias_().length + ' · Tipos: ' + leerTipos_().length);
  return l.join('\n');
}

function diagnosticar() {
  var texto = textoDiagnostico_()
    .replace(/<\/?(b|code|i)>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  SpreadsheetApp.getUi().alert('Diagnóstico', texto, SpreadsheetApp.getUi().ButtonSet.OK);
}

function desactivarWebhook() {
  tgLlamar_('deleteWebhook', { drop_pending_updates: false });
  props_().deleteProperty('WEBHOOK_URL');
  SpreadsheetApp.getUi().alert('Bot desconectado.');
}

// ---------------------------------------------------------------- handler

function manejarUpdate_(update) {
  if (update.callback_query) return manejarCallback_(update.callback_query);
  var msg = update.message || update.edited_message;
  if (!msg) return;

  var chatId = msg.chat.id;
  if (!chatAutorizado_(chatId)) {
    tgEnviar_(chatId, 'Este bot es privado. Tu chat ID es <code>' + chatId + '</code>');
    return;
  }

  var categorias = leerCategorias_();
  var hoy = new Date();

  if (msg.text && msg.text.charAt(0) === '/') return manejarComando_(chatId, msg.text, categorias);

  var g = null, aviso = '';

  if (msg.voice || msg.audio) {
    var a = msg.voice || msg.audio;
    if (!hayIA_()) { tgEnviar_(chatId, 'Para audios necesito la API key de Gemini. Cargala desde el menú de la planilla.'); return; }
    var arch = tgDescargar_(a.file_id);
    if (!arch) { tgEnviar_(chatId, 'No pude bajar el audio 😕'); return; }
    g = iaAudioAGasto_(arch.base64, a.mime_type || 'audio/ogg', categorias, hoy);
    aviso = '🎤 ';
  } else if (msg.photo || (msg.document && /^image\//.test(msg.document.mime_type || ''))) {
    if (!hayIA_()) { tgEnviar_(chatId, 'Para fotos necesito la API key de Gemini. Cargala desde el menú de la planilla.'); return; }
    var fid = msg.photo ? msg.photo[msg.photo.length - 1].file_id : msg.document.file_id;
    var img = tgDescargar_(fid);
    if (!img) { tgEnviar_(chatId, 'No pude bajar la foto 😕'); return; }
    g = iaTicketAGasto_(img.base64, msg.document ? msg.document.mime_type : 'image/jpeg', categorias, hoy);
    if (g && msg.caption && !g.descripcion) g.descripcion = msg.caption;
    aviso = '🧾 ';
  } else if (msg.text) {
    var pendiente = montoSueltoParaRecordatorio_(msg.text);
    g = interpretarTexto_(pendiente ? pendiente.texto : msg.text, categorias, hoy);
    if (pendiente && g.ok && !g.categoria) g.categoria = pendiente.categoria;
  }

  if (!g || !g.ok) {
    tgEnviar_(chatId,
      'No encontré el monto 🤔\n\nProbá algo tipo:\n' +
      '<code>2500 nafta</code>\n<code>ayer 1.200 la anonima con débito</code>\n' +
      '<code>12/08 cuota noe 1.271.333</code>');
    return;
  }

  var tipos = leerTipos_();
  var tipo = g.tipo || tipoDeCategoria_(g.categoria || CATEGORIA_OTROS, categorias);

  // ---- plan en cuotas: una fila por mes, no una sola por el total
  if (g.cuotas && g.cuotas >= 2) {
    var plan = crearPlanEnCuotas_({
      fecha: g.fecha, tipo: tipo, categoria: g.categoria || CATEGORIA_OTROS,
      montoTotal: g.monto, n: g.cuotas, moneda: g.moneda, persona: g.persona || '',
      detalle: g.descripcion, medio: g.medio,
      origen: msg.voice ? 'telegram-voz' : 'telegram', esIngreso: g.esIngreso
    });
    tgEnviar_(chatId, aviso + textoPlan_(plan, g, categorias, tipos),
              tecladoPlan_(plan.ids[0], plan.plan, plan.n));
    return;
  }

  var importe = aplicarSigno_(g.monto, tipo, tipos, g.esIngreso ? 1 : -1);

  var mov = {
    fecha: g.fecha, tipo: tipo, categoria: g.categoria || CATEGORIA_OTROS,
    importe: importe, moneda: g.moneda, persona: g.persona || '',
    detalle: g.descripcion, medio: g.medio,
    origen: msg.voice ? 'telegram-voz' : (msg.photo ? 'telegram-foto' : 'telegram')
  };
  var res = agregarMovimiento_(mov);

  // armamos la confirmación con lo que ya tenemos en memoria
  var paraMostrar = {
    tipo: mov.tipo, categoria: mov.categoria, importe: mov.importe, moneda: mov.moneda,
    persona: mov.persona, detalle: mov.detalle, medio: mov.medio,
    fecha: Utilities.formatDate(mov.fecha, ZONA, 'yyyy-MM-dd')
  };
  tgEnviar_(chatId, aviso + textoConfirmacion_(paraMostrar, categorias, tipos),
            tecladoConfirmacion_(res.id));
}

/** Relee un movimiento de la planilla. Solo para los botones, donde no
 *  tenemos el objeto a mano. Al confirmar un alta NO se usa: escanear la
 *  columna de IDs con miles de filas es justo lo que hace lenta la respuesta. */
function movPorId_(id) {
  var fila = buscarFila_(id);
  if (fila < 0) return null;
  return filaAObjeto_(hojaMov_().getRange(fila, 1, 1, TOTAL_COLS).getValues()[0]);
}

function textoConfirmacion_(o, categorias, tipos) {
  if (!o) return '🗑 <s>Movimiento borrado</s>';
  var t = tipoPorNombre_(o.tipo, tipos);
  var signo = o.importe >= 0 ? '➕' : '';
  var partes = [];
  partes.push(signo + '<b>' + formatearMoneda_(Math.abs(o.importe), o.moneda) + '</b> · ' +
    emojiDe_(o.categoria, categorias) + ' ' + o.categoria);

  var l2 = [];
  if (o.detalle) l2.push(o.detalle);
  if (o.persona) l2.push('👤 ' + o.persona);
  if (o.medio) l2.push(o.medio);
  l2.push(o.fecha.substring(8, 10) + '/' + o.fecha.substring(5, 7));
  partes.push('<i>' + l2.join(' · ') + '</i>');
  partes.push('<i>' + ((t && t.emoji) ? t.emoji + ' ' : '') + o.tipo + '</i>');

  var r = resumenMes_();
  partes.push('');

  /* Si el movimiento tiene persona, te devuelvo el número que corresponde a esa
     persona. Y son dos números distintos: con Nikin lo que importa es el saldo
     de la cuenta, con Bastian lo que importa es cuánto llevás gastado en él.
     A tu hijo no le debés plata. */
  if (o.persona) {
    var pd = null;
    r.personas.forEach(function (p) { if (p.nombre === o.persona) pd = p; });
    if (pd && t && t.naturaleza === 'Movimiento') {
      partes.push('Saldo con ' + o.persona + ': <b>' + formatearMoneda_(pd.saldo) + '</b>');
    } else if (pd && pd.gastado) {
      partes.push('Llevás <b>' + formatearMoneda_(pd.gastado) + '</b> gastados en ' + o.persona);
    }
  }
  // Solo el acumulado gastado. El ahorro y lo proyectado están en /mes.
  partes.push('Van <b>' + formatearMoneda_(r.gastos) + '</b> gastados este mes');
  return partes.join('\n');
}

function tecladoConfirmacion_(id) {
  return [[
    { text: '✏️ Categoría', callback_data: 'cat:' + id },
    { text: '👤 Persona', callback_data: 'per:' + id }
  ], [
    { text: '🗑 Borrar', callback_data: 'del:' + id }
  ]];
}

/** Confirmación de un plan en cuotas. */
function textoPlan_(plan, g, categorias, tipos) {
  var t = tipoPorNombre_(g.tipo || tipoDeCategoria_(g.categoria, categorias), tipos);
  var iguales = plan.montos[0] === plan.montos[plan.n - 1];
  var l = [];

  l.push('💳 <b>' + plan.n + ' cuotas de ' + formatearMoneda_(plan.cuota, g.moneda) + '</b>' +
    (iguales ? '' : ' <i>(la última ' + formatearMoneda_(plan.montos[plan.n - 1], g.moneda) + ')</i>'));
  l.push('<i>' + [(g.descripcion || g.categoria),
                  emojiDe_(g.categoria, categorias) + ' ' + g.categoria].join(' · ') + '</i>');
  l.push('Total: <b>' + formatearMoneda_(plan.total, g.moneda) + '</b>');
  l.push('');
  l.push('1ª el ' + Utilities.formatDate(plan.primera, ZONA, 'dd/MM/yy') +
         ' · última el ' + Utilities.formatDate(plan.ultima, ZONA, 'dd/MM/yy'));

  var r = resumenMes_();
  l.push('');
  l.push('Van <b>' + formatearMoneda_(r.gastos) + '</b> gastados este mes');
  return l.join('\n');
}

function tecladoPlan_(idPrimera, plan, n) {
  return [[
    { text: '✏️ Categoría', callback_data: 'cat:' + idPrimera },
    { text: '🗑 Borrar las ' + n, callback_data: 'dp:' + plan.replace('plan:', '') }
  ]];
}

function manejarCallback_(cb) {
  var chatId = cb.message.chat.id;
  if (!chatAutorizado_(chatId)) return;
  var partes = String(cb.data || '').split(':');
  var accion = partes[0], id = partes[1];

  if (accion === 'rc' || accion === 'ro' || accion === 'rx') {
    if (manejarCallbackRecordatorio_(cb, accion, partes)) return;
  }

  var categorias = leerCategorias_(), tipos = leerTipos_();

  if (accion === 'del') {
    borrarMovimiento_(id);
    tgResponderCallback_(cb.id, 'Borrado');
    tgEditar_(chatId, cb.message.message_id, '🗑 <s>Movimiento borrado</s>', []);
    return;
  }

  if (accion === 'dp') {                       // borrar un plan entero
    var borradas = borrarPlan_('plan:' + id);
    tgResponderCallback_(cb.id, borradas + ' cuotas borradas');
    tgEditar_(chatId, cb.message.message_id,
      '🗑 <s>Plan borrado — ' + borradas + ' cuotas</s>', []);
    return;
  }

  if (accion === 'cat') {
    var teclado = [], fila = [];
    categorias.forEach(function (c, i) {
      fila.push({ text: (c.emoji || '') + ' ' + c.nombre, callback_data: 'set:' + id + ':' + i });
      if (fila.length === 2) { teclado.push(fila); fila = []; }
    });
    if (fila.length) teclado.push(fila);
    teclado.push([{ text: '« Volver', callback_data: 'volver:' + id }]);
    tgResponderCallback_(cb.id);
    tgEditar_(chatId, cb.message.message_id, cb.message.text + '\n\n<b>¿Qué categoría?</b>', teclado);
    return;
  }

  if (accion === 'set') {
    var cat = categorias[parseInt(partes[2], 10)];
    var plan = '';
    if (cat) {
      var mov = movPorId_(id);
      plan = mov ? planDeNotas_(mov.notas) : '';
      if (plan) {
        // si la categoría estaba mal en una cuota, lo estaba en todas
        var tocadas = actualizarPlanCategoria_(plan, cat.nombre);
        tgResponderCallback_(cb.id, cat.nombre + ' · ' + tocadas + ' cuotas');
      } else {
        actualizarMovimiento_(id, { categoria: cat.nombre });
        tgResponderCallback_(cb.id, cat.nombre);
      }
      aprenderPalabraClave_(id, cat.nombre);
    }
    tgEditar_(chatId, cb.message.message_id, textoConfirmacion_(movPorId_(id), categorias, tipos),
              plan ? tecladoPlan_(id, plan, filasDePlan_(plan).length) : tecladoConfirmacion_(id));
    return;
  }

  /* Elegir a quién corresponde el gasto, ahí mismo. Antes la persona solo se
     asignaba sola (por el tipo, o si el nombre venía en el mensaje) y no había
     forma de corregirla ni de sacarla desde el bot. */
  if (accion === 'per') {
    var personas = leerPersonas_();
    if (!personas.length) {
      tgResponderCallback_(cb.id, 'No tenés personas cargadas');
      return;
    }
    var tp = [], filaP = [];
    personas.forEach(function (p, i) {
      filaP.push({ text: '👤 ' + p.nombre, callback_data: 'setp:' + id + ':' + i });
      if (filaP.length === 3) { tp.push(filaP); filaP = []; }
    });
    if (filaP.length) tp.push(filaP);
    tp.push([{ text: '— ninguna', callback_data: 'setp:' + id + ':-1' },
             { text: '« Volver', callback_data: 'volver:' + id }]);
    tgResponderCallback_(cb.id);
    tgEditar_(chatId, cb.message.message_id, cb.message.text + '\n\n<b>¿De quién es?</b>', tp);
    return;
  }

  if (accion === 'setp') {
    var iP = parseInt(partes[2], 10);
    var elegida = iP >= 0 ? (leerPersonas_()[iP] || null) : null;
    actualizarMovimiento_(id, { persona: elegida ? elegida.nombre : '' });
    tgResponderCallback_(cb.id, elegida ? elegida.nombre : 'Sin persona');
    tgEditar_(chatId, cb.message.message_id, textoConfirmacion_(movPorId_(id), categorias, tipos),
              tecladoConfirmacion_(id));
    return;
  }

  if (accion === 'volver') {
    tgResponderCallback_(cb.id);
    tgEditar_(chatId, cb.message.message_id, textoConfirmacion_(movPorId_(id), categorias, tipos),
              tecladoConfirmacion_(id));
  }
}

/**
 * Si corregís una categoría a mano, guardo el detalle como palabra clave
 * para no volver a errarle. El bot se va afinando solo con el uso.
 */
function aprenderPalabraClave_(id, categoria) {
  try {
    var fila = buscarFila_(id);
    if (fila < 0) return;
    var det = normalizar_(hojaMov_().getRange(fila, COL.DETALLE).getValue());
    det = det.replace(/\s*\d{1,2}\s*\/\s*\d{1,2}\s*$/, '').trim();   // "sommier 1/6" -> "sommier"
    if (!det || det.split(' ').length > 3) return;

    var h = ss_().getSheetByName(HOJA_CATEGORIAS);
    var n = h.getLastRow() - 1;
    var vals = h.getRange(2, 1, n, 4).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() !== categoria) continue;
      var actuales = String(vals[i][3] || '').split(',').map(function (s) { return normalizar_(s); });
      if (actuales.indexOf(det) >= 0) return;
      var nuevo = String(vals[i][3] || '').trim();
      h.getRange(i + 2, 4).setValue(nuevo ? nuevo + ', ' + det : det);
      return;
    }
  } catch (e) { Logger.log('aprender: ' + e); }
}

// ------------------------------------------------------- recordatorios

function chatPrincipal_() {
  var ids = getProp_('TELEGRAM_CHAT_IDS', '').split(',').map(function (s) { return s.trim(); });
  return ids[0] || null;
}

/** Índice de la categoría en el catálogo, para que entre en callback_data. */
function indiceCategoria_(nombre, categorias) {
  for (var i = 0; i < categorias.length; i++) {
    if (paraBuscar_(categorias[i].nombre) === paraBuscar_(nombre)) return i;
  }
  return -1;
}

/**
 * La corre la tarea programada, una vez por día.
 * Manda un aviso por cada cosa que vence y todavía no cargaste.
 */
function revisarRecordatorios() {
  var chat = chatPrincipal_();
  if (!chat) return;
  var hoy = new Date();
  var mes = Utilities.formatDate(hoy, ZONA, 'yyyy-MM');
  var categorias = leerCategorias_();
  var pendientes = recordatoriosDeHoy_(hoy);

  pendientes.forEach(function (p) {
    // no repetir el mismo aviso dos veces en el mismo mes
    var marca = 'rec:' + paraBuscar_(p.categoria) + ':' + mes + ':' + p.etapa;
    if (getProp_(marca)) return;
    if (getProp_('recOmitido:' + paraBuscar_(p.categoria) + ':' + mes)) return;

    var i = indiceCategoria_(p.categoria, categorias);
    if (i < 0) return;

    var monto = p.ultimo ? Math.abs(p.ultimo.importe) : 0;
    var l = [];
    l.push(p.etapa === 'vence'
      ? '⏰ <b>' + p.categoria + ' vence HOY</b>'
      : '🔔 <b>Toca ' + p.categoria + '</b>');
    l.push('<i>vence el ' + Utilities.formatDate(p.vence, ZONA, 'dd/MM') + '</i>');
    l.push('');
    l.push(monto
      ? 'El mes pasado: <b>' + formatearMoneda_(monto) + '</b>'
      : 'No tengo un monto anterior para sugerirte.');

    var teclado = [];
    if (monto) {
      teclado.push([{ text: '✅ Cargar ' + formatearMoneda_(monto),
                      callback_data: 'rc:' + i + ':' + Math.round(monto) }]);
    }
    teclado.push([{ text: '✏️ Otro monto', callback_data: 'ro:' + i },
                  { text: '⏭ Este mes no', callback_data: 'rx:' + i }]);

    tgEnviar_(chat, l.join('\n'), teclado);
    setProp_(marca, '1');
  });
}

function manejarCallbackRecordatorio_(cb, accion, partes) {
  var chatId = cb.message.chat.id;
  var categorias = leerCategorias_();
  var cat = categorias[parseInt(partes[1], 10)];
  if (!cat) { tgResponderCallback_(cb.id, 'No encuentro esa categoría'); return true; }
  var mes = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM');

  if (accion === 'rc') {                       // cargar con el monto sugerido
    var monto = Number(partes[2]) || 0;
    if (!monto) { tgResponderCallback_(cb.id, 'Sin monto'); return true; }
    var tipos = leerTipos_();
    var tipo = cat.tipo || TIPO_OTROS;
    var mov = {
      fecha: new Date(), tipo: tipo, categoria: cat.nombre,
      importe: aplicarSigno_(monto, tipo, tipos, -1),
      moneda: MONEDA_DEFAULT, detalle: cat.nombre.toLowerCase(), origen: 'recordatorio'
    };
    leerPersonas_().forEach(function (p) { if (p.tipo === tipo) mov.persona = p.nombre; });
    agregarMovimiento_(mov);
    tgResponderCallback_(cb.id, 'Cargado');
    tgEditar_(chatId, cb.message.message_id, textoConfirmacion_({
      tipo: tipo, categoria: cat.nombre, importe: mov.importe, moneda: MONEDA_DEFAULT,
      persona: mov.persona || '', detalle: mov.detalle, medio: '',
      fecha: Utilities.formatDate(mov.fecha, ZONA, 'yyyy-MM-dd')
    }, categorias, tipos), []);
    return true;
  }

  if (accion === 'ro') {                       // otro monto: espera el número
    setProp_('recEsperando', cat.nombre);
    tgResponderCallback_(cb.id);
    tgEnviar_(chatId, 'Mandame el monto de <b>' + cat.nombre + '</b>.\n' +
      '<i>Solo el número, o escribilo como siempre.</i>');
    return true;
  }

  if (accion === 'rx') {                       // este mes no
    setProp_('recOmitido:' + paraBuscar_(cat.nombre) + ':' + mes, '1');
    tgResponderCallback_(cb.id, 'Listo, no te aviso más este mes');
    tgEditar_(chatId, cb.message.message_id,
      '⏭ <s>' + cat.nombre + ' — omitido este mes</s>', []);
    return true;
  }
  return false;
}

/**
 * Si venís de tocar "Otro monto" y mandás solo un número, lo cargamos a esa
 * categoría. Sin esto tendrías que volver a escribir el nombre.
 */
function montoSueltoParaRecordatorio_(texto) {
  var cat = getProp_('recEsperando');
  if (!cat) return null;
  var limpio = String(texto).trim();
  if (!/^[\d.,]+\s*(k|mil|lucas?)?$/i.test(limpio)) return null;
  props_().deleteProperty('recEsperando');
  return { categoria: cat, texto: limpio + ' ' + cat };
}

// ---------------------------------------------------------------- comandos

function manejarComando_(chatId, texto, categorias) {
  var cmd = texto.split(' ')[0].split('@')[0].toLowerCase();

  if (cmd === '/start' || cmd === '/ayuda' || cmd === '/help') {
    tgEnviar_(chatId,
      '<b>Tus finanzas</b>\n\n' +
      'Mandame el movimiento como se te ocurra:\n' +
      '· <code>2500 nafta</code>\n' +
      '· <code>ayer 45.230 la anonima con débito</code>\n' +
      '· <code>12/08 cuota noe 1.271.333</code>\n' +
      '· <code>cobré el sueldo 6.720.000</code>\n' +
      '· <code>le presté 500k a nikin</code>\n\n' +
      '<b>En cuotas</b> (para lo que no va con la tarjeta)\n' +
      '· <code>sommier 480000 en 6 cuotas</code>\n' +
      '· <code>6 cuotas de 80000 sommier</code>\n' +
      'Te crea una fila por mes, no una sola por el total.\n\n' +
      'También podés mandarme una <b>nota de voz</b> o la <b>foto de un ticket</b>.\n\n' +
      '<b>Comandos</b>\n' +
      '/ping — ver si estoy vivo\n' +
      '/diag — revisar la conexión\n' +
      '/recordatorios — lo que falta cargar este mes\n' +
      '/mes — ingresos, gastos y ahorro del mes\n' +
      '/hoy — lo de hoy\n' +
      '/ultimos — últimos 10 movimientos\n' +
      '/saldos — cuánto va con cada persona\n' +
      '/ano — ahorro mes a mes\n' +
      '/deshacer — borra el último\n' +
      '/planilla — link a la planilla');
    return;
  }

  if (cmd === '/mes') {
    var r = resumenMes_();
    var l = ['<b>' + r.mes + '</b>',
      'Ingresos: ' + formatearMoneda_(r.ingresos),
      'Gastos: ' + formatearMoneda_(r.gastos)];
    if (r.proyectado) l.push('Proyectado: ' + formatearMoneda_(r.proyectado));
    // Disponible en vez de ahorro: el ahorro no descuenta lo proyectado y por
    // eso siempre da de más. Este es el número con el que se decide.
    l.push('Disponible: <b>' + formatearMoneda_(r.disponible) + '</b>');
    if (r.faltaCargar && r.faltaCargar.total) {
      l.push('<i>Ojo: falta cargar ' + r.faltaCargar.items.map(function (i) {
        return i.categoria;
      }).join(', ') + ' — unos ' + formatearMoneda_(r.faltaCargar.total) + '</i>');
    }
    l.push('<i>Promedio por día: ' + formatearMoneda_(r.promedioDiario) +
           ' · proyección ' + formatearMoneda_(r.proyeccion) + '</i>');
    l.push('');
    r.porTipo.forEach(function (t) {
      l.push('<b>' + t.tipo + '</b> — ' + formatearMoneda_(t.total));
    });
    l.push('');
    r.porCategoria.slice(0, 12).forEach(function (c) {
      var pct = r.gastos ? Math.round(c.total / r.gastos * 100) : 0;
      l.push(emojiDe_(c.categoria, categorias) + ' ' + c.categoria + ' — ' +
        formatearMoneda_(c.total) + ' <i>(' + pct + '%)</i>');
    });
    tgEnviar_(chatId, l.join('\n'));
    return;
  }

  if (cmd === '/saldos') {
    var r2 = resumenMes_();
    if (!r2.personas.length) { tgEnviar_(chatId, 'No hay cuentas con personas cargadas.'); return; }
    // Las dos lecturas separadas: la cuenta que va y vuelve, y lo que se fue.
    tgEnviar_(chatId, '<b>Personas</b>\n<i>histórico completo</i>\n\n' + r2.personas.map(function (p) {
      var l = ['👤 <b>' + p.nombre + '</b>' + (p.vinculo ? ' <i>(' + p.vinculo + ')</i>' : '')];
      if (p.saldo) l.push('     Saldo: ' + formatearMoneda_(p.saldo));
      if (p.gastado) l.push('     Gastado: ' + formatearMoneda_(p.gastado));
      if (!p.saldo && !p.gastado) l.push('     sin movimientos');
      if (p.concepto) l.push('     <i>' + p.concepto + '</i>');
      return l.join('\n');
    }).join('\n\n'));
    return;
  }

  if (cmd === '/ano' || cmd === '/año') {
    var serie = serieMensual_(12);
    if (!serie.length) { tgEnviar_(chatId, 'Todavía no hay datos.'); return; }
    tgEnviar_(chatId, '<b>Ahorro mes a mes</b>\n\n' + serie.slice().reverse().map(function (m) {
      var signo = m.ahorro >= 0 ? '🟢' : '🔴';
      return signo + ' ' + m.mes + '  ' + formatearMoneda_(m.ahorro);
    }).join('\n'));
    return;
  }

  if (cmd === '/hoy') {
    var hoyStr = Utilities.formatDate(new Date(), ZONA, 'yyyy-MM-dd');
    var lista = listarMovimientos_(80).filter(function (g) { return g.fecha === hoyStr; });
    if (!lista.length) { tgEnviar_(chatId, 'Hoy no anotaste nada todavía.'); return; }
    var tot = lista.reduce(function (a, g) {
      return a + (g.moneda === MONEDA_DEFAULT && g.importe < 0 ? -g.importe : 0);
    }, 0);
    tgEnviar_(chatId, '<b>Hoy</b> — ' + formatearMoneda_(tot) + '\n\n' + lista.map(function (g) {
      return emojiDe_(g.categoria, categorias) + ' ' + formatearMoneda_(g.importe, g.moneda) +
        ' · ' + (g.detalle || g.categoria);
    }).join('\n'));
    return;
  }

  if (cmd === '/ultimos') {
    var u = listarMovimientos_(10);
    if (!u.length) { tgEnviar_(chatId, 'Todavía no hay movimientos cargados.'); return; }
    tgEnviar_(chatId, '<b>Últimos movimientos</b>\n\n' + u.map(function (g) {
      return g.fecha.substring(8, 10) + '/' + g.fecha.substring(5, 7) + '  ' +
        emojiDe_(g.categoria, categorias) + ' ' + formatearMoneda_(g.importe, g.moneda) +
        ' · ' + (g.detalle || g.categoria);
    }).join('\n'));
    return;
  }

  if (cmd === '/deshacer') {
    var ult = listarMovimientos_(1)[0];
    if (!ult) { tgEnviar_(chatId, 'No hay nada que deshacer.'); return; }
    borrarMovimiento_(ult.id);
    tgEnviar_(chatId, '🗑 Borré: ' + formatearMoneda_(ult.importe, ult.moneda) + ' · ' +
      (ult.detalle || ult.categoria));
    return;
  }

  if (cmd === '/recordatorios') {
    var p = pendientesDelMes_(new Date());
    if (!p.length) {
      tgEnviar_(chatId, '✅ No te queda nada pendiente este mes.');
      return;
    }
    var hoy = new Date();
    tgEnviar_(chatId, '<b>Pendientes de este mes</b>\n\n' + p.map(function (x) {
      var dias = Math.round((x.vence - hoy) / 86400000);
      var cuando = dias < 0 ? '⚠️ venció el ' + Utilities.formatDate(x.vence, ZONA, 'dd/MM')
                 : (dias === 0 ? '⏰ vence hoy'
                 : 'vence el ' + Utilities.formatDate(x.vence, ZONA, 'dd/MM'));
      var monto = x.ultimo ? ' · último ' + formatearMoneda_(Math.abs(x.ultimo.importe)) : '';
      return emojiDe_(x.categoria, categorias) + ' <b>' + x.categoria + '</b>\n' +
             '     <i>' + cuando + monto + '</i>';
    }).join('\n'));
    return;
  }

  if (cmd === '/planilla') { tgEnviar_(chatId, ss_().getUrl()); return; }

  if (cmd === '/diag') { tgEnviar_(chatId, textoDiagnostico_()); return; }

  if (cmd === '/ping') {
    tgEnviar_(chatId, '🏓 Estoy vivo.\n' +
      'Versión <b>' + VERSION + '</b>\n' +
      '<i>' + Utilities.formatDate(new Date(), ZONA, 'dd/MM HH:mm:ss') + '</i>\n\n' +
      'Si la versión no es la última que te pasaron, lo que está corriendo es ' +
      'código viejo: falta <b>Implementar → Gestionar implementaciones → ✏️ → ' +
      'Versión: Nueva</b>.');
    return;
  }

  tgEnviar_(chatId, 'No conozco ese comando. Probá /ayuda');
}
