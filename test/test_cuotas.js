/* Planes en cuotas cargados a mano por Telegram. */
require('./shim.js');

let fallas = 0;
function chequear(nombre, ok, detalle) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) fallas++;
}
const plata = n => (Math.round(n * 100) / 100).toLocaleString('es-AR');
const dia = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

const cats = leerCategorias_();
const pers = leerPersonas_();
const tipos = leerTipos_();
const HOY = new Date(2026, 7, 17, 12, 0, 0);
const p = t => parsearGasto_(t, { categorias: cats, personas: pers, hoy: HOY, monedaDefault: 'ARS' });

console.log('=== CÓMO SE ESCRIBE ===');
const casos = [
  // texto,                                     cuotas, total,    cat
  ['sommier 480000 en 6 cuotas',                 6,  480000, 'Cosas para la casa'],
  ['6 cuotas de 80000 sommier',                  6,  480000, 'Cosas para la casa'],
  ['tv 900000 en 12 cuotas sin interes',        12,  900000, ''],
  ['heladera 1 palo en 18 cuotas',              18, 1000000, ''],
  ['zapatillas dexter 120000 en 3 pagos',        3,  120000, 'Ropa y calzado'],
  ['3 cuotas de 40000 dexter',                   3,  120000, 'Ropa y calzado'],
  ['universidad 850000 en 10 cuotas',           10,  850000, 'Universidad'],
];
casos.forEach(([txt, n, total, cat]) => {
  const g = p(txt);
  const ok = g.ok && g.cuotas === n && g.monto === total && (g.categoria || '') === cat;
  chequear(`"${txt}"`, ok, ok ? `${n} × ${plata(total / n)}` :
    `-> cuotas=${g.cuotas} total=${g.monto} cat="${g.categoria}"`);
});

console.log('\n=== LO QUE NO ES UNA CUOTA NO DEBE SERLO ===');
[['3 lucas cena', 3000], ['45230,50 la anonima', 45230.5], ['2500 nafta', 2500],
 ['12/08 seguro ka 715500', 715500], ['cobré el sueldo 6720000', 6720000]]
  .forEach(([txt, monto]) => {
    const g = p(txt);
    chequear(`"${txt}" no es plan`, g.ok && !g.cuotas && g.monto === monto,
      `cuotas=${g.cuotas} monto=${g.monto}`);
  });

console.log('\n=== "CUOTAS" YA NO IMPLICA CRÉDITO ===');
chequear('sin nombrar la tarjeta, el medio queda vacío', p('sommier 480000 en 6 cuotas').medio === '',
  `"${p('sommier 480000 en 6 cuotas').medio}"`);
chequear('si decís tarjeta, sí lo toma',
  p('sommier 480000 en 6 cuotas con tarjeta').medio === 'Crédito');

console.log('\n=== EL REPARTO CIERRA EXACTO ===');
[[480000, 6], [100000, 3], [1000000, 18], [7, 3], [999999.99, 7], [850000, 10]]
  .forEach(([total, n]) => {
    const c = repartirCuotas_(total, n);
    const suma = Math.round(c.reduce((a, b) => a + b, 0) * 100) / 100;
    chequear(`${plata(total)} en ${n} suma ${plata(suma)}`, suma === Math.round(total * 100) / 100,
      `cuotas ${plata(c[0])} … última ${plata(c[n - 1])}`);
  });

console.log('\n=== LAS FECHAS ===');
chequear('17/08 + 3 meses = 17/11', dia(sumarMeses_(new Date(2026, 7, 17), 3)) === '17/11/2026');
chequear('31/01 + 1 mes = 28/02 (no se pasa a marzo)',
  dia(sumarMeses_(new Date(2026, 0, 31), 1)) === '28/02/2026', dia(sumarMeses_(new Date(2026, 0, 31), 1)));
chequear('31/12 + 2 meses = 28/02 del año que viene',
  dia(sumarMeses_(new Date(2026, 11, 31), 2)) === '28/02/2027', dia(sumarMeses_(new Date(2026, 11, 31), 2)));

console.log('\n=== EL PLAN EN LA PLANILLA ===');
const antes = resumenMes_();
const filasAntes = hojaMov_().getLastRow();
const plan = crearPlanEnCuotas_({
  fecha: HOY, tipo: '03. Pagos secundarios', categoria: 'Cosas para la casa',
  montoTotal: 480000, n: 6, moneda: 'ARS', detalle: 'sommier', origen: 'telegram'
});
chequear('crea 6 filas', hojaMov_().getLastRow() === filasAntes + 6);
chequear('cada una de 80.000 y negativas', plan.montos.every(m => m === 80000));

