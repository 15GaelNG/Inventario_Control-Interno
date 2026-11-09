// Cronometro (src/utils/Cronometro.gs, 5-nov): cuánto tarda cada paso de algo lento, para optimizar los PDF con números.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar(reloj, consola, cacheService) {
  const RealDate = Date;
  function FakeDate(ms) { return new RealDate(ms === undefined ? reloj.ms : ms); }
  FakeDate.now = () => reloj.ms;
  const contexto = vm.createContext({ Date: FakeDate, console: consola || { log() {} }, CacheService: cacheService, JSON });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/Cronometro.gs'), 'utf8') +
    '\nthis.C = Cronometro; this.resumenEditor = cronometroResumen;', contexto);
  contexto.C.contexto = contexto;
  return contexto.C;
}

/** Una caché de Apps Script de mentira (lo que guarda, en un objeto). */
function cacheFalsa() {
  const datos = {};
  return { datos, getScriptCache: () => ({ get: (k) => (k in datos ? datos[k] : null), put: (k, v) => { datos[k] = v; } }) };
}

test('cada marca mide desde la anterior y el total desde que empezó', () => {
  const reloj = { ms: 1000 };
  const c = cargar(reloj).iniciar('pdf X');
  reloj.ms = 1300; assert.equal(c.marcar('copiar'), 300);
  reloj.ms = 1350; assert.equal(c.marcar('abrir'), 50);
  reloj.ms = 3350; c.marcar('convertir');
  assert.deepEqual(JSON.parse(JSON.stringify(c.tiempos())), [{ paso: 'copiar', ms: 300 }, { paso: 'abrir', ms: 50 }, { paso: 'convertir', ms: 2000 }]);
  assert.equal(c.total(), 2350);
  assert.equal(c.linea(), '[tiempo] pdf X · total 2350 ms · copiar 300 · abrir 50 · convertir 2000');
});

test('avisa cada marca a quien la pide (el medidor de Líneas) y un error ahí no tumba lo que se mide', () => {
  const reloj = { ms: 0 };
  const vistos = [];
  const c = cargar(reloj).iniciar('pdf', (paso, ms) => { vistos.push(paso + ' ' + ms); throw new Error('medidor roto'); });
  reloj.ms = 10;
  assert.equal(c.marcar('copiar'), 10);
  assert.deepEqual(vistos, ['copiar 10']);
});

test('anotar deja una sola línea en el registro de ejecuciones; tiempos() es una copia', () => {
  const reloj = { ms: 0 };
  const lineas = [];
  const c = cargar(reloj, { log: (l) => lineas.push(l) }).iniciar('pdf Y');
  reloj.ms = 5; c.marcar('a');
  c.tiempos().push({ paso: 'intruso', ms: 1 });
  c.anotar();
  assert.deepEqual(lineas, ['[tiempo] pdf Y · total 5 ms · a 5']);
});

test('anotar guarda cada medición en la caché (las últimas 60) y el resumen agrupa por tipo de documento', () => {
  const reloj = { ms: Date.UTC(2026, 10, 5, 18, 0, 0) };
  const cache = cacheFalsa();
  const C = cargar(reloj, undefined, cache);
  const medir = (nombre, copiar, convertir) => {
    const c = C.iniciar(nombre);
    reloj.ms += copiar; c.marcar('copiar');
    reloj.ms += convertir; c.marcar('convertir');
    c.anotar();
  };
  medir('pdf celular-RESPONSIVA R1', 1000, 3000);
  medir('pdf celular-RESPONSIVA R2', 2000, 5000);
  medir('pdf vehicular-INSPECCION JUAN PEREZ', 500, 1500);
  assert.equal(C.ultimos().length, 3);
  const texto = C.resumen();
  assert.match(texto, /18:00:00 · pdf celular-RESPONSIVA R1 · total 4000 ms · copiar 1000 · convertir 3000/);
  // Promedio por tipo, el paso más pesado primero
  assert.match(texto, /pdf celular-RESPONSIVA \(2\) · total 5500 · convertir 4000 · copiar 1500/);
  assert.match(texto, /pdf vehicular-INSPECCION \(1\) · total 2000 · convertir 1500 · copiar 500/);
  for (let i = 0; i < 70; i++) medir('pdf x', 1, 1);
  assert.equal(C.ultimos().length, 60);
});

test('sin caché (o sin mediciones) no truena: la línea queda y el resumen lo dice', () => {
  const reloj = { ms: 0 };
  const C = cargar(reloj, { log() {} }, { getScriptCache: () => { throw new Error('sin cuota'); } });
  const c = C.iniciar('pdf');
  c.marcar('a');
  c.anotar();
  assert.deepEqual([...C.ultimos()], []);
  assert.match(C.resumen(), /Sin mediciones/);
});

test('cronometroResumen (editor) pide el candado de editor antes de leer', () => {
  const reloj = { ms: 0 };
  const C = cargar(reloj, { log() {} }, cacheFalsa());
  let candado = 0;
  C.contexto.soloEditor_ = () => { candado++; };
  assert.match(C.contexto.resumenEditor(), /Sin mediciones/);
  assert.equal(candado, 1);
});
