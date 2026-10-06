const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Reestructura, etapa 2 (LineasLectura.gs): LINEAS TELEFONICAS se lee armada con las hojas nuevas.
// Un renglón por equipo (con su asignación vigente y la línea de esa asignación) y uno por línea que no quedó con un
// equipo; con los mismos nombres de columna de la hoja vieja.
function cargar(hojas, encendido) {
  const LineasDatos = {
    existeTabla: (n) => !!hojas[n],
    leerTabla: (n) => (hojas[n] || []).map((f) => Object.assign({}, f)),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN|_EN$/i.test(h),
    normCol: (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim(),
    olvidarTabla: () => {}, cacheBorrar: () => {}, tocar: () => {},
  };
  const LineasRepo = { folioRegistro: (tipo, nuco) => (tipo === 'EQUIPO + SIM' ? 'EQS' : 'X') + nuco, borrarCaches: () => {} };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: () => (encendido ? 'ESTRUCTURA' : null) }) };
  const ESTRUCTURA_ES_CODIGO_RESGUARDO = /^([A-Z]{1,3}\d?-?\d{3,}( ?\(\d{1,2}\/\d{1,2}\/\d{4}\))?)(?=$|[\s\-–(])/;
  const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasLectura.gs'), 'utf8');
  return new Function('LineasDatos', 'LineasRepo', 'PropertiesService', 'ESTRUCTURA_ES_CODIGO_RESGUARDO', 'soloEditor_',
    fuente + '; return LineasLectura;')(LineasDatos, LineasRepo, PropertiesService, ESTRUCTURA_ES_CODIGO_RESGUARDO, () => {});
}

