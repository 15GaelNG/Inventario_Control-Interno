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
  const lineas = app.slice(app.indexOf("id: 'lineas'"), app.indexOf("id: 'arqueos'"));
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

test('los movimientos rechazan artículos inexistentes', () => {
  const accesorios = read('src/services/lineas/LineasAccesorios.gs');
  assert.match(accesorios, /if \(!actual\) throw new Error\('El artículo seleccionado ya no existe/);
});

test('el shell tiene navegación móvil y controles semánticos', () => {
  const index = read('src/html/Index.html');
  const styles = read('src/html/styles.html');
  const app = read('src/html/js/app.html');
  assert.match(index, /id="mobile-menu-btn"/);
  assert.match(index, /id="sidebar-backdrop"/);
  assert.match(styles, /#sidebar\.mobile-open/);
  assert.match(styles, /width: 310px/);
  assert.match(styles, /\.nav-subitem \{[\s\S]*?white-space: normal;[\s\S]*?text-align: left; justify-content: flex-start;/);
  assert.match(app, /<button type="button" class="nav-group-header"/);
  assert.match(app, /<button type="button" class="nav-subitem"/);
});
