/**
 * SheetUtils.gs
 * Capa genérica de acceso a datos sobre Google Sheets. Todas las funciones
 * asumen: fila 1 = encabezados, cada hoja tiene una columna "ID" única.
 * Los Services de cada módulo usan estas funciones en vez de tocar
 * SpreadsheetApp directamente, así el CRUD queda escrito una sola vez.
 *
 * Base tomada de la rama `ayrton` (normalización de encabezados/columnas,
 * indiceDeColumnas, removeMany, leerColumnas y mensajes de error más claros
 * en getSheetByColumns) — adaptada para conservar dos cosas propias de
 * `jorge` que su versión no tenía: el cache de spreadsheets abiertos
 * (abrirSpreadsheet_/_ssCache, evita reabrir el mismo archivo varias veces
 * en una sola ejecución) y el alias leerColumnasDeHoja (nombre que ya usan
 * 9+ Services existentes).
 */

const SheetUtils = (function () {
  // SpreadsheetApp.openById() es de las llamadas más caras de Apps Script —
  // dentro de UNA sola ejecución es común que varios Services toquen el
  // mismo spreadsheet (ej. ArqueosService.crear() llama a hoja_() propia Y a
  // CajasChicasService.buscarPorId()/actualizar(), cada uno con su propio
  // getSheet/getSheetByColumns) — sin este cache cada una reabre el archivo
  // por su cuenta. El cache vive mientras dure la ejecución (no entre
  // llamadas de google.script.run distintas — para eso ya está el cache de
  // CacheService en getSheetByColumns).
  const _ssCache = {};
  function abrirSpreadsheet_(spreadsheetId) {
    if (!_ssCache[spreadsheetId]) {
      _ssCache[spreadsheetId] = SpreadsheetApp.openById(spreadsheetId);
    }
    return _ssCache[spreadsheetId];
  }

  function getSheet(spreadsheetId, sheetName) {
    const ss = abrirSpreadsheet_(spreadsheetId);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      throw new Error('No existe la hoja "' + sheetName + '" en el spreadsheet ' + spreadsheetId);
    }
    return sheet;
  }

  function getHeaders_(sheet) {
    const n = sheet.getLastColumn();
    return n ? sheet.getRange(1, 1, 1, n).getValues()[0] : [];
  }

  /**
   * Fila → objeto. Las claves van SIN los espacios sobrantes del encabezado ("ID INSPECCION "
   * en la hoja → 'ID INSPECCION'): así el código lee row['ID INSPECCION'] como está escrito.
   * Con la clave cruda, además, update() mezclaba 'ID INSPECCION ' (lo viejo) con
   * 'ID INSPECCION' (lo nuevo) y escribía lo viejo: el cambio se perdía sin aviso.
   * Los acentos y mayúsculas se respetan (la clave sigue siendo el nombre de la columna).
   */
  const claveDeEncabezado_ = (h) => String(h == null ? '' : h).replace(/\s+/g, ' ').trim();

  function rowToObject_(headers, row) {
    const obj = {};
    headers.forEach((h, i) => { obj[claveDeEncabezado_(h)] = row[i]; });
    return obj;
  }

  /** Posición de la columna de ID, tolerante a espacios y acentos; truena claro si no está */
  function columnaId_(headers, idColumn, sheetName) {
    const idCol = indiceDeColumnas(headers, [idColumn])[idColumn];
    if (idCol === -1) throw new Error('La hoja "' + sheetName + '" no tiene columna "' + idColumn + '"');
    return idCol;
  }

  /**
   * Objeto → fila, en el orden de los encabezados. La búsqueda es tolerante a espacios
   * y acentos: con la comparación exacta, un encabezado con un espacio de más hacía que
   * ese dato NO se escribiera, sin error ni aviso.
   */
  function objectToRow_(headers, obj) {
    const datos = obj || {};
    const porNombre = {};
    Object.keys(datos).forEach((clave) => { porNombre[normalizarEncabezado_(clave)] = datos[clave]; });
    return headers.map((h) => {
      if (datos[h] !== undefined) return datos[h];
      const valor = porNombre[normalizarEncabezado_(h)];
      return valor === undefined ? '' : valor;
    });
  }

  /** Devuelve todas las filas como array de objetos {columna: valor} */
  function getAll(spreadsheetId, sheetName) {
    const sheet = getSheet(spreadsheetId, sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const headers = getHeaders_(sheet);
    const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    return values.map((row) => rowToObject_(headers, row));
  }

  /**
   * Número de renglón (base 1) del registro con ese ID, o -1. Lee SOLO la columna del ID: antes cada búsqueda
   * leía la hoja entera, y actualizar con ganchos eran dos lecturas completas.
   */
  function filaDeId_(sheet, headers, id, idColumn, sheetName) {
    const idCol = columnaId_(headers, idColumn, sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return -1;
    const ids = sheet.getRange(2, idCol + 1, lastRow - 1, 1).getValues();
    const buscado = String(id);
    for (let i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === buscado) return i + 2;
    }
    return -1;
  }

  /** Busca una fila por columna ID. Devuelve {rowIndex, data} o null */
  function findById(spreadsheetId, sheetName, id, idColumn) {
    idColumn = idColumn || 'ID';
    const sheet = getSheet(spreadsheetId, sheetName);
    const headers = getHeaders_(sheet);
    const fila = filaDeId_(sheet, headers, id, idColumn, sheetName);
    if (fila < 0) return null;
    return { rowIndex: fila, data: rowToObject_(headers, sheet.getRange(fila, 1, 1, headers.length).getValues()[0]) };
  }

  /**
   * Las columnas que `cambios` trae, como [{ i, valor }] (i base 0), con la misma búsqueda tolerante a espacios y
   * acentos de objectToRow_. Un encabezado repetido recibe el valor en todas sus columnas, igual que antes.
   */
  function columnasDeCambios_(headers, cambios) {
    const porNombre = {};
    Object.keys(cambios || {}).forEach((clave) => { porNombre[normalizarEncabezado_(clave)] = cambios[clave]; });
    const columnas = [];
    headers.forEach((h, i) => {
      if (normalizarEncabezado_(h) === '') return;
      const valor = cambios[h] !== undefined ? cambios[h] : porNombre[normalizarEncabezado_(h)];
      if (valor !== undefined) columnas.push({ i: i, valor: valor });
    });
    return columnas;
  }

  /** Escribe esas columnas de un renglón: un setValues por cada tramo de columnas seguidas, nada en los huecos */
  function escribirColumnas_(sheet, fila, columnas) {
    for (let k = 0; k < columnas.length;) {
      const tramo = [columnas[k]];
      while (k + tramo.length < columnas.length && columnas[k + tramo.length].i === tramo[tramo.length - 1].i + 1) {
        tramo.push(columnas[k + tramo.length]);
      }
      sheet.getRange(fila, tramo[0].i + 1, 1, tramo.length).setValues([tramo.map((c) => c.valor)]);
      k += tramo.length;
    }
  }

  // ================================================================================ escribir
  /*
   * TODA escritura de una hoja del sistema pasa por estas primitivas (28-oct; contrato en source-contracts): así lo
   * que hay que hacer en cada escritura (avisar a la pantalla, la bitácora) vive en UN lugar.
   *
   *   const t = SheetUtils.tabla(libroId, 'TICKETS')       // o SheetUtils.tabla(hoja), si ya se tiene la hoja
   *   SheetUtils.agregarFilas(t, [{ COLUMNA: valor }])     → números de renglón (a un objeto le nace su ID aquí)
   *   SheetUtils.cambiarCeldas(t, [{ fila, cambios: { COLUMNA: valor } }])
   *   SheetUtils.borrarFilas(t, [fila, …])
   *   SheetUtils.reemplazarFilas(t, filas)                  el cuerpo completo (importaciones, sincronías)
   *   SheetUtils.cambiarColumna(t, 'COLUMNA', valores)      una columna entera, desde el renglón 2
   *   SheetUtils.asegurarPestana(libro, nombre, encabezados) / asegurarColumnas(t, columnas) / quitarColumnas(t, columnas)
   *   SheetUtils.enLote(fn)                                 el candado; lo que va por la API de Sheets se manda junto al final
   *
   * Cada primitiva avisa a CacheHojas (la pantalla se entera) y al enganche de la bitácora, Bitacora.anotar(evento),
   * si existe. Escribir a mano (setValues, appendRow, deleteRow…) se salta las dos cosas: por eso el contrato.
   *
   * La política de la tabla dice cómo se escribe un valor. Por omisión, como siempre (Range.setValues: Sheets lo
   * interpreta como si se tecleara). Líneas declara la suya (LineasDatos.politica_):
   *   { escritor: 'api', paraApi(col, v) → { valor, tal }, paraCelda(col, v) → valor, anexar: 'bloque', medir(que, desde) }
   *   escritor 'api': las celdas van por la API de Sheets (tal = RAW; si no, USER_ENTERED), en lote dentro de enLote;
   *   paraCelda: el valor cuando se escribe con SpreadsheetApp (agregar filas, o sin la API).
   */
  const POLITICA_HOJA = { escritor: 'hoja' };

  /** La hoja lista para escribir: { hoja, nombre, encabezados, politica, libroId } */
  function tabla(libroOHoja, nombreUOpciones, opciones) {
    const porHoja = typeof libroOHoja !== 'string';
    const hoja = porHoja ? libroOHoja : getSheet(libroOHoja, nombreUOpciones);
    const o = (porHoja ? nombreUOpciones : opciones) || {};
    let libroId = porHoja ? null : libroOHoja;
    const t = { hoja: hoja, nombre: porHoja ? hoja.getName() : nombreUOpciones, politica: o.politica || POLITICA_HOJA, encabezados: o.encabezados || getHeaders_(hoja) };
    Object.defineProperty(t, 'libroId', { get: () => libroId || (libroId = hoja.getParent().getId()) });
    return t;
  }

  /** Cualquier escritura invalida lo que CacheHojas tenga guardado de esa hoja */
  function tocar_(spreadsheetId, sheetName) {
    if (typeof CacheHojas !== 'undefined') CacheHojas.tocar(spreadsheetId, sheetName);
  }
  function tocarTabla_(t) {
    if (typeof CacheHojas === 'undefined') return;
    try { CacheHojas.tocar(t.libroId, t.nombre); } catch (e) { /* sin caché, nada que invalidar */ }
  }

  /** El enganche: lo escrito, para la bitácora. Nunca truena: la bitácora no impide guardar */
  function avisar_(t, tipo, filas) {
    if (typeof Bitacora === 'undefined' || !Bitacora.anotar) return;
    try {
      Bitacora.anotar({ libro: t.libroId, hoja: t.nombre, tipo: tipo, filas: filas });
    } catch (e) {
      console.warn('Bitácora (' + t.nombre + '): ' + e.message);
    }
  }

  const celda_ = (t, columna, v) => (t.politica.paraCelda ? t.politica.paraCelda(columna, v) : v);

  /**
   * Agrega renglones al final. Cada uno es un objeto { COLUMNA: valor } o un arreglo ya en el orden de los encabezados.
   * A un objeto le nace aquí su ID: es uno de los DOS lugares del sistema donde nace uno (el otro es
   * LineasDatos.agregarFilas, que arma sus renglones). Ver docs/ids-asignacion.md.
   *
   *   si el objeto ya trae ID         → se respeta
   *   si la hoja no tiene columna ID  → no se hace nada (p. ej. USUARIOS)
   *   si la tiene y está en Entidades → ID = Ids.nuevo(prefijo)
   *   si la tiene y NO está           → truena
   *
   * Un renglón solo va con appendRow (Sheets lo agrega sin chocar, sin candado); varios, o con anexar: 'bloque', en
   * una escritura bajo el candado (agregando renglones a la rejilla si faltan; heredan el formato del anterior).
   * → los números de renglón.
   */
  function agregarFilas(t, filas) {
    const lista = filas || [];
    if (!lista.length) return [];
    const enc = t.encabezados;
    const tieneId = indiceDeColumnas(enc, ['ID'])['ID'] !== -1;
    const objetos = lista.map((f) => {
      if (Array.isArray(f)) return rowToObject_(enc, f);
      // Entidades truena si la hoja no está en el catálogo. Es a propósito: generar en
      // silencio un ID con el formato equivocado es justo de lo que estamos saliendo.
      if (tieneId && !f.ID) f.ID = Ids.nuevo(Entidades.prefijo(t.nombre));
      return f;
    });
    const valores = lista.map((f) => (Array.isArray(f) ? f : objectToRow_(enc, f).map((v, i) => celda_(t, enc[i], v))));

    let numeros;
    if (valores.length === 1 && t.politica.anexar !== 'bloque') {
      t.hoja.appendRow(valores[0]);
      numeros = [t.hoja.getLastRow()];
    } else {
      numeros = Candado.con(() => {
        const inicio = t.hoja.getLastRow() + 1;
        const faltan = inicio + valores.length - 1 - t.hoja.getMaxRows();
        if (faltan > 0) t.hoja.insertRowsAfter(t.hoja.getMaxRows(), faltan);
        const ancho = valores.reduce((m, v) => Math.max(m, v.length), 0);
        t.hoja.getRange(inicio, 1, valores.length, ancho)
          .setValues(valores.map((v) => (v.length < ancho ? v.concat(Array(ancho - v.length).fill('')) : v)));
        return valores.map((_, i) => inicio + i);
      });
    }
    tocarTabla_(t);
    avisar_(t, 'agregar', numeros.map((n, i) => ({ fila: n, id: objetos[i].ID, despues: objetos[i] })));
    return numeros;
  }

  /**
   * Cambia celdas de renglones ya ubicados: [{ fila, cambios: { COLUMNA: valor } }] (la columna se busca tolerante a
   * espacios y acentos; un encabezado repetido recibe el valor en todas sus columnas) o [{ fila, columnas: [{ i, valor }] }]
   * (i base 0, ya ubicada por quien llama). Solo esas celdas: nunca reescribe el renglón completo (pisaría lo que
   * otro cambió en otra columna y volvería valor una fórmula). Quien ubica el renglón tiene que hacerlo bajo el
   * candado (update lo hace): si alguien borra uno más arriba, los números se recorren.
   */
  function cambiarCeldas(t, cambios) {
    const lista = (cambios || []).map((x) => ({
      fila: x.fila,
      columnas: x.columnas || columnasDeCambios_(t.encabezados, x.cambios),
    })).filter((x) => x.fila > 1 && x.columnas.length);
    if (!lista.length) return 0;
    Candado.con(() => {
      if (t.politica.escritor === 'api' && apiDisponible_()) {
        const crudos = [];
        const tecleados = [];
        lista.forEach((x) => x.columnas.forEach((c) => {
          const v = t.politica.paraApi(t.encabezados[c.i], c.valor);
          (v.tal ? crudos : tecleados).push({ range: a1_(t.nombre, x.fila, c.i + 1), values: [[v.valor]] });
        }));
        if (lote_) {
          // Dentro de enLote: se juntan y se mandan en una sola llamada al final (vaciarLote_)
          const delLibro = lote_.libros[t.libroId] = lote_.libros[t.libroId] || { datos: {}, tablas: {} };
          crudos.forEach((d) => { delLibro.datos[d.range] = { d: d, tal: true }; });
          tecleados.forEach((d) => { delLibro.datos[d.range] = { d: d, tal: false }; });
          delLibro.tablas[t.nombre] = t;
          lote_.respaldo.push([t, lista]);
          if (!lote_.medir) lote_.medir = t.politica.medir;
          return;
        }
        try {
          mandarApi_(t.libroId, crudos, tecleados);
          tocarTabla_(t);
          return;
        } catch (e) {
          // Solo se reintenta sin API si no se escribió nada (la API no está habilitada)
          if (!marcarApiApagada_(e)) throw e;
        }
      }
      escribirConHoja_(t, lista);
      tocarTabla_(t);
    });
    avisar_(t, 'cambiar', lista.map((x) => ({
      fila: x.fila,
      cambios: x.columnas.reduce((o, c) => { o[claveDeEncabezado_(t.encabezados[c.i])] = c.valor; return o; }, {}),
    })));
    return lista.length;
  }

  /**
   * Con SpreadsheetApp. Un renglón: un setValues por cada tramo de columnas seguidas, nada en los huecos. Varios
   * renglones de una sola celda con el mismo valor (Relaciones al propagar): todas de una vez con getRangeList.
   */
  function escribirConHoja_(t, lista) {
    const valorDe = (c) => celda_(t, t.encabezados[c.i], c.valor);
    if (lista.length > 1 && lista.every((x) => x.columnas.length === 1)) {
      const grupos = {};
      lista.forEach((x) => {
        const c = x.columnas[0];
        const v = valorDe(c);
        const k = c.i + '|' + (v instanceof Date ? 'D' + v.getTime() : typeof v + ':' + String(v));
        (grupos[k] = grupos[k] || { v: v, celdas: [] }).celdas.push(a1_(null, x.fila, c.i + 1));
      });
      Object.keys(grupos).forEach((k) => {
        const g = grupos[k];
        if (g.celdas.length === 1) t.hoja.getRange(g.celdas[0]).setValue(g.v);
        else t.hoja.getRangeList(g.celdas).setValue(g.v);
      });
      return;
    }
    lista.forEach((x) => escribirColumnas_(t.hoja, x.fila, x.columnas.map((c) => ({ i: c.i, valor: valorDe(c) }))));
  }

  /** Borra renglones (de abajo hacia arriba, juntando los seguidos en un deleteRows). → cuántos */
  function borrarFilas(t, filas) {
    const lista = (filas || []).filter((f) => f > 1).sort((a, b) => b - a).filter((f, i, a) => a.indexOf(f) === i);
    if (!lista.length) return 0;
    Candado.con(() => {
      // Lo del lote apunta a números de renglón que el borrado recorre: primero se escribe
      if (lote_) { vaciarLote_(); lote_ = loteNuevo_(); }
      for (let i = 0; i < lista.length;) {
        let cantidad = 1;
        while (i + cantidad < lista.length && lista[i + cantidad] === lista[i] - cantidad) cantidad++;
        if (cantidad === 1) t.hoja.deleteRow(lista[i]);
        else t.hoja.deleteRows(lista[i] - cantidad + 1, cantidad);
        i += cantidad;
      }
    });
    tocarTabla_(t);
    avisar_(t, 'borrar', lista.map((f) => ({ fila: f })));
    return lista.length;
  }

  /**
   * Reescribe el cuerpo completo (renglón 2 en adelante) con `filas` (arreglos u objetos): lo que sobra de antes se
   * vacía. Para lo que se sincroniza de otra fuente (Capital Humano, permisos, correcciones). → cuántas quedaron
   * opciones: { encabezados: [...] (también reescribe el renglón 1 con estos), formato: '@' (antes de escribir, a todo
   * lo que se escribe), ajustarColumnas: true (borra las columnas de la rejilla que pasen de los encabezados) }
   */
  function reemplazarFilas(t, filas, opciones) {
    const o = opciones || {};
    const enc = o.encabezados || t.encabezados;
    const valores = (filas || []).map((f) => (Array.isArray(f) ? f : objectToRow_(enc, f).map((v, i) => celda_(t, enc[i], v))));
    const ancho = Math.max(enc.length, valores.reduce((m, v) => Math.max(m, v.length), 0));
    Candado.con(() => {
      const antes = Math.max(0, t.hoja.getLastRow() - 1);
      const faltan = valores.length + 1 - t.hoja.getMaxRows();
      if (faltan > 0) t.hoja.insertRowsAfter(t.hoja.getMaxRows(), faltan);
      if (o.formato) t.hoja.getRange(1, 1, valores.length + 1, ancho).setNumberFormat(o.formato);
      if (o.encabezados) t.hoja.getRange(1, 1, 1, ancho).setValues([enc.concat(Array(ancho - enc.length).fill(''))]);
      if (valores.length) {
        t.hoja.getRange(2, 1, valores.length, ancho)
          .setValues(valores.map((v) => (v.length < ancho ? v.concat(Array(ancho - v.length).fill('')) : v)));
      }
      if (antes > valores.length) t.hoja.getRange(valores.length + 2, 1, antes - valores.length, ancho).clearContent();
      if (o.ajustarColumnas && t.hoja.getMaxColumns() > ancho) t.hoja.deleteColumns(ancho + 1, t.hoja.getMaxColumns() - ancho);
    });
    if (o.encabezados) t.encabezados = enc.slice();
    tocarTabla_(t);
    avisar_(t, 'reemplazar', [{ filas: valores.length, encabezados: o.encabezados ? enc.slice() : undefined }]);
    return valores.length;
  }

  /** Una columna entera desde el renglón `desde` (2 por omisión): valores = [v, v, …]. La columna, por nombre o { i } */
  function cambiarColumna(t, columna, valores, desde) {
    const i = typeof columna === 'number' ? columna : indiceDeColumnas(t.encabezados, [columna])[columna];
    if (i < 0) throw new Error('La hoja "' + t.nombre + '" no tiene columna "' + columna + '"');
    if (!valores || !valores.length) return 0;
    const inicio = desde || 2;
    Candado.con(() => {
      t.hoja.getRange(inicio, i + 1, valores.length, 1).setValues(valores.map((v) => [celda_(t, t.encabezados[i], v)]));
    });
    tocarTabla_(t);
    avisar_(t, 'columna', [{ columna: claveDeEncabezado_(t.encabezados[i]), desde: inicio, filas: valores.length }]);
    return valores.length;
  }

  // ------------------------------------------------------------ estructura (pestañas y encabezados)

  /**
   * La pestaña con esos encabezados: si no existe se crea al final (encabezados en negritas, renglón 1 fijo); si
   * existe, se le agregan al final los que le falten. opciones: { negritas: false, fijar: false, alCrear(hoja),
   * soloCrear: true (si ya existe no lee sus encabezados: para lo que se escribe muy seguido, como ACCESOS) }.
   * → la hoja
   */
  function asegurarPestana(libro, nombre, encabezados, opciones) {
    const o = opciones || {};
    const ss = typeof libro === 'string' ? abrirSpreadsheet_(libro) : libro;
    let hoja = ss.getSheetByName(nombre);
    if (hoja && o.soloCrear) return hoja;
    if (!hoja) {
      hoja = Candado.con(() => {
        const nueva = ss.getSheetByName(nombre) || ss.insertSheet(nombre, ss.getSheets().length);
        const r = nueva.getRange(1, 1, 1, encabezados.length).setValues([encabezados]);
        if (o.negritas !== false) r.setFontWeight('bold');
        if (o.fijar !== false) nueva.setFrozenRows(1);
        if (o.alCrear) o.alCrear(nueva);
        return nueva;
      });
      const t = tabla(hoja, { encabezados: encabezados });
      tocarTabla_(t);
      avisar_(t, 'estructura', [{ creada: true, columnas: encabezados.slice() }]);
      return hoja;
    }
    asegurarColumnas(tabla(hoja), encabezados, o);
    return hoja;
  }

  /** Agrega al final los encabezados que falten (sin tocar formatos de lo demás). → los que agregó */
  function asegurarColumnas(t, columnas, opciones) {
    const indices = indiceDeColumnas(t.encabezados, columnas);
    const faltan = columnas.filter((c) => indices[c] === -1).filter((c, i, a) => a.indexOf(c) === i);
    if (!faltan.length) return [];
    Candado.con(() => {
      const desde = t.hoja.getLastColumn() + 1;
      const r = t.hoja.getRange(1, desde, 1, faltan.length).setValues([faltan]);
      if (!opciones || opciones.negritas !== false) r.setFontWeight('bold');
    });
    t.encabezados = getHeaders_(t.hoja);
    tocarTabla_(t);
    avisar_(t, 'estructura', [{ columnasNuevas: faltan }]);
    return faltan;
  }

  /** Borra las columnas con esos encabezados (de derecha a izquierda). → las que borró */
  function quitarColumnas(t, columnas) {
    const indices = indiceDeColumnas(t.encabezados, columnas);
    const quitar = columnas.map((c) => indices[c]).filter((i) => i >= 0).sort((a, b) => b - a)
      .filter((i, k, a) => a.indexOf(i) === k);
    if (!quitar.length) return [];
    const quitadas = quitar.map((i) => t.encabezados[i]);
    Candado.con(() => quitar.forEach((i) => t.hoja.deleteColumn(i + 1)));
    t.encabezados = getHeaders_(t.hoja);
    tocarTabla_(t);
    avisar_(t, 'estructura', [{ columnasQuitadas: quitadas }]);
    return quitadas;
  }

  // ------------------------------------------------------------ el lote y la API de Sheets

  // Dentro de enLote, las celdas que van por la API se juntan y salen en una sola llamada al final (cada llamada
  // tarda ~0.7 s; un cambio de equipo de Líneas hacía cuatro o más). Lo que se agrega con SpreadsheetApp sigue al
  // momento. La hoja se marca como cambiada (CacheHojas) hasta que ya se escribió, para que nadie guarde en caché lo
  // de antes con la versión nueva. Vino de LineasDatos (etapa 3, paso 2).
  let lote_ = null;
  const loteNuevo_ = () => ({ libros: {}, respaldo: [], medir: null });

  /**
   * fn con el candado del script (Candado: reentrante); lo escrito por la API adentro se manda junto al salir —
   * también si fn falló: lo que alcanzó a cambiar se escribe, igual que si cada celda fuera al momento.
   */
  function enLote(fn) {
    return Candado.con(() => {
      const propio = !lote_;
      if (propio) lote_ = loteNuevo_();
      let fallo = null;
      try {
        return fn();
      } catch (e) {
        fallo = e;
        throw e;
      } finally {
        try {
          if (propio) vaciarLote_();
        } catch (e) {
          // eslint-disable-next-line no-unsafe-finally -- a propósito: si fn ya falló, gana su error; si no, el de escribir el lote
          if (!fallo) throw e;
          console.warn('enLote: no se pudo escribir el lote después de un error: ' + e.message);
        } finally {
          if (propio) lote_ = null;
          SpreadsheetApp.flush();
        }
      }
    });
  }

  function vaciarLote_() {
    const l = lote_;
    lote_ = null;
    if (!l) return;
    const ids = Object.keys(l.libros).filter((id) => Object.keys(l.libros[id].datos).length);
    if (!ids.length) return;
    const inicio = Date.now();
    let n = 0;
    try {
      ids.forEach((id) => {
        const datos = Object.keys(l.libros[id].datos).map((k) => l.libros[id].datos[k]);
        n += datos.length;
        mandarApi_(id, datos.filter((x) => x.tal).map((x) => x.d), datos.filter((x) => !x.tal).map((x) => x.d));
      });
    } catch (e) {
      if (!marcarApiApagada_(e)) throw e;
      l.respaldo.forEach(([t, lista]) => { escribirConHoja_(t, lista); tocarTabla_(t); });   // sin la API: con SpreadsheetApp
      return;
    }
    ids.forEach((id) => Object.keys(l.libros[id].tablas).forEach((nombre) => tocarTabla_(l.libros[id].tablas[nombre])));
    if (l.medir) l.medir('escribir en lote ' + n + ' celdas', inicio);
  }

  /** Las celdas por la API de Sheets: las de texto tal cual (RAW) y las demás como si se teclearan (fechas) */
  function mandarApi_(libroId, crudos, tecleados) {
    SpreadsheetApp.flush();   // que no queden escrituras de SpreadsheetApp pendientes antes de escribir por la API
    try {
      if (crudos.length) Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'RAW', data: crudos }, libroId);
      if (tecleados.length) Sheets.Spreadsheets.Values.batchUpdate({ valueInputOption: 'USER_ENTERED', data: tecleados }, libroId);
    } catch (e) {
      throw new Error('API de Sheets 403: ' + e.message);
    }
  }

  // Si la API no está habilitada en el proyecto de Google Cloud del script, se recuerda 1 h y se usa SpreadsheetApp
  // (más lento, mismo resultado). La clave es la de antes (era de Líneas): un proyecto que ya la tenía la respeta.
  let apiEncendida_;
  function apiDisponible_() {
    if (apiEncendida_ === undefined) {
      try { apiEncendida_ = CacheService.getScriptCache().get('ln_api_sheets_off') !== '1'; } catch (e) { apiEncendida_ = true; }
    }
    return apiEncendida_ && typeof Sheets !== 'undefined';
  }
  function marcarApiApagada_(error) {
    const m = String(error && error.message);
    if (!/API de Sheets 403/.test(m) || !/SERVICE_DISABLED|has not been used|is disabled/i.test(m)) return false;
    apiEncendida_ = false;
    try { CacheService.getScriptCache().put('ln_api_sheets_off', '1', 3600); } catch (e) { /* sin caché */ }
    return true;
  }

  /** Letra de una columna (1 → A, 27 → AA) */
  function letraColumna(n) {
    let s = '';
    while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
    return s;
  }
  const a1_ = (hoja, fila, col) => (hoja ? "'" + hoja.replace(/'/g, "''") + "'!" : '') + letraColumna(col) + fila;

  // ------------------------------------------------------------ por ID (lo de siempre, encima de las primitivas)

  /** Inserta una fila nueva (con su ID, ver agregarFilas). → el objeto, ya con ID */
  function insert(spreadsheetId, sheetName, obj) {
    agregarFilas(tabla(spreadsheetId, sheetName), [obj]);
    return obj;
  }

  /**
   * Actualiza (merge) una fila existente localizada por ID. Devuelve el registro completo ya mezclado.
   *
   * Bajo el candado, y busca el renglón ADENTRO: si alguien borra un renglón más arriba entre la búsqueda y la
   * escritura, los números se recorren y la escritura caía en OTRO registro, sin error. Y escribe solo las
   * columnas que trae `changes` (cambiarCeldas).
   */
  function update(spreadsheetId, sheetName, id, changes, idColumn) {
    idColumn = idColumn || 'ID';
    return Candado.con(() => {
      const t = tabla(spreadsheetId, sheetName);
      const fila = filaDeId_(t.hoja, t.encabezados, id, idColumn, sheetName);
      if (fila < 0) throw new Error('No se encontró el registro con ID=' + id + ' en "' + sheetName + '"');
      const actual = rowToObject_(t.encabezados, t.hoja.getRange(fila, 1, 1, t.encabezados.length).getValues()[0]);
      cambiarCeldas(t, [{ fila: fila, cambios: changes }]);
      return Object.assign({}, actual, changes);
    });
  }

  /** Elimina físicamente una fila por ID (usar con cuidado; preferir "baja lógica"). Bajo el candado, como update. */
  function remove(spreadsheetId, sheetName, id, idColumn) {
    idColumn = idColumn || 'ID';
    return Candado.con(() => {
      const t = tabla(spreadsheetId, sheetName);
      const fila = filaDeId_(t.hoja, t.encabezados, id, idColumn, sheetName);
      return fila > 0 && borrarFilas(t, [fila]) > 0;
    });
  }

  /**
   * Elimina físicamente varias filas por ID en una sola pasada. Devuelve cuántas borró.
   * Bloquea el script mientras borra: si alguien inserta/borra a la vez, los números
   * de fila cambiarían entre la búsqueda y el borrado.
   */
  function removeMany(spreadsheetId, sheetName, ids, idColumn) {
    idColumn = idColumn || 'ID';
    const buscados = new Set((ids || []).map(String));
    if (!buscados.size) return 0;

    return Candado.con(() => {
      const t = tabla(spreadsheetId, sheetName);
      const idCol = columnaId_(t.encabezados, idColumn, sheetName);
      const lastRow = t.hoja.getLastRow();
      if (lastRow < 2) return 0;
      const filas = t.hoja.getRange(2, idCol + 1, lastRow - 1, 1).getValues()
        .map((v, i) => (buscados.has(String(v[0])) ? i + 2 : null))
        .filter(Boolean);
      return borrarFilas(t, filas);
    });
  }

  /**
   * Encabezado listo para comparar: sin acentos, sin espacios de más y en mayúsculas.
   * En las hojas reales sobran espacios al final ("TIPO ") y hay acentos inconsistentes;
   * comparar en crudo hacía que una columna existente se diera por ausente.
   */
  function normalizarEncabezado_(texto) {
    return String(texto == null ? '' : texto)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  /**
   * Posición de cada columna pedida dentro de los encabezados (-1 si no está).
   * Usar SIEMPRE esto en vez de headers.indexOf(nombre): con la comparación exacta, un
   * espacio de más en la hoja devuelve la columna vacía y nadie se entera.
   * @return {Object} { 'NOMBRE PEDIDO': índice }
   */
  function indiceDeColumnas(encabezados, nombres) {
    const normalizados = (encabezados || []).map(normalizarEncabezado_);
    const mapa = {};
    (nombres || []).forEach((nombre) => {
      mapa[nombre] = normalizados.indexOf(normalizarEncabezado_(nombre));
    });
    return mapa;
  }

  /**
   * Lee solo las columnas pedidas, en el MENOR número de llamadas posible.
   *
   * Cada getValues() es un viaje a Sheets, y es lo que más cuesta (bastante más que traer
   * unas celdas de más). Leer 23 columnas una por una eran 23 viajes; aquí se agrupan las
   * que están juntas en la hoja y los huecos cortos se leen de paso: las 23 de
   * INSPECCION VEHICULAR (1–19, 173–178, 195) quedan en 3 lecturas.
   *
   * @param {Sheet} hoja
   * @param {string[]} columnas nombres de encabezado (tolerante a espacios y acentos)
   * @return {{filas: number, datos: Object}} datos = { 'COLUMNA': [valores] }; [] si no existe
   */
  function leerColumnas(hoja, columnas) {
    const HUECO_MAXIMO = 8;   // leer hasta 8 columnas de sobra sale más barato que otro viaje
    const ultimaFila = hoja.getLastRow();
    const filas = Math.max(0, ultimaFila - 1);
    const datos = {};
    columnas.forEach((nombre) => { datos[nombre] = []; });
    if (!filas) return { filas: 0, datos: datos };

    const indices = indiceDeColumnas(getHeaders_(hoja), columnas);
    const posiciones = columnas.map((c) => indices[c]).filter((i) => i !== -1)
      .sort((a, b) => a - b)
      .filter((i, k, arr) => k === 0 || arr[k - 1] !== i);

    // Bloques contiguos [desde, hasta] (índices base 0)
    const bloques = [];
    posiciones.forEach((i) => {
      const ultimo = bloques[bloques.length - 1];
      if (ultimo && i - ultimo[1] - 1 <= HUECO_MAXIMO) ultimo[1] = i;
      else bloques.push([i, i]);
    });

    bloques.forEach(([desde, hasta]) => {
      const valores = hoja.getRange(2, desde + 1, filas, hasta - desde + 1).getValues();
      columnas.forEach((nombre) => {
        const i = indices[nombre];
        if (i >= desde && i <= hasta) datos[nombre] = valores.map((f) => f[i - desde]);
      });
    });
    return { filas: filas, datos: datos };
  }

  /**
   * Encuentra, dentro de un spreadsheet, la hoja cuyo encabezado (fila 1)
   * contiene TODAS las columnas dadas (por nombre exacto, tolerante a espacios
   * y acentos). Útil cuando no conocemos el nombre real de la pestaña (ej.
   * spreadsheets ajenos, como el de AppSheet) pero sí sabemos qué columnas
   * debe tener.
   *
   * Cachea el nombre de hoja encontrado (CacheService, 6 horas) para no tener
   * que escanear TODAS las pestañas del spreadsheet en cada llamada — en un
   * archivo con ~50 pestañas eso se sentía notablemente lento.
   *
   * Si más de una pestaña comparte esas columnas (ej. una copia/respaldo),
   * se usa la que tiene más filas de datos, asumiendo que la real es la que
   * más se ha usado.
   */
  function getSheetByColumns(spreadsheetId, columnasRequeridas) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'hojaPorColumnas_' + spreadsheetId + '_' + columnasRequeridas.join('|');
    const ss = abrirSpreadsheet_(spreadsheetId);

    const nombreCacheado = cache.get(cacheKey);
    if (nombreCacheado) {
      const hoja = ss.getSheetByName(nombreCacheado);
      if (hoja) return hoja;
      // La hoja cacheada ya no existe (renombrada/eliminada) — se re-escanea abajo.
    }

    const faltantesPorHoja = {};
    const candidatas = ss.getSheets().filter((sheet) => {
      if (sheet.getLastColumn() === 0) return false;
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const indices = indiceDeColumnas(headers, columnasRequeridas);
      const faltantes = columnasRequeridas.filter((col) => indices[col] === -1);
      if (faltantes.length && faltantes.length < columnasRequeridas.length) {
        faltantesPorHoja[sheet.getName()] = faltantes;   // se parece, pero le falta algo
      }
      return faltantes.length === 0;
    });

    if (candidatas.length === 0) {
      // Decir DÓNDE se buscó y qué se encontró: si no, el error obliga a adivinar
      const parecidas = Object.keys(faltantesPorHoja)
        .map((nombre) => '"' + nombre + '" (le faltan: ' + faltantesPorHoja[nombre].join(', ') + ')');
      throw new Error(
        'No se encontró ninguna hoja con las columnas: ' + columnasRequeridas.join(', ') +
        '. Se buscó en "' + ss.getName() + '" (' + ss.getSheets().length + ' hojas)' +
        (parecidas.length ? '. Hojas parecidas: ' + parecidas.join(' · ') : '') + '.'
      );
    }

    const hoja = candidatas.length === 1
      ? candidatas[0]
      : candidatas.sort((a, b) => b.getLastRow() - a.getLastRow())[0];

    cache.put(cacheKey, hoja.getName(), 21600); // 6 horas
    return hoja;
  }

  return {
    getSheet, getSheetByColumns, getAll, leerColumnas,
    // Alias: nombre que ya usan ArqueosService/CajasChicasService/CambiosMontoCCHService/
    // CambiosVehiculosService/ListasService/ReasignacionesVehicularesService/TicketsService/
    // UberService/VehiculosService — misma firma (hoja, columnas).
    leerColumnasDeHoja: leerColumnas,
    findById, insert, update, remove, removeMany,
    indiceDeColumnas, normalizarEncabezado_, objectToRow_,
    // Escribir (28-oct): toda escritura de una hoja pasa por aquí
    tabla, agregarFilas, cambiarCeldas, borrarFilas, reemplazarFilas, cambiarColumna,
    asegurarPestana, asegurarColumnas, quitarColumnas, enLote, letraColumna,
  };
})();
