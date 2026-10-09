const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** La regla de "¿Qué pasó?" (LineasAcciones.gs) con los dobles de prueba de cada test. */
function cargarAcciones(Repo, Datos, LineasUtil, Resguardos) {
  return new Function('LineasRepo', 'LineasDatos', 'LineasUtil', 'LineasResguardos', read('src/services/lineas/LineasAcciones.gs') + '; return LineasAcciones;')(
    // Los estatus de la reunión (LineasRepo.CATALOGO), aunque el doble del test traiga otros
    Object.assign({}, Repo || {}, { CATALOGO: { estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'],
      estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'] } }),
    Datos || {}, LineasUtil || {}, Resguardos || {});
}

function filesBelow(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? filesBelow(full) : [full];
  });
}

test('todos los bloques JavaScript y Apps Script tienen sintaxis válida', () => {
  const files = filesBelow(path.join(root, 'src')).filter((file) => /\.(gs|html)$/.test(file));
  let scripts = 0;
  files.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.gs')) {
      assert.doesNotThrow(() => new Function(source), path.relative(root, file));
      scripts++;
      return;
    }
    for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      assert.doesNotThrow(() => new Function(match[1]), path.relative(root, file));
      scripts++;
    }
  });
  assert.ok(scripts >= 20, `se esperaban al menos 20 scripts y se validaron ${scripts}`);
});

test('la versión de Lucide contiene card-sim', () => {
  const index = read('src/html/Index.html');
  const version = /lucide@(\d+)\.(\d+)\.(\d+)/.exec(index);
  assert.ok(version, 'Lucide debe estar fijado a una versión explícita');
  const [, major, minor] = version.map(Number);
  assert.ok(major > 0 || minor >= 513, `card-sim requiere Lucide >= 0.513.0; actual ${version[0]}`);
});

