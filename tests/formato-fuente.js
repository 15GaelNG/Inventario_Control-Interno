/**
 * El JS de componentes/formato.html, para las pruebas que cargan un archivo de la pantalla suelto
 * (en la app lo pone Index.html antes que todo):  const FORMATO = require('./formato-fuente');
 */
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'formato.html'), 'utf8');
module.exports = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>')) + '\n';
