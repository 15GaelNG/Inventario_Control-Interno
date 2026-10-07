// Pendiente 1.9 (7-oct): «Exportar a Excel» del inventario trae, con las hojas nuevas, una hoja LINEAS TELEFONICAS
// armada como la vieja (mismas columnas, ESTATUS GENERAL calculado) para que el reporte mensual la siga leyendo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

function cargar(activo) {
  const hojaNueva = (encabezados, filas) => ({ encabezados, hoja: { getLastRow: () => filas.length + 1, getRange: () => ({ getValues: () => filas }) } });
  const tablas = {
    LINEAS: hojaNueva(['ID', 'NUMERO TELEFONO'], [['LN-1', '4421234567']]),
    EQUIPOS: hojaNueva(['ID', 'NUCO'], [['EQ-1', 8]]),
    ASIGNACIONES: hojaNueva(['ID'], [['ASG-1']]),
    ADENDUMS: hojaNueva(['ID'], [['ADN-1']]),
  };
  const LineasDatos = { existeTabla: (n) => !!tablas[n], zona: () => 'X', tablaFresca: (n) => tablas[n] };
  const Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
  const LineasRepo = {
    TAB: { LINEAS: 'LINEAS TELEFONICAS', CAMBIOS: 'C' },
    estatusGeneralRegistro: (id, tipo, eq, ln) => (/^DG/.test(id || '') ? 'PERSONAL DG' : tipo === 'EQUIPO' ? eq || '' : ln || ''),
  };
  const ENCABEZADOS = ['ID', 'ID APPSHEET', 'NUMERO TELEFONO', 'NUCO', 'TIPO', 'RESPONSABLE', 'ESTATUS GENERAL', 'PIN EQUIPO', 'ESTATUS LINEA', 'ESTATUS EQUIPO'];
  const LineasLectura = {
    activo: () => activo, HOJA_VIEJA: 'LINEAS TELEFONICAS', ENCABEZADOS,
    HOJAS: { LINEAS: 'LINEAS', EQUIPOS: 'EQUIPOS', ASIGNACIONES: 'ASIGNACIONES', ADENDUMS: 'ADENDUMS' },
    filas: () => [
      { ID: 'EQ-1', 'ID APPSHEET': 'A1', 'NUMERO TELEFONO': '4421234567', NUCO: 8, TIPO: 'EQUIPO + SIM', RESPONSABLE: 'ANA', 'ESTATUS GENERAL': '', 'PIN EQUIPO': '1234', 'ESTATUS LINEA': 'USO', 'ESTATUS EQUIPO': 'USO' },
      { ID: 'EQ-2', 'ID APPSHEET': 'DG003', 'NUMERO TELEFONO': '', NUCO: 12, TIPO: 'EQUIPO', RESPONSABLE: '', 'ESTATUS GENERAL': '', 'PIN EQUIPO': '', 'ESTATUS LINEA': '', 'ESTATUS EQUIPO': 'RESGUARDO' },
      { ID: 'LN-9', 'ID APPSHEET': '', 'NUMERO TELEFONO': '5512345678', NUCO: '', TIPO: 'LINEA', RESPONSABLE: 'LUIS', 'ESTATUS GENERAL': '', 'PIN EQUIPO': '', 'ESTATUS LINEA': 'N/A', 'ESTATUS EQUIPO': '' },
    ],
  };
  const LineasUtil = new Function(read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')();
  return new Function('LineasDatos', 'Utilities', 'LineasRepo', 'LineasLectura', 'LineasUtil',
    read('src/services/lineas/LineasExportar.gs') + '\nreturn LineasExportar;')(LineasDatos, Utilities, LineasRepo, LineasLectura, LineasUtil);
}

test('con las hojas nuevas: primero LINEAS TELEFONICAS armada, después las cuatro hojas', () => {
  const base = cargar(true).baseCompleta('INVENTARIO', false);
  assert.deepEqual(base.hojas.map((h) => h.nombre), ['LINEAS TELEFONICAS', 'LINEAS', 'EQUIPOS', 'ASIGNACIONES', 'ADENDUMS']);
  const junta = base.hojas[0];
  assert.deepEqual(junta.columnas.map((c) => c.titulo).slice(0, 7), ['ID', 'ID APPSHEET', 'NUMERO TELEFONO', 'NUCO', 'TIPO', 'RESPONSABLE', 'ESTATUS GENERAL']);
  const col = (c) => junta.columnas.findIndex((x) => x.titulo === c);
  assert.deepEqual(junta.filas.map((f) => f[col('ESTATUS GENERAL')]), ['USO', 'PERSONAL DG', ''], 'la fórmula del AppSheet; «N/A» cuenta como vacío');
  assert.deepEqual(junta.filas.map((f) => f[col('NUCO')]), ['0008', '0012', ''], 'NUCO a 4 dígitos');
  assert.equal(junta.filas[0][col('PIN EQUIPO')], '••••', 'secretos ocultos sin permiso');
  assert.equal(cargar(true).baseCompleta('INVENTARIO', true).hojas[0].filas[0][col('PIN EQUIPO')], '1234');
});

test('sin las hojas nuevas no se arma nada: se exporta la pestaña vieja (aquí no existe)', () => {
  assert.throws(() => cargar(false).baseCompleta('INVENTARIO', false), /No existe la pestaña/);
  assert.throws(() => cargar(true).baseCompleta('CAMBIOS', false), /No existe la pestaña/, 'CAMBIOS no lleva la hoja armada');
});
