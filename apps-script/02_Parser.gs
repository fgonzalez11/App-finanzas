/**
 * 02_Parser.gs — Convierte texto suelto en un gasto.
 *
 * Ejemplos que entiende:
 *   "2500 nafta"                      -> 2500, Transporte
 *   "nafta 2500 con credito"          -> 2500, Transporte, Crédito
 *   "ayer 1.200,50 super coto"        -> ayer, 1200.50, Supermercado
 *   "12/08 15k alquiler"              -> 12/08, 15000, Vivienda
 *   "u$s 40 suscripcion claude"       -> 40 USD, Suscripciones
 *   "3 lucas cena con flor"           -> 3000, Comida fuera
 *
 * Todo acá es JavaScript puro (sin APIs de Google) para poder testearlo aparte.
 */

function sinAcentos_(s) {
  return String(s)
    .replace(/á/gi, 'a').replace(/é/gi, 'e').replace(/í/gi, 'i')
    .replace(/ó/gi, 'o').replace(/ú/gi, 'u').replace(/ü/gi, 'u');
}

function normalizar_(s) {
  return sinAcentos_(String(s || '')).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** "2.500,50" -> 2500.5 | "1,500" -> 1500 | "2,50" -> 2.5 | "1.5" -> 1.5 */
function aNumero_(token) {
  var t = String(token).replace(/\s/g, '');
  // Grupos de miles: 1.234 / 1,234,567 / 12.345.678
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return parseFloat(t.replace(/[.,]/g, ''));
  // Ambos separadores: el último es el decimal
  if (/[.,]/.test(t) && t.indexOf('.') !== -1 && t.indexOf(',') !== -1) {
    var dec = t.lastIndexOf('.') > t.lastIndexOf(',') ? '.' : ',';
    var mil = dec === '.' ? ',' : '.';
    t = t.split(mil).join('');
    return parseFloat(t.replace(dec, '.'));
  }
  return parseFloat(t.replace(',', '.'));
}

var MULTIPLICADORES_ = [
  { re: /^(k|mil|luca|lucas)$/, factor: 1000 },
  { re: /^(m|palo|palos|millon|millones)$/, factor: 1000000 }
];

/** Devuelve { monto, moneda, resto } o null si no encontró plata. */
function extraerMonto_(texto) {
  var t = texto;
  var moneda = null;

  // Marcadores de moneda extranjera
  if (/\b(u\$s|us\$|usd|dolar|dolares|verdes)\b/i.test(sinAcentos_(t))) moneda = 'USD';

  var re = /(?:\$|u\$s|us\$|usd|ars)?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d+)?)\s*(k|mil|lucas?|palos?|millones?|millon)?\b/gi;
  var m, mejor = null;
  while ((m = re.exec(t)) !== null) {
    var conSimbolo = /[\$]/.test(m[0]);
    var cand = { idx: m.index, largo: m[0].length, num: m[1], suf: m[2] || '', simbolo: conSimbolo };
    // Preferimos el número que viene con símbolo de peso; si no, el primero.
    if (!mejor || (conSimbolo && !mejor.simbolo)) mejor = cand;
  }
  if (!mejor) return null;

  var monto = aNumero_(mejor.num);
  if (isNaN(monto)) return null;

  var suf = normalizar_(mejor.suf);
  if (suf) {
    for (var i = 0; i < MULTIPLICADORES_.length; i++) {
      if (MULTIPLICADORES_[i].re.test(suf)) { monto = monto * MULTIPLICADORES_[i].factor; break; }
    }
  }

  var resto = t.substring(0, mejor.idx) + ' ' + t.substring(mejor.idx + mejor.largo);
  return { monto: monto, moneda: moneda, resto: resto };
}

/**
 * Saca un tramo del texto por posición.
 * Va por índice y no por replace() porque el patrón se busca sobre el texto
 * sin acentos, y reemplazar esa cadena en el original puede no encontrarla.
 * (sinAcentos_ cambia una letra por otra, así que las posiciones coinciden.)
 */
function quitarEn_(texto, desde, largo) {
  return texto.substring(0, desde) + ' ' + texto.substring(desde + largo);
}

var DIAS_SEMANA_ = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

