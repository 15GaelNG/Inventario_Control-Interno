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

/** El spreadsheet de producción. Aquí NO se escribe mientras AppSheet siga vivo. */
const MIGRACION_SS_PRODUCCION = '1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk';

/**
 * Una entrada por hoja de registros. `idActual` es de dónde se copia el valor viejo;
 * `columna` es su posición (base 1) cuando el encabezado está vacío o no es confiable.
 */
const MIGRACION_HOJAS = [
  { hoja: 'VEHICULOS', prefijo: 'VEH', idActual: 'ID_VEHICULO' },
  { hoja: 'CAMBIOS VEHICULOS', prefijo: 'CVE', idActual: 'ID_CAMBIO' },
  { hoja: 'REASIGNACIONES_VEHICULOS', prefijo: 'RVE', idActual: 'ID Reasignacion Vehicular' },
  { hoja: 'VERIFICACIONES', prefijo: 'VER', idActual: 'ID_VERIFICACION' },
  { hoja: 'INSPECCION VEHICULAR', prefijo: 'INS', idActual: 'ID INSPECCION' },
  { hoja: 'INSTALACION DE SENSORES', prefijo: 'SEN', idActual: 'ID_SENSOR' },
  { hoja: 'HOLOGRAMAS', prefijo: 'HOL', idActual: 'ID_HOLOGRAMA' },
  { hoja: 'INCIDENCIAS', prefijo: 'INC', idActual: 'ID_INCIDENCIA' },
  { hoja: 'LINEAS TELEFONICAS', prefijo: 'LIN', idActual: 'ID' },
  { hoja: 'INSPECCIONES LINEAS', prefijo: 'ILI', idActual: 'ID' },
  { hoja: 'RESPONSIVAS LINEAS', prefijo: 'RLI', idActual: 'ID' },
  { hoja: 'REACTIVACION DE LINEAS', prefijo: 'REA', idActual: 'ID' },
  { hoja: 'SOLICITUD DE LINEAS', prefijo: 'SOL', idActual: 'ID' },
  // Su columna de ID no tiene encabezado (dice ' '), por eso va por posición
  { hoja: 'CAMBIOS LINEAS TELEFONICAS', prefijo: 'CLI', idActual: null, columna: 1 },
  { hoja: 'BITACORA DE DESECHO', prefijo: 'DES', idActual: 'ID_DESECHO' },
  { hoja: 'ACCESORIOS CELULARES', prefijo: 'ACC', idActual: 'ID_Accesorio' },
  { hoja: 'MOVIMIENTOS_ACCESORIOS', prefijo: 'MAC', idActual: 'ID_Movimiento' },
  { hoja: 'ARQUEOS', prefijo: 'ARQ', idActual: 'ID ARQUEO' },
  { hoja: 'CAJAS CHICAS', prefijo: 'CCH', idActual: 'ID CCH' },
  { hoja: 'INCREMENTOS', prefijo: 'MON', idActual: 'ID' },
  { hoja: 'UBER', prefijo: 'UBE', idActual: 'ID' },
  { hoja: 'TICKETS', prefijo: 'TCK', idActual: 'ID' },
  { hoja: 'COLABORADORES', prefijo: 'COL', idActual: 'No EMPLEADO' },
];

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
];

