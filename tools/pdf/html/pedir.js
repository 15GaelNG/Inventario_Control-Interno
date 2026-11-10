/**
 * tools/pdf/html/pedir.js — le pide al DEV (el de .clasp.json) que arme un documento en HTML con los casos de
 * tools/pdf/.cache/<documento>/casos.json, o que instale los recursos (src/pruebas/PruebasPdfHtml.gs, ?revisar=pdfhtml).
 *
 *   node tools/pdf/html/pedir.js responsiva-vehicular [r06]     arma los PDF (todos o un caso) en la carpeta de prueba
 *   node tools/pdf/html/pedir.js instalar                        copia PRUEBA PDF HTML/RECURSOS a RECURSOS PDF del DEV
 *
 * Después: tools/pdf/html/comparar.py <documento>. Usa la cuenta de clasp (tiene que haber subido con npm run push).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { token_, exigirAutorizado_ } = require('../../subir/pagina-servida');

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const CACHE = path.join(RAIZ, 'tools', 'pdf', '.cache');

(async () => {
  const [que, caso] = process.argv.slice(2);
  if (!que) throw new Error('Uso: node tools/pdf/html/pedir.js <documento> [caso] | instalar');
  const leer = (f) => fs.readFileSync(path.join(CACHE, f), 'utf8').trim();
  const params = que === 'instalar'
    ? '&instalar=' + leer('recursos/carpeta.txt')
    : '&documento=' + que + '&carpeta=' + leer(que + '/carpeta.txt') + (caso ? '&caso=' + caso : '');
  const clasp = path.join(RAIZ, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
  const lista = execFileSync(process.execPath, [clasp, '-P', path.join(RAIZ, '.clasp.json'), 'list-deployments'], { cwd: RAIZ, encoding: 'utf8' });
  const head = /-\s+(\S+)\s+@HEAD/.exec(lista);
  if (!head) throw new Error('El proyecto no tiene despliegue @HEAD');
  const dominio = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'subir', 'destinos.json'), 'utf8')).dominio;
  const url = 'https://script.google.com/a/macros/' + dominio + '/s/' + head[1] + '/dev?revisar=pdfhtml' + params;
  const t = Date.now();
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await token_()) } });
  const texto = await r.text();
  exigirAutorizado_(texto, url);
  let json;
  try { json = JSON.parse(texto); } catch (e) { throw new Error('La app no contestó JSON (' + r.status + '): ' + texto.slice(0, 300)); }
  if (json.error) throw new Error(json.error);
  console.log(((Date.now() - t) / 1000).toFixed(1) + ' s');
  if (json.instalados) console.log('instalados:', json.instalados.join(', '));
  (json.casos || []).forEach((c) => console.log(c.caso, c.pdfMs + ' ms', c.sinResolver && c.sinResolver.length ? 'sin dato: ' + c.sinResolver.join(', ') : ''));
})().catch((e) => { console.error(e.message); process.exit(1); });
