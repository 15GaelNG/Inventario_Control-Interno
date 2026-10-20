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
  const escritas = { actualizadas: [], agregadas: [], movimientos: [], columnas: [], registros: [] };
  // El inventario se lee con los mismos objetos: lo que se guarda se ve al volver a leerlo (como LineasLectura)
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City', normCol: (c) => String(c).toUpperCase().trim(),
    conCandado: (fn) => fn(), existeTabla: (n) => !!tablas[n], asegurarPestana: (n) => { tablas[n] = tablas[n] || []; },
    asegurarColumnas: (n, cols) => { escritas.columnas.push([n].concat(cols)); return []; },
    leerTabla: (n) => (tablas[n] || []).map((f, i) => (n === 'LINEAS TELEFONICAS' ? Object.assign(f, { _fila: i + 2 }) : Object.assign({ _fila: i + 2 }, f))),
    idsDeFila: (f) => [String(f['ID'])],
    actualizarFila: (n, fila, cambios) => { escritas.actualizadas.push({ hoja: n, fila: fila, cambios: cambios }); Object.assign(tablas[n][fila - 2], cambios); },
    agregarFilas: (n, filas) => { filas.forEach((f) => { escritas.agregadas.push({ hoja: n, fila: f }); tablas[n].push(f); }); },
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
      return { campos: campos, refs: [], idsCambios: [] };
    },
    registrarMovimiento: (tipo, datos, u, ahora, extra) => {
      escritas.movimientos.push({ tipo: tipo, datos: datos, extra: extra });
      const id = 'MVT-' + escritas.movimientos.length;
      tablas.MOVIMIENTOS.push({ 'ID': id, 'ACCION': tipo, 'FECHA': ahora, 'ID EQUIPO': (extra.refs || []).join(', '), 'CAMBIOS': JSON.stringify((extra.detalle || {}).cambios || []) });
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
      tablas['LINEAS TELEFONICAS'].push(linea);
      Object.assign(f, { 'NUMERO TELEFONO': '', 'ID LINEA': '', 'TIPO': 'EQUIPO', 'ESTATUS LINEA': '' });
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
  // Resguardos solo tiene equipos: su línea DISPONIBLE o «Sin línea», y la que tenía en LINEA_AL_MANDAR
  assert.deepEqual(resg.map((x) => [x.NUCO, x.NUMERO, x.LINEA_AL_MANDAR, x.ESTATUS_LINEA, x.CANCELACION]),
    [['0050', '', '4420050', '', ''], ['0060', '', '4420060', '', ''], ['0070', '4420070', '4420070', 'DISPONIBLE', '']]);
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
  assert.deepEqual(t.tablas.APP_RESGUARDOS.map((x) => [x.ESTADO, x.NUMERO, x.CANCELACION]), [['PENDIENTE DE RECEPCION', '', '']]);
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
  assert.deepEqual(vista.regresa.filter((x) => x.campo === 'PIN EQUIPO')[0], { campo: 'PIN EQUIPO', de: '', a: '••••' }, 'el PIN no se ve');
  assert.throws(() => t.R.quitarDelPanel(['EQU-1'], { comentario: '' }, usuario), /Escribe el comentario/);
  const r = t.R.quitarDelPanel(['EQU-1'], { comentario: 'mandado por error' }, usuario);
  assert.equal(r.hechos.length, 1);
  assert.equal(t.tablas.APP_RESGUARDOS[0].ESTADO, 'RETIRADO');
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
  assert.equal((acciones.match(/espera: '/g) || []).length, 7, 'las siete acciones dicen qué están haciendo');
  // Textos en oración y lo nuevo del 3.12: Retirar cancelación (Pau) y, para Líneas, Corregir resguardo y Quitar del panel
  assert.match(acciones, /texto: 'Entregar a líneas'/);
  assert.doesNotMatch(html, /Entregar a Líneas|Entregados a Líneas/);
  assert.match(acciones, /paso\('RETIRAR_CANCELACION', filas,/);
  assert.match(html, /accionesSeleccion: \(puede \? ACCIONES\[vista\] : \[\]\)\.concat\(opera && vista === 'RESGUARDOS' \? ACCIONES_LINEAS : \[\]\),/);
  assert.match(html, /function quitarDelPanel\(ids, alTerminar\)/);
  assert.match(html, /llamar\('apiLineasVistaQuitarPanel', ids\)/);
  assert.match(html, /\{ campo: 'LINEA_AL_MANDAR', titulo: 'Línea al mandar'/);
  assert.match(html, /\{ campo: 'ACCESORIOS', titulo: 'Accesorios'/);
});
