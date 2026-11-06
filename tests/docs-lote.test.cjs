// DocsLote (6-nov, fase 6 del motor único de PDF adelantada): las etiquetas de texto en una sola petición a la API de
// Docs. Solo acelera: el texto final tiene que ser el mismo que por el camino de siempre (DocumentApp, una por una).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const fuente = (r) => fs.readFileSync(path.join(__dirname, '..', 'src', r), 'utf8');

/**
 * Un documento de mentira: `secciones.body` / `secciones.header` son listas de párrafos y cada párrafo una lista de
 * tramos (textRun) o de celdas ({ celdas: [[tramos], …] }). La API de Docs falsa y el DocumentApp falso leen y
 * escriben el mismo modelo, como en Google.
 */
function documento(secciones) {
  const peticiones = [];
  const aDocs = (parrafos) => parrafos.map((p) => (p.celdas
    ? { table: { tableRows: [{ tableCells: p.celdas.map((c) => ({ content: [{ paragraph: { elements: c.map((t) => ({ textRun: { content: t } })) } }] })) }] } }
    : { paragraph: { elements: p.map((t) => ({ textRun: { content: t } })) } }));
  const todos = () => {
    const lista = [];
    const juntar = (parrafos) => parrafos.forEach((p) => (p.celdas ? p.celdas.forEach((c) => lista.push(c)) : lista.push(p)));
    Object.keys(secciones).forEach((k) => juntar(secciones[k]));
    return lista;
  };
  const Docs = {
    Documents: {
      get: () => ({
        body: { content: aDocs(secciones.body || []) },
        headers: secciones.header ? { h1: { content: aDocs(secciones.header) } } : {},
      }),
      batchUpdate: (cuerpo) => {
        peticiones.push(cuerpo.requests);
        return {
          replies: cuerpo.requests.map((r) => {
            const { text } = r.replaceAllText.containsText;
            let n = 0;
            todos().forEach((tramos) => {
              const junto = tramos.join('');
              const partes = junto.split(text);
              if (partes.length < 2) return;
              n += partes.length - 1;
              tramos.splice(0, tramos.length, partes.join(r.replaceAllText.replaceText));
            });
            return { replaceAllText: n ? { occurrencesChanged: n } : {} };
          }),
        };
      },
    },
  };
  // DocumentApp: un Text por tramo, como Docs con formatos distintos
  const texto = (tramos, i) => ({
    getType: () => 'TEXT', asText() { return this; },
    getText: () => tramos[i],
    deleteText(a, b) { tramos[i] = tramos[i].slice(0, a) + tramos[i].slice(b + 1); },
    insertText(a, v) { tramos[i] = tramos[i].slice(0, a) + v + tramos[i].slice(a); },
    replaceText(patron, v) { tramos[i] = tramos[i].replace(new RegExp(patron, 'g'), () => v); },
  });
  const grupo = (hijos) => ({ getType: () => 'CONTAINER', getNumChildren: () => hijos.length, getChild: (k) => hijos[k], findText: () => null });
  const seccion = (parrafos) => grupo(parrafos.map((p) => (p.celdas
    ? grupo(p.celdas.map((c) => grupo(c.map((_, i) => texto(c, i)))))
    : grupo(p.map((_, i) => texto(p, i))))));
  const DocumentApp = {
    ElementType: { TEXT: 'TEXT' },
    openById: () => ({
      getBody: () => seccion(secciones.body || []),
      getHeader: () => (secciones.header ? seccion(secciones.header) : null),
      getFooter: () => null,
      saveAndClose: () => {},
    }),
  };
  const final = () => JSON.stringify(Object.keys(secciones).map((k) => secciones[k].map((p) => (p.celdas ? p.celdas.map((c) => c.join('')) : p.join('')))));
  return { Docs, DocumentApp, peticiones, final };
}

function cargar(archivos, extra) {
  const contexto = vm.createContext(Object.assign({ console: { warn: () => {}, log: () => {} } }, extra));
  vm.runInContext(archivos.map(fuente).join('\n') + '\nthis.exp = { DocsLote, ' + (archivos.some((a) => /LineasPdf/.test(a)) ? 'LineasPdf, ' : '') +
    (archivos.some((a) => /PdfService/.test(a)) ? 'PdfService, Plantilla, ' : '') + '};', contexto);
  return contexto.exp;
}

