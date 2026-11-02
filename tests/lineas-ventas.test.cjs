const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// La hoja VENTAS (2-nov): LineasVentas.gs la carga desde el editor (una fila por venta del reporte de líneas, y la llave
// ID VENTA en cada equipo con evidencia) y LineasPanorama → ventasRegistradas_ la lee para la pestaña Ventas.
const leer = (f) => fs.readFileSync(path.join(__dirname, '../src/services/lineas', f), 'utf8');

/** Un libro de Líneas en memoria: pestañas de carga (valores crudos) y tablas (objetos con _fila) */
function libroFalso({ cargaVentas, cargaEquipos, equipos, ventas }) {
  const escrito = { ventas: [], equipos: [], movimientos: [], columnas: [], limpiado: 0 };
  const tablas = { EQUIPOS: equipos, VENTAS: ventas || null };
  const pestanas = { '_CARGA VENTAS': cargaVentas, '_CARGA VENTAS EQUIPOS': cargaEquipos };
  let n = 0;
  const LineasDatos = {
    libro: () => ({ getSheetByName: (h) => (pestanas[h] ? { getDataRange: () => ({ getValues: () => pestanas[h] }) } : null) }),
    existeTabla: (h) => !!tablas[h],
    leerTabla: (h) => tablas[h] || [],
    nuevoId: () => 'VTA-' + ++n,
    conCandado: (fn) => fn(),
    asegurarPestana: () => {},
    asegurarColumnas: (h, cols) => escrito.columnas.push(h + ':' + cols.join()),
    agregarFilas: (h, filas) => { (h === 'VENTAS' ? escrito.ventas : escrito.movimientos).push(...filas); },
    actualizarFilas: (h, lista) => escrito.equipos.push(...lista),
  };
  const LineasUtil = { nucoVisible: (v) => String(v || '').replace(/^0+/, '') };
  const contexto = {
    LineasDatos, LineasUtil,
    LineasLectura: { limpiarCaches: () => escrito.limpiado++ },
    Session: { getActiveUser: () => ({ getEmail: () => 'quien@x.com' }) },
    Logger: { log: () => {} },
    Config: { ENTORNO: 'DEV' },
    soloEditor_: () => {},
  };
  const m = new Function(...Object.keys(contexto), leer('LineasVentas.gs') + '; return { LineasVentas, lineasVentasCargaRevisar, lineasVentasCargaAplicar };')(
    ...Object.values(contexto));
  return { m, escrito, contexto };
}

const ENC_V = ['REFERENCIA REPORTE', 'FECHA', 'MES REPORTE', 'COMPRADOR', 'EQUIPOS', 'IMPORTE', 'EVIDENCIA', 'COMENTARIOS'];
const ENC_E = ['NUCO', 'IMEI', 'REFERENCIA REPORTE', 'COMO SE UBICA'];
const d = (iso) => new Date(iso + 'T12:00:00-06:00');
const equipo = (fila, nuco, imei, estatus, idVenta) => ({ _fila: fila, 'ID': 'EQU-' + nuco, 'NUCO': nuco, 'IMEI': imei, 'ESTATUS EQUIPO': estatus, 'ID VENTA': idVenta || '' });

function escenario(extra) {
  return libroFalso(Object.assign({
    cargaVentas: [ENC_V,
      ['V09', d('2026-07-23'), 'jul-2026', 'COMPRADOR', 2, 7400, 'https://drive.google.com/x', 'Comprobante V09'],
      ['A1', d('2026-04-01'), 'abr-2026', 'COMPRADOR', 1, 15300, '', '']],
    cargaEquipos: [ENC_E,
      ['0512', '352161432981466', 'V09', 'Recibo firmado'],
      ['0600', '111', 'V09', 'Recibo firmado'],
      ['0700', '222', 'A1', ''],
      ['0800', '333', 'A1', 'se pasa de 1'],
      ['0900', '999', 'V09', 'IMEI distinto'],
      ['0950', '950', 'V09', 'no es VENDIDO']],
    equipos: [equipo(2, '0512', '352161432981466', 'VENDIDO'), equipo(3, '0600', '111', 'VENDIDO'), equipo(4, '0700', '222', 'VENDIDO'),
      equipo(5, '0800', '333', 'VENDIDO'), equipo(6, '0900', '123', 'VENDIDO'), equipo(7, '0950', '950', 'PARA DESECHO')],
  }, extra));
}

