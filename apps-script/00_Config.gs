/**
 * FINANZAS — Backend en Google Apps Script
 * -----------------------------------------
 * 00_Config.gs — Constantes, propiedades y menú de configuración.
 *
 * Modelo de datos (heredado de tu planilla, no inventado):
 *   Tipo de movimiento  ->  01. Cobros / 02. Pagos esenciales / 03. Pagos secundarios /
 *                           04. Cuota alimentaria / 05. Préstamos
 *   Categoría           ->  tus 30 de siempre
 *   Importe             ->  CON SIGNO: los ingresos suman, los gastos restan
 *   Persona             ->  Noe / Nikin, para las cuentas que llevás con alguien
 *
 * Los secretos (token de Telegram, API key de Gemini, clave de la API) NO se
 * guardan en la planilla: viven en las "Propiedades del script".
 */

/**
 * Versión del código. La subo cada vez que te paso archivos nuevos.
 *
 * Sirve para no adivinar: /ping te la dice. Si no coincide con la última que
 * te pasé, lo que está corriendo es la versión vieja y falta implementar.
 * Acordate: "Nueva implementación" crea una URL NUEVA (y Telegram sigue
 * apuntando a la vieja). Lo que hay que hacer es
 * "Gestionar implementaciones → ✏️ → Versión: Nueva".
 */
var VERSION = '13 · repartir una categoría en varias';

var HOJA_MOVIMIENTOS  = 'Movimientos';
var HOJA_CATEGORIAS   = 'Categorias';
var HOJA_TIPOS        = 'Tipos';
var HOJA_PERSONAS     = 'Personas';
var HOJA_RECORDATORIOS = 'Recordatorios';
var HOJA_RESUMEN      = 'Resumen';

/* Aviso: día hábil anterior al vencimiento, a esta hora.
   Google no garantiza el minuto: dispara dentro de esa hora. */
var HORA_RECORDATORIOS = 12;

var ZONA = 'America/Argentina/Buenos_Aires';
var MONEDA_DEFAULT = 'ARS';

// Columnas de la hoja Movimientos (1-indexadas)
var COL = {
  ID: 1, FECHA: 2, TIPO: 3, CATEGORIA: 4, IMPORTE: 5, MONEDA: 6, PERSONA: 7,
  DETALLE: 8, MEDIO: 9, ORIGEN: 10, NOTAS: 11, CREADO: 12, HASH: 13
};
var TOTAL_COLS = 13;

var ENCABEZADOS = [
  'ID', 'Fecha', 'Tipo', 'Categoria', 'Importe', 'Moneda', 'Persona',
  'Detalle', 'Medio', 'Origen', 'Notas', 'CreadoEn', 'Hash'
];

var MEDIOS = ['Efectivo', 'Débito', 'Crédito', 'Transferencia', 'Mercado Pago', 'Otro'];

// Naturaleza de cada tipo. 'Ingreso' suma al ahorro, 'Gasto' resta,
// 'Movimiento' no es ni una cosa ni la otra (plata que sale pero vuelve).
var TIPOS_INICIALES = [
  ['00. Saldo inicial',     0, 'Movimiento', 'NO', '🏁'],
  ['01. Cobros',            1, 'Ingreso',    'NO', '💰'],
  ['02. Pagos esenciales',  2, 'Gasto',      'SI', '🏠'],
  ['03. Pagos secundarios', 3, 'Gasto',      'SI', '🛍️'],
  ['04. Cuota alimentaria', 4, 'Gasto',      'SI', '👧'],
  ['05. Préstamos',         5, 'Movimiento', 'NO', '🤝']
];

var TIPO_OTROS = '03. Pagos secundarios';
var CATEGORIA_OTROS = 'Otros';

function props_() { return PropertiesService.getScriptProperties(); }

function getProp_(clave, porDefecto) {
  var v = props_().getProperty(clave);
  return (v === null || v === '') ? (porDefecto === undefined ? '' : porDefecto) : v;
}

function setProp_(clave, valor) { props_().setProperty(clave, String(valor)); }

