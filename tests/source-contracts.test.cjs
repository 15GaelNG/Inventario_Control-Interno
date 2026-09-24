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

test('Telefonía muestra los diez módulos implementados en el orden solicitado', () => {
  const app = read('src/html/js/app.html');
  const lineas = app.slice(app.indexOf("id: 'lineas'"), app.indexOf('\n  ];', app.indexOf("id: 'lineas'")));
  assert.equal((lineas.match(/Inventario de Accesorios/g) || []).length, 1);
  const orden = ['lineas-telefonicas', 'gestion-activos', 'detalles-lineas-telefonicas', 'accesorios-lineas', 'reactivacion-lineas',
    'reasignaciones-lineas', 'solicitud-lineas', 'cambios-lineas', 'lineas-post-venta', 'bitacora-desechos'];
  assert.deepEqual([...lineas.matchAll(/vista: '([^']+)'/g)].map((m) => m[1]), orden);
  orden
    .forEach((route) => assert.match(app, new RegExp(`vista === '${route}'`), `falta montar ${route}`));
});

test('las vistas operativas usan la misma base de AppSheet', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /REACTIVACION: 'REACTIVACION DE LINEAS'/);
  assert.match(repo, /SOLICITUD: 'SOLICITUD DE LINEAS'/);
  assert.match(repo, /departamento: 'POST VENTA'/);
  assert.match(read('src/ClientApi.gs'), /apiLineasVistaOperativa/);
  assert.match(read('src/ClientApi.gs'), /apiLineasCrearVistaOperativa/);
  assert.match(repo, /crearVistaOperativa/);
});

test('Gestión de Activos y Detalles usan cuadrículas de tarjetas con filtros', () => {
  const lineas = read('src/html/js/lineas.html');
  const gestion = read('src/html/views/lineas/lineas-gestion-activos.html');
  const detalles = read('src/html/views/lineas/lineas-detalles.html');
  const estilos = read('src/html/lineas-estilos.html');
  assert.match(gestion, /id="lnga-grid" class="ln-cuadros-grid"/);
  assert.match(gestion, /id="lnga-filtro-activos"/);
  assert.match(detalles, /id="lnd-grid" class="ln-cuadros-grid"/);
  assert.match(detalles, /id="lnd-tipo"/);
  assert.match(lineas, /function tarjetaColaborador/);
  assert.match(lineas, /function tarjetaDetalle/);
  assert.match(estilos, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test('las capturas canceladas tienen un flujo completo de limpieza', () => {
  assert.match(read('src/ClientApi.gs'), /apiLineasCancelarEvidencia/);
  assert.match(read('src/services/TelefoniaService.gs'), /cancelarEvidencia/);
  assert.match(read('src/services/lineas/LineasEvidencias.gs'), /cancelarCarpetaEvidencia/);
  assert.match(read('src/html/js/lineas.html'), /apiLineasCancelarEvidencia/);
});

test('Telefonía permite alta y edición directa con bitácora y color persistente', () => {
  const api = read('src/ClientApi.gs');
  const service = read('src/services/TelefoniaService.gs');
  const registros = read('src/services/lineas/LineasRegistros.gs');
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(api, /apiLineasCrearRegistro/);
  assert.match(api, /apiLineasEditarRegistro/);
  assert.match(service, /LineasRegistros\.crear/);
  assert.match(registros, /registrarMovimiento\('ALTA'/);
  assert.match(registros, /registrarMovimiento\('EDICION'/);
  assert.match(registros, /asegurarPestana\(LineasRepo\.TAB\.LINEAS, \['COLOR'\]\)/);
  assert.match(repo, /color: texto\('COLOR'\)/);
});

test('las firmas nuevas no se almacenan como archivos de Drive', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const cliente = read('src/html/js/lineas.html');
  assert.match(captura, /firmaInspectorBase64/);
  assert.match(captura, /firmaCiBase64/);
  assert.match(captura, /'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': ''/);
  assert.match(captura, /'FIRMA RESPONSABLE': '', 'NOMBRE CI': usuario\.nombre, 'FIRMA CI': ''/);
  assert.doesNotMatch(cliente, /'FIRMA INSPECTOR\.png'/);
  assert.doesNotMatch(cliente, /'FIRMA CI\.png'/);
});

test('los formularios muestran el estado y color actuales y trazan patrón de nueve puntos', () => {
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /Conservar estatus actual/);
  assert.match(cliente, /Estatus actual del equipo/);
  assert.match(cliente, /ctx\.equipo\.color/);
  assert.match(cliente, /Array\.from\(\{ length: 9 \}/);
  assert.match(cliente, /Otra aplicación \(opcional\)/);
  assert.match(cliente, /responsable es opcional/i);
});

test('edición e inspección comparten patrón, navegación y fondos de firma del PDF', () => {
  const cliente = read('src/html/js/lineas.html');
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cliente, /function activarPatron\(prefijo, inicial\)/);
  assert.match(cliente, /htmlPatron\('reg-patron'/);
  assert.match(cliente, /htmlPatron\('cap-insp-patron'/);
  assert.match(cliente, /data-ln-miga=/);
  assert.match(cliente, /Control Interno'.*ctx\.inspector.*' · obligatoria'/s);
  assert.match(cliente, /Control Interno'.*ctx\.nombreCI.*' · obligatoria'/s);
  assert.match(cliente, /firmaInspector\.base64\('#ddebf7'\)/);
  assert.match(cliente, /firmaCi\.base64\('#ffffff'\)/);
  assert.match(captura, /'PATRON': firmasBase64 \? blobBase64_\(firmasBase64\.patron/);
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
  assert.match(cliente, /grupoEscala\(p\.escala, null\)/);
  assert.doesNotMatch(cliente, /cap-actualizar-accesorios/);
  assert.doesNotMatch(cliente, /ctx\.anterior/);
  assert.doesNotMatch(captura, /actualizarAccesorios/);
  assert.doesNotMatch(captura, /inspeccionesPrevias_/);
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

test('Reactivación usa el encabezado real de la hoja (LINIEA SUSPENDIDA)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /REACTIVACION: \['LINIEA SUSPENDIDA'/);
  assert.match(repo, /\['LINIEA SUSPENDIDA', 'ESTATUS'\]/);
  assert.doesNotMatch(repo + read('src/html/js/lineas.html'), /'LINEA SUSPENDIDA'/);
});

test('Solicitud usa los encabezados reales de la hoja (no los nombres que muestra AppSheet)', () => {
  const codigo = read('src/services/lineas/LineasRepo.gs') + read('src/html/js/lineas.html');
  for (const real of ['NO EMPLEADO SOLICITANTE', 'NOMBRE SOLICITANTE', 'PUESTO SOLICITANTE', 'DEPARTAMENTO SOLICITANTE']) {
    assert.match(codigo, new RegExp(`'${real}'`));
  }
  assert.doesNotMatch(codigo, /DEL SOLICITANTE'/);
});
