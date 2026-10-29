/**
 * InspeccionesPlantillasDev.gs — copias de las plantillas de inspección vehicular para experimentar (29-oct).
 *
 * El DEV apuntaba (columna PLANTILLA de MODELOS INSPECCION) a LOS MISMOS documentos que producción: editar una
 * plantilla para probar algo (el N/A, el motor nuevo) cambiaba los PDF de producción al momento. Esto deja al DEV con
 * sus propias copias. Solo corre fuera de producción, desde el editor:
 *
 *   inspeccionesPlantillasACopias()       copia cada plantilla a "PLANTILLAS INSPECCION DEV" (en la raíz del DEV) y
 *                                         apunta la hoja a las copias; guarda los IDs originales. Correrla de nuevo
 *                                         no copia otra vez lo que ya es copia.
 *   inspeccionesPlantillasAOriginales()   regresa la hoja a los IDs originales (las copias se quedan en la carpeta).
 *   inspeccionesDescribirPlantilla('AUTOS')   solo lee: cómo están armadas las tablas de una plantilla.
 *   inspeccionesNA1Ensayo() / NA2EscribirAutos() / NA3EscribirTodas()   la columna N/A en las copias (abajo).
 */

const INSP_DEV_CARPETA = 'PLANTILLAS INSPECCION DEV';
const INSP_DEV_PROP = 'INSPECCIONES_PLANTILLAS_ORIGINALES';

function inspDevNoEnProd_() {
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD') {
    throw new Error('Esto es solo para un DEV: en producción las plantillas no se cambian desde aquí.');
  }
}

/** Lo que la pantalla guardó de cada tipo (la estructura sale de su plantilla): se olvida para leer la nueva. */
function inspDevOlvidar_(tipos) {
  CacheService.getScriptCache().removeAll(tipos.map((t) => 'inspeccion_tipo_v2_' + SheetUtils.normalizarEncabezado_(t)));
}

function inspeccionesPlantillasACopias() {
  soloEditor_();
  inspDevNoEnProd_();
  return Candado.con(() => {
    const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
    const t = SheetUtils.tabla(ssId, 'MODELOS INSPECCION');
    const filas = SheetUtils.getAll(ssId, 'MODELOS INSPECCION');
    const props = PropertiesService.getScriptProperties();
    const originales = JSON.parse(props.getProperty(INSP_DEV_PROP) || '{}');
    const carpeta = DriveUtils.subcarpeta(DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ()), INSP_DEV_CARPETA);
    const lineas = ['PLANTILLAS DE INSPECCIÓN → COPIAS DEL DEV (carpeta "' + INSP_DEV_CARPETA + '")', ''];
    const cambios = [];
    const tipos = [];
    filas.forEach((f, i) => {
      const tipo = String(f['TIPO'] || '').trim();
      const id = String(f['PLANTILLA'] || '').trim();
      if (!tipo || !id) return;
      if (originales[tipo]) { lineas.push('  = ' + tipo + ': ya usa su copia'); return; }
      const original = DriveApp.getFileById(id);
      const copia = DriveUtils.copiar(original, original.getName() + ' (DEV)', carpeta);
      originales[tipo] = id;
      cambios.push({ fila: i + 2, cambios: { PLANTILLA: copia.getId() } });
      tipos.push(tipo);
      lineas.push('  ✔ ' + tipo + ': "' + original.getName() + '" → ' + copia.getId());
    });
    if (cambios.length) {
      // Primero los originales: si la hoja fallara, se sabe a dónde regresar
      props.setProperty(INSP_DEV_PROP, JSON.stringify(originales));
      SheetUtils.cambiarCeldas(t, cambios);
      inspDevOlvidar_(tipos);
    }
    lineas.push('', cambios.length + ' plantillas copiadas. Para regresar: inspeccionesPlantillasAOriginales().');
    const texto = lineas.join('\n');
    Logger.log(texto);
    return texto;
  });
}

