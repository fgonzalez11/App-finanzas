/**
 * 06_Api.gs — Punto de entrada web.
 *   POST  -> Telegram (webhook) o importación masiva desde la app
 *   GET   -> API que usa la app web (con JSONP, así no hay líos de CORS)
 */

function json_(obj, callback) {
  if (callback) {
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(obj) + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function autorizado_(p) {
  var s = getProp_('API_SECRET');
  return !!s && String(p.k || '') === s;
}

// ------------------------------------------------------------------ POST

/**
 * Telegram reintenta el mismo update, con espera creciente, hasta que le
 * contestamos rápido. Si tardamos, vuelve a mandarlo y el gasto se carga de
 * nuevo. Cada update trae un update_id único: lo anotamos apenas llega y si
 * ya lo vimos, cortamos.
 *
 * Ante cualquier duda esto devuelve false (procesar). Un gasto repetido se
 * borra en dos toques; un bot que no contesta nunca no hay cómo arreglarlo
 * desde el teléfono.
 */
function updateYaProcesado_(updateId) {
  if (!updateId) return false;
  try {
    var cache = CacheService.getScriptCache();
    var clave = 'tg_upd_' + updateId;
    if (cache.get(clave)) return true;
    cache.put(clave, '1', 21600);   // 6 horas, el máximo que permite
    return false;
  } catch (e) {
    Logger.log('dedupe falló: ' + e);
    return false;
  }
}

/** De dónde vino el mensaje, para poder avisar si algo explota. */
function chatDeUpdate_(u) {
  var m = u.message || u.edited_message || (u.callback_query && u.callback_query.message);
  return (m && m.chat && m.chat.id) ? m.chat.id : null;
}

function esUpdateDeTelegram_(c) {
  return !!(c.update_id || c.message || c.callback_query || c.edited_message);
}

/**
 * OJO CON EL RETURN DE ABAJO. No es un olvido.
 *
 * Cuando una aplicación web de Apps Script devuelve algo con ContentService,
 * la URL /exec no contesta el contenido: contesta un 302 redirigiendo a
 * script.googleusercontent.com. Los navegadores siguen ese redirect sin
 * chistar, pero Telegram NO: lo toma como entrega fallida y reintenta el
 * mensaje una y otra vez. Ese era el "Wrong response from the webhook:
 * 302 Found" y la razón de los gastos duplicados.
 *
 * Si doPost no devuelve nada, Apps Script contesta 200 con el cuerpo vacío,
 * sin redirect, y Telegram lo da por entregado. Por eso la rama de Telegram
 * termina en `return;` pelado y la de la app sí devuelve JSON (el navegador
 * sigue el redirect sin problema).
 */
function doPost(e) {
  var cuerpo = {};
  try { cuerpo = JSON.parse(e.postData.contents); } catch (err) { cuerpo = {}; }

  if (esUpdateDeTelegram_(cuerpo)) {
    if (!updateYaProcesado_(cuerpo.update_id)) {
      try {
        manejarUpdate_(cuerpo);
      } catch (err) {
        Logger.log('update: ' + err + '\n' + (err && err.stack));
        // Que nunca se quede mudo: si algo falla, que al menos lo diga.
        try {
          var chat = chatDeUpdate_(cuerpo);
          if (chat) tgEnviar_(chat, '⚠️ Se me rompió algo procesando eso:\n<code>' +
            String(err).substring(0, 300) + '</code>\n\nProbá /diag');
        } catch (e2) {}
      }
    }
    return;   // ← sin ContentService: así no hay 302 y Telegram no reintenta
  }

  if (!autorizado_(cuerpo)) return json_({ ok: false, error: 'no autorizado' });
  try {
    if (cuerpo.op === 'importar') return json_(opImportar_(cuerpo));
    if (cuerpo.op === 'agregar') return json_(opAgregar_(cuerpo));
    if (cuerpo.op === 'sugerir') return json_(opSugerir_(cuerpo));
    if (cuerpo.op === 'nuevaCategoria') return json_(opNuevaCategoria_(cuerpo));
    if (cuerpo.op === 'unificar') return json_(unificarCategorias_(cuerpo.origen, cuerpo.destino));
    if (cuerpo.op === 'borrarCategoria') return json_(borrarCategoria_(cuerpo.nombre));
    if (cuerpo.op === 'reasignar') return json_(reasignarMovimientos_(cuerpo.ids, cuerpo.destino));
    return json_({ ok: false, error: 'operación desconocida' });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// ------------------------------------------------------------------- GET

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var cb = p.callback || '';

  if (p.op === 'ping') return json_({ ok: true, app: 'finanzas', version: 2 }, cb);
  if (!autorizado_(p)) return json_({ ok: false, error: 'no autorizado' }, cb);

  try {
    switch (p.op) {
      case 'config':  return json_(opConfig_(), cb);
      case 'nuevaCategoria': return json_(opNuevaCategoria_(p), cb);
      case 'usoCategorias': return json_(opUsoCategorias_(), cb);
      case 'movimientosDeCategoria': return json_({ ok: true, movimientos: movimientosDeCategoria_(p.nombre) }, cb);
      case 'unificar': return json_(unificarCategorias_(p.origen, p.destino), cb);
      case 'borrarCategoria': return json_(borrarCategoria_(p.nombre), cb);
      case 'listar':  return json_({ ok: true, movimientos: listarMovimientos_(Number(p.limite) || 60) }, cb);
      case 'resumen': return json_({ ok: true, resumen: resumenMes_(), serie: serieMensual_(12) }, cb);
      case 'agregar': return json_(opAgregar_(p), cb);
      case 'editar':  return json_({ ok: actualizarMovimiento_(p.id, camposDe_(p)) }, cb);
      case 'borrar':  return json_({ ok: borrarMovimiento_(p.id) }, cb);
      case 'interpretar': {
        var g = interpretarTexto_(p.texto || '', leerCategorias_(), new Date());
        if (g.ok) g.fecha = Utilities.formatDate(g.fecha, ZONA, 'yyyy-MM-dd');
        return json_({ ok: true, movimiento: g }, cb);
      }
      default: return json_({ ok: false, error: 'operación desconocida' }, cb);
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) }, cb);
  }
}

function camposDe_(p) {
  var c = {};
  ['fecha', 'tipo', 'categoria', 'importe', 'moneda', 'persona', 'detalle', 'medio', 'notas']
    .forEach(function (k) { if (p[k] !== undefined && p[k] !== '') c[k] = p[k]; });
  return c;
}

// ---------------------------------------------------------- operaciones

/**
 * Cuántas veces usaste cada categoría, para poner arriba las que más tocás.
 *
 * A propósito NO se limita a los últimos meses. Si mirara solo lo reciente,
 * escondería justo las categorías de todos los días —supermercado, nafta, luz—
 * que son las que dejaste de anotar. Sería la app reforzando el problema.
 */
function frecuenciaCategorias_() {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var f = {};
  if (n < 1) return f;
  h.getRange(2, COL.CATEGORIA, n, 1).getValues().forEach(function (fila) {
    if (fila[0]) f[fila[0]] = (f[fila[0]] || 0) + 1;
  });
  return f;
}

function opConfig_() {
  var cats = leerCategorias_(), tipos = leerTipos_();
  var frec = frecuenciaCategorias_();
  return {
    ok: true,
    categorias: cats.map(function (c) {
      return { nombre: c.nombre, tipo: c.tipo, emoji: c.emoji, frecuencia: frec[c.nombre] || 0 };
    }),
    tipos: tipos.map(function (t) {
      return { nombre: t.nombre, naturaleza: t.naturaleza, cuentaEnGasto: t.cuentaEnGasto, emoji: t.emoji };
    }),
    personas: leerPersonas_(),
    medios: MEDIOS,
    monedas: [MONEDA_DEFAULT, 'USD'],
    planilla: ss_().getUrl()
  };
}

function opAgregar_(p) {
  if (!p.monto && !p.importe && !p.texto) return { ok: false, error: 'falta el monto' };

  var cats = leerCategorias_(), tipos = leerTipos_();
  var m;

  if (p.texto && !p.monto && !p.importe) {
    var g = interpretarTexto_(p.texto, cats, new Date());
    if (!g.ok) return { ok: false, error: g.error || 'no pude interpretarlo' };
    m = {
      fecha: g.fecha, categoria: g.categoria || CATEGORIA_OTROS,
      tipo: g.tipo || tipoDeCategoria_(g.categoria, cats),
      monto: g.monto, moneda: g.moneda, persona: g.persona,
      detalle: g.descripcion, medio: g.medio, esIngreso: g.esIngreso
    };
  } else {
    var categoria = p.categoria || categorizar_(p.detalle || p.descripcion || '', cats) || CATEGORIA_OTROS;
    m = {
      fecha: p.fecha ? new Date(p.fecha + 'T12:00:00') : new Date(),
      categoria: categoria,
      tipo: p.tipo || tipoDeCategoria_(categoria, cats),
      monto: Math.abs(Number(p.monto || p.importe)),
      moneda: p.moneda || MONEDA_DEFAULT,
      persona: p.persona || '',
      detalle: p.detalle || p.descripcion || '',
      medio: p.medio || '',
      esIngreso: String(p.esIngreso) === 'true'
    };
  }

  // si la categoría está atada a una persona, la completamos
  if (!m.persona) {
    leerPersonas_().forEach(function (per) { if (per.tipo === m.tipo) m.persona = per.nombre; });
  }

  var importe = aplicarSigno_(m.monto, m.tipo, tipos, m.esIngreso ? 1 : -1);
  // p.id lo genera la app antes de mandar y lo repite en cada reintento: si ya
  // está escrito, agregarMovimiento_ no lo duplica y avisa con repetido:true.
  var res = agregarMovimiento_({
    id: p.id || '',
    fecha: m.fecha, tipo: m.tipo, categoria: m.categoria, importe: importe,
    moneda: m.moneda, persona: m.persona, detalle: m.detalle, medio: m.medio,
    origen: p.origen || 'web', notas: p.notas || ''
  });

  return {
    ok: true, id: res.id, repetido: !!res.repetido,
    movimiento: {
      id: res.id, importe: importe, moneda: m.moneda, tipo: m.tipo,
      categoria: m.categoria, persona: m.persona, detalle: m.detalle, medio: m.medio,
      fecha: Utilities.formatDate(m.fecha, ZONA, 'yyyy-MM-dd')
    },
    resumen: resumenMes_()
  };
}

/**
 * Categoriza una lista de textos sin guardar nada.
 *
 * Lo usa el lector de resúmenes para mostrarte qué categoría le puso a cada
 * línea ANTES de que confirmes. Va por acá y no en el teléfono para que las
 * palabras clave vivan en un solo lugar: tu hoja Categorias.
 */
function opSugerir_(cuerpo) {
  var textos = cuerpo.textos || [];
  var cats = leerCategorias_();
  return {
    ok: true,
    sugerencias: textos.map(function (t) {
      // sin nombreManda: el texto lo escribe el banco, no vos
      var c = categorizarObj_(String(t || ''), cats, { nombreManda: false });
      return {
        texto: t,
        categoria: c ? c.nombre : '',
        tipo: c ? c.tipo : '',
        emoji: c ? c.emoji : ''
      };
    })
  };
}

/* Palabras que aparecen en los resúmenes pero no identifican a nadie. */
var RUIDO_COMERCIO_ = ['www', 'com', 'net', 'org', 'http', 'https', 'arg', 'argentina',
  'ecommerce', 'online', 'shop', 'store', 'bill', 'central', 'sucursal', 'suc',
  'pago', 'pagos', 'plus', 'premium', 'cuota', 'cuotas', 'sain', 'srl', 'sociedad'];

/**
 * El pedazo del nombre del comercio que sirve como palabra clave.
 * "WWW.DEXTER.COM.AR" -> "dexter" · "DLO*PEDIDOSYA PLUS" -> "pedidosya"
 * Descarta lo que tenga números (códigos de operación) y las palabras de relleno.
 */
function claveComercio_(detalle) {
  var tokens = paraBuscar_(detalle).split(' ');
  var mejor = '';
  tokens.forEach(function (t) {
    if (t.length < 4 || /\d/.test(t)) return;
    if (RUIDO_COMERCIO_.indexOf(t) >= 0) return;
    if (t.length > mejor.length) mejor = t;
  });
  return mejor;
}

/**
 * Guarda el comercio como palabra clave de la categoría que elegiste.
 * Es lo que hace que el segundo resumen salga casi solo: cada corrección
 * que hacés una vez no se vuelve a preguntar.
 */
function aprenderComercio_(detalle, categoria) {
  var clave = claveComercio_(detalle);
  if (!clave) return false;
  var h = ss_().getSheetByName(HOJA_CATEGORIAS);
  if (!h || h.getLastRow() < 2) return false;
  var vals = h.getRange(2, 1, h.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() !== categoria) continue;
    var actuales = String(vals[i][3] || '').split(',').map(function (s) { return paraBuscar_(s); });
    if (actuales.indexOf(clave) >= 0) return false;
    var nuevo = String(vals[i][3] || '').trim();
    h.getRange(i + 2, 4).setValue(nuevo ? nuevo + ', ' + clave : clave);
    return true;
  }
  return false;
}

