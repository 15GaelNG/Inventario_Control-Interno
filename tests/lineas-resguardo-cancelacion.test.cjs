const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Mandar a resguardo y Mandar a cancelación (usuario, 13-oct): ubicación DISPONIBLE · QUERETARO · JARDINES DE LA
// HACIENDA, PARA VENTA CON DETALLE, un equipo ya en la bandeja no se vuelve a mandar con el mismo estatus, uno guardado
// sin renglón abierto (del AppSheet) entra por recibir, y el motivo de la cancelación. Se corre LineasResguardos con la
// bandeja y el inventario en memoria.
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function cargar(inventario, bandeja, movimientos) {
  const tablas = { 'LINEAS TELEFONICAS': inventario, APP_RESGUARDOS: bandeja, MOVIMIENTOS: movimientos || [] };
  const escritas = { actualizadas: [], agregadas: [], eliminadas: [], movimientos: [], columnas: [], registros: [] };
  // El inventario se lee con los mismos objetos: lo que se guarda se ve al volver a leerlo (como LineasLectura)
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City', normCol: (c) => String(c).toUpperCase().trim(),
    conCandado: (fn) => fn(), existeTabla: (n) => !!tablas[n], asegurarPestana: (n) => { tablas[n] = tablas[n] || []; },
    asegurarColumnas: (n, cols) => { escritas.columnas.push([n].concat(cols)); return []; },
    leerTabla: (n) => (tablas[n] || []).map((f, i) => (n === 'LINEAS TELEFONICAS' ? Object.assign(f, { _fila: i + 2 }) : Object.assign({ _fila: i + 2 }, f))),
    idsDeFila: (f) => [String(f['ID'])],
    actualizarFila: (n, fila, cambios) => { escritas.actualizadas.push({ hoja: n, fila: fila, cambios: cambios }); Object.assign(tablas[n][fila - 2], cambios); },
    agregarFilas: (n, filas) => { filas.forEach((f) => { escritas.agregadas.push({ hoja: n, fila: f }); tablas[n].push(f); }); },
    eliminarFilas: (n, filas) => { filas.slice().sort((a, b) => b - a).forEach((f) => { escritas.eliminadas.push({ hoja: n, fila: f }); tablas[n].splice(f - 2, 1); }); },
    buscarFilas: (n, c, v, parcial) => (tablas[n] || []).map((f, i) => (parcial ? String(f[c] || '').indexOf(v) >= 0 : String(f[c]) === String(v)) ? i + 2 : 0).filter(Boolean),
    buscarFilasVarios: (n, c, vs, parcial) => vs.reduce((a, v) => a.concat(LineasDatos.buscarFilas(n, c, v, parcial)), []),
    leerFilas: (ps) => ps.map((p) => p.filas.map((x) => tablas[p.tabla][x - 2])),
  };
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')(LineasDatos, {});
  const porId = (id) => tablas['LINEAS TELEFONICAS'].filter((f) => f['ID'] === id)[0];
  const LineasRepo = {
    TAB: { LINEAS: 'LINEAS TELEFONICAS', MOV: 'MOVIMIENTOS' }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' }, DEPARTAMENTO_DISPONIBLE: 'DISPONIBLE',
    VALORES_SIN_LINEA: { 'NUMERO TELEFONO': '' }, tipoSinLinea: () => 'EQUIPO',
    catalogos: () => ({}), convertirRegistro: (f) => ({ linea: f['NUMERO TELEFONO'] ? {} : null }),
    leerRegistroObligatorio: (id) => porId(id),
    guardarCambiosRegistro: (f, cambios) => {
      const campos = Object.keys(cambios).filter((c) => String(f[c] || '') !== String(cambios[c])).map((c) => ({ campo: c, antes: String(f[c] || ''), despues: String(cambios[c]) }));
      Object.assign(f, cambios);
      escritas.registros.push({ id: f['ID'], cambios: cambios });
      return { campos: campos, refs: [f['ID LINEA']].filter(Boolean), idsCambios: [] };
    },
    registrarMovimiento: (tipo, datos, u, ahora, extra) => {
      escritas.movimientos.push({ tipo: tipo, datos: datos, extra: extra });
      const id = 'MVT-' + escritas.movimientos.length;
      const refs = (extra.refs || []).join(', ');
      tablas.MOVIMIENTOS.push({ 'ID': id, 'ACCION': tipo, 'FECHA': ahora, 'ID EQUIPO': refs, 'ID LINEA': refs, 'CAMBIOS': JSON.stringify((extra.detalle || {}).cambios || []) });
      return id;
    },
    refrescarIndice: () => [],
  };
  // Separar la línea (LineasEscritura.separarLinea): el equipo queda sin línea y la línea, sola con su ID
  const LineasEscritura = {
    separarLinea: (f, ahora, opciones) => {
      const linea = { 'ID': f['ID LINEA'], 'ID LINEA': f['ID LINEA'], 'TIPO': 'LINEA', 'NUMERO TELEFONO': f['NUMERO TELEFONO'], 'FIN PLAN': f['FIN PLAN'],
        'COMPAÑIA': f['COMPAÑIA'], 'ESTATUS LINEA': (opciones && opciones.estatus) || 'DISPONIBLE' };
      const campos = [{ campo: 'NUMERO TELEFONO', antes: f['NUMERO TELEFONO'], despues: '' }];
      if (f['PIN WHATSAPP']) campos.push({ campo: 'PIN WHATSAPP', antes: f['PIN WHATSAPP'], despues: '' });
      if (f['ESTATUS LINEA'] !== linea['ESTATUS LINEA']) campos.push({ campo: 'ESTATUS LINEA', antes: f['ESTATUS LINEA'], despues: linea['ESTATUS LINEA'] });
      tablas['LINEAS TELEFONICAS'].push(linea);
      Object.assign(f, { 'NUMERO TELEFONO': '', 'ID LINEA': '', 'TIPO': 'EQUIPO', 'ESTATUS LINEA': '', 'PIN WHATSAPP': '' });
      return { idLinea: linea['ID'], campos: campos, refs: [] };
    },
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
  const R = new Function('LineasUtil', 'LineasNotificaciones', 'LineasDatos', 'LineasRepo', 'LineasRegistros', 'Utilities', 'LineasCaptura', 'LineasEscritura',
    read('src/services/lineas/LineasResguardos.gs') + '\nreturn LineasResguardos;')(LineasUtil, Notif, LineasDatos, LineasRepo, LineasRegistros, Utilities, LineasCaptura, LineasEscritura);
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
  assert.equal(f.equipos[0].actual, null);
  // La pantalla toma el valor del servidor, no la sede ni la oficina del equipo
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /const actual = \{ DEPARTAMENTO: 'DISPONIBLE', SEDE: q\.sede/);
  assert.match(cliente, /const valor = \(corregir && q\.actual && q\.actual\[c\]\) \|\| \(b && b\.valor\);/);
});

