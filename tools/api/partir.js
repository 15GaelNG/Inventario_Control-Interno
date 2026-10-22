/**
 * partir.js — parte src/ClientApi.gs en la base + un archivo por módulo en src/api/ (homologación, fase 6.3; 22-oct).
 *
 *   node tools/api/partir.js            revisa y escribe
 *   node tools/api/partir.js --revisar  solo revisa y dice qué haría
 *   … --raiz <carpeta>                  sobre otra copia del repo (otra rama en su carpeta)
 *
 * En Apps Script todos los .gs comparten el ámbito global y google.script.run llama cualquier función de primer nivel,
 * así que esto solo MUEVE (sin cambiar una letra del código; solo los títulos de sección pierden su "(rama `ayrton`)").
 * Regla: cada api… vive en el archivo del módulo dueño (el servicio al que llama / el permiso que pide); la base se
 * queda con lo de todos (medir, listas con huella, Inicio, sesión, campanita, borrar, fichas en una llamada).
 * Corta por nombres: cada sentencia va al archivo de su sección (SECCIONES) salvo las de REUBICAR, así cada rama lo
 * corre sobre su propio ClientApi.gs y lo que agregó dentro de una sección viaja con ella. Una sección que no está en
 * el mapa hace fallar (nada se pierde en silencio). Revisa que cada sentencia quede una vez, que las funciones de
 * primer nivel sean las mismas antes y después, que todo compile y que en src/api/ solo haya funciones y literales.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const iRaiz = process.argv.indexOf('--raiz');
const RAIZ = iRaiz > 0 ? path.resolve(process.argv[iRaiz + 1]) : path.resolve(__dirname, '..', '..');
const SOLO_REVISAR = process.argv.includes('--revisar');
const ARCHIVO = path.join(RAIZ, 'src', 'ClientApi.gs');
const DIR_API = path.join(RAIZ, 'src', 'api');
const BASE = 'ClientApi';

// Título de la sección (hasta el primer " (") → archivo
const SECCIONES = {
  'Medir': BASE,
  'Pantallas que se actualizan solas': BASE,
  'Dashboard': BASE,
  'Auth': BASE,
  'Vehículos': 'Vehiculos',
  'Uber': 'Uber',
  'Tickets': 'Tickets',
  'Help Desk': 'Helpdesk',
  'Cajas Chicas': 'CajaChica',
  'Historial de cambios de monto': 'CambiosMonto',
  'Reasignaciones Vehiculares': 'Reasignaciones',
  'Responsiva Vehicular': 'Responsiva',
  'Adquisición Vehicular': 'Adquisicion',
  'Solicitud de compra': 'SolicitudCompra',
  'Adherente Vehicular': 'Adherente',
  'Firma a distancia': 'FirmaRemota',
  'Arqueos': 'Arqueos',
  'Listas de referencia': 'Listas',
  'Líneas': 'Lineas',
  'Incidencias': 'Incidencias',
  'Verificaciones': 'Verificaciones',
  'Instalación de sensores': 'Sensores',
  'Geotab, solo lectura': 'Sensores',
  'Hologramas / tarjetas de combustible': 'Hologramas',
  'Permisos por módulo': 'Permisos',
  'Inspección vehicular': 'Inspecciones',
  'Datos conectados y Salud': 'Relaciones',
  'Accesorios de la unidad': 'Accesorios',   // solo en ayrton
};

// Lo que estaba en la sección de otro módulo: va al de su dueño, bajo su propio título
const REUBICAR = [
  { a: BASE, titulo: 'Campanita (notificaciones de todos los módulos)', nombres: ['apiNotificaciones'] },
  { a: BASE, titulo: 'Borrar: qué lo impide (Vehículos y Caja Chica)', nombres: ['MODULO_AL_BORRAR_', 'apiQueImpideBorrar'] },
  { a: BASE, titulo: 'Fichas en una llamada (Vehículos, Caja Chica): cada pestaña con el permiso de su módulo', nombres: ['partesDeFicha_'] },
  { a: 'Verificaciones', titulo: 'Para la ficha de Vehículos', nombres: ['apiVerificacionesPorFolio', 'apiBuscarVerificacionPorId'] },
  { a: 'Sensores', titulo: 'Para la ficha de Vehículos', nombres: ['apiSensoresPorFolio', 'apiBuscarSensorPorId'] },
  { a: 'Hologramas', titulo: 'Para la ficha de Vehículos', nombres: ['apiHologramasPorFolio', 'apiBuscarHologramaPorId'] },
  { a: 'Incidencias', titulo: 'Para la ficha de Vehículos', nombres: ['apiIncidenciasPorFolio', 'apiBuscarIncidenciaPorId'] },
  { a: 'Inspecciones', titulo: 'Para la ficha de Vehículos (y el expediente del NUCO)', nombres: ['apiInspeccionesPorFolio', 'apiBuscarInspeccionPorId', 'apiInspeccionesExpediente', 'apiFotosInspeccion'] },
  { a: 'Reasignaciones', titulo: 'Para la ficha de Vehículos', nombres: ['apiListarReasignacionesVehicularesPorFolio'] },
  { a: 'Arqueos', titulo: 'Para la ficha de Caja Chica', nombres: ['apiArqueosPorIdCch'] },
  { a: 'CambiosMonto', titulo: 'Para la ficha de Caja Chica', nombres: ['apiCambiosMontoPorIdCch', 'apiBuscarCambioMontoPorId'] },
  { a: 'Tickets', titulo: 'Lista de referencia', nombres: ['apiListarSolicitantesTickets'] },
  { a: 'CapitalHumano', titulo: 'Colaboradores y Capital Humano', nombres: ['apiListarColaboradores', 'apiCapitalHumanoResumen', 'apiCapitalHumanoHistorial', 'apiCapitalHumanoCargar'] },
  { a: 'Temporada', titulo: 'Temporada y ofrenda (Apariencia)', nombres: ['apiTemporadaGuardar', 'apiOfrenda', 'apiOfrendaEncender', 'apiOfrendaApagar'] },
];

// Qué es cada archivo (su cabecera)
const DESCRIPCION = {
  Vehiculos: 'Vehículos: la lista, la ficha en una llamada, los documentos del NUCO, alta y edición, y Cambios de Vehículos (VehiculosService, CambiosVehiculosService, ExpedienteNuco)',
  Uber: 'Uber (UberService)',
  Tickets: 'Tickets (TicketsService)',
  Helpdesk: 'Help Desk de TI (HelpdeskApi, HelpdeskService); cada llamada revisa Config.exigirEncendido(\'helpdesk\')',
  CajaChica: 'Cajas Chicas: la lista, la ficha en una llamada, alta y edición (CajasChicasService)',
  CambiosMonto: 'el historial de cambios de monto de Caja Chica (CambiosMontoCCHService)',
  Reasignaciones: 'Reasignaciones Vehiculares (ReasignacionesVehicularesService)',
  Responsiva: 'Responsiva Vehicular (ResponsivaVehicularService)',
  Adquisicion: 'Adquisición Vehicular, el expediente externo de solo lectura (AdquisicionVehicularService)',
  SolicitudCompra: 'Solicitud de compra, el puente hacia Adquisición antes de que exista el vehículo (SolicitudCompraService)',
  Adherente: 'Adherente Vehicular (AdherenteVehicularService)',
  FirmaRemota: 'la firma a distancia por liga, de la Responsiva y el Adherente Vehicular',
  Arqueos: 'Arqueos (ArqueosService)',
  Listas: 'las listas de referencia de los formularios (ListasService)',
  Lineas: 'Líneas: equipos y líneas telefónicas, accesorios, resguardos y cancelaciones (TelefoniaService, LineasAccesorios)',
  Incidencias: 'Incidencias (IncidenciasService)',
  Verificaciones: 'Verificaciones (VerificacionesService)',
  Sensores: 'Instalación de sensores y Geotab de solo lectura (SensoresService)',
  Hologramas: 'Hologramas y tarjetas de combustible (HologramasService)',
  Permisos: 'Permisos por módulo (PermisosService; se apoya en Auth.validarSesion)',
  Inspecciones: 'Inspección vehicular (InspeccionesService) y lo de inspecciones en el expediente del NUCO',
  Relaciones: 'Datos conectados y Salud, en Administración (DatosConectados, Relaciones, CapitalHumano)',
  CapitalHumano: 'colaboradores y Capital Humano (CapitalHumano)',
  Temporada: 'la temporada y la ofrenda de Apariencia (TemporadaService)',
  Accesorios: 'los accesorios de la unidad (AccesoriosVehiculoService)',
};

const CABECERA_BASE = [
  '/**',
  ' * ClientApi.gs',
  ' * La base de la superficie que el cliente puede llamar vía google.script.run (que solo invoca funciones de nivel',
  ' * superior, no métodos de objetos namespaced). Cada api… es un wrapper delgado hacia el Service correspondiente —',
  ' * así el código de negocio real vive en un solo lugar (services/*.gs) y aquí solo se decide qué queda expuesto.',
  ' *',
  ' * Desde la fase 6.3 (22-oct, tools/api/partir.js) cada módulo tiene su archivo en src/api/<Módulo>.gs, el del',
  ' * módulo dueño (el servicio al que llama / el permiso que pide). Aquí queda solo lo de todos: medir, las listas con',
  ' * huella y el vigía, el Inicio, la sesión, la campanita, qué impide borrar y el armado de fichas en una llamada.',
  ' * Una api… nueva va en el archivo de su módulo (módulo nuevo = archivo nuevo) y se llama api<Módulo><Qué>;',
  ' * source-contracts lo revisa. Todos los .gs comparten el ámbito global: no importa en qué archivo esté.',
  ' */',
].join('\n') + '\n';

