/**
 * Pruebas del candado reentrante (src/utils/Candado.gs). LockService es de mentira y, como el de verdad,
 * NO es reentrante: pedirlo dos veces sin soltarlo "se cuelga" (aquí truena con "Lock timeout").
 * Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function entorno(opciones) {
  const o = opciones || {};
  const estado = { tomado: false, pedidas: 0, soltadas: 0 };
  const lock = {
    waitLock: () => {
      estado.pedidas++;
      if (estado.tomado || o.ocupado) throw new Error('Lock timeout: another process was holding the lock for too long.');
      estado.tomado = true;
    },
    tryLock: () => {
      estado.pedidas++;
      if (estado.tomado || o.ocupado) return false;
      estado.tomado = true;
      return true;
    },
    releaseLock: () => { estado.soltadas++; estado.tomado = false; },
  };
  const contexto = vm.createContext({ LockService: { getScriptLock: () => lock } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Candado.gs'), 'utf8') +
    '\nthis.Candado = Candado;', contexto);
  return { Candado: contexto.Candado, estado };
}

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Uso normal');
{
  const { Candado, estado } = entorno();
  const r = Candado.con(() => { ok(Candado.tomado(), 'adentro, el hilo lo tiene'); return 42; });
  ok(r === 42, 'devuelve lo que regresa fn');
  ok(!Candado.tomado() && estado.pedidas === 1 && estado.soltadas === 1 && !estado.tomado, 'lo pide una vez y lo suelta');
}

console.log('2. Reentrante (lo que antes se colgaba)');
{
  const { Candado, estado } = entorno();
  const r = Candado.con(() => Candado.con(() => Candado.con(() => 'adentro')));
  ok(r === 'adentro', 'tres niveles anidados no se cuelgan');
  ok(estado.pedidas === 1 && estado.soltadas === 1, 'solo el primero lo pide y lo suelta');
  Candado.con(() => {
    Candado.con(() => {});
    ok(Candado.tomado(), 'al salir del anidado, el de afuera lo sigue teniendo');
  });
  ok(!Candado.tomado() && !estado.tomado, 'al salir del de afuera, se suelta');
}

console.log('3. Errores');
{
  const { Candado, estado } = entorno();
  let msg = '';
  try { Candado.con(() => Candado.con(() => { throw new Error('falló adentro'); })); } catch (e) { msg = e.message; }
  ok(msg === 'falló adentro', 'el error de fn sale tal cual');
  ok(!Candado.tomado() && !estado.tomado && estado.soltadas === 1, 'y el candado se suelta aunque truene');
  ok(Candado.con(() => 'otra vez') === 'otra vez', 'después de un error se puede volver a usar');
}

console.log('4. Ocupado por otro');
{
  const { Candado } = entorno({ ocupado: true });
  let msg = '';
  try { Candado.con(() => 'nunca'); } catch (e) { msg = e.message; }
  ok(/guardando otro cambio/.test(msg), 'sin siOcupado: un mensaje que se entiende, no "Lock timeout"');
  try { Candado.con(() => 'nunca', { mensaje: 'Ocupado, ya merito.' }); } catch (e) { msg = e.message; }
  ok(msg === 'Ocupado, ya merito.', 'el mensaje se puede cambiar');
  ok(Candado.con(() => 'nunca', { siOcupado: () => 'saltado' }) === 'saltado', 'con siOcupado: regresa lo suyo sin tronar');
  ok(!Candado.tomado(), 'y no queda marcado como tomado');
}

if (fallas) { console.error('\n' + fallas + ' prueba(s) fallaron'); process.exit(1); }
console.log('\nTodo bien.');
