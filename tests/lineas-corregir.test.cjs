const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// «Corregir» en lugar de «Editar», el responsable en blanco en estatus finales y la línea del equipo que sale del
// inventario (usuario, 16-oct; pendiente 2.50)
function cargar(vencida) {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const LineasResguardos = { lineaVencida: () => !!vencida, LINEA_SIN_PANEL: 'CANCELADA' };
  return new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasResguardos',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(
    { CATALOGO: { estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'],
      estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'] },
      TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-10-16' }, {}, {}, LineasUtil, LineasResguardos);
}
const usuario = { correo: 'x@y.z' };
const campo = (els, c) => els.filter((e) => e.columna === c)[0];
const titulos = (els) => els.filter((e) => e.tipo === 'titulo').map((e) => e.texto);
const enUso = { TIPO: 'EQUIPO + SIM', NUCO: '12', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'USO', 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'DANAE', 'NO EMPLEADO': 'CM1' };
const guardado = { TIPO: 'EQUIPO', NUCO: '13', 'ESTATUS EQUIPO': 'RESGUARDO' };
const sola = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'USO', RESPONSABLE: 'JUAN', 'COMPAÑIA': 'TELCEL' };

test('Corregir equipo no trae la pestaña Responsable; Agregar equipo y Corregir la línea sola sí', () => {
  const Reg = cargar();
  const conLinea = Reg._elementos(enUso, {}, usuario, Reg._contextoEdicion(enUso, null));
  assert.ok(titulos(conLinea).indexOf('RESPONSABLE') < 0);
  ['RESPONSABLE', 'NO EMPLEADO', 'PUESTO', 'DEPARTAMENTO', 'CUENTA GOOGLE', 'NOMBRE SEGUNDO RESPONSABLE'].forEach((c) => assert.ok(!campo(conLinea, c), c));
  // Conserva Equipo y Accesorios y accesos (la línea y su adendum, con Corregir de la línea)
  assert.deepEqual(titulos(conLinea), ['EQUIPO', 'ACCESORIOS Y ACCESOS']);
  const sinLinea = Reg._elementos(guardado, {}, usuario, Reg._contextoEdicion(guardado, null));
  assert.deepEqual(titulos(sinLinea), ['EQUIPO', 'LÍNEA', 'ADENDUM', 'ACCESORIOS Y ACCESOS']);
  assert.ok(campo(Reg._elementos({}, {}, usuario, { nuevo: true, parte: 'EQUIPO' }), 'RESPONSABLE'));
  assert.ok(campo(Reg._elementos(sola, {}, usuario, Reg._contextoEdicion(sola, null)), 'RESPONSABLE'));
});

test('Corregir equipo no pasa a USO: eso es la Responsiva', () => {
  const Reg = cargar();
  const opciones = (base) => campo(Reg._elementos(base, {}, usuario, Reg._contextoEdicion(base, null)), 'ESTATUS EQUIPO').opciones;
  assert.ok(opciones(guardado).indexOf('USO') < 0);
  assert.ok(opciones(enUso).indexOf('USO') >= 0); // ya en USO, se queda en la lista
  assert.throws(() => Reg._exigirSinPersona(guardado, { 'ESTATUS EQUIPO': 'USO' }), /Para pasar el equipo a USO usa «Responsiva»\./);
});

test('el servidor rechaza otra persona desde Corregir equipo (una pestaña abierta antes la manda)', () => {
  const Reg = cargar();
  assert.throws(() => Reg._exigirSinPersona(enUso, { RESPONSABLE: 'OTRA PERSONA' }), /RESPONSABLE: la persona se cambia con «Responsiva»\./);
  assert.throws(() => Reg._exigirSinPersona(enUso, { 'NOMBRE SEGUNDO RESPONSABLE': 'ANA' }), /la persona se cambia con «Responsiva»/);
  // Lo mismo que ya tenía no cuenta
  assert.doesNotThrow(() => Reg._exigirSinPersona(enUso, { RESPONSABLE: 'danae', 'NO EMPLEADO': 'CM1', 'ESTATUS EQUIPO': 'USO', EQUIPO: 'HONOR' }));
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /if \(parte === 'EQUIPO'\) exigirSinPersona_\(base, enviados\);/);
});

