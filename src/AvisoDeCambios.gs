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

/** El activador: la hoja que se editó a mano tiene versión nueva */
function alEditarLibro(e) {
  try {
    CacheHojas.tocar(e.source.getId(), e.range.getSheet().getName());
  } catch (err) {
    console.warn('alEditarLibro: ' + err.message);
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
