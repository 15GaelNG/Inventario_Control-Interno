// Pendiente 2.28, etapa A (usuario, 9-oct): inventario de las INE que ya están en NUCOS. Solo lee NUCOS de producción y
// escribe en el libro del DEV.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src/services/lineas/LineasIneNucos.gs'), 'utf8').replace(/\r/g, '');

function cargar() {
  const ctx = vm.createContext({});
  vm.runInContext(fuente + '\nthis.f = { ineNucosPorNombre_, ineNucosSeOmite_ };', ctx);
  return ctx.f;
}

test('el nombre del archivo sugiere el tipo: INE, IFE, licencia…; no confunde palabras que lo contienen', () => {
  const { ineNucosPorNombre_ } = cargar();
  assert.equal(ineNucosPorNombre_('INE JUAN PEREZ.jpg'), 'INE');
  assert.equal(ineNucosPorNombre_('ine_frente.png'), 'INE');
  assert.equal(ineNucosPorNombre_('Identificación oficial.pdf'), 'IDENTIFICACION');
  assert.equal(ineNucosPorNombre_('LICENCIA 2024.pdf'), 'LICENCIA');
  assert.equal(ineNucosPorNombre_('LINEA 4421090805.pdf'), '');
  assert.equal(ineNucosPorNombre_('IMG_20250101.jpg'), '');
});

test('se omiten los PDF de inspección y responsiva, las firmas, los patrones y los videos', () => {
  const { ineNucosSeOmite_ } = cargar();
  assert.equal(ineNucosSeOmite_({ name: 'INSP 0012 05 10.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'RESP 0012 05 10.pdf', mimeType: 'application/pdf' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'FIRMA RESPONSABLE.png', mimeType: 'image/png' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'VID_1.mp4', mimeType: 'video/mp4' }), true);
  assert.equal(ineNucosSeOmite_({ name: 'INE - JUAN PEREZ.pdf', mimeType: 'application/pdf' }), false);
  assert.equal(ineNucosSeOmite_({ name: 'IMG_1.jpg', mimeType: 'image/jpeg' }), false, 'una foto cualquiera puede ser una INE');
});

test('solo lee NUCOS: nada de crear, mover, renombrar ni borrar en Drive; solo corre en un DEV y desde el editor', () => {
  assert.doesNotMatch(fuente, /createFile|setTrashed|setName|moveTo|addFile|removeFile|Drive\.Files\.(update|create|copy|remove|delete)|makeCopy/);
  assert.match(fuente, /if \(Config\.ENTORNO !== 'DEV'\) throw/);
  assert.match(fuente, /function lineasIneNucos_inventario\(\) \{\n  soloEditor_\(\);\n  ineNucosExigirDev_\(\);/);
  assert.match(fuente, /"'" \+ LINEAS_DRIVE_NUCOS_ID \+ "' in parents/, 'NUCOS de producción, la de LineasAdmin');
  assert.match(fuente, /SpreadsheetApp\.openById\(Config\.SPREADSHEET_IDS\.TELEFONIA\(\)\)/, 'escribe en el libro del proyecto (el del DEV)');
});

test('la búsqueda por texto se pausa entre páginas y sigue donde iba, sin perder lo marcado', () => {
  // Hoja en memoria: columna D = ID, columna I = POR TEXTO.
  const filas = [['a', ''], ['b', ''], ['c', '']];
  const hoja = {
    getLastRow: () => filas.length + 1,
    getRange: (r, c, n) => ({
      getValues: () => filas.slice(r - 2, r - 2 + n).map((f) => [c === 4 ? f[0] : f[1]]),
      setValues: (v) => v.forEach((x, k) => { filas[r - 2 + k][1] = x[0]; }),
    }),
  };
  // Cada búsqueda trae dos páginas: la primera con 'a' y un archivo de fuera de NUCOS, la segunda con 'c' (solo IDMEX).
  const llamadas = [];
  const LineasArchivos = {
    listarDrive: (p) => {
      llamadas.push(p);
      if (!p.pageToken) return { files: [{ id: 'a' }, { id: 'fuera' }], nextPageToken: 'p2' };
      return { files: /IDMEX/.test(p.q) ? [{ id: 'c' }] : [] };
    },
  };
  const ctx = vm.createContext({ LineasArchivos });
  vm.runInContext(fuente + '\nthis.f = { ineNucosTexto_, INE_NUCOS_TEXTOS }; ineNucosPestana_ = () => this.hoja;', ctx);
  ctx.hoja = hoja;
  const st = { fase: 'TEXTO' };
  let paginas = 0;
  ctx.f.ineNucosTexto_(st, () => paginas++ < 3);
  assert.equal(st.fase, 'TEXTO', 'se pausó');
  assert.equal(st.texto.i, 1);
  assert.equal(st.texto.pagina, 'p2', 'iba a media búsqueda');
  assert.equal(filas[0][1], 'INE', 'lo marcado ya quedó en la hoja');
  ctx.f.ineNucosTexto_(st, () => true);
  assert.equal(st.fase, 'LISTO');
  assert.equal(llamadas[3].pageToken, 'p2', 'siguió en la página donde iba');
  assert.equal(filas[0][1], 'INE, IFE, LICENCIA, PASAPORTE');
  assert.equal(filas[1][1], '');
  assert.equal(filas[2][1], 'INE');
  assert.equal(st.textos.IDMEX, 2);
  assert.equal(st.texto.revisados, 2 * ctx.f.INE_NUCOS_TEXTOS.length + 1);
});