test('el login acepta hash y conserva compatibilidad con la hoja histórica', () => {
  const auth = read('src/Auth.gs');
  assert.match(auth, /found\.SALT && found\.PASSWORD_HASH/);
  assert.match(auth, /found\['CONTRASEÑA'\]/);
  assert.match(auth, /hashPassword_\(String\(password\)/);
});

test('Telefonía muestra sus módulos en orden y Gestión de Activos queda fuera del grupo', () => {
  const app = read('src/html/js/app.html');
  // Solo el bloque del grupo Líneas (con master hay más grupos después)
  const inicioLineas = app.indexOf("id: 'lineas'");
  const lineas = app.slice(inicioLineas, app.indexOf('\n    },', inicioLineas));
  // Un solo inventario de accesorios: el de Líneas (el general de jorge se retiró el 1-oct)
  assert.equal((lineas.match(/Inventario de Accesorios/g) || []).length, 1);
  assert.doesNotMatch(app, /vista: 'accesorios'/);
  // Panorama primero (29-sep). Fuera del menú (líneas comentadas) pero sus vistas se siguen montando: Reactivación
  // (29-sep) y Reasignaciones, Solicitud, Control de Cambios y Bitácora de Desechos (reunión con Líneas, 30-sep)
  // Correcciones de Líneas: módulo temporal (30-sep), después de Resguardos; se quita cuando Líneas termine
  // sistemas-lineas: accesos a sistemas externos (jorge, 2-oct), al final del grupo
  const orden = ['panorama-lineas', 'lineas-telefonicas', 'resguardos-lineas', 'correcciones-lineas', 'accesorios-lineas', 'sistemas-lineas'];
  const ocultos = ['cambios-lineas'];
  const retirados = ['reactivacion-lineas', 'reasignaciones-lineas', 'solicitud-lineas', 'bitacora-desechos'];
  const sinComentarios = lineas.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
  assert.deepEqual([...sinComentarios.matchAll(/vista: '([^']+)'/g)].map((m) => m[1]), orden);
  ocultos.forEach((v) => assert.match(lineas, new RegExp(`// \{ vista: '${v}'`), `${v} debe seguir comentado`));
  assert.doesNotMatch(read('src/html/views/dashboard.html'), /data-view="cambios-lineas"/);
  // Retirados con sus pestañas (30-sep): ni ruta, ni módulo, ni menú
  retirados.forEach((v) => {
    assert.doesNotMatch(app, new RegExp(`'${v}'`), v);
    assert.doesNotMatch(read('src/config/Modulos.gs'), new RegExp(`id: '${v}'`), v);
  });
  // Acceso directo debajo del desplegable de Líneas
  assert.match(app, /\{ id: 'gestion-activos', vista: 'gestion-activos', icono: 'contact', etiqueta: 'Gestión de Activos', requiere: 'gestion-activos'[^}]*\}/);
  assert.match(app, /grupo\.vista \? `/);
  orden.concat('gestion-activos', ocultos)
    .forEach((route) => assert.match(app, new RegExp(`vista: '${route}'[^\\n]*plantilla: 'tpl-`), `falta montar ${route}`));
  // Retirados: Post Venta (ya no existe) y Detalles (ahora es la vista de tarjetas de Líneas Telefónicas)
  ['lineas-post-venta', 'detalles-lineas-telefonicas'].forEach((retirado) => {
    assert.doesNotMatch(app, new RegExp(retirado));
    assert.doesNotMatch(read('src/config/Modulos.gs'), new RegExp(`id: '${retirado}'`));
  });
  assert.ok(!fs.existsSync(path.join(root, 'src/html/views/lineas/lineas-detalles.html')));
  assert.doesNotMatch(read('src/html/Index.html'), /lineas-detalles/);
});

test('Reactivación, Solicitud, Reasignaciones y Desechos se retiraron con sus pestañas (30-sep)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.doesNotMatch(repo, /POST_VENTA|POST VENTA/);
  assert.doesNotMatch(repo, /VISTAS_OPERATIVAS|function vistaOperativa/);
  assert.ok(!fs.existsSync(path.join(root, 'src/services/lineas/LineasOperativas.gs')));
  assert.ok(!fs.existsSync(path.join(root, 'src/html/views/lineas/lineas-operativa.html')));
  assert.doesNotMatch(read('src/ClientApi.gs') + read('src/services/TelefoniaService.gs'), /VistaOperativa|FormularioOperativa|LineasOperativas/);
  assert.doesNotMatch(read('src/html/js/lineas.html'), /POST_VENTA|initPostVenta|initOperativa|abrirAltaAppSheet|initReactivacion|initDesechos/);
  // Ya no se escribe HISTORIAL_REASIGNACIONES; lo migrado se lee de APP_MOVIMIENTOS (TIPO HISTORICO)
  assert.doesNotMatch(repo, /LineasDatos\.agregarFilas\(TAB\.REASIG/);
  assert.match(repo, /const HOJAS_MIGRADAS = \[TAB\.REASIG, TAB\.DESECHO, TAB\.REACTIVACION\];/);
  // Exportar: sin los módulos retirados
  assert.doesNotMatch(read('src/services/lineas/LineasExportar.gs'), /REASIGNACIONES: \[|DESECHOS: \[|REACTIVACION: \[|SOLICITUD: \[/);
  // Retiro de pestañas: solo en la BD de pruebas, con respaldo, y CAMBIOS no está en la lista
  const admin = read('src/services/lineas/LineasAdmin.gs');
  ['retirarHojasLineas_revisar', 'retirarHojasLineas_migrar', 'retirarHojasLineas_borrar'].forEach((f) => assert.match(admin, new RegExp('function ' + f + '\\(\\)')));
  // En producción solo con LINEAS TELEFONICAS ya retirada (4-oct); ella solo se borra así, y CAMBIOS nunca
  assert.match(admin, /if \(id !== LINEAS_DEV_SPREADSHEET_ID && !LineasLectura\.retirada\(\)\) \{\s*throw new Error/);
  assert.match(admin, /'LINEAS TELEFONICAS': \{ migrar: false, soloRetirada: true \}/);
  assert.match(admin, /return !HOJAS_RETIRADAS_\[nombre\]\.soloRetirada \|\| !!LineasLectura\.retirada\(\);/);
  assert.match(admin, /if \(!estado\.respaldo\) throw new Error/);
  assert.match(admin, /LineasDatos\.cacheBorrar\('enc_' \+ nombre\);/); // si no, existeTabla la sigue viendo
  const lista = admin.slice(admin.indexOf('const HOJAS_RETIRADAS_ = {'), admin.indexOf('const PROP_RESPALDO_RETIRADAS_'));
  assert.doesNotMatch(lista, /CAMBIOS LINEAS TELEFONICAS/);
  assert.doesNotMatch(admin.slice(admin.indexOf('function pestanasLineas_'), admin.indexOf('function diferenciasHojaLineas_')), /return \[[^\]]*(REASIG|DESECHO|REACTIVACION|SOLICITUD)/);
});

test('Líneas Telefónicas ofrece la vista de tarjetas con los mismos filtros de la tabla', () => {
  const lineas = read('src/html/js/lineas.html');
  const vista = read('src/html/views/lineas/lineas-telefonicas.html');
  const tabla = read('src/html/js/componentes/datatable.html');
  assert.match(vista, /id="ln-modo-vista"/);
  assert.match(vista, /data-modo="tabla"/);
  assert.match(vista, /data-modo="tarjetas"/);
  assert.match(vista, /id="ln-tarjetas-equipos"/);
  assert.match(vista, /id="ln-tarjetas-lineas"/);
  assert.match(tabla, /getFiltradas: \(\) =>/);
  assert.match(lineas, /tablas\[modulo\]\.getFiltradas\(\)/);
  assert.match(lineas, /new MutationObserver/);
  assert.match(lineas, /localStorage\.setItem\('lineas\.modoVista'/);
  // Con "Tarjetas" recordado la carga inicial ya usa estas constantes: deben declararse antes (zona muerta de const)
  const inicio = lineas.indexOf('// ---- Carga inicial ----');
  ['const PASO_TARJETAS', 'const tarjetasVisibles', 'let detallesFicha', 'let tablaHistorial'].forEach((decl) => {
    assert.ok(lineas.indexOf(decl) > 0 && lineas.indexOf(decl) < inicio, decl + ' debe declararse antes de la carga inicial');
  });
  const gestion = read('src/html/views/lineas/lineas-gestion-activos.html');
  assert.match(gestion, /id="lnga-grid" class="ln-cuadros-grid"/);
  assert.match(lineas, /function tarjetaColaborador/);
});

test('la ficha trae los Detalles para copiar en el orden de DETALLES LINEAS TELEFONICAS', () => {
  const lineas = read('src/html/js/lineas.html');
  const repo = read('src/services/lineas/LineasRepo.gs');
  const servicio = read('src/services/TelefoniaService.gs');
  assert.equal((servicio.match(/detalles: r\.detalles/g) || []).length, 2);
  assert.match(repo, /return \{ id: id, tipo: tipo, nuco: nuco, equipo: equipo, linea: linea, detalles: detalles \};/);
  const cuerpo = lineas.slice(lineas.indexOf('function textoDetalles()'), lineas.indexOf('function pintarTextoDetalles()'));
  const etiquetas = [...cuerpo.matchAll(/'(?:\\n)?([A-ZÁÉÍÓÚa-záéíóúñ /]+): '/g)].map((m) => m[1]);
  assert.deepEqual(etiquetas, ['Motivo de resguardo', 'Ticket / Asunto', 'Código de resguardo', 'IMEI', 'SIM', 'Número', 'Modelo',
    'Compañía', 'Razón Social', 'Estatus de adendum', 'Estatus actual de la línea']);
  assert.match(cuerpo, /'NUCO ' \+ valor\(d\.nuco\) \+ '\\n-{55}\\n'/);
  assert.match(lineas, /data-ln-copiar-detalles/);
  assert.match(lineas, /function copiarTexto\(texto\)/);
  // Mismo mapeo que la fórmula del AppSheet: Código de resguardo = [RESPONSABLE], Estatus de adendum = [FIN PLAN]
  assert.match(repo, /responsable: crudo\('RESPONSABLE'\)/);
  assert.match(repo, /finPlan: crudo\('FIN PLAN'\)/);
});

test('el historial es una lista filtrable por movimiento y exportable a Excel', () => {
  const lineas = read('src/html/js/lineas.html');
  const src = read('src/services/lineas/LineasRepo.gs');
  const Repo = new Function('LineasUtil', 'LineasDatos', 'Utilities', src + '\nreturn LineasRepo;')({}, {}, {});
  const casos = {
    RESPONSABLE: 'Reasignación', 'SEGUNDO RESPONSABLE': 'Reasignación', 'ESTATUS LINEA': 'Cambio de estatus', 'ESTATUS EQUIPO': 'Cambio de estatus',
    'NUMERO TELEFONO': 'Cambio de línea', 'COMPAÑIA': 'Cambio de línea', 'FIN PLAN': 'Cambio de plan', 'COSTO PLAN': 'Cambio de plan',
    EQUIPO: 'Cambio de equipo', IMEI: 'Cambio de equipo', 'OFICINA / DESARROLLO': 'Cambio de área o ubicación', AREA: 'Cambio de área o ubicación',
    'PIN WHATSAPP': 'Cambio de accesos', 'CUENTA GOOGLE': 'Cambio de accesos', 'CONTRASEÑA MODEM': 'Cambio de accesos', COMENTARIOS: 'Otros cambios',
  };
  Object.keys(casos).forEach((campo) => assert.equal(Repo.movimientoDeCampo(campo), casos[campo], campo));
  // Fuentes del historial: bitácora, reasignaciones, desechos, reactivaciones, inspecciones, responsivas y el sistema nuevo
  const cuerpo = src.slice(src.indexOf('function historialDeRegistro'), src.indexOf('// ---------------- Bitácoras'));
  ['TAB.CAMBIOS', 'TAB.REASIG', 'TAB.DESECHO', 'TAB.APP_MOV', 'TAB.REACTIVACION', 'evidenciasDeRegistro(id)'].forEach((fuente) => assert.ok(cuerpo.includes(fuente), fuente));
  assert.match(cuerpo, /return \{ eventos: eventos, total: eventos\.length \};/);
  // La edición marca su reasignación para no duplicarla
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /idsReasignacion: guardado\.idReasignacion \? \[guardado\.idReasignacion\] : \[\]/);
  // Cliente: DataTable con selector de movimiento y Excel
  assert.match(lineas, /id="ln-historial-mov"/);
  assert.match(lineas, /tabla\.setFiltro\('movimiento', select\.value \? \{ valores: \[select\.value\] \} : null\)/);
  assert.match(lineas, /exportar: \{ nombreArchivo: 'Historial ' \+ nombre, nombreHoja: 'Historial' \}/);
  assert.match(lineas, /tablaHistorial\.destruir\(\)/);
});

test('no se descargan CSV y los botones usan los mismos nombres y medidas', () => {
  const archivos = filesBelow(path.join(root, 'src/html')).filter((f) => /lineas|views[\\/]lineas/.test(f));
  const todo = archivos.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(todo, /text\/csv|\.csv'|exportarCsv/);
  assert.doesNotMatch(todo, /Exportar vista|Descargar|Bajar Excel|Agregar NUCO|Nuevo registro ·|Nuevo artículo|'Abrir PDF'|'Carpeta en Drive'/);
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /\(id \? ' Guardar cambios' : ' ' \+ agregar\)/);
  // Acciones de la ficha con color (botón principal, sin .secondary)
  const botones = lineas.slice(lineas.indexOf('function botonesFicha'), lineas.indexOf('// ---- Detalles: la columna'));
  assert.doesNotMatch(botones, /secondary/);
  assert.match(lineas, /'<a class="externo ln-boton"/);
  const estilos = read('src/html/lineas-estilos.html');
  assert.match(estilos, /Botones: mismo tamaño y mismos colores en todo Líneas/);
  assert.doesNotMatch(estilos, /\.ln-detalle-botones button \{ padding/);
});

test('las capturas canceladas tienen un flujo completo de limpieza', () => {
  assert.match(read('src/ClientApi.gs'), /apiLineasCancelarEvidencia/);
  assert.match(read('src/services/TelefoniaService.gs'), /cancelarEvidencia/);
  assert.match(read('src/services/lineas/LineasEvidencias.gs'), /cancelarCarpetaEvidencia/);
  assert.match(read('src/html/js/lineas.html'), /apiLineasCancelarEvidencia/);
});

test('el alta y edición de LINEAS TELEFONICAS sigue LINEAS TELEFONICAS_Form del AppSheet', () => {
  const api = read('src/ClientApi.gs');
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(api, /apiLineasFormularioRegistro/);
  assert.match(api, /apiLineasCrearRegistro/);
  assert.match(api, /apiLineasEditarRegistro/);
  assert.match(reg, /asegurarPestana\(LineasRepo\.TAB\.LINEAS, \['COLOR'\]\)/);
  // Editar y Agregar (usuario, 4-oct): pestañas por parte; FOLIO, NUCO y TIPO fijos; el TIPO se asigna solo
  assert.doesNotMatch(reg, /'archivo'|guardarComoAppSheet|subirArchivos_|responsableExtra|ESTATUS_GENERAL'|'FECHA INSPECCION'/);
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    reg + '; return LineasRegistros;')(
    { CATALOGO: { tipos: ['EQUIPO', 'LINEA'], estatusLinea: ['USO', 'DISPONIBLE'], estatusEquipo: ['USO'] }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'MODEM': 'MODEM' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-09-24' }, {}, {}, LineasUtil);
  const titulos = (els) => els.filter((e) => e.tipo === 'titulo').map((e) => e.texto);
  const campo0 = (els, c) => els.filter((e) => e.columna === c)[0];
  const ctx = { nuevo: true, nucoRepetido: () => false, telefonoRepetido: () => false };
  const altaEquipo = Reg._elementos({}, {}, { correo: 'x@y.z' }, Object.assign({}, ctx, { parte: 'EQUIPO' }));
  // Responsables adicionales (6-oct): un bloque por cada uno y una sección sin título con «Agregar responsable»
  assert.deepEqual(titulos(altaEquipo), ['EQUIPO', 'RESPONSABLE', 'RESPONSABLE 2', 'RESPONSABLE 3', 'RESPONSABLE 4', 'RESPONSABLE 5', '', 'LÍNEA', 'ADENDUM', 'ACCESORIOS Y ACCESOS']);
  const altaLinea = Reg._elementos({}, {}, { correo: 'x@y.z' }, Object.assign({}, ctx, { parte: 'LINEA' }));
  // La línea sola ya no tiene accesos: el PIN de WhatsApp es del equipo (usuario, 8-oct)
  assert.deepEqual(titulos(altaLinea), ['LÍNEA', 'RESPONSABLE', 'RESPONSABLE 2', 'RESPONSABLE 3', 'RESPONSABLE 4', 'RESPONSABLE 5', '', 'ADENDUM']);
  assert.ok(!campo0(altaLinea, 'PIN WHATSAPP') && campo0(altaEquipo, 'PIN WHATSAPP'));
  const campo = (els, c) => els.filter((e) => e.columna === c)[0];
  assert.ok(!campo(altaLinea, 'EQUIPO') && !campo(altaLinea, 'ACCESORIOS') && !campo(altaLinea, 'NUCO'));
  // En el alta de un equipo el NUCO se captura; el TIPO no se elige
  assert.equal(campo(altaEquipo, 'NUCO').control, 'numero');
  assert.equal(campo(altaEquipo, 'TIPO').control, 'calculado');
  assert.equal(campo(altaEquipo, 'TIPO').formula, 'TIPO_EQUIPO');
  const r = Reg._resolver(altaEquipo, {}, { NUCO: '12', EQUIPO: 'A15', RESPONSABLE: 'juan', 'ESTATUS EQUIPO': 'USO' }, ctx);
  assert.ok(r.errores.some((e) => /Nombre: ESCRIBIR EN MAYUSCULAS/.test(e)));
  // En la edición NUCO y TIPO son fijos; el NUCO, a 4 dígitos
  const edicion = Reg._elementos({ TIPO: 'EQUIPO', NUCO: 5 }, {}, { correo: 'x@y.z' }, { nuevo: false });
  assert.equal(campo(edicion, 'NUCO').valor, '0005');
  assert.ok(campo(edicion, 'NUCO').soloLectura && campo(edicion, 'TIPO').soloLectura && campo(edicion, 'FOLIO').soloLectura);
  // Un equipo sin línea puede recibir una (número con sugerencias de las líneas); con línea, el número es texto
  assert.equal(campo(edicion, 'NUMERO TELEFONO').control, 'listaAbierta');
  assert.equal(campo(edicion, 'NUMERO TELEFONO').sugerencias, 'NUMEROS');
  // Un equipo con línea se edita sin la línea (Editar línea aparte, 8-oct); en Editar línea el número es texto
  const conLinea = { TIPO: 'EQUIPO + SIM', 'NUMERO TELEFONO': '4421090805' };
  assert.ok(!campo(Reg._elementos(conLinea, {}, { correo: 'x@y.z' }, { nuevo: false }), 'NUMERO TELEFONO'));
  assert.equal(campo(Reg._elementos(conLinea, {}, { correo: 'x@y.z' }, Reg._contextoEdicion(conLinea, 'LINEA')), 'NUMERO TELEFONO').control, 'texto');
  // TIPO automático
  const T = Reg._tipoAutomatico;
  assert.equal(T('EQUIPO', {}, ''), 'EQUIPO');
  assert.equal(T('EQUIPO', { 'NUMERO TELEFONO': '4420000001', 'TIPO DE LINEA': 'PLAN' }, ''), 'EQUIPO + SIM');
  assert.equal(T('EQUIPO', { 'NUMERO TELEFONO': '4420000001', 'TIPO DE LINEA': 'SIM BASICO' }, ''), 'EQUIPO + SIM BASICO');
  assert.equal(T('EQUIPO', { 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'CANCELADA' }, ''), 'EQUIPO');
  assert.equal(T('LINEA', { 'NUMERO TELEFONO': '4420000001' }, ''), 'LINEA');
  assert.equal(T('LINEA', { 'TIPO DE LINEA': 'SIM BASICO' }, ''), 'LINEA BASICA');
  assert.equal(T('EQUIPO', { 'NUMERO TELEFONO': '4420000001' }, 'MODEM'), 'MODEM'); // histórico: se queda
  assert.match(reg, /const valores = homologarNuco_\(aHoja_\(elementos, r\.valores\)\);/);
  // La bitácora no registra "5 → 0005" como un cambio (solo se escribe homologado)
  assert.match(read('src/services/lineas/LineasRepo.gs'), /LineasUtil\.nucoVisible\(antes\) === LineasUtil\.nucoVisible\(cambios\[c\]\)/);
});

test('las firmas nuevas no se almacenan como archivos de Drive', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /firmaInspectorBase64/);
  assert.match(captura, /firmaCiBase64/);
  assert.match(captura, /'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': ''/);
  assert.match(captura, /'NOMBRE CI': usuario\.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA CI': ''/);
});

test('los formularios de inspección y responsiva siguen el orden y las etiquetas del AppSheet', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const orden = (desde, hasta) => [...captura.slice(captura.indexOf(desde), captura.indexOf(hasta)).matchAll(/(?:campo_|ro|ed|deLinea)\('([^']+)'/g)].map((m) => m[1]);
  // Inspección (usuario, 3-oct): Datos en tres partes, equipo, línea y responsable; la fecha pasa a la de firmas
  assert.deepEqual(orden('function formularioInspeccion_', 'const agregarSeccion'), ['ID', 'ID LINEA', 'NUCO', 'TIPO', 'MODELO', 'IMEI', 'COLOR',
    'No TELEFONO', 'SIM', 'COMPAÑIA', 'PLAN', 'RAZON SOCIAL', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO',
    'JEFE DIRECTO', 'CORREO']);
  assert.match(captura, /campo_\('FECHA DE REGISTRO', 'Fecha de la inspección'/);
  // Responsiva (usuario, 4-oct): ordenada como la inspección; una sola fecha (DIA, MES y AÑO salen de ella al guardar)
  assert.deepEqual(orden('function formularioResponsiva_', 'function ocultarSecretos_').filter((c) => c !== 'columna'), ['ID', 'ID LINEA', 'NUCO',
    'MODELO', 'IMEI', 'COLOR', 'No TELEFONO', 'SIM', 'COMPAÑIA', 'RAZON SOCIAL', 'No EMPLEADO', 'RESPONSABLE', 'IDENTIFICACION', 'PUESTO',
    'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'DIRECTOR', 'CORREO', 'ACCESORIOS', 'PIN WHATSAPP', 'PIN EQUIPO', 'CONTRASEÑA',
    'FECHA RESPONSIVA', 'TICKET', 'COMENTARIO', 'FIRMA RESPONSABLE', 'NOMBRE CI', 'FIRMA CI']);
  assert.match(captura, /valores\['MES'\] = MESES\[/);
  assert.match(captura, /'Septiembre'/);
  // Parte 6 (usuario, 6-oct): la responsiva lleva al director (como el AppSheet) y el comentario va en COMENTARIO
  assert.match(captura, /ed\('DIRECTOR', 'Director', 'listaAbierta', persona\('DIRECTOR'\), \{ opciones: catalogos\.directores \|\| \[\] \}\)/);
  // Un solo COMENTARIO (plan §5.2): se guarda en COMENTARIO, la columna que imprime el PDF, y es obligatorio
  // Un solo comentario por acción (usuario, 4-oct): en la inspección no es obligatorio si la acción ya pidió el suyo (resguardo)
  assert.match(captura, /campo_\('COMENTARIO', 'Comentario', 'area', \{ valor: deResp\('COMENTARIO', ''\), requerido: enAccion \|\| resp \? 'NUNCA' : 'SIEMPRE', valida: 'COMENTARIOS' \}\)/);
  assert.match(captura, /campo_\('COMENTARIO', 'Comentario', 'area', \{ valor: '', requerido: 'SIEMPRE', valida: 'COMENTARIOS' \}\)/);
  assert.match(captura, /e\.valida === 'COMENTARIOS' && valor\.length <= 3/);
  assert.match(read('src/html/js/lineas.html'), /campo\('_MOTIVO', 'Comentario', 'area', \{ requerido: 'SIEMPRE', valor: '', valida: 'COMENTARIOS' \}\)/);
  assert.doesNotMatch(captura, /'OBSERVACIONES'/);
  assert.match(captura, /const acceso = \(c\) => \(reasignar \? '' : v\(c\)\);/);
  assert.match(captura, /const IDENTIFICACIONES = \['INE', 'LICENCIA DE CONDUCIR'\]/);
  assert.doesNotMatch(captura, /ESTATUS EQUIPO/);
  assert.doesNotMatch(captura, /'RESPONSIVA': urlArchivo_/);
});

test('la inspección replica el bot ACTUALIZAR DESDE INSPECCION', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const copia = captura.slice(captura.indexOf('const COPIA_INSPECCION_A_LINEA'), captura.indexOf('function guardarInspeccion'));
  assert.deepEqual([...copia.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => m[1]), ['RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE',
    'OFICINA / DESARROLLO', 'PUESTO', 'JEFE DIRECTO', 'CUENTA GOOGLE', 'PIN WHATSAPP', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM']);
  assert.match(captura, /'FECHA INSPECCION': new Date\(/);
  // Con las hojas nuevas (reestructura) lo que no tiene dónde guardarse se ignora: tolerante
  assert.match(captura, /LineasRepo\.guardarCambiosRegistro\(obj\.fila, copia, usuario, ahora, \{ tolerante: true \}\)/);
});

test('el checklist replica Show_If, orden de secciones y la CALIFICACION del AppSheet', () => {
  const Checklist = new Function(read('src/services/lineas/LineasChecklist.gs') + '; return LineasChecklist;')();
  assert.deepEqual(Checklist.secciones().map((s) => s.seccion), ['DOCUMENTACIÓN / ACCESORIOS', 'SISTEMA', 'CONECTIVIDAD',
    'ESTADO FÍSICO GENERAL', 'DESEMPEÑO', 'APPS INSTALADAS']);
  const visibles = (tipo) => Checklist.seccionesVisibles(tipo).reduce((l, s) => l.concat(s.puntos.map((p) => p.columna)), []);
  assert.deepEqual(visibles('LINEA'), ['IDENTIFICACION', 'RED MOVIL', 'USO DATOS', 'LINEA DE VOZ']);
  assert.deepEqual(visibles('MODEM'), ['IDENTIFICACION', 'CUBO', 'CABLE', 'RED MOVIL', 'USO DATOS', 'BOTON ENCENDIDO', 'CUERPO EQUIPO',
    'PUERTO CARGA', 'TEMPERATURA', 'DESEMPEÑO']);
  assert.equal(visibles('EQUIPO').indexOf('RED MOVIL'), -1);
  assert.equal(visibles('EQUIPO + SIM').length, 36);
  assert.ok(!visibles('EQUIPO + SIM').includes('CUBO 2'));
  // Fórmula: SI de 15 puntos + BUENO/REGULAR/MALO, entre los contestados (N/A y conectividad no cuentan)
  assert.equal(Checklist.calificacion({}), 0);
  assert.equal(Checklist.calificacion({ IDENTIFICACION: 'N/A', CUBO: 'SI', WIFI: 'NO', SO: 'NO' }), 1);
  assert.equal(Checklist.calificacion({ CUBO: 'SI', CABLE: 'NO', 'DURACION BATERIA': 'REGULAR', TEMPERATURA: 'MALO' }), 1.5 / 4);
  assert.equal(Checklist.calificacionTexto(0.9444444), '94.44%');
});

test('el patrón conserva su proporción y cabe completo en las plantillas PDF', () => {
  const pdf = read('src/services/lineas/LineasPdf.gs');
  assert.match(pdf, /\^\(PATRON\|CONTRASEÑA\)\$/);
  assert.match(pdf, /Math\.min\(1, maxAncho \/ ancho, maxAlto \/ alto\)/);
  assert.match(pdf, /setAlignment\(DocumentApp\.HorizontalAlignment\.CENTER\)/);
});

test('cada inspección inicia limpia y no modifica accesorios desde el checklist', () => {
  const cliente = read('src/html/js/lineas.html');
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /valor: '', checklist: true/);
  assert.doesNotMatch(cliente, /cap-actualizar-accesorios/);
  assert.doesNotMatch(captura, /actualizarAccesorios/);
});

test('el patrón usa fondo azul en inspección y blanco en responsiva solo al exportar', () => {
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /controlPatron\.base64\('#ddebf7'\)/);
  assert.match(cliente, /controlPatron\.base64\('#ffffff'\)/);
  assert.match(cliente, /x\.fillStyle = fondoPdf \|\| '#ffffff'/);
});

test('los movimientos rechazan artículos inexistentes', () => {
  const accesorios = read('src/services/lineas/LineasAccesorios.gs');
  assert.match(accesorios, /if \(!actual\) throw new Error\('El artículo seleccionado ya no existe/);
});

test('el shell es el de master y Líneas es uno de sus grupos', () => {
  const index = read('src/html/Index.html');
  const app = read('src/html/js/app.html');
  assert.match(index, /include\('html\/js\/componentes\/datatable'\)/);
  assert.ok(index.indexOf("include('html/js/componentes/datatable')") < index.indexOf("include('html/js/lineas')"),
    'lineas.html debe cargarse después de la librería de componentes');
  const grupos = /const NAV_GRUPOS = \[([\s\S]*?)\n  \];/.exec(app)[1];
  // Desde la unión con master (1-oct) el menú trae los módulos de todos; Líneas es un grupo más
  assert.ok([...grupos.matchAll(/^      id: '([^']+)'/gm)].map((m) => m[1]).includes('lineas'));
});

test('lo que repetían los servicios de una hoja vive en HojaServicio, no en otra copia', () => {
  // Leer/escribir una hoja con su permiso, caché, fechas y archivos: src/utils/HojaServicio.gs.
  // Líneas (services/lineas/) todavía tiene su propia capa (LineasDatos) y queda fuera.
  const dir = path.join(root, 'src/services');
  const servicios = fs.readdirSync(dir).filter((a) => a.endsWith('.gs'));
  const PROHIBIDO = [
    [/function fechaISO_\(/, 'su propio fechaISO_ (HojaServicio.fechaISO)'],
    [/function fechaDesdeInput_\(/, 'su propio fechaDesdeInput_ (HojaServicio.fechaObligatoria)'],
    [/function renombrar\w*_\(/, 'su propio renombrar*_ (HojaServicio.renombrarArchivo / renombrarRuta, o `archivos` en la definición)'],
    [/function subirArchivoEn_\(|Utilities\.base64Decode\(base64Data\)/, 'su propia subida a Drive (HojaServicio.subirArchivo)'],
    [/SheetUtils\.remove\(/, 'SheetUtils.remove a mano (HojaServicio.eliminar, que además respeta Relaciones)'],
  ];
  // ListasService guarda catálogos (no la lista de un módulo) con su propio tiempo de vida,
  // CapitalHumano el de colaboradores (una persona por nombre+departamento, sin permiso de módulo)
  // y PermisosService las reglas y personas que revisa en cada llamada (no es un módulo: es el permiso)
  const CON_CACHE_PROPIA = ['ListasService.gs', 'CapitalHumano.gs', 'PermisosService.gs'];
  const problemas = [];
  servicios.forEach((a) => {
    const texto = read('src/services/' + a);
    PROHIBIDO.forEach(([re, que]) => { if (re.test(texto)) problemas.push(a + ': ' + que); });
    if (/CacheHojas\.recordar\(/.test(texto) && !CON_CACHE_PROPIA.includes(a)) problemas.push(a + ': CacheHojas.recordar a mano (HojaServicio.listar)');
  });
  assert.deepEqual(problemas, []);
  // HojaServicio corre en el servidor: lo carga Apps Script solo, pero sus pruebas tienen que estar en npm test
  assert.match(read('package.json'), /node tests\/hoja-servicio\.test\.js/);
});

test('cada vista es una sola entrada (NAV_GRUPOS / VISTAS_FUERA_DEL_MENU) y todo lo que nombra existe', () => {
  const app = read('src/html/js/app.html');
  const index = read('src/html/Index.html');
  const arreglo = (nombre) => new Function('return ' + new RegExp(`const ${nombre} = (\\[[\\s\\S]*?\\n  \\]);`).exec(app)[1])();
  const entradas = [];
  arreglo('NAV_GRUPOS').forEach((g) => (g.items || [g]).forEach((e) => entradas.push(e)));
  const fuera = arreglo('VISTAS_FUERA_DEL_MENU');
  entradas.push(...fuera);
  const vistas = entradas.map((e) => e.vista).filter(Boolean);
  assert.deepEqual(vistas.filter((v, i) => vistas.indexOf(v) !== i), [], 'vistas repetidas');

  const plantillas = [...index.matchAll(/include\('(html\/[^']+)'\)/g)].map((m) => read('src/' + m[1] + '.html')).join('\n');
  const js = filesBelow(path.join(root, 'src/html')).filter((f) => f.endsWith('.html')).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const modulos = [...read('src/config/Modulos.gs').matchAll(/\{ id: '([^']+)', etiqueta/g)].map((m) => m[1]);
  const problemas = [];
  entradas.filter((e) => e.vista).forEach((e) => {
    const quien = e.vista + ': ';
    if (!e.plantilla || !plantillas.includes(`<template id="${e.plantilla}"`)) problemas.push(quien + 'plantilla ' + e.plantilla + ' no está en un archivo incluido en Index.html');
    const init = /=>\s*(?:(\w+)\.)?(\w+)\(/.exec(String(e.init || ''));
    if (!init) problemas.push(quien + 'sin init');
    else {
      if (init[1] && !new RegExp(`(const|let|var) ${init[1]}\\b`).test(js)) problemas.push(quien + init[1] + ' no existe');
      if (!new RegExp(`function ${init[2]}\\(|\\b${init[2]}: `).test(js)) problemas.push(quien + init[2] + ' no existe');
    }
    if (e.requiere && !modulos.includes(e.requiere)) problemas.push(quien + 'requiere ' + e.requiere + ', que no está en Modulos.gs');
    if (!fuera.includes(e) && !e.requiere && !e.libre) problemas.push(quien + 'en el menú sin requiere ni libre');
  });
  // Y al revés: cada módulo de Modulos.gs tiene por dónde entrar: su vista, o la ficha de otro
  // módulo (`enFicha`), que lo pide con deModulo para que sin permiso su pestaña no aparezca
  const enFicha = Object.fromEntries([...read('src/config/Modulos.gs').matchAll(/{ id: '([^']+)', etiqueta.*enFicha: '([^']+)'/g)].map((m) => [m[1], m[2]]));
  modulos.forEach((m) => {
    if (enFicha[m]) { if (!js.includes(`deModulo('${m}'`) && !read('src/ClientApi.gs').includes(`parte('${m}'`)) problemas.push(m + ': vive en la ficha de ' + enFicha[m] + ' pero nadie lo pide con deModulo (ni con parte en el servidor)'); }
    else if (!entradas.some((e) => e.requiere === m)) problemas.push(m + ': módulo sin vista');
  });
  assert.deepEqual(problemas, []);

  // navegarA busca la entrada; no vuelve la cadena de if por vista
  const navegar = app.slice(app.indexOf('function navegarA('), app.indexOf('function mostrarSinAcceso('));
  assert.match(navegar, /const destino = vistaDe\(vista\);/);
  assert.doesNotMatch(navegar, /vista === '/);
  assert.doesNotMatch(app, /function moduloDeVista\(/);
});

test('el JS de los .html no tiene "//" dentro de strings (Apps Script lo corta como comentario)', () => {
  const html = filesBelow(path.join(root, 'src')).filter((file) => file.endsWith('.html'));
  const hallazgos = [];
  html.forEach((file) => {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      match[1].split('\n').forEach((linea) => {
        const t = linea.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (/['"`][^'"`]*:\/\//.test(linea)) hallazgos.push(path.relative(root, file) + ': ' + t.slice(0, 90));
      });
    }
  });
  assert.deepEqual(hallazgos, []);
});

test('las tablas de Líneas usan el DataTable del sistema con KPIs que filtran', () => {
  const cliente = read('src/html/js/lineas.html');
  const api = read('src/ClientApi.gs');
  assert.match(cliente, /DataTable\.crear\(contenedor/);
  assert.equal((cliente.match(/tablaLineas\(\$\('#(ln-tabla-' \+ modulo|lac-tabla|ln-bit-tabla)'?/g) || []).length >= 3, true);
  assert.doesNotMatch(cliente, /class="ln-tabla"><thead id=/);
  assert.match(cliente, /function tilesKpi\(/);
  assert.match(api, /function apiLineasBitacoraTabla[\s\S]*?JSON\.stringify/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /const MAX_FILAS_TABLA = 5000;/);
  for (const vista of ['lineas-telefonicas', 'lineas-bitacora', 'lineas-accesorios']) {
    const html = read(`src/html/views/lineas/${vista}.html`);
    assert.match(html, /class="page-header"/, vista);
    assert.match(html, /class="stat-row"/, vista);
  }
});

test('la bitácora automática registra exactamente los 23 campos del bot CAMBIOS TELEFONIA', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  const lista = /const CAMPOS_BITACORA = \[([\s\S]*?)\];/.exec(repo)[1];
  const campos = [...lista.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(campos.length, 23);
  for (const fuera of ['IMEI', 'COLOR', 'PATRON', 'CONTRASEÑA MODEM']) assert.ok(!campos.includes(fuera), fuera);
});

test('las reglas de formato y los íconos son los del AppSheet (flechas, colores y estilos)', () => {
  const lineas = read('src/html/js/lineas.html');
  const reglas = lineas.slice(lineas.indexOf('const REGLAS_FORMATO'), lineas.indexOf('function estiloAppSheet'));
  // HISTORIAL_REASIGNACIONES: Entrada (verde, fa-angle-double-up) y Salida (rojo, fa-angle-double-down)
  assert.match(reglas, /'Responsable Entrante': \{ '\*': \{ color: 'green', icono: 'chevrons-up', fondo: true \} \}/);
  assert.match(reglas, /'Responsable Saliente': \{ '\*': \{ color: 'red', icono: 'chevrons-down', fondo: true \} \}/);
  // CAMBIOS: ANTES / DESPUES con fa-caret-circle-down / up y negritas
  assert.match(reglas, /'ANTES': \{ '\*': \{ color: '#b78360', icono: 'circle-chevron-down', bold: true, fondo: true \} \}/);
  assert.match(reglas, /'DESPUES': \{ '\*': \{ color: 'themeMainColor', icono: 'circle-chevron-up', bold: true, fondo: true \} \}/);
  // RETRO DE SOLICITUD y SOLICITUD van en cursiva (no negrita); TIPO en negrita y cursiva
  assert.match(reglas, /'SUSPENSION DE LINEA': \{ color: 'orange', tam: 0\.9, italic: true, fondo: true \}/);
  assert.match(reglas, /'FINALIZADO': \{ color: 'green', tam: 0\.9, italic: true, fondo: true \}/);
  assert.match(reglas, /'MODEM': \{ color: 'themeMainColor', icono: 'hard-drive', bold: true, italic: true, fondo: true \}/);
  assert.match(reglas, /'Cargadores': \{ color: '#006699', bold: true, italic: true \}/);
  // ESTATUS TEMPORAL (13 días) y View Ref (fa-chevron-circle-right)
  assert.match(lineas, /function usoTemporalVencido\(l\)/);
  assert.match(lineas, /13 \* 24/);
  // (View Ref "Ver línea" era de Reactivación, retirada el 30-sep)
  // Menú con los íconos de las vistas del AppSheet
  const app = read('src/html/js/app.html');
  [['lineas-telefonicas', 'smartphone'], ['accesorios-lineas', 'boxes'], ['cambios-lineas', 'eye']].forEach(([vista, icono]) => {
    assert.match(app, new RegExp(`vista: '${vista}', etiqueta: '[^']+', icono: '${icono}'`), vista);
  });
});

test('los campos de texto libre del AppSheet ahora tienen lista desplegable', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const repo = read('src/services/lineas/LineasRepo.gs');
  const lineas = read('src/html/js/lineas.html');
  const control = (src, columna) => {
    const c = columna.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    if (new RegExp(`listaCH\\('${c}'`).test(src)) return 'listaAbierta';   // datos del responsable: listas de Capital Humano
    return (new RegExp(`(?:campo_|\\bed)\\('${c}', '[^']+', '([a-zA-Z]+)'`).exec(src) || [])[1];
  };
  ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DIRECTOR', 'COLOR'].forEach((c) => assert.equal(control(reg, c), 'listaAbierta', 'LINEAS ' + c));
  // Responsables adicionales (6-oct): número de empleado y nombre, de Capital Humano
  assert.match(reg, /campo\(num, 'No\. de empleado', 'listaAbierta'/);
  assert.match(reg, /campo\(nom, 'Nombre', 'listaAbierta'/);
  assert.doesNotMatch(reg, /RESPONSABLE USA EL EQUIPO|'Quien lo usa'/);
  // Inspección (usuario, 3-oct): el equipo y la línea vienen del registro (fijos); en la responsiva siguen con lista
  const resp = cap.slice(cap.indexOf('function formularioResponsiva_'));
  ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO'].forEach((c) => assert.equal(control(cap, c), 'listaAbierta', 'inspección ' + c));
  assert.equal(control(cap, 'OTRA'), 'texto', 'inspección OTRA: texto libre (usuario, 4-oct)');
  ['MODELO', 'COMPAÑIA', 'RAZON SOCIAL', 'TIPO'].forEach((c) => assert.equal(control(cap, c), 'texto', 'inspección (fijo) ' + c));
  // Responsiva: el equipo es fijo (usuario, 4-oct); la línea, con sugerencias (fija al reasignar)
  assert.match(resp, /ro\('MODELO', 'Modelo', v\('EQUIPO'\)\)/);
  assert.match(resp, /ro\('IMEI', 'IMEI', v\('IMEI'\)\)/);
  ['COMPAÑIA', 'RAZON SOCIAL'].forEach((c) => assert.match(resp, new RegExp("deLinea\\('" + c + "'")));
  // Fija también con Vincular / Cambiar línea (la línea que se pone, etapa 3, 8-oct)
  assert.match(resp, /const deLinea = \(columna, etiqueta, valor, extra\) => \(reasignar \|\| lineaFila \? ro\(columna, etiqueta, valor\) : ed\(columna, etiqueta, 'listaAbierta', valor, extra\)\);/);
  assert.equal(control(resp, 'IDENTIFICACION'), 'listaAbierta', 'responsiva IDENTIFICACION: sugiere INE y licencia y se puede escribir (usuario, 4-oct)');
  assert.match(resp, /'IDENTIFICACION', 'Identificación', 'listaAbierta', \{ valor: '', requerido: 'SIEMPRE', opciones: IDENTIFICACIONES \}/);
  assert.match(resp, /sugerencias: 'NUMEROS', autollenar: \{ 'SIM': 'sim'/);
  // Responsiva: una sola fecha como la inspección (usuario, 4-oct); DIA, MES y AÑO ya no se capturan
  assert.equal(control(resp, 'FECHA RESPONSIVA'), 'fechaHora', 'responsiva FECHA RESPONSIVA');
  ['DIA', 'MES', 'AÑO'].forEach((c) => assert.equal(control(resp, c), undefined, 'responsiva sin ' + c));
  assert.match(repo, /catalogos_telefonia_v7/);
  // Reestructura (§3): los datos del responsable salen solo de Capital Humano (personas activas)
  ['sedes', 'areas', 'oficinas', 'puestos', 'jefes', 'directores'].forEach((k) => assert.match(repo, new RegExp(k + ": unicos\\(ch, '")));
  assert.match(repo, /function colaboradoresActivos_\(\)/);
  assert.match(repo, /indice_colaboradores_v4/);
  ['DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO'].forEach((c) => assert.equal(control(cap, c), 'listaAbierta', 'inspección ' + c));
  // "Agregar 'x'": lo tecleado sin elegirlo no se guarda, y solo en los datos del responsable
  const cbx = read('src/html/js/componentes/combobox.html');
  assert.match(cbx, /agregar: false/);
  assert.match(cbx, /Agregar “/);
  assert.match(cbx, /function revisarAlSalir\(\)/);
  assert.match(lineas, /agregar: e\.control === 'listaAbierta' && !e\.soloLista,/);
  // Autollenado con lo que dice CH (correo empresarial a la cuenta de Google)
  assert.match(reg, /'CUENTA GOOGLE': 'correo'/);
  assert.match(cap, /'JEFE DIRECTO': 'jefe', 'CORREO': 'correo'/);
  // Abreviaturas confirmadas: se guarda como CH y se muestra completo
  const util = read('src/services/lineas/LineasUtil.gs');
  assert.match(util, /'QRO': 'QUERETARO', 'SLP': 'SAN LUIS POTOSI', 'EDO\. MEXICO': 'ESTADO DE MEXICO'/);
  // En oficinas la abreviatura va dentro del nombre ("CARRANZA SLP"); las claves como CMSLP no se tocan (3-oct)
  assert.match(util, /'OFICINA\/DESARROLLO': \{ 'AGS': 'AGUASCALIENTES', 'MTY': 'MONTERREY', 'SLP': 'SAN LUIS POTOSI' \}/);
  const U = new Function(util + '; return LineasUtil;')();
  assert.equal(U.mostrarCH('OFICINA / DESARROLLO', 'CARRANZA SLP'), 'CARRANZA SAN LUIS POTOSI');
  assert.equal(U.mostrarCH('OFICINA/DESARROLLO', 'CALZADA DEL VALLE - MTY'), 'CALZADA DEL VALLE - MONTERREY');
  assert.equal(U.mostrarCH('OFICINA/DESARROLLO', 'AGS'), 'AGUASCALIENTES');
  ['CMSLP', 'CDMAGS.OC5', 'TX.MTY', 'CMSLP.OC3'].forEach((v) => assert.equal(U.mostrarCH('OFICINA/DESARROLLO', v), v));
  assert.equal(U.guardarCH('OFICINA / DESARROLLO', 'CARRANZA SAN LUIS POTOSI'), 'CARRANZA SLP');
  assert.equal(U.guardarCH('SEDE', 'QUERETARO'), 'QRO');
  assert.equal(U.mostrarCH('DEPARTAMENTO', 'ADMINISTRACION DE OFICINAS'), 'ADMINISTRACION DE OFICINAS');
  assert.match(read('src/services/lineas/LineasDatos.gs'), /LineasUtil\.mostrarCH\(h, v\)/);
  ['colores', 'puestos', 'jefes', 'directores', 'otrasApps', 'identificaciones', 'motivosDesecho'].forEach((k) => assert.match(repo, new RegExp(k + ': ')));
  // El navegador completa personas / números y copia los datos de la persona elegida
  assert.match(lineas, /function opcionesSugeridas\(tipo\)/);
  assert.match(lineas, /if \(e\.autollenar && opcion && opcion\.datos\)/);
  assert.match(lineas, /activarCombosEn\(cuerpo, captura\.contexto\.formulario\);/);
  // Accesorios: listas en el alta y sin duplicados
  assert.match(lineas, /Combobox\.crear\(\$\('#lac-marca', raiz\)/);
  assert.match(read('src/services/lineas/LineasAccesorios.gs'), /Ese artículo ya existe/);
});

test('todos los módulos tienen KPIs con línea lateral y la tarjeta se llama Detalles', () => {
  const lineas = read('src/html/js/lineas.html');
  const estilos = read('src/html/lineas-estilos.html');
  // La franja de color la da el .stat-tile global (styles.html); Líneas ya no trae la suya (jorge, 25-sep)
  assert.doesNotMatch(estilos, /\.ln-modulo \.stat-tile::before \{/);
  assert.match(read('src/html/styles.html'), /\.stat-tile-ok \{ border-left-color: var\(--color-success\); \}/);
  assert.match(read('src/html/views/lineas/lineas-gestion-activos.html'), /id="lnga-kpis"/);
  assert.match(lineas, /etiqueta: 'Sin activos'/);
  assert.match(lineas, /etiqueta: 'Sin stock'/);
  assert.match(lineas, /etiqueta: 'Cambios de estatus'/);
  assert.match(lineas, /' Detalles<\/h3>'/);
  assert.doesNotMatch(lineas, /Detalles para copiar|se escriben aquí antes de copiar/);
});

test('experiencia de uso: menú en celular, ficha en pestañas y formularios por pasos', () => {
  const index = read('src/html/Index.html');
  const movil = read('src/html/shell-movil.html');
  const lineas = read('src/html/js/lineas.html');
  const estilos = read('src/html/lineas-estilos.html');
  // Menú en celular y tableta: archivo aparte, incluido al final, con los cortes del sistema (Pantalla)
  assert.match(index, /include\('html\/shell-movil'\)/);
  assert.match(movil, /@media \(max-width: 1024px\)/);
  assert.match(movil, /Pantalla\.alCambiar\(/);
  assert.match(movil, /shell-menu-abierto/);
  // Panel cerrado = fuera del foco del teclado; el tema baja al panel en celular
  assert.match(movil, /sidebar\.inert = Pantalla\.esAngosta\(\) && !abierto\(\)/);
  assert.match(movil, /className = 'shell-tema-panel'/);
  // Ficha: resumen rápido + pestañas; Documentos con indicadores y tabla, como Historial
  assert.match(lineas, /function fichaEnPestanas\(general, detalles, conDocumentos\)/);
  assert.match(lineas, /class="ln-resumen-rapido"/);
  assert.match(lineas, /function pintarDocumentos\(cont, inspecciones, responsivas, id\)/);
  // Formularios por pasos con el mismo marcado del componente Formulario
  const pasos = lineas.slice(lineas.indexOf('const PASOS_FORMULARIO'), lineas.indexOf('function repartirEnPasos'));
  ['INSPECCION', 'RESPONSIVA', 'REGISTRO_EQUIPO', 'REGISTRO_LINEA', 'SOLICITUD'].forEach((k) => assert.ok(pasos.includes(k + ': ['), k));
  assert.match(lineas, /class="form-pasos"/);
  assert.match(lineas, /class="form-paso-chip"/);
  assert.match(lineas, /function activarPasos\(cont, cfg\)/);
  assert.match(lineas, /function marcarErroresEn\(cuerpo, errores\)/);
  assert.match(lineas, /libre: !!id/);
  // Repartir en pasos conserva el orden del AppSheet
  const cuerpo = lineas.slice(lineas.indexOf('function repartirEnPasos'), lineas.indexOf('/** Indicador de pasos'));
  const repartir = new Function(cuerpo + '\nreturn repartirEnPasos;')();
  const grupos = repartir([{ tipo: 'campo', columna: 'A' }, { tipo: 'campo', columna: 'B' }, { tipo: 'titulo', texto: 'S' }, { tipo: 'campo', columna: 'C' }],
    [{ desde: 'A' }, { desde: 'titulo:S' }]);
  assert.deepEqual(grupos.map((g) => g.map((e) => e.columna || e.texto)), [['A', 'B'], ['C']]);
  // En celular el modal ocupa la pantalla y el formulario desplaza con el pie a la vista
  assert.match(estilos, /height: 100dvh/);
  assert.match(estilos, /\.ln-captura-modal \.modal-form-scroll, #ln-op-modal \.modal-form-scroll \{ max-height: none; flex: 1 1 auto; min-height: 0; overflow-y: auto; \}/);
  assert.match(lineas, /matchMedia\('\(max-width: 700px\)'\)\.matches \? 'tarjetas' : 'tabla'/);
});

test('inspección y responsiva: bloqueo en lista, firmas del sistema, acomodo, fotos y estatus', () => {
  const lineas = read('src/html/js/lineas.html');
  const app = read('src/html/js/app.html');
  // Bloqueo: una lista decide PIN / patrón / contraseña y el valor sigue yendo en PIN EQUIPO
  assert.match(lineas, /const OPCIONES_BLOQUEO = \['PIN', 'PATRÓN', 'CONTRASEÑA', 'SIN BLOQUEO'\];/);
  assert.match(lineas, /if \(t === 'PATRÓN'\) input\.value = 'PATRON';/);
  assert.match(lineas, /el\.hasAttribute\('data-virtual'\)/);
  // Firmas: componente Firma del sistema, con el nombre de quien firma y ajuste al mostrarse el paso
  assert.match(lineas, /Firma\.crear\(contenedor, \{ nombre: nombre \|\| '', marca: 'Firma aquí con el dedo' \}\)/);
  assert.match(lineas, /'FIRMA RESPONSABLE': 'RESPONSABLE'/);
  assert.match(lineas, /alMostrar: \(\) => Object\.keys\(captura\.firmas\)/);
  assert.doesNotMatch(lineas, /function activarFirma\(/);
  assert.match(lineas, /\{ acomodar: true \}/);
  // Fotos: opcionales, cámara o galería, y también después de guardar la inspección
  assert.match(lineas, /function htmlSubirFotos\(prefijo, nota\)/);
  assert.match(lineas, /apiLineasFotosInspeccion', id, 'preparar'/);
  // `externa`: inspección de NUCOS (solo lectura) cuyas fotos nuevas van a una carpeta de la app (30-sep)
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /function fotosInspeccion\(id, accion, correo, externa\)/);
  // La carpeta de Drive se crea al subir la primera foto o al guardar, no al abrir
  assert.match(lineas, /function asegurarCarpeta\(\)/);
  assert.doesNotMatch(lineas, /Promise\.all\(\[pedirContexto, llamar\('apiLineasPrepararEvidencia'/);
  // Sin «¿Qué pasó?» ni «Cambiar estatus» (usuario, 4-oct): los estatus se cambian en Editar
  assert.doesNotMatch(lineas, /abrirQuePaso|abrirCambioEstatus|texto: 'Cambiar estatus'/);
  assert.doesNotMatch(read('src/services/lineas/LineasRegistros.gs'), /function cambiarEstatus\(/);
  assert.doesNotMatch(read('src/ClientApi.gs'), /apiLineasCambiarEstatus/);
  // Velocidad: sin esperas fijas largas y con datos en memoria
  assert.match(app, /\}, 180\);/);
  assert.doesNotMatch(app, /\}, 2500\);/);
  assert.match(lineas, /memoria\.tablas\[clave\] = texto;/);
  assert.match(lineas, /function cargarCatalogos\(forzar\)/);
  // PDF: la firma recortada cabe en 160 × 70
  // Una firma cabe en 160 × 70; las de varios responsables juntas (responsiva, 6-oct), hasta 300 de ancho
  assert.match(read('src/services/lineas/LineasPdf.gs'), /Math\.min\(1, \(chica \? 90 : 160\) \/ ancho, \(chica \? 40 : 70\) \/ alto\)/);
});

test('la sección de fotos de la inspección no se oculta con las condiciones del AppSheet', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.doesNotMatch(lineas, /\.ln-af-seccion'\)\.forEach\(/);
  assert.match(lineas, /#ln-captura-cuerpo \.ln-af-seccion:not\(\.ln-af-extra\)'\)\.forEach\(/);
});

test('Exportar a Excel descarga la base completa del módulo, no solo lo que se ve', () => {
  const lineas = read('src/html/js/lineas.html');
  // Todas las tablas de módulo usan la base completa; el historial de una ficha sigue exportando lo filtrado
  assert.match(lineas, /exportar: exportarBase\('INVENTARIO', /);
  assert.match(lineas, /exportar: exportarBase\('ACCESORIOS', /);
  assert.equal((lineas.match(/exportar: exportarBase\(tipo, cfg\.titulo\)/g) || []).length, 1);
  assert.doesNotMatch(lineas, /exportar: \{ nombreArchivo: (cfg\.|'Inventario)/);
  assert.match(lineas, /DecompressionStream\('gzip'\)/);
  const dt = read('src/html/js/componentes/datatable.html');
  assert.match(dt, /if \(typeof cfg\.exportar\.descargar === 'function'\) return exportarConDescarga\(boton\);/);
  const xl = read('src/html/js/componentes/exportar-excel.html');
  assert.match(xl, /return \{ descargar, descargarLibro[,\s\w]*\};/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasExportarBase\(token, modulo, comprimir\)/);

  // Servidor: todas las filas y columnas, tipos para Excel y secretos ocultos si no es ADMIN
  const fecha = (s) => new Date(s);
  const valores = [
    ['A1', 350000000000001, 'PIN EQUIPO', '1234', '5678', fecha('2026-09-24T00:00:00'), fecha('2026-09-24T10:30:00'), 3],
    ['', '', '', '', '', '', '', ''],
    ['A2', 350000000000002, 'RESPONSABLE', 'ANA', 'LUIS', fecha('2026-09-25T00:00:00'), fecha('2026-09-25T08:05:00'), 7],
  ];
  const encabezados = ['ID', 'IMEI', 'CAMPO', 'ANTES', 'DESPUES', 'FECHA', 'FECHA ACTUALIZACION', 'CANTIDAD'];
  const hoja = { getLastRow: () => valores.length + 1, getRange: () => ({ getValues: () => valores }) };
  const LineasDatos = { existeTabla: () => true, zona: () => 'X', tablaFresca: () => ({ encabezados, hoja }) };
  const pad = (n) => String(n).padStart(2, '0');
  const Utilities = {
    formatDate: (d, z, f) => f
      .replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1)).replace('dd', pad(d.getDate()))
      .replace('HH', pad(d.getHours())).replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds())).replace(/'/g, ''),
  };
  const LineasRepo = { TAB: { LINEAS: 'L', CAMBIOS: 'C', REASIG: 'R', DESECHO: 'D', REACTIVACION: 'RA', SOLICITUD: 'S' } };
  const LineasUtil = { nucoVisible: (v) => String(v).trim().padStart(4, '0') };
  const mod = new Function('LineasDatos', 'Utilities', 'LineasRepo', 'LineasUtil', read('src/services/lineas/LineasExportar.gs') + '\nreturn LineasExportar;')(LineasDatos, Utilities, LineasRepo, LineasUtil);
  const operador = mod.baseCompleta('CAMBIOS', false).hojas[0];
  assert.deepEqual(operador.columnas.map((c) => c.tipo), ['texto', 'texto', 'texto', 'texto', 'texto', 'fecha', 'fechaHora', 'numero']);
  assert.equal(operador.filas.length, 2);   // la fila vacía no se exporta
  assert.deepEqual(operador.filas[0], ['A1', '350000000000001', 'PIN EQUIPO', '••••', '••••', '2026-09-24', '2026-09-24T10:30:00', 3]);
  assert.deepEqual(operador.filas[1].slice(3, 5), ['ANA', 'LUIS']);
  assert.deepEqual(mod.baseCompleta('CAMBIOS', true).hojas[0].filas[0].slice(3, 5), ['1234', '5678']);
  assert.equal(mod.baseCompleta('ACCESORIOS', false).hojas.length, 2);
  assert.throws(() => mod.baseCompleta('OTRO', false), /desconocido/);

  // Inventario (9-oct): una sola hoja como el panel (vista del AppSheet), no LINEAS / EQUIPOS / ASIGNACIONES / ADENDUMS
  LineasRepo.vistaCompleta = () => ({
    columnas: ['NUMERO TELEFONO', 'NUCO', 'PIN EQUIPO', 'COSTO PLAN', 'FIN PLAN'],
    filas: [['4421090805', '0012', '1234', 299, fecha('2027-01-15T00:00:00')], [null, '13', null, null, null]],
  });
  const inventario = mod.baseCompleta('INVENTARIO', false).hojas;
  assert.equal(inventario.length, 1);
  assert.equal(inventario[0].nombre, 'L');
  assert.deepEqual(inventario[0].columnas.map((c) => c.tipo), ['texto', 'texto', 'texto', 'numero', 'fecha']);
  assert.deepEqual(inventario[0].filas, [['4421090805', '0012', '••••', 299, '2027-01-15'], ['', '0013', '', '', '']]);
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /function vistaCompleta\(\) \{[\s\S]*?filas\.push\(filaVista_\(f, r\)\.slice\(1\)\);/);
});

test('Líneas usa la BD de pruebas del equipo y ninguna carpeta personal de pruebas', () => {
  const admin = read('src/services/lineas/LineasAdmin.gs');
  assert.match(admin, /const LINEAS_DEV_SPREADSHEET_ID = '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI';/);
  // Si faltan pestañas no cambia nada: el error sale antes de setProperties; la carpeta personal se borra
  const f = admin.slice(admin.indexOf('function configurarLineasDev'));
  assert.ok(f.indexOf("throw new Error('No se cambió nada") < f.indexOf('setProperties('));
  assert.match(f, /props\.deleteProperty\('LINEAS_DRIVE_CARPETA_RAIZ'\);/);
  // Ninguna conexión a la carpeta de pruebas personal (1ZNI2…), al inventario JSON ni a la copia vieja del AppSheet
  const codigo = filesBelow(path.join(root, 'src')).filter((x) => /\.(gs|html)$/.test(x)).map((x) => fs.readFileSync(x, 'utf8')).join('\n');
  assert.doesNotMatch(codigo, /1ZNI2tVANe3qBglcQ5sisCctGBe4Qetmk|1_47fd5nCcg4M6Qnsxmk14r9aTJG2bCPSW86ig_r2478|inventario_NUCOS_|getProperty\('LINEAS_DRIVE_CARPETA_RAIZ'\)/);
  // Las cachés de Líneas llevan el ID de la hoja: al cambiar de hoja no se mezclan datos
  assert.match(read('src/services/lineas/LineasDatos.gs'), /return 'ln_' \+ clave \+ '_' \+ id\(\)\.slice\(0, 10\);/);
});

test('Gestión de Activos abre al colaborador en el panel lateral, no al final de la página', () => {
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /function abrirPanelLateral\(titulo, subtitulo, opciones\)/);
  assert.match(lineas, /elemento\.className = 'dt-panel ln-panel' \+ \(o\.noModal \? ' ln-panel-nomodal' : ''\);/);   // mismo panel que el detalle de DataTable
  const gestion = lineas.slice(lineas.indexOf('function initGestionActivos'), lineas.indexOf('function pintarCuadros'));
  assert.match(gestion, /const panel = abrirPanelLateral\(/);
  assert.doesNotMatch(gestion, /scrollIntoView|lnga-resultado/);
  assert.doesNotMatch(read('src/html/views/lineas/lineas-gestion-activos.html'), /lnga-resultado/);
});

test('Drive: carpeta de la app con sus rutas; inspecciones y responsivas con NUCO se guardan en NUCOS', () => {
  // Servidor: resuelve "TABLA_Files_/archivo" caminando desde la carpeta de la app y guarda con el nombre del AppSheet
  const creados = [];
  const carpeta = (id, sub, archivos) => ({
    getId: () => id,
    getFoldersByName: (n) => { const c = (sub || {})[n]; return { hasNext: () => !!c, next: () => c }; },
    getFilesByName: (n) => { const f = (archivos || {})[n]; return { hasNext: () => !!f, next: () => f }; },
    createFolder: (n) => { const c = carpeta('NUEVA-' + n); (sub || {})[n] = c; return c; },
    createFile: (blob) => { creados.push({ carpeta: id, nombre: blob.nombre, mime: blob.mime }); return { getId: () => 'F' + creados.length, setSharing: () => {} }; },
  });
  const archivo = { getId: () => 'ARCH1', getName: () => 'a1.EVIDENCIA.1.jpg', getUrl: () => 'https://drive.google.com/file/d/ARCH1/view' };
  const raiz = carpeta('RAIZ', { 'BITACORA DE DESECHO_Files_': carpeta('DES', {}, { 'a1.EVIDENCIA.1.jpg': archivo }) });
  const memoria = {};
  const globales = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    leerConfig_: () => null,   // config/Entornos.gs: sin configuración, se usan las carpetas que trae el código
    CacheService: { getScriptCache: () => ({ get: (k) => memoria[k] || null, put: (k, v) => { memoria[k] = v; } }) },
    Utilities: {
      base64EncodeWebSafe: (b) => String(b), computeDigest: (a, t) => t, DigestAlgorithm: {}, Charset: {},
      base64Decode: () => [1, 2, 3], newBlob: (bytes, mime, nombre) => ({ mime, nombre }), formatDate: () => '101530',
    },
    DriveApp: { getFolderById: () => raiz, searchFiles: () => ({ hasNext: () => false }), Access: { DOMAIN: 'DOMAIN' }, Permission: { VIEW: 'VIEW' } },
    DriveUtils: { marcarAutor: (a) => a },   // quién lo subió: aquí no importa
  };
  const LA = new Function(...Object.keys(globales), read('src/services/lineas/LineasArchivos.gs') + '\nreturn LineasArchivos;')(...Object.values(globales));
  assert.equal(LA.resolver('BITACORA DE DESECHO_Files_/a1.EVIDENCIA.1.jpg', false).id, 'ARCH1');
  assert.equal(LA.resolver('BITACORA DE DESECHO_Files_/no-existe.jpg', false), null);
  assert.equal(LA.resolver('https://www.appsheet.com/template/gettablefileurl?appName=X&tableName=Y&fileName=BITACORA%20DE%20DESECHO_Files_%2Fa1.EVIDENCIA.1.jpg', false).id, 'ARCH1');
  assert.equal(LA.resolver('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view', false).id, '1AbCdEfGhIjKlMnOpQrStUvWxYz');
  assert.throws(() => LA.resolver('LINEAS TELEFONICAS_Images/x.PATRON.1.png', false), /administrador/);
  assert.equal(LA.resolver('../otra/x.jpg', true), null);
  assert.equal(LA.guardarComoAppSheet('BITACORA DE DESECHO_Files_', 'd9f2', 'EVIDENCIA', 'image/jpeg', 'AAA'), 'BITACORA DE DESECHO_Files_/d9f2.EVIDENCIA.101530.jpg');
  assert.deepEqual(creados[0], { carpeta: 'DES', nombre: 'd9f2.EVIDENCIA.101530.jpg', mime: 'image/jpeg' });
  assert.throws(() => LA.guardarComoAppSheet('X_Files_', 'k', 'C', 'text/html', 'AAA'), /no permitido/);
  // Las dos carpetas: la de la app (pruebas "PruebasCONTROLVEHICYTELEF-172665033") y NUCOS de producción
  assert.equal(LA.carpetaAppSheetId(), '1FsC5mloJNhi_TR7pBX1KMEjUZfN_M9OM');
  assert.equal(LA.carpetaNucosId(), '12SRBi1nZlIzfNx0d2y1fAtzOydA2QrT-');
  assert.equal(typeof LA.escribeEnProduccion, 'undefined');

  // Rutas del AppSheet al guardar: PDF (acciones GUARDAR de sus bots), desechos y archivos de LINEAS
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /carpeta: 'INSPECCIONES_Files_', nombre: \(id\) => 'INSPECCION - ' \+ id \+ '\.pdf', columna: 'FORMATO INSPECCIONES LINEAS'/);
  assert.match(captura, /carpeta: 'Files', nombre: \(id\) => 'RESPONSIVA' \+ id \+ '\.pdf', columna: 'FORMATO RESPONSIVA'/);
  // Con NUCO, el PDF va a NUCOS ("INSP DD MM" / "RESP DD MM") y la hoja guarda su enlace de Drive; sin NUCO, la ruta del AppSheet
  assert.match(captura, /const ruta = d\.enNucos \? 'https:\/\/drive\.google\.com\/file\/d\/' \+ pdf\.id \+ '\/view' : destino\.carpeta \+ '\/' \+ nombre;/);
  assert.match(captura, /ligarPdf_\(tabla, destino\.columna, ids, pdf, ruta\)/);
  const arch = read('src/services/lineas/LineasArchivos.gs');
  assert.match(arch, /ramas = \['INSPECCIONES', anio, CUATRIMESTRES_\[Math\.floor\(\(mes - 1\) \/ 4\)\], MESES_\[mes - 1\]\];/);
  assert.match(arch, /carpetaUnica_\(ramas\.reduce\(\(c, nombre\) => subcarpeta_\(c, nombre\), raizNuco\), 'INSP ' \+ ddmm\);/);
  assert.match(arch, /ramas = \['CARTA RESPONSIVA', anio\];/);
  assert.match(arch, /nombrePdf: \(tipo === 'INSPECCION' \? 'INSP ' : 'RESP '\) \+ n4 \+ ' ' \+ ddmm \+ '\.pdf'/);
  // Solo se escribe en la carpeta de la app o en NUCOS
  assert.match(arch, /if \(!carpetaId \|\| !\(estaDentroDe\(carpetaId, carpetaAppSheetId\(\)\) \|\| enNucos\(carpetaId\)\)\)/);
  // Fotos de inspección: en NUCOS si hay NUCO, si no en la carpeta de la app; cancelar solo borra la carpeta que creó el mismo usuario
  const ev = read('src/services/lineas/LineasEvidencias.gs');
  assert.match(ev, /const CARPETA_FOTOS = 'INSPECCIONES LINEAS_Images';/);
  assert.match(ev, /c = LineasArchivos\.carpetaEvidenciaNuco\('INSPECCION', nuco, fecha \|\| new Date\(\)\);/);
  assert.match(ev, /carpetaUnica_\(LineasArchivos\.carpetaDeApp\(CARPETA_FOTOS\), 'FOTOS ' \+ id\)/);
  assert.match(ev, /if \(!carpetaId \|\| !cache\.get\(claveBorrador_\(correo, carpetaId\)\)\) return \{ ok: false \};/);
  assert.match(read('src/services/lineas/LineasUtil.gs'), /try \{ return LineasArchivos\.carpetasNucos\(\); \}/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasArchivo\(token, ruta\)/);

  // Cliente: Última responsiva / inspección de NUCOS solo en el ⋮ de la ficha (usuario, 30-sep). El patrón volvió a
  // General el 5-oct, dibujado o con la imagen del AppSheet, no como archivo (lineas-patron-consulta.test.cjs)
  const lineas = read('src/html/js/lineas.html');
  assert.doesNotMatch(lineas, /\['Patrón', botonArchivo/);
  assert.doesNotMatch(lineas, /\['Última responsiva', botonUltimoNucos/);
  assert.match(lineas, /texto: 'Ver última responsiva', alHacer: \(\) => abrirUltimoDesdeMenu\('RESPONSIVA', id\)/);
  // Sin la tarjeta "Registro en la hoja" (ID, folio, fila, estatus general, fechas, comentarios); Tipo en Equipo o Línea
  assert.doesNotMatch(lineas, /tarjetaRegistro|Registro en la hoja|ln-solo-escritorio/);
  assert.match(lineas, /\['Tipo', tipoRegistro\(e\.legado\), true\],/);
  assert.match(lineas, /!e \? \['Tipo', tipoRegistro\(l\.legado\), true\] : null,/);
  // La página de la responsiva (apiLineasResponsiva, usuario 6-oct) usa los PDF de NUCOS y del sistema, nunca pdfRuta
  assert.doesNotMatch(lineas, /d\.pdfRuta|responsivaRuta|formatoInspeccionRuta|apiLineasDocumentosNuco|ln-docs-nucos|totalRotaciones/);
  const servicio = read('src/services/TelefoniaService.gs');
  assert.doesNotMatch(servicio, /pdfRuta|totalRotaciones|LineasArchivos\.imagen\(insp/);
  // Documentos: indicadores que filtran por tipo y una tabla con acciones por fila
  assert.match(lineas, /contarEnPestana\('documentos', filas\.length\);/);
  assert.match(lineas, /etiqueta: 'Inspecciones', titulo: 'Mostrar solo inspecciones',\s+filtros: \{ documento: \{ valores: \['Inspección'\] \} \}/);
  assert.match(lineas, /\{ icono: 'file-plus', titulo: 'Generar PDF', visible: \(d\) => !!d\.pdfPendiente,/);
  // Sin Excel; doble clic abre la inspección (o el PDF de la responsiva)
  assert.match(lineas, /idTabla: 'lineas-documentos-v1',\s+exportar: false,/);
  assert.match(lineas, /\$\('\.ln-docs-tabla', cont\)\.addEventListener\('dblclick'/);
  assert.match(lineas, /const ORIGEN_DOCUMENTO = \{ APPSHEET: 'AppSheet', SISTEMA: 'Sistema nuevo', DRIVE: 'Carpeta NUCOS' \};/);
});

test('Documentos: inspecciones y responsivas de la hoja y de la carpeta del NUCO en NUCOS', () => {
  const grupos = [
    { carpetaId: 'r1', ruta: 'CARTA RESPONSIVA/2026/RESP 02 01', tipo: 'RESPONSIVA', fecha: '2026-01-02T12:00:00', archivos: [
      { id: 'ine', nombre: 'INE 0005.pdf', mime: 'application/pdf', fecha: '2026-02-16' },
      { id: 'resp', nombre: 'RESP 0005 02 01.pdf', mime: 'application/pdf', fecha: '2026-01-11' },
    ] },
    { carpetaId: 'i1', ruta: 'INSPECCIONES/2026/ENERO/INSP 02 01', tipo: 'INSPECCION', fecha: '2026-01-02T12:00:00', archivos: [
      { id: 'insp', nombre: 'INSP 0005 02 01.pdf', mime: 'application/pdf' }] },
    { carpetaId: 'f1', ruta: 'INSPECCIONES/2026/ENERO/INSP 02 01/FOTOS', tipo: 'INSPECCION', fecha: '2026-01-02T12:00:00', archivos: [
      { id: 'a', nombre: 'a.jpg', mime: 'image/jpeg' }, { id: 'b', nombre: 'b.jpg', mime: 'image/jpeg' }] },
    { carpetaId: 'f0', ruta: 'INSPECCIONES/2025/DICIEMBRE/INSP 10 12/FOTOS', tipo: 'INSPECCION', fecha: '2025-12-10T12:00:00', archivos: [
      { id: 'c', nombre: 'c.jpg', mime: 'image/jpeg' }] },
  ];
  const hoja = {
    // Inspección del AppSheet del 10-dic (sin carpeta): toma la carpeta de NUCOS de ese día en vez de repetirse
    inspecciones: [{ _id: 'AP1', origen: 'APPSHEET', fecha: new Date(2025, 11, 10, 9), calificacion: 1, snapshot: { responsable: 'R' } }],
    responsivas: [],
  };
  const globales = {
    Auth: { validarSesion: () => ({ rol: 'OPERADOR' }) },
    Permisos: { EDICION: 'EDICION', puedeLeerAlguno: () => ({ rol: 'OPERADOR', permisos: {} }), puedeLeer: () => ({ rol: 'OPERADOR', permisos: {} }), puedeEditar: () => ({ rol: 'OPERADOR', permisos: {} }) },
    Config: { ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR' } },
    LineasRepo: { leerRegistroPorId: () => ({ NUCO: 5 }), evidenciasDeRegistro: () => hoja },
    LineasUtil: { nuco4: (v) => ('0000' + v).slice(-4), col: (f, c) => f[c], paraCliente: (o) => JSON.parse(JSON.stringify(o)) },
    LineasDatos: { cacheLeer: () => null, cacheGuardar: () => {}, ZONA_APP: 'X' },
    LineasArchivos: { archivosNuco: () => ({ carpetaId: 'raiz', grupos: grupos }) },
    Utilities: { formatDate: (d) => [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-') },
  };
  const S = new Function(...Object.keys(globales), read('src/services/TelefoniaService.gs') + '\nreturn TelefoniaService;')(...Object.values(globales));
  const r = S.evidencias('t', 'x');
  assert.deepEqual(r.inspecciones.map((i) => [i.id, i.origen, i.pdfId, i.fotos, i.carpetaId]), [
    ['drive_i1', 'DRIVE', 'insp', 2, 'i1'],
    ['AP1', 'APPSHEET', null, 1, 'f0'],
  ]);
  assert.deepEqual(r.responsivas.map((i) => [i.id, i.pdfId]), [['drive_r1', 'resp']]);
  // La inspección y la responsiva (su página, 6-oct) se leen de la hoja o, si solo están en NUCOS, de su carpeta
  assert.match(read('src/services/TelefoniaService.gs'), /\(esInspeccion \? LineasRepo\.leerInspeccion\(id\) : LineasRepo\.leerResponsiva\(id\)\) \|\|\s+\(\/\^drive_\/\.test\(id\) \? documentoNucos_\(id\.slice\(6\), tipo\) : null\)/);
  assert.match(read('src/services/TelefoniaService.gs'), /if \(!LineasArchivos\.estaDentroDe\(carpetaId, LineasArchivos\.carpetaNucosId\(\)\)\) return null;/);
});

test('los .html de Líneas no llevan "//" fuera de comentarios (Apps Script corta lo que sigue)', () => {
  const archivos = filesBelow(path.join(root, 'src/html')).filter((f) => /lineas|views[\\/]lineas|componentes/.test(f));
  archivos.forEach((f) => {
    const texto = fs.readFileSync(f, 'utf8');
    assert.equal(texto.indexOf('\\//'), -1, path.relative(root, f));
  });
});

test('la tabla de Líneas Telefónicas tiene las columnas de siempre y agrega las de la vista del AppSheet', () => {
  // ViewDefinition.ColumnOrder de la vista LINEAS TELEFONICAS (sin ID, oculta; "No EMPLEADO" = "NO EMPLEADO")
  const appsheet = ['NUMERO TELEFONO', 'NUCO', 'TIPO', 'ESTATUS GENERAL', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO',
    'NOMBRE RESPONSABLES 2', 'PUESTO RESPONSABLES 2', 'EQUIPO', 'IMEI', 'NUMERO SIM', 'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO',
    'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'FOLIO', 'RAZON SOCIAL', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE',
    'COMPAÑIA', 'COSTO PLAN', 'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'FECHA CAMBIO TEMPORAL',
    'EMAIL USUARIO', 'ESTATUS EQUIPO', 'RESPONSIVA', 'COMENTARIOS', 'FECHA INSPECCION', 'FORMATO INSPECCION'];
  const repo = read('src/services/lineas/LineasRepo.gs');
  const servidor = repo.slice(repo.indexOf('const COLS_VISTA_LINEAS'), repo.indexOf('];', repo.indexOf('const COLS_VISTA_LINEAS')));
  assert.deepEqual([...servidor.matchAll(/'([^']+)'/g)].map((m) => m[1]), appsheet);
  const lineas = read('src/html/js/lineas.html');
  const cliente = lineas.slice(lineas.indexOf('const COLUMNAS_VISTA_LINEAS'), lineas.indexOf('function columnasVistaLineas'));
  assert.deepEqual([...cliente.matchAll(/\['([^']+)', '[^']+'/g)].map((m) => m[1]), appsheet);
  // DisplayName del AppSheet; RESPONSIVA y FORMATO INSPECCION = la última de NUCOS; PIN solo para ADMIN
  assert.match(cliente, /\['NOMBRE RESPONSABLES 2', 'Nombre colaborador\/es'\]/);
  assert.match(cliente, /\['RESPONSIVA', 'Última responsiva', 'ultimo'\]/);
  assert.match(cliente, /\['FORMATO INSPECCION', 'Última inspección', 'ultimo'\]/);
  // Las columnas de antes a la vista; las del AppSheet que faltaban, ocultas (se agregan desde "Vista")
  assert.match(lineas, /const c = \{ campo: campo, titulo: titulo, tipo: 'texto', visible: false \};/);
  assert.match(lineas, /\{ campo: 'nuco', titulo: 'NUCO', tipo: 'texto', fijada: true,/);
  assert.match(lineas, /\{ campo: 'numero', titulo: 'Número', tipo: 'texto', fijada: true,/);
  assert.doesNotMatch(lineas, /ordenInicial: \{ campo: 'TIPO'/);
  assert.match(lineas, /idTabla: 'lineas-' \+ modulo \+ '-v4',/);
  // Se pide antes del clic y se guarda 9 min (30-sep): el clic usa la misma promesa
  assert.match(lineas, /const promesa = llamar\('apiLineasUltimoDocumentoNuco', id, tipo\);/);
  assert.match(lineas, /const r = await ultimoNucos\(boton\.dataset\.id, boton\.dataset\.lnUltimo\);/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasUltimoDocumentoNuco\(token, id, tipo\)/);
  assert.match(read('src/services/TelefoniaService.gs'), /posiciones\.forEach\(\(i\) => \{ if \(copia\[i\]\) copia\[i\] = '••••'; \}\);/);
  assert.match(repo, /if \(c === 'FOLIO'\) return legado\.folio \|\| null;/);
});

test('detalle de la inspección: mismo diseño que la ficha, sin revisión del activo, firmas ni registro completo', () => {
  const servicio = read('src/services/TelefoniaService.gs');
  const lineas = read('src/html/js/lineas.html');
  assert.doesNotMatch(servicio, /DETALLE_RESPONSIVA|DETALLE_INSPECCION|registroDetalle_|checklist: LineasChecklist\.secciones\(\)|firmas: puedeVerSecretos_/);
  // Firmas y patrón no se listan como fotos; PIN y patrón ocultos para quien no es ADMIN
  assert.match(servicio, /if \(\/\^\(FIRMA\|PATRON\)\/i\.test\(f\.name\)\) return;/);
  assert.match(servicio, /doc\.pinEquipo = doc\.pinEquipo \? '••••' : null;/);
  // Una inspección o responsiva de la hoja sin carpeta toma la de NUCOS del mismo día
  assert.match(servicio, /x\.tipo === tipo && dia_\(x\.doc\.fecha\) === dia_\(doc\.fecha\)/);
  const detalle = lineas.slice(lineas.indexOf('function pintarInspeccion('), lineas.indexOf('/** Desde una bitácora: abre el registro'));
  assert.doesNotMatch(detalle, /Registro completo|Firmas de validación|Revisión del activo|ln-secciones-nav/);
  assert.match(detalle, /tarjeta\(icono\('images'\) \+ ' Fotografías \('/);
});

test('NUCO siempre a 4 dígitos (tabla, ficha, detalles, bitácoras, historial y Excel)', () => {
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({}, {});
  assert.equal(Util.nucoVisible(234), '0234');
  assert.equal(Util.nucoVisible('5'), '0005');
  assert.equal(Util.nucoVisible(' 0234 '), '0234');
  assert.equal(Util.nucoVisible(12345), '12345');
  assert.equal(Util.nucoVisible('N/A'), 'N/A');
  assert.equal(Util.nucoVisible(''), null);
  assert.equal(Util.nucoVisible(null), null);
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /if \(c === 'NUCO'\) return LineasUtil\.nucoVisible\(v\);/);
  assert.match(repo, /nuco: LineasUtil\.nucoVisible\(crudo\('NUCO'\)\) \|\| '',/);
  assert.match(repo, /nuco: txt\(col\(f, 'NUCO'\)\) === null \? null : LineasUtil\.nucoVisible\(col\(f, 'NUCO'\)\),/);
  assert.match(repo, /const CLAVE_INDICE = 'indice_telefonia_v6';/);
  assert.match(read('src/services/lineas/LineasExportar.gs'), /return LineasUtil\.nucoVisible\(valor\);/);
});

test('"Última responsiva" / "Última inspección" abren la más reciente de la carpeta del NUCO en NUCOS', () => {
  const grupos = [
    { carpetaId: 'f1', ruta: 'INSPECCIONES/2026/INSP 12 08/FOTOS', tipo: 'INSPECCION', fecha: '2026-08-12T12:00:00', archivos: [{ nombre: 'a.jpg', mime: 'image/jpeg', enlace: 'u-foto' }] },
    { carpetaId: 'i1', ruta: 'INSPECCIONES/2026/INSP 12 08', tipo: 'INSPECCION', fecha: '2026-08-12T12:00:00', archivos: [{ nombre: 'INSP 0234 12 08.pdf', mime: 'application/pdf', enlace: 'u-insp', fecha: '2026-08-12' }] },
    { carpetaId: 'r2', ruta: 'CARTA RESPONSIVA/2026/RESP 03 09', tipo: 'RESPONSIVA', fecha: '2026-09-03T12:00:00', archivos: [{ nombre: 'FIRMA.png', mime: 'image/png', enlace: 'u-firma' }] },
    { carpetaId: 'i0', ruta: 'INSPECCIONES/2025/INSP 02 10', tipo: 'INSPECCION', fecha: '2025-10-02T12:00:00', archivos: [{ nombre: 'vieja.pdf', mime: 'application/pdf', enlace: 'u-vieja' }] },
  ];
  const rol = { rol: 'ADMIN' };
  const globales = {
    Auth: { validarSesion: () => rol },
    Permisos: { EDICION: 'EDICION', puedeLeerAlguno: () => Object.assign({ permisos: {} }, rol), puedeLeer: () => Object.assign({ permisos: {} }, rol), puedeEditar: () => Object.assign({ permisos: {} }, rol) },
    Config: { ROLES: { ADMIN: 'ADMIN', OPERADOR: 'OPERADOR' } },
    LineasRepo: { leerRegistroPorId: (id) => (id === 'sin' ? { NUCO: '' } : { NUCO: 234 }) },
    LineasUtil: {
      nuco4: (v) => (String(v || '').replace(/\D/g, '') ? ('0000' + String(v)).slice(-4) : null),
      col: (f, c) => f[c], paraCliente: (o) => JSON.parse(JSON.stringify(o)),
    },
    LineasDatos: { cacheLeer: () => null, cacheGuardar: () => {} },
    LineasArchivos: { archivosNuco: () => ({ carpetaId: 'raiz', grupos: grupos }) },
  };
  const S = new Function(...Object.keys(globales), read('src/services/TelefoniaService.gs') + '\nreturn TelefoniaService;')(...Object.values(globales));
  // Inspección: la carpeta más reciente, su PDF (no el de 2025)
  assert.deepEqual(S.ultimoDocumentoNuco('t', 'x', 'INSPECCION'), { nuco: '0234', fecha: '2026-08-12T12:00:00', nombre: 'INSP 0234 12 08.pdf', url: 'u-insp', carpeta: false });
  // Responsiva sin PDF: se abre su carpeta
  const resp = S.ultimoDocumentoNuco('t', 'x', 'RESPONSIVA');
  assert.equal(resp.carpeta, true);
  assert.equal(resp.url, 'https://drive.google.com/drive/folders/r2');
  // Con varios PDF en la carpeta, el formato de la responsiva (no la INE, aunque sea más reciente)
  grupos.unshift({ carpetaId: 'r3', ruta: 'CARTA RESPONSIVA/2026/RESP 20 09', tipo: 'RESPONSIVA', fecha: '2026-09-20T12:00:00', archivos: [
    { nombre: 'INE 0234.pdf', mime: 'application/pdf', enlace: 'u-ine', fecha: '2026-09-21' },
    { nombre: 'RESP 0234 20 09.pdf', mime: 'application/pdf', enlace: 'u-resp', fecha: '2026-09-20' },
  ] });
  assert.equal(S.ultimoDocumentoNuco('t', 'x', 'RESPONSIVA').url, 'u-resp');
  grupos.shift();
  assert.throws(() => S.ultimoDocumentoNuco('t', 'sin', 'RESPONSIVA'), /no tiene NUCO/);
  assert.throws(() => S.ultimoDocumentoNuco('t', 'x', 'OTRO'), /inválido/);
  // Sin responsiva visible para el rol (solo había una firma): mensaje claro
  rol.rol = 'OPERADOR';
  assert.throws(() => S.ultimoDocumentoNuco('t', 'x', 'RESPONSIVA'), /No hay responsiva en la carpeta NUCOS del NUCO 0234/);
});

/** LineasDatos de mentira sobre { pestaña: [filas] }, con las mismas búsquedas por ID que el real. */
function datosDePrueba_(hojas) {
  Object.keys(hojas).forEach((h) => hojas[h].forEach((f, i) => { f._fila = i + 2; }));
  const buscarFilas = (h, c, v, parcial) => (hojas[h] || []).filter((f) => (parcial ? String(f[c] || '').includes(v) : String(f[c]).toLowerCase() === String(v).toLowerCase())).map((f) => f._fila);
  return {
    COLS_ID_ANTERIOR: ['ID ANTERIOR', 'ID APPSHEET'], COL_ID_APPSHEET: 'ID APPSHEET',
    existeTabla: () => true,
    buscarFilas: buscarFilas,
    buscarFilasVarios: (h, c, valores, parcial) => [...new Set([].concat(...valores.map((v) => buscarFilas(h, c, v, parcial))))].sort((a, b) => a - b),
    buscarFilasPorId: (h, id) => { for (const c of ['ID', 'ID ANTERIOR', 'ID APPSHEET']) { const f = buscarFilas(h, c, id); if (f.length) return f; } return []; },
    idsDeFila: (f) => [...new Set([f.ID, f['ID ANTERIOR'], f['ID APPSHEET']].filter(Boolean).map(String))],
    leerTabla: (h) => hojas[h] || [],
    leerFilas: (pets) => pets.map((p) => p.filas.map((n) => hojas[p.tabla][n - 2])),
    cacheLeer: () => null, cacheGuardar: () => {}, tiempo: () => {},
  };
}

test('Historial: números que ha tenido un NUCO y NUCOs por los que pasó un número, desde la bitácora', () => {
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({}, {});
  const d = (s) => new Date(s + 'T12:00:00');
  const hojas = {
    'LINEAS TELEFONICAS': [
      { ID: 'A', NUCO: 1556, 'NUMERO TELEFONO': '4420000002', TIPO: 'EQUIPO + SIM', 'FECHA REGISTRO': d('2025-01-01') },
      { ID: 'B', NUCO: '200', 'NUMERO TELEFONO': '4420000001', TIPO: 'EQUIPO + SIM', 'FECHA REGISTRO': d('2025-01-01') },
    ],
    'CAMBIOS LINEAS TELEFONICAS': [
      { ID_CAMBIO: 'c1', ID_LINEA: 'A', NUCO: '1556', CAMPO: 'NUMERO TELEFONO', ANTES: '4420000001', DESPUES: '4420000002', 'ACTUALIZADO POR': 'ANA', 'FECHA ACTUALIZACION': d('2025-03-01') },
      { ID_CAMBIO: 'c2', ID_LINEA: 'B', NUCO: '200', CAMPO: 'NUMERO TELEFONO', ANTES: 'NO APLICA', DESPUES: '4420000001', 'ACTUALIZADO POR': 'LUIS', 'FECHA ACTUALIZACION': d('2025-03-02') },
      { ID_CAMBIO: 'c3', ID_LINEA: 'B', NUCO: '200', CAMPO: 'COMENTARIOS', ANTES: '1556', DESPUES: 'x', 'ACTUALIZADO POR': 'LUIS', 'FECHA ACTUALIZACION': d('2025-03-03') },
    ],
    APP_MOVIMIENTOS: [{ ID: 'm1', REFS: ',B,', MOTIVO: 'Cambio de equipo por daño', TICKET: '', DETALLE_JSON: JSON.stringify({ idsCambios: ['c2'] }) }],
    'REACTIVACION DE LINEAS': [],
  };
  const LineasDatos = Object.assign(datosDePrueba_(hojas), {
    cacheLeer: (k) => (k === 'ids_lineas_v1' ? null : {
      equipos: { columnas: ['id', 'nuco'], filas: [['A', '1556'], ['B', '0200']] },
      lineas: { columnas: ['id', 'numero'], filas: [['A', '4420000002'], ['B', '4420000001']] },
    }),
  });
  const Repo = new Function('LineasUtil', 'LineasDatos', 'Utilities', read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')(Util, LineasDatos, {});

  // NUCO 1556: tuvo el 4420000001 desde el alta y el 4420000002 desde el 01/03 (el COMENTARIOS "1556" de B no cuenta)
  const eq = Repo.asignacionesDeRegistro('A', 'equipo');
  assert.equal(eq.clave, '1556');
  assert.deepEqual(eq.periodos.map((p) => [p.numero, p.vigente, p.irId]), [['4420000002', true, 'A'], ['4420000001', false, 'B']]);
  assert.equal(eq.periodos[0].usuario, 'ANA');
  assert.equal(eq.periodos[0].origen, 'AppSheet');
  assert.equal(+eq.periodos[1].desde, +d('2025-01-01'));
  assert.equal(eq.periodos[1].motivo, 'Alta del registro');

  // Número 4420000001: estuvo en el 1556 y desde el 02/03 en el 0200, con el motivo capturado en el sistema nuevo
  const ln = Repo.asignacionesDeRegistro('B', 'linea');
  assert.deepEqual(ln.periodos.map((p) => [p.nuco, p.vigente, p.irId]), [['0200', true, 'B'], ['1556', false, 'A']]);
  assert.equal(ln.periodos[0].motivo, 'Cambio de equipo por daño');
  assert.equal(ln.periodos[0].origen, 'Nuevo sistema');
  assert.equal(+ln.periodos[1].hasta, +d('2025-03-01'));

  // La edición pide siempre su comentario (antes, solo al cambiar el número o el NUCO; etapa 3 paso 2), y el historial
  // ofrece el movimiento
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /const motivo = comentarioObligatorio_\(datos, 'qué se corrigió y por qué'\);/);
  // El campo del comentario no es un campo del AppSheet: aplicarReglasEn busca .ln-af-req en cada .ln-af-campo (29-sep)
  // El comentario y el ticket van en otra ventana, al aceptar los cambios (usuario, 4-oct)
  assert.match(read('src/html/js/lineas.html'), /pedirDatos\('Comentario', \$\('#ln-captura-subtitulo', raiz\)\.textContent/);
  assert.doesNotMatch(read('src/html/js/lineas.html'), /id="cap-motivo"/);
  // Una hoja sin las pestañas APP_*: leerFilas no abre una pestaña de la que no se pide ninguna fila
  assert.match(read('src/services/lineas/LineasDatos.gs'), /if \(peticiones\.some\(\(p\) => !p\.filas\.length\)\) \{\s*const leidas = leerFilas\(peticiones\.filter\(\(p\) => p\.filas\.length\)\);/);
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /llamar\('apiLineasAsignaciones', id, vista\)/);
  assert.match(cliente, /equipo: 'Números que ha tenido', linea: 'Equipos en los que ha estado'/);
  // Número / NUCO / IMEI como botón visible que abre la ficha (asignaciones y cambios de línea o equipo)
  assert.match(cliente, /function botonIr\(tipo, id, texto\) \{\s*return '<a href="#" class="ln-ir-chip" data-ln-ir="' \+ tipo/);
  assert.match(cliente, /porNuco && p\.irId \? botonIr\('linea', p\.irId, v\)/);
  assert.match(cliente, /valorCambio\('ANTES'\)\(c\.antes, c\) \+ ' → ' \+ valorCambio\('DESPUES'\)\(c\.despues, c\)/);
  assert.match(cliente, /if \(c === 'IMEI'\)/);
  // Los "Sin línea" se pueden ocultar con el filtro, sin quitarlos de los datos
  assert.match(cliente, /return \(a\.periodos \|\| \[\]\)\.filter\(\(p\) => !ocultarSinAsignar \|\| p\[campo\]\)/);
  assert.doesNotMatch(cliente, /el motivo solo existe si se capturó/);
  // Filtro Movimiento agrupado y en orden fijo, con las asignaciones arriba
  assert.match(cliente, /<optgroup label="Historial de asignaciones">/);
  assert.match(cliente, /\['Documentos', \['Inspección', 'Responsiva', 'PDF firmado', 'PDF regenerado'\]\]/);
});

test('INICIO / FIN PLAN solo se capturan en el alta de la línea; después no se pueden cambiar (29-sep; usuario 4-oct)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    reg + '; return LineasRegistros;')(
    { CATALOGO: { tipos: ['EQUIPO + SIM', 'LINEA'], estatusLinea: ['USO'], estatusEquipo: ['USO'] }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil);
  const ctx = { nuevo: false, nucoRepetido: () => false, telefonoRepetido: () => false };
  const base = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000001', 'INICIO PLAN': '2025-01-01', 'FIN PLAN': '2027-01-01', 'NUMERO SIM': '111' };
  const els = Reg._elementos(base, {}, { correo: 'x@y.z' }, ctx);
  const r = Reg._resolver(els, base, Object.assign({}, base, { 'INICIO PLAN': '2026-09-01', 'FIN PLAN': '2030-01-01', 'NUMERO SIM': '222' }), ctx);
  assert.equal(r.valores['FIN PLAN'], '2027-01-01');
  assert.equal(r.valores['INICIO PLAN'], '2025-01-01');
  assert.equal(r.valores['NUMERO SIM'], '222'); // lo demás sí se corrige
  // En el alta de una línea sí se toman y son obligatorias
  const altaCtx = Object.assign({}, ctx, { nuevo: true, parte: 'LINEA' });
  const alta = Reg._elementos({}, {}, { correo: 'x@y.z' }, altaCtx);
  const ra = Reg._resolver(alta, {}, { 'NUMERO TELEFONO': '4420000009', 'FIN PLAN': '2028-05-01' }, altaCtx);
  assert.equal(ra.valores['FIN PLAN'], '2028-05-01');
  assert.ok(ra.errores.some((e) => /^Inicio es obligatorio/.test(e)));
  // Un SIM BASICO no tiene adendum: no se pide y lo capturado se borra (usuario, 8-oct)
  const rb = Reg._resolver(alta, {}, { 'NUMERO TELEFONO': '4420000009', 'TIPO DE LINEA': 'SIM BASICO', 'FIN PLAN': '2028-05-01' }, altaCtx);
  assert.ok(!rb.errores.some((e) => /^(Inicio|Fin) es obligatorio/.test(e)));
  assert.equal(rb.valores['FIN PLAN'], '');
  // A un equipo sin línea se le puede poner una con sus fechas (es el alta de esa línea)
  const sinLinea = Reg._elementos({ TIPO: 'EQUIPO' }, {}, { correo: 'x@y.z' }, ctx);
  assert.equal(sinLinea.filter((e) => e.columna === 'FIN PLAN')[0].editable, 'SIEMPRE');
});

test('Notificaciones: adendum por vencer una semana antes, sin las ya vencidas ni SIM básicos', () => {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Ntf = new Function('LineasUtil', 'LineasDatos', 'Utilities', read('src/services/lineas/LineasNotificaciones.gs') + '; return LineasNotificaciones;')(
    LineasUtil, { ZONA_APP: 'America/Mexico_City' },
    { formatDate: (d) => d.toISOString().slice(0, 10) });
  const d = (s) => new Date(s + 'T12:00:00Z');
  const fila = (id, tipo, estatus, fin, numero) => ({ ID: id, TIPO: tipo, 'ESTATUS LINEA': estatus, 'FIN PLAN': fin, 'NUMERO TELEFONO': numero || '44200000' + id.padStart(2, '0'), NUCO: 7 });
  const filas = [
    fila('1', 'EQUIPO + SIM', 'USO', d('2026-10-06')),          // vence en 7 días → sí
    fila('2', 'LINEA', 'RESGUARDO', d('2026-09-30')),           // mañana → sí
    fila('3', 'EQUIPO + SIM', 'USO', d('2026-10-07')),          // en 8 días → todavía no
    fila('4', 'EQUIPO + SIM', 'USO', d('2026-08-01')),          // ya vencida antes de activar avisos → no
    fila('5', 'EQUIPO + SIM BASICO', 'USO', d('2026-10-01')),   // SIM básico: sin adendum → no
    fila('6', 'LINEA', 'CANCELADA', d('2026-10-01')),           // cancelada → no
    fila('7', 'EQUIPO', 'SIN LINEA', d('2026-10-01'), 'NO APLICA'), // sin línea → no
    fila('8', 'MODEM', 'USO', '00/01/1900'),                    // fecha basura → no
    fila('9', 'LINEA', 'USO', '2026-10-02'),                    // fecha como texto → sí
  ];
  const p = Ntf._pendientes(filas, '2026-09-29', '2026-09-29');
  assert.deepEqual(p.map((x) => [x.refId, x.dias]), [['1', 7], ['2', 1], ['9', 3]]);
  assert.equal(p[0].clave, 'ADENDUM|1|2026-10-06');
  assert.equal(p[0].nuco, '0007');
  // Vencida después de activar los avisos (nadie abrió el sistema esa semana): sí se avisa
  assert.deepEqual(Ntf._pendientes([fila('4', 'LINEA', 'USO', d('2026-10-01'))], '2026-10-03', '2026-09-29').map((x) => x.dias), [-2]);
  assert.equal(Ntf.DIAS_AVISO, 7);
  // Enganches: API, alta que pide revisar, campana en el shell y vista
  assert.match(read('src/ClientApi.gs'), /function apiLineasNotificaciones\(token, limite\)/);
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /LineasNotificaciones\.revisarPronto\(\);/);
  assert.match(read('src/html/Index.html'), /include\('html\/notificaciones'\)/);
  assert.match(read('src/html/js/app.html'), /vista: 'notificaciones'[^\n]*plantilla: 'tpl-notificaciones', init: \(\) => Notificaciones\.initVista\(\)/);
  assert.match(read('src/html/js/lineas.html'), /irARegistro: irARegistro/);
});

test('Acciones masivas de equipos: reasignar deja en USO; la línea solo pasa a USO si estaba DISPONIBLE', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const hoja = [
    { _fila: 2, ID: 'a', NUCO: '0001', TIPO: 'EQUIPO + SIM', RESPONSABLE: 'ANA', 'ESTATUS EQUIPO': 'USO', 'ESTATUS LINEA': 'USO', 'NUMERO TELEFONO': '4420000001', 'RESPONSABLE USA EL EQUIPO': 'SI' },
    { _fila: 3, ID: 'b', NUCO: '0002', TIPO: 'EQUIPO', RESPONSABLE: 'LUIS', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'SIN LINEA', 'NUMERO TELEFONO': 'NO APLICA' },
    { _fila: 4, ID: 'c', NUCO: '', TIPO: 'LINEA', RESPONSABLE: 'EVA', 'ESTATUS LINEA': 'USO', 'NUMERO TELEFONO': '4420000003' },
    { _fila: 5, ID: 'd', NUCO: '0004', TIPO: 'EQUIPO + SIM', RESPONSABLE: '', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'DISPONIBLE', 'NUMERO TELEFONO': '4420000004' },
  ];
  const guardados = [];
  const movimientos = [];
  const Repo = {
    CATALOGO: { tipos: ['EQUIPO', 'EQUIPO + SIM', 'LINEA'], estatusLinea: ['USO', 'SIN LINEA'], estatusEquipo: ['USO', 'RESGUARDO', 'CANCELADO'] },
    TAB: { LINEAS: 'LINEAS TELEFONICAS' }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' },
    catalogos: () => ({ departamentos: ['VENTAS', 'SISTEMAS'] }),
    guardarCambiosRegistro: (f, cambios) => {
      guardados.push([f.ID, cambios]);
      const campos = Object.keys(cambios).filter((c) => String(f[c] || '') !== String(cambios[c])).map((c) => ({ campo: c, antes: f[c] || '', despues: cambios[c] }));
      return { idsCambios: campos.map((_, i) => f.ID + i), idReasignacion: null, campos: campos };
    },
    registrarMovimiento: (tipo, datos, u, ahora, extra) => movimientos.push([tipo, datos.motivo, extra.refs]),
    indice: () => ({}), refrescarIndice: () => ({}),
  };
  const Datos = { leerTabla: () => hoja, conCandado: (fn) => fn(), idsDeFila: (f) => [f.ID] };
  const Acciones = cargarAcciones(Repo, Datos, LineasUtil);
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasDatos', 'LineasAcciones',
    reg + '; return LineasRegistros;')(Repo, { getScriptCache: () => ({ get: () => '', put: () => {} }) }, { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil, Datos, Acciones);
  const u = { correo: 'x@y.z', nombre: 'X' };

  // "c" no es equipo → se omite sin error; la línea no se toca
  const r = Reg.accionMasiva('REASIGNAR', ['a', 'c'], { valores: { RESPONSABLE: 'MARIA', _MOTIVO: 'CIERRE DE OFICINA' } }, u);
  assert.deepEqual(r.hechos.map((h) => h.id), ['a']);
  assert.deepEqual(r.omitidos.map((o) => o.id), ['c']);
  assert.ok(guardados.every(([, c]) => !('ESTATUS LINEA' in c) && !('NUMERO TELEFONO' in c)));
  // Movimiento con nombre (etapa 3, paso 2): REASIGNACION, ya no EDICION
  // El comentario va solo: la acción ya va en su columna (paso 3)
  assert.deepEqual(movimientos[0], ['REASIGNACION', 'CIERRE DE OFICINA', ['a']]);
  // "Mandar a resguardo" ya no es acción masiva genérica: tiene su propio flujo (LineasResguardos)
  assert.throws(() => Reg.accionMasiva('RESGUARDO', ['a', 'b'], { valores: { _MOTIVO: 'CIERRE DE OFICINA' } }, u), /desconocida/);

  // Reasignar: responsable obligatorio; "quien usa" ya no copia al responsable (solo se guarda si es otra persona, §3.7)
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { _MOTIVO: 'CAMBIO DE AREA' } }, u), /RESPONSABLE es obligatorio/);
  guardados.length = 0;
  // Desde cualquier estatus (sin regla de estatus, usuario 4-oct): "b" está en RESGUARDO y también se reasigna; la
  // línea DISPONIBLE de "d" pasa a USO con su equipo (plan §5.3)
  const r2 = Reg.accionMasiva('REASIGNAR', ['a', 'b', 'd'], { valores: { RESPONSABLE: 'PEDRO PEREZ', 'NO EMPLEADO': '123', PUESTO: 'GERENTE', _MOTIVO: 'CAMBIO DE AREA' } }, u);
  assert.deepEqual(guardados, [
    ['a', { 'ESTATUS EQUIPO': 'USO', 'NO EMPLEADO': '123', RESPONSABLE: 'PEDRO PEREZ', PUESTO: 'GERENTE' }],
    ['b', { 'ESTATUS EQUIPO': 'USO', 'NO EMPLEADO': '123', RESPONSABLE: 'PEDRO PEREZ', PUESTO: 'GERENTE' }],
    ['d', { 'ESTATUS EQUIPO': 'USO', 'NO EMPLEADO': '123', RESPONSABLE: 'PEDRO PEREZ', PUESTO: 'GERENTE', 'ESTATUS LINEA': 'USO' }]]);
  assert.deepEqual(r2.omitidos, []);
  // Entregar ya no existe (se quitó con «¿Qué pasó?», usuario 4-oct)
  assert.throws(() => Reg.accionMasiva('ENTREGAR', ['b'], { valores: { RESPONSABLE: 'PEDRO PEREZ', _MOTIVO: 'ENTREGA' } }, u), /desconocida/);
  // El estatus no se elige al reasignar: siempre USO (D5.1, 3-oct; antes RESGUARDO), aunque llegue otro
  assert.ok(!Reg._elementosMasivos('REASIGNAR', {}, u).some((e) => e.columna === 'ESTATUS EQUIPO'));
  guardados.length = 0;
  Reg.accionMasiva('REASIGNAR', ['a'], { valores: { RESPONSABLE: 'PEDRO PEREZ', 'ESTATUS EQUIPO': 'RESGUARDO', _MOTIVO: 'CAMBIO DE AREA' } }, u);
  assert.ok(guardados.every(([, c]) => c['ESTATUS EQUIPO'] === 'USO'));

  // Con uno solo o sin motivo, error
  // Desde el 30-sep se puede reasignar un solo equipo (barra de selección tipo Drive); sin ninguno, error
  assert.throws(() => Reg.accionMasiva('REASIGNAR', [], { valores: { RESPONSABLE: 'ANA', _MOTIVO: 'CIERRE DE OFICINA' } }, u), /al menos un equipo/);
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { RESPONSABLE: 'ANA' } }, u), /COMENTARIO/);
  // "Cancelar equipos" ya no existe (30-sep): los equipos no se cancelan, solo las líneas
  guardados.length = 0;
  assert.throws(() => Reg.accionMasiva('CANCELAR', ['a', 'b'], { valores: { _MOTIVO: 'EQUIPOS OBSOLETOS' } }, u));
  assert.equal(guardados.length, 0);
  assert.doesNotMatch(read('src/html/js/lineas.html'), /clave: 'CANCELAR'/);

  // Cliente (estilo Drive, 30-sep): las acciones salen de accionesSeleccionDe(modulo); Reasignar ya desde 1
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /accionesSeleccion: accionesSeleccionDe\(modulo\),/);
  // Reasignar abre directo la responsiva (usuario, 4-oct); el formulario masivo se queda para cuando regresen las masivas
  assert.match(cliente, /alHacer: \(f\) => abrirReasignar\(f\[0\]\)/);
  assert.match(cliente, /clave: 'RESGUARDO', texto: 'Mandar a resguardo', icono: 'archive', minimo: 1, propia: true/);
  assert.match(cliente, /llamar\('apiLineasAccionMasiva', accion\.clave, ids, datos\)/);
  assert.match(read('src/html/js/componentes/datatable.html'), /b\.hidden = nSel < \(\(accionesSeleccion\[Number\(b\.dataset\.accionSel\)\] \|\| \{\}\)\.minimo \|\| 1\)/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasAccionMasiva\(token, accion, ids, datos\)/);
});

test('Reasignar uno por uno: cada equipo con su responsable; los que no cambian no se tocan', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const hoja = [
    { _fila: 2, ID: 'a', NUCO: '0001', TIPO: 'EQUIPO', RESPONSABLE: 'ANA', PUESTO: 'AUXILIAR', 'ESTATUS EQUIPO': 'USO', 'RESPONSABLE USA EL EQUIPO': 'SI' },
    { _fila: 3, ID: 'b', NUCO: '0002', TIPO: 'EQUIPO', RESPONSABLE: 'LUIS', PUESTO: 'GERENTE', 'ESTATUS EQUIPO': 'USO' },
    { _fila: 4, ID: 'c', NUCO: '0003', TIPO: 'EQUIPO', RESPONSABLE: 'EVA', 'ESTATUS EQUIPO': 'USO' },
  ];
  const guardados = [];
  const Repo = {
    CATALOGO: { tipos: ['EQUIPO'], estatusLinea: ['USO'], estatusEquipo: ['USO', 'RESGUARDO'] },
    TAB: { LINEAS: 'LINEAS TELEFONICAS' }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR' },
    catalogos: () => ({ departamentos: ['VENTAS'] }),
    guardarCambiosRegistro: (f, cambios) => {
      guardados.push([f.ID, cambios]);
      return { idsCambios: [], idReasignacion: null, campos: Object.keys(cambios).filter((c) => String(f[c] || '') !== String(cambios[c])).map((c) => ({ campo: c })) };
    },
    registrarMovimiento: () => {}, indice: () => ({}), refrescarIndice: () => ({}),
  };
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasDatos', 'LineasAcciones', reg + '; return LineasRegistros;')(
    Repo, { getScriptCache: () => ({ get: () => '', put: () => {} }) }, { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil,
    { leerTabla: () => hoja, conCandado: (fn) => fn(), idsDeFila: (f) => [f.ID] }, cargarAcciones(Repo));
  const u = { correo: 'x@y.z', nombre: 'X' };
  assert.deepEqual(Reg.formularioMasivo('REASIGNAR', u).columnasResponsable, ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO']);

  // "a" cambia de responsable, "b" solo de puesto, "c" no viene (sin cambios); no pide el responsable común
  const r = Reg.accionMasiva('REASIGNAR', ['a', 'b', 'c'], {
    modo: 'INDIVIDUAL', valores: { _MOTIVO: 'AJUSTE DE PLANTILLA' },
    porEquipo: { a: { RESPONSABLE: 'PEDRO', PUESTO: 'SUPERVISOR' }, b: { RESPONSABLE: 'LUIS', PUESTO: 'DIRECTOR' } },
  }, u);
  assert.deepEqual(guardados, [
    ['a', { 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'PEDRO', PUESTO: 'SUPERVISOR' }],
    ['b', { 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'LUIS', PUESTO: 'DIRECTOR' }],
  ]);
  assert.deepEqual(r.omitidos.map((o) => [o.id, o.motivo]), [['c', 'Sin cambios']]);
  // Validaciones por equipo (mayúsculas) con el NUCO en el mensaje; sin ningún cambio, error
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { modo: 'INDIVIDUAL', valores: { _MOTIVO: 'AJUSTE' }, porEquipo: { a: { RESPONSABLE: 'pedro', _ETIQUETA: 'NUCO 0001' } } }, u), /NUCO 0001 · RESPONSABLE: ESCRIBIR EN MAYUSCULAS/);
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { modo: 'INDIVIDUAL', valores: { _MOTIVO: 'AJUSTE' }, porEquipo: {} }, u), /al menos un equipo/);

  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /data-modo="INDIVIDUAL"[^>]*>' \+ icono\('list'\) \+ ' Uno por uno/);
  assert.match(cliente, /const columnaFila = \(id, c\) => 'FILA\|' \+ id \+ '\|' \+ c;/);
});

test('Panorama: estatus al cierre de cada mes reconstruido hacia atrás con la bitácora (también con el ID viejo)', () => {
  const P = new Function('LineasDatos', 'LineasRepo', 'LineasUtil', 'Utilities',
    read('src/services/lineas/LineasPanorama.gs') + '; return LineasPanorama;')(
    { ZONA_APP: 'America/Mexico_City' }, {}, {},
    { parseDate: (s) => new Date(s.replace(' ', 'T') + '-06:00'), formatDate: () => '' });
  assert.deepEqual(P._mesesEntre('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02']);
  const t = (s) => new Date(s + 'T12:00:00-06:00').getTime();
  const meses = ['2026-01', '2026-02', '2026-03'];
  const regs = [
    // Hoy VENDIDO; en feb pasó de USO a RESGUARDO y en mar de RESGUARDO a VENDIDO (bitácora con el ID viejo "x1")
    { ids: ['LIN-1', 'x1'], actual: 'VENDIDO', alta: null },
    // Dado de alta en marzo: no cuenta en enero ni febrero
    { ids: ['LIN-2'], actual: 'USO', alta: t('2026-03-05') },
    // Sin cambios: el mismo estatus hacia atrás
    { ids: ['LIN-3'], actual: 'USO', alta: null },
  ];
  const eventos = { x1: [{ t: t('2026-02-10'), antes: 'USO' }, { t: t('2026-03-02'), antes: 'RESGUARDO' }] };
  const h = P._historico(regs, eventos, meses, t('2026-03-20'));
  assert.deepEqual(h.USO, [2, 1, 2]);
  assert.deepEqual(h.RESGUARDO, [0, 1, 0]);
  assert.deepEqual(h.VENDIDO, [0, 0, 1]);

  // Panorama nuevo (30-sep): el estatus de cada registro por mes, para calcular la portada del mes que se elija
  const R = P._registros({
    lineas: regs.map((r, i) => Object.assign({}, r, { cuenta: ['AT&T', 'TELCEL GPH', ''][i], basico: i === 2, depto: i ? 'POST VENTA' : 'DISPONIBLE', costo: 299, fin: '2027-01-31' })),
    equipos: [Object.assign({}, regs[0], { depto: 'DISPONIBLE' })],
  }, eventos, meses);
  // Va en columnas y el estatus por mes en corridas: un número si nunca cambió, o [código, meses, código, meses…]
  const corridas = (s) => {
    if (typeof s === 'number') return meses.map(() => s);
    const out = [];
    for (let i = 0; i < s.length; i += 2) for (let j = 0; j < s[i + 1]; j++) out.push(s[i]);
    return out;
  };
  const estados = (s) => corridas(s).map((k) => (k < 0 ? null : R.dic[k]));
  assert.deepEqual(estados(R.lineas.s[0]), ['USO', 'RESGUARDO', 'VENDIDO']);
  assert.deepEqual(estados(R.lineas.s[1]), [null, null, 'USO']); // todavía no existía
  assert.equal(typeof R.lineas.s[2], 'number'); // sin cambios: un solo número
  assert.deepEqual([R.lineas.b[2], R.cuentas[R.lineas.c[2]], R.deps[R.lineas.d[1]], R.fechas[R.lineas.f[0]]], [1, '', 'POST VENTA', '2027-01-31']);
  assert.deepEqual(estados(R.equipos.s[0]), ['USO', 'RESGUARDO', 'VENDIDO']);
  // La interfaz lo desempaca a un objeto por registro y guarda la última copia para pintar al instante
  const cli = read('src/html/js/lineas.html');
  assert.match(cli, /function expandirRegistros\(R\)/);
  assert.match(cli, /registros: expandirRegistros\(Object\.assign\(\{ mesesTotal: r\.meses\.length \}, r\.registros\)\)/);
  assert.match(cli, /const copia = !forzar && !est\.datos \? leerCopiaPanorama\(\) : null;/);
  // La bitácora se lee solo en sus 4 columnas
  assert.match(read('src/services/lineas/LineasPanorama.gs'), /const COLS_CAMBIOS = \['CAMPO', 'FECHA ACTUALIZACION', 'ID_LINEA', 'ANTES'\];/);
  // Cuenta: AT&T factura todo a FRO; Telcel se separa por razón social
  assert.equal(P._cuentaDe('AT&T', 'GPH SERVICIOS CONDOMINALES'), 'AT&T');
  assert.equal(P._cuentaDe('TELCEL', 'GPH SERVICIOS CONDOMINALES'), 'TELCEL GPH');
  assert.equal(P._cuentaDe('Telcel', 'FRACCIONADORA LA ROMITA SA DE CV'), 'TELCEL FRO');
  assert.equal(P._cuentaDe('', ''), '');
  // Portada: líneas activas = no canceladas ni sin línea; RESGUARDO cuenta como disponible (mapeo M6); SIM básicos aparte
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /'DISPONIBLE': 'disponible', 'RESGUARDO': 'disponible',/);
  assert.match(lineas, /if \(g === 'cancelada' \|\| g === 'sin'\) return;/);
  assert.match(lineas, /if \(l\.b\) \{ r\.basicos\+\+; return; \} \/\/ los SIM básicos no tienen adendum/);
  assert.match(read('src/html/views/lineas/lineas-panorama.html'), /<select id="lnp-mes" disabled>/);
  // Menú: Panorama primero; Reactivación se retiró con su pestaña (30-sep)
  const app = read('src/html/js/app.html');
  assert.match(app, /\{ vista: 'panorama-lineas', etiqueta: 'Panorama', icono: 'layout-dashboard', requiere: 'panorama-lineas'[^\n]*\},\s*\{ vista: 'lineas-telefonicas'/);
  assert.doesNotMatch(app, /'reactivacion-lineas'/);
  assert.match(app, /plantilla: 'tpl-lineas-panorama', init: \(\) => Lineas\.initPanorama\(\)/);
  assert.match(read('src/html/Index.html'), /include\('html\/views\/lineas\/lineas-panorama'\)/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasPanorama\(token, forzar\)/);
});

test('Vista rápida en Líneas Telefónicas, responsiva editable y calificación en vivo de la inspección', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const resp = captura.slice(captura.indexOf('function formularioResponsiva_'), captura.indexOf('function ocultarSecretos_'));
  // Fijos: ID, ID LINEA, NUCO, el equipo (modelo e IMEI) y NOMBRE CI (usuario, 4-oct); el responsable se puede corregir
  const fijos = [...resp.matchAll(/ro\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(fijos, ['ID', 'ID LINEA', 'NUCO', 'MODELO', 'IMEI', 'NOMBRE CI']);
  assert.match(resp, /ed\('RESPONSABLE', 'Nombre', 'listaAbierta', persona\('RESPONSABLE'\), \{ requerido: 'SIEMPRE', sugerencias: 'PERSONAS', autollenar: autoResponsable, llenarVacios: true \}\)/);
  assert.match(resp, /ed\('ACCESORIOS', 'Accesorios entregados', 'multi'/);
  const cliente = read('src/html/js/lineas.html');
  // Sin columna de Acciones (30-sep): clic = vista rápida, doble clic = ficha; la vista rápida trae "Abrir ficha completa"
  assert.doesNotMatch(cliente, /titulo: 'Vista rápida', alHacer/);
  assert.match(cliente, /data-vr-ficha>' \+ icono\('maximize-2'\) \+ ' Abrir ficha completa/);
  assert.match(cliente, /function vistaRapida\(tipo, r, opciones\) \{/);
  assert.match(cliente, /if \(captura\.tipo === 'INSPECCION'\) pintarCalificacionVivo\(\);/);
  assert.match(read('src/html/views/lineas/lineas-telefonicas.html'), /id="ln-calif-vivo" role="status" aria-live="polite" hidden/);
});

test('Navegación de la ficha: migas por lo que es cada nivel, pestaña recordada, clic = vista rápida, fotos en NUCOS y tema marcado', () => {
  const cliente = read('src/html/js/lineas.html');
  // La línea se nombra por su número (antes decía el NUCO de su equipo) y la inspección por su fecha
  assert.match(cliente, /pila\[pila\.length - 1\]\.etiqueta = 'Línea ' \+ \(l\.numero \|\| '—'\);/);
  assert.doesNotMatch(cliente, /etiqueta = e \? 'NUCO ' \+ \(e\.nuco \|\| '—'\) : 'Línea '/);
  assert.match(cliente, /pila\[pila\.length - 1\]\.etiqueta = 'Inspección' \+ \(fecha\(i\.fecha\)/);
  assert.match(cliente, /'<span class="ln-miga-actual" aria-current="page">'/);
  assert.match(cliente, /Volver a ' \+ esc\(etiquetaMiga\(anterior\)\)/);
  // Pestaña recordada al regresar
  assert.match(cliente, /if \(pila\.length\) pila\[pila\.length - 1\]\.pestana = nombre;/);
  assert.match(cliente, /const guardada = \(pila\[pila\.length - 1\] \|\| \{\}\)\.pestana;/);
  // Estilo Drive (30-sep): el clic selecciona; doble clic = ficha completa; con el dedo, tocar = vista rápida
  assert.match(cliente, /alAbrirFila: \(r\) => abrir\(cfg\.detalle, r\.id\),/);
  assert.match(cliente, /alTocarFila: \(r\) => vistaRapida\(cfg\.detalle, r\),/);
  assert.doesNotMatch(cliente, /clicPendiente/);
  // Fotos también en inspecciones de NUCOS y sin la advertencia
  assert.doesNotMatch(cliente, /Esta inspección está en la carpeta NUCOS de Drive/);
  assert.match(cliente, /\(r\.puedeOperar \? '<div class="ln-fotos-despues">/);
  const tel = read('src/services/TelefoniaService.gs');
  assert.match(tel, /const externa = \/\^drive_\/\.test\(String\(id\)\) \? inspeccionNucos_\(String\(id\)\.slice\(6\)\) : null;/);
  assert.match(tel, /function carpetaFotosExtra_\(id\)/);
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /'ORIGEN': externa \? 'NUCOS_FOTOS'/);
  // Tema: el botón del modo actual se marca también al entrar con la sesión guardada
  const app = read('src/html/js/app.html');
  assert.match(app, /function marcarTemaActual\(\)/);
  assert.match(app, /marcarTemaActual\(\); \/\/ entrar con la sesión guardada/);
});

test('Tablas con modo selección, gestos Atrás/Adelante, vista rápida conectada y "Última …" más rápida', () => {
  const dt = read('src/html/js/componentes/datatable.html');
  // Modo selección opcional (no cambia las tablas que no lo piden)
  assert.match(dt, /\$\{cfg\.seleccionable && cfg\.modoSeleccion && !cfg\.seleccionDrive \? `<button type="button" class="secondary dt-btn-modo-seleccion"/);
  assert.match(dt, /\.dt\.dt-con-modo-seleccion:not\(\.dt-modo-seleccion\) \.dt-col-check \{ display: none; \}/);
  assert.match(dt, /if \(!st\.modoSeleccion && \(ev\.ctrlKey \|\| ev\.metaKey\)\) \{ setModoSeleccion\(true\);/);
  assert.match(dt, /tbody\.addEventListener\('pointermove', \(ev\) => \{\s*if \(!arrastre\.inicio/);
  assert.match(dt, /setModoSeleccion, enModoSeleccion: \(\) => st\.modoSeleccion,/);
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /seleccionable: true, modoSeleccion: true, seleccionDrive: true, accionesDeTabla: false,/);
  // Historial del navegador
  const hist = read('src/html/historial-navegador.html');
  assert.match(hist, /google\.script\.history/);
  assert.match(hist, /api\(\)\.setChangeHandler\(alCambiar\)/);
  assert.match(read('src/html/js/app.html'), /if \(typeof HistorialApp !== 'undefined'\) HistorialApp\.alNavegar\(vista, etiqueta\);/);
  assert.match(read('src/html/Index.html'), /include\('html\/historial-navegador'\)/);
  assert.match(lineas, /if \(!sinHistorial\) pasoHistorial\(\);/);
  assert.match(lineas, /HistorialApp\.registrar\('lineas-telefonicas'/);
  // Vista rápida conectada: equipo ↔ línea
  assert.match(lineas, /if \(b\.dataset\.vrIr === 'linea' && suLinea\) vistaRapida\('linea', suLinea, opciones\);/);
  // "Última …": el servidor solo recorre la rama del tipo
  assert.match(read('src/services/lineas/LineasArchivos.gs'), /function archivosNuco\(nuco, soloTipo\)/);
  assert.match(read('src/services/TelefoniaService.gs'), /const r = carpetaNucoDe_\(id, sesion, tipo\);/);
});

test('IDs estandarizados (LIN-…): la ficha encuentra lo que las demás pestañas citan con el ID del AppSheet', () => {
  const normCol = (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: normCol }, {});
  const d = (s) => new Date(s + 'T12:00:00');
  // Como quedó la hoja de pruebas el 29-sep: el padre ya migró y los hijos siguen con el ID viejo
  const hojas = {
    'LINEAS TELEFONICAS': [
      { ID: 'LIN-00000000AAAAAA', 'ID APPSHEET': 'a1b2c3d4', NUCO: '0234', 'NUMERO TELEFONO': '4420000009', TIPO: 'EQUIPO + SIM', 'FECHA REGISTRO': d('2025-01-01') },
      { ID: 'LIN-00000001BBBBBB', 'ID APPSHEET': 'DG001', NUCO: '0900', TIPO: 'EQUIPO + SIM', 'ESTATUS LINEA': 'USO' },
    ],
    'CAMBIOS LINEAS TELEFONICAS': [
      { ID: 'CLI-00000000CCCCCC', 'ID APPSHEET': 'e1', ID_LINEA: 'a1b2c3d4', NUCO: '0234', CAMPO: 'ESTATUS EQUIPO', ANTES: 'RESGUARDO', DESPUES: 'USO', 'FECHA ACTUALIZACION': d('2025-04-22') },
      { ID: 'CLI-00000001DDDDDD', 'ID APPSHEET': 'e2', ID_LINEA: 'a1b2c3d4', NUCO: '0234', CAMPO: 'COMENTARIOS', ANTES: '', DESPUES: 'x', 'FECHA ACTUALIZACION': d('2025-04-23') },
    ],
    HISTORIAL_REASIGNACIONES: [{ ID: 'HIS-00000000EEEEEE', 'ID Historial': 'h1', 'ID Linea': 'a1b2c3d4', 'Fecha de Reasignacion': d('2025-05-01'), 'Responsable Entrante': 'ANA' }],
    'BITACORA DE DESECHO': [],
    'INSPECCIONES LINEAS': [{ ID: 'ILI-00000000FFFFFF', 'ID APPSHEET': '97eb2ad7', 'ID LINEA': 'a1b2c3d4', NUCO: '0234', 'FECHA DE REGISTRO': d('2025-06-01') }],
    'RESPONSIVAS LINEAS': [],
    APP_EVIDENCIAS: [{ ID: 'a6d54e23', TIPO: 'INSPECCION', ORIGEN: 'APPSHEET', ID_REGISTRO: '97eb2ad7', ID_LINEA: 'a1b2c3d4', CARPETA_ID: 'carp1', PDFS_JSON: '[{"id":"pdf1"}]' }],
    // Un movimiento del sistema nuevo registrado antes de migrar: oculta su fila de la bitácora por el ID viejo (e2)
    APP_MOVIMIENTOS: [{ ID: 'd45f50e1', TIPO: 'EDICION', REFS: ',a1b2c3d4,', MOTIVO: 'Prueba', DETALLE_JSON: JSON.stringify({ idsCambios: ['e2'], cambios: [{ campo: 'COMENTARIOS', antes: '', despues: 'x' }] }) }],
    'REACTIVACION DE LINEAS': [],
  };
  const LineasDatos = datosDePrueba_(hojas);
  const Chk = { puntos: () => [] };
  const Repo = new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')(
    Util, LineasDatos, Chk, { formatDate: (f) => f.toISOString().slice(0, 10) });

  // El ID viejo lleva al vigente, y el vigente a los dos
  assert.equal(Repo.idActual('a1b2c3d4'), 'LIN-00000000AAAAAA');
  assert.deepEqual(Repo.idsDeRegistro('LIN-00000000AAAAAA'), ['LIN-00000000AAAAAA', 'a1b2c3d4']);
  assert.equal(Repo.leerRegistroPorId('a1b2c3d4').NUCO, '0234');

  // Historial con el ID nuevo: bitácora, reasignación, inspección con su PDF; el cambio del sistema nuevo no se repite
  const h = Repo.historialDeRegistro('LIN-00000000AAAAAA', true).eventos;
  // Un renglón por acción (paso 3): la edición del sistema nuevo trae su cambio y la de la bitácora ya no sale
  assert.deepEqual(h.map((e) => e.movimiento).sort(), ['Cambio de estatus', 'Edición', 'Inspección', 'Reasignación']);
  assert.equal(h.filter((e) => e.cambios.some((c) => c.campo === 'COMENTARIOS')).length, 1);
  const insp = h.filter((e) => e.movimiento === 'Inspección')[0];
  assert.equal(insp.refId, 'ILI-00000000FFFFFF');
  assert.equal(insp.pdfId, 'pdf1');
  // La inspección apunta a la línea con su ID vigente, no con el del AppSheet
  assert.equal(Repo.evidenciasDeRegistro('LIN-00000000AAAAAA').inspecciones[0].registroId, 'LIN-00000000AAAAAA');

  // Personal de DG: la fórmula lo reconoce por el ID del AppSheet (DG001), aunque el ID ya sea LIN-…
  assert.equal(Repo.convertirRegistro(hojas['LINEAS TELEFONICAS'][1]).equipo.legado.estatusGeneral, 'PERSONAL DG');

  // Lo nuevo nace con el prefijo de su hoja; la bitácora lleva el mismo ID en ID e ID_CAMBIO
  const datos = read('src/services/lineas/LineasDatos.gs');
  assert.match(datos, /if \(tieneId && !o\['ID'\]\) o\['ID'\] = nuevoId\(nombre\);/);
  assert.match(datos, /return Ids\.nuevo\(Entidades\.prefijo\(nombre\)\);/);
  // Los encabezados en blanco de CAMBIOS se ubican por la columna vecina, no por posición
  assert.match(datos, /'CAMBIOS LINEAS TELEFONICAS': \[\{ vecina: 'ID_LINEA', lado: -1, nombre: 'ID_CAMBIO' \}, \{ vecina: 'ID_LINEA', lado: 1, nombre: 'NUCO' \}\]/);
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /bitacora\.forEach\(\(b\) => \{ b\['ID_CAMBIO'\] = b\['ID'\]; \}\);/);
  assert.doesNotMatch(read('src/services/lineas/LineasRegistros.gs') + read('src/services/lineas/LineasCaptura.gs') + read('src/services/lineas/LineasNotificaciones.gs'), /\['ID'\]: LineasDatos\.nuevoIdCorto\(\)|'ID': LineasDatos\.nuevoIdCorto\(\)|const id = LineasDatos\.nuevoIdCorto\(\)/);
  assert.match(read('src/config/Entidades.gs'), /'APP_NOTIFICACIONES': \{ prefijo: 'NTF'/);
});

test('Segunda corrida de IDs (30-sep): ID nuevo, el LIN- de ayer en ID ANTERIOR y el del AppSheet en ID APPSHEET', () => {
  const normCol = (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: normCol }, {});
  const d = (s) => new Date(s + 'T12:00:00');
  // Como quedó la hoja de pruebas el 30-sep en la noche: los hijos citan con el ID del AppSheet o con el de ayer
  const hojas = {
    'LINEAS TELEFONICAS': [
      { ID: 'LIN-000000006SRC6J', 'ID ANTERIOR': 'LIN-000000WRXDPR1F', 'ID APPSHEET': 'a1b2c3d4', NUCO: '0234', TIPO: 'EQUIPO + SIM', 'FECHA REGISTRO': d('2025-01-01') },
      // Alta del sistema nuevo del 29-sep: nunca tuvo ID del AppSheet
      { ID: 'LIN-00000001EPD2BY', 'ID ANTERIOR': 'LIN-00000123K4H0WE', 'ID APPSHEET': '', NUCO: '0439', TIPO: 'EQUIPO' },
      { ID: 'LIN-00000002ZZZZZZ', 'ID ANTERIOR': 'LIN-00000002YYYYYY', 'ID APPSHEET': 'DG001', NUCO: '0900', TIPO: 'EQUIPO + SIM', 'ESTATUS LINEA': 'USO' },
    ],
    'CAMBIOS LINEAS TELEFONICAS': [],
    HISTORIAL_REASIGNACIONES: [], 'BITACORA DE DESECHO': [], 'REACTIVACION DE LINEAS': [],
    'INSPECCIONES LINEAS': [
      { ID: 'ILI-000000008P2V9H', 'ID ANTERIOR': 'ILI-00000000T0DCX2', 'ID APPSHEET': '97eb2ad7', 'ID LINEA': 'a1b2c3d4', NUCO: '0234', 'FECHA DE REGISTRO': d('2025-06-01') },
      // Capturada en el sistema el 30-sep en la mañana: cita a la línea con el LIN- de ayer
      { ID: 'ILI-00000001DMY45Y', 'ID ANTERIOR': 'ILI-66A6A2KYHQ9TKB', 'ID APPSHEET': '', 'ID LINEA': 'LIN-000000WRXDPR1F', NUCO: '0234', 'FECHA DE REGISTRO': d('2026-09-30') },
    ],
    'RESPONSIVAS LINEAS': [],
    APP_EVIDENCIAS: [{ ID: 'EVI-66A6HZFFKCYZ89', TIPO: 'INSPECCION', ORIGEN: 'SISTEMA', ID_REGISTRO: 'ILI-66A6A2KYHQ9TKB', ID_LINEA: 'LIN-000000WRXDPR1F', PDFS_JSON: '[{"id":"pdf2"}]' }],
    APP_MOVIMIENTOS: [{ ID: 'm1', TIPO: 'ALTA', REFS: ',LIN-00000123K4H0WE,', MOTIVO: 'Alta de registro', DETALLE_JSON: '{}' }],
  };
  const LineasDatos = datosDePrueba_(hojas);
  const Repo = new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')(
    Util, LineasDatos, { puntos: () => [] }, { formatDate: (f) => f.toISOString().slice(0, 10) });

  // Cualquiera de los tres IDs lleva al vigente, y el vigente a los tres
  assert.equal(Repo.idActual('a1b2c3d4'), 'LIN-000000006SRC6J');
  assert.equal(Repo.idActual('LIN-000000WRXDPR1F'), 'LIN-000000006SRC6J');
  assert.deepEqual(Repo.idsDeRegistro('LIN-000000006SRC6J'), ['LIN-000000006SRC6J', 'LIN-000000WRXDPR1F', 'a1b2c3d4']);
  assert.deepEqual(Repo.idsDeRegistro('LIN-00000123K4H0WE'), ['LIN-00000001EPD2BY', 'LIN-00000123K4H0WE']);
  assert.equal(Repo.leerRegistroPorId('LIN-000000WRXDPR1F').NUCO, '0234');

  // Las dos inspecciones aparecen: la del AppSheet y la del sistema (con su PDF, citado con el ILI- de ayer)
  const insp = Repo.evidenciasDeRegistro('LIN-000000006SRC6J').inspecciones;
  assert.equal(insp.length, 2);
  assert.ok(insp.every((i) => i.registroId === 'LIN-000000006SRC6J'));
  // El alta del 29-sep sigue en el historial aunque su REFS tenga el LIN- de ayer
  assert.ok(Repo.historialDeRegistro('LIN-00000001EPD2BY', true).eventos.length >= 1);
  // DG se sigue reconociendo por el ID del AppSheet, no por ID ANTERIOR
  assert.equal(Repo.convertirRegistro(hojas['LINEAS TELEFONICAS'][2]).equipo.legado.estatusGeneral, 'PERSONAL DG');
});

test('Selección como en los equipos Apple: cuadro con el mouse, Shift+clic, Ctrl/Cmd+A y un Esc para salir', () => {
  const dt = read('src/html/js/componentes/datatable.html');
  // Cuadro (Finder): solo con mouse y solo en tablas con modoSeleccion (las de los compañeros no cambian)
  assert.match(dt, /scrollTabla\.addEventListener\('pointerdown', \(ev\) => \{\s*if \(!cfg\.modoSeleccion \|\| ev\.pointerType !== 'mouse'/);
  assert.match(dt, /modo: ev\.ctrlKey \|\| ev\.metaKey \? 'alternar' : \(ev\.shiftKey \? 'agregar' : 'reemplazar'\)/);
  assert.match(dt, /const UMBRAL_MARCO = 6;/);
  // La tabla no brinca al aparecer la barra de seleccionados, y el clic de soltar no abre la vista rápida
  assert.match(dt, /function mantenerTablaQuieta_\(\)/);
  assert.match(dt, /raiz\.addEventListener\('click', \(ev\) => \{\s*if \(!arrastre\.ignorarClic[\s\S]*?ev\.stopPropagation\(\);/);
  // El arrastre por filas queda para el dedo (desde las casillas)
  assert.match(dt, /if \(!st\.modoSeleccion \|\| ev\.button !== 0 \|\| ev\.shiftKey \|\| ev\.pointerType === 'mouse'\) return;/);
  // Shift+clic fuera del modo: rango desde la última fila tocada (Mail)
  assert.match(dt, /if \(!st\.modoSeleccion && ev\.shiftKey\) \{/);
  // Ctrl/Cmd+A marca las filas filtradas; un Esc quita la selección y sale del modo
  assert.match(dt, /if \(tecla === 'a' && cfg\.modoSeleccion && !cfg\.seleccionUnica && !ev\.shiftKey\)/);
  assert.match(dt, /if \(!panel && !st\.editando && st\.modoSeleccion && enEsta\) setModoSeleccion\(false\);/);
});


test('Estatus del 30-sep: listas nuevas, línea sin estatus en blanco, valores viejos y departamento DISPONIBLE', () => {
  const repoSrc = read('src/services/lineas/LineasRepo.gs');
  // Listas acordadas con Líneas (sin acentos, como el AppSheet)
  assert.match(repoSrc, /estatusEquipo: \['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'\]/);
  assert.match(repoSrc, /estatusLinea: \['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'\]/);
  // Quitar la línea deja ESTATUS LINEA en blanco (antes "SIN LINEA")
  assert.match(repoSrc, /'FIN PLAN': '', 'ESTATUS LINEA': '', 'FECHA CAMBIO TEMPORAL'/);
  // DISPONIBLE se agrega a la lista de departamentos; CONTROL INTERNO no se quita
  assert.match(repoSrc, /departamentos: juntar\(\[DEPARTAMENTO_DISPONIBLE\], unicos\(ch, 'DEPARTAMENTO'\)\)/);
  assert.match(repoSrc, /const DEPARTAMENTO_DISPONIBLE = 'DISPONIBLE';/);

  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Repo = {
    CATALOGO: {
      tipos: ['EQUIPO', 'EQUIPO + SIM', 'LINEA'],
      estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'],
      estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'],
    },
    ESTATUS_EN_BLANCO: { 'ESTATUS LINEA': ['SIN LINEA'], 'ESTATUS EQUIPO': ['N/A'] },
    TAB: { LINEAS: 'LINEAS TELEFONICAS' }, TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR' },
  };
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasDatos',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(Repo, { getScriptCache: () => ({ get: () => '', put: () => {} }) }, {}, {}, {}, LineasUtil, {});
  const u = { correo: 'x@y.z', nombre: 'X' };
  const cat = { departamentos: ['CONTROL INTERNO', 'DISPONIBLE', 'VENTAS'] };
  const campo = (els, c) => els.filter((e) => e.columna === c)[0];

  // "SIN LINEA" y "N/A" viejos se muestran en blanco; otro valor viejo se conserva para que el formulario lo marque
  const base = { TIPO: 'EQUIPO', 'ESTATUS LINEA': 'SIN LINEA', 'ESTATUS EQUIPO': 'FUERA DE INVENTARIO', DEPARTAMENTO: 'CONTROL INTERNO' };
  const els = Reg._elementos(base, cat, u, { nuevo: false });
  assert.equal(campo(els, 'ESTATUS LINEA').valor, '');
  assert.equal(campo(els, 'ESTATUS EQUIPO').valor, 'FUERA DE INVENTARIO');
  assert.deepEqual(campo(els, 'ESTATUS EQUIPO').opciones, Repo.CATALOGO.estatusEquipo);
  assert.ok(campo(els, 'DEPARTAMENTO').opciones.indexOf('DISPONIBLE') >= 0 && campo(els, 'DEPARTAMENTO').opciones.indexOf('CONTROL INTERNO') >= 0);
  assert.equal(Reg._elementos({ TIPO: 'EQUIPO', 'ESTATUS EQUIPO': 'N/A' }, cat, u, { nuevo: false }).filter((e) => e.columna === 'ESTATUS EQUIPO')[0].valor, '');
  assert.ok(!Reg._elementos({ TIPO: 'LINEA' }, cat, u, { nuevo: false }).some((e) => e.columna === 'ESTATUS EQUIPO')); // una línea sola no tiene equipo

  // Los estatus se cambian en Editar (sin «Cambiar estatus», usuario 4-oct); el valor viejo sin tocar no bloquea otros
  // cambios; uno fuera de la lista se rechaza
  const soloEstatus = els.filter((e) => e.tipo !== 'campo' || ['ESTATUS LINEA', 'ESTATUS EQUIPO'].indexOf(e.columna) >= 0);
  const sinTocar = Reg._resolver(soloEstatus, base, { 'ESTATUS EQUIPO': 'FUERA DE INVENTARIO', 'ESTATUS LINEA': '' }, { nuevo: false });
  assert.deepEqual(sinTocar.errores, []);
  const cambia = Reg._resolver(soloEstatus, base, { 'ESTATUS EQUIPO': 'VENDIDO', 'ESTATUS LINEA': '' }, { nuevo: false });
  assert.equal(cambia.valores['ESTATUS EQUIPO'], 'VENDIDO');
  assert.match(Reg._resolver(soloEstatus, base, { 'ESTATUS EQUIPO': 'CANCELADO' }, { nuevo: false }).errores.join(' | '), /Estatus del equipo: VALOR NO ENCONTRADO EN LA LISTA/);
  // La persona se corrige en Editar (usuario, 4-oct): siempre editable; en blanco solo con Mandar a resguardo
  assert.equal(campo(Reg._elementos({ TIPO: 'EQUIPO', RESPONSABLE: 'ANA' }, cat, u, { nuevo: false }), 'RESPONSABLE').editable, 'SIEMPRE');

  // Colores de los estatus nuevos
  const cliente = read('src/html/js/lineas.html');
  ['DISPONIBLE', 'PARA VENTA', 'PARA DESECHO', 'EXTRAVIO-ROBO'].forEach((e) => assert.match(cliente, new RegExp(`'${e}': '(azul|ambar|rojo)'`), e));
});

test('Historial con las pestañas retiradas: lee lo migrado a APP_MOVIMIENTOS y no repite si la pestaña aún existe', () => {
  const normCol = (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: normCol }, {});
  const d = (s) => new Date(s + 'T12:00:00');
  const reasig = { ID: 'HIS-00000000EEEEEE', 'ID Historial': 'h1', 'ID Linea': 'a1b2c3d4', 'Fecha de Reasignacion': d('2025-05-01'),
    'Responsable Saliente': 'LUIS', 'Responsable Entrante': 'ANA', 'Departamento Saliente': 'VENTAS', 'Departamento Entrante': 'COBRANZA' };
  const desecho = { ID: 'DES-00000000GGGGGG', ID_DESECHO: 'x1', ID_EQUIPO: 'a1b2c3d4', 'FOLIO DESECHO': 'DR0007', MOTIVO: 'PANTALLA ROTA', 'FECHA DE DESECHO': d('2025-07-01') };
  const migrado = (hoja, fila) => ({ ID: 'MOV-' + fila.ID, TIPO: 'HISTORICO', REFS: ',a1b2c3d4,', FECHA: d('2025-05-01'),
    DETALLE_JSON: JSON.stringify({ hojaAnterior: hoja, fila: fila }) });
  const base = () => ({
    'LINEAS TELEFONICAS': [{ ID: 'LIN-00000000AAAAAA', 'ID APPSHEET': 'a1b2c3d4', NUCO: '0234', TIPO: 'EQUIPO', 'FECHA REGISTRO': d('2025-01-01') }],
    'CAMBIOS LINEAS TELEFONICAS': [],
    'INSPECCIONES LINEAS': [], 'RESPONSIVAS LINEAS': [], APP_EVIDENCIAS: [],
    APP_MOVIMIENTOS: [migrado('HISTORIAL_REASIGNACIONES', reasig), migrado('BITACORA DE DESECHO', desecho)],
  });
  const repoCon = (hojas) => new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')(
    Util, datosDePrueba_(hojas), { puntos: () => [] }, { formatDate: (f) => f.toISOString().slice(0, 10) });

  // Sin las pestañas (así queda la BD de pruebas): la reasignación y el desecho salen de APP_MOVIMIENTOS
  const h = repoCon(base()).historialDeRegistro('LIN-00000000AAAAAA', true).eventos;
  const reas = h.filter((e) => e.movimiento === 'Reasignación');
  assert.equal(reas.length, 1);
  assert.deepEqual(reas[0].cambios, [{ campo: 'RESPONSABLE', antes: 'LUIS', despues: 'ANA' }, { campo: 'DEPARTAMENTO', antes: 'VENTAS', despues: 'COBRANZA' }]);
  assert.match(reas[0].cambiosTexto, /DEPARTAMENTO: VENTAS → COBRANZA/);
  assert.equal(reas[0].fecha.getTime(), d('2025-05-01').getTime()); // la fecha vuelve a ser Date
  const desechado = h.filter((e) => e.movimiento === 'Desecho')[0];
  assert.equal(desechado.comentario, 'PANTALLA ROTA');
  assert.match(desechado.detalle, /Folio DR0007/);
  // El movimiento migrado no sale además como movimiento del sistema nuevo
  assert.equal(h.length, 2);

  // Con la pestaña todavía presente (antes de borrarla, o producción): no se repite
  const conHoja = base();
  conHoja.HISTORIAL_REASIGNACIONES = [reasig];
  conHoja['BITACORA DE DESECHO'] = [desecho];
  const h2 = repoCon(conHoja).historialDeRegistro('LIN-00000000AAAAAA', true).eventos;
  assert.equal(h2.filter((e) => e.movimiento === 'Reasignación').length, 1);
  assert.equal(h2.filter((e) => e.movimiento === 'Desecho').length, 1);
});

test('Mandar a resguardo (30-sep): persona en blanco, línea según el adendum, asesor y bandeja de Pau', () => {
  const src = read('src/services/lineas/LineasResguardos.gs');
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Notif = { _diaFinPlan: (v) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '')); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; } };
  // leerConfig_ (config/Entornos.gs) da los aprobadores de resguardos
  const R = new Function('LineasUtil', 'LineasNotificaciones', 'LineasDatos', 'LineasRepo', 'LineasRegistros', 'leerConfig_', 'Utilities',
    src + '\nreturn LineasResguardos;')(Util, Notif, { ZONA_APP: 'America/Mexico_City' }, {}, {},
    () => 'pau@ciudadmaderas.com, suplente@ciudadmaderas.com', {});

  // Datos de la persona en blanco (eran N/A; usuario, 4-oct); PIN y cuenta solo si tenían algo (NO APLICA se respeta);
  // el patrón se borra
  const fila = { RESPONSABLE: 'ANA', PUESTO: 'GERENTE', 'JEFE DIRECTO': 'LUIS', DIRECTOR: 'EVA', 'PIN WHATSAPP': '123456', 'PIN EQUIPO': 'NO APLICA',
    'CUENTA GOOGLE': '', PATRON: '1-2-3', 'NOMBRE SEGUNDO RESPONSABLE': 'LUIS' };
  const pedido = { DEPARTAMENTO: 'DISPONIBLE', SEDE: 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'DISPONIBLE', COMENTARIO: 'baja por renuncia' };
  const c = R._cambiosResguardo(fila, pedido, true);
  ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR', 'PIN WHATSAPP', 'NOMBRE SEGUNDO RESPONSABLE'].forEach((k) => assert.equal(c[k], '', k));
  assert.ok(!('NOMBRE QUIEN USA' in c), '«quien lo usa» se quitó (6-oct)');
  assert.ok(!Object.keys(c).some((k) => c[k] === 'N/A'));
  assert.equal(R._cambiosResguardo(Object.assign({}, fila, { 'CUENTA GOOGLE': 'N/A' }), pedido, true)['CUENTA GOOGLE'], ''); // un N/A viejo también
  assert.ok(!('PIN EQUIPO' in c) && !('CUENTA GOOGLE' in c));
  assert.equal(c.PATRON, '');
  assert.equal(c.DEPARTAMENTO, 'DISPONIBLE');
  assert.equal(c['ESTATUS LINEA'], 'DISPONIBLE');
  assert.equal(c.COMENTARIOS, 'BAJA POR RENUNCIA');
  assert.ok(!('ESTATUS LINEA' in R._cambiosResguardo(fila, pedido, false))); // sin línea no se toca su estatus
  // Equipo, IMEI, SIM, accesorios, razón social, compañía y costo del plan se conservan
  ['EQUIPO', 'IMEI', 'NUMERO SIM', 'ACCESORIOS', 'RAZON SOCIAL', 'COMPAÑIA', 'COSTO PLAN', 'NUMERO TELEFONO'].forEach((k) => assert.ok(!(k in c), k));

  // Línea: vencido → cancelación; vigente, sin fecha o SIM básico → disponible
  assert.equal(R._propuestaLinea('EQUIPO + SIM', R._vigencia('01/01/2025', '2026-09-30')), 'EN PROCESO DE CANCELACION');
  assert.equal(R._propuestaLinea('EQUIPO + SIM', R._vigencia('28/11/2026', '2026-09-30')), 'DISPONIBLE');
  assert.equal(R._propuestaLinea('EQUIPO + SIM', R._vigencia('', '2026-09-30')), 'DISPONIBLE');
  assert.equal(R._propuestaLinea('EQUIPO + SIM BASICO', R._vigencia('01/01/2025', '2026-09-30')), 'DISPONIBLE');
  assert.deepEqual(R._vigencia('28/11/2026', '2026-09-30'), { fin: '28/11/2026', vigencia: 'vigente' });

  // Asesor por compañía y razón social (hoja de Bren)
  assert.equal(R.asesorPara('AT&T', 'FRACCIONADORA LA ROMITA SA DE CV'), 'KARLA');
  assert.equal(R.asesorPara('TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV'), 'WILBERTO');
  assert.equal(R.asesorPara('TELCEL', 'GPH SERVICIOS CONDOMINALES'), 'ALFREDO');

  // Quién aprueba: la Script Property o ADMIN
  assert.equal(R.puedeAprobar({ correo: 'PAU@ciudadmaderas.com' }), true);
  assert.equal(R.puedeAprobar({ correo: 'otro@ciudadmaderas.com' }), false);
  assert.equal(R.puedeAprobar({ correo: 'otro@ciudadmaderas.com', esAdmin: true }), true);
  assert.deepEqual(R.ESTATUS_EQUIPO_RESGUARDO, ['RESGUARDO', 'PARA VENTA', 'PARA DESECHO']);

  // Confirmar la cancelación: línea CANCELADA, TIPO sin línea y solo si el registro conserva ese número
  assert.match(src, /Object\.assign\(\{\}, LineasRepo\.VALORES_SIN_LINEA, \{ 'ESTATUS LINEA': 'CANCELADA' \}\)/);
  assert.match(src, /cambios\['TIPO'\] = LineasRepo\.tipoSinLinea/);
  assert.match(src, /LineasUtil\.digitos\(LineasUtil\.col\(f, 'NUMERO TELEFONO'\)\) !== LineasUtil\.digitos\(sol\['NUMERO'\]\)/);
  // Aviso solo para quien aprueba
  const notif = read('src/services/lineas/LineasNotificaciones.gs');
  assert.match(notif, /return !para \|\| \(para === PARA_APROBADORES && esAprobador\);/);
  // Cliente: Mandar a resguardo desde 1, con su propio formulario; vista de la bandeja
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /async function abrirResguardo\(filas, opciones\)/);
  assert.match(cliente, /llamar\('apiLineasMandarResguardo', equipos\.map\(\(q\) => q\.id\), \{ comentario: valores\._MOTIVO, ticket: valores\._TICKET, porEquipo: porEquipo, inspecciones: inspecciones \}\)/);
  // La inspección de cada equipo que viene de una persona, dentro de la acción (pendiente 2.6; usuario, 3-oct)
  assert.match(cliente, /inspecciones = await inspeccionesEnFlujo\(deUnaPersona, 'al mandarlo a resguardo'\);/);
  assert.match(src, /LineasCaptura\.exigirInspeccion\(\(d\.inspecciones \|\| \{\}\)\[id\], LineasDatos\.idsDeFila\(f\),/);
  assert.match(cliente, /function initResguardos\(\)/);
  assert.match(read('src/html/js/app.html'), /vista: 'resguardos-lineas'[^\n]*plantilla: 'tpl-lineas-resguardos', init: \(\) => Lineas\.initResguardos\(\)/);
  assert.match(read('src/config/Entidades.gs'), /'APP_RESGUARDOS': \{ prefijo: 'RSG'/);
  // En el historial se leen con nombre (no RESGUARDO / CANCELACION_LINEA)
  assert.match(read('src/services/lineas/LineasRepo.gs'), /RESGUARDO: 'Resguardo', CANCELACION_LINEA: 'Cancelación de línea', VENTA: 'Venta'/);
});

test('PARA VENTA y PARA DESECHO siguen la lógica de Mandar a resguardo (usuario, 30-sep)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const resg = read('src/services/lineas/LineasResguardos.gs');
  const cliente = read('src/html/js/lineas.html');
  // Sin el aviso confirmado el servidor no deja llegar a esos estatus por la edición directa
  assert.match(reg, /function exigirFormularioResguardo_\(tipo, estatusAntes, estatusNuevo\)/);
  assert.match(reg, /LineasResguardos\.ESTATUS_EQUIPO_RESGUARDO\.indexOf\(nuevo\)/);
  assert.equal((reg.match(/exigirFormularioResguardo_\(/g) || []).length, 2, 'definición + editar');
  // Editar ya no abre el formulario de resguardo (usuario, 8-oct): avisa que no entra al panel y se guarda con sinPanel
  assert.match(cliente, /cambiaA\('ESTATUS EQUIPO', ESTATUS_EQUIPO_RESGUARDO\)/);
  // Sin regla de estatus (usuario, 4-oct): cada equipo ofrece la lista completa
  assert.match(cliente, /'Estatus del equipo', 'escala', \{ opciones: form\.estatusEquipo, valor: estatusInicial, requerido: 'SIEMPRE', ayudas: SIGNIFICADO_ESTATUS \}/);
  assert.doesNotMatch(resg, /LineasAcciones\.hayCamino|estatusPosibles/);
  // Si ya estaba guardado no se pide otra recepción: se actualiza el renglón abierto de la bandeja
  assert.match(resg, /const yaGuardado = ESTATUS_EQUIPO_RESGUARDO\.indexOf\(may\(antes\.estatus\)\) >= 0;/);
  assert.match(resg, /LineasDatos\.actualizarFila\(TAB, abierto\._fila,/);
  assert.match(resg, /'ESTADO': yaGuardado \? ESTADO\.RESGUARDO : ESTADO\.PENDIENTE/);
});

test('Selección como en Google Drive y "Mandar a cancelación" (usuario, 30-sep)', () => {
  const dt = read('src/html/js/componentes/datatable.html');
  // Clic = seleccionar esa fila; Ctrl alterna; Shift rango; sin reescribir las filas (el doble clic sigue llegando)
  assert.match(dt, /function clicDrive\(id, teclasOriginales\)/);
  // Como en Drive: la fila se marca al instante y solo la barra entra después (con doble clic no se asoma)
  assert.match(dt, /\.dt-barra-sel:not\(\[hidden\]\) \{ animation: dt-barra-entra 90ms ease-out 100ms both; \}/);
  assert.match(dt, /if \(ev\.detail >= 2\) return;   \/\/ segundo clic de un doble clic/);
  assert.doesNotMatch(dt, /ESPERA_DOBLE_CLIC|clicDriveConEspera/);
  assert.match(dt, /else st\.seleccion = new Set\(\[id\]\);/);
  assert.match(dt, /function pintarSeleccion\(\)/);
  // Barra con lo más usado y ⋮ con el resto; clic derecho y ⋮ de la fila con todas
  assert.match(dt, /<div class="dt-barra-sel" role="toolbar"/);
  assert.match(dt, /const enBarra = aplican\.filter\(\(a\) => a\.enBarra\);/);
  assert.match(dt, /tbody\.addEventListener\('contextmenu'/);
  assert.match(dt, /celdaMas\(botonIcono\('dt-btn-mas', 'ellipsis-vertical'/);
  // El cuadro solo empieza fuera de las filas, y queda espacio vacío abajo para arrastrarlo
  assert.match(dt, /if \(cfg\.seleccionDrive && ev\.target\.closest\('tbody tr\[data-id\]'\)\) return;/);
  assert.match(dt, /\.dt\.dt-drive \.dt-scroll table \{ margin-bottom: 56px; \}/);
  // Con el dedo: tocar abre, mantener presionado entra al modo selección
  assert.match(dt, /if \(fila && cfg\.alTocarFila\) cfg\.alTocarFila\(fila\);/);
  assert.match(dt, /setModoSeleccion\(true\);\s*if \(navigator\.vibrate\)/);
  // Líneas: sin botón "Seleccionar"; Detalles sigue a la selección en un panel sin fondo
  const lineas = read('src/html/js/lineas.html');
  assert.match(lineas, /function accionesSeleccionDe\(modulo\)/);
  assert.match(lineas, /if \(detallesAbiertos && filas\.length === 1 && modulo === memoria\.modulo && vigente\(\)\) mostrarDetalles/);
  assert.match(lineas, /if \(o\.noModal\) document\.body\.append\(elemento\); else document\.body\.append\(fondo, elemento\);/);
  // Ficha: solo Nueva inspección y Nueva responsiva a la vista, el resto en ⋮; la línea también (con equipo sin capturas)
  assert.match(lineas, /data-ln-ficha-mas="' \+ esc\(tipo\)/);
  assert.doesNotMatch(lineas, /data-ln-estatus=|data-ln-editar=/);
  // "Ver carpeta en Drive" del equipo va en el ⋮, sola (fuera de Documentos); mismo nombre en la tabla Documentos
  assert.match(lineas, /botonesFicha\('data-equipo-id', id, 'equipo', puedeOperar, '', true\)/);
  assert.match(lineas, /texto: 'Ver carpeta en Drive', separador: true,/);
  assert.match(lineas, /\.concat\(drive, documentos, \[/);
  assert.doesNotMatch(lineas, /Abrir carpeta/);
  assert.match(lineas, /botonesFicha\('data-linea-id', id, 'linea', puedeOperarLinea && !e,/);
  assert.match(lineas, /function abrirMenuFicha\(boton\)/);
  // Mandar a cancelación: cliente, API y servidor; la pestaña Resguardos solo muestra renglones con equipo
  assert.match(lineas, /llamar\('apiLineasMandarCancelacion', conNumero\.map\(\(x\) => x\.id\)/);
  assert.match(lineas, /vista === 'RESGUARDOS' \? todas\.filter\(\(f\) => f\.ESTADO\)/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasMandarCancelacion\(token, ids, datos\)/);
  const resg = read('src/services/lineas/LineasResguardos.gs');
  assert.match(resg, /function mandarCancelacion\(ids, datos, usuario\)/);
  assert.match(resg, /'SOLICITO_CORREO': usuario\.correo, 'SOLICITO_NOMBRE': usuario\.nombre, 'ESTADO': '',/);
  // Con cualquiera de los IDs del registro: la bandeja guarda el que tenía al mandarlo (reestructura, etapa 3)
  assert.match(resg, /if \(enCancelacion_\(cancelando, f, numero\)\)/);
  assert.match(resg, /LineasDatos\.idsDeFila\(f\)\.some\(\(k\) => cancelando\[claveCancelacion_\(k, numero\)\]\)/);
  // Una línea suelta conserva su número al confirmar la cancelación
  assert.match(resg, /if \(!LineasRepo\.TIPOS_CON_EQUIPO\[tipo\]\) return \{ 'ESTATUS LINEA': 'CANCELADA' \};/);
});

test('Ajustes a la selección estilo Drive: contador simple, clic fuera, sin Copiar/Exportar/Abrir ficha, documentos separados', () => {
  const dt = read('src/html/js/componentes/datatable.html');
  assert.match(dt, /const cuenta = `\$\{filas\.length\} \$\{plural\(filas\.length, 'seleccionado'\)\}`;/);
  assert.doesNotMatch(dt, /1 seleccionado · \$\{etiquetaDe/);
  assert.match(dt, /document\.addEventListener\('pointerdown', alPresionarFuera\);/);
  assert.match(dt, /cfg\.accionesDeTabla === false \? \[\] : \[accionCopiar\]/);
  assert.match(dt, /class="dt-menu-titulo">\$\{esc\(a\.tituloGrupo\)\}/);
  const lineas = read('src/html/js/lineas.html');
  assert.doesNotMatch(lineas, /texto: 'Abrir ficha'/);
  assert.match(lineas, /texto: 'Ver última inspección', maximo: 1, enBarra: false, grupo: 'inspeccion', tituloGrupo: 'Inspección'/);
  assert.match(lineas, /texto: 'Nueva responsiva', maximo: 1, enBarra: false, grupo: 'responsiva', tituloGrupo: 'Responsiva'/);
  assert.match(lineas, /conservarSeleccion: \(el\) => !!el\.closest\('#ln-listado \.ln-cuadro, #ln-modal-captura, \.ln-menu-flotante'\)/);
  // Documentos, historial, bandeja…: sin columna de Acciones; sus botones van a la barra y al clic derecho
  assert.match(dt, /const hayAccionesFila = accionesFila\.length > 0 && !\(cfg\.seleccionDrive && cfg\.seleccionable\);/);
  assert.match(dt, /visible: \(filas\) => !a\.visible \|\| a\.visible\(filas\[0\]\), alHacer: \(filas\) => a\.alHacer\(filas\[0\]\),/);
  // Documentos e Historial: una fila a la vez (no hay acciones masivas)
  assert.match(dt, /const teclas = cfg\.seleccionUnica \? \{\} : teclasOriginales;/);
  assert.match(dt, /if \(cfg\.seleccionUnica\) return;   \/\/ sin selección de varias, no hay cuadro/);
  assert.equal((lineas.match(/seleccionUnica: true,/g) || []).length, 2);
});

test('Correcciones de Líneas: evidencia en Drive con enlace directo a la línea (1-oct)', () => {
  const Cor = new Function(read('src/services/lineas/LineasCorrecciones.gs') + '\nreturn LineasCorrecciones;')();
  const archivos = {
    'FACTURA.pdf': { id: 'pdf1', hoja: false },
    'R 4461446462 - FACTURA.jpg': { id: 'rec1', hoja: false },
    'BARRIDO.xls': { id: 'hoja1', hoja: true, gids: { Sheet0: 0, 'CANCELACIÓN DE LÍNEAS': 77 } },
  };
  const e = Cor.enlacesDe([
    { etiqueta: 'Factura AT&T cta 643495915', archivo: 'FACTURA.pdf', recorte: 'R 4461446462 - FACTURA.jpg', paginas: [2, 4] },
    { etiqueta: 'Barrido AT&T', archivo: 'BARRIDO.xls', hoja: 'Sheet0', fila: 234, columnas: 12 },
    { etiqueta: 'Hoja de Bren', archivo: 'BARRIDO.xls', hoja: 'CANCELACIÓN DE LÍNEAS', fila: 177, columnas: 28 },
    { etiqueta: 'Venta', archivo: 'NO-SUBIDO.pdf' }, // lo que no está en Drive no aparece
  ], archivos);
  assert.equal(e.length, 3);
  // PDF: el recorte con la línea marcada (Drive no abre un PDF en una página) y el documento con sus páginas
  assert.deepEqual(e[0].linea, { url: 'https://drive.google.com/file/d/rec1/view', texto: 'Ver la línea marcada' });
  assert.equal(e[0].original.texto, 'Abrir el documento completo (págs. 2, 4)');
  // Hoja de Google (el Excel convertido): directo al renglón
  assert.equal(e[1].linea.url, 'https://docs.google.com/spreadsheets/d/hoja1/edit#gid=0&range=A234:L234');
  assert.equal(e[1].linea.texto, 'Ver el renglón 234');
  assert.equal(e[2].linea.url, 'https://docs.google.com/spreadsheets/d/hoja1/edit#gid=77&range=A177:AB177');
  // Sin recorte subido: solo el documento
  assert.equal(Cor.enlacesDe([{ etiqueta: 'X', archivo: 'FACTURA.pdf', recorte: 'falta.jpg' }], archivos)[0].linea, null);
  // Subir: solo ADMIN y solo los tipos de la carpeta de evidencias
  assert.throws(() => Cor.subirEvidencia({ esAdmin: false }, 'a.pdf', 'application/pdf', ''), /Solo ADMIN/);
  assert.throws(() => Cor.subirEvidencia({ esAdmin: true }, 'script.gs', 'text/plain', ''), /no permitido/);
  assert.throws(() => Cor.subirEvidencia({ esAdmin: true }, '../a.pdf', 'application/pdf', ''), /no permitido/);
  const cli = read('src/html/js/lineas-correcciones.html');
  assert.match(cli, /C\.llamar\('apiLineasCorreccionesSubirEvidencia', f\.name, f\.type \|\| '', await leerBase64\(f\)\)/);
  assert.match(cli, /for \(const f of manifiesto\) await una\(f\);/); // evidencias.json al final
  assert.match(read('src/services/lineas/LineasCorrecciones.gs'), /function apiLineasCorreccionesSubirEvidencia\(token, nombre, mime, base64\) \{\r?\n  const sesion = Auth\.requiereRol\(token, \[Config\.ROLES\.ADMIN\]\);/);
});

test('Correcciones de Líneas (módulo temporal, 30-sep): cargas que conservan, reabren y verifican', () => {
  const Cor = new Function(read('src/services/lineas/LineasCorrecciones.gs') + '\nreturn LineasCorrecciones;')();
  let n = 0;
  const nuevoId = () => 'COR-' + (++n);
  const caso = (llave, extra) => Object.assign({ llave: llave, clave: 'B1', categoria: 'Fuera de inventario', prioridad: 2, nuco: '3', idAppsheet: 'a1', numero: '', tipo: 'EQUIPO', campo: 'ESTATUS EQUIPO', inventario: 'FUERA DE INVENTARIO', evidencia: '', quePasa: 'q', sugerencia: 's', fuente: 'f' }, extra);
  const auto = { nuco: '1', idAppsheet: 'x', tipo: 'EQUIPO', campo: 'ESTATUS LINEA', antes: 'SIN LINEA', despues: '', regla: 'M1', queHace: 'SIN LINEA en blanco', quien: 'SISTEMA (mapeo)', evidencia: 'Inventario' };
  const d1 = new Date(2026, 8, 30, 21);

  // Primera carga: todo nace PENDIENTE y lo aplicado solo como AL MIGRAR
  const c1 = Cor.combinar([], { carga: '2026-09-30T20:00:00', fechaInventario: '2026-09-28', casos: [caso('B1|3|E'), caso('B4|9|E'), caso('B13|5|P')], automaticos: [auto] }, d1, nuevoId);
  assert.deepEqual(c1.resumen, { nuevos: 3, siguen: 0, reabiertos: 0, verificados: 0, quitados: 0, automaticos: 1 });
  assert.deepEqual(c1.filas.map((f) => f.ESTADO), ['PENDIENTE', 'PENDIENTE', 'PENDIENTE', 'AL MIGRAR']);

  // Líneas atiende: B1 corregido, B13 no aplica
  const hoja = c1.filas.map((f) => Object.assign({}, f));
  Object.assign(hoja[0], { ESTADO: 'CORREGIDO', ATENDIDO_EN: new Date(2026, 9, 2, 10) });
  Object.assign(hoja[2], { ESTADO: 'NO APLICA', COMENTARIO: 'No se limpian', ATENDIDO_EN: new Date(2026, 9, 2, 10) });

  // Misma foto del inventario, cambió una regla (B4 ya no sale): lo no tocado se quita; lo atendido se conserva
  const c2 = Cor.combinar(hoja, { carga: '2026-10-01T09:00:00', fechaInventario: '2026-09-28', casos: [caso('B1|3|E'), caso('B13|5|P')], automaticos: [] }, d1, nuevoId);
  assert.deepEqual(c2.resumen, { nuevos: 0, siguen: 2, reabiertos: 0, verificados: 0, quitados: 1, automaticos: 0 });
  assert.equal(c2.filas.find((f) => f.LLAVE === 'B1|3|E').ESTADO, 'CORREGIDO');

  // Inventario POSTERIOR a cuando se marcó: lo corregido que sigue apareciendo se reabre; lo que ya no aparece se verifica
  const c3 = Cor.combinar(hoja, { carga: '2026-10-10T09:00:00', fechaInventario: '2026-10-09', casos: [caso('B1|3|E')], automaticos: [auto] }, d1, nuevoId);
  const por = (k) => c3.filas.find((f) => f.LLAVE === k);
  assert.equal(por('B1|3|E').ESTADO, 'PENDIENTE');
  assert.match(por('B1|3|E').COMENTARIO, /Reabierto: sigue en la conciliación con el inventario del 2026-10-09/);
  assert.equal(por('B4|9|E').ESTADO, 'VERIFICADO');
  assert.equal(por('B13|5|P').ESTADO, 'NO APLICA');   // "no aplica" no se toca
  assert.equal(c3.filas.filter((f) => f.TIPO === 'AUTOMATICO').length, 1);   // lo aplicado solo se reemplaza

  // Aislado para poder borrarlo: API en su archivo, semilla fuera de git, una línea en cada lugar compartido
  assert.match(read('.gitignore'), /src\/services\/lineas\/LineasCorreccionesSemilla\.gs/);
  assert.match(read('src/services/lineas/LineasCorrecciones.gs'), /function apiLineasCorreccionesMarcar\(token, accion, ids, comentario\)/);
  assert.doesNotMatch(read('src/ClientApi.gs'), /Correcciones/);
  assert.match(read('src/html/js/app.html'), /vista: 'correcciones-lineas'[^\n]*plantilla: 'tpl-lineas-correcciones', init: \(\) => LineasCorrecciones\.init\(\)/);
  assert.match(read('src/config/Entidades.gs'), /'APP_CORRECCIONES': \{ prefijo: 'COR'/);
  assert.match(read('package.json'), /"correcciones:semilla": "node tools\/correcciones-semilla\.cjs"/);
});

test('Notificaciones de seguimiento (30-sep): equipos sin recibir, cancelaciones sin confirmar y líneas disponibles vencidas', () => {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Ntf = new Function('LineasUtil', 'LineasDatos', 'Utilities', read('src/services/lineas/LineasNotificaciones.gs') + '; return LineasNotificaciones;')(
    LineasUtil, { ZONA_APP: 'America/Mexico_City' },
    { formatDate: (d) => d.toISOString().slice(0, 10) });
  const d = (s) => new Date(s + 'T12:00:00Z');
  const firmar = (ids) => ids.slice().sort().join('+');
  // El aviso es uno por semana: el lunes de la semana del 30-sep-2026 (miércoles) es el 28
  assert.equal(Ntf._semana('2026-09-30'), '2026-09-28');
  assert.equal(Ntf._semana('2026-09-28'), '2026-09-28');
  const resguardos = [
    { ID: 'RSG-1', NUCO: '0101', ESTADO: 'PENDIENTE DE RECEPCION', FECHA: d('2026-09-26') },   // 4 días: sí
    { ID: 'RSG-2', NUCO: '0102', ESTADO: 'PENDIENTE DE RECEPCION', FECHA: d('2026-09-29') },   // 1 día: todavía no
    { ID: 'RSG-3', NUCO: '0103', ESTADO: 'EN RESGUARDO', FECHA: d('2026-09-01') },             // ya recibido
    { ID: 'RSG-4', NUMERO: '4421110000', CANCELACION: 'CARTA ENVIADA', FECHA: d('2026-08-20'), CARTA_ENVIADA_EN: d('2026-09-10') }, // 20 días: sí
    { ID: 'RSG-5', NUMERO: '4421110001', CANCELACION: 'CARTA ENVIADA', FECHA: d('2026-09-20'), CARTA_ENVIADA_EN: d('2026-09-25') }, // 5 días: no
    { ID: 'RSG-6', NUMERO: '4421110002', CANCELACION: 'POR FIRMAR', FECHA: d('2026-09-20') },  // 10 días por firmar: sí
    { ID: 'RSG-7', NUMERO: '4421110003', CANCELACION: 'CANCELADA', FECHA: d('2026-08-01') },   // ya cancelada
  ];
  const linea = (id, estatus, fin, tipo) => ({ ID: id, TIPO: tipo || 'EQUIPO + SIM', 'ESTATUS LINEA': estatus, 'FIN PLAN': fin, 'NUMERO TELEFONO': '44200000' + id });
  const lineas = [
    linea('11', 'DISPONIBLE', d('2026-04-08')),                 // vencida y guardada: se sigue pagando
    linea('12', 'RESGUARDO', d('2026-01-31')),                  // valor viejo de "disponible": también
    linea('13', 'DISPONIBLE', d('2027-01-31')),                 // vigente: no
    linea('14', 'USO', d('2026-01-31')),                        // en uso: no (la usa alguien)
    linea('15', 'DISPONIBLE', d('2026-01-31'), 'EQUIPO + SIM BASICO'), // SIM básico: sin adendum
  ];
  const a = Ntf._seguimiento(lineas, resguardos, '2026-09-30', firmar);
  const por = (t) => a.filter((x) => x.tipo === t)[0];
  assert.deepEqual(a.map((x) => x.tipo), ['SIN_RECIBIR', 'CANCELACION_PENDIENTE', 'DISPONIBLE_VENCIDA']);
  assert.equal(por('SIN_RECIBIR').clave, 'SIN_RECIBIR|2026-09-28|RSG-1');
  assert.match(por('SIN_RECIBIR').mensaje, /NUCO 0101\.$/);
  assert.equal(por('SIN_RECIBIR').para, Ntf.PARA_APROBADORES);
  assert.equal(por('CANCELACION_PENDIENTE').clave, 'CANCELACION_PENDIENTE|2026-09-28|RSG-4+RSG-6');
  assert.match(por('CANCELACION_PENDIENTE').mensaje, /1 con la carta enviada hace 15 días o más.*1 por firmar desde hace 7 días o más: 4421110000 y 4421110002\./);
  assert.equal(por('DISPONIBLE_VENCIDA').clave, 'DISPONIBLE_VENCIDA|2026-09-28|11+12');
  assert.equal(por('DISPONIBLE_VENCIDA').para, ''); // lo ve todo el equipo de Líneas
  assert.match(por('DISPONIBLE_VENCIDA').titulo, /· 2$/);
  // Sin nada que avisar: ningún aviso vacío
  assert.deepEqual(Ntf._seguimiento([], [], '2026-09-30', firmar), []);
  // Las líneas para cancelar ya tienen su tipo; la vista sabe a dónde lleva cada uno
  assert.equal((read('src/services/lineas/LineasResguardos.gs').match(/avisar_\('CANCELACION', 'Líneas para cancelar · '/g) || []).length, 2);
  const vista = read('src/html/notificaciones.html');
  assert.match(vista, /DISPONIBLE_VENCIDA: \{ grupo: 'pagos', icono: 'banknote', color: 'vencida', accion: 'Ver líneas disponibles', estatus: \['lineas', \['DISPONIBLE', 'RESGUARDO'\]\]/);
  assert.match(read('src/html/js/lineas.html'), /valores: Array\.isArray\(f\.estatus\) \? f\.estatus : \[f\.estatus\]/);
  assert.match(vista, /const AGRUPAR_DESDE = 3;/);
  assert.match(read('src/html/js/lineas.html'), /irConEstatus: irConEstatus, \/\/ desde Notificaciones/);
});

test('la etiqueta "auto" y el par Folio/Nucco solo viven en sus componentes', () => {
  // Cada motor de formularios ponía (o se le olvidaba poner) su propia etiqueta "auto": la
  // regla es declararlo (data-auto, CampoAuto.llenar, Formulario.sugerir/setSoloLectura)
  // y que componentes/campo-auto.html la pinte. Lo mismo con el par Folio/Nucco.
  const html = filesBelow(path.join(root, 'src', 'html')).filter((f) => f.endsWith('.html'));
  const fuera = (patron, permitidos) => html
    .filter((f) => !permitidos.some((p) => f.endsWith(p)))
    .filter((f) => patron.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f));
  assert.deepEqual(fuera(/auto-tag/, ['styles.html', path.join('componentes', 'campo-auto.html')]), [],
    'usa data-auto o CampoAuto en vez de escribir <span class="auto-tag">');
  assert.deepEqual(fuera(/function wireFolioYNucco_|vehiculosPorFolioONucco/, []), [],
    'usa FolioNucco.ligar en vez de otra copia del par Folio/Nucco');
  // El Nucco es lo que más se usa (oct-2026): donde se pide un vehículo por folio, también por Nucco.
  // Formulario: buscar.nucco. Escrito a mano: FolioNucco.ligar / FolioNucco.montar con su campo Nucco.
  const piden = html.filter((f) => /Folio del veh[ií]culo/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(piden.filter((f) => !/nucco/i.test(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f)), [],
    'este formulario pide el folio del vehículo pero no ofrece el Nucco');
  html.forEach((f) => {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/buscar: \{\s*campo: 'FOLIO'[\s\S]*?\n {8}\},/g)) {
      assert.match(m[0], /nucco: \{ vehiculos:/, path.relative(root, f) + ': el Formulario busca por folio sin buscar.nucco');
    }
  });
  // Ya no hay campos Nucco escritos a mano fuera del formulario (los reemplazó buscar.nucco)
  assert.doesNotMatch(read('src/html/views/verificaciones.html') + read('src/html/views/sensores.html'), /id="(ver|sen)-nucco"/);
  const index = read('src/html/Index.html');
  const pos = (n) => index.indexOf("componentes/" + n + "'");
  assert.ok(pos('campo-auto') > 0 && pos('campo-auto') < pos('folio-nucco') && pos('folio-nucco') < pos('formulario'),
    'campo-auto y folio-nucco se incluyen antes de formulario (que los usa)');
});

test('los formularios por columnas usan un solo motor (CamposHoja)', () => {
  // Vehículos, Caja Chica y Arqueos traían cada uno su copia de pintar/leer/llenar campos
  // (y tres copias de llenarSelect). Ahora delegan en componentes/campos-hoja.html.
  // (Las fichas de solo lectura, seccionesFicha*, son otra cosa: muestran, no capturan.)
  const modulos = { 'src/html/js/app.html': 'VEHICULO', 'src/html/js/app-cajachica.html': 'CAJACHICA', 'src/html/js/app-arqueos.html': 'ARQUEO' };
  Object.keys(modulos).forEach((m) => {
    const src = read(m);
    const lista = 'CAMPOS_' + modulos[m];
    ['html', 'recolectar', 'poblar'].forEach((metodo) => {
      assert.match(src, new RegExp('CamposHoja\\.' + metodo + '\\(' + lista + '\\b'), m + ': ' + metodo + ' delega en CamposHoja');
    });
    assert.doesNotMatch(src, /function llenarSelect\(id, valores\) \{\s*\n/, m + ': llenarSelect delega en CamposHoja.llenarOpciones');
    assert.doesNotMatch(src, /\.normalize\('NFD'\)\.replace/, m + ': slugCampo delega en CamposHoja.slug');
  });
  const index = read('src/html/Index.html');
  assert.ok(index.indexOf("componentes/campos-hoja'") > 0 && index.indexOf("componentes/campos-hoja'") < index.indexOf("include('html/js/app')"),
    'campos-hoja se incluye antes de app.html (slugCampo delega en él)');
});

test('los formularios que antes iban escritos a mano también se declaran en CamposHoja', () => {
  // Uber, Tickets, Incidencias, Reasignaciones y Cambios de Monto tenían sus campos escritos
  // a mano en la vista (dos veces cuando había Editar) y su propio recolectar/poblar.
  // Ahora la vista solo deja el contenedor y el módulo declara la lista.
  const casos = [
    ['uber', 'src/html/js/app.html', 'CAMPOS_UBER', ['form-uber', 'form-editar-uber']],
    ['tickets', 'src/html/js/app.html', 'CAMPOS_TICKET', ['form-ticket', 'form-editar-ticket']],
    ['incidencias', 'src/html/js/app.html', 'CAMPOS_INCIDENCIA', ['form-incidencia', 'form-editar-incidencia', 'form-cerrar-incidencia']],
    ['reasignaciones-vehiculares', 'src/html/js/app-reasignaciones.html', 'CAMPOS_REASIGNACION', ['form-reasignacion-vehicular']],
    ['cambios-monto-cch', 'src/html/js/app-cajachica.html', 'CAMPOS_CAMBIO_MONTO', ['form-cambio-monto']],
  ];
  casos.forEach(([vista, modulo, lista, formularios]) => {
    const html = read('src/html/views/' + vista + '.html');
    formularios.forEach((id) => {
      const desde = html.indexOf('<form id="' + id + '"');
      assert.ok(desde > 0, vista + ': existe ' + id);
      const form = html.slice(desde, html.indexOf('</form>', desde));
      assert.doesNotMatch(form, /class="field"/, vista + ': ' + id + ' no trae campos escritos a mano');
      assert.match(form, new RegExp('id="campos-' + id + '"'), vista + ': ' + id + ' tiene su contenedor');
    });
    const src = read(modulo);
    assert.match(src, new RegExp('CamposHoja\\.html\\(' + lista + '\\b'), modulo + ': pinta ' + lista + ' con CamposHoja');
    assert.match(src, new RegExp('CamposHoja\\.recolectar\\(' + lista + '\\b'), modulo + ': lee ' + lista + ' con CamposHoja');
  });
  assert.doesNotMatch(read('src/html/js/app.html'), /function (recolectar|poblar)(Uber|Ticket)\(/, 'sin recolectar/poblar propios de Uber y Tickets');
});

test('responsivo: solo los cortes del sistema (640 / 1024) y matchMedia solo en Pantalla', () => {
  // Los dos cortes viven en componentes/pantalla.html (ver su encabezado). Cada archivo usaba
  // el suyo (520, 600, 700, 760, 900…) y la misma pantalla era celular para un módulo y
  // escritorio para otro. Un @media de ancho solo puede usar estos; hover/pointer/prefers-* sí.
  const PERMITIDOS = new Set(['(max-width: 640px)', '(max-width: 1024px)', '(min-width: 641px)', '(min-width: 1025px)']);
  // Lo que falta migrar (plan de diseño responsivo, oct-2026). Esta lista SOLO SE ACHICA: un
  // archivo nuevo no puede entrar, y al migrar uno hay que bajar su número aquí (si no, falla).
  const PENDIENTES = {
    'src/html/js/lineas.html': { cortes: 0, matchMedia: 2 },
    'src/html/lineas-estilos.html': { cortes: 17, matchMedia: 0 },
    'src/html/views/relaciones.html': { cortes: 1, matchMedia: 0 },
  };
  const encontrado = {};
  filesBelow(path.join(root, 'src')).filter((f) => f.endsWith('.html')).forEach((file) => {
    const rel = path.relative(root, file).replace(/\\/g, '/');
    const src = fs.readFileSync(file, 'utf8');
    let cortes = 0;
    for (const m of src.matchAll(/@media([^{]*)\{/g)) {
      for (const w of m[1].matchAll(/\((?:max|min)-width:\s*[^)]*\)/g)) {
        if (!PERMITIDOS.has(w[0].replace(/\s+/g, ' '))) cortes++;
      }
    }
    const matchMedia = rel.endsWith('componentes/pantalla.html') ? 0 : (src.match(/matchMedia\s*\(/g) || []).length;
    if (cortes || matchMedia) encontrado[rel] = { cortes, matchMedia };
  });
  assert.deepEqual(encontrado, PENDIENTES,
    'Un @media de ancho usa (max-width: 640px) o (max-width: 1024px), y "¿es celular?" se pregunta con Pantalla.* ' +
    '(componentes/pantalla.html). Si migraste un archivo, baja su número en PENDIENTES (o quítalo).');
  // Rejillas de campos: .form-rejilla + data-columnas (se acomodan solas en tableta y celular),
  // nunca columnas fijas en línea, que en celular dejaban 3 campos de 100px y cortaban el último
  const enLinea = filesBelow(path.join(root, 'src/html/views')).filter((f) => f.endsWith('.html'))
    .filter((f) => /style="[^"]*grid-template-columns/.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f).replace(/\\/g, '/'));
  assert.deepEqual(enLinea, [], 'Usa class="form-rejilla" data-columnas="N" (styles.html) en vez de grid-template-columns en línea');
  // Pantalla se carga antes que todo lo que la usa
  const index = read('src/html/Index.html');
  const pos = (nombre) => index.indexOf("include('html/" + nombre + "')");
  assert.ok(pos('js/componentes/pantalla') > 0, 'Index.html incluye Pantalla');
  ['notificaciones', 'js/app', 'js/lineas', 'shell-movil'].forEach((n) =>
    assert.ok(pos('js/componentes/pantalla') < pos(n), 'Pantalla va antes de ' + n));
});

test('Mandar a resguardo: formulario intermedio informativo y la persona solo queda en blanco ahí (usuario, 4-oct)', () => {
  const cliente = read('src/html/js/lineas.html');
  const resg = cliente.slice(cliente.indexOf('async function abrirResguardo('), cliente.indexOf("$('#cap-guardar', raiz).addEventListener('click', async () => {", cliente.indexOf('async function abrirResguardo(')));
  // Equipo, línea y adendum informativos (como la inspección); solo se captura destino, comentario y ticket
  ["titulo(q, 'EQUIPO'", "titulo(q, 'LÍNEA'", "titulo(q, 'ADENDUM'", "titulo(q, 'DESTINO'"].forEach((t) => assert.ok(resg.includes(t), t));
  assert.match(resg, /soloLectura: true, editable: 'NUNCA'/);
  ["'INICIO PLAN', 'Inicio'", "'FIN PLAN', 'Fin'", "'COSTO PLAN', 'Costo del plan'", "'VIGENCIA', 'Vigencia'"].forEach((t) => assert.ok(resg.includes(t), t));
  assert.doesNotMatch(resg, /RESPONSABLE|Mismos datos para todos|ln-nota'>|class="ln-nota">' \+ icono\('info'|COMENTARIO DE ESTE EQUIPO/);
  assert.match(resg, /campo\('_MOTIVO', 'Comentario', 'area'/);
  const servidor = read('src/services/lineas/LineasResguardos.gs');
  assert.match(servidor, /inicioPlan: linea \? inicio : '', costoPlan: linea \? txt\(LineasUtil\.col\(f, 'COSTO PLAN'\)\) : '',/);
  assert.doesNotMatch(servidor, /const NA = 'N\/A'/);
  // Editar no deja en blanco los datos de la persona: solo «Mandar a resguardo»
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(reg, /const PERSONA_SOLO_RESGUARDO = \['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE'\]\s+\.concat\(ORDEN_ADICIONALES/);
  assert.match(reg, /solo «Mandar a resguardo» lo deja en blanco/);
  const enBlanco = new Function('texto_', "return (v) => ['', 'N/A', 'NA', 'N / A', '-'].indexOf(texto_(v).trim().toUpperCase()) >= 0;")((v) => (v == null ? '' : String(v)));
  assert.ok(reg.includes("const enBlanco_ = (v) => ['', 'N/A', 'NA', 'N / A', '-'].indexOf(texto_(v).trim().toUpperCase()) >= 0;"));
  assert.ok(enBlanco('') && enBlanco('n/a') && !enBlanco('NO APLICA') && !enBlanco('ANA'));
});

test('Mandar a resguardo: estatus con su significado, línea vencida a cancelación, sin confirmación y procesos en la inspección (usuario, 4-oct)', () => {
  const cliente = read('src/html/js/lineas.html');
  const resg = cliente.slice(cliente.indexOf('async function abrirResguardo('), cliente.indexOf('async function abrirCancelacion('));
  // Significado de cada estatus al pasar el ratón: chips, botones del resguardo y opciones de Cambiar estatus
  assert.match(cliente, /const SIGNIFICADO_ESTATUS = \{/);
  ['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION'].forEach((e) => assert.ok(cliente.includes("'" + e + "': '"), e));
  assert.match(cliente, /' title="' \+ esc\(ayudas\[v\]\) \+ '"'/);
  assert.match(cliente, /\(ayuda \? ' title="' \+ esc\(ayuda\) \+ '"' : ''\)/);
  // Adendum vencido: la línea va a cancelación sin elegir; vigente o sin fecha, se elige
  assert.match(resg, /const vencido = q\.propuestaLinea === 'EN PROCESO DE CANCELACION';/);
  assert.match(resg, /'Estatus de la línea', 'escala', \{ opciones: vencido \? \[q\.propuestaLinea\] : form\.estatusLinea,/);
  assert.match(read('src/services/lineas/LineasResguardos.gs'), /if \(tieneLinea && propuestaLinea_\(tipo, vigencia_\(LineasUtil\.col\(f, 'FIN PLAN'\), hoy\)\) === LINEA_CANCELACION\) pedido\['ESTATUS LINEA'\] = LINEA_CANCELACION;/);
  // Sin ventana de confirmación
  assert.doesNotMatch(resg, /Confirmar\.pedir/);
  // Inspección dentro del resguardo: responsable en blanco, solo las personas de procesos, y no se copia la persona
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /const PERSONAS_PROCESOS = \['DAFNE DONIS GARCIA', 'GAMALIEL JAIR MORA GONZALEZ', 'YOVANNI NAVA PERALTA'\];/);
  assert.match(captura, /const persona = \(c, enResponsiva\) => \(enAccion \? '' : \(resp \? deResp\(enResponsiva \|\| c, ''\) : v\(c\)\)\);/);
  assert.match(captura, /enAccion \? \{ opciones: PERSONAS_PROCESOS, soloLista: true \} : \{\}/);
  assert.match(captura, /if \(\(e\.control === 'lista' \|\| e\.soloLista\) && e\.opciones/);
  assert.match(captura, /else if \(!datos\.enAccion\) COPIA_INSPECCION_A_LINEA/);
  assert.match(cliente, /cbx\.setOpciones\(e\.soloLista \? unirOpciones\(ops\.filter/);
});

test('Historial único (paso 3): MOVIMIENTOS un renglón por acción, ediciones del AppSheet juntas y responsable y estatus de ese momento', () => {
  const normCol = (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim();
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: normCol }, {});
  const d = (s) => new Date(s);
  const hojas = {
    'LINEAS TELEFONICAS': [{ ID: 'EQU-00000000AAAAAA', NUCO: '0234', TIPO: 'EQUIPO + SIM', RESPONSABLE: '', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'DISPONIBLE' }],
    // Una edición del AppSheet: dos campos con un minuto de diferencia, la misma persona
    'CAMBIOS LINEAS TELEFONICAS': [
      { ID: 'CLI-1', ID_LINEA: 'EQU-00000000AAAAAA', CAMPO: 'ESTATUS EQUIPO', ANTES: 'RESGUARDO', DESPUES: 'USO', 'ACTUALIZADO POR': 'BREN', 'FECHA ACTUALIZACION': d('2025-04-22T10:00:00') },
      { ID: 'CLI-2', ID_LINEA: 'EQU-00000000AAAAAA', CAMPO: 'IMEI', ANTES: '1', DESPUES: '2', 'ACTUALIZADO POR': 'BREN', 'FECHA ACTUALIZACION': d('2025-04-22T10:01:00') },
    ],
    'INSPECCIONES LINEAS': [], 'RESPONSIVAS LINEAS': [], APP_EVIDENCIAS: [], APP_MOVIMIENTOS: [],
    MOVIMIENTOS: [
      { ID: 'MVT-1', FECHA: d('2026-10-01T09:00:00'), ACCION: 'REASIGNACION', 'ID EQUIPO': 'EQU-00000000AAAAAA', 'ID LINEA': 'LIN-00000000BBBBBB',
        COMENTARIO: 'CAMBIO DE AREA', TICKET: '101751', CAMBIOS: JSON.stringify([{ campo: 'RESPONSABLE', antes: 'LUIS', despues: 'ANA' }]), QUIEN: 'EMMANUEL · e@x.mx', ORIGEN: 'A MANO' },
      { ID: 'MVT-2', FECHA: d('2026-10-04T09:00:00'), ACCION: 'RESGUARDO', 'ID EQUIPO': 'EQU-00000000AAAAAA', 'ID LINEA': 'LIN-00000000BBBBBB',
        COMENTARIO: 'BAJA', TICKET: '', QUIEN: 'EMMANUEL · e@x.mx', ORIGEN: 'A MANO',
        CAMBIOS: JSON.stringify([{ campo: 'ESTATUS EQUIPO', antes: 'USO', despues: 'RESGUARDO' }, { campo: 'ESTATUS LINEA', antes: 'USO', despues: 'DISPONIBLE' }, { campo: 'RESPONSABLE', antes: 'ANA', despues: '' }]) },
      // De otro equipo: no sale
      { ID: 'MVT-3', FECHA: d('2026-10-04T10:00:00'), ACCION: 'EDICION', 'ID EQUIPO': 'EQU-00000001CCCCCC', COMENTARIO: 'X', CAMBIOS: '' },
    ],
  };
  const Repo = new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', read('src/services/lineas/LineasRepo.gs') + '\nreturn LineasRepo;')(
    Util, datosDePrueba_(hojas), { puntos: () => [] }, { formatDate: (f) => f.toISOString().slice(0, 10) });
  const h = Repo.historialDeRegistro('EQU-00000000AAAAAA', true).eventos;
  assert.deepEqual(h.map((e) => e.movimiento), ['Resguardo', 'Reasignación', 'Cambio de estatus']);
  // De ese momento: después del resguardo, sin persona; después de la reasignación, ANA en USO; después de la edición, LUIS
  assert.deepEqual(h.map((e) => [e.responsable, e.estatusEquipo, e.estatusLinea]), [['', 'RESGUARDO', 'DISPONIBLE'], ['ANA', 'USO', 'USO'], ['LUIS', 'USO', 'USO']]);
  assert.equal(h[1].comentario, 'CAMBIO DE AREA');
  assert.equal(h[1].ticket, '101751');
  assert.equal(h[1].usuario, 'EMMANUEL');
  assert.equal(h[1].origen, 'Nuevo sistema');
  assert.equal(h[2].cambios.length, 2);
  assert.equal(h[2].origen, 'AppSheet');

  // Con las hojas nuevas, registrarMovimiento escribe en MOVIMIENTOS (sin el nombre de la acción en el comentario)
  const src = read('src/services/lineas/LineasRepo.gs');
  assert.match(src, /MOVIMIENTOS: \['ID', 'FECHA', 'ACCION', 'ID EQUIPO', 'ID LINEA', 'ID ASIGNACION', 'COMENTARIO', 'TICKET', 'DOCUMENTO', 'CAMBIOS', 'QUIEN', 'ORIGEN'\]/);
  assert.match(src, /if \(typeof LineasLectura !== 'undefined' && LineasLectura\.activo\(\)\) return registrarEnMovimientos_\(/);
  const escritas = [];
  const datosMov = { existeTabla: () => true, normCol: normCol, agregarFilas: (t, filas) => { escritas.push([t, filas[0]]); return [2]; } };
  const Repo2 = new Function('LineasUtil', 'LineasDatos', 'LineasChecklist', 'Utilities', 'LineasLectura', 'LineasEscritura', 'Ids', src + '\nreturn LineasRepo;')(
    Util, datosMov, { puntos: () => [] }, {}, { activo: () => true, filas: () => [] },
    { hojasEnMemoria: () => ({ EQUIPOS: [{ ID: 'EQU-1' }], LINEAS: [{ ID: 'LIN-1' }], ASIGNACIONES: [{ ID: 'ASG-1' }, { ID: 'ASG-2' }], ADENDUMS: [] }) },
    { nuevo: (p) => p + '-NUEVO' });
  Repo2.registrarMovimiento('RESGUARDO', { motivo: 'BAJA', ticket: '' }, { nombre: 'EMMANUEL', correo: 'e@x.mx' }, d('2026-10-04T09:00:00'), {
    refs: ['EQU-1', 'EQU-1', 'LIN-1', 'ASG-1', 'ASG-2'], detalle: { cambios: [{ campo: 'ESTATUS EQUIPO', antes: 'USO', despues: 'RESGUARDO' }] } });
  assert.equal(escritas[0][0], 'MOVIMIENTOS');
  const fila = escritas[0][1];
  assert.equal(fila.ID, 'MVT-NUEVO');
  assert.equal(fila.ACCION, 'RESGUARDO');
  assert.equal(fila['ID EQUIPO'], 'EQU-1');
  assert.equal(fila['ID LINEA'], 'LIN-1');
  assert.equal(fila['ID ASIGNACION'], 'ASG-1, ASG-2');
  assert.equal(fila.COMENTARIO, 'BAJA');
  assert.equal(fila.QUIEN, 'EMMANUEL · e@x.mx');
  assert.equal(fila.ORIGEN, 'A MANO');
  assert.deepEqual(JSON.parse(fila.CAMBIOS), [{ campo: 'ESTATUS EQUIPO', antes: 'USO', despues: 'RESGUARDO' }]);
  // Las acciones guardan solo el comentario
  ['LineasAcciones', 'LineasCaptura', 'LineasRegistros', 'LineasResguardos'].forEach((f) => {
    assert.doesNotMatch(read('src/services/lineas/' + f + '.gs'), /motivo: '(Reasignar|Inspección|Responsiva|Alta de registro|Corrección|Mandar a cancelación): '/, f);
  });
});

test('Mandar a cancelación: textos técnicos y espera desde el clic (prueba del 4-oct)', () => {
  const cliente = read('src/html/js/lineas.html');
  const cuerpo = cliente.slice(cliente.indexOf('async function abrirCancelacion'), cliente.indexOf('// ---- Alta y edición directa del inventario'));
  assert.match(cuerpo, /espera: 'Mandando a cancelación',\s*alConfirmar: \(datos\) => llamar\('apiLineasMandarCancelacion'/);
  assert.doesNotMatch(cuerpo, /queda en el historial|\(opcional\)|Quedan EN PROCESO/);
  // pedirDatos se queda con la espera hasta que termina y, si falla, "Volver" regresa a lo capturado
  assert.match(cliente, /pintarEspera\(o\.espera \|\| 'Guardando', 'No cierres esta ventana\.'\);/);
  assert.match(cliente, /pintarEspera\('No se pudo guardar', mensajeError\(e\), true\);/);
});

test('el calentador (Calentador.gs) solo llama lo que cada servicio expone', () => {
  const calentador = read('src/Calentador.gs');
  const llamadas = [...calentador.matchAll(/\(\) => (\w+)\.(\w+)\(/g)].map((m) => [m[1], m[2]]);
  assert.ok(llamadas.length >= 10, 'el calentador tiene sus pasos');
  const servicios = filesBelow(path.join(root, 'src/services')).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(f, 'utf8'));
  const faltan = llamadas.filter(([obj, fn]) => {
    const archivo = servicios.find((t) => t.includes('const ' + obj + ' = (function'));
    return !archivo || !new RegExp('\\b' + fn + '\\b\\s*[:,]').test(archivo.slice(archivo.lastIndexOf('return {')));
  }).map((x) => x.join('.'));
  assert.deepEqual(faltan, []);
  // Es una función de nivel superior: con candado, para que nadie la dispare desde el navegador
  assert.match(calentador, /function calentarCaches\(\) \{\s*soloEditor_\(\);/);
});

test('la sección de sensor de Vehículos: la pantalla y el servidor bloquean los mismos campos', () => {
  const app = read('src/html/js/app.html');
  const enPantalla = app.split(/\r?\n/).filter((l) => l.includes('...DE_SENSORES') || /opciones: \['SI', 'NO'\], \.\.\.DE_SENSORES/.test(l))
    .map((l) => (/clave: '([^']+)'/.exec(l) || [])[1]).filter(Boolean);
  // LLAVE DUPLICADA ocupa dos renglones: su clave va en el renglón de arriba
  if (/clave: 'LLAVE DUPLICADA'[\s\S]{0,200}\.\.\.DE_SENSORES/.test(app)) enPantalla.push('LLAVE DUPLICADA');
  const servidor = JSON.parse(/deOtroModulo: \{ 'instalacion-sensores': (\[[^\]]+\]) \}/.exec(read('src/services/VehiculosService.gs'))[1].replace(/'/g, '"'));
  assert.deepEqual([...new Set(enPantalla)].sort(), servidor.slice().sort());
});

test('las fichas van en una llamada y piden lo de otro módulo solo si la persona lo puede ver', () => {
  // Cada ficha: su función en el cliente y su función del servidor. El cliente pide UNA cosa
  // (callServerListaCacheada) y nada suelto; el servidor arma cada pestaña con parte('modulo', …),
  // que la deja en null sin permiso (su pestaña no aparece), y la anota en FICHAS_GUARDADAS para
  // que un guardado borre su copia.
  const FICHAS = [
    { archivo: 'src/html/js/app.html', funcion: 'abrirFichaVehiculo', servidor: 'apiFichaVehiculo' },
    { archivo: 'src/html/js/app-cajachica.html', funcion: 'abrirFichaCajaChica', servidor: 'apiFichaCajaChica' },
  ];
  const api = read('src/ClientApi.gs');
  const guardadas = /const FICHAS_GUARDADAS = \[([^\]]*)\]/.exec(read('src/html/js/api.html'))[1];
  FICHAS.forEach((f) => {
    const i = api.indexOf('function ' + f.servidor + '(');
    assert.ok(i >= 0, f.servidor + ' existe');
    const cuerpo = api.slice(i, api.indexOf('\n}', i));
    const sueltas = cuerpo.split(/\r?\n/).filter((l) => /Service\.listarPor\w+\(/.test(l) && !/parte\('[a-z-]+'/.test(l));
    assert.deepEqual(sueltas, [], f.servidor + ': cada pestaña va con parte(modulo, …)');
    const texto = read(f.archivo);
    const desde = texto.indexOf('async function ' + f.funcion + '(');
    const funcion = texto.slice(desde, texto.indexOf('\n    }\n', desde) > 0 ? texto.indexOf('\n    }\n', desde) : texto.indexOf('\n    }\r\n', desde));
    assert.match(funcion, new RegExp("callServerListaCacheada\\('" + f.servidor + "'"), f.funcion + ' pide ' + f.servidor);
    assert.doesNotMatch(funcion, /callServer\('api/, f.funcion + ': nada más suelto');
    assert.ok(guardadas.includes("'" + f.servidor + "'"), f.servidor + ' está en FICHAS_GUARDADAS (api.html)');
  });
});

test('lo que el catálogo de módulos dice que implica un permiso es lo que hace el servidor', () => {
  // Modulos.gs (referencia / editaEn) lo usa la pantalla de permisos para explicarlo; el servidor
  // lo hace con referencia: true / puedeLeerFamilia y deOtroModulo. Si uno cambia sin el otro, la
  // pantalla explicaría algo que no pasa (o callaría algo que sí).
  const ctx = {};
  require('vm').runInNewContext(read('src/config/Modulos.gs') + '\n;this.G = Modulos.GRUPOS;', ctx);
  const catalogo = ctx.G.reduce((t, g) => t.concat(g.modulos), []);
  const servicios = filesBelow(path.join(root, 'src/services')).filter((f) => f.endsWith('.gs')).map((f) => fs.readFileSync(f, 'utf8'));
  const moduloDe = (texto) => (/modulo:\s*'([a-z-]+)'/.exec(texto) || [])[1];

  const referenciasCatalogo = catalogo.filter((m) => m.referencia).map((m) => m.id).sort();
  const referenciasServidor = new Set();
  servicios.forEach((t) => {
    if (/referencia: true/.test(t)) referenciasServidor.add(moduloDe(t));
    [...t.matchAll(/puedeLeerFamilia\(token, '([a-z-]+)'\)/g)].forEach((m) => referenciasServidor.add(m[1]));
  });
  assert.deepEqual([...referenciasServidor].sort(), referenciasCatalogo, 'referencia en Modulos.gs = referencia: true / puedeLeerFamilia en el servidor');

  const editaCatalogo = catalogo.reduce((t, m) => t.concat((m.editaEn || []).map((e) => m.id + ' → ' + e.modulo)), []).sort();
  const editaServidor = [];
  servicios.forEach((t) => {
    [...t.matchAll(/deOtroModulo: \{([^}]*)\}/g)].forEach((m) => {
      [...m[1].matchAll(/'([a-z-]+)':/g)].forEach((x) => editaServidor.push(x[1] + ' → ' + moduloDe(t)));
    });
  });
  assert.deepEqual(editaServidor.sort(), editaCatalogo, 'editaEn en Modulos.gs = deOtroModulo en el servidor');
});

test('revisarEntorno revisa cada libro y carpeta que la app lee de Entornos.gs', () => {
  // Una carpeta nueva en Config.gs que no esté en la revisión puede apuntar a donde sea sin que
  // nada avise antes de desplegar (6-oct: REPORTES en pruebas, las fotos de inspección en la raíz)
  const config = read('src/config/Config.gs');
  const diag = read('src/Diagnostico.gs');
  const claves = [...new Set([...config.matchAll(/(?:required|leerConfig_)\('((?:SS_ID|DRIVE_FOLDER_ID)_\w+)'\)/g)].map((m) => m[1]))];
  const revisadas = /const REVISION_LIBROS = \[([^\]]*)\]/.exec(diag)[1] + /const REVISION_CARPETAS = \{([\s\S]*?)\n\};/.exec(diag)[1];
  assert.deepEqual(claves.filter((k) => !new RegExp('\\b' + k + '\\b').test(revisadas)), []);
  assert.match(read('src/Code.gs'), /revisar === 'entorno'/, 'doGet contesta la revisión que pide subir.js');
  assert.match(read('tools/subir/subir.js'), /entorno\.revisar\(/, 'subir.js revisa el entorno antes de desplegar');
});

test('revisarEntorno revisa que la cuenta que despliega pueda copiar cada plantilla de PDF', () => {
  // La app corre con la cuenta que despliega: si no puede copiar una plantilla, ese PDF no sale para nadie
  // (8-oct: inspecciones sin PDF). Cada servicio con una plantilla fija la exporta y revisionPlantillas_ la pide.
  const revision = /function revisionPlantillas_\(\) \{([\s\S]*?)\n\}/.exec(read('src/Diagnostico.gs'))[1];
  const faltan = [];
  filesBelow(path.join(root, 'src/services')).filter((f) => f.endsWith('.gs')).forEach((f) => {
    const texto = fs.readFileSync(f, 'utf8');
    if (!/const PLANTILLA\w* = '[\w-]{25,}'/.test(texto) && !/const PLANTILLAS = \{/.test(texto)) return;
    const servicio = /^const (\w+) = \(function/m.exec(texto)[1];
    if (!new RegExp('\\b' + servicio + '\\.PLANTILLAS?\\b').test(revision)) faltan.push(servicio);
  });
  assert.deepEqual(faltan, [], 'servicios con plantilla que no están en revisionPlantillas_ (Diagnostico.gs)');
  assert.match(revision, /InspeccionesService\.plantillas\(\)/, 'las plantillas de MODELOS INSPECCION');
  assert.match(read('tools/subir/subir.js'), /GITHUB_ACTIONS/, 'a prod se despliega solo desde la Action');
});

test('cada archivo que la gente sube o genera dice quién lo subió (DriveUtils.marcarAutor)', () => {
  // La app corre como quien la desplegó: sin la nota, Drive dice que todo es de esa cuenta.
  // Fuera: herramientas del editor (respaldos, correcciones, configuración inicial).
  const HERRAMIENTAS = ['LineasAdmin.gs', 'LineasCorrecciones.gs', 'SetupInicial.gs'];
  const sinAutor = [];
  filesBelow(path.join(root, 'src')).filter((f) => f.endsWith('.gs') && !HERRAMIENTAS.includes(path.basename(f))).forEach((f) => {
    fs.readFileSync(f, 'utf8').split('\n').forEach((linea, i) => {
      if (/\.createFile\(/.test(linea) && !/marcarAutor\(/.test(linea)) sinAutor.push(path.basename(f) + ':' + (i + 1));
    });
  });
  assert.deepEqual(sinAutor, []);
});

test('las carpetas de los servicios se buscan por nombre en la raíz, no con un ID fijo', () => {
  // Un ID fijo no cambia por proyecto: los DEV escribían en producción, y uno que apuntaba a la
  // copia de pruebas hacía que producción escribiera en pruebas (FIRMA EXTERNA de Arqueos, 6-oct).
  const servicios = filesBelow(path.join(root, 'src/services')).filter((f) => f.endsWith('.gs'));
  const fijos = [];
  const nombres = new Set();
  servicios.forEach((f) => {
    const texto = fs.readFileSync(f, 'utf8');
    for (const m of texto.matchAll(/const (\w*(?:CARPETA|FOLDER)\w*) = '([\w-]{25,})'/g)) fijos.push(path.basename(f) + ' ' + m[1]);
    for (const m of texto.matchAll(/carpetaEnRaiz\('([^']+)'\)/g)) nombres.add(m[1]);
    // const CARPETA_X = 'NOMBRE' que luego se pasa a carpetaEnRaiz(CARPETA_X)
    for (const m of texto.matchAll(/const (CARPETA_\w+) = '([^']+)'/g)) {
      if (new RegExp('carpetaEnRaiz\\([^\\n]*\\b' + m[1] + '\\b').test(texto)) nombres.add(m[2]);
    }
  });
  assert.deepEqual(fijos, [], 'carpetas con ID fijo (usa DriveUtils.carpetaEnRaiz)');
  // Y revisarEntorno sabe de cada una: en producción tienen que existir antes de desplegar
  const revisadas = /const REVISION_EN_RAIZ = \[([\s\S]*?)\];/.exec(read('src/Diagnostico.gs'))[1];
  assert.deepEqual([...nombres].filter((n) => !revisadas.includes("'" + n + "'")), [], 'en REVISION_EN_RAIZ (Diagnostico.gs)');
  // 7 desde el 8-oct-2026: Responsiva y Adherente ya guardan en el expediente del NUCO (ExpedienteNuco), no en la raíz
  assert.ok(nombres.size >= 7, 'encontró las carpetas que se usan (' + [...nombres].join(', ') + ')');
});

test('una vista que se puede apagar por proyecto (MODULOS_APAGADOS) se apaga también en el servidor', () => {
  // El menú solo esconde: si una llamada del módulo no revisa Config.exigirEncendido, se usa desde la consola
  const api = read('src/ClientApi.gs');
  const llamadas = [...api.matchAll(/function (apiHelpdesk\w+)\([^)]*\) \{([^}]*)\}/g)];
  assert.ok(llamadas.length >= 9, 'encontró las llamadas de Help Desk (' + llamadas.length + ')');
  const sinRevisar = llamadas
    .filter((m) => !m[2].includes("Config.exigirEncendido('helpdesk')")).map((m) => m[1]);
  assert.deepEqual(sinRevisar, [], 'llamadas de Help Desk sin Config.exigirEncendido');
  assert.ok(read('src/html/Index.html').includes('<body data-apagados="<?= apagados ?>">'), 'Index.html pasa la lista al menú');
  assert.ok(read('src/Router.gs').includes('template.apagados = JSON.stringify(Config.apagados())'), 'Router llena la lista');
});

test('los documentos del vehículo se guardan en el expediente de su NUCO (ExpedienteNuco), no en carpetas sueltas', () => {
  // 8-oct-2026: NUCOS VEHICULOS quedó ordenada (docs/nucos-expediente.md). Si un servicio vuelve a guardar en una carpeta
  // de la raíz, lo nuevo se desordena otra vez.
  const veh = read('src/services/VehiculosService.gs');
  const campos = /const CAMPOS_ARCHIVO = \[([^\]]*)\]/.exec(veh)[1].match(/'[^']+'/g).map((x) => x.slice(1, -1));
  const doc = /const DOCUMENTO_DE = \{([\s\S]*?)\};/.exec(veh)[1];
  assert.deepEqual(campos.filter((c) => !doc.includes("'" + c + "'")), [], 'cada columna de archivo de Vehículos tiene su documento');
  assert.match(veh, /despues: \(registro, ctx\) => \{\s*archivarEnExpediente_\(/, 'Vehículos archiva al guardar (crear y actualizar)');
  for (const f of ['ResponsivaVehicularService.gs', 'AdherenteVehicularService.gs']) {
    const s = read('src/services/' + f);
    assert.match(s, /ExpedienteNuco\.carpeta\(/, f + ' genera el PDF en el expediente');
    assert.match(s, /ExpedienteNuco\.archivar\(/, f + ' le pone su nombre y aparta el vigente');
    assert.doesNotMatch(s, /RESPONSIVAS_VEHICULARES'|'ADHERENTES VEHICULAR'/, f + ' ya no usa la carpeta vieja');
  }
});
