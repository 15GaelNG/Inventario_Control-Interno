// Parte 7, etapa 1 (7-oct): qué hace la carga del proveedor con cada línea (LineasProveedor.plan_, sin escribir) y qué
// adendum queda vigente (LineasLectura.esAdendumMasReciente).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const P = new Function(read('src/services/lineas/LineasProveedor.gs') + '\nreturn LineasProveedor;')();
const plano = (x) => JSON.parse(JSON.stringify(x));

// esAdendumMasReciente se saca de LineasLectura tal cual
const lectura = read('src/services/lineas/LineasLectura.gs');
const ini = lectura.indexOf('  function esAdendumMasReciente(');
const vigente = new Function(lectura.slice(ini, lectura.indexOf('\n  }\n', ini) + 4) + '\nreturn esAdendumMasReciente;')();
const F = (s) => new Date(s + 'T12:00:00');

function inventario() {
  return {
    lineas: [
      { ID: 'LIN-1', 'NUMERO TELEFONO': '4421000001', 'NUMERO SIM': '8952020000000000001', 'CUENTA': '', 'CUENTA PADRE': '', 'RAZON SOCIAL': '', 'ESTATUS LINEA': 'USO', _fila: 2 },
      { ID: 'LIN-2', 'NUMERO TELEFONO': '4421000002', 'NUMERO SIM': '8952020000000000002', 'CUENTA': '777', 'CUENTA PADRE': '62637313', 'RAZON SOCIAL': 'GPH SERVICIOS CONDOMINALES SC', 'ESTATUS LINEA': 'USO', _fila: 3 },
      { ID: 'LIN-3', 'NUMERO TELEFONO': '6631000003', 'NUMERO SIM': '8952050000000000003', 'CUENTA': '', 'CUENTA PADRE': '', 'RAZON SOCIAL': '', 'ESTATUS LINEA': 'DISPONIBLE', _fila: 4 },
      { ID: 'LIN-4', 'NUMERO TELEFONO': '4421000004', 'NUMERO SIM': '8952020000000000004', 'CUENTA': '', 'CUENTA PADRE': '', 'RAZON SOCIAL': '', 'ESTATUS LINEA': 'USO', _fila: 5 },
    ],
    adendums: [
      { 'ID LINEA': 'LIN-1', 'NUMERO TELEFONO': '4421000001', PLAN: 'VPN 1', 'COSTO PLAN': 269, 'INICIO PLAN': F('2024-05-25'), 'FIN PLAN': F('2026-05-25'), 'FECHA DE CARGA': F('2026-10-04') },
      { 'ID LINEA': 'LIN-2', 'NUMERO TELEFONO': '4421000002', PLAN: 'VPN 1', 'COSTO PLAN': 269, 'INICIO PLAN': F('2024-05-24'), 'FIN PLAN': F('2026-05-24'), 'FECHA DE CARGA': F('2026-10-04') },
      { 'ID LINEA': 'LIN-4', 'NUMERO TELEFONO': '4421000004', PLAN: 'VPN 1', 'COSTO PLAN': 269, 'INICIO PLAN': F('2024-05-24'), 'FIN PLAN': F('2026-05-24'), 'FECHA DE CARGA': F('2026-10-04') },
      // Ya se cargó el adendum del 28-sep con el 4421000009
      { 'ID LINEA': '', 'NUMERO TELEFONO': '4421000009', FUENTE: 'ADENDUM TELCEL', 'FECHA DEL ARCHIVO': F('2026-09-28'), 'FECHA DE CARGA': F('2026-10-05') },
    ],
    cuentas: { 62637313: { razon: 'GPH SERVICIOS CONDOMINALES SC' }, 507727479: { razon: 'FRACCIONADORA LA ROMITA SA DE CV' } },
    vigente: vigente,
  };
}

const linea = (o) => Object.assign({ cuentaPadre: '62637313', cuenta: '', estatus: 'Activo', sim: '', imei: '', plan: 'VPN 1', renta: 269, equipo: '', plazo: 24,
  inicio: '2024-05-24', fin: '2026-05-24', baja: '', penalizacion: 0 }, o);

