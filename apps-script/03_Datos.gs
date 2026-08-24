/**
 * 03_Datos.gs — Lectura y escritura sobre la planilla.
 *
 * Regla de oro: el importe se guarda CON SIGNO.
 *   Ingreso    -> positivo
 *   Gasto      -> negativo
 *   Movimiento -> el signo que corresponda (prestás = negativo, te devuelven = positivo)
 */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }

/**
 * Cada lectura de la planilla cuesta tiempo, y si tardamos en contestarle a
 * Telegram, Telegram reintenta. Tipos y Personas no cambian durante una
 * ejecución, así que las leemos una sola vez.
 */
var _cacheHoja = {};
function unaVez_(clave, fn) {
  if (!(clave in _cacheHoja)) _cacheHoja[clave] = fn();
  return _cacheHoja[clave];
}
function olvidarCache_() { _cacheHoja = {}; }

function hojaMov_() {
  var h = ss_().getSheetByName(HOJA_MOVIMIENTOS);
  if (!h) h = formatearHojaMovimientos_(ss_());
  return h;
}

// ------------------------------------------------------------- catálogos

function leerTipos_() { return unaVez_('tipos', leerTiposDeHoja_); }

function leerTiposDeHoja_() {
  var h = ss_().getSheetByName(HOJA_TIPOS);
  if (!h || h.getLastRow() < 2) {
    return TIPOS_INICIALES.map(function (f) {
      return { nombre: f[0], orden: f[1], naturaleza: f[2], cuentaEnGasto: f[3] === 'SI', emoji: f[4] };
    });
  }
  return h.getRange(2, 1, h.getLastRow() - 1, 5).getValues()
    .filter(function (f) { return String(f[0]).trim(); })
    .map(function (f) {
      return {
        nombre: String(f[0]).trim(),
        orden: Number(f[1]) || 0,
        naturaleza: String(f[2] || 'Gasto').trim(),
        cuentaEnGasto: String(f[3]).trim().toUpperCase() === 'SI',
        emoji: String(f[4] || '').trim()
      };
    })
    .sort(function (a, b) { return a.orden - b.orden; });
}

function tipoPorNombre_(nombre, tipos) {
  for (var i = 0; i < tipos.length; i++) if (tipos[i].nombre === nombre) return tipos[i];
  return null;
}

function leerCategorias_() {
  var h = ss_().getSheetByName(HOJA_CATEGORIAS);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 4).getValues()
    .filter(function (f) { return String(f[0]).trim(); })
    .map(function (f) {
      return {
        nombre: String(f[0]).trim(),
        tipo: String(f[1] || '').trim(),
        emoji: String(f[2] || '').trim(),
        palabras: String(f[3] || '').split(',').map(function (s) { return s.trim(); })
          .filter(function (s) { return s; })
      };
    });
}

function leerPersonas_() { return unaVez_('personas', leerPersonasDeHoja_); }

function leerPersonasDeHoja_() {
  var h = ss_().getSheetByName(HOJA_PERSONAS);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 4).getValues()
    .filter(function (f) { return String(f[0]).trim(); })
    .map(function (f) {
      return {
        nombre: String(f[0]).trim(),
        vinculo: String(f[1] || '').trim(),
        concepto: String(f[2] || '').trim(),
        tipo: String(f[3] || '').trim()
      };
    });
}

function catPorNombre_(nombre, categorias) {
  for (var i = 0; i < categorias.length; i++) if (categorias[i].nombre === nombre) return categorias[i];
  return null;
}

function emojiDe_(categoria, categorias) {
  var c = catPorNombre_(categoria, categorias);
  return (c && c.emoji) ? c.emoji : '•';
}

/** El tipo que le corresponde a una categoría, si no vino explícito. */
function tipoDeCategoria_(categoria, categorias) {
  var c = catPorNombre_(categoria, categorias);
  return (c && c.tipo) ? c.tipo : TIPO_OTROS;
}

// ------------------------------------------------------------- escritura

function nuevoId_() { return Utilities.getUuid().replace(/-/g, '').substring(0, 12); }

function hashMov_(fecha, importe, detalle) {
  var base = Utilities.formatDate(fecha, ZONA, 'yyyy-MM-dd') + '|' +
    Number(importe).toFixed(2) + '|' + normalizar_(detalle).substring(0, 40);
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, base).map(function (b) {
    return ((b < 0 ? b + 256 : b) + 0x100).toString(16).substring(1);
  }).join('').substring(0, 16);
}

/**
 * Aplica el signo que corresponde según la naturaleza del tipo.
 * Si el usuario ya mandó un signo explícito en un tipo 'Movimiento', se respeta.
 */
function aplicarSigno_(importe, tipo, tipos, signoExplicito) {
  var t = tipoPorNombre_(tipo, tipos);
  var abs = Math.abs(Number(importe));
  if (!t) return -abs;
  if (t.naturaleza === 'Ingreso') return abs;
  if (t.naturaleza === 'Gasto') return -abs;
  return signoExplicito < 0 ? -abs : (signoExplicito > 0 ? abs : -abs);
}

/** m: { fecha, importe, moneda, tipo, categoria, persona, detalle, medio, origen, notas } */
/**
 * Escribe un movimiento. Si viene con un id que YA existe, no escribe nada y
 * avisa que era repetido.
 *
 * Esto es lo que arregla el gasto que se cargaba dos o tres veces. La app manda
 * por JSONP, y ahí un timeout NO quiere decir que no se haya guardado: Apps
 * Script puede haber escrito la fila y haber contestado tarde. La app daba eso
 * por fallido, lo encolaba y lo reintentaba. Ninguna traba del lado del teléfono
 * puede resolver eso, porque el teléfono nunca se entera de cómo terminó.
 * La única salida es que el reintento sea inofensivo: la app inventa el id antes
 * de mandar y lo repite en cada intento, así el segundo rebota acá.
 */
