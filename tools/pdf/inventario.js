/**
 * tools/pdf/inventario.js — los marcadores << >> de cada plantilla de PDF en uso (fase 1 del motor único,
 * docs/pdf-motor.md). Se lo pregunta a la app en /dev (?revisar=plantillas, src/PdfHerramientas.gs), que abre cada
 * plantilla y solo la lee, y lo guarda en tests/fixtures/plantillas-marcadores.json para la prueba diferencial.
 *
 *   node tools/pdf/inventario.js            (DEV de .clasp.json; también: lab | prod)
 *
 * Solo nombres de columnas y fórmulas de las plantillas: nada de datos de personas (el repo es público).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { token_, exigirAutorizado_ } = require('../subir/pagina-servida');

const RAIZ = path.resolve(__dirname, '..', '..');
const SALIDA = path.join(RAIZ, 'tests', 'fixtures', 'plantillas-marcadores.json');

async function pedir(destino) {
  const archivo = { dev: '.clasp.json', lab: '.clasp.lab.json', prod: '.clasp.prod.json' }[destino];
  if (!archivo) throw new Error('Uso: node tools/pdf/inventario.js dev|lab|prod');
  const clasp = path.join(RAIZ, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
  const lista = execFileSync(process.execPath, [clasp, '-P', path.join(RAIZ, archivo), 'list-deployments'], { cwd: RAIZ, encoding: 'utf8' });
  const head = /-\s+(\S+)\s+@HEAD/.exec(lista);
  if (!head) throw new Error('El proyecto no tiene despliegue @HEAD');
  const dominio = JSON.parse(fs.readFileSync(path.join(RAIZ, 'tools', 'subir', 'destinos.json'), 'utf8')).dominio;
  const url = 'https://script.google.com/a/macros/' + dominio + '/s/' + head[1] + '/dev?revisar=plantillas';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (await token_()) } });
  const texto = await r.text();
  exigirAutorizado_(texto, url);
  let json;
  try { json = JSON.parse(texto); } catch (e) { throw new Error('La app no contestó JSON (' + r.status + '): ' + texto.slice(0, 200)); }
  if (json.error) throw new Error(json.error);
  return json;
}

/** Ordenado (plantillas por nombre, marcadores por texto) para que el diff entre dos corridas se lea */
function ordenar(inv) {
  return {
    entorno: inv.entorno,
    fecha: inv.fecha,
    plantillas: inv.plantillas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre)).map((p) => {
      if (!p.marcadores) return p;
      const marcadores = {};
      Object.keys(p.marcadores).sort().forEach((m) => { marcadores[m] = p.marcadores[m]; });
      return Object.assign({}, p, { marcadores });
    }),
  };
}

if (require.main === module) {
  (async () => {
    const inv = ordenar(await pedir(process.argv[2] || 'dev'));
    fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
    fs.writeFileSync(SALIDA, JSON.stringify(inv, null, 2) + '\n');
    inv.plantillas.forEach((p) => {
      const n = p.marcadores ? Object.keys(p.marcadores).length : 0;
      console.log((p.error ? '✘ ' : '✔ ') + p.nombre + (p.error ? ': ' + p.error : p.igualA ? ' (= ' + p.igualA + ')' :
        ' · ' + n + ' marcadores distintos' + (p.ifEntreParrafos ? ' · ' + p.ifEntreParrafos + ' If entre párrafos' : '')));
    });
    console.log('Guardado en ' + path.relative(RAIZ, SALIDA));
  })().catch((e) => { console.error('✘ ' + e.message); process.exit(1); });
}

module.exports = { pedir, ordenar };
