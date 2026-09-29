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

/** PASO 2, de verdad — ESCRIBE la columna ID y guarda el valor viejo en ID APPSHEET.
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

/** Quita las columnas ID APPSHEET que sobran, ensayo — Solo lee. */
function migracionLimpiarRespaldoEnsayo() {
  return limpiarRespaldoRedundante();
}

/** Quita las columnas ID APPSHEET que sobran, de verdad — BORRA columnas.
 *  Solo borra donde el valor sigue existiendo íntegro en su columna original. */
function migracionLimpiarRespaldoEscribir() {
  return limpiarRespaldoRedundante({ escribir: true });
}

/** El spreadsheet de producción. Aquí NO se escribe mientras AppSheet siga vivo. */
const MIGRACION_SS_PRODUCCION = '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk';


/**
 * Las referencias medidas contra los datos reales (no supuestas). El % es cuántos valores
 * del hijo existían en el padre al 29/09/2026; sirve para saber si el resultado cuadra.
 */
const MIGRACION_REFERENCIAS = [
  { hoja: 'VERIFICACIONES', columna: 'FOLIO VEHICULO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', esperado: 1.00 },
  { hoja: 'REASIGNACIONES_VEHICULOS', columna: 'Folio Vehiculo', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', esperado: 1.00 },
  { hoja: 'INSTALACION DE SENSORES', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', esperado: 0.99 },
  { hoja: 'INSPECCION VEHICULAR', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', esperado: 0.996 },
  { hoja: 'HOLOGRAMAS', columna: 'SERIE VEHICULO', padre: 'VEHICULOS', porLlaveNegocio: 'SERIE VEHICULO', opcional: true },
  { hoja: 'CAMBIOS VEHICULOS', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', esperado: 0.73 },
  { hoja: 'INSPECCIONES LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.999 },
  { hoja: 'RESPONSIVAS LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.998 },
  { hoja: 'BITACORA DE DESECHO', columna: 'ID_EQUIPO', padre: 'LINEAS TELEFONICAS', esperado: 1.00 },
  { hoja: 'CAMBIOS LINEAS TELEFONICAS', columna: 'ID_LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.981 },
  // La columna se llama IMEI pero 290 de 321 valores son IDs de línea (pendiente Emmanuel)
  { hoja: 'REACTIVACION DE LINEAS', columna: 'IMEI', padre: 'LINEAS TELEFONICAS', esperado: 0.89, revisar: true },
  { hoja: 'MOVIMIENTOS_ACCESORIOS', columna: 'ID_Accesorio', padre: 'ACCESORIOS CELULARES', esperado: 0.95 },
  { hoja: 'ARQUEOS', columna: 'ID CCH', padre: 'CAJAS CHICAS', porLlaveNegocio: 'ID CCH', esperado: 1.00 },
  { hoja: 'INCREMENTOS', columna: 'ID CCH', padre: 'CAJAS CHICAS', porLlaveNegocio: 'ID CCH', esperado: 1.00 },
  // Se me había escapado: 1,470 filas en producción, con 99.9% de coincidencia. Al migrar
  // LINEAS TELEFONICAS sin reescribir esta columna, sus 1,167 referencias en la copia de
  // pruebas quedaron huérfanas de un jalón.
  { hoja: 'HISTORIAL_REASIGNACIONES', columna: 'ID Linea', padre: 'LINEAS TELEFONICAS', esperado: 0.999 },
  // Pestañas del sistema nuevo (solo existen en pruebas). ID_REGISTRO es polimórfica:
  // apunta a INSPECCIONES LINEAS o a RESPONSIVAS LINEAS según la columna TIPO.
  { hoja: 'APP_EVIDENCIAS', columna: 'ID_LINEA', padre: 'LINEAS TELEFONICAS', esperado: 1.00 },
];




// ---------------------------------------------------------------- utilidades

function migracionSs_(opciones) {
  const id = (opciones && opciones.spreadsheetId) || Config.SPREADSHEET_IDS.VEHICULOS();
  if (id === MIGRACION_SS_PRODUCCION && opciones && opciones.escribir) {
    const permiso = PropertiesService.getScriptProperties()
      .getProperty('MIGRACION_IDS_AUTORIZAR_PRODUCCION');
    if (permiso !== id) {
      throw new Error(
        'Este es el spreadsheet de PRODUCCIÓN. Agregar una columna rompe la app de AppSheet ' +
        'hasta que alguien regenere el esquema, y deja sin trabajar a la gente en campo. ' +
        'Si AppSheet ya está apagado, pon la Script Property ' +
        'MIGRACION_IDS_AUTORIZAR_PRODUCCION con el id del spreadsheet.');
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

/** La columna, y si no existe la agrega al final (devolviendo su posición) */
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
 * Llena la columna ID de cada hoja y guarda el valor viejo en ID APPSHEET.
 * Sin { escribir: true } solo dice qué haría.
 *
 * El ID de cada renglón sale de su POSICIÓN en la hoja, no de ninguna columna de fecha:
 * ver docs/ids-asignacion.md, sección 2.
 *
 * SE PUEDE VOLVER A CORRER sin miedo. Apps Script corta la ejecución a los minutos, y con
 * 23 hojas (una de 33,640 renglones) es probable que se interrumpa a medias:
 *
 *   - Una hoja ya migrada se SALTA. La segunda corrida sigue donde se quedó.
 *   - ID APPSHEET nunca se pisa si ya trae datos. Es el único valor irrecuperable: en las
 *     hojas cuya columna se llama "ID", volver a leer de ahí daría los IDs NUEVOS y los
 *     copiaría encima de los originales, borrándolos para siempre.
 *   - Se detiene sola antes del límite de tiempo y dice en qué hoja se quedó.
 *
 * Con { rehacer: true } vuelve a generar el ID aunque la hoja ya esté migrada (el valor
 * viejo se sigue respetando, porque se lee de ID APPSHEET).
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

    // Si ID APPSHEET ya tiene datos, ESA es la verdad: la columna original pudo haber sido
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

    // 1. El valor viejo PRIMERO, y solo si de verdad se va a perder
    if (sobrescribe && !tieneGuardado) {
      const colVieja = migLeerColumna_(sheet, posVieja, filas);
      const destinoViejo = migColumnaOCrear_(sheet, Entidades.COLUMNA_ID_ANTERIOR, true);
      sheet.getRange(2, destinoViejo.columna, filas, 1).setValues(colVieja.map((v) => [v]));
      SpreadsheetApp.flush();   // que quede en la hoja antes de pisar la columna original
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

/** Cambia las columnas que apuntan a otra hoja, del valor viejo al ID nuevo. */
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
    const pos = migColumna_(migEncabezados_(sheet), ref.columna);
    if (!pos) { lineas.push('  ' + ref.hoja + '.' + ref.columna + ': no existe la columna'); return; }

    const mapa = migMapaDelPadre_(ss, ref.padre, ref.porLlaveNegocio);
    const valores = migLeerColumna_(sheet, pos, filas);
    const salida = [];
    let cambiadas = 0, sueltas = 0, vacias = 0, yaEstaban = 0;

    valores.forEach((v, i) => {
      if (!v) { salida.push(['']); vacias++; return; }
      // Ya tiene la forma nueva: viene de una corrida anterior. Se deja y no cuenta como
      // huérfana — es lo que hace que volver a correr esto sea inofensivo.
      if (Ids.tieneForma(v)) { salida.push([v]); yaEstaban++; return; }
      const nuevo = migBuscar_(mapa, v);
      if (nuevo) { salida.push([nuevo]); cambiadas++; }
      else {
        salida.push([v]);   // nunca se inventa un padre ni se borra el renglón
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
    lineas.push('  ' + ref.hoja + '.' + ref.columna + ' -> ' + ref.padre + ': ' +
      cambiadas + ' cambiadas, ' + sueltas + ' huérfanas, ' + vacias + ' vacías' +
      (yaEstaban ? ', ' + yaEstaban + ' ya migradas' : '') +
      ' (' + Math.round(tasa * 100) + '%)' + nota);

    if (cfg.escribir) sheet.getRange(2, pos, filas, 1).setValues(salida);
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

// ---------------------------------------------------------------- limpieza

/**
 * Quita la columna ID APPSHEET de las hojas donde sobra.
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

    const guardado = migLeerColumna_(sheet, posGuardada, filas);
    const original = migLeerColumna_(sheet, posVieja, filas);
    let distintos = 0;
    for (let i = 0; i < filas; i++) {
      if (migClave_(guardado[i]) !== migClave_(original[i])) distintos++;
    }
    if (distintos) {
      lineas.push('  ' + h.hoja + ': el respaldo NO coincide con "' + h.llaveAnterior + '" en ' +
        distintos + ' renglones, NO se toca');
      return;
    }

    const nombreVieja = h.llaveAnterior || ('la columna ' + h.columnaAnterior + ', que no tiene encabezado');
    lineas.push('  ' + h.hoja + ': sobra (idéntico a "' + nombreVieja + '" en ' + filas + ' renglones)' +
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
