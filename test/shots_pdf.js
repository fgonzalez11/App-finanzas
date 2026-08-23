/*
 * Flujo completo del lector en el navegador: elegir el PDF real, revisarlo
 * y confirmar. pdf.js se sirve desde node_modules (en el teléfono viene del CDN).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const VENDOR = path.join(__dirname, '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build');

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'es-AR', serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE: ' + m.text()); });

  // el CDN no se alcanza desde el sandbox: servimos la copia local
  await p.route(/cdnjs\.cloudflare\.com/, route => {
    const url = route.request().url();
    const archivo = /worker/.test(url) ? 'pdf.worker.js' : 'pdf.js';
    route.fulfill({
      status: 200, contentType: 'application/javascript',
      body: fs.readFileSync(path.join(VENDOR, archivo), 'utf8')
    });
  });

  await p.goto('http://localhost:8099/');
  await p.evaluate(() => {
    localStorage.setItem('g.url', 'http://localhost:8099/api');
    localStorage.setItem('g.key', 'demo');
  });
  await p.reload();
  await p.waitForTimeout(1400);

  await p.click('.tab[data-p="mas"]');
  await p.waitForTimeout(400);
  await p.click('text=Importar resumen de tarjeta');
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/p1-elegir.png' });

  await p.setInputFiles('#impFile', path.join(__dirname, '..', 'pdf', 'resumen.pdf'));
  await p.waitForSelector('#impSalida .item', { timeout: 30000 });
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'shots/p2-revision.png' });

  const leido = await p.evaluate(() => ({
    titulo: document.querySelector('#impSalida .tile .lab').textContent,
    total: document.querySelector('#impSalida .tile .val').textContent,
    pie: document.querySelector('#impSalida .tile .pie').textContent,
    control: (document.querySelector('#impSalida .ok, #impSalida .err') || {}).textContent || '',
    filas: document.querySelectorAll('#impSalida .item').length,
    sinCategoria: document.querySelectorAll('#impSalida .item .t2 b').length,
    titulares: [...document.querySelectorAll('#impSalida .item .t2')]
      .map(x => x.textContent).filter(t => /Noelia/.test(t)).length,
    boton: document.querySelector('#impSalida .btn').textContent
  }));

  // bajamos hasta las cuotas futuras
  await p.evaluate(() => {
    const s = document.getElementById('sheet');
    s.scrollTop = s.scrollHeight;
  });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/p3-cuotas.png' });

  // --- crear una categoría nueva desde la revisión
  const iSinCat = await p.evaluate(() =>
    lineasImportables(RES).findIndex(l => !l.categoria));
  await p.evaluate(i => ponerCategoria(i, '__nueva__'), iSinCat);
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/p4-nueva-cat.png' });
  await p.fill('#ncNombre', 'Delivery');
  await p.fill('#ncEmoji', '🛵');
  await p.click('text=Crear');
  await p.waitForTimeout(1200);
  const creada = await p.evaluate(i => ({
    categoria: lineasImportables(RES)[i].categoria,
    enLista: ST.cats.some(c => c.nombre === 'Delivery'),
    alfabetico: (() => {
      const n = catsAlfabeticas().map(c => c.nombre);
      return JSON.stringify(n) === JSON.stringify(n.slice().sort((a, b) => a.localeCompare(b, 'es')));
    })()
  }), iSinCat);
  await p.screenshot({ path: 'shots/p5-creada.png' });

  // completamos el resto y confirmamos
  await p.evaluate(() => {
    const l = lineasImportables(RES);
    l.forEach((x, i) => { if (!x.categoria) ponerCategoria(i, 'Otros'); });
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/p6-listo.png' });

  await p.click('#impSalida .btn');
  await p.waitForSelector('#impRes .ok, #impRes .err', { timeout: 20000 });
  const resultado = await p.$eval('#impRes', e => e.textContent.trim());

  await b.close();
  console.log('Título    :', leido.titulo);
  console.log('Total     :', leido.total);
  console.log('Pie       :', leido.pie);
  console.log('Control   :', leido.control.trim());
  console.log('Filas     :', leido.filas, '| sin categoría:', leido.sinCategoria,
              '| de Noelia:', leido.titulares);
  console.log('Botón     :', leido.boton);
  console.log('Cat nueva :', creada.categoria, '| en la lista:', creada.enLista,
              '| desplegable alfabético:', creada.alfabetico);
  console.log('Resultado :', resultado);
  console.log(errores.length ? '\nERRORES:\n' + errores.join('\n') : '\nSin errores de consola ✅');
})();
