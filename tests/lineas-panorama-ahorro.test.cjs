const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasPanorama → ahorroCancelaciones_ (2-nov): la hoja «Cancelaciones» del reporte de Líneas, calculada por el sistema con
// LINEAS (estatus CANCELADA) y FACTURAS (lo cobrado a cada número, mes por mes). Renta × meses sin pagar − penalización.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPanorama.gs'), 'utf8');
const P = new Function('LineasDatos', 'LineasRepo', 'LineasUtil', 'Utilities', fuente + '; return LineasPanorama;')(
  { ZONA_APP: 'America/Mexico_City', normCol: (v) => String(v || '').trim().toUpperCase() }, {}, {}, {});

const MESES = ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03'];
const num = (meses, detalle) => ({ cuenta: 'AT&T', meses: meses, detalle: detalle || {} });
const linea = (numero, est, extra) => Object.assign({ numero: numero, estatus: est, cuenta: 'AT&T', costo: 0 }, extra);

test('cobrada hasta diciembre: renta × los meses que ya no se pagaron (ene a mar)', () => {
  const r = P._ahorroCancelaciones({ '4420000001': num({ '2025-11': 299, '2025-12': 299 }) }, MESES, [linea('4420000001', 'CANCELADA')]);
  assert.deepStrictEqual(r.lista, [['4420000001', 'AT&T', 299, 'Factura', '2025-12', 3, 0, 897]]);
  assert.deepStrictEqual([r.lineas, r.conAhorro, r.rentaMensual, r.bruto, r.neto], [1, 1, 299, 897, 897]);
  assert.deepStrictEqual(r.porMes, { '2026-01': 299, '2026-02': 299, '2026-03': 299 });
  assert.deepStrictEqual([r.desde, r.hasta], ['2025-11', '2026-03']);
});

test('un crédito o una renta en $0.00 no es pago; la penalización se resta', () => {
  const r = P._ahorroCancelaciones({
    '4420000002': num({ '2025-11': 229, '2025-12': 229, '2026-01': -45.8 }),
    // Enero solo trae la penalización (la renta vino en $0.00): el último pago es diciembre
    '4420000003': num({ '2025-11': 269, '2025-12': 269, '2026-01': 406.12 }, { '2026-01': { penal: 400, rentaCero: true } }),
  }, MESES, [linea('4420000002', 'CANCELADA'), linea('4420000003', 'CANCELADA')]);
  const de = {};
  r.lista.forEach((x) => { de[x[0]] = x; });
  assert.deepStrictEqual(de['4420000002'].slice(4), ['2025-12', 3, 0, 687]);
  assert.deepStrictEqual(de['4420000003'].slice(4), ['2025-12', 3, 400, 407]);
  assert.strictEqual(r.penalizaciones, 400);
  assert.strictEqual(r.neto, 687 + 407);
});

test('nunca facturada: todos los meses, con la renta del plan del inventario; sin renta no suma', () => {
  const r = P._ahorroCancelaciones({}, MESES, [linea('4420000004', 'CANCELADA', { costo: 239 }), linea('4420000005', 'CANCELADA')]);
  const de = {};
  r.lista.forEach((x) => { de[x[0]] = x; });
  assert.deepStrictEqual(de['4420000004'].slice(2), [239, 'Plan del inventario', '', 5, 0, 1195]);
  assert.deepStrictEqual(de['4420000005'].slice(2), [0, 'Sin dato', '', 5, 0, 0]);
  assert.deepStrictEqual([r.conAhorro, r.sinRenta], [1, 1]);
});

test('cobrada en la última factura: cuenta como cancelada, todavía sin ahorro', () => {
  const r = P._ahorroCancelaciones({ '4420000006': num({ '2026-02': 351.78, '2026-03': 351.78 }) }, MESES, [linea('4420000006', 'CANCELADA')]);
  assert.deepStrictEqual([r.lineas, r.aunSinAhorro, r.neto], [1, 1, 0]);
});

test('solo cuentan las CANCELADA, un número una vez y la renta es el cobro más frecuente', () => {
  const r = P._ahorroCancelaciones({ '4420000007': num({ '2025-11': 242.11, '2025-12': 242.11, '2026-01': 300 }) }, MESES, [
    linea('4420000007', 'CANCELADA'), linea('4420000007', 'CANCELADA'), linea('4420000008', 'USO'), linea('4420000009', 'EN PROCESO DE CANCELACION'),
  ]);
  assert.strictEqual(r.lineas, 1);
  assert.strictEqual(r.lista[0][2], 242.11);
});

test('sin meses de factura o sin canceladas, null', () => {
  assert.strictEqual(P._ahorroCancelaciones({}, [], [linea('1', 'CANCELADA')]), null);
  assert.strictEqual(P._ahorroCancelaciones({}, MESES, [linea('4420000008', 'USO')]), null);
});