test('DocsLote: junta los tramos de un párrafo, lee tablas y encabezados y no repite', () => {
  const d = documento({
    body: [['Hola <<[NOM', 'BRE]>> y <<FECHA>>'], { celdas: [['<<FECHA>>'], ['<<[PLACAS]>>']] }],
    header: [['Responsiva <<[NOMBRE]>>']],
  });
  const { DocsLote } = cargar(['utils/DocsLote.gs'], { Docs: d.Docs });
  assert.deepEqual([...DocsLote.marcadores('x')], ['<<[NOMBRE]>>', '<<FECHA>>', '<<[PLACAS]>>']);
});

test('DocsLote: una petición por cada 500 etiquetas, el vacío borra y cuenta lo cambiado', () => {
  const d = documento({ body: [['<<A>> y <<A>> · <<B>>']] });
  const { DocsLote } = cargar(['utils/DocsLote.gs'], { Docs: d.Docs });
  const r = DocsLote.reemplazar('x', [{ marcador: '<<A>>', valor: 'uno' }, { marcador: '<<B>>', valor: '' }]);
  assert.equal(r.hechos, 3);
  assert.equal(d.final(), JSON.stringify([['uno y uno · ']]));
  const muchas = Array.from({ length: 1201 }, (_, i) => ({ marcador: '<<X' + i + '>>', valor: '' }));
  DocsLote.reemplazar('x', muchas);
  assert.deepEqual(d.peticiones.slice(1).map((p) => p.length), [500, 500, 201]);
});

test('DocsLote: apagado sin el servicio Docs o con PDF_SIN_LOTE = 1', () => {
  assert.equal(cargar(['utils/DocsLote.gs'], {}).DocsLote.disponible(), false);
  const d = documento({ body: [] });
  assert.equal(cargar(['utils/DocsLote.gs'], { Docs: d.Docs, leerConfig_: () => '1' }).DocsLote.disponible(), false);
  assert.equal(cargar(['utils/DocsLote.gs'], { Docs: d.Docs, leerConfig_: () => null }).DocsLote.disponible(), true);
});

// ---- Líneas: el mismo PDF con y sin lote

function pdfLineas(conLote, plantilla, falla) {
  const d = documento({
    body: [
      ['NUCO <<RIGHT("000" & [NUCO], 4)>> · <<[NOMBRE]>> · <<UPPER([NOMBRE])>>'],
      { celdas: [['<<IF([ESTADO] = "SI", "OK", "NO")>>'], ['<<[VACIO]>>']] },
      ['Firma: <<[FIRMA CI]>> · <<RESPONSABLE>> · <<NOEXISTE(>>'],
      ['<<If:[ESTADO] = "SI">>sí<<EndIf>>'],
    ],
    header: [['Responsiva <<[NOMBRE]>>']],
  });
  if (falla) d.Docs.Documents.batchUpdate = () => { throw new Error('cuota'); };
  const copia = { getId: () => 'tmp', getAs: () => ({ setName: () => ({}), getDataAsString: () => '' }), setTrashed: () => {} };
  const { LineasPdf } = cargar(['utils/Cronometro.gs', 'utils/DocsLote.gs', 'services/lineas/LineasPdf.gs'], {
    Docs: conLote ? d.Docs : undefined,
    DocumentApp: d.DocumentApp,
    DriveApp: { getFileById: () => ({ makeCopy: () => copia }), Access: { DOMAIN: 'DOMAIN' }, Permission: { VIEW: 'VIEW' } },
    DriveUtils: { ...require('./drive-utils-real')(), marcarAutor: (a) => a },
    LineasArchivos: { compartirEnDominio: () => true },
  });
  const carpeta = { createFile: () => ({ getId: () => 'pdf', getName: () => 'doc.pdf', getUrl: () => 'url' }) };
  const r = LineasPdf.generarPdfDesdePlantilla(plantilla ? plantilla(LineasPdf.PLANTILLAS) : 'plantilla',
    { NUCO: '7', NOMBRE: 'Ana', ESTADO: 'SI', RESPONSABLE: 'ANA PEREZ' }, { 'FIRMA CI': null }, carpeta, 'doc.pdf');
  return { final: d.final(), avisos: [...r.avisos], peticiones: d.peticiones, pasos: r.tiempos.map((t) => t.paso) };
}

