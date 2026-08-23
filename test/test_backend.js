/* Corre el backend real contra los 1019 movimientos migrados de Fa. */
require('./shim.js');

const fmt = n => (Math.round(n * 100) / 100).toLocaleString('es-AR');
let fallas = 0;
function chequear(nombre, ok, detalle) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) fallas++;
}

// ---------------------------------------------------------------- catálogos
const tipos = leerTipos_();
const cats = leerCategorias_();
const personas = leerPersonas_();
console.log('=== CATÁLOGOS ===');
chequear('6 tipos', tipos.length === 6, tipos.map(t => t.nombre.slice(0, 6)).join(' '));
chequear('30 categorías', cats.length === 30);
chequear('2 personas', personas.length === 2, personas.map(p => `${p.nombre}(${p.vinculo})`).join(' '));
chequear('préstamos NO cuentan como gasto',
  tipoPorNombre_('05. Préstamos', tipos).cuentaEnGasto === false);
chequear('cuota alimentaria SÍ cuenta como gasto',
  tipoPorNombre_('04. Cuota alimentaria', tipos).cuentaEnGasto === true);

// ---------------------------------------------------------------- resumen
console.log('\n=== RESUMEN DEL MES (agosto 2026) ===');
const r = resumenMes_();
console.log(`   ingresos      ${fmt(r.ingresos)}`);
console.log(`   gastos        ${fmt(r.gastos)}`);
console.log(`   ahorro        ${fmt(r.ahorro)}`);
console.log(`   comprometido  ${fmt(r.comprometido)}`);
console.log(`   movimientos   ${r.cantidad}`);
console.log(`   categorías    ${r.porCategoria.map(c => c.categoria + ' ' + fmt(c.total)).join(' | ')}`);
console.log(`   por tipo      ${r.porTipo.map(t => t.tipo + ' ' + fmt(t.total)).join(' | ')}`);
chequear('ahorro = ingresos - gastos', Math.abs(r.ahorro - (r.ingresos - r.gastos)) < 0.01);
chequear('los préstamos no entran en gastos',
  !r.porCategoria.some(c => c.categoria === 'Préstamo'));
chequear('la cuota alimentaria sí entra',
  r.porTipo.some(t => t.tipo === '04. Cuota alimentaria'));

/* ---------------------------------------------------------------- personas
 * Una persona tiene DOS números que no se suman entre sí:
 *   · saldo   -> la cuenta corriente, solo lo que va y vuelve (préstamos).
 *   · gastado -> plata que se fue en esa persona y no vuelve.
 * Mezclarlos mostraba "Noe -$21.030.900" como si fuera una deuda, cuando era
 * la cuota alimentaria acumulada de cuatro años. Fa no le prestó nada a Noe.  */
console.log('\n=== PERSONAS: CUENTA CORRIENTE vs GASTADO ===');
r.personas.forEach(p => console.log(
  `   ${p.nombre.padEnd(7)} saldo ${fmt(p.saldo).padStart(14)}   gastado ${fmt(p.gastado).padStart(14)}  ${p.vinculo}`));
const noe = r.personas.find(p => p.nombre === 'Noe');
const nikin = r.personas.find(p => p.nombre === 'Nikin');

chequear('con Noe no hay cuenta abierta: saldo 0', noe.saldo === 0, fmt(noe.saldo));
chequear('lo de Noe es gasto, no deuda: 21.030.900 gastados',
  Math.abs(noe.gastado - 21030900) < 1, fmt(noe.gastado));
// Nikin tiene un movimiento en USD que no debe mezclarse con los pesos
chequear('saldo Nikin en pesos = -4.018.000 (sin los USD 5.000)',
  Math.abs(nikin.saldo + 4018000) < 1, fmt(nikin.saldo));
chequear('a Nikin le prestás, no gastás en él', nikin.gastado === 0, fmt(nikin.gastado));

