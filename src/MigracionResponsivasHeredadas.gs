/**
 * MigracionResponsivasHeredadas.gs
 *
 * Un adeudo del sistema anterior: cientos de responsivas firmadas quedaron como PDFs sueltos
 * en una carpeta de Drive, nombrados por AppSheet -- pero no siempre con el folio: a veces es
 * el folio ("CTA0073.RESPONSIVA.211334.pdf"), a veces el ID_VEHICULO viejo de AppSheet, que
 * ahora vive en la columna "ID ANTERIOR" con forma REFWF+número ("REFWF334.RESPONSIVA…pdf" —
 * ver el comentario de VehiculosService.gs sobre ID_COLUMN), y a veces un ID de 8 hex que no
 * se pudo ligar por nombre en absoluto. Nunca se migraron a RESPONSIVA VEHICULAR porque esa
 * hoja no existía entonces.
 *
 * Por eso cada archivo se busca de TRES formas, en orden (la primera que funcione gana):
 *   1. Por la columna RESPONSIVA de VEHICULOS: ahí AppSheet guardó la ruta exacta del último
 *      archivo subido para ese vehículo -- si el nombre del archivo coincide, es prueba
 *      directa, sin importar qué forma tenga el nombre.
 *   2. Por FOLIO, si el nombre empieza con "<FOLIO>." o "<FOLIO>_".
 *   3. Por ID ANTERIOR (el REFWF+número), con el mismo patrón que el folio.
 *
 * La meta NO es reconstruir el formulario completo: no hay firmas, responsable, documentación
 * ni ningún otro dato de esa responsiva en ningún lado más que el PDF mismo. La meta es que el
 * PDF se vea en el historial de su vehículo (decisión del usuario, 06-oct-2026: "me interesa
 * que se vea el pdf"). Por eso cada fila migrada trae lo que SÍ se sabe -- folio, snapshot
 * actual del vehículo, el PDF, una fecha aproximada (la de creación del archivo en Drive) -- y
 * el resto en blanco, con una nota en OBSERVACIONES explicando por qué.
 *
 * Patrón ensayo/escribir de MigracionFamilia.gs: correr responsivasHeredadas1Ensayo primero
 * (no escribe nada, solo reporta qué encontró); cuando el reporte se vea bien,
 * responsivasHeredadas2Escribir. Es IDEMPOTENTE -- un PDF que ya tiene su fila (por su URL en
 * la columna PDF) se salta solo -- así que correrlo varias veces, o a medias si Drive truena,
 * no duplica nada.
 */

// Carpeta de Drive con los PDFs del sistema anterior (el usuario la compartió, 06-oct-2026).
const CARPETA_RESPONSIVAS_HEREDADAS = '1BrGhaC18GtXDCw7k9kZlMdK-Pp15lupz';

/** Ensayo: no escribe nada, solo dice qué encontró y qué migraría. Empieza por aquí. */
function responsivasHeredadas1Ensayo() {
  soloEditor_();
  return migrarResponsivasHeredadas_({ escribir: false });
}

/** De verdad: ESCRIBE las filas nuevas en RESPONSIVA VEHICULAR. */
function responsivasHeredadas2Escribir() {
  soloEditor_();
  return migrarResponsivasHeredadas_({ escribir: true });
}

/** Escribe UNA sola fila (la primera que encuentre) -- para revisarla en el sistema antes de
 *  correr el lote completo. Vuelve a correrla y escribe la siguiente, sin repetir la primera
 *  (ya quedó marcada por su URL en la columna PDF, como cualquier otra). */
function responsivasHeredadas2EscribirUno() {
  soloEditor_();
  return migrarResponsivasHeredadas_({ escribir: true, limite: 1 });
}

/** Último segmento de una ruta ("A/B/archivo.pdf" → "archivo.pdf"), en minúsculas. */
function basenameMinuscula_(ruta) {
  const partes = String(ruta || '').split('/');
  return partes[partes.length - 1].trim().toLowerCase();
}