test('adendum de Telcel contra el inventario: cuentas, SIM, contrato, cambios de número, altas y estatus', () => {
  const lote = { archivos: [{ tipo: 'ADENDUM', archivo: 'TAL050620CI1_28_09_2026_387550.xlsx', fecha: '2026-09-28', lineas: [
    linea({ numero: '4421000001', cuenta: '501', sim: '8952020000000000001' }), // fin un día antes que el migrado: solo formato
    linea({ numero: '4421000002', cuenta: '777', sim: '8952020000000000099', renta: 419, plan: 'INTERNET 3.5' }), // SIM nueva y contrato distinto
    linea({ numero: '4421000004', cuenta: '504', sim: '8952020000000000004', estatus: 'Pre-desactivado', fin: '', baja: '2026-09-21' }), // baja con la línea en uso
    linea({ numero: '4421000005', cuenta: '777', sim: '8952020000000000055' }), // misma cuenta hija que LIN-2: posible cambio de número
    linea({ numero: '4421000006', cuenta: '506', sim: '8952020000000000066' }), // nueva: alta
    linea({ numero: '4421000007', cuenta: '507', estatus: 'Suspendido' }), // nueva pero suspendida: sin alta
    linea({ numero: '4421000009', cuenta: '509' }), // ya cargada
    { numero: 'D-001' }, // no es número: se descarta
  ] }] };
  const r = P.plan_(P.limpiarLote_(lote), inventario());
  const res = plano(r.resumen);
  assert.deepEqual(res.archivos, [{ archivo: 'TAL050620CI1_28_09_2026_387550.xlsx', tipo: 'ADENDUM', fuente: 'ADENDUM TELCEL', compania: 'TELCEL', fecha: '2026-09-28', lineas: 7, yaCargadas: 1 }]);
  assert.equal(res.total, 6);
  assert.equal(res.contratos.formato, 1, '4421000001: un día de diferencia por el formato de fecha');
  assert.equal(res.contratos.cambian, 1);
  assert.equal(res.contratos.iguales, 0);
  assert.equal(res.contratos.bajas, 1, '4421000004: la baja no se compara como contrato');
  assert.deepEqual(res.contratos.ejemplos[0], { numero: '4421000002', antes: ['VPN 1', 269, '24/05/2024', '24/05/2026'], despues: ['INTERNET 3.5', 419, '24/05/2024', '24/05/2026'] });
  assert.deepEqual(res.sims, [{ numero: '4421000002', antes: '8952020000000000002', despues: '8952020000000000099' }]);
  assert.equal(res.cuentas, 2, 'LIN-1 y LIN-4 llenan cuenta, cuenta padre y razón social; LIN-2 ya las tenía');
  assert.equal(res.cambiosNumero.length, 1);
  assert.equal(res.cambiosNumero[0].antes, '4421000002');
  assert.equal(res.cambiosNumero[0].despues, '4421000005');
  assert.match(res.cambiosNumero[0].pista, /^misma cuenta 777$/);
  assert.deepEqual(res.altas.map((a) => a.numero), ['4421000006']);
  assert.deepEqual(res.sinAlta.map((a) => a.numero), ['4421000007']);
  assert.deepEqual(res.estatus.map((e) => [e.numero, e.inventario]), [['4421000004', 'USO']]);

  const acc = r.acciones;
  assert.equal(acc.adendums.length, 6, 'una foto por línea del archivo, salvo la ya cargada');
  assert.deepEqual(acc.adendums.map((d) => d.idLinea), ['LIN-1', 'LIN-2', 'LIN-4', '', null, ''], 'el cambio de número y la baja no se ligan; el alta, al darse de alta');
  assert.deepEqual(plano(acc.lineas['LIN-1'].cambios), { 'CUENTA PADRE': '62637313', 'CUENTA': '501', 'RAZON SOCIAL': 'GPH SERVICIOS CONDOMINALES SC' });
  assert.deepEqual(plano(acc.lineas['LIN-1'].registrar), [], 'llenar un dato vacío no va al historial');
  assert.deepEqual(plano(acc.lineas['LIN-2'].cambios), { 'NUMERO SIM': '8952020000000000099' });
  assert.deepEqual(plano(acc.lineas['LIN-2'].registrar), ['NUMERO SIM'], 'la SIM que cambió sí');
});

test('barrido de AT&T: la misma SIM con otro número es un posible cambio de número', () => {
  const lote = { archivos: [{ tipo: 'BARRIDO', archivo: 'barrido septiembre 2026.xls', fecha: '2026-09-18', lineas: [
    linea({ numero: '4461000033', cuentaPadre: '507727479', sim: '8952050000000000003', plan: 'ATT $399_ARR', renta: 399 }),
  ] }] };
  const res = plano(P.plan_(P.limpiarLote_(lote), inventario()).resumen);
  assert.equal(res.cambiosNumero.length, 1);
  assert.equal(res.cambiosNumero[0].antes, '6631000003');
  assert.match(res.cambiosNumero[0].pista, /^misma SIM/);
  assert.equal(res.altas.length, 0);
});