const COL_ID = 'ID';
const COL_ID_VIEJO = 'ID APPSHEET';

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

  MIGRACION_HOJAS.forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { problemas.push('FALTA la hoja "' + h.hoja + '"'); return; }
    const enc = migEncabezados_(sheet);
    const filas = migFilas_(sheet);
    const posId = h.idActual ? migColumna_(enc, h.idActual) : (h.columna || 0);
    const detalles = [];

    if (!posId) {
      problemas.push(h.hoja + ': no encuentro su columna de ID ("' + h.idActual + '")');
    } else {
      const valores = migLeerColumna_(sheet, posId, filas);
      const llenos = valores.filter(Boolean);
      const distintos = {};
      let repetidos = 0;
      llenos.forEach((v) => {
        const k = migClave_(v);
        if (distintos[k]) repetidos++; else distintos[k] = true;
      });
      detalles.push(filas + ' filas, ' + llenos.length + ' con ID');
      if (filas - llenos.length) detalles.push((filas - llenos.length) + ' SIN ID');
      if (repetidos) problemas.push(h.hoja + ': ' + repetidos + ' IDs repetidos en "' + h.idActual + '"');
    }

    if (migColumna_(enc, COL_ID) && h.idActual !== COL_ID) detalles.push('ya tiene columna ID');
    if (migColumna_(enc, COL_ID_VIEJO)) detalles.push('ya tiene ' + COL_ID_VIEJO);
    enc.forEach((c, i) => {
      if (!c) problemas.push(h.hoja + ': la columna ' + (i + 1) + ' no tiene encabezado');
    });
    lineas.push('  ' + h.hoja + ' [' + h.prefijo + '] — ' + detalles.join(', '));
  });

  lineas.push('', problemas.length ? 'PROBLEMAS (' + problemas.length + '):' : 'Sin problemas.');
  problemas.forEach((p) => lineas.push('  - ' + p));
  lineas.push('', 'Si todo se ve bien: asignarIds({ escribir: true })');
  const texto = lineas.join('\n');
  Logger.log(texto);
  return texto;
}

// ---------------------------------------------------------------- paso 2

/**
 * Llena la columna ID de cada hoja y guarda el valor viejo en ID APPSHEET.
 * Sin { escribir: true } solo dice qué haría.
 *
 * El ID de cada renglón sale de su POSICIÓN en la hoja, no de ninguna columna de fecha:
 * ver docs/ids-asignacion.md, sección 2. Es repetible: correrlo dos veces sobre la misma
 * hoja da el mismo orden (los símbolos al azar cambian, el orden no).
 */
