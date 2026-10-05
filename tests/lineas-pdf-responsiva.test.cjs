// Responsiva (5-oct): el PDF salía en 3 hojas (el AppSheet la hacía en carta con márgenes en 0) y algunos campos
// perdían el fondo azul de la plantilla (el valor insertado tomaba el formato del carácter vecino).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

/** Texto con un formato por carácter, como Text de DocumentApp. */
function texto(valor, formatos) {
  return {
    valor, formatos: formatos.slice(), getType: () => 'TEXT', asText() { return this; },
    getText() { return this.valor; },
    getAttributes(i) { return Object.assign({ LINK_URL: null }, this.formatos[i]); },
    deleteText(a, b) { this.valor = this.valor.slice(0, a) + this.valor.slice(b + 1); this.formatos.splice(a, b - a + 1); },
    insertText(a, v) {
      // Docs le pone al texto nuevo el formato del carácter anterior
      this.valor = this.valor.slice(0, a) + v + this.valor.slice(a);
      this.formatos.splice(a, 0, ...Array(v.length).fill(Object.assign({}, this.formatos[a - 1] || {})));
    },
    setAttributes(a, b, f) {
      assert.ok(!Object.values(f).some((x) => x === null), 'sin atributos null');
      for (let i = a; i <= b; i++) this.formatos[i] = Object.assign({}, this.formatos[i], f);
    },
  };
}

function generar(plantillaId, elemento) {
  const pagina = {};
  const cuerpo = {
    getType: () => 'CONTAINER', getNumChildren: () => 1, getChild: () => elemento, findText: () => null,
    setPageWidth(v) { pagina.ancho = v; return this; }, setPageHeight(v) { pagina.alto = v; return this; },
    setMarginTop(v) { pagina.arriba = v; return this; }, setMarginBottom(v) { pagina.abajo = v; return this; },
    setMarginLeft(v) { pagina.izq = v; return this; }, setMarginRight(v) { pagina.der = v; return this; },
  };
  const copia = { getId: () => 'tmp', getAs: () => ({ setName: () => ({}) }), setTrashed: () => {} };
  const contexto = vm.createContext({
    DriveApp: { getFileById: () => ({ makeCopy: () => copia }), Access: { DOMAIN: 'DOMAIN' }, Permission: { VIEW: 'VIEW' } },
    DocumentApp: { ElementType: { TEXT: 'TEXT' }, openById: () => ({ getBody: () => cuerpo, getHeader: () => null, getFooter: () => null, saveAndClose: () => {} }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPdf.gs'), 'utf8') + '\nthis.pdf = LineasPdf;', contexto);
  const carpeta = { createFile: () => ({ getId: () => 'pdf', getName: () => 'r.pdf', getUrl: () => 'url', setSharing: () => {} }) };
  contexto.pdf.generarPdfDesdePlantilla(plantillaId(contexto.pdf.PLANTILLAS), { 'No TELEFONO': '4421234567' }, {}, carpeta, 'r.pdf');
  return pagina;
}

test('la responsiva sale en carta con márgenes en 0, como la tarea del AppSheet', () => {
  const pagina = generar((p) => p.RESPONSIVA_CELULAR, texto('x', [{}]));
  assert.deepEqual(pagina, { ancho: 612, alto: 792, arriba: 0, abajo: 0, izq: 0, der: 0 });
});

test('la inspección conserva la página de su plantilla', () => {
  assert.deepEqual(generar((p) => p.INSPECCION_CELULAR, texto('x', [{}])), {});
});

test('el valor conserva el fondo azul de la etiqueta aunque el texto de al lado no lo tenga', () => {
  const plano = { BACKGROUND_COLOR: null };
  const azul = { BACKGROUND_COLOR: '#cfe2f3' };
  const etiqueta = '<<No TELEFONO>>';
  const t = texto('TEL: ' + etiqueta, [...Array(5).fill(plano), ...Array(etiqueta.length).fill(azul)]);
  generar((p) => p.RESPONSIVA_CELULAR, t);
  assert.equal(t.valor, 'TEL: 4421234567');
  assert.ok(t.formatos.slice(5).every((f) => f.BACKGROUND_COLOR === '#cfe2f3'));
  assert.equal(t.formatos[4].BACKGROUND_COLOR, null);
});
