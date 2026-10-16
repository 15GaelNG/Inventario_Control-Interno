/**
 * NotificacionesService.gs
 * Campanita de la barra superior: pendientes de Vehículos que están vencidos o
 * por vencer -- Verificaciones, Inspecciones e Seguro. Todo se recalcula en vivo
 * cada vez que se pide (sin guardar estado de "leído" por usuario); reutiliza el
 * mismo criterio de vencimiento que ya usa el panel de Inicio (DashboardService)
 * para Verificaciones/Inspecciones, y agrega Seguro (FECHA VENCIMIENTO SEGURO),
 * que hoy nadie vigilaba.
 *
 * campana(token, limite) es lo que pide la barra (apiNotificaciones, fase 5.5): una fuente por módulo (FUENTES_),
 * todas con la misma forma de aviso { id, modulo, tipo, titulo, mensaje, dias, fecha, leida… }. Líneas guarda sus
 * avisos en APP_NOTIFICACIONES (LineasNotificaciones, con leído por persona); los de Vehículos se calculan aquí.
 * Un módulo que falla llega null y los demás siguen.
 */

const NotificacionesService = (function () {
  const DIA_MS = 24 * 60 * 60 * 1000;
  const DIAS_POR_VENCER = 30;
  const UMBRAL_DIAS_INSPECCION = 90;

  // Una sección que falló por algo pasajero (no por permisos) no deja guardar la lista
  let fallos_ = [];   // errores pasajeros de la última vez (no los de permisos)
  function seccion_(fn) {
    try {
      return fn();
    } catch (e) {
      if (!Permisos.esFaltaDePermiso(e)) {
        fallos_.push(e.message);
        console.warn('[Campanita] una sección falló: ' + e.message);
      }
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
   * verificación más reciente de cada vehículo (su ID) cuenta, y 30 días antes de
   * FECHA_PROXIMA ya es "por vencer".
   */
  function itemsVerificaciones_(token, vehiculosPorId) {
    const filas = VerificacionesService.listar(token);
    const ultimaPorVehiculo = {};
    filas.forEach((v) => {
      const clave = v.ID_VEHICULO || 'folio:' + v.FOLIO;   // sin ID (no debería haber): no se pierde
      const actual = ultimaPorVehiculo[clave];
      if (!actual || (v.FECHA_VERIFICACION || '') > (actual.FECHA_VERIFICACION || '')) ultimaPorVehiculo[clave] = v;
    });
    const items = [];
    Object.keys(ultimaPorVehiculo).forEach((clave) => {
      const v = ultimaPorVehiculo[clave];
      const veh = vehiculosPorId[v.ID_VEHICULO];
      const folio = veh ? veh.FOLIO : v.FOLIO;
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
  function itemsInspecciones_(token, vehiculosPorId) {
    const activos = Object.keys(vehiculosPorId)
      .map((id) => vehiculosPorId[id])
      .filter((v) => noEsBaja_(v.ESTATUS));

    const ultimaPorVehiculo = {};
    InspeccionesService.listar(token).forEach((i) => {
      const actual = ultimaPorVehiculo[i.ID_VEHICULO];
      if (!actual || (i.FECHA || '') > actual) ultimaPorVehiculo[i.ID_VEHICULO] = i.FECHA || '';
    });

    const limite = new Date(Date.now() - UMBRAL_DIAS_INSPECCION * DIA_MS);
    const items = [];
    activos.forEach((v) => {
      const ultima = ultimaPorVehiculo[v.ID_VEHICULO];
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
    const sesion = Auth.validarSesion(token);
    // Ya calculada para todos los que ven los mismos módulos; se rehace al cambiar una hoja
    return CacheHojas.calculo('campanita_' + Permisos.firmaDeLectura(sesion.correo), () => armar_(token), {
      guardarSi: () => !fallos_.length,
    });
  }

  function armar_(token) {
    fallos_ = [];
    const vehiculosPorId = {};
    seccion_(() => VehiculosService.listarResumen(token)).forEach((v) => { if (v.ID_VEHICULO) vehiculosPorId[v.ID_VEHICULO] = v; });

    const items = [].concat(
      seccion_(() => itemsVerificaciones_(token, vehiculosPorId)),
      seccion_(() => itemsInspecciones_(token, vehiculosPorId)),
      seccion_(() => itemsSeguro_(token))
    );
    items.sort((a, b) => a.dias - b.dias);
    return items;
  }

  // ---------------- La campana: una fuente por módulo ----------------

  const ETIQUETA_VEH_ = { verificacion: 'Verificación', seguro: 'Seguro', inspeccion: 'Inspección' };

  /** Pendiente de Vehículos con la forma de un aviso. Su "leída" la pone la pantalla: es solo de ese navegador. */
  function avisoVehiculo_(v) {
    const tipo = String(v.tipo || '').toLowerCase();
    return {
      id: 'veh-' + tipo + '-' + v.folio, tipo: 'VEH_' + tipo.toUpperCase(), folio: v.folio,
      titulo: (ETIQUETA_VEH_[tipo] || tipo) + ' · Nucco ' + (v.nucco || v.folio) + (v.nucco && v.folio ? ' (' + v.folio + ')' : ''),
      mensaje: v.texto || '', dias: v.dias, severidad: v.severidad, fecha: null,
    };
  }

  /** Cada módulo: { items, noLeidas? }. limite recorta los que se guardan con fecha (la campana pide pocos). */
  const FUENTES_ = {
    lineas: (token, limite) => TelefoniaService.notificaciones(token, limite),
    vehiculos: (token) => ({ items: listar(token).map(avisoVehiculo_) }),
  };

  function campana(token, limite) {
    Auth.validarSesion(token);
    const r = {};
    Object.keys(FUENTES_).forEach((modulo) => {
      try {
        const x = FUENTES_[modulo](token, Number(limite) || 0);
        (x.items || []).forEach((n) => { n.modulo = modulo; });
        r[modulo] = x;
      } catch (e) {
        console.warn('[Campanita] ' + modulo + ': ' + e.message);
        r[modulo] = null;
      }
    });
    return r;
  }

  return { listar: listar, campana: campana, ultimosFallos: () => fallos_.slice() };
})();
