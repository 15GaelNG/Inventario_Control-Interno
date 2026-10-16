/**
 * Formato (src/html/js/componentes/formato.html): cómo se escribe un dato en la pantalla, una sola copia.
 *
 * Correr: node tests/formato.test.js
 */
const vm = require('vm');

const ctx = vm.createContext({});
vm.runInContext(require('./formato-fuente') + '\nthis.F = Formato;', ctx);
const F = ctx.F;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const igual = (real, esperado, texto) => ok(real === esperado, texto + (real === esperado ? '' : ' (salió ' + JSON.stringify(real) + ')'));

console.log('1. esc');
igual(F.esc('<b a="1">O\'Hara & co</b>'), '&lt;b a=&quot;1&quot;&gt;O&#39;Hara &amp; co&lt;/b&gt;', 'escapa los cinco');
igual(F.esc(null), '', 'null → vacío');
igual(F.esc(undefined), '', 'undefined → vacío');
igual(F.esc(0), '0', 'el 0 sí se escribe');
igual(F.esc(false), 'false', 'false se escribe');

console.log('2. fechas');
const f = new Date(2026, 9, 5, 14, 30);
igual(F.fecha(f), '05/10/2026', 'fecha: dd/mm/aaaa con ceros');
igual(F.fecha('2026-10-05'), '05/10/2026', 'un yyyy-MM-dd se lee en hora local (no el día anterior)');
igual(F.fechaHora(f), '05/10/2026 14:30', 'fechaHora');
igual(F.fechaHoraSiTiene(f), '05/10/2026 14:30', 'fechaHoraSiTiene con hora');
igual(F.fechaHoraSiTiene(new Date(2026, 9, 5)), '05/10/2026', 'fechaHoraSiTiene a medianoche: solo el día');
igual(F.fechaTexto(f), '05 oct 2026', 'fechaTexto');
igual(F.fechaTexto(f, { hora: true }), '05 oct 2026, 14:30', 'fechaTexto con hora');
igual(F.fechaTexto(f, 3), '05 oct 2026', 'fechaTexto como callback de map (el índice no cuenta como opción)');
igual(F.dia(f), '2026-10-05', 'dia: yyyy-MM-dd local');
igual(F.hora(f), '14:30', 'hora');
igual(F.dia('2026-10-05'), '2026-10-05', 'dia de un yyyy-MM-dd es el mismo');
igual(F.dia(new Date(f.getTime()).toISOString()), '2026-10-05', 'dia de un ISO con hora');
['', null, undefined, 'no es fecha', new Date('x')].forEach((v) => {
  igual(F.fecha(v) + F.fechaHora(v) + F.fechaTexto(v) + F.dia(v) + F.hora(v), '', 'vacío o inválido → "" (' + String(v) + ')');
});

console.log('3. números');
igual(F.moneda(1234), '$1,234', 'moneda entera sin centavos');
igual(F.moneda(1234.5), '$1,234.50', 'con centavos si los tiene');
igual(F.moneda(1234, { centavos: true }), '$1,234.00', 'centavos: true');
igual(F.moneda(1234.56, { centavos: false }), '$1,235', 'centavos: false redondea');
igual(F.moneda(-7.74), '-$7.74', 'el signo va antes del $');
igual(F.moneda('$1,049'), '$1,049', 'entiende un texto con $ y comas');
igual(F.moneda(0), '$0', 'el 0 sí se escribe');
igual(F.moneda('') + F.moneda(null) + F.moneda('abc') + F.moneda('  '), '', 'vacío o no numérico → ""');
igual(F.miles(12345), '12,345', 'miles');
igual(F.miles(''), '0', 'miles: vacío cuenta como 0');
igual(F.miles(1.25, { decimales: 1 }), '1.3', 'miles con decimales');
igual(F.porcentaje(0.85), '85%', 'porcentaje de fracción');
igual(F.porcentaje(85), '85%', 'porcentaje ya en cien');
igual(F.porcentaje(''), '', 'porcentaje vacío');
igual(F.aNumero(' 1,200 '), 1200, 'aNumero limpia espacios y comas');
igual(F.aNumero('   '), null, 'aNumero de puros espacios es null, no 0');

console.log('4. normal');
igual(F.normal('Árbol ÑANDÚ'), 'arbol nandu', 'minúsculas y sin acentos');
igual(F.normal(null), '', 'null → vacío');
igual(F.normalAlineado('Ñandú'), 'nandu', 'normalAlineado');
igual(F.normalAlineado('Ñandú').length, Array.from('Ñandú').length, 'normalAlineado deja el mismo largo (para resaltar)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