const delPlan = listarMovimientos_(300).filter(m => planDeNotas_(m.notas) === plan.plan);
chequear('las 6 quedan atadas al mismo plan', delPlan.length === 6);
chequear('numeradas 1/6 … 6/6',
  delPlan.map(m => m.detalle).sort().join(' ') === 'sommier 1/6 sommier 2/6 sommier 3/6 sommier 4/6 sommier 5/6 sommier 6/6',
  delPlan.map(m => m.detalle).sort().join(' '));
chequear('todas negativas', delPlan.every(m => m.importe === -80000));
const fechas = delPlan.map(m => m.fecha).sort();
chequear('una por mes, del 17/08 al 17/01',
  fechas[0] === '2026-08-17' && fechas[5] === '2027-01-17', fechas.join(' '));

const conPlan = resumenMes_();
chequear('este mes impacta UNA cuota, no el total',
  Math.abs(conPlan.gastos - antes.gastos - 80000) < 0.01,
  `+${plata(conPlan.gastos - antes.gastos)}`);
chequear('las otras 5 no tocan el mes en curso',
  Math.abs(conPlan.comprometido - antes.comprometido) < 0.01);

console.log('\n=== RECATEGORIZAR Y BORRAR EL PLAN ENTERO ===');
const tocadas = actualizarPlanCategoria_(plan.plan, 'Regalos');
chequear('cambiar la categoría alcanza a las 6', tocadas === 6);
const trasCambio = listarMovimientos_(300).filter(m => planDeNotas_(m.notas) === plan.plan);
chequear('y también les cambia el tipo',
  trasCambio.every(m => m.categoria === 'Regalos' && m.tipo === '03. Pagos secundarios'));
chequear('siguen negativas después del cambio', trasCambio.every(m => m.importe === -80000));

chequear('borrar el plan borra las 6', borrarPlan_(plan.plan) === 6);
chequear('no queda ninguna suelta',
  listarMovimientos_(300).filter(m => planDeNotas_(m.notas) === plan.plan).length === 0);
chequear('el resumen vuelve a como estaba',
  Math.abs(resumenMes_().gastos - antes.gastos) < 0.01);

console.log('\n=== DE PUNTA A PUNTA POR TELEGRAM ===');
setProp_('TELEGRAM_TOKEN', 'x:y');
setProp_('TELEGRAM_CHAT_IDS', '12345');
const { stats, resetStats } = require('./shim.js');
resetStats();
olvidarCache_();
const filasPre = hojaMov_().getLastRow();
doPost({ postData: { contents: JSON.stringify({
  update_id: 990001,
  message: { message_id: 1, chat: { id: 12345 }, text: 'sommier 480000 en 6 cuotas' } }) } });
chequear('el mensaje crea las 6 filas', hojaMov_().getLastRow() === filasPre + 6,
  `${hojaMov_().getLastRow() - filasPre}`);
const msg = JSON.parse(stats.fetch[0].payload);
console.log('\n   respuesta del bot:\n' + msg.text.split('\n').map(l => '   | ' + l).join('\n'));
chequear('dice cuántas cuotas y de cuánto', /6 cuotas de \$ 80\.000/.test(msg.text));
chequear('dice el total', /480\.000/.test(msg.text));
// Las fechas se calculan desde hoy, no se escriben a mano: si las dejo fijas,
// el test se rompe solo con el paso del tiempo y me hace perder media hora
// buscando un bug que no existe. Ya pasó.
const dosDigitos = x => String(x).padStart(2, '0');
const comoElBot = d => dosDigitos(d.getDate()) + '/' + dosDigitos(d.getMonth() + 1) +
                       '/' + String(d.getFullYear()).slice(-2);
const primeraCuota = new Date();
const ultimaCuota = new Date(primeraCuota.getFullYear(), primeraCuota.getMonth() + 5,
                             primeraCuota.getDate(), 12);
chequear('dice desde cuándo hasta cuándo',
  new RegExp(comoElBot(primeraCuota).replace(/\//g, '\\/') + '.*' +
             comoElBot(ultimaCuota).replace(/\//g, '\\/')).test(msg.text),
  comoElBot(primeraCuota) + ' -> ' + comoElBot(ultimaCuota));
chequear('ofrece borrar las 6',
  JSON.stringify(msg.reply_markup).indexOf('Borrar las 6') >= 0);

// limpieza
const planCreado = listarMovimientos_(300).map(m => planDeNotas_(m.notas)).filter(Boolean)[0];
borrarPlan_(planCreado);

console.log(fallas ? `\n❌ ${fallas} fallas` : '\n✅ todo en verde');
process.exit(fallas ? 1 : 0);
