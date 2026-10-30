/**
 * LineasCartaCancelacion.gs
 * La columna CARTA DE CANCELACION de la hoja LINEAS: SI si el número viene en alguna carta de cancelación que se mandó
 * al proveedor, NO si no. Solo distingue eso (30-oct): en el sistema CANCELADA quiere decir "este número ya no lo
 * usamos" (cambio de número, limpieza…), y el reporte de líneas cuenta solo las bajas pedidas; con esta columna se
 * separan las que se pidieron con carta.
 *
 * Los números NO van en el código (el repo es público): se leen de un libro con una pestaña que tenga la columna
 * NUMERO, un renglón por número de cada carta (CARTA y FECHA, si vienen, solo salen en el registro).
 *
 *   lineasCartaRevisar('<id del libro>')                 → solo lee: cuántas quedarían SI y NO y qué cambia
 *   lineasCartaAplicar('<id del libro>', 'SI, EN PROD')  → crea la columna (al final de LINEAS) y la llena
 *
 * El botón Ejecutar del editor no pasa argumentos: sin ellos, el ID sale de la propiedad del script LINEAS_CARTA_LIBRO y
 * la confirmación de LINEAS_CARTA_CONFIRMACION (que se borra al aplicar). Se puede correr de nuevo: solo escribe si
 * algún valor cambia. La columna se escribe completa en una sola operación (la bitácora la anota como CARGA).
 */

const CARTA_COLUMNA = 'CARTA DE CANCELACION';

function lineasCartaRevisar(idLibro) {
  soloEditor_();
  return lineasCarta_(lineasCartaLibro_(idLibro), false);
}

function lineasCartaAplicar(idLibro, confirmacion) {
  soloEditor_();
  const props = PropertiesService.getScriptProperties();
  const conf = typeof confirmacion === 'string' ? confirmacion : props.getProperty('LINEAS_CARTA_CONFIRMACION');
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD' && conf !== 'SI, EN PROD') {
    throw new Error("En producción pide la confirmación: lineasCartaAplicar('<id del libro>', 'SI, EN PROD'), o la propiedad del script " +
      'LINEAS_CARTA_CONFIRMACION = SI, EN PROD. Primero lineasCartaRevisar.');
  }
  props.deleteProperty('LINEAS_CARTA_CONFIRMACION');
  return lineasCarta_(lineasCartaLibro_(idLibro), true);
}

/** El ID del libro: el argumento o, desde el botón Ejecutar (llega el evento o nada), la propiedad LINEAS_CARTA_LIBRO. */
function lineasCartaLibro_(idLibro) {
  return typeof idLibro === 'string' && idLibro ? idLibro : PropertiesService.getScriptProperties().getProperty('LINEAS_CARTA_LIBRO');
}

/** Los últimos 10 dígitos de un número (como se cruza todo Líneas con las facturas). */
function lineasCartaNumero_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\D/g, '').slice(-10);
}

/** Lee los números de las cartas: { numero: 'CARTA · FECHA' }. */
function lineasCartaLeer_(idLibro) {
  if (!idLibro) throw new Error('Falta el ID del libro con los números de las cartas: pásalo o ponlo en la propiedad del script LINEAS_CARTA_LIBRO.');
  const libro = SpreadsheetApp.openById(idLibro);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const hoja = libro.getSheets().filter((h) => h.getLastColumn() &&
    h.getRange(1, 1, 1, h.getLastColumn()).getDisplayValues()[0].map(norm).indexOf('NUMERO') >= 0)[0];
  if (!hoja) throw new Error('«' + libro.getName() + '» no tiene una pestaña con la columna NUMERO.');
  const valores = hoja.getDataRange().getDisplayValues();
  const enc = valores[0].map(norm);
  const c = (x) => enc.indexOf(x);
  const numeros = {};
  valores.slice(1).forEach((r) => {
    const n = lineasCartaNumero_(r[c('NUMERO')]);
    if (n.length !== 10) return;
    const de = [c('CARTA') >= 0 ? r[c('CARTA')] : '', c('FECHA') >= 0 ? r[c('FECHA')] : ''].filter(Boolean).join(' · ');
    numeros[n] = numeros[n] ? numeros[n] + '; ' + de : de;
  });
  return numeros;
}

function lineasCarta_(idLibro, aplicar) {
  const cartas = lineasCartaLeer_(idLibro);
  const filas = LineasDatos.leerTabla('LINEAS');
  if (!filas.length) throw new Error('La hoja LINEAS está vacía.');
  const ultima = Math.max.apply(null, filas.map((f) => f._fila));
  // Un valor por renglón de la hoja (2..última); un renglón vacío conserva lo que tenga (nada)
  const valores = new Array(ultima - 1).fill('');
  const cuenta = { si: 0, no: 0, cambian: 0 };
  const enLineas = {};
  const siActivas = [];
  filas.forEach((f) => {
    const n = lineasCartaNumero_(f['NUMERO TELEFONO']);
    const valor = n && cartas[n] !== undefined ? 'SI' : 'NO';
    if (n) enLineas[n] = true;
    valores[f._fila - 2] = valor;
    cuenta[valor === 'SI' ? 'si' : 'no']++;
    if (String(f[CARTA_COLUMNA] === undefined ? '' : f[CARTA_COLUMNA]).trim().toUpperCase() !== valor) cuenta.cambian++;
    const estatus = String(f['ESTATUS LINEA'] || '').toUpperCase();
    if (valor === 'SI' && estatus !== 'CANCELADA' && estatus !== 'EN PROCESO DE CANCELACION') siActivas.push(n + ' (' + (estatus || 'sin estatus') + ')');
  });
  const fuera = Object.keys(cartas).filter((n) => !enLineas[n]);

  let escrito = false;
  if (aplicar && cuenta.cambian) {
    LineasDatos.conCandado(() => {
      LineasDatos.asegurarColumnas('LINEAS', [CARTA_COLUMNA]);
      SheetUtils.cambiarColumna(LineasDatos.paraEscribir('LINEAS'), CARTA_COLUMNA, valores, 2);
    });
    LineasDatos.olvidarTabla('LINEAS');
    escrito = true;
  }

  const resumen = (aplicar ? (escrito ? 'APLICADO' : 'SIN CAMBIOS') : 'REVISIÓN (no se cambió nada)') + ' · ' +
    Object.keys(cartas).length + ' números en las cartas · LINEAS: ' + filas.length + ' registros → ' + cuenta.si + ' SI · ' +
    cuenta.no + ' NO · ' + cuenta.cambian + (aplicar ? ' escritos' : ' cambiarían');
  Logger.log(resumen +
    '\nNúmeros de las cartas que no están en LINEAS (' + fuera.length + '): ' + (fuera.join(', ') || '—') +
    '\nCon carta y hoy no están cancelados ni en proceso (' + siActivas.length + '): ' + (siActivas.join(', ') || '—'));
  return resumen;
}