function inspeccionesPlantillasAOriginales() {
  soloEditor_();
  inspDevNoEnProd_();
  return Candado.con(() => {
    const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
    const props = PropertiesService.getScriptProperties();
    const originales = JSON.parse(props.getProperty(INSP_DEV_PROP) || '{}');
    const t = SheetUtils.tabla(ssId, 'MODELOS INSPECCION');
    const cambios = [];
    SheetUtils.getAll(ssId, 'MODELOS INSPECCION').forEach((f, i) => {
      const tipo = String(f['TIPO'] || '').trim();
      if (originales[tipo]) cambios.push({ fila: i + 2, cambios: { PLANTILLA: originales[tipo] } });
    });
    SheetUtils.cambiarCeldas(t, cambios);
    inspDevOlvidar_(Object.keys(originales));
    props.deleteProperty(INSP_DEV_PROP);
    const texto = cambios.length + ' tipos de vuelta a su plantilla original (las copias siguen en "' + INSP_DEV_CARPETA + '").';
    Logger.log(texto);
    return texto;
  });
}

/**
 * Solo lee: cada tabla de la plantilla de un tipo (también las que van dentro de una celda), renglón por renglón. En
 * cada celda, su texto; un marcador IF se resume como =OPCION ("=BUENO"), así se ve qué opciones tiene cada pieza.
 * Sin tipo, AUTOS.
 */
function inspeccionesDescribirPlantilla(tipo) {
  soloEditor_();
  tipo = tipo || 'AUTOS';
  const buscado = SheetUtils.normalizarEncabezado_(tipo);
  const fila = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), 'MODELOS INSPECCION')
    .find((f) => SheetUtils.normalizarEncabezado_(f['TIPO']) === buscado);
  if (!fila) throw new Error('No está el tipo "' + tipo + '" en MODELOS INSPECCION.');
  const doc = DocumentApp.openById(String(fila['PLANTILLA']).trim());
  const T = DocumentApp.ElementType;
  const corto = (s) => String(s).replace(/<<IF\(\[[^\]]+\]\s*=\s*"([^"]*)"[^>]*>>/gi, '=$1').replace(/\s+/g, ' ').trim().slice(0, 60);
  const lineas = ['PLANTILLA "' + doc.getName() + '" (' + tipo + ')', ''];
  let tablas = 0;
  function tabla(t, sangria, ruta) {
    tablas++;
    lineas.push(sangria + 'TABLA ' + ruta + ': ' + t.getNumRows() + ' renglones');
    for (let r = 0; r < t.getNumRows(); r++) {
      const renglon = t.getRow(r);
      const celdas = [];
      const dentro = [];
      for (let c = 0; c < renglon.getNumCells(); c++) {
        const celda = renglon.getCell(c);
        let anidadas = 0;
        for (let k = 0; k < celda.getNumChildren(); k++) {
          if (celda.getChild(k).getType() === T.TABLE) dentro.push([celda.getChild(k).asTable(), ruta + '.r' + r + 'c' + c + '.' + (++anidadas)]);
        }
        celdas.push(anidadas ? '{' + anidadas + ' tabla(s)}' : corto(celda.getText()));
      }
      lineas.push(sangria + '  r' + r + ' (' + celdas.length + '): ' + celdas.join(' | '));
      dentro.forEach(([t2, ruta2]) => tabla(t2, sangria + '    ', ruta2));
    }
  }
  const cuerpo = doc.getBody();
  for (let i = 0; i < cuerpo.getNumChildren(); i++) {
    const el = cuerpo.getChild(i);
    if (el.getType() === T.TABLE) tabla(el.asTable(), '', String(i));
  }
  lineas.push('', tablas + ' tablas en total');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- la columna N/A (29-oct)

