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
    // Las 41 columnas completas (usuario, 21-oct: que "Vista" no tenga que esperar a leerlas)
    ['Vehículos (todas las columnas)', () => VehiculosService.calentarCompleto()],
    ['Inspecciones', () => InspeccionesService.calentar()],
    ['Verificaciones', () => VerificacionesService.calentar()],
    ['Tickets', () => TicketsService.calentar()],
    ['Tickets (todas las columnas)', () => TicketsService.calentarCompleto()],
    // Compara los pendientes de inspección "sin cargar" contra lo que ya se sincronizó de Help
    // Desk (no llama al Help Desk ella misma: ver la nota de credenciales en
    // PendientesInspeccionService.revisarCargaHelpdesk)
    ['Tickets de inspección (match con Help Desk)', () => PendientesInspeccionService.revisarCargaHelpdesk()],
    ['Incidencias', () => IncidenciasService.calentar()],
    ['Cajas chicas', () => CajasChicasService.calentar()],
    ['Cajas chicas (todas las columnas)', () => CajasChicasService.calentarCompleto()],
    ['Arqueos', () => ArqueosService.calentar()],
    ['Arqueos (todas las columnas)', () => ArqueosService.calentarCompleto()],
    ['Cambios de monto CCH', () => CambiosMontoCCHService.calentar()],
    ['Cambios de monto CCH (todas las columnas)', () => CambiosMontoCCHService.calentarCompleto()],
    ['Cambios de vehículos', () => CambiosVehiculosService.calentar()],
    ['Cambios de vehículos (todas las columnas)', () => CambiosVehiculosService.calentarCompleto()],
    ['Reasignaciones', () => ReasignacionesVehicularesService.calentar()],
    ['Reasignaciones (todas las columnas)', () => ReasignacionesVehicularesService.calentarCompleto()],
    ['Sensores', () => SensoresService.calentar()],
    ['Hologramas', () => HologramasService.calentar()],
    // Ya NO pone BAJA sola (el usuario pidió que nunca se toque el estatus automáticamente,
    // 23-oct-2026): solo detecta y anota la etiqueta "Baja, quitar de Uber" en la hoja aparte
    // UBER BAJAS DETECTADAS -- alguien la revisa y decide a mano. La etiqueta se deja de
    // mostrar sola a la semana de detectada (UberService.advertenciasVigentes_).
    ['Uber (detecta bajas pendientes)', () => UberService.detectarBajasPendientes()],
    ['Uber', () => UberService.calentar()],
    ['Uber (todas las columnas)', () => UberService.calentarCompleto()],
    ['Colaboradores', () => CapitalHumano.calentarColaboradores()],
    ['Líneas (índice)', () => LineasRepo.indice(true)],
    // Las fotos de perfil del directorio: se rehacen cada 3 h (casi nunca cambian)
    ['Fotos del directorio', () => FotosDirectorio.calentar()],
    // Su caché dura 30 min y armarlo tarda ~15 s: se rehace una vuelta sí y otra no (cada 20
    // min, nunca llega vencido); en la otra solo se arma si no está
    ['Líneas (panorama)', () => LineasPanorama.panorama(Math.floor(Date.now() / 600000) % 2 === 0)],
    // Una vez al día revisa adendums y seguimientos (solo agrega avisos; no manda correos): así
    // no le toca a la primera persona que abre la campana en la mañana
    ['Líneas (revisión diaria de avisos)', () => LineasNotificaciones.revisar(false)],
  ];
}

/** Lo que corre el activador. También se puede correr a mano desde el editor para ver los tiempos */
function calentarCaches(e) {
  soloEditor_(e);
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

/**
 * Diagnóstico de rapidez, desde el editor: cuánto tarda cada lista (dos veces: la segunda
 * debe salir de la caché), el Inicio y la campanita (y qué sección falla, si alguna), y el
 * calentador completo. Corre con los permisos de quien lo corre. Regresa el reporte en texto
 * (también queda en el registro de ejecución).
 */
function diagnosticoRapidez() {
  soloEditor_();
  const lineas = [];
  const correo = Session.getEffectiveUser().getEmail();
  // Una sesión de 10 min solo para esto (los servicios piden token); se borra al terminar
  const token = 'diag-' + Utilities.getUuid();
  CacheService.getScriptCache().put('sesion_' + token, JSON.stringify({ correo: correo, nombre: 'diagnóstico', rol: 'ADMIN' }), 600);
  const medir = (nombre, fn) => {
    const t = Date.now();
    try {
      const r = fn();
      const filas = Array.isArray(r) ? ' · ' + r.length + ' filas' : '';
      lineas.push('  ' + nombre + ': ' + (Date.now() - t) + ' ms' + filas);
      return r;
    } catch (e) {
      lineas.push('  ' + nombre + ': FALLÓ a los ' + (Date.now() - t) + ' ms — ' + e.message);
      return null;
    }
  };
  try {
    lineas.push('Proyecto ' + ScriptApp.getScriptId() + ' · ' + correo);
    lineas.push('Calentador instalado: ' +
      (ScriptApp.getProjectTriggers().some((t) => t.getHandlerFunction() === CALENTADOR_FUNCION) ? 'sí' : 'NO'));
    lineas.push('Módulos que puede ver: ' + Object.keys(Permisos.deCorreo(correo)).join(', '));

    lineas.push('Listas (la 2a vez debe salir de la caché, en pocos ms):');
    [
      ['Vehículos', () => VehiculosService.listarResumen(token)],
      ['Inspecciones', () => InspeccionesService.listar(token)],
      ['Verificaciones', () => VerificacionesService.listar(token)],
      ['Sensores', () => SensoresService.listar(token)],
      ['Hologramas', () => HologramasService.listar(token)],
      ['Tickets', () => TicketsService.listarResumen(token)],
      ['Incidencias', () => IncidenciasService.listar(token)],
      ['Cajas chicas', () => CajasChicasService.listarResumen(token)],
      ['Arqueos', () => ArqueosService.listarResumen(token)],
      ['Seguro', () => VehiculosService.vencimientosSeguro(token)],
      ['Colaboradores', () => CapitalHumano.listarColaboradores(token)],
    ].forEach(([nombre, fn]) => { medir(nombre + ' 1a', fn); medir(nombre + ' 2a', fn); });

    lineas.push('Inicio:');
    medir('1a vez', () => DashboardService.resumen(token));
    lineas.push('  secciones que fallaron: ' + (DashboardService.ultimosFallos().join(' | ') || 'ninguna'));
    medir('2a vez (debe salir ya calculado)', () => DashboardService.resumen(token));

    lineas.push('Campanita:');
    medir('1a vez', () => NotificacionesService.listar(token));
    lineas.push('  secciones que fallaron: ' + (NotificacionesService.ultimosFallos().join(' | ') || 'ninguna'));
    medir('2a vez (debe salir ya calculada)', () => NotificacionesService.listar(token));
    medir('Líneas: notificaciones', () => TelefoniaService.notificaciones(token, 0));

    lineas.push('Calentador completo:');
    medir('calentarCaches', () => calentarCaches());
  } finally {
    CacheService.getScriptCache().remove('sesion_' + token);
  }
  const texto = lineas.join('\n');
  console.log(texto);
  return texto;
}
