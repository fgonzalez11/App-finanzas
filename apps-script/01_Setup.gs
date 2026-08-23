/**
 * 01_Setup.gs — Prepara las hojas.
 * Se puede correr las veces que quieras: nunca borra datos.
 */

function prepararPlanilla() {
  olvidarCache_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.setSpreadsheetTimeZone(ZONA);

  crearHojaTipos_(ss);
  crearHojaCategorias_(ss);
  crearHojaPersonas_(ss);
  crearHojaRecordatorios_(ss);
  formatearHojaMovimientos_(ss);
  crearHojaResumen_(ss);

  ['Hoja 1', 'Hoja1', 'Sheet1'].forEach(function (n) {
    var h = ss.getSheetByName(n);
    if (h && ss.getSheets().length > 1 && h.getLastRow() === 0) ss.deleteSheet(h);
  });

  ss.setActiveSheet(ss.getSheetByName(HOJA_MOVIMIENTOS));
  SpreadsheetApp.getUi().alert('Planilla lista ✅\n\nSeguí con el paso 2 del menú.');
}

function encabezar_(h, cabeceras) {
  h.getRange(1, 1, 1, cabeceras.length).setValues([cabeceras])
    .setFontWeight('bold').setBackground('#1f2937').setFontColor('#ffffff')
    .setVerticalAlignment('middle');
  h.setFrozenRows(1);
  h.setRowHeight(1, 32);
}

function formatearHojaMovimientos_(ss) {
  var h = ss.getSheetByName(HOJA_MOVIMIENTOS);
  if (!h) {
    h = ss.insertSheet(HOJA_MOVIMIENTOS, 0);
    h.getRange(1, 1, 1, TOTAL_COLS).setValues([ENCABEZADOS]);
  }
  encabezar_(h, ENCABEZADOS);

  h.getRange('B:B').setNumberFormat('dd/mm/yyyy');
  h.getRange('E:E').setNumberFormat('#,##0.00;[RED]-#,##0.00');
  h.getRange('L:L').setNumberFormat('dd/mm/yyyy hh:mm');

  var anchos = [80, 92, 165, 145, 115, 68, 78, 220, 105, 80, 150, 130, 110];
  anchos.forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.hideColumns(COL.HASH);

  var filas = Math.max(h.getMaxRows() - 1, 1);
  validar_(h, COL.TIPO, filas, ss.getSheetByName(HOJA_TIPOS), 'A2:A100');
  validar_(h, COL.CATEGORIA, filas, ss.getSheetByName(HOJA_CATEGORIAS), 'A2:A300');
  validar_(h, COL.PERSONA, filas, ss.getSheetByName(HOJA_PERSONAS), 'A2:A100');
  h.getRange(2, COL.MEDIO, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(MEDIOS, true).setAllowInvalid(true).build());

  return h;
}

function validar_(h, col, filas, hojaOrigen, rango) {
  if (!hojaOrigen) return;
  h.getRange(2, col, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation()
      .requireValueInRange(hojaOrigen.getRange(rango), true)
      .setAllowInvalid(true).build());
}

function crearHojaTipos_(ss) {
  var h = ss.getSheetByName(HOJA_TIPOS);
  if (!h) {
    h = ss.insertSheet(HOJA_TIPOS);
    h.getRange(1, 1, 1, 5).setValues([['Tipo', 'Orden', 'Naturaleza', 'CuentaEnGasto', 'Emoji']]);
    h.getRange(2, 1, TIPOS_INICIALES.length, 5).setValues(TIPOS_INICIALES);
  }
  encabezar_(h, ['Tipo', 'Orden', 'Naturaleza', 'CuentaEnGasto', 'Emoji']);
  [190, 60, 110, 125, 60].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });

  h.getRange('G1').setValue('Cómo leer esta hoja').setFontWeight('bold');
  h.getRange('G2:G5').setValues([
    ['Naturaleza — Ingreso suma al ahorro · Gasto resta · Movimiento no es ni una cosa ni la otra'],
    ['CuentaEnGasto — SI significa que entra en "cuánto gasté este mes"'],
    ['Los préstamos van en NO: la plata sale pero vuelve, no es gasto'],
    ['La cuota alimentaria va en SI: es plata que sale y no vuelve']
  ]).setFontSize(9).setFontColor('#666666');
  h.setColumnWidth(7, 620);
  return h;
}

