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
  const orden = ['lineas-telefonicas', 'accesorios-lineas', 'reactivacion-lineas', 'reasignaciones-lineas', 'solicitud-lineas',
    'cambios-lineas', 'bitacora-desechos'];
  assert.deepEqual([...lineas.matchAll(/vista: '([^']+)'/g)].map((m) => m[1]), orden);
  // Acceso directo debajo del desplegable de Líneas
  assert.match(app, /\{ id: 'gestion-activos', vista: 'gestion-activos', icono: 'contact', etiqueta: 'Gestión de Activos' \}/);
  assert.match(app, /grupo\.vista \? `/);
  orden.concat('gestion-activos')
    .forEach((route) => assert.match(app, new RegExp(`vista === '${route}'`), `falta montar ${route}`));
  // Retirados: Post Venta (ya no existe) y Detalles (ahora es la vista de tarjetas de Líneas Telefónicas)
  ['lineas-post-venta', 'detalles-lineas-telefonicas'].forEach((retirado) => {
    assert.doesNotMatch(app, new RegExp(retirado));
    assert.doesNotMatch(read('src/config/Modulos.gs'), new RegExp(`id: '${retirado}'`));
  });
  assert.ok(!fs.existsSync(path.join(root, 'src/html/views/lineas/lineas-detalles.html')));
  assert.doesNotMatch(read('src/html/Index.html'), /lineas-detalles/);
});

test('las vistas operativas usan la misma base de AppSheet (sin Post Venta)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /REACTIVACION: 'REACTIVACION DE LINEAS'/);
  assert.match(repo, /SOLICITUD: 'SOLICITUD DE LINEAS'/);
  assert.doesNotMatch(repo, /POST_VENTA|POST VENTA/);
  assert.doesNotMatch(read('src/html/js/lineas.html'), /POST_VENTA|initPostVenta/);
  assert.match(read('src/ClientApi.gs'), /apiLineasVistaOperativa/);
  assert.match(read('src/ClientApi.gs'), /apiLineasCrearVistaOperativa/);
  assert.match(read('src/services/lineas/LineasOperativas.gs'), /function crear\(tipo, datos, usuario\)/);
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
  assert.match(lineas, /textoAlta: 'Registrar reactivación'/);
  assert.match(lineas, /textoAlta: 'Registrar solicitud'/);
  assert.match(lineas, /textoAlta: 'Registrar desecho'/);
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
    'COSTO PLAN', 'FECHA REGISTRO', 'INICIO PLAN', 'FIN PLAN', 'ESTATUS LINEA', 'ESTATUS EQUIPO', 'RESPONSIVA', 'FECHA INSPECCION',
    'FORMATO INSPECCION', 'COMENTARIOS'];
  assert.deepEqual(directos.filter((c) => !/ $/.test(c)), orden);
  assert.match(reg, /responsableExtra\('QUINTO', 'CUARTO RESPONSABLE', 'QUINTO RESPONSABLE'\)/);
  assert.match(reg, /PIN_EQ: 'INGRESE UN VALOR VALIDO, Y NO MAYOR A 6 CARACTERES'/);
  assert.match(reg, /mostrar: \{ nuevo: true \}, requerido: \{ nuevo: true \}/);
  // Simulación: un alta de EQUIPO toma los valores iniciales "NO APLICA" y valida mayúsculas
  const Reg = new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config',
    reg + '; return LineasRegistros;')(
    { CATALOGO: { tipos: ['EQUIPO', 'LINEA'], estatusLinea: ['USO'], estatusEquipo: ['USO'] } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-09-24' }, {}, {});
  const ctx = { nuevo: true, nucoRepetido: () => false, telefonoRepetido: () => false };
  const els = Reg._elementos({}, {}, { correo: 'x@y.z' }, ctx);
  const r = Reg._resolver(els, {}, { TIPO: 'EQUIPO', NUCO: '12', RESPONSABLE: 'juan', 'INICIO PLAN': '2026-09-01', 'FIN PLAN': '2027-09-01' }, ctx);
  assert.equal(r.valores['NUMERO TELEFONO'], 'NO APLICA');
  assert.equal(r.valores['NUMERO SIM'], 'NO APLICA');
  assert.ok(r.errores.some((e) => /RESPONSABLE: ESCRIBIR EN MAYUSCULAS/.test(e)));
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
  const orden = (desde, hasta) => [...captura.slice(captura.indexOf(desde), captura.indexOf(hasta)).matchAll(/(?:campo_|ro)\('([^']+)'/g)].map((m) => m[1]);
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
  assert.equal((cliente.match(/tablaLineas\(\$\('#(ln-tabla-' \+ modulo|lac-tabla|ln-op-tabla|ln-bit-tabla)'?/g) || []).length >= 4, true);
  assert.doesNotMatch(cliente, /class="ln-tabla"><thead id=/);
  assert.match(cliente, /function tilesKpi\(/);
  assert.match(api, /function apiLineasBitacoraTabla[\s\S]*?JSON\.stringify/);
  assert.match(api, /function apiLineasVistaOperativaTabla[\s\S]*?JSON\.stringify/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /const MAX_FILAS_TABLA = 5000;/);
  for (const vista of ['lineas-telefonicas', 'lineas-bitacora', 'lineas-operativa', 'lineas-accesorios']) {
    const html = read(`src/html/views/lineas/${vista}.html`);
    assert.match(html, /class="page-header"/, vista);
    assert.match(html, /class="stat-row"/, vista);
  }
});

test('las altas de Reactivación y Solicitud usan columnas, opciones y folios del AppSheet', () => {
  const op = read('src/services/lineas/LineasOperativas.gs');
  const columnas = (desde, hasta) => [...op.slice(op.indexOf(desde), op.indexOf(hasta)).matchAll(/campo_\('([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(columnas('REACTIVACION: (usuario', 'SOLICITUD: (usuario'), ['FOLIO', 'LINIEA SUSPENDIDA', 'COMPAÑIA', 'SIM', 'CORREO / TICKET',
    'FECHA DE SUSPENSION', 'ESTATUS', 'ESTADO DEL EQUIPO', 'IMEI', 'RETRO DE SOLICITUD', 'FECHA DE REACTIVACION', 'NUEVO NUMERO', 'FECHA DE REGISTRO',
    'QUIEN REGISTRO', 'COMENTARIOS']);
  assert.deepEqual(columnas('SOLICITUD: (usuario', '// BITACORA DE DESECHO_Form'), ['FOLIO', 'FECHA DE SOLICITUD', 'TIPO DE PLAN', 'TICKET', 'NO EMPLEADO SOLICITANTE',
    'NOMBRE SOLICITANTE', 'PUESTO SOLICITANTE', 'DEPARTAMENTO SOLICITANTE', 'SEDE', 'DEPARTAMENTO', 'TIPO', 'PUESTO', 'COLABORADOR', 'SOLICITANTE',
    'FECHA DE ENTREGA', 'ASIGNACION', 'REASIGNACION', 'COMPAÑIA', 'EQUIPO', 'NUMERO ANTERIOR', 'NUMERO ACTUAL', 'IMEI', 'SIM', 'ESTATUS', 'COMENTARIOS',
    'FECHA DE REGISTRO', 'QUIEN REGISTRO']);
  assert.match(op, /opciones: \['EN USO', 'DISPONIBLE', 'EN PROCESO DE ASIGNACION', 'PROCESO DE CANCELACION', 'CANCELADA', 'ACTUALIZACIÓN DE LINEA TELEFONICA'\]/);
  assert.match(op, /fila\['REASIGNACION'\] = !valores\['ASIGNACION'\]/);
  assert.match(op, /MAX\(REACTIVACION DE LINEAS\[FOLIO\]\) \+ 1/);
  assert.doesNotMatch(read('src/services/lineas/LineasRepo.gs'), /'LINEA SUSPENDIDA'|NOMBRE COMPLETO DEL SOLICITANTE/);
  assert.deepEqual(columnas('FORMULARIOS.DESECHO', 'const TABLAS'), ['ID_EQUIPO', 'FOLIO EQUIPO', 'EQUIPO', 'LUGAR DE DESECHO', 'EVIDENCIA',
    'AUTORIZACION', 'ESTADO', 'MOTIVO', 'FECHA DE DESECHO', 'FECHA DE REGISTRO', 'QUIEN REGISTRO']);
  assert.match(op, /'DR' \+ \('0000' \+ \(numeroFila - 1\)\)\.slice\(-4\)/);
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
  assert.match(lineas, /icono: 'circle-chevron-right', titulo: 'Ver línea', visible: \(f\) => !!f\._ref/);
  // Menú con los íconos de las vistas del AppSheet
  const app = read('src/html/js/app.html');
  [['lineas-telefonicas', 'smartphone'], ['accesorios-lineas', 'boxes'], ['reactivacion-lineas', 'check-check'],
    ['reasignaciones-lineas', 'recycle'], ['solicitud-lineas', 'target'], ['cambios-lineas', 'eye']].forEach(([vista, icono]) => {
    assert.match(app, new RegExp(`vista: '${vista}', etiqueta: '[^']+', icono: '${icono}'`), vista);
  });
});