// ------------------------------------------------------------- disponible
console.log('\n=== DISPONIBLE ===');
console.log(`   ingresos ${fmt(r.ingresos)} − gastos ${fmt(r.gastos)} − proyectado ${fmt(r.proyectado)}`);
chequear('disponible = ingresos - gastos - proyectado',
  Math.abs(r.disponible - (r.ingresos - r.gastos - r.proyectado)) < 0.01, fmt(r.disponible));
chequear('si hay proyectado, el disponible es MENOR que el ahorro',
  r.proyectado > 0 ? r.disponible < r.ahorro : r.disponible === r.ahorro,
  `${fmt(r.disponible)} vs ahorro ${fmt(r.ahorro)}`);
chequear('viene la lista de lo que falta cargar',
  r.faltaCargar && typeof r.faltaCargar.total === 'number' && Array.isArray(r.faltaCargar.items));

// ---------------------------------------------------------------- serie
console.log('\n=== AHORRO MES A MES (últimos 12) ===');
const serie = serieMensual_(12);
serie.forEach(m => console.log(
  `   ${m.mes}  ing ${fmt(m.ingresos).padStart(12)}  gto ${fmt(m.gastos).padStart(12)}  ahorro ${fmt(m.ahorro).padStart(12)}`));
chequear('la serie no incluye préstamos',
  serie.every(m => m.ahorro === Math.round((m.ingresos - m.gastos) * 100) / 100));

// ---------------------------------------------------------------- parser
console.log('\n=== PARSER CON EL VOCABULARIO REAL DE FA ===');
const HOY = new Date(2026, 7, 17, 12, 0, 0);
const casos = [
  ['45230,50 la anonima con debito',        45230.5, 'Supermercados',     '02. Pagos esenciales',  '',      false],
  ['ayer 32000 axion',                      32000,   'Nafta',             '02. Pagos esenciales',  '',      false],
  ['cuota noe 1271333',                     1271333, 'Cuota alimentaria', '04. Cuota alimentaria', 'Noe',   false],
  ['cobré el sueldo 6720000',               6720000, 'Sueldo',            '01. Cobros',            '',      true ],
  ['12/08 seguro ka 715500',                715500,  'Auto',              '02. Pagos esenciales',  '',      false],
  ['dexter 89000 con credito',              89000,   'Ropa y calzado',    '03. Pagos secundarios', '',      false],
  ['angelelli luz 63230',                   63230,   'Luz',               '02. Pagos esenciales',  '',      false],
  ['le presté 500k a nikin',                500000,  'Préstamo',          '05. Préstamos',         'Nikin', false],
  ['jardin 360000',                         360000,  'Jardin',            '02. Pagos esenciales',  '',      false],
  ['3 lucas kiosco',                        3000,    'Otros',             '03. Pagos secundarios', '',      false],
  ['claro 100308',                          100308,  'Telefonia',         '02. Pagos esenciales',  '',      false],
  ['sommier 480000 en 6 cuotas',            480000,  'Cosas para la casa','03. Pagos secundarios', '',      false],
];
casos.forEach(([txt, monto, cat, tipo, persona, ingreso]) => {
  const g = parsearGasto_(txt, { categorias: cats, personas: personas, hoy: HOY, monedaDefault: 'ARS' });
  let t = g.tipo || (g.categoria ? tipoDeCategoria_(g.categoria, cats) : TIPO_OTROS);
  let c = g.categoria || 'Otros';
  if (!g.categoria) t = TIPO_OTROS;
  const ok = g.ok && g.monto === monto && c === cat && t === tipo &&
             (g.persona || '') === persona && !!g.esIngreso === ingreso;
  chequear(`"${txt}"`, ok, ok ? '' : `-> ${g.monto} / ${c} / ${t} / ${g.persona} / ing:${g.esIngreso}`);
});

// ---------------------------------------------------------------- signo
console.log('\n=== SIGNO SEGÚN EL TIPO ===');
chequear('un gasto se guarda negativo', aplicarSigno_(1000, '02. Pagos esenciales', tipos, -1) === -1000);
chequear('un cobro se guarda positivo', aplicarSigno_(1000, '01. Cobros', tipos, 1) === 1000);
chequear('prestar plata sale negativo', aplicarSigno_(1000, '05. Préstamos', tipos, -1) === -1000);
chequear('que te devuelvan entra positivo', aplicarSigno_(1000, '05. Préstamos', tipos, 1) === 1000);
chequear('el signo del gasto no depende de lo que mande el usuario',
  aplicarSigno_(1000, '02. Pagos esenciales', tipos, 1) === -1000);

