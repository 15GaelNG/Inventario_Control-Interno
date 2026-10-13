const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Mandar a resguardo y Mandar a cancelación (usuario, 13-oct): ubicación DISPONIBLE · QUERETARO · JARDINES DE LA
// HACIENDA, PARA VENTA CON DETALLE, un equipo ya en la bandeja no se vuelve a mandar con el mismo estatus, uno guardado
// sin renglón abierto (del AppSheet) entra por recibir, y el motivo de la cancelación. Se corre LineasResguardos con la
// bandeja y el inventario en memoria.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function cargar(inventario, bandeja) {
  const tablas = { 'LINEAS TELEFONICAS': inventario, APP_RESGUARDOS: bandeja };
  const escritas = { actualizadas: [], agregadas: [], movimientos: [], columnas: [] };
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City', normCol: (c) => String(c).toUpperCase().trim(),
    conCandado: (fn) => fn(), existeTabla: (n) => !!tablas[n], asegurarPestana: (n) => { tablas[n] = tablas[n] || []; },
    asegurarColumnas: (n, cols) => { escritas.columnas.push([n].concat(cols)); return []; },
    leerTabla: (n) => (tablas[n] || []).map((f, i) => Object.assign({ _fila: i + 2 }, f)),
    idsDeFila: (f) => [String(f['ID'])],
    actualizarFila: (n, fila, cambios) => { escritas.actualizadas.push({ hoja: n, fila: fila, cambios: cambios }); Object.assign(tablas[n][fila - 2], cambios); },
    agregarFilas: (n, filas) => { filas.forEach((f) => { escritas.agregadas.push({ hoja: n, fila: f }); tablas[n].push(f); }); },
  };
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')(LineasDatos, {});
  const LineasRepo = {
    TAB: { LINEAS: 'LINEAS TELEFONICAS' }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' }, DEPARTAMENTO_DISPONIBLE: 'DISPONIBLE',
    catalogos: () => ({}), convertirRegistro: (f) => ({ linea: f['NUMERO TELEFONO'] ? {} : null }),
    guardarCambiosRegistro: (f, cambios) => { Object.assign(f, cambios); return { campos: [], refs: [], idsCambios: [] }; },
    registrarMovimiento: (tipo, datos, u, ahora, extra) => { escritas.movimientos.push({ tipo: tipo, datos: datos, extra: extra }); },
    refrescarIndice: () => [],
  };
  // Los campos de ubicación como los arma Editar (listas abiertas de CH); _resolver regresa lo capturado
  const LineasRegistros = {
    _elementos: () => ['DEPARTAMENTO', 'SEDE', 'OFICINA / DESARROLLO'].map((c) => ({ tipo: 'campo', columna: c, control: 'listaAbierta' })),
    _resolver: (campos, base, p) => ({ errores: [], valores: { DEPARTAMENTO: p.DEPARTAMENTO, SEDE: p.SEDE, 'OFICINA / DESARROLLO': p['OFICINA / DESARROLLO'] } }),
  };
  const Notif = {
    PARA_APROBADORES: 'APROBADORES', crear: () => {},
    _diaFinPlan: (v) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '')); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; },
  };
  const Utilities = { formatDate: () => '2026-10-13' };
  const LineasCaptura = { exigirInspeccion: (id) => { if (!id) throw new Error('Falta la inspección'); } };
  const R = new Function('LineasUtil', 'LineasNotificaciones', 'LineasDatos', 'LineasRepo', 'LineasRegistros', 'Utilities', 'LineasCaptura',
    read('src/services/lineas/LineasResguardos.gs') + '\nreturn LineasResguardos;')(LineasUtil, Notif, LineasDatos, LineasRepo, LineasRegistros, Utilities, LineasCaptura);
  return { R, tablas, escritas };
}

const usuario = { correo: 'lineas@x', nombre: 'LINEAS' };
const equipo = (id, nuco, estatus, extra) => Object.assign({ 'ID': id, 'NUCO': nuco, 'TIPO': 'EQUIPO', 'EQUIPO': 'MOTO', 'ESTATUS EQUIPO': estatus,
  'SEDE': 'MERIDA', 'OFICINA / DESARROLLO': 'ALMACEN', 'DEPARTAMENTO': 'VENTAS' }, extra || {});
const pedido = (estatus, extra) => Object.assign({ DEPARTAMENTO: 'DISPONIBLE', SEDE: 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES DE LA HACIENDA',
  'ESTATUS EQUIPO': estatus }, extra || {});

