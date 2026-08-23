const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', '02_Parser.gs'), 'utf8');
const ctx = {};
new Function('MONEDA_DEFAULT', 'exports', src + `
Object.assign(exports, { parsearGasto_, aNumero_, extraerMonto_, extraerFecha_, extraerMedio_, categorizar_, limpiarDescripcion_, normalizar_ });
`)('ARS', ctx);

const CATEGORIAS = [
  { nombre: 'Supermercado', palabras: 'super, supermercado, coto, dia, carrefour, jumbo, chino, almacen, verduleria, carniceria, fiambreria, panaderia'.split(',').map(s => s.trim()) },
  { nombre: 'Comida fuera', palabras: 'resto, restaurante, bar, cafe, café, almuerzo, cena, delivery, pedidos ya, rappi, mcdonalds, helado, cerveza, pizza'.split(',').map(s => s.trim()) },
  { nombre: 'Transporte', palabras: 'nafta, combustible, ypf, shell, axion, sube, colectivo, subte, tren, taxi, uber, cabify, didi, peaje, estacionamiento, cochera, gnc'.split(',').map(s => s.trim()) },
  { nombre: 'Vivienda', palabras: 'alquiler, expensas, hipoteca, abl, inmobiliario, mantenimiento, ferreteria, mudanza'.split(',').map(s => s.trim()) },
  { nombre: 'Servicios', palabras: 'luz, edenor, edesur, gas, metrogas, agua, aysa, internet, fibertel, telecentro, celular, personal, movistar, claro, cable'.split(',').map(s => s.trim()) },
  { nombre: 'Salud', palabras: 'farmacia, remedio, medico, obra social, prepaga, osde, dentista'.split(',').map(s => s.trim()) },
  { nombre: 'Suscripciones', palabras: 'netflix, spotify, disney, hbo, max, youtube, prime, apple, icloud, chatgpt, claude, gimnasio, gym'.split(',').map(s => s.trim()) },
  { nombre: 'Compras', palabras: 'ropa, zapatillas, mercadolibre, amazon, regalo, libreria, libro'.split(',').map(s => s.trim()) },
  { nombre: 'Ocio', palabras: 'cine, teatro, recital, salida, viaje, hotel, cancha'.split(',').map(s => s.trim()) },
  { nombre: 'Impuestos', palabras: 'monotributo, afip, arca, impuesto'.split(',').map(s => s.trim()) },
];

const HOY = new Date(2026, 7, 17, 12, 0, 0); // lunes 17/08/2026

const fmt = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

