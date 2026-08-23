/**
 * Emulador mínimo de Apps Script para poder correr el backend en Node
 * contra los datos reales migrados.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'datos.json'), 'utf8'));

const rehidratar = v =>
  (v && typeof v === 'object' && v.__date__) ? new Date(v.__date__) : v;

/* Contadores, para vigilar cuánto trabajo hace el bot antes de contestar:
   si tarda, Telegram reintenta y se duplican los gastos. */
const stats = { lecturas: 0, celdas: 0, fetch: [] };
function resetStats() { stats.lecturas = 0; stats.celdas = 0; stats.fetch = []; }

class Rango {
  constructor(hoja, fila, col, nFilas, nCols) {
    Object.assign(this, { hoja, fila, col, nFilas, nCols });
  }
  getValues() {
    stats.lecturas++;
    stats.celdas += this.nFilas * this.nCols;
    const out = [];
    for (let r = 0; r < this.nFilas; r++) {
      const fila = [];
      for (let c = 0; c < this.nCols; c++) {
        const f = this.hoja.datos[this.fila - 1 + r] || [];
        fila.push(f[this.col - 1 + c] === undefined ? '' : f[this.col - 1 + c]);
      }
      out.push(fila);
    }
    return out;
  }
  setValues(vals) {
    vals.forEach((fila, r) => fila.forEach((v, c) => {
      const fi = this.fila - 1 + r;
      while (this.hoja.datos.length <= fi) this.hoja.datos.push([]);
      this.hoja.datos[fi][this.col - 1 + c] = v;
    }));
    return this;
  }
  setValue(v) { return this.setValues([[v]]); }
  getValue() { return this.getValues()[0][0]; }
  setFormula() { return this; } setFormulas() { return this; }
  setNumberFormat() { return this; } setFontWeight() { return this; }
  setBackground() { return this; } setFontColor() { return this; }
  setVerticalAlignment() { return this; } setDataValidation() { return this; }
  setWrap() { return this; } setFontSize() { return this; }
  applyRowBanding() { return this; }
}

class Hoja {
  constructor(nombre, datos) { this.nombre = nombre; this.datos = datos.map(f => f.map(rehidratar)); }
  getName() { return this.nombre; }
  getLastRow() {
    for (let i = this.datos.length - 1; i >= 0; i--) {
      if (this.datos[i].some(v => v !== '' && v !== null && v !== undefined)) return i + 1;
    }
    return 0;
  }
  getMaxRows() { return Math.max(this.datos.length, 1000); }
  getLastColumn() { return Math.max(...this.datos.map(f => f.length), 0); }
  getRange(a, b, c, d) {
    if (typeof a === 'string') {                       // "A1" / "B2:C9" / "B:B"
      const m = a.match(/^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/);
      const num = s => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      const c1 = num(m[1]), f1 = m[2] ? +m[2] : 1;
      const c2 = m[3] ? num(m[3]) : c1, f2 = m[4] ? +m[4] : (m[2] ? f1 : this.getMaxRows());
      return new Rango(this, f1, c1, f2 - f1 + 1, c2 - c1 + 1);
    }
    return new Rango(this, a, b, c === undefined ? 1 : c, d === undefined ? 1 : d);
  }
  appendRow(fila) { this.datos[this.getLastRow()] = fila.slice(); return this; }
  deleteRow(f) { this.datos.splice(f - 1, 1); return this; }
  setFrozenRows() {} setRowHeight() {} setColumnWidth() {} hideColumns() {}
  getBandings() { return []; } clear() { this.datos = []; }
}

const hojas = {};
Object.keys(raw).forEach(n => { hojas[n] = new Hoja(n, raw[n]); });

/* La planilla de Fa tiene hoja Recordatorios desde que corrió "Activar los
   recordatorios"; el fixture se había exportado antes. La creo acá con filas
   parecidas a las que siembra 01_Setup.gs, porque si no el "falta cargar" de
   la pantalla Mes nunca se dibuja en las pruebas y terminaría siendo un cartel
   que solo existe en producción. Justo lo que nos pasó con el "$ %.,2f". */
hojas.Recordatorios = new Hoja('Recordatorios', [
  ['Categoria', 'Vence', 'Activo'],
  ['Luz', 5, 'SI'],
  ['Gas', 10, 'SI'],
  ['Internet', 18, 'SI'],
  ['Telefonia', 7, 'SI'],
  ['Gimnasio', 12, 'SI']
]);