test('lo que manda el navegador se revisa', () => {
  assert.throws(() => P.limpiarLote_({ archivos: [] }), /No hay archivos/);
  assert.throws(() => P.limpiarLote_({ archivos: [{ tipo: 'OTRO', archivo: 'x.xlsx', fecha: '2026-09-28', lineas: [] }] }), /no reconocido/);
  assert.throws(() => P.limpiarLote_({ archivos: [{ tipo: 'ADENDUM', archivo: 'x.xlsx', fecha: '', lineas: [] }] }), /Falta la fecha de x\.xlsx/);
  const l = P.limpiarLote_({ archivos: [{ tipo: 'adendum', archivo: 'x.xlsx', fecha: '28/09/2026', lineas: [{ numero: '442-100-0001', renta: '269', inicio: '2024-05-24', fin: 'mañana' }] }] })[0];
  assert.equal(l.fecha, '2026-09-28');
  assert.equal(l.fuente, 'ADENDUM TELCEL');
  assert.equal(l.lineas[0].numero, '4421000001');
  assert.equal(l.lineas[0].renta, null, 'un monto que no es número no pasa');
  assert.equal(l.lineas[0].fin, '');
});

test('adendum vigente: entre fotos del proveedor manda el archivo más nuevo; lo de antes sigue igual', () => {
  const migrado = { 'FIN PLAN': F('2026-05-25'), 'FECHA DE CARGA': F('2026-10-04') };
  const septiembre = { 'FIN PLAN': F('2026-05-24'), 'FECHA DEL ARCHIVO': F('2026-09-28'), 'FECHA DE CARGA': F('2026-10-08') };
  const julio = { 'FIN PLAN': F('2026-05-25'), 'FECHA DEL ARCHIVO': F('2026-07-03'), 'FECHA DE CARGA': F('2026-10-09') };
  const baja = { 'FIN PLAN': '', 'FECHA DEL ARCHIVO': F('2026-10-28'), 'FECHA DE CARGA': F('2026-11-02') };
  assert.equal(vigente(septiembre, migrado), true, 'la foto cargada después del migrado gana aunque su fin sea un día antes');
  assert.equal(vigente(julio, septiembre), false, 'un archivo viejo cargado después no reemplaza al más nuevo');
  assert.equal(vigente(baja, septiembre), true, 'la baja del archivo más nuevo manda');
  // Sin fotos del proveedor, como antes: el fin más lejano y luego la última carga
  assert.equal(vigente({ 'FIN PLAN': F('2027-01-01'), 'FECHA DE CARGA': F('2026-10-01') }, migrado), true);
  assert.equal(vigente({ 'FIN PLAN': F('2026-01-01'), 'FECHA DE CARGA': F('2026-10-09') }, migrado), false);
  assert.equal(vigente(migrado, null), true);
});

test('contrato: lo que el inventario no tenía se completa; solo es distinto un dato que los dos tienen y no coincide', () => {
  const inv = inventario();
  inv.adendums[0]['INICIO PLAN'] = ''; // LIN-1 sin inicio
  const lote = { archivos: [{ tipo: 'ADENDUM', archivo: 'x.xlsx', fecha: '2026-09-28', lineas: [
    linea({ numero: '4421000001', inicio: '2024-05-25', fin: '2026-05-25' }), // completa el inicio
    linea({ numero: '4421000002', inicio: '2024-05-24', fin: '2026-05-27' }), // fin a 3 días: distinto
    linea({ numero: '4421000004', renta: null, plan: '', inicio: '2024-05-24', fin: '2026-05-24' }), // sin renta ni plan: igual
  ] }] };
  const c = plano(P.plan_(P.limpiarLote_(lote), inv).resumen.contratos);
  assert.deepEqual([c.completan, c.cambian, c.iguales, c.formato], [1, 1, 1, 0]);
});

test('el aviso de cambio de número abre el registro (el equipo donde está la línea), no el ID de la línea', () => {
  const fuente = read('src/services/lineas/LineasProveedor.gs');
  assert.match(fuente, /LineasLectura\.filas\(\)\.forEach\(\(f\) => \{ if \(f\['ID LINEA'\]\) registroDe\[txt\(f\['ID LINEA'\]\)\] = txt\(f\['ID'\]\); \}\);/);
  assert.match(fuente, /refId: registroDe\[c\.idLinea\] \|\| c\.idLinea,/);
});
