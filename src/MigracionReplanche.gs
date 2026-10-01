/**
 * MigracionReplanche.gs
 *
 * Copia las 24 hojas migrables de PRODUCCIÓN (solo lectura) encima del libro de
 * experimentos, para poder ensayar el pipeline completo sobre datos de verdad y en estado
 * PRE-migración. Ver docs/ids-asignacion.md y docs/relaciones.md.
 *
 * ¿Por qué existe? Ensayar la migración sobre un libro que ya está migrado prueba la
 * idempotencia, no la primera corrida — que es justo lo que va a pasar en producción. Para
 * que el ensayo valga, el libro de pruebas tiene que empezar como empieza producción: sin
 * columna ID, sin respaldo, con los ids viejos de AppSheet en su lugar.
 *
 * ESTE ES EL ÚNICO ARCHIVO QUE LEE PRODUCCIÓN Y ESCRIBE EN OTRO LIBRO. Va en sentido
 * contrario al resto de la tubería, así que tiene tres guardas de dirección:
 *
 *   1. El destino está FIJO en REPL_DESTINO. No sale de una Script Property ni de
 *      Config.SPREADSHEET_IDS: aunque alguien apunte el proyecto a otro libro, esto no lo
 *      sigue.
 *   2. Hay una lista negra explícita (REPL_PROHIBIDOS) con producción y con el libro de
 *      pruebas COMPARTIDO del equipo. Si el destino es uno de esos, truena. Aunque alguien
 *      edite REPL_DESTINO para ponerlo, truena.
 *   3. Comprueba el NOMBRE del libro destino, no solo su id. Si el id dejó de apuntar a
 *      "Inventario Reemplazable", truena en vez de escribir en un desconocido.
 *
 * No pide respaldo del destino, a diferencia del resto del pipeline: ese libro es
 * desechable a propósito (se llama "Inventario Reemplazable") y el original de todo lo que
 * se copia sigue intacto en producción. Lo que sí hace es dejar constancia en LOG_MIGRACION
 * con los conteos de antes y después.
 */

/** El único libro donde esto puede escribir. Fijo, no configurable. */
const REPL_DESTINO = '1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o';
/** Su nombre, para no escribir en otro libro si el id cambiara de dueño. */
const REPL_DESTINO_NOMBRE = 'Inventario Reemplazable';
/** De dónde se lee. NUNCA se escribe aquí. */
const REPL_ORIGEN = MIGRACION_SS_PRODUCCION;

/**
 * Libros que jamás pueden ser destino, con el motivo para que el error lo explique.
 * Producción por lo obvio; el libro de pruebas compartido porque ahí trabajan Jorge y
 * Emmanuel y un replanchado les borraría su avance sin avisar.
 */
const REPL_PROHIBIDOS = {
  '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk': 'el libro de PRODUCCIÓN',
  '1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI': 'el libro de pruebas COMPARTIDO del equipo',
};

/** Cuántas filas se mueven por viaje. CAMBIOS LINEAS TELEFONICAS son 35,543 × 10. */
const REPL_FILAS_POR_BLOQUE = 4000;
/** Dónde se anota en qué hoja se quedó, para poder continuar. */
const REPL_PROP_AVANCE = 'REPLANCHE_HOJAS_LISTAS';
/** Permiso explícito para perder columnas que NO son de la migración. */
const REPL_PROP_PERDIDAS_OK = 'REPLANCHE_ACEPTO_PERDER_COLUMNAS';
/** Se auto-detiene antes del límite de 6 minutos de Apps Script. */
const REPL_LIMITE_MS = 4.5 * 60 * 1000;


// ---------------------------------------------------------------- funciones para el editor

/** Replancha desde producción, ENSAYO — solo lee y reporta. Empieza por aquí. */
function replanche1Ensayo() {
  return replancharDesdeProduccion();
}

/**
 * Replancha desde producción, DE VERDAD — BORRA y reescribe las 24 hojas del destino.
 * Si se corta por tiempo, se vuelve a correr y continúa donde se quedó.
 */
function replanche2Escribir() {
  return replancharDesdeProduccion({ escribir: true });
}