const HOJAS = {
  'LINEAS TELEFONICAS': [
    { 'ID': 'LIN-VIEJO1', 'NUCO': '0012', 'COMENTARIOS': 'nota vieja', 'RESPONSABLE': 'ANA' },
    { 'ID': 'LIN-VIEJO2', 'NUCO': '0001', 'RESPONSABLE': 'R1-0006', 'DEPARTAMENTO': 'VENTAS', 'NOMBRE QUIEN USA': 'Y2-0001' },
    { 'ID': 'LIN-VIEJO3', 'NUCO': '1500', 'RESPONSABLE': 'LUIS' },
  ],
  LINEAS: [
    { 'ID': 'LIN-A', 'ID ANTERIOR': '', 'NUMERO TELEFONO': '4421090805', 'TIPO DE LINEA': 'PLAN', 'ESTATUS LINEA': 'USO', 'COMPAÑIA': 'AT&T' },
    { 'ID': 'LIN-B', 'ID ANTERIOR': 'LIN-VIEJO3', 'NUMERO TELEFONO': '4461456538', 'TIPO DE LINEA': 'SIM BASICO', 'ESTATUS LINEA': 'USO' },
  ],
  EQUIPOS: [
    { 'ID': 'EQU-1', 'ID ANTERIOR': 'LIN-VIEJO1', 'ID APPSHEET': '873bb085', 'NUCO': '0012', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'USO', 'MODELO': 'HONOR' },
    { 'ID': 'EQU-2', 'ID ANTERIOR': 'LIN-VIEJO2', 'NUCO': '0001', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'VENDIDO' },
  ],
  ASIGNACIONES: [
    { 'ID': 'ASG-1', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-A', 'ID EQUIPO': 'EQU-1', 'RESPONSABLE': 'DANAE', 'DEPARTAMENTO': 'COMERCIALIZACION', 'FECHA FIN': '' },
    { 'ID': 'ASG-2', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-B', 'ID EQUIPO': '', 'RESPONSABLE': 'LUIS', 'FECHA FIN': '' },
  ],
  ADENDUMS: [
    { 'ID': 'ADE-1', 'ID LINEA': 'LIN-A', 'COSTO PLAN': 449, 'FIN PLAN': new Date('2026-04-08T12:00:00Z') },
  ],
};

test('apagado: nada se lee de las hojas nuevas', () => {
  const L = cargar(HOJAS, false);
  assert.strictEqual(L.esVirtual('LINEAS TELEFONICAS'), false);
});

test('encendido: solo LINEAS TELEFONICAS es virtual', () => {
  const L = cargar(HOJAS, true);
  assert.strictEqual(L.esVirtual('LINEAS TELEFONICAS'), true);
  assert.strictEqual(L.esVirtual('INSPECCIONES LINEAS'), false);
});

test('un renglón por equipo y uno por línea sin equipo, con las columnas de la hoja vieja', () => {
  const L = cargar(HOJAS, true);
  const f = L.filas();
  assert.strictEqual(f.length, 3);
  const r1 = f.find((x) => x['ID'] === 'EQU-1');
  assert.strictEqual(r1['ID ANTERIOR'], 'LIN-VIEJO1'); // con este ID lo citan inspecciones, responsivas y bitácora
  assert.strictEqual(r1['ID APPSHEET'], '873bb085');
  assert.strictEqual(r1['TIPO'], 'EQUIPO + SIM');
  assert.strictEqual(r1['NUMERO TELEFONO'], '4421090805');
  assert.strictEqual(r1['RESPONSABLE'], 'DANAE');
  assert.strictEqual(r1['COSTO PLAN'], 449);
  assert.ok(r1['FIN PLAN'] instanceof Date, 'la fecha regresa como Date después de la caché');
  assert.strictEqual(r1['COMENTARIOS'], 'nota vieja'); // de la hoja vieja hasta la migración
  assert.strictEqual(r1['JEFE DIRECTO'], ''); // decisión: el jefe solo va en la inspección
  const r3 = f.find((x) => x['ID'] === 'LIN-B');
  assert.strictEqual(r3['TIPO'], 'LINEA BASICA');
  assert.strictEqual(r3['NUCO'], '1500'); // la línea sin equipo conserva su NUCO viejo para sus documentos
});

test('sin asignación vigente: los datos de la persona de la hoja vieja, sin códigos de resguardo y vendido con N/A', () => {
  const L = cargar(HOJAS, true);
  const r2 = L.filas().find((x) => x['ID'] === 'EQU-2');
  assert.strictEqual(r2['RESPONSABLE'], '');
  assert.strictEqual(r2['NOMBRE QUIEN USA'], undefined, '«quien lo usa» se quitó (6-oct)');
  assert.strictEqual(r2['DEPARTAMENTO'], 'N/A');
  assert.strictEqual(r2['TIPO'], 'EQUIPO');
});

test('buscar por columna y por ID anterior', () => {
  const L = cargar(HOJAS, true);
  assert.deepStrictEqual(L.buscar('ID ANTERIOR', 'lin-viejo1').map((n) => L.porNumero(n)['ID']), ['EQU-1']);
  assert.deepStrictEqual(L.buscar('NUMERO TELEFONO', '4461456538').map((n) => L.porNumero(n)['ID']), ['LIN-B']);
});

test('LINEAS TELEFONICAS ya no se escribe (desde la etapa 3 se escribe en las hojas nuevas)', () => {
  const L = cargar(HOJAS, true);
  assert.throws(() => L.bloquearEscritura(), /ya no se escribe/);
});

test('TIPO de la hoja vieja a partir de los tipos nuevos', () => {
  const L = cargar(HOJAS, true);
  const e = (t) => ({ 'TIPO DE EQUIPO': t });
  const l = (t) => ({ 'TIPO DE LINEA': t });
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), l('PLAN')), 'EQUIPO + SIM');
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), l('SIM BASICO')), 'EQUIPO + SIM BASICO');
  assert.strictEqual(L.tipoViejo_(e('MODEM'), l('BANDA ANCHA')), 'BANDA ANCHA');
  assert.strictEqual(L.tipoViejo_(e('MODEM'), null), 'MODEM');
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), null), 'EQUIPO');
  assert.strictEqual(L.tipoViejo_(null, l('PLAN')), 'LINEA');
  assert.strictEqual(L.tipoViejo_(null, l('SIM BASICO')), 'LINEA BASICA');
});
