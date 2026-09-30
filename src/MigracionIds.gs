/**
 * MigracionIds.gs
 * Le pone a cada renglón que ya existe su ID nuevo. Se corre A MANO desde el editor,
 * nunca desde el cliente. La lógica completa está en docs/ids-asignacion.md.
 *
 * Los cuatro pasos, EN ESTE ORDEN:
 *   1. revisarAntesDeMigrar()    solo reporta: qué está roto y qué se va a tocar
 *   2. asignarIds()              llena la columna ID de cada hoja
 *   3. reescribirReferencias()   cambia las columnas que apuntan a otra hoja
 *   4. (aparte) cambiar los servicios para unir por ID en vez de por FOLIO
 *
 * El 4 antes del 2 deja el sistema sin llaves. El 3 antes del 2, con referencias a IDs
 * que no existen.
 *
 * TODAS las funciones que escriben empiezan en modo ensayo: no tocan nada y te dicen qué
 * harían. Para que escriban de verdad hay que pasarles `{ escribir: true }`.
 *
 * PRODUCCIÓN: el script se niega a escribir ahí, porque agregar una columna rompe la app
 * de AppSheet hasta que alguien regenere el esquema, y eso deja sin trabajar a la gente en
 * campo. Se corre en producción hasta el apagado de AppSheet, poniendo la Script Property
 * MIGRACION_IDS_AUTORIZAR_PRODUCCION en el id del spreadsheet.
 */

// ================================================================
// LAS QUE SE CORREN DESDE EL EDITOR
// El desplegable de funciones solo ejecuta funciones SIN argumentos, así que estas son
// las que hay que seleccionar ahí. Van numeradas en el orden en que se usan.
// Las de abajo (asignarIds, reescribirReferencias) reciben opciones y son para llamarlas
// desde código o desde la consola.
// ================================================================

/** PASO 1 — Solo lee. Qué está roto y qué se va a tocar. */
function migracion1Revisar() {
  return revisarAntesDeMigrar();
}

/** PASO 2, ensayo — Solo dice qué IDs generaría. No escribe nada. */
function migracion2AsignarEnsayo() {
  return asignarIds();
}

/** PASO 2, de verdad — ESCRIBE la columna ID y guarda el valor viejo en ID ANTERIOR.
 *  Se puede volver a correr: las hojas ya migradas se saltan solas. */
function migracion2AsignarEscribir() {
  return asignarIds({ escribir: true });
}

/** PASO 3, ensayo — Solo dice qué referencias cambiaría y cuántas quedarían huérfanas. */
function migracion3ReferenciasEnsayo() {
  return reescribirReferencias();
}

/** PASO 3, de verdad — ESCRIBE las columnas que apuntan a otra hoja. */
function migracion3ReferenciasEscribir() {
  return reescribirReferencias({ escribir: true });
}

/** Comprobación final — Solo lee. Se puede correr cuando sea. */
function migracion4Auditar() {
  return auditarIds();
}

/** Mueve la columna ID al inicio de cada hoja, ensayo — Solo lee. */
function migracionMoverIdsAlInicioEnsayo() {
  return moverIdsAlInicio();
}

/** Mueve la columna ID al inicio de cada hoja, de verdad — MUEVE columnas. */
function migracionMoverIdsAlInicioEscribir() {
  return moverIdsAlInicio({ escribir: true });
}

/** Quita las columnas ID ANTERIOR que sobran, ensayo — Solo lee. */
function migracionLimpiarRespaldoEnsayo() {
  return limpiarRespaldoRedundante();
}

/** Quita las columnas ID ANTERIOR que sobran, de verdad — BORRA columnas.
 *  Solo borra donde el valor sigue existiendo íntegro en su columna original. */
function migracionLimpiarRespaldoEscribir() {
  return limpiarRespaldoRedundante({ escribir: true });
}

/** El spreadsheet de producción. Aquí NO se escribe mientras AppSheet siga vivo. */
const MIGRACION_SS_PRODUCCION = '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk';


/**
 * Las referencias medidas contra los datos reales (no supuestas). El % es cuántos valores
 * del hijo existían en el padre al 29/09/2026; sirve para saber si el resultado cuadra.
 *
 * DÓNDE SE ESCRIBE EL ID NUEVO — y esto NO es uniforme, depende de qué guarda el hijo:
 *
 *   a) El hijo guarda una LLAVE DE NEGOCIO del padre (FOLIO, SERIE VEHICULO, ID CCH).
 *      Esa columna NO se toca: es lo que la gente lee en la tabla y lo que AppSheet usa,
 *      y sigue siendo válida porque la llave de negocio del padre no cambió. El ID nuevo
 *      va en una columna NUEVA, la que dice `destino`.
 *
 *   b) El hijo guarda el ID VIEJO del padre (ID LINEA, ID_EQUIPO, ID_LINEA…) y ese padre
 *      es de los 8 cuya columna se llamaba "ID", así que la migración se la pisó. Entonces
 *      la columna del hijo ya no apunta a nada y hay que reescribirla EN SU LUGAR.
 *
 * Cuál de los dos casos es se deduce del catálogo (`pisaLlaveAnterior` del padre), no se
 * escribe a mano. Una versión anterior de este archivo pisaba la columna en los dos casos:
 * habría convertido los folios "CTA0100" en "VEH-…", tirando la llave de negocio y
 * rompiendo AppSheet de paso.
 */