function crearHojaCategorias_(ss) {
  var h = ss.getSheetByName(HOJA_CATEGORIAS);
  if (!h) {
    h = ss.insertSheet(HOJA_CATEGORIAS);
    h.getRange(1, 1, 1, 4).setValues([['Categoria', 'TipoPorDefecto', 'Emoji', 'PalabrasClave']]);
    h.getRange(2, 1, 2, 4).setValues([
      ['Otros', TIPO_OTROS, '📌', ''],
      ['Sueldo', '01. Cobros', '💵', 'sueldo, haberes, cobro']
    ]);
  }
  encabezar_(h, ['Categoria', 'TipoPorDefecto', 'Emoji', 'PalabrasClave']);
  [170, 190, 60, 620].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  h.getRange('D:D').setWrap(true);

  var tipos = ss.getSheetByName(HOJA_TIPOS);
  if (tipos) validar_(h, 2, Math.max(h.getMaxRows() - 1, 1), tipos, 'A2:A100');

  h.getRange('F1').setValue(
    'PalabrasClave: así adivina el bot la categoría. Las que están salieron de tus ' +
    'observaciones de los últimos 4 años. Agregá las que quieras, separadas por coma.')
    .setFontSize(9).setFontColor('#666666');
  h.setColumnWidth(6, 420);
  return h;
}

function crearHojaPersonas_(ss) {
  var h = ss.getSheetByName(HOJA_PERSONAS);
  if (!h) {
    h = ss.insertSheet(HOJA_PERSONAS);
    h.getRange(1, 1, 1, 4).setValues([['Persona', 'Vinculo', 'Concepto', 'TipoAsociado']]);
  }
  encabezar_(h, ['Persona', 'Vinculo', 'Concepto', 'TipoAsociado']);
  [130, 150, 190, 200].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  return h;
}

/**
 * Los recordatorios. Arranca con lo que se repite en tu historia, con el día
 * en que solés cargarlo — que NO es el vencimiento. El vencimiento es dato
 * tuyo y no hay forma de deducirlo: corregí la columna Vence.
 */
var RECORDATORIOS_INICIALES = [
  ['Cuota alimentaria', 2,  'SI'],
  ['Jardin',            5,  'SI'],
  ['Telefonia',         3,  'SI'],
  ['Luz',               12, 'SI'],
  ['Gas',               12, 'SI'],
  ['Internet',          12, 'SI'],
  ['Depto',             10, 'SI'],
  ['Prestamo',          13, 'SI'],
  ['Auto',              20, 'SI'],
  ['Lotes',             20, 'SI']
];

function crearHojaRecordatorios_(ss) {
  var h = ss.getSheetByName(HOJA_RECORDATORIOS);
  if (!h) {
    h = ss.insertSheet(HOJA_RECORDATORIOS);
    h.getRange(1, 1, 1, 3).setValues([['Categoria', 'Vence', 'Activo']]);
    h.getRange(2, 1, RECORDATORIOS_INICIALES.length, 3).setValues(RECORDATORIOS_INICIALES);
  }
  encabezar_(h, ['Categoria', 'Vence', 'Activo']);
  [190, 80, 80].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });

  var filas = Math.max(h.getMaxRows() - 1, 1);
  var cats = ss.getSheetByName(HOJA_CATEGORIAS);
  if (cats) validar_(h, 1, filas, cats, 'A2:A300');
  h.getRange(2, 3, filas, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(['SI', 'NO'], true)
      .setAllowInvalid(true).build());

  h.getRange('E1').setValue('Cómo funciona').setFontWeight('bold');
  h.getRange('E2:E7').setValues([
    ['Vence — el día del mes en que es la fecha límite de pago.'],
    ['El bot avisa el DÍA HÁBIL ANTERIOR a las ' + HORA_RECORDATORIOS + ':00, con el monto del mes pasado.'],
    ['Si llega el día del vencimiento y todavía no lo cargaste, insiste una vez más.'],
    ['No te avisa si ya cargaste esa categoría este mes.'],
    ['Activo — poné NO para silenciar una sin borrar la fila.'],
    ['Los feriados no los ve: solo saltea sábados y domingos.']
  ]).setFontSize(9).setFontColor('#666666');
  h.setColumnWidth(5, 560);
  return h;
}

/**
 * Crea la tarea programada que dispara los avisos.
 * Apps Script no garantiza el minuto exacto: cae dentro de esa hora.
 */
function instalarRecordatorios() {
  var ui = SpreadsheetApp.getUi();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'revisarRecordatorios') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarRecordatorios')
    .timeBased().everyDays(1).atHour(HORA_RECORDATORIOS).inTimezone(ZONA).create();

  crearHojaRecordatorios_(SpreadsheetApp.getActiveSpreadsheet());
  ui.alert('Recordatorios activados 🔔\n\n' +
    'Todos los días alrededor de las ' + HORA_RECORDATORIOS + ':00 reviso qué vence y te aviso.\n\n' +
    'Andá a la hoja "Recordatorios" y corregí la columna Vence: los días que puse ' +
    'son los que solés cargar, no los vencimientos reales.');
}

