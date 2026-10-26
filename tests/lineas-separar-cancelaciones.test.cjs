// Pendiente 3.13 (usuario, 20 y 22-oct): tools/lineas-datos/separar-cancelaciones.js separa una vez los renglones abiertos
// de APP_RESGUARDOS que juntan el resguardo del equipo y la cancelación de su línea
const test = require('node:test');
const assert = require('node:assert');
const { planear, renglonCancelacion } = require('../tools/lineas-datos/separar-cancelaciones.js');

const tabla = (hoja, filas) => ({ hoja, enc: [], filas: filas.map((f, i) => Object.assign({ _n: i + 2 }, f)) });
const ids = { nuevo: (p) => p + '-NUEVO' };

test('separar-cancelaciones: qué renglones se separan, cuáles desvinculan la línea y cuáles solo se reportan', () => {
  const resg = tabla('APP_RESGUARDOS', [
    { ID: 'RSG-1', REGISTRO_ID: 'EQU-1', NUMERO: '4420000001', ESTADO: 'EN RESGUARDO', CANCELACION: 'CARTA ENVIADA' },
    { ID: 'RSG-2', REGISTRO_ID: 'EQU-2', NUMERO: '4420000002', ESTADO: 'EN RESGUARDO', CANCELACION: 'CANCELADA' },
    { ID: 'RSG-3', REGISTRO_ID: 'EQU-3', NUMERO: '4420000003', ESTADO: 'ENTREGADO A LINEAS', CANCELACION: 'POR FIRMAR' },
    { ID: 'RSG-4', REGISTRO_ID: 'LIN-4', ID_LINEA: 'LIN-4', NUMERO: '4420000004', ESTADO: '', CANCELACION: 'POR FIRMAR' },
    { ID: 'RSG-5', REGISTRO_ID: 'EQU-5', NUMERO: '4420000005', ESTADO: 'PENDIENTE DE RECEPCION', CANCELACION: 'POR FIRMAR' },
    { ID: 'RSG-6', REGISTRO_ID: 'EQU-X', NUMERO: '4420000006', ESTADO: 'EN RESGUARDO', CANCELACION: 'POR FIRMAR' },
    { ID: 'RSG-7', REGISTRO_ID: 'EQU-1', NUMERO: '', ESTADO: 'EN RESGUARDO', CANCELACION: '' },
  ]);
  const equipos = tabla('EQUIPOS', ['EQU-1', 'EQU-2', 'EQU-3', 'EQU-5', 'EQU-9'].map((id) => ({ ID: id })));
  const lineas = tabla('LINEAS', [
    { ID: 'LIN-1', 'NUMERO TELEFONO': '442 000 0001', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
    { ID: 'LIN-2', 'NUMERO TELEFONO': '4420000002', 'ESTATUS LINEA': 'CANCELADA' },
    { ID: 'LIN-5', 'NUMERO TELEFONO': '4420000005', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
  ]);
  const asig = tabla('ASIGNACIONES', [
    { ID: 'ASG-1', 'ID EQUIPO': 'EQU-1', 'ID LINEA': 'LIN-1', 'FECHA FIN': '' },
    { ID: 'ASG-2', 'ID EQUIPO': 'EQU-2', 'ID LINEA': '', 'FECHA FIN': '' },
    { ID: 'ASG-5', 'ID EQUIPO': 'EQU-9', 'ID LINEA': 'LIN-5', 'FECHA FIN': '' },
  ]);
  const plan = planear(resg, equipos, lineas, asig);
  // Solo los abiertos con cancelación y sin ID_LINEA (los cerrados, los nuevos y los sin cancelación no)
  assert.deepEqual(plan.map((x) => x.r.ID), ['RSG-1', 'RSG-2', 'RSG-5', 'RSG-6']);
  assert.equal(plan[0].a.ID, 'ASG-1', 'la línea sigue en el equipo: se desvincula');
  assert.equal(plan[1].a, null, 'ya cancelada y suelta: solo se separa el renglón');
  assert.equal(plan[1].l.ID, 'LIN-2');
  assert.equal(plan[2].enOtro, 'EQU-9', 'la línea está en otro equipo: no se toca');
  assert.match(plan[3].problema, /no está en EQUIPOS/);
});

test('separar-cancelaciones: el renglón de Cancelaciones sigue a la línea y conserva la fecha y la fase del envío', () => {
  const r = { ID: 'RSG-1', FECHA: 46300.5, REGISTRO_ID: 'EQU-1', NUCO: '0896', NUMERO: '4461456731', COMPANIA: 'TELCEL', RAZON_SOCIAL: 'GPH',
    FIN_PLAN: '01/01/2026', ESTATUS_LINEA: 'EN PROCESO DE CANCELACION', MOTIVO: 'BAJA', SOLICITO_CORREO: 'a@x', SOLICITO_NOMBRE: 'A',
    ESTADO: 'EN RESGUARDO', CANCELACION: 'CARTA ENVIADA', ASESOR: 'ALFREDO', CARTA_FIRMADA_EN: 46301, CARTA_ENVIADA_EN: 46302,
    CANCELACION_ASUNTO: 'CORREO', MOTIVO_CANCELACION: 'LINEA VENCIDA', ACTUALIZADO_EN: 46302 };
  const o = renglonCancelacion({ r, l: { ID: 'LIN-9', 'TIPO DE LINEA': 'SIM BASICO' } },
    { 'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES' }, ids);
  assert.equal(o.ID, 'RSG-NUEVO');
  assert.equal(o.FECHA, 46300.5, 'Retirar cancelación busca el renglón del equipo por la hora del envío');
  assert.equal(o.REGISTRO_ID, 'LIN-9');
  assert.equal(o.ID_LINEA, 'LIN-9');
  assert.equal(o.TIPO, 'SIM BASICO');
  assert.equal(o.ESTADO, '', 'sin recepción: solo sale en Cancelaciones');
  assert.equal(o.NUCO, '0896');
  assert.deepEqual([o.CANCELACION, o.ASESOR, o.CARTA_FIRMADA_EN, o.CARTA_ENVIADA_EN, o.CANCELACION_ASUNTO, o.MOTIVO_CANCELACION],
    ['CARTA ENVIADA', 'ALFREDO', 46301, 46302, 'CORREO', 'LINEA VENCIDA']);
  assert.deepEqual([o.DEPARTAMENTO, o.SEDE, o.OFICINA, o.MODELO, o.IMEI], ['DISPONIBLE', 'QUERETARO', 'JARDINES', '', '']);
});