test('el equipo que sale del inventario: su línea en USO queda DISPONIBLE o, con el adendum vencido, al panel o CANCELADA', () => {
  const vigente = cargar(false);
  assert.equal(vigente._lineaSaleDelEquipo(false, enUso, {}), null);
  assert.deepEqual(vigente._lineaSaleDelEquipo(true, enUso, {}), { estatus: 'DISPONIBLE', alPanel: false });
  const vencida = cargar(true);
  assert.throws(() => vencida._lineaSaleDelEquipo(true, enUso, {}), /Línea 4421090805: su adendum venció; elige si va al panel de Resguardos y cancelaciones\./);
  assert.deepEqual(vencida._lineaSaleDelEquipo(true, enUso, { cancelacionLinea: 'PANEL' }), { estatus: 'DISPONIBLE', alPanel: true });
  assert.deepEqual(vencida._lineaSaleDelEquipo(true, enUso, { cancelacionLinea: 'DIRECTO' }), { estatus: 'CANCELADA', alPanel: false });
  assert.deepEqual(vencida.ESTATUS_EQUIPO_FINAL, ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO']);
  const reg = read('src/services/lineas/LineasRegistros.gs');
  // Al panel: ya suelta, entra a la bandeja como con «Mandar a cancelación», desde su propio registro (ID LINEA)
  assert.match(reg, /lineaAlPanel: lineaSale && lineaSale\.alPanel \? texto_\(base\['ID LINEA'\]\) : null/);
  assert.match(reg, /LineasResguardos\.mandarCancelacion\(\[resultado\.lineaAlPanel\], \{ comentario: resultado\.motivo, ticket: texto_\(datos && datos\.ticket\) \}, usuario,\s+\{ motivoDelAdendum: true, nucos: \{ \[resultado\.lineaAlPanel\]: resultado\.nuco \} \}\);/);
  // La pantalla lo pregunta en la ventana del comentario
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const lineaACancelar = form\.lineaVencida && cambiaA\('ESTATUS EQUIPO', ESTATUS_EQUIPO_FINAL\);/);
  assert.match(cliente, /clave: 'cancelacionLinea', etiqueta: 'Línea · adendum vencido', opciones: CANCELACION_LINEA\.map\(\(x\) => x\.texto\), elegir: true, requerido: true/);
});

