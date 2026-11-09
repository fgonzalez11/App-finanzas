/**
 * Genera test/datos.json con datos INVENTADOS, para poder correr las pruebas y
 * el emulador en una máquina que no tiene los datos reales de Fa (que viven en
 * su Google Sheet y nunca se suben al repo).
 *
 * Las fechas se arman respecto de HOY, así los meses siempre incluyen el mes en
 * curso (regla: no escribir fechas fijas en las pruebas).
 * Uso: node test/generar_datos_demo.js
 */
const fs = require('fs');
const path = require('path');

const destino = path.join(__dirname, 'datos.json');
if (fs.existsSync(destino) && !process.argv.includes('--forzar')) {
  console.error('Ya existe test/datos.json (puede ser el real). Usá --forzar para pisarlo.');
  process.exit(1);
}

// Generador pseudoaleatorio con semilla fija: las capturas salen iguales cada vez
let s = 12345;
const rnd = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const entre = (a, b) => Math.round(a + rnd() * (b - a));
const redondear = n => Math.round(n / 100) * 100;

const TIPOS = [
  ['Tipo', 'Orden', 'Naturaleza', 'CuentaEnGasto', 'Emoji'],
  ['00. Saldo inicial', 0, 'Movimiento', 'NO', '🏁'],
  ['01. Cobros', 1, 'Ingreso', 'NO', '💰'],
  ['02. Pagos esenciales', 2, 'Gasto', 'SI', '🏠'],
  ['03. Pagos secundarios', 3, 'Gasto', 'SI', '🛍️'],
  ['04. Cuota alimentaria', 4, 'Gasto', 'SI', '👧'],
  ['05. Préstamos', 5, 'Movimiento', 'NO', '🤝'],
];

const CATEGORIAS = [
  ['Categoria', 'TipoPorDefecto', 'Emoji', 'PalabrasClave'],
  ['Sueldo', '01. Cobros', '💵', 'sueldo, haberes, cobro'],
  ['Alquiler', '02. Pagos esenciales', '🏠', 'alquiler, depto'],
  ['Luz', '02. Pagos esenciales', '💡', 'luz, edesur'],
  ['Gas', '02. Pagos esenciales', '🔥', 'gas'],
  ['Internet', '02. Pagos esenciales', '📶', 'internet, wifi'],
  ['Telefonia', '02. Pagos esenciales', '📱', 'celular, telefono'],
  ['Supermercados', '02. Pagos esenciales', '🛒', 'super, anonima, carrefour'],
  ['Nafta', '02. Pagos esenciales', '⛽', 'nafta, ypf'],
  ['Salud', '02. Pagos esenciales', '💊', 'farmacia, medico'],
  ['Gimnasio', '03. Pagos secundarios', '🏋️', 'gimnasio, gym'],
  ['Restaurantes', '03. Pagos secundarios', '🍽️', 'resto, cena, almuerzo'],
  ['Kiosco', '03. Pagos secundarios', '🍫', 'kiosco'],
  ['Regalos', '03. Pagos secundarios', '🎁', 'regalo'],
  ['Ropa y calzado', '03. Pagos secundarios', '👕', 'ropa, zapatillas'],
  ['Streaming', '03. Pagos secundarios', '📺', 'netflix, spotify'],
  ['Otros', '03. Pagos secundarios', '📌', ''],
  ['Cuota alimentaria', '04. Cuota alimentaria', '👧', 'cuota alimentaria'],
  ['Prestamo', '05. Préstamos', '🤝', 'prestamo'],
];

const PERSONAS = [
  ['Persona', 'Vinculo', 'Concepto', 'TipoAsociado'],
  ['Nikin', 'Hermano', '', ''],
  ['Noe', 'Ex pareja', '', ''],
  ['Bastian', 'Hijo', '', ''],
];

const hoy = new Date();
const filas = [];
let n = 0;
function mov(fecha, tipo, cat, importe, detalle, medio, persona, notas) {
  n++;
  const f = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate(), 12, 0, 0);
  filas.push([
    'demo' + String(n).padStart(4, '0'), { __date__: f.toISOString() }, tipo, cat, importe, 'ARS',
    persona || '', detalle || '', medio || 'Débito', 'demo', notas || '',
    { __date__: f.toISOString() }, f.toISOString().slice(0, 10) + '|' + importe + '|' + (detalle || ''),
  ]);
}

