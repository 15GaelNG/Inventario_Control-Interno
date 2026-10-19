const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Sin columna FECHA DE ALTA en EQUIPOS y LINEAS: el alta es el movimiento ALTA de MOVIMIENTOS (usuario, 16-oct;
// pendiente 2.51)
function cargar(hojas, cache) {
  const guardado = cache || {};
  const LineasDatos = {
    existeTabla: (n) => !!hojas[n], leerTabla: (n) => (hojas[n] || []).map((f) => Object.assign({}, f)),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN/i.test(h), normCol: (h) => String(h || '').toUpperCase().trim(),
    cacheLeer: (k) => (guardado[k] ? JSON.parse(guardado[k]) : null), cacheGuardar: (k, v) => { guardado[k] = JSON.stringify(v); },
    cacheBorrar: (k) => { delete guardado[k]; }, tocar: () => {},
    buscarFilas: (n, col, valor) => (hojas[n] || []).map((f, i) => (String(f[col]) === valor ? i + 2 : 0)).filter(Boolean),
    leerFilas: (pedidos) => pedidos.map((p) => p.filas.map((i) => Object.assign({ _fila: i }, hojas[p.tabla][i - 2]))),
  };
  return new Function('LineasDatos', 'LineasRepo', 'PropertiesService', 'ESTRUCTURA_ES_CODIGO_RESGUARDO', 'soloEditor_',
    read('src/services/lineas/LineasLectura.gs') + '; return LineasLectura;')(LineasDatos, { folioRegistro: () => '', borrarCaches: () => {} },
    { getScriptProperties: () => ({ getProperty: () => 'ESTRUCTURA' }) }, /^$/, () => {});
}

const HOJAS = {
  LINEAS: [{ 'ID': 'LIN-1', 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'DISPONIBLE', 'FECHA DE ALTA': new Date('2020-01-01T12:00:00Z') }],
  EQUIPOS: [{ 'ID': 'EQU-1', 'NUCO': '0001', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'RESGUARDO' },
    { 'ID': 'EQU-2', 'NUCO': '0002', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'RESGUARDO' }],
  ASIGNACIONES: [],
  MOVIMIENTOS: [
    { 'ID': 'MVT-2', 'FECHA': new Date('2026-10-10T18:00:00Z'), 'ACCION': 'ALTA', 'ID EQUIPO': 'EQU-1', 'ID LINEA': '' },
    { 'ID': 'MVT-1', 'FECHA': new Date('2025-03-04T18:00:00Z'), 'ACCION': 'ALTA', 'ID EQUIPO': 'EQU-1, EQU-9', 'ID LINEA': 'LIN-1' },
    { 'ID': 'MVT-3', 'FECHA': new Date('2024-01-01T18:00:00Z'), 'ACCION': 'EDICION', 'ID EQUIPO': 'EQU-2', 'ID LINEA': '' },
  ],
};

test('FECHA REGISTRO es el primer movimiento ALTA del equipo o la línea, no la columna FECHA DE ALTA', () => {
  const L = cargar(HOJAS);
  const por = (id) => L.filas().filter((f) => f.ID === id)[0];
  assert.equal(por('EQU-1')['FECHA REGISTRO'].toISOString(), '2025-03-04T18:00:00.000Z');
  assert.equal(por('LIN-1')['FECHA REGISTRO'].toISOString(), '2025-03-04T18:00:00.000Z'); // la columna (2020) ya no se lee
  assert.equal(por('EQU-2')['FECHA REGISTRO'], ''); // otra acción no es el alta
});

test('el alta nueva se anota sin releer MOVIMIENTOS; «Recargar datos» la vuelve a leer', () => {
  const cache = {};
  const L = cargar(HOJAS, cache);
  L.anotarAlta(['EQU-2'], new Date('2026-10-16T17:00:00Z'));
  assert.equal(L.altas()['EQU-2'], '2026-10-16T17:00:00.000Z');
  assert.equal(cargar({}, cache).altas()['EQU-2'], '2026-10-16T17:00:00.000Z'); // de la caché, aunque no haya MOVIMIENTOS
  L.limpiarCaches();
  assert.equal(cargar(HOJAS, cache).altas()['EQU-2'], undefined);
});

test('ya nadie escribe FECHA DE ALTA; Corregir no muestra la fecha; la línea nueva de Corregir deja su ALTA', () => {
  assert.doesNotMatch(read('src/services/lineas/LineasEscritura.gs'), /'FECHA DE ALTA':/);
  assert.match(read('src/services/lineas/LineasEscritura.gs'), /LineasLectura\.anotarAlta\(\[e && e\['ID'\], l && l\['ID'\]\], ahora\);/);
  assert.match(read('src/services/lineas/LineasEscritura.gs'), /LineasLectura\.anotarAlta\(\[nueva\['ID'\]\], ahora\);/);
  const estructura = read('src/services/lineas/LineasEstructura.gs');
  assert.doesNotMatch(estructura.slice(estructura.indexOf('const ESTRUCTURA_HOJAS'), estructura.indexOf('ASIGNACIONES:')), /FECHA DE ALTA/);
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.doesNotMatch(reg, /'Fecha de alta'/);
  assert.match(reg, /\(guardado\.altas \|\| \[\]\)\.forEach\(\(idLinea\) => \{/);
  assert.match(read('src/services/lineas/LineasLectura.gs'), /'enc_' \+ HOJA_VIEJA, 'ln_panorama_v3', 'ln_panorama_eventos_v1', 'ln_notif_revision_v2', CLAVE_ALTAS\]/);
});