const MIGRACION_REFERENCIAS = [
  { hoja: 'VERIFICACIONES', columna: 'FOLIO VEHICULO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 1.00 },
  { hoja: 'REASIGNACIONES_VEHICULOS', columna: 'Folio Vehiculo', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 1.00 },
  { hoja: 'INSTALACION DE SENSORES', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 0.99 },
  { hoja: 'INSPECCION VEHICULAR', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 0.996 },
  { hoja: 'HOLOGRAMAS', columna: 'SERIE VEHICULO', padre: 'VEHICULOS', porLlaveNegocio: 'SERIE VEHICULO', destino: 'ID VEHICULO', opcional: true },
  { hoja: 'CAMBIOS VEHICULOS', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 0.73 },
  // Padre LINEAS TELEFONICAS: su columna se llamaba "ID" y la migración la pisó, así que
  // estas columnas se reescriben en su lugar (si no, ya no apuntan a nada).
  { hoja: 'INSPECCIONES LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.999 },
  { hoja: 'RESPONSIVAS LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.998 },
  { hoja: 'BITACORA DE DESECHO', columna: 'ID_EQUIPO', padre: 'LINEAS TELEFONICAS', esperado: 1.00 },
  { hoja: 'CAMBIOS LINEAS TELEFONICAS', columna: 'ID_LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.981 },
  // La columna se llama IMEI pero 290 de 321 valores son IDs de línea (pendiente Emmanuel)
  { hoja: 'REACTIVACION DE LINEAS', columna: 'IMEI', padre: 'LINEAS TELEFONICAS', esperado: 0.89, revisar: true },
  // Se me había escapado: 1,470 filas en producción, con 99.9% de coincidencia. Al migrar
  // LINEAS TELEFONICAS sin reescribir esta columna, sus 1,167 referencias en la copia de
  // pruebas quedaron huérfanas de un jalón.
  { hoja: 'HISTORIAL_REASIGNACIONES', columna: 'ID Linea', padre: 'LINEAS TELEFONICAS', esperado: 0.999 },
  // Pestaña del sistema nuevo (solo existe en pruebas). ID_REGISTRO queda pendiente: es
  // polimórfica, apunta a INSPECCIONES LINEAS o a RESPONSIVAS LINEAS según la columna TIPO.
  { hoja: 'APP_EVIDENCIAS', columna: 'ID_LINEA', padre: 'LINEAS TELEFONICAS', esperado: 1.00 },
  // Padres cuya llave NO se pisó: la columna del hijo sigue sirviendo y el ID va aparte.
  // El destino no puede llamarse "ID CCH" porque esa columna ya existe con otro contenido.
  { hoja: 'MOVIMIENTOS_ACCESORIOS', columna: 'ID_Accesorio', padre: 'ACCESORIOS CELULARES', porLlaveNegocio: 'ID_Accesorio', destino: 'ID ACCESORIO', esperado: 0.95 },
  { hoja: 'ARQUEOS', columna: 'ID CCH', padre: 'CAJAS CHICAS', porLlaveNegocio: 'ID CCH', destino: 'ID CAJA CHICA', esperado: 1.00 },
  { hoja: 'INCREMENTOS', columna: 'ID CCH', padre: 'CAJAS CHICAS', porLlaveNegocio: 'ID CCH', destino: 'ID CAJA CHICA', esperado: 1.00 },
];




// ---------------------------------------------------------------- utilidades

function migracionSs_(opciones) {
  const id = (opciones && opciones.spreadsheetId) || Config.SPREADSHEET_IDS.VEHICULOS();
  if (id === MIGRACION_SS_PRODUCCION && opciones && opciones.escribir) {
    const props = PropertiesService.getScriptProperties();
    const permiso = props.getProperty('MIGRACION_IDS_AUTORIZAR_PRODUCCION');
    if (permiso !== id) {
      throw new Error(
        'Este es el spreadsheet de PRODUCCIÓN. Agregar una columna rompe la app de AppSheet ' +
        'hasta que alguien regenere el esquema, y deja sin trabajar a la gente en campo. ' +
        'Si AppSheet ya está apagado, pon la Script Property ' +
        'MIGRACION_IDS_AUTORIZAR_PRODUCCION con el id del spreadsheet.');
    }
    // Segunda llave, distinta a propósito: que autorizar producción y declarar AppSheet
    // apagado sean dos actos separados, para que ninguno se dé por hecho.
    //
    // La excepción son las operaciones que NO cambian el esquema. Recortar filas vacías es
    // la única hasta ahora: AppSheet amarra su regeneración a las COLUMNAS ("add, reorder,
    // or delete columns"), y las filas no aparecen en ninguna de esas listas. Esas pasan
    // con { appsheetPuedeSeguirVivo: true } y solo piden autorización y respaldo.
    if (!opciones.appsheetPuedeSeguirVivo && props.getProperty('MIGRACION_APPSHEET_APAGADO') !== id) {
      throw new Error(
        'Falta declarar que AppSheet ya está apagado. Pon la Script Property ' +
        'MIGRACION_APPSHEET_APAGADO con el id del spreadsheet. ' +
        'Si AppSheet sigue vivo, esto NO se corre: ver src/MigracionPipeline.gs.');
    }
    // Sin red externa no se escribe en producción. En pruebas sí, para no estorbar.
    if (!props.getProperty('MIGRACION_RESPALDO_ID')) {
      throw new Error(
        'No hay respaldo. Corre pipeline0Respaldar primero: es la única red que queda ' +
        'si la reversa misma falla.');
    }
  }
  return id;
}

const migLimpio_ = (v) => String(v == null ? '' : v).trim();
const migClave_ = (v) => migLimpio_(v).toUpperCase();

/** Encabezados de la hoja, con los espacios de sobra ya quitados */
function migEncabezados_(sheet) {
  if (sheet.getLastColumn() === 0) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(migLimpio_);
}

/** Posición (base 1) de una columna, o 0 si no está */
function migColumna_(encabezados, nombre) {
  const buscado = migClave_(nombre);
  for (let i = 0; i < encabezados.length; i++) {
    if (migClave_(encabezados[i]) === buscado) return i + 1;
  }
  return 0;
}

/**
 * La columna, y si no existe la agrega al final (devolviendo su posición).
 *
 * A la columna nueva se le fuerza formato de TEXTO ('@'). El prefijo ya hace imposible que
 * Sheets lea un ID como número, pero el formato lo hace imposible también si alguien pega
 * valores a mano ahí. Es la misma precaución que LineasDatos.asegurarPestana toma con sus
 * columnas de texto, y cierra por completo el agujero que nos costó 23 IDs convertidos en
 * número y un cero a la izquierda perdido para siempre.
 */
function migColumnaOCrear_(sheet, nombre, escribir) {
  const enc = migEncabezados_(sheet);
  const pos = migColumna_(enc, nombre);
  if (pos) return { columna: pos, creada: false };
  if (!escribir) return { columna: 0, creada: true };
  const destino = enc.length + 1;
  if (sheet.getMaxColumns() < destino) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), destino - sheet.getMaxColumns());
  }
  sheet.getRange(1, destino).setValue(nombre);
  sheet.getRange(2, destino, Math.max(1, sheet.getMaxRows() - 1), 1).setNumberFormat('@');
  return { columna: destino, creada: true };
}

function migFilas_(sheet) {
  return Math.max(0, sheet.getLastRow() - 1);
}

/**
 * Qué renglones están COMPLETAMENTE vacíos.
 *
 * getLastRow() cuenta renglones en blanco que quedaron dentro del rango usado (en la copia
 * de pruebas son 147: 101 en LINEAS TELEFONICAS, 29 en RESPONSIVAS LINEAS, etc.). Si se les
 * pone ID, se convierten en registros fantasma con llave propia. Se detectan leyendo la
 * hoja completa una sola vez.
 */
function migFilasVacias_(sheet, filas) {
  const columnas = Math.max(1, sheet.getLastColumn());
  if (!filas) return [];
  const valores = sheet.getRange(2, 1, filas, columnas).getValues();
  return valores.map((fila) => fila.every((c) => migLimpio_(c) === ''));
}

/** Una columna completa como arreglo de textos, en el orden de la hoja */
function migLeerColumna_(sheet, columna, filas) {
  if (!columna || !filas) return [];
  return sheet.getRange(2, columna, filas, 1).getValues().map((f) => migLimpio_(f[0]));
}

// ---------------------------------------------------------------- paso 1

/**
 * Solo reporta. No toca nada, ni siquiera con { escribir: true }.
 * Corre esto primero y lee la salida completa antes de seguir.
 */
function revisarAntesDeMigrar(opciones) {
  const ssId = migracionSs_(opciones || {});
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = ['REVISIÓN PREVIA — spreadsheet ' + ssId, ''];
  const problemas = [];

  Entidades.migrables().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { problemas.push('FALTA la hoja "' + h.hoja + '"'); return; }
    const enc = migEncabezados_(sheet);
    const filas = migFilas_(sheet);
    const posId = h.llaveAnterior ? migColumna_(enc, h.llaveAnterior) : (h.columnaAnterior || 0);
    const detalles = [];

    if (!posId) {
      problemas.push(h.hoja + ': no encuentro su columna de ID ("' + h.llaveAnterior + '")');
    } else {
      const valores = migLeerColumna_(sheet, posId, filas);
      const vacias = migFilasVacias_(sheet, filas);
      const llenos = valores.filter(Boolean);
      const distintos = {};
      let repetidos = 0;
      llenos.forEach((v) => {
        const k = migClave_(v);
        if (distintos[k]) repetidos++; else distintos[k] = true;
      });
      // Un renglón en blanco no es un registro: se queda sin ID y no cuenta como problema
      const enBlanco = vacias.filter(Boolean).length;
      const sinIdConDatos = valores.filter((v, i) => !v && !vacias[i]).length;
      detalles.push(filas + ' filas');
      detalles.push(llenos.length + ' con ID');
      if (enBlanco) detalles.push(enBlanco + ' en blanco (se saltan)');
      if (sinIdConDatos) {
        problemas.push(h.hoja + ': ' + sinIdConDatos + ' renglones CON DATOS pero sin ID');
      }
      if (repetidos) problemas.push(h.hoja + ': ' + repetidos + ' IDs repetidos en "' + h.llaveAnterior + '"');
    }

    if (migColumna_(enc, Entidades.COLUMNA_ID) && h.llaveAnterior !== Entidades.COLUMNA_ID) detalles.push('ya tiene columna ID');
    if (migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR)) detalles.push('ya tiene ' + Entidades.COLUMNA_ID_ANTERIOR);
    // El libro se migró con la versión vieja del código, que llamaba al respaldo
    // "ID APPSHEET". No es un error en sí, pero este código ya no la lee: lo que había ahí
    // es invisible para la reversa y para la limpieza. Se avisa fuerte.
    if (h.pisaLlaveAnterior && migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR_LEGADO)) {
      detalles.push('OJO: trae "' + Entidades.COLUMNA_ID_ANTERIOR_LEGADO + '" (nombre viejo del respaldo). ' +
        'Este código usa "' + Entidades.COLUMNA_ID_ANTERIOR + '": replancha el libro desde producción, o renombra esa columna.');
    }
    enc.forEach((c, i) => {
      if (!c) problemas.push(h.hoja + ': la columna ' + (i + 1) + ' no tiene encabezado');
    });
    lineas.push('  ' + h.hoja + ' [' + h.prefijo + '] — ' + detalles.join(', '));
  });

  lineas.push('', problemas.length ? 'PROBLEMAS (' + problemas.length + '):' : 'Sin problemas.');
  problemas.forEach((p) => lineas.push('  - ' + p));
  lineas.push('', 'Si todo se ve bien, lo que sigue es el ENSAYO, que tampoco escribe:',
    '    migracion2AsignarEnsayo',
    'y hasta que su salida cuadre:',
    '    migracion2AsignarEscribir',
    '',
    'Si truena por tiempo, vuelve a correr lo mismo: sigue donde se quedó.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- paso 2

/**
 * ¿Esta hoja ya está migrada? Lo está si todos los renglones CON DATOS traen un ID con la
 * forma correcta y el prefijo de la hoja.
 */
function migYaMigrada_(sheet, prefijo, filas, vacias) {
  const pos = migColumna_(migEncabezados_(sheet), Entidades.COLUMNA_ID);
  if (!pos) return false;
  const ids = migLeerColumna_(sheet, pos, filas);
  for (let i = 0; i < filas; i++) {
    if (vacias[i]) continue;
    if (!ids[i] || !Ids.tieneForma(ids[i]) || Ids.prefijo(ids[i]) !== prefijo) return false;
  }
  return true;
}

/**
 * Llena la columna ID de cada hoja y guarda el valor viejo en ID ANTERIOR.
 * Sin { escribir: true } solo dice qué haría.
 *
 * El ID de cada renglón sale de su POSICIÓN en la hoja, no de ninguna columna de fecha:
 * ver docs/ids-asignacion.md, sección 2.
 *
 * SE PUEDE VOLVER A CORRER sin miedo. Apps Script corta la ejecución a los minutos, y con
 * 23 hojas (una de 33,640 renglones) es probable que se interrumpa a medias:
 *
 *   - Una hoja ya migrada se SALTA. La segunda corrida sigue donde se quedó.
 *   - ID ANTERIOR nunca se pisa si ya trae datos. Es el único valor irrecuperable: en las
 *     hojas cuya columna se llama "ID", volver a leer de ahí daría los IDs NUEVOS y los
 *     copiaría encima de los originales, borrándolos para siempre.
 *   - Se detiene sola antes del límite de tiempo y dice en qué hoja se quedó.
 *
 * Con { rehacer: true } vuelve a generar el ID aunque la hoja ya esté migrada (el valor
 * viejo se sigue respetando, porque se lee de ID ANTERIOR).
 */
function asignarIds(opciones) {
  const cfg = Object.assign({ escribir: false, hojas: null, rehacer: false }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'ASIGNANDO IDs' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const arranque = Date.now();
  const LIMITE_MS = 4.5 * 60 * 1000;   // Apps Script corta a los 6 min; paramos antes
  let total = 0, hechas = 0, saltadas = 0;
  const pendientes = [];

  Entidades.migrables().forEach((h) => {
    if (cfg.hojas && cfg.hojas.indexOf(h.hoja) === -1) return;
    if (pendientes.length) { pendientes.push(h.hoja); return; }   // ya se acabó el tiempo

    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { lineas.push('  ' + h.hoja + ': NO EXISTE, se salta'); return; }
    const filas = migFilas_(sheet);
    if (!filas) { lineas.push('  ' + h.hoja + ': vacía, se salta'); return; }

    if (Date.now() - arranque > LIMITE_MS) { pendientes.push(h.hoja); return; }

    const enc = migEncabezados_(sheet);
    const vacias = migFilasVacias_(sheet, filas);

    if (!cfg.rehacer && migYaMigrada_(sheet, h.prefijo, filas, vacias)) {
      lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: YA MIGRADA, se salta');
      saltadas++;
      return;
    }

    // ¿El ID nuevo va a PISAR la columna vieja? Solo cuando esa columna ya se llama "ID"
    // (Líneas, Uber, Tickets, Reactivación, Solicitud, Incrementos y las dos de Líneas).
    // En las demás la columna original —ID_VEHICULO, ID_SENSOR, ID CCH…— se queda intacta
    // y el ID nuevo se crea aparte, así que respaldarla sería guardar dos veces lo mismo.
    const sobrescribe = h.pisaLlaveAnterior;

    // Si ID ANTERIOR ya tiene datos, ESA es la verdad: la columna original pudo haber sido
    // sobrescrita por una corrida anterior.
    const posGuardada = migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR);
    const yaGuardado = posGuardada ? migLeerColumna_(sheet, posGuardada, filas) : [];
    const tieneGuardado = yaGuardado.some(Boolean);
    const posVieja = h.llaveAnterior ? migColumna_(enc, h.llaveAnterior) : (h.columnaAnterior || 0);
    if (!tieneGuardado && !posVieja) {
      lineas.push('  ' + h.hoja + ': SIN columna de ID, se salta');
      return;
    }

    // Los IDs, uno por renglón, en el orden de la hoja.
    //  - Los renglones en blanco se quedan SIN ID: ponerles uno los haría registros fantasma.
    //  - Un renglón que YA tiene un ID bueno lo conserva. La hoja sigue viva mientras
    //    migramos (aparecieron 2 inspecciones nuevas entre una corrida y otra), y
    //    regenerarlos rompería las referencias que el paso 3 ya hubiera reescrito.
    const posIdActual = migColumna_(enc, Entidades.COLUMNA_ID);
    const idsPrevios = posIdActual ? migLeerColumna_(sheet, posIdActual, filas) : [];
    const nuevos = [];
    const vistos = {};
    let conservados = 0, generados = 0;
    for (let i = 0; i < filas; i++) {
      if (vacias[i]) { nuevos.push(['']); continue; }
      const previo = idsPrevios[i];
      if (!cfg.rehacer && previo && Ids.tieneForma(previo) && Ids.prefijo(previo) === h.prefijo && !vistos[previo]) {
        vistos[previo] = true;
        nuevos.push([previo]);
        conservados++;
        continue;
      }
      let id = Ids.deLegado(h.prefijo, i);
      let intentos = 0;
      while (vistos[id] && intentos < 10) { id = Ids.deLegado(h.prefijo, i); intentos++; }
      if (vistos[id]) throw new Error('No pude generar un ID único en ' + h.hoja + ', renglón ' + (i + 2));
      vistos[id] = true;
      nuevos.push([id]);
      generados++;
    }
    const conId = conservados + generados;
    const enBlanco = filas - conId;
    const resumen = generados + ' IDs nuevos' +
      (conservados ? ', ' + conservados + ' que ya tenían se conservan' : '') +
      (enBlanco ? ', ' + enBlanco + ' en blanco sin tocar' : '');

    const respaldo = sobrescribe
      ? (tieneGuardado ? ', ' + Entidades.COLUMNA_ID_ANTERIOR + ' ya estaba' : ', el viejo se respalda en ' + Entidades.COLUMNA_ID_ANTERIOR)
      : ', el viejo se queda en "' + h.llaveAnterior + '"';

    if (!cfg.escribir) {
      const ejemplo = (nuevos.find((f) => f[0]) || [''])[0];
      lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + resumen +
        (ejemplo ? ', ej ' + ejemplo : '') + respaldo);
      total += conId;
      hechas++;
      return;
    }

    // 1. El valor viejo PRIMERO, y solo donde de verdad se va a perder.
    //    Renglón por renglón, no de golpe: la hoja sigue viva mientras migramos, y una
    //    fila que llegó después de la primera corrida tiene su valor viejo intacto pero
    //    su celda de respaldo vacía. Si el respaldo se saltara por estar "ya hecho", esa
    //    fila perdería su valor original al escribirle el ID nuevo encima.
    if (sobrescribe) {
      const colVieja = migLeerColumna_(sheet, posVieja, filas);
      const respaldoFinal = [];
      let respaldados = 0;
      for (let i = 0; i < filas; i++) {
        if (yaGuardado[i]) { respaldoFinal.push([yaGuardado[i]]); continue; }
        const original = colVieja[i] || '';
        // Si la columna original ya trae un ID del sistema nuevo, no hay nada viejo que
        // guardar: esa fila nació después de la migración.
        const viejo = Ids.tieneForma(original) ? '' : original;
        respaldoFinal.push([viejo]);
        if (viejo) respaldados++;
      }
      if (respaldados || !tieneGuardado) {
        const destinoViejo = migColumnaOCrear_(sheet, Entidades.COLUMNA_ID_ANTERIOR, true);
        sheet.getRange(2, destinoViejo.columna, filas, 1).setValues(respaldoFinal);
        SpreadsheetApp.flush();   // que quede en la hoja antes de pisar la columna original
      }
    }

    // 2. Ahora sí, el ID nuevo
    const destino = migColumnaOCrear_(sheet, Entidades.COLUMNA_ID, true);
    sheet.getRange(2, destino.columna, filas, 1).setValues(nuevos);

    lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + resumen +
      ', en la columna ' + destino.columna + respaldo);
    total += conId;
    hechas++;
  });

  lineas.push('', hechas + ' hojas procesadas, ' + saltadas + ' ya migradas, ' + total + ' renglones.');
  if (pendientes.length) {
    lineas.push('', 'SE ACABÓ EL TIEMPO. Faltan ' + pendientes.length + ' hojas:',
      '  ' + pendientes.join(', '),
      'Vuelve a correr lo mismo: las ya migradas se saltan solas y sigue donde se quedó.');
  } else if (!cfg.escribir) {
    lineas.push('Para escribir de verdad, corre: migracion2AsignarEscribir');
  } else {
    lineas.push('Ahora: migracion4Auditar, y después migracion3ReferenciasEnsayo');
  }
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- paso 3