const ESS = '02. Pagos esenciales', SEC = '03. Pagos secundarios';
for (let atras = 13; atras >= 0; atras--) {
  const base = new Date(hoy.getFullYear(), hoy.getMonth() - atras, 1);
  const dia = d => new Date(base.getFullYear(), base.getMonth(), d);
  const enCurso = atras === 0;
  const hasta = enCurso ? hoy.getDate() : 28;
  const ok = d => d <= hasta;

  if (atras === 13) mov(dia(1), '00. Saldo inicial', 'Otros', 400000, 'Saldo inicial', 'Efectivo');
  if (ok(1)) mov(dia(1), '01. Cobros', 'Sueldo', 2300000 + atras * -20000, 'Sueldo', 'Transferencia');
  if (ok(3)) mov(dia(3), ESS, 'Alquiler', -650000, '', 'Transferencia');
  if (ok(2)) mov(dia(2), '04. Cuota alimentaria', 'Cuota alimentaria', -380000, 'Cuota', 'Transferencia', 'Noe');
  if (ok(5)) mov(dia(5), ESS, 'Luz', -redondear(entre(28000, 45000)), 'Luz', 'Débito');
  if (ok(8)) mov(dia(8), ESS, 'Gas', -redondear(entre(15000, 32000)), 'Gas', 'Débito');
  if (ok(12)) mov(dia(12), SEC, 'Gimnasio', -45000, 'Gimnasio', 'Débito');
  if (ok(15)) mov(dia(15), ESS, 'Internet', -38000, 'Internet', 'Crédito');
  if (ok(7)) mov(dia(7), ESS, 'Telefonia', -22000, 'Celular', 'Crédito');
  if (ok(10)) mov(dia(10), SEC, 'Streaming', -12000, 'Spotify', 'Crédito');
  // Compras sueltas: en los meses viejos se cargaba más detalle que en los últimos
  const sueltos = atras > 3 ? entre(14, 22) : entre(5, 9);
  for (let i = 0; i < sueltos; i++) {
    const d = entre(1, hasta);
    const r = rnd();
    if (r < 0.35) mov(dia(d), ESS, 'Supermercados', -redondear(entre(15000, 90000)), 'La Anónima', 'Débito');
    else if (r < 0.55) mov(dia(d), ESS, 'Nafta', -redondear(entre(20000, 55000)), 'YPF', 'Crédito');
    else if (r < 0.70) mov(dia(d), SEC, 'Restaurantes', -redondear(entre(12000, 48000)), 'Cena', 'Crédito');
    else if (r < 0.85) mov(dia(d), SEC, 'Kiosco', -redondear(entre(2000, 9000)), 'Kiosco', 'Efectivo');
    else if (r < 0.93) mov(dia(d), ESS, 'Salud', -redondear(entre(8000, 40000)), 'Farmacia', 'Débito');
    else mov(dia(d), SEC, 'Regalos', -redondear(entre(10000, 60000)), 'Regalo Bastian', 'Crédito', 'Bastian');
  }
  // Préstamo que va y viene con Nikin
  if (atras === 4) mov(dia(9), '05. Préstamos', 'Prestamo', -150000, 'Le presté a Nikin', 'Transferencia', 'Nikin');
  if (atras === 2) mov(dia(20), '05. Préstamos', 'Prestamo', 100000, 'Me devolvió Nikin', 'Transferencia', 'Nikin');
}

// Cuotas que ya vienen en el resumen de la tarjeta (próximos meses)
for (let k = 1; k <= 3; k++) {
  const f = new Date(hoy.getFullYear(), hoy.getMonth() + k, 10);
  mov(f, SEC, 'Ropa y calzado', -42000, 'Zapatillas', 'Crédito', '', `cuota:Zapatillas|${k + 1}/6`);
}

const salida = {
  Movimientos: [
    ['ID', 'Fecha', 'Tipo', 'Categoria', 'Importe', 'Moneda', 'Persona', 'Detalle', 'Medio', 'Origen', 'Notas', 'CreadoEn', 'Hash'],
    ...filas,
  ],
  Tipos: TIPOS,
  Categorias: CATEGORIAS,
  Personas: PERSONAS,
};
fs.writeFileSync(destino, JSON.stringify(salida));
console.log(`datos.json de demostración: ${filas.length} movimientos.`);