const casos = [
  // texto,                                  monto,    categoria,       fecha,        medio,      moneda
  ['2500 nafta',                             2500,     'Transporte',    '17/08/2026', '',         'ARS'],
  ['nafta 2500',                             2500,     'Transporte',    '17/08/2026', '',         'ARS'],
  ['$2.500,50 super coto con debito',        2500.5,   'Supermercado',  '17/08/2026', 'Débito',   'ARS'],
  ['ayer 1200 cafe',                         1200,     'Comida fuera',  '16/08/2026', '',         'ARS'],
  ['anteayer 800 sube',                      800,      'Transporte',    '15/08/2026', '',         'ARS'],
  ['12/08 15k alquiler',                     15000,    'Vivienda',      '12/08/2026', '',         'ARS'],
  ['u$s 40 suscripcion claude',              40,       'Suscripciones', '17/08/2026', '',         'USD'],
  ['3 lucas cena con flor',                  3000,     'Comida fuera',  '17/08/2026', '',         'ARS'],
  ['gaste 45000 en el super',                45000,    'Supermercado',  '17/08/2026', '',         'ARS'],
  ['pague 89.500 de expensas por transferencia', 89500,'Vivienda',      '17/08/2026', 'Transferencia', 'ARS'],
  ['1,5k uber',                              1500,     'Transporte',    '17/08/2026', '',         'ARS'],
  ['netflix 7999 con tarjeta',               7999,     'Suscripciones', '17/08/2026', 'Crédito',  'ARS'],
  ['el viernes 12000 cine',                  12000,    'Ocio',          '14/08/2026', '',         'ARS'],
  ['farmacia 6.300',                         6300,     'Salud',         '17/08/2026', '',         'ARS'],
  ['200000 monotributo',                     200000,   'Impuestos',     '17/08/2026', '',         'ARS'],
  ['almuerzo 9500 mercado pago',             9500,     'Comida fuera',  '17/08/2026', 'Mercado Pago', 'ARS'],
  ['1 palo auto',                            1000000,  '',              '17/08/2026', '',         'ARS'],
  ['hoy 350 kiosco efectivo',                350,      '',              '17/08/2026', 'Efectivo', 'ARS'],
  ['edenor 34500',                           34500,    'Servicios',     '17/08/2026', '',         'ARS'],
  // "cuotas" ya no implica crédito: los planes que se cargan a mano son
  // justamente los que NO van con tarjeta. Hay que nombrarla.
  ['zapatillas 120000 en 6 cuotas',          120000,   'Compras',       '17/08/2026', '',         'ARS'],
  ['zapatillas 120000 en 6 cuotas con tarjeta', 120000,'Compras',       '17/08/2026', 'Crédito',  'ARS'],
  // Fechas escritas con el mes en palabras. Sin esta regla, "12 de agosto
  // nafta 2500" tomaba el 12 como monto y anotaba un gasto de $12.
  ['12 de agosto nafta 2500',                2500,     'Transporte',    '12/08/2026', '',         'ARS'],
  ['12 ago nafta 2500',                      2500,     'Transporte',    '12/08/2026', '',         'ARS'],
  ['el 12 nafta 2500',                       2500,     'Transporte',    '12/08/2026', '',         'ARS'],
  ['el 25 super 45000',                      45000,    'Supermercado',  '25/07/2026', '',         'ARS'],
  ['3 de septiembre 8000 cine',              8000,     'Ocio',          '03/09/2025', '',         'ARS'],
  ['15 de enero 2026 seguro 715500',         715500,   '',              '15/01/2026', '',         'ARS'],
];

let ok = 0, fail = 0;
const fallas = [];

for (const [texto, monto, cat, fecha, medio, moneda] of casos) {
  const r = ctx.parsearGasto_(texto, { categorias: CATEGORIAS, hoy: HOY, monedaDefault: 'ARS' });
  const errs = [];
  if (!r.ok) errs.push('no parseó: ' + r.error);
  else {
    if (r.monto !== monto) errs.push(`monto ${r.monto} != ${monto}`);
    if (r.categoria !== cat) errs.push(`cat "${r.categoria}" != "${cat}"`);
    if (fmt(r.fecha) !== fecha) errs.push(`fecha ${fmt(r.fecha)} != ${fecha}`);
    if (r.medio !== medio) errs.push(`medio "${r.medio}" != "${medio}"`);
    if (r.moneda !== moneda) errs.push(`moneda ${r.moneda} != ${moneda}`);
  }
  if (errs.length) { fail++; fallas.push({ texto, errs, r }); } else ok++;
}

console.log(`\n${ok} OK / ${fail} fallan de ${casos.length}\n`);
for (const f of fallas) {
  console.log(`✗ "${f.texto}"`);
  f.errs.forEach(e => console.log(`    ${e}`));
  console.log(`    -> monto=${f.r.monto} cat="${f.r.categoria}" desc="${f.r.descripcion}" medio="${f.r.medio}" fecha=${f.r.fecha && fmt(f.r.fecha)}`);
}

// Chequeo de aNumero_
console.log('\n--- aNumero_ ---');
[['2.500', 2500], ['2.500,50', 2500.5], ['1,500', 1500], ['2,50', 2.5], ['1.5', 1.5],
 ['1.234.567', 1234567], ['1,234,567.89', 1234567.89], ['999', 999], ['0,99', 0.99]]
 .forEach(([s, esp]) => {
   const v = ctx.aNumero_(s);
   console.log(`${v === esp ? '✓' : '✗'} ${s} -> ${v} (esperado ${esp})`);
 });
