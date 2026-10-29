/**
 * planes.js — los cambios de la conversión al formato nuevo, como peticiones de documents.batchUpdate, en tres tandas
 * (cada una sobre el documento recién bajado, porque los índices se recorren con cada cambio):
 *   1. columnas: la columna N/A donde falte y los anchos (también de una tabla que se salía de su columna de la página);
 *      inspDevAgregarNA_ decide cuáles y cuánto, en memoria;
 *   2. textos: «N/A» en el encabezado nuevo y ` {{PIEZA}}` junto al nombre de cada pieza (de atrás para adelante);
 *   3. reemplazos: replaceAllText de cada marca de AppSheet a la nueva (conserva el formato de cada una).
 * Son funciones puras sobre el modelo (modelo.js, con los índices reales en `_api`) y el entorno (entorno.js).
 */

/** Las celdas de opción de un renglón (todo su texto es un <<IF([PIEZA] = "…", "✓", "")>>) → [{ c, pieza, literal }] */
function opcionesDe(renglon, opcion) {
  const lista = [];
  renglon.celdas.forEach((celda, c) => {
    const texto = celda.getText().trim();
    const m = opcion.exec(texto);
    if (m) lista.push({ c: c, pieza: m[1].trim(), literal: texto });
  });
  return lista;
}

/** Tanda 1: corre inspDevAgregarNA_ sobre el modelo (lo cambia en memoria) y traduce lo que cambió a columnas nuevas. */
function planColumnas(e, cuerpo) {
  const opcion = e.valor('INSP_CONV_OPCION');
  const tablas = e.ctx.inspDevTablas_(cuerpo);
  const antes = tablas.map((t) => ({ columnas: t.filas[0].celdas.length, anchos: JSON.stringify(t.anchos) }));
  const na = e.ctx.inspDevAgregarNA_(cuerpo, true);
  const requests = [];
  const cambian = [];
  tablas.forEach((t, k) => {
    const nueva = t.filas[0].celdas.length !== antes[k].columnas;
    // Una tabla cambia si se le agregó la columna N/A o si solo se reacomodaron sus anchos (se salía de su columna)
    if (!nueva && JSON.stringify(t.anchos) === antes[k].anchos) return;
    const renglon = t.filas.findIndex((f) => opcionesDe(f, opcion).length);
    cambian.push({ k: k, nueva: nueva, columnas: antes[k].columnas, inicio: t._api.inicio, renglon: renglon, anchos: t.anchos ? t.anchos.slice() : null });
  });
  const conNA = cambian.filter((x) => x.nueva);
  // De la última tabla a la primera: insertar en una no recorre los índices de las de antes
  cambian.sort((a, b) => b.inicio - a.inicio).forEach((x) => {
    const tabla = { index: x.inicio };
    if (x.nueva) requests.push({ insertTableColumn: { tableCellLocation: { tableStartLocation: tabla, rowIndex: x.renglon, columnIndex: x.columnas - 1 }, insertRight: true } });
    (x.anchos || []).forEach((w, i) => {
      requests.push({ updateTableColumnProperties: { tableStartLocation: tabla, columnIndices: [i],
        tableColumnProperties: { widthType: 'FIXED_WIDTH', width: { magnitude: w, unit: 'PT' } }, fields: 'widthType,width' } });
    });
  });
  return { requests: requests, conNA: conNA.map((x) => ({ k: x.k, columnas: x.columnas })), na: na };
}

/** El índice donde termina el texto de una celda (antes del salto con que cierra su último párrafo) */
function finDeCelda(celda) {
  const parrafos = celda.hijos.filter((h) => h._api && h.getType() === 'PARAGRAPH');
  const ultimo = parrafos[parrafos.length - 1];
  return ultimo ? ultimo._api.fin - 1 : null;
}

/**
 * Tanda 2 (sobre el documento ya con las columnas): «N/A» en cada encabezado nuevo, la marca de cada pieza y, en una
 * tabla sin título (la otra mitad de una sección), {{continúa Sección}} en su primera celda. `seccionDe`: la sección de
 * cada pieza hoy (inspDevSeccionDePieza_).
 */
