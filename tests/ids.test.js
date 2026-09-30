/**
 * Pruebas de Ids.gs — el generador de llaves. Ver docs/ids-asignacion.md.
 * Se corre con: node tests/ids.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ruta = path.join(__dirname, '..', 'src', 'utils', 'Ids.gs');
const contexto = vm.createContext({ console });
// `const Ids = …` no se cuelga del objeto global en un contexto de vm: hay que exportarlo.
// El Date del sandbox tampoco es el de aquí, y hace falta para mover el reloj en las pruebas.
vm.runInContext(fs.readFileSync(ruta, 'utf8') + '\nthis.Ids = Ids; this.Date = Date;', contexto);
const { Ids } = contexto;

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}
function truena(fn, descripcion) {
  let tronó = false;
  try { fn(); } catch (e) { tronó = true; }
  ok(tronó, descripcion);
}

console.log('1. La forma del ID');
const id = Ids.nuevo('VEH');
ok(id.length === 18, 'mide 18 caracteres: ' + id);
ok(Ids.FORMA.test(id), 'pasa la validación');
ok(id.slice(0, 4) === 'VEH-', 'empieza con el prefijo y un guion');
ok(Ids.prefijo(id) === 'VEH', 'se le puede leer el prefijo');
ok(Ids.es('VEH', id) && !Ids.es('LIN', id), 'es() distingue la hoja a la que pertenece');
ok(!/[ILOU]/.test(id.slice(4)), 'no usa I, L, O ni U (se confunden al leer, o forman groserías)');

console.log('\n2. Sheets no lo puede confundir con un número');
ok(isNaN(Number(id)), 'Number(id) es NaN, así que Sheets lo guarda como texto');
let ningunoEsNumero = true;
for (let i = 0; i < 500; i++) {
  if (!isNaN(Number(Ids.nuevo('TCK')))) ningunoEsNumero = false;
}
ok(ningunoEsNumero, 'ninguno de 500 IDs seguidos puede leerse como número');

console.log('\n3. Ordenar alfabéticamente = ordenar por fecha');
const antes = Ids.nuevo('INS');
const reloj = Date.now;
contexto.Date.now = () => reloj() + 5000;
const despues = Ids.nuevo('INS');
contexto.Date.now = reloj;
ok(antes < despues, 'el creado 5 s después es mayor en orden alfabético');
ok(Ids.nuevo('INS').slice(4, 12).length === 8, 'la parte de tiempo siempre mide 8 (con ceros a la izquierda)');

console.log('\n4. La fecha se lee del propio ID');
const f = Ids.fecha(id);
// contexto.Date, no Date: el sandbox de vm tiene sus propios constructores
ok(f instanceof contexto.Date, 'devuelve un Date');
ok(Math.abs(f.getTime() - Date.now()) < 5000, 'coincide con el momento en que se generó');
ok(Ids.fecha('VEH-0000000000000') === null, 'un ID mal formado da null, no una fecha falsa');
ok(Ids.fecha('no soy un id') === null, 'un texto cualquiera da null');

console.log('\n5. Los IDs de la migración (legado)');
const l0 = Ids.deLegado('LIN', 0);
const l1 = Ids.deLegado('LIN', 1);
const l99 = Ids.deLegado('LIN', 99);
ok(Ids.FORMA.test(l0), 'tienen la misma forma que los nuevos: ' + l0);
ok(l0 < l1 && l1 < l99, 'ordenan según el renglón de la hoja');
ok(l99 < Ids.nuevo('LIN'), 'todos ordenan ANTES que cualquier ID nuevo');
ok(Ids.esLegado(l0) && Ids.esLegado(l99), 'se reconocen como de legado');
ok(!Ids.esLegado(id), 'un ID nuevo no es de legado');
ok(Ids.fecha(l0) === null && Ids.fecha(l99) === null,
   'su fecha es null: no sabemos cuándo se crearon y no lo inventamos');

console.log('\n6. Se niega a generar algo inválido');
truena(() => Ids.nuevo('VE'), 'un prefijo de 2 letras truena');
truena(() => Ids.nuevo('VEHI'), 'uno de 4 letras truena');
truena(() => Ids.nuevo('V3H'), 'uno con número truena');
truena(() => Ids.deLegado('LIN', -1), 'un índice negativo truena');
truena(() => Ids.deLegado('LIN', 1.5), 'un índice con decimales truena');
truena(() => Ids.deLegado('LIN', Ids.LEGADO_LIMITE_MS), 'un índice fuera del bloque truena');

console.log('\n7. El reloj mal puesto no mezcla legado con nuevos');
contexto.Date.now = () => Ids.EPOCA_MS + 1000;   // 2020-01-01, dentro del bloque
truena(() => Ids.nuevo('VEH'), 'si el reloj está antes de 2020 truena en vez de generar un ID de legado');
contexto.Date.now = reloj;

console.log('\n8. Base32 de ida y vuelta');
ok(Ids.aBase32_(0, 8) === '00000000', 'el cero se rellena con ceros');
ok(Ids.deBase32_(Ids.aBase32_(1234567, 8)) === 1234567, '1,234,567 sobrevive el viaje');
ok(Ids.deBase32_(Ids.aBase32_(Date.now() - Ids.EPOCA_MS, 8)) === Date.now() - Ids.EPOCA_MS,
   'el tiempo de hoy sobrevive el viaje');
truena(() => Ids.aBase32_(Math.pow(32, 9), 8), 'un número que no cabe en 8 símbolos truena');

console.log('\n9. Suficientes combinaciones para una carga masiva');
contexto.Date.now = () => reloj();   // congelado: todos en el mismo milisegundo
const lote = {};
// Mil, no veinte mil, y la diferencia importa. La parte al azar son 6 símbolos base32 =
// 2^30 combinaciones, así que dentro de UN milisegundo la probabilidad de choque crece con
// el cuadrado: con 1,000 es 0.047%, pero con 20,000 sube a 18.6%. Una versión anterior de
// esta prueba pedía 20,000 sin un solo repetido y pasaba por suerte, fallando una de cada
// cinco corridas. Lo que el diseño promete es lo de abajo.
const CUANTOS = 1000;
let repetidos = 0;
for (let i = 0; i < CUANTOS; i++) {
  const x = Ids.nuevo('CLI');
  if (lote[x]) repetidos++;
  lote[x] = true;
}
contexto.Date.now = reloj;
// Se tolera uno: con 0.047% de probabilidad, exigir cero volvería a hacer la prueba
// intermitente sin que nada esté mal.
ok(repetidos <= 1, CUANTOS.toLocaleString() + ' IDs en el MISMO milisegundo: ' +
  repetidos + ' repetidos (se tolera 1, la teoría dice 0.047% de probabilidad)');
console.log('     Nota: en un milisegundo, 20,000 IDs SÍ chocarían el 18.6% de las veces.');
console.log('     Por eso el tiempo va en el ID: reparte la carga entre milisegundos.');

console.log('\n10. El tiempo alcanza hasta 2054');
const tope = Ids.deBase32_('ZZZZZZZZ');
const anio = new Date(Ids.EPOCA_MS + tope).getUTCFullYear();
ok(anio >= 2054, 'la parte de tiempo llega al año ' + anio);

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
