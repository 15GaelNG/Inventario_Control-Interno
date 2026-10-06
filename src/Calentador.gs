/**
 * Calentador.gs — mantiene armadas las listas que más se piden, para que nadie espere a que
 * se lea una hoja.
 *
 * Cada lista se guarda en CacheService (CacheHojas) y vence a los 10 min; al vencer, a quien
 * le tocaba la siguiente consulta esperaba 5–15 s a que se leyera la hoja completa
 * (Inspecciones, Cambios de vehículos, Colaboradores…). Este activador las vuelve a armar cada
 * 10 min en horario de trabajo y las guarda por 25, así que nunca llegan vencidas. De paso
 * recoge lo que se escribió fuera de la app (AppSheet, a mano), igual que antes al vencer.
 *
 * Se instala una vez por proyecto desde el editor: instalarCalentador(). quitarCalentador() lo
 * quita. Con la Script Property CALENTADOR_APAGADO = 1 no hace nada (sin borrar el activador).
 */

const CALENTADOR_FUNCION = 'calentarCaches';
const CALENTADOR_HORARIO = { desde: 6, hasta: 22 };   // hora local; fuera de eso no gasta cuota

/** Lo que se calienta, en orden: lo de la pantalla de inicio primero */
function pasosCalentador_() {
  return [
    ['Vehículos', () => VehiculosService.calentar()],
    ['Inspecciones', () => InspeccionesService.calentar()],
    ['Verificaciones', () => VerificacionesService.calentar()],
    ['Tickets', () => TicketsService.calentar()],
    ['Incidencias', () => IncidenciasService.calentar()],
    ['Cajas chicas', () => CajasChicasService.calentar()],
    ['Arqueos', () => ArqueosService.calentar()],
    ['Cambios de monto CCH', () => CambiosMontoCCHService.calentar()],
    ['Cambios de vehículos', () => CambiosVehiculosService.calentar()],
    ['Reasignaciones', () => ReasignacionesVehicularesService.calentar()],
    ['Sensores', () => SensoresService.calentar()],
    ['Hologramas', () => HologramasService.calentar()],
    ['Uber', () => UberService.calentar()],
    ['Colaboradores', () => CapitalHumano.calentarColaboradores()],
    ['Líneas (índice)', () => LineasRepo.indice(true)],
  ];
}

/** Lo que corre el activador. También se puede correr a mano desde el editor para ver los tiempos */
function calentarCaches() {
  soloEditor_();
  if (PropertiesService.getScriptProperties().getProperty('CALENTADOR_APAGADO') === '1') return 'apagado';
  const hora = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'H'));
  if (hora < CALENTADOR_HORARIO.desde || hora >= CALENTADOR_HORARIO.hasta) return 'fuera de horario';

  const inicio = Date.now();
  const tiempos = pasosCalentador_().map(([nombre, calentar]) => {
    const t = Date.now();
    try {
      calentar();
      return nombre + ' ' + (Date.now() - t) + ' ms';
    } catch (e) {
      // Un módulo que falla no detiene a los demás; queda en el registro de ejecuciones
      console.warn('[calentador] ' + nombre + ': ' + e.message);
      return nombre + ' FALLÓ (' + e.message + ')';
    }
  });
  const resumen = 'Caché calentada en ' + (Date.now() - inicio) + ' ms: ' + tiempos.join(' · ');
  console.log(resumen);
  return resumen;
}

/** Instala el activador (cada 10 min). Si ya había uno, lo reemplaza: correrlo dos veces no duplica */
function instalarCalentador() {
  soloEditor_();
  quitarCalentador();
  ScriptApp.newTrigger(CALENTADOR_FUNCION).timeBased().everyMinutes(10).create();
  return 'Calentador instalado: cada 10 min, de ' + CALENTADOR_HORARIO.desde + ' a ' + CALENTADOR_HORARIO.hasta + ' h.';
}

function quitarCalentador() {
  soloEditor_();
  let quitados = 0;
  ScriptApp.getProjectTriggers().forEach((t) => {
    if (t.getHandlerFunction() === CALENTADOR_FUNCION) { ScriptApp.deleteTrigger(t); quitados++; }
  });
  return quitados ? 'Se quitó el calentador.' : 'No había calentador.';
}
