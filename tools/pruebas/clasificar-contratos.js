// node tools/pruebas/clasificar-contratos.js tests/source-contracts.test.cjs  (fase 7 de docs/homologacion-codigo.md)
// Fase 7: qué tipo de aserción hay en source-contracts.test.cjs, por prueba.
//   copia      doesNotMatch / deepEqual(..., []) / "lista que solo se achica": que nadie vuelva a escribir algo a mano
//   catalogo   ids, includes, orden, permisos: la arquitectura (se quedan)
//   ejecuta    new Function / vm / runInContext: ya ejecuta código (comportamiento de verdad)
//   texto      assert.match(read(...), /código literal/): comportamiento escrito como texto (candidatas a ejecutarse)
const fs = require('fs');
const src = fs.readFileSync(process.argv[2], 'utf8');
const pruebas = [];
const re = /^test\('([^']+)'/gm;
let m;
const inicios = [];
while ((m = re.exec(src))) inicios.push({ nombre: m[1], i: m.index });
inicios.forEach((p, k) => {
  const cuerpo = src.slice(p.i, k + 1 < inicios.length ? inicios[k + 1].i : undefined);
  const c = { nombre: p.nombre, copia: 0, catalogo: 0, ejecuta: 0, texto: 0 };
  const ejecuta = /new Function\(|vm\.|runInContext|crearEntorno\(/.test(cuerpo);
  cuerpo.split(/\r?\n/).forEach((l) => {
    if (!/assert\.|ok\(/.test(l)) return;
    if (/doesNotMatch|deepEqual\([^)]*\[\]\s*[,)]|PENDIENTES|sinCandado|fijos/.test(l)) c.copia++;
    else if (/Modulos|catalogo|catálogo|include\(|indexOf\("include|permiso|Permisos|ids?\b/.test(l) && !/assert\.match\(\w+, \/.{40,}/.test(l)) c.catalogo++;
    else if (/assert\.match\(/.test(l) && !ejecuta) c.texto++;
    else if (ejecuta) c.ejecuta++;
    else c.texto++;
  });
  pruebas.push(c);
});
const total = pruebas.reduce((a, c) => { ['copia', 'catalogo', 'ejecuta', 'texto'].forEach((k) => { a[k] += c[k]; }); return a; }, { copia: 0, catalogo: 0, ejecuta: 0, texto: 0 });
console.log('pruebas', pruebas.length, JSON.stringify(total), 'aserciones', Object.values(total).reduce((a, b) => a + b, 0));
console.log('\nMás "texto" (candidatas a ejecutarse cuando su fase toque esa parte):');
pruebas.filter((c) => c.texto >= 8).sort((a, b) => b.texto - a.texto).slice(0, 25).forEach((c) => console.log(String(c.texto).padStart(3), ' ', c.nombre.slice(0, 110)));