/**
 * Crea una categoría desde la app, sin tener que abrir la planilla.
 * La categoría es solo texto: no rompe nada de lo ya cargado.
 */
function opNuevaCategoria_(p) {
  var nombre = String(p.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'falta el nombre' };
  if (nombre.length > 40) return { ok: false, error: 'el nombre es muy largo' };

  var cats = leerCategorias_();
  for (var i = 0; i < cats.length; i++) {
    if (paraBuscar_(cats[i].nombre) === paraBuscar_(nombre)) {
      return { ok: false, error: 'ya existe "' + cats[i].nombre + '"' };
    }
  }

  var tipos = leerTipos_();
  var tipo = p.tipo && tipoPorNombre_(p.tipo, tipos) ? p.tipo : TIPO_OTROS;
  var emoji = String(p.emoji || '').trim() || '📌';

  var h = ss_().getSheetByName(HOJA_CATEGORIAS);
  if (!h) return { ok: false, error: 'no encuentro la hoja Categorias' };
  h.appendRow([nombre, tipo, emoji, String(p.palabras || '').trim()]);
  olvidarCache_();

  return { ok: true, categoria: { nombre: nombre, tipo: tipo, emoji: emoji, frecuencia: 0 } };
}

/** Uso de cada categoría, para la pantalla de depuración de la app. */
function opUsoCategorias_() {
  var cats = leerCategorias_();
  var enCatalogo = {};
  cats.forEach(function (c) { enCatalogo[c.nombre] = c; });
  return {
    ok: true,
    categorias: usoDeCategorias_().map(function (u) {
      var c = enCatalogo[u.categoria];
      return {
        nombre: u.categoria, veces: u.veces, total: u.total,
        ultima: u.ultima ? Utilities.formatDate(u.ultima, ZONA, 'yyyy-MM') : '',
        huerfana: u.huerfana, emoji: c ? c.emoji : '', tipo: c ? c.tipo : ''
      };
    })
  };
}

