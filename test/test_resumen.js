/*
 * Corre el lector de resúmenes (el mismo archivo que va en el teléfono)
 * contra el PDF real de Fa, y lo compara contra lo que declara el banco.
 */
const fs = require('fs');
const path = require('path');

globalThis.window = globalThis;
const Lector = require('../pwa/resumen.js');

let fallas = 0;
function chequear(nombre, ok, detalle) {
  console.log(`${ok ? '✓' : '✗'} ${nombre}${detalle ? '  ' + detalle : ''}`);
  if (!ok) fallas++;
}
const plata = n => (Math.round((n || 0) * 100) / 100).toLocaleString('es-AR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
  const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.worker.js');

  const buf = new Uint8Array(fs.readFileSync(path.join(__dirname, '..', 'pdf', 'resumen.pdf')));
  const r = await Lector.leerPdf(buf, pdfjsLib);

  const f = d => d ? `${('0' + d.getDate()).slice(-2)}/${('0' + (d.getMonth() + 1)).slice(-2)}/${d.getFullYear()}` : '—';

  console.log('=== CABECERA ===');
  console.log(`   tarjeta : ${r.tarjeta && r.tarjeta.nombre} ${r.tarjeta && r.tarjeta.cuenta}`);
  console.log(`   titular : ${r.titular}`);
  console.log(`   cierre  : ${f(r.cierre)}  vence ${f(r.vencimiento)}`);
  console.log(`   próximo : ${f(r.proximoCierre)}  vence ${f(r.proximoVencimiento)}`);
  chequear('lee la tarjeta', r.tarjeta && r.tarjeta.cuenta === '0850212509');
  chequear('cierre 30/07 y vencimiento 07/08',
    f(r.cierre) === '30/07/2026' && f(r.vencimiento) === '07/08/2026');
  chequear('próximo cierre 27/08 y vencimiento 07/09',
    f(r.proximoCierre) === '27/08/2026' && f(r.proximoVencimiento) === '07/09/2026');

  console.log('\n=== MOVIMIENTOS ===');
  console.log(`   ${'FECHA'.padEnd(11)} ${'SECCIÓN'.padEnd(10)} ${'TITULAR'.padEnd(19)} ${'DESCRIPCIÓN'.padEnd(28)} ${'CUOTA'.padEnd(6)} ${'PESOS'.padStart(12)} ${'USD'.padStart(6)}`);
  r.movimientos.forEach(m => {
    const c = m.cuota ? `${('0' + m.cuota.nro).slice(-2)}/${('0' + m.cuota.total).slice(-2)}` : '';
    console.log(`   ${m.fecha.padEnd(11)} ${m.seccion.padEnd(10)} ${(m.titular || '').padEnd(19)} ${m.descripcion.slice(0, 28).padEnd(28)} ${c.padEnd(6)} ${plata(m.pesos).padStart(12)} ${(m.dolares || 0).toFixed(2).padStart(6)}`);
  });

  console.log('\n=== CONTROL CONTRA LOS TOTALES DEL BANCO ===');
  const suma = {};
  r.movimientos.filter(m => m.seccion === 'consumos').forEach(m => {
    const k = m.titular;
    suma[k] = suma[k] || { p: 0, d: 0 };
    suma[k].p += m.pesos || 0;
    suma[k].d += m.dolares || 0;
  });
  const decl = {};
  r.totalesDeclarados.forEach(t => {
    const k = t.texto.replace(/^TOTAL CONSUMOS DE\s+/, '').replace(/[\d.,\s]+$/, '').trim();
    decl[k] = decl[k] || { p: 0, d: 0, visto: new Set() };
    const firma = `${t.pesos}|${t.dolares}`;
    if (!decl[k].visto.has(firma)) { decl[k].visto.add(firma); decl[k].p += t.pesos || 0; decl[k].d += t.dolares || 0; }
  });
  Object.keys(suma).forEach(k => {
    const clave = Object.keys(decl).find(d => d.toUpperCase().indexOf(k.toUpperCase().split(' ')[0]) >= 0);
    const d = decl[clave] || { p: 0, d: 0 };
    console.log(`   ${k.padEnd(20)} extraído ${plata(suma[k].p).padStart(12)} / ${suma[k].d.toFixed(2).padStart(6)}   banco ${plata(d.p).padStart(12)} / ${d.d.toFixed(2).padStart(6)}`);
    chequear(`cuadra ${k}`, Math.abs(suma[k].p - d.p) < 0.01 && Math.abs(suma[k].d - d.d) < 0.01);
  });

  console.log('\n=== CUOTAS: MI PROYECCIÓN CONTRA LA TABLA DEL BANCO ===');
  console.log(`   ${'CIERRE'.padEnd(9)} ${'BANCO'.padStart(13)}   ${'PAGO'.padEnd(9)} ${'CALCULADO'.padStart(13)}`);
  r.control.filas.forEach(x => {
    console.log(`   ${x.cierre.padEnd(9)} ${plata(x.banco).padStart(13)}   ${x.mesPago.padEnd(9)} ${plata(x.calculado).padStart(13)}   ${x.ok ? '✓' : '✗'}`);
  });
  chequear('la proyección cuadra con el banco al peso', r.control.ok);

  console.log('\n=== DETALLE DE LO QUE VIENE ===');
  r.proyeccion.forEach(p => p.detalle.forEach(d => {
    console.log(`   ${p.fecha}  ${d.comercio.slice(0, 24).padEnd(24)} cuota ${d.cuota.padEnd(5)} ${plata(d.monto).padStart(12)}`);
  }));

  console.log('\n=== DETALLES FINOS ===');
  const cuotas = r.movimientos.filter(m => m.cuota);
  chequear('encuentra las 3 cuotas del resumen', cuotas.length === 3,
    cuotas.map(c => `${c.descripcion.slice(0, 12)} ${c.cuota.nro}/${c.cuota.total}`).join(' | '));
  const dolares = r.movimientos.filter(m => m.dolares && m.seccion === 'consumos');
  chequear('separa los 4 consumos en dólares', dolares.length === 4,
    dolares.map(d => d.dolares).join(' '));
  chequear('los dólares no se cuelan en la columna de pesos',
    dolares.every(d => !d.pesos), dolares.map(d => d.pesos).join(' '));
  chequear('no mete el USD dentro del comercio',
    dolares.every(d => !/USD/i.test(d.descripcion)),
    dolares.map(d => d.descripcion).join(' | '));
  const dbrg = r.movimientos.find(m => /DB\.RG/.test(m.descripcion));
  chequear('no confunde el número de la percepción con el importe',
    dbrg && dbrg.pesos === 14051.92, dbrg && `${dbrg.descripcion} -> ${plata(dbrg.pesos)}`);
  const pagos = r.movimientos.filter(m => m.seccion === 'pagos');
  chequear('separa los pagos del resumen anterior (no son gastos)', pagos.length === 2,
    pagos.map(p => plata(p.pesos || p.dolares)).join(' | '));
  const noe = r.movimientos.filter(m => m.titular && /Noelia/i.test(m.titular));
  chequear('marca los consumos de Noelia con su titular', noe.length === 2,
    noe.map(m => m.descripcion.slice(0, 18)).join(' | '));

  console.log(fallas ? `\n❌ ${fallas} fallas` : '\n✅ todo en verde');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
