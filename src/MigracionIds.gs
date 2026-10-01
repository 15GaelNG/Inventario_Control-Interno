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

/**
 * EL SELLO.
 *
 * Mientras los IDs solo están en su columna, regenerarlos es inofensivo: se tiran unos
 * valores y se ponen otros. Pero en cuanto `reescribirReferencias` los copia a las hojas
 * hijas —`ID VEHICULO`, `ID LINEA`, `ID CAJA CHICA`—, esos IDs dejan de ser un dato y se
 * vuelven la **llave de la que cuelga todo**. Regenerarlos entonces no los "actualiza":
 * deja huérfana cada referencia, en silencio y sin forma de reconstruirla, porque el
 * vínculo viejo ya se sobrescribió.
 *
 * Por eso, desde el momento en que se escriben referencias en un libro, ese libro queda
 * SELLADO: `asignarIds({rehacer:true})` y la reversa se niegan a correr ahí.
 *
 * Se guarda el id del libro, no un booleano, para que sellar el laboratorio no selle
 * producción ni al revés.
 *
 * Para quitarlo hace falta borrar la Script Property a mano. Es a propósito: si alguien de
 * verdad necesita regenerar los IDs de un libro sellado, el camino correcto es volver a
 * correr `reescribirReferencias` después, y eso más vale que sea una decisión consciente.
 */
const MIGRACION_PROP_SELLO = 'MIGRACION_IDS_SELLADOS';

/** ¿Este libro ya tiene referencias escritas contra sus IDs? */
function migracionSellado_(ssId) {
  const v = PropertiesService.getScriptProperties().getProperty(MIGRACION_PROP_SELLO) || '';
  return v.split(',').some((x) => x.trim() === ssId);
}

/** Deja constancia de que este libro ya tiene referencias colgando de sus IDs. */
function migracionSellar_(ssId) {
  const props = PropertiesService.getScriptProperties();
  const v = props.getProperty(MIGRACION_PROP_SELLO) || '';
  const ya = v.split(',').map((x) => x.trim()).filter(Boolean);
  if (ya.indexOf(ssId) !== -1) return false;
  ya.push(ssId);
  props.setProperty(MIGRACION_PROP_SELLO, ya.join(','));
  return true;
}

/** Truena si el libro está sellado. `que` es lo que se iba a intentar. */
function migracionExigirSinSello_(ssId, que) {
  if (!migracionSellado_(ssId)) return;
  throw new Error(
    'Este libro está SELLADO: ya tiene referencias escritas contra sus IDs, así que ' + que +
    ' dejaría huérfana cada una de ellas, en silencio. Si de verdad hace falta, borra la ' +
    'Script Property ' + MIGRACION_PROP_SELLO + ' y vuelve a correr reescribirReferencias ' +
    'DESPUÉS. Corre migracionEstadoSello para ver qué libros están sellados.');
}