/** "VANS ECOMMERCE 5/6" -> {base:"VANS ECOMMERCE", nro:5, total:6} */
function partirCuotaDetalle_(detalle) {
  var m = String(detalle || '').match(/^(.*?)\s+(\d{1,2})\/(\d{1,2})\s*$/);
  if (!m) return null;
  return { base: m[1].trim(), nro: parseInt(m[2], 10), total: parseInt(m[3], 10) };
}

/** Notas: "plan:ab12cd34 cuota:sommier|3/6 lo que sea" -> {base:"sommier", nro:3, total:6} */
function marcaCuotaDeNotas_(notas) {
  var m = String(notas || '').match(/cuota:(.*?)\|(\d{1,2})\/(\d{1,2})(?:\s|$)/);
  if (!m) return null;
  return { base: m[1], nro: parseInt(m[2], 10), total: parseInt(m[3], 10) };
}

function claveCuotaPorMarca_(base, nro, total, yyyyMM) {
  return 'm:' + normalizar_(base) + '|' + nro + '/' + total + '|' + yyyyMM;
}
function claveCuotaPorDetalle_(detalle, yyyyMM) {
  return 'd:' + normalizar_(detalle) + '|' + yyyyMM;
}

/** Arma la marca `cuota:base|N/total` que van a leer indiceCuotas_ y marcaCuotaDeNotas_. */
function marcaCuota_(base, nro, total) {
  return 'cuota:' + normalizar_(base) + '|' + nro + '/' + total;
}