function fallar(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

const crudo = fs.readFileSync(ARCHIVO, 'utf8');
const EOL = crudo.includes('\r\n') ? '\r\n' : '\n';
const js = crudo.replace(/\r\n/g, '\n');
if (fs.existsSync(DIR_API)) fallar('src/api/ ya existe: ClientApi.gs ya está partido');
const ast = acorn.parse(js, { ecmaVersion: 2022, ranges: true });
const nombreDe = (st) => (st.type === 'FunctionDeclaration' ? st.id.name
  : st.type === 'VariableDeclaration' && st.declarations.length === 1 ? st.declarations[0].id.name : null);

// ---- Trozos: cada sentencia con lo de arriba (comentarios) y su sección ----
const inicioRenglon = (pos) => js.lastIndexOf('\n', pos - 1) + 1;
const finRenglon = (pos) => { const i = js.indexOf('\n', pos); return i < 0 ? js.length : i + 1; };
const RE_SECCION = /^\/\/ --- (.+?) ---[ \t]*\n/gm;
const secciones = [...js.matchAll(RE_SECCION)].map((m) => ({ titulo: m[1], i: m.index, fin: m.index + m[0].length }));
if (!secciones.length) fallar('no encontré ningún "// --- Sección ---"');
const corto = (t) => t.replace(/ \(.*$/, '');
const limpio = (t) => t.replace(/ \(rama `ayrton`\)/, '').replace(/\(rama `ayrton`; /, '(');
const cabeceraVieja = js.slice(0, secciones[0].i);
let cursor = secciones[0].i;
const trozos = ast.body.map((st) => {
  const nombre = nombreDe(st);
  if (!nombre) fallar('sentencia de primer nivel que no es función ni const de un nombre: ' + js.slice(st.start, st.start + 60));
  const ini = inicioRenglon(st.start);
  const fin = finRenglon(st.end - 1);
  if (ini < cursor) fallar('dos sentencias en un renglón cerca de ' + nombre);
  let arriba = js.slice(cursor, ini);
  const sec = secciones.filter((s) => s.i < ini).pop();
  // El título de sección no viaja con la sentencia: cada archivo pone los suyos
  arriba = arriba.replace(RE_SECCION, '');
  cursor = fin;
  return { st, nombre, seccion: sec.titulo, arriba, texto: js.slice(ini, fin) };
});
const cola = js.slice(cursor);
if (cola.trim()) fallar('algo después de la última sentencia: ' + cola.trim().slice(0, 60));

// ---- A qué archivo va cada trozo ----
const reubicado = new Map();
REUBICAR.forEach((g) => g.nombres.forEach((n) => reubicado.set(n, g)));
const sinSeccion = new Set();
trozos.forEach((t) => {
  const g = reubicado.get(t.nombre);
  if (g) { t.archivo = g.a; t.grupo = g.titulo; return; }
  const a = SECCIONES[corto(t.seccion)];
  if (!a) { sinSeccion.add(t.seccion); return; }
  t.archivo = a;
  t.grupo = limpio(t.seccion);
});
if (sinSeccion.size) fallar('secciones que no están en el mapa (agregarlas a SECCIONES): ' + [...sinSeccion].join(' | '));
const faltan = [...reubicado.keys()].filter((n) => !trozos.some((t) => t.nombre === n));
if (faltan.length) fallar('en REUBICAR pero no en ClientApi.gs: ' + faltan.join(', '));

// ---- Armar cada archivo: sus secciones en el orden original, luego lo reubicado ----
const archivos = [...new Set([BASE].concat(trozos.map((t) => t.archivo)))];
const salida = {};
archivos.forEach((a) => {
  const mios = trozos.filter((t) => t.archivo === a);
  const propios = mios.filter((t) => !reubicado.has(t.nombre));
  const otros = mios.filter((t) => reubicado.has(t.nombre));
  let txt = a === BASE ? CABECERA_BASE : '/**\n * api/' + a + '.gs — ' + DESCRIPCION[a] + '.\n' +
    ' * Parte de la superficie de google.script.run (ver ClientApi.gs): wrappers delgados hacia su servicio.\n */\n';
  let grupo = null;
  propios.concat(otros).forEach((t) => {
    if (t.grupo !== grupo) { grupo = t.grupo; txt += '\n// --- ' + grupo + ' ---\n'; }
    txt += t.arriba.replace(/^\n+/, grupo && t === propios.concat(otros).find((x) => x.grupo === grupo) ? '' : '\n') + t.texto;
  });
  if (!DESCRIPCION[a] && a !== BASE) fallar('falta DESCRIPCION de ' + a);
  salida[a] = txt.replace(/\n{3,}/g, '\n\n');
});

// ---- Revisiones ----
const funcionesDe = (texto) => acorn.parse(texto, { ecmaVersion: 2022 }).body.map(nombreDe);
const antes = funcionesDe(js).sort();
let despues = [];
Object.entries(salida).forEach(([a, txt]) => {
  let cuerpo;
  try { cuerpo = acorn.parse(txt, { ecmaVersion: 2022 }).body; } catch (e) { fallar(a + ' no compila: ' + e.message); }
  if (a !== BASE) {
    cuerpo.forEach((st) => {
      const ok = st.type === 'FunctionDeclaration' || (st.type === 'VariableDeclaration' && st.declarations.every((d) =>
        d.init && /^(Literal|ArrayExpression|ObjectExpression|ArrowFunctionExpression|FunctionExpression)$/.test(d.init.type)));
      if (!ok) fallar(a + ': en src/api/ solo funciones y literales de primer nivel (' + (nombreDe(st) || st.type) + ')');
    });
  }
  despues = despues.concat(cuerpo.map(nombreDe));
});
despues.sort();
if (JSON.stringify(antes) !== JSON.stringify(despues)) {
  fallar('las funciones de primer nivel no son las mismas: faltan ' + antes.filter((n) => !despues.includes(n)).join(',') +
    ' · sobran ' + despues.filter((n) => !antes.includes(n)).join(','));
}
// Cada trozo de código, tal cual, en algún archivo (y una sola vez)
trozos.forEach((t) => {
  const veces = Object.values(salida).reduce((s, txt) => s + txt.split(t.texto).length - 1, 0);
  if (veces !== 1) fallar(t.nombre + ' quedó ' + veces + ' veces');
});
if (!cabeceraVieja.includes('ClientApi.gs')) fallar('la cabecera de ClientApi.gs no es la esperada');

// ---- Resumen y escritura ----
const api = antes.filter((n) => /^api/.test(n)).length;
console.log(api + ' funciones api… en ' + archivos.length + ' archivos (base + ' + (archivos.length - 1) + ' en src/api/); reubicadas: ' + reubicado.size);
Object.entries(salida).forEach(([a, txt]) => console.log('  ' + (a === BASE ? 'ClientApi.gs' : 'api/' + a + '.gs').padEnd(26) +
  String(txt.split('\n').length).padStart(5) + ' líneas  ' + String(funcionesDe(txt).filter((n) => /^api/.test(n)).length).padStart(3) + ' api'));
if (SOLO_REVISAR) { console.log('(--revisar: no escribí nada)'); process.exit(0); }
fs.mkdirSync(DIR_API);
Object.entries(salida).forEach(([a, txt]) => {
  fs.writeFileSync(a === BASE ? ARCHIVO : path.join(DIR_API, a + '.gs'), txt.replace(/\n/g, EOL));
});
console.log('Escrito.');