function asignarIds(opciones) {
  const cfg = Object.assign({ escribir: false, hojas: null }, opciones || {});
  const ssId = migracionSs_(cfg);
  const ss = SpreadsheetApp.openById(ssId);
  const lineas = [(cfg.escribir ? 'ASIGNANDO IDs' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
  let total = 0;

  MIGRACION_HOJAS.forEach((h) => {
    if (cfg.hojas && cfg.hojas.indexOf(h.hoja) === -1) return;
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) { lineas.push('  ' + h.hoja + ': NO EXISTE, se salta'); return; }
    const filas = migFilas_(sheet);
    if (!filas) { lineas.push('  ' + h.hoja + ': vacía, se salta'); return; }

    const enc = migEncabezados_(sheet);
    const posVieja = h.idActual ? migColumna_(enc, h.idActual) : (h.columna || 0);
    if (!posVieja) { lineas.push('  ' + h.hoja + ': SIN columna de ID, se salta'); return; }

    // Los IDs, uno por renglón, en el orden de la hoja
    const nuevos = [];
    const vistos = {};
    for (let i = 0; i < filas; i++) {
      let id = Ids.deLegado(h.prefijo, i);
      let intentos = 0;
      while (vistos[id] && intentos < 10) { id = Ids.deLegado(h.prefijo, i); intentos++; }
      if (vistos[id]) throw new Error('No pude generar un ID único en ' + h.hoja + ', renglón ' + (i + 2));
      vistos[id] = true;
      nuevos.push([id]);
    }

    if (!cfg.escribir) {
      lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + filas + ' IDs, ej ' + nuevos[0][0]);
      total += filas;
      return;
    }

    const colVieja = migLeerColumna_(sheet, posVieja, filas);
    const destinoViejo = migColumnaOCrear_(sheet, COL_ID_VIEJO, true);
    sheet.getRange(2, destinoViejo.columna, filas, 1).setValues(colVieja.map((v) => [v]));

    const destino = migColumnaOCrear_(sheet, COL_ID, true);
    sheet.getRange(2, destino.columna, filas, 1).setValues(nuevos);

    lineas.push('  ' + h.hoja + ' [' + h.prefijo + ']: ' + filas + ' IDs escritos en la columna ' +
      destino.columna + ', valor viejo en la ' + destinoViejo.columna);
    total += filas;
  });

  lineas.push('', total + ' renglones en total.');
  if (!cfg.escribir) lineas.push('Para escribir de verdad: asignarIds({ escribir: true })');
  else lineas.push('Ahora: auditarIds() y después reescribirReferencias({ escribir: true })');
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
  const posId = migColumna_(enc, COL_ID);
  if (!posId) throw new Error('"' + nombrePadre + '" todavía no tiene columna ID: corre asignarIds primero');
  // Por omisión se une por el ID viejo; algunas hojas se unen por su llave de negocio
  const posOrigen = porLlaveNegocio
    ? migColumna_(enc, porLlaveNegocio)
    : migColumna_(enc, COL_ID_VIEJO);
  if (!posOrigen) throw new Error('"' + nombrePadre + '" no tiene la columna "' + (porLlaveNegocio || COL_ID_VIEJO) + '"');

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
    let cambiadas = 0, sueltas = 0, vacias = 0;

    valores.forEach((v, i) => {
      if (!v) { salida.push(['']); vacias++; return; }
      const nuevo = migBuscar_(mapa, v);
      if (nuevo) { salida.push([nuevo]); cambiadas++; }
      else {
        salida.push([v]);   // nunca se inventa un padre ni se borra el renglón
        sueltas++;
        if (huerfanas.length < 40) huerfanas.push(ref.hoja + '.' + ref.columna + ' fila ' + (i + 2) + ': ' + v);
      }
    });

    const tasa = cambiadas / Math.max(1, cambiadas + sueltas);
    let nota = '';
    if (ref.esperado && Math.abs(tasa - ref.esperado) > 0.05) {
      nota = '  <-- OJO: esperaba ' + Math.round(ref.esperado * 100) + '%';
    }
    if (ref.revisar) nota += '  (columna marcada para revisar con Emmanuel)';
    lineas.push('  ' + ref.hoja + '.' + ref.columna + ' -> ' + ref.padre + ': ' +
      cambiadas + ' cambiadas, ' + sueltas + ' huérfanas, ' + vacias + ' vacías (' +
      Math.round(tasa * 100) + '%)' + nota);

    if (cfg.escribir) sheet.getRange(2, pos, filas, 1).setValues(salida);
  });

  if (huerfanas.length) {
    lineas.push('', 'HUÉRFANAS (se dejaron intactas, primeras ' + huerfanas.length + '):');
    huerfanas.forEach((h) => lineas.push('  - ' + h));
  }
  if (!cfg.escribir) lineas.push('', 'Para escribir de verdad: reescribirReferencias({ escribir: true })');
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

  MIGRACION_HOJAS.forEach((h) => {
    const sheet = ss.getSheetByName(h.hoja);
    if (!sheet) return;
    const filas = migFilas_(sheet);
    if (!filas) return;
    const enc = migEncabezados_(sheet);
    const pos = migColumna_(enc, COL_ID);
    if (!pos) { fallas.push(h.hoja + ': no tiene columna ' + COL_ID); return; }

    const ids = migLeerColumna_(sheet, pos, filas);
    const vacios = ids.filter((v) => !v).length;
    const malos = ids.filter((v) => v && !Ids.tieneForma(v)).length;
    const ajenos = ids.filter((v) => v && Ids.tieneForma(v) && Ids.prefijo(v) !== h.prefijo).length;
    const vistos = {};
    let repetidos = 0;
    ids.forEach((v) => { if (v) { if (vistos[v]) repetidos++; else vistos[v] = true; } });
    let desordenados = 0;
    for (let i = 1; i < ids.length; i++) if (ids[i] && ids[i - 1] && ids[i] < ids[i - 1]) desordenados++;

    if (vacios) fallas.push(h.hoja + ': ' + vacios + ' renglones sin ID');
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