var MESES_NOMBRE_ = {
  enero: 0, ene: 0, febrero: 1, feb: 1, marzo: 2, mar: 2, abril: 3, abr: 3,
  mayo: 4, may: 4, junio: 5, jun: 5, julio: 6, jul: 6, agosto: 7, ago: 7,
  septiembre: 8, setiembre: 8, sept: 8, sep: 8, set: 8, octubre: 9, oct: 9,
  noviembre: 10, nov: 10, diciembre: 11, dic: 11
};

/** Devuelve { fecha: Date, resto } — si no hay pista de fecha, usa hoy. */
function extraerFecha_(texto, hoy) {
  var base = hoy ? new Date(hoy.getTime()) : new Date();
  base.setHours(12, 0, 0, 0);
  var t = texto;
  var n = normalizar_(t);

  function corrimiento(dias, patron) {
    var f = new Date(base.getTime());
    f.setDate(f.getDate() - dias);
    return { fecha: f, resto: t.replace(patron, ' ') };
  }

  if (/\bantes de ayer\b/.test(n)) return corrimiento(2, /\bantes de ayer\b/i);
  if (/\banteayer\b/.test(n)) return corrimiento(2, /\banteayer\b/i);
  if (/\bayer\b/.test(n)) return corrimiento(1, /\bayer\b/i);
  if (/\bhoy\b/.test(n)) return corrimiento(0, /\bhoy\b/i);

  // dd/mm o dd/mm/aaaa (también con - o .)
  var mFecha = n.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (mFecha) {
    var dia = parseInt(mFecha[1], 10);
    var mes = parseInt(mFecha[2], 10) - 1;
    var anio = mFecha[3] ? parseInt(mFecha[3], 10) : base.getFullYear();
    if (anio < 100) anio += 2000;
    if (dia >= 1 && dia <= 31 && mes >= 0 && mes <= 11) {
      var f = new Date(anio, mes, dia, 12, 0, 0, 0);
      // Sin año explícito y quedó en el futuro -> era del año pasado
      if (!mFecha[3] && f.getTime() > base.getTime() + 86400000) f.setFullYear(anio - 1);
      var reF = new RegExp(mFecha[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      return { fecha: f, resto: t.replace(reF, ' ') };
    }
  }

  // "12 de agosto", "12 ago", "el 3 de septiembre"
  // Importante que esto exista: sin la regla, "12 de agosto nafta 2500" tomaba
  // el 12 como monto y registraba un gasto de $12.
  // El año tiene que verse como año ((19|20)xx). Si aceptara cualquier número,
  // en "3 de septiembre 8000 cine" se comería el 8000 como año y perdería el monto.
  var mNombre = n.match(/\b(?:el\s+)?(\d{1,2})\s+(?:de\s+)?([a-z]{3,10})\.?(?:\s+(?:de\s+)?((?:19|20)\d{2}))?\b/);
  if (mNombre && MESES_NOMBRE_.hasOwnProperty(mNombre[2])) {
    var d1 = parseInt(mNombre[1], 10);
    var m1 = MESES_NOMBRE_[mNombre[2]];
    var a1 = mNombre[3] ? parseInt(mNombre[3], 10) : base.getFullYear();
    if (a1 < 100) a1 += 2000;
    if (d1 >= 1 && d1 <= 31) {
      var fn = new Date(a1, m1, d1, 12, 0, 0, 0);
      if (!mNombre[3] && fn.getTime() > base.getTime() + 86400000) fn.setFullYear(a1 - 1);
      return { fecha: fn, resto: quitarEn_(t, mNombre.index, mNombre[0].length) };
    }
  }

  // "el 12" -> el 12 de este mes; si todavía no llegó, el del mes pasado
  var mDia = n.match(/\bel\s+(\d{1,2})\b/);
  if (mDia) {
    var d2 = parseInt(mDia[1], 10);
    if (d2 >= 1 && d2 <= 31) {
      var fd = new Date(base.getFullYear(), base.getMonth(), d2, 12, 0, 0, 0);
      if (fd.getDate() !== d2) fd = null;                       // 31 en un mes de 30
      if (fd && fd.getTime() > base.getTime() + 86400000) {
        fd = new Date(base.getFullYear(), base.getMonth() - 1, d2, 12, 0, 0, 0);
      }
      if (fd) return { fecha: fd, resto: quitarEn_(t, mDia.index, mDia[0].length) };
    }
  }

  // "el lunes", "el sabado"
  for (var i = 0; i < DIAS_SEMANA_.length; i++) {
    var re = new RegExp('\\b(el )?' + DIAS_SEMANA_[i] + '\\b', 'i');
    if (re.test(n)) {
      var f2 = new Date(base.getTime());
      var delta = (f2.getDay() - i + 7) % 7;
      if (delta === 0) delta = 7;
      f2.setDate(f2.getDate() - delta);
      return { fecha: f2, resto: t.replace(re, ' ') };
    }
  }

  return { fecha: base, resto: t };
}

var MEDIOS_PATRONES_ = [
  { medio: 'Mercado Pago',  re: /\b(mercado ?pago|mp|qr)\b/i },
  { medio: 'Transferencia', re: /\b(transferencia|transferi|transf|cbu|cvu|alias)\b/i },
  // "cuotas" ya NO implica crédito: los planes que cargás a mano son los que
  // no pasan por la tarjeta. Si es con tarjeta, decilo y lo toma.
  { medio: 'Crédito',       re: /\b(credito|tarjeta|visa|master ?card|master|amex)\b/i },
  { medio: 'Débito',        re: /\b(debito|maestro)\b/i },
  { medio: 'Efectivo',      re: /\b(efectivo|cash|contado|billetes)\b/i }
];

/**
 * Detecta un plan en cuotas y lo saca del texto.
 *
 *   "sommier 480000 en 6 cuotas"   -> 6 cuotas, el monto es el TOTAL
 *   "6 cuotas de 80000 sommier"    -> 6 cuotas, el monto es el de CADA una
 *
 * Tiene que correr ANTES de buscar el monto: si no, en "6 cuotas de 80000"
 * el parser se quedaría con el 6.
 *
 * Devuelve { n, esTotal, resto }. Con n = 0 no hay cuotas.
 */
function extraerCuotas_(texto) {
  var t = String(texto);
  var plano = sinAcentos_(t);   // mismo largo que t: los índices sirven para los dos
  var n = 0, esTotal = true, m = null;

  m = plano.match(/\b(\d{1,2})\s*(?:cuotas?|pagos?)\s+de\b/i);
  if (m) {
    n = parseInt(m[1], 10);
    esTotal = false;
  } else {
    m = plano.match(/\ben\s*(\d{1,2})\s*(?:cuotas?|pagos?)\b/i) ||
        plano.match(/\b(\d{1,2})\s*cuotas\b/i) ||
        plano.match(/\bx\s?(\d{1,2})\s*(?:cuotas?|pagos?)\b/i);
    if (m) { n = parseInt(m[1], 10); esTotal = true; }
  }

  if (!n || n < 2 || n > 60) return { n: 0, esTotal: true, resto: t };

  t = t.substring(0, m.index) + ' ' + t.substring(m.index + m[0].length);
  t = t.replace(/\bsin\s*inter[eé]s(es)?\b/i, ' ');
  return { n: n, esTotal: esTotal, resto: t };
}

function extraerMedio_(texto) {
  var n = sinAcentos_(texto);
  for (var i = 0; i < MEDIOS_PATRONES_.length; i++) {
    var p = MEDIOS_PATRONES_[i];
    if (p.re.test(n)) {
      var m = n.match(p.re);
      var re = new RegExp('\\b(con |en |por )?' + m[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      return { medio: p.medio, resto: texto.replace(re, ' ') };
    }
  }
  return { medio: '', resto: texto };
}

function limpiarDescripcion_(texto) {
  return String(texto)
    .replace(/\b(u\$s|us\$|usd|ars|dolares|dolar|pesos|peso|gaste|gasté|pague|pagué|compre|compré)\b/gi, ' ')
    .replace(/\b(de|del|en|con|por|para|la|el|los|las|un|una|y)\b\s*$/gi, ' ')
    .replace(/^\s*\b(de|del|en|con|por|para|y)\b\s*/gi, ' ')
    .replace(/[\s,;:.\-]+/g, ' ')
    .trim();
}

/**
 * categorias: [{ nombre, tipo, emoji, palabras: [..] }]
 * Gana la palabra clave más larga que aparezca en el texto.
 * Devuelve el objeto categoría completo, o null.
 */
/**
 * Como normalizar_, pero además convierte la puntuación en espacios.
 *
 * Los resúmenes escriben los comercios pegados a símbolos: WWW.DEXTER.COM.AR,
 * DLO*PEDIDOSYA, APPLE.COM/BILL. Buscando con límites de palabra, "dexter"
 * nunca aparecía porque está rodeado de puntos.
 *
 * Va aparte y no dentro de normalizar_ porque esa función también arma los
 * hashes de deduplicación: cambiarla movería los hashes ya guardados.
 */
function paraBuscar_(s) {
  return sinAcentos_(String(s || '')).toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * opciones.nombreManda (por defecto true): nombrar la categoría gana sobre
 * cualquier palabra clave. Sirve cuando el texto lo escribís vos —"angelelli
 * luz" es Luz, aunque "angelelli" sea una clave más larga de Gas.
 *
 * En los resúmenes de tarjeta hay que apagarlo: ahí el texto lo escribe el
 * banco y los nombres de categoría aparecen de casualidad dentro del comercio.
 * "PEDIDOSYA*CASA CENTRAL" no es la categoría Casa, y con la regla prendida
 * ninguna palabra aprendida podría corregirlo nunca.
 */
function categorizarObj_(texto, categorias, opciones) {
  var n = paraBuscar_(texto);
  if (!n) return null;
  var nombreManda = !opciones || opciones.nombreManda !== false;
  var mejor = null, puntaje = 0;

  function probar(cat, palabra, bonus) {
    var pal = paraBuscar_(palabra);
    if (!pal) return;
    var re = new RegExp('(^|\\s)' + pal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?(\\s|$)');
    if (!re.test(n)) return;
    var p = pal.length + bonus;
    if (p > puntaje) { mejor = cat; puntaje = p; }
  }

  (categorias || []).forEach(function (cat) {
    probar(cat, cat.nombre, nombreManda ? 1000 : 0);
    (cat.palabras || []).forEach(function (p) { probar(cat, p, 0); });
  });
  return mejor;
}

/** Compatibilidad: devuelve solo el nombre. */
function categorizar_(texto, categorias) {
  var c = categorizarObj_(texto, categorias);
  return c ? c.nombre : '';
}

/** "cobré", "me devolvieron", "entró" -> es un ingreso aunque la categoría no lo diga. */
var PISTAS_INGRESO_ = /\b(cobre|cobré|me pagaron|me devolvieron|devolucion|devolución|entro|entró|ingreso|deposito|depósito|reintegro|me transfirieron)\b/i;

/**
 * Parser principal.
 * opciones: { categorias, personas, hoy, monedaDefault }
 * Devuelve { ok, monto (siempre positivo), moneda, fecha, categoria, tipo,
 *            persona, descripcion, medio, esIngreso, confianza }
 */
function parsearGasto_(texto, opciones) {
  opciones = opciones || {};
  var crudo = String(texto || '').trim();
  if (!crudo) return { ok: false, error: 'texto vacío' };

  var f = extraerFecha_(crudo, opciones.hoy);
  var cu = extraerCuotas_(f.resto);          // antes del monto, a propósito
  var m = extraerMonto_(cu.resto);
  if (!m) return { ok: false, error: 'no encontré el monto', textoOriginal: crudo };

  var md = extraerMedio_(m.resto);
  var descripcion = limpiarDescripcion_(md.resto);
  var cat = categorizarObj_(descripcion, opciones.categorias);

  var categoria = cat ? cat.nombre : '';
  var tipo = cat ? cat.tipo : '';
  var esIngreso = PISTAS_INGRESO_.test(sinAcentos_(crudo)) ||
                  (tipo && tipo.indexOf('01.') === 0);

  // Si la categoría está atada a una persona (cuota alimentaria, préstamos),
  // la completamos sola.
  var persona = '';
  (opciones.personas || []).forEach(function (p) {
    if (p.tipo && p.tipo === tipo) persona = p.nombre;
    var re = new RegExp('(^|\\s)' + normalizar_(p.nombre) + '(\\s|$)');
    if (re.test(normalizar_(crudo))) persona = p.nombre;
  });

  // Con cuotas siempre trabajamos con el TOTAL; el reparto viene después.
  var monto = Math.round(m.monto * 100) / 100;
  var total = cu.n ? (cu.esTotal ? monto : Math.round(monto * cu.n * 100) / 100) : monto;

  return {
    ok: true,
    monto: total,
    cuotas: cu.n,
    moneda: m.moneda || opciones.monedaDefault || MONEDA_DEFAULT,
    fecha: f.fecha,
    categoria: categoria,
    tipo: tipo,
    persona: persona,
    esIngreso: !!esIngreso,
    descripcion: descripcion,
    medio: md.medio,
    confianza: categoria ? 'alta' : 'media',
    textoOriginal: crudo
  };
}
