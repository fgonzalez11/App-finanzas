/* Opciones para lanzar el navegador de las pruebas. En el entorno Linux donde
   se desarrolló está el Chromium preinstalado; en la PC de Fa se usa el Chrome
   instalado, para no bajar otro con `playwright install`. */
const fs = require('fs');
const LINUX = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
module.exports = fs.existsSync(LINUX) ? { executablePath: LINUX } : { channel: 'chrome' };