/**
 * Índice de las cuotas ya cargadas, para que una cuota proyectada y la misma
 * cuota cuando llega en el resumen no se dupliquen. Lo que cargaste antes es
 * un pronóstico; lo que trae el banco es el hecho, y el hecho pisa al
 * pronóstico aunque los centavos no coincidan.
 *
 * Si la fila tiene la marca `cuota:` en Notas (la ponen los planes armados
 * desde que existe esto), la clave sale de ahí: aguanta que le cambies el
 * Detalle a mano sin que se te duplique al mes siguiente. Si no la tiene
 * (planes viejos, de antes de este cambio), cae al comportamiento de
 * siempre: clave = detalle normalizado + mes. Ese respaldo solo funciona
 * mientras no toques el Detalle de esas cuotas viejas.
 */
function indiceCuotas_() {
  var h = hojaMov_();
  var n = h.getLastRow() - 1;
  var idx = {};
  if (n < 1) return idx;
  var vals = h.getRange(2, COL.FECHA, n, COL.NOTAS - COL.FECHA + 1).getValues();
  var o = COL.FECHA - 1;
  for (var i = 0; i < vals.length; i++) {
    var fe = vals[i][COL.FECHA - 1 - o];
    var det = vals[i][COL.DETALLE - 1 - o];
    var notas = vals[i][COL.NOTAS - 1 - o];
    if (!(fe instanceof Date) || !det) continue;
    if (!partirCuotaDetalle_(det)) continue;
    var yyyyMM = Utilities.formatDate(fe, ZONA, 'yyyy-MM');
    var marca = marcaCuotaDeNotas_(notas);
    if (marca) {
      idx[claveCuotaPorMarca_(marca.base, marca.nro, marca.total, yyyyMM)] = i + 2;
    } else {
      idx[claveCuotaPorDetalle_(det, yyyyMM)] = i + 2;
    }
  }
  return idx;
}

