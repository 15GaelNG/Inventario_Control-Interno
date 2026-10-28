const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Reestructura, etapa 2 (LineasLectura.gs): LINEAS TELEFONICAS se lee armada con las hojas nuevas.
// Un renglón por equipo (con su asignación vigente y la línea de esa asignación) y uno por línea que no quedó con un
// equipo; con los mismos nombres de columna de la hoja vieja.
function cargar(hojas) {
  const LineasDatos = {
    existeTabla: (n) => !!hojas[n],
    leerTabla: (n) => (hojas[n] || []).map((f) => Object.assign({}, f)),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN|_EN$/i.test(h),
    normCol: (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim(),
    olvidarTabla: () => {}, cacheBorrar: () => {}, tocar: () => {},
    // El alta sale del movimiento ALTA de MOVIMIENTOS (pendiente 2.51)
    cacheLeer: () => null, cacheGuardar: () => {},
    buscarFilas: (n, col, valor) => (hojas[n] || []).map((f, i) => (String(f[col]) === valor ? i + 2 : 0)).filter(Boolean),
    leerFilas: (pedidos) => pedidos.map((p) => p.filas.map((i) => Object.assign({ _fila: i }, hojas[p.tabla][i - 2]))),
  };
  const LineasRepo = { folioRegistro: (tipo, nuco) => (tipo === 'EQUIPO + SIM' ? 'EQS' : 'X') + nuco, borrarCaches: () => {} };
  const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasLectura.gs'), 'utf8');
  return new Function('LineasDatos', 'LineasRepo', fuente + '; return LineasLectura;')(LineasDatos, LineasRepo);
}

const HOJAS = {
  LINEAS: [
    { 'ID': 'LIN-A', 'ID ANTERIOR': '', 'NUMERO TELEFONO': '4421090805', 'TIPO DE LINEA': 'PLAN', 'ESTATUS LINEA': 'USO', 'COMPAÑIA': 'AT&T' },
    { 'ID': 'LIN-B', 'ID ANTERIOR': 'LIN-VIEJO3', 'NUCO ANTERIOR': '1500', 'NUMERO TELEFONO': '4461456538', 'TIPO DE LINEA': 'SIM BASICO', 'ESTATUS LINEA': 'USO' },
  ],
  EQUIPOS: [
    { 'ID': 'EQU-1', 'ID ANTERIOR': 'LIN-VIEJO1', 'ID APPSHEET': '873bb085', 'NUCO': '0012', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'USO', 'MODELO': 'HONOR', 'COMENTARIOS': 'nota vieja' },
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

test('solo LINEAS TELEFONICAS es virtual (ya no hay interruptor: 7.13)', () => {
  const L = cargar(HOJAS);
  assert.strictEqual(L.esVirtual('LINEAS TELEFONICAS'), true);
  assert.strictEqual(L.esVirtual('INSPECCIONES LINEAS'), false);
});

test('un renglón por equipo y uno por línea sin equipo, con las columnas de la hoja vieja', () => {
  const L = cargar(HOJAS);
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
  assert.strictEqual(r1['COMENTARIOS'], 'nota vieja'); // del equipo (la hoja vieja ya no se lee)
  assert.strictEqual(r1['JEFE DIRECTO'], ''); // decisión: el jefe solo va en la inspección
  const r3 = f.find((x) => x['ID'] === 'LIN-B');
  assert.strictEqual(r3['TIPO'], 'SIM BASICO');
  assert.strictEqual(r3['NUCO'], '1500'); // la línea sin equipo: su NUCO ANTERIOR, para sus documentos
});

test('sin asignación vigente ni asignación cerrada: sin persona; vendido sin departamento (antes N/A; usuario, 22-oct)', () => {
  const L = cargar(HOJAS);
  const r2 = L.filas().find((x) => x['ID'] === 'EQU-2');
  assert.strictEqual(r2['RESPONSABLE'], '');
  assert.strictEqual(r2['NOMBRE QUIEN USA'], undefined, '«quien lo usa» se quitó (6-oct)');
  assert.strictEqual(r2['DEPARTAMENTO'], '');
  assert.strictEqual(r2['TIPO'], 'EQUIPO');
});

test('buscar por columna y por ID anterior', () => {
  const L = cargar(HOJAS);
  assert.deepStrictEqual(L.buscar('ID ANTERIOR', 'lin-viejo1').map((n) => L.porNumero(n)['ID']), ['EQU-1']);
  assert.deepStrictEqual(L.buscar('NUMERO TELEFONO', '4461456538').map((n) => L.porNumero(n)['ID']), ['LIN-B']);
});

test('LINEAS TELEFONICAS ya no se escribe (desde la etapa 3 se escribe en las hojas nuevas)', () => {
  const L = cargar(HOJAS);
  assert.throws(() => L.bloquearEscritura(), /ya no se escribe/);
});

test('TIPO de la hoja vieja a partir de los tipos nuevos', () => {
  const L = cargar(HOJAS);
  const e = (t) => ({ 'TIPO DE EQUIPO': t });
  const l = (t) => ({ 'TIPO DE LINEA': t });
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), l('PLAN')), 'EQUIPO + SIM');
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), l('SIM BASICO')), 'EQUIPO + SIM BASICO');
  assert.strictEqual(L.tipoViejo_(e('MODEM'), l('BANDA ANCHA')), 'BANDA ANCHA');
  assert.strictEqual(L.tipoViejo_(e('MODEM'), null), 'MODEM');
  assert.strictEqual(L.tipoViejo_(e('CELULAR'), null), 'EQUIPO');
  assert.strictEqual(L.tipoViejo_(null, l('PLAN')), 'LINEA');
  assert.strictEqual(L.tipoViejo_(null, l('SIM BASICO')), 'SIM BASICO');
});
