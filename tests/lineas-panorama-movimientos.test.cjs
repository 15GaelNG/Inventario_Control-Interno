const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// LineasPanorama → eventosDeMovimientos_ (2-nov): desde octubre los cambios de estatus están en MOVIMIENTOS, no en la
// bitácora de AppSheet. Sin leerlos, el cierre de septiembre salía igual a hoy y la flecha decía "+25" cuando bajaron.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPanorama.gs'), 'utf8');

function cargar() {
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City',
    normCol: (v) => String(v || '').trim().toUpperCase(),
  };
  // Utilities.parseDate en hora de México (UTC-6, sin horario de verano)
  const Utilities = { parseDate: (texto) => new Date(texto.replace(' ', 'T') + '-06:00') };
  return new Function('LineasDatos', 'LineasRepo', 'LineasUtil', 'Utilities', fuente + '; return LineasPanorama;')(LineasDatos, {}, {}, Utilities);
}

const cambio = (campo, antes, despues) => JSON.stringify([{ campo: campo, antes: antes, despues: despues }]);
const f = (iso) => new Date(iso + 'T12:00:00-06:00');

test('lee los cambios de estatus de línea (por ID LINEA) y de equipo (por ID EQUIPO), y las altas con fecha', () => {
  const P = cargar();
  const r = P._eventosDeMovimientos([
    { 'FECHA': f('2026-10-12'), 'ACCION': 'EDICION', 'ID EQUIPO': 'EQU-1', 'ID LINEA': 'LIN-1', 'CAMBIOS': cambio('ESTATUS LINEA', 'DISPONIBLE', 'CANCELADA') },
    { 'FECHA': f('2026-10-13'), 'ACCION': 'RESGUARDO', 'ID EQUIPO': 'EQU-1', 'ID LINEA': '', 'CAMBIOS': cambio('ESTATUS EQUIPO', 'USO', 'RESGUARDO') },
    { 'FECHA': f('2026-10-14'), 'ACCION': 'ALTA', 'ID EQUIPO': '', 'ID LINEA': 'LIN-2', 'CAMBIOS': cambio('ESTATUS LINEA', '', 'DISPONIBLE') },
    { 'FECHA': '', 'ACCION': 'ALTA', 'ID EQUIPO': '', 'ID LINEA': 'LIN-3', 'CAMBIOS': '' }, // migración: sin fecha, no cuenta
    { 'FECHA': f('2026-10-15'), 'ACCION': 'COMENTARIO', 'ID EQUIPO': 'EQU-1', 'ID LINEA': 'LIN-1', 'CAMBIOS': 'no es JSON' },
  ]);
  assert.deepStrictEqual(Object.keys(r.eventos.lineas).sort(), ['LIN-1', 'LIN-2']);
  assert.deepStrictEqual(r.eventos.lineas['LIN-1'].map((e) => e[1]), ['DISPONIBLE']);
  assert.deepStrictEqual(r.eventos.lineas['LIN-2'].map((e) => e[1]), ['SIN ESTATUS']);
  assert.deepStrictEqual(r.eventos.equipos['EQU-1'].map((e) => e[1]), ['USO']);
  assert.deepStrictEqual(Object.keys(r.altas), ['LIN-2']);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.primera, f('2026-10-12').getTime());
});

test('con _historico: una línea cancelada en octubre sigue activa al cierre de septiembre; una alta de octubre no existía', () => {
  const P = cargar();
  const mov = P._eventosDeMovimientos([
    { 'FECHA': f('2026-10-12'), 'ACCION': 'EDICION', 'ID EQUIPO': 'EQU-1', 'ID LINEA': 'LIN-1', 'CAMBIOS': cambio('ESTATUS LINEA', 'DISPONIBLE', 'CANCELADA') },
    { 'FECHA': f('2026-10-14'), 'ACCION': 'ALTA', 'ID EQUIPO': '', 'ID LINEA': 'LIN-2', 'CAMBIOS': cambio('ESTATUS LINEA', '', 'USO') },
  ]);
  const eventos = {};
  Object.keys(mov.eventos.lineas).forEach((id) => { eventos[id] = mov.eventos.lineas[id].map((e) => ({ t: e[0], antes: e[1] })); });
  // El renglón de la línea 1 lleva el ID del equipo y también el de su línea (calcular le agrega ID LINEA)
  const regs = [
    { ids: ['EQU-1', 'LIN-1'], actual: 'CANCELADA', alta: f('2025-01-10').getTime() },
    { ids: ['LIN-2'], actual: 'USO', alta: mov.altas['LIN-2'] },
  ];
  const serie = P._historico(regs, eventos, ['2026-09', '2026-10']);
  assert.deepStrictEqual(serie['DISPONIBLE'], [1, 0], 'al 30-sep la línea 1 seguía DISPONIBLE');
  assert.deepStrictEqual(serie['CANCELADA'], [0, 1]);
  assert.deepStrictEqual(serie['USO'], [0, 1], 'la línea 2 no existía al 30-sep');
});