// Pendiente 3.12 (usuario, 20-oct): un equipo ya en el panel no se vuelve a mandar; se corrige sin restricciones
test('ya en el panel: Mandar a resguardo no lo incluye y Corregir resguardo actualiza su renglón, con el mismo estatus', () => {
  const bandeja = [{ 'ID': 'RSG-1', 'REGISTRO_ID': 'EQU-2', 'NUCO': '0020', 'ESTADO': 'EN RESGUARDO', 'ESTATUS_EQUIPO': 'RESGUARDO', 'SEDE': 'QUERETARO',
    'OFICINA': 'JARDINES DE LA HACIENDA', 'DEPARTAMENTO': 'DISPONIBLE', 'COMENTARIO': 'PRIMERO' }];
  const t = cargar([equipo('EQU-2', '0020', 'RESGUARDO')], bandeja);
  const f = t.R.formulario(['EQU-2'], usuario);
  assert.deepEqual(f.equipos, []);
  assert.match(f.omitidos[0].motivo, /usa «Corregir resguardo»/);
  const r0 = t.R.mandar(['EQU-2'], { comentario: 'otra vez', porEquipo: { 'EQU-2': pedido('RESGUARDO') } }, usuario);
  assert.equal(r0.hechos.length, 0);
  // Corregir: el formulario lleno con lo del renglón
  const c = t.R.formulario(['EQU-2'], usuario, { corregir: true });
  assert.equal(c.corregir, true);
  assert.deepEqual(c.equipos[0].actual, { 'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES DE LA HACIENDA',
    'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': '', COMENTARIO: 'PRIMERO', ESTADO: 'EN RESGUARDO' });
  // El mismo estatus y solo otra sede: sin inspección ni renglón nuevo, con su movimiento
  const r = t.R.mandar(['EQU-2'], { corregir: true, comentario: 'era leon', porEquipo: { 'EQU-2': pedido('RESGUARDO', { SEDE: 'LEON' }) } }, usuario);
  assert.equal(r.hechos[0].porRecibir, false);
  assert.equal(t.tablas.APP_RESGUARDOS.length, 1);
  assert.equal(t.tablas.APP_RESGUARDOS[0].SEDE, 'LEON');
  assert.equal(t.tablas.APP_RESGUARDOS[0].COMENTARIO, 'era leon');
  assert.equal(t.escritas.movimientos[0].tipo, 'CORREGIR_RESGUARDO');
  // Sin renglón abierto no se corrige
  const t2 = cargar([equipo('EQU-3', '0030', 'RESGUARDO')], []);
  assert.match(t2.R.formulario(['EQU-3'], usuario, { corregir: true }).omitidos[0].motivo, /No está en Resguardos y cancelaciones/);
});

test('guardado desde el AppSheet (sin renglón abierto): Líneas lo manda y entra por recibir', () => {
  // Un renglón cerrado (Pau ya lo entregó a Líneas) no cuenta como abierto
  const bandeja = [{ 'ID': 'RSG-9', 'REGISTRO_ID': 'EQU-3', 'NUCO': '0030', 'ESTADO': 'ENTREGADO A LINEAS', 'ESTATUS_EQUIPO': 'RESGUARDO' }];
  const t = cargar([equipo('EQU-3', '0030', 'RESGUARDO'), equipo('EQU-4', '0040', 'RESGUARDO')], bandeja);
  const f = t.R.formulario(['EQU-3', 'EQU-4'], usuario);
  assert.ok(f.equipos.every((q) => !q.enBandeja && !q.estatusFijo && q.opcionesEstatus.indexOf('RESGUARDO') >= 0));
  const r = t.R.mandar(['EQU-3', 'EQU-4'], { comentario: 'del appsheet', porEquipo: { 'EQU-3': pedido('RESGUARDO'), 'EQU-4': pedido('RESGUARDO') } }, usuario);
  assert.deepEqual(r.hechos.map((h) => h.porRecibir), [true, true]);
  const nuevos = t.escritas.agregadas.map((a) => a.fila);
  assert.deepEqual(nuevos.map((x) => [x.NUCO, x.ESTADO, x.RECIBIO]), [['0030', 'PENDIENTE DE RECEPCION', ''], ['0040', 'PENDIENTE DE RECEPCION', '']]);
});

const conLinea = (id, nuco, fin, extra) => equipo(id, nuco, 'USO', Object.assign({ 'TIPO': 'EQUIPO + SIM', 'ID LINEA': 'LIN-' + nuco,
  'NUMERO TELEFONO': '442' + nuco, 'FIN PLAN': fin, 'COMPAÑIA': 'TELCEL', 'ESTATUS LINEA': 'USO' }, extra || {}));

test('la línea que va a cancelación se separa del equipo y entra sola a Cancelaciones, con el motivo de su adendum', () => {
  const t = cargar([conLinea('EQU-5', '0050', '01/01/2025'), conLinea('EQU-6', '0060', '01/01/2027'), conLinea('EQU-7', '0070', '01/01/2027')], []);
  t.R.mandar(['EQU-5', 'EQU-6', 'EQU-7'], { comentario: 'renuncia', inspecciones: { 'EQU-5': 'INS-5', 'EQU-6': 'INS-6', 'EQU-7': 'INS-7' }, porEquipo: {
    'EQU-5': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }), // vencido: va a cancelación aunque se eligió DISPONIBLE
    'EQU-6': pedido('RESGUARDO', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }),
    'EQU-7': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }),
  } }, usuario);
  const filas = t.tablas.APP_RESGUARDOS;
  const resg = filas.filter((x) => x.ESTADO);
  const canc = filas.filter((x) => x.CANCELACION);
  // Resguardos solo tiene equipos (sin cancelación); el número que tenía se queda en NUMERO y LINEA_AL_MANDAR
  assert.deepEqual(resg.map((x) => [x.NUCO, x.NUMERO, x.LINEA_AL_MANDAR, x.ESTATUS_LINEA, x.CANCELACION]),
    [['0050', '4420050', '4420050', '', ''], ['0060', '4420060', '4420060', '', ''], ['0070', '4420070', '4420070', 'DISPONIBLE', '']]);
  // En el panel, «Línea» de la que se fue dice su número con el estatus de hoy (Líneas, 20-oct: «así les funciona»)
  const enPanel = t.R.bandeja(usuario).filas.filter((x) => x.ESTADO && x.NUCO === '0050')[0];
  assert.deepEqual([enPanel.NUMERO, enPanel.ESTATUS_LINEA], ['4420050', 'EN PROCESO DE CANCELACION']);
  assert.ok(resg.every((x) => /^MVT-/.test(x.MOVIMIENTO_ID)), 'guarda el movimiento del envío');
  // Cancelaciones solo líneas: su ID, de qué NUCO salió y su motivo
  assert.deepEqual(canc.map((x) => [x.REGISTRO_ID, x.ID_LINEA, x.NUCO, x.ESTADO, x.CANCELACION, x.MOTIVO_CANCELACION]),
    [['LIN-0050', 'LIN-0050', '0050', '', 'POR FIRMAR', 'LINEA VENCIDA'], ['LIN-0060', 'LIN-0060', '0060', '', 'POR FIRMAR', 'CANCELACION ANTICIPADA']]);
  // La línea suelta quedó EN PROCESO DE CANCELACION; el equipo, sin ella
  const inv = (id) => t.tablas['LINEAS TELEFONICAS'].filter((f) => f.ID === id)[0];
  assert.equal(inv('LIN-0050')['ESTATUS LINEA'], 'EN PROCESO DE CANCELACION');
  assert.equal(inv('EQU-5')['NUMERO TELEFONO'], '');
  assert.equal(inv('EQU-7')['ESTATUS LINEA'], 'DISPONIBLE');
  const envio = t.escritas.movimientos.filter((m) => m.tipo === 'RESGUARDO')[0];
  assert.deepEqual(envio.extra.detalle.cambios.slice(-1), [{ campo: 'MOTIVO DE CANCELACION', antes: '', despues: 'LINEA VENCIDA' }]);
  assert.ok(envio.extra.detalle.cambios.some((c) => c.campo === 'NUMERO TELEFONO' && c.despues === ''), 'la línea sale del equipo en el historial');
  // Sin fecha o SIM básico no se sabe: en blanco
  assert.equal(t.R.motivoCancelacionDe({ 'TIPO': 'EQUIPO + SIM', 'FIN PLAN': '' }), '');
  assert.equal(t.R.motivoCancelacionDe({ 'TIPO': 'EQUIPO + SIM BASICO', 'FIN PLAN': '01/01/2025' }), '');
});

