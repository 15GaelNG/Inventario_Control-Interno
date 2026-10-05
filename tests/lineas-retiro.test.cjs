const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Reestructura, etapa 3 paso 4 (LineasRetiro.gs): retirar LINEAS TELEFONICAS. Se prueba con hojas simuladas: qué se copia,
// qué referencias pasan al ID nuevo y que la revisión no escribe nada.
const leer = (archivo) => fs.readFileSync(path.join(__dirname, '../src/services/lineas', archivo), 'utf8');

function hojaFalsa(nombre, valores) {
  const h = {
    nombre, valores, oculta: false, escrituras: 0,
    getDataRange: () => ({ getValues: () => h.valores.map((f) => f.slice()) }),
    getMaxColumns: () => h.valores[0].length,
    getMaxRows: () => Math.max(h.valores.length, 2),
    getLastRow: () => h.valores.length,
    insertColumnsAfter: () => {},
    hideSheet: () => { h.oculta = true; },
    getRange: (fila, col, nf, nc) => ({
      setValue: (x) => { h.escrituras++; h.valores[fila - 1][col - 1] = x; return { setFontWeight: () => {} }; },
      setNumberFormat: () => {},
      setValues: (m) => {
        h.escrituras++;
        m.forEach((r, i) => {
          while (h.valores.length < fila + i) h.valores.push(new Array(h.valores[0].length).fill(''));
          r.forEach((x, j) => { h.valores[fila - 1 + i][col - 1 + j] = x; });
        });
      },
    }),
  };
  return h;
}