/** El mapa "valor viejo → ID nuevo" de una hoja padre */
function migMapaDelPadre_(ss, nombrePadre, porLlaveNegocio) {
  const sheet = ss.getSheetByName(nombrePadre);
  if (!sheet) throw new Error('No existe la hoja padre "' + nombrePadre + '"');
  const enc = migEncabezados_(sheet);
  const filas = migFilas_(sheet);
  const posId = migColumna_(enc, Entidades.COLUMNA_ID);
  if (!posId) throw new Error('"' + nombrePadre + '" todavía no tiene columna ID: corre asignarIds primero');
  // Por omisión se une por el ID viejo; algunas hojas se unen por su llave de negocio
  const posOrigen = porLlaveNegocio
    ? migColumna_(enc, porLlaveNegocio)
    : migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR);
  if (!posOrigen) throw new Error('"' + nombrePadre + '" no tiene la columna "' + (porLlaveNegocio || Entidades.COLUMNA_ID_ANTERIOR) + '"');

  const ids = migLeerColumna_(sheet, posId, filas);
  const origen = migLeerColumna_(sheet, posOrigen, filas);
  const mapa = {};
  for (let i = 0; i < filas; i++) {
    const k = migClave_(origen[i]);
    if (k) mapa[k] = ids[i];
  }
  return mapa;
}