test('CANCELADA directo: la línea queda cancelada y suelta, y el equipo entra solo', () => {
  const t = cargar([conLinea('EQU-5', '0050', '01/01/2025')], []);
  t.R.mandar(['EQU-5'], { comentario: 'renuncia', inspecciones: { 'EQU-5': 'INS-5' }, porEquipo: {
    'EQU-5': pedido('RESGUARDO', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION', cancelacionLinea: 'DIRECTO' }) } }, usuario);
  assert.deepEqual(t.tablas.APP_RESGUARDOS.map((x) => [x.ESTADO, x.NUMERO, x.CANCELACION]), [['PENDIENTE DE RECEPCION', '4420050', '']]);
  assert.equal(t.tablas['LINEAS TELEFONICAS'].filter((f) => f.ID === 'LIN-0050')[0]['ESTATUS LINEA'], 'CANCELADA');
  assert.ok(t.escritas.movimientos.some((m) => m.tipo === 'CANCELACION_LINEA' && m.extra.detalle.sinPanel));
});

test('la línea que ya está en Cancelaciones: sigue ahí al mandar el equipo, no pasa a DISPONIBLE y no se duplica', () => {
  const bandeja = [{ 'ID': 'RSG-9', 'REGISTRO_ID': 'EQU-8', 'NUMERO': '4420080', 'ESTADO': '', 'CANCELACION': 'POR FIRMAR' }];
  const t = cargar([conLinea('EQU-8', '0080', '01/01/2027', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' })], bandeja);
  const f = t.R.formulario(['EQU-8'], usuario);
  assert.equal(f.equipos[0].cancelacion, 'POR FIRMAR');
  assert.equal(f.equipos[0].propuestaLinea, 'EN PROCESO DE CANCELACION');
  // Líneas no la pasa a DISPONIBLE: avisa su fase
  const r0 = t.R.mandar(['EQU-8'], { comentario: 'renuncia', inspecciones: { 'EQU-8': 'INS-8' }, porEquipo: { 'EQU-8': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }) } }, usuario);
  assert.equal(r0.omitidos[0].motivo, 'Línea 4420080: está en POR FIRMAR en Cancelaciones; Pau tiene que retirarla.');
  assert.throws(() => t.R.exigirSinCancelacion(t.tablas['LINEAS TELEFONICAS'][0]), /Línea 4420080: está en POR FIRMAR en Cancelaciones; Pau tiene que retirarla\./);
  // Con su estatus de cancelación: se separa conservándolo y no abre otra cancelación
  t.R.mandar(['EQU-8'], { comentario: 'renuncia', inspecciones: { 'EQU-8': 'INS-8' }, porEquipo: { 'EQU-8': pedido('RESGUARDO', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }) } }, usuario);
  assert.equal(t.tablas.APP_RESGUARDOS.filter((x) => x.CANCELACION).length, 1);
  assert.equal(t.tablas['LINEAS TELEFONICAS'].filter((x) => x.ID === 'LIN-0080')[0]['ESTATUS LINEA'], 'EN PROCESO DE CANCELACION');
  // Mandar a cancelación tampoco la duplica (por su número, en los renglones viejos)
  const t2 = cargar([conLinea('EQU-8', '0080', '01/01/2027')], bandeja.map((x) => Object.assign({}, x)));
  assert.equal(t2.R.mandarCancelacion(['EQU-8'], { motivoCancelacion: 'LINEA VENCIDA', comentario: 'otra vez' }, usuario).omitidos[0].motivo, 'Ya está en la bandeja de cancelaciones');
});

test('confirmar y retirar la cancelación siguen a la línea esté donde esté (2.52 y 3.11)', () => {
  // Renglón viejo desde el equipo; la línea ya se desvinculó y está suelta
  const linea = { 'ID': 'LIN-1', 'ID LINEA': 'LIN-1', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' };
  const linea2 = { 'ID': 'LIN-2', 'ID LINEA': 'LIN-2', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4429999999', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' };
  const bandeja = [
    { 'ID': 'RSG-1', 'REGISTRO_ID': 'EQU-1', 'NUMERO': '4421090805', 'ESTADO': '', 'CANCELACION': 'CARTA ENVIADA' },
    { 'ID': 'RSG-2', 'REGISTRO_ID': 'LIN-2', 'ID_LINEA': 'LIN-2', 'NUMERO': '4429999999', 'ESTADO': '', 'CANCELACION': 'POR FIRMAR' },
  ];
  const t = cargar([equipo('EQU-1', '0012', 'USO'), linea, linea2], bandeja);
  const pau = { correo: 'pau@x', nombre: 'PAU', puedeAprobar: true };
  t.R.confirmarCancelacion(['RSG-1'], {}, pau);
  assert.equal(linea['ESTATUS LINEA'], 'CANCELADA');
  // Retirar: solo Pau, con comentario; el renglón queda RETIRADA y la línea DISPONIBLE
  assert.throws(() => t.R.retirarCancelacion(['RSG-2'], { comentario: 'sigue en uso' }, usuario), /Solo puedes consultar/);
  assert.throws(() => t.R.retirarCancelacion(['RSG-2'], { comentario: '' }, pau), /Escribe el comentario/);
  t.R.retirarCancelacion(['RSG-2'], { comentario: 'sigue en uso' }, pau);
  assert.equal(t.tablas.APP_RESGUARDOS[1].CANCELACION, 'RETIRADA');
  assert.equal(t.tablas.APP_RESGUARDOS[1].RETIRO_MOTIVO, 'sigue en uso');
  assert.equal(linea2['ESTATUS LINEA'], 'DISPONIBLE');
  assert.ok(t.escritas.movimientos.some((m) => m.tipo === 'RETIRAR_CANCELACION'));
  assert.equal(t.R.cancelacionDe(linea2), null, 'retirada ya no está en curso');
});

test('Quitar del panel: solo lo pendiente; regresa lo que nadie tocó y respeta lo que cambió después', () => {
  const t = cargar([equipo('EQU-1', '0012', 'USO', { 'RESPONSABLE': 'ANA', 'PUESTO': 'VENTAS', 'PIN EQUIPO': '1234' })], []);
  t.R.mandar(['EQU-1'], { comentario: 'renuncia', inspecciones: { 'EQU-1': 'INS-1' }, porEquipo: { 'EQU-1': pedido('RESGUARDO') } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  assert.equal(eq['RESPONSABLE'], '');
  eq['SEDE'] = 'LEON'; // corregido después: se queda
  const vista = t.R.vistaQuitar(['EQU-1']).filas[0];
  const campos = vista.regresa.map((x) => x.campo);
  assert.ok(['ESTATUS EQUIPO', 'RESPONSABLE', 'PUESTO', 'PIN EQUIPO', 'DEPARTAMENTO'].every((c) => campos.indexOf(c) >= 0), campos.join());
  assert.deepEqual(vista.seQueda, [{ campo: 'SEDE', valor: 'LEON', motivo: 'Cambió después' }]);
  assert.deepEqual(vista.regresa.filter((x) => x.campo === 'PIN EQUIPO')[0], { campo: 'PIN EQUIPO', de: '', a: '••••' }, 'sin permiso, el PIN no se ve');
  assert.deepEqual(t.R.vistaQuitar(['EQU-1'], true).filas[0].regresa.filter((x) => x.campo === 'PIN EQUIPO')[0], { campo: 'PIN EQUIPO', de: '', a: '1234' });
  assert.throws(() => t.R.quitarDelPanel(['EQU-1'], { comentario: '' }, usuario), /Escribe el comentario/);
  const r = t.R.quitarDelPanel(['EQU-1'], { comentario: 'mandado por error' }, usuario);
  assert.equal(r.hechos.length, 1);
  assert.equal(t.tablas.APP_RESGUARDOS.length, 0, 'el renglón se borra (usuario, 22-oct), no queda RETIRADO');
  assert.deepEqual([eq['ESTATUS EQUIPO'], eq['RESPONSABLE'], eq['PUESTO'], eq['PIN EQUIPO'], eq['SEDE'], eq['DEPARTAMENTO']], ['USO', 'ANA', 'VENTAS', '1234', 'LEON', 'VENTAS']);
  assert.equal(t.escritas.movimientos.slice(-1)[0].tipo, 'QUITAR_PANEL');
  // Lo que Pau ya recibió no se quita: lo saca con «Entregar a líneas»
  const t2 = cargar([equipo('EQU-2', '0020', 'RESGUARDO')], [{ 'ID': 'RSG-2', 'REGISTRO_ID': 'EQU-2', 'ESTADO': 'EN RESGUARDO' }]);
  assert.match(t2.R.quitarDelPanel(['RSG-2'], { comentario: 'por error' }, usuario).omitidos[0].motivo, /Ya lo recibió Pau: lo saca con «Entregar a líneas»/);
});

test('Quitar del panel con el estatus cambiado después: la persona no regresa a un equipo guardado', () => {
  const t = cargar([equipo('EQU-1', '0012', 'USO', { 'RESPONSABLE': 'ANA' })], []);
  t.R.mandar(['EQU-1'], { comentario: 'renuncia', inspecciones: { 'EQU-1': 'INS-1' }, porEquipo: { 'EQU-1': pedido('RESGUARDO') } }, usuario);
  t.tablas['LINEAS TELEFONICAS'][0]['ESTATUS EQUIPO'] = 'PARA VENTA';
  const vista = t.R.vistaQuitar(['EQU-1']).filas[0];
  assert.equal(vista.regresa.filter((x) => x.campo === 'RESPONSABLE').length, 0);
  assert.deepEqual(vista.seQueda.filter((x) => x.campo === 'RESPONSABLE')[0], { campo: 'RESPONSABLE', valor: '', motivo: 'El equipo sigue en PARA VENTA' });
});

test('Mandar a cancelación: el motivo se elige (LINEA VENCIDA o CANCELACION ANTICIPADA) y llega a la bandeja y al historial', () => {
  const linea = { 'ID': 'LIN-1', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'DISPONIBLE', 'FIN PLAN': '01/01/2027' };
  const t = cargar([linea], []);
  assert.throws(() => t.R.mandarCancelacion(['LIN-1'], { comentario: 'ya no se usa' }, usuario), /Elige el motivo de la cancelación/);
  assert.throws(() => t.R.mandarCancelacion(['LIN-1'], { motivoCancelacion: 'OTRA', comentario: 'ya no se usa' }, usuario), /Elige el motivo/);
  t.R.mandarCancelacion(['LIN-1'], { motivoCancelacion: 'LINEA VENCIDA', comentario: 'ya no se usa' }, usuario);
  assert.equal(t.tablas.APP_RESGUARDOS[0].MOTIVO_CANCELACION, 'LINEA VENCIDA');
  assert.deepEqual(t.escritas.movimientos[0].extra.detalle.cambios.slice(-1), [{ campo: 'MOTIVO DE CANCELACION', antes: '', despues: 'LINEA VENCIDA' }]);
  // Desvincular y Cambiar línea no lo eligen: sale del adendum (aquí vigente)
  const t2 = cargar([Object.assign({}, linea)], [{ 'ID': 'RSG-1', 'REGISTRO_ID': 'OTRO', 'ESTADO': 'EN RESGUARDO' }]);
  t2.R.mandarCancelacion(['LIN-1'], { comentario: 'se cambió de línea' }, usuario, { motivoDelAdendum: true });
  assert.equal(t2.tablas.APP_RESGUARDOS[1].MOTIVO_CANCELACION, 'CANCELACION ANTICIPADA');
  // La hoja que ya existía recibe la columna nueva
  assert.deepEqual(t2.escritas.columnas, [['APP_RESGUARDOS', 'MOTIVO_CANCELACION', 'ACCESORIOS', 'ID_LINEA', 'LINEA_AL_MANDAR', 'MOVIMIENTO_ID', 'RETIRADO_EN', 'RETIRO', 'RETIRO_MOTIVO']]);
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /\{ comentario: comentario, ticket: ticket \}, usuario,\s+\{ motivoDelAdendum: true, nucos:/);
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

// El panel de Pau espeja el inventario mientras el renglón sigue abierto (usuario, 13-oct; plan §5.5)
test('la bandeja muestra lo de hoy del inventario en lo abierto y deja como quedó lo cerrado', () => {
  const inv = [
    equipo('EQU-1', '0012', 'RESGUARDO', { 'EQUIPO': 'MOTO G', 'IMEI': '111', 'ACCESORIOS': 'CAJA, CABLE', 'TIPO': 'EQUIPO + SIM',
      'NUMERO TELEFONO': '4420000001', 'COMPAÑIA': 'TELCEL', 'RAZON SOCIAL': 'FRO', 'FIN PLAN': '01/12/2026' }),
    equipo('EQU-2', '0013', 'VENDIDO', { 'EQUIPO': 'IPHONE', 'IMEI': '222' }),
    equipo('EQU-3', '0014', 'USO', { 'TIPO': 'EQUIPO + SIM', 'NUMERO TELEFONO': '4420000009', 'COMPAÑIA': 'ATT' }),
  ];
  const bandeja = [
    { ID: 'R1', REGISTRO_ID: 'EQU-1', NUCO: '0012', MODELO: 'MOTO', IMEI: '000', NUMERO: '4420000001', COMPANIA: 'ATT', ESTADO: 'EN RESGUARDO',
      SEDE: 'QUERETARO', ESTATUS_EQUIPO: 'RESGUARDO', COMENTARIO: 'PRIMERO' },
    { ID: 'R2', REGISTRO_ID: 'EQU-2', NUCO: '0013', MODELO: 'VIEJO', IMEI: '999', ESTADO: 'VENDIDO' },
    // Cancelación en curso de un número que el equipo ya no tiene: la línea se queda como se mandó
    { ID: 'R3', REGISTRO_ID: 'EQU-3', NUCO: '0014', NUMERO: '4420000005', COMPANIA: 'TELCEL', ESTADO: '', CANCELACION: 'POR FIRMAR' },
  ];
  const t = cargar(inv, bandeja);
  inv[0]['SEDE'] = 'MERIDA'; // editado en el inventario: la sede es del trámite, no se espeja
  const filas = t.R.bandeja({ puedeAprobar: true }).filas;
  const r = (id) => filas.filter((f) => f.ID === id)[0];
  assert.equal(r('R1').MODELO, 'MOTO G');
  assert.equal(r('R1').IMEI, '111');
  assert.equal(r('R1').ACCESORIOS, 'CAJA, CABLE');
  assert.equal(r('R1').COMPANIA, 'TELCEL');
  assert.equal(r('R1').RAZON_SOCIAL, 'FRO');
  assert.equal(r('R1').FIN_PLAN, '01/12/2026');
  assert.equal(r('R1').SEDE, 'QUERETARO');
  assert.equal(r('R1').ESTATUS_EQUIPO, 'RESGUARDO');
  assert.equal(r('R1').COMENTARIO, 'PRIMERO');
  assert.equal(r('R2').MODELO, 'VIEJO', 'lo vendido se queda como quedó');
  assert.equal(r('R3').NUMERO, '4420000005');
  assert.equal(r('R3').COMPANIA, 'TELCEL');
  assert.equal(r('R3').NUCO, '0014');
});

test('al mandar a resguardo se guardan los accesorios del equipo en la bandeja', () => {
  const t = cargar([equipo('EQU-1', '0012', 'USO', { 'ACCESORIOS': 'CAJA, FUNDA' })], []);
  t.R.mandar(['EQU-1'], { comentario: 'SE GUARDA', porEquipo: { 'EQU-1': pedido('RESGUARDO') }, inspecciones: { 'EQU-1': 'INS-1' } }, usuario);
  assert.equal(t.tablas.APP_RESGUARDOS[0].ACCESORIOS, 'CAJA, FUNDA');
  assert.ok(t.escritas.columnas.some((c) => c.indexOf('ACCESORIOS') > 0), 'la columna se agrega a la hoja que ya existe');
});

test('cada paso de la bandeja espera en su ventana hasta que contesta el servidor', () => {
  const html = read('src/html/js/lineas.html');
  const paso = html.slice(html.indexOf('async function paso(accion, filas, opciones)'), html.indexOf('const ACCIONES = {'));
  assert.match(paso, /pedirDatos\(o\.titulo, o\.mensaje, o\.campos \|\| \[\], o\.boton, \{/);
  assert.match(paso, /alConfirmar: \(extra\) => llamar\('apiLineasAccionBandejaResguardo'/);
  assert.doesNotMatch(paso, /Confirmar\.pedir/);
  const acciones = html.slice(html.indexOf('const ACCIONES = {'), html.indexOf('function filasVista()'));
  assert.equal((acciones.match(/espera: '/g) || []).length, 9, 'las nueve acciones dicen qué están haciendo (Donado y Desechado: 3.16)');
  // Textos en oración y lo nuevo del 3.12: Retirar cancelación (Pau) y, para Líneas, Corregir resguardo y Quitar del panel
  assert.match(acciones, /texto: 'Entregar a líneas'/);
  assert.doesNotMatch(html, /Entregar a Líneas|Entregados a Líneas/);
  assert.match(acciones, /paso\('RETIRAR_CANCELACION', filas,/);
  assert.match(html, /accionesSeleccion: \(puede \? ACCIONES\[vista\] : \[\]\)\.concat\(opera && vista === 'RESGUARDOS' \? ACCIONES_LINEAS : \[\]\),/);
  assert.match(html, /function quitarDelPanel\(ids, alTerminar\)/);
  assert.match(html, /llamar\('apiLineasVistaQuitarPanel', ids\)/);
  assert.doesNotMatch(html, /titulo: 'Línea al mandar'/); // la línea va en «Línea» (Líneas, 20-oct)
  assert.match(html, /\{ campo: 'ACCESORIOS', titulo: 'Accesorios'/);
});

// Prueba en /dev del 20-oct: Corregir resguardo del NUCO 0035 desligó su línea vencida (DISPONIBLE con el equipo)
test('Corregir resguardo no separa la línea: la vencida se queda DISPONIBLE y la que está en Cancelaciones, como está', () => {
  const abierto = (id) => ({ 'ID': 'RSG-' + id, 'REGISTRO_ID': id, 'ESTADO': 'EN RESGUARDO', 'MOTIVO': 'SE GUARDA' });
  const vencida = equipo('EQU-1', '0035', 'RESGUARDO', { 'TIPO': 'EQUIPO + SIM', 'ID LINEA': 'LIN-1', 'NUMERO TELEFONO': '6633231987',
    'FIN PLAN': '01/01/2025', 'ESTATUS LINEA': 'DISPONIBLE' });
  const t = cargar([vencida], [abierto('EQU-1')]);
  assert.equal(t.R.formulario(['EQU-1'], usuario, { corregir: true }).equipos[0].actual.COMENTARIO, 'SE GUARDA', 'sin COMENTARIO, el MOTIVO');
  t.R.mandar(['EQU-1'], { corregir: true, comentario: 'otra sede', porEquipo: { 'EQU-1': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE', SEDE: 'LEON' }) } }, usuario);
  assert.equal(vencida['NUMERO TELEFONO'], '6633231987');
  assert.equal(vencida['ESTATUS LINEA'], 'DISPONIBLE');
  assert.equal(t.tablas.APP_RESGUARDOS.length, 1, 'sin cancelación nueva');
  assert.equal(t.tablas.APP_RESGUARDOS[0].MOTIVO, 'otra sede');
  // Renglón viejo que junta resguardo y cancelación: Corregir no la separa ni cambia su estatus
  const enCurso = equipo('EQU-2', '0036', 'RESGUARDO', { 'TIPO': 'EQUIPO + SIM', 'ID LINEA': 'LIN-2', 'NUMERO TELEFONO': '4420000036',
    'FIN PLAN': '01/01/2027', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' });
  const t2 = cargar([enCurso], [Object.assign(abierto('EQU-2'), { 'NUMERO': '4420000036', 'CANCELACION': 'POR FIRMAR' })]);
  t2.R.mandar(['EQU-2'], { corregir: true, comentario: 'otra sede', porEquipo: { 'EQU-2': pedido('PARA VENTA', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }) } }, usuario);
  assert.equal(enCurso['NUMERO TELEFONO'], '4420000036');
  assert.equal(enCurso['ESTATUS LINEA'], 'EN PROCESO DE CANCELACION');
  assert.equal(t2.tablas.APP_RESGUARDOS[0].ESTATUS_EQUIPO, 'PARA VENTA');
  // Y si al corregir se elige mandarla a cancelación, entonces sí se separa y entra sola
  const t3 = cargar([equipo('EQU-3', '0037', 'RESGUARDO', { 'TIPO': 'EQUIPO + SIM', 'ID LINEA': 'LIN-3', 'NUMERO TELEFONO': '4420000037',
    'FIN PLAN': '01/01/2027', 'ESTATUS LINEA': 'DISPONIBLE' })], [abierto('EQU-3')]);
  t3.R.mandar(['EQU-3'], { corregir: true, comentario: 'ya no', porEquipo: { 'EQU-3': pedido('RESGUARDO', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' }) } }, usuario);
  assert.deepEqual(t3.tablas.APP_RESGUARDOS.map((x) => [x.ESTADO, x.CANCELACION || '', x.NUMERO || '']), [['EN RESGUARDO', '', ''], ['', 'POR FIRMAR', '4420000037']]);
});

// Usuario, 20-oct: al quitar del panel, la línea que se fue a Cancelaciones con ese envío también regresa
test('Quitar del panel regresa la línea que se fue a Cancelaciones si sigue POR FIRMAR', () => {
  const t = cargar([conLinea('EQU-5', '0050', '01/01/2025', { 'RESPONSABLE': 'ANA' })], []);
  t.R.mandar(['EQU-5'], { comentario: 'renuncia', inspecciones: { 'EQU-5': 'INS-5' }, porEquipo: { 'EQU-5': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }) } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  assert.equal(eq['NUMERO TELEFONO'], '');
  const vista = t.R.vistaQuitar(['EQU-5'], true).filas[0];
  assert.deepEqual(vista.regresa.filter((x) => x.campo === 'NUMERO TELEFONO')[0], { campo: 'NUMERO TELEFONO', de: '', a: '4420050' });
  assert.ok(vista.regresa.some((x) => x.campo === 'ESTATUS LINEA' && x.a === 'USO'), 'con su estatus de antes');
  t.R.quitarDelPanel(['EQU-5'], { comentario: 'mandado por error' }, usuario);
  assert.equal(t.tablas.APP_RESGUARDOS.length, 0, 'también se borra el renglón de la cancelación que salió con el envío');
  assert.deepEqual([eq['NUMERO TELEFONO'], eq['ESTATUS LINEA'], eq['ESTATUS EQUIPO'], eq['RESPONSABLE']], ['4420050', 'USO', 'USO', 'ANA']);
  // Si Pau ya avanzó la cancelación, la línea se queda
  const t2 = cargar([conLinea('EQU-6', '0060', '01/01/2025')], []);
  t2.R.mandar(['EQU-6'], { comentario: 'renuncia', inspecciones: { 'EQU-6': 'INS-6' }, porEquipo: { 'EQU-6': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }) } }, usuario);
  t2.tablas.APP_RESGUARDOS.filter((x) => x.ID_LINEA)[0].CANCELACION = 'CARTA FIRMADA';
  assert.deepEqual(t2.R.vistaQuitar(['EQU-6']).filas[0].seQueda.filter((x) => x.campo === 'NUMERO TELEFONO')[0],
    { campo: 'NUMERO TELEFONO', valor: '', motivo: 'Línea 4420060: está en CARTA FIRMADA en Cancelaciones; Pau tiene que retirarla.' });
});

// Pendiente 3.14 (usuario, 21-oct): al retirar una cancelación, la línea vuelve a como estaba antes de mandarla a cancelar,
// con la lógica de Quitar del panel (lo que cambió después se queda)
const pau = { correo: 'pau@x', nombre: 'PAU', puedeAprobar: true };

test('Retirar cancelación: la línea separada al mandar a resguardo vuelve a su equipo con su PIN; DISPONIBLE porque el equipo sigue guardado', () => {
  const t = cargar([conLinea('EQU-5', '0050', '01/01/2025', { 'RESPONSABLE': 'ANA', 'PIN WHATSAPP': '9999' })], []);
  t.R.mandar(['EQU-5'], { comentario: 'renuncia', inspecciones: { 'EQU-5': 'INS-5' }, porEquipo: { 'EQU-5': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }) } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  const canc = t.tablas.APP_RESGUARDOS.filter((x) => x.ID_LINEA)[0];
  canc.ID = 'RSG-C';
  canc.CANCELACION = 'CARTA ENVIADA'; // Pau la retira en cualquier fase en curso
  assert.deepEqual([eq['NUMERO TELEFONO'], eq['PIN WHATSAPP']], ['', '']);
  const vista = t.R.vistaRetirar(['RSG-C'], true).filas[0];
  assert.deepEqual(vista.regresa, [
    { campo: 'NUCO', de: '', a: '0050' },
    { campo: 'PIN WHATSAPP', de: '', a: '9999' },
    { campo: 'ESTATUS LINEA', de: 'EN PROCESO DE CANCELACION', a: 'DISPONIBLE', nota: 'Antes USO: el NUCO 0050 está en POR RECIBIR' },
  ]);
  assert.equal(t.R.vistaRetirar(['RSG-C']).filas[0].regresa[1].a, '••••', 'sin permiso, el PIN no se ve');
  assert.throws(() => t.R.retirarCancelacion(['RSG-C'], { comentario: 'ya no' }, usuario), /Solo puedes consultar/);
  const r = t.R.retirarCancelacion(['RSG-C'], { comentario: 'se queda con ella' }, pau);
  assert.equal(r.hechos.length, 1);
  assert.equal(canc.CANCELACION, 'RETIRADA');
  // Pau aún no lo recibe: el equipo sigue POR RECIBIR (pendiente 3.15)
  assert.deepEqual([eq['NUMERO TELEFONO'], eq['PIN WHATSAPP'], eq['ESTATUS LINEA'], eq['ESTATUS EQUIPO']], ['4420050', '9999', 'DISPONIBLE', 'POR RECIBIR']);
  assert.equal(t.escritas.movimientos.slice(-1)[0].tipo, 'RETIRAR_CANCELACION');
  assert.equal(t.R.vistaRetirar(['RSG-C']).filas[0].omitir, 'Ya estaba retirada');
});

test('Retirar cancelación: lo que cambió después se queda (el equipo ya tiene otra línea)', () => {
  const t = cargar([conLinea('EQU-6', '0060', '01/01/2025', { 'PIN WHATSAPP': '1111' })], []);
  t.R.mandar(['EQU-6'], { comentario: 'renuncia', inspecciones: { 'EQU-6': 'INS-6' }, porEquipo: { 'EQU-6': pedido('RESGUARDO', { 'ESTATUS LINEA': 'DISPONIBLE' }) } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  const canc = t.tablas.APP_RESGUARDOS.filter((x) => x.ID_LINEA)[0];
  canc.ID = 'RSG-C';
  eq['NUMERO TELEFONO'] = '4429999';
  const vista = t.R.vistaRetirar(['RSG-C'], true).filas[0];
  assert.deepEqual(vista.seQueda, [{ campo: 'NUCO', valor: '', motivo: 'El NUCO 0060 ya tiene la línea 4429999' }]);
  assert.deepEqual(vista.regresa, [{ campo: 'ESTATUS LINEA', de: 'EN PROCESO DE CANCELACION', a: 'DISPONIBLE', nota: 'Antes USO: la línea está sin equipo' }]);
  t.R.retirarCancelacion(['RSG-C'], { comentario: 'se queda suelta' }, pau);
  const linea = t.tablas['LINEAS TELEFONICAS'].filter((x) => x.ID === 'LIN-0060')[0];
  assert.deepEqual([linea['ESTATUS LINEA'], eq['NUMERO TELEFONO']], ['DISPONIBLE', '4429999']);
});

test('Retirar cancelación: la mandada sin resguardo regresa a USO con su equipo', () => {
  const t = cargar([conLinea('EQU-7', '0070', '01/01/2027')], []);
  t.R.mandarCancelacion(['EQU-7'], { motivoCancelacion: 'CANCELACION ANTICIPADA', comentario: 'ya no se usa' }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  assert.equal(eq['ESTATUS LINEA'], 'EN PROCESO DE CANCELACION');
  t.tablas.APP_RESGUARDOS[0].ID = 'RSG-7';
  assert.deepEqual(t.R.vistaRetirar(['RSG-7']).filas[0].regresa, [{ campo: 'ESTATUS LINEA', de: 'EN PROCESO DE CANCELACION', a: 'USO' }]);
  t.R.retirarCancelacion(['RSG-7'], { comentario: 'siempre no' }, pau);
  assert.deepEqual([eq['ESTATUS LINEA'], eq['NUMERO TELEFONO']], ['USO', '4420070']);
  // La pantalla: la ventana de Pau con la misma tabla de Quitar del panel
  const html = read('src/html/js/lineas.html');
  assert.match(html, /cuerpo: vistaRetiro\(filas\.map\(\(f\) => f\.ID\)\)/);
  assert.match(html, /llamar\('apiLineasVistaRetirarCancelacion', ids\)/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasVistaRetirarCancelacion\(token, ids\)/);
});

// Usuario, 21-oct: Corregir resguardo se hace encima del panel (antes llevaba al equipo en Líneas telefónicas) y, en el
// panel, Corregir resguardo y Quitar del panel solo salen a los de Líneas: ni Pau ni administradores
test('el panel corrige sin salir de él y sus opciones de Líneas no salen a administradores', () => {
  const html = read('src/html/js/lineas.html');
  const lineas = html.slice(html.indexOf('const ACCIONES_LINEAS = ['), html.indexOf('function filasVista()'));
  assert.match(lineas, /alHacer: \(filas\) => corregirEnPanel\(filas\[0\], raiz, \(\) => \{ if \(tabla\) tabla\.limpiarSeleccion\(\); cargar\(\); \}\) \},/);
  assert.doesNotMatch(html, /irARegistro\(filas\[0\]\.REGISTRO_ID\)|corregirAlEntrar/);
  const corregir = html.slice(html.indexOf('function corregirEnPanel('), html.indexOf('function initResguardos()'));
  assert.match(corregir, /llamar\('apiLineasFormularioResguardo', \[fila\.REGISTRO_ID\], \{ corregir: true \}\)/);
  assert.match(corregir, /fr = formularioResguardo\(form, \{ corregir: true \}\);/);
  assert.match(corregir, /ancho: \{ tipo: 'RESGUARDO', icono: 'archive' \}, dentro: dentro,/);
  assert.match(corregir, /\{ comentario: d\.valores\._MOTIVO, ticket: d\.valores\._TICKET, porEquipo: d\.porEquipo, corregir: true \}/);
  assert.match(corregir, /elegirPastilla\(p\)/);
  // La misma pieza en Líneas telefónicas
  const abrir = html.slice(html.indexOf('async function abrirResguardo('), html.indexOf('async function abrirCancelacion('));
  assert.match(abrir, /const fr = formularioResguardo\(form,/);
  assert.match(html, /const opera = !!\(datos && datos\.operaPanel\);/);
  // Servidor: operaPanel = edita Líneas telefónicas y no es ADMIN ni SUPER; puedeOperar (Líneas telefónicas) no cambia
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /operaPanel: puedeOperar && \['ADMIN', 'SUPER'\]\.indexOf\(String\(sesion\.rol \|\| ''\)\.toUpperCase\(\)\) < 0/);
  const t = cargar([], []);
  assert.strictEqual(t.R.bandeja({ puedeOperar: true, operaPanel: false }).operaPanel, false);
  assert.strictEqual(t.R.bandeja({ puedeOperar: true, operaPanel: true }).operaPanel, true);
  assert.strictEqual(t.R.bandeja({ puedeOperar: true, operaPanel: false }).puedeOperar, true);
});

// Pendiente 3.15 (usuario, 21-oct): POR RECIBIR se guarda en el inventario hasta que Pau recibe el equipo; el estatus
// elegido espera en el renglón
test('POR RECIBIR: mandar lo deja así, Corregir resguardo solo cambia el renglón y Pau al recibir pone el elegido', () => {
  const t = cargar([equipo('EQU-7', '0070', 'USO', { 'RESPONSABLE': 'ANA' })], []);
  t.R.mandar(['EQU-7'], { comentario: 'renuncia', inspecciones: { 'EQU-7': 'INS-7' }, porEquipo: { 'EQU-7': pedido('PARA VENTA') } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  const renglon = t.tablas.APP_RESGUARDOS[0];
  renglon.ID = 'RSG-7';
  assert.deepEqual([eq['ESTATUS EQUIPO'], renglon.ESTATUS_EQUIPO, renglon.ESTADO], ['POR RECIBIR', 'PARA VENTA', 'PENDIENTE DE RECEPCION']);
  assert.equal(t.escritas.movimientos.slice(-1)[0].extra.despues.estatus, 'POR RECIBIR');
  // El panel muestra el elegido, no POR RECIBIR
  assert.equal(t.R.bandeja(usuario).filas[0].ESTATUS_EQUIPO, 'PARA VENTA');
  // Corregir resguardo abre con el elegido marcado, no con POR RECIBIR
  assert.equal(t.R.formulario(['EQU-7'], usuario, { corregir: true }).equipos[0].actual['ESTATUS EQUIPO'], 'PARA VENTA');
  t.R.mandar(['EQU-7'], { comentario: 'mejor desecho', corregir: true, porEquipo: { 'EQU-7': pedido('PARA DESECHO') } }, usuario);
  assert.deepEqual([eq['ESTATUS EQUIPO'], renglon.ESTATUS_EQUIPO], ['POR RECIBIR', 'PARA DESECHO']);
  t.R.recibir(['RSG-7'], pau);
  assert.deepEqual([eq['ESTATUS EQUIPO'], renglon.ESTADO], ['PARA DESECHO', 'EN RESGUARDO']);
  const mov = t.escritas.movimientos.slice(-1)[0];
  assert.deepEqual([mov.tipo, mov.extra.antes.estatus, mov.extra.despues.estatus], ['RECEPCION', 'POR RECIBIR', 'PARA DESECHO']);
  // Ya recibido, Corregir resguardo sí le pone el elegido al equipo
  t.R.mandar(['EQU-7'], { comentario: 'se vende', corregir: true, porEquipo: { 'EQU-7': pedido('PARA VENTA') } }, usuario);
  assert.equal(eq['ESTATUS EQUIPO'], 'PARA VENTA');
});

test('POR RECIBIR: Quitar del panel lo regresa a como estaba; un renglón de antes sin POR RECIBIR se recibe sin tocar el equipo', () => {
  const t = cargar([equipo('EQU-8', '0080', 'USO', { 'RESPONSABLE': 'ANA' })], []);
  t.R.mandar(['EQU-8'], { comentario: 'renuncia', inspecciones: { 'EQU-8': 'INS-8' }, porEquipo: { 'EQU-8': pedido('RESGUARDO') } }, usuario);
  const eq = t.tablas['LINEAS TELEFONICAS'][0];
  t.tablas.APP_RESGUARDOS[0].ID = 'RSG-8';
  t.R.quitarDelPanel(['RSG-8'], { comentario: 'por error' }, usuario);
  assert.deepEqual([eq['ESTATUS EQUIPO'], eq['RESPONSABLE']], ['USO', 'ANA']);
  const viejo = cargar([equipo('EQU-9', '0090', 'RESGUARDO')], [{ 'ID': 'RSG-9', 'REGISTRO_ID': 'EQU-9', 'NUCO': '0090', 'ESTADO': 'PENDIENTE DE RECEPCION',
    'ESTATUS_EQUIPO': 'RESGUARDO' }]);
  const antes = viejo.escritas.movimientos.length;
  viejo.R.recibir(['RSG-9'], pau);
  assert.equal(viejo.tablas['LINEAS TELEFONICAS'][0]['ESTATUS EQUIPO'], 'RESGUARDO');
  assert.equal(viejo.escritas.movimientos.length, antes);
  // No se elige a mano: no está en las listas de Mandar a resguardo
  assert.ok(viejo.R.ESTATUS_EQUIPO_RESGUARDO.indexOf('POR RECIBIR') < 0);
  assert.match(read('src/services/lineas/LineasEstructura.gs'), /'POR RECIBIR': 'RESGUARDO'/);
});

// Usuario, 22-oct: Quitar del panel borra el renglón (no queda RETIRADO); con varios a la vez, borra los suyos y nada más
test('Quitar del panel con varios: borra sus renglones, de abajo hacia arriba, y deja los demás', () => {
  const t = cargar([equipo('EQU-1', '0012', 'USO'), equipo('EQU-2', '0013', 'USO'), equipo('EQU-3', '0014', 'USO')], []);
  ['EQU-1', 'EQU-2', 'EQU-3'].forEach((id) => t.R.mandar([id], { comentario: 'renuncia', inspecciones: { [id]: 'INS-' + id }, porEquipo: { [id]: pedido('RESGUARDO') } }, usuario));
  assert.equal(t.tablas.APP_RESGUARDOS.length, 3);
  const r = t.R.quitarDelPanel(['EQU-1', 'EQU-3'], { comentario: 'mandados por error' }, usuario);
  assert.equal(r.hechos.length, 2);
  assert.deepEqual(t.tablas.APP_RESGUARDOS.map((x) => x.REGISTRO_ID), ['EQU-2']);
  assert.deepEqual(t.escritas.eliminadas.map((x) => x.fila), [4, 2]);
  assert.equal(t.escritas.movimientos.filter((m) => m.tipo === 'QUITAR_PANEL').length, 2, 'lo que pasó queda en el historial');
  assert.match(read('src/services/lineas/LineasDatos.gs'), /if \(lote_\) \{ vaciarLote_\(\); lote_ = \{ datos: \{\}, hojas: \{\}, respaldo: \[\] \}; \}/);
});

// DEV, 22-oct (NUCO 0013): un envío que no cambió el estatus no lo trae en su movimiento; al quitarlo no puede quedar
// POR RECIBIR sin renglón: vuelve al elegido en su renglón
test('Quitar del panel: un POR RECIBIR sin el estatus en su envío vuelve al elegido en su renglón', () => {
  const t = cargar([equipo('EQU-9', '0090', 'POR RECIBIR')], [{ 'ID': 'RSG-9', 'REGISTRO_ID': 'EQU-9', 'NUCO': '0090', 'ESTADO': 'PENDIENTE DE RECEPCION',
    'ESTATUS_EQUIPO': 'PARA VENTA CON DETALLE' }]);
  const vista = t.R.vistaQuitar(['RSG-9']).filas[0];
  assert.deepEqual(vista.regresa, [{ campo: 'ESTATUS EQUIPO', de: 'POR RECIBIR', a: 'PARA VENTA CON DETALLE', nota: 'Sale del panel: deja de estar POR RECIBIR' }]);
  t.R.quitarDelPanel(['RSG-9'], { comentario: 'por error' }, usuario);
  assert.equal(t.tablas['LINEAS TELEFONICAS'][0]['ESTATUS EQUIPO'], 'PARA VENTA CON DETALLE');
  assert.equal(t.tablas.APP_RESGUARDOS.length, 0);
});

// Pendiente 3.16 (usuario, 22-oct): Pau marca DONADO o DESECHADO, como Vendido, solo los ya recibidos (EN RESGUARDO)
test('Donado y Desechado: solo lo recibido; el panel y el inventario quedan con el cierre y su movimiento', () => {
  const t = cargar([equipo('EQU-1', '0012', 'RESGUARDO'), equipo('EQU-2', '0013', 'PARA DESECHO'), equipo('EQU-3', '0014', 'POR RECIBIR')], [
    { 'ID': 'RSG-1', 'REGISTRO_ID': 'EQU-1', 'NUCO': '0012', 'ESTADO': 'EN RESGUARDO', 'ESTATUS_EQUIPO': 'RESGUARDO' },
    { 'ID': 'RSG-2', 'REGISTRO_ID': 'EQU-2', 'NUCO': '0013', 'ESTADO': 'EN RESGUARDO', 'ESTATUS_EQUIPO': 'PARA DESECHO' },
    { 'ID': 'RSG-3', 'REGISTRO_ID': 'EQU-3', 'NUCO': '0014', 'ESTADO': 'PENDIENTE DE RECEPCION', 'ESTATUS_EQUIPO': 'RESGUARDO' }]);
  assert.throws(() => t.R.donado(['RSG-1'], {}, usuario));
  const d = t.R.donado(['RSG-1', 'RSG-3'], { asunto: 'FUNDACION' }, pau);
  assert.deepEqual(d.hechos.map((h) => h.id), ['RSG-1']);
  assert.match(d.omitidos[0].motivo, /No está en resguardo/);
  t.R.desechado(['RSG-2'], {}, pau);
  const inv = t.tablas['LINEAS TELEFONICAS'];
  assert.deepEqual(inv.map((f) => f['ESTATUS EQUIPO']), ['DONADO', 'DESECHADO', 'POR RECIBIR']);
  assert.deepEqual(t.tablas.APP_RESGUARDOS.map((r) => r.ESTADO), ['DONADO', 'DESECHADO', 'PENDIENTE DE RECEPCION']);
  assert.deepEqual(t.escritas.movimientos.slice(-2).map((m) => m.tipo), ['CIERRE', 'DESECHO']);
  assert.match(read('src/services/TelefoniaService.gs'), /DONADO: \(\) => R\.donado\(ids, d, u\)/);
});

// La pantalla del 3.16 y el 3.18 (usuario, 22-oct): botones Donado y Desechado junto a Vendido; sin el contador Quitados
test('Panel de Pau: Donado y Desechado como Vendido; ya no hay «Quitados»', () => {
  const html = read('src/html/js/lineas.html');
  assert.match(html, /alHacer: \(filas\) => paso\('DONADO', filas,/);
  assert.match(html, /alHacer: \(filas\) => paso\('DESECHADO', filas,/);
  assert.match(html, /etiqueta: 'Donados', filtros: \{ ESTADO: \{ valores: \['DONADO'\] \} \}/);
  assert.match(html, /etiqueta: 'Desechados', filtros: \{ ESTADO: \{ valores: \['DESECHADO'\] \} \}/);
  assert.match(html, /const recibidos = \(filas\) => filas\.every\(\(f\) => f\.ESTADO === 'EN RESGUARDO'\);/);
  assert.equal((html.match(/minimo: 1, visible: recibidos,/g) || []).length, 4, 'Entregar a líneas, Vendido, Donado y Desechado solo con todo recibido (usuario, 22-oct)');
  assert.doesNotMatch(html, /etiqueta: 'Quitados'/);
  assert.doesNotMatch(html, /titulo: 'Quitado'/);
});

// Usuario, 22-oct: cada botón del panel sale solo cuando todo lo seleccionado está en su estado o fase, y la fase de una
// cancelación solo avanza (se puede brincar hacia adelante, no regresar)
test('Panel de Pau: Recibir solo lo por recibir; las fases de Cancelaciones solo avanzan', () => {
  const html = read('src/html/js/lineas.html');
  assert.match(html, /texto: 'Recibir', titulo: '[^']*', minimo: 1, visible: porRecibir,/);
  assert.match(html, /texto: 'Entregar a líneas', titulo: '[^']*', minimo: 1, visible: recibidos,/);
  assert.match(html, /texto: 'Carta firmada', titulo: '[^']*', minimo: 1, visible: enFase\(\['POR FIRMAR'\]\),/);
  assert.match(html, /texto: 'Carta enviada', titulo: '[^']*', minimo: 1, visible: enFase\(\['POR FIRMAR', 'CARTA FIRMADA'\]\),/);
  assert.match(html, /texto: 'Confirmar cancelada', titulo: '[^']*', minimo: 1, peligro: true, visible: enFase\(EN_CURSO\),/);
  assert.match(html, /texto: 'Retirar cancelación', titulo: '[^']*', minimo: 1, visible: enFase\(EN_CURSO\),/);

  const t = cargar([], [
    { 'ID': 'RSG-1', 'NUMERO': '4420000001', 'CANCELACION': 'CARTA ENVIADA' },
    { 'ID': 'RSG-2', 'NUMERO': '4420000002', 'CANCELACION': 'POR FIRMAR' },
    { 'ID': 'RSG-3', 'NUMERO': '4420000003', 'CANCELACION': 'CARTA FIRMADA' }]);
  const firmada = t.R.faseCancelacion(['RSG-1', 'RSG-3'], 'CARTA FIRMADA', {}, pau);
  assert.deepEqual(firmada.hechos, []);
  assert.deepEqual(firmada.omitidos.map((o) => o.motivo), ['Ya está carta enviada', 'Ya está carta firmada']);
  const enviada = t.R.faseCancelacion(['RSG-2'], 'CARTA ENVIADA', {}, pau);
  assert.deepEqual(enviada.hechos.map((h) => h.id), ['RSG-2']);
  assert.deepEqual(t.tablas.APP_RESGUARDOS.map((r) => r.CANCELACION), ['CARTA ENVIADA', 'CARTA ENVIADA', 'CARTA FIRMADA']);
});

// Usuario, 22-oct: Cancelaciones con la región (por la lada, tabla de regiones de Líneas) y la cuenta padre de la línea,
// como en el correo al asesor. Ejemplos del correo 14102026 de GPH: 5561167856 región 9; 4421205041 y 4461337239, región 6
test('Cancelaciones: región por la lada y cuenta padre de la línea, también ya cancelada', () => {
  const inv = [
    equipo('EQU-1', '0012', 'USO', { 'TIPO': 'EQUIPO + SIM', 'NUMERO TELEFONO': '5561167856', 'ID LINEA': 'LIN-1', 'CUENTA PADRE': '99022914', 'CUENTA': '99356683' }),
    { 'ID': 'LIN-2', 'ID LINEA': 'LIN-2', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4421205041', 'CUENTA PADRE': '62637313', 'ESTATUS LINEA': 'CANCELADA' },
    { 'ID': 'LIN-3', 'ID LINEA': 'LIN-3', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4461337239', 'CUENTA PADRE': '62637313', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
    { 'ID': 'LIN-4', 'ID LINEA': 'LIN-4', 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4271234567', 'CUENTA PADRE': '62637313', 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' },
  ];
  const t = cargar(inv, [
    { ID: 'R1', REGISTRO_ID: 'EQU-1', ID_LINEA: 'LIN-1', NUCO: '0012', NUMERO: '5561167856', CANCELACION: 'POR FIRMAR' },
    { ID: 'R2', REGISTRO_ID: 'LIN-2', ID_LINEA: 'LIN-2', NUMERO: '4421205041', CANCELACION: 'CANCELADA' },
    { ID: 'R3', REGISTRO_ID: 'LIN-3', NUMERO: '4461337239', CANCELACION: 'CARTA ENVIADA' },
    { ID: 'R4', REGISTRO_ID: 'LIN-4', ID_LINEA: 'LIN-4', NUMERO: '4271234567', CANCELACION: 'POR FIRMAR' },
    { ID: 'R5', REGISTRO_ID: 'EQU-1', NUCO: '0012', ESTADO: 'VENDIDO' },
  ]);
  const filas = t.R.bandeja({ puedeAprobar: true }).filas;
  const r = (id) => filas.filter((f) => f.ID === id)[0];
  assert.deepEqual(['R1', 'R2', 'R3', 'R4'].map((id) => [r(id).REGION, r(id).CUENTA_PADRE]),
    [['Región 9', '99022914'], ['Región 6', '62637313'], ['Región 6', '62637313'], ['', '62637313']]);
  assert.equal(r('R5').REGION, undefined, 'los resguardos no llevan región');
  assert.equal(t.tablas.APP_RESGUARDOS[0].REGION, undefined, 'no se guarda en la hoja');

  const U = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({}, {});
  assert.deepEqual(['3312345678', '8112345678', '9991234567', '9981234567', '4771234567', '4441234567', '6641234567', '6561234567', '2221234567', '7221234567', '561234567', ''].map(U.regionDeNumero),
    ['Región 5', 'Región 4', 'Región 8', 'Región 8', 'Región 6', 'Región 6', 'Región 1', 'Región 3', 'Región 7', 'Región 9', '', '']);
  const html = read('src/html/js/lineas.html');
  assert.match(html, /\{ campo: 'REGION', titulo: 'Región', tipo: 'lista' \},\n\s+\{ campo: 'CUENTA_PADRE', titulo: 'Cuenta padre'/);
});
