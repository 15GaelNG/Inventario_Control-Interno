/**
 * subir.js — comprime src/ (construir.js) y lo sube a un proyecto de Apps Script con clasp.
 *
 *   node tools/subir/subir.js dev                       tu DEV (.clasp.json)
 *   node tools/subir/subir.js lab                       .clasp.lab.json
 *   node tools/subir/subir.js prod                      producción (.clasp.prod.json): solo sube
 *   node tools/subir/subir.js prod --desplegar "texto"  y además mueve LOS DOS despliegues a la
 *                                                       versión nueva (CLAUDE.md: "dos links"). Solo
 *                                                       en la GitHub Action, salvo --desde-aqui
 *   node tools/subir/subir.js rama                      el DEV de la rama actual (destinos.json);
 *                                                       es lo que usa la GitHub Action
 *
 * Antes de subir baja lo que hay allá: un archivo que exista solo en Apps Script (p. ej. la
 * semilla de correcciones de Líneas, que no va en git) se conserva en vez de borrarse.
 * Después vuelve a bajarlo y compara: si lo que quedó no es lo que se subió, truena.
 *
 * De dónde sale el scriptId: la variable SCRIPT_ID, si no el .clasp*.json, si no destinos.json
 * (en la GitHub Action no hay .clasp*.json).
 *
 * Al final pregunta a la app si sus IDs están bien (revisar-entorno.js, la misma revisión que
 * revisarEntorno() en el editor). En prod, con errores no despliega.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { construir } = require('./construir');
const { revisar } = require('./pagina-servida');
const entorno = require('./revisar-entorno');

const RAIZ = path.resolve(__dirname, '..', '..');
const PROYECTOS = { dev: '.clasp.json', lab: '.clasp.lab.json', prod: '.clasp.prod.json', rama: null };
const DESTINOS = JSON.parse(fs.readFileSync(path.join(__dirname, 'destinos.json'), 'utf8'));
// Producción: el primero crea la versión; el segundo es el link que usa el equipo
const DESPLIEGUES_PROD = DESTINOS.desplieguesProd;
const EN_ACTION = process.env.GITHUB_ACTIONS === 'true';

// clasp se corre con el mismo Node y sin shell: así una ruta o una descripción con espacios
// llega entera (en Windows, npx.cmd con shell las partía)
const CLASP = path.join(RAIZ, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
function clasp(args, cwd) {
  return execFileSync(process.execPath, [CLASP].concat(args), { cwd: cwd || RAIZ, encoding: 'utf8' });
}

/** En la Action, el resumen que sale al abrir la ejecución (GITHUB_STEP_SUMMARY); fuera de ella, nada */
function resumen_(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

/** La cuenta de Google con la que corre clasp: con ella va a correr la app si se mueven los despliegues */
function cuentaClasp_() {
  const m = /logged in as (\S+?)\.?\s*$/m.exec(clasp(['show-authorized-user']));
  return m ? m[1].toLowerCase() : '';
}

/**
 * Antes de mover los despliegues de prod. La app corre con la cuenta de quien los MUEVE (executeAs:
 * USER_DEPLOYING): desde la Action es la del secreto CLASPRC_JSON, y tiene que ser `cuentaProd`
 * (destinos.json); desde una máquina sería la de esa persona, y si a esa cuenta le falta una carpeta o
 * una plantilla, la app falla para todos (8-oct: las inspecciones sin PDF). Por eso, fuera de la Action,
 * solo con --desde-aqui.
 */
function exigirCuentaDeProd_(args) {
  const cuenta = cuentaClasp_();
  if (!EN_ACTION && !args.includes('--desde-aqui')) {
    throw new Error('A producción se despliega con la GitHub Action (Actions → "Subir a Apps Script" → Run workflow ' +
      'sobre master), para que la app corra siempre con la misma cuenta. Si de verdad tiene que ser desde aquí, ' +
      'agrega --desde-aqui: la app va a correr con TU cuenta de clasp (' + cuenta + ').');
  }
  if (EN_ACTION && DESTINOS.cuentaProd && cuenta !== DESTINOS.cuentaProd.toLowerCase()) {
    throw new Error('El secreto CLASPRC_JSON es de ' + (cuenta || 'una cuenta que no se pudo leer') + ', no de ' +
      DESTINOS.cuentaProd + ' (cuentaProd en tools/subir/destinos.json). No se tocó producción.');
  }
  console.log('La app de producción va a correr con la cuenta ' + cuenta + '.');
  return cuenta;
}

/**
 * Mueve los dos links de prod a la versión y revisa que los dos hayan quedado ahí.
 *
 * El despliegue público de firma (URL_FIRMA_PUBLICA) NO se toca aquí a propósito: moverlo por
 * la API (clasp update-deployment) le resetea "Quién tiene acceso" al del manifiesto normal
 * (Dominio) -- Apps Script no respeta el "Cualquier usuario" que se eligió a mano al crearlo
 * en cuanto se le apunta a otra versión por la API (confirmado, 8-oct: quedó pidiendo cuenta
 * de dominio después del primer --desplegar con esto automatizado). Por eso ese despliegue se
 * actualiza A MANO, desde el editor (Implementar → Administrar implementaciones → lápiz →
 * elegir la versión nueva → confirmar "Cualquier usuario" otra vez ahí mismo, antes de guardar).
 */
function moverDespliegues_(proyecto, version, descripcion) {
  clasp(['-P', proyecto, 'update-deployment', DESPLIEGUES_PROD[1], '-V', version, '-d', descripcion]);
  // Google tarda unos segundos en reflejar el despliegue movido: list-deployments justo después todavía puede decir la
  // versión anterior (9-oct: la v87 quedó bien y aun así la Action falló). Se reintenta antes de declarar el error.
  let lista = '';
  for (let intento = 1; intento <= 6; intento++) {
    lista = clasp(['-P', proyecto, 'list-deployments']);
    const enVersion = DESPLIEGUES_PROD.filter((d) => new RegExp(d + ' @' + version + '\\b').test(lista));
    if (enVersion.length === 2) return;
    if (intento < 6) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);
  }
  throw new Error('Los dos despliegues no quedaron en @' + version + ' (después de 30 s):\n' + lista);
}

