/**
 * El texto de ClientApi.gs y de src/api/*.gs (fase 6.3, tools/api/partir.js): toda la superficie de google.script.run,
 * para las pruebas que la revisan por texto:  const API = require('./api-fuente');
 * Las que preguntan en qué archivo está algo (LISTAS_CON_HUELLA_ en la base) leen ese archivo.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src');
const ARCHIVOS = [path.join(SRC, 'ClientApi.gs')].concat(fs.readdirSync(path.join(SRC, 'api')).filter((a) => a.endsWith('.gs')).sort()
  .map((a) => path.join(SRC, 'api', a)));

// Con \n (en Windows el archivo se baja con CRLF)
module.exports = ARCHIVOS.map((a) => fs.readFileSync(a, 'utf8')).join('\n').replace(/\r\n/g, '\n');