/** Menú propio dentro de la planilla. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💸 Finanzas')
    .addItem('1. Preparar planilla', 'prepararPlanilla')
    .addSeparator()
    .addItem('2. Configurar token de Telegram', 'configurarTokenTelegram')
    .addItem('3. Autorizar mi chat de Telegram', 'configurarChatTelegram')
    .addItem('4. Configurar API key de Gemini (opcional)', 'configurarGemini')
    .addItem('5. Generar clave de la app web', 'generarClaveApi')
    .addSeparator()
    .addItem('6. Conectar el bot (activar webhook)', 'activarWebhook')
    .addSeparator()
    .addItem('🩺 Diagnosticar el bot', 'diagnosticar')
    .addItem('Ver estado de la configuración', 'verEstado')
    .addItem('Desconectar el bot', 'desactivarWebhook')
    .addSeparator()
    .addItem('🔔 Activar los recordatorios', 'instalarRecordatorios')
    .addItem('Probar los recordatorios ahora', 'revisarRecordatorios')
    .addSeparator()
    .addItem('Recalcular resumen', 'refrescarResumen')
    .addItem('Limpiar movimientos duplicados', 'limpiarDuplicados')
    .addToUi();
}

function pedirTexto_(titulo, mensaje) {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt(titulo, mensaje, ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return null;
  return r.getResponseText().trim();
}

function configurarTokenTelegram() {
  var t = pedirTexto_('Token de Telegram',
    'Pegá el token que te dio @BotFather.\n\nSe ve parecido a:\n123456789:AAH...xyz');
  if (!t) return;
  setProp_('TELEGRAM_TOKEN', t);
  SpreadsheetApp.getUi().alert('Listo. Token guardado.\n\nAhora corré el paso 3 para autorizar tu chat.');
}

function configurarChatTelegram() {
  var token = getProp_('TELEGRAM_TOKEN');
  if (!token) { SpreadsheetApp.getUi().alert('Primero cargá el token (paso 2).'); return; }
  var ui = SpreadsheetApp.getUi();
  ui.alert('Autorizar tu chat',
    'Abrí Telegram, buscá tu bot y mandale cualquier mensaje (por ejemplo "hola").\n\n' +
    'Después apretá OK acá y voy a buscar tu ID.', ui.ButtonSet.OK);

  var resp = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getUpdates',
    { muteHttpExceptions: true });
  var data = JSON.parse(resp.getContentText());
  if (!data.ok || !data.result || !data.result.length) {
    ui.alert('No encontré mensajes.\n\nMandale un mensaje al bot y volvé a intentar.\n\n' +
      'Si el bot ya está conectado por webhook, usá primero "Desconectar el bot".');
    return;
  }
  var ids = {};
  data.result.forEach(function (u) {
    var m = u.message || u.edited_message || (u.callback_query && u.callback_query.message);
    if (m && m.chat && m.chat.id) ids[m.chat.id] = (m.chat.first_name || m.chat.title || '');
  });
  var lista = Object.keys(ids);
  if (!lista.length) { ui.alert('No encontré ningún chat. Probá de nuevo.'); return; }

  setProp_('TELEGRAM_CHAT_IDS', lista.join(','));
  ui.alert('Autorizado ✅\n\nChat(s): ' + lista.map(function (id) {
    return id + (ids[id] ? ' (' + ids[id] + ')' : '');
  }).join('\n'));
}

function configurarGemini() {
  var k = pedirTexto_('API key de Gemini (opcional)',
    'Sirve para entender audios, fotos de tickets y frases sueltas.\n' +
    'Se saca gratis en aistudio.google.com/apikey\n\n' +
    'Si la dejás vacía, el bot igual funciona con las reglas de texto.');
  if (k === null) return;
  setProp_('GEMINI_API_KEY', k);
  SpreadsheetApp.getUi().alert(k ? 'Key guardada.' : 'Key borrada. El bot va a usar solo reglas de texto.');
}

function generarClaveApi() {
  var actual = getProp_('API_SECRET');
  var ui = SpreadsheetApp.getUi();
  if (actual) {
    var r = ui.alert('Ya hay una clave generada',
      'Si generás una nueva vas a tener que volver a configurar la app. ¿Seguimos?',
      ui.ButtonSet.YES_NO);
    if (r !== ui.Button.YES) return;
  }
  var clave = Utilities.getUuid().replace(/-/g, '').substring(0, 24);
  setProp_('API_SECRET', clave);
  ui.alert('Clave de la app web:\n\n' + clave + '\n\nGuardala: la pegás una sola vez en la app.');
}

function verEstado() {
  SpreadsheetApp.getUi().alert('Estado', [
    'Versión del código: ' + VERSION,
    '',
    'Token de Telegram: ' + (getProp_('TELEGRAM_TOKEN') ? '✅ cargado' : '❌ falta'),
    'Chats autorizados: ' + (getProp_('TELEGRAM_CHAT_IDS') || '❌ falta'),
    'Gemini: ' + (getProp_('GEMINI_API_KEY') ? '✅ cargada' : '➖ sin key (solo reglas)'),
    'Clave de la app web: ' + (getProp_('API_SECRET') || '❌ falta'),
    'Webhook: ' + (getProp_('WEBHOOK_URL') || '❌ sin conectar')
  ].join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}