// ---------------------------------------------------------------- alta
console.log('\n=== ALTA / EDICIÓN / BAJA ===');
const antes = resumenMes_();
const alta = opAgregar_({ op: 'agregar', monto: 50000, categoria: 'Supermercados',
                          detalle: 'la anonima', fecha: '2026-08-17', medio: 'Débito' });
chequear('alta OK', alta.ok && alta.movimiento.importe === -50000, `importe ${alta.movimiento.importe}`);
chequear('el tipo se dedujo de la categoría', alta.movimiento.tipo === '02. Pagos esenciales');
chequear('el gasto del mes subió 50.000',
  Math.abs(alta.resumen.gastos - antes.gastos - 50000) < 0.01);

const altaCuota = opAgregar_({ op: 'agregar', monto: 1271333, categoria: 'Cuota alimentaria',
                               detalle: 'cuota', fecha: '2026-08-17' });
chequear('la cuota completa la persona sola', altaCuota.movimiento.persona === 'Noe');

const altaPrest = opAgregar_({ op: 'agregar', monto: 300000, categoria: 'Préstamo',
                               detalle: 'a nikin', fecha: '2026-08-17' });
chequear('prestar no mueve el gasto del mes',
  Math.abs(altaPrest.resumen.gastos - alta.resumen.gastos - 1271333) < 0.01,
  `gastos ${fmt(altaPrest.resumen.gastos)}`);
chequear('pero sí mueve el saldo con Nikin',
  Math.abs(altaPrest.resumen.personas.find(p => p.nombre === 'Nikin').saldo + 4318000) < 1);

chequear('editar la categoría reacomoda el tipo',
  actualizarMovimiento_(alta.id, { categoria: 'Ropa y calzado' }) &&
  filaAObjeto_(hojaMov_().getRange(buscarFila_(alta.id), 1, 1, TOTAL_COLS).getValues()[0]).tipo
    === '03. Pagos secundarios');
chequear('borrar funciona', borrarMovimiento_(alta.id) === true);
chequear('borrar dos veces devuelve false', borrarMovimiento_(alta.id) === false);
borrarMovimiento_(altaCuota.id);
borrarMovimiento_(altaPrest.id);
chequear('el resumen vuelve a su valor original',
  Math.abs(resumenMes_().gastos - antes.gastos) < 0.01);

// ---------------------------------------------------------------- importación
console.log('\n=== IMPORTAR RESUMEN DE TARJETA ===');
const imp = opImportar_({ filas: [
  { fecha: '2026-08-05', monto: 45230.5, detalle: 'LA ANONIMA SUC 12' },
  { fecha: '2026-08-06', monto: 32000, detalle: 'AXION ENERGY' },
  { fecha: '2026-08-07', monto: 89000, detalle: 'DEXTER' },
  { fecha: '2026-08-05', monto: 45230.5, detalle: 'LA ANONIMA SUC 12' },   // repetida
  { fecha: '2026-08-08', monto: 0, detalle: 'fila rota' }
]});
chequear('importa 3, saltea 1 repetida y 1 rota',
  imp.importadas === 3 && imp.duplicadas === 1 && imp.invalidas === 1,
  `imp:${imp.importadas} dup:${imp.duplicadas} inv:${imp.invalidas}`);
// los buscamos por su detalle: la lista viene ordenada por fecha, y hay
// movimientos con fecha futura que quedan más arriba
const importados = listarMovimientos_(200)
  .filter(m => m.origen === 'import' && m.fecha.indexOf('2026-08-0') === 0);
