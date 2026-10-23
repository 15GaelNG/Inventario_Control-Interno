/**
 * reporte.js — corre ESLint sobre src y lo resume: un renglón por aviso (archivo:línea  regla  mensaje) y el conteo
 * por regla al final.
 *
 *   node tools/lint/reporte.js            todo
 *   node tools/lint/reporte.js no-undef   solo esa regla
 */
const { ESLint } = require('eslint');
const path = require('path');
const { RAIZ } = require('./globales');

(async () => {
  const solo = process.argv[2];
  const resultados = await new ESLint({ cwd: RAIZ }).lintFiles(['src']);
  const conteo = {};
  const renglones = [];
  resultados.forEach((r) => r.messages.forEach((m) => {
    const regla = m.ruleId || '(no se pudo leer)';
    conteo[regla] = (conteo[regla] || 0) + 1;
    if (!solo || regla === solo) renglones.push(path.relative(RAIZ, r.filePath).replace(/\\/g, '/') + ':' + m.line + '  ' + regla + '  ' + m.message);
  }));
  renglones.sort().forEach((x) => console.log(x));
  console.log('\n' + (Object.entries(conteo).sort((a, b) => b[1] - a[1]).map(([k, n]) => n + '  ' + k).join('\n') || 'sin avisos'));
  process.exitCode = renglones.length ? 1 : 0;
})();
