// Responsiva (5-oct): el PDF salía en 3 hojas y algunos campos perdían el fondo azul de la plantilla (el valor insertado
// tomaba el formato del carácter vecino). El AppSheet imprime el HTML del Doc con Chromium: márgenes del Doc e
// interlineado sobre el tamaño de la letra; aquí se ajusta el interlineado de la copia (LineasPdf.COMO_APPSHEET).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const TIPOS = { TEXT: 'TEXT', PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM', TABLE: 'TABLE', BODY_SECTION: 'BODY_SECTION', PAGE_BREAK: 'PAGE_BREAK', INLINE_IMAGE: 'INLINE_IMAGE' };

/** Párrafo de DocumentApp con su texto, interlineado (null = el del estilo) y tamaño de letra. */
function parrafo(valor, interlineado, letra) {
  const p = {
    hijos: [], interlineado, letra, getType: () => 'PARAGRAPH', getText: () => p.hijos.map((h) => (h.getText ? h.getText() : '')).join(''),
    getNumChildren: () => p.hijos.length, getChild: (i) => p.hijos[i], getParent: () => p.padre,
    getPreviousSibling: () => { const i = p.padre.hijos.indexOf(p); return i > 0 ? p.padre.hijos[i - 1] : null; },
    getLineSpacing: () => p.interlineado, setLineSpacing(v) { p.interlineado = v; return p; },
    getAttributes: () => ({ FONT_SIZE: p.letra || null }),
    removeFromParent() { p.padre.hijos.splice(p.padre.hijos.indexOf(p), 1); p.padre = null; },
    appendPageBreak() { p.hijos.push({ getType: () => 'PAGE_BREAK' }); },
  };
  if (valor) p.hijos.push(Object.assign(texto(valor, Array(valor.length).fill({})), { getParent: () => p }));
  return p;
}
function contenedor(tipo, hijos) {
  const c = {
    hijos, getType: () => tipo, getNumChildren: () => c.hijos.length, getChild: (i) => c.hijos[i], findText: () => null,
    getChildIndex: (h) => c.hijos.indexOf(h),
    insertParagraph(i, v) { const p = parrafo(v, null); p.padre = c; c.hijos.splice(i, 0, p); return p; },
  };
  hijos.forEach((h) => { h.padre = c; });
  return c;
}

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

function generar(plantillaId, elemento, cuerpoArmado) {
  const pagina = {};
  const cuerpo = Object.assign(cuerpoArmado || {
    getType: () => 'CONTAINER', getNumChildren: () => 1, getChild: () => elemento, findText: () => null,
  }, {
    setPageWidth(v) { pagina.ancho = v; return this; }, setPageHeight(v) { pagina.alto = v; return this; },
    setMarginTop(v) { pagina.arriba = v; return this; }, setMarginBottom(v) { pagina.abajo = v; return this; },
    setMarginLeft(v) { pagina.izq = v; return this; }, setMarginRight(v) { pagina.der = v; return this; },
  });
  const copia = { getId: () => 'tmp', getAs: () => ({ setName: () => ({}) }), setTrashed: () => {} };
  const contexto = vm.createContext({
    DriveApp: { getFileById: () => ({ makeCopy: () => copia }), Access: { DOMAIN: 'DOMAIN' }, Permission: { VIEW: 'VIEW' } },
    DocumentApp: { ElementType: TIPOS, Attribute: { FONT_SIZE: 'FONT_SIZE' }, openById: () => ({ getBody: () => cuerpo, getHeader: () => null, getFooter: () => null, saveAndClose: () => {} }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPdf.gs'), 'utf8') + '\nthis.pdf = LineasPdf;', contexto);
  const carpeta = { createFile: () => ({ getId: () => 'pdf', getName: () => 'r.pdf', getUrl: () => 'url', setSharing: () => {} }) };
  contexto.pdf.generarPdfDesdePlantilla(plantillaId(contexto.pdf.PLANTILLAS), { 'No TELEFONO': '4421234567' }, {}, carpeta, 'r.pdf');
  return pagina;
}

test('la responsiva y la inspección conservan la página y los márgenes de su plantilla', () => {
  assert.deepEqual(generar((p) => p.RESPONSIVA_CELULAR, texto('x', [{}])), {});
  assert.deepEqual(generar((p) => p.INSPECCION_CELULAR, texto('x', [{}])), {});
});

function cuerpoResponsiva() {
  const celda = parrafo('Cuando exista una baja', 1.15);
  const sinPropio = parrafo('Sucesos', null);
  const tabla = contenedor('TABLE', [celda, sinPropio]);
  const vacios = [parrafo('', 1.5, 17), parrafo('', 1.5, 17), parrafo('', 1.5, 17)];
  const titulo = parrafo('SANCIONES POR MAL MANEJO DEL SERVICIO O GESTIONES', 1.5);
  const cuerpo = contenedor('BODY_SECTION', [tabla].concat(vacios, [titulo]));
  return { cuerpo, tabla, celda, sinPropio, vacios, titulo };
}

test('responsiva: el interlineado queda como lo imprime el AppSheet (sobre el tamaño de la letra)', () => {
  const d = cuerpoResponsiva();
  generar((p) => p.RESPONSIVA_CELULAR, null, d.cuerpo);
  assert.ok(Math.abs(d.celda.interlineado - 1.15 / 1.211) < 1e-9);
  assert.ok(Math.abs(d.sinPropio.interlineado - 1 / 1.211) < 1e-9, 'sin interlineado propio toma el del estilo Normal (1.0)');
  assert.ok(Math.abs(d.titulo.interlineado - 1.5 / 1.211) < 1e-9);
});

test('responsiva: la hoja 2 empieza en las sanciones (salto de página en lugar de los renglones vacíos)', () => {
  const d = cuerpoResponsiva();
  generar((p) => p.RESPONSIVA_CELULAR, null, d.cuerpo);
  assert.deepEqual(d.cuerpo.hijos, [d.tabla, d.vacios[0], d.titulo]);
  assert.deepEqual(d.vacios[0].hijos.map((h) => h.getType()), ['PAGE_BREAK']);
  // Vacío: 11 pt, como en el HTML del AppSheet
  assert.ok(Math.abs(17 * d.vacios[0].interlineado * 1.211 - 11) < 1e-9);
});

test('la inspección no cambia su interlineado', () => {
  const d = cuerpoResponsiva();
  generar((p) => p.INSPECCION_CELULAR, null, d.cuerpo);
  assert.equal(d.celda.interlineado, 1.15);
  assert.equal(d.cuerpo.hijos.length, 5);
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