chequear('categoriza sola por el detalle del resumen',
  importados.some(m => m.detalle.indexOf('ANONIMA') >= 0 && m.categoria === 'Supermercados') &&
  importados.some(m => m.detalle.indexOf('AXION') >= 0 && m.categoria === 'Nafta') &&
  importados.some(m => m.detalle.indexOf('DEXTER') >= 0 && m.categoria === 'Ropa y calzado'),
  importados.map(m => m.detalle + '->' + m.categoria).join(' | '));
chequear('los importados quedan negativos',
  importados.length === 3 && importados.every(m => m.importe < 0));

console.log('\n=== ORDEN DE LA LISTA ===');
const lista = listarMovimientos_(30);
let ordenada = true;
for (let i = 1; i < lista.length; i++) if (lista[i].fecha > lista[i - 1].fecha) ordenada = false;
chequear('viene ordenada por fecha, de la más nueva a la más vieja', ordenada,
  lista.slice(0, 4).map(m => m.fecha).join(' > '));

// ---------------------------------------------------------------- formato
console.log('\n=== FORMATO DE PLATA ===');
[[1271333, '$ 1.271.333'], [45230.5, '$ 45.230,50'], [-21030900, '-$ 21.030.900'], [0, '$ 0']]
  .forEach(([n, esp]) => chequear(`${n} -> ${esp}`, formatearMoneda_(n) === esp, formatearMoneda_(n)));

console.log('\n=== FORMATO: casos borde ===');
[[1000, '$ 1.000'], [999, '$ 999'], [1000000, '$ 1.000.000'], [0.5, '$ 0,50'],
 [1234.05, '$ 1.234,05'], [-0.99, '-$ 0,99'], [1234.999, '$ 1.235'],
 [999999.995, '$ 1.000.000'], [null, '$ 0'], [1271333.33, '$ 1.271.333,33']]
  .forEach(([n, esp]) => chequear(`${n} -> ${esp}`, formatearMoneda_(n) === esp, formatearMoneda_(n)));
chequear('USD lleva U$S', formatearMoneda_(5000, 'USD') === 'U$S 5.000', formatearMoneda_(5000, 'USD'));
chequear('el mes sale en castellano', /^[a-z\u00e1\u00e9\u00ed\u00f3\u00fa]+ \d{4}$/.test(resumenMes_().mes), resumenMes_().mes);

console.log('\n=== IMPORTAR: CUOTAS Y APRENDIZAJE ===');
{
  // 1) proyectamos una cuota futura, como haría el lector de PDF
  const proy = opImportar_({ filas: [
    { fecha: '2026-09-07', monto: 34150, detalle: 'VANS ECOMMERCE 5/6', categoria: 'Ropa y calzado', origen: 'proyeccion' }
  ]});
  chequear('carga la cuota proyectada', proy.importadas === 1);

  // 2) el mes que viene llega el resumen con un centavo de diferencia
  const real = opImportar_({ filas: [
    { fecha: '2026-09-07', monto: 34151.5, detalle: 'VANS ECOMMERCE 5/6', categoria: 'Ropa y calzado' }
  ]});
  chequear('no la duplica: la confirma', real.importadas === 0 && real.actualizadas === 1,
    `imp:${real.importadas} act:${real.actualizadas}`);
  const vans = listarMovimientos_(400).filter(m => m.detalle === 'VANS ECOMMERCE 5/6');
  chequear('queda una sola fila', vans.length === 1, `${vans.length}`);
  chequear('con el importe del banco, no con el pronosticado', vans[0] && vans[0].importe === -34151.5,
    vans[0] && String(vans[0].importe));
  borrarMovimiento_(vans[0].id);

  // 3) aprender un comercio de una categoría elegida a mano
  const antesClaves = leerCategorias_().find(c => c.nombre === 'Entretenimiento').palabras.length;
  const ap = opImportar_({ filas: [
    { fecha: '2026-08-11', monto: 6390, detalle: 'DLO*PEDIDOSYA PLUS', categoria: 'Entretenimiento', aprender: true }
  ]});
  olvidarCache_();
  chequear('aprende el comercio', ap.aprendidas === 1, `${ap.aprendidas}`);
  const despues = leerCategorias_().find(c => c.nombre === 'Entretenimiento').palabras;
  chequear('lo guarda en la hoja Categorias', despues.length === antesClaves + 1 && despues.indexOf('pedidosya') >= 0,
    despues.slice(-2).join(', '));
  const suger = opSugerir_({ textos: ['DLO*PEDIDOSYA PROPINA'] }).sugerencias[0];
  chequear('y la próxima ya no lo pregunta', suger.categoria === 'Entretenimiento', suger.categoria);
}