test('los campos de texto libre del AppSheet ahora tienen lista desplegable', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  const cap = read('src/services/lineas/LineasCaptura.gs');
  const ope = read('src/services/lineas/LineasOperativas.gs');
  const repo = read('src/services/lineas/LineasRepo.gs');
  const lineas = read('src/html/js/lineas.html');
  const control = (src, columna) => (new RegExp(`campo_\\('${columna.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}', '[^']+', '([a-zA-Z]+)'`).exec(src) || [])[1];
  ['NO EMPLEADO', 'RESPONSABLE', 'PUESTO', 'NOMBRE QUIEN USA', 'PUESTO QUIEN USA', 'JEFE DIRECTO', 'DIRECTOR', 'COLOR']
    .forEach((c) => assert.equal(control(reg, c), 'listaAbierta', 'LINEAS ' + c));
  ['RESPONSABLE', 'PUESTO', 'JEFE DIRECTO', 'MODELO', 'COMPAÑIA', 'RAZON SOCIAL', 'OTRA', 'IDENTIFICACION']
    .forEach((c) => assert.equal(control(cap, c), 'listaAbierta', 'captura ' + c));
  ['TIPO', 'DIA', 'MES', 'AÑO'].forEach((c) => assert.equal(control(cap, c), 'lista', 'captura ' + c));
  ['NO EMPLEADO SOLICITANTE', 'NOMBRE SOLICITANTE', 'PUESTO SOLICITANTE', 'DEPARTAMENTO SOLICITANTE', 'COLABORADOR',
    'NUMERO ANTERIOR', 'NUMERO ACTUAL', 'MOTIVO'].forEach((c) => assert.equal(control(ope, c), 'listaAbierta', 'operativas ' + c));
  assert.match(repo, /catalogos_telefonia_v3/);
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
  assert.match(lineas, /etiqueta: 'Activos reasignados'/);
  assert.match(lineas, /etiqueta: 'En ' \+ anio/);
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
  // Ficha: resumen rápido + pestañas; documentos como lista
  assert.match(lineas, /function fichaEnPestanas\(general, detalles, conDocumentos\)/);
  assert.match(lineas, /class="ln-resumen-rapido"/);
  assert.match(lineas, /<ul class="ln-docs">/);
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