/** En qué va el replanchado y qué llaves están puestas. Solo lee. */
function replancheEstado() {
  const props = PropertiesService.getScriptProperties();
  const listas = replListas_(props);
  const lineas = [
    'REPLANCHADO — estado',
    '',
    '  origen  (solo lectura): ' + REPL_ORIGEN,
    '  destino (se sobrescribe): ' + REPL_DESTINO,
    '',
    '  hojas ya replanchadas: ' + listas.length + ' de ' + replHojas_().length,
  ];
  if (listas.length) lineas.push('    ' + listas.join(', '));
  lineas.push('');
  lineas.push('  ' + REPL_PROP_PERDIDAS_OK + ': ' +
    (props.getProperty(REPL_PROP_PERDIDAS_OK) || '(sin poner)'));
  lineas.push('');
  lineas.push('  Para empezar de cero: borra la Script Property ' + REPL_PROP_AVANCE + '.');
  const msg = lineas.join('\n');
  Logger.log(msg);
  return msg;
}

/** Olvida el avance para que el próximo replanchado empiece desde la primera hoja. */
function replancheReiniciarAvance() {
  PropertiesService.getScriptProperties().deleteProperty(REPL_PROP_AVANCE);
  const msg = 'Avance borrado. El próximo replanchado empieza desde la primera hoja.';
  Logger.log(msg);
  return msg;
}


// ---------------------------------------------------------------------------- lo de adentro

/** Las 24 hojas que se replanchan: las migrables del catálogo, en orden estable. */
function replHojas_() {
  return Entidades.migrables().map((e) => e.hoja).sort();
}

