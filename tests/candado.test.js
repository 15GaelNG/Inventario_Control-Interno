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
  // El reloj y el registro, de mentira: cada waitLock/tryLock «tarda» o.espera ms y fn «tarda» o.retiene ms
  const reloj = { ahora: 0 };
  const registro = [];
  const consola = { log: (t) => registro.push(t), error: () => {} };
  const conTiempo = (fn, ms) => function () { reloj.ahora += ms || 0; return fn.apply(this, arguments); };
  lock.waitLock = conTiempo(lock.waitLock, o.espera);
  lock.tryLock = conTiempo(lock.tryLock, o.espera);
  const contexto = vm.createContext({ LockService: { getScriptLock: () => lock }, console: consola });
  vm.runInContext('Date.now = () => reloj.ahora;', Object.assign(contexto, { reloj }));
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'utils', 'Candado.gs'), 'utf8') +
    '\nthis.Candado = Candado;', contexto);
  return { Candado: contexto.Candado, estado, reloj, registro };
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

console.log('5. Bitácora de esperas [candado]');
{
  const rapido = entorno();
  rapido.Candado.con(() => 'rápido');
  ok(rapido.registro.length === 0, 'lo rápido no escribe nada');

  const lento = entorno({ espera: 1500 });
  function guardarAlgo() { return lento.Candado.con(() => { lento.reloj.ahora += 2500; return 'ok'; }); }
  guardarAlgo();
  ok(lento.registro.length === 1 && /^\[candado\] /.test(lento.registro[0]), 'esperar o retenerlo mucho deja una línea [candado]');
  ok(/esperó 1500 ms · lo retuvo 2500 ms$/.test(lento.registro[0]), 'con cuánto esperó y cuánto lo retuvo: ' + lento.registro[0]);
  ok(/guardarAlgo/.test(lento.registro[0]) && !/con|quien_|anotar_/.test(lento.registro[0]), 'dice quién lo pidió, sin las funciones del candado');

  const lleno = entorno({ ocupado: true, espera: 30000 });
  try { lleno.Candado.con(() => 'nunca'); } catch (e) { /* esperado */ }
  ok(/esperó 30000 ms · lo retuvo 0 ms · ocupado: no lo obtuvo$/.test(lleno.registro[0] || ''), 'quedarse sin él también se anota');
  lleno.Candado.con(() => 'nunca', { siOcupado: () => 'saltado' });
  ok(/ocupado: se saltó$/.test(lleno.registro[1] || ''), 'y saltarlo (siOcupado) también');
}

if (fallas) { console.error('\n' + fallas + ' prueba(s) fallaron'); process.exit(1); }
console.log('\nTodo bien.');
