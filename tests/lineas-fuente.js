/**
 * El texto de la pantalla de Líneas completa (la base y cada pantalla, en el orden de Index.html), para las pruebas
 * que la revisan por texto:  const LINEAS = require('./lineas-fuente');
 * Hasta el 19-oct era un solo archivo, lineas.html; desde la fase 6.2 cada pantalla vive en el suyo
 * (tools/lineas/partir.js). source-contracts revisa que la lista ARCHIVOS sea la de Index.html.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVOS = ['lineas', 'lineas-telefonicas', 'lineas-telefonicas-ficha', 'lineas-telefonicas-documentos',
  'lineas-telefonicas-acciones', 'lineas-telefonicas-captura', 'lineas-telefonicas-historial', 'lineas-telefonicas-paginas',
  'lineas-panorama', 'lineas-activos', 'lineas-accesorios', 'lineas-resguardos', 'lineas-bitacora'];

// Con \n, como lo leían las pruebas (en Windows el archivo se baja con CRLF)
module.exports = ARCHIVOS.map((a) => fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', a + '.html'), 'utf8'))
  .join('\n').replace(/\r\n/g, '\n');