const LINK_EQUIPO = () => 'https://script.google.com/a/macros/' + DESTINOS.dominio + '/s/' + DESPLIEGUES_PROD[1] + '/exec';

/**
 * --regresar N: los dos links vuelven a una versión que ya existe, sin subir código. Para cuando una
 * versión nueva salió mal: el equipo vuelve a la anterior en segundos y el arreglo se hace con calma.
 */
function regresar_(args, version) {
  if (!/^\d+$/.test(version || '')) throw new Error('--regresar lleva el número de versión (p. ej. --regresar 65)');
  const cuenta = exigirCuentaDeProd_(args);
  fs.mkdirSync(path.join(RAIZ, '.construido'), { recursive: true });
  const proyecto = path.join(RAIZ, '.construido', 'prod.clasp.json');
  fs.writeFileSync(proyecto, JSON.stringify({ scriptId: scriptIdDe('prod'), rootDir: 'prod' }));
  const antes = (/AKfycbx_\S+ @(\d+)/.exec(clasp(['-P', proyecto, 'list-deployments'])) || [])[1];
  const descripcion = 'Regreso a la v' + version + (antes ? ' (desde la v' + antes + ')' : '');
  clasp(['-P', proyecto, 'update-deployment', DESPLIEGUES_PROD[0], '-V', version, '-d', descripcion]);
  moverDespliegues_(proyecto, version, descripcion);
  console.log('Regresado: los dos links de producción en la versión ' + version + '.');
  resumen_('## ↩️ Producción regresó a la versión ' + version + '\n\n' +
    '| | |\n|---|---|\n| Antes | v' + (antes || '?') + ' |\n| Ahora | v' + version + ' |\n' +
    '| La app corre con | ' + cuenta + ' |\n| Link del equipo | ' + LINK_EQUIPO() + ' |\n\n' +
    'La liga pública de firma (si la usas) se actualiza a mano, aparte -- ver el comentario de moverDespliegues_.');
}

function ramaActual_() {
  return process.env.GITHUB_REF_NAME || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' }).trim();
}

function scriptIdDe(destino) {
  if (process.env.SCRIPT_ID) return process.env.SCRIPT_ID;
  if (destino === 'rama') {
    const rama = ramaActual_();
    if (!DESTINOS.ramas[rama]) throw new Error('La rama "' + rama + '" no tiene DEV en tools/subir/destinos.json');
    return DESTINOS.ramas[rama];
  }
  const archivo = path.join(RAIZ, PROYECTOS[destino]);
  if (fs.existsSync(archivo)) return JSON.parse(fs.readFileSync(archivo, 'utf8')).scriptId;
  if (DESTINOS[destino]) return DESTINOS[destino];
  throw new Error('No existe ' + PROYECTOS[destino] + ' (ni la variable SCRIPT_ID)');
}