test('la ubicación sale DISPONIBLE · QUERETARO · JARDINES DE LA HACIENDA, no la que tenía el equipo', () => {
  const t = cargar([equipo('EQU-1', '0012', 'USO')], []);
  const f = t.R.formulario(['EQU-1'], usuario);
  assert.deepEqual(f.campos.map((c) => [c.columna, c.valor]),
    [['DEPARTAMENTO', 'DISPONIBLE'], ['SEDE', 'QUERETARO'], ['OFICINA / DESARROLLO', 'JARDINES DE LA HACIENDA']]);
  assert.ok(f.campos.every((c) => c.editable === 'SIEMPRE'), 'se puede cambiar');
  assert.deepEqual(f.estatusEquipo, ['RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO']);
  assert.deepEqual(f.equipos[0].opcionesEstatus, f.estatusEquipo);
  // La pantalla toma el valor del servidor, no la sede ni la oficina del equipo
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /const actual = \{ DEPARTAMENTO: 'DISPONIBLE', SEDE: q\.sede/);
  assert.match(cliente, /const valor = b && b\.valor;/);
});

test('ya en la bandeja: el formulario no ofrece su estatus y el servidor no lo vuelve a mandar con él', () => {
  const bandeja = [{ 'ID': 'RSG-1', 'REGISTRO_ID': 'EQU-2', 'NUCO': '0020', 'ESTADO': 'EN RESGUARDO', 'ESTATUS_EQUIPO': 'RESGUARDO' }];
  const t = cargar([equipo('EQU-2', '0020', 'RESGUARDO')], bandeja);
  const f = t.R.formulario(['EQU-2'], usuario);
  assert.equal(f.equipos[0].enBandeja, true);
  assert.deepEqual(f.equipos[0].opcionesEstatus, ['PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO']);
  assert.throws(() => t.R.mandar(['EQU-2'], { comentario: 'ya guardado', porEquipo: { 'EQU-2': pedido('RESGUARDO') } }, usuario),
    /NUCO 0020: ya está en Resguardos y cancelaciones como RESGUARDO; elige otro estatus\./);
  assert.equal(t.escritas.agregadas.length + t.escritas.actualizadas.length, 0, 'no escribió nada');
  // A otro de los de resguardo sí: se actualiza su renglón, sin otra recepción
  const r = t.R.mandar(['EQU-2'], { comentario: 'tiene un detalle', porEquipo: { 'EQU-2': pedido('PARA VENTA CON DETALLE') } }, usuario);
  assert.equal(r.hechos[0].porRecibir, false);
  assert.equal(t.tablas.APP_RESGUARDOS.length, 1);
  assert.equal(t.tablas.APP_RESGUARDOS[0].ESTATUS_EQUIPO, 'PARA VENTA CON DETALLE');
  assert.equal(t.tablas.APP_RESGUARDOS[0].SEDE, 'QUERETARO');
});

test('guardado desde el AppSheet (sin renglón abierto): Líneas lo manda y entra por recibir', () => {
  // Un renglón cerrado (Pau ya lo entregó a Líneas) no cuenta como abierto
  const bandeja = [{ 'ID': 'RSG-9', 'REGISTRO_ID': 'EQU-3', 'NUCO': '0030', 'ESTADO': 'ENTREGADO A LINEAS', 'ESTATUS_EQUIPO': 'RESGUARDO' }];
  const t = cargar([equipo('EQU-3', '0030', 'RESGUARDO'), equipo('EQU-4', '0040', 'RESGUARDO')], bandeja);
  const f = t.R.formulario(['EQU-3', 'EQU-4'], usuario);
  assert.ok(f.equipos.every((q) => !q.enBandeja && q.opcionesEstatus.indexOf('RESGUARDO') >= 0));
  const r = t.R.mandar(['EQU-3', 'EQU-4'], { comentario: 'del appsheet', porEquipo: { 'EQU-3': pedido('RESGUARDO'), 'EQU-4': pedido('RESGUARDO') } }, usuario);
  assert.deepEqual(r.hechos.map((h) => h.porRecibir), [true, true]);
  const nuevos = t.escritas.agregadas.map((a) => a.fila);
  assert.deepEqual(nuevos.map((x) => [x.NUCO, x.ESTADO, x.RECIBIO]), [['0030', 'PENDIENTE DE RECEPCION', ''], ['0040', 'PENDIENTE DE RECEPCION', '']]);
});

