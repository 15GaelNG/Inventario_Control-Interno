/**
 * AdquisicionVehicularIndice.gs
 * Llena ADQUISICION_VEHICULAR_INDICE (la consulta AdquisicionVehicularService.buscar, que usa el
 * botón "Buscar expediente de adquisición" de la ficha de Vehículos) en dos pasadas:
 *
 * A. EXCEL (rápida, sin OCR): lee los tres archivos maestros completos (REGISTRO VEHICULAR 2024,
 *    HISTORICO DE ADQUISICIÓN VEHICULAR 2025 y 2026 -- AdquisicionVehicularService.leerFuente_)
 *    -- los tres ya traen la serie en una columna, capturada a mano por quien da de alta la
 *    compra. Para cada fila busca PRIMERO la carpeta real en Drive por folio ("30371-
 *    CONSTRUCCIÓN"); si no la encuentra así, por el nombre que trae el Excel (2024); y solo si
 *    Drive de verdad no la tiene usa el link del Excel como último recurso (en 2025/2026 puede
 *    venir a Dropbox, no a Drive).
 * B. OCR (lenta, solo lo que A no cubrió -- una compra tan reciente que nadie la capturó
 *    todavía en ningún Excel): recorre TODAS las carpetas reales de Adquisición Vehicular (el
 *    universo completo, no una muestra), parte el folio y el área del nombre de cada solicitud,
 *    copia su factura como Documento con OCR, saca la serie con una expresión regular y tira la
 *    copia. Mismo patrón que la lectura de INE de Líneas (LineasIneLectura.gs): tandas de 4.5
 *    min que se reprograman solas con un trigger, progreso en Script Properties para no perder
 *    nada si se corta a la mitad.
 *
 * Solo lee Adquisición Vehicular (de otra cuenta); nunca escribe ahí -- la copia con OCR se
 * guarda y se tira dentro de la raíz de ESTA app (DriveUtils.carpetaEnRaiz).
 *
 * Desde el editor (decisión del usuario, 12-oct-2026: manual, no un trigger periódico):
 *   adquisicionVehicularIndice_todo()       empieza de cero (pasada A completa + arranca la B)
 *   adquisicionVehicularIndice_continuar()  blanco del trigger -- sigue la pasada B donde quedó
 *   adquisicionVehicularIndice_estado()     progreso, de solo lectura
 *   adquisicionVehicularIndice_detener()    para y borra el trigger
 *   adquisicionVehicularIndice_importarListaFinal()  carga, UNA vez, el trabajo manual de
 *     AdquisicionVehicularListaFinalSemilla.gs (FUENTE="MANUAL") -- ligas que ni A ni B pueden
 *     encontrar solas (hipervínculos ocultos de Excel viejo, carpetas de Dropbox)
 *   adquisicionVehicularIndice_autoLlenarVehiculos()  propaga el índice a la ficha de cada
 *     vehículo (FOLIO ADQUISICION / LIGA EXPEDIENTE ADQUISICION), sin tener que abrirlas una por
 *     una -- correr después de cualquiera de las de arriba
 */
const INDICE_ADQ_PROP = 'ADQUISICION_VEHICULAR_INDICE_ESTADO';
const INDICE_ADQ_CONTINUAR = 'adquisicionVehicularIndice_continuar';
const INDICE_ADQ_TANDA_MS = 4.5 * 60 * 1000;
const INDICE_ADQ_TEMPORAL = 'ADQUISICION_VEHICULAR_OCR_TEMPORAL';

function adquisicionVehicularIndice_todo() {
  soloEditor_();
  indiceAdqBorrarActivadores_();
  indiceAdqPasadaExcel_();
  indiceAdqGuardar_({ fase: 'OCR', procesados: 0, errores: 0, inicio: new Date().toISOString() });
  return adquisicionVehicularIndice_continuar();
}