function crearHojaResumen_(ss) {
  var h = ss.getSheetByName(HOJA_RESUMEN);
  if (!h) h = ss.insertSheet(HOJA_RESUMEN);
  h.clear();
  var M = HOJA_MOVIMIENTOS;

  h.getRange('A1').setValue('Resumen').setFontSize(16).setFontWeight('bold');

  // Ahorro por mes: ingresos + gastos (los gastos ya vienen en negativo).
  // Dentro de QUERY las columnas se nombran según el rango: B2:G -> A=Fecha B=Tipo
  // C=Categoría D=Importe E=Moneda F=Persona
  h.getRange('A3').setValue('Ahorro por mes').setFontWeight('bold');
  h.getRange('A4').setFormula(
    '=IFERROR(QUERY(' + M + '!B2:G, ' +
    '"select year(A)*100+month(A)+1, sum(D) where A is not null and E = \'' + MONEDA_DEFAULT + '\' ' +
    'and B != \'05. Préstamos\' and B != \'00. Saldo inicial\' ' +
    'group by year(A)*100+month(A)+1 order by year(A)*100+month(A)+1 desc ' +
    'label year(A)*100+month(A)+1 \'Mes\', sum(D) \'Ahorro\'", 0), "")'
  );

  h.getRange('D3').setValue('Mes en curso, por categoría').setFontWeight('bold');
  h.getRange('D4').setFormula(
    '=IFERROR(QUERY(' + M + '!B2:G, "select C, sum(D) where A >= date \'"' +
    '&TEXT(EOMONTH(TODAY(),-1)+1,"yyyy-mm-dd")&"\' and A <= date \'"' +
    '&TEXT(EOMONTH(TODAY(),0),"yyyy-mm-dd")&"\' and E = \'' + MONEDA_DEFAULT + '\' and D < 0 ' +
    'group by C order by sum(D) asc label C \'Categoría\', sum(D) \'Total\'", 0), "")'
  );

  var mes = '' + M + '!$B$2:$B, ">="&EOMONTH(TODAY(),-1)+1, ' + M + '!$B$2:$B, "<="&EOMONTH(TODAY(),0), ' +
            M + '!$F$2:$F, "' + MONEDA_DEFAULT + '"';

  h.getRange('G3').setValue('Mes en curso').setFontWeight('bold');
  h.getRange('G4').setValue('Ingresos');
  h.getRange('H4').setFormula('=IFERROR(SUMIFS(' + M + '!$E$2:$E, ' + mes + ', ' + M + '!$E$2:$E, ">0", ' + M + '!$C$2:$C, "01.*"), 0)');
  h.getRange('G5').setValue('Gastos');
  h.getRange('H5').setFormula('=IFERROR(SUMIFS(' + M + '!$E$2:$E, ' + mes + ', ' + M + '!$E$2:$E, "<0", ' +
    M + '!$C$2:$C, "<>05. Préstamos", ' + M + '!$C$2:$C, "<>00. Saldo inicial"), 0)');
  h.getRange('G6').setValue('Ahorro').setFontWeight('bold');
  h.getRange('H6').setFormula('=H4+H5').setFontWeight('bold');
  h.getRange('H4:H6').setNumberFormat('#,##0.00;[RED]-#,##0.00');
  h.getRange('H6').setFontSize(16);

  // Saldo acumulado con cada persona (histórico completo, no solo el mes)
  h.getRange('G8').setValue('Saldo con personas').setFontWeight('bold');
  var personas = leerPersonas_();
  if (personas.length) {
    var filas = personas.map(function (p) { return [p.nombre]; });
    var fx = personas.map(function (p) {
      return ['=IFERROR(SUMIFS(' + M + '!$E$2:$E, ' + M + '!$G$2:$G, "' + p.nombre + '", ' +
              M + '!$F$2:$F, "' + MONEDA_DEFAULT + '"), 0)'];
    });
    h.getRange(9, 7, filas.length, 1).setValues(filas);
    h.getRange(9, 8, fx.length, 1).setFormulas(fx)
      .setNumberFormat('#,##0.00;[RED]-#,##0.00');
  }

  h.getRange('B:B').setNumberFormat('#,##0.00;[RED]-#,##0.00');
  h.getRange('E:E').setNumberFormat('#,##0.00;[RED]-#,##0.00');
  [110, 130, 26, 165, 130, 26, 145, 130].forEach(function (w, i) { h.setColumnWidth(i + 1, w); });
  return h;
}

function refrescarResumen() {
  crearHojaResumen_(SpreadsheetApp.getActiveSpreadsheet());
  SpreadsheetApp.getActiveSpreadsheet().toast('Resumen actualizado', '💸 Finanzas', 3);
}
