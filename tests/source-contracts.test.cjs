const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

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
  const lineas = app.slice(app.indexOf("id: 'lineas'"), app.indexOf("id: 'gestion-activos'"));
  assert.equal((lineas.match(/Inventario de Accesorios/g) || []).length, 1);
  // Panorama primero (29-sep). Fuera del menú (líneas comentadas) pero sus vistas se siguen montando: Reactivación
  // (29-sep) y Reasignaciones, Solicitud, Control de Cambios y Bitácora de Desechos (reunión con Líneas, 30-sep)
  const orden = ['panorama-lineas', 'lineas-telefonicas', 'resguardos-lineas', 'accesorios-lineas'];
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
  assert.match(app, /\{ id: 'gestion-activos', vista: 'gestion-activos', icono: 'contact', etiqueta: 'Gestión de Activos' \}/);
  assert.match(app, /grupo\.vista \? `/);
  orden.concat('gestion-activos', ocultos)
    .forEach((route) => assert.match(app, new RegExp(`vista === '${route}'`), `falta montar ${route}`));
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
  assert.match(admin, /if \(id !== LINEAS_DEV_SPREADSHEET_ID\) throw new Error/);
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
  assert.match(lineas, /\(id \? ' Guardar cambios' : ' Registrar'\)/);
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
  const cuerpo = reg.slice(reg.indexOf('function elementos_'), reg.indexOf('DATOS DEL SISTEMA NUEVO'));
  const directos = [...cuerpo.matchAll(/campo_\('([^']+)'|lista\('([^']+)'/g)].map((m) => m[1] || m[2]);
  const orden = ['FOLIO', 'TIPO', 'NUMERO TELEFONO', 'NUCO', 'EQUIPO', 'NO EMPLEADO', 'ESTATUS GENERAL', 'RESPONSABLE', 'PUESTO',
    'RESPONSABLE USA EL EQUIPO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA', 'IMEI', 'NUMERO SIM', 'ACCESORIOS', 'SEDE', 'OFICINA / DESARROLLO',
    'DEPARTAMENTO', 'AREA', 'JEFE DIRECTO', 'DIRECTOR', 'RAZON SOCIAL', 'PIN WHATSAPP', 'PIN EQUIPO', 'CUENTA GOOGLE', 'COMPAÑIA',
    'COSTO PLAN', 'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'ESTATUS EQUIPO', 'FECHA INSPECCION', 'COMENTARIOS'];
  // RESPONSIVA y FORMATO INSPECCION (archivos) se quitaron el 28-sep: esos documentos se consultan en NUCOS
  assert.deepEqual(directos.filter((c) => !/ $/.test(c)), orden);
  assert.doesNotMatch(reg, /'archivo'|guardarComoAppSheet|subirArchivos_/);
  assert.match(reg, /responsableExtra\('QUINTO', 'CUARTO RESPONSABLE', 'QUINTO RESPONSABLE'\)/);
  assert.match(reg, /PIN_EQ: 'INGRESE UN VALOR VALIDO, Y NO MAYOR A 6 CARACTERES'/);
  assert.match(reg, /mostrar: \{ nuevo: true \}, requerido: \{ nuevo: true \}/);
  // Simulación: un alta de EQUIPO toma los valores iniciales "NO APLICA" y valida mayúsculas
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    reg + '; return LineasRegistros;')(
    { CATALOGO: { tipos: ['EQUIPO', 'LINEA'], estatusLinea: ['USO'], estatusEquipo: ['USO'] } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-09-24' }, {}, {}, LineasUtil);
  const ctx = { nuevo: true, nucoRepetido: () => false, telefonoRepetido: () => false };
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, ctx);
  const r = Reg._resolver(els, {}, { TIPO: 'EQUIPO', NUCO: '12', RESPONSABLE: 'juan', 'INICIO PLAN': '2026-09-01', 'FIN PLAN': '2027-09-01' }, ctx);
  assert.equal(r.valores['NUMERO TELEFONO'], 'NO APLICA');
  assert.equal(r.valores['NUMERO SIM'], 'NO APLICA');
  assert.ok(r.errores.some((e) => /RESPONSABLE: ESCRIBIR EN MAYUSCULAS/.test(e)));
  // NUCO homologado: el formulario lo muestra a 4 dígitos y se guarda así
  const edicion = Reg._elementos({ NUCO: 5 }, {}, { correo: 'x@y.z' }, Object.assign({}, ctx, { nuevo: false }));
  assert.equal(edicion.filter((e) => e.columna === 'NUCO')[0].valor, '0005');
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
  const orden = (desde, hasta) => [...captura.slice(captura.indexOf(desde), captura.indexOf(hasta)).matchAll(/(?:campo_|ro|ed)\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(orden('function formularioInspeccion_', 'const agregarSeccion'), ['FECHA DE REGISTRO', 'ID', 'ID LINEA', 'NUCO', 'RESPONSABLE',
    'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'PUESTO', 'JEFE DIRECTO', 'CORREO', 'TIPO', 'No TELEFONO', 'IMEI', 'SIM', 'MODELO',
    'COLOR', 'COMPAÑIA', 'PLAN', 'RAZON SOCIAL']);
  assert.deepEqual(orden('function formularioResponsiva_', 'function ocultarSecretos_').filter((c) => c !== 'columna'), ['ID', 'ID LINEA', 'NUCO', 'No EMPLEADO', 'DIA', 'MES', 'AÑO',
    'RESPONSABLE', 'IDENTIFICACION', 'RAZON SOCIAL', 'FECHA RESPONSIVA', 'SEDE', 'OFICINA / DESARROLLO', 'AREA', 'PUESTO', 'DIRECTOR', 'CORREO',
    'No TELEFONO', 'COMPAÑIA', 'DEPARTAMENTO', 'MODELO', 'SIM', 'IMEI', 'COLOR', 'ACCESORIOS', 'PIN WHATSAPP', 'PIN EQUIPO', 'CONTRASEÑA',
    'OBSERVACIONES', 'FIRMA RESPONSABLE', 'NOMBRE CI', 'FIRMA CI']);
  assert.match(captura, /'MES', 'MES', 'lista', \{ valor: mes, requerido: 'SIEMPRE', literal: true, opciones: MESES \}/);
  assert.match(captura, /'Septiembre'/);
  assert.match(captura, /'FECHA RESPONSIVA': '', 'TIPO CONTRASEÑA': ''/);
  assert.doesNotMatch(captura, /ESTATUS EQUIPO/);
  assert.doesNotMatch(captura, /'RESPONSIVA': urlArchivo_/);
});

test('la inspección replica el bot ACTUALIZAR DESDE INSPECCION', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const copia = captura.slice(captura.indexOf('const COPIA_INSPECCION_A_LINEA'), captura.indexOf('function guardarInspeccion'));
  assert.deepEqual([...copia.matchAll(/\['([^']+)', '([^']+)'\]/g)].map((m) => m[1]), ['RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE',
    'OFICINA / DESARROLLO', 'PUESTO', 'JEFE DIRECTO', 'CUENTA GOOGLE', 'PIN WHATSAPP', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM']);
  assert.match(captura, /'FECHA INSPECCION': new Date\(/);
  assert.match(captura, /LineasRepo\.guardarCambiosRegistro\(obj\.fila, copia, usuario, ahora\)/);
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

test('el shell es el de la rama jorge con solo el grupo de Líneas', () => {
  const index = read('src/html/Index.html');
  const app = read('src/html/js/app.html');
  assert.match(index, /include\('html\/js\/componentes\/datatable'\)/);
  assert.ok(index.indexOf("include('html/js/componentes/datatable')") < index.indexOf("include('html/js/lineas')"),
    'lineas.html debe cargarse después de la librería de componentes');
  const grupos = /const NAV_GRUPOS = \[([\s\S]*?)\n  \];/.exec(app)[1];
  assert.deepEqual([...grupos.matchAll(/^      id: '([^']+)'/gm)].map((m) => m[1]), ['lineas']);
  for (const ajeno of ['initVehiculos', 'initIncidencias', 'initUber', 'initTickets', 'initAccesorios(']) {
    assert.ok(!app.includes(ajeno), 'app.html no debe traer el módulo ' + ajeno);
  }
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
  const control = (src, columna) => (new RegExp(`campo_\\('${columna.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}', '[^']+', '([a-zA-Z]+)'`).exec(src) || [])[1];
  ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA', 'JEFE DIRECTO', 'DIRECTOR', 'COLOR']
    .forEach((c) => assert.equal(control(reg, c), 'listaAbierta', 'LINEAS ' + c));
  ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'MODELO', 'COMPAÑIA', 'RAZON SOCIAL', 'OTRA', 'IDENTIFICACION']
    .forEach((c) => assert.equal(control(cap, c), 'listaAbierta', 'captura ' + c));
  ['TIPO', 'DIA', 'MES', 'AÑO'].forEach((c) => assert.equal(control(cap, c), 'lista', 'captura ' + c));
  assert.match(repo, /catalogos_telefonia_v4/);
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
  assert.match(estilos, /\.ln-modulo \.stat-tile::before \{/);
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
  // Menú en celular: archivo aparte, incluido al final
  assert.match(index, /include\('html\/shell-movil'\)/);
  assert.match(movil, /@media \(max-width: 900px\)/);
  assert.match(movil, /shell-menu-abierto/);
  // Ficha: resumen rápido + pestañas; Documentos con indicadores y tabla, como Historial
  assert.match(lineas, /function fichaEnPestanas\(general, detalles, conDocumentos\)/);
  assert.match(lineas, /class="ln-resumen-rapido"/);
  assert.match(lineas, /function pintarDocumentos\(cont, inspecciones, responsivas, id\)/);
  // Formularios por pasos con el mismo marcado del componente Formulario
  const pasos = lineas.slice(lineas.indexOf('const PASOS_FORMULARIO'), lineas.indexOf('function repartirEnPasos'));
  ['INSPECCION', 'RESPONSIVA', 'REGISTRO', 'SOLICITUD'].forEach((k) => assert.ok(pasos.includes(k + ': ['), k));
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
  // Cambio rápido de estatus con las listas del AppSheet
  assert.match(lineas, /texto: 'Cambiar estatus', alHacer: \(\) => abrirCambioEstatus\(\) \}/);   // en el ⋮ de la ficha
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(reg, /function cambiarEstatus\(id, datos, usuario\)/);
  assert.match(reg, /LineasRepo\.CATALOGO\.estatusEquipo\], \['ESTATUS LINEA'/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasCambiarEstatus\(token, id, datos\)/);
  // Velocidad: sin esperas fijas largas y con datos en memoria
  assert.match(app, /\}, 180\);/);
  assert.doesNotMatch(app, /\}, 2500\);/);
  assert.match(lineas, /memoria\.tablas\[clave\] = texto;/);
  assert.match(lineas, /function cargarCatalogos\(forzar\)/);
  // PDF: la firma recortada cabe en 160 × 70
  assert.match(read('src/services/lineas/LineasPdf.gs'), /Math\.min\(1, 160 \/ ancho, 70 \/ alto\)/);
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
  assert.match(dt, /if \(cfg\.exportar\.descargar\) \{/);
  const xl = read('src/html/js/componentes/exportar-excel.html');
  assert.match(xl, /return \{ descargar, descargarLibro \};/);
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
  const mod = new Function('LineasDatos', 'Utilities', 'LineasRepo', read('src/services/lineas/LineasExportar.gs') + '\nreturn LineasExportar;')(LineasDatos, Utilities, LineasRepo);
  const operador = mod.baseCompleta('CAMBIOS', false).hojas[0];
  assert.deepEqual(operador.columnas.map((c) => c.tipo), ['texto', 'texto', 'texto', 'texto', 'texto', 'fecha', 'fechaHora', 'numero']);
  assert.equal(operador.filas.length, 2);   // la fila vacía no se exporta
  assert.deepEqual(operador.filas[0], ['A1', '350000000000001', 'PIN EQUIPO', '••••', '••••', '2026-09-24', '2026-09-24T10:30:00', 3]);
  assert.deepEqual(operador.filas[1].slice(3, 5), ['ANA', 'LUIS']);
  assert.deepEqual(mod.baseCompleta('CAMBIOS', true).hojas[0].filas[0].slice(3, 5), ['1234', '5678']);
  assert.equal(mod.baseCompleta('ACCESORIOS', false).hojas.length, 2);
  assert.throws(() => mod.baseCompleta('OTRO', false), /desconocido/);
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

test('Drive: todo en la carpeta de la app AppSheet con sus rutas; NUCOS de producción solo se lee', () => {
  // Servidor: resuelve "TABLA_Files_/archivo" caminando desde la carpeta de la app y guarda con el nombre del AppSheet
  const creados = [];
  const carpeta = (id, sub, archivos) => ({
    getId: () => id,
    getFoldersByName: (n) => { const c = (sub || {})[n]; return { hasNext: () => !!c, next: () => c }; },
    getFilesByName: (n) => { const f = (archivos || {})[n]; return { hasNext: () => !!f, next: () => f }; },
    createFolder: (n) => { const c = carpeta('NUEVA-' + n); (sub || {})[n] = c; return c; },
    createFile: (blob) => { creados.push({ carpeta: id, nombre: blob.nombre, mime: blob.mime }); return { getId: () => 'F' + creados.length }; },
  });
  const archivo = { getId: () => 'ARCH1', getName: () => 'a1.EVIDENCIA.1.jpg', getUrl: () => 'https://drive.google.com/file/d/ARCH1/view' };
  const raiz = carpeta('RAIZ', { 'BITACORA DE DESECHO_Files_': carpeta('DES', {}, { 'a1.EVIDENCIA.1.jpg': archivo }) });
  const memoria = {};
  const globales = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    CacheService: { getScriptCache: () => ({ get: (k) => memoria[k] || null, put: (k, v) => { memoria[k] = v; } }) },
    Utilities: {
      base64EncodeWebSafe: (b) => String(b), computeDigest: (a, t) => t, DigestAlgorithm: {}, Charset: {},
      base64Decode: () => [1, 2, 3], newBlob: (bytes, mime, nombre) => ({ mime, nombre }), formatDate: () => '101530',
    },
    DriveApp: { getFolderById: () => raiz },
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
  assert.equal(typeof LA.escribeEnProduccion, 'undefined');   // nunca se escribe en NUCOS

  // Rutas del AppSheet al guardar: PDF (acciones GUARDAR de sus bots), desechos y archivos de LINEAS
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /carpeta: 'INSPECCIONES_Files_', nombre: \(id\) => 'INSPECCION - ' \+ id \+ '\.pdf', columna: 'FORMATO INSPECCIONES LINEAS'/);
  assert.match(captura, /carpeta: 'Files', nombre: \(id\) => 'RESPONSIVA' \+ id \+ '\.pdf', columna: 'FORMATO RESPONSIVA'/);
  assert.match(captura, /ligarPdf_\(tabla, destino\.columna, ids, pdf, destino\.carpeta \+ '\/' \+ nombre\)/);
  // Fotos de inspección en la carpeta de la app; cancelar solo borra la carpeta que creó el mismo usuario
  const ev = read('src/services/lineas/LineasEvidencias.gs');
  assert.match(ev, /const CARPETA_FOTOS = 'INSPECCIONES LINEAS_Images';/);
  assert.match(ev, /carpetaUnica_\(LineasArchivos\.carpetaDeApp\(CARPETA_FOTOS\), 'FOTOS ' \+ id\)/);
  assert.match(ev, /if \(!carpetaId \|\| !cache\.get\(claveBorrador_\(correo, carpetaId\)\)\) return \{ ok: false \};/);
  assert.match(read('src/services/lineas/LineasArchivos.gs'), /if \(!carpetaId \|\| !estaDentroDe\(carpetaId, carpetaAppSheetId\(\)\)\)/);
  assert.match(read('src/services/lineas/LineasUtil.gs'), /try \{ return LineasArchivos\.carpetasNucos\(\); \}/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasArchivo\(token, ruta\)/);

  // Cliente: General sin Patrón; Última responsiva / inspección de NUCOS solo en el ⋮ de la ficha (usuario, 30-sep)
  const lineas = read('src/html/js/lineas.html');
  assert.doesNotMatch(lineas, /\['Patrón'/);
  assert.doesNotMatch(lineas, /\['Última responsiva', botonUltimoNucos/);
  assert.match(lineas, /texto: 'Ver última responsiva', alHacer: \(\) => abrirUltimoDesdeMenu\('RESPONSIVA', id\)/);
  // Sin la tarjeta "Registro en la hoja" (ID, folio, fila, estatus general, fechas, comentarios); Tipo en Equipo o Línea
  assert.doesNotMatch(lineas, /tarjetaRegistro|Registro en la hoja|ln-solo-escritorio/);
  assert.match(lineas, /\['Tipo', tipoRegistro\(e\.legado\), true\],/);
  assert.match(lineas, /!e \? \['Tipo', tipoRegistro\(l\.legado\), true\] : null,/);
  assert.doesNotMatch(lineas, /d\.pdfRuta|responsivaRuta|formatoInspeccionRuta|apiLineasResponsiva|apiLineasDocumentosNuco|ln-docs-nucos|totalRotaciones/);
  const servicio = read('src/services/TelefoniaService.gs');
  assert.doesNotMatch(servicio, /pdfRuta|totalRotaciones|LineasArchivos\.imagen\(insp/);
  // Documentos: indicadores que filtran por tipo y una tabla con acciones por fila
  assert.match(lineas, /contarEnPestana\('documentos', filas\.length\);/);
  assert.match(lineas, /etiqueta: 'Inspecciones', titulo: 'Mostrar solo inspecciones', filtros: \{ documento: \{ valores: \['Inspección'\] \} \}/);
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
  assert.match(read('src/services/TelefoniaService.gs'), /LineasRepo\.leerInspeccion\(id\) \|\| \(\/\^drive_\/\.test\(id\) \? inspeccionNucos_\(id\.slice\(6\)\) : null\)/);
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
  assert.match(servicio, /insp\.pinEquipo = insp\.pinEquipo \? '••••' : null;/);
  // Una inspección de la hoja sin carpeta toma la de NUCOS del mismo día
  assert.match(servicio, /dia_\(x\.doc\.fecha\) === dia_\(insp\.fecha\)/);
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
  assert.match(repo, /const CLAVE_INDICE = 'indice_telefonia_v4';/);
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
    cacheLeer: () => null, cacheGuardar: () => {},
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

  // La edición pide el motivo al cambiar el número o el NUCO, y el historial ofrece el movimiento
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /Escribe el motivo del cambio de número o NUCO/);
  // El campo de motivo no es un campo del AppSheet: aplicarReglasEn busca .ln-af-req en cada .ln-af-campo (29-sep)
  assert.match(read('src/html/js/lineas.html'), /<section class="ln-af-seccion ln-af-extra" id="cap-motivo-asignacion" hidden><div class="field"><label for="cap-motivo">/);
  // Una hoja sin las pestañas APP_*: leerFilas no abre una pestaña de la que no se pide ninguna fila
  assert.match(read('src/services/lineas/LineasDatos.gs'), /if \(peticiones\.some\(\(p\) => !p\.filas\.length\)\) \{\s*const leidas = leerFilas\(peticiones\.filter\(\(p\) => p\.filas\.length\)\);/);
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /llamar\('apiLineasAsignaciones', id, vista\)/);
  assert.match(cliente, /equipo: 'Números que ha tenido', linea: 'Equipos en los que ha estado'/);
  // Número / NUCO / IMEI como botón visible que abre la ficha (asignaciones y cambios de línea o equipo)
  assert.match(cliente, /function botonIr\(tipo, id, texto\) \{\s*return '<a href="#" class="ln-ir-chip" data-ln-ir="' \+ tipo/);
  assert.match(cliente, /porNuco && p\.irId \? botonIr\('linea', p\.irId, v\)/);
  assert.match(cliente, /render: valorCambio\('ANTES'\)[\s\S]*render: valorCambio\('DESPUES'\)/);
  assert.match(cliente, /if \(c === 'IMEI'\)/);
  // Los "Sin línea" se pueden ocultar con el filtro, sin quitarlos de los datos
  assert.match(cliente, /return \(a\.periodos \|\| \[\]\)\.filter\(\(p\) => !ocultarSinAsignar \|\| p\[campo\]\)/);
  assert.doesNotMatch(cliente, /el motivo solo existe si se capturó/);
  // Filtro Movimiento agrupado y en orden fijo, con las asignaciones arriba
  assert.match(cliente, /<optgroup label="Historial de asignaciones">/);
  assert.match(cliente, /\['Documentos', \['Inspección', 'Responsiva'\]\]/);
});

test('INICIO / FIN PLAN solo se capturan en el alta; después no se pueden cambiar (29-sep)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil',
    reg + '; return LineasRegistros;')(
    { CATALOGO: { tipos: ['EQUIPO + SIM', 'LINEA'], estatusLinea: ['USO'], estatusEquipo: ['USO'] } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil);
  const ctx = { nuevo: false, nucoRepetido: () => false, telefonoRepetido: () => false };
  const base = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000001', 'INICIO PLAN': '2025-01-01', 'FIN PLAN': '2027-01-01', COMENTARIOS: 'SIN CAMBIOS' };
  const els = Reg._elementos(base, {}, { correo: 'x@y.z' }, ctx);
  const r = Reg._resolver(els, base, Object.assign({}, base, { 'INICIO PLAN': '2026-09-01', 'FIN PLAN': '2030-01-01', COMENTARIOS: 'CAMBIO DE PRUEBA' }), ctx);
  assert.equal(r.valores['FIN PLAN'], '2027-01-01');
  assert.equal(r.valores['INICIO PLAN'], '2025-01-01');
  assert.equal(r.valores.COMENTARIOS, 'CAMBIO DE PRUEBA'); // lo demás sí se edita
  // En el alta sí se toman y son obligatorias
  const alta = Reg._elementos({}, {}, { correo: 'x@y.z' }, Object.assign({}, ctx, { nuevo: true }));
  const ra = Reg._resolver(alta, {}, { TIPO: 'LINEA', 'FIN PLAN': '2028-05-01' }, Object.assign({}, ctx, { nuevo: true }));
  assert.equal(ra.valores['FIN PLAN'], '2028-05-01');
  assert.ok(ra.errores.some((e) => /^INICIO PLAN es obligatorio/.test(e)));
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
  assert.match(read('src/html/js/app.html'), /montarVista\('tpl-notificaciones', Notificaciones\.initVista\)/);
  assert.match(read('src/html/js/lineas.html'), /irARegistro: irARegistro/);
});

test('Acciones masivas de equipos: reasignar desde 2 seleccionados, sin tocar la línea', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const hoja = [
    { _fila: 2, ID: 'a', NUCO: '0001', TIPO: 'EQUIPO + SIM', RESPONSABLE: 'ANA', 'ESTATUS EQUIPO': 'USO', 'ESTATUS LINEA': 'USO', 'NUMERO TELEFONO': '4420000001', 'RESPONSABLE USA EL EQUIPO': 'SI' },
    { _fila: 3, ID: 'b', NUCO: '0002', TIPO: 'EQUIPO', RESPONSABLE: 'LUIS', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'SIN LINEA', 'NUMERO TELEFONO': 'NO APLICA' },
    { _fila: 4, ID: 'c', NUCO: '', TIPO: 'LINEA', RESPONSABLE: 'EVA', 'ESTATUS LINEA': 'USO', 'NUMERO TELEFONO': '4420000003' },
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
    indice: () => ({}),
  };
  const Datos = { leerTabla: () => hoja, conCandado: (fn) => fn(), idsDeFila: (f) => [f.ID] };
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasDatos',
    reg + '; return LineasRegistros;')(Repo, { getScriptCache: () => ({ get: () => '', put: () => {} }) }, { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil, Datos);
  const u = { correo: 'x@y.z', nombre: 'X' };

  // "c" no es equipo → se omite sin error; la línea no se toca
  const r = Reg.accionMasiva('REASIGNAR', ['a', 'c'], { valores: { RESPONSABLE: 'ANA', _MOTIVO: 'CIERRE DE OFICINA' } }, u);
  assert.deepEqual(r.hechos.map((h) => h.id), ['a']);
  assert.deepEqual(r.omitidos.map((o) => o.id), ['c']);
  assert.ok(guardados.every(([, c]) => !('ESTATUS LINEA' in c) && !('NUMERO TELEFONO' in c)));
  assert.deepEqual(movimientos[0], ['EDICION', 'Acción masiva · Reasignar equipos: CIERRE DE OFICINA', ['a']]);
  // "Mandar a resguardo" ya no es acción masiva genérica: tiene su propio flujo (LineasResguardos)
  assert.throws(() => Reg.accionMasiva('RESGUARDO', ['a', 'b'], { valores: { _MOTIVO: 'CIERRE DE OFICINA' } }, u), /desconocida/);

  // Reasignar: responsable obligatorio y "quien usa" sigue al responsable si él usa el equipo
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { _MOTIVO: 'CAMBIO DE AREA' } }, u), /RESPONSABLE es obligatorio/);
  guardados.length = 0;
  Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { RESPONSABLE: 'PEDRO PEREZ', 'NO EMPLEADO': '123', PUESTO: 'GERENTE', _MOTIVO: 'CAMBIO DE AREA' } }, u);
  assert.deepEqual(guardados[0], ['a', { 'ESTATUS EQUIPO': 'RESGUARDO', 'NO EMPLEADO': '123', RESPONSABLE: 'PEDRO PEREZ', PUESTO: 'GERENTE', 'NOMBRE QUIEN USA': 'PEDRO PEREZ', 'PUESTO QUIEN USA': 'GERENTE' }]);
  assert.deepEqual(guardados[1], ['b', { 'ESTATUS EQUIPO': 'RESGUARDO', 'NO EMPLEADO': '123', RESPONSABLE: 'PEDRO PEREZ', PUESTO: 'GERENTE' }]);
  // El estatus no se elige al reasignar: siempre RESGUARDO (aunque llegue otro)
  assert.ok(!Reg._elementosMasivos('REASIGNAR', {}, u).some((e) => e.columna === 'ESTATUS EQUIPO'));
  guardados.length = 0;
  Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { RESPONSABLE: 'PEDRO PEREZ', 'ESTATUS EQUIPO': 'USO', _MOTIVO: 'CAMBIO DE AREA' } }, u);
  assert.ok(guardados.every(([, c]) => c['ESTATUS EQUIPO'] === 'RESGUARDO'));

  // Con uno solo o sin motivo, error
  // Desde el 30-sep se puede reasignar un solo equipo (barra de selección tipo Drive); sin ninguno, error
  assert.throws(() => Reg.accionMasiva('REASIGNAR', [], { valores: { RESPONSABLE: 'ANA', _MOTIVO: 'CIERRE DE OFICINA' } }, u), /al menos un equipo/);
  assert.throws(() => Reg.accionMasiva('REASIGNAR', ['a', 'b'], { valores: { RESPONSABLE: 'ANA' } }, u), /MOTIVO/);
  // "Cancelar equipos" ya no existe (30-sep): los equipos no se cancelan, solo las líneas
  guardados.length = 0;
  assert.throws(() => Reg.accionMasiva('CANCELAR', ['a', 'b'], { valores: { _MOTIVO: 'EQUIPOS OBSOLETOS' } }, u));
  assert.equal(guardados.length, 0);
  assert.doesNotMatch(read('src/html/js/lineas.html'), /clave: 'CANCELAR'/);

  // Cliente (estilo Drive, 30-sep): las acciones salen de accionesSeleccionDe(modulo); Reasignar ya desde 1
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /accionesSeleccion: accionesSeleccionDe\(modulo\),/);
  assert.match(cliente, /alHacer: \(f\) => abrirMasiva\(ACCION_REASIGNAR, f\)/);
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
    registrarMovimiento: () => {}, indice: () => ({}),
  };
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasDatos', reg + '; return LineasRegistros;')(
    Repo, { getScriptCache: () => ({ get: () => '', put: () => {} }) }, { formatDate: () => '2026-09-29' }, {}, {}, LineasUtil,
    { leerTabla: () => hoja, conCandado: (fn) => fn(), idsDeFila: (f) => [f.ID] });
  const u = { correo: 'x@y.z', nombre: 'X' };
  assert.deepEqual(Reg.formularioMasivo('REASIGNAR', u).columnasResponsable, ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'DEPARTAMENTO']);

  // "a" cambia de responsable, "b" solo de puesto, "c" no viene (sin cambios); no pide el responsable común
  const r = Reg.accionMasiva('REASIGNAR', ['a', 'b', 'c'], {
    modo: 'INDIVIDUAL', valores: { _MOTIVO: 'AJUSTE DE PLANTILLA' },
    porEquipo: { a: { RESPONSABLE: 'PEDRO', PUESTO: 'SUPERVISOR' }, b: { RESPONSABLE: 'LUIS', PUESTO: 'DIRECTOR' } },
  }, u);
  assert.deepEqual(guardados, [
    ['a', { 'ESTATUS EQUIPO': 'RESGUARDO', RESPONSABLE: 'PEDRO', PUESTO: 'SUPERVISOR', 'NOMBRE QUIEN USA': 'PEDRO', 'PUESTO QUIEN USA': 'SUPERVISOR' }],
    ['b', { 'ESTATUS EQUIPO': 'RESGUARDO', RESPONSABLE: 'LUIS', PUESTO: 'DIRECTOR' }],
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
  // Menú: Panorama primero; Reactivación se retiró con su pestaña (30-sep)
  const app = read('src/html/js/app.html');
  assert.match(app, /\{ vista: 'panorama-lineas', etiqueta: 'Panorama', icono: 'layout-dashboard' \},\s*\{ vista: 'lineas-telefonicas'/);
  assert.doesNotMatch(app, /'reactivacion-lineas'/);
  assert.match(app, /montarVista\('tpl-lineas-panorama', Lineas\.initPanorama\)/);
  assert.match(read('src/html/Index.html'), /include\('html\/views\/lineas\/lineas-panorama'\)/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasPanorama\(token, forzar\)/);
});

test('Vista rápida en Líneas Telefónicas, responsiva editable y calificación en vivo de la inspección', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const resp = captura.slice(captura.indexOf('function formularioResponsiva_'), captura.indexOf('function ocultarSecretos_'));
  // Fijos: ID, ID LINEA, NUCO, FECHA RESPONSIVA y NOMBRE CI; lo demás del responsable y del equipo se puede corregir
  const fijos = [...resp.matchAll(/ro\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(fijos, ['ID', 'ID LINEA', 'NUCO', 'FECHA RESPONSIVA', 'NOMBRE CI']);
  assert.match(resp, /ed\('RESPONSABLE', 'RESPONSABLE', 'listaAbierta', v\('RESPONSABLE'\), \{ requerido: 'SIEMPRE', sugerencias: 'PERSONAS', autollenar: autoResponsable \}\)/);
  assert.match(resp, /ed\('ACCESORIOS', 'ACCESORIOS', 'multi'/);
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
  assert.deepEqual(h.map((e) => e.movimiento).sort(), ['Cambio de estatus', 'Inspección', 'Otros cambios', 'Reasignación']);
  assert.equal(h.filter((e) => e.campo === 'COMENTARIOS').length, 1);
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
  assert.match(repoSrc, /estatusEquipo: \['USO', 'RESGUARDO', 'DONADO', 'PARA VENTA', 'VENDIDO', 'POSIBLE VENTA-DAÑO', 'EXTRAVIO-ROBO', 'PARA DESECHO', 'DESECHADO'\]/);
  assert.match(repoSrc, /estatusLinea: \['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'\]/);
  // Quitar la línea deja ESTATUS LINEA en blanco (antes "SIN LINEA")
  assert.match(repoSrc, /'FIN PLAN': '', 'ESTATUS LINEA': '', 'FECHA CAMBIO TEMPORAL'/);
  // DISPONIBLE se agrega a la lista de departamentos; CONTROL INTERNO no se quita
  assert.match(repoSrc, /departamentos: juntar\(\[DEPARTAMENTO_DISPONIBLE\], unicos\(listas, 'DEPARTAMENTO'\)\)/);
  assert.match(repoSrc, /const DEPARTAMENTO_DISPONIBLE = 'DISPONIBLE';/);

  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Repo = {
    CATALOGO: {
      tipos: ['EQUIPO', 'EQUIPO + SIM', 'LINEA'],
      estatusEquipo: ['USO', 'RESGUARDO', 'DONADO', 'PARA VENTA', 'VENDIDO', 'POSIBLE VENTA-DAÑO', 'EXTRAVIO-ROBO', 'PARA DESECHO', 'DESECHADO'],
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
  assert.equal(Reg._elementos({ TIPO: 'LINEA', 'ESTATUS EQUIPO': 'N/A' }, cat, u, { nuevo: false }).filter((e) => e.columna === 'ESTATUS EQUIPO')[0].valor, '');

  // Servidor: un estatus nuevo fuera de la lista se rechaza; el valor viejo sin tocar no bloquea otros cambios
  const soloEstatus = els.filter((e) => e.tipo !== 'campo' || ['TIPO', 'ESTATUS LINEA', 'ESTATUS EQUIPO'].indexOf(e.columna) >= 0);
  assert.match(Reg._resolver(soloEstatus, base, { 'ESTATUS EQUIPO': 'CANCELADO' }, { nuevo: false }).errores.join(' | '), /ESTATUS EQUIPO: VALOR NO ENCONTRADO EN LA LISTA/);
  assert.deepEqual(Reg._resolver(soloEstatus, base, { 'ESTATUS LINEA': '' }, { nuevo: false }).errores, []);
  const ok = Reg._resolver(soloEstatus, base, { 'ESTATUS EQUIPO': 'EXTRAVIO-ROBO', 'ESTATUS LINEA': '' }, { nuevo: false });
  assert.deepEqual(ok.errores, []);
  assert.equal(ok.valores['ESTATUS EQUIPO'], 'EXTRAVIO-ROBO');
  assert.equal(ok.valores['ESTATUS LINEA'], '');

  // Colores de los estatus nuevos
  const cliente = read('src/html/js/lineas.html');
  ['DISPONIBLE', 'PARA VENTA', 'POSIBLE VENTA-DAÑO', 'PARA DESECHO', 'EXTRAVIO-ROBO'].forEach((e) => assert.match(cliente, new RegExp(`'${e}': '(azul|ambar|rojo)'`), e));
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
  assert.equal(reas[0].despues, 'ANA');
  assert.match(reas[0].detalle, /VENTAS → COBRANZA/);
  assert.equal(reas[0].fecha.getTime(), d('2025-05-01').getTime()); // la fecha vuelve a ser Date
  assert.match(h.filter((e) => e.movimiento === 'Desecho')[0].detalle, /Folio DR0007 · PANTALLA ROTA/);
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

test('Mandar a resguardo (30-sep): N/A automáticos, línea según el adendum, asesor y bandeja de Pau', () => {
  const src = read('src/services/lineas/LineasResguardos.gs');
  const Util = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '\nreturn LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  const Notif = { _diaFinPlan: (v) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v || '')); return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : ''; } };
  const R = new Function('LineasUtil', 'LineasNotificaciones', 'LineasDatos', 'LineasRepo', 'LineasRegistros', 'PropertiesService', 'Utilities',
    src + '\nreturn LineasResguardos;')(Util, Notif, { ZONA_APP: 'America/Mexico_City' }, {}, {},
    { getScriptProperties: () => ({ getProperty: () => 'pau@ciudadmaderas.com, suplente@ciudadmaderas.com' }) }, {});

  // Datos de la persona a N/A; PIN y cuenta solo si tenían algo (NO APLICA se respeta); el patrón se borra
  const fila = { RESPONSABLE: 'ANA', PUESTO: 'GERENTE', 'JEFE DIRECTO': 'LUIS', DIRECTOR: 'EVA', 'PIN WHATSAPP': '123456', 'PIN EQUIPO': 'NO APLICA',
    'CUENTA GOOGLE': '', PATRON: '1-2-3', 'RESPONSABLE USA EL EQUIPO': 'SI', 'NOMBRE QUIEN USA': 'ANA' };
  const pedido = { DEPARTAMENTO: 'DISPONIBLE', SEDE: 'QUERETARO', 'OFICINA / DESARROLLO': 'JARDINES', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'DISPONIBLE', COMENTARIO: 'baja por renuncia' };
  const c = R._cambiosResguardo(fila, pedido, true);
  ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'DIRECTOR', 'PIN WHATSAPP', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA'].forEach((k) => assert.equal(c[k], 'N/A', k));
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
  assert.deepEqual(R.ESTATUS_EQUIPO_RESGUARDO, ['RESGUARDO', 'PARA VENTA', 'POSIBLE VENTA-DAÑO', 'PARA DESECHO']);

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
  assert.match(cliente, /llamar\('apiLineasMandarResguardo', equipos\.map\(\(q\) => q\.id\), \{ motivo: valores\._MOTIVO, porEquipo: porEquipo \}\)/);
  assert.match(cliente, /function initResguardos\(\)/);
  assert.match(read('src/html/js/app.html'), /if \(vista === 'resguardos-lineas'\) \{ montarVista\('tpl-lineas-resguardos', Lineas\.initResguardos\); return; \}/);
  assert.match(read('src/config/Entidades.gs'), /'APP_RESGUARDOS': \{ prefijo: 'RSG'/);
  // En el historial se leen con nombre (no RESGUARDO / CANCELACION_LINEA)
  assert.match(read('src/services/lineas/LineasRepo.gs'), /RESGUARDO: 'Resguardo', CANCELACION_LINEA: 'Cancelación de línea', VENTA: 'Venta'/);
});

test('PARA VENTA y PARA DESECHO siguen la lógica de Mandar a resguardo (usuario, 30-sep)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const resg = read('src/services/lineas/LineasResguardos.gs');
  const cliente = read('src/html/js/lineas.html');
  // El servidor no deja llegar a esos estatus por el cambio rápido ni por la edición directa
  assert.match(reg, /function exigirFormularioResguardo_\(tipo, estatusAntes, estatusNuevo\)/);
  assert.match(reg, /LineasResguardos\.ESTATUS_EQUIPO_RESGUARDO\.indexOf\(nuevo\)/);
  assert.equal((reg.match(/exigirFormularioResguardo_\(/g) || []).length, 3, 'definición + editar + cambiarEstatus');
  // "Cambiar estatus" abre el formulario de resguardo con el estatus elegido
  assert.match(cliente, /const ESTATUS_EQUIPO_RESGUARDO = \['RESGUARDO', 'PARA VENTA', 'POSIBLE VENTA-DAÑO', 'PARA DESECHO'\];/);
  assert.match(cliente, /abrirResguardo\(\[\{ id: f\.id \}\], \{ estatus: datos\.estatusEquipo \}\)/);
  assert.match(cliente, /valor: estatusInicial, requerido: 'SIEMPRE'/);
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
  assert.match(resg, /if \(cancelando\[claveCancelacion_\(f\['ID'\], numero\)\]\)/);
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