function agregarMovimiento_(m) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (m.id && buscarFila_(m.id) > 0) return { id: m.id, fila: 0, repetido: true };
    var h = hojaMov_();
    var fecha = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
    var id = m.id || nuevoId_();
    var importe = Number(m.importe);
    h.appendRow([
      id, fecha, m.tipo || TIPO_OTROS, m.categoria || CATEGORIA_OTROS, importe,
      m.moneda || MONEDA_DEFAULT, m.persona || '', m.detalle || '', m.medio || '',
      m.origen || 'web', m.notas || '', new Date(), hashMov_(fecha, importe, m.detalle || '')
    ]);
    return { id: id, fila: h.getLastRow() };
  } finally {
    lock.releaseLock();
  }
}

// ------------------------------------------------------------- lectura

// ------------------------------------------------------- planes en cuotas

/** Suma meses cuidando los fines de mes: 31/01 + 1 mes = 28/02, no 03/03. */
function sumarMeses_(fecha, n) {
  var dia = fecha.getDate();
  var x = new Date(fecha.getFullYear(), fecha.getMonth() + n, 1, 12, 0, 0, 0);
  var ultimoDia = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
  x.setDate(Math.min(dia, ultimoDia));
  return x;
}

/**
 * Parte un total en n cuotas de manera que la suma dé EXACTO.
 * $100.000 en 3 no son tres de 33.333,33 (eso da 99.999,99):
 * el centavo que sobra va en la última.
 */
function repartirCuotas_(total, n) {
  var centavos = Math.round(Number(total) * 100);
  var base = Math.floor(centavos / n);
  var cuotas = [];
  for (var i = 0; i < n - 1; i++) cuotas.push(base / 100);
  cuotas.push((centavos - base * (n - 1)) / 100);
  return cuotas;
}

function nuevoPlan_() {
  return 'plan:' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
}

function planDeNotas_(notas) {
  var m = String(notas || '').match(/plan:([a-f0-9]{8})/i);
  return m ? m[0] : '';
}

/**
 * Crea las n filas de un plan en cuotas: una por mes, todas con el mismo
 * plan en Notas para poder borrarlas o recategorizarlas juntas.
 *
 * Cada fila también lleva una marca `cuota:<detalle original>|N/total` en
 * Notas, calculada UNA sola vez acá con el detalle tal cual lo escribiste.
 * Sirve para reconocer la cuota cuando llega el resumen real aunque después
 * le cambies el Detalle a mano: si dependiéramos del Detalle actual, editarlo
 * hacía que el resumen del mes siguiente no la reconociera y la duplicara.
 *
 * m: { fecha, tipo, categoria, montoTotal, n, moneda, persona, detalle,
 *      medio, origen, esIngreso, notas }
 */
function crearPlanEnCuotas_(m) {
  var n = Math.max(2, Math.min(60, parseInt(m.n, 10)));
  var montos = repartirCuotas_(m.montoTotal, n);
  var tipos = leerTipos_();
  var plan = nuevoPlan_();
  var ahora = new Date();
  var base = m.fecha instanceof Date ? m.fecha : new Date(m.fecha);
  var detalleBase = String(m.detalle || m.categoria || '').trim();
  var marcaBase = normalizar_(detalleBase);

  var filas = [], ids = [];
  for (var i = 0; i < n; i++) {
    var f = sumarMeses_(base, i);
    var det = (detalleBase ? detalleBase + ' ' : '') + (i + 1) + '/' + n;
    var imp = aplicarSigno_(montos[i], m.tipo, tipos, m.esIngreso ? 1 : -1);
    var id = nuevoId_();
    var marca = 'cuota:' + marcaBase + '|' + (i + 1) + '/' + n;
    ids.push(id);
    filas.push([id, f, m.tipo, m.categoria, imp, m.moneda || MONEDA_DEFAULT,
                m.persona || '', det, m.medio || '', m.origen || 'web',
                (plan + ' ' + marca + ' ' + (m.notas || '')).trim(), ahora, hashMov_(f, imp, det)]);
  }

  var h = hojaMov_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    h.getRange(h.getLastRow() + 1, 1, filas.length, TOTAL_COLS).setValues(filas);
  } finally {
    lock.releaseLock();
  }

  return {
    plan: plan, ids: ids, n: n, montos: montos,
    cuota: montos[0], total: Math.round(m.montoTotal * 100) / 100,
    primera: base, ultima: sumarMeses_(base, n - 1)
  };
}

/** Todas las filas de un plan, de la primera cuota a la última. */
function filasDePlan_(plan) {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1 || !plan) return [];
  var notas = h.getRange(2, COL.NOTAS, n, 1).getValues();
  var filas = [];
  for (var i = 0; i < notas.length; i++) {
    if (String(notas[i][0]).indexOf(plan) >= 0) filas.push(i + 2);
  }
  return filas;
}

function borrarPlan_(plan) {
  var filas = filasDePlan_(plan);
  if (!filas.length) return 0;
  var h = hojaMov_();
  for (var i = filas.length - 1; i >= 0; i--) h.deleteRow(filas[i]);   // de abajo hacia arriba
  return filas.length;
}

/** Recategoriza el plan entero: si una cuota estaba mal, lo estaban las n. */
function actualizarPlanCategoria_(plan, categoria) {
  var filas = filasDePlan_(plan);
  if (!filas.length) return 0;
  var h = hojaMov_();
  var cats = leerCategorias_(), tipos = leerTipos_();
  var tipo = tipoDeCategoria_(categoria, cats);
  filas.forEach(function (f) {
    h.getRange(f, COL.CATEGORIA).setValue(categoria);
    h.getRange(f, COL.TIPO).setValue(tipo);
    var actual = Number(h.getRange(f, COL.IMPORTE).getValue()) || 0;
    h.getRange(f, COL.IMPORTE).setValue(aplicarSigno_(actual, tipo, tipos, actual));
  });
  return filas.length;
}

