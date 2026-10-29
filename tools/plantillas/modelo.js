/**
 * modelo.js — un documento de la API de Docs (documents.get) como el Docs simulado de las pruebas (tests/docs-simulado.js),
 * para correr sobre él el mismo código de Apps Script (Plantilla.gs, MotorPlantillas.gs, InspeccionesPlantillasDev.gs).
 * Cada párrafo, celda y tabla guarda en `_api` sus índices en el documento real ({ inicio, fin }), para planear los
 * cambios que luego se mandan con documents.batchUpdate.
 */
const D = require('../../tests/docs-simulado');

/** El texto de un párrafo, sin el salto de renglón con que cierra */
const textoDeParrafo = (p) => (p.elements || []).map((e) => (e.textRun ? e.textRun.content : '')).join('').replace(/\n$/, '');

function contenido(lista) {
  const salida = [];
  (lista || []).forEach((el) => {
    if (el.paragraph) {
      const p = D.parrafo(textoDeParrafo(el.paragraph));
      p._api = { inicio: el.startIndex, fin: el.endIndex };
      salida.push(p);
    } else if (el.table) {
      salida.push(tabla(el));
    }
  });
  return salida;
}

function tabla(el) {
  const renglones = el.table.tableRows.map((r) => r.tableCells.map((c) => {
    const celda = D.celda('');
    const hijos = contenido(c.content);
    celda.hijos = hijos.length ? hijos : [D.parrafo('')];
    celda._api = { inicio: c.startIndex, fin: c.endIndex };
    return celda;
  }));
  const propiedades = (el.table.tableStyle && el.table.tableStyle.tableColumnProperties) || [];
  // Un ancho que la tabla no fija (columna repartida por Docs) queda null: inspDevAnchos_ lo dice y no los cambia
  const anchos = propiedades.length === el.table.columns
    ? propiedades.map((p) => (p.width && p.width.magnitude ? p.width.magnitude : null))
    : null;
  const t = D.tabla(renglones, anchos);
  t._api = { inicio: el.startIndex, fin: el.endIndex, columnas: el.table.columns };
  return t;
}

/** El cuerpo de un documento de la API, como el del Docs simulado */
const cuerpo = (documento) => D.cuerpo(contenido(documento.body.content));

module.exports = { cuerpo, textoDeParrafo };
