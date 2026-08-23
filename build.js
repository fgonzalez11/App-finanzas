/**
 * Arma la app en UN SOLO ARCHIVO: mete resumen.js adentro de index.html.
 *
 * El resultado se escribe en la RAÍZ del repo (index.html y sw.js), que es de
 * donde GitHub Pages publica. O sea que el ciclo completo es:
 *
 *     editás pwa/index.html  ->  node build.js  ->  git push
 *
 * y a los treinta segundos lo tenés en el teléfono. Nada de arrastrar archivos
 * a la interfaz de GitHub (que además es lo que se rompió el día que GitHub
 * andaba a medias).
 *
 * Los fuentes viven en pwa/. Los archivos de la raíz son GENERADOS: no los
 * edites a mano, se pisan en el próximo build.
 */
const fs = require('fs');
const path = require('path');
const raiz = __dirname;

const html = fs.readFileSync(path.join(raiz, 'pwa/index.html'), 'utf8');
const lector = fs.readFileSync(path.join(raiz, 'pwa/resumen.js'), 'utf8');

const tag = '<script src="./resumen.js"></script>';
if (html.indexOf(tag) < 0) {
  console.error('no encuentro el <script> de resumen.js en pwa/index.html');
  process.exit(1);
}

// OJO: replace() con string interpreta $' y $& dentro del reemplazo, y el
// lector tiene esos patrones: el archivo salía al doble de largo. Va función.
const bundle = html.replace(tag, function () {
  return '<script>\n/* ---- resumen.js incrustado, para que sea un solo archivo ---- */\n' +
    lector + '\n</script>';
});

const esperado = html.length - tag.length + lector.length;
if (Math.abs(bundle.length - esperado) > 200) {
  console.error('el bundle salió de un largo raro:', bundle.length, 'vs', esperado);
  process.exit(1);
}
if (bundle.indexOf('src="./resumen.js"') >= 0) {
  console.error('quedó una referencia externa: en Pages no existe resumen.js suelto');
  process.exit(1);
}

// 1) la raíz: es lo que publica GitHub Pages
fs.writeFileSync(path.join(raiz, 'index.html'), bundle);
fs.copyFileSync(path.join(raiz, 'pwa/sw.js'), path.join(raiz, 'sw.js'));

// 2) dist/: lo mismo, para que el servidor de pruebas corra con DIST=1
//    contra el archivo final y no contra los fuentes
fs.mkdirSync(path.join(raiz, 'dist'), { recursive: true });
fs.writeFileSync(path.join(raiz, 'dist/index.html'), bundle);
fs.copyFileSync(path.join(raiz, 'pwa/sw.js'), path.join(raiz, 'dist/sw.js'));

const ver = (bundle.match(/var APP_VER = '([^']+)'/) || [])[1] || '?';
const cache = (fs.readFileSync(path.join(raiz, 'pwa/sw.js'), 'utf8')
  .match(/var CACHE = '([^']+)'/) || [])[1] || '?';

console.log('app ' + ver + ' · caché ' + cache + ' · ' +
  (bundle.length / 1024).toFixed(1) + ' kB');
console.log('escrito en index.html y sw.js (raíz). Commit y push y ya está en el teléfono.');
