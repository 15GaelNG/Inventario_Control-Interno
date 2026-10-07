// Parte 7, etapa 1 (7-oct): el módulo «Proveedor» lee en el navegador los adendums de Telcel y los barridos de AT&T.
// Datos inventados con la forma real de cada archivo. Contra los 10 archivos reales (fuera del repo) se comparó con la
// lectura de reporte_lineas/scripts/conciliacion.py: iguales, salvo las bajas del formato nuevo (ver finOBaja).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src/html/js/lineas-proveedor.html'), 'utf8').replace(/<\/?script>/g, '');
const ctx = vm.createContext({});
vm.runInContext(fuente + '\nthis.P = LineasProveedor;', ctx);
const L = ctx.P.leer;
const plano = (x) => JSON.parse(JSON.stringify(x));

const ENC_TELCEL = ['Region', 'Cuenta Responsabilidad de Pago', 'Cuenta', 'Ciclo', 'Razon Social', 'Telefono', 'Estatus Suscripcion',
  'ICCID', 'IMEI', 'Nombre de Oferta Primaria', 'Monto de Renta con IVA', 'Equipo', 'RFC', 'Plazo de Servicio',
  'Fecha Inicio de Servicio', 'Fecha Fin de Servicio', 'Penalizacion por Cancelacion de Servicio'];
const telcel = (filas, conTitulo) => (conTitulo ? [['RADIOMOVIL DIPSA S.A. DE C.V.'], ['Reporte de Cálculo de Penalización de Planes con Adendum']] : [])
  .concat([ENC_TELCEL], filas);

test('adendum de Telcel: encabezado debajo del título, montos, cuentas y fechas como vienen escritas', () => {
  const r = L.excel('TAL050620CI1_28_09_2026_387550.xlsx', [
    { nombre: 'report', filas: telcel([
      ['6', '62637313', 64093857, '31', 'GPH', 4422315193, 'Activo', '8952020525462902111', '866871060156103', 'INTERNET 3.5', '$ 1,419.00', 'BROVI', 'TAL050620CI1', 24, '28/02/2026', '29/02/2028', 7123.06],
      ['6', '62637313', '1335327001', '31', 'GPH', '4422714839', 'Activo', '8952020525462908720', null, 'VPN 1', '$ 269.00', null, 'TAL050620CI1', 0, null, null, 0],
      ['Total', null, null],
    ], true) },
    { nombre: 'interpretacion', filas: [['Texto']] },
  ]);
  assert.equal(r.tipo, 'ADENDUM');
  assert.equal(r.compania, 'TELCEL');
  assert.equal(r.fecha, '2026-09-28', 'del nombre dd_mm_aaaa');
  assert.equal(r.hoja, 'report');
  assert.equal(r.lineas.length, 2);
  assert.deepEqual(plano(r.lineas[0]), {
    numero: '4422315193', cuentaPadre: '62637313', cuenta: '64093857', rfc: 'TAL050620CI1', estatus: 'Activo',
    sim: '8952020525462902111', imei: '866871060156103', plan: 'INTERNET 3.5', renta: 1419, equipo: 'BROVI', plazo: 24,
    inicio: '2026-02-28', fin: '2028-02-29', baja: '', penalizacion: 7123.06,
  });
  assert.equal(r.lineas[1].fin, '');
  assert.equal(r.lineas[1].plazo, null);
});

test('Telcel: la fecha de fin que no cuadra con inicio + plazo es la de la baja (formato nuevo y viejo)', () => {
  // Formato nuevo (dd/mm/aaaa): una «Pre-desactivado» trae como fin el día de la baja
  assert.deepEqual(plano(L.finOBaja('2024-04-19', '2026-07-21', 24)), { fin: '', baja: '2026-07-21' });
  assert.deepEqual(plano(L.finOBaja('2024-01-24', '2026-01-24', 24)), { fin: '2026-01-24', baja: '' });
  assert.deepEqual(plano(L.finOBaja('2024-01-24', '2026-01-26', 24)), { fin: '2026-01-26', baja: '' }, 'hasta 3 días de diferencia');
  assert.deepEqual(plano(L.finOBaja('2026-02-28', '2028-02-29', 24)), { fin: '2028-02-29', baja: '' }, 'año bisiesto');
  // Formato viejo (ISO): el día escrito, sin pasar a hora de México (usuario, 30-sep)
  assert.equal(L.fecha('2026-05-25T05:59:59.000+00:00'), '2026-05-25');
  assert.equal(L.fecha('24/05/2026'), '2026-05-24');
  assert.equal(L.fecha('2026-04-08 00:00:00.000000000'), '2026-04-08');
  assert.equal(L.fecha(null), '');
});