test('Líneas: con el lote el documento queda igual que una por una, con los mismos avisos', () => {
  const antes = pdfLineas(false);
  const ahora = pdfLineas(true);
  assert.equal(ahora.final, antes.final);
  assert.deepEqual(ahora.avisos, antes.avisos);
  assert.equal(antes.peticiones.length, 0);
  assert.equal(ahora.peticiones.length, 1);
  assert.ok(ahora.pasos.includes('lote: leer') && ahora.pasos.includes('lote: reemplazar'));
  // Lo que se queda para el camino de siempre: imagen, If/EndIf y la etiqueta con error
  const enLote = ahora.peticiones[0].map((r) => r.replaceAllText.containsText.text);
  ['<<[FIRMA CI]>>', '<<If:[ESTADO] = "SI">>', '<<EndIf>>', '<<NOEXISTE(>>'].forEach((m) => assert.ok(!enLote.includes(m), m));
  assert.ok(enLote.includes('<<RESPONSABLE>>'), 'en otra plantilla, <<RESPONSABLE>> sí va en el lote');
});

test('Líneas: la etiqueta que achica el nombre bajo la firma se queda fuera del lote en la responsiva', () => {
  const r = pdfLineas(true, (p) => p.RESPONSIVA_CELULAR);
  assert.ok(!r.peticiones[0].map((x) => x.replaceAllText.containsText.text).includes('<<RESPONSABLE>>'));
});

test('Líneas: si la API truena, el PDF sale igual por el camino de siempre', () => {
  assert.equal(pdfLineas(true, null, true).final, pdfLineas(false).final);
});

// ---- Vehículos: llenarEnLote_ + llenarTexto_ dan lo mismo que llenarTexto_ solo

function textoVehicular(conLote) {
  const d = documento({
    body: [
      ['Unidad <<[PLACAS]>> · <<[MARCA]>> <<[MODELO]>>'],
      { celdas: [['<<[FECHA]>>'], ['<<[KM]>>']] },
      ['<<[FIRMA INSPECTOR]>>'],
    ],
  });
  const exp = cargar(['utils/DocsLote.gs', 'services/Plantilla.gs', 'services/PdfService.gs'], {
    Docs: conLote ? d.Docs : undefined, DocumentApp: d.DocumentApp,
    Session: { getScriptTimeZone: () => 'America/Mexico_City' }, Utilities: { formatDate: () => '18/09/2026' },
  });
  const datos = { PLACAS: 'GGR658F', MARCA: 'NISSAN', MODELO: 'NP300', FECHA: '18/09/2026', KM: 12000 };
  const p = { datos, imagenes: { 'FIRMA INSPECTOR': null } };
  const enLote = conLote ? exp.PdfService.llenarEnLote_('tmp', p, datos) : 0;
  const r = exp.PdfService.llenarTexto_(d.DocumentApp.openById().getBody(), datos);
  return { final: d.final(), marcadores: enLote + r.marcadores, sinResolver: [...r.sinResolver], peticiones: d.peticiones };
}

test('Vehículos: con el lote el documento queda igual, con el mismo conteo y sin la imagen', () => {
  const antes = textoVehicular(false);
  const ahora = textoVehicular(true);
  assert.equal(ahora.final, antes.final);
  assert.equal(ahora.marcadores, antes.marcadores);
  assert.deepEqual(ahora.sinResolver, antes.sinResolver);
  assert.equal(ahora.peticiones.length, 1);
  assert.ok(!ahora.peticiones[0].map((r) => r.replaceAllText.containsText.text).includes('<<[FIRMA INSPECTOR]>>'));
});