/** Las que ya se hicieron en esta pasada. */
function replListas_(props) {
  const crudo = props.getProperty(REPL_PROP_AVANCE);
  if (!crudo) return [];
  try {
    const v = JSON.parse(crudo);
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

/**
 * Resuelve el libro destino y se niega si no es el que debe ser. Las tres guardas del
 * encabezado de este archivo viven aquí.
 */
function replDestino_() {
  if (REPL_DESTINO === REPL_ORIGEN) {
    throw new Error('El destino es el MISMO libro que el origen. Esto no se corre.');
  }
  if (REPL_PROHIBIDOS[REPL_DESTINO]) {
    throw new Error('El destino configurado es ' + REPL_PROHIBIDOS[REPL_DESTINO] +
      '. Este procedimiento BORRA las hojas del destino, así que ahí no se corre nunca.');
  }
  const ss = SpreadsheetApp.openById(REPL_DESTINO);
  const nombre = ss.getName();
  if (nombre !== REPL_DESTINO_NOMBRE) {
    throw new Error('El libro ' + REPL_DESTINO + ' se llama "' + nombre + '" y se esperaba "' +
      REPL_DESTINO_NOMBRE + '". No se escribe en un libro que no es el de experimentos: ' +
      'si de verdad cambió de nombre, actualiza REPL_DESTINO_NOMBRE a mano.');
  }
  return ss;
}

/** Las columnas que la migración agrega; perderlas al replanchar es el objetivo. */
function replEsArtefacto_(col) {
  const c = String(col || '').trim().toUpperCase();
  return c === String(Entidades.COLUMNA_ID).toUpperCase() ||
         c === String(Entidades.COLUMNA_ID_ANTERIOR).toUpperCase() ||
         c === String(Entidades.COLUMNA_ID_ANTERIOR_LEGADO).toUpperCase();
}

/** Deja la hoja con exactamente `filas` × `cols` de rejilla, sin dejarla más chica que 1×1. */
function replAjustarGrid_(hoja, filas, cols) {
  const fObj = Math.max(filas, 1);
  const cObj = Math.max(cols, 1);
  const f = hoja.getMaxRows();
  const c = hoja.getMaxColumns();
  if (f < fObj) hoja.insertRowsAfter(f, fObj - f);
  else if (f > fObj) hoja.deleteRows(fObj + 1, f - fObj);
  if (c < cObj) hoja.insertColumnsAfter(c, cObj - c);
  else if (c > cObj) hoja.deleteColumns(cObj + 1, c - cObj);
}

/**
 * Copia una hoja de producción encima de la del destino, por bloques.
 * Devuelve { filas, columnas } de lo que quedó escrito.
 */
function replCopiarHoja_(hojaOrigen, hojaDestino) {
  const filas = hojaOrigen.getLastRow();
  const cols = hojaOrigen.getLastColumn();
  const maxFilas = hojaOrigen.getMaxRows();
  const maxCols = hojaOrigen.getMaxColumns();

  hojaDestino.clear();                       // contenido y formatos: queda como recién nacida
  replAjustarGrid_(hojaDestino, maxFilas, maxCols);
  if (!filas || !cols) return { filas: 0, columnas: 0 };

  for (let desde = 1; desde <= filas; desde += REPL_FILAS_POR_BLOQUE) {
    const cuantas = Math.min(REPL_FILAS_POR_BLOQUE, filas - desde + 1);
    const valores = hojaOrigen.getRange(desde, 1, cuantas, cols).getValues();
    hojaDestino.getRange(desde, 1, cuantas, cols).setValues(valores);
    SpreadsheetApp.flush();
  }
  // El encabezado congelado y en negritas, como en producción
  hojaDestino.setFrozenRows(hojaOrigen.getFrozenRows());
  return { filas: filas - 1, columnas: cols };   // filas de datos, sin el encabezado
}

/**
 * El procedimiento completo.
 *
 * @param {{escribir: boolean}} opciones  escribir=false (default) → solo lee y reporta
 * @return {string} el reporte, también en Logger y en LOG_MIGRACION
 */
function replancharDesdeProduccion(opciones) {
  const cfg = Object.assign({ escribir: false }, opciones || {});
  const props = PropertiesService.getScriptProperties();
  const destino = replDestino_();                      // aquí viven las guardas
  const origen = SpreadsheetApp.openById(REPL_ORIGEN);
  const arranque = Date.now();

  const hojas = replHojas_();
  const listas = cfg.escribir ? replListas_(props) : [];
  const lineas = [
    (cfg.escribir ? 'REPLANCHANDO DE VERDAD' : 'ENSAYO (no escribe nada)'),
    '',
    '  origen:  ' + origen.getName() + '  (' + REPL_ORIGEN + ')  — solo lectura',
    '  destino: ' + destino.getName() + '  (' + REPL_DESTINO + ')  — se sobrescribe',
    '',
  ];
  if (listas.length) {
    lineas.push('  Continuando: ya estaban listas ' + listas.length + ' hojas de ' + hojas.length + '.');
    lineas.push('');
  }

  const perdidasTotales = [];
  let hechas = 0, celdas = 0, sinOrigen = 0, sinDestino = 0, corte = '';

  for (let i = 0; i < hojas.length; i++) {
    const nombre = hojas[i];
    if (listas.indexOf(nombre) !== -1) continue;

    if (cfg.escribir && Date.now() - arranque > REPL_LIMITE_MS) {
      corte = nombre;
      break;
    }

    const hOrigen = origen.getSheetByName(nombre);
    const hDestino = destino.getSheetByName(nombre);
    if (!hOrigen) {
      sinOrigen++;
      lineas.push('  · ' + nombre + ': NO existe en producción, se salta');
      continue;
    }
    if (!hDestino) {
      sinDestino++;
      lineas.push('  · ' + nombre + ': NO existe en el destino, se salta (créala a mano si hace falta)');
      continue;
    }

    const encOrigen = hOrigen.getLastColumn()
      ? hOrigen.getRange(1, 1, 1, hOrigen.getLastColumn()).getValues()[0] : [];
    const encDestino = hDestino.getLastColumn()
      ? hDestino.getRange(1, 1, 1, hDestino.getLastColumn()).getValues()[0] : [];
    const enOrigen = {};
    encOrigen.forEach((c) => { enOrigen[String(c).trim().toUpperCase()] = true; });

    const artefactos = [];
    const perdidas = [];
    encDestino.forEach((c) => {
      const t = String(c).trim();
      if (!t || enOrigen[t.toUpperCase()]) return;
      (replEsArtefacto_(t) ? artefactos : perdidas).push(t);
    });
    perdidas.forEach((c) => perdidasTotales.push(nombre + '.' + c));

    const filasOrigen = Math.max(hOrigen.getLastRow() - 1, 0);
    const filasDestino = Math.max(hDestino.getLastRow() - 1, 0);
    const detalle = [];
    detalle.push(filasDestino + ' → ' + filasOrigen + ' filas');
    detalle.push(encDestino.length + ' → ' + encOrigen.length + ' columnas');
    if (artefactos.length) detalle.push('se va la migración (' + artefactos.join(', ') + ')');
    if (perdidas.length) detalle.push('SE PIERDE: ' + perdidas.join(', '));

    if (!cfg.escribir) {
      lineas.push('  · ' + nombre + ': ' + detalle.join(' · '));
      continue;
    }

    // Con AppSheet vivo esto daría igual porque el destino no es producción, pero perder
    // una columna que alguien capturó a mano sí importa, y no se hace sin permiso.
    if (perdidas.length && props.getProperty(REPL_PROP_PERDIDAS_OK) !== REPL_DESTINO) {
      throw new Error('"' + nombre + '" tiene columnas que producción NO tiene y que no son ' +
        'de la migración: ' + perdidas.join(', ') + '. Replanchar las borra. Si estás de ' +
        'acuerdo, pon la Script Property ' + REPL_PROP_PERDIDAS_OK + ' con el id del ' +
        'destino (' + REPL_DESTINO + ') y vuelve a correr. Corre replanche1Ensayo primero ' +
        'para ver la lista completa.');
    }

    const res = replCopiarHoja_(hOrigen, hDestino);
    hechas++;
    celdas += res.filas * res.columnas;
    listas.push(nombre);
    props.setProperty(REPL_PROP_AVANCE, JSON.stringify(listas));
    lineas.push('  · ' + nombre + ': ' + detalle.join(' · '));
  }

  lineas.push('');
  if (cfg.escribir) {
    lineas.push('  Hojas replanchadas en esta corrida: ' + hechas +
      '  (' + celdas.toLocaleString() + ' celdas)');
    lineas.push('  Total ya listas: ' + listas.length + ' de ' + hojas.length);
    if (corte) {
      lineas.push('');
      lineas.push('  SE DETUVO por tiempo antes de "' + corte + '".');
      lineas.push('  Vuelve a correr replanche2Escribir: continúa donde se quedó.');
    } else if (listas.length >= hojas.length - sinOrigen - sinDestino) {
      lineas.push('');
      lineas.push('  LISTO. El destino quedó en estado PRE-migración.');
      lineas.push('  Lo que sigue: migracion1Revisar en el proyecto que apunte al destino.');
      props.deleteProperty(REPL_PROP_AVANCE);
    }
  } else {
    lineas.push('  ENSAYO: no se escribió nada.');
    if (perdidasTotales.length) {
      lineas.push('');
      lineas.push('  OJO — se perderían ' + perdidasTotales.length +
        ' columnas que producción no tiene y que NO son de la migración:');
      perdidasTotales.forEach((c) => lineas.push('      ' + c));
      lineas.push('  Para aceptarlo: Script Property ' + REPL_PROP_PERDIDAS_OK + ' = ' + REPL_DESTINO);
    }
    lineas.push('');
    lineas.push('  Si el reporte cuadra, corre replanche2Escribir.');
  }
  if (sinOrigen || sinDestino) {
    lineas.push('  (saltadas: ' + sinOrigen + ' sin origen, ' + sinDestino + ' sin destino)');
  }

  const mensaje = lineas.join('\n');
  Logger.log(mensaje);
  pipeLog_(REPL_DESTINO, 'replancharDesdeProduccion', cfg.escribir ? 'ESCRIBIR' : 'ENSAYO',
    corte ? 'CORTADO POR TIEMPO' : 'OK',
    hechas + ' hojas, ' + celdas + ' celdas, desde ' + REPL_ORIGEN);
  return mensaje;
}