function cargar() {
  const hojas = {
    'LINEAS TELEFONICAS': hojaFalsa('LINEAS TELEFONICAS', [
      ['ID', 'ID ANTERIOR', 'NUCO', 'COMENTARIOS', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION', 'RESPONSABLE', 'SEDE', 'DEPARTAMENTO'],
      ['LIN-V1', 'APP1', '0012', 'SE ENTREGÓ CON FUNDA', 'RESP_Files_/r.pdf', '', '', 'DANAE', 'QUERETARO', 'VENTAS'],
      ['LIN-V2', 'APP2', '0500', '', '', '', '', 'ROSA', 'MERIDA', 'N/A'],
      ['LIN-V3', 'APP3', '0030', '', '', 'INSP_Files_/i.pdf', '', 'P0132', 'CANCUN', ''],
    ]),
    EQUIPOS: hojaFalsa('EQUIPOS', [
      ['ID', 'ID ANTERIOR', 'NUCO'],
      ['EQU-1', 'LIN-V1', '0012'],
      ['EQU-3', 'LIN-V3', '0030'],
      ['EQU-9', '', '9990'], // alta del sistema nuevo
    ]),
    LINEAS: hojaFalsa('LINEAS', [
      ['ID', 'ID ANTERIOR', 'NUMERO TELEFONO'],
      ['LIN-A', '', '4421090805'], // la del NUCO 0012: sin ID ANTERIOR
      ['LIN-2', 'LIN-V2', '4425550000'],
    ]),
    ASIGNACIONES: hojaFalsa('ASIGNACIONES', [
      ['ID', 'TIPO', 'ID LINEA', 'ID EQUIPO', 'ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'AREA', 'SEDE',
        'OFICINA / DESARROLLO', 'DIRECTOR', 'CUENTA GOOGLE', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA', 'FECHA INICIO', 'FECHA FIN'],
      ['ASG-1', 'PERSONA', 'LIN-A', 'EQU-1', '', '', 'DANAE', '', 'VENTAS', '', 'QUERETARO', '', '', '', '', '', '', ''],
    ]),
    MOVIMIENTOS: hojaFalsa('MOVIMIENTOS', [['ID', 'FECHA', 'ACCION', 'ID EQUIPO', 'ID LINEA', 'ID ASIGNACION', 'COMENTARIO', 'TICKET', 'DOCUMENTO', 'CAMBIOS', 'QUIEN', 'ORIGEN']]),
    'INSPECCIONES LINEAS': hojaFalsa('INSPECCIONES LINEAS', [['ID', 'ID LINEA'], ['ILI-1', 'LIN-V1'], ['ILI-2', 'APP1'], ['ILI-3', 'EQU-1'], ['ILI-4', 'ZZZ'], ['ILI-5', '']]),
    'RESPONSIVAS LINEAS': hojaFalsa('RESPONSIVAS LINEAS', [['ID', 'ID LINEA'], ['RLI-1', 'app3']]),
    APP_EVIDENCIAS: hojaFalsa('APP_EVIDENCIAS', [['ID', 'ID_LINEA'], ['EVI-1', 'LIN-V2']]),
    APP_RESGUARDOS: hojaFalsa('APP_RESGUARDOS', [['ID', 'REGISTRO_ID'], ['RSG-1', 'LIN-V3']]),
    APP_NOTIFICACIONES: hojaFalsa('APP_NOTIFICACIONES', [['ID', 'CLAVE', 'REF_ID'], ['NTF-1', 'ADENDUM|LIN-V2|2026-10-10', 'LIN-V2']]),
  };
  const props = { LINEAS_LECTURA: 'ESTRUCTURA' };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => props[k] || null, setProperty: (k, x) => { props[k] = x; } }) };
  const ss = { getSheetByName: (n) => hojas[n] || null };
  let n = 0;
  const LineasLectura = {
    HOJA_VIEJA: 'LINEAS TELEFONICAS', PROPIEDAD_RETIRADA: 'LINEAS_HOJA_VIEJA_RETIRADA',
    activo: () => true, retirada: () => props.LINEAS_HOJA_VIEJA_RETIRADA || null, limpiarCaches: () => {},
  };
  const fuente = 'const ESTRUCTURA_ES_CODIGO_RESGUARDO = /^([A-Z]{1,3}\\d?-?\\d{3,}( ?\\(\\d{1,2}\\/\\d{1,2}\\/\\d{4}\\))?)(?=$|[\\s\\-–(])/;' +
    leer('LineasRetiro.gs') + '; return { revisar: reestructuraRetiroRevisar, aplicar: reestructuraRetiroAplicar };';
  const m = new Function('SpreadsheetApp', 'PropertiesService', 'LineasLectura', 'LineasRepo', 'LineasDatos', 'Ids', 'soloEditor_', 'leerConfig_', 'console', fuente)(
    { openById: () => ss, flush: () => {} }, PropertiesService, LineasLectura,
    { TAB: { MOV: 'MOVIMIENTOS' }, asegurarPestanaApp: () => {} }, { tocar: () => {} },
    { nuevo: (p) => p + '-NUEVO' + (++n) }, () => {}, () => 'BASE', { log: () => {} });
  const col = (h, nombre) => hojas[h].valores[0].indexOf(nombre);
  const celda = (h, fila, nombre) => hojas[h].valores[fila][col(h, nombre)];
  return { hojas, props, m, col, celda };
}

test('retiro: la revisión dice qué haría y no escribe nada', () => {
  const t = cargar();
  const r = t.m.revisar();
  assert.match(r, /Hoja vieja: 3 filas · 3 con su registro nuevo · 0 sin registro nuevo/);
  assert.match(r, /INSPECCIONES LINEAS\.ID LINEA: 2 al ID nuevo · 1 ya tenían el nuevo · 1 sin registro/);
  assert.match(r, /no se escribió nada/);
  Object.keys(t.hojas).forEach((h) => assert.strictEqual(t.hojas[h].escrituras, 0, h));
  assert.strictEqual(t.hojas['LINEAS TELEFONICAS'].oculta, false);
  assert.strictEqual(t.props.LINEAS_HOJA_VIEJA_RETIRADA, undefined);
});

