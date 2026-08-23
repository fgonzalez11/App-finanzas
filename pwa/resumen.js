/**
 * resumen.js — Lector de resúmenes de tarjeta (BBVA / Visa, formato argentino).
 *
 * Corre en el teléfono: el PDF nunca sale de ahí. A la planilla viajan
 * solamente las líneas ya extraídas.
 *
 * Saca del PDF:
 *   · cierre y vencimiento (actual y próximo) — el resumen los dice, no se adivinan
 *   · cada consumo, con titular, fecha, comercio, importe y moneda
 *   · las cuotas (C.04/06), con número y total del plan
 *   · impuestos y percepciones
 *   · la proyección de las cuotas que faltan, con comercio y monto
 *
 * Se expone como window.LectorResumen.
 */
(function (global) {
  'use strict';

  var MESES_CORTOS = {
    ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5,
    jul: 6, ago: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11
  };
  var MESES_LARGOS = {
    enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5, julio: 6,
    agosto: 7, setiembre: 8, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
  };

  function sinAcentos(s) {
    return String(s)
      .replace(/[áÁ]/g, 'a').replace(/[éÉ]/g, 'e').replace(/[íÍ]/g, 'i')
      .replace(/[óÓ]/g, 'o').replace(/[úÚ]/g, 'u').replace(/[üÜ]/g, 'u');
  }

  /** '30-Jul-26' -> Date */
  function fechaCorta(s) {
    var m = String(s).trim().match(/^(\d{1,2})-([A-Za-zé]{3})-(\d{2,4})$/);
    if (!m) return null;
    var mes = MESES_CORTOS[sinAcentos(m[2]).toLowerCase()];
    if (mes === undefined) return null;
    var anio = parseInt(m[3], 10);
    if (anio < 100) anio += 2000;
    var d = new Date(anio, mes, parseInt(m[1], 10), 12, 0, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  }

  /** '34.150,00' -> 34150 ; '-327.243,07' -> -327243.07 */
  function aNumero(s) {
    var t = String(s).trim().replace(/\$/g, '').replace(/\s/g, '');
    if (!/^-?[\d.]+,\d{2}$|^-?[\d.]+$/.test(t)) return null;
    var neg = t.charAt(0) === '-';
    t = t.replace(/^-/, '').replace(/\./g, '').replace(/,/g, '.');
    var v = parseFloat(t);
    if (isNaN(v)) return null;
    return neg ? -v : v;
  }

  function iso(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) +
           '-' + ('0' + d.getDate()).slice(-2);
  }

  function sumarMeses(f, n) {
    var dia = f.getDate();
    var x = new Date(f.getFullYear(), f.getMonth() + n, 1, 12, 0, 0, 0);
    var ultimo = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(dia, ultimo));
    return x;
  }

  /**
   * Agrupa los fragmentos de texto en renglones.
   *
   * No sirve redondear la coordenada vertical: el importe de una fila suele
   * caer medio punto más abajo que el comercio (214,80 contra 215,23) y al
   * redondear terminan en renglones distintos — la fila pierde el comercio o
   * pierde el monto. Se agrupa por cercanía.
   */
  function renglones(items, tol) {
    tol = tol || 3.5;
    var ws = items.map(function (it) {
      var t = it.transform;
      return { texto: it.str, x0: t[4], x1: t[4] + (it.width || 0), top: -t[5] };
    }).filter(function (w) { return w.texto && w.texto.trim(); });

    ws.sort(function (a, b) { return a.top - b.top || a.x0 - b.x0; });

    var salida = [], actual = [], base = null;
    ws.forEach(function (w) {
      if (base === null || Math.abs(w.top - base) <= tol) {
        if (base === null) base = w.top;
        actual.push(w);
      } else {
        salida.push(actual.sort(function (a, b) { return a.x0 - b.x0; }));
        actual = [w]; base = w.top;
      }
    });
    if (actual.length) salida.push(actual.sort(function (a, b) { return a.x0 - b.x0; }));
    return salida;
  }

  function texto(ws) {
    return ws.map(function (w) { return w.texto; }).join(' ').replace(/\s+/g, ' ').trim();
  }

  /** Sin espacios ni acentos: para buscar rótulos que pdf.js parte al medio. */
  function compacto(t) {
    return sinAcentos(t).replace(/\s+/g, '').toUpperCase();
  }

  // ------------------------------------------------------------- cabecera

  function leerCabecera(L, r) {
    var plano = L.join('\n');
    var RE_FECHA = /\d{1,2}-[A-Za-zé]{3}-\d{2}/g;

    function ventana(i, n) {
      return L.slice(Math.max(0, i - 1), i + (n || 4) + 1);
    }
    function fechasCerca(i, cuantas) {
      var v = ventana(i);
      for (var k = 0; k < v.length; k++) {
        var f = v[k].match(RE_FECHA);
        if (f && f.length >= cuantas) return f;
      }
      return null;
    }

    var mT = plano.match(/(Visa [A-Za-zÁ-ú]+)/);
    var mC = plano.match(/cuenta\s+(\d{6,})/);
    if (mT) r.tarjeta = { nombre: mT[1], cuenta: mC ? mC[1] : null };

    var mTit = plano.match(/^([A-ZÑÁÉÍÓÚ]+ [A-ZÑÁÉÍÓÚ ]{6,})$/m);
    if (mTit) r.titular = mTit[1].trim();

    for (var i = 0; i < L.length; i++) {
      var t = L[i];

      if (!r.cierre && t.indexOf('CIERRE ACTUAL') >= 0 && t.indexOf('VENCIMIENTO ACTUAL') >= 0) {
        var f2 = fechasCerca(i, 2);
        if (f2) { r.cierre = fechaCorta(f2[0]); r.vencimiento = fechaCorta(f2[1]); }
      }

      // Sin espacios ni acentos: pdf.js parte "PRÓXIMO" en "PR" + "XIMO",
      // así que buscar el texto tal cual no encuentra nada.
      if (!r.proximoCierre && /PR.{0,2}XIMOCIERRE/.test(compacto(t))) {
        var f4 = fechasCerca(i, 4);
        if (f4) { r.proximoCierre = fechaCorta(f4[2]); r.proximoVencimiento = fechaCorta(f4[3]); }
      }

      if (!r.cuotasAVencer.length && /cuotas a vencer/i.test(t)) {
        var meses = null, importes = null;
        ventana(i, 3).forEach(function (t2) {
          if (!meses) {
            var mm = t2.match(/([A-ZÁ-Ú]{4,})\/(\d{2})/g);
            if (mm) meses = mm;
          }
          if (!importes && (t2.match(/\$/g) || []).length >= 2) {
            importes = (t2.match(/\$\s?[\d.,]+/g) || []).map(function (x) {
              return aNumero(x.replace('$', ''));
            });
          }
        });
        if (meses && importes) {
          for (var j = 0; j < Math.min(meses.length, importes.length); j++) {
            var p = meses[j].split('/');
            var mes = MESES_LARGOS[sinAcentos(p[0]).toLowerCase()];
            if (mes !== undefined) {
              r.cuotasAVencer.push({
                cierre: '20' + p[1] + '-' + ('0' + (mes + 1)).slice(-2),
                total: importes[j]
              });
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- filas

  function leerFila(ws, fecha, seccion, persona, xPesos, xDolares, r) {
    // Solo cuentan como importe las palabras que caen en las columnas de plata.
    // Si no, un número metido en la descripción —"DB.RG 5617 30% ( 46839,76 )"—
    // se tomaría como el monto de la fila.
    var borde = xPesos ? xPesos - 65 : 0;
    var montos = [];
    for (var i = 1; i < ws.length; i++) {
      var w = ws[i];
      if (w.x1 < borde) continue;
      var v = aNumero(w.texto);
      if (v !== null && /[.,]/.test(w.texto)) montos.push({ w: w, v: v });
    }

    var pesos = null, dolares = null;
    montos.forEach(function (m) {
      var dP = xPesos ? Math.abs(m.w.x1 - xPesos) : 1e9;
      var dD = xDolares ? Math.abs(m.w.x1 - xDolares) : 1e9;
      if (dD < dP) dolares = m.v; else pesos = m.v;
    });

    var corte = 1e9;
    montos.forEach(function (m) { if (m.w.x0 < corte) corte = m.w.x0; });

    var descPartes = [], cupon = null;
    for (var j = 1; j < ws.length; j++) {
      var p = ws[j];
      if (p.x0 >= corte) continue;
      if (/^\d{6}$/.test(p.texto)) { cupon = p.texto; continue; }
      descPartes.push(p.texto);
    }
    var desc = descPartes.join(' ').replace(/\s+/g, ' ').trim();

    var cuota = null;
    var mc = desc.match(/C\.\s?(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (mc) {
      cuota = { nro: parseInt(mc[1], 10), total: parseInt(mc[2], 10) };
      desc = (desc.slice(0, mc.index) + ' ' + desc.slice(mc.index + mc[0].length)).trim();
    }

    desc = desc.replace(/USD\s*[\d.,]*\s*$/i, '').replace(/\s+/g, ' ').replace(/^[-\s]+|[-\s]+$/g, '');
    if (!desc && !pesos && !dolares) return;

    r.movimientos.push({
      fecha: iso(fecha),
      seccion: seccion,
      titular: persona,
      descripcion: desc,
      cupon: cupon,
      pesos: pesos,
      dolares: dolares,
      cuota: cuota
    });
  }

  // ------------------------------------------------------------ proyección

  /**
   * Las cuotas que faltan, mes a mes, calculadas desde los C.NN/MM.
   * Se anclan al PRÓXIMO VENCIMIENTO, o sea al día en que la plata sale.
   * Ojo: el banco rotula su tabla por mes de CIERRE, que va un mes antes.
   */
  function proyectar(r) {
    var base = r.proximoVencimiento || (r.vencimiento && sumarMeses(r.vencimiento, 1));
    if (!base) return [];
    var acum = {};
    r.movimientos.forEach(function (m) {
      if (m.seccion !== 'consumos' || !m.cuota) return;
      var faltan = m.cuota.total - m.cuota.nro;
      if (faltan <= 0) return;
      var monto = m.pesos || 0;
      for (var i = 0; i < faltan; i++) {
        var f = sumarMeses(base, i);
        var k = iso(f).slice(0, 7);
        if (!acum[k]) acum[k] = { mes: k, fecha: iso(f), total: 0, detalle: [] };
        acum[k].total = Math.round((acum[k].total + monto) * 100) / 100;
        acum[k].detalle.push({
          comercio: m.descripcion, titular: m.titular, monto: monto,
          cuota: (m.cuota.nro + i + 1) + '/' + m.cuota.total
        });
      }
    });
    return Object.keys(acum).sort().map(function (k) { return acum[k]; });
  }

  /**
   * Compara mi proyección contra la tabla que imprime el banco.
   * Si cuadran, la lectura está bien. Si no, algo se leyó mal y hay que avisar
   * en vez de cargar números inventados.
   */
  function controlar(r) {
    var mio = {};
    r.proyeccion.forEach(function (p) { mio[p.mes] = p.total; });
    var filas = r.cuotasAVencer.map(function (c) {
      // el banco rotula por cierre; el pago cae al mes siguiente
      var p = c.cierre.split('-');
      var f = new Date(parseInt(p[0], 10), parseInt(p[1], 10), 1);
      var mesPago = f.getFullYear() + '-' + ('0' + (f.getMonth() + 1)).slice(-2);
      var calc = mio[mesPago] || 0;
      return {
        cierre: c.cierre, mesPago: mesPago, banco: c.total, calculado: calc,
        ok: Math.abs(c.total - calc) < 1
      };
    });
    return { filas: filas, ok: filas.every(function (f) { return f.ok; }) };
  }

  // ----------------------------------------------------------------- API

  function leerPaginas(paginas) {
    var r = {
      tarjeta: null, titular: null,
      cierre: null, vencimiento: null, proximoCierre: null, proximoVencimiento: null,
      movimientos: [], totalesDeclarados: [], cuotasAVencer: []
    };

    var todas = [];
    paginas.forEach(function (items) { todas = todas.concat(renglones(items)); });
    var L = todas.map(texto);
    leerCabecera(L, r);

    var seccion = null, persona = null, xPesos = null, xDolares = null;

    todas.forEach(function (ws) {
      var t = texto(ws);

      if (/^Sus pagos y ajustes/.test(t)) { seccion = 'pagos'; persona = null; return; }
      var mc = t.match(/^Consumos\s+(.+)$/);
      if (mc && t.toUpperCase().indexOf('DE ') < 0) {
        seccion = 'consumos'; persona = mc[1].trim(); return;
      }
      if (/^Impuestos, cargos/.test(t)) { seccion = 'impuestos'; persona = null; return; }
      if (/^Legales/.test(t) || /^SALDO ACTUAL/.test(t)) { seccion = null; return; }

      // Fila de encabezado: nos dice dónde caen las columnas de plata.
      //
      // No se puede buscar la palabra "DÓLARES": pdf.js corta los fragmentos
      // en los acentos y ese título llega partido como "D" + "LARES". Nos
      // guiamos por posición: PESOS marca su columna, y lo que quede más a la
      // derecha en esa misma fila es la de dólares.
      var itemPesos = null;
      for (var q = 0; q < ws.length; q++) if (ws[q].texto === 'PESOS') itemPesos = ws[q];
      if (itemPesos) {
        xPesos = itemPesos.x1;
        xDolares = null;
        ws.forEach(function (w) {
          if (w.x0 > xPesos + 5 && (xDolares === null || w.x1 > xDolares)) xDolares = w.x1;
        });
        return;
      }

      if (/^TOTAL CONSUMOS/.test(t)) {
        var nums = ws.map(function (w) { return aNumero(w.texto); })
                     .filter(function (v) { return v !== null; });
        r.totalesDeclarados.push({
          texto: t, pesos: nums.length ? nums[0] : null,
          dolares: nums.length > 1 ? nums[1] : null
        });
        return;
      }

      if (!seccion || !ws.length) return;
      var fecha = fechaCorta(ws[0].texto);
      if (!fecha) return;
      leerFila(ws, fecha, seccion, persona, xPesos, xDolares, r);
    });

    r.proyeccion = proyectar(r);
    r.control = controlar(r);
    return r;
  }

  /** Lee un ArrayBuffer con pdfjsLib ya cargado. */
  function leerPdf(buffer, pdfjsLib) {
    return pdfjsLib.getDocument({ data: buffer }).promise.then(function (doc) {
      var paginas = [];
      var cadena = Promise.resolve();
      for (var i = 1; i <= doc.numPages; i++) {
        (function (n) {
          cadena = cadena
            .then(function () { return doc.getPage(n); })
            .then(function (p) { return p.getTextContent(); })
            .then(function (tc) { paginas.push(tc.items); });
        })(i);
      }
      return cadena.then(function () { return leerPaginas(paginas); });
    });
  }

  global.LectorResumen = {
    leerPdf: leerPdf,
    leerPaginas: leerPaginas,
    aNumero: aNumero,
    fechaCorta: fechaCorta,
    sumarMeses: sumarMeses,
    iso: iso
  };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).LectorResumen;
}