test('formato corto del portal (Hoja1, sin penalización) también se reconoce', () => {
  const enc = ENC_TELCEL.filter((c) => c.indexOf('Penalizacion') < 0);
  const r = L.excel('FRACCIONADORA LA ROMITA 29_09_2026.xlsx', [{ nombre: 'Hoja1', filas: [enc,
    ['9', '12419802', '1', '27', 'FRO', '9981968021', 'Pre-desactivado', '8952020525462900000', '', 'PLAN', '$ 499.00', '', 'FRO910430G61', 24, '27/06/2024', '21/09/2026']] }]);
  assert.equal(r.fecha, '2026-09-29');
  assert.equal(r.lineas[0].penalizacion, null);
  assert.equal(r.lineas[0].baja, '2026-09-21');
  assert.equal(r.lineas[0].fin, '');
});

test('barrido de AT&T: SIM sin la F, renta del nombre del plan, sin fecha adentro', () => {
  const r = L.excel('barrido septiembre 2026 (descargado 18-09-2026, ReporteEmpresarial).xls', [{ nombre: 'Sheet0', filas: [
    ['Cuenta', 'Número Telefónico', 'Estatus', 'SIM', 'IMEI', 'Modelo del equipo', 'Plan Tarifario', 'Fecha inicio plazo', 'Plazo', 'Fecha fin plazo', 'Add control', 'Tipo telefonia'],
    [507727479.0, 6631070502.0, 'ACTIVA', '8952050002011574778F', 861016060407594.0, 'OWNED', 'ATT ÁRMALO NEGOCIOS $399_ARR', '2024-04-09 00:00:00.000000000', 24.0, '2026-04-08 00:00:00.000000000', 'SI', 'CPP'],
    [507727479.0, '', 'ACTIVA', '', '', '', '', '', '', '', '', ''],
  ] }]);
  assert.equal(r.tipo, 'BARRIDO');
  assert.equal(r.compania, 'AT&T');
  assert.equal(r.fecha, '2026-09-18', '«descargado dd-mm-aaaa»');
  assert.equal(r.lineas.length, 1);
  assert.deepEqual(plano(r.lineas[0]), {
    numero: '6631070502', cuentaPadre: '507727479', cuenta: '', rfc: '', estatus: 'ACTIVA', sim: '8952050002011574778',
    imei: '861016060407594', plan: 'ATT ÁRMALO NEGOCIOS $399_ARR', renta: 399, equipo: 'OWNED', plazo: 24,
    inicio: '2024-04-09', fin: '2026-04-08', baja: '', penalizacion: null,
  });
  assert.equal(L.excel('barrido junio 2026 (1).xls', [{ nombre: 'Sheet0', filas: r.lineas.length ? [] : [] }]), null);
});

test('lo que no es del proveedor no se reconoce, y los datos sueltos se limpian', () => {
  assert.equal(L.excel('otro.xlsx', [{ nombre: 'Hoja1', filas: [['NUCO', 'MODELO'], ['0008', 'MOTO G20']] }]), null);
  assert.equal(L.telefono('52 442 231 5193'), '4422315193');
  assert.equal(L.telefono('D-001'), '');
  assert.equal(L.sim('8.95202E+18'), '', 'Excel lo dejó en notación científica');
  assert.equal(L.monto('$ 1,549.00'), 1549);
  assert.equal(L.monto(''), null);
  assert.equal(L.fechaDelNombre('sin fecha.xls'), '');
});