/**
 * Cada sección del checklist es una tablita: encabezado `Sección N% | Bueno | Regular | Malo` y una pieza por renglón,
 * con un <<IF([PIEZA] = "BUENO", "✓", "")>> por opción. A la que no trae N/A se le agrega la columna: a cada renglón,
 * una COPIA de su última celda (mismo borde, fondo y letra), con "N/A" en el encabezado y la opción "N/A" en la fórmula
 * de cada pieza. El formulario, el PDF y la calificación ya la entienden solos.
 *
 * El ancho total de la tablita NO cambia (va a media página) y el nombre de la pieza se respeta: la columna nueva sale
 * de las opciones, sin que queden más angostas que en las secciones que ya traen N/A (inspDevAnchos_). Una tabla que no
 * tiene esa forma (renglones de distinto número de celdas, una opción que no
 * está al final, dos piezas en un renglón) no se toca: sale en el reporte para hacerla a mano.
 *
 *   inspeccionesNA1Ensayo()          las 18: qué secciones cambiarían y cómo quedan los anchos. No escribe.
 *   inspeccionesNA2EscribirAutos()   solo AUTOS, para revisar su PDF antes que las demás.
 *   inspeccionesNA3EscribirTodas()   las que falten (una sección que ya trae N/A no se vuelve a tocar).
 */
const INSP_NA_NOMBRE_MIN = 0.6;
const INSP_NA_MARCA = /<<IF\(\[([^\]]+)\]\s*=\s*"([^"]*)"/i;

function inspeccionesNA1Ensayo() {
  soloEditor_();
  return inspDevNA_({ escribir: false });
}

function inspeccionesNA2EscribirAutos() {
  soloEditor_();
  return inspDevNA_({ escribir: true, tipos: ['AUTOS'] });
}

function inspeccionesNA3EscribirTodas() {
  soloEditor_();
  return inspDevNA_({ escribir: true });
}