function planTextos(e, cuerpo, conNA, seccionDe) {
  const opcion = e.valor('INSP_CONV_OPCION');
  const tablas = e.ctx.inspDevTablas_(cuerpo);
  const inserciones = [];
  const problemas = [];
  conNA.forEach((x) => {
    const t = tablas[x.k];
    const primeraPieza = t.filas.findIndex((f) => opcionesDe(f, opcion).length);
    t.filas.forEach((f, r) => {
      // El encabezado: un renglón antes de la primera pieza con texto en la que era la última columna
      if (r >= primeraPieza || !f.celdas[x.columnas - 1].getText().trim()) return;
      const nueva = f.celdas[x.columnas];
      if (!nueva) problemas.push('no apareció la columna nueva de una tabla');
      else inserciones.push({ indice: finDeCelda(nueva), texto: 'N/A' });
    });
  });
  tablas.forEach((t) => t.filas.forEach((f, r) => {
    const opciones = opcionesDe(f, opcion);
    if (!opciones.length) return;
    const pieza = opciones[0].pieza;
    if (opciones.some((o) => o.pieza !== pieza)) {
      problemas.push('un renglón con dos piezas');
      return;
    }
    const primera = t.filas.findIndex((x) => opcionesDe(x, opcion).length) === r;
    if (primera && !e.ctx.inspDevTieneTitulo_(t)) {
      const titulo = seccionDe[e.ctx.MotorPlantillas.clave(pieza)];
      if (!titulo) problemas.push(pieza + ': su tabla no tiene título y no sé de qué sección es');
      else inserciones.push({ indice: finDeCelda(t.filas[0].celdas[0]), texto: '{{continúa ' + titulo + '}}' });
    }
    let nombre = opciones[0].c - 1;
    while (nombre >= 0 && !f.celdas[nombre].getText().trim()) nombre--;
    if (nombre < 0) problemas.push(pieza + ': su renglón no tiene celda con el nombre');
    else inserciones.push({ indice: finDeCelda(f.celdas[nombre]), texto: ' {{' + pieza + '}}' });
  }));
  if (inserciones.some((x) => x.indice === null)) problemas.push('una celda sin párrafo donde escribir');
  const requests = inserciones.filter((x) => x.indice !== null).sort((a, b) => b.indice - a.indice)
    .map((x) => ({ insertText: { location: { index: x.indice }, text: x.texto } }));
  return { requests: requests, problemas: problemas };
}

/** Tanda 3: cada marca de AppSheet a la nueva, con replaceAllText (una petición por marca distinta). */
function planReemplazos(e, cuerpo) {
  const opcion = e.valor('INSP_CONV_OPCION');
  const cambios = new Map();
  const pendientes = [];
  e.ctx.inspDevTablas_(cuerpo).forEach((t) => t.filas.forEach((f) => opcionesDe(f, opcion).forEach((o) => cambios.set(o.literal, ''))));
  const texto = cuerpo.getText();
  (texto.match(/<<If:[\s\S]*?>>/gi) || []).forEach((abre) => {
    const campo = e.ctx.inspDevCondicion_(abre.replace(/^<<If:/i, '').replace(/>>$/, ''));
    if (campo) cambios.set(abre, '{{si ' + campo + '}}');
    else pendientes.push('una condición sin traducción: ' + abre);
  });
  (texto.match(/<<EndIf>>/gi) || []).forEach((fin) => cambios.set(fin, '{{fin}}'));
  (texto.match(/<<\[?[^<>[\]()"*,=]+\]?>>/g) || []).forEach((literal) => {
    if (/^<<EndIf>>$/i.test(literal)) return;
    cambios.set(literal, '{{' + literal.replace(/^<<\[?|\]?>>$/g, '').trim() + '}}');
  });
  // Lo que quedaría sin traducir
  let resto = texto;
  cambios.forEach((v, k) => { resto = resto.split(k).join(v); });
  (resto.match(/<<[\s\S]*?>>/g) || []).forEach((m) => pendientes.push('una marca sin traducción: ' + m.slice(0, 60)));
  const requests = [...cambios.entries()].map(([de, a]) => ({ replaceAllText: { containsText: { text: de, matchCase: true }, replaceText: a } }));
  return { requests: requests, pendientes: pendientes };
}

module.exports = { planColumnas, planTextos, planReemplazos, opcionesDe };
