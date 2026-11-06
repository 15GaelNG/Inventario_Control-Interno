// Cronometro (src/utils/Cronometro.gs, 5-nov): cuánto tarda cada paso de algo lento, para optimizar los PDF con números.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function cargar(reloj, consola) {
  const contexto = vm.createContext({ Date: { now: () => reloj.ms }, console: consola || { log() {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/utils/Cronometro.gs'), 'utf8') + '\nthis.C = Cronometro;', contexto);
  return contexto.C;
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
