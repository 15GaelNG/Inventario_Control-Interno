/**
 * partir.js — parte src/html/js/app.html en la base + una pantalla por archivo (homologación, fase 6.1; 19-oct).
 *
 *   node tools/app/partir.js            revisa y escribe
 *   node tools/app/partir.js --revisar  solo revisa y dice qué haría
 *   … --raiz <carpeta>                  sobre otra copia del repo (otra rama en su carpeta)
 *
 * app.html no está encerrado en una función: sus declaraciones son globales y cualquier <script> posterior las ve, así
 * que esto solo MUEVE (sin cambiar una letra). Corta por nombres, no por renglones, para que cada rama lo corra sobre su
 * propio app.html y salgan los mismos archivos: lo que una rama agregó dentro de una región viaja con ella. Después de
 * correrlo (y hacer commit), traer master solo choca donde de verdad cambió el mismo bloque.
 *
 * Revisa que cada sentencia quede una sola vez y que nada que corre al cargar use algo de un archivo que carga después
 * (tests/orden-de-carga.js, con los archivos propuestos). Si algo falla, no escribe.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { revisarOrdenDeCarga } = require('../../tests/orden-de-carga');

// --raiz <carpeta>: otra copia del repo (p. ej. otra rama en su propia carpeta); por omisión, este
const iRaiz = process.argv.indexOf('--raiz');
const RAIZ = iRaiz > 0 ? path.resolve(process.argv[iRaiz + 1]) : path.resolve(__dirname, '..', '..');
const SRC = path.join(RAIZ, 'src');
const JS = path.join(SRC, 'html', 'js');
const SOLO_REVISAR = process.argv.includes('--revisar');

// Regiones del primer nivel: [desde, hasta) por el nombre de su primera declaración; hasta: null = hasta el cableado
// final (lo primero que no es declaración después de "desde")
const REGIONES = [
  { desde: 'DE_SENSORES', hasta: 'initIncidencias', a: 'app-vehiculos' },
  { desde: 'initIncidencias', hasta: 'tablaFicha', a: 'app-incidencias' },
  { desde: 'badgeEstadoFirma', hasta: 'initUber', a: 'app-vehiculos' },
  { desde: 'initUber', hasta: 'CAMPOS_TICKET', a: 'app-uber' },
  { desde: 'CAMPOS_TICKET', hasta: null, a: 'app-tickets' },
];
const SUELTOS = { fijarFechaRegistroHoy: 'app-incidencias' };
// Dentro de una región, pero de todos (las usan Arqueos, Caja Chica, Sensores, Index.html…): se quedan en la base
const QUEDAN = ['slugCampo', 'leerArchivoBase64'];
const ARCHIVOS = ['app-vehiculos', 'app-incidencias', 'app-uber', 'app-tickets'];
const CABECERAS = {
  'app-vehiculos': 'Vehículos: los campos del formulario (CAMPOS_VEHICULO y sus ayudantes, que usan también Arqueos, Caja\n' +
    '   * Chica, Panorama y Reasignaciones), las ayudas de firma de responsiva y adherente, la pantalla (initVehiculos: lista,\n' +
    '   * ficha, captura, responsiva y adherente) y su tour y ayuda.',
  'app-incidencias': 'Incidencias: la pantalla (initIncidencias) y su ayuda.',
  'app-uber': 'Uber (usuarios autorizados): la pantalla (initUber) y su ayuda.',
  'app-tickets': 'Tickets (bitácora general de atención): sus campos (CAMPOS_TICKET, que usa también Help Desk), la pantalla\n' +
    '   * (initTickets) y su ayuda.',
};

function fallar(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

const crudo = fs.readFileSync(path.join(JS, 'app.html'), 'utf8');
const EOL = crudo.includes('\r\n') ? '\r\n' : '\n';
const html = crudo.replace(/\r\n/g, '\n');
if (!/function initVehiculos\(/.test(html)) fallar('app.html ya no trae initVehiculos: ¿ya se partió?');
const i0 = html.indexOf('<script>') + '<script>'.length;
const iFin = html.lastIndexOf('</script>');
if (html.indexOf('<script>', i0) > 0 && html.indexOf('<script>', i0) < iFin) fallar('app.html trae más de un <script>');
const js = html.slice(i0, iFin);
const sentencias = acorn.parse(js, { ecmaVersion: 2022 }).body;

// Trozos: cada sentencia con lo de arriba (comentarios, renglones en blanco) hasta el fin de su renglón
let cursor = js.lastIndexOf('\n', sentencias[0].start) + 1;
const cabeza = js.slice(0, cursor);
const trozos = sentencias.map((st) => {
  const fin = js.indexOf('\n', st.end - 1) + 1 || js.length;
  const t = { st, texto: js.slice(cursor, fin) };
  if (cursor > st.start) fallar('dos sentencias en un renglón: ' + js.slice(st.start, st.start + 50));
  cursor = fin;
  return t;
});
const cola = js.slice(cursor);
const nombresDe = (st) => (st.type === 'FunctionDeclaration' ? [st.id.name]
  : st.type === 'VariableDeclaration' ? st.declarations.filter((d) => d.id.type === 'Identifier').map((d) => d.id.name) : []);
const indiceDe = (nombre) => {
  const i = trozos.findIndex((t) => nombresDe(t.st).includes(nombre));
  if (i < 0) fallar('no encontré ' + nombre + ' en el primer nivel de app.html');
  return i;
};

// Destino de cada trozo
const destino = trozos.map(() => 'app');
REGIONES.forEach((r) => {
  const ini = indiceDe(r.desde);
  let fin = r.hasta ? indiceDe(r.hasta) : trozos.findIndex((t, i) => i > ini && !/Declaration/.test(t.st.type));
  if (fin < 0) fin = trozos.length;
  if (fin <= ini) fallar('la región ' + r.desde + '→' + r.hasta + ' está al revés');
  for (let i = ini; i < fin; i++) {
    if (destino[i] !== 'app') fallar(nombresDe(trozos[i].st).join(',') + ' cae en dos regiones');
    if (!/Declaration/.test(trozos[i].st.type)) fallar('algo que corre al cargar quedó en una región: ' + trozos[i].texto.trim().slice(0, 80));
    destino[i] = r.a;
  }
});
Object.entries(SUELTOS).forEach(([n, a]) => { destino[indiceDe(n)] = a; });
QUEDAN.forEach((n) => { destino[indiceDe(n)] = 'app'; });

// Los archivos
const escritos = new Map();
const emitir = (t) => { escritos.set(t, (escritos.get(t) || 0) + 1); return t.texto; };
const salida = {};
salida.app = html.slice(0, i0) + cabeza + trozos.filter((t, i) => destino[i] === 'app').map(emitir).join('') + cola + html.slice(iFin);
ARCHIVOS.forEach((a) => {
  const mios = trozos.filter((t, i) => destino[i] === a);
  if (!mios.length) fallar(a + ' quedó vacío');
  salida[a] = '<script>\n  /**\n   * ' + a + '.html — ' + CABECERAS[a] + '\n' +
    '   * Era parte de app.html (fase 6.1, tools/app/partir.js). Comparte el espacio global: usa los ayudantes de app.html,\n' +
    '   * que carga antes (Index.html lo incluye justo después de app; los que vienen después ya lo ven).\n   */\n' +
    mios.map(emitir).join('').replace(/^\n+/, '\n') + '</script>\n';
});
trozos.forEach((t) => { if (escritos.get(t) !== 1) fallar('el trozo de ' + (nombresDe(t.st).join(',') || t.st.type) + ' quedó ' + (escritos.get(t) || 0) + ' veces'); });

