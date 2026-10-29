/**
 * tools/plantillas (modelo.js y planes.js): un documento de la API de Docs (JSON con índices) → el modelo en memoria →
 * las peticiones de documents.batchUpdate de cada tanda de la conversión. Sin red: el JSON se arma aquí.
 *
 * Correr: node tests/plantillas-planes.test.js
 */
const modelo = require('../tools/plantillas/modelo');
const planes = require('../tools/plantillas/planes');
const { entorno } = require('../tools/plantillas/entorno');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

/** Un documento de la API: párrafos y tablas (anidadas con una función), con índices crecientes como los reales */
function documento(contenido) {
  let i = 1;
  const par = (t) => { const s = i; i += t.length + 1; return { startIndex: s, endIndex: i, paragraph: { elements: [{ textRun: { content: t + '\n' } }] } }; };
  const elemento = (x) => (typeof x === 'string' ? par(x) : x(armarTabla));
  function armarTabla(filas, anchos) {
    const s = i++;
    const tableRows = filas.map((f) => {
      i++;
      return { tableCells: f.map((c) => { const cs = i++; const content = (Array.isArray(c) ? c : [c]).map(elemento); return { startIndex: cs, endIndex: i, content: content }; }) };
    });
    i++;
    return { startIndex: s, endIndex: i, table: { rows: filas.length, columns: filas[0].length, tableRows: tableRows,
      tableStyle: anchos ? { tableColumnProperties: anchos.map((w) => ({ widthType: 'FIXED_WIDTH', width: { magnitude: w, unit: 'PT' } })) } : {} } };
  }
  return { body: { content: contenido.map(elemento) } };
}
const SI = (p, o) => '<<IF([' + p + '] ="' + o + '", "✓", "")>>';
const fila = (nombre, pieza, ops) => [nombre].concat(ops.map((o) => SI(pieza, o)));
const OPS3 = ['BUENO', 'REGULAR', 'MALO'];
const OPS4 = OPS3.concat(['N/A']);

const e = entorno(['PARABRISAS', 'NIEBLEROS / OTROS', 'GATO MECANICO', 'PLACAS']);

console.log('1. Del JSON de la API al modelo');
{
  const doc = documento(['Placas: <<[PLACAS]>>', (tabla) => tabla([['Cristalería 10%', 'Bueno', 'Regular', 'Malo'], fila('Parabrisas', 'PARABRISAS', OPS3)], [140, 46.7, 46.7, 46.6])]);
  const c = modelo.cuerpo(doc);
  ok(c.hijos[0].getText() === 'Placas: <<[PLACAS]>>' && c.hijos[0]._api.inicio === 1, 'un párrafo, con su texto y sus índices');
  const t = c.hijos[1];
  ok(t.filas[1].celdas[1].getText() === SI('PARABRISAS', 'BUENO') && t.anchos.join(',') === '140,46.7,46.7,46.6' && t._api.inicio > 1,
    'una tabla, con sus celdas, anchos e índice');
}

console.log('2. Tanda 1: la columna N/A donde falta, con sus anchos');
{
  const doc = documento([(tabla) => tabla([[
    ['', (t) => t([['Cristalería 10%', 'Bueno', 'Regular', 'Malo'], fila('Parabrisas', 'PARABRISAS', OPS3)], [140, 46.7, 46.7, 46.6])],
    ['', (t) => t([['Inventarios 10%', 'Bueno', 'Regular', 'Malo', 'N/A'], fila('Gato mecánico', 'GATO MECANICO', OPS4)], [100, 30, 30, 30, 30])],
  ]])]);
  const c = modelo.cuerpo(doc);
  const inicio = c.hijos[0].filas[0].celdas[0].hijos[1]._api.inicio;
  const p = planes.planColumnas(e, c);
  const insertar = p.requests.filter((r) => r.insertTableColumn);
  ok(insertar.length === 1 && insertar[0].insertTableColumn.tableCellLocation.tableStartLocation.index === inicio &&
    insertar[0].insertTableColumn.tableCellLocation.rowIndex === 1 && insertar[0].insertTableColumn.tableCellLocation.columnIndex === 3 &&
    insertar[0].insertTableColumn.insertRight === true, 'solo en la que no lo trae: a la derecha de la última columna, desde un renglón de pieza');
  const anchos = p.requests.filter((r) => r.updateTableColumnProperties).map((r) => r.updateTableColumnProperties.tableColumnProperties.width.magnitude);
  ok(anchos.join(',') === '140,35,35,35,35', 'sus anchos: el nombre igual y las opciones repartidas (140 + 4 × 35 = 280)');
  ok(p.conNA.length === 1 && p.conNA[0].columnas === 4, 'y dice cuál cambió y cuántas columnas tenía');
}