test('Mandar a resguardo con el adendum vencido: se elige el panel o CANCELADA sin panel', () => {
  const resg = read('src/services/lineas/LineasResguardos.gs');
  assert.match(resg, /const LINEA_SIN_PANEL = 'CANCELADA';/);
  assert.match(resg, /directa: may\(p\.cancelacionLinea\) === CANCELACION_DIRECTA/);
  // La línea se separa: al panel entra sola a Cancelaciones; sin panel queda CANCELADA suelta (pendiente 3.12)
  assert.match(resg, /const sale = !tieneLinea \? '' : \(enCurso \? 'SIGUE' : \(\{ \[LINEA_CANCELACION\]: 'PANEL', \[LINEA_SIN_PANEL\]: 'DIRECTA' \}\)/);
  const cliente = read('src/html/js/lineas.html');
  // CANCELADA directo queda en el historial como cancelación (usuario, 16-oct), también desde Corregir
  assert.match(resg, /registrarCancelacionDirecta\(f0, idLinea, pedido\.COMENTARIO \|\| motivo, ticket, usuario, ahora\);/);
  assert.match(resg, /LineasRepo\.registrarMovimiento\('CANCELACION_LINEA', \{ motivo: motivo, ticket: ticket \}, usuario, ahora, \{\s+refs: \[idLinea, txt\(f\['ID'\]\)\]/);
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /if \(lineaSale && lineaSale\.estatus === LineasResguardos\.LINEA_SIN_PANEL\) \{\s+LineasResguardos\.registrarCancelacionDirecta\(fila, texto_\(base\['ID LINEA'\]\)/);
  assert.match(cliente, /cancelacionLinea: q\.tieneLinea && q\.propuestaLinea === 'EN PROCESO DE CANCELACION' && v\('ESTATUS LINEA'\) === LINEA_SIN_PANEL \? 'DIRECTO' : ''/);
});

test('responsable en blanco en el equipo VENDIDO, DONADO, DESECHADO o EXTRAVIO-ROBO y en la línea sola CANCELADA', () => {
  const fin = new Date('2026-10-01T12:00:00Z');
  const hojas = {
    LINEAS: [{ 'ID': 'LIN-C', 'NUMERO TELEFONO': '4420000009', 'ESTATUS LINEA': 'CANCELADA' }],
    EQUIPOS: [{ 'ID': 'EQU-V', 'NUCO': '0001', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'VENDIDO' },
      { 'ID': 'EQU-R', 'NUCO': '0002', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'RESGUARDO' }],
    ASIGNACIONES: [
      { 'ID': 'ASG-1', 'TIPO': 'PERSONA', 'ID EQUIPO': 'EQU-V', 'RESPONSABLE': 'ANA', 'NO EMPLEADO': 'CM1', 'SEDE': 'QUERETARO', 'FECHA FIN': fin },
      { 'ID': 'ASG-2', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-C', 'RESPONSABLE': 'LUIS', 'FECHA FIN': fin },
      { 'ID': 'ASG-3', 'TIPO': 'PERSONA', 'ID EQUIPO': 'EQU-R', 'RESPONSABLE': 'PEPE', 'FECHA FIN': fin },
    ],
  };
  const LineasDatos = {
    existeTabla: (n) => !!hojas[n], leerTabla: (n) => (hojas[n] || []).map((f) => Object.assign({}, f)),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN/i.test(h), normCol: (h) => String(h || '').toUpperCase().trim(),
    // El alta sale del movimiento ALTA de MOVIMIENTOS (pendiente 2.51)
    cacheLeer: () => null, cacheGuardar: () => {},
    buscarFilas: (n, col, valor) => (hojas[n] || []).map((f, i) => (String(f[col]) === valor ? i + 2 : 0)).filter(Boolean),
    leerFilas: (pedidos) => pedidos.map((p) => p.filas.map((i) => Object.assign({ _fila: i }, hojas[p.tabla][i - 2]))),
  };
  const L = new Function('LineasDatos', 'LineasRepo', 'PropertiesService', 'ESTRUCTURA_ES_CODIGO_RESGUARDO', 'soloEditor_',
    read('src/services/lineas/LineasLectura.gs') + '; return LineasLectura;')(LineasDatos, { folioRegistro: () => '', borrarCaches: () => {} },
    { getScriptProperties: () => ({ getProperty: () => 'ESTRUCTURA' }) }, /^$/, () => {});
  const por = (id) => L.filas().filter((f) => f.ID === id)[0];
  assert.equal(por('EQU-V').RESPONSABLE, '');
  assert.equal(por('EQU-V')['NO EMPLEADO'], '');
  assert.equal(por('EQU-V').SEDE, 'QUERETARO'); // la ubicación se queda
  assert.equal(por('LIN-C').RESPONSABLE, '');
  // Guardado no es final: sigue mostrando con quién estuvo
  assert.equal(por('EQU-R').RESPONSABLE, 'PEPE');
});

test('pantalla: «Corregir» e «Inspección», Responsiva primero', () => {
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /'Editar línea'|'Editar equipo'|Nueva inspección/);
  assert.match(cliente, /textContent = tipo === 'INSPECCION' \? 'Inspección' : 'Responsiva';/);
  const botones = cliente.slice(cliente.indexOf('function botonesFicha('), cliente.indexOf('function abrirMenuFicha('));
  assert.ok(botones.indexOf('data-ln-captura="RESPONSIVA"') < botones.indexOf('data-ln-captura="INSPECCION"'));
});
