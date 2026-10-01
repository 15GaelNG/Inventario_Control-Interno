/**
 * NotificacionesService.gs
 * Campanita de la barra superior: pendientes de Vehículos que están vencidos o
 * por vencer -- Verificaciones, Inspecciones e Seguro. Todo se recalcula en vivo
 * cada vez que se pide (sin guardar estado de "leído" por usuario); reutiliza el
 * mismo criterio de vencimiento que ya usa el panel de Inicio (DashboardService)
 * para Verificaciones/Inspecciones, y agrega Seguro (FECHA VENCIMIENTO SEGURO),
 * que hoy nadie vigilaba.
 */

const NotificacionesService = (function () {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const DIAS_POR_VENCER = 30;
  const UMBRAL_DIAS_INSPECCION = 90;

  function seccion_(fn) {
    try {
      return fn();
    } catch (e) {
      return [];
    }
  }

  /** Días desde HOY hasta `fecha` (negativo = ya pasó) o null si la fecha no es válida. */
  function diasHasta_(fecha) {
    const f = new Date(fecha);
    if (isNaN(f.getTime())) return null;
    return Math.floor((f - new Date()) / DIA_MS);
  }

  function noEsBaja_(estatus) {
    return String(estatus || '').toUpperCase() !== 'BAJA VEHICULAR';
  }

  /**
   * Mismo criterio que alertaVerificaciones_ de DashboardService: solo la
   * verificación más reciente de cada folio cuenta, y 30 días antes de
   * FECHA_PROXIMA ya es "por vencer".
   */
  function itemsVerificaciones_(token, vehiculosPorFolio) {
    const filas = VerificacionesService.listar(token);
    const ultimaPorFolio = {};
    filas.forEach((v) => {
      const actual = ultimaPorFolio[v.FOLIO];
      if (!actual || (v.FECHA_VERIFICACION || '') > (actual.FECHA_VERIFICACION || '')) ultimaPorFolio[v.FOLIO] = v;
    });
    const items = [];
    Object.keys(ultimaPorFolio).forEach((folio) => {
      const v = ultimaPorFolio[folio];
      const veh = vehiculosPorFolio[folio];
      if (veh && !noEsBaja_(veh.ESTATUS)) return;
      if (!v.FECHA_PROXIMA) return;
      const dias = diasHasta_(v.FECHA_PROXIMA);
      if (dias === null || dias > DIAS_POR_VENCER) return;
      items.push({
        tipo: 'verificacion', folio: folio, nucco: veh ? veh.NUCCO : '', dias: dias,
        severidad: dias < 0 ? 'vencida' : 'porVencer',
        texto: dias < 0
          ? 'Verificación vencida hace ' + Math.abs(dias) + ' día(s)'
          : dias === 0 ? 'Verificación vence hoy' : 'Verificación vence en ' + dias + ' día(s)',
      });
    });
    return items;
  }

  /**
   * Mismo criterio que alertaInspecciones_ de DashboardService: vehículo activo
   * sin ninguna inspección registrada, o cuya inspección más reciente tiene más
   * de UMBRAL_DIAS_INSPECCION días.
   */
  function itemsInspecciones_(token, vehiculosPorFolio) {
    const activos = Object.keys(vehiculosPorFolio)
      .map((f) => vehiculosPorFolio[f])
      .filter((v) => noEsBaja_(v.ESTATUS));

    const ultimaPorFolio = {};
    InspeccionesService.listar(token).forEach((i) => {
      const actual = ultimaPorFolio[i.FOLIO];
      if (!actual || (i.FECHA || '') > actual) ultimaPorFolio[i.FOLIO] = i.FECHA || '';
    });

    const limite = new Date(Date.now() - UMBRAL_DIAS_INSPECCION * DIA_MS);
    const items = [];
    activos.forEach((v) => {
      const ultima = ultimaPorFolio[v.FOLIO];
      const f = ultima ? new Date(ultima) : null;
      const atrasada = !ultima || isNaN(f.getTime()) || f < limite;
      if (!atrasada) return;
      const dias = f && !isNaN(f.getTime()) ? Math.floor((Date.now() - f.getTime()) / DIA_MS) : null;
      items.push({
        tipo: 'inspeccion', folio: v.FOLIO, nucco: v.NUCCO, dias: dias === null ? UMBRAL_DIAS_INSPECCION : dias,
        severidad: 'atrasada',
        texto: dias === null ? 'Nunca se le ha hecho una inspección' : 'Sin inspección desde hace ' + dias + ' día(s)',
      });
    });
    return items;
  }

  /** Seguro: FECHA VENCIMIENTO SEGURO de cada vehículo activo, mismo umbral de
   *  30 días que Verificaciones. No existía ninguna vigilancia de esto antes. */
  function itemsSeguro_(token) {
    const filas = VehiculosService.vencimientosSeguro(token);
    const items = [];
    filas.forEach((f) => {
      if (!noEsBaja_(f.ESTATUS)) return;
      const fechaVence = f['FECHA VENCIMIENTO SEGURO'];
      if (!fechaVence) return;
      const dias = diasHasta_(fechaVence);
      if (dias === null || dias > DIAS_POR_VENCER) return;
      items.push({
        tipo: 'seguro', folio: f.FOLIO, nucco: f.NUCCO, dias: dias,
        severidad: dias < 0 ? 'vencida' : 'porVencer',
        texto: dias < 0
          ? 'Seguro vencido hace ' + Math.abs(dias) + ' día(s)'
          : dias === 0 ? 'Seguro vence hoy' : 'Seguro vence en ' + dias + ' día(s)',
      });
    });
    return items;
  }

  /** Pendientes de los 3 tipos, más urgentes primero (vencidas, con días más
   *  negativos, antes que las por vencer). Cada sección se protege sola: si el
   *  usuario no tiene permiso de leer ese módulo (o algo falla), esa sección
   *  llega vacía en vez de tumbar toda la campanita -- mismo criterio que
   *  DashboardService.resumen(). */
  function listar(token) {
    Auth.validarSesion(token);
    const vehiculosPorFolio = {};
    seccion_(() => VehiculosService.listarResumen(token)).forEach((v) => { vehiculosPorFolio[v.FOLIO] = v; });

    const items = [].concat(
      seccion_(() => itemsVerificaciones_(token, vehiculosPorFolio)),
      seccion_(() => itemsInspecciones_(token, vehiculosPorFolio)),
      seccion_(() => itemsSeguro_(token))
    );
    items.sort((a, b) => a.dias - b.dias);
    return items;
  }

  return { listar: listar };
})();
