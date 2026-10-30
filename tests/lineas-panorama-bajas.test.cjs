const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasPanorama → bajasEquipos_ (30-oct): ventas, donaciones, desechos y extravíos de los equipos que ya salieron, leídos
// del comentario del movimiento que los dejó en ese estatus. Comentarios tomados tal cual de producción.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPanorama.gs'), 'utf8');

function cargar(equipos, movimientos) {
  const tablas = { EQUIPOS: equipos, MOVIMIENTOS: movimientos };
  const LineasDatos = { ZONA_APP: 'America/Mexico_City', existeTabla: (n) => !!tablas[n], leerTabla: (n) => tablas[n].map((f) => Object.assign({}, f)) };
  return new Function('LineasDatos', 'LineasRepo', 'LineasUtil', 'Utilities', fuente + '; return LineasPanorama;')(LineasDatos, {}, {}, {})._bajasEquipos();
}

const cambio = (antes, despues) => JSON.stringify([{ campo: 'ESTATUS EQUIPO', antes: antes, despues: despues }]);
const mov = (id, despues, comentario) => ({ 'ID EQUIPO': id, 'CAMBIOS': cambio('FUERA DE INVENTARIO', despues), 'COMENTARIO': comentario });

test('ventas: recibo, fecha y comprador; los de 1–2 equipos se juntan como colaboradores', () => {
  const eqs = [];
  const movs = [];
  const agregar = (id, c) => { eqs.push({ 'ID': id, 'ESTATUS EQUIPO': 'VENDIDO' }); if (c !== null) movs.push(mov(id, 'VENDIDO', c)); };
  agregar('E1', 'Vendido el 23/07/2026 a RICARDO SANCHEZ RESENDIZ · venta V09');
  agregar('E2', 'Vendido el 23/07/2026 a RICARDO SANCHEZ RESENDIZ · venta V09');
  agregar('E3', 'Vendido el 26/08/2026 a RICARDO SANCHEZ RESENDIZ · venta V13');
  agregar('E4', 'Vendido el 09/01/2026 a ARTURO TEXNA GONZALEZ · venta R1-15');
  agregar('E5', 'VENDIDO A RICARDO');
  agregar('E6', 'ASUNTO 1: 123|Informe de primera venta de celulares (08/10/2025). · ASUNTO 2: 456|Inventario de telefonos (30/09/2025) · Aprobado por la Dirección de Líneas');
  agregar('E7', 'EQUIPO FUE DEVUELTO A COLABORADORA PARA SU USO PERSONAL YA QUE CUBRIÓ LA MULTA');
  agregar('E8', null); // sin movimiento
  const v = cargar(eqs, movs).ventas;
  assert.strictEqual(v.total, 8);
  assert.strictEqual(v.sinDato, 2); // E7 (comentario que no dice venta) y E8 (sin movimiento)
  assert.deepStrictEqual(v.porMes, { '2026-07': 2, '2026-08': 1, '2026-01': 1, '2025-10': 1 });
  assert.strictEqual(v.sinFecha, 1); // "VENDIDO A RICARDO"
  assert.deepStrictEqual(v.porComprador, {
    'RICARDO SANCHEZ RESENDIZ': 3, 'Colaboradores (venta individual)': 1, 'RICARDO (sin recibo en el sistema)': 1, 'Sin comprador en el sistema': 1,
  });
  // El nombre de quien compró un solo equipo no viaja
  assert.doesNotMatch(JSON.stringify(v), /ARTURO/);
  assert.deepStrictEqual(v.recibos.map((r) => [r.recibo, r.fecha, r.comprador, r.equipos]), [
    ['Primera venta', '2025-10-08', 'Sin comprador en el sistema', 1],
    ['R1-15', '2026-01-09', 'Colaboradores (venta individual)', 1],
    ['V09', '2026-07-23', 'RICARDO SANCHEZ RESENDIZ', 2],
    ['V13', '2026-08-26', 'RICARDO SANCHEZ RESENDIZ', 1],
  ]);
  assert.strictEqual(v.conRecibo, 5);
});

