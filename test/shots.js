const { chromium } = require('playwright');

(async () => {
  const b = await chromium.launch(require('./navegador.js'));
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'es-AR',
  });
  const p = await ctx.newPage();
  const errores = [];
  p.on('pageerror', e => errores.push('PAGEERROR: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errores.push('CONSOLE: ' + m.text()); });

  await p.goto('http://localhost:8099/');
  await p.evaluate(() => {
    localStorage.setItem('g.url', 'http://localhost:8099/api');
    localStorage.setItem('g.key', 'demo');
  });
  await p.reload();
  await p.waitForTimeout(1400);

  for (const k of ['4', '5', '2', '3', '0', ',', '5', '0']) await p.click(`.tecla[data-k="${k}"]`);
  await p.fill('#desc', 'la anonima');
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/1-cargar.png' });

  await p.click('#btnVerTodas');
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/2-cats.png' });
  await p.click('#btnVerTodas');
  await p.waitForTimeout(250);

  await p.click('#chSigno');
  await p.waitForTimeout(300);
  await p.screenshot({ path: 'shots/3-ingreso.png' });
  await p.click('#chSigno');
  await p.waitForTimeout(200);

  await p.click('.cat[data-c="Supermercados"]');
  await p.waitForTimeout(1000);
  await p.screenshot({ path: 'shots/4-guardado.png' });

  await p.click('.tab[data-p="ultimos"]');
  await p.waitForTimeout(1100);
  await p.screenshot({ path: 'shots/5-ultimos.png' });

  await p.click('.item >> nth=0');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/6-editar.png' });
  await p.evaluate(() => cerrarSheet());
  await p.waitForTimeout(300);

  await p.click('.tab[data-p="mes"]');
  await p.waitForTimeout(1200);
  await p.screenshot({ path: 'shots/7-mes.png' });
  await p.evaluate(() => { document.getElementById('mes').scrollTop = 430; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/8-mes-b.png' });
  await p.evaluate(() => { document.getElementById('mes').scrollTop = 960; });
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/9-mes-c.png' });

  const leido = await p.evaluate(() => {
    const leer = t => ({
      lab: t.querySelector('.lab').textContent,
      val: t.querySelector('.val').textContent,
      pie: t.querySelector('.pie') ? t.querySelector('.pie').textContent : '',
      // ¿el número entra en el recuadro, o lo corta el overflow:hidden?
      cortado: t.querySelector('.val').scrollWidth > t.querySelector('.val').clientWidth + 1
    });
    return {
      heroLab: document.querySelector('.hero .lab').textContent,
      heroVal: document.querySelector('.hero .val').textContent,
      pie: document.querySelector('.hero .pie').textContent,
      tipos: [...document.querySelectorAll('.tiles.tres .tile')].map(leer),
      tiles: [...document.querySelectorAll('.tiles:not(.tres) .tile')].map(leer),
      personas: [...document.querySelectorAll('.persona')].map(x =>
        x.querySelector('.n').textContent + ' ' + x.querySelector('.s').textContent),
      barras: [...document.querySelectorAll('.barra')].length,
      mesesGrafico: [...document.querySelectorAll('.evoMes')].length,
      desbordeH: document.documentElement.scrollWidth > 390
    };
  });

  await p.click('.tab[data-p="mas"]');
  await p.waitForTimeout(500);
  await p.screenshot({ path: 'shots/10-mas.png' });

  /* ---------------- depurar categorías ---------------- */
  p.on('dialog', d => d.accept());
  await p.click('text=Depurar categorías');
  await p.waitForTimeout(1600);
  await p.screenshot({ path: 'shots/12-categorias.png' });
  const depurar = await p.evaluate(() => ({
    titulos: [...document.querySelectorAll('#catUso .titulo')].map(t => t.textContent),
    filas: document.querySelectorAll('#catUso .item').length,
    conBorrar: document.querySelectorAll('#catUso .mini').length,
    conUnificar: document.querySelectorAll('#catUso select').length
  }));

  // unificamos de verdad, para probar el camino completo contra el backend real
  const origen = await p.evaluate(() => {
    const s = document.querySelector('#catUso select');
    const fila = s.closest('.item');
    window.__origen = fila.dataset.cat;
    s.value = [...s.options].map(o => o.value).filter(v => v && v !== window.__origen)[0];
    s.dispatchEvent(new Event('change'));
    return window.__origen;
  });
  await p.waitForTimeout(2200);
  const trasUni = await p.evaluate(() => ({
    toast: document.getElementById("toastTxt").textContent,
    sigueEnLista: [...document.querySelectorAll('#catUso .t1')]
      .some(x => x.textContent === window.__origen),
    filas: document.querySelectorAll('#catUso .item').length
  }));
  await p.screenshot({ path: 'shots/13-categorias-b.png' });
  await p.evaluate(() => cerrarSheet());
  await p.waitForTimeout(400);
  await p.click('.tab[data-p="mas"]');
  await p.waitForTimeout(400);

  await p.click('text=Importar resumen de tarjeta');
  await p.waitForTimeout(400);
  // el CSV quedó detrás de un desplegable: el camino principal ahora es el PDF
  await p.evaluate(() => { const d = document.querySelector('#sheet details'); if (d) d.open = true; });
  await p.waitForTimeout(250);
  await p.fill('#impTexto', [
    'Fecha;Descripcion;Importe',
    '12/07/2026;LA ANONIMA SUC 12;45.230,50',
    '13/07/2026;AXION ENERGY PALERMO;32.000,00',
    '14/07/2026;DEXTER SHOP;89.000,00',
    '15/07/2026;PAGO TARJETA;-120.000,00',
    '16/07/2026;CLARO ARGENTINA;100.308,00'
  ].join('\n'));
  await p.click('text=Analizar');
  await p.waitForTimeout(400);
  await p.click('text=Ver vista previa');
  await p.waitForTimeout(400);
  await p.screenshot({ path: 'shots/11-importar.png' });
  const resumenImp = await p.$eval('#impPrev .nota', e => e.textContent.trim());

  await b.close();
  const linea = t => `${t.lab}=${t.val}${t.pie ? ' (' + t.pie + ')' : ''}${t.cortado ? ' ✂️CORTADO' : ''}`;
  console.log('--- pantalla Mes ---');
  console.log('Titular            :', leido.heroLab, leido.heroVal);
  console.log('Pie                :', leido.pie);
  console.log('Reparto del gasto  :', leido.tipos.map(linea).join(' | '));
  console.log('Recuadros          :', leido.tiles.map(linea).join(' | '));
  console.log('Personas           :', leido.personas.join(' | '));
  console.log('Barras / meses     :', leido.barras, '/', leido.mesesGrafico);
  console.log('Números cortados   :', leido.tipos.concat(leido.tiles).some(t => t.cortado) ? 'SÍ ✗' : 'no ✓');
  console.log('Desborde horizontal:', leido.desbordeH ? 'SÍ ✗' : 'no ✓');
  console.log('--- depurar categorías ---');
  console.log('Secciones          :', depurar.titulos.join(' | '));
  console.log('Filas / borrar / unificar:', depurar.filas, '/', depurar.conBorrar, '/', depurar.conUnificar);
  console.log('Unificada          :', origen, '→', trasUni.toast.trim());
  console.log('Salió de la lista  :', trasUni.sigueEnLista ? 'NO ✗' : 'sí ✓',
    `(${depurar.filas} → ${trasUni.filas})`);
  console.log('--- importar ---');
  console.log('Import             :', resumenImp);
  console.log(errores.length ? '\nERRORES:\n' + errores.join('\n') : '\nSin errores de consola ✅');
})();
