/**
 * Prueba de comportamiento de la app en un iPhone simulado, contra el backend
 * real. Acá viven las cosas que no se ven en una captura: que la lista se
 * ponga al día sola cuando volvés a la app, y que el gesto de tirar hacia
 * abajo dispare una consulta nueva.
 *
 * El caso que motivó todo: cargás un gasto por Telegram con la app abierta
 * atrás, parado en Últimos, y al volver la lista te seguía mostrando lo viejo.
 */
const { chromium } = require('playwright');

let fallas = 0;
function chequear(titulo, ok, detalle) {
  console.log((ok ? '✓ ' : '✗ ') + titulo + (detalle ? '  ' + detalle : ''));
  if (!ok) fallas++;
}

// mete un movimiento por la API, como haría el bot de Telegram
function cargarComoTelegram(detalle) {
  return fetch('http://localhost:8099/', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ k: 'demo', op: 'agregar', monto: 85000, categoria: 'Luz',
                           detalle: detalle, origen: 'telegram' })
  }).then(r => r.json());
}

// gesto de arrastre hacia abajo, con eventos táctiles de verdad
const ARRASTRAR = ({ sel, hasta }) => {
  const el = document.querySelector(sel);
  const toque = (tipo, y, lista) => {
    const t = new Touch({ identifier: 1, target: el, clientX: 190, clientY: y });
    el.dispatchEvent(new TouchEvent(tipo, {
      touches: lista ? [t] : [], changedTouches: [t], bubbles: true, cancelable: true
    }));
  };
  toque('touchstart', 120, true);
  for (let y = 130; y <= 120 + hasta; y += 20) toque('touchmove', y, true);
  toque('touchend', 120 + hasta, false);
};