function filaAObjeto_(f) {
  return {
    id: f[COL.ID - 1],
    fecha: f[COL.FECHA - 1] instanceof Date
      ? Utilities.formatDate(f[COL.FECHA - 1], ZONA, 'yyyy-MM-dd')
      : String(f[COL.FECHA - 1] || ''),
    tipo: f[COL.TIPO - 1] || '',
    categoria: f[COL.CATEGORIA - 1] || '',
    importe: Number(f[COL.IMPORTE - 1]) || 0,
    moneda: f[COL.MONEDA - 1] || MONEDA_DEFAULT,
    persona: f[COL.PERSONA - 1] || '',
    detalle: f[COL.DETALLE - 1] || '',
    medio: f[COL.MEDIO - 1] || '',
    origen: f[COL.ORIGEN - 1] || '',
    notas: f[COL.NOTAS - 1] || ''
  };
}

/**
 * Últimos N movimientos ordenados por FECHA, no por orden de carga.
 * (Cargás cuotas con fecha futura: si ordenara por carga, diciembre aparecería
 * arriba de hoy.)
 *
 * Lee la hoja ENTERA a propósito, aunque parezca de más. Antes leía solo las
 * últimas 240 filas, dando por sentado que lo recién cargado siempre cae al
 * fondo. Esa suposición se cae apenas ordenás o filtrás la planilla a mano,
 * que es algo que tenés todo el derecho a hacer: ordenaste por CreadoEn para
 * ver lo nuevo arriba, las filas nuevas quedaron en la posición 2 y salieron
 * de la ventana, así que desaparecieron de "Últimos" mientras el gasto del mes
 * las seguía contando (resumenMes_ siempre leyó todo). Ese era el síntoma raro.
 *
 * El costo es leer ~1000 filas en vez de 240. resumenMes_ ya recorre esa misma
 * cantidad en cada consulta sin problema, así que no cambia nada en la práctica.
 *
 * El desempate entre movimientos del MISMO día va por CreadoEn, que viaja
 * adentro de la fila, y no por su posición en la hoja, que se mueve de lugar.
 */
function listarMovimientos_(limite) {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  limite = Math.min(limite || 50, n);

  return h.getRange(2, 1, n, TOTAL_COLS).getValues()
    .map(function (f, i) {
      var o = filaAObjeto_(f);
      var c = f[COL.CREADO - 1];
      o._creado = (c instanceof Date) ? c.getTime() : 0;
      o._i = i;                       // último recurso: las filas migradas comparten CreadoEn
      return o;
    })
    .sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      if (a._creado !== b._creado) return b._creado - a._creado;
      return b._i - a._i;
    })
    .slice(0, limite)
    .map(function (o) { delete o._creado; delete o._i; return o; });
}