function adquisicionVehicularIndice_continuar(e) {
  soloEditor_(e);   // el activador de tiempo pasa con su evento (triggerUid); desde el navegador, nadie
  indiceAdqBorrarActivadores_();
  const st = indiceAdqLeer_();
  if (!st || st.fase !== 'OCR') return indiceAdqInforme_(st);
  const inicio = Date.now();
  const hoja = AdquisicionVehicularService.indiceHoja_(true);
  const candidatas = indiceAdqCandidatasOcr_(hoja);
  st.faltan = candidatas.length;
  let espera = 60;
  try {
    indiceAdqProcesarOcr_(candidatas, hoja, st, () => Date.now() - inicio < INDICE_ADQ_TANDA_MS);
    delete st.pausa;
  } catch (e) {
    if (!indiceAdqEsCuota_(e)) {
      st.error = e.message;
      indiceAdqGuardar_(st);
      throw e;
    }
    // Límite de Google (llamadas o tiempo del día): no se anota como error; se sigue en 30 min
    st.pausa = new Date().toISOString() + ' · ' + String(e.message || e).slice(0, 150);
    espera = 30 * 60;
  }
  if (st.faltan <= 0) { st.fase = 'LISTO'; st.fin = new Date().toISOString(); }
  indiceAdqGuardar_(st);
  if (st.fase === 'OCR') ScriptApp.newTrigger(INDICE_ADQ_CONTINUAR).timeBased().after(espera * 1000).create();
  return indiceAdqInforme_(st);
}

function adquisicionVehicularIndice_estado() {
  soloEditor_();   // el activador de tiempo pasa (sin usuario activo); desde el navegador, nadie
  return indiceAdqInforme_(indiceAdqLeer_());
}

function adquisicionVehicularIndice_detener() {
  soloEditor_();   // el activador de tiempo pasa (sin usuario activo); desde el navegador, nadie
  indiceAdqBorrarActivadores_();
  const st = indiceAdqLeer_();
  if (st && st.fase === 'OCR') { st.fase = 'DETENIDO'; indiceAdqGuardar_(st); }
  return indiceAdqInforme_(st);
}

/** Carga, de una sola vez, el trabajo manual de AdquisicionVehicularListaFinalSemilla.gs
 *  (FUENTE="MANUAL") -- no necesita que A o B hayan corrido antes, ni corre nada de Drive/OCR.
 *  Reemplaza solo las filas que ya tenían FUENTE="MANUAL" (indiceAdqReemplazarFuente_): se puede
 *  volver a correr sin duplicar si se actualiza la semilla. */
function adquisicionVehicularIndice_importarListaFinal() {
  soloEditor_();
  const hoja = AdquisicionVehicularService.indiceHoja_(true);
  const ahora = new Date().toISOString();
  const filas = ADQUISICION_VEHICULAR_LISTA_FINAL_.map((f) => f.concat(['MANUAL', ahora]));
  indiceAdqReemplazarFuente_(hoja, 'MANUAL', filas);
  return 'Cargadas ' + filas.length + ' series con FUENTE=MANUAL.';
}

/** Llena FOLIO ADQUISICION / LIGA EXPEDIENTE ADQUISICION en todos los vehículos cuya serie ya
 *  esté en el índice -- lo mismo que el botón "Buscar expediente" de la ficha, de un jalón, para
 *  no tener que abrirlas una por una (VehiculosService.autoLlenarAdquisicion). Nunca pisa un
 *  vehículo que ya tenía algo capturado. Corre después de _todo() o _importarListaFinal(), con
 *  lo que haya en el índice en ese momento -- no construye nada, solo lo propaga a Vehículos. */