(async () => {
  const b = await chromium.launch(require('./navegador.js'));
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
    isMobile: true, hasTouch: true, locale: 'es-AR'
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
  await p.waitForTimeout(1500);

  console.log('\n=== VERSIÓN A LA VISTA ===');
  await p.click('.tab[data-p="mas"]');
  await p.waitForTimeout(500);
  const ver = await p.evaluate(() => {
    const t = [...document.querySelectorAll('#mas .tile')]
      .find(x => /App instalada/i.test(x.querySelector('.lab').textContent));
    return { enPantalla: t ? t.querySelector('.val').textContent : '', constante: window.APP_VER };
  });
  chequear('Más muestra qué versión está corriendo',
    !!ver.enPantalla && ver.enPantalla === ver.constante, ver.enPantalla);
  chequear('hay botón para forzar la actualización',
    await p.locator('text=Buscar actualización').count() === 1);

  console.log('\n=== VOLVER A LA APP PONE LA LISTA AL DÍA ===');
  await p.click('.tab[data-p="ultimos"]');
  await p.waitForTimeout(1200);
  const antes = await p.evaluate(() => document.querySelectorAll('#lista .item').length);

  // el gasto entra por Telegram mientras seguimos parados en Últimos
  const alta = await cargarComoTelegram('la luz de agosto');
  chequear('el bot pudo cargar el gasto', alta.ok === true, JSON.stringify(alta).slice(0, 80));

  const sinRefrescar = await p.evaluate(() =>
    [...document.querySelectorAll('#lista .t1')].some(x => x.textContent === 'la luz de agosto'));
  chequear('sin refrescar todavía no aparece (era el bug)', sinRefrescar === false);

  // la app se va al fondo y vuelve
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(1500);
  const trasVolver = await p.evaluate(() => ({
    esta: [...document.querySelectorAll('#lista .t1')].some(x => x.textContent === 'la luz de agosto'),
    primero: document.querySelector('#lista .item .t1').textContent,
    filas: document.querySelectorAll('#lista .item').length
  }));
  chequear('al volver a la app aparece solo', trasVolver.esta,
    `${antes} → ${trasVolver.filas} filas`);
  chequear('y queda arriba de todo, bajo Hoy', trasVolver.primero === 'la luz de agosto',
    trasVolver.primero);

  console.log('\n=== TIRAR HACIA ABAJO ===');
  const alta2 = await cargarComoTelegram('gas de agosto');
  chequear('entra un segundo gasto por el bot', alta2.ok === true);
  await p.evaluate(ARRASTRAR, { sel: '#lista', hasta: 140 });
  await p.waitForTimeout(1600);
  const trasTirar = await p.evaluate(() => ({
    esta: [...document.querySelectorAll('#lista .t1')].some(x => x.textContent === 'gas de agosto'),
    ruedaEscondida: getComputedStyle(document.getElementById('refresco')).opacity === '0'
  }));
  chequear('tirando hacia abajo se actualiza', trasTirar.esta);
  chequear('la rueda se guarda al terminar', trasTirar.ruedaEscondida);

  // un tirón corto no tiene que disparar nada
  const alta3 = await cargarComoTelegram('internet de agosto');
  chequear('entra un tercero por el bot', alta3.ok === true);
  await p.evaluate(ARRASTRAR, { sel: '#lista', hasta: 30 });
  await p.waitForTimeout(1200);
  const tironCorto = await p.evaluate(() =>
    [...document.querySelectorAll('#lista .t1')].some(x => x.textContent === 'internet de agosto'));
  chequear('un tirón corto NO dispara la consulta', tironCorto === false);

  console.log('\n=== NO ROMPE EL SCROLL NI LA PANTALLA MES ===');
  await p.evaluate(() => { document.getElementById('lista').scrollTop = 300; });
  await p.waitForTimeout(200);
  await p.evaluate(ARRASTRAR, { sel: '#lista', hasta: 140 });
  await p.waitForTimeout(700);
  const conScroll = await p.evaluate(() => document.getElementById('lista').scrollTop);
  chequear('con la lista scrolleada el gesto no se activa', conScroll > 0, 'scrollTop=' + conScroll);

  await p.click('.tab[data-p="mes"]');
  await p.waitForTimeout(1400);
  const mesAntes = await p.evaluate(() => document.querySelector('.hero .val').textContent);
  await cargarComoTelegram('otra luz');
  await p.evaluate(ARRASTRAR, { sel: '#mes', hasta: 140 });
  await p.waitForTimeout(1600);
  const mesDespues = await p.evaluate(() => document.querySelector('.hero .val').textContent);
  chequear('en Mes el gesto también recalcula', mesAntes !== mesDespues,
    `${mesAntes} → ${mesDespues}`);

  /* ------------------------------------------------------------------------
   * El gasto triplicado. Fa cargó "gimnasio" desde la app y quedó tres veces.
   * Causa: guardar() encola ante cualquier fallo —incluido un timeout, que NO
   * significa que no se haya guardado— y vaciarCola() no tenía traba de
   * reentrada, así que dos llamadas superpuestas mandaban la misma cola dos
   * veces. En la v11 empecé a vaciar la cola al volver a la app, y el iPhone
   * dispara ese evento con facilidad. De ahí las tres copias.
   * --------------------------------------------------------------------- */
  console.log('\n=== UN GASTO ENCOLADO NO SE DUPLICA ===');
  const contar = (detalle) => p.evaluate(async (d) => {
    const r = await api({ op: 'listar', limite: 200 });
    return r.movimientos.filter(m => m.detalle === d).length;
  }, detalle => detalle);

  const marca = 'gimnasio de prueba';
  await p.evaluate((d) => {
    localStorage.setItem('g.cola', JSON.stringify([{
      op: 'agregar', id: 'testcola0001', monto: 33000, moneda: 'ARS',
      fecha: hoyISO(), categoria: 'Gimnasio', detalle: d, origen: 'web'
    }]));
  }, marca);

  // tres vaciados encimados, como los que dispara iOS al volver a la app
  await p.evaluate(() => { vaciarCola(); vaciarCola(); vaciarCola(); });
  await p.waitForTimeout(2500);
  const copias = await p.evaluate(async (d) => {
    const r = await api({ op: 'listar', limite: 200 });
    return r.movimientos.filter(m => m.detalle === d).length;
  }, marca);
  chequear('tres vaciados simultáneos dejan UNA sola fila', copias === 1, copias + ' copias');

  const colaFinal = await p.evaluate(() => JSON.parse(localStorage.getItem('g.cola') || '[]').length);
  chequear('y la cola queda vacía', colaFinal === 0, colaFinal + ' pendientes');

  // reintentar a mano tampoco duplica: el id ya está escrito
  await p.evaluate((d) => api({
    op: 'agregar', id: 'testcola0001', monto: 33000, moneda: 'ARS',
    fecha: hoyISO(), categoria: 'Gimnasio', detalle: d, origen: 'web'
  }), marca);
  await p.waitForTimeout(1200);
  const copias2 = await p.evaluate(async (d) => {
    const r = await api({ op: 'listar', limite: 200 });
    return r.movimientos.filter(m => m.detalle === d).length;
  }, marca);
  chequear('reintentar el mismo id tampoco agrega otra', copias2 === 1, copias2 + ' copias');

  console.log('\n=== LA PANTALLA MES MUESTRA EL DISPONIBLE ===');
  await p.click('.tab[data-p="ultimos"]');
  await p.waitForTimeout(300);
  await p.click('.tab[data-p="mes"]');
  await p.waitForTimeout(1600);
  const mes = await p.evaluate(() => ({
    hero: document.querySelector('.hero .lab').textContent,
    recuadros: [...document.querySelectorAll('.tiles:not(.tres) .tile')].map(t => ({
      lab: t.querySelector('.lab').textContent,
      val: t.querySelector('.val').textContent,
      cortado: t.querySelector('.val').scrollWidth > t.querySelector('.val').clientWidth + 1
    })),
    hayAhorro: /Ahorro/.test(document.getElementById('mes').textContent),
    aviso: document.querySelector('.aviso') ? document.querySelector('.aviso').textContent : '',
    titulos: [...document.querySelectorAll('#mes .titulo')].map(t => t.textContent),
    desborde: document.documentElement.scrollWidth > 390
  }));
  chequear('arriba sigue el gasto del mes', mes.hero === 'Gasto del mes', mes.hero);
  chequear('aparece Disponible', mes.recuadros.some(t => t.lab === 'Disponible'),
    mes.recuadros.map(t => t.lab).join(' | '));
  chequear('ya no aparece Ahorro como recuadro',
    !mes.recuadros.some(t => t.lab === 'Ahorro'));
  chequear('los números entran en los recuadros', !mes.recuadros.some(t => t.cortado));
  chequear('las personas van separadas en dos bloques',
    mes.titulos.some(t => /Cuentas con personas/.test(t)) ||
    mes.titulos.some(t => /Gastado en/.test(t)), mes.titulos.join(' | '));
  chequear('no desborda a lo ancho', !mes.desborde);
  console.log('   recuadros:', mes.recuadros.map(t => t.lab + '=' + t.val).join(' | '));
  console.log('   secciones:', mes.titulos.join(' | '));
  if (mes.aviso) console.log('   aviso    :', mes.aviso.trim());
  await p.screenshot({ path: 'shots/16-mes-disponible.png' });

  await b.close();
  console.log(errores.length ? '\nERRORES:\n' + errores.join('\n') : '\nSin errores de consola ✅');
  console.log(fallas ? `\n❌ ${fallas} fallas` : '\n✅ todo en verde');
  process.exit(fallas || errores.length ? 1 : 0);
})();