function buscarFila_(id) {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) return -1;
  var ids = h.getRange(2, COL.ID, n, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function actualizarMovimiento_(id, campos) {
  var fila = buscarFila_(id);
  if (fila < 0) return false;
  var h = hojaMov_();
  var mapa = {
    fecha: COL.FECHA, tipo: COL.TIPO, categoria: COL.CATEGORIA, importe: COL.IMPORTE,
    moneda: COL.MONEDA, persona: COL.PERSONA, detalle: COL.DETALLE, medio: COL.MEDIO,
    notas: COL.NOTAS
  };
  Object.keys(campos).forEach(function (k) {
    if (!mapa[k]) return;
    var v = campos[k];
    if (k === 'fecha' && !(v instanceof Date)) v = new Date(v + 'T12:00:00');
    if (k === 'importe') v = Number(v);
    h.getRange(fila, mapa[k]).setValue(v);
  });
  // si cambió la categoría, reacomodamos el tipo y el signo
  if (campos.categoria && !campos.tipo) {
    var cats = leerCategorias_(), tipos = leerTipos_();
    var nuevoTipo = tipoDeCategoria_(campos.categoria, cats);
    h.getRange(fila, COL.TIPO).setValue(nuevoTipo);
    var actual = Number(h.getRange(fila, COL.IMPORTE).getValue()) || 0;
    h.getRange(fila, COL.IMPORTE).setValue(aplicarSigno_(actual, nuevoTipo, tipos, actual));
  }
  return true;
}

function borrarMovimiento_(id) {
  var fila = buscarFila_(id);
  if (fila < 0) return false;
  hojaMov_().deleteRow(fila);
  return true;
}

/**
 * Limpia los duplicados que dejó el bot cuando Telegram reintentaba.
 * Solo toca movimientos cargados por Telegram, con el MISMO hash (misma fecha,
 * mismo importe, mismo detalle) y cargados con menos de 3 horas de diferencia.
 * De cada grupo deja el primero. Muestra qué va a borrar antes de hacerlo.
 */
function limpiarDuplicados() {
  var ui = SpreadsheetApp.getUi();
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) { ui.alert('No hay movimientos.'); return; }

  var vals = h.getRange(2, 1, n, TOTAL_COLS).getValues();
  var grupos = {}, aBorrar = [];

  vals.forEach(function (f, i) {
    var origen = String(f[COL.ORIGEN - 1] || '');
    if (origen.indexOf('telegram') !== 0) return;
    var hash = String(f[COL.HASH - 1] || '');
    if (!hash) return;
    var creado = f[COL.CREADO - 1];
    if (!(creado instanceof Date)) return;

    if (!grupos[hash]) { grupos[hash] = creado; return; }
    if (Math.abs(creado.getTime() - grupos[hash].getTime()) < 3 * 3600 * 1000) {
      aBorrar.push({
        fila: i + 2,
        texto: formatearMoneda_(f[COL.IMPORTE - 1], f[COL.MONEDA - 1]) + ' · ' +
               (f[COL.DETALLE - 1] || f[COL.CATEGORIA - 1]) + ' · ' +
               Utilities.formatDate(creado, ZONA, 'dd/MM HH:mm')
      });
    }
  });

  if (!aBorrar.length) { ui.alert('No encontré duplicados. Todo limpio ✅'); return; }

  var muestra = aBorrar.slice(0, 12).map(function (x) { return '· ' + x.texto; }).join('\n');
  var r = ui.alert('Encontré ' + aBorrar.length + ' duplicados',
    muestra + (aBorrar.length > 12 ? '\n… y ' + (aBorrar.length - 12) + ' más' : '') +
    '\n\nDe cada repetido dejo el primero y borro el resto. ¿Los borro?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  // de abajo hacia arriba, si no se corren las filas
  aBorrar.sort(function (a, b) { return b.fila - a.fila; })
         .forEach(function (x) { h.deleteRow(x.fila); });

  ui.alert('Listo. Borré ' + aBorrar.length + ' movimientos repetidos.');
}

/**
 * Migración histórica única (pendiente #4): las 20 filas de 2025 que tienen
 * Categoria = "Bastian" son en realidad cinco compras en cuotas mal etiquetadas
 * como categoría en vez de persona. Les pone la categoría real según el
 * Detalle y Persona = Bastian; después saca "Bastian" de la hoja Categorias
 * (ya sin uso) y lo agrega a Personas para que se vea con vínculo "Hijo".
 *
 * No toca doPost/doGet: se corre una sola vez a mano desde el desplegable de
 * funciones del editor, no hace falta una implementación nueva.
 */
function migrarBastianAPersona() {
  var ui = SpreadsheetApp.getUi();
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) { ui.alert('No hay movimientos.'); return; }

  var vals = h.getRange(2, 1, n, TOTAL_COLS).getValues();
  var REGLAS = [
    { patron: /bici|temu/, categoria: 'Regalos' },
    { patron: /nintendo|switch/, categoria: 'Electronica' },
    { patron: /mimo|zapas/, categoria: 'Ropa y calzado' }
  ];

  var cambios = [], sinRegla = [];
  vals.forEach(function (f, i) {
    if (String(f[COL.CATEGORIA - 1]).trim() !== 'Bastian') return;
    var detalle = normalizar_(f[COL.DETALLE - 1]);
    var regla = null;
    for (var r = 0; r < REGLAS.length; r++) {
      if (REGLAS[r].patron.test(detalle)) { regla = REGLAS[r]; break; }
    }
    if (!regla) { sinRegla.push({ fila: i + 2, detalle: f[COL.DETALLE - 1] }); return; }
    cambios.push({ fila: i + 2, categoria: regla.categoria, detalle: f[COL.DETALLE - 1] });
  });

  if (sinRegla.length) {
    ui.alert('No toqué nada: hay ' + sinRegla.length + ' fila(s) en "Bastian" que no reconozco (' +
      sinRegla.map(function (x) { return x.detalle || '(sin detalle) fila ' + x.fila; }).join(', ') +
      '). Resolvelas a mano y volvé a correr esto.');
    return;
  }
  if (!cambios.length) { ui.alert('No hay movimientos en la categoría Bastian. No hay nada para migrar.'); return; }

  var resumen = cambios.map(function (x) { return '· fila ' + x.fila + ': ' + x.detalle + ' → ' + x.categoria; }).join('\n');
  var r = ui.alert('Migrar Bastian a persona',
    'Voy a cambiar estos ' + cambios.length + ' movimientos:\n\n' + resumen +
    '\n\nA los ' + cambios.length + ' les pongo Persona = Bastian. Después saco "Bastian" de la ' +
    'hoja Categorias y lo agrego a Personas con vínculo "Hijo". ¿Sigo?',
    ui.ButtonSet.YES_NO);
  if (r !== ui.Button.YES) return;

  cambios.forEach(function (x) {
    h.getRange(x.fila, COL.CATEGORIA).setValue(x.categoria);
    h.getRange(x.fila, COL.PERSONA).setValue('Bastian');
  });

  // Saca "Bastian" de la hoja Categorias: después de este cambio queda sin uso.
  var hc = ss_().getSheetByName(HOJA_CATEGORIAS);
  var catVals = hc.getRange(2, 1, hc.getLastRow() - 1, 1).getValues();
  for (var c = 0; c < catVals.length; c++) {
    if (String(catVals[c][0]).trim() === 'Bastian') { hc.deleteRow(c + 2); break; }
  }

  // Agrega a Bastian en Personas, si todavía no está.
  var hp = ss_().getSheetByName(HOJA_PERSONAS);
  var perVals = hp.getLastRow() > 1 ? hp.getRange(2, 1, hp.getLastRow() - 1, 1).getValues() : [];
  var yaExiste = perVals.some(function (f) { return String(f[0]).trim() === 'Bastian'; });
  if (!yaExiste) hp.appendRow(['Bastian', 'Hijo', 'Gastos de Bastian', '']);

  ui.alert('Listo. Migré ' + cambios.length + ' movimientos, saqué "Bastian" de Categorias y lo agregué a Personas.');
}

// -------------------------------------------------- depurar categorías

/**
 * Uso real de cada categoría: cuántos movimientos, cuánta plata, cuándo fue
 * la última vez. Incluye categorías que ya no están en el catálogo pero
 * siguen escritas en movimientos viejos (esas son las que hay que unificar).
 */
function usoDeCategorias_() {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var uso = {};
  if (n < 1) return [];

  var DESDE = COL.FECHA, ANCHO = COL.IMPORTE - COL.FECHA + 1, o = DESDE - 1;
  h.getRange(2, DESDE, n, ANCHO).getValues().forEach(function (f) {
    var cat = f[COL.CATEGORIA - 1 - o];
    if (!cat) return;
    if (!uso[cat]) uso[cat] = { categoria: cat, veces: 0, total: 0, ultima: null };
    uso[cat].veces++;
    uso[cat].total += Math.abs(Number(f[COL.IMPORTE - 1 - o]) || 0);
    var fe = f[COL.FECHA - 1 - o];
    if (fe instanceof Date && (!uso[cat].ultima || fe > uso[cat].ultima)) uso[cat].ultima = fe;
  });

  var enCatalogo = {};
  leerCategorias_().forEach(function (c) {
    enCatalogo[c.nombre] = true;
    if (!uso[c.nombre]) uso[c.nombre] = { categoria: c.nombre, veces: 0, total: 0, ultima: null };
  });

  return Object.keys(uso).map(function (k) {
    uso[k].huerfana = !enCatalogo[k];       // se usa pero ya no está en el catálogo
    return uso[k];
  }).sort(function (a, b) { return a.veces - b.veces; });
}