function adquisicionVehicularIndice_autoLlenarVehiculos() {
  soloEditor_();
  const hoja = AdquisicionVehicularService.indiceHoja_(false);
  const mapa = {};
  if (hoja && hoja.getLastRow() > 1) {
    const colSerie = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('SERIE');
    const colFolio = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('FOLIO');
    const colLiga = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('LIGA_CARPETA');
    hoja.getRange(2, 1, hoja.getLastRow() - 1, AdquisicionVehicularService.ENCABEZADOS_INDICE.length).getValues().forEach((f) => {
      const serie = AdquisicionVehicularService.normalizarSerie_(f[colSerie]);
      if (serie) mapa[serie] = { folio: String(f[colFolio] || '').trim(), liga: String(f[colLiga] || '').trim() };
    });
  }
  const llenados = VehiculosService.autoLlenarAdquisicion(mapa);
  return 'Se llenaron ' + llenados + ' vehículos con su folio/carpeta de adquisición.';
}

// ---------------------------------------------------------------------------------------------- estado

const indiceAdqLeer_ = () => {
  const crudo = PropertiesService.getScriptProperties().getProperty(INDICE_ADQ_PROP);
  try { return crudo ? JSON.parse(crudo) : null; } catch (e) { return null; }
};
const indiceAdqGuardar_ = (st) => PropertiesService.getScriptProperties().setProperty(INDICE_ADQ_PROP, JSON.stringify(st));

function indiceAdqBorrarActivadores_() {
  ScriptApp.getProjectTriggers().filter((t) => t.getHandlerFunction() === INDICE_ADQ_CONTINUAR).forEach((t) => ScriptApp.deleteTrigger(t));
}

function indiceAdqInforme_(st) {
  if (!st) { console.log('ADQUISICION_VEHICULAR_INDICE: no se ha corrido.'); return 'Sin correr'; }
  const texto = ['ADQUISICION_VEHICULAR_INDICE · ' + st.fase + (st.error ? ' · ERROR: ' + st.error : ''),
    'OCR: ' + st.procesados + (st.faltan != null ? ' · faltan ' + st.faltan : '') + ' · con error: ' + st.errores]
    .concat(st.pausa ? ['En pausa por un límite de Google (sigue sola en 30 min): ' + st.pausa] : []).join('\n');
  console.log(texto);
  return texto;
}

/** ¿Es un límite de Google (cuota, demasiadas llamadas) y no algo del archivo? Esos se reintentan, no se anotan. */
const indiceAdqEsCuota_ = (e) => /quota|rate ?limit|limit exceeded|too many|demasiad|l[ií]mite|cuota/i.test(String((e && e.message) || e));

// ---------------------------------------------------------------------------------------------- pasada A (Excel)

/** Lee los dos Excel completos y reemplaza, en el índice, lo que haya de cada FUENTE -- así una
 *  re-corrida no deja filas viejas si algo se quitó del Excel. La liga de cada fila prefiere SIEMPRE
 *  la carpeta real de Drive (por folio, "30371-CONSTRUCCIÓN" -- la convención real de 2025/2026; si
 *  no aparece así, por el texto de NOMBRE DE LA CARPETA, la de 2024) y solo si Drive de verdad no
 *  tiene esa carpeta usa lo que traiga el Excel (en 2025 puede ser un link a Dropbox, no a Drive --
 *  el usuario prefirió Drive cuando esté disponible, 12-oct-2026). listarCarpetasAdquisicion_ se
 *  recorre una sola vez para toda la pasada, no por cada fila.
 *
 *  Nunca pisa una serie que ya está cargada con FUENTE="MANUAL"
 *  (adquisicionVehicularIndice_importarListaFinal, 13-oct-2026): esas ligas se investigaron a
 *  mano (hipervínculos ocultos del Excel viejo, carpetas de Dropbox) y son mejores que lo que
 *  esta pasada puede encontrar sola -- sin este filtro, una corrida después de importar la lista
 *  final volvería a agregar esas mismas series bajo EXCEL-*, duplicadas en "Adquisición". */
