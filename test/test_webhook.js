/*
 * Reproduce el loop que apareció en producción: Telegram reintentando el mismo
 * update porque tardábamos en contestarle, y el bot cargando el gasto de nuevo
 * en cada reintento.
 */
const { stats, resetStats } = require('./shim.js');

let fallas = 0;
function chequear(nombre, ok, detalle) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) fallas++;
}

setProp_('TELEGRAM_TOKEN', 'x:y');
setProp_('TELEGRAM_CHAT_IDS', '12345');
setProp_('API_SECRET', 'demo');

function update(updateId, texto) {
  return {
    update_id: updateId,
    message: { message_id: updateId, chat: { id: 12345 }, text: texto }
  };
}
function post(cuerpo) {
  olvidarCache_();
  return doPost({ postData: { contents: JSON.stringify(cuerpo) } });
}
const filas = () => hojaMov_().getLastRow();

console.log('=== REINTENTOS DE TELEGRAM ===');
const antes = filas();
post(update(900001, '2500 nafta'));
const despuesPrimero = filas();
chequear('el primer envío carga el gasto', despuesPrimero === antes + 1,
  `${antes} -> ${despuesPrimero}`);

// Telegram reintenta el MISMO update_id, igual que pasó a la madrugada
for (let i = 0; i < 11; i++) post(update(900001, '2500 nafta'));
chequear('once reintentos del mismo update no cargan nada más',
  filas() === despuesPrimero, `quedaron ${filas() - antes} filas nuevas`);

// pero un mensaje nuevo de verdad sí tiene que entrar
post(update(900002, '2500 nafta'));
chequear('un update distinto sí carga', filas() === despuesPrimero + 1);

console.log('\n=== CUÁNTO TRABAJA ANTES DE CONTESTAR ===');
resetStats();
post(update(900003, '45230,50 la anonima con debito'));
console.log(`   lecturas de planilla: ${stats.lecturas}`);
console.log(`   celdas leídas:        ${stats.celdas.toLocaleString('es-AR')}`);
console.log(`   llamadas HTTP:        ${stats.fetch.length}`);
chequear('no más de 6 lecturas de planilla por mensaje', stats.lecturas <= 6, `${stats.lecturas}`);
chequear('una sola llamada a Telegram', stats.fetch.length === 1, `${stats.fetch.length}`);
chequear('no escanea la columna de IDs para confirmar',
  stats.celdas < 15000, `${stats.celdas.toLocaleString('es-AR')} celdas`);

const enviado = JSON.parse(stats.fetch[0].payload);
console.log('\n   respuesta del bot:\n' + enviado.text.split('\n').map(l => '   | ' + l).join('\n'));
chequear('el mensaje no tiene restos de formato sin resolver',
  enviado.text.indexOf('%') < 0 && enviado.text.indexOf('2f') < 0);
chequear('muestra el monto formateado', enviado.text.indexOf('45.230,50') >= 0);
chequear('muestra la categoría correcta', enviado.text.indexOf('Supermercados') >= 0);

console.log('\n=== BOTONES ===');
resetStats();
const idUltimo = listarMovimientos_(1)[0].id;
post({ update_id: 900010, callback_query: { id: 'c1', data: 'del:' + idUltimo,
       message: { message_id: 1, chat: { id: 12345 }, text: 'x' } } });
chequear('el botón borrar saca la fila', filas() === despuesPrimero + 1,
  `${filas()}`);

console.log('\n=== LA RESPUESTA HTTP (el 302) ===');
// Telegram no sigue redirects. Si doPost devuelve algo con ContentService,
// Apps Script contesta 302 y Telegram reintenta para siempre.
const respTelegram = post(update(900040, '1000 nafta'));
chequear('a Telegram no le devolvemos nada (evita el 302)',
  respTelegram === undefined, `devolvió ${typeof respTelegram}`);

const respApp = doPost({ postData: { contents: JSON.stringify({
  k: 'demo', op: 'importar', filas: [{ fecha: '2026-08-11', monto: 1234, detalle: 'PRUEBA CSV' }] }) } });
chequear('a la app sí le devolvemos JSON', respApp !== undefined && !!respApp._t,
  respApp && respApp._t ? String(respApp._t).slice(0, 40) : 'nada');

const respNoAuth = doPost({ postData: { contents: JSON.stringify({ op: 'importar', filas: [] }) } });
chequear('sin clave, la app recibe un rechazo explícito',
  /no autorizado/.test(String(respNoAuth && respNoAuth._t)));

console.log('\n=== NUNCA SE QUEDA MUDO ===');
// si el manejador explota, el bot igual tiene que decir algo
const original = manejarUpdate_;
manejarUpdate_ = function () { throw new Error('boom de prueba'); };
resetStats();
post(update(900030, '1000 nafta'));
const aviso = stats.fetch.length ? JSON.parse(stats.fetch[0].payload).text : '';
chequear('avisa por Telegram cuando algo falla', /boom de prueba/.test(aviso),
  aviso.slice(0, 60));
