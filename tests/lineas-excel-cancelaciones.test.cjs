const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Excel de Cancelaciones del panel de Pau (usuario, 22-oct): BASE PRINCIPAL con lo exportado y una hoja por compañía y
// asesor con las POR FIRMAR, en la tabla del correo al asesor (REGIÓN, CUENTA, NÚMERO, RAZÓN SOCIAL, ASESOR)
const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
const ini = cliente.indexOf('    const COLUMNAS_ASESOR = ');
const fuente = cliente.slice(ini, cliente.indexOf('    // xlsx-js-style:', ini));
const { hojasDeCancelaciones } = new Function(fuente + '\nreturn { hojasDeCancelaciones };')();

const columnas = [{ campo: 'FECHA', titulo: 'Mandado', tipo: 'lnFechaHora' }, { campo: 'NUMERO', titulo: 'Línea', tipo: 'texto' },
  { campo: 'CANCELACION', titulo: 'Cancelación', tipo: 'lista' }];
const fila = (numero, compania, asesor, fase, region, cuenta, razon) => ({ FECHA: '2026-10-14T12:00:00', NUMERO: numero, COMPANIA: compania,
  ASESOR: asesor, CANCELACION: fase, REGION: region, CUENTA_PADRE: cuenta, RAZON_SOCIAL: razon });

test('BASE PRINCIPAL con todo lo exportado y una hoja por compañía y asesor con las POR FIRMAR', () => {
  const filas = [
    fila('4424051478', 'AT&T', 'KARLA', 'POR FIRMAR', 'Región 6', '507727479', 'FRACCIONADORA LA ROMITA SA DE CV'),
    fila('5561167856', 'TELCEL', 'ALFREDO', 'POR FIRMAR', 'Región 9', '99022914', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('9981968021', 'TELCEL', 'WILBERTO', 'POR FIRMAR', 'Región 8', '83706999', 'FRACCIONADORA LA ROMITA SA DE CV'),
    fila('4421205041', 'TELCEL', 'ALFREDO', 'POR FIRMAR', 'Región 6', '62637313', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('4421918218', 'TELCEL', 'ALFREDO', 'CARTA FIRMADA', 'Región 6', '62637313', 'GPH SERVICIOS CONDOMINALES SC'),
    fila('4772438415', 'AT&T', 'KARLA', 'CANCELADA', 'Región 6', '507727479', 'FRACCIONADORA LA ROMITA SA DE CV'),
  ];
  const hojas = hojasDeCancelaciones(filas, columnas);
  assert.deepEqual(hojas.map((h) => h.nombre), ['BASE PRINCIPAL', 'TELCEL - ALFREDO', 'TELCEL - WILBERTO', 'ATT - KARLA']);
  assert.deepEqual(hojas[0].titulos, ['Mandado', 'Línea', 'Cancelación']);
  assert.equal(hojas[0].filas.length, 6, 'la base lleva todo lo exportado');
  assert.deepEqual(hojas[0].fechas, [true, false, false]);
  assert.ok(!hojas[0].tablaCorreo);
  assert.deepEqual(hojas[1].titulos, ['REGIÓN', 'CUENTA', 'NÚMERO', 'RAZÓN SOCIAL', 'ASESOR']);
  assert.deepEqual(hojas[1].filas, [['Región 9', '99022914', '5561167856', 'GPH SERVICIOS CONDOMINALES SC', 'ALFREDO'],
    ['Región 6', '62637313', '4421205041', 'GPH SERVICIOS CONDOMINALES SC', 'ALFREDO']]);
  assert.deepEqual(hojas[3].filas, [['Región 6', '507727479', '4424051478', 'FRACCIONADORA LA ROMITA SA DE CV', 'KARLA']]);
  assert.ok(hojas.slice(1).every((h) => h.tablaCorreo));
});

test('sin POR FIRMAR solo sale la base; sin asesor o sin compañía, su propia hoja', () => {
  assert.deepEqual(hojasDeCancelaciones([fila('1', 'TELCEL', 'ALFREDO', 'CANCELADA')], columnas).map((h) => h.nombre), ['BASE PRINCIPAL']);
  assert.deepEqual(hojasDeCancelaciones([fila('1', 'TELCEL', '', 'POR FIRMAR'), fila('2', '', 'KARLA', 'POR FIRMAR')], columnas).map((h) => h.nombre),
    ['BASE PRINCIPAL', 'TELCEL - SIN ASESOR', 'SIN COMPAÑÍA - KARLA']);
});

test('el botón Exportar de Cancelaciones arma este Excel con las filas filtradas; Resguardos sigue igual', () => {
  assert.match(cliente, /exportar: vista === 'RESGUARDOS' \? \{ nombreArchivo: 'Resguardos' \}\n\s+: \{ nombreArchivo: 'Cancelaciones de lineas', descargar: \(\) => descargarCancelaciones\(tabla\.getFiltradas\(\), COLUMNAS\.CANCELACIONES\) \},/);
  // En un .html de Apps Script la dirección va con «:\/\/» (CLAUDE.md del repo)
  assert.ok(cliente.includes("script.src = 'https:" + '\\/\\/' + "cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js';"));
  assert.match(cliente, /fill: \{ fgColor: \{ rgb: '002060' \} \}/);
});