/**
 * Todos los movimientos de una categoría, sin el límite de 60/80 que tiene
 * "Últimos". Hace falta para poder repartirla: si solo trajera los recientes,
 * los gastos viejos de una categoría con años de historia (como Depto) ni
 * aparecerían para elegir.
 */
function movimientosDeCategoria_(nombre) {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  return h.getRange(2, 1, n, TOTAL_COLS).getValues()
    .map(function (f, i) {
      var o = filaAObjeto_(f);
      var c = f[COL.CREADO - 1];
      o._creado = (c instanceof Date) ? c.getTime() : 0;
      o._i = i;
      return o;
    })
    .filter(function (o) { return paraBuscar_(o.categoria) === paraBuscar_(nombre); })
    .sort(function (a, b) {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? 1 : -1;
      if (a._creado !== b._creado) return b._creado - a._creado;
      return b._i - a._i;
    })
    .map(function (o) { delete o._creado; delete o._i; return o; });
}

/**
 * Mueve una lista puntual de movimientos (por ID) a otra categoría. Es la
 * contraparte de unificarCategorias_: esa mueve TODOS los de una categoría de
 * una, esta mueve solo los que elegiste — sirve para partir una categoría
 * en varias (ej. "Depto" son en realidad alquiler + luz + gas + alarma).
 *
 * A propósito no toca las palabras clave del catálogo: acá vos elegiste
 * movimiento por movimiento, no hay un criterio único que aprender.
 */
function reasignarMovimientos_(ids, destino) {
  ids = (ids || []).map(String).filter(function (x) { return x; });
  if (!ids.length) return { ok: false, error: 'no elegiste ningún movimiento' };

  var cats = leerCategorias_();
  var catDestino = null;
  cats.forEach(function (c) { if (paraBuscar_(c.nombre) === paraBuscar_(destino)) catDestino = c; });
  if (!catDestino) return { ok: false, error: 'no encuentro la categoría destino' };

  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) return { ok: true, movimientos: 0, destino: catDestino.nombre };

  var buscados = {};
  ids.forEach(function (id) { buscados[id] = true; });

  var idCol = h.getRange(2, COL.ID, n, 1).getValues();
  var catCol = h.getRange(2, COL.CATEGORIA, n, 1).getValues();
  var tipoCol = h.getRange(2, COL.TIPO, n, 1).getValues();
  var impCol = h.getRange(2, COL.IMPORTE, n, 1).getValues();
  var tipos = leerTipos_();
  var tocados = 0;

  for (var i = 0; i < idCol.length; i++) {
    if (!buscados[String(idCol[i][0])]) continue;
    catCol[i][0] = catDestino.nombre;
    tipoCol[i][0] = catDestino.tipo || TIPO_OTROS;
    impCol[i][0] = aplicarSigno_(impCol[i][0], tipoCol[i][0], tipos, impCol[i][0]);
    tocados++;
  }
  if (tocados) {
    h.getRange(2, COL.CATEGORIA, n, 1).setValues(catCol);
    h.getRange(2, COL.TIPO, n, 1).setValues(tipoCol);
    h.getRange(2, COL.IMPORTE, n, 1).setValues(impCol);
  }
  olvidarCache_();
  return { ok: true, movimientos: tocados, destino: catDestino.nombre };
}

/**
 * Pasa todos los movimientos de una categoría a otra, se lleva sus palabras
 * clave y borra la primera del catálogo.
 *
 * Es lo que hay que usar para depurar. Borrar la fila de Categorias a mano NO
 * rompe nada —la categoría es texto en cada movimiento— pero te deja los
 * gastos viejos apuntando a un nombre que ya no existe: siguen sumando en los
 * informes, sueltos, y no los podés reasignar.
 */
function unificarCategorias_(origen, destino) {
  var cats = leerCategorias_();
  var catDestino = null;
  cats.forEach(function (c) { if (paraBuscar_(c.nombre) === paraBuscar_(destino)) catDestino = c; });
  if (!catDestino) return { ok: false, error: 'no encuentro la categoría destino' };
  if (paraBuscar_(origen) === paraBuscar_(destino)) return { ok: false, error: 'son la misma' };

  // 1) reescribir los movimientos
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var tipos = leerTipos_();
  var tocados = 0;
  if (n > 0) {
    var rango = h.getRange(2, COL.CATEGORIA, n, 1);
    var vals = rango.getValues();
    var tipoCol = h.getRange(2, COL.TIPO, n, 1).getValues();
    var impCol = h.getRange(2, COL.IMPORTE, n, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      if (paraBuscar_(vals[i][0]) !== paraBuscar_(origen)) continue;
      vals[i][0] = catDestino.nombre;
      tipoCol[i][0] = catDestino.tipo || TIPO_OTROS;
      impCol[i][0] = aplicarSigno_(impCol[i][0], tipoCol[i][0], tipos, impCol[i][0]);
      tocados++;
    }
    if (tocados) {
      rango.setValues(vals);
      h.getRange(2, COL.TIPO, n, 1).setValues(tipoCol);
      h.getRange(2, COL.IMPORTE, n, 1).setValues(impCol);
    }
  }

  // 2) mover las palabras clave y borrar la fila del catálogo
  var hc = ss_().getSheetByName(HOJA_CATEGORIAS);
  var filaOrigen = -1, filaDestino = -1, palabrasOrigen = '';
  var cv = hc.getRange(2, 1, hc.getLastRow() - 1, 4).getValues();
  for (var j = 0; j < cv.length; j++) {
    if (paraBuscar_(cv[j][0]) === paraBuscar_(origen)) { filaOrigen = j + 2; palabrasOrigen = String(cv[j][3] || ''); }
    if (paraBuscar_(cv[j][0]) === paraBuscar_(destino)) filaDestino = j + 2;
  }
  if (filaDestino > 0 && palabrasOrigen.trim()) {
    var actuales = String(hc.getRange(filaDestino, 4).getValue() || '').trim();
    var vistas = {}, limpias = [];
    ((actuales ? actuales + ', ' : '') + palabrasOrigen.trim()).split(',').forEach(function (x) {
      var k = paraBuscar_(x);
      if (!k || vistas[k]) return;
      vistas[k] = true;
      limpias.push(x.trim());
    });
    hc.getRange(filaDestino, 4).setValue(limpias.join(', '));
  }
  if (filaOrigen > 0) hc.deleteRow(filaOrigen);

  olvidarCache_();
  return { ok: true, movimientos: tocados, destino: catDestino.nombre };
}