manejarUpdate_ = original;

// si CacheService se cae, tiene que procesar igual, no callarse
const cacheReal = CacheService.getScriptCache;
CacheService.getScriptCache = () => { throw new Error('cache caído'); };
resetStats();
const filasPre = filas();
post(update(900031, '1500 nafta'));
chequear('si el antiduplicados falla, igual carga el gasto', filas() === filasPre + 1);
CacheService.getScriptCache = cacheReal;

console.log('\n=== DIAGNÓSTICO ===');
const diag = textoDiagnostico_();
chequear('/diag informa token, chats y webhook',
  /Token/.test(diag) && /Chats autorizados/.test(diag) && /Webhook/.test(diag));
chequear('/diag cuenta los movimientos', /Movimientos: \d+/.test(diag));

/* ---------------------------------------------------------------------------
 * Idempotencia: el mismo id no entra dos veces.
 * Es lo que arregla el gasto que se guardó triplicado. La app manda por JSONP,
 * y ahí un timeout NO significa que no se haya guardado: Apps Script pudo
 * escribir la fila y contestar tarde. La app lo daba por fallido y lo
 * reintentaba. Como el teléfono nunca puede saber cómo terminó, la única salida
 * es que el reintento sea inofensivo.
 * ------------------------------------------------------------------------ */
console.log('\n=== EL MISMO MOVIMIENTO NO ENTRA DOS VECES ===');
{
  const idFijo = 'appfa0000001';
  const base = filas();
  const uno = opAgregar_({ id: idFijo, monto: 12345, categoria: 'Nafta', detalle: 'nafta' });
  chequear('el primer intento guarda', uno.ok && uno.id === idFijo && !uno.repetido);
  chequear('y escribió una fila', filas() === base + 1, `${filas() - base}`);

  const dos = opAgregar_({ id: idFijo, monto: 12345, categoria: 'Nafta', detalle: 'nafta' });
  chequear('el reintento contesta ok (la app no tiene por qué asustarse)', dos.ok === true);
  chequear('pero avisa que era repetido', dos.repetido === true);
  chequear('y NO escribió una segunda fila', filas() === base + 1, `${filas() - base}`);

  opAgregar_({ id: idFijo, monto: 12345, categoria: 'Nafta', detalle: 'nafta' });
  chequear('ni una tercera, como pasó con el gimnasio', filas() === base + 1, `${filas() - base}`);

  const suelto = opAgregar_({ monto: 999, categoria: 'Nafta', detalle: 'otra nafta' });
  chequear('sin id, cada llamada sigue siendo un movimiento nuevo', filas() === base + 2);

  borrarMovimiento_(idFijo);
  borrarMovimiento_(suelto.id);
}

console.log('\n=== BOTÓN DE PERSONA EN EL BOT ===');
{
  olvidarCache_();
  resetStats();
  post(update(900050, '5000 nafta'));
  const confirm = JSON.parse(stats.fetch[0].payload);
  const botonPersona = confirm.reply_markup.inline_keyboard[0]
    .filter(b => /Persona/.test(b.text))[0];
  chequear('la confirmación ofrece elegir persona', !!botonPersona);
  const idMov = botonPersona.callback_data.split(':')[1];

  // Cada clic es un update distinto: si repito el update_id, el antiduplicados
  // del webhook descarta los siguientes y el test miente (ya me pasó acá).
  let nroClic = 900051;
  const cbq = (data) => ({ update_id: nroClic++, callback_query: { id: 'cb' + nroClic, data: data,
    message: { message_id: 7, chat: { id: 12345 }, text: 'confirmación' } } });

  resetStats();
  post(cbq('per:' + idMov));
  const menu = stats.fetch.map(f => JSON.parse(f.payload)).filter(p => p.reply_markup)[0];
  const botones = JSON.stringify(menu.reply_markup);
  chequear('lista las personas cargadas', /Noe/.test(botones) && /Nikin/.test(botones));
  chequear('y deja sacarla', /ninguna/.test(botones));

  const iNikin = leerPersonas_().map(p => p.nombre).indexOf('Nikin');
  post(cbq('setp:' + idMov + ':' + iNikin));
  chequear('elegir una la guarda en el movimiento', movPorId_(idMov).persona === 'Nikin',
    movPorId_(idMov).persona);

  post(cbq('setp:' + idMov + ':-1'));
  chequear('"— ninguna" la borra', movPorId_(idMov).persona === '',
    JSON.stringify(movPorId_(idMov).persona));

  borrarMovimiento_(idMov);
}

console.log('\n=== CHAT NO AUTORIZADO ===');
const filasAntes = filas();
post({ update_id: 900020, message: { message_id: 5, chat: { id: 999 }, text: '9999 nafta' } });
chequear('un chat ajeno no puede cargar nada', filas() === filasAntes);

console.log(fallas ? `\n❌ ${fallas} fallas` : '\n✅ todo en verde');
process.exit(fallas ? 1 : 0);
