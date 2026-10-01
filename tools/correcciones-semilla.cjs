#!/usr/bin/env node
/**
 * Convierte "CORRECCIONES - para cargar.json" (lo escribe conversion_estatus.py, en la carpeta del reporte de líneas)
 * en src/services/lineas/LineasCorreccionesSemilla.gs, que el módulo temporal "Correcciones de Líneas" carga con el
 * botón "Cargar casos" (solo ADMIN). Ver la cabecera de src/services/lineas/LineasCorrecciones.gs.
 *
 * El archivo generado NO va a GitHub (.gitignore): trae datos del inventario (nombres, números). clasp sí lo sube.
 *
 * Uso:
 *   npm run correcciones:semilla -- "<ruta>/CORRECCIONES - para cargar.json"
 *   npm run push
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const entrada = process.argv[2];
if (!entrada || !fs.existsSync(entrada)) {
  console.error('Uso: npm run correcciones:semilla -- "<ruta>/CORRECCIONES - para cargar.json"');
  process.exit(1);
}
const texto = fs.readFileSync(entrada, 'utf8');
const datos = JSON.parse(texto);
if (!Array.isArray(datos.casos) || !Array.isArray(datos.automaticos)) {
  console.error('El JSON no trae "casos" y "automaticos": ¿es la salida de conversion_estatus.py?');
  process.exit(1);
}

// gzip + base64 en trozos: el .gs queda chico y sin líneas gigantes
const b64 = zlib.gzipSync(Buffer.from(texto, 'utf8'), { level: 9 }).toString('base64');
const trozos = b64.match(/.{1,8000}/g) || [];
const salida = path.join(__dirname, '..', 'src', 'services', 'lineas', 'LineasCorreccionesSemilla.gs');
const meta = { carga: datos.carga, inventario: datos.inventario, fechaInventario: datos.fechaInventario, casos: datos.casos.length, automaticos: datos.automaticos.length };
fs.writeFileSync(salida, [
  '// GENERADO por tools/correcciones-semilla.cjs a partir de ' + JSON.stringify(path.basename(entrada)) + '.',
  '// NO se sube a GitHub (.gitignore): trae datos del inventario. Lo usa LineasCorrecciones.cargar().',
  'const LINEAS_CORRECCIONES_SEMILLA = Object.assign(' + JSON.stringify(meta) + ', {',
  '  datos: [',
  trozos.map((t) => "    '" + t + "',").join('\n'),
  '  ],',
  '});',
  '',
].join('\n'), 'utf8');
console.log('OK: ' + path.relative(process.cwd(), salida) + ' (' + meta.casos + ' casos, ' + meta.automaticos +
  ' aplicados solos; ' + Math.round(b64.length / 1024) + ' KB). Sigue: npm run push');
