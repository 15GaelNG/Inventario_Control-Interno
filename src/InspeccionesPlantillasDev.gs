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
 *   inspeccionesProbarMotor()             el motor nuevo de plantillas en un Google Docs de verdad (temporal).
 *   inspeccionesConvertir1EnsayoAutos() / 2EscribirAutos() / 3EscribirTodas()   al formato nuevo, con oráculo (abajo).
 *   inspeccionesPdfDePrueba() / inspeccionesPdfDePruebaTodos()   un PDF con datos de ejemplo, sin capturar (abajo).
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
    props.deleteProperty(INSP_DEV_PROP_APPSHEET);   // las convertidas ya no son las del DEV
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

// ---------------------------------------------------------------- convertir al formato nuevo (29-oct)

/**
 * Pasa una copia (DEV) del formato de AppSheet al nuevo (MotorPlantillas), en un documento NUEVO "(DEV NUEVO)": la
 * copia de AppSheet no se toca, así se compara y se puede volver.
 *   1. La columna N/A donde falte (inspDevAgregarNA_, con su regla de anchos).
 *   2. El checklist: cada <<IF([PIEZA] = "BUENO", "✓", "")>> sale de su celda de opción (queda vacía, con su formato) y
 *      la pieza queda como {{PIEZA}} junto a su nombre.
 *   3. <<If:(condición)>> … <<EndIf>> → {{si CAMPO}} … {{fin}}, con CAMPO el calculado que dice lo mismo (las llantas:
 *      LLANTA DD MALO / REGULAR / BUENO, de presentar_ en InspeccionesService). Una condición sin traducción es pendiente.
 *   4. <<[CAMPO]>> y <<CAMPO>> → {{CAMPO}}. Cualquier otra marca << >> es pendiente.
 * Luego se revisa contra el contrato de inspecciones y, con el ORÁCULO, se llenan las dos (la vieja con Plantilla.gs,
 * la nueva con MotorPlantillas) con los mismos datos de prueba y se comparan celda por celda: solo puede cambiar la
 * columna N/A nueva. Con un pendiente, un error o una diferencia, el documento nuevo se tira.
 *
 *   inspeccionesConvertir1EnsayoAutos()    AUTOS en una copia temporal: el reporte, sin dejar nada.
 *   inspeccionesConvertir2EscribirAutos()   AUTOS y, si todo cuadra, el DEV pasa a usar su "(DEV NUEVO)".
 *   inspeccionesConvertir3EscribirTodas()   los que falten, hasta donde alcance el tiempo (córrela otra vez para seguir).
 *   inspeccionesPlantillasAAppSheet()       el DEV de vuelta a sus copias del formato de AppSheet.
 *
 * Diferencia a propósito: las plantillas de AppSheet no imprimían una llanta entre 1.6 y 1.7 mm ni entre 4.0 y 4.1 mm
 * (sus rangos tenían huecos); la nueva usa el mismo semáforo que el puntaje (calificacionLlanta_), sin huecos.
 */
const INSP_DEV_PROP_APPSHEET = 'INSPECCIONES_PLANTILLAS_DEV_APPSHEET';
const INSP_CONV_TIEMPO_MS = 4.5 * 60 * 1000;
const INSP_CONV_OPCION = /^<<IF\(\[([^\]]+)\]\s*=\s*"([^"]*)"\s*,\s*"✓"\s*,\s*""\)>>$/i;

function inspeccionesConvertir1EnsayoAutos() {
  soloEditor_();
  return inspDevConvertir_({ escribir: false, tipos: ['AUTOS'] });
}

function inspeccionesConvertir2EscribirAutos() {
  soloEditor_();
  return inspDevConvertir_({ escribir: true, tipos: ['AUTOS'] });
}

function inspeccionesConvertir3EscribirTodas() {
  soloEditor_();
  return inspDevConvertir_({ escribir: true });
}

/**
 * Apunta MODELOS INSPECCION del DEV a las "(DEV NUEVO)" de la carpeta de pruebas que dejó la herramienta local
 * (node tools/plantillas/plantillas.js convertir …): la de cada tipo es la que se llama como su "(DEV)". Guarda de dónde
 * viene cada una (inspeccionesPlantillasAAppSheet regresa) y olvida la estructura en caché.
 */
function inspeccionesUsarConvertidas() {
  soloEditor_();
  return inspDevUsarConvertidas_();
}

function inspDevUsarConvertidas_() {
  inspDevNoEnProd_();
  return Candado.con(() => {
    const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
    const props = PropertiesService.getScriptProperties();
    const deAppSheet = JSON.parse(props.getProperty(INSP_DEV_PROP_APPSHEET) || '{}');
    const carpeta = DriveUtils.subcarpeta(DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ()), INSP_DEV_CARPETA);
    const nuevas = {};
    const archivos = carpeta.getFiles();
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (/\(DEV NUEVO\)$/.test(f.getName()) && !f.isTrashed()) nuevas[f.getName()] = f.getId();
    }
    const lineas = ['EL DEV A LAS PLANTILLAS CONVERTIDAS', ''];
    const cambios = [];
    const tocados = [];
    SheetUtils.getAll(ssId, 'MODELOS INSPECCION').forEach((f, i) => {
      const tipo = String(f['TIPO'] || '').trim();
      const id = String(f['PLANTILLA'] || '').trim();
      if (!tipo || !id) return;
      // Su copia (DEV): la de la hoja o, si ya usa una convertida, la que se guardó al cambiarla
      const deDev = deAppSheet[tipo] || id;
      const nombre = DriveApp.getFileById(deDev).getName();
      const nueva = /\(DEV\)$/.test(nombre) ? nuevas[nombre.replace(/\(DEV\)$/, '(DEV NUEVO)')] : null;
      if (nueva && nueva === id) {
        lineas.push('  = ' + tipo + ': ya usa su convertida');
        return;
      }
      if (!nueva) {
        lineas.push('  · ' + tipo + ': sin convertida, sigue con "' + DriveApp.getFileById(id).getName() + '"');
        return;
      }
      // Nueva, o una que se rehízo (tools/plantillas convertir --rehacer)
      cambios.push({ fila: i + 2, cambios: { PLANTILLA: nueva } });
      deAppSheet[tipo] = deDev;
      tocados.push(tipo);
      lineas.push('  ✔ ' + tipo + ' → ' + nombre.replace(/\(DEV\)$/, '(DEV NUEVO)'));
    });
    if (cambios.length) {
      // Primero de dónde viene cada una: si la hoja fallara, se sabe a dónde regresar
      props.setProperty(INSP_DEV_PROP_APPSHEET, JSON.stringify(deAppSheet));
      SheetUtils.cambiarCeldas(SheetUtils.tabla(ssId, 'MODELOS INSPECCION'), cambios);
      inspDevOlvidar_(tocados);
    }
    lineas.push('', cambios.length + ' tipos ya usan su plantilla del formato nuevo. Para volver: inspeccionesPlantillasAAppSheet().');
    const texto = lineas.join('\n');
    Logger.log(texto);
    return texto;
  });
}