test('la línea que va a cancelación desde Mandar a resguardo lleva el motivo de su adendum', () => {
  const conLinea = (id, nuco, fin) => equipo(id, nuco, 'USO', { 'TIPO': 'EQUIPO + SIM', 'NUMERO TELEFONO': '442' + nuco, 'FIN PLAN': fin, 'COMPAÑIA': 'TELCEL' });
  const t = cargar([conLinea('EQU-5', '0050', '01/01/2025'), conLinea('EQU-6', '0060', '01/01/2027')], []);
  t.R.mandar(['EQU-5', 'EQU-6'], { comentario: 'renuncia', inspecciones: { 'EQU-5': 'INS-5', 'EQU-6': 'INS-6' }, porEquipo: {
    'EQU-5': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }), // vencido: va a cancelación aunque se eligió DISPONIBLE
    'EQU-6': pedido('RESGUARDO', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }),
  } }, usuario);
  const nuevos = t.escritas.agregadas.map((a) => a.fila);
  assert.deepEqual(nuevos.map((x) => [x.NUCO, x.CANCELACION, x.MOTIVO_CANCELACION]),
    [['0050', 'POR FIRMAR', 'LINEA VENCIDA'], ['0060', 'POR FIRMAR', 'CANCELACION ANTICIPADA']]);
  assert.deepEqual(t.escritas.movimientos[0].extra.detalle.cambios, [{ campo: 'MOTIVO DE CANCELACION', antes: '', despues: 'LINEA VENCIDA' }]);
  // Sin fecha o SIM básico no se sabe: en blanco
  assert.equal(t.R.motivoCancelacionDe({ 'TIPO': 'EQUIPO + SIM', 'FIN PLAN': '' }), '');
  assert.equal(t.R.motivoCancelacionDe({ 'TIPO': 'EQUIPO + SIM BASICO', 'FIN PLAN': '01/01/2025' }), '');
});

test('Mandar a cancelación: el motivo se elige (LINEA VENCIDA o CANCELACION ANTICIPADA) y llega a la bandeja y al historial', () => {
  const linea = { 'ID': 'LIN-1', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'DISPONIBLE', 'FIN PLAN': '01/01/2027' };
  const t = cargar([linea], []);
  assert.throws(() => t.R.mandarCancelacion(['LIN-1'], { comentario: 'ya no se usa' }, usuario), /Elige el motivo de la cancelación/);
  assert.throws(() => t.R.mandarCancelacion(['LIN-1'], { motivoCancelacion: 'OTRA', comentario: 'ya no se usa' }, usuario), /Elige el motivo/);
  t.R.mandarCancelacion(['LIN-1'], { motivoCancelacion: 'LINEA VENCIDA', comentario: 'ya no se usa' }, usuario);
  assert.equal(t.tablas.APP_RESGUARDOS[0].MOTIVO_CANCELACION, 'LINEA VENCIDA');
  assert.deepEqual(t.escritas.movimientos[0].extra.detalle.cambios, [{ campo: 'MOTIVO DE CANCELACION', antes: '', despues: 'LINEA VENCIDA' }]);
  // Desvincular y Cambiar línea no lo eligen: sale del adendum (aquí vigente)
  const t2 = cargar([Object.assign({}, linea)], [{ 'ID': 'RSG-1', 'REGISTRO_ID': 'OTRO', 'ESTADO': 'EN RESGUARDO' }]);
  t2.R.mandarCancelacion(['LIN-1'], { comentario: 'se cambió de línea' }, usuario, { motivoDelAdendum: true });
  assert.equal(t2.tablas.APP_RESGUARDOS[1].MOTIVO_CANCELACION, 'CANCELACION ANTICIPADA');
  // La hoja que ya existía recibe la columna nueva
  assert.deepEqual(t2.escritas.columnas, [['APP_RESGUARDOS', 'MOTIVO_CANCELACION']]);
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /\{ comentario: comentario, ticket: ticket \}, usuario, \{ motivoDelAdendum: true \}\);/);
  // La pantalla: la lista con «Selecciona…», obligatoria, y la columna en la pestaña Cancelaciones
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /\{ clave: 'motivo', etiqueta: 'Motivo', requerido: true, opciones: MOTIVOS_CANCELACION, elegir: true \}/);
  assert.match(cliente, /const MOTIVOS_CANCELACION = \['LINEA VENCIDA', 'CANCELACION ANTICIPADA'\];/);
  assert.match(cliente, /\{ motivoCancelacion: datos\.motivo, comentario: datos\.comentario, ticket: datos\.ticket \}/);
  assert.match(cliente, /\{ campo: 'MOTIVO_CANCELACION', titulo: 'Motivo', tipo: 'lista' \},/);
  assert.match(cliente, /\(c\.elegir \? '<option value="">Selecciona…<\/option>' : ''\)/);
});

test('PARA VENTA CON DETALLE vive en resguardo y se ve como los otros de venta', () => {
  assert.match(read('src/services/lineas/LineasEstructura.gs'), /'PARA VENTA CON DETALLE': 'RESGUARDO'/);
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const ESTATUS_EQUIPO_RESGUARDO = \['RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO'\];/);
  assert.match(cliente, /'PARA VENTA CON DETALLE': 'ambar'/);
  assert.match(cliente, /'PARA VENTA CON DETALLE': 'Tiene un detalle; se ofrece en venta'/);
  assert.match(cliente, /'PARA VENTA CON DETALLE': 'guardado'/);
  assert.match(read('src/html/js/lineas-vinculos.html'), /const VENTA = \['PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO', 'POSIBLE VENTA', 'VENTA'\];/);
});