test('retiro: copia lo que se leía de la hoja vieja, pasa las referencias al ID nuevo y la oculta', () => {
  const t = cargar();
  t.m.aplicar();
  // Rutas del AppSheet en el equipo; NUCO viejo en la línea sin equipo
  assert.strictEqual(t.celda('EQUIPOS', 1, 'RESPONSIVA'), 'RESP_Files_/r.pdf');
  assert.strictEqual(t.celda('EQUIPOS', 2, 'FORMATO INSPECCION'), 'INSP_Files_/i.pdf');
  assert.strictEqual(t.celda('LINEAS', 2, 'NUCO ANTERIOR'), '0500');
  assert.strictEqual(t.celda('LINEAS', 1, 'NUCO ANTERIOR'), '');
  // Referencias: el ID de hoy, el de antes y el del AppSheet (sin importar mayúsculas) llevan al nuevo
  assert.deepStrictEqual(t.hojas['INSPECCIONES LINEAS'].valores.slice(1).map((f) => f[1]), ['EQU-1', 'EQU-1', 'EQU-1', 'ZZZ', '']);
  assert.strictEqual(t.celda('RESPONSIVAS LINEAS', 1, 'ID LINEA'), 'EQU-3');
  assert.strictEqual(t.celda('APP_EVIDENCIAS', 1, 'ID_LINEA'), 'LIN-2');
  assert.strictEqual(t.celda('APP_RESGUARDOS', 1, 'REGISTRO_ID'), 'EQU-3');
  assert.strictEqual(t.celda('APP_NOTIFICACIONES', 1, 'REF_ID'), 'LIN-2');
  assert.strictEqual(t.celda('APP_NOTIFICACIONES', 1, 'CLAVE'), 'ADENDUM|LIN-2|2026-10-10'); // la clave del aviso no se duplica
  // La última persona de lo que no tiene asignación: cerrada, sin el código de resguardo; el que tiene asignación no cambia
  const nuevas = t.hojas.ASIGNACIONES.valores.slice(2);
  assert.strictEqual(nuevas.length, 2);
  const de = (id) => nuevas.find((f) => f[t.col('ASIGNACIONES', 'ID EQUIPO')] === id || f[t.col('ASIGNACIONES', 'ID LINEA')] === id);
  assert.strictEqual(de('EQU-3')[t.col('ASIGNACIONES', 'RESPONSABLE')], '');
  assert.strictEqual(de('EQU-3')[t.col('ASIGNACIONES', 'TIPO')], 'RESGUARDO');
  assert.strictEqual(de('EQU-3')[t.col('ASIGNACIONES', 'SEDE')], 'CANCUN');
  assert.strictEqual(de('LIN-2')[t.col('ASIGNACIONES', 'RESPONSABLE')], 'ROSA');
  assert.strictEqual(de('LIN-2')[t.col('ASIGNACIONES', 'DEPARTAMENTO')], ''); // N/A en blanco, como en la migración
  assert.ok(de('LIN-2')[t.col('ASIGNACIONES', 'FECHA FIN')] instanceof Date);
  // El comentario viejo, un renglón de MOVIMIENTOS con el equipo y su línea
  const mov = t.hojas.MOVIMIENTOS.valores.slice(1);
  assert.strictEqual(mov.length, 1);
  const c = (nombre) => mov[0][t.col('MOVIMIENTOS', nombre)];
  assert.deepStrictEqual([c('ACCION'), c('ID EQUIPO'), c('ID LINEA'), c('COMENTARIO'), c('ORIGEN'), c('FECHA')],
    ['COMENTARIO_ANTERIOR', 'EQU-1', 'LIN-A', 'SE ENTREGÓ CON FUNDA', 'MIGRACION', '']);
  // Oculta (no borrada) y retirada: no se vuelve a correr
  assert.strictEqual(t.hojas['LINEAS TELEFONICAS'].oculta, true);
  assert.ok(/^\d{4}-/.test(t.props.LINEAS_HOJA_VIEJA_RETIRADA));
  assert.throws(() => t.m.aplicar(), /ya se retiró/);
});

test('retiro: con la hoja retirada no se rearma la estructura ni se vuelve a leer la hoja vieja', () => {
  assert.match(leer('LineasEstructura.gs'), /function reestructuraArmarEstructura\(\) \{\s*soloEditor_\(\);\s*\/\/[^\n]*\n\s*if \(LineasLectura\.retirada\(\)\) throw/);
  assert.match(leer('LineasLectura.gs'), /function reestructuraLeerHojaVieja\(\) \{\s*soloEditor_\(\);\s*if \(LineasLectura\.retirada\(\)\) throw/);
  assert.match(leer('LineasLectura.gs'), /const vieja = retirada\(\) \? \{\} : vieja_\(\);/);
});