function inspeccionesPlantillasAAppSheet() {
  soloEditor_();
  inspDevNoEnProd_();
  return Candado.con(() => {
    const props = PropertiesService.getScriptProperties();
    const deAppSheet = JSON.parse(props.getProperty(INSP_DEV_PROP_APPSHEET) || '{}');
    const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
    const cambios = [];
    SheetUtils.getAll(ssId, 'MODELOS INSPECCION').forEach((f, i) => {
      const tipo = String(f['TIPO'] || '').trim();
      if (deAppSheet[tipo]) cambios.push({ fila: i + 2, cambios: { PLANTILLA: deAppSheet[tipo] } });
    });
    SheetUtils.cambiarCeldas(SheetUtils.tabla(ssId, 'MODELOS INSPECCION'), cambios);
    inspDevOlvidar_(Object.keys(deAppSheet));
    props.deleteProperty(INSP_DEV_PROP_APPSHEET);
    const texto = cambios.length + ' tipos de vuelta a su copia del formato de AppSheet (las "(DEV NUEVO)" siguen en "' + INSP_DEV_CARPETA + '").';
    Logger.log(texto);
    return texto;
  });
}

function inspDevConvertir_(cfg) {
  inspDevNoEnProd_();
  const inicio = Date.now();
  const props = PropertiesService.getScriptProperties();
  const originales = JSON.parse(props.getProperty(INSP_DEV_PROP) || '{}');
  const esOriginal = {};
  Object.keys(originales).forEach((t) => { esOriginal[originales[t]] = true; });
  const deAppSheet = JSON.parse(props.getProperty(INSP_DEV_PROP_APPSHEET) || '{}');
  const soloTipos = cfg.tipos && cfg.tipos.map((t) => SheetUtils.normalizarEncabezado_(t));
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const carpeta = DriveUtils.subcarpeta(DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ()), INSP_DEV_CARPETA);
  const contrato = InspeccionesService.contrato_();
  const lineas = [(cfg.escribir ? 'CONVIRTIENDO' : 'ENSAYO (no deja nada)') + ' — plantillas de inspección del DEV al formato nuevo', ''];
  const cambios = [];
  const tocados = [];
  const faltan = [];
  SheetUtils.getAll(ssId, 'MODELOS INSPECCION').forEach((f, i) => {
    const tipo = String(f['TIPO'] || '').trim();
    const id = String(f['PLANTILLA'] || '').trim();
    if (!tipo || !id) return;
    if (soloTipos && soloTipos.indexOf(SheetUtils.normalizarEncabezado_(tipo)) === -1) return;
    if (deAppSheet[tipo]) {
      lineas.push('  = ' + tipo + ': ya usa su plantilla del formato nuevo');
      return;
    }
    if (!originales[tipo] || esOriginal[id]) {
      lineas.push('  ✘ ' + tipo + ': no usa una copia del DEV (corre inspeccionesPlantillasACopias); no se toca');
      return;
    }
    if (Date.now() - inicio > INSP_CONV_TIEMPO_MS) {
      faltan.push(tipo);
      return;
    }
    const viejo = DriveApp.getFileById(id);
    if (!/\(DEV\)$/.test(viejo.getName())) {
      lineas.push('  ✘ ' + tipo + ': "' + viejo.getName() + '" no es una copia "(DEV)"; no se toca');
      return;
    }
    const nuevo = DriveUtils.copiar(viejo, viejo.getName().replace(/\(DEV\)$/, '(DEV NUEVO)'), carpeta, { temporal: !cfg.escribir });
    let seQueda = false;
    try {
      const r = inspDevConvertirDoc_(nuevo.getId(), contrato, tipo);
      const diferencias = r.pendientes.length || r.errores.length ? []
        : inspDevCompararEstructura_(tipo, DocumentApp.openById(id).getBody().getText(), r.arbol, contrato)
          .concat(inspDevOraculo_(id, nuevo.getId(), contrato, carpeta));
      const bien = !r.pendientes.length && !r.errores.length && !diferencias.length;
      lineas.push((bien ? '  ✔ ' : '  ✘ ') + tipo + ': ' + r.piezas + ' piezas, ' + r.bloques + ' bloques y ' + r.valores +
        ' valores convertidos · N/A nuevo en ' + r.na.secciones + ' secciones' +
        (bien ? ' · la estructura y el oráculo dan lo mismo' : ''));
      r.pendientes.slice(0, 15).forEach((x) => lineas.push('      PENDIENTE ' + x));
      r.errores.slice(0, 15).forEach((e) => lineas.push('      ERROR ' + e.donde + ': ' + e.mensaje));
      diferencias.slice(0, 15).forEach((d) => lineas.push('      DIFERENCIA ' + d));
      if (diferencias.length > 15) lineas.push('      … y ' + (diferencias.length - 15) + ' diferencias más');
      if (bien && cfg.escribir) {
        cambios.push({ fila: i + 2, cambios: { PLANTILLA: nuevo.getId() } });
        deAppSheet[tipo] = id;
        tocados.push(tipo);
        seQueda = true;
      }
    } catch (err) {
      lineas.push('  ✘ ' + tipo + ': tronó (' + err.message + ')');
    } finally {
      if (!seQueda) DriveUtils.aPapelera(nuevo, { temporal: true });
    }
  });
  if (cambios.length) {
    Candado.con(() => {
      // Primero de dónde viene cada una: si la hoja fallara, se sabe a dónde regresar
      props.setProperty(INSP_DEV_PROP_APPSHEET, JSON.stringify(deAppSheet));
      SheetUtils.cambiarCeldas(SheetUtils.tabla(ssId, 'MODELOS INSPECCION'), cambios);
    });
    inspDevOlvidar_(tocados);
    lineas.push('', tocados.length + ' tipos ya usan el formato nuevo en el DEV. Para volver: inspeccionesPlantillasAAppSheet().');
  }
  if (faltan.length) lineas.push('', 'Se acabó el tiempo de esta corrida; faltan: ' + faltan.join(', ') + '. Córrela otra vez para seguir.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

/** Todos los elementos de texto (también los de las tablas), como PdfService.textosDe_ */
function inspDevTextos_(el, lista) {
  if (el.getType() === DocumentApp.ElementType.TEXT) {
    lista.push(el.asText());
    return lista;
  }
  if (typeof el.getNumChildren !== 'function') return lista;
  for (let i = 0; i < el.getNumChildren(); i++) inspDevTextos_(el.getChild(i), lista);
  return lista;
}

/** Una condición de AppSheet → el campo calculado que dice lo mismo, o null (pendiente) */
function inspDevCondicion_(condicion) {
  let t = String(condicion).replace(/\s+/g, ' ').trim();
  while (/^\(.*\)$/.test(t)) t = t.slice(1, -1).trim();
  let m = /^\[(LLANTA [A-Z]+)\] ?<= ?1\.6$/.exec(t);
  if (m) return m[1] + ' MALO';
  m = /^AND\(\[(LLANTA [A-Z]+)\] ?>= ?1\.7 ?, ?\[\1\] ?<= ?4(?:\.0)?\)$/.exec(t);
  if (m) return m[1] + ' REGULAR';
  m = /^\[(LLANTA [A-Z]+)\] ?>= ?4\.1$/.exec(t);
  if (m) return m[1] + ' BUENO';
  // El voltaje, con los rangos que ya imprimía el PDF (rangoVoltajePdf_ en InspeccionesService)
  if (/^\[VOLTAJE\] ?<= ?12\.3$/.test(t)) return 'VOLTAJE BAJO';
  if (/^AND\(\[VOLTAJE\] ?>= ?12\.4 ?, ?\[VOLTAJE\] ?<= ?12\.6\)$/.test(t)) return 'VOLTAJE MEDIO';
  if (/^\[VOLTAJE\] ?>= ?12\.7$/.test(t)) return 'VOLTAJE ALTO';
  return null;
}

/** De qué sección es cada pieza hoy (el texto + REAGRUPAR_SECCIONES): { CLAVE DE LA PIEZA: título } */
function inspDevSeccionDePieza_(tipo, texto) {
  const mapa = {};
  InspeccionesService.reagruparSiAplica_(tipo, Plantilla.seccionesDe(texto))
    .forEach((s) => s.campos.forEach((c) => { mapa[MotorPlantillas.clave(c.campo)] = s.titulo; }));
  return mapa;
}

/** ¿La tabla abre con el título de su sección y su peso ("Cristalería 10%")? Si no, es la continuación de otra. */
function inspDevTieneTitulo_(tabla) {
  return /\d\s*%\s*$/.test(tabla.getRow(0).getCell(0).getText().trim());
}

/** Convierte un documento (ya copiado) al formato nuevo. → { piezas, bloques, valores, na, pendientes, errores } */
function inspDevConvertirDoc_(docId, contrato, tipo) {
  const T = DocumentApp.ElementType;
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();
  const seccionDe = inspDevSeccionDePieza_(tipo, body.getText());
  const na = inspDevAgregarNA_(body, true);
  const pendientes = na.saltadas.concat(na.problemas).map((x) => 'N/A: ' + x);
  let piezas = 0;
  let bloques = 0;
  let valores = 0;

  // 1. El checklist: la fórmula sale de cada celda de opción y la marca va junto al nombre de la pieza. Una tabla sin
  //    título (la otra mitad de una sección partida en dos columnas) lleva {{continúa Sección}} en su primera celda.
  inspDevTablas_(body).forEach((tabla) => {
    let continuaVista = inspDevTieneTitulo_(tabla);
    for (let r = 0; r < tabla.getNumRows(); r++) {
      const renglon = tabla.getRow(r);
      const opciones = [];
      for (let c = 0; c < renglon.getNumCells(); c++) {
        const texto = renglon.getCell(c).getText().trim();
        const m = INSP_CONV_OPCION.exec(texto);
        if (m) opciones.push({ c: c, pieza: m[1].trim(), literal: texto });
      }
      if (!opciones.length) continue;
      const pieza = opciones[0].pieza;
      if (opciones.some((o) => o.pieza !== pieza)) {
        pendientes.push('un renglón con dos piezas (' + opciones.map((o) => o.pieza).join(', ') + ')');
        continue;
      }
      if (!continuaVista) {
        continuaVista = true;
        const titulo = seccionDe[MotorPlantillas.clave(pieza)];
        if (!titulo) pendientes.push(pieza + ': su tabla no tiene título y no sé de qué sección es');
        else {
          const c0 = tabla.getRow(0).getCell(0);
          const ultimoC0 = c0.getChild(c0.getNumChildren() - 1);
          (ultimoC0.getType() === T.PARAGRAPH ? ultimoC0.asParagraph() : c0.appendParagraph('')).appendText('{{continúa ' + titulo + '}}');
        }
      }
      let nombre = opciones[0].c - 1;
      while (nombre >= 0 && !renglon.getCell(nombre).getText().trim()) nombre--;
      if (nombre < 0) {
        pendientes.push(pieza + ': su renglón no tiene celda con el nombre');
        continue;
      }
      opciones.forEach((o) => renglon.getCell(o.c).replaceText(inspDevRegex_(o.literal), ''));
      const celda = renglon.getCell(nombre);
      const ultimo = celda.getChild(celda.getNumChildren() - 1);
      const parrafo = ultimo.getType() === T.PARAGRAPH ? ultimo.asParagraph() : celda.appendParagraph('');
      parrafo.appendText(' {{' + pieza + '}}');
      piezas++;
    }
  });

  // 2. Lo demás, texto por texto (reemplazar marca por marca conserva el formato: el color de cada bloque de llanta)
  inspDevTextos_(body, []).forEach((texto) => {
    if (texto.getText().indexOf('<<') === -1) return;
    (texto.getText().match(/<<If:[\s\S]*?>>/gi) || []).forEach((abre) => {
      const campo = inspDevCondicion_(abre.replace(/^<<If:/i, '').replace(/>>$/, ''));
      if (!campo) {
        pendientes.push('una condición sin traducción: ' + abre);
        return;
      }
      texto.replaceText(inspDevRegex_(abre), '{{si ' + campo + '}}');
      bloques++;
    });
    texto.replaceText('<<[Ee][Nn][Dd][Ii][Ff]>>', '{{fin}}');
    (texto.getText().match(/<<\[?[^<>[\]()"*,=]+\]?>>/g) || []).forEach((literal) => {
      texto.replaceText(inspDevRegex_(literal), '{{' + literal.replace(/^<<\[?|\]?>>$/g, '').trim() + '}}');
      valores++;
    });
    (texto.getText().match(/<<[\s\S]*?>>/g) || []).forEach((resto) => pendientes.push('una marca sin traducción: ' + resto.slice(0, 60)));
  });
  doc.saveAndClose();

  const arbol = pendientes.length ? null : MotorPlantillas.analizar(DocumentApp.openById(docId).getBody());
  const errores = arbol ? MotorPlantillas.revisar(arbol, contrato) : [];
  return { piezas: piezas, bloques: bloques, valores: valores, na: na, pendientes: pendientes, errores: errores, arbol: arbol };
}

/**
 * ¿La estructura leída de las tablas (la nueva) es la misma que la de hoy (el texto + REAGRUPAR_SECCIONES)? Por
 * sección (sin importar el orden): el peso, las piezas y sus opciones; la nueva solo puede tener N/A de más.
 * → [diferencias]
 */
function inspDevCompararEstructura_(tipo, textoViejo, arbol, contrato) {
  const k = MotorPlantillas.clave;
  const vieja = InspeccionesService.reagruparSiAplica_(tipo, Plantilla.seccionesDe(textoViejo));
  const nueva = {};
  arbol.secciones.forEach((s) => {
    const piezas = {};
    s.piezas.forEach((p) => {
      const def = MotorPlantillas.definicion(p.campo, contrato);
      if (!def.calculado) piezas[k(def.nombre)] = p.opciones.map(k);
    });
    nueva[k(s.titulo)] = { titulo: s.titulo, peso: s.peso, piezas: piezas, vista: false };
  });
  const diferencias = [];
  vieja.forEach((s) => {
    if (!s.campos.length) return;   // una sección sin piezas tampoco sale en el formulario de hoy
    const n = nueva[k(s.titulo)];
    if (!n) {
      diferencias.push('la sección «' + s.titulo + '» (' + s.campos.length + ' piezas) no está en la nueva');
      return;
    }
    n.vista = true;
    if (n.peso !== s.peso) diferencias.push('«' + s.titulo + '»: peso ' + s.peso + '% → ' + n.peso + '%');
    s.campos.forEach((c) => {
      const ops = n.piezas[k(c.campo)];
      if (!ops) diferencias.push('«' + s.titulo + '»: la pieza ' + c.campo + ' no está en la nueva');
      else {
        const faltan = c.opciones.map(k).filter((o) => ops.indexOf(o) === -1);
        const sobran = ops.filter((o) => c.opciones.map(k).indexOf(o) === -1 && o !== 'N/A');
        if (faltan.length || sobran.length) diferencias.push('«' + s.titulo + '» / ' + c.campo + ': opciones ' + c.opciones.join(',') + ' → ' + ops.join(','));
      }
      delete n.piezas[k(c.campo)];
    });
    Object.keys(n.piezas).forEach((p) => diferencias.push('«' + s.titulo + '»: la pieza ' + p + ' solo está en la nueva'));
  });
  Object.keys(nueva).forEach((t) => {
    if (!nueva[t].vista) diferencias.push('la sección «' + nueva[t].titulo + '» solo está en la nueva');
  });
  return diferencias.map((d) => 'estructura: ' + d);
}

/**
 * Datos de prueba para el oráculo: cada pieza con una opción distinta (rotando, para que la palomita pase por todas las
 * columnas), las llantas repartidas en sus tres rangos, un voltaje y un texto distinto en cada columna. Las imágenes,
 * vacías. `variante` (0, 1, 2) recorre la rotación: entre las tres, cada pieza pasa por sus opciones, cada llanta por sus
 * rangos y el voltaje por los suyos.
 */
function inspDevDatosDePrueba_(viejoId, contrato, variante) {
  const v = variante || 0;
  const datos = {};
  Object.keys(contrato.campos).forEach((campo, i) => {
    const def = contrato.campos[campo];
    if (typeof def === 'object' && def.calculado) return;
    datos[campo] = def === 'imagen' ? '' : 'V' + i;
  });
  Plantilla.seccionesDe(DocumentApp.openById(viejoId).getBody().getText())
    .forEach((s) => s.campos.forEach((c, k) => { datos[c.campo] = c.opciones[(k + v) % c.opciones.length]; }));
  Object.keys(contrato.campos).filter((k) => / ESTADO$/.test(k))
    .forEach((k, i) => { datos[k.replace(/ ESTADO$/, '')] = ['1.4', '3.2', '5'][(i + v) % 3]; });
  datos['VOLTAJE'] = ['12', '12.5', '13'][v % 3];
  return datos;
}

/**
 * EL ORÁCULO: llena una copia de la vieja (Plantilla.gs) y una de la nueva (MotorPlantillas) con los mismos datos y las
 * compara: cada celda de cada tabla de sección y cada párrafo fuera de ellas. Una celda de más en la nueva solo puede
 * ser la columna N/A (vacía, o "N/A" en el encabezado). Con `variantes` (3 por omisión) lo repite con otros datos de
 * prueba (inspDevDatosDePrueba_). → [diferencias]
 */
function inspDevOraculo_(viejoId, nuevoId, contrato, carpeta, variantes) {
  const diferencias = [];
  for (let v = 0; v < (variantes || 3); v++) {
    const datos = inspDevDatosDePrueba_(viejoId, contrato, v);
    const a = DriveUtils.copiar(DriveApp.getFileById(viejoId), 'ORÁCULO (se borra) viejo', carpeta, { temporal: true });
    const b = DriveUtils.copiar(DriveApp.getFileById(nuevoId), 'ORÁCULO (se borra) nuevo', carpeta, { temporal: true });
    try {
      PdfService.llenarCopia_(a.getId(), { datos: datos });
      PdfService.llenarCopia_(b.getId(), { datos: InspeccionesService.presentar_(datos), contrato: contrato });
      inspDevComparar_(DocumentApp.openById(a.getId()).getBody(), DocumentApp.openById(b.getId()).getBody())
        .forEach((d) => diferencias.push('datos ' + (v + 1) + ': ' + d));
    } finally {
      DriveUtils.aPapelera(a, { temporal: true });
      DriveUtils.aPapelera(b, { temporal: true });
    }
    if (diferencias.length) break;   // con unas basta para verlas
  }
  return diferencias;
}

/** Las diferencias entre dos documentos llenos (ver inspDevOraculo_) */
function inspDevComparar_(viejo, nuevo) {
  const limpio = (s) => String(s).replace(/\s+/g, ' ').trim();
  const diferencias = [];
  const ta = inspDevTablas_(viejo);
  const tb = inspDevTablas_(nuevo);
  if (ta.length !== tb.length) diferencias.push(ta.length + ' tablas en la vieja y ' + tb.length + ' en la nueva');
  ta.forEach((t, k) => {
    const u = tb[k];
    if (!u) return;
    const titulo = limpio(t.getRow(0).getCell(0).getText()).slice(0, 30) || ('tabla ' + (k + 1));
    if (t.getNumRows() !== u.getNumRows()) diferencias.push('«' + titulo + '»: renglones ' + t.getNumRows() + ' → ' + u.getNumRows());
    for (let r = 0; r < Math.min(t.getNumRows(), u.getNumRows()); r++) {
      const x = t.getRow(r);
      const y = u.getRow(r);
      for (let c = 0; c < Math.max(x.getNumCells(), y.getNumCells()); c++) {
        const va = c < x.getNumCells() ? limpio(x.getCell(c).getText()) : null;
        const vb = c < y.getNumCells() ? limpio(y.getCell(c).getText()) : null;
        if (va === null && (vb === '' || vb === 'N/A')) continue;   // la columna N/A nueva
        if (va !== vb) diferencias.push('«' + titulo + '», renglón ' + (r + 1) + ', celda ' + (c + 1) + ': «' + va + '» → «' + vb + '»');
      }
    }
  });
  const pa = inspDevParrafos_(viejo, []);
  const pb = inspDevParrafos_(nuevo, []);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if (limpio(pa[i] || '') !== limpio(pb[i] || '')) diferencias.push('párrafo ' + (i + 1) + ': «' + limpio(pa[i] || '').slice(0, 60) + '» → «' + limpio(pb[i] || '').slice(0, 60) + '»');
  }
  return diferencias;
}

/** Los párrafos con texto fuera de las tablas de sección (las de acomodo sí se recorren) */
function inspDevParrafos_(el, lista) {
  const T = DocumentApp.ElementType;
  const tipo = el.getType();
  if (tipo === T.PARAGRAPH || tipo === T.LIST_ITEM) {
    if (el.getText().trim()) lista.push(el.getText());
    return lista;
  }
  if (tipo === T.TABLE && inspDevTablas_({ getNumChildren: () => 1, getChild: () => el }).indexOf(el) !== -1) return lista;
  if (typeof el.getNumChildren !== 'function') return lista;
  for (let i = 0; i < el.getNumChildren(); i++) inspDevParrafos_(el.getChild(i), lista);
  return lista;
}

// ---------------------------------------------------------------- el motor nuevo contra Google Docs de verdad (29-oct)

/**
 * Las pruebas de MotorPlantillas corren contra un Docs simulado; esto lo comprueba en Google Docs: crea un documento
 * temporal en la raíz del DEV con datos, un checklist en el acomodo a dos columnas y llantas, lo revisa, lo llena, lo
 * vuelve a abrir y compara cada celda (también que el formato de una marca pase a su valor y que $ o \ en un valor
 * lleguen tal cual: replaceText de Docs usa RE2). Al final lo manda a la papelera. Solo lee y escribe ese documento.
 */
function inspeccionesProbarMotor() {
  soloEditor_();
  inspDevNoEnProd_();
  const resultado = [];
  const ok = (cond, texto) => resultado.push((cond ? '  ✔ ' : '  ✘ ') + texto);
  const archivo = DriveUtils.crearConApi({ name: 'PRUEBA MOTOR DE PLANTILLAS (se borra sola)', mimeType: 'application/vnd.google-apps.document',
    parents: [Config.DRIVE_FOLDERS.RAIZ()] }, null, { supportsAllDrives: true }, { temporal: true });
  try {
    let doc = DocumentApp.openById(archivo.id);
    let body = doc.getBody();
    const p1 = body.appendParagraph('Placas: {{PLACAS}} · otra vez {{ placas }} · quien: {{RESPONSABLE}}');
    p1.editAsText().setBold(8, 17, true);   // "{{PLACAS}}" en negritas: su valor debe quedar en negritas
    body.appendParagraph('{{si OBSERVACIONES}}Obs: {{OBSERVACIONES}}{{fin}}|{{si VACIO}}no sale{{fin}}');
    const acomodo = body.appendTable([['', '']]);
    acomodo.getCell(0, 0).appendTable([
      ['Cristalería 10%', 'Bueno', 'Regular', 'Malo', 'N/A'],
      ['Parabrisas {{PARABRISAS}}', '', '', '', ''],
      ['Medallón {{MEDALLÓN}}', '', '', '', ''],
    ]);
    acomodo.getCell(0, 1).appendTable([
      ['Neumáticos 15%', 'Bueno', 'Regular', 'Malo'],
      ['Delantera derecha {{LLANTA DD ESTADO}}', '', '', ''],
    ]);
    const contrato = { campos: {
      PLACAS: 'texto', RESPONSABLE: 'texto', OBSERVACIONES: 'texto', VACIO: 'texto', PARABRISAS: 'opcion', MEDALLON: 'opcion',
      'LLANTA DD': 'numero', 'LLANTA DD ESTADO': { tipo: 'opcion', marca: 'LLANTA DD' },
    } };

    const arbol = MotorPlantillas.analizar(body);
    const errores = MotorPlantillas.revisar(arbol, contrato);
    ok(errores.length === 0, 'la plantilla se revisa sin errores' + (errores.length ? ':\n' + MotorPlantillas.textoErrores(errores) : ''));
    ok(arbol.secciones.map((s) => s.titulo + ' ' + s.peso + ' [' + s.opciones.join(',') + ']').join(' | ') ===
      'Cristalería 10 [Bueno,Regular,Malo,N/A] | Neumáticos 15 [Bueno,Regular,Malo]', 'las secciones salen de las tablas anidadas');

    const r = MotorPlantillas.llenar(body, {
      PLACAS: 'AB-1 $1', RESPONSABLE: 'Ana \\ Pérez', OBSERVACIONES: 'Todo bien', VACIO: '',
      PARABRISAS: 'BUENO', MEDALLON: 'n/a', 'LLANTA DD': '3.2', 'LLANTA DD ESTADO': 'REGULAR',
    }, contrato);
    doc.saveAndClose();

    doc = DocumentApp.openById(archivo.id);
    body = doc.getBody();
    const parrafos = [];
    for (let i = 0; i < body.getNumChildren(); i++) {
      const el = body.getChild(i);
      if (el.getType() === DocumentApp.ElementType.PARAGRAPH && el.asParagraph().getText()) parrafos.push(el.asParagraph());
    }
    ok(parrafos[0] && parrafos[0].getText() === 'Placas: AB-1 $1 · otra vez AB-1 $1 · quien: Ana \\ Pérez',
      'valores (la misma marca dos veces, con espacios dentro, y $ y \\ tal cual): «' + (parrafos[0] && parrafos[0].getText()) + '»');
    ok(parrafos[0] && parrafos[0].editAsText().isBold(8) === true && parrafos[0].editAsText().isBold(20) !== true,
      'el formato de la marca (negritas) pasa a su valor; lo demás, igual');
    ok(parrafos[1] && parrafos[1].getText() === 'Obs: Todo bien|', 'el bloque con valor sale y el vacío no: «' + (parrafos[1] && parrafos[1].getText()) + '»');
    const tablaDe = (c) => body.getTables()[0].getCell(0, c).getChild(1).asTable();
    const fila = (t, r2) => { const x = []; for (let c = 0; c < t.getRow(r2).getNumCells(); c++) x.push(t.getCell(r2, c).getText()); return x.join('|'); };
    ok(fila(tablaDe(0), 1) === 'Parabrisas|✓|||', 'la palomita en su columna y la marca borrada: «' + fila(tablaDe(0), 1) + '»');
    ok(fila(tablaDe(0), 2) === 'Medallón||||✓', 'el valor se compara sin mayúsculas (n/a → N/A): «' + fila(tablaDe(0), 2) + '»');
    ok(fila(tablaDe(1), 1) === 'Delantera derecha||3.2|', 'la llanta: sus mm en la columna de su estado: «' + fila(tablaDe(1), 1) + '»');
    ok(r.sinResolver.length === 0, 'sin pendientes');
    ok(!/\{\{/.test(body.getText()), 'no quedó ninguna marca en el documento');
    doc.saveAndClose();
  } catch (err) {
    resultado.push('  ✘ tronó: ' + err.message);
  } finally {
    DriveUtils.aPapelera(DriveApp.getFileById(archivo.id), { temporal: true });
  }
  const texto = ['MOTOR DE PLANTILLAS EN GOOGLE DOCS', ''].concat(resultado,
    ['', resultado.some((x) => /✘/.test(x)) ? 'HAY FALLAS: pégalas en el chat.' : 'TODO OK']).join('\n');
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
    const r = inspDevAgregarNA_(doc.getBody(), cfg.escribir);
    if (cfg.escribir) {
      doc.saveAndClose();
      tocados.push(tipo);
    }
    const aviso = r.saltadas.length || r.problemas.length;
    lineas.push('  ' + (aviso ? '⚠ ' : '✔ ') + tipo + ': ' + r.secciones + ' secciones ' +
      (cfg.escribir ? 'con N/A nuevo' : 'sin N/A') + ' (' + r.piezas + ' piezas) · ' + r.yaTraian + ' ya lo traían' +
      (r.ajustadas ? ' · ' + r.ajustadas + ' se salían de su columna' : ''));
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

/** La columna N/A en las secciones de un documento (del formato de AppSheet) que no la traen, y las que ya la traen
 * pero se salen de su columna de la página (el PDF las recorta). → el reporte { secciones, ajustadas, … } */
function inspDevAgregarNA_(body, escribir) {
  const r = { secciones: 0, piezas: 0, yaTraian: 0, ajustadas: 0, anchos: [], saltadas: [], problemas: [] };
  inspDevTablas_(body).forEach((t) => inspDevNATabla_(t, { escribir: escribir }, r));
  return r;
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

/** Modo para inspDevNATabla_: `escribir` cambia el documento; sin él solo cuenta y reporta. */
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
  const n = filas[0].celdas;
  const primeraOpcion = Math.min.apply(null, piezas.map((f) => f.marcas[0].c));
  const primeraPieza = filas.indexOf(piezas[0]);
  const anchos = [];
  for (let c = 0; c < n; c++) anchos.push(tabla.getColumnWidth(c));
  // El encabezado (el renglón antes de la primera pieza con texto en la última columna) y los nombres de las piezas
  const encabezado = filas.slice(0, primeraPieza).reverse().find((f) => f.celdas === n && String(f.renglon.getCell(n - 1).getText()).trim());
  const etiquetas = [];
  for (let c = primeraOpcion; encabezado && c < n; c++) etiquetas.push(String(encabezado.renglon.getCell(c).getText()).trim());
  const nombres = piezas.map((f) => {
    let c = f.marcas[0].c - 1;
    while (c >= 0 && !String(f.renglon.getCell(c).getText()).trim()) c--;
    return c >= 0 ? String(f.renglon.getCell(c).getText()).trim() : '';
  });
  const contenedor = inspDevAnchoContenedor_(tabla);

  if (piezas.some((f) => f.marcas.some((m) => /^N\/?A$/i.test(m.opcion)))) {
    r.yaTraian++;
    // Ya trae N/A; solo si se sale de su columna de la página (el PDF la recorta) se acomoda dentro
    const total = anchos.reduce((a, b) => a + (b || 0), 0);
    if (!contenedor || !etiquetas.length || anchos.some((w) => !w) || total <= contenedor + 0.5) return;
    const ajuste = inspDevAnchos_(anchos, primeraOpcion, etiquetas, nombres, contenedor);
    r.ajustadas++;
    r.anchos.push('"' + titulo + '" (ya traía N/A; se salía de su columna): ' + ajuste.texto);
    if (modo.escribir && ajuste.anchos) ajuste.anchos.forEach((w, c) => tabla.setColumnWidth(c, w));
    return;
  }
  const raro = filas.some((f) => f.celdas !== n) ? 'renglones con distinto número de celdas'
    : piezas.some((f) => f.marcas[f.marcas.length - 1].c !== n - 1) ? 'la última opción no está en la última columna'
      : piezas.some((f) => f.marcas.some((m) => m.pieza !== f.marcas[0].pieza)) ? 'dos piezas en un renglón'
        : !encabezado ? 'no encontré el renglón de encabezado' : '';
  if (raro) {
    r.saltadas.push('"' + titulo + '": ' + raro);
    return;
  }
  r.secciones++;
  r.piezas += piezas.length;
  const nuevos = inspDevAnchos_(anchos, primeraOpcion, etiquetas.concat(['N/A']), nombres, contenedor);
  r.anchos.push('"' + titulo + '": ' + nuevos.texto);

  if (!modo.escribir) return;
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
 * Ancho (pt) de un texto en el PDF: PdfService lo exporta en Arial (FORMATO_PDF) y los encabezados y nombres van a 6.5 pt
 * en negritas. Medidas de Arial/Helvetica negrita (milésimas de em), las mismas de cualquier PDF; lo que no está en la
 * tabla cuenta como una letra ancha. Con el relleno de Docs (5 pt por lado) explica lo que se vio el 29-oct: «Bueno»
 * (20.2 pt + 10) se partía en 27 pt y «Regular» (24.2 + 10) cabía en 35.
 */
const INSP_ARIAL_NEGRITA = {
  ' ': 278, '/': 278, '.': 278, ',': 278, '-': 333, '%': 889, '(': 333, ')': 333, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556,
  '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, A: 722, B: 722, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 556,
  K: 722, L: 611, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611,
  q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500,
};
/** Arial/Helvetica de peso normal: los nombres de las piezas (los encabezados van en negritas) */
const INSP_ARIAL = {
  ' ': 278, '/': 278, '.': 278, ',': 278, '-': 333, '%': 889, '(': 333, ')': 333, '0': 556, '1': 556, '2': 556, '3': 556, '4': 556,
  '5': 556, '6': 556, '7': 556, '8': 556, '9': 556, A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500,
  K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611,
  a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556,
  q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500,
};
const INSP_LETRA_PT = 6.5;
// El relleno de una celda más holgura, medido en los PDF del 29-oct: «Regular» (24.2 pt de texto) se partía en 34.7 pt y
// cabía en 35; «Bueno» (20.2) se partía en 27.3 y cabía en 30.7. Con 11.5, «Regular» pide 35.7.
const INSP_RELLENO_PT = 11.5;

/** Ancho (pt) de un texto a 6.5 pt en Arial: en negritas (encabezados, por omisión) o normal (los nombres de las piezas) */
function inspDevAnchoTexto_(texto, normal) {
  const medidas = normal ? INSP_ARIAL : INSP_ARIAL_NEGRITA;
  const limpio = String(texto || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  let milesimas = 0;
  for (const letra of limpio) milesimas += medidas[letra] || 722;
  return milesimas / 1000 * INSP_LETRA_PT;
}

/**
 * El ancho útil (pt) de la celda del acomodo de la página que contiene a la tabla, o null. En la herramienta local el
 * modelo lo trae (`_contenedor`); en Apps Script se suma el ancho de las columnas que abarca la celda.
 */
function inspDevAnchoContenedor_(tabla) {
  if (tabla._contenedor !== undefined) return tabla._contenedor;
  try {
    const celda = tabla.getParent();
    if (!celda || celda.getType() !== DocumentApp.ElementType.TABLE_CELL) return null;
    const renglon = celda.asTableCell().getParentRow();
    const acomodo = renglon.getParentTable();
    let inicio = 0;
    for (let c = 0; c < renglon.getChildIndex(celda); c++) inicio += Math.max(1, renglon.getCell(c).getColSpan() || 1);
    let ancho = 0;
    for (let c = inicio; c < inicio + Math.max(1, celda.asTableCell().getColSpan() || 1); c++) ancho += acomodo.getColumnWidth(c) || 0;
    return ancho || null;
  } catch (e) {
    return null;
  }
}

/**
 * Los anchos de una sección: { anchos (o null si la tabla no los fija), texto }. Las opciones son las de `etiquetas`
 * (con la N/A nueva, si se agrega: una más que las columnas de opción de `anchos`). El total es el de hoy, salvo que la tabla se
 * salga de su columna de la página (`contenedor`): entonces el de la columna; y si con el de hoy no cabe lo que necesita,
 * crece lo justo dentro de su columna (Latonería mide 248.5 en una columna de 280).
 *   - Cada opción necesita lo que mide su encabezado (inspDevAnchoTexto_ + relleno); el nombre, lo que mide su pieza
 *     más larga. Así nunca se parte un «Bueno» ni un nombre.
 *   - Si alcanza, las opciones van parejas (todas lo que necesita la más ancha) y el nombre se queda con lo que mide hoy
 *     o con lo que sobra; si no, el nombre baja hasta lo que necesita y las opciones se reparten lo demás sin bajar de lo
 *     suyo. Si ni así cabe, se dice (NO CABE) y se aprietan las opciones en proporción.
 */
function inspDevAnchos_(anchos, primeraOpcion, etiquetas, nombres, contenedor) {
  if (anchos.some((w) => !w)) {
    return { anchos: null, texto: 'anchos automáticos (Docs reparte la columna nueva solo)' };
  }
  const suma = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
  const redondo = (w) => Math.round(w * 10) / 10;
  const total = suma(anchos);
  let nombre = 0;
  for (let c = 1; c < primeraOpcion; c++) if (anchos[c] > anchos[nombre]) nombre = c;
  const fijas = suma(anchos.slice(0, primeraOpcion)) - anchos[nombre];
  const n = etiquetas.length;
  const necesita = etiquetas.map((e) => inspDevAnchoTexto_(e) + INSP_RELLENO_PT);
  // Un nombre que hoy cabe en un renglón no se parte; uno que ya ocupa varios ("Guardafango/salpicadera posterior
  // izquierda") puede angostarse mientras no necesite MÁS renglones (con 5 pt de holgura y sin partir una palabra)
  const util = anchos[nombre] - INSP_RELLENO_PT;
  const nombreNecesita = Math.max.apply(null, [0].concat(nombres.map((t) => {
    const ancho = inspDevAnchoTexto_(t, true);
    if (ancho <= util) return ancho + INSP_RELLENO_PT;
    const renglones = Math.ceil(ancho / util);
    const palabra = Math.max.apply(null, String(t).split(/[\s/]+/).map((p) => inspDevAnchoTexto_(p, true)));
    return Math.max(ancho / renglones + 5, palabra) + INSP_RELLENO_PT;
  })));
  // El total: el de hoy; si así no cabe, crece lo justo sin pasar de su columna de la página; si ya se salía, el de su columna
  const minimo = fijas + nombreNecesita + suma(necesita);
  const objetivo = contenedor ? Math.min(contenedor, Math.max(total, minimo)) : total;
  const disponible = objetivo - fijas;
  const pareja = Math.max.apply(null, necesita);
  let wNombre;
  let opciones;
  let apretado = false;
  if (disponible - n * pareja >= nombreNecesita) {
    wNombre = Math.min(anchos[nombre], disponible - n * pareja);
    opciones = necesita.map(() => (disponible - wNombre) / n);
  } else {
    wNombre = Math.min(anchos[nombre], Math.max(nombreNecesita, disponible - suma(necesita)));
    const resto = disponible - wNombre;
    if (resto < suma(necesita) - 0.05) {
      apretado = true;
      opciones = necesita.map((x) => x * resto / suma(necesita));
    } else {
      // Al mismo nivel L las que necesitan menos; las que necesitan más, lo suyo
      let nivel = resto / n;
      for (let i = 0; i < n; i++) {
        const grandes = necesita.filter((x) => x > nivel);
        nivel = (resto - suma(grandes)) / (n - grandes.length);
      }
      opciones = necesita.map((x) => Math.max(x, nivel));
    }
  }
  const resultado = anchos.slice(0, primeraOpcion);
  resultado[nombre] = wNombre;
  const fin = resultado.concat(opciones).map(redondo);
  const antes = anchos.slice(primeraOpcion).filter((w) => w);
  return {
    anchos: fin,
    texto: 'nombre ' + redondo(anchos[nombre]) + '→' + fin[nombre] + ' pt, opciones ' +
      redondo(Math.min.apply(null, antes)) + '–' + redondo(Math.max.apply(null, antes)) + '→' +
      redondo(Math.min.apply(null, opciones)) + '–' + redondo(Math.max.apply(null, opciones)) + ' pt (total ' + redondo(total) +
      (redondo(suma(fin)) !== redondo(total) ? '→' + redondo(suma(fin)) : '') + ' pt' +
      (contenedor && total > contenedor + 0.5 ? ', su columna mide ' + redondo(contenedor) : '') +
      (apretado ? ', NO CABE: las opciones quedan más angostas que su texto' : '') + ')',
  };
}

// ---------------------------------------------------------------- PDF de prueba (29-oct)

/**
 * Un PDF por tipo con datos de ejemplo, para ver cómo sale una plantilla SIN capturar ni guardar ninguna inspección: por
 * el mismo camino que la app (InspeccionesService.pdfDePrueba_: su plantilla, letra, márgenes, diagramas y firmas). Cada
 * pieza va en una opción distinta (rotando), para que haya palomitas en todas las columnas, también la N/A; las llantas
 * y el voltaje caen en sus distintos rangos.
 *
 *   inspeccionesPdfDePrueba()        el de INSP_PDF_PRUEBA_TIPO (lo rehace), y el mismo con la plantilla de antes de
 *                                    convertirla: "PRUEBA <TIPO> (antes)", para comparar
 *   inspeccionesPdfDePruebaTodos()   todos los tipos, hasta donde alcance el tiempo (córrela otra vez: salta los que ya
 *                                    tienen el suyo)
 * Quedan en "PLANTILLAS INSPECCION DEV/PDF DE PRUEBA" como "PRUEBA <TIPO>.pdf". No escribe en ninguna hoja.
 */
const INSP_PDF_PRUEBA_TIPO = 'RAM 700';
const INSP_PDF_PRUEBA_CARPETA = 'PDF DE PRUEBA';
/** Una firma de ejemplo (200 × 80, un trazo azul): con ella el PDF ocupa lo mismo que uno firmado */
const INSP_FIRMA_PRUEBA = 'iVBORw0KGgoAAAANSUhEUgAAAMgAAABQCAYAAABcbTqwAAABLElEQVR42u3c2xGCMBRF0VRCYVZsV2oJzCTBc3PXmvFXIbBNwMcYAAAAAAAAAAAAAAAAAAAAAMAe1+v9ufMwUohCLAhj3cOI0noZJRTah7HquYw2x8SxMzojT+lZIz1AKDdriARxbHhtR4XoOLptA0QvcSy5EIfZBEsqkSAO24o4bDPisO3MHhAX4yIRwmFf2T7ttqlIikThLpD9EkbRWDp82CaSP4SxMzZx2NeScSRH6GSx3+XDmJlZKu+nJZcwYmPxG2+zyVEDNHuR759CRNJmmdHlFrPzwTtGRCxyCA8ldX3voDIS/pcr6ffLTiBWztblbq8JgydDKXPiWnZQfjm748WEQbvpK/6iChIviISBUEQB62IxagAAAAAAAAAAAAAAAAAAAAAAAPx8AT+C6kcTQv+GAAAAAElFTkSuQmCC';

function inspeccionesPdfDePrueba() {
  soloEditor_();
  return inspDevPdfDePrueba_([INSP_PDF_PRUEBA_TIPO], true, true);
}

function inspeccionesPdfDePruebaTodos() {
  soloEditor_();
  return inspDevPdfDePrueba_(null, false);
}

/** Los datos de ejemplo de un tipo: lo de la ficha, cada pieza en una opción distinta, llantas y voltaje, y el puntaje */
function inspDevDatosEjemplo_(tipo) {
  const e = InspeccionesService.estructura_(tipo);
  const datos = {
    FECHA: new Date(), RESPONSABLE: 'RESPONSABLE DE PRUEBA', DEPARTAMENTO: 'DEPARTAMENTO DE PRUEBA', AREA: 'ÁREA DE PRUEBA',
    SEDE: 'SEDE', 'OFICINA / DESARROLLO': 'OFICINA', CONDUCTOR: 'CONDUCTOR DE PRUEBA', 'JEFE DIRECTO': 'JEFE DE PRUEBA',
    NUCO: '0000', VEHICULO: tipo, 'NO SERIE': 'SERIE DE PRUEBA', 'MODELO / AÑO': '2024', PLACAS: 'ABC-123',
    'FECHA ULTIMO SERVICIO': new Date(), HOLOGRAMA: '0', 'TIPO COMBUSTIBLE': 'GASOLINA', VOLTAJE: '12.5',
    OBSERVACIONES: 'PDF de prueba: cada pieza va en una opción distinta para ver todas las columnas.',
    'NOMBRE INSPECTOR': 'INSPECTOR DE PRUEBA',
  };
  const checklist = {};
  let k = 0;
  e.secciones.forEach((s) => s.campos.forEach((c) => { checklist[c.campo] = c.opciones[k++ % c.opciones.length]; }));
  e.llantas.forEach((l, i) => { datos[l.campo] = ['1.4', '3.2', '5.5', '7'][i % 4]; });
  datos['PUNTAJE FINAL INSPECCION'] = InspeccionesService.calcularPuntaje_(e.secciones, checklist).final.toFixed(2) + '%';
  return Object.assign(datos, checklist);
}

/**
 * Los PDF de prueba de unos tipos (todos, sin `tipos`). Primero apunta el DEV a las convertidas más recientes
 * (inspDevUsarConvertidas_: tras un `convertir --rehacer` no hay que correr nada más). Con `antes`, también el mismo PDF
 * con la plantilla de antes de convertirla ("PRUEBA <TIPO> (antes)"), para compararlos.
 */
function inspDevPdfDePrueba_(tipos, rehacer, antes) {
  inspDevNoEnProd_();
  inspDevUsarConvertidas_();
  const deAppSheet = JSON.parse(PropertiesService.getScriptProperties().getProperty(INSP_DEV_PROP_APPSHEET) || '{}');
  const inicio = Date.now();
  const norm = (t) => SheetUtils.normalizarEncabezado_(t);
  const carpeta = DriveUtils.subcarpeta(DriveUtils.subcarpeta(DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ()), INSP_DEV_CARPETA), INSP_PDF_PRUEBA_CARPETA);
  const todos = SheetUtils.getAll(Config.SPREADSHEET_IDS.VEHICULOS(), 'MODELOS INSPECCION').map((f) => String(f['TIPO'] || '').trim()).filter(Boolean);
  const elegidos = tipos ? todos.filter((t) => tipos.map(norm).indexOf(norm(t)) !== -1) : todos;
  const firma = () => Utilities.newBlob(Utilities.base64Decode(INSP_FIRMA_PRUEBA), 'image/png', 'firma.png');
  const lineas = ['PDF DE PRUEBA — carpeta "' + INSP_DEV_CARPETA + '/' + INSP_PDF_PRUEBA_CARPETA + '"', ''];
  const faltan = [];
  const generar = (tipo, nombre, datos, plantillaId) => {
    const anteriores = [];
    const ya = carpeta.getFilesByName(nombre + '.pdf');
    while (ya.hasNext()) anteriores.push(ya.next());
    if (anteriores.length && !rehacer) {
      lineas.push('  = ' + nombre + ': ya está');
      return;
    }
    try {
      anteriores.forEach((a) => DriveUtils.aPapelera(a));   // antes, para que el nuevo se llame igual
      const r = InspeccionesService.pdfDePrueba_(tipo, datos, { 'FIRMA RESPONSABLE': firma(), 'FIRMA INSPECTOR': firma() },
        carpeta.getId(), nombre, plantillaId);
      lineas.push('  ✔ ' + nombre + ': ' + r.url +
        (r.sinResolver && r.sinResolver.length ? '\n      SIN RESOLVER: ' + r.sinResolver.join('; ') : '') +
        (r.sinDibujo.length ? '\n      sin dibujo en Drive: ' + r.sinDibujo.join(', ') : ''));
    } catch (err) {
      lineas.push('  ✘ ' + nombre + ': ' + err.message);
    }
  };
  elegidos.forEach((tipo) => {
    if (Date.now() - inicio > INSP_CONV_TIEMPO_MS) {
      faltan.push(tipo);
      return;
    }
    const datos = inspDevDatosEjemplo_(tipo);   // los mismos en los dos, para compararlos
    generar(tipo, 'PRUEBA ' + tipo, datos);
    if (antes && deAppSheet[tipo]) generar(tipo, 'PRUEBA ' + tipo + ' (antes)', datos, deAppSheet[tipo]);
  });
  if (faltan.length) lineas.push('', 'Se acabó el tiempo de esta corrida; faltan: ' + faltan.join(', ') + '. Córrela otra vez para seguir.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}