console.log('3. Tanda 2: «N/A» en el encabezado nuevo, la marca de cada pieza y la de continuación');
{
  // Como queda después de la tanda 1: la columna nueva, vacía
  const doc = documento([(tabla) => tabla([[
    ['', (t) => t([['Sistemas interiores 10%', 'Bueno', 'Regular', 'Malo', ''], fila('Parabrisas', 'PARABRISAS', OPS3).concat([''])])],
    ['', (t) => t([['', 'Bueno', 'Regular', 'Malo', 'N/A'], fila('Niebleros/otros', 'NIEBLEROS / OTROS', OPS4)])],
  ]])]);
  const c = modelo.cuerpo(doc);
  const [izq, der] = c.hijos[0].filas[0].celdas;
  const tablas = e.ctx.inspDevTablas_(c);
  const k = tablas.indexOf(izq.hijos[1]);
  const p = planes.planTextos(e, c, [{ k: k, columnas: 4 }], { PARABRISAS: 'Sistemas interiores', 'NIEBLEROS/OTROS': 'Sistemas interiores' });   // claves como las da inspDevSeccionDePieza_ (MotorPlantillas.clave)
  const ins = p.requests.map((r) => r.insertText);
  const en = (celda) => celda.hijos[0]._api.fin - 1;
  const t1 = izq.hijos[1];
  const t2 = der.hijos[1];
  ok(p.problemas.length === 0, 'sin problemas');
  ok(ins.some((x) => x.text === 'N/A' && x.location.index === en(t1.filas[0].celdas[4])), '«N/A» en la celda nueva del encabezado');
  ok(ins.some((x) => x.text === ' {{PARABRISAS}}' && x.location.index === en(t1.filas[1].celdas[0])), 'la marca al final del nombre de la pieza');
  ok(ins.some((x) => x.text === '{{continúa Sistemas interiores}}' && x.location.index === en(t2.filas[0].celdas[0])), 'la continuación, en la primera celda de la tabla sin título');
  ok(ins.every((x, i) => !i || ins[i - 1].location.index > x.location.index), 'de atrás para adelante (un cambio no recorre los índices de los que siguen)');
  const sin = planes.planTextos(e, modelo.cuerpo(documento([(tabla) => tabla([['', 'Bueno', 'Malo'], fila('Stop', 'STOP', ['BUENO', 'MALO'])])])), [], {});
  ok(/STOP: su tabla no tiene título y no sé de qué sección es/.test(sin.problemas.join()), 'una continuación sin sección conocida es problema (no se escribe)');
}

console.log('4. Tanda 3: los reemplazos');
{
  const LLANTA = '<<If:([LLANTA DD] <= 1.6)>> <<[LLANTA DD]>> <<EndIf>>';
  const doc = documento(['Placas: <<[PLACAS]>> · <<PUNTAJE FINAL INSPECCION>>', LLANTA, (tabla) => tabla([['Cristalería 10%', 'Bueno'], ['Parabrisas', SI('PARABRISAS', 'BUENO')]])]);
  const p = planes.planReemplazos(e, modelo.cuerpo(doc));
  const mapa = {};
  p.requests.forEach((r) => { mapa[r.replaceAllText.containsText.text] = r.replaceAllText.replaceText; });
  ok(mapa['<<[PLACAS]>>'] === '{{PLACAS}}' && mapa['<<PUNTAJE FINAL INSPECCION>>'] === '{{PUNTAJE FINAL INSPECCION}}', 'los valores, con o sin corchetes');
  ok(mapa['<<If:([LLANTA DD] <= 1.6)>>'] === '{{si LLANTA DD MALO}}' && mapa['<<EndIf>>'] === '{{fin}}' && mapa['<<[LLANTA DD]>>'] === '{{LLANTA DD}}', 'los bloques de las llantas');
  ok(mapa[SI('PARABRISAS', 'BUENO')] === '', 'la fórmula de cada celda de opción se borra');
  ok(p.requests.every((r) => r.replaceAllText.containsText.matchCase === true) && p.pendientes.length === 0, 'distinguiendo mayúsculas, sin pendientes');
  const raro = planes.planReemplazos(e, modelo.cuerpo(documento(['<<UPPER([PLACAS])>> <<If:([VOLTAJE] <= 11)>>x<<EndIf>>'])));
  ok(raro.pendientes.some((x) => /condición sin traducción/.test(x)) && raro.pendientes.some((x) => /marca sin traducción: <<UPPER/.test(x)), 'lo que no sabe traducir es pendiente');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
