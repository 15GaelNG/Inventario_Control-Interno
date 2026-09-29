/**
 * MigracionPipeline.gs
 * La red de seguridad alrededor de MigracionIds.gs. Se corre A MANO desde el editor.
 *
 * MigracionIds.gs tiene los PASOS; este archivo tiene el ORDEN y la SEGURIDAD. No duplica
 * ninguna lógica: llama a las funciones que ya existen allá.
 *
 * Por qué existe: los pasos funcionaron en la copia de pruebas, pero tenían tres huecos que
 * en producción no se pueden dejar —no había respaldo, no había reversa y no quedaba
 * registro de qué se corrió—. Esto los tapa.
 *
 * CUÁNDO se corre en producción: al apagar AppSheet, no antes. Agregar y mover columnas
 * rompe su app hasta que alguien regenere el esquema, y hoy la columna ID está puesta pero
 * inerte (nada se une por ella: medimos que el FOLIO cambió 0 veces en 9,214 correcciones).
 * Adelantarlo pagaría una ventana de caída para 46 personas sin ganar nada.
 *
 * El orden, con las funciones sin argumentos que se seleccionan en el desplegable:
 *
 *   pipeline0Respaldar        copia fechada del spreadsheet completo
 *   pipelineEstado            "¿dónde estoy?" — solo lee, se puede correr cuando sea
 *   migracion1Revisar         (MigracionIds) qué está roto
 *   migracion2AsignarEscribir (MigracionIds) llena la columna ID
 *   migracion4Auditar         (MigracionIds) comprueba
 *   migracion3ReferenciasEscribir
 *   migracionLimpiarRespaldoEscribir
 *   migracionMoverIdsAlInicioEscribir
 *   pipelineRevertirEnsayo / pipelineRevertirEscribir   deshace todo
 */

// ================================================================
// LAS QUE SE CORREN DESDE EL EDITOR
// ================================================================

/** PASO 0 — Copia de respaldo del spreadsheet completo. Lo primero, siempre. */
function pipeline0Respaldar() {
  return migracionRespaldar();
}

/** ¿Dónde estoy? Solo lee. Dice qué pasos están hechos y cuál sigue. */
function pipelineEstado() {
  return migracionEstado();
}

/**
 * Qué pestañas compiten por cada servicio. Solo lee. Córrela cuando se agregue o se copie
 * una pestaña: es la que avisa si un módulo está a punto de escribir en la equivocada.
 */
function pipelineRevisarFirmas() {
  return revisarFirmasDeHojas();
}

/** Recortar filas vacías, ensayo — Solo dice cuántas quitaría. */
function pipelineLimpiarFilasVaciasEnsayo() {
  return limpiarFilasVacias();
}

/** Recortar filas vacías, de verdad — quita GRID vacío, ningún dato. */
function pipelineLimpiarFilasVaciasEscribir() {
  return limpiarFilasVacias({ escribir: true });
}

/** Deshacer, ensayo — Solo dice qué haría. */
function pipelineRevertirEnsayo() {
  return migracionRevertir();
}

/** Deshacer, de verdad — restaura columnas y borra las que agregamos. */
function pipelineRevertirEscribir() {
  return migracionRevertir({ escribir: true });
}

// ---------------------------------------------------------------- constantes

/** La hoja donde queda el rastro de cada paso */
const PIPE_HOJA_LOG = 'LOG_MIGRACION';
const PIPE_LOG_ENCABEZADOS = ['FECHA', 'PASO', 'SPREADSHEET', 'MODO', 'RESULTADO', 'RESUMEN', 'QUIEN'];

/** Propiedades del script. Se leen DIRECTO, no por Config: su required() cachea. */
const PIPE_PROP_RESPALDO = 'MIGRACION_RESPALDO_ID';
const PIPE_PROP_RESPALDO_FECHA = 'MIGRACION_RESPALDO_FECHA';
const PIPE_PROP_APPSHEET_APAGADO = 'MIGRACION_APPSHEET_APAGADO';

/**
 * El orden canónico. `hecho` es cómo se MIDE en los datos si ese paso ya pasó — la hoja es
 * la fuente de verdad, no una bandera que alguien pudo dejar mal.
 */