const SS = {
  getSheetByName: n => hojas[n] || null,
  insertSheet: n => (hojas[n] = new Hoja(n, [])),
  getSheets: () => Object.values(hojas),
  deleteSheet: () => {},
  setSpreadsheetTimeZone: () => {},
  setActiveSheet: () => {},
  getUrl: () => 'https://docs.google.com/spreadsheets/d/demo',
  toast: () => {}
};

const MESES_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const g = globalThis;
g.SpreadsheetApp = {
  getActiveSpreadsheet: () => SS,
  newDataValidation: () => ({
    requireValueInRange: function () { return this; },
    requireValueInList: function () { return this; },
    setAllowInvalid: function () { return this; },
    build: () => ({})
  }),
  getUi: () => ({
    alert: (...a) => console.log('   [alert]', a.join(' ').slice(0, 90)),
    prompt: () => ({ getSelectedButton: () => 'CANCEL', getResponseText: () => '' }),
    createMenu: () => ({ addItem() { return this; }, addSeparator() { return this; }, addToUi() {} }),
    ButtonSet: { OK: 'OK', OK_CANCEL: 'OK_CANCEL', YES_NO: 'YES_NO' },
    Button: { OK: 'OK', YES: 'YES' }
  }),
  BandingTheme: { LIGHT_GREY: 1 }
};
g.Utilities = {
  formatDate: (d, tz, pat) => {
    const p = n => String(n).padStart(2, '0');
    return pat
      .replace(/yyyy/g, d.getFullYear())
      .replace(/yy/g, p(d.getFullYear() % 100))
      .replace(/MMMM/g, MESES_ES[d.getMonth()])
      .replace(/MM/g, p(d.getMonth() + 1))
      .replace(/dd/g, p(d.getDate()))
      .replace(/HH/g, p(d.getHours()))
      .replace(/hh/g, p(d.getHours()))
      .replace(/mm(?![a-z])/g, p(d.getMinutes()));
  },
  // OJO: el formatString real de Apps Script NO soporta la coma de miles
  // (%,.2f). Cuando no entiende un flag deja el token tal cual, que es
  // exactamente el bug que apareció en producción. Lo emulamos igual de tonto
  // para que las pruebas no nos mientan.
  formatString: (f, ...vals) => {
    let i = 0;
    return f.replace(/%[-+ #0]*[\d.]*[a-zA-Z%]|%[^\s]*?[a-zA-Z]/g, tok => {
      if (tok === '%%') return '%';
      const v = vals[i];
      if (/^%[-+ #0]*\d*(\.\d+)?[dfs]$/.test(tok)) {
        i++;
        const m = tok.match(/\.(\d+)f$/);
        if (m) return Number(v).toFixed(+m[1]);
        if (tok.endsWith('d')) return String(Math.round(Number(v)));
        return String(v);
      }
      return tok;   // flag no soportado: sale literal, como en Apps Script
    });
  },
  computeDigest: (alg, s) => [...crypto.createHash('md5').update(s).digest()]
    .map(b => b > 127 ? b - 256 : b),
  DigestAlgorithm: { MD5: 'MD5' },
  getUuid: () => crypto.randomUUID(),
  base64Encode: b => Buffer.from(b).toString('base64')
};
g.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
const propsMem = {};
g.PropertiesService = {
  getScriptProperties: () => ({
    getProperty: k => (k in propsMem ? propsMem[k] : null),
    setProperty: (k, v) => { propsMem[k] = v; },
    deleteProperty: k => { delete propsMem[k]; }
  })
};
g.Logger = { log: () => {} };
g.UrlFetchApp = {
  fetch: (url, opts) => {
    stats.fetch.push({ url, payload: opts && opts.payload });
    return {
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ ok: true, result: {} }),
      getBlob: () => ({ getBytes: () => [] })
    };
  }
};
const cacheMem = {};
g.CacheService = {
  getScriptCache: () => ({
    get: k => (k in cacheMem ? cacheMem[k] : null),
    put: (k, v) => { cacheMem[k] = v; },
    remove: k => { delete cacheMem[k]; }
  })
};
g.ScriptApp = { getService: () => ({ getUrl: () => '' }) };
g.ContentService = {
  createTextOutput: t => {
    const salida = { _t: t, _mime: 'text/plain' };
    salida.setMimeType = m => { salida._mime = m; return salida; };
    salida.getContent = () => t;
    return salida;
  },
  MimeType: { JSON: 'json', JAVASCRIPT: 'js' }
};

// Cargamos el backend real, en orden
['00_Config', '02_Parser', '03_Datos', '04_IA', '05_Telegram', '06_Api', '01_Setup']
  .forEach(f => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'apps-script', f + '.gs'), 'utf8');
    (0, eval)(src);
  });

module.exports = { hojas, SS, stats, resetStats };
