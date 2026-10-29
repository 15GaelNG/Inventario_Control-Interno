/**
 * apiLote (src/ClientApi.gs, 29-oct): varias llamadas de fondo de la pantalla en UNA ejecución. Solo la lista cerrada
 * (LOTE_PERMITIDAS_), sin anidar, con un máximo de partes y la sesión del lote válida; cada parte con su propia
 * respuesta o error, y empezando como su propia llamada (Auth.llamadaNueva): la consulta del vigía (automática, no
 * renueva la sesión) no deja sin renovar a las demás.
 *
 * Correr: node tests/lote-servidor.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function cargar() {
  let automatica = false;
  const renovo = [];   // por cada validarSesion: ¿habría renovado la sesión?
  const ctx = vm.createContext({
    Auth: {
      automatica: () => { automatica = true; },
      llamadaNueva: () => { automatica = false; },
      validarSesion: (token) => {
        if (token !== 'tok') throw new Error('Sesión expirada, inicia sesión de nuevo');
        renovo.push(!automatica);
        return { correo: 'ana@x.com' };
      },
    },
    CacheHojas: {
      conHuella: (armar) => ({ v: armar(), huella: { ver_x: '1' } }),
      vigentes: (claves) => { const r = {}; claves.forEach((c) => { r[c] = '1'; }); return r; },
    },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'ClientApi.gs'), 'utf8'), ctx);
  // Las listas de mentira: validan su token como las de verdad (renuevan la sesión: es lo que pidió la persona)
  vm.runInContext('function apiListarCosas(token) { Auth.validarSesion(token); return [1, 2]; }' +
    'function apiListarFallas(token) { Auth.validarSesion(token); throw new Error("Sin permiso para Fallas"); }' +
    'function apiBorrarTodo(token) { return "no debió correr"; }', ctx);
  return { ctx, renovo };
}

console.log('1. Cada parte con su respuesta (y su error), en una ejecución');
{
  const { ctx } = cargar();
  const r = ctx.apiLote('tok', [
    { fn: 'apiListaConHuella', args: ['tok', 'apiListarCosas', []] },
    { fn: 'apiHuellasVigentes', args: ['tok', ['ver_abc_HOJA']] },
    { fn: 'apiListaConHuella', args: ['tok', 'apiListarFallas', []] },
  ]);
  ok(r[0].ok && JSON.stringify(r[0].v.v) === '[1,2]' && r[0].v.huella.ver_x === '1', 'una lista, con su huella');
  ok(r[1].ok && r[1].v.ver_abc_HOJA === '1', 'la consulta del vigía');
  ok(!r[2].ok && r[2].error === 'Sin permiso para Fallas', 'el error de una parte no tumba a las demás');
}

console.log('2. Solo la lista cerrada, sin anidar y con un máximo');
{
  const { ctx } = cargar();
  const r = ctx.apiLote('tok', [{ fn: 'apiBorrarTodo', args: ['tok'] }, { fn: 'apiLote', args: ['tok', []] }, { fn: 'eval', args: ['1'] }]);
  ok(r.every((x) => !x.ok && /No se puede pedir en lote/.test(x.error)), 'una api… fuera de la lista, apiLote dentro de apiLote o cualquier otra cosa: no corre');
  ok(!r.some((x) => x.v === 'no debió correr'), 'y de verdad no corrió');
  const lista = ctx.apiLote('tok', [{ fn: 'apiListaConHuella', args: ['tok', 'apiBorrarTodo', []] }]);
  ok(!lista[0].ok && /Lista desconocida/.test(lista[0].error), 'por apiListaConHuella solo pasan listas (su propio filtro)');
  const truena = (fn) => { try { fn(); return ''; } catch (e) { return e.message; } };
  ok(/de 1 a 6/.test(truena(() => ctx.apiLote('tok', Array.from({ length: 7 }, () => ({ fn: 'apiHuellasVigentes', args: ['tok', []] }))))), 'más de 6 partes: no');
  ok(/de 1 a 6/.test(truena(() => ctx.apiLote('tok', []))) && /de 1 a 6/.test(truena(() => ctx.apiLote('tok', 'x'))), 'vacío o sin arreglo: no');
}

console.log('3. Sin sesión, nada');
{
  const { ctx } = cargar();
  let error = '';
  try { ctx.apiLote('robado', [{ fn: 'apiListaConHuella', args: ['tok', 'apiListarCosas', []] }]); } catch (e) { error = e.message; }
  ok(/Sesión expirada/.test(error), 'el lote pide una sesión válida antes de correr cualquier parte');
}

console.log('4. Cada parte renueva (o no) la sesión como si fuera su propia ejecución');
{
  const { ctx, renovo } = cargar();
  ctx.apiLote('tok', [
    { fn: 'apiHuellasVigentes', args: ['tok', []] },
    { fn: 'apiListaConHuella', args: ['tok', 'apiListarCosas', []] },
  ]);
  // renovo: [el lote, el vigía, la lista]
  ok(renovo[0] === false, 'validar el lote no cuenta como actividad');
  ok(renovo[1] === false, 'la consulta del vigía no renueva (es automática)');
  ok(renovo[2] === true, 'la lista que va después sí renueva: la marca del vigía no se le cuela');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