function indiceAdqPasadaExcel_() {
  const hoja = AdquisicionVehicularService.indiceHoja_(true);
  const carpetas = AdquisicionVehicularService.listarCarpetasAdquisicion_();
  const seriesManual = indiceAdqSeriesDeFuente_(hoja, 'MANUAL');
  const ahora = new Date().toISOString();
  AdquisicionVehicularService.FUENTES.forEach((fuente) => {
    const fuenteNombre = 'EXCEL-' + fuente.año;
    const filas = AdquisicionVehicularService.leerFuente_(fuente)
      .filter((f) => !seriesManual.has(f.serie))
      .map((f) => {
        let liga = AdquisicionVehicularService.buscarCarpetaPorFolio_(carpetas, f.año, f.folio);
        if (!liga && f.nombreCarpeta) liga = AdquisicionVehicularService.buscarEnListaCarpetas_(carpetas, f.año, f.nombreCarpeta);
        if (!liga) liga = f.liga;   // último recurso: lo que traiga el Excel (puede ser Dropbox)
        return [f.serie, f.folio, f.area, f.año, liga, fuenteNombre, ahora];
      });
    indiceAdqReemplazarFuente_(hoja, fuenteNombre, filas);
  });
}

/** Las series (ya normalizadas) que el índice ya tiene bajo una FUENTE dada -- para que otra
 *  pasada no las vuelva a insertar. */
function indiceAdqSeriesDeFuente_(hoja, fuenteNombre) {
  const series = new Set();
  if (hoja.getLastRow() > 1) {
    const colSerie = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('SERIE');
    const colFuente = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('FUENTE');
    hoja.getRange(2, 1, hoja.getLastRow() - 1, AdquisicionVehicularService.ENCABEZADOS_INDICE.length).getValues().forEach((f) => {
      if (f[colFuente] === fuenteNombre && f[colSerie]) series.add(AdquisicionVehicularService.normalizarSerie_(f[colSerie]));
    });
  }
  return series;
}

/** Quita del índice los renglones de esa FUENTE y escribe los nuevos en su lugar. */
function indiceAdqReemplazarFuente_(hoja, fuenteNombre, filasNuevas) {
  const encabezados = AdquisicionVehicularService.ENCABEZADOS_INDICE;
  const t = SheetUtils.tabla(hoja, { encabezados: encabezados });
  const colFuente = encabezados.indexOf('FUENTE');
  // Por SheetUtils (borra los seguidos de una vez y avisa a la caché: buscar()/listar() ven lo nuevo al momento)
  if (hoja.getLastRow() > 1) {
    const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, encabezados.length).getValues();
    SheetUtils.borrarFilas(t, valores.map((v, i) => (v[colFuente] === fuenteNombre ? i + 2 : 0)));
  }
  SheetUtils.agregarFilas(t, filasNuevas);
}

// ---------------------------------------------------------------------------------------------- pasada B (OCR)

/** Carpetas de solicitud ("<folio>-<ÁREA>") cuyo folio todavía no está en el índice con ningún
 *  FUENTE (ni Excel, ni un intento de OCR anterior -- exitoso o no: un intento fallido no se
 *  repite solo, para no quemar OCR en una factura con una plantilla que no se pudo leer; sí se
 *  reintenta lo que simplemente no tenía factura subida todavía, porque esas ni se llegan a
 *  escribir aquí abajo). */
function indiceAdqCandidatasOcr_(hoja) {
  const folios = {};
  if (hoja.getLastRow() > 1) {
    const colFolio = AdquisicionVehicularService.ENCABEZADOS_INDICE.indexOf('FOLIO');
    hoja.getRange(2, 1, hoja.getLastRow() - 1, AdquisicionVehicularService.ENCABEZADOS_INDICE.length).getValues()
      .forEach((f) => { const folio = String(f[colFolio]).trim(); if (folio) folios[folio] = true; });
  }
  const carpetas = AdquisicionVehicularService.listarCarpetasAdquisicion_();
  return carpetas.map((c) => {
    const m = c.nombre.match(/^(\d+)\s*-\s*(.+)$/);
    return m ? { folio: m[1].trim(), area: m[2].trim(), año: c.año, carpetaId: c.id, url: c.url } : null;
  }).filter((c) => c && !folios[c.folio]);
}

