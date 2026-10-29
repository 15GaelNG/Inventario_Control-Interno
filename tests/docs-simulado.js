/**
 * Un Google Docs de mentira para las pruebas de plantillas (MotorPlantillas, InspeccionesPlantillasDev). Imita lo que
 * usa el código de DocumentApp: cuerpo → párrafo → texto, tabla → renglón → celda → párrafos o tablas anidadas.
 * replaceText recibe un patrón como el de Apps Script (RE2) y aquí se corre como RegExp de JS (lo que usamos es igual).
 *
 *   const D = require('./docs-simulado');
 *   const cuerpo = D.cuerpo([D.parrafo('Fecha: {{FECHA}}'), D.tabla([['Cristalería 10%', 'Bueno', 'Malo'], …], [100, 30, 30])]);
 *   contexto: { DocumentApp: D.DocumentApp }
 *
 * Una celda es un texto (un párrafo) o D.celda('texto', [tablas anidadas]). Las partes quedan a la vista para las
 * pruebas: tabla.filas, renglon.celdas, tabla.anchos.
 */
const TIPOS = {
  BODY_SECTION: 'BODY_SECTION', PARAGRAPH: 'PARAGRAPH', LIST_ITEM: 'LIST_ITEM', TEXT: 'TEXT',
  TABLE: 'TABLE', TABLE_ROW: 'TABLE_ROW', TABLE_CELL: 'TABLE_CELL',
};

function reemplazar_(texto, patron, por) {
  return texto.replace(new RegExp(patron, 'g'), () => por);
}

function texto(t) {
  const x = {
    t: String(t || ''),
    getType: () => TIPOS.TEXT,
    asText: () => x,
    getText: () => x.t,
    setText: (v) => { x.t = String(v); return x; },
    replaceText: (p, por) => { x.t = reemplazar_(x.t, p, por); return x; },
    copy: () => texto(x.t),
  };
  return x;
}

function parrafo(t) {
  const p = {
    hijos: [texto(t)],
    getType: () => TIPOS.PARAGRAPH,
    asParagraph: () => p,
    getNumChildren: () => p.hijos.length,
    getChild: (i) => p.hijos[i],
    getText: () => p.hijos.map((h) => h.getText()).join(''),
    setText: (v) => { p.hijos = [texto(v)]; return p; },
    editAsText: () => p.hijos[0],
    appendText: (v) => { const h = p.hijos[p.hijos.length - 1]; h.setText(h.getText() + v); return h; },
    replaceText: (pat, por) => { p.hijos.forEach((h) => h.replaceText(pat, por)); return p; },
    copy: () => parrafo(p.getText()),
  };
  return p;
}

const textoDe_ = (hijos) => hijos.map((h) => h.getText()).join('\n');

function celda(t, tablas) {
  const c = {
    hijos: [parrafo(t)].concat(tablas || []),
    getType: () => TIPOS.TABLE_CELL,
    asTableCell: () => c,
    getNumChildren: () => c.hijos.length,
    getChild: (i) => c.hijos[i],
    getText: () => textoDe_(c.hijos),
    setText: (v) => { c.hijos = [parrafo(v)]; return c; },
    appendParagraph: (v) => { const p = parrafo(v); c.hijos.push(p); return p; },
    replaceText: (pat, por) => { c.hijos.forEach((h) => h.replaceText(pat, por)); return c; },
    copy: () => { const n = celda(''); n.hijos = c.hijos.map((h) => h.copy()); return n; },
  };
  return c;
}

function tabla(renglones, anchos) {
  const t = {
    anchos: anchos ? anchos.slice() : null,
    filas: renglones.map((cs) => {
      const r = {
        celdas: cs.map((x) => (typeof x === 'string' ? celda(x) : x)),
        getType: () => TIPOS.TABLE_ROW,
      };
      r.getNumCells = () => r.celdas.length;
      r.getCell = (i) => r.celdas[i];
      r.getNumChildren = r.getNumCells;
      r.getChild = r.getCell;
      r.getText = () => r.celdas.map((c) => c.getText()).join('\n');
      r.replaceText = (pat, por) => { r.celdas.forEach((c) => c.replaceText(pat, por)); return r; };
      r.appendTableCell = (c) => { r.celdas.push(c); return c; };
      r.copy = () => tabla([r.celdas.map((c) => c.copy())]).filas[0];
      return r;
    }),
    getType: () => TIPOS.TABLE,
    asTable: () => t,
    getNumRows: () => t.filas.length,
    getRow: (i) => t.filas[i],
    getNumChildren: () => t.filas.length,
    getChild: (i) => t.filas[i],
    getText: () => t.filas.map((r) => r.getText()).join('\n'),
    replaceText: (pat, por) => { t.filas.forEach((r) => r.replaceText(pat, por)); return t; },
    getColumnWidth: (i) => (t.anchos ? t.anchos[i] : null),
    setColumnWidth: (i, w) => { t.anchos[i] = w; return t; },
    copy: () => { const n = tabla([], t.anchos); n.filas = t.filas.map((r) => r.copy()); return n; },
  };
  return t;
}

function cuerpo(hijos) {
  const b = {
    hijos: hijos.map((h) => (typeof h === 'string' ? parrafo(h) : h)),
    getType: () => TIPOS.BODY_SECTION,
    getNumChildren: () => b.hijos.length,
    getChild: (i) => b.hijos[i],
    getText: () => textoDe_(b.hijos),
    replaceText: (pat, por) => { b.hijos.forEach((h) => h.replaceText(pat, por)); return b; },
    copy: () => cuerpo(b.hijos.map((h) => h.copy())),
  };
  return b;
}

/** Los textos de una tabla como arreglo de renglones (para comparar en las pruebas) */
const textos = (t) => t.filas.map((r) => r.celdas.map((c) => c.getText()));

module.exports = { TIPOS, DocumentApp: { ElementType: TIPOS }, texto, parrafo, celda, tabla, cuerpo, textos };
