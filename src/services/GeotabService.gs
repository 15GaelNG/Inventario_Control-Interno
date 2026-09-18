/**
 * GeotabService.gs
 * Cliente de la API de MyGeotab (JSON-RPC) desde Apps Script. Solo LECTURA.
 *
 * Equivale a lo que hacen las herramientas `gt` en Python, pero del lado del servidor
 * de la web app. Dos usos:
 *   1. Estado en vivo de la flota  → Geotab.estados()           (¿va manejando?, ¿dónde?)
 *   2. Actividad de una unidad     → Geotab.resumen(serie, 30)  (viajes, combustible y ralentí)
 *
 * La actividad es SOLO informativa: no se guarda en la hoja. El rendimiento (km/L) y el
 * consumo en ralentí (L/h) del inventario se siguen capturando a mano — los análisis de
 * `gt` usan esa tasa declarada como respaldo, así que calcularla aquí sería circular.
 *
 * Credenciales: Script Properties (NUNCA en el código ni en git)
 *   GEOTAB_USUARIO     correo de MyGeotab
 *   GEOTAB_PASSWORD    contraseña
 *   GEOTAB_BASE_DATOS  nombre de la base (database)
 *   GEOTAB_SERVIDOR    (opcional) por defecto my.geotab.com
 *
 * Notas de implementación:
 * - La sesión (sessionId) se guarda en caché 6 h: autenticar en cada llamada topa
 *   con el límite de Geotab. Si la sesión expira, se reintenta UNA vez.
 * - Las respuestas se cachean pocos segundos/minutos para no llamar a la API cada
 *   vez que alguien abre la pantalla.
 * - Requiere el permiso script.external_request (ver appsscript.json).
 */

