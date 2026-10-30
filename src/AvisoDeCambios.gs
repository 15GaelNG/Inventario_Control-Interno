/**
 * AvisoDeCambios.gs
 * Lo que alguien edita A MANO en la hoja de cálculo también llega solo a las pantallas abiertas.
 *
 * Las pantallas se actualizan solas preguntando cada minuto si cambió la versión de las hojas de lo que muestran
 * (CacheHojas.conHuella / vigentes; el vigía en api.html). La app le cambia la versión a una hoja cada vez que escribe
 * en ella (SheetUtils → CacheHojas.tocar). Una edición a mano no pasa por la app: este activador (onEdit instalable,
 * uno por libro) le cambia la versión a la hoja editada, y en el siguiente minuto la pantalla lo trae.
 *
 * Se instala una vez por proyecto, desde el editor: instalarAvisoDeCambios(). revisarEntorno avisa si falta.
 * Lo que escribe otro programa por la API (no una persona en la hoja) no dispara onEdit: eso se ve cuando vence la
 * caché (CacheHojas.SEG_DEFECTO).
 */

const AVISO_CAMBIOS_FUNCION = 'alEditarLibro';

/**
 * El activador: la hoja que se editó a mano tiene versión nueva, y si lo editado es un dato conectado (Datos
 * conectados), se copia a las hojas que lo mantienen al día (Relaciones.alEditarAMano).
 */
function alEditarLibro(e) {
  // Solo lo llama el activador (con el libro y el rango de verdad); llamado desde el navegador no hace nada
  if (!e || !e.source || typeof e.source.getId !== 'function' || !e.range || typeof e.range.getSheet !== 'function') return;
  try {
    CacheHojas.tocar(e.source.getId(), e.range.getSheet().getName());
  } catch (err) {
    console.warn('alEditarLibro: ' + err.message);
  }
  try {
    const r = e.range;
    let quien = '';
    try { quien = e.user && e.user.getEmail ? e.user.getEmail() : ''; } catch (x) { /* sin correo */ }
    Relaciones.alEditarAMano(e.source.getId(), r.getSheet(), r.getRow(), r.getNumRows(), r.getColumn(), r.getNumColumns(),
      quien ? quien + ' (a mano)' : 'a mano');
  } catch (err) {
    console.error('alEditarLibro, datos conectados: ' + err.message);
  }
  // La bitácora: lo editado a mano. De una celda Google da lo de antes; de un pegado no (lo cubre el respaldo diario)
  try {
    if (typeof Bitacora !== 'undefined') {
      const r = e.range;
      const hoja = r.getSheet();
      let quien = '';
      try { quien = e.user && e.user.getEmail ? e.user.getEmail() : ''; } catch (x) { /* sin correo */ }
      Bitacora.aMano(quien);
      const una = r.getNumRows() === 1 && r.getNumColumns() === 1;
      const enc = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0];
      const iId = enc.findIndex((h) => String(h).trim().toUpperCase() === 'ID');
      Bitacora.evento('CAMBIAR', {
        libro: e.source.getId(), hoja: hoja.getName(), fila: r.getRow(),
        id: iId >= 0 && r.getRow() > 1 ? hoja.getRange(r.getRow(), iId + 1).getValue() : '',
        campo: una ? String(enc[r.getColumn() - 1] || '') : '',
        antes: una ? e.oldValue : '', despues: una ? e.value : '',
        detalle: una ? '' : 'a mano en ' + r.getA1Notation() + ' (de un pegado Google no da lo de antes)',
      });
    }
  } catch (err) {
    console.error('alEditarLibro, bitácora: ' + err.message);
  }
}

/** Los libros de la app (sin repetir: hoy varios apuntan al mismo) */
function librosDeLaApp_() {
  const ids = {};
  Object.keys(Config.SPREADSHEET_IDS).forEach((k) => {
    try { ids[Config.SPREADSHEET_IDS[k]()] = true; } catch (e) { /* sin esa clave en este proyecto */ }
  });
  return Object.keys(ids);
}

function instalarAvisoDeCambios() {
  soloEditor_();
  quitarAvisoDeCambios();
  const libros = librosDeLaApp_();
  libros.forEach((id) => ScriptApp.newTrigger(AVISO_CAMBIOS_FUNCION).forSpreadsheet(id).onEdit().create());
  return 'Aviso de cambios instalado en ' + libros.length + ' libro(s): lo que se edite a mano se verá en las pantallas en ~1 min.';
}

function quitarAvisoDeCambios() {
  soloEditor_();
  let quitados = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === AVISO_CAMBIOS_FUNCION) { ScriptApp.deleteTrigger(t); quitados++; }
  });
  return quitados ? 'Se quitó el aviso de cambios (' + quitados + ').' : 'No había aviso de cambios.';
}
