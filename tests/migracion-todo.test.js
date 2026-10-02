/**
 * Pruebas del botón único de la migración en LAB (src/MigracionTodo.gs).
 *
 * Lo que protege: que la corrida encadenada NUNCA siga después de un problema, que una
 * etapa cortada por tiempo se repita en vez de saltarse, que no quede corriendo sola en un
 * libro que no es LAB, y que siempre quede quien la retome (o nadie, si terminó).
 *
 * Correr: node tests/migracion-todo.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn, patron) => { try { fn(); return false; } catch (e) { return patron.test(e.message); } };
const lee = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

const LAB = '1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o';
const LISTO_PASOS = '━━━ resumen ━━━\n\n  pasos corridos: 4 de 4\n\n  LISTO: corrieron los 4 pasos. Lee la auditoría de arriba.';
const CORTE_PASOS = '━━━ resumen ━━━\n\n  SE DETUVO POR TIEMPO antes de "mover".\n  Vuelve a correr lo mismo';
const DETENIDO_PASOS = '━━━ resumen ━━━\n\n  SE DETUVO en "referencias". No se corrieron los pasos siguientes, a propósito.';
const LISTO_REPL = '  LISTO. El destino quedó en estado PRE-migración.';
const CORTE_REPL = '  SE DETUVO por tiempo antes de "VEHICULOS".';

let props, activadores, llamadas, correos, bitacora, reloj, guion, apuntado, alCorrer;

/** guion: lo que contesta cada etapa, en orden; lo que sobra contesta LISTO */
function escenario(g) {
  props = { REPLANCHE_HOJAS_LISTAS: '["VEHICULOS"]', MIGRACION_IDS_SELLADOS: LAB + ',OTRO_LIBRO' };
  activadores = [];
  llamadas = [];
  correos = [];
  bitacora = [];
  reloj = 1000000;
  guion = g || {};
  apuntado = { VEHICULOS: LAB, TELEFONIA: LAB };
  alCorrer = null;
}

/** Una etapa falsa: anota que se llamó, avanza el reloj y contesta lo que diga el guion */
function etapa(nombre, listo) {
  return () => {
    llamadas.push(nombre);
    if (alCorrer) alCorrer(nombre);
    const cola = guion[nombre] || [];
    const r = cola.length ? cola.shift() : { texto: listo };
    reloj += r.ms || 1000;
    if (r.error) throw new Error(r.error);
    return r.texto;
  };
}

function cargar() {
  class RelojFalso extends Date {
    constructor(...a) { if (a.length) super(...a); else super(reloj); }
    static now() { return reloj; }
  }
  const ctx = vm.createContext({
    console,
    Date: RelojFalso,
    JSON,
    Logger: { log: () => {} },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'ayrton@x.com' }), getScriptTimeZone: () => 'America/Mexico_City' },
    Utilities: { formatDate: () => '12:00:00' },
    MailApp: { sendEmail: (para, asunto, cuerpo) => correos.push({ para, asunto, cuerpo }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = v; },
        deleteProperty: (k) => { delete props[k]; },
      }),
    },
    ScriptApp: {
      getProjectTriggers: () => activadores.slice(),
      deleteTrigger: (t) => { activadores = activadores.filter((x) => x !== t); },
      newTrigger: (h) => ({ timeBased: () => ({ after: (ms) => ({ create: () => {
        const t = { h, ms, getHandlerFunction: () => h };
        activadores.push(t);
        return t;
      } }) }) }),
    },
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => apuntado.VEHICULOS, TELEFONIA: () => apuntado.TELEFONIA } },
    REPL_DESTINO: LAB,
    REPL_PROP_AVANCE: 'REPLANCHE_HOJAS_LISTAS',
    MIGRACION_PROP_SELLO: 'MIGRACION_IDS_SELLADOS',
    pipeLog_: (ss, paso, modo, res, resumen) => bitacora.push({ ss, paso, res, resumen }),
    replancharDesdeProduccion: etapa('replanchar', LISTO_REPL),
    correrIdsTodo: etapa('ids', LISTO_PASOS),
    correrFamilia: (f) => etapa(f, LISTO_PASOS)(),
  });
  vm.runInContext(lee('MigracionTodo.gs') +
    '\nthis.api = { migracionTodoLab, migracionTodoContinuar, migracionTodoEstado, migracionTodoCancelar,' +
    ' todoResultado_, TODO_ETAPAS, TODO_CONTINUAR, TODO_PAUSA_MS, TODO_RESCATE_MS, TODO_MAX_REPETICIONES };', ctx);
  return ctx.api;
}

const estado = () => JSON.parse(props.MIGRACION_TODO);
const ORDEN = 'replanchar,ids,vehiculos,lineas,cajachica,capitalhumano';