test('revisar no escribe nada y dice qué haría', () => {
  const { m, escrito } = escenario();
  const r = m.lineasVentasCargaRevisar();
  assert.match(r, /ventas: 2 se crearían/);
  assert.match(r, /equipos: 3 se ligarían/);
  assert.match(r, /3 con error/); // se pasa de los equipos de A1, IMEI distinto y no VENDIDO
  assert.deepStrictEqual([escrito.ventas.length, escrito.equipos.length, escrito.movimientos.length], [0, 0, 0]);
});

test('aplicar crea las ventas, liga los equipos con su ID VENTA y deja un movimiento por cada liga', () => {
  const { m, escrito } = escenario();
  m.lineasVentasCargaAplicar();
  assert.deepStrictEqual(escrito.ventas.map((v) => [v['ID'], v['REFERENCIA REPORTE'], v['MES REPORTE'], v['EQUIPOS'], v['IMPORTE']]),
    [['VTA-1', 'V09', 'jul-2026', 2, 7400], ['VTA-2', 'A1', 'abr-2026', 1, 15300]]);
  assert.deepStrictEqual(escrito.equipos, [
    { fila: 2, cambios: { 'ID VENTA': 'VTA-1' } }, { fila: 3, cambios: { 'ID VENTA': 'VTA-1' } }, { fila: 4, cambios: { 'ID VENTA': 'VTA-2' } }]);
  assert.deepStrictEqual(escrito.columnas, ['EQUIPOS:ID VENTA']);
  assert.strictEqual(escrito.movimientos.length, 3);
  const mov = escrito.movimientos[0];
  assert.strictEqual(mov['ID EQUIPO'], 'EQU-0512');
  assert.strictEqual(mov['ORIGEN'], 'CARGA VENTAS');
  assert.deepStrictEqual(JSON.parse(mov['CAMBIOS']), [{ campo: 'ID VENTA', antes: '', despues: 'VTA-1' }]);
  assert.match(mov['COMENTARIO'], /venta V09 .*Recibo firmado/);
  assert.strictEqual(escrito.limpiado, 1);
});

test('se puede correr otra vez: la venta y el equipo ya ligados se saltan', () => {
  const { m, escrito } = escenario({
    ventas: [{ 'ID': 'VTA-9', 'REFERENCIA REPORTE': 'V09', 'EQUIPOS': 2 }],
    cargaEquipos: [ENC_E, ['0512', '', 'V09', ''], ['0600', '', 'V09', '']],
    equipos: [equipo(2, '0512', '1', 'VENDIDO', 'VTA-9'), equipo(3, '0600', '2', 'VENDIDO')],
  });
  const r = m.lineasVentasCargaAplicar();
  assert.match(r, /ventas: 1 creadas, 1 ya estaban · equipos: 1 ligados, 1 ya estaban · 0 con error/);
  assert.deepStrictEqual(escrito.ventas.map((v) => v['REFERENCIA REPORTE']), ['A1']);
  assert.deepStrictEqual(escrito.equipos, [{ fila: 3, cambios: { 'ID VENTA': 'VTA-9' } }]);
});

test('en producción pide la confirmación', () => {
  const { m, contexto } = escenario();
  contexto.Config.ENTORNO = 'PROD';
  assert.throws(() => m.lineasVentasCargaAplicar(), /SI, EN PROD/);
});

test('sin la pestaña de carga, lo dice', () => {
  const { m } = escenario({ cargaVentas: null });
  assert.throws(() => m.lineasVentasCargaRevisar(), /Falta la pestaña «_CARGA VENTAS»/);
});