console.log('\n=== DEPURAR CATEGORÍAS ===');
{
  // creamos una categoría y le metemos movimientos
  const nueva = opNuevaCategoria_({ nombre: 'Kiosco', emoji: '🍬', tipo: '03. Pagos secundarios',
                                    palabras: 'kiosco, golosinas' });
  chequear('crea la categoría', nueva.ok && nueva.categoria.nombre === 'Kiosco');
  chequear('no deja repetir el nombre', opNuevaCategoria_({ nombre: 'kiosco' }).ok === false);
  olvidarCache_();

  const ids = ['2026-08-12', '2026-08-13'].map(f =>
    opAgregar_({ monto: 1000, categoria: 'Kiosco', detalle: 'prueba', fecha: f }).id);
  const usoAntes = usoDeCategorias_().find(u => u.categoria === 'Kiosco');
  chequear('el informe de uso la cuenta', usoAntes && usoAntes.veces === 2, usoAntes && String(usoAntes.veces));

  // el informe que come la pantalla "Depurar categorías" de la app
  const informe = opUsoCategorias_();
  const enInforme = informe.categorias.find(c => c.nombre === 'Kiosco');
  chequear('opUsoCategorias_ la devuelve con emoji y mes', informe.ok && enInforme &&
    enInforme.emoji === '🍬' && /^\d{4}-\d{2}$/.test(enInforme.ultima), enInforme && enInforme.ultima);
  chequear('vienen ordenadas de la menos usada a la más usada',
    informe.categorias.every((c, i, a) => i === 0 || a[i - 1].veces <= c.veces));

  // borrar está bloqueado mientras tenga movimientos: primero se unifica
  const noBorra = borrarCategoria_('Kiosco');
  chequear('se niega a borrar una categoría con movimientos',
    noBorra.ok === false && /movimientos/.test(noBorra.error), noBorra.error);

  const uni = unificarCategorias_('Kiosco', 'Otros');
  chequear('unificar avisa cuántos movimientos tocó',
    uni.ok && uni.movimientos === 2 && uni.destino === 'Otros', JSON.stringify(uni));
  chequear('no deja unificar una categoría consigo misma',
    unificarCategorias_('Otros', 'Otros').ok === false);
  olvidarCache_();

  const movs = listarMovimientos_(400).filter(m => ids.indexOf(m.id) >= 0);
  chequear('los movimientos NO se borraron', movs.length === 2, String(movs.length));
  chequear('pasaron a la categoría destino', movs.every(m => m.categoria === 'Otros'),
    movs.map(m => m.categoria).join(','));
  const cats2 = leerCategorias_();
  chequear('la categoría vieja salió del catálogo', !cats2.some(c => c.nombre === 'Kiosco'));
  const otros = cats2.find(c => c.nombre === 'Otros');
  chequear('sus palabras clave se mudaron', otros.palabras.indexOf('kiosco') >= 0,
    otros.palabras.slice(-3).join(', '));
  movs.forEach(m => borrarMovimiento_(m.id));

  // sin movimientos encima, ahora sí se puede borrar
  opNuevaCategoria_({ nombre: 'Kiosco', emoji: '🍬', tipo: '03. Pagos secundarios' });
  olvidarCache_();
  chequear('borra una categoría que nunca usaste', borrarCategoria_('Kiosco').ok === true);
  chequear('y desaparece del catálogo', !leerCategorias_().some(c => c.nombre === 'Kiosco'));
  chequear('avisa si le pedís borrar una que no existe', borrarCategoria_('Kiosco').ok === false);
}