const MIGRACION_PASOS = [
  { n: 0, nombre: 'Respaldar', correr: 'pipeline0Respaldar', hecho: 'hayRespaldo' },
  { n: 1, nombre: 'Revisar qué está roto', correr: 'migracion1Revisar', hecho: 'siempre' },
  { n: 2, nombre: 'Llenar la columna ID', correr: 'migracion2AsignarEscribir', hecho: 'idsPuestos' },
  { n: 3, nombre: 'Auditar', correr: 'migracion4Auditar', hecho: 'auditoriaLimpia' },
  { n: 4, nombre: 'Reescribir referencias', correr: 'migracion3ReferenciasEscribir', hecho: 'referenciasHechas' },
  { n: 5, nombre: 'Quitar respaldos de más', correr: 'migracionLimpiarRespaldoEscribir', hecho: 'respaldosLimpios' },
  { n: 6, nombre: 'Mover ID al inicio', correr: 'migracionMoverIdsAlInicioEscribir', hecho: 'idsAlInicio' },
];

// ---------------------------------------------------------------- bitácora

const pipeProps_ = () => PropertiesService.getScriptProperties();

/**
 * Deja un renglón en LOG_MIGRACION. Copiado del patrón de Relaciones.escribirLog_:
 * un solo setValues, un solo timestamp para el lote, y TODO envuelto en try/catch —
 * que falle la bitácora nunca debe tumbar el paso que estaba registrando.
 */