/** Los archivos de una carpeta como rutas relativas con "/" y sin extensión (.gs/.js/.html/.json dan lo mismo en Apps Script) */
function nombres_(dir) {
  const todos = new Map();
  (function recorrer(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const ruta = path.join(d, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      if (e.name.startsWith('.')) return;
      todos.set(path.relative(dir, ruta).split(path.sep).join('/').replace(/\.(gs|js|html|json)$/, ''), ruta);
    });
  })(dir);
  return todos;
}

/** Baja el proyecto a una carpeta temporal (para conservar lo que solo vive allá y para verificar) */
function bajar(scriptId) {
  // Dentro del repo y no en os.tmpdir(): en Windows esa ruta trae un nombre corto (CIUDAD~1) y
  // clasp la rechaza como "symlink"
  fs.mkdirSync(path.join(RAIZ, '.construido'), { recursive: true });
  const dir = fs.mkdtempSync(path.join(RAIZ, '.construido', 'remoto-'));
  fs.writeFileSync(path.join(dir, '.clasp.json'), JSON.stringify({ scriptId: scriptId, rootDir: 'src' }));
  fs.mkdirSync(path.join(dir, 'src'));
  clasp(['pull'], dir);
  return path.join(dir, 'src');
}

const normal_ = (texto) => texto.replace(/\r\n/g, '\n').trimEnd();