// Index.html: las pantallas justo después de app
const index = fs.readFileSync(path.join(SRC, 'html', 'Index.html'), 'utf8').replace(/\r\n/g, '\n');
const incApp = "  <?!= include('html/js/app'); ?>\n";
if (!index.includes(incApp)) fallar('Index.html no incluye html/js/app');
const incNuevos = ARCHIVOS.map((a) => "  <?!= include('html/js/" + a + "'); ?>\n").join('');
const indexNuevo = index.includes(incNuevos) ? index : index.replace(incApp, incApp + incNuevos);

// Nada que corre al cargar usa algo de un archivo posterior (con los archivos propuestos)
const propuestos = { 'html/Index': indexNuevo };
Object.entries(salida).forEach(([a, txt]) => { propuestos['html/js/' + a] = txt; });
const malos = revisarOrdenDeCarga({ leer: (r) => propuestos[r] || fs.readFileSync(path.join(SRC, r + '.html'), 'utf8') });
if (malos.length) fallar('orden de carga:\n  ' + malos.join('\n  '));

// Resumen y escritura
Object.entries(salida).forEach(([a, txt]) => console.log('  ' + (a + '.html').padEnd(24) + String(txt.split('\n').length).padStart(6) + ' líneas'));
console.log('  se quedan en la base: ' + QUEDAN.join(', ') + '; orden de carga: bien');
if (SOLO_REVISAR) { console.log('(--revisar: no escribí nada)'); process.exit(0); }
Object.entries(salida).forEach(([a, txt]) => fs.writeFileSync(path.join(JS, a + '.html'), txt.replace(/\n/g, EOL)));
fs.writeFileSync(path.join(SRC, 'html', 'Index.html'), indexNuevo.replace(/\n/g, EOL));
console.log('Escrito.');
