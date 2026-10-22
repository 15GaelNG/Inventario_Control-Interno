const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Panel de Pau, Cancelaciones (usuario, 22-oct): dos botones. «Exportar a Excel» de la tabla da la base, como siempre;
// a su lado, «Cancelaciones» da una hoja por compañía y asesor con las POR FIRMAR, en la tabla del correo al asesor (REGIÓN,
// CUENTA, NÚMERO, RAZÓN SOCIAL, ASESOR)
const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
const vista = fs.readFileSync(path.join(__dirname, '../src/html/views/lineas/lineas-resguardos.html'), 'utf8');
const ini = cliente.indexOf('    const COLUMNAS_ASESOR = ');
const fuente = cliente.slice(ini, cliente.indexOf('    // xlsx-js-style:', ini));
const { hojasPorAsesor } = new Function(fuente + '\nreturn { hojasPorAsesor };')();

const fila = (numero, compania, asesor, fase, region, cuenta, razon) => ({ NUMERO: numero, COMPANIA: compania, ASESOR: asesor,
  CANCELACION: fase, REGION: region, CUENTA_PADRE: cuenta, RAZON_SOCIAL: razon });

test('Excel por asesor: una hoja por compañía y asesor, solo con las POR FIRMAR, Telcel primero', () => {
  const hojas = hojasPorAsesor([
    fila('4424051478', 'AT&T', 'KARLA', 'POR FIRMAR', 'Región 6', '507727479', 'FRACCIONADORA LA ROMITA SA DE CV'),
    fila('5561167856', 'TELCEL', 'ALFREDO', 'POR FIRMAR', 'Región 9', '99022914', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('9981968021', 'TELCEL', 'WILBERTO', 'POR FIRMAR', 'Región 8', '83706999', 'FRACCIONADORA LA ROMITA SA DE CV'),
    fila('4421205041', 'TELCEL', 'ALFREDO', 'POR FIRMAR', 'Región 6', '62637313', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('4421918218', 'TELCEL', 'ALFREDO', 'CARTA FIRMADA', 'Región 6', '62637313', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('4772438415', 'AT&T', 'KARLA', 'CANCELADA', 'Región 6', '507727479', 'FRACCIONADORA LA ROMITA SA DE CV'),
  ]);
  assert.deepEqual(hojas.map((h) => h.nombre), ['TELCEL - ALFREDO', 'TELCEL - WILBERTO', 'ATT - KARLA']);
  assert.deepEqual(hojas[0].titulos, ['REGIÓN', 'CUENTA', 'NÚMERO', 'RAZÓN SOCIAL', 'ASESOR']);
  assert.deepEqual(hojas[0].filas, [['Región 9', '99022914', '5561167856', 'GPH SERVICIOS CONDOMINALES SC', 'ALFREDO'],
    ['Región 6', '62637313', '4421205041', 'GPH SERVICIOS CONDOMINALES SC', 'ALFREDO']]);
  assert.deepEqual(hojas[2].filas, [['Región 6', '507727479', '4424051478', 'FRACCIONADORA LA ROMITA SA DE CV', 'KARLA']]);
});

test('sin POR FIRMAR no hay hojas; sin asesor o sin compañía, su propia hoja', () => {
  assert.deepEqual(hojasPorAsesor([fila('1', 'TELCEL', 'ALFREDO', 'CANCELADA')]), []);
  assert.deepEqual(hojasPorAsesor([fila('1', 'TELCEL', '', 'POR FIRMAR'), fila('2', '', 'KARLA', 'POR FIRMAR')]).map((h) => h.nombre),
    ['TELCEL - SIN ASESOR', 'SIN COMPAÑÍA - KARLA']);
  assert.match(cliente, /if \(!hojas\.length\) throw new Error\('No hay líneas POR FIRMAR con los filtros actuales'\);/);
});

test('dos botones: «Exportar a Excel» da la base y, a su lado, «Cancelaciones» las hojas del asesor', () => {
  assert.match(cliente, /exportar: \{ nombreArchivo: vista === 'RESGUARDOS' \? 'Resguardos' : 'Cancelaciones de lineas' \},/);
  assert.doesNotMatch(cliente, /descargarCancelaciones|BASE PRINCIPAL|lnr-excel-asesores/);
  assert.doesNotMatch(vista, /lnr-excel-asesores|Excel por asesor/, 'ya no va en el encabezado del panel');
  // Solo en Cancelaciones, justo después del botón de la tabla (si no hay botón de la tabla, sin permiso, tampoco este)
  assert.match(cliente, /if \(vista === 'CANCELACIONES'\) botonBaseCancelaciones\(\);/);
  assert.match(cliente, /const excel = \$\('#lnr-tabla \.dt-btn-excel', raiz\);\n\s+if \(!excel\) return;/);
  assert.match(cliente, /boton\.innerHTML = icono\('file-spreadsheet'\) \+ ' Cancelaciones';\n\s+excel\.insertAdjacentElement\('afterend', boton\);/);
  assert.match(cliente, /const n = await descargarPorAsesor\(tabla\.getFiltradas\(\)\);/);
  assert.match(cliente, /boton\.innerHTML = '<span class="ln-spinner"><\/span> Exportando…';/);
  // En un .html de Apps Script la dirección va con «:\/\/» (CLAUDE.md del repo)
  assert.ok(cliente.includes("script.src = 'https:" + '\\/\\/' + "cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';"));
  assert.match(cliente, /fill: \{ fgColor: \{ rgb: '002060' \} \}/);
});