async function main() {
  const args = process.argv.slice(2);
  const destino = args[0];
  if (!(destino in PROYECTOS)) throw new Error('Uso: node tools/subir/subir.js dev|lab|prod|rama [--desplegar "descripción" | --regresar N]');
  const r = args.indexOf('--regresar');
  if (r >= 0) {
    if (destino !== 'prod') throw new Error('--regresar es solo para prod');
    return regresar_(args, args[r + 1]);
  }
  const i = args.indexOf('--desplegar');
  const descripcion = i >= 0 ? args[i + 1] : null;
  if (i >= 0 && (destino !== 'prod' || !descripcion)) throw new Error('--desplegar es solo para prod y lleva una descripción');
  // Antes de subir nada: si no se va a poder desplegar, que truene ya
  if (descripcion) exigirCuentaDeProd_(args);

  const scriptId = scriptIdDe(destino);
  const carpeta = path.join(RAIZ, '.construido', destino);
  if (fs.existsSync(path.join(RAIZ, '.construido'))) {
    fs.readdirSync(path.join(RAIZ, '.construido')).filter((n) => n.startsWith('remoto-'))
      .forEach((n) => fs.rmSync(path.join(RAIZ, '.construido', n), { recursive: true, force: true }));
  }
  const reporte = await construir(path.join(RAIZ, 'src'), carpeta);
  console.log('Comprimido: ' + Math.round(reporte.antes / 1024) + ' KB → ' + Math.round(reporte.despues / 1024) + ' KB de HTML');
  reporte.sinComprimir.forEach((m) => console.log('  sin comprimir: ' + m));

  // Lo que solo existe allá se conserva
  const remoto = bajar(scriptId);
  const locales = nombres_(carpeta);
  nombres_(remoto).forEach((ruta, nombre) => {
    if (locales.has(nombre)) return;
    const final = path.join(carpeta, path.relative(remoto, ruta)).replace(/\.js$/, '.gs');
    fs.mkdirSync(path.dirname(final), { recursive: true });
    fs.copyFileSync(ruta, final);
    console.log('  se conserva (solo existe en Apps Script): ' + nombre);
  });

  const proyecto = path.join(RAIZ, '.construido', destino + '.clasp.json');
  fs.writeFileSync(proyecto, JSON.stringify({ scriptId: scriptId, rootDir: destino }));
  clasp(['-P', proyecto, 'push', '--force']);
  console.log('Subido a ' + destino + ' (' + scriptId.slice(0, 12) + '…)');

  // Verificar: lo que quedó allá es exactamente lo que se subió
  const quedo = nombres_(bajar(scriptId));
  const subido = nombres_(carpeta);
  const distintos = [];
  subido.forEach((ruta, nombre) => {
    if (!quedo.has(nombre)) distintos.push(nombre + ' (no quedó)');
    else if (normal_(fs.readFileSync(ruta, 'utf8')) !== normal_(fs.readFileSync(quedo.get(nombre), 'utf8'))) distintos.push(nombre);
  });
  quedo.forEach((_, nombre) => { if (!subido.has(nombre)) distintos.push(nombre + ' (sobra)'); });
  if (distintos.length) throw new Error('Lo que quedó en Apps Script no es lo que se subió: ' + distintos.join(', '));
  console.log('Verificado: ' + subido.size + ' archivos iguales allá.');

  // Y la página como la entrega Apps Script (que corta "//" y "/*"): cada <script> completo y
  // válido. En prod esto pasa ANTES de mover los despliegues: algo roto nunca le llega a nadie.
  const head = /-\s+(\S+)\s+@HEAD/.exec(clasp(['-P', proyecto, 'list-deployments']));
  if (!head) throw new Error('El proyecto no tiene despliegue @HEAD para revisar la página');
  // Index.html y FirmaExterna.html son páginas completas por su cuenta (nunca un <script>
  // incluido dentro del shell de la SPA): la primera no se revisa aquí (no se comprime, ver
  // construir.js); la segunda se revisa aparte, pidiendo su propia liga (abajo).
  const APARTE = ['Index.html', 'FirmaExterna.html'];
  const bloques = [];
  subido.forEach((ruta) => {
    if (!ruta.endsWith('.html') || APARTE.includes(path.basename(ruta))) return;
    for (const m of fs.readFileSync(ruta, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) bloques.push(m[1]);
  });
  const revisada = await revisar(head[1], DESTINOS.dominio, bloques);
  console.log('Página revisada como la entrega Apps Script: ' + revisada.scripts + ' scripts completos y válidos.');
  // FirmaExterna.html no se revisa aquí (es su propia página, con su propia liga -- no un
  // <script> del shell de la SPA): al probar algo que la use, ábrela a mano una vez
  // (?firmar=1&tipo=responsiva&token=x) para confirmar que Apps Script no le cortó nada.

  // Los IDs del proyecto (carpetas, libros, hojas): en prod, un error no deja desplegar
  const rev = await entorno.revisar(head[1], DESTINOS.dominio);
  entorno.imprimir(rev);
  resumen_('### Revisión del entorno (' + (rev.entorno || '?') + ')' + (rev.cuenta ? ' con ' + rev.cuenta : '') + '\n\n' +
    (rev.errores.length ? '**' + rev.errores.length + ' errores:**\n' + rev.errores.map((e) => '- ❌ ' + e).join('\n') : '✅ Sin errores') +
    (rev.avisos.length ? '\n\n<details><summary>' + rev.avisos.length + ' avisos</summary>\n\n' + rev.avisos.map((a) => '- ' + a).join('\n') + '\n</details>' : ''));
  if (destino === 'prod' && rev.errores.length) {
    throw new Error('El entorno de producción tiene errores: ' + (descripcion ? 'NO se desplegó' : 'no lo despliegues') +
      ' (el código ya está subido; la versión que usa el equipo sigue igual).');
  }

  if (descripcion) {
    const antes = (/AKfycbx_\S+ @(\d+)/.exec(clasp(['-P', proyecto, 'list-deployments'])) || [])[1];
    const primero = clasp(['-P', proyecto, 'update-deployment', DESPLIEGUES_PROD[0], '-d', descripcion]);
    const m = /@(\d+)/.exec(primero);
    if (!m) throw new Error('No encontré la versión nueva en: ' + primero);
    moverDespliegues_(proyecto, m[1], descripcion);
    console.log('Desplegado: los dos links de producción en la versión ' + m[1] + '.');
    resumen_('## 🚀 Producción en la versión ' + m[1] + '\n\n| | |\n|---|---|\n| Qué cambia | ' + descripcion.replace(/\|/g, '/') + ' |\n' +
      '| Antes | v' + (antes || '?') + ' |\n| La app corre con | ' + (rev.cuenta || '?') + ' |\n| Link del equipo | ' + LINK_EQUIPO() + ' |\n\n' +
      'Si usas la liga pública de firma, actualízala a mano (Implementar → Administrar implementaciones → lápiz → ' +
      'versión ' + m[1] + ' → confirma "Cualquier usuario" antes de guardar -- la API se lo resetea solo).\n\n' +
      (antes ? 'Si algo salió mal: **Run workflow** → acción "regresar a una versión" → versión `' + antes + '`.' : ''));
  } else if (destino === 'prod') {
    resumen_('## 🔎 Subido a producción sin desplegar\n\nEl código quedó en el link `/dev`; el equipo sigue en la versión de antes.');
  }
}

main().catch((e) => { console.error('✘ ' + e.message); process.exit(1); });