/** El archivo de factura de una carpeta de solicitud: nombre con "FACTURA", que no sea el XML
 *  del CFDI (ese no trae el texto legible de la unidad) -- o null si todavía no se subió. */
function indiceAdqFactura_(carpetaId) {
  const carpeta = DriveApp.getFolderById(carpetaId);
  const archivos = carpeta.getFiles();
  let candidata = null;
  while (archivos.hasNext()) {
    const a = archivos.next();
    const nombre = a.getName().toUpperCase();
    if (nombre.indexOf('FACTURA') === -1 || nombre.indexOf('XML') !== -1) continue;
    if (a.getMimeType() === 'application/pdf') return a;   // el PDF manda si hay varias candidatas
    if (!candidata) candidata = a;
  }
  return candidata;
}

/** La carpeta temporal de las copias con OCR: dentro de la raíz de ESTA app (nunca la de
 *  Adquisición Vehicular, que es de otra cuenta y de solo lectura). */
function indiceAdqTemporal_() {
  return DriveUtils.carpetaEnRaiz(INDICE_ADQ_TEMPORAL).getId();
}

/** El texto de una factura: copia como Documento con OCR en la carpeta temporal, se lee y la
 *  copia se manda a la papelera -- mismo patrón que ineLecTexto_ (LineasIneLectura.gs). */
function indiceAdqTexto_(archivo, temporal) {
  const copia = DriveUtils.copiarConApi({ name: 'OCR ' + archivo.getId(), mimeType: 'application/vnd.google-apps.document', parents: [temporal] },
    archivo.getId(), { ocrLanguage: 'es', supportsAllDrives: true, fields: 'id' }, { temporal: true });
  try {
    return DocumentApp.openById(copia.id).getBody().getText();
  } finally {
    try { DriveUtils.aPapelera(copia.id, { temporal: true }); } catch (e) { console.warn('ADQUISICION_VEHICULAR_INDICE: no se tiró la copia ' + copia.id); }
  }
}

/** Las series (VIN) del texto de una factura: 17 caracteres del alfabeto real de un VIN (sin
 *  I/O/Q, para no confundir con 1/0). Una factura de lote puede traer más de una. */
function indiceAdqSeriesDelTexto_(texto) {
  return Array.from(new Set((texto.match(/\b[A-HJ-NPR-Z0-9]{17}\b/g) || [])));
}

/** Procesa candidatas mientras `queda()`: busca su factura, la OCR, saca la(s) serie(s) y
 *  escribe un renglón por serie (o uno sin serie si no se encontró ninguna, para no reintentar
 *  esa factura cada corrida). Sin factura todavía: se salta sin escribir nada (si se sube
 *  después, la siguiente corrida la vuelve a considerar). */
function indiceAdqProcesarOcr_(candidatas, hoja, st, queda) {
  const temporal = indiceAdqTemporal_();
  const ahora = new Date().toISOString();
  for (let i = 0; i < candidatas.length && queda(); i++) {
    const c = candidatas[i];
    const factura = indiceAdqFactura_(c.carpetaId);
    if (!factura) { st.faltan--; continue; }
    let series = [];
    let error = '';
    try {
      series = indiceAdqSeriesDelTexto_(indiceAdqTexto_(factura, temporal));
    } catch (e) {
      if (indiceAdqEsCuota_(e)) throw e;
      error = String(e.message || e).slice(0, 200);
    }
    const fuenteNombre = 'OCR-' + c.año;
    const filas = (series.length ? series : ['']).map((serie) => [serie, c.folio, c.area, c.año, c.url, fuenteNombre, ahora]);
    SheetUtils.agregarFilas(SheetUtils.tabla(hoja, { encabezados: AdquisicionVehicularService.ENCABEZADOS_INDICE }), filas);
    st.procesados++;
    if (error || !series.length) st.errores++;
    st.faltan--;
    indiceAdqGuardar_(st);
  }
  // Mismo motivo que en indiceAdqReemplazarFuente_: escritura directa, hay que avisarle a la caché a mano.
  CacheHojas.tocarHoja(hoja);
}