test('donaciones: destino, fecha de salida y factura; el comentario viejo cuenta el destino sin fecha', () => {
  const r = cargar(
    [{ 'ID': 'D1', 'ESTATUS EQUIPO': 'DONADO' }, { 'ID': 'D2', 'ESTATUS EQUIPO': 'DONADO' }, { 'ID': 'D3', 'ESTATUS EQUIPO': 'DONADO' }, { 'ID': 'D4', 'ESTATUS EQUIPO': 'DONADO' }],
    [mov('D1', 'DONADO', 'Donado a Fundación Merced · salida de CI el 08/12/2025, folio P0053 · factura DONO/2025/00073'),
      mov('D2', 'DONADO', 'DONADO A FUNDACION MERCED. RTELEFONIA. P0178 · Aprobado por la Dirección de Líneas'),
      mov('D3', 'DONADO', 'LOS NUCOS CARGADOS CON MÁS DE 4 DIGITOS SON NUCOS DONADOS A FUNDACION MERCED O VENDIDOS')]).donaciones;
  assert.deepStrictEqual([r.total, r.sinDato, r.sinFecha], [4, 2, 1]);
  assert.deepStrictEqual(r.porMes, { '2025-12': 1 });
  assert.deepStrictEqual(r.porDestino, { 'Fundación Merced': 2 });
  assert.deepStrictEqual(r.facturas, { 'DONO/2025/00073': 1 });
});

test('desechos: un depósito por fecha y monto aunque se repita en cada equipo', () => {
  const r = cargar(
    [{ 'ID': 'X1', 'ESTATUS EQUIPO': 'DESECHADO' }, { 'ID': 'X2', 'ESTATUS EQUIPO': 'DESECHADO' }, { 'ID': 'X3', 'ESTATUS EQUIPO': 'DESECHADO' }],
    [mov('X1', 'DESECHADO', 'Desechado el 08/04/2026 · folio V0120 · depósito de $3,700'),
      mov('X2', 'DESECHADO', 'Desechado el 08/04/2026 · folio P0120 · depósito de $3,700'),
      mov('X3', 'DESECHADO', 'DESECHOS DE RELACIÓN R1; R1-0022. RTELEFONIA · Aprobado por la Dirección de Líneas')]).desechos;
  assert.deepStrictEqual([r.total, r.sinDato, r.sinFecha], [3, 0, 1]);
  assert.deepStrictEqual(r.depositos, [{ fecha: '2026-04-08', monto: 3700, equipos: 2 }]);
});

test('extravíos: con cobro o descuento registrado; sin movimiento = sin dato; solo cuenta el movimiento a su estatus', () => {
  const r = cargar(
    [{ 'ID': 'R1', 'ESTATUS EQUIPO': 'EXTRAVIO-ROBO' }, { 'ID': 'R2', 'ESTATUS EQUIPO': 'EXTRAVIO-ROBO' }, { 'ID': 'R3', 'ESTATUS EQUIPO': 'EXTRAVIO-ROBO' },
      { 'ID': 'R4', 'ESTATUS EQUIPO': 'USO' }],
    [mov('R1', 'EXTRAVIO-ROBO', 'EQUIPO NO ENTREGADO DESPUES DE LA BAJA DEL RESPONSABLE. COBRO EN GESTION POR ABOGADOS'),
      mov('R2', 'EXTRAVIO-ROBO', 'EQUIPO EXTRAVIADO. P0248. RTELEFONIA. 868184057305545'),
      // un movimiento a otro estatus no explica el de hoy
      mov('R3', 'RESGUARDO', 'Devolución'),
      mov('R4', 'EXTRAVIO-ROBO', 'no cuenta: hoy está en USO')]).extravios;
  assert.deepStrictEqual(r, { total: 3, sinDato: 1, conCobro: 1 });
});
