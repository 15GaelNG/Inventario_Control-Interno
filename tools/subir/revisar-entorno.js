/**
 * revisar-entorno.js — ¿los IDs del proyecto son los correctos? Lo pregunta a la app misma
 * (revisionEntorno_ en src/Diagnostico.gs, la misma que revisarEntorno() en el editor) en la URL
 * /dev, que corre el código recién subido. subir.js lo hace solo después de cada subida y, en
 * prod, no despliega si hay errores. También a mano, sin subir nada:
 *
 *   node tools/subir/revisar-entorno.js prod        (o dev, lab)
 *
 * Además avisa de los IDs de Drive escritos fijos en un servicio (const CARPETA_… = '…'): esos
 * no cambian por proyecto, así que un DEV escribe en la misma carpeta que producción.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { token_ } = require('./pagina-servida');

const RAIZ = path.resolve(__dirname, '..', '..');

/** Los IDs de Drive fijos en src/services: [{ archivo, constante, id }] */
function idsFijos() {
  const lista = [];
  (function recorrer(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const ruta = path.join(d, e.name);
      if (e.isDirectory()) return recorrer(ruta);
      if (!e.name.endsWith('.gs')) return;
      for (const m of fs.readFileSync(ruta, 'utf8').matchAll(/const (\w*(?:CARPETA|PLANTILLA|FOLDER)\w*) = '([\w-]{25,})'/g)) {
        lista.push({ archivo: path.relative(RAIZ, ruta).split(path.sep).join('/'), constante: m[1], id: m[2] });
      }
    });
  })(path.join(RAIZ, 'src', 'services'));
  return lista;
}

/**
 * @return {{ errores: string[], avisos: string[], lineas: string[], entorno: string }}
 * Truena solo si no pudo preguntar (la app no contestó): eso también impide desplegar.
 */
async function revisar(idDespliegueHead, dominio) {
  const token = await token_();
  const url = 'https://script.google.com/a/macros/' + dominio + '/s/' + idDespliegueHead + '/dev?revisar=entorno';
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const texto = await r.text();
  let rev;
  try { rev = JSON.parse(texto); } catch (e) {
    throw new Error('La revisión del entorno no contestó JSON (' + r.status + '): ' + texto.slice(0, 200));
  }
  if (rev.error) throw new Error('La revisión del entorno: ' + rev.error);

  const lineas = rev.revisados.map((x) => (x.problema ? (x.grave ? '  ✘ ' : '  ⚠ ') : '  ✔ ') + x.clave + ': ' +
    (x.id ? (x.nombre ? '"' + x.nombre + '"' : x.id) : 'sin configurar') + (x.problema ? '\n      ' + x.problema : ''));
  lineas.push(rev.hojasQueFaltan.length ? (rev.entorno === 'PROD' ? '  ✘' : '  ⚠') + ' Faltan hojas: ' + rev.hojasQueFaltan.join(', ') : '  ✔ Están todas las hojas del catálogo');
  lineas.push((rev.calentador ? '  ✔' : '  ⚠') + ' Calentador ' + (rev.calentador ? 'instalado' : 'NO instalado'));

  // IDs fijos en el código: el nombre sale de Drive, para que se entienda adónde escriben
  const avisos = rev.avisos.slice();
  for (const f of idsFijos()) {
    const d = await (await fetch('https://www.googleapis.com/drive/v3/files/' + f.id + '?supportsAllDrives=true&fields=name,trashed',
      { headers: { Authorization: 'Bearer ' + token } })).json();
    avisos.push(f.archivo + ' ' + f.constante + ' está fijo en el código' + (d.name ? ' ("' + d.name + '")' : ' (no se encontró en Drive)') +
      ': todos los proyectos, DEV incluido, usan ese mismo');
  }
  return { entorno: rev.entorno, errores: rev.errores, avisos: avisos, lineas: lineas };
}

/** Lo imprime como lo ve quien sube */
function imprimir(res) {
  console.log('Entorno (' + (res.entorno || 'sin ENTORNO') + '):');
  res.lineas.forEach((l) => console.log(l));
  if (res.avisos.length) console.log('  Avisos:\n    - ' + res.avisos.join('\n    - '));
  console.log(res.errores.length ? '  ERRORES (' + res.errores.length + '):\n    - ' + res.errores.join('\n    - ') : '  Sin errores.');
}

module.exports = { revisar, imprimir, idsFijos };

if (require.main === module) {
  (async () => {
    const destino = process.argv[2] || 'dev';
    const archivo = { dev: '.clasp.json', lab: '.clasp.lab.json', prod: '.clasp.prod.json' }[destino];
    if (!archivo) throw new Error('Uso: node tools/subir/revisar-entorno.js dev|lab|prod');
    const clasp = path.join(RAIZ, 'node_modules', '@google', 'clasp', 'build', 'src', 'index.js');
    const lista = execFileSync(process.execPath, [clasp, '-P', path.join(RAIZ, archivo), 'list-deployments'], { cwd: RAIZ, encoding: 'utf8' });
    const head = /-\s+(\S+)\s+@HEAD/.exec(lista);
    if (!head) throw new Error('El proyecto no tiene despliegue @HEAD');
    const dominio = JSON.parse(fs.readFileSync(path.join(__dirname, 'destinos.json'), 'utf8')).dominio;
    const res = await revisar(head[1], dominio);
    imprimir(res);
    process.exit(res.errores.length ? 1 : 0);
  })().catch((e) => { console.error('✘ ' + e.message); process.exit(1); });
}
