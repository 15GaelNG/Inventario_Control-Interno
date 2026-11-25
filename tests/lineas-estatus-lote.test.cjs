const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasEstatusLote.gs: cambiar el estatus de varios equipos desde el editor, leyendo las decisiones de un libro. Se
// prueba con las hojas en memoria y el guardado de verdad (LineasEscritura), como en lineas-escritura.test.cjs.
const leer = (archivo) => fs.readFileSync(path.join(__dirname, '../src/services/lineas', archivo), 'utf8');

function cargar(decisiones, opciones) {
  const hojas = {
    'LINEAS TELEFONICAS': [],
    EQUIPOS: [
      { 'ID': 'EQU-1', 'NUCO': '0015', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'HUAWEI Y9S', 'ESTATUS EQUIPO': 'FUERA DE INVENTARIO' },
      { 'ID': 'EQU-2', 'NUCO': '0193', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'OPPO A17', 'ESTATUS EQUIPO': 'FUERA DE INVENTARIO' },
      { 'ID': 'EQU-3', 'NUCO': '0300', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO', 'ESTATUS EQUIPO': 'VENDIDO' },
      { 'ID': 'EQU-4', 'NUCO': '0400', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO', 'ESTATUS EQUIPO': 'USO' },
      { 'ID': 'EQU-5', 'NUCO': '10009', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'REDMI 9A', 'ESTATUS EQUIPO': 'FUERA DE INVENTARIO' },
      { 'ID': 'EQU-6', 'NUCO': '0600', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO G20', 'ESTATUS EQUIPO': 'RESGUARDO' },
      { 'ID': 'EQU-7', 'NUCO': '0700', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO G20', 'ESTATUS EQUIPO': 'RESGUARDO' },
      { 'ID': 'EQU-8', 'NUCO': '0800', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO G20', 'ESTATUS EQUIPO': 'POR RECIBIR' },
    ],
    LINEAS: [{ 'ID': 'LIN-A', 'NUMERO TELEFONO': '4421090805', 'TIPO DE LINEA': 'PLAN', 'ESTATUS LINEA': 'USO' }],
    ASIGNACIONES: [
      { 'ID': 'ASG-1', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-A', 'ID EQUIPO': 'EQU-4', 'RESPONSABLE': 'DANAE', 'FECHA INICIO': new Date('2026-01-01T12:00:00Z'), 'FECHA FIN': '' },
    ],
    ADENDUMS: [],
    // El renglón abierto de Resguardos y cancelaciones (solo el de EQU-6)
    APP_RESGUARDOS: [{ 'REGISTRO_ID': 'EQU-6', 'ESTADO': 'EN RESGUARDO', 'ESTATUS_EQUIPO': 'RESGUARDO' }],
  };
  const lecturasPanel = [];
  const LineasResguardos = {
    abiertosParaLote: () => { lecturasPanel.push(1); return { 'EQU-6': Object.assign({ _fila: 2 }, hojas.APP_RESGUARDOS[0]) }; },
    estatusEnPanel: (abiertos, f, estatus, ahora) => {
      const a = abiertos[f['ID']];
      if (!a) return '';
      Object.assign(hojas.APP_RESGUARDOS[a._fila - 2], { 'ESTATUS_EQUIPO': estatus, 'ACTUALIZADO_EN': ahora });
      return a['ESTADO'];
    },
  };
  const movimientos = [];
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City',
    existeTabla: (n) => !!hojas[n],
    leerTabla: (n) => (hojas[n] || []).map((f, i) => Object.assign({ _fila: i + 2 }, f)),
    actualizarFila: (n, fila, cambios) => { Object.assign(hojas[n][fila - 2], cambios); },
    agregarFilas: (n, objetos) => objetos.map((o) => { hojas[n].push(Object.assign({}, o)); return hojas[n].length + 1; }),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN|_EN$/i.test(h),
    normCol: (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim(),
    olvidarTabla: () => {}, cacheBorrar: () => {}, tocar: () => {}, cacheLeer: () => null, cacheGuardar: () => {},
    buscarFilas: (n, col, valor) => (hojas[n] || []).map((f, i) => (String(f[col]) === valor ? i + 2 : 0)).filter(Boolean),
    leerFilas: (pedidos) => pedidos.map((p) => p.filas.map((i) => Object.assign({ _fila: i }, hojas[p.tabla][i - 2]))),
    conCandado: (fn) => fn(),
  };
  let n = 0;
  const Ids = { nuevo: (p) => p + '-NUEVO' + (++n) };
  const Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
  const base = new Function('LineasDatos', 'LineasRepo', 'Ids', 'Utilities', 'soloEditor_',
    leer('LineasUtil.gs') + ';' + leer('LineasEstructura.gs') + ';' + leer('LineasLectura.gs') + ';' + leer('LineasEscritura.gs') +
    '; return { LineasUtil, LineasLectura, LineasEscritura };')(
    LineasDatos, { DEPARTAMENTO_DISPONIBLE: 'DISPONIBLE', folioRegistro: (t, x) => t + x, borrarCaches: () => {} }, Ids, Utilities, () => {});
  const LineasRepo = {
    leerRegistroObligatorio: (id) => base.LineasLectura.filas().find((f) => f['ID'] === id),
    convertirRegistro: (f) => Object.assign({}, f),
    guardarCambiosRegistro: (f, cambios, usuario, ahora, o) => {
      const r = base.LineasEscritura.guardar(f, cambios, usuario, ahora, o);
      base.LineasLectura.olvidar();
      return r;
    },
    registrarMovimiento: (tipo, datos, usuario, ahora, extra) => movimientos.push({ tipo, datos, usuario, extra }),
    refrescarIndice: () => {},
  };
  const encabezados = ['GRUPO', 'NUCO', 'ESTATUS ACTUAL', 'ESTATUS NUEVO', 'COMENTARIO'];
  const tabla = [encabezados].concat(decisiones.map((d) => encabezados.map((c) => d[c] || '')));
  const hoja = {
    getLastColumn: () => encabezados.length,
    getRange: () => ({ getDisplayValues: () => [encabezados] }),
    getDataRange: () => ({ getDisplayValues: () => tabla }),
  };
  const SpreadsheetApp = { openById: () => ({ getName: () => 'Decisiones', getSheets: () => [hoja] }) };
  const Session = { getActiveUser: () => ({ getEmail: () => 'quien@x' }) };
  const Config = { ENTORNO: (opciones && opciones.entorno) || 'DEV' };
  const registros = [];
  const Logger = { log: (t) => registros.push(t) };
  const propiedades = Object.assign({}, (opciones && opciones.propiedades) || {});
  const PropertiesService = { getScriptProperties: () => ({
    getProperty: (k) => (k in propiedades ? propiedades[k] : null), deleteProperty: (k) => { delete propiedades[k]; } }) };
  const m = new Function('LineasDatos', 'LineasRepo', 'LineasLectura', 'LineasUtil', 'LineasResguardos', 'SpreadsheetApp', 'Session', 'Config', 'Logger', 'PropertiesService', 'soloEditor_',
    leer('LineasEstatusLote.gs') + '; return { lineasEstatusLoteRevisar, lineasEstatusLoteAplicar };')(
    LineasDatos, LineasRepo, base.LineasLectura, base.LineasUtil, LineasResguardos, SpreadsheetApp, Session, Config, Logger, PropertiesService, () => {});
  return { m, hojas, movimientos, propiedades, lecturasPanel, log: () => registros.join('\n') };
}

const DECISIONES = [
  { 'NUCO': '15', 'ESTATUS ACTUAL': 'FUERA DE INVENTARIO', 'ESTATUS NUEVO': 'VENDIDO', 'COMENTARIO': 'VENTA DEL 08-OCT-2025' },
  { 'NUCO': '0193', 'ESTATUS ACTUAL': 'FUERA DE INVENTARIO', 'ESTATUS NUEVO': 'DESECHADO', 'COMENTARIO': 'DESECHOS DE RELACIÓN R1' },
];

test('revisar no escribe nada y dice qué haría', () => {
  const t = cargar(DECISIONES);
  const r = t.m.lineasEstatusLoteRevisar('libro');
  assert.match(r, /REVISIÓN.*2 se cambiarían/);
  assert.strictEqual(t.hojas.EQUIPOS[0]['ESTATUS EQUIPO'], 'FUERA DE INVENTARIO');
  assert.strictEqual(t.movimientos.length, 0);
});

test('aplicar cambia el estatus y deja un movimiento EDICION con el comentario', () => {
  const t = cargar(DECISIONES);
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /APLICADO.*2 cambiados.*0 con error/);
  assert.strictEqual(t.hojas.EQUIPOS[0]['ESTATUS EQUIPO'], 'VENDIDO');
  assert.strictEqual(t.hojas.EQUIPOS[1]['ESTATUS EQUIPO'], 'DESECHADO');
  assert.deepStrictEqual(t.movimientos.map((x) => [x.tipo, x.datos.motivo, x.extra.nuco]),
    [['EDICION', 'VENTA DEL 08-OCT-2025', '0015'], ['EDICION', 'DESECHOS DE RELACIÓN R1', '0193']]);
  assert.strictEqual(t.movimientos[0].usuario.correo, 'quien@x');
});

test('se puede correr otra vez: lo que ya tiene el estatus nuevo se salta', () => {
  const t = cargar(DECISIONES);
  t.m.lineasEstatusLoteAplicar('libro');
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /0 cambiados · 2 ya estaban/);
  assert.strictEqual(t.movimientos.length, 2);
});

test('no toca lo que no cuadra: estatus no permitido, sin comentario, NUCO que no existe, estatus distinto o con línea', () => {
  const t = cargar([
    { 'NUCO': '0015', 'ESTATUS NUEVO': 'EN TRÁNSITO', 'COMENTARIO': 'NO SE PERMITE' },
    { 'NUCO': '0193', 'ESTATUS NUEVO': 'DONADO', 'COMENTARIO': '' },
    { 'NUCO': '9999', 'ESTATUS NUEVO': 'DONADO', 'COMENTARIO': 'NO EXISTE' },
    { 'NUCO': '10009', 'ESTATUS ACTUAL': 'USO', 'ESTATUS NUEVO': 'DONADO', 'COMENTARIO': 'OTRO ESTATUS' },
    { 'NUCO': '0400', 'ESTATUS NUEVO': 'VENDIDO', 'COMENTARIO': 'TIENE LÍNEA' },
  ]);
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /0 cambiados.*5 con error/);
  assert.match(t.log(), /estatus nuevo «EN TRANSITO»/);
  assert.match(t.log(), /comentario es obligatorio/);
  assert.match(t.log(), /no hay equipo con ese NUCO/);
  assert.match(t.log(), /está FUERA DE INVENTARIO y el libro dice USO/);
  assert.match(t.log(), /tiene línea/);
  assert.deepStrictEqual(t.hojas.EQUIPOS.map((e) => e['ESTATUS EQUIPO']), ['FUERA DE INVENTARIO', 'FUERA DE INVENTARIO', 'VENDIDO', 'USO', 'FUERA DE INVENTARIO', 'RESGUARDO', 'RESGUARDO', 'POR RECIBIR']);
  assert.strictEqual(t.movimientos.length, 0);
});

test('un NUCO repetido en el libro solo se aplica una vez', () => {
  const t = cargar([DECISIONES[0], Object.assign({}, DECISIONES[0], { 'ESTATUS NUEVO': 'DONADO' })]);
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /1 cambiados.*1 con error/);
  assert.strictEqual(t.hojas.EQUIPOS[0]['ESTATUS EQUIPO'], 'VENDIDO');
});

test('en producción no aplica sin la confirmación', () => {
  const t = cargar(DECISIONES, { entorno: 'PROD' });
  assert.throws(() => t.m.lineasEstatusLoteAplicar('libro'), /SI, EN PROD/);
  assert.match(t.m.lineasEstatusLoteAplicar('libro', 'SI, EN PROD'), /2 cambiados/);
});

test('desde el botón Ejecutar: el libro y la confirmación salen de las propiedades, y la confirmación se borra', () => {
  const t = cargar(DECISIONES, { entorno: 'PROD', propiedades: { LINEAS_LOTE_LIBRO: 'libro' } });
  assert.match(t.m.lineasEstatusLoteRevisar({}), /2 se cambiarían/);
  assert.throws(() => t.m.lineasEstatusLoteAplicar({}), /LINEAS_LOTE_CONFIRMACION/);
  t.propiedades.LINEAS_LOTE_CONFIRMACION = 'SI, EN PROD';
  assert.match(t.m.lineasEstatusLoteAplicar({}), /2 cambiados/);
  assert.strictEqual('LINEAS_LOTE_CONFIRMACION' in t.propiedades, false);
  assert.throws(() => t.m.lineasEstatusLoteAplicar({}), /LINEAS_LOTE_CONFIRMACION/);
});

const ALMACEN = [
  { 'NUCO': '0600', 'ESTATUS ACTUAL': 'RESGUARDO', 'ESTATUS NUEVO': 'PARA VENTA', 'COMENTARIO': 'GAMA BAJA A VENTA' },
  { 'NUCO': '0700', 'ESTATUS ACTUAL': 'RESGUARDO', 'ESTATUS NUEVO': 'PARA VENTA', 'COMENTARIO': 'GAMA BAJA A VENTA' },
];

test('dentro del almacén: RESGUARDO → PARA VENTA, y el renglón abierto del panel dice lo mismo', () => {
  const t = cargar(ALMACEN);
  assert.match(t.m.lineasEstatusLoteRevisar('libro'), /2 se cambiarían/);
  assert.strictEqual(t.lecturasPanel.length, 0, 'revisar no lee ni toca el panel');
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /APLICADO.*2 cambiados.*0 con error/);
  assert.deepStrictEqual(t.hojas.EQUIPOS.slice(5, 7).map((e) => e['ESTATUS EQUIPO']), ['PARA VENTA', 'PARA VENTA']);
  assert.strictEqual(t.hojas.APP_RESGUARDOS[0]['ESTATUS_EQUIPO'], 'PARA VENTA');
  assert.strictEqual(t.hojas.APP_RESGUARDOS.length, 1, 'no crea renglones nuevos por recibir');
  assert.strictEqual(t.lecturasPanel.length, 1, 'el panel se lee una sola vez');
  assert.match(t.log(), /NUCO 0600: RESGUARDO → PARA VENTA \(y su renglón EN RESGUARDO del panel\)/);
  assert.match(t.log(), /NUCO 0700: RESGUARDO → PARA VENTA$/m);
  assert.deepStrictEqual(t.movimientos.map((x) => [x.tipo, x.datos.motivo]), [['EDICION', 'GAMA BAJA A VENTA'], ['EDICION', 'GAMA BAJA A VENTA']]);
});

test('a un estatus del almacén solo llega un equipo ya guardado: desde USO o POR RECIBIR, no', () => {
  const t = cargar([
    { 'NUCO': '10009', 'ESTATUS NUEVO': 'PARA VENTA', 'COMENTARIO': 'FUERA DE INVENTARIO' },
    { 'NUCO': '0800', 'ESTATUS NUEVO': 'PARA VENTA', 'COMENTARIO': 'AÚN NO LO RECIBEN' },
  ]);
  const r = t.m.lineasEstatusLoteAplicar('libro');
  assert.match(r, /0 cambiados.*2 con error/);
  assert.match(t.log(), /NUCO 10009: está FUERA DE INVENTARIO: a PARA VENTA solo pasa un equipo ya guardado/);
  assert.match(t.log(), /NUCO 0800: está POR RECIBIR/);
  assert.strictEqual(t.hojas.EQUIPOS[7]['ESTATUS EQUIPO'], 'POR RECIBIR');
});