function pipeLog_(ssId, paso, modo, resultado, resumen) {
  try {
    const ss = SpreadsheetApp.openById(ssId);
    let log = ss.getSheetByName(PIPE_HOJA_LOG);
    if (!log) {
      log = ss.insertSheet(PIPE_HOJA_LOG);
      log.appendRow(PIPE_LOG_ENCABEZADOS);
      log.getRange(1, 1, 1, PIPE_LOG_ENCABEZADOS.length).setFontWeight('bold');
      log.setFrozenRows(1);
      // Texto en todo menos la fecha: que Sheets no reinterprete nada
      log.getRange(2, 2, log.getMaxRows() - 1, PIPE_LOG_ENCABEZADOS.length - 1).setNumberFormat('@');
    }
    let quien = '';
    try { quien = Session.getActiveUser().getEmail() || ''; } catch (e) { /* sin permiso, da igual */ }
    const fila = [new Date(), paso, ssId, modo, resultado, String(resumen || '').slice(0, 2000), quien];
    log.getRange(log.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
  } catch (err) {
    console.error('Pipeline: no se pudo escribir en ' + PIPE_HOJA_LOG + ': ' + err.message);
  }
}

/**
 * Corre un paso, lo registra y devuelve su salida. Toma el candado del script mientras
 * escribe: MigracionIds no lo tomaba, y en producción una captura podría entrelazarse.
 * Con tryLock y no waitLock, para fallar rápido si alguien más está escribiendo.
 */
function pipeCorrer_(ssId, paso, escribir, fn) {
  const modo = escribir ? 'ESCRITURA' : 'ENSAYO';
  let candado = null;
  if (escribir) {
    candado = LockService.getScriptLock();
    if (!candado.tryLock(30000)) {
      const msg = 'Alguien más está escribiendo en las hojas ahora mismo. Vuelve a intentar.';
      pipeLog_(ssId, paso, modo, 'FALLA', msg);
      throw new Error(msg);
    }
  }
  try {
    const salida = fn();
    pipeLog_(ssId, paso, modo, 'OK', salida);
    return salida;
  } catch (err) {
    pipeLog_(ssId, paso, modo, 'FALLA', err.message);
    throw err;
  } finally {
    if (candado) { SpreadsheetApp.flush(); candado.releaseLock(); }
  }
}

// ---------------------------------------------------------------- respaldo

/**
 * Copia fechada del spreadsheet completo, antes de tocar nada. Es la red externa: la
 * reversa programática deshace paso por paso, pero si la reversa misma falla, esto es lo
 * único que queda. Guarda el id en Script Properties y devuelve la URL.
 *
 * Y sirve doble: esa copia es una réplica exacta de producción, así que el pipeline
 * completo se puede ensayar ahí sin tocar el original.
 */
function migracionRespaldar(opciones) {
  const cfg = opciones || {};
  const ssId = cfg.spreadsheetId || Config.SPREADSHEET_IDS.VEHICULOS();
  const original = DriveApp.getFileById(ssId);
  const sello = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  const nombre = 'RESPALDO ' + original.getName() + ' antes de IDs - ' + sello;

  const copia = DriveApp.getFileById(ssId).makeCopy(nombre);
  pipeProps_().setProperties({
    MIGRACION_RESPALDO_ID: copia.getId(),
    MIGRACION_RESPALDO_FECHA: new Date().toISOString(),
  });

  const lineas = [
    'RESPALDO HECHO',
    '',
    '  origen:  ' + original.getName() + '  (' + ssId + ')',
    '  copia:   ' + nombre,
    '  id:      ' + copia.getId(),
    '  url:     ' + copia.getUrl(),
    '',
    'Guardado en las propiedades del script. Ábrelo y verifica que se ve completo',
    'ANTES de seguir con el paso 1.',
    '',
    'Para ensayar el pipeline completo sin tocar el original, corre los pasos con:',
    "    { spreadsheetId: '" + copia.getId() + "' }",
  ];
  const texto = lineas.join('\n');
  pipeLog_(ssId, '0 Respaldar', 'ESCRITURA', 'OK', 'copia ' + copia.getId());
  Logger.log(texto);
  return texto;
}

/** El respaldo guardado, o null si no hay */
function pipeRespaldo_() {
  const id = pipeProps_().getProperty(PIPE_PROP_RESPALDO);
  if (!id) return null;
  return { id: id, fecha: pipeProps_().getProperty(PIPE_PROP_RESPALDO_FECHA) || '' };
}

// ---------------------------------------------------------------- firmas de columnas

/**
 * Las firmas con las que cuatro servicios eligen su hoja. No están aquí para duplicarlas:
 * están para poder AVISAR cuando más de una pestaña coincida.
 *
 * Por qué importa: SheetUtils.getSheetByColumns no busca la hoja por su nombre, la busca
 * por qué COLUMNAS tiene (SheetUtils.gs:268-324). Y cuando varias coinciden, desempata
 * quedándose con la que tenga MÁS FILAS. Así que una pestaña de respaldo con la misma
 * forma no es inerte: compite. Si algún día tiene más filas que la viva, el servicio se
 * cambia de hoja sin avisar y empieza a leer y escribir en el respaldo.
 *
 * Medido en producción el 29/09/2026: INSTALACION DE SENSORES gana con 208 filas contra
 * las 207 de "Copia de INSTALACION DE SENSORES". Un renglón de diferencia.
 */
const PIPE_FIRMAS = [
  { servicio: 'VerificacionesService', firma: ['ID_VERIFICACION', 'FOLIO VEHICULO', 'COMPROBANTE VERIFICACION'] },
  { servicio: 'SensoresService', firma: ['ID_SENSOR', 'FOLIO', 'SERIE SENSOR'] },
  { servicio: 'HologramasService', firma: ['ID_HOLOGRAMA', 'CALCOMANIA EOX', 'ESTATUS EOX'] },
  { servicio: 'InspeccionesService', firma: ['ID INSPECCION', 'FOLIO', 'TIPO'] },
  { servicio: 'PermisosService (autenticación)', firma: ['CORREO', 'ROL'] },
];

/** Cuántas pestañas coinciden con cada firma, y por cuánto va ganando la que gana. */
function revisarFirmasDeHojas(opciones) {
  const cfg = opciones || {};
  const ssId = cfg.spreadsheetId || Config.SPREADSHEET_IDS.VEHICULOS();
  const ss = SpreadsheetApp.openById(ssId);
  const hojas = ss.getSheets();
  const lineas = ['QUÉ PESTAÑAS COMPITEN POR CADA SERVICIO — ' + ssId, ''];
  const avisos = [];

  // Encabezados de todas, una sola pasada
  const encabezados = hojas.map((h) => ({
    hoja: h,
    nombre: h.getName(),
    filas: h.getLastRow(),
    enc: migEncabezados_(h).map(migClave_),
  }));

  PIPE_FIRMAS.forEach((f) => {
    const req = f.firma.map(migClave_);
    const cand = encabezados
      .filter((e) => req.every((c) => e.enc.indexOf(c) !== -1))
      .sort((a, b) => b.filas - a.filas);

    lineas.push('  ' + f.servicio);
    lineas.push('     busca: ' + f.firma.join(' + '));
    if (!cand.length) {
      lineas.push('     NINGUNA pestaña coincide: este servicio truena');
      avisos.push(f.servicio + ': ninguna hoja coincide con su firma');
      return;
    }
    cand.forEach((e, i) => {
      lineas.push('     ' + (i === 0 ? '-> USA  ' : '   compite ') + e.filas + ' filas  ' + e.nombre);
    });
    if (cand.length > 1) {
      const ventaja = cand[0].filas - cand[1].filas;
      lineas.push('     ventaja: ' + ventaja + ' filas');
      if (ventaja < 50) {
        const aviso = f.servicio + ': "' + cand[0].nombre + '" le gana a "' + cand[1].nombre +
          '" por solo ' + ventaja + ' fila(s). Con ' + (ventaja + 1) + ' más en la segunda, el ' +
          'servicio se cambia de hoja sin avisar.';
        lineas.push('     *** OJO: ' + aviso);
        avisos.push(aviso);
      }
    }
    lineas.push('');
  });

  if (avisos.length) {
    lineas.push('AVISOS (' + avisos.length + '):');
    avisos.forEach((a) => lineas.push('  - ' + a));
    lineas.push('', 'Cómo se arregla: quitar la pestaña que compite, o cambiarle un encabezado',
      'para que deje de coincidir con la firma. Quitar una competidora siempre deja la',
      'elección MÁS determinista, nunca menos.');
  } else {
    lineas.push('Sin competencia apretada: cada servicio tiene su hoja clara.');
  }
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- filas vacías

/** Filas de colchón que se dejan debajo de los datos, para que AppSheet siga insertando */
const PIPE_COLCHON_FILAS = 200;

/**
 * Quita las filas del GRID que están debajo del último dato. NO borra ningún dato: solo
 * espacio vacío. Es lo que más rinde de toda la limpieza y no es destructivo.
 *
 * El caso extremo en producción: VEHICULOS tiene un grid de 50,497 filas x 43 columnas
 * para 648 filas con datos. Gasta 2.1 millones de celdas en vacío — el 37% del archivo
 * entero, y cuatro veces más de lo que liberaría borrar las 12 pestañas de respaldo.
 *
 * Y no es solo espacio: la documentación de rendimiento de AppSheet dice que al doblar el
 * número de filas de la hoja se puede doblar la longitud de su Calc Chain. O sea que ese
 * grid vacío está haciendo a AppSheet recalcular de más, y recortarlo debería acelerarlo.
 *
 * SE PUEDE CORRER CON APPSHEET VIVO. La regeneración de esquema que exige AppSheet está
 * amarrada a las COLUMNAS ("add, reorder, or delete columns"); las filas no aparecen en
 * ninguna de esas listas. Aun así, conviene correrlo primero en la copia del paso 0 y
 * mirar AppSheet antes de tocar producción: la documentación nunca dice "borrar filas es
 * seguro", solo nunca las menciona, y eso es inferencia por ausencia.
 */
function limpiarFilasVacias(opciones) {
  // appsheetPuedeSeguirVivo: esto no cambia el esquema, así que no exige el apagado.
  // Sigue pidiendo autorización de producción y respaldo.
  const cfg = Object.assign(
    { escribir: false, colchon: PIPE_COLCHON_FILAS, appsheetPuedeSeguirVivo: true },
    opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'RECORTANDO FILAS VACÍAS' : 'ENSAYO (no recorta nada)') + ' — ' + ssId, ''];
  let liberadas = 0, tocadas = 0;

  ss.getSheets().forEach((sheet) => {
    const nombre = sheet.getName();
    const columnas = sheet.getMaxColumns();
    const grid = sheet.getMaxRows();
    // getLastRow es la última fila CON ALGO. Debajo de eso solo hay grid vacío.
    const conDatos = sheet.getLastRow();
    const desde = Math.max(conDatos + cfg.colchon + 1, 2);
    if (desde > grid) {
      lineas.push('  ' + nombre + ': ya está justa (' + grid + ' filas)');
      return;
    }
    const cuantas = grid - desde + 1;
    const celdas = cuantas * columnas;
    lineas.push('  ' + nombre + ': ' + grid.toLocaleString() + ' filas de grid, ' +
      conDatos.toLocaleString() + ' con algo -> quita ' + cuantas.toLocaleString() +
      ' (' + celdas.toLocaleString() + ' celdas)');
    if (cfg.escribir) {
      sheet.deleteRows(desde, cuantas);
      SpreadsheetApp.flush();
    }
    liberadas += celdas;
    tocadas++;
  });

  lineas.push('', tocadas + ' pestañas por recortar, ' + liberadas.toLocaleString() + ' celdas liberadas.',
    'Se deja un colchón de ' + cfg.colchon + ' filas debajo de los datos en cada una.');
  if (!cfg.escribir) lineas.push('', 'Para recortar de verdad: pipelineLimpiarFilasVaciasEscribir');
  else lineas.push('', 'Ahora abre AppSheet y comprueba que la app sigue entrando bien.');
  const texto = lineas.join('\n');
  pipeLog_(ssId, 'Recortar filas vacías', cfg.escribir ? 'ESCRITURA' : 'ENSAYO', 'OK',
    tocadas + ' pestañas, ' + liberadas + ' celdas');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- estado

/**
 * Qué pasos están hechos, MEDIDO EN LOS DATOS. No hay bandera de progreso a propósito:
 * una bandera puede quedar mal si algo se interrumpe, la hoja no.
 */
function pipeMedir_(ss) {
  const m = {
    hayRespaldo: !!pipeRespaldo_(),
    siempre: true,
    hojas: [],
  };
  let conId = 0, completas = 0, alInicio = 0, conRespaldo = 0, total = 0;

  Entidades.migrables().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    total++;
    const filas = migFilas_(sheet);
    const enc = migEncabezados_(sheet);
    const pos = migColumna_(enc, Entidades.COLUMNA_ID);
    const vacias = filas ? migFilasVacias_(sheet, filas) : [];
    const lista = pos && filas ? migYaMigrada_(sheet, h.prefijo, filas, vacias) : false;
    if (pos) conId++;
    if (lista) completas++;
    if (pos === 1) alInicio++;
    if (migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR)) conRespaldo++;
    m.hojas.push({ hoja: h.hoja, columnaId: pos, lista: lista });
  });

  m.total = total;
  m.idsPuestos = total > 0 && completas === total;
  m.idsAlInicio = total > 0 && alInicio === total;
  // El respaldo solo debe quedar en las 8 que se pisaron; más que eso, falta limpiar
  m.respaldosLimpios = conRespaldo <= Entidades.migrables().filter((e) => e.pisaLlaveAnterior).length;
  // Las referencias: se dan por hechas cuando existen las columnas destino
  const destinos = ['ID VEHICULO', 'ID ACCESORIO', 'ID CAJA CHICA'];
  let destinosPuestos = 0, destinosEsperados = 0;
  [['VERIFICACIONES', 'ID VEHICULO'], ['ARQUEOS', 'ID CAJA CHICA'],
   ['MOVIMIENTOS_ACCESORIOS', 'ID ACCESORIO']].forEach((par) => {
    const s = ss.getSheetByName(par[0]);
    if (!s) return;
    destinosEsperados++;
    if (migColumna_(migEncabezados_(s), par[1])) destinosPuestos++;
  });
  m.referenciasHechas = destinosEsperados > 0 && destinosPuestos === destinosEsperados;
  m.auditoriaLimpia = m.idsPuestos;   // auditarIds() da el detalle
  return m;
}