function migrarResponsivasHeredadas_(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = Config.SPREADSHEET_IDS.VEHICULOS();
  const lineas = [(cfg.escribir ? 'ESCRIBIENDO' : 'ENSAYO (no escribe nada)') + ' — responsivas heredadas', ''];

  const carpeta = DriveApp.getFolderById(CARPETA_RESPONSIVAS_HEREDADAS);
  const archivos = carpeta.getFilesByType(MimeType.PDF);

  // VEHICULOS: tres índices para las tres formas de encontrar el vehículo de un archivo.
  const vehiculos = SheetUtils.getAll(ssId, 'VEHICULOS');
  const porFolio = {};
  const porIdAnterior = {};
  const porNombreDeArchivo = {};
  vehiculos.forEach((v) => {
    const folio = String(v['FOLIO'] || '').trim().toUpperCase();
    if (folio) porFolio[folio] = v;
    const idAnterior = String(v[Entidades.COLUMNA_ID_ANTERIOR] || '').trim().toUpperCase();
    if (idAnterior) porIdAnterior[idAnterior] = v;
    const nombreArchivo = basenameMinuscula_(v['RESPONSIVA']);
    if (nombreArchivo) porNombreDeArchivo[nombreArchivo] = v;
  });

  // Ya migradas: por URL del PDF en la columna PDF -- así correrlo de nuevo no duplica.
  const existentes = SheetUtils.getAll(ssId, 'RESPONSIVA VEHICULAR');
  const pdfsYaCargados = {};
  existentes.forEach((r) => { if (r['PDF']) pdfsYaCargados[r['PDF']] = true; });

  // "<CODIGO>.RESPONSIVA..." o "<CODIGO>_RESPONSIVA...": letras seguidas de números, pegado.
  // Sirve tanto para folios (CTA0073) como para ID ANTERIOR (REFWF334) -- misma forma.
  const PATRON_CODIGO = /^([A-Za-z]+\d+)[._]/;

  let total = 0;
  let yaExistian = 0;
  let porArchivo = 0, porFolioCount = 0, porIdAnteriorCount = 0;
  const sinCodigoReconocible = [];
  const sinVehiculo = [];
  const nuevasFilas = [];

  while (archivos.hasNext()) {
    const archivo = archivos.next();
    const nombre = archivo.getName();
    if (nombre.toUpperCase().indexOf('RESPONSIVA') === -1) continue;   // otros PDFs de la carpeta
    total++;

    const url = archivo.getUrl();
    if (pdfsYaCargados[url]) { yaExistian++; continue; }

    let vehiculo = porNombreDeArchivo[nombre.trim().toLowerCase()];
    let como = 'la columna RESPONSIVA de VEHICULOS';
    if (vehiculo) { porArchivo++; }

    if (!vehiculo) {
      const m = PATRON_CODIGO.exec(nombre);
      if (!m) { sinCodigoReconocible.push(nombre); continue; }
      const codigo = m[1].toUpperCase();
      vehiculo = porFolio[codigo];
      if (vehiculo) { porFolioCount++; como = 'el folio'; }
      if (!vehiculo) {
        vehiculo = porIdAnterior[codigo];
        if (vehiculo) { porIdAnteriorCount++; como = 'el ID ANTERIOR (AppSheet)'; }
      }
      if (!vehiculo) { sinVehiculo.push(nombre + '  (código ' + codigo + ')'); continue; }
    }

    nuevasFilas.push({
      ID: Ids.nuevo(Entidades.prefijo('RESPONSIVA VEHICULAR')),
      FECHA: archivo.getDateCreated(),
      'FOLIO VEHICULO': vehiculo['FOLIO'] || '',
      'ID VEHICULO': vehiculo['ID'] || '',
      NUCCO: vehiculo['NUCCO'] || '',
      MARCA: vehiculo['MARCA'] || '',
      CLASE: vehiculo['CLASE'] || '',
      MODELO: vehiculo['MODELO'] || '',
      COLOR: vehiculo['COLOR'] || '',
      'SERIE VEHICULO': vehiculo['SERIE VEHICULO'] || '',
      PLACA: vehiculo['PLACA'] || '',
      'RAZON SOCIAL': vehiculo['RAZON SOCIAL'] || '',
      PDF: url,
      OBSERVACIONES: 'Responsiva heredada del sistema anterior (' + nombre + ', encontrada por ' + como +
        '): solo se conserva el PDF original -- sin firmas ni los demás datos del formulario, que no existen en ningún otro lado.',
      'REGISTRADO POR': 'Migración sistema anterior',
      'FECHA REGISTRO': new Date(),
    });
  }

  lineas.push('  ' + total + ' PDFs con "RESPONSIVA" en el nombre, en la carpeta');
  lineas.push('  ' + yaExistian + ' ya estaban migrados (se saltaron, por su URL en la columna PDF)');
  lineas.push('  ' + nuevasFilas.length + ' para migrar, de los cuales:');
  lineas.push('      ' + porArchivo + ' por la columna RESPONSIVA de VEHICULOS (coincidencia exacta de archivo)');
  lineas.push('      ' + porFolioCount + ' por el folio en el nombre');
  lineas.push('      ' + porIdAnteriorCount + ' por el ID ANTERIOR (REFWF…) en el nombre');
  lineas.push('  ' + sinVehiculo.length + ' con código reconocido pero sin ese vehículo en VEHICULOS (ni por folio ni por ID ANTERIOR)');
  lineas.push('  ' + sinCodigoReconocible.length + ' con un nombre que no se pudo leer como "<CÓDIGO>.RESPONSIVA…" y tampoco coincide con ningún archivo ya registrado');

  if (sinVehiculo.length) {
    lineas.push('', 'SIN VEHÍCULO (' + sinVehiculo.length + '):');
    sinVehiculo.slice(0, 40).forEach((s) => lineas.push('  - ' + s));
    if (sinVehiculo.length > 40) lineas.push('  … y ' + (sinVehiculo.length - 40) + ' más');
  }
  if (sinCodigoReconocible.length) {
    lineas.push('', 'NOMBRE NO RECONOCIDO (' + sinCodigoReconocible.length + '):');
    sinCodigoReconocible.slice(0, 40).forEach((s) => lineas.push('  - ' + s));
    if (sinCodigoReconocible.length > 40) lineas.push('  … y ' + (sinCodigoReconocible.length - 40) + ' más');
  }

  if (cfg.escribir && nuevasFilas.length) {
    const aEscribir = cfg.limite ? nuevasFilas.slice(0, cfg.limite) : nuevasFilas;
    const hoja = SheetUtils.getSheet(ssId, 'RESPONSIVA VEHICULAR');
    aEscribir.forEach((fila) => SheetUtils.insert(ssId, hoja.getName(), fila));
    lineas.push('', '  ' + aEscribir.length + ' fila(s) escrita(s) en RESPONSIVA VEHICULAR' +
      (cfg.limite ? ' (de prueba -- folio ' + aEscribir[0]['FOLIO VEHICULO'] + ', ve a su ficha a revisarla)' : ''));
  } else if (!cfg.escribir) {
    lineas.push('', 'Si cuadra, corre responsivasHeredadas2EscribirUno() primero para revisar una en el sistema, o responsivasHeredadas2Escribir() para todo el lote.');
  }

  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}
