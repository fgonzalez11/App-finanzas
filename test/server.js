/**
 * Servidor de prueba de punta a punta:
 * sirve la PWA y expone el backend REAL (Apps Script emulado) sobre los
 * 1019 movimientos migrados de Fa.
 */
require('./shim.js');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CLAVE = 'demo';

function despachar(p) {
  if (p.op === 'ping')    return { ok: true, app: 'finanzas', version: 2 };
  if (String(p.k) !== CLAVE) return { ok: false, error: 'no autorizado' };
  switch (p.op) {
    case 'config':  return opConfig_();
    case 'listar':  return { ok: true, movimientos: listarMovimientos_(Number(p.limite) || 60) };
    case 'resumen': return { ok: true, resumen: resumenMes_(), serie: serieMensual_(12) };
    case 'agregar': return opAgregar_(p);
    case 'editar':  return { ok: actualizarMovimiento_(p.id, p) };
    case 'borrar':  return { ok: borrarMovimiento_(p.id) };
    case 'usoCategorias':   return opUsoCategorias_();
    case 'unificar':        return unificarCategorias_(p.origen, p.destino);
    case 'borrarCategoria': return borrarCategoria_(p.nombre);
    default:        return { ok: false, error: 'op desconocida' };
  }
}

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');

  if (u.pathname === '/api' && req.method === 'GET') {
    const p = Object.fromEntries(u.searchParams);
    let out;
    try { out = despachar(p); } catch (e) { out = { ok: false, error: String(e) }; }
    const body = p.callback ? `${p.callback}(${JSON.stringify(out)})` : JSON.stringify(out);
    res.writeHead(200, { 'Content-Type': p.callback ? 'application/javascript' : 'application/json' });
    return res.end(body);
  }

  if (req.method === 'POST') {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      let j = {}; try { j = JSON.parse(b); } catch (e) {}
      let out;
      try {
        if (String(j.k) !== CLAVE) out = { ok: false, error: 'no autorizado' };
      else if (j.op === 'importar') out = opImportar_(j);
      else if (j.op === 'sugerir') out = opSugerir_(j);
      else if (j.op === 'nuevaCategoria') out = opNuevaCategoria_(j);
      else if (j.op === 'unificar') out = unificarCategorias_(j.origen, j.destino);
      else if (j.op === 'borrarCategoria') out = borrarCategoria_(j.nombre);
      else out = opAgregar_(j);
      } catch (e) { out = { ok: false, error: String(e) }; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(out));
    });
    return;
  }

  // DIST=1 prueba el archivo único que se sube a GitHub Pages
  const dir = process.env.DIST === '1' ? 'dist' : 'pwa';
  if (/\.js$/.test(u.pathname)) {
    const f = path.join(__dirname, '..', dir, u.pathname.slice(1));
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(fs.readFileSync(f));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(fs.readFileSync(path.join(__dirname, '..', dir, 'index.html')));
}).listen(8099, () => console.log('http://localhost:8099'));