/** Borra una categoría del catálogo. Solo si no tiene movimientos. */
function borrarCategoria_(nombre) {
  var uso = usoDeCategorias_();
  for (var i = 0; i < uso.length; i++) {
    if (paraBuscar_(uso[i].categoria) === paraBuscar_(nombre) && uso[i].veces > 0) {
      return { ok: false, error: 'tiene ' + uso[i].veces + ' movimientos: hay que unificarla' };
    }
  }
  var hc = ss_().getSheetByName(HOJA_CATEGORIAS);
  var cv = hc.getRange(2, 1, hc.getLastRow() - 1, 1).getValues();
  for (var j = 0; j < cv.length; j++) {
    if (paraBuscar_(cv[j][0]) === paraBuscar_(nombre)) {
      hc.deleteRow(j + 2);
      olvidarCache_();
      return { ok: true };
    }
  }
  return { ok: false, error: 'no la encuentro' };
}

// ------------------------------------------------------- recordatorios

function leerRecordatorios_() {
  var h = ss_().getSheetByName(HOJA_RECORDATORIOS);
  if (!h || h.getLastRow() < 2) return [];
  return h.getRange(2, 1, h.getLastRow() - 1, 3).getValues()
    .filter(function (f) { return String(f[0]).trim() && Number(f[1]); })
    .map(function (f) {
      return {
        categoria: String(f[0]).trim(),
        vence: Math.max(1, Math.min(31, Number(f[1]))),
        activo: String(f[2]).trim().toUpperCase() !== 'NO'
      };
    });
}

/**
 * El día hábil anterior a una fecha: salta sábados y domingos.
 * Los feriados NO los ve — habría que leer un calendario aparte. Si cae uno
 * justo ahí, el aviso llega igual, solo que no en el último día hábil real.
 */
function diaHabilAnterior_(fecha) {
  var d = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 1, 12, 0, 0, 0);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1);
  return d;
}

/** El día del mes en que vence, acotado a los días que ese mes tiene. */
function fechaDeVencimiento_(dia, hoy) {
  var ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();
  return new Date(hoy.getFullYear(), hoy.getMonth(), Math.min(dia, ultimo), 12, 0, 0, 0);
}

function mismoDia_(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/**
 * Una sola pasada por la hoja que contesta las dos preguntas que se hacen los
 * recordatorios: ¿cargué esta categoría este mes? y ¿cuánto pagué la última vez?
 *
 * Antes cada recordatorio preguntaba por su cuenta y cada pregunta leía la hoja
 * entera: con diez recordatorios eran veinte lecturas completas. Eso tarda, y
 * cuando el bot tarda Telegram reintenta — que es de donde salieron los gastos
 * duplicados de la primera semana. Una pasada y listo.
 */
function mapasDeCategorias_(hoy) {
  hoy = hoy || new Date();
  var ini = inicioDeMes_(hoy), fin = finDeMes_(hoy);
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var m = { cargadas: {}, ultimos: {} };
  if (n < 1) return m;

  var DESDE = COL.FECHA, ANCHO = COL.IMPORTE - COL.FECHA + 1, o = DESDE - 1;
  h.getRange(2, DESDE, n, ANCHO).getValues().forEach(function (f) {
    var fe = f[COL.FECHA - 1 - o];
    if (!(fe instanceof Date)) return;
    var k = paraBuscar_(f[COL.CATEGORIA - 1 - o]);
    if (!k) return;
    if (fe >= ini && fe <= fin) m.cargadas[k] = true;
    var ant = m.ultimos[k];
    if (!ant || fe > ant.fecha) {
      m.ultimos[k] = { fecha: fe, importe: Number(f[COL.IMPORTE - 1 - o]) || 0 };
    }
  });
  return m;
}

/** ¿Ya cargaste esa categoría este mes? Si sí, no hay nada que recordar. */
function cargadoEsteMes_(categoria, hoy) {
  return !!mapasDeCategorias_(hoy).cargadas[paraBuscar_(categoria)];
}

/** Lo último que pagaste de esa categoría, para sugerir el monto. */
function ultimoMovimientoDe_(categoria) {
  return mapasDeCategorias_().ultimos[paraBuscar_(categoria)] || null;
}

/**
 * Estado de los recordatorios de este mes.
 * etapa: 'aviso' el día hábil anterior · 'vence' el mismo día del vencimiento.
 */
function recordatoriosDeHoy_(hoy) {
  hoy = hoy || new Date();
  var m = mapasDeCategorias_(hoy);
  var salida = [];
  leerRecordatorios_().forEach(function (r) {
    if (!r.activo) return;
    var vence = fechaDeVencimiento_(r.vence, hoy);
    var aviso = diaHabilAnterior_(vence);
    var etapa = mismoDia_(hoy, aviso) ? 'aviso' : (mismoDia_(hoy, vence) ? 'vence' : '');
    if (!etapa) return;
    var k = paraBuscar_(r.categoria);
    if (m.cargadas[k]) return;
    salida.push({ categoria: r.categoria, vence: vence, etapa: etapa,
                  ultimo: m.ultimos[k] || null });
  });
  return salida;
}

/**
 * Todo lo que vence este mes y todavía no cargaste. Para /recordatorios y para
 * el "falta cargar" de la pantalla Mes.
 * Recibe los mapas ya armados si quien llama los tiene, para no releer la hoja.
 */
function pendientesDelMes_(hoy, mapas) {
  hoy = hoy || new Date();
  var m = mapas || mapasDeCategorias_(hoy);
  return leerRecordatorios_().filter(function (r) { return r.activo; })
    .map(function (r) {
      var k = paraBuscar_(r.categoria);
      return { categoria: r.categoria, vence: fechaDeVencimiento_(r.vence, hoy),
               cargado: !!m.cargadas[k], ultimo: m.ultimos[k] || null };
    })
    .filter(function (r) { return !r.cargado; })
    .sort(function (a, b) { return a.vence - b.vence; });
}

function hashesExistentes_() {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var set = {};
  if (n < 1) return set;
  h.getRange(2, COL.HASH, n, 1).getValues().forEach(function (f) {
    if (f[0]) set[String(f[0])] = true;
  });
  return set;
}

// ------------------------------------------------------------- resúmenes

/* El 'MMMM' de Utilities.formatDate sale en el idioma de la cuenta de Google,
   que no siempre es castellano. Los ponemos nosotros. */
var MESES_ES_ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function nombreMes_(d) { return MESES_ES_[d.getMonth()] + ' ' + d.getFullYear(); }

function inicioDeMes_(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function finDeMes_(d) { return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59); }
/** Fin del día: comparamos por fecha, no por hora. Si no, un movimiento
 *  cargado hoy a las 12:00 parece "futuro" cuando son las 9 de la mañana. */
function finDeHoy_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59); }

