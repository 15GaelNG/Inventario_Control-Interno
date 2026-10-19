/**
 * El texto de app.html y de las pantallas que salieron de él (fase 6.1, tools/app/partir.js), en el orden de
 * Index.html, para las pruebas que lo revisan por texto:  const APP = require('./app-fuente');
 * Las que preguntan en qué archivo está algo leen ese archivo. source-contracts revisa que ARCHIVOS sea el de Index.html.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVOS = ['app', 'app-vehiculos', 'app-incidencias', 'app-uber', 'app-tickets'];

// Con \n (en Windows el archivo se baja con CRLF)
module.exports = ARCHIVOS.map((a) => fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', a + '.html'), 'utf8'))
  .join('\n').replace(/\r\n/g, '\n');