/** Qué libros están sellados y qué significa. Solo lee. */
function migracionEstadoSello() {
  const v = PropertiesService.getScriptProperties().getProperty(MIGRACION_PROP_SELLO) || '';
  const libros = v.split(',').map((x) => x.trim()).filter(Boolean);
  const actual = Config.SPREADSHEET_IDS.VEHICULOS();
  const lineas = ['SELLO DE LOS IDS', ''];
  if (!libros.length) {
    lineas.push('  Ningún libro está sellado todavía.');
    lineas.push('  Un libro se sella solo, en cuanto reescribirReferencias escribe en él.');
  } else {
    lineas.push('  Libros sellados (' + libros.length + '):');
    libros.forEach((l) => lineas.push('    ' + l + (l === actual ? '   <-- el que está apuntado' : '')));
  }
  lineas.push('');
  lineas.push('  Este proyecto apunta a: ' + actual);
  lineas.push('  Sellado: ' + (migracionSellado_(actual) ? 'SÍ' : 'no'));
  lineas.push('');
  lineas.push('  Sellado significa que ya hay referencias colgando de esos IDs, así que');
  lineas.push('  regenerarlos o deshacerlos dejaría huérfana cada una. Ver MIGRACION_PROP_SELLO.');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
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
  // 0.79, no 0.73: el 0.73 era de una medicion vieja y quedo aqui despues de re-medir, asi
  // que la corrida del 30/09 grito "OJO: esperaba 73%" habiendo salido MEJOR de lo esperado.
  // Una alarma que grita sin razon en cada corrida ensena a ignorar las alarmas.
  { hoja: 'CAMBIOS VEHICULOS', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 0.79 },
  // Se me habia escapado, igual que HISTORIAL_REASIGNACIONES: es de la familia de
  // vehiculos y no estaba en el mapa. Hoy trae 1 sola fila y empareja al 100%, asi que
  // cuesta nada; pero si no esta aqui, el dia que crezca queda huerfana en silencio.
  { hoja: 'INCIDENCIAS', columna: 'FOLIO', padre: 'VEHICULOS', porLlaveNegocio: 'FOLIO', destino: 'ID VEHICULO', esperado: 1.00 },
  // TICKETS NO va aqui, aunque tenga PLACA. Medido el 30/09/2026: su columna PLACA trae
  // 'VARIAS' x119, 'VARIOS' x17, celdas con DOS placas ('UKR913H, ULP697K') y 202 vacias.
  // Un ticket puede no hablar de ningun vehiculo, de uno, o de varios, asi que una sola
  // columna ID VEHICULO no lo puede representar: seria una tabla puente. Y sus TIPO
  // ATENCION son de tarjetas de combustible, hologramas y Uber, no de una unidad.
  // Padre LINEAS TELEFONICAS: su columna se llamaba "ID" y la migración la pisó, así que
  // estas columnas se reescriben en su lugar (si no, ya no apuntan a nada).
  { hoja: 'INSPECCIONES LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.999 },
  { hoja: 'RESPONSIVAS LINEAS', columna: 'ID LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.998 },
  { hoja: 'CAMBIOS LINEAS TELEFONICAS', columna: 'ID_LINEA', padre: 'LINEAS TELEFONICAS', esperado: 0.981 },
  // Aquí estaban las referencias de HISTORIAL_REASIGNACIONES, REACTIVACION DE LINEAS y
  // BITACORA DE DESECHO. Las tres hojas se eliminaron el 30/09/2026 (ver la nota de las
  // cuatro hojas en Entidades.gs). Si vuelven, sus tasas medidas en producción eran
  // 99.9%, 89% (columna IMEI, que en realidad guardaba IDs de línea) y 100%.
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

/**
 * Dónde está la llave ANTERIOR de una hoja, aguantando que ya se haya renombrado.
 *
 * Existe porque el paso `renombrar` cambia el nombre de esa columna a "ID ANTERIOR", y los
 * pasos que la leen tienen que funcionar ANTES y DESPUÉS de ese cambio — si no, el orden de
 * los pasos se vuelve una trampa y correr dos veces rompe la migración. Busca primero el
 * nombre nuevo, luego el del catálogo, y hasta el final la posición (la única hoja que
 * depende de posición es la que no tenía encabezado).
 *
 * @return {number} posición base 1, o 0 si no está
 */
function migColumnaAnterior_(encabezados, h) {
  const yaRenombrada = migColumna_(encabezados, Entidades.COLUMNA_ID_ANTERIOR);
  if (yaRenombrada) return yaRenombrada;
  if (h.llaveAnterior) {
    const porNombre = migColumna_(encabezados, h.llaveAnterior);
    if (porNombre) return porNombre;
  }
  return h.columnaAnterior || 0;
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
  const cfg = Object.assign({ familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = ['REVISIÓN PREVIA — spreadsheet ' + ssId +
    (cfg.familia ? '  ·  solo la familia "' + cfg.familia + '"' : ''), ''];
  const problemas = [];

  Entidades.deFamilia(cfg.familia).forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { problemas.push('FALTA la hoja "' + h.hoja + '"'); return; }
    const enc = migEncabezados_(sheet);
    const filas = migFilas_(sheet);
    const posId = migColumnaAnterior_(enc, h);
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
        // Un renglón con datos y sin llave vieja NO es un problema si la hoja ya está
        // migrada: significa que nació DESPUÉS, por la app o por AppSheet, y nunca tuvo un
        // id de AppSheet que respaldar. Su 'ID ANTERIOR' se queda vacío, que es lo
        // correcto — la reversa tampoco le inventa uno (ver migracion-pipeline.test.js).
        //
        // Es problema solo si además les falta el ID NUEVO: ahí sí hay renglones sueltos.
        const posNueva = migColumna_(enc, Entidades.COLUMNA_ID);
        let sinNinguno = sinIdConDatos;
        if (posNueva) {
          const nuevos = migLeerColumna_(sheet, posNueva, filas);
          sinNinguno = valores.filter((v, i) =>
            !v && !vacias[i] && !Ids.tieneForma(migLimpio_(nuevos[i]))).length;
        }
        if (sinNinguno) {
          problemas.push(h.hoja + ': ' + sinNinguno + ' renglones CON DATOS y sin ningún id ' +
            '(ni el viejo ni el nuevo)');
        } else {
          detalles.push(sinIdConDatos + ' nacidos después de migrar (ya traen el ID nuevo, ' +
            'su "' + Entidades.COLUMNA_ID_ANTERIOR + '" se queda vacío)');
        }
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
      if (c) return;
      // La columna que el paso `renombrar` va a nombrar NO es un problema: en dos minutos
      // se va a llamar "ID ANTERIOR". Reportarla detenia la corrida que escribe, porque
      // este paso marca PROBLEMAS y el orquestador se para ahi. Es el caso de
      // CAMBIOS LINEAS TELEFONICAS, cuya llave vive en la columna 1 sin encabezado.
      if (h.columnaAnterior && (i + 1) === h.columnaAnterior) {
        detalles.push('su columna ' + (i + 1) + ' no tiene encabezado, y el paso ' +
          '"renombrar" le va a poner "' + Entidades.COLUMNA_ID_ANTERIOR + '"');
        return;
      }
      // Igual que la de arriba: si el paso "renombrar" le va a poner un nombre deducido
      // del contenido, no es un problema. Si no se filtrara, el paso 1 marcaria PROBLEMAS
      // y detendria la corrida que escribe por una columna que se arregla sola.
      const deducido = ENCABEZADOS_DEDUCIDOS.filter((d) => {
        if (migClave_(d.hoja) !== migClave_(h.hoja)) return false;
        const donde = migDeducidoDonde_(enc, d);
        return donde.columna === (i + 1);
      })[0];
      if (deducido) {
        detalles.push('su columna ' + (i + 1) + ' no tiene encabezado, y el paso ' +
          '"renombrar" le va a poner "' + deducido.nombre + '" (deducido del contenido)');
        return;
      }
      problemas.push(h.hoja + ': la columna ' + (i + 1) + ' no tiene encabezado');
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
  const cfg = Object.assign({ escribir: false, hojas: null, rehacer: false, familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  // Regenerar con rehacer:true es lo único de este paso que destruye: pisa IDs que ya
  // existen. Si el libro está sellado, hay referencias colgando de ellos.
  if (cfg.rehacer && cfg.escribir) {
    migracionExigirSinSello_(ssId, 'volver a generar los IDs desde cero');
  }
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'ASIGNANDO IDs' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const arranque = Date.now();
  const LIMITE_MS = 4.5 * 60 * 1000;   // Apps Script corta a los 6 min; paramos antes
  let total = 0, hechas = 0, saltadas = 0;
  const pendientes = [];

  Entidades.deFamilia(cfg.familia).forEach((h) => {
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
    const posVieja = migColumnaAnterior_(enc, h);
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

/**
 * El mapa "valor viejo → ID nuevo" de una hoja padre.
 *
 * Cuando se une por el ID viejo (no por llave de negocio), el mapa junta TODAS las
 * generaciones de ID que el padre conserva, no solo "ID ANTERIOR". El libro del equipo se
 * migró dos veces con código distinto, y LINEAS TELEFONICAS quedó con tres:
 *
 *   ID            LIN-… del 30/09, el vigente
 *   ID ANTERIOR   LIN-… del 29/09
 *   ID APPSHEET   873bb085 / DV1SD13 / DG001, el de AppSheet
 *
 * y sus hijas citan casi todas al de AppSheet (medido el 01/10/2026: 1,428 de 1,437 en
 * INSPECCIONES LINEAS, 33,526 de 33,664 en CAMBIOS), unas pocas al del 29/09 (las que la
 * app capturó entre corridas) y NINGUNA al vigente. Con solo "ID ANTERIOR" el pipeline
 * reportaba casi todo como huérfano.
 *
 * El vigente también entra, apuntándose a sí mismo: así una referencia ya reescrita se
 * reconoce como hecha, y una con forma de ID pero de otra generación no se confunde con ella.
 *
 * Un valor que aparezca en dos renglones distintos no se adivina: se saca del mapa y queda
 * como huérfano, que es lo que se reporta.
 */
function migMapaDelPadre_(ss, nombrePadre, porLlaveNegocio) {
  const sheet = ss.getSheetByName(nombrePadre);
  if (!sheet) throw new Error('No existe la hoja padre "' + nombrePadre + '"');
  const enc = migEncabezados_(sheet);
  const filas = migFilas_(sheet);
  const posId = migColumna_(enc, Entidades.COLUMNA_ID);
  if (!posId) throw new Error('"' + nombrePadre + '" todavía no tiene columna ID: corre asignarIds primero');
  const ids = migLeerColumna_(sheet, posId, filas);

  // Por omisión se une por el ID viejo; algunas hojas se unen por su llave de negocio
  if (porLlaveNegocio) {
    // Si la "llave de negocio" es en realidad la llave vieja del padre, el paso `renombrar`
    // ya la llamó "ID ANTERIOR" (ACCESORIOS CELULARES.ID_Accesorio, 01/10/2026). Se busca
    // con migColumnaAnterior_, que aguanta los dos nombres.
    const def = Entidades.existe(nombrePadre) ? Entidades.de(nombrePadre) : null;
    const esLaAnterior = def && def.llaveAnterior && migClave_(def.llaveAnterior) === migClave_(porLlaveNegocio);
    const pos = migColumna_(enc, porLlaveNegocio) || (esLaAnterior ? migColumnaAnterior_(enc, def) : 0);
    if (!pos) throw new Error('"' + nombrePadre + '" no tiene la columna "' + porLlaveNegocio + '"');
    const origen = migLeerColumna_(sheet, pos, filas);
    const mapa = {};
    for (let i = 0; i < filas; i++) {
      const k = migClave_(origen[i]);
      if (k) mapa[k] = ids[i];
    }
    return mapa;
  }

  const generaciones = [Entidades.COLUMNA_ID_ANTERIOR, Entidades.COLUMNA_ID_ANTERIOR_LEGADO]
    .map((n) => migColumna_(enc, n))
    .filter(Boolean);
  if (!generaciones.length) throw new Error('"' + nombrePadre + '" no tiene la columna "' + Entidades.COLUMNA_ID_ANTERIOR + '"');

  const mapa = {};
  const ambiguos = {};
  const poner = (valor, id) => {
    const k = migClave_(valor);
    if (!k || !id || ambiguos[k]) return;
    if (mapa[k] && mapa[k] !== id) { delete mapa[k]; ambiguos[k] = true; return; }
    mapa[k] = id;
  };
  ids.forEach((id) => poner(id, id));
  generaciones.forEach((pos) => {
    migLeerColumna_(sheet, pos, filas).forEach((v, i) => poner(v, ids[i]));
  });
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
  const cfg = Object.assign({ escribir: false, familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'REESCRIBIENDO REFERENCIAS' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  const huerfanas = [];

  // El filtro va por la familia de la hoja HIJA, no del padre: así, al correr solo
  // "vehiculos", CAMBIOS LINEAS TELEFONICAS no se toca aunque su padre exista.
  const refs = MIGRACION_REFERENCIAS.filter((ref) => {
    if (!cfg.familia) return true;
    const e = Entidades.existe(ref.hoja) ? Entidades.de(ref.hoja) : null;
    return !!e && (e.familia || 'otros') === String(cfg.familia).trim().toLowerCase();
  });
  refs.forEach((ref) => {
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
      //
      // Sobre la misma columna, la forma no basta: un LIN-… del 29/09 tiene forma de ID y ya
      // no es el vigente. Ahí solo cuenta como hecho si el padre lo tiene como su ID de hoy.
      const hecho = puesto && Ids.tieneForma(puesto) &&
        (!enSitio || migBuscar_(mapa, puesto) === migLimpio_(puesto));
      if (hecho) { salida.push([puesto]); yaEstaban++; return; }
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
  // Aquí es donde los IDs dejan de ser un dato y se vuelven la llave de la que cuelga todo:
  // desde esta escritura, regenerarlos o deshacerlos deja huérfano lo que acaba de cablearse.
  if (cfg.escribir && migracionSellar_(ssId)) {
    lineas.push('');
    lineas.push('  Este libro queda SELLADO: desde ahora hay referencias colgando de sus');
    lineas.push('  IDs, así que regenerarlos o deshacerlos los dejaría huérfanos. Las');
    lineas.push('  funciones que lo harían se van a negar. Ver migracionEstadoSello.');
  }
  // Dentro de un pipeline de familia el pie del pipeline ya dice qué correr (lineas2Escribir…);
  // este nombre solo aplica cuando se corre suelto.
  if (!cfg.escribir && !cfg.familia) lineas.push('', 'Para escribir de verdad, corre: migracion3ReferenciasEscribir');
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
  const cfg = Object.assign({ escribir: false, familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'MOVIENDO LA COLUMNA ID AL INICIO' : 'ENSAYO (no mueve nada)') + ' — ' + ssId, ''];
  let movidas = 0;

  // todas(), no migrables(): también mueve el ID de las hojas del sistema nuevo. El filtro
  // de familia se aplica aquí porque deFamilia() se construye sobre migrables().
  const aMover = Entidades.todas().filter(
    (h) => !cfg.familia || (h.familia || 'otros') === String(cfg.familia).trim().toLowerCase());
  aMover.forEach((h) => {
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
 * Columnas que se quedaron SIN ENCABEZADO y cuyo nombre se deduce de lo que guardan.
 *
 * El método es de Ayrton, del proyecto OOAM: cuando aparece un encabezado vacío, en vez de
 * inventarle un nombre o dejarlo así, se cruza su contenido contra las demás hojas hasta
 * que algo coincide. Aquí funcionó al primer intento.
 *
 * Cada entrada exige la EVIDENCIA de por qué se llama así, con números. Sin eso no se
 * agrega: ponerle a una columna un nombre inventado es peor que dejarla sin nombre, porque
 * el nombre se vuelve verdad para quien lo lea después.
 */
const ENCABEZADOS_DEDUCIDOS = [
  {
    hoja: 'CAMBIOS LINEAS TELEFONICAS',
    nombre: 'NUCO',
    // Se ubica por sus VECINOS, no por un número de columna. Antes decía `columna: 3`, y
    // esa es una coordenada de ANTES de migrar: en cuanto el paso 3 inserta la columna
    // 'ID' al inicio, esta se corre a la 4. Medido en los tres libros el 30/09/2026:
    //
    //   PRODUCCIÓN  col1 (vacío)  col2 ID_LINEA     col3 (vacío, el NUCO)  col4 IMEI
    //   LABORATORIO col1 ID       col2 ID ANTERIOR  col3 ID_LINEA          col4 NUCO
    //   DEV equipo  col1 ID       col2 ID APPSHEET  col3 ID_LINEA          col4 (vacío)
    //
    // Los vecinos son lo único que no se mueve. En el libro del equipo el número fijo
    // apuntaba a ID_LINEA, y el guardián se negó a escribirle encima — hizo bien.
    entre: ['ID_LINEA', 'IMEI'],
    // Y antes de escribir el nombre se VUELVE A MEDIR la evidencia: sus valores tienen que
    // ser NUCOs de verdad, de los que están en LINEAS TELEFONICAS. Ubicar por vecinos dice
    // DÓNDE está la columna; esto dice que además es la que creemos. Si alguien mete otra
    // columna entre ID_LINEA e IMEI, los vecinos solos la nombrarían NUCO por error.
    //
    // Medido el 30/09/2026 en los tres libros: 99.74% en producción, 99.74% en el
    // laboratorio y 99.67% en el del equipo. La columna IMEI, de control, da 0.00%. No hay
    // zona gris, así que el mínimo de 0.90 no es un número peleado.
    comprueba: { hoja: 'LINEAS TELEFONICAS', columna: 'NUCO', minimo: 0.90 },
    evidencia: 'De 35,428 filas con línea padre, 35,425 traen exactamente el NUCO de esa ' +
      'línea (99.99%). Las 3 que no son dedazos: 110000 donde va 10001 (un cero de más), ' +
      '1483 donde va 1484, y 1297 donde va 1080. Idéntico en producción y en el ' +
      'laboratorio, así que no es cosa de la copia. Medido el 30/09/2026.',
  },
];

/**
 * Le pone nombre a las columnas de ENCABEZADOS_DEDUCIDOS. Corre junto al renombrado de la
 * llave, porque es el mismo trabajo: dejar la hoja con todas sus columnas nombradas.
 *
 * Nunca pisa un encabezado que ya exista: si la columna de esa posición YA tiene nombre, la
 * hoja cambió de forma y la deducción dejó de valer, así que lo reporta como problema en
 * vez de escribir encima.
 */
/**
 * Dónde está la columna de una deducción, buscándola ENTRE sus dos vecinos.
 * Devuelve {columna} o {error}. No escribe nada.
 */
function migDeducidoDonde_(encabezados, d) {
  const izq = migColumna_(encabezados, d.entre[0]);
  const der = migColumna_(encabezados, d.entre[1]);
  if (!izq || !der) {
    return { error: 'no encuentro sus vecinos "' + d.entre[0] + '" y "' + d.entre[1] +
      '" para ubicar "' + d.nombre + '"' };
  }
  if (der - izq !== 2) {
    return { error: 'entre "' + d.entre[0] + '" (columna ' + izq + ') y "' + d.entre[1] +
      '" (columna ' + der + ') hay ' + Math.max(0, der - izq - 1) + ' columnas, y se ' +
      'esperaba exactamente 1 para poner "' + d.nombre + '". La hoja cambió de forma: ' +
      'revisa la deducción antes de seguir (ver ENCABEZADOS_DEDUCIDOS).' };
  }
  return { columna: izq + 1 };
}

/**
 * Vuelve a medir la evidencia de una deducción: qué tanto de la columna existe de verdad en
 * la columna del catálogo con la que se justificó. Devuelve {tasa, valores} o {error}.
 *
 * No depende de llaves foráneas ni de qué versión migró el libro: compara CONTRA UN
 * CONJUNTO de valores válidos, y eso se ve igual antes y después de migrar.
 */
function migDeducidoComprueba_(ss, sheet, columna, d) {
  const catalogo = ss.getSheetByName(d.comprueba.hoja);
  if (!catalogo) {
    return { error: 'no existe "' + d.comprueba.hoja + '", no puedo comprobar la deducción' };
  }
  const posCat = migColumna_(migEncabezados_(catalogo), d.comprueba.columna);
  if (!posCat) {
    return { error: '"' + d.comprueba.hoja + '" no tiene columna "' + d.comprueba.columna +
      '", no puedo comprobar la deducción' };
  }
  const filasCat = migFilas_(catalogo);
  if (!filasCat) return { error: '"' + d.comprueba.hoja + '" está vacía' };

  const validos = {};
  migLeerColumna_(catalogo, posCat, filasCat).forEach((v) => {
    const x = migLimpio_(v);
    if (x) validos[x.toUpperCase()] = true;
  });

  const filas = migFilas_(sheet);
  if (!filas) return { error: 'la hoja está vacía' };
  const conDato = migLeerColumna_(sheet, columna, filas)
    .map((v) => migLimpio_(v)).filter(Boolean);
  if (!conDato.length) return { error: 'esa columna no tiene ni un valor' };

  const dentro = conDato.filter((v) => validos[v.toUpperCase()]).length;
  return { tasa: dentro / conDato.length, valores: conDato.length, dentro: dentro };
}

function ponerEncabezadosDeducidos_(ss, cfg, lineas, problemas) {
  let puestos = 0;
  ENCABEZADOS_DEDUCIDOS.forEach((d) => {
    if (cfg.familia && Entidades.existe(d.hoja) &&
        Entidades.de(d.hoja).familia !== String(cfg.familia).trim().toLowerCase()) return;
    const sheet = ss.getSheetByName(d.hoja);
    if (!sheet) return;
    const enc = migEncabezados_(sheet);

    const donde = migDeducidoDonde_(enc, d);
    if (donde.error) { problemas.push(d.hoja + ': ' + donde.error); return; }

    const actual = migLimpio_(enc[donde.columna - 1]);
    if (actual && migClave_(actual) === migClave_(d.nombre)) {
      lineas.push('  ' + d.hoja + ': la columna ' + donde.columna + ' ya se llama "' +
        d.nombre + '"');
      return;
    }
    if (actual) {
      problemas.push(d.hoja + ': la columna ' + donde.columna + ' se llama "' + actual +
        '" y se esperaba vacía para ponerle "' + d.nombre + '". La hoja cambió de forma: ' +
        'revisa la deducción antes de seguir (ver ENCABEZADOS_DEDUCIDOS).');
      return;
    }
    // La evidencia, otra vez, aquí y ahora. Ubicar por vecinos dice DÓNDE; esto dice que
    // es la columna que creemos. Sin este paso, una columna nueva metida entre los dos
    // vecinos se llamaría NUCO sin que nadie se enterara.
    if (d.comprueba) {
      const c = migDeducidoComprueba_(ss, sheet, donde.columna, d);
      if (c.error) {
        problemas.push(d.hoja + ': ' + c.error + ' para la columna ' + donde.columna +
          ' ("' + d.nombre + '")');
        return;
      }
      if (c.tasa < d.comprueba.minimo) {
        problemas.push(d.hoja + ': la columna ' + donde.columna + ' NO parece "' + d.nombre +
          '": solo ' + Math.round(c.tasa * 1000) / 10 + '% de sus ' + c.valores +
          ' valores están en ' + d.comprueba.hoja + '.' + d.comprueba.columna +
          ', y se esperaba al menos ' + Math.round(d.comprueba.minimo * 100) + '%. ' +
          'La hoja cambió de forma: revisa la deducción (ver ENCABEZADOS_DEDUCIDOS).');
        return;
      }
      lineas.push('  ' + d.hoja + ': columna ' + donde.columna + '  "(sin encabezado)"  ->  "' +
        d.nombre + '"   (' + Math.round(c.tasa * 1000) / 10 + '% de sus ' + c.valores +
        ' valores son ' + d.comprueba.hoja + '.' + d.comprueba.columna + ')');
      if (cfg.escribir) sheet.getRange(1, donde.columna).setValue(d.nombre);
      puestos++;
      return;
    }

    lineas.push('  ' + d.hoja + ': columna ' + donde.columna + '  "(sin encabezado)"  ->  "' +
      d.nombre + '"   (deducido del contenido, ubicada entre "' + d.entre[0] + '" y "' +
      d.entre[1] + '")');
    if (cfg.escribir) sheet.getRange(1, donde.columna).setValue(d.nombre);
    puestos++;
  });
  return puestos;
}

/**
 * Le pone a la llave vieja de cada hoja el MISMO nombre en todas: "ID ANTERIOR".
 *
 * La idea es de Ayrton (30/09/2026) y simplifica mucho: hoy cada hoja llama distinto a lo
 * que identificaba al renglón antes de migrar — `ID_VEHICULO`, `ID_CAMBIO`, `ID ARQUEO`,
 * `ID_Accesorio`, `No EMPLEADO`, y en ocho hojas simplemente `ID`. Después de este paso,
 * TODAS quedan con dos columnas y nada más: `ID` (la llave nueva) y `ID ANTERIOR`.
 *
 * Lo que eso mata:
 *   - El concepto "ID APPSHEET" desaparece: ya no hay que crear una columna de respaldo
 *     aparte, porque la original SE VUELVE el respaldo al renombrarse.
 *   - Con él se va `pisaLlaveAnterior` y la rama de respaldar-y-pisar: si la columna se
 *     llamaba `ID` y ahora se llama `ID ANTERIOR`, la hoja se queda SIN `ID` y el paso de
 *     ids simplemente crea uno nuevo, igual que en las demás.
 *   - Y el caso especial de CAMBIOS LINEAS TELEFONICAS, cuya columna no tenía encabezado:
 *     aquí se le pone, y deja de depender de la posición.
 *
 * VA ANTES DEL PASO DE IDS, por lo de arriba. El orden está en FAM_PASOS.
 *
 * CUIDADO — esto cambia nombres de columna que el código de la app usa para buscar
 * renglones (`SheetUtils.findById(..., 'ID_HOLOGRAMA')`) y para identificar hojas
 * (`COLUMNAS_CLAVE`, las `firma` de `Relaciones.MAPA`). Correrlo en un libro que la app lea
 * SIN haber actualizado esos nombres deja módulos sin encontrar su hoja. En el laboratorio
 * no importa; ver docs/ids-asignacion.md antes de hacerlo en el libro bueno.
 */
function renombrarLlaveAnterior(opciones) {
  const cfg = Object.assign({ escribir: false, familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'RENOMBRANDO LA LLAVE VIEJA A "' + Entidades.COLUMNA_ID_ANTERIOR + '"'
    : 'ENSAYO (no renombra nada)') + ' — ' + ssId, ''];
  let renombradas = 0, yaEstaban = 0, respetadas = 0;
  const problemas = [];

  Entidades.deFamilia(cfg.familia).forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { lineas.push('  ' + h.hoja + ': NO EXISTE, se salta'); return; }
    const enc = migEncabezados_(sheet);

    // Su llave vieja es un dato de la empresa, no un id de AppSheet: conserva su nombre.
    if (h.llaveEsDato) {
      respetadas++;
      lineas.push('  ' + h.hoja + ': "' + h.llaveAnterior + '" se QUEDA como está — no es un ' +
        'id de AppSheet, es un dato de negocio (ver llaveEsDato en Entidades.gs)');
      return;
    }

    const yaTiene = migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR);
    if (yaTiene) {
      yaEstaban++;
      lineas.push('  ' + h.hoja + ': ya tiene "' + Entidades.COLUMNA_ID_ANTERIOR +
        '" en la columna ' + yaTiene + ', nada que hacer');
      return;
    }

    // Nombre primero, y si no aparece, la posicion. El ternario de antes nunca caia al
    // respaldo cuando `llaveAnterior` estaba puesta, y por eso CAMBIOS LINEAS TELEFONICAS
    // paraba el pipeline: en produccion y en el laboratorio su columna no tiene encabezado.
    let pos = h.llaveAnterior ? migColumna_(enc, h.llaveAnterior) : 0;
    let comoSeEncontro = 'por su nombre';
    if (!pos && h.columnaAnterior) {
      pos = h.columnaAnterior;
      comoSeEncontro = 'por POSICION (columna ' + h.columnaAnterior + ', no tiene encabezado)';
    }
    if (!pos) {
      problemas.push(h.hoja + ': no encuentro su llave vieja ("' +
        (h.llaveAnterior || 'columna ' + h.columnaAnterior) + '")');
      lineas.push('  ' + h.hoja + ': NO encuentro su llave vieja, se salta');
      return;
    }

    // Que no haya DOS columnas con el nombre nuevo: si la llave vieja ya se llamara igual
    // que el nombre nuevo, el caso lo cubre `yaTiene` de arriba y no llegamos aquí.
    const comoSeLlama = migLimpio_(enc[pos - 1]);
    lineas.push('  ' + h.hoja + ': columna ' + pos + '  "' +
      (comoSeLlama || '(sin encabezado)') + '"  ->  "' + Entidades.COLUMNA_ID_ANTERIOR +
      '"   (' + comoSeEncontro + ')');
    if (cfg.escribir) {
      sheet.getRange(1, pos).setValue(Entidades.COLUMNA_ID_ANTERIOR);
      renombradas++;
    } else {
      renombradas++;
    }
  });

  const deducidos = ponerEncabezadosDeducidos_(ss, cfg, lineas, problemas);

  lineas.push('');
  if (deducidos) {
    lineas.push('  ' + deducidos + ' encabezado(s) ' +
      (cfg.escribir ? 'puestos' : 'por poner') + ' deducidos del contenido');
  }
  lineas.push('  ' + renombradas + ' columnas ' + (cfg.escribir ? 'renombradas' : 'por renombrar') +
    (yaEstaban ? ', ' + yaEstaban + ' ya estaban' : '') +
    (respetadas ? ', ' + respetadas + ' respetadas por ser dato de negocio' : ''));
  if (problemas.length) {
    lineas.push('');
    lineas.push('PROBLEMAS (' + problemas.length + '):');
    problemas.forEach((p) => lineas.push('  - ' + p));
  }
  if (cfg.escribir && renombradas) {
    SpreadsheetApp.flush();
    lineas.push('');
    lineas.push('  OJO: la app busca renglones por los nombres VIEJOS (ID_HOLOGRAMA,');
    lineas.push('  ID_SENSOR...). Si este libro lo lee la app, hay que actualizar esos');
    lineas.push('  nombres en el código. Ver docs/ids-asignacion.md.');
  }
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

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
  const cfg = Object.assign({ escribir: false, familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'QUITANDO RESPALDOS QUE SOBRAN' : 'ENSAYO (no borra nada)') + ' — ' + ssId, ''];
  let quitadas = 0;

  Entidades.deFamilia(cfg.familia).forEach((h) => {
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
    const posVieja = migColumnaAnterior_(enc, h);
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
  const cfg = Object.assign({ familia: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = ['AUDITORÍA — ' + ssId +
    (cfg.familia ? '  ·  solo la familia "' + cfg.familia + '"' : ''), ''];
  const fallas = [];

  Entidades.deFamilia(cfg.familia).forEach((h) => {
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
    // Si NINGUNO de los ids tiene la forma nueva, esta hoja no se ha migrado: su columna
    // ID todavia guarda los valores de antes. Eso NO es "forma invalida", es "sin migrar",
    // y decirlo mal hace que un ensayo se lea como una catastrofe: en la primera corrida
    // completa salieron 8 hojas con miles de "IDs con forma invalida" que en realidad eran
    // los ids viejos de AppSheet esperando su turno.
    const conDato = ids.filter(Boolean);
    const sinMigrar = conDato.length > 0 && !conDato.some((v) => Ids.tieneForma(v));
    if (sinMigrar) {
      lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + filas + ' renglones' +
        '  <-- SIN MIGRAR (su columna ' + Entidades.COLUMNA_ID +
        ' todavia trae los valores de antes)');
      return;
    }

    const malos = ids.filter((v) => v && !Ids.tieneForma(v)).length;
    const ajenos = ids.filter((v) => v && Ids.tieneForma(v) && Ids.prefijo(v) !== h.prefijo).length;
    const vistos = {};
    let repetidos = 0;
    ids.forEach((v) => { if (v) { if (vistos[v]) repetidos++; else vistos[v] = true; } });
    // Se compara SOLO la parte del tiempo del id (los 8 caracteres despues del prefijo),
    // no el id completo. Antes se comparaba entero, y como los ultimos 6 caracteres son
    // AZAR, dos renglones nacidos en el mismo milisegundo salian "fuera de orden" segun
    // cual azar resulto menor. Eso reportaba 7 fallas falsas en CAMBIOS LINEAS TELEFONICAS
    // del libro del equipo: los 7 pares tenian el MISMO tiempo (66AQBBDG y compania) y
    // solo diferian en el azar. Un lote de altas hecho en el mismo segundo es lo normal,
    // no un sintoma.
    const tiempoDe = (v) => String(v).split('-')[1].slice(0, 8);
    let desordenados = 0;
    for (let i = 1; i < ids.length; i++) {
      if (!ids[i] || !ids[i - 1]) continue;
      if (!Ids.tieneForma(ids[i]) || !Ids.tieneForma(ids[i - 1])) continue;
      if (tiempoDe(ids[i]) < tiempoDe(ids[i - 1])) desordenados++;
    }

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