/**
 * Todo lo del mes en curso.
 * Separa lo que YA pasó de lo que está comprometido a futuro dentro del mismo mes,
 * porque cargás cuotas con fecha adelantada.
 */
function resumenMes_() {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var hoy = new Date();
  var ini = inicioDeMes_(hoy), fin = finDeMes_(hoy), hastaHoy = finDeHoy_(hoy);
  var diasMes = fin.getDate();

  var r = {
    mes: nombreMes_(hoy),
    dia: hoy.getDate(), diasMes: diasMes,
    ingresos: 0, gastos: 0, ahorro: 0, disponible: 0,
    proyectado: 0, cantidad: 0,
    porCategoria: [], porTipo: [], personas: [],
    faltaCargar: { total: 0, items: [] },
    promedioDiario: 0, proyeccion: 0
  };
  if (n < 1) return r;

  var tipos = leerTipos_();
  // Leemos solo de Fecha a Persona (6 columnas de 13): la mitad de datos,
  // la mitad de tiempo. El índice va corrido por eso.
  var DESDE = COL.FECHA, ANCHO = COL.PERSONA - COL.FECHA + 1, o = DESDE - 1;
  var vals = h.getRange(2, DESDE, n, ANCHO).getValues();
  var acumCat = {}, acumTipo = {}, acumPer = {};

  vals.forEach(function (f) {
    var fe = f[COL.FECHA - 1 - o];
    if (!(fe instanceof Date)) return;
    var imp = Number(f[COL.IMPORTE - 1 - o]) || 0;
    var moneda = String(f[COL.MONEDA - 1 - o] || MONEDA_DEFAULT);
    var persona = String(f[COL.PERSONA - 1 - o] || '');
    var t = tipoPorNombre_(String(f[COL.TIPO - 1 - o] || ''), tipos);
    var nat = t ? t.naturaleza : 'Gasto';

    /* Cuentas con personas: histórico completo, no solo el mes. Y son DOS
       lecturas distintas que no se pueden sumar:
         · saldo   -> lo que va y vuelve (naturaleza Movimiento: los préstamos).
         · gastado -> plata que se fue y no vuelve (cuota alimentaria, los
                      gastos de un hijo).
       Mezclarlas era lo que mostraba "Noe: -$21.030.900" como si fuera una
       deuda, cuando en realidad es la cuota alimentaria de cuatro años. A tu
       hijo no le debés plata: gastás en él. */
    if (persona && moneda === MONEDA_DEFAULT) {
      if (!acumPer[persona]) acumPer[persona] = { saldo: 0, gastado: 0 };
      if (nat === 'Movimiento') acumPer[persona].saldo += imp;
      else if (nat === 'Gasto') acumPer[persona].gastado += -imp;
    }

    if (fe < ini || fe > fin || moneda !== MONEDA_DEFAULT) return;

    var cuenta = t ? t.cuentaEnGasto : true;
    var cat = f[COL.CATEGORIA - 1 - o] || CATEGORIA_OTROS;

    if (nat === 'Ingreso') { r.ingresos += imp; r.cantidad++; return; }
    if (!cuenta) return;                       // préstamos y saldos iniciales no son gasto

    r.cantidad++;
    if (fe > hastaHoy) { r.proyectado += -imp; return; }   // vence más adelante en el mes
    r.gastos += imp;                                    // imp es negativo
    acumCat[cat] = (acumCat[cat] || 0) + -imp;
    var tn = t ? t.nombre : TIPO_OTROS;
    acumTipo[tn] = (acumTipo[tn] || 0) + -imp;
  });

  var red = function (x) { return Math.round(x * 100) / 100; };
  r.ingresos = red(r.ingresos);
  r.gastos = red(-r.gastos);            // lo devolvemos en positivo, es más fácil de leer
  r.proyectado = red(r.proyectado);
  r.comprometido = r.proyectado;   // alias del nombre viejo, por si la app va una versión atrás
  r.ahorro = red(r.ingresos - r.gastos);

  /* DISPONIBLE: lo que te queda de acá a fin de mes, no lo que te sobró.
     El ahorro mira para atrás (cobré menos gasté) e ignora que ya tenés cuotas
     con fecha puesta más adelante en el mes. Por eso el ahorro siempre da de
     más y no sirve para decidir si podés gastar hoy. */
  r.disponible = red(r.ingresos - r.gastos - r.proyectado);

  r.promedioDiario = red(r.gastos / hoy.getDate());
  r.proyeccion = red(r.promedioDiario * diasMes);

  /* Lo que el mes ya sabe que viene pero todavía no cargaste. Sale de los
     recordatorios: categoría con aviso activo que este mes no aparece. El monto
     es lo que pagaste la última vez, así que es una ESTIMACIÓN y viaja aparte
     del proyectado — la app lo muestra con un "≈". Sin esto el disponible
     vuelve a mentir para arriba, que es el defecto que le sacamos al ahorro.
     Le pasamos los mapas que ya armamos para no releer la hoja. */
  r.faltaCargar = faltaCargarDelMes_(hoy);

  r.porCategoria = Object.keys(acumCat).map(function (c) {
    return { categoria: c, total: red(acumCat[c]) };
  }).sort(function (a, b) { return b.total - a.total; });

  r.porTipo = Object.keys(acumTipo).map(function (t) {
    return { tipo: t, total: red(acumTipo[t]) };
  }).sort(function (a, b) { return b.total - a.total; });

  var infoPersonas = leerPersonas_();
  r.personas = Object.keys(acumPer).map(function (p) {
    var info = null;
    for (var i = 0; i < infoPersonas.length; i++) if (infoPersonas[i].nombre === p) info = infoPersonas[i];
    return {
      nombre: p,
      saldo: red(acumPer[p].saldo),        // cuenta corriente: préstamos que van y vuelven
      gastado: red(acumPer[p].gastado),    // plata que se fue en esa persona y no vuelve
      vinculo: info ? info.vinculo : '', concepto: info ? info.concepto : ''
    };
  }).sort(function (a, b) {
    // primero los que tienen cuenta abierta, después por cuánto gastaste
    if ((a.saldo !== 0) !== (b.saldo !== 0)) return a.saldo !== 0 ? -1 : 1;
    if (a.saldo !== b.saldo) return a.saldo - b.saldo;
    return b.gastado - a.gastado;
  });

  return r;
}