/**
 * Busca en el mapa tolerando lo que Sheets le hizo a los valores: un ID de 8 símbolos que
 * perdió su cero a la izquierda al guardarse como número (ya pasó con `01092110`).
 */
function migBuscar_(mapa, valor) {
  const k = migClave_(valor);
  if (!k) return null;
  if (mapa[k]) return mapa[k];
  if (/^[0-9]+$/.test(k) && k.length < 8) {
    let con = k;
    while (con.length < 8) {
      con = '0' + con;
      if (mapa[con]) return mapa[con];
    }
  }
  return null;
}

/**
 * Pone el ID nuevo del padre en cada hoja hija. Ver MIGRACION_REFERENCIAS arriba: según el
 * caso escribe EN SU LUGAR (cuando la columna del hijo guardaba el ID viejo de un padre que
 * sí se pisó) o en una COLUMNA NUEVA (cuando guarda una llave de negocio, que no se toca).
 */
function reescribirReferencias(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'REESCRIBIENDO REFERENCIAS' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const huerfanas = [];

  MIGRACION_REFERENCIAS.forEach((ref) => {
    const sheet = ss.getSheetByName(ref.hoja);
    if (!sheet) { lineas.push('  ' + ref.hoja + ': NO EXISTE, se salta'); return; }
    const filas = migFilas_(sheet);
    if (!filas) return;
    const enc = migEncabezados_(sheet);
    const pos = migColumna_(enc, ref.columna);
    if (!pos) { lineas.push('  ' + ref.hoja + '.' + ref.columna + ': no existe la columna'); return; }

    // ¿La columna del hijo se pisa, o el ID va aparte? Lo dice el catálogo, no se escribe
    // a mano: si al padre le pisamos su columna "ID", la del hijo ya no apunta a nada.
    const padreDef = Entidades.de(ref.padre);
    const enSitio = !!(padreDef && padreDef.pisaLlaveAnterior);
    if (!enSitio && !ref.destino) {
      lineas.push('  ' + ref.hoja + '.' + ref.columna + ': le falta "destino" en el catálogo, se salta');
      return;
    }
    const nombreDestino = enSitio ? ref.columna : ref.destino;
    const posDestino = enSitio ? pos : migColumnaOCrear_(sheet, nombreDestino, cfg.escribir).columna;
    if (!enSitio && !posDestino && cfg.escribir) {
      lineas.push('  ' + ref.hoja + ': no pude crear la columna "' + nombreDestino + '"');
      return;
    }

    const mapa = migMapaDelPadre_(ss, ref.padre, ref.porLlaveNegocio);
    const valores = migLeerColumna_(sheet, pos, filas);
    // Lo que ya haya en el destino: así volver a correr esto no rehace lo hecho
    const yaEnDestino = (!enSitio && posDestino) ? migLeerColumna_(sheet, posDestino, filas) : valores;
    const salida = [];
    let cambiadas = 0, sueltas = 0, vacias = 0, yaEstaban = 0;

    valores.forEach((v, i) => {
      const puesto = yaEnDestino[i];
      // Ya tiene la forma nueva: viene de una corrida anterior. Se deja y no cuenta como
      // huérfana — es lo que hace que volver a correr esto sea inofensivo.
      if (puesto && Ids.tieneForma(puesto)) { salida.push([puesto]); yaEstaban++; return; }
      if (!v) { salida.push(['']); vacias++; return; }
      const nuevo = migBuscar_(mapa, v);
      if (nuevo) { salida.push([nuevo]); cambiadas++; }
      else {
        // Nunca se inventa un padre ni se borra nada. En su lugar se conserva lo que había;
        // aparte, el destino se queda vacío para que la huérfana se vea.
        salida.push([enSitio ? v : '']);
        sueltas++;
        if (huerfanas.length < 40) huerfanas.push(ref.hoja + '.' + ref.columna + ' fila ' + (i + 2) + ': ' + v);
      }
    });

    if (yaEstaban && !cambiadas && !sueltas) {
      lineas.push('  ' + ref.hoja + '.' + ref.columna + ' -> ' + ref.padre + ': YA MIGRADA (' +
        yaEstaban + ' referencias), se salta');
      return;
    }
    const tasa = cambiadas / Math.max(1, cambiadas + sueltas);
    let nota = '';
    if (ref.esperado && Math.abs(tasa - ref.esperado) > 0.05) {
      nota = '  <-- OJO: esperaba ' + Math.round(ref.esperado * 100) + '%';
    }
    if (ref.revisar) nota += '  (columna marcada para revisar con Emmanuel)';
    const donde = enSitio
      ? 'sobre la misma columna'
      : 'en la columna nueva "' + nombreDestino + '" (se respeta "' + ref.columna + '")';
    lineas.push('  ' + ref.hoja + '.' + ref.columna + ' -> ' + ref.padre + ': ' +
      cambiadas + ' cambiadas, ' + sueltas + ' huérfanas, ' + vacias + ' vacías' +
      (yaEstaban ? ', ' + yaEstaban + ' ya migradas' : '') +
      ' (' + Math.round(tasa * 100) + '%), ' + donde + nota);

    if (cfg.escribir) sheet.getRange(2, posDestino, filas, 1).setValues(salida);
  });

  if (huerfanas.length) {
    lineas.push('', 'HUÉRFANAS (se dejaron intactas, primeras ' + huerfanas.length + '):');
    huerfanas.forEach((h) => lineas.push('  - ' + h));
  }
  if (!cfg.escribir) lineas.push('', 'Para escribir de verdad, corre: migracion3ReferenciasEscribir');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- acomodo

/**
 * Deja la columna ID como la PRIMERA de cada hoja.
 *
 * La migración la agregó al final, que es lo seguro para escribir pero incómodo para leer:
 * en INSPECCION VEHICULAR quedó en la columna 197, o sea invisible sin desplazarse a lo
 * ancho. Al inicio se ve de un vistazo.
 *
 * Nuestro código no se entera: busca las columnas por su ENCABEZADO, no por su posición
 * (ver SheetUtils.indiceDeColumnas y migColumna_). La excepción está abajo.
 *
 * OJO PARA PRODUCCIÓN: reordenar columnas rompe la app de AppSheet igual que agregarlas,
 * hasta que alguien regenere el esquema (ver docs/ids.md). En la copia de pruebas da lo
 * mismo porque AppSheet no la lee, pero allá esto va junto con el apagado.
 */
function moverIdsAlInicio(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'MOVIENDO LA COLUMNA ID AL INICIO' : 'ENSAYO (no mueve nada)') + ' — ' + ssId, ''];
  let movidas = 0;

  Entidades.todas().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const enc = migEncabezados_(sheet);
    const pos = migColumna_(enc, Entidades.COLUMNA_ID);
    if (!pos) { lineas.push('  ' + h.hoja + ': todavía no tiene columna ID, se salta'); return; }
    if (pos === 1) { lineas.push('  ' + h.hoja + ': ya está al inicio'); return; }

    // La única que depende de POSICIONES y no de encabezados: su llave vieja está en la
    // columna 1 y no tiene nombre, así que moverle algo adelante la correría a la 2 y
    // Entidades apuntaría al lugar equivocado. Se arregla poniéndole nombre (paso 1).
    if (!h.llaveAnterior && h.columnaAnterior) {
      lineas.push('  ' + h.hoja + ': NO se mueve — su llave vieja va por posición (columna ' +
        h.columnaAnterior + ') porque no tiene encabezado. Ponle nombre primero.');
      return;
    }

    lineas.push('  ' + h.hoja + ': de la columna ' + pos + ' a la 1' +
      (cfg.escribir ? '  MOVIDA' : ''));
    if (cfg.escribir) {
      sheet.moveColumns(sheet.getRange(1, pos, 1, 1), 1);
      SpreadsheetApp.flush();
    }
    movidas++;
  });

  lineas.push('', movidas + ' hojas por mover.');
  if (!cfg.escribir && movidas) lineas.push('Para moverlas, corre: migracionMoverIdsAlInicioEscribir');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- limpieza