console.log('\n1. Solo corre si el proyecto apunta a LAB: su primer paso borra el libro');
{
  escenario();
  const api = cargar();
  apuntado.VEHICULOS = 'LIBRO_DEL_EQUIPO';
  ok(truena(() => api.migracionTodoLab(), /SS_ID_VEHICULOS.*experimentos/), 'se niega si SS_ID_VEHICULOS no es LAB');
  apuntado.VEHICULOS = LAB;
  apuntado.TELEFONIA = 'OTRO';
  ok(truena(() => api.migracionTodoLab(), /SS_ID_TELEFONIA/), 'y si SS_ID_TELEFONIA no es LAB (Líneas escribiría allá)');
  ok(llamadas.length === 0 && !props.MIGRACION_TODO, 'no corrió nada ni dejó estado');
}

console.log('\n2. Etapas rápidas: todo en una sola ejecución, en orden');
{
  escenario();
  const api = cargar();
  const r = api.migracionTodoLab();
  ok(llamadas.join() === ORDEN, 'corrió las etapas en orden: ' + llamadas.join(' → '));
  ok(estado().estado === 'listo', 'terminó LISTO');
  ok(/LISTO/.test(r), 'y lo dice');
  ok(props.MIGRACION_IDS_SELLADOS === 'OTRO_LIBRO', 'quitó el sello de LAB y dejó el de los demás libros');
  ok(props.REPLANCHE_HOJAS_LISTAS === undefined, 'empezó el replanchado de cero (borró un avance viejo)');
  ok(activadores.length === 0, 'no dejó activadores');
  ok(correos.length === 1 && /LISTO/.test(correos[0].asunto), 'mandó un correo de LISTO');
  ok(bitacora.filter((b) => /^TODO \d/.test(b.paso)).length === 7, 'una fila en LOG_MIGRACION por etapa');
}

console.log('\n3. Etapas lentas: corre una, programa la siguiente en un minuto, y sigue sola');
{
  escenario({ replanchar: [{ texto: LISTO_REPL, ms: 50000 }], ids: [{ texto: LISTO_PASOS, ms: 120000 }] });
  const api = cargar();
  api.migracionTodoLab();
  ok(llamadas.join() === 'replanchar', 'en la primera ejecución solo cupo el replanchado');
  ok(activadores.length === 1 && activadores[0].h === api.TODO_CONTINUAR && activadores[0].ms === api.TODO_PAUSA_MS,
    'dejó UN activador, a un minuto, sin el de rescate');
  let vueltas = 0;
  while (activadores.length && vueltas++ < 20) api.migracionTodoContinuar();
  ok(llamadas.join() === ORDEN, 'los activadores la llevaron hasta el final');
  ok(estado().estado === 'listo' && activadores.length === 0, 'terminó LISTO y sin activadores');
}

console.log('\n4. Cortada por tiempo: la MISMA etapa se repite, no se salta');
{
  escenario({ ids: [{ texto: CORTE_PASOS }, { texto: CORTE_PASOS }] });
  const api = cargar();
  api.migracionTodoLab();
  ok(llamadas.filter((x) => x === 'ids').length === 3, 'ids corrió 3 veces (2 cortes y la buena)');
  ok(llamadas.join().indexOf('ids,ids,ids,vehiculos') !== -1, 'y vehiculos esperó a que ids terminara');
  ok(estado().estado === 'listo', 'terminó LISTO');
}

console.log('\n5. Un problema DETIENE todo: no sigue a la siguiente ni deja activadores');
{
  escenario({ vehiculos: [{ texto: DETENIDO_PASOS }] });
  const api = cargar();
  const r = api.migracionTodoLab();
  ok(llamadas.join() === 'replanchar,ids,vehiculos', 'no corrió nada después de vehiculos');
  ok(estado().estado === 'detenido', 'quedó DETENIDA');
  ok(/vehiculos/.test(r) && /referencias/.test(r), 'el mensaje dice en qué etapa y qué dijo');
  ok(activadores.length === 0, 'sin activadores: nadie la retoma por su cuenta');
  ok(correos.length === 1 && /SE DETUVO/.test(correos[0].asunto), 'avisó por correo');
  ok(truena(() => api.migracionTodoContinuar(), /./) === false && llamadas.length === 3,
    'continuar a mano no la revive');
}

console.log('\n6. Si una etapa truena, también se detiene');
{
  escenario({ capitalhumano: [{ error: 'COLABORADORES ACTUALIZADO no existe' }] });
  const api = cargar();
  api.migracionTodoLab();
  ok(estado().estado === 'detenido' && /COLABORADORES ACTUALIZADO/.test(estado().mensaje), 'detenida con el error');
}

