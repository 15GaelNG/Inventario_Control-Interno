/**
 * El candado de las funciones del editor (soloEditor_, src/Code.gs).
 *
 * En Apps Script cualquier función de nivel superior que no termine en "_" se puede llamar
 * desde el navegador (google.script.run) y la web app corre con los permisos de quien la
 * desplegó. Esta prueba revisa que el candado detenga a otra persona y, sobre todo, que
 * TODA función de nivel superior de los archivos de administración lo tenga: si alguien
 * agrega una nueva sin candado, aquí falla. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = (p) => path.join(__dirname, '..', 'src', p);
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function conSesion(activo, efectivo) {
  const ctx = vm.createContext({
    Session: { getActiveUser: () => ({ getEmail: () => activo }), getEffectiveUser: () => ({ getEmail: () => efectivo }) },
    HtmlService: {},
  });
  vm.runInContext(fs.readFileSync(src('Code.gs'), 'utf8') + '\nthis.soloEditor_ = soloEditor_;', ctx);
  try { ctx.soloEditor_(); return true; } catch (e) { return false; }
}

console.log('1. El candado');
ok(conSesion('dueno@ciudadmaderas.com', 'dueno@ciudadmaderas.com'), 'desde el editor (quien corre = dueño): pasa');
ok(conSesion('', 'dueno@ciudadmaderas.com'), 'desde un activador (sin usuario activo): pasa');
ok(!conSesion('otra.persona@ciudadmaderas.com', 'dueno@ciudadmaderas.com'), 'otra persona desde la web app: se detiene');
ok(conSesion('DUENO@ciudadmaderas.com', 'dueno@ciudadmaderas.com'), 'sin importar mayúsculas en el correo');

console.log('2. Toda función de nivel superior de src/ tiene candado (no solo las de administración)');
// Las que SÍ se llaman desde la app: doGet/include (servir la página), las api* (revisan sesión
// y permiso con su token) y las de compartir (con token piden ADMIN; sin token, soloEditor_)
const PERMITIDAS = new Set(['doGet', 'include']);
// Los activadores de edición no pueden llevar soloEditor_ (el usuario activo es quien editó): llevan su guarda
const ACTIVADORES = { alEditarLibro: /if \(!e \|\| !e\.source \|\| typeof e\.source\.getId !== 'function'/ };
// Todos los .gs de src/ (fase 6.4: antes era una lista fija y se quedaron fuera MigracionResponsivasHeredadas y los
// procesos largos que siguen con un activador de tiempo: Adquisición, INE)
const todos = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? todos(path.join(d, e.name)) : [path.join(d, e.name)]));
const ARCHIVOS = todos(src('')).filter((f) => f.endsWith('.gs')).map((f) => path.relative(src(''), f));
const sinCandado = [];
let revisadas = 0;
ARCHIVOS.forEach((archivo) => {
  const lineas = fs.readFileSync(src(archivo), 'utf8').split(/\r?\n/);
  lineas.forEach((l, i) => {
    const m = /^function ([A-Za-z0-9_]+)\s*\(/.exec(l);
    if (!m || m[1].endsWith('_') || /^api/.test(m[1]) || PERMITIDAS.has(m[1])) return;
    revisadas++;
    if (ACTIVADORES[m[1]]) {
      if (!ACTIVADORES[m[1]].test(lineas.slice(i + 1, i + 4).join('\n'))) sinCandado.push(archivo + ': ' + m[1] + ' (sin su guarda)');
      return;
    }
    // El cuerpo hasta la siguiente función de nivel superior (las de compartir lo llevan
    // en un if/else después de un comentario largo)
    let j = i + 1;
    while (j < lineas.length && !/^function /.test(lineas[j])) j++;
    const cuerpo = lineas.slice(i + 1, j).join('\n');
    if (!/soloEditor_\(\)/.test(cuerpo)) sinCandado.push(archivo + ': ' + m[1]);
  });
});
ok(revisadas > 60, revisadas + ' funciones de administración revisadas');
ok(!sinCandado.length, sinCandado.length ? 'SIN candado: ' + sinCandado.join(', ') : 'todas empiezan con soloEditor_()');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
