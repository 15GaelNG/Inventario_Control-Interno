/**
 * El compresor de lo que se sube (tools/subir/construir.js): que el JS comprimido nunca traiga
 * un "//" (Apps Script corta lo que sigue, CLAUDE.md), que siga siendo JS válido y que no toque
 * lo que no debe (Index.html con sus scriptlets, los .gs). Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const { construir, comprimirHtml, sinDobleDiagonal_ } = require('../tools/subir/construir');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

(async () => {
  console.log('1. Las "/" de los strings se vuelven a escapar');
  const url = sinDobleDiagonal_("var c=1,a='https://x.com/a',b=`http://y/${c}//z`;");
  ok(!url.includes('//'), 'string y template sin "//": ' + url);
  ok(new Function(url + 'return a + b;')() === 'https://x.com/ahttp://y/1//z', 'y siguen valiendo lo mismo');
  // 'a\\/b//' = a, diagonal invertida, /, b, //: la "/" que sigue a "\\" también se escapa
  const conInvertida = sinDobleDiagonal_("var a='a\\\\/b//'");
  ok(conInvertida === "var a='a\\\\\\/b\\/\\/'" && new Function(conInvertida + ';return a;')() === 'a\\/b//', 'una diagonal invertida escapada no se confunde');

  console.log('2. Un <script> comprimido');
  const html = "<script>\n  // comentario\n  function irA(u) { return 'https:\\/\\/sitio.com/' + u; }\n</script>";
  const r = await comprimirHtml(html);
  const js = /<script>([\s\S]*)<\/script>/.exec(r.texto)[1];
  ok(!js.includes('//') && !js.includes('comentario'), 'sin comentarios y sin "//"');
  ok(new Function(js + 'return irA("x");')() === 'https://sitio.com/x', 'y hace lo mismo');
  const regex = await comprimirHtml('<script>var r = /^a:\\/\\//;</script>');
  ok(regex.texto === '<script>var r = /^a:\\/\\//;</script>' && regex.sinComprimir.length === 1, 'si queda un "//" que no se puede escapar (regex), el bloque se deja como estaba');
  const scriptlet = await comprimirHtml('<script>var x = <?= 1 ?>;</script>');
  ok(scriptlet.texto === '<script>var x = <?= 1 ?>;</script>', 'un <script> con scriptlets de Apps Script no se toca');
  const css = await comprimirHtml('<style>\n  .a  {  color : red ; }\n</style>');
  ok(css.texto === '<style>.a{color:red}</style>', 'el CSS también se comprime');

  console.log('3. Todo src/');
  const destino = path.join(__dirname, '..', '.construido', 'prueba');
  const rep = await construir(path.join(__dirname, '..', 'src'), destino);
  ok(rep.despues < rep.antes * 0.7, 'el HTML pesa menos: ' + Math.round(rep.antes / 1024) + ' → ' + Math.round(rep.despues / 1024) + ' KB');
  ok(rep.sinComprimir.length === 0, rep.sinComprimir.length ? 'sin comprimir: ' + rep.sinComprimir.join('; ') : 'todos los bloques se comprimieron');
  const conBarras = [];
  const invalidos = [];
  (function recorrer(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const ruta = path.join(d, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      if (!e.name.endsWith('.html') || e.name === 'Index.html') return;
      for (const m of fs.readFileSync(ruta, 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)) {
        if (m[1].includes('//')) conBarras.push(path.relative(destino, ruta));
        try { new Function(m[1]); } catch (err) { invalidos.push(path.relative(destino, ruta) + ': ' + err.message); }
      }
    });
  })(destino);
  ok(!conBarras.length, conBarras.length ? 'con "//": ' + conBarras.join(', ') : 'ningún <script> comprimido trae "//"');
  ok(!invalidos.length, invalidos.length ? 'JS inválido: ' + invalidos.join('; ') : 'todo el JS comprimido es válido');
  const igual = (rel) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf8') === fs.readFileSync(path.join(destino, rel), 'utf8');
  ok(igual('html/Index.html'), 'Index.html (con sus scriptlets) va tal cual');
  ok(igual('services/PermisosService.gs') && igual('Code.gs'), 'los .gs van tal cual (los errores del servidor siguen diciendo el renglón real)');
  fs.rmSync(destino, { recursive: true, force: true });

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.log('✘ ERROR', e.stack); process.exit(1); });
