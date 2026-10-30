/**
 * LineasEstatusLote.gs
 * Cambiar el estatus de varios equipos a la vez, desde el editor de Apps Script. Nació con las decisiones de la
 * Dirección de Líneas sobre los equipos FUERA DE INVENTARIO (30-oct): VENDIDO, DONADO, DESECHADO o EXTRAVIO-ROBO, cada
 * uno con su comentario.
 *
 * Las decisiones NO van en el código (el repo es público y traen IMEIs y nombres): se leen de un libro de Google con
 * una pestaña que tenga las columnas NUCO, ESTATUS NUEVO y COMENTARIO (y, si viene, ESTATUS ACTUAL: el equipo debe
 * tenerlo, o no se toca). Cada equipo se guarda por el mismo camino que «Editar» de Líneas
 * (LineasRepo.guardarCambiosRegistro) y deja su movimiento EDICION con el comentario en el historial; la bitácora la
 * anota SheetUtils.
 *
 *   lineasEstatusLoteRevisar('<id del libro>')                 → solo lee: qué haría con cada NUCO
 *   lineasEstatusLoteAplicar('<id del libro>', 'SI, EN PROD')  → lo aplica (en un DEV no pide la confirmación)
 *
 * Se puede correr de nuevo: el equipo que ya tiene el estatus nuevo se salta. Si se acaba el tiempo, se corre otra vez.
 */

/** Solo estatus finales: lo de resguardo (RESGUARDO, PARA VENTA, PARA DESECHO) va por «Mandar a resguardo». */
const LOTE_ESTATUS_PERMITIDOS = ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'];
const LOTE_LIMITE_MS = 4.5 * 60 * 1000;

function lineasEstatusLoteRevisar(idLibro) {
  soloEditor_();
  return lineasEstatusLote_(idLibro, false);
}

function lineasEstatusLoteAplicar(idLibro, confirmacion) {
  soloEditor_();
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("En producción se corre como lineasEstatusLoteAplicar('<id del libro>', 'SI, EN PROD'). Primero lineasEstatusLoteRevisar.");
  }
  return lineasEstatusLote_(idLibro, true);
}

/** Lee las decisiones del libro: [{ renglon, nuco, actual, nuevo, comentario }]. */
function lineasEstatusLoteLeer_(idLibro) {
  if (!idLibro) throw new Error('Falta el ID del libro con las decisiones.');
  const libro = SpreadsheetApp.openById(idLibro);
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const hoja = libro.getSheets().filter((h) => {
    const enc = h.getLastColumn() ? h.getRange(1, 1, 1, h.getLastColumn()).getDisplayValues()[0].map(norm) : [];
    return ['NUCO', 'ESTATUS NUEVO', 'COMENTARIO'].every((c) => enc.indexOf(c) >= 0);
  })[0];
  if (!hoja) throw new Error('«' + libro.getName() + '» no tiene una pestaña con las columnas NUCO, ESTATUS NUEVO y COMENTARIO.');
  const valores = hoja.getDataRange().getDisplayValues();
  const enc = valores[0].map(norm);
  const col = (c) => enc.indexOf(c);
  return valores.slice(1).map((r, i) => ({
    renglon: i + 2,
    nuco: LineasUtil.nucoVisible(r[col('NUCO')]) || '',
    actual: col('ESTATUS ACTUAL') >= 0 ? norm(r[col('ESTATUS ACTUAL')]) : '',
    nuevo: norm(r[col('ESTATUS NUEVO')]),
    comentario: String(r[col('COMENTARIO')] || '').trim(),
  })).filter((d) => d.nuco || d.nuevo || d.comentario);
}

function lineasEstatusLote_(idLibro, aplicar) {
  const decisiones = lineasEstatusLoteLeer_(idLibro);
  const inicio = Date.now();
  const correo = Session.getActiveUser().getEmail();
  // Desde el editor no hay sesión: quien lo corre (y se anota en QUIEN). Con acceso al editor de prod ya es admin.
  const usuario = { correo: correo, nombre: correo + ' (editor, en lote)', esAdmin: true };
  const porNuco = {};
  LineasLectura.filas().forEach((f) => {
    const n = LineasUtil.nucoVisible(f['NUCO']);
    if (n && LineasUtil.txt(f['ID EQUIPO'])) (porNuco[n] = porNuco[n] || []).push(f);
  });

  const lineas = [];
  const cuenta = { aplicado: 0, aplicaria: 0, yaEstaba: 0, error: 0, pendiente: 0 };
  const refrescar = [];
  const vistos = {};
  decisiones.forEach((d) => {
    const fallo = (motivo) => { cuenta.error++; lineas.push('✗ renglón ' + d.renglon + ' · NUCO ' + (d.nuco || '—') + ': ' + motivo); };
    if (!d.nuco) return fallo('sin NUCO');
    if (vistos[d.nuco]) return fallo('el NUCO se repite en el libro (renglón ' + vistos[d.nuco] + ')');
    vistos[d.nuco] = d.renglon;
    if (LOTE_ESTATUS_PERMITIDOS.indexOf(d.nuevo) < 0) return fallo('estatus nuevo «' + d.nuevo + '»; se permite ' + LOTE_ESTATUS_PERMITIDOS.join(', '));
    if (d.comentario.length <= 3) return fallo('el comentario es obligatorio (más de 3 caracteres)');
    const regs = porNuco[d.nuco] || [];
    if (regs.length !== 1) return fallo(regs.length ? regs.length + ' equipos con ese NUCO' : 'no hay equipo con ese NUCO');
    const f = regs[0];
    const estatus = String(f['ESTATUS EQUIPO'] || '').trim().toUpperCase();
    if (estatus === d.nuevo) { cuenta.yaEstaba++; lineas.push('= NUCO ' + d.nuco + ': ya está ' + d.nuevo); return; }
    if (d.actual && estatus !== d.actual) return fallo('está ' + (estatus || 'sin estatus') + ' y el libro dice ' + d.actual);
    if (LineasUtil.txt(f['NUMERO TELEFONO']) || LineasUtil.txt(f['NUMERO SIM'])) {
      return fallo('tiene línea (' + (f['NUMERO TELEFONO'] || f['NUMERO SIM']) + '): hazlo desde Editar, que decide qué pasa con la línea');
    }
    if (!aplicar) { cuenta.aplicaria++; lineas.push('→ NUCO ' + d.nuco + ': ' + (estatus || 'sin estatus') + ' → ' + d.nuevo + ' · ' + d.comentario); return; }
    if (Date.now() - inicio > LOTE_LIMITE_MS) { cuenta.pendiente++; return; }
    try {
      LineasDatos.conCandado(() => {
        const fila = LineasRepo.leerRegistroObligatorio(f['ID'], 'el equipo');
        const cambios = { 'ESTATUS EQUIPO': d.nuevo };
        const antes = LineasRepo.convertirRegistro(fila);
        const ahora = new Date();
        const guardado = LineasRepo.guardarCambiosRegistro(fila, cambios, usuario, ahora, { corregir: true });
        LineasRepo.registrarMovimiento('EDICION', { motivo: d.comentario, ticket: '' }, usuario, ahora, {
          refs: [f['ID']].concat(guardado.refs || []), nuco: d.nuco, numero: '', antes: antes, despues: cambios,
          detalle: { idsCambios: guardado.idsCambios, cambios: guardado.campos, lote: true },
        });
      });
      refrescar.push(f['ID']);
      cuenta.aplicado++;
      lineas.push('✓ NUCO ' + d.nuco + ': ' + (estatus || 'sin estatus') + ' → ' + d.nuevo);
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
