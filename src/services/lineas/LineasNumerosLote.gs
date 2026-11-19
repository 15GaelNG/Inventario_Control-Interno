/**
 * LineasNumerosLote.gs
 * Cambiar el número telefónico de varias líneas a la vez, desde el editor de Apps Script. Nació de los cambios de
 * número que pide un proveedor al sustituir líneas (18-nov): una tabla con el número viejo, el nuevo y el motivo.
 *
 * Las decisiones NO van en el código (el repo es público y trae números reales): se leen de un libro de Google con
 * una pestaña que tenga columnas que EMPIECEN con «ANTIGUO NUMERO», «NUEVO NUMERO» y «COMENTARIO» (acentos y signos
 * de más, como «¿…?» o «:», no importan). Si viene una columna que empiece con «COMPAÑIA» se usa solo para mostrarla
 * en el reporte (no se valida contra la del sistema). Cada línea se guarda por el mismo camino que «Corregir» de
 * Líneas (LineasRepo.guardarCambiosRegistro) y deja su movimiento CAMBIO_NUMERO con el comentario en el historial
 * (el número viejo sale en «Números de esta línea», como el «Cambio de número» de Editar línea); la bitácora la anota
 * SheetUtils.
 *
 *   lineasNumerosLoteRevisar('<id del libro>')                 → solo lee: qué haría con cada renglón
 *   lineasNumerosLoteAplicar('<id del libro>', 'SI, EN PROD')  → lo aplica (en un DEV no pide la confirmación)
 *
 * El botón Ejecutar del editor no pasa argumentos: sin ellos, el ID sale de la propiedad del script
 * LINEAS_NUMEROS_LOTE_LIBRO y la confirmación de LINEAS_NUMEROS_LOTE_CONFIRMACION (Configuración del proyecto ›
 * Propiedades del script). La confirmación se borra al aplicar, para que no se quede puesta.
 *
 * Se puede correr de nuevo: la línea que ya tiene el número nuevo se salta («ya estaba»). Si se acaba el tiempo, se
 * corre otra vez y sigue donde quedó.
 */

const NUMEROS_LOTE_LIMITE_MS = 4.5 * 60 * 1000;

function lineasNumerosLoteRevisar(idLibro) {
  soloEditor_();
  return lineasNumerosLote_(lineasNumerosLoteLibro_(idLibro), false);
}

function lineasNumerosLoteAplicar(idLibro, confirmacion) {
  soloEditor_();
  const props = PropertiesService.getScriptProperties();
  const conf = typeof confirmacion === 'string' ? confirmacion : props.getProperty('LINEAS_NUMEROS_LOTE_CONFIRMACION');
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD' && conf !== 'SI, EN PROD') {
    throw new Error("En producción pide la confirmación: lineasNumerosLoteAplicar('<id del libro>', 'SI, EN PROD'), o la propiedad del script " +
      'LINEAS_NUMEROS_LOTE_CONFIRMACION = SI, EN PROD. Primero lineasNumerosLoteRevisar.');
  }
  props.deleteProperty('LINEAS_NUMEROS_LOTE_CONFIRMACION');
  return lineasNumerosLote_(lineasNumerosLoteLibro_(idLibro), true);
}

/** El ID del libro: el argumento o, desde el botón Ejecutar (llega el evento o nada), la propiedad LINEAS_NUMEROS_LOTE_LIBRO. */
function lineasNumerosLoteLibro_(idLibro) {
  return typeof idLibro === 'string' && idLibro ? idLibro : PropertiesService.getScriptProperties().getProperty('LINEAS_NUMEROS_LOTE_LIBRO');
}

/** Lee las decisiones del libro: [{ renglon, antiguo, nuevo, compania, comentario }] (antiguo/nuevo en dígitos). */
function lineasNumerosLoteLeer_(idLibro) {
  if (!idLibro) throw new Error('Falta el ID del libro con las decisiones: pásalo o ponlo en la propiedad del script LINEAS_NUMEROS_LOTE_LIBRO.');
  const libro = SpreadsheetApp.openById(idLibro);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const empieza = (enc, prefijo) => enc.findIndex((h) => h.indexOf(prefijo) === 0);
  const hoja = libro.getSheets().filter((h) => {
    const enc = h.getLastColumn() ? h.getRange(1, 1, 1, h.getLastColumn()).getDisplayValues()[0].map(norm) : [];
    return empieza(enc, 'ANTIGUO NUMERO') >= 0 && empieza(enc, 'NUEVO NUMERO') >= 0 && empieza(enc, 'COMENTARIO') >= 0;
  })[0];
  if (!hoja) throw new Error('«' + libro.getName() + '» no tiene una pestaña con columnas que empiecen con ANTIGUO NUMERO, NUEVO NUMERO y COMENTARIO.');
  const valores = hoja.getDataRange().getDisplayValues();
  const enc = valores[0].map(norm);
  const iAntiguo = empieza(enc, 'ANTIGUO NUMERO');
  const iNuevo = empieza(enc, 'NUEVO NUMERO');
  const iCompania = empieza(enc, 'COMPANIA');
  const iComentario = empieza(enc, 'COMENTARIO');
  return valores.slice(1).map((r, i) => ({
    renglon: i + 2,
    antiguo: LineasUtil.digitos(r[iAntiguo]) || '',
    nuevo: LineasUtil.digitos(r[iNuevo]) || '',
    compania: iCompania >= 0 ? String(r[iCompania] || '').trim() : '',
    comentario: String(r[iComentario] || '').trim(),
  })).filter((d) => d.antiguo || d.nuevo || d.comentario);
}

