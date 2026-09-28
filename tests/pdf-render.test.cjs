const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('el PDF sustituye etiquetas repetidas, expresiones y tablas sin búsquedas por etiqueta', () => {
  let lecturas = 0;
  let cerrado = false;
  let limpiado = false;
  const texto = (valor) => ({
    valor, getType: () => 'TEXT', asText() { return this; },
    getText() { lecturas++; return this.valor; },
    deleteText(a, b) { this.valor = this.valor.slice(0, a) + this.valor.slice(b + 1); },
    insertText(a, v) { this.valor = this.valor.slice(0, a) + v + this.valor.slice(a); },
  });
  const grupo = (...hijos) => ({ getType: () => 'CONTAINER', getNumChildren: () => hijos.length, getChild: (i) => hijos[i], findText: () => null });
  const a = texto('<<NOMBRE>> / <<NOMBRE>> / <<[VACIO]>>');
  const b = texto('<<UPPER([NOMBRE])>> · <<IF([ESTADO] = "SI", "OK", "NO")>>');
  const cabecera = texto('Responsiva <<NOMBRE>>');
  const cuerpo = grupo(grupo(a, grupo(b)));
  const copia = { getId: () => 'tmp', getAs: () => { assert.ok(cerrado); return { setName: () => ({}) }; }, setTrashed: () => { limpiado = true; } };
  const contexto = vm.createContext({
    DriveApp: { getFileById: () => ({ makeCopy: () => copia }) },
    DocumentApp: { ElementType: { TEXT: 'TEXT' }, openById: () => ({ getBody: () => cuerpo, getHeader: () => grupo(cabecera), getFooter: () => null, saveAndClose: () => { cerrado = true; } }) },
  });
  const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasPdf.gs'), 'utf8');
  vm.runInContext(fuente + '\nthis.pdf = LineasPdf;', contexto);
  const carpeta = { createFile: () => ({ getId: () => 'pdf', getName: () => 'documento.pdf', getUrl: () => 'url' }) };
  const resultado = contexto.pdf.generarPdfDesdePlantilla('plantilla', { NOMBRE: 'Ana', ESTADO: 'SI' }, {}, carpeta, 'documento.pdf');
  assert.equal(a.valor, 'Ana / Ana / ');
  assert.equal(b.valor, 'ANA · OK');
  assert.equal(cabecera.valor, 'Responsiva Ana');
  assert.equal(lecturas, 3);
  assert.equal(resultado.id, 'pdf');
  assert.ok(limpiado);
});