/**
 * Quita la columna ID ANTERIOR de las hojas donde sobra.
 *
 * Solo hace falta en las hojas cuya columna original se llama "ID", porque ahí el ID nuevo
 * la pisa. En las demás —ID_VEHICULO, ID_SENSOR, ID CCH…— la original se queda intacta, así
 * que el respaldo guarda dos veces lo mismo. Una versión anterior lo creaba en las 23.
 *
 * Nunca borra a ciegas: comprueba renglón por renglón que el valor respaldado siga
 * existiendo igualito en la columna original. Si difiere en uno solo, no toca esa hoja.
 */
function limpiarRespaldoRedundante(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'QUITANDO RESPALDOS QUE SOBRAN' : 'ENSAYO (no borra nada)') + ' — ' + ssId, ''];
  let quitadas = 0;

  Entidades.migrables().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const filas = migFilas_(sheet);
    if (!filas) return;

    const enc = migEncabezados_(sheet);
    const posGuardada = migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR);
    if (!posGuardada) return;   // no tiene respaldo, nada que hacer

    if (h.pisaLlaveAnterior) {
      lineas.push('  ' + h.hoja + ': el respaldo SÍ hace falta (su columna se llama ID), se deja');
      return;
    }
    const posVieja = h.llaveAnterior ? migColumna_(enc, h.llaveAnterior) : (h.columnaAnterior || 0);
    if (!posVieja) {
      lineas.push("  " + h.hoja + ": ya no encuentro su llave anterior, NO se toca el respaldo");
      return;
    }
    // La llave anterior Y el respaldo son la MISMA columna. Desde que el respaldo se llama
    // "ID ANTERIOR" y no "ID APPSHEET" esto ya no debería ocurrir con ninguna hoja del
    // catálogo (ver la nota de Entidades.COLUMNA_ID_ANTERIOR). Se deja porque el costo es
    // una comparación y lo que evita es borrar una columna original: si algún día alguien
    // nombra "ID ANTERIOR" a la llave de una hoja, esto lo detiene.
    if (posVieja === posGuardada) {
      lineas.push('  ' + h.hoja + ': su llave anterior ES la columna ' +
        Entidades.COLUMNA_ID_ANTERIOR + ', no es un respaldo de más. NO se toca.');
      return;
    }

    const guardado = migLeerColumna_(sheet, posGuardada, filas);
    const original = migLeerColumna_(sheet, posVieja, filas);
    // Solo importan los respaldos que SÍ traen algo. Uno vacío no guarda nada, así que
    // borrar la columna no pierde nada — y pasa seguido: estas hojas siguen recibiendo
    // registros, y una fila más nueva que el respaldo lo tiene vacío mientras su valor
    // real sigue intacto en su columna de siempre.
    let distintos = 0, vacios = 0;
    for (let i = 0; i < filas; i++) {
      if (!guardado[i]) { if (original[i]) vacios++; continue; }
      if (migClave_(guardado[i]) !== migClave_(original[i])) distintos++;
    }
    if (distintos) {
      lineas.push('  ' + h.hoja + ': el respaldo guarda algo DISTINTO de "' + h.llaveAnterior +
        '" en ' + distintos + ' renglones, NO se toca');
      return;
    }
    const nota = vacios ? ' (' + vacios + ' filas más nuevas que el respaldo, su valor sigue en su columna)' : '';

    const nombreVieja = h.llaveAnterior || ('la columna ' + h.columnaAnterior + ', que no tiene encabezado');
    lineas.push('  ' + h.hoja + ': sobra (idéntico a "' + nombreVieja + '")' + nota +
      (cfg.escribir ? ', columna ' + posGuardada + ' BORRADA' : ''));
    if (cfg.escribir) sheet.deleteColumn(posGuardada);
    quitadas++;
  });

  lineas.push('', quitadas + ' hojas con respaldo de más.');
  if (!cfg.escribir && quitadas) lineas.push('Para borrarlas, corre: migracionLimpiarRespaldoEscribir');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- verificación

