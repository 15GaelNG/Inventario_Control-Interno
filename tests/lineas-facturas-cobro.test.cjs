const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Seguimiento de las cancelaciones con la factura del proveedor (13-nov, LineasFacturas.gs). Números inventados.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const F = new Function('LineasDatos', read('src/services/lineas/LineasFacturas.gs') + '\nreturn LineasFacturas;')({});

// Cuenta 11122233: cortes 12-sep, 12-oct y 12-nov. 4420000001 se cobra en los tres; 4420000002 deja de salir en noviembre
const filas = [
  ['4420000001', new Date(2026, 8, 12), '11122233', 100], ['4420000002', new Date(2026, 8, 12), '11122233', 50],
  ['4420000001', new Date(2026, 9, 12), '11122233', 100], ['4420000002', new Date(2026, 9, 12), '11122233', 50],
  ['4420000001', new Date(2026, 10, 12), '11122233', 60], ['4420000001', '12/11/2026', '11122233', 40],
  ['', new Date(2026, 10, 12), '11122233', 9.99], // un ajuste de la cuenta: cuenta como corte, no es una línea
  ['5550000000', new Date(2026, 10, 1), '99988877', 80],
];
const datos = F.armar(filas);

test('armar: cortes por cuenta y por número (el mismo corte en dos renglones se suma)', () => {
  assert.deepEqual(datos.cuentas['11122233'], ['2026-09-12', '2026-10-12', '2026-11-12']);
  assert.deepEqual(datos.numeros['4420000001'].cortes.slice(-1), [['2026-11-12', 100]]);
  assert.equal(datos.numeros['4420000002'].padre, '11122233');
  assert.equal(F.diaDeCorte('05/03/2026'), '2026-03-05');
  assert.equal(F.diaDeCorte('mañana'), '');
});

test('cobro: se sigue cobrando, ya no aparece, sin corte aún o sin datos', () => {
  // Carta el 20-sep: después vinieron octubre y noviembre (2 cortes) y noviembre la trae → se sigue cobrando
  assert.deepEqual(F.cobro('4420000001', '', '2026-09-20', datos), { estado: 'SE_COBRA', monto: 100, corte: '2026-11-12', mes: '2026-11' });
  // Ya no viene en el último corte de su cuenta → lista para confirmar
  assert.deepEqual(F.cobro('442-000-0002', '', '2026-09-20', datos), { estado: 'YA_NO', corte: '2026-11-12', mes: '2026-11' });
  // Carta el 20-oct: solo un corte después (noviembre) y aún la trae → un ciclo de gracia
  assert.equal(F.cobro('4420000001', '', '2026-10-20', datos).estado, 'SIN_CORTE');
  // Carta después del último corte → todavía no llega la factura siguiente
  assert.equal(F.cobro('4420000001', '', '2026-11-13', datos).estado, 'SIN_CORTE');
  // Nunca salió en la factura pero su cuenta sí: manda la cuenta del inventario
  assert.equal(F.cobro('4420000077', '11122233', '2026-09-20', datos).estado, 'YA_NO');
  assert.deepEqual(F.cobro('4420000077', '00000000', '2026-09-20', datos), { estado: 'SIN_DATOS' });
  assert.deepEqual(F.cobro('4420000001', '', '', datos), { estado: 'SIN_DATOS' }, 'sin fecha de carta');
});

test('la bandeja lleva COBRO solo en lo enviado, y el monto solo con facturación', () => {
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /conCobro_\(LineasResguardos\.bandeja\(u\), veFacturacion_\(sesion\)\)/);
  assert.match(tel, /if \(!veMontos\) delete c\.monto;/);
});