/**
 * Las categorías con recordatorio activo que este mes todavía no cargaste, con
 * el monto que pagaste la última vez como estimación.
 *
 * Nunca tira: si todavía no existe la hoja Recordatorios, devuelve vacío. Esto
 * lo llama resumenMes_, que a su vez contesta cada confirmación del bot — no
 * puede romperse por una hoja que falta.
 */
function faltaCargarDelMes_(hoy) {
  var out = { total: 0, items: [] };
  try {
    pendientesDelMes_(hoy).forEach(function (p) {
      var est = p.ultimo ? Math.abs(Number(p.ultimo.importe) || 0) : 0;
      out.items.push({ categoria: p.categoria, estimado: Math.round(est * 100) / 100 });
      out.total += est;
    });
  } catch (e) {
    Logger.log('faltaCargar: ' + e);
  }
  out.total = Math.round(out.total * 100) / 100;
  return out;
}

/** Últimos N meses: ingresos, gastos y ahorro. Para el gráfico de evolución. */
function serieMensual_(meses) {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  if (n < 1) return [];
  meses = meses || 12;
  var tipos = leerTipos_();
  var hoy = new Date();
  var corte = new Date(hoy.getFullYear(), hoy.getMonth() - meses + 1, 1);
  // Cortamos en el día de hoy, no a fin de mes, por dos razones:
  //  · los meses futuros tienen cuotas cargadas pero todavía no el sueldo,
  //    así que darían un ahorro negativo que no es real;
  //  · el mes en curso tiene que coincidir con el número grande de la app,
  //    que también cuenta solo hasta hoy.
  var tope = finDeHoy_(hoy);
  var acum = {};

  var DESDE = COL.FECHA, ANCHO = COL.MONEDA - COL.FECHA + 1, o = DESDE - 1;
  h.getRange(2, DESDE, n, ANCHO).getValues().forEach(function (f) {
    var fe = f[COL.FECHA - 1 - o];
    if (!(fe instanceof Date) || fe < corte || fe > tope) return;
    if (String(f[COL.MONEDA - 1 - o] || MONEDA_DEFAULT) !== MONEDA_DEFAULT) return;
    var t = tipoPorNombre_(String(f[COL.TIPO - 1 - o] || ''), tipos);
    var nat = t ? t.naturaleza : 'Gasto';
    if (nat === 'Movimiento') return;
    var k = Utilities.formatDate(fe, ZONA, 'yyyy-MM');
    if (!acum[k]) acum[k] = { mes: k, ingresos: 0, gastos: 0 };
    var imp = Number(f[COL.IMPORTE - 1 - o]) || 0;
    if (nat === 'Ingreso') acum[k].ingresos += imp; else acum[k].gastos += -imp;
  });

  return Object.keys(acum).sort().map(function (k) {
    var x = acum[k];
    x.ingresos = Math.round(x.ingresos * 100) / 100;
    x.gastos = Math.round(x.gastos * 100) / 100;
    x.ahorro = Math.round((x.ingresos - x.gastos) * 100) / 100;
    return x;
  });
}

/**
 * Formato argentino: $ 1.271.333 / $ 45.230,50 / -$ 21.030.900
 *
 * Hecho a mano a propósito. Utilities.formatString('%,.2f') NO existe en
 * Apps Script (no soporta la coma de miles) y devuelve el texto del formato
 * sin reemplazar nada. toLocaleString('es-AR') tampoco es confiable acá.
 */
function separarMiles_(entero) {
  var s = String(entero), out = '', c = 0;
  for (var i = s.length - 1; i >= 0; i--) {
    out = s.charAt(i) + out;
    if (++c % 3 === 0 && i > 0) out = '.' + out;
  }
  return out;
}

function formatearMoneda_(monto, moneda) {
  var n = Number(monto);
  if (isNaN(n)) n = 0;
  var signo = n < 0 ? '-' : '';
  var simbolo = (moneda === 'USD') ? 'U$S ' : '$ ';

  var abs = Math.round(Math.abs(n) * 100) / 100;
  var entero = Math.floor(abs);
  var centavos = Math.round((abs - entero) * 100);
  if (centavos === 100) { entero += 1; centavos = 0; }

  var s = separarMiles_(entero);
  if (centavos > 0) s += ',' + (centavos < 10 ? '0' + centavos : String(centavos));
  return signo + simbolo + s;
}