/** Comprueba lo de docs/ids-asignacion.md, sección 7. No escribe nada. */
function auditarIds(opciones) {
  const ssId = migracionSs_(opciones || {});
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = ['AUDITORÍA — ' + ssId, ''];
  const fallas = [];

  Entidades.migrables().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const filas = migFilas_(sheet);
    if (!filas) return;
    const enc = migEncabezados_(sheet);
    const pos = migColumna_(enc, Entidades.COLUMNA_ID);
    if (!pos) { fallas.push(h.hoja + ': no tiene columna ' + Entidades.COLUMNA_ID); return; }

    const ids = migLeerColumna_(sheet, pos, filas);
    const enBlanco = migFilasVacias_(sheet, filas);
    // Un renglón en blanco sin ID está bien; uno CON datos y sin ID, no
    const vacios = ids.filter((v, i) => !v && !enBlanco[i]).length;
    const malos = ids.filter((v) => v && !Ids.tieneForma(v)).length;
    const ajenos = ids.filter((v) => v && Ids.tieneForma(v) && Ids.prefijo(v) !== h.prefijo).length;
    const vistos = {};
    let repetidos = 0;
    ids.forEach((v) => { if (v) { if (vistos[v]) repetidos++; else vistos[v] = true; } });
    let desordenados = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] && ids[i - 1] && ids[i] < ids[i - 1]) desordenados++;

    if (vacios) fallas.push(h.hoja + ': ' + vacios + ' renglones CON DATOS y sin ID');
    if (malos) fallas.push(h.hoja + ': ' + malos + ' IDs con forma inválida');
    if (ajenos) fallas.push(h.hoja + ': ' + ajenos + ' IDs con el prefijo de otra hoja');
    if (repetidos) fallas.push(h.hoja + ': ' + repetidos + ' IDs repetidos');
    if (desordenados) fallas.push(h.hoja + ': ' + desordenados + ' IDs fuera del orden de la hoja');
    lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + filas + ' renglones' +
      (vacios + malos + ajenos + repetidos + desordenados ? '  <-- CON PROBLEMAS' : '  ok'));
  });

  lineas.push('', fallas.length ? 'FALLAS (' + fallas.length + '):' : 'Todo cuadra.');
  fallas.forEach((f) => lineas.push('  - ' + f));
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}