function lineasNumerosLote_(idLibro, aplicar) {
  const decisiones = lineasNumerosLoteLeer_(idLibro);
  const inicio = Date.now();
  const correo = Session.getActiveUser().getEmail();
  // Desde el editor no hay sesión: quien lo corre (y se anota en QUIEN). Con acceso al editor de prod ya es admin.
  const usuario = { correo: correo, nombre: correo + ' (editor, en lote)', esAdmin: true };

  // Índice por número (dígitos) de toda línea, con o sin equipo (LineasLectura.filas() ya las trae juntas).
  const porNumero = {};
  LineasLectura.filas().forEach((f) => {
    const n = LineasUtil.digitos(f['NUMERO TELEFONO']);
    if (n) (porNumero[n] = porNumero[n] || []).push(f);
  });

  const lineas = [];
  const cuenta = { aplicado: 0, aplicaria: 0, yaEstaba: 0, error: 0, pendiente: 0 };
  const refrescar = [];
  const vistos = {};
  decisiones.forEach((d) => {
    const etiqueta = (d.antiguo || '—') + ' → ' + (d.nuevo || '—') + (d.compania ? ' (' + d.compania + ')' : '');
    const fallo = (motivo) => { cuenta.error++; lineas.push('✗ renglón ' + d.renglon + ' · ' + etiqueta + ': ' + motivo); };
    if (!d.antiguo) return fallo('sin número antiguo');
    if (!d.nuevo) return fallo('sin número nuevo');
    if (d.antiguo === d.nuevo) return fallo('el número antiguo y el nuevo son el mismo');
    if (vistos[d.antiguo]) return fallo('el número antiguo se repite en el libro (renglón ' + vistos[d.antiguo] + ')');
    vistos[d.antiguo] = d.renglon;
    if (d.comentario.length <= 3) return fallo('el comentario es obligatorio (más de 3 caracteres)');

    const encontrado = porNumero[d.antiguo] || [];
    const conNuevo = porNumero[d.nuevo] || [];
    if (!encontrado.length) {
      if (conNuevo.length === 1) { cuenta.yaEstaba++; lineas.push('= ' + etiqueta + ': ya tiene el número nuevo'); return; }
      return fallo('no hay ninguna línea con el número antiguo' + (conNuevo.length ? ' (y el nuevo está repetido en el sistema)' : ''));
    }
    if (encontrado.length > 1) return fallo(encontrado.length + ' líneas tienen ese número antiguo (duplicado en el sistema, revisar a mano)');
    const f = encontrado[0];
    const otraConNuevo = conNuevo.filter((x) => x['ID'] !== f['ID']);
    if (otraConNuevo.length) return fallo('el número nuevo ya está en otra línea (' + (otraConNuevo[0]['NUCO'] || otraConNuevo[0]['ID']) + ')');

    if (!aplicar) { cuenta.aplicaria++; lineas.push('→ ' + etiqueta + ' · NUCO ' + (f['NUCO'] || '—') + ' · ' + d.comentario); return; }
    if (Date.now() - inicio > NUMEROS_LOTE_LIMITE_MS) { cuenta.pendiente++; return; }
    try {
      LineasDatos.conCandado(() => {
        const fila = LineasRepo.leerRegistroObligatorio(f['ID'], 'la línea');
        const cambios = { 'NUMERO TELEFONO': d.nuevo };
        const antes = LineasRepo.convertirRegistro(fila);
        const ahora = new Date();
        const guardado = LineasRepo.guardarCambiosRegistro(fila, cambios, usuario, ahora, { corregir: true });
        // CAMBIO_NUMERO (no EDICION): es la misma línea con otro número, como «Cambio de número» de Editar línea; así el
        // número viejo sale en «Números de esta línea» y no parece un error de captura
        LineasRepo.registrarMovimiento(LineasRepo.ACCION_CAMBIO_NUMERO, { motivo: d.comentario, ticket: '' }, usuario, ahora, {
          refs: [f['ID']].concat(guardado.refs || []), nuco: f['NUCO'] || '', numero: d.nuevo, antes: antes, despues: cambios,
          detalle: { idsCambios: guardado.idsCambios, cambios: guardado.campos, lote: true },
        });
      });
      refrescar.push(f['ID']);
      cuenta.aplicado++;
      lineas.push('✓ ' + etiqueta + ' · NUCO ' + (f['NUCO'] || '—'));
    } catch (e) {
      fallo(e.message);
    }
  });
  if (refrescar.length) LineasRepo.refrescarIndice(refrescar);

  const resumen = (aplicar ? 'APLICADO' : 'REVISIÓN (no se cambió nada)') + ' · ' + decisiones.length + ' renglones · ' +
    (aplicar ? cuenta.aplicado + ' cambiados' : cuenta.aplicaria + ' se cambiarían') + ' · ' + cuenta.yaEstaba + ' ya estaban · ' +
    cuenta.error + ' con error' + (cuenta.pendiente ? ' · ' + cuenta.pendiente + ' pendientes por tiempo: córrelo otra vez' : '');
  Logger.log(resumen + '\n' + lineas.join('\n'));
  return resumen;
}