/** Solo lee. "¿Dónde estoy y qué sigue?" */
function migracionEstado(opciones) {
  const cfg = opciones || {};
  const ssId = cfg.spreadsheetId || Config.SPREADSHEET_IDS.VEHICULOS();
  const ss = SpreadsheetApp.openById(ssId);
  const m = pipeMedir_(ss);
  const resp = pipeRespaldo_();

  const lineas = ['ESTADO DE LA MIGRACIÓN — ' + ssId, ''];
  lineas.push(ssId === MIGRACION_SS_PRODUCCION ? '  *** ES PRODUCCIÓN ***' : '  (no es producción)');
  lineas.push(resp ? '  respaldo: ' + resp.id + '  del ' + resp.fecha
                   : '  respaldo: NO HAY  <-- el paso 0 va primero');
  lineas.push('');
  lineas.push('  ' + m.total + ' hojas que se migran');

  let siguiente = null;
  MIGRACION_PASOS.forEach((p) => {
    const hecho = !!m[p.hecho];
    if (!hecho && !siguiente && p.hecho !== 'siempre') siguiente = p;
    const marca = p.hecho === 'siempre' ? '   ' : (hecho ? ' ok' : ' --');
    lineas.push('  ' + marca + '  ' + p.n + '. ' + p.nombre);
  });

  lineas.push('');
  if (siguiente) {
    lineas.push('SIGUE el paso ' + siguiente.n + ': ' + siguiente.nombre,
      '   corre:  ' + siguiente.correr);
  } else {
    lineas.push('Todos los pasos están hechos.');
  }
  lineas.push('', 'Para deshacer todo: pipelineRevertirEnsayo');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- reversa

/**
 * Deshace la migración. En ensayo por omisión.
 *
 * EL ORDEN IMPORTA y es el inverso del avance:
 *   1. Las columnas de referencia que se pisaron (hijas de LINEAS TELEFONICAS). Su valor
 *      viejo no se respaldó, pero se RECONSTRUYE: valor nuevo -> fila del padre por su ID
 *      -> su ID APPSHEET. Tiene que ir ANTES de borrar el respaldo del padre.
 *   2. Las 8 hojas cuya columna ID se pisó: ID <- ID APPSHEET.
 *   3. Borrar las columnas que agregamos.
 *
 * DOS COSAS QUE NO HACE, a propósito:
 *   - No borra el ID APPSHEET de CAMBIOS LINEAS TELEFONICAS: esa columna es la ORIGINAL
 *     (la que no tenía encabezado y se nombró a mano), no algo que creamos. El catálogo lo
 *     distingue con pisaLlaveAnterior.
 *   - Las filas creadas DESPUÉS de la migración no tienen valor viejo que restaurar: su
 *     ID APPSHEET está vacío y su ID queda vacío. Es lo correcto —nunca tuvieron id
 *     viejo— pero significa que esto NO es una máquina del tiempo. Para eso está la copia.
 */
function migracionRevertir(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const ssId = cfg.spreadsheetId || Config.SPREADSHEET_IDS.VEHICULOS();
  if (ssId === MIGRACION_SS_PRODUCCION && cfg.escribir) {
    const permiso = pipeProps_().getProperty('MIGRACION_IDS_AUTORIZAR_PRODUCCION');
    if (permiso !== ssId) {
      throw new Error('Deshacer en PRODUCCIÓN necesita MIGRACION_IDS_AUTORIZAR_PRODUCCION ' +
        'con el id del spreadsheet.');
    }
  }
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'DESHACIENDO LA MIGRACIÓN' : 'ENSAYO (no deshace nada)') + ' — ' + ssId, ''];

  const resp = pipeRespaldo_();
  lineas.push(resp ? '  red de seguridad: respaldo ' + resp.id
                   : '  OJO: no hay respaldo registrado. Si esto sale mal no hay a qué volver.');
  lineas.push('');

  // ---- 1. Referencias que se pisaron: reconstruir desde el ID APPSHEET del padre
  lineas.push('1. Referencias reescritas en su lugar');
  MIGRACION_REFERENCIAS.forEach((ref) => {
    const padreDef = Entidades.de(ref.padre);
    if (!padreDef || !padreDef.pisaLlaveAnterior) return;   // esas van con columna aparte
    const sheet = ss.getSheetByName(ref.hoja);
    const padre = ss.getSheetByName(ref.padre);
    if (!sheet || !padre) return;
    const filas = migFilas_(sheet);
    const pos = migColumna_(migEncabezados_(sheet), ref.columna);
    if (!filas || !pos) return;

    // Mapa inverso: ID nuevo -> valor viejo, leído del padre
    const encP = migEncabezados_(padre);
    const filasP = migFilas_(padre);
    const posIdP = migColumna_(encP, Entidades.COLUMNA_ID);
    const posViejoP = migColumna_(encP, Entidades.COLUMNA_ID_ANTERIOR);
    if (!posIdP || !posViejoP) {
      lineas.push('     ' + ref.hoja + '.' + ref.columna + ': el padre ya no tiene sus dos columnas, NO se toca');
      return;
    }
    const idsP = migLeerColumna_(padre, posIdP, filasP);
    const viejosP = migLeerColumna_(padre, posViejoP, filasP);
    const inverso = {};
    for (let i = 0; i < filasP; i++) if (idsP[i]) inverso[migClave_(idsP[i])] = viejosP[i] || '';

    const valores = migLeerColumna_(sheet, pos, filas);
    const salida = [];
    let restauradas = 0, sinDato = 0;
    valores.forEach((v) => {
      if (!v) { salida.push(['']); return; }
      const viejo = inverso[migClave_(v)];
      if (viejo) { salida.push([viejo]); restauradas++; }
      else { salida.push([v]); sinDato++; }
    });
    lineas.push('     ' + ref.hoja + '.' + ref.columna + ': ' + restauradas + ' restauradas' +
      (sinDato ? ', ' + sinDato + ' sin valor viejo (filas nuevas)' : ''));
    if (cfg.escribir) sheet.getRange(2, pos, filas, 1).setValues(salida);
  });

  // ---- 2. Las 8 hojas cuya columna ID se pisó
  lineas.push('', '2. Columnas ID que se pisaron');
  Entidades.migrables().forEach((h) => {
    if (!h.pisaLlaveAnterior) return;
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const filas = migFilas_(sheet);
    const enc = migEncabezados_(sheet);
    const posId = migColumna_(enc, Entidades.COLUMNA_ID);
    const posViejo = migColumna_(enc, Entidades.COLUMNA_ID_ANTERIOR);
    if (!filas || !posId || !posViejo) {
      lineas.push('     ' + h.hoja + ': faltan columnas, NO se toca');
      return;
    }
    const viejos = migLeerColumna_(sheet, posViejo, filas);
    const conDato = viejos.filter(Boolean).length;
    lineas.push('     ' + h.hoja + ': ' + conDato + ' de ' + filas + ' recuperan su id viejo' +
      (filas - conDato ? ', ' + (filas - conDato) + ' quedan vacías (nunca tuvieron)' : ''));
    if (cfg.escribir) {
      sheet.getRange(2, posId, filas, 1).setValues(viejos.map((v) => [v]));
      SpreadsheetApp.flush();
      sheet.deleteColumn(posViejo);
    }
  });

  // ---- 3. Borrar las columnas que agregamos
  lineas.push('', '3. Columnas agregadas que se borran');
  const destinos = {};
  MIGRACION_REFERENCIAS.forEach((ref) => { if (ref.destino) destinos[ref.hoja] = (destinos[ref.hoja] || []).concat(ref.destino); });

  Entidades.migrables().forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const porBorrar = [];
    if (!h.pisaLlaveAnterior) {
      // Su columna vieja nunca se tocó, así que el ID entero es nuestro: se va
      const pos = migColumna_(migEncabezados_(sheet), Entidades.COLUMNA_ID);
      if (pos) porBorrar.push({ nombre: Entidades.COLUMNA_ID, pos: pos });
    }
    (destinos[h.hoja] || []).forEach((nombre) => {
      const pos = migColumna_(migEncabezados_(sheet), nombre);
      if (pos) porBorrar.push({ nombre: nombre, pos: pos });
    });
    if (!porBorrar.length) return;
    lineas.push('     ' + h.hoja + ': ' + porBorrar.map((c) => '"' + c.nombre + '"').join(', '));
    if (cfg.escribir) {
      // De derecha a izquierda: borrar una corre las de su derecha
      porBorrar.sort((a, b) => b.pos - a.pos).forEach((c) => sheet.deleteColumn(c.pos));
    }
  });

  lineas.push('');
  if (!cfg.escribir) lineas.push('Para deshacerlo de verdad: pipelineRevertirEscribir');
  else lineas.push('Listo. Corre pipelineEstado para confirmar que volvió al inicio.');
  const texto = lineas.join('\n');
  pipeLog_(ssId, 'Revertir', cfg.escribir ? 'ESCRITURA' : 'ENSAYO', 'OK', 'reversa corrida');
  Logger.log(texto);
  return texto;
}