const Geotab = (function () {
  const SEGUNDOS_CACHE_ESTADOS = 60;
  const SEGUNDOS_CACHE_DISPOSITIVOS = 600;
  const SEGUNDOS_CACHE_SESION = 6 * 60 * 60;
  const DIAS_RESUMEN = 30;

  const cache = () => CacheService.getScriptCache();
  const props = () => PropertiesService.getScriptProperties();

  function config_() {
    const p = props();
    const cfg = {
      usuario: p.getProperty('GEOTAB_USUARIO'),
      password: p.getProperty('GEOTAB_PASSWORD'),
      baseDatos: p.getProperty('GEOTAB_BASE_DATOS'),
      servidor: p.getProperty('GEOTAB_SERVIDOR') || 'my.geotab.com',
    };
    if (!cfg.usuario || !cfg.password || !cfg.baseDatos) {
      throw new Error(
        'Geotab no está configurado. En el editor de Apps Script: Configuración del proyecto > ' +
        'Propiedades del script, agrega GEOTAB_USUARIO, GEOTAB_PASSWORD y GEOTAB_BASE_DATOS.'
      );
    }
    return cfg;
  }

  /** ¿Se puede usar Geotab? (sin lanzar error: la app funciona igual sin él) */
  function configurado() {
    const p = props();
    return !!(p.getProperty('GEOTAB_USUARIO') && p.getProperty('GEOTAB_PASSWORD') && p.getProperty('GEOTAB_BASE_DATOS'));
  }

  // ---------- transporte ----------
  function postear_(servidor, cuerpo) {
    const respuesta = UrlFetchApp.fetch('https://' + servidor + '/apiv1', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(cuerpo),
      muteHttpExceptions: true,
    });
    let json;
    try {
      json = JSON.parse(respuesta.getContentText());
    } catch (e) {
      throw new Error('Geotab respondió algo inesperado (HTTP ' + respuesta.getResponseCode() + ')');
    }
    if (json.error) {
      const detalle = (json.error.errors && json.error.errors[0]) || {};
      const err = new Error(detalle.message || json.error.message || 'Error de Geotab');
      err.geotabNombre = detalle.name || '';
      throw err;
    }
    return json.result;
  }

  /** Sesión de Geotab (cacheada). `forzar` la renueva aunque haya una guardada. */
  function sesion_(forzar) {
    if (!forzar) {
      const guardada = cache().get('geotab_sesion');
      if (guardada) {
        try { return JSON.parse(guardada); } catch (e) { /* cae a autenticar */ }
      }
    }
    const cfg = config_();
    const resultado = postear_(cfg.servidor, {
      method: 'Authenticate',
      params: { database: cfg.baseDatos, userName: cfg.usuario, password: cfg.password },
    });
    // Geotab puede mandar a otro servidor ("path"); si dice ThisServer, se queda en el mismo.
    const path = resultado.path && resultado.path !== 'ThisServer' ? resultado.path : cfg.servidor;
    const sesion = { credenciales: resultado.credentials, servidor: path };
    try { cache().put('geotab_sesion', JSON.stringify(sesion), SEGUNDOS_CACHE_SESION); } catch (e) { /* no-op */ }
    return sesion;
  }

  /** Una llamada a la API. Si la sesión caducó, se renueva y se reintenta una vez. */
  function llamar_(metodo, params, yaReintento) {
    const s = sesion_(false);
    try {
      return postear_(s.servidor, { method: metodo, params: Object.assign({ credentials: s.credenciales }, params) });
    } catch (err) {
      const caduco = /InvalidUserException|SessionExpired|Invalid session/i.test(err.geotabNombre + ' ' + err.message);
      if (caduco && !yaReintento) {
        cache().remove('geotab_sesion');
        sesion_(true);
        return llamar_(metodo, params, true);
      }
      throw err;
    }
  }

  /** Varias consultas en una sola petición (menos viajes de red y menos límite de uso) */
  function multi_(llamadas) {
    return llamar_('ExecuteMultiCall', {
      calls: llamadas.map((l) => ({ method: l.metodo, params: l.params })),
    });
  }

  const obtener_ = (typeName, search, limite) => llamar_('Get', {
    typeName: typeName,
    search: search || undefined,
    resultsLimit: limite || undefined,
  });

  // ---------- utilidades de datos ----------
  /**
   * Duración de Geotab (formato TimeSpan de .NET: "[d.]hh:mm:ss[.fffffff]") → horas.
   * Ojo: partir por ":" leería "1.23:58:56" como 1.23 horas en vez de 47.98.
   */
  function duracionHoras(valor) {
    const m = /^(?:(\d+)\.)?(\d{1,3}):([0-5]\d):([0-5]\d)(?:\.(\d{1,7}))?$/.exec(String(valor || '').trim());
    if (!m) return 0;
    const fraccion = m[5] ? Number('0.' + m[5]) : 0;
    return Number(m[1] || 0) * 24 + Number(m[2]) + Number(m[3]) / 60 + (Number(m[4]) + fraccion) / 3600;
  }

  const normalizar_ = (v) => String(v == null ? '' : v).toUpperCase().replace(/\s+/g, '');
  const redondear_ = (n, decimales) => Math.round(n * Math.pow(10, decimales)) / Math.pow(10, decimales);

  // ---------- dispositivos y estado en vivo ----------
  /** Equipos de la cuenta, indexados por número de serie y por nombre (ambos se usan como SERIE SENSOR) */
  function dispositivos() {
    const guardado = cache().get('geotab_dispositivos');
    if (guardado) {
      try { return JSON.parse(guardado); } catch (e) { /* recargar */ }
    }
    const equipos = (obtener_('Device') || []).map((d) => ({
      id: d.id,
      nombre: d.name || '',
      serie: d.serialNumber || '',
      placa: d.licensePlate || '',
      vin: d.vehicleIdentificationNumber || '',
    }));
    try { cache().put('geotab_dispositivos', JSON.stringify(equipos), SEGUNDOS_CACHE_DISPOSITIVOS); } catch (e) { /* no-op */ }
    return equipos;
  }

  /** SERIE SENSOR (serie o nombre del equipo) → equipo */
  function porSerie_() {
    const indice = {};
    dispositivos().forEach((d) => {
      [d.serie, d.nombre].filter(Boolean).forEach((clave) => {
        const k = normalizar_(clave);
        if (k && !indice[k]) indice[k] = d;
      });
    });
    return indice;
  }

  function buscarDispositivo_(serieSensor) {
    const equipo = porSerie_()[normalizar_(serieSensor)];
    if (!equipo) throw new Error('Geotab no tiene ningún equipo con la serie "' + serieSensor + '"');
    return equipo;
  }

  /**
   * Estado actual de toda la flota, listo para la tabla.
   * @return {Object} SERIE SENSOR normalizada → { enMovimiento, comunicando, velocidad, lat, lon, ultimaComunicacion }
   */
  function estados() {
    const guardado = cache().get('geotab_estados');
    if (guardado) {
      try { return JSON.parse(guardado); } catch (e) { /* recargar */ }
    }
    const equipos = dispositivos();
    const porId = {};
    equipos.forEach((d) => { porId[d.id] = d; });

    const infos = obtener_('DeviceStatusInfo') || [];
    const salida = {};
    infos.forEach((info) => {
      const id = info.device && info.device.id;
      const equipo = porId[id];
      if (!equipo) return;
      const estado = {
        enMovimiento: !!info.isDriving,
        comunicando: info.isDeviceCommunicating !== false,
        velocidad: Math.round(Number(info.speed) || 0),
        lat: info.latitude,
        lon: info.longitude,
        ultimaComunicacion: info.dateTime || '',
      };
      [equipo.serie, equipo.nombre].filter(Boolean).forEach((clave) => { salida[normalizar_(clave)] = estado; });
    });

    try { cache().put('geotab_estados', JSON.stringify(salida), SEGUNDOS_CACHE_ESTADOS); } catch (e) { /* el objeto no cupo en caché */ }
    return salida;
  }

  // ---------- actividad de una unidad ----------
  /**
   * Totales del período a partir de los datos crudos. Función pura (se prueba sin API).
   *
   * Son totales, no promedios ni tasas: cuántos viajes hizo, cuánto combustible quemó
   * según la computadora del motor y cuánto tiempo estuvo en ralentí. El rendimiento
   * (km/L) y el consumo en ralentí (L/h) del inventario NO se calculan aquí: se capturan
   * a mano, porque los análisis de `gt` usan esa tasa declarada como respaldo.
   *
   * Ojo con el combustible: la computadora del motor no reporta en todos los viajes, así
   * que el total es "lo que la unidad reportó", no necesariamente todo lo que gastó. Por eso
   * se informa también en cuántos viajes hubo reporte.
   */
  function calcularResumen_(viajes, cargas) {
    const litros = cargas.reduce((suma, c) => suma + (Number(c.totalFuelUsed) || 0), 0);
    const conDato = cargas.filter((c) => Number(c.totalFuelUsed) > 0).length;
    return {
      viajes: viajes.length,
      km: redondear_(viajes.reduce((suma, v) => suma + (Number(v.distance) || 0), 0), 1),
      litros: redondear_(litros, 2),
      viajesConCombustible: conDato,
      horasRalenti: redondear_(viajes.reduce((suma, v) => suma + duracionHoras(v.idlingDuration), 0), 2),
      horasConduccion: redondear_(viajes.reduce((suma, v) => suma + duracionHoras(v.drivingDuration), 0), 2),
    };
  }

  /**
   * Actividad de UNA unidad en los últimos días: viajes, combustible y ralentí.
   * @param {string} serieSensor  SERIE SENSOR de la hoja
   * @param {number} dias         período (por defecto 30)
   */
  function resumen(serieSensor, dias) {
    const equipo = buscarDispositivo_(serieSensor);
    const periodo = Number(dias) > 0 ? Number(dias) : DIAS_RESUMEN;
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - periodo * 24 * 60 * 60 * 1000);
    const busqueda = { deviceSearch: { id: equipo.id }, fromDate: desde.toISOString(), toDate: hasta.toISOString() };

    const [viajes, cargas] = multi_([
      { metodo: 'Get', params: { typeName: 'Trip', search: busqueda } },
      { metodo: 'Get', params: { typeName: 'FuelUsed', search: busqueda } },
    ]);

    return Object.assign(calcularResumen_(viajes || [], cargas || []), {
      serieSensor: serieSensor,
      equipo: equipo.nombre || equipo.serie,
      dias: periodo,
      desde: desde.toISOString(),
      hasta: hasta.toISOString(),
    });
  }

  /** Prueba de conexión para correr desde el editor (ver SetupInicial.probarGeotab) */
  function probar() {
    const equipos = dispositivos();
    return { equipos: equipos.length, servidor: sesion_(false).servidor };
  }

  return { configurado, dispositivos, estados, resumen, probar, duracionHoras, calcularResumen_ };
})();