/**
 * Importación masiva (resumen de tarjeta / banco).
 * cuerpo.filas: [{ fecha:'yyyy-MM-dd', monto, detalle, medio?, categoria?, moneda?, esIngreso? }]
 * Los importes llegan en positivo si son gastos; el signo lo pone el tipo.
 * Saltea lo que ya esté cargado usando el hash fecha+importe+detalle.
 */
function opImportar_(cuerpo) {
  var filas = cuerpo.filas || [];
  if (!filas.length) return { ok: false, error: 'no mandaste filas' };

  var cats = leerCategorias_(), tipos = leerTipos_();
  var yaEstan = hashesExistentes_();
  var idxCuotas = indiceCuotas_();
  var personas = leerPersonas_();
  var h = hojaMov_();
  var nuevas = [], correcciones = [], aprender = [];
  var duplicadas = 0, invalidas = 0, actualizadas = 0, aprendidas = 0, ahora = new Date();

  filas.forEach(function (f) {
    var monto = Math.abs(Number(f.monto));
    if (!monto || isNaN(monto)) { invalidas++; return; }
    var fecha = f.fecha ? new Date(String(f.fecha).substring(0, 10) + 'T12:00:00') : new Date();
    if (isNaN(fecha.getTime())) { invalidas++; return; }

    var detalle = String(f.detalle || f.descripcion || '').trim();
    var sugerida = categorizarObj_(detalle, cats, { nombreManda: false });
    var categoria = f.categoria || (sugerida && sugerida.nombre) || CATEGORIA_OTROS;
    var tipo = f.tipo || tipoDeCategoria_(categoria, cats);
    var importe = aplicarSigno_(monto, tipo, tipos, f.esIngreso ? 1 : -1);

    // categoría puesta a mano en la revisión: nos la guardamos para la próxima
    if (f.aprender && categoria && categoria !== CATEGORIA_OTROS) {
      aprender.push({ detalle: detalle, categoria: categoria });
    }

    // ¿Es una cuota que ya estaba proyectada? Entonces no es un duplicado:
    // es la confirmación. Le pisamos el importe con el del banco.
    // Probamos primero por la marca en Notas (aguanta que le hayan cambiado
    // el Detalle) y si no hay, por el Detalle de siempre.
    var partesCuota = partirCuotaDetalle_(detalle);
    if (partesCuota) {
      var yyyyMM = Utilities.formatDate(fecha, ZONA, 'yyyy-MM');
      var claveMarca = claveCuotaPorMarca_(partesCuota.base, partesCuota.nro, partesCuota.total, yyyyMM);
      var claveDetalle = claveCuotaPorDetalle_(detalle, yyyyMM);
      var filaExistente = idxCuotas[claveMarca] || idxCuotas[claveDetalle];
      if (filaExistente) {
        correcciones.push({ fila: filaExistente, importe: importe, fecha: fecha,
                            categoria: categoria, tipo: tipo, detalle: detalle });
        actualizadas++;
        return;
      }
      idxCuotas[claveMarca] = -1;    // reservadas dentro de esta misma importación
      idxCuotas[claveDetalle] = -1;
    }

    var hash = hashMov_(fecha, importe, detalle);
    if (yaEstan[hash]) { duplicadas++; return; }
    yaEstan[hash] = true;

    var persona = f.persona || '';
    if (!persona) personas.forEach(function (p) { if (p.tipo === tipo) persona = p.nombre; });

    // Si es una cuota (venga como gasto de este mes o como proyección de una
    // que todavía no llega), la marcamos ahora con el texto que trajo el
    // banco. Es la única oportunidad: cuando llegue el mes real de esta
    // cuota, la vamos a reconocer por esta marca aunque el Detalle ya no
    // diga lo mismo (ver indiceCuotas_).
    var notasFinal = f.notas || '';
    if (partesCuota) {
      notasFinal = (marcaCuota_(partesCuota.base, partesCuota.nro, partesCuota.total) + ' ' + notasFinal).trim();
    }

    nuevas.push([nuevoId_(), fecha, tipo, categoria, importe, f.moneda || MONEDA_DEFAULT,
                 persona, detalle, f.medio || 'Crédito', f.origen || 'import',
                 notasFinal, ahora, hash]);
  });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    correcciones.forEach(function (c) {
      h.getRange(c.fila, COL.IMPORTE).setValue(c.importe);
      h.getRange(c.fila, COL.FECHA).setValue(c.fecha);
      h.getRange(c.fila, COL.CATEGORIA).setValue(c.categoria);
      h.getRange(c.fila, COL.TIPO).setValue(c.tipo);
      h.getRange(c.fila, COL.ORIGEN).setValue('import');
      h.getRange(c.fila, COL.HASH).setValue(hashMov_(c.fecha, c.importe, c.detalle));
    });
    if (nuevas.length) {
      h.getRange(h.getLastRow() + 1, 1, nuevas.length, TOTAL_COLS).setValues(nuevas);
    }
  } finally { lock.releaseLock(); }

  var vistas = {};
  aprender.forEach(function (a) {
    var k = claveComercio_(a.detalle) + '|' + a.categoria;
    if (vistas[k]) return;
    vistas[k] = true;
    if (aprenderComercio_(a.detalle, a.categoria)) aprendidas++;
  });

  return {
    ok: true, importadas: nuevas.length, duplicadas: duplicadas,
    invalidas: invalidas, actualizadas: actualizadas, aprendidas: aprendidas,
    resumen: resumenMes_()
  };
}