// ---------------- Panorama ----------------

function panorama(ventas, equipos) {
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City',
    normCol: (v) => String(v || '').trim().toUpperCase(),
    existeTabla: (h) => (h === 'VENTAS' ? !!ventas : true),
    leerTabla: (h) => (h === 'VENTAS' ? ventas : equipos),
  };
  const Utilities = {
    parseDate: (texto) => new Date(texto.replace(' ', 'T') + '-06:00'),
    formatDate: (f, z, formato) => {
      const x = new Date(f.getTime() - 6 * 3600e3).toISOString();
      return formato === 'yyyy-MM' ? x.slice(0, 7) : x.slice(0, 10);
    },
  };
  return new Function('LineasDatos', 'LineasRepo', 'LineasUtil', 'Utilities', leer('LineasPanorama.gs') + '; return LineasPanorama;')(LineasDatos, {}, {}, Utilities);
}

test('ventasRegistradas_: lo del reporte, los ligados por venta y el mes del reporte (no el de la fecha)', () => {
  const P = panorama([
    { 'ID': 'VTA-1', 'REFERENCIA REPORTE': 'C-08OCT', 'FECHA': d('2025-10-08'), 'MES REPORTE': 'nov-2025', 'COMPRADOR': 'Mayorista', 'EQUIPOS': 3, 'IMPORTE': 10400, 'EVIDENCIA': '' },
    { 'ID': 'VTA-2', 'REFERENCIA REPORTE': 'V07', 'FECHA': d('2026-07-21'), 'MES REPORTE': '', 'COMPRADOR': 'Una persona', 'EQUIPOS': 1, 'IMPORTE': 800, 'EVIDENCIA': 'https://drive.google.com/v07' },
    { 'ID': 'VTA-3', 'REFERENCIA REPORTE': 'X', 'FECHA': d('2026-08-01'), 'MES REPORTE': 'ago-2026', 'COMPRADOR': 'Otra', 'EQUIPOS': 2, 'IMPORTE': 0, 'EVIDENCIA': 'D:\\carpeta\\local.pdf' },
  ], [
    { 'ID VENTA': 'VTA-1', 'ESTATUS EQUIPO': 'VENDIDO' }, { 'ID VENTA': 'VTA-1', 'ESTATUS EQUIPO': 'VENDIDO' },
    { 'ID VENTA': 'VTA-2', 'ESTATUS EQUIPO': 'VENDIDO' }, { 'ID VENTA': 'VTA-2', 'ESTATUS EQUIPO': 'VENDIDO' }, // uno de más: no suma de más
    { 'ID VENTA': '', 'ESTATUS EQUIPO': 'VENDIDO' }, { 'ID VENTA': '', 'ESTATUS EQUIPO': 'USO' },
  ]);
  const r = P._ventasRegistradas();
  assert.deepStrictEqual(r.ventas.map((v) => [v.referencia, v.mes, v.ligados]), [['C-08OCT', '2025-11', 2], ['V07', '2026-07', 2], ['X', '2026-08', 0]]);
  assert.strictEqual(r.ventas[0].fecha, '2025-10-08');
  assert.deepStrictEqual([r.equipos, r.importe, r.ligados, r.vendidos, r.vendidosSinVenta], [6, 11200, 3, 5, 1]);
  // Quien compró 1 o 2 equipos no viaja con su nombre
  assert.deepStrictEqual(r.ventas.map((v) => v.comprador), ['MAYORISTA', 'Colaboradores (venta individual)', 'Colaboradores (venta individual)']);
  // Solo enlaces: una ruta local no sirve en la pantalla
  assert.deepStrictEqual(r.ventas.map((v) => v.evidencia), ['', 'https://drive.google.com/v07', '']);
});

test('ventasRegistradas_: sin la hoja VENTAS, null (la pestaña sigue con los movimientos)', () => {
  assert.strictEqual(panorama(null, [])._ventasRegistradas(), null);
});