console.log('\n7. Lo que no se reconoce NO se da por bueno');
{
  escenario({ ids: [{ texto: 'algo raro sin pie' }] });
  const api = cargar();
  api.migracionTodoLab();
  ok(llamadas.join() === 'replanchar,ids' && estado().estado === 'detenido', 'una salida rara detiene');
}

console.log('\n8. No arranca dos veces');
{
  escenario({ replanchar: [{ texto: LISTO_REPL, ms: 50000 }] });
  const api = cargar();
  api.migracionTodoLab();
  ok(truena(() => api.migracionTodoLab(), /Ya hay una corrida en curso/), 'con una en curso, se niega');
}

console.log('\n9. Antes de cada etapa queda un activador de rescate, por si Apps Script la mata');
{
  escenario();
  const api = cargar();
  const vistos = [];
  alCorrer = (n) => vistos.push(n + ':' + activadores.filter((t) => t.ms === api.TODO_RESCATE_MS).length);
  api.migracionTodoLab();
  ok(vistos.every((v) => /:1$/.test(v)), 'cada etapa corrió con su rescate puesto (' + vistos.join(' ') + ')');
  ok(activadores.length === 0, 'y al terminar bien se borró');
}

console.log('\n10. Cancelar mientras corre: no sigue');
{
  escenario();
  const api = cargar();
  alCorrer = (n) => { if (n === 'vehiculos') api.migracionTodoCancelar(); };
  const r = api.migracionTodoLab();
  ok(llamadas.join() === 'replanchar,ids,vehiculos', 'vehiculos terminó, pero ya no empezó lineas');
  ok(estado().estado === 'cancelado' && /Cancelada/.test(r), 'quedó CANCELADA');
  ok(activadores.length === 0, 'sin activadores');
}

console.log('\n11. Una etapa que nunca termina se rinde');
{
  const siempre = Array.from({ length: 30 }, () => ({ texto: CORTE_PASOS }));
  escenario({ ids: siempre });
  const api = cargar();
  api.migracionTodoLab();
  ok(estado().estado === 'detenido' && /no avanza|veces seguidas/.test(estado().mensaje), 'se detuvo');
  ok(llamadas.filter((x) => x === 'ids').length === api.TODO_MAX_REPETICIONES + 1, 'después de ' + (api.TODO_MAX_REPETICIONES + 1) + ' intentos');
}

console.log('\n12. Las frases que lee son las que de verdad escriben los pipelines');
{
  escenario();
  const api = cargar();
  const familia = lee('MigracionFamilia.gs');
  const replanche = lee('MigracionReplanche.gs');
  ok(familia.indexOf("'  SE DETUVO POR TIEMPO antes de \"'") !== -1, 'correrPasos_ dice "SE DETUVO POR TIEMPO"');
  ok(familia.indexOf("(p.escribir ? 'SE DETUVO' : 'FALLÓ') + ' en \"'") !== -1, 'correrPasos_ dice "SE DETUVO en \\""');
  ok(familia.indexOf("'  LISTO: corrieron los '") !== -1, 'correrPasos_ dice "LISTO:"');
  ok(replanche.indexOf("'  SE DETUVO por tiempo antes de \"'") !== -1, 'el replanchado dice "SE DETUVO por tiempo"');
  ok(replanche.indexOf("'  LISTO. El destino") !== -1, 'el replanchado dice "LISTO."');
  ok(api.todoResultado_(CORTE_REPL) === 'repetir' && api.todoResultado_(LISTO_REPL) === 'siguiente', 'y las clasifica bien');
  // Un "SE DETUVO en" con LISTO en otro lado sigue siendo un alto
  ok(api.todoResultado_(DETENIDO_PASOS + '\n LISTO') === 'detener', 'un alto gana sobre un LISTO');
}

console.log('\n13. No se olvida una familia nueva');
{
  const ctx = vm.createContext({ console });
  vm.runInContext(lee('utils', 'Ids.gs') + '\n' + lee('config', 'Entidades.gs') + '\nthis.E = Entidades;', ctx);
  escenario();
  const api = cargar();
  const enEtapas = api.TODO_ETAPAS.map((e) => e.nombre);
  const faltan = ctx.E.familias().filter((f) => f !== 'otros' && enEtapas.indexOf(f) === -1);
  ok(faltan.length === 0, 'cada familia del catálogo (salvo "otros") tiene su etapa' + (faltan.length ? ': faltan ' + faltan : ''));
  ok(typeof vm.runInContext('typeof ' + api.TODO_CONTINUAR, vm.createContext({})) === 'string' &&
    lee('MigracionTodo.gs').indexOf('function ' + api.TODO_CONTINUAR + '()') !== -1,
  'el activador llama a una función pública que existe');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
