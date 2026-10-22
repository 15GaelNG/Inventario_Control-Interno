/**
 * Partes (src/html/js/componentes/partes.html): una pantalla grande abierta en archivos (Vehículos, Líneas
 * Telefónicas), con T, T.de('parte') y T.montar.
 *
 * Correr: node tests/partes.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'partes.html'), 'utf8');
const errores = [];
const ctx = { console: { error: (m) => errores.push(m) } };
vm.runInNewContext(h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')) + '\nthis.Partes = Partes;', ctx);
const { Partes } = ctx;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Registrar, montar y llamar entre partes');
const P = Partes.crear('Prueba');
const llamadas = [];
P.registrar('ficha', (T) => {
  const { abrirCaptura } = T.de('capturas');   // se pide antes de que capturas exista
  function abrirFicha(id) { llamadas.push('ficha ' + id + ' ' + T.titulo); return abrirCaptura(id); }
  return { abrirFicha };
});
P.registrar('capturas', (T) => {
  const { refrescar } = T.de('principal');
  function abrirCaptura(id) { llamadas.push('captura ' + id); refrescar(); return 'ok ' + id; }
  return { abrirCaptura };
});
ok(P.partes().join() === 'ficha,capturas', 'partes() lista lo registrado');
const T = P.contexto();
const { abrirFicha } = T.de('ficha');
T.montar({ titulo: 'Vehículos' }, () => ({ refrescar: () => llamadas.push('refrescar') }));
ok(abrirFicha(7) === 'ok 7', 'una parte llama a otra registrada después');
ok(llamadas.join(' | ') === 'ficha 7 Vehículos | captura 7 | refrescar', 'los datos del arranque llegan en T y la principal es perezosa');
ok(errores.length === 0, 'sin avisos cuando todo lo pedido existe');

console.log('2. Un let compartido con get/set');
const P2 = Partes.crear('Compartido');
P2.registrar('ficha', (T2) => ({ leer: () => T2.abierta, cerrar: () => { T2.abierta = null; } }));
const T2 = P2.contexto();
let abierta = 'V-1';
Object.defineProperty(T2, 'abierta', { get: () => abierta, set: (v) => { abierta = v; } });
T2.montar({});
const ficha2 = T2.de('ficha');
ok(ficha2.leer() === 'V-1', 'la parte lee el let de su dueña');
abierta = 'V-2';
ok(ficha2.leer() === 'V-2', 'y lo ve cuando cambia');
ficha2.cerrar();
ok(abierta === null, 'y lo puede escribir');

console.log('3. Lo que no se publica se avisa al montar');
const P3 = Partes.crear('Incompleta');
P3.registrar('ficha', (T3) => { T3.de('capturas').noExiste; return {}; });
P3.registrar('capturas', () => ({}));
P3.contexto().montar({});
ok(errores.length === 1 && errores[0] === 'Incompleta: la parte capturas no publica noExiste', 'console.error con la pantalla, la parte y el nombre');

console.log('4. Cada contexto monta de nuevo (la pantalla se abre más de una vez)');
let fabricadas = 0;
const P4 = Partes.crear('Dos veces');
P4.registrar('ficha', () => { fabricadas++; return {}; });
P4.contexto().montar({});
P4.contexto().montar({});
ok(fabricadas === 2, 'cada montar corre las fábricas otra vez');

if (fallas) { console.error('\n' + fallas + ' falla(s)'); process.exit(1); }
console.log('\nTODO OK');