console.log('\n=== LA PLANILLA ES DE FA: PUEDE ORDENARLA COMO QUIERA ===');
{
  // Fa filtró la hoja para revisar y de paso la ordenó por CreadoEn, más nuevo
  // arriba. Las filas se mueven de verdad. Antes, listarMovimientos_ leía solo
  // las últimas 240 por posición: lo recién cargado saltaba a la fila 2, salía
  // de la ventana y desaparecía de "Últimos" aunque el mes lo siguiera contando.
  const h = hojaMov_();
  const alta = agregarMovimiento_({ fecha: new Date(2026, 7, 4, 12, 0, 0),
    tipo: '02. Pagos esenciales', categoria: 'Luz', importe: -68704,
    detalle: 'luz', origen: 'telegram' });
  chequear('con la hoja en orden natural, la lista la trae',
    listarMovimientos_(80).some(m => m.id === alta.id));

  const n = h.getLastRow() - 1;
  const vals = h.getRange(2, 1, n, TOTAL_COLS).getValues();
  vals.sort((a, b) => (b[COL.CREADO - 1] ? b[COL.CREADO - 1].getTime() : 0) -
                      (a[COL.CREADO - 1] ? a[COL.CREADO - 1].getTime() : 0));
  h.getRange(2, 1, n, TOTAL_COLS).setValues(vals);
  let fila = -1;
  vals.forEach((f, i) => { if (f[0] === alta.id) fila = i + 2; });
  chequear('tras ordenar por CreadoEn la fila se fue arriba de todo', fila <= 3, 'fila ' + fila);

  const lista = listarMovimientos_(80);
  chequear('y la lista la sigue trayendo igual', lista.some(m => m.id === alta.id));
  chequear('ordenada por fecha, no por posición en la hoja',
    lista.every((m, i) => i === 0 || lista[i - 1].fecha >= m.fecha));
  chequear('el gasto del mes la cuenta, como siempre lo hizo',
    resumenMes_().gastos > 0);

  // mismo día, distinto CreadoEn: manda el más nuevo aunque la hoja esté revuelta
  const viejo = agregarMovimiento_({ fecha: new Date(2026, 7, 3, 12, 0, 0),
    tipo: '02. Pagos esenciales', categoria: 'Luz', importe: -100, detalle: 'primero' });
  const nuevo = agregarMovimiento_({ fecha: new Date(2026, 7, 3, 12, 0, 0),
    tipo: '02. Pagos esenciales', categoria: 'Luz', importe: -200, detalle: 'segundo' });
  hojaMov_().getRange(buscarFila_(nuevo.id), COL.CREADO)
    .setValue(new Date(Date.now() + 60000));      // el segundo se creó después
  const delDia = listarMovimientos_(200).filter(m => m.fecha === '2026-08-03');
  chequear('entre dos del mismo día, primero el cargado más tarde',
    delDia[0] && delDia[0].detalle === 'segundo', delDia.map(m => m.detalle).join(' > '));

  [alta.id, viejo.id, nuevo.id].forEach(id => borrarMovimiento_(id));
}

console.log('\n=== LO QUE MUESTRA LA PANTALLA MES ===');
{
  const r = resumenMes_();
  chequear('llama "proyectado" a lo que vence más adelante en el mes', 'proyectado' in r);
  chequear('deja el alias viejo por si la app va una versión atrás', r.comprometido === r.proyectado);
  chequear('el gasto viene en positivo', r.gastos >= 0, String(r.gastos));
  // los tres recuadros de la app salen del código de tipo (02 / 03 / 04)
  const codigos = r.porTipo.map(t => String(t.tipo).slice(0, 2));
  chequear('cada tipo trae su código adelante', codigos.every(c => /^\d\d$/.test(c)), codigos.join(','));
  const suma = r.porTipo.reduce((a, t) => a + t.total, 0);
  chequear('los tipos suman el gasto del mes', Math.abs(suma - r.gastos) < 0.02,
    `${suma} vs ${r.gastos}`);
}

console.log(fallas ? `\n❌ ${fallas} fallas` : '\n✅ todo en verde');
process.exit(fallas ? 1 : 0);