function inspDevNA_(cfg) {
  inspDevNoEnProd_();
  const originales = JSON.parse(PropertiesService.getScriptProperties().getProperty(INSP_DEV_PROP) || '{}');
  const esOriginal = {};
  Object.keys(originales).forEach((t) => { esOriginal[originales[t]] = true; });
  const soloTipos = cfg.tipos && cfg.tipos.map((t) => SheetUtils.normalizarEncabezado_(t));
  const lineas = [(cfg.escribir ? 'AGREGANDO N/A' : 'ENSAYO (no cambia nada)') + ' — plantillas de inspección del DEV', ''];
  const tocados = [];
  const anchosVistos = {};
  SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), 'MODELOS INSPECCION').forEach((f) => {
    const tipo = String(f['TIPO'] || '').trim();
    const id = String(f['PLANTILLA'] || '').trim();
    if (!tipo || !id) return;
    if (soloTipos && soloTipos.indexOf(SheetUtils.normalizarEncabezado_(tipo)) === -1) return;
    // Solo una copia del DEV: nunca el documento que usa producción
    if (!originales[tipo] || esOriginal[id]) {
      lineas.push('  ✘ ' + tipo + ': no usa una copia del DEV (corre inspeccionesPlantillasACopias); no se toca');
      return;
    }
    const doc = DocumentApp.openById(id);
    if (!/\(DEV\)$/.test(doc.getName())) {
      lineas.push('  ✘ ' + tipo + ': "' + doc.getName() + '" no es una copia "(DEV)"; no se toca');
      return;
    }
    const r = { secciones: 0, piezas: 0, yaTraian: 0, opcionesConNA: [], anchos: [], saltadas: [], problemas: [] };
    const tablas = inspDevTablas_(doc.getBody());
    // Primero se miden las secciones que ya traen N/A: el ancho de sus opciones es el mínimo para las nuevas
    tablas.forEach((t) => inspDevNATabla_(t, { medir: true }, r));
    r.minOpcion = r.opcionesConNA.length ? Math.min.apply(null, r.opcionesConNA) : null;
    tablas.forEach((t) => inspDevNATabla_(t, { escribir: cfg.escribir }, r));
    if (cfg.escribir) {
      doc.saveAndClose();
      tocados.push(tipo);
    }
    const aviso = r.saltadas.length || r.problemas.length;
    lineas.push('  ' + (aviso ? '⚠ ' : '✔ ') + tipo + ': ' + r.secciones + ' secciones ' +
      (cfg.escribir ? 'con N/A nuevo' : 'sin N/A') + ' (' + r.piezas + ' piezas) · ' + r.yaTraian + ' ya lo traían' +
      (r.minOpcion ? ' (sus opciones miden desde ' + Math.round(r.minOpcion * 10) / 10 + ' pt)' : ''));
    // Un tipo con los mismos anchos que otro ya reportado no los repite (el registro del editor se corta)
    const firma = r.anchos.join('\n');
    if (firma && anchosVistos[firma]) lineas.push('      anchos: igual que ' + anchosVistos[firma]);
    else {
      if (firma) anchosVistos[firma] = tipo;
      r.anchos.forEach((a) => lineas.push('      ' + a));
    }
    r.saltadas.forEach((s) => lineas.push('      SALTADA ' + s));
    r.problemas.forEach((p) => lineas.push('      REVISAR ' + p));
  });
  if (tocados.length) inspDevOlvidar_(tocados);
  if (!cfg.escribir) lineas.push('', 'Si cuadra: inspeccionesNA2EscribirAutos() y revisa el PDF de una inspección de AUTOS.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Las tablas que no llevan otra tabla adentro (las de acomodo de la página no son secciones), en orden. */
function inspDevTablas_(contenedor) {
  const T = DocumentApp.ElementType;
  const lista = [];
  for (let i = 0; i < contenedor.getNumChildren(); i++) {
    const el = contenedor.getChild(i);
    if (el.getType() !== T.TABLE) continue;
    const tabla = el.asTable();
    let anidadas = false;
    for (let r = 0; r < tabla.getNumRows(); r++) {
      const renglon = tabla.getRow(r);
      for (let c = 0; c < renglon.getNumCells(); c++) {
        const dentro = inspDevTablas_(renglon.getCell(c));
        if (dentro.length) {
          anidadas = true;
          dentro.forEach((x) => lista.push(x));
        }
      }
    }
    if (!anidadas) lista.push(tabla);
  }
  return lista;
}

const inspDevRegex_ = (s) => String(s).replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** modo.medir: solo junta el ancho de las opciones de las secciones que ya traen N/A; si no, cuenta (y con escribir, cambia). */
function inspDevNATabla_(tabla, modo, r) {
  const filas = [];
  for (let i = 0; i < tabla.getNumRows(); i++) {
    const renglon = tabla.getRow(i);
    const marcas = [];
    for (let c = 0; c < renglon.getNumCells(); c++) {
      const m = INSP_NA_MARCA.exec(renglon.getCell(c).getText());
      if (m) marcas.push({ c: c, pieza: m[1].trim(), opcion: m[2].trim() });
    }
    filas.push({ renglon: renglon, celdas: renglon.getNumCells(), marcas: marcas });
  }
  const piezas = filas.filter((f) => f.marcas.length);
  if (!piezas.length) return;   // no es del checklist: datos, firmas, llantas en mm
  const titulo = String(tabla.getRow(0).getCell(0).getText()).replace(/\s+/g, ' ').trim().slice(0, 40);
  if (piezas.some((f) => f.marcas.some((m) => /^N\/?A$/i.test(m.opcion)))) {
    if (!modo.medir) {
      r.yaTraian++;
      return;
    }
    const desde = Math.min.apply(null, piezas.map((f) => f.marcas[0].c));
    for (let c = desde; c < filas[0].celdas; c++) {
      const w = tabla.getColumnWidth(c);
      if (w) r.opcionesConNA.push(w);
    }
    return;
  }
  if (modo.medir) return;
  const n = filas[0].celdas;
  const raro = filas.some((f) => f.celdas !== n) ? 'renglones con distinto número de celdas'
    : piezas.some((f) => f.marcas[f.marcas.length - 1].c !== n - 1) ? 'la última opción no está en la última columna'
      : piezas.some((f) => f.marcas.some((m) => m.pieza !== f.marcas[0].pieza)) ? 'dos piezas en un renglón'
        : '';
  if (raro) {
    r.saltadas.push('"' + titulo + '": ' + raro);
    return;
  }
  r.secciones++;
  r.piezas += piezas.length;

  // Los anchos: el total se queda igual
  const primeraOpcion = Math.min.apply(null, piezas.map((f) => f.marcas[0].c));
  const anchos = [];
  for (let c = 0; c < n; c++) anchos.push(tabla.getColumnWidth(c));
  const nuevos = inspDevAnchos_(anchos, primeraOpcion, r.minOpcion);
  r.anchos.push('"' + titulo + '": ' + nuevos.texto);

  if (!modo.escribir) return;
  const primeraPieza = filas.indexOf(piezas[0]);
  filas.forEach((f, i) => {
    const ultima = f.renglon.getCell(n - 1);
    const nueva = f.renglon.appendTableCell(ultima.copy());
    if (f.marcas.length) {
      const m = f.marcas[f.marcas.length - 1];
      nueva.replaceText('"' + inspDevRegex_(m.opcion) + '"', '"N/A"');
      if (nueva.getText().indexOf('"N/A"') === -1) r.problemas.push('"' + titulo + '" / ' + m.pieza + ': la fórmula nueva no quedó con "N/A"');
      return;
    }
    const texto = ultima.getText().trim();
    if (!texto) return;
    if (i < primeraPieza) nueva.replaceText(inspDevRegex_(texto), 'N/A');   // el encabezado: "Malo" → "N/A"
    else nueva.setText('');
  });
  if (nuevos.anchos) nuevos.anchos.forEach((w, c) => tabla.setColumnWidth(c, w));
}

/**
 * Los anchos con una columna más, sin cambiar el total: { anchos (o null si la tabla no los fija), texto }. El espacio
 * sale primero de las OPCIONES (una palomita no necesita mucho; angostar el nombre lo parte en más renglones y la hoja
 * crece): las opciones, con la nueva, se reparten parejo lo que ya medían, sin bajar de `minOpcion` (lo que miden en las
 * secciones que ya traen N/A; sin ese dato, lo que mide hoy la más angosta). Lo que falte sale de la columna de nombre
 * más ancha, sin bajarla de INSP_NA_NOMBRE_MIN; si ni así alcanza, las opciones quedan por debajo del mínimo (avisa).
 */
function inspDevAnchos_(anchos, primeraOpcion, minOpcion) {
  if (anchos.some((w) => !w)) return { anchos: null, texto: 'anchos automáticos (Docs reparte la columna nueva solo)' };
  const redondo = (w) => Math.round(w * 10) / 10;
  const total = anchos.reduce((a, b) => a + b, 0);
  const opciones = anchos.slice(primeraOpcion);
  const enOpciones = opciones.reduce((a, b) => a + b, 0);
  const n = opciones.length + 1;
  const minimo = minOpcion || Math.min.apply(null, opciones);
  let nombre = 0;
  for (let c = 1; c < primeraOpcion; c++) if (anchos[c] > anchos[nombre]) nombre = c;
  const falta = Math.max(0, minimo * n - enOpciones);
  const cede = Math.min(falta, anchos[nombre] * (1 - INSP_NA_NOMBRE_MIN));
  const cadaOpcion = (enOpciones + cede) / n;
  const resultado = anchos.slice(0, primeraOpcion);
  resultado[nombre] = anchos[nombre] - cede;
  for (let i = 0; i < n; i++) resultado.push(cadaOpcion);
  const fin = resultado.map(redondo);
  const suma = fin.reduce((a, b) => a + b, 0);
  return {
    anchos: fin,
    texto: 'nombre ' + redondo(anchos[nombre]) + '→' + fin[nombre] + ' pt, opciones ' + redondo(Math.min.apply(null, opciones)) +
      '→' + redondo(cadaOpcion) + ' pt (total ' + redondo(total) + ' pt' +
      (cadaOpcion < minimo - 0.05 ? ', OPCIONES MÁS ANGOSTAS QUE ' + redondo(minimo) + ' pt' : '') +
      (Math.abs(suma - total) > 0.5 ? ', NO CUADRA' : '') + ')',
  };
}
