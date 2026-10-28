/**
 * ClientApi.gs
 * La base de la superficie que el cliente puede llamar vía google.script.run (que solo invoca funciones de nivel
 * superior, no métodos de objetos namespaced). Cada api… es un wrapper delgado hacia el Service correspondiente —
 * así el código de negocio real vive en un solo lugar (services/*.gs) y aquí solo se decide qué queda expuesto.
 *
 * Desde la fase 6.3 (22-oct, tools/api/partir.js) cada módulo tiene su archivo en src/api/<Módulo>.gs, el del
 * módulo dueño (el servicio al que llama / el permiso que pide). Aquí queda solo lo de todos: medir, las listas con
 * huella y el vigía, el Inicio, la sesión, la campanita, qué impide borrar y el armado de fichas en una llamada.
 * Una api… nueva va en el archivo de su módulo (módulo nuevo = archivo nuevo) y se llama api<Módulo><Qué>;
 * source-contracts lo revisa. Todos los .gs comparten el ámbito global: no importa en qué archivo esté.
 */

// --- Medir ---
/** No hace nada: lo que tarda es el piso de cualquier llamada (medirPiso() en la consola) */
function apiPing() {
  return Date.now();
}

// --- Pantallas que se actualizan solas (api.html: pedirLista_ y el vigía) ---
// Una lista de la app (apiListar…, apiFicha…, apiResumenInicio) con su huella: de qué versiones de hoja salió
// (CacheHojas.conHuella). La lista revisa sus propios permisos con el token, igual que si se llamara directo.
// Solo las listas (apiListar…, apiFicha…, el Inicio y las campanitas), no cualquier api…: source-contracts revisa que
// cada callServerListaCacheada de la pantalla entre aquí
const LISTAS_CON_HUELLA_ = /^api(Listar[A-Z]\w*|Ficha[A-Z]\w*|ResumenInicio|Notificaciones|LineasIndice)$/;
function apiListaConHuella(token, fn, args) {
  if (!LISTAS_CON_HUELLA_.test(String(fn))) throw new Error('Lista desconocida: ' + fn);
  const f = globalThis[fn];
  if (typeof f !== 'function') throw new Error('Lista desconocida: ' + fn);
  const r = CacheHojas.conHuella(() => f.apply(null, [token].concat(args || [])));
  return { v: r.v, huella: r.huella };
}
// ¿Cambió algo de lo que se ve? Solo CacheService (sin leer hojas): la llamada más barata que hay.
function apiHuellasVigentes(token, claves) {
  Auth.automatica();   // la pide el vigía cada minuto: no cuenta como actividad (la sesión se cierra a los 60 min sin uso)
  Auth.validarSesion(token);
  const validas = (claves || []).filter((k) => /^ver_[\w-]{1,10}_/.test(String(k))).slice(0, 300);
  return CacheHojas.vigentes(validas);
}

// --- Dashboard ---
// JSON.stringify: incluye fechas (Date/ISO) mezcladas en varias secciones —
// mismo motivo que apiListarVehiculosResumen (ver comentario más abajo).
function apiResumenInicio(token) {
  return JSON.stringify(DashboardService.resumen(token));
}

// --- Auth ---
// dispositivo: { llave, navegador, sistema, nombre } (Verificacion.gs decide si pide el código por correo)
function apiLogin(correo, password, dispositivo) {
  return Auth.login(correo, password, dispositivo);
}
// Las fotos de perfil del directorio ({ correo: url }), para el componente Avatar
function apiFotosPerfil(token) {
  return FotosDirectorio.todas(token);
}
// Mi perfil (el usuario al pie del menú): lo de quien entró
function apiMiPerfil(token) {
  return UsuariosService.miPerfil(token);
}
function apiIdentidadGoogle() {
  return Auth.identidadGoogle();
}
function apiLoginConGoogle(dispositivo) {
  return Auth.loginConGoogle(dispositivo);
}
// Temporal, para el arreglo retroactivo de archivos sin compartir (ver
// compartirArchivosExistentes en SetupInicial.gs) — hay que correrla como
// la cuenta que desplegó la app (dueña de los archivos), no como quien esté
// en el editor, así que se llama desde la consola con la app abierta.
function apiCompartirArchivosExistentes(token) {
  return compartirArchivosExistentes(token);
}
// Igual, pero para la carpeta de Líneas (ver LineasAdmin.gs).
function apiCompartirArchivosLineasExistentes(token) {
  return compartirArchivosLineasExistentes(token);
}
function apiLogout(token) {
  return Auth.logout(token);
}

// --- Fichas en una llamada (Vehículos, Caja Chica): cada pestaña con el permiso de su módulo ---
/**
 * Para las fichas que se piden en una llamada: parte(modulo, leer) regresa lo que lee, null si
 * la persona no puede ver ese módulo (su pestaña no aparece) y [] si falla por otra cosa.
 */
function partesDeFicha_(token, deQue) {
  const sesion = Auth.validarSesion(token);
  const permisos = Permisos.deCorreo(sesion.correo);
  return (modulo, leer) => {
    if (!permisos[modulo]) return null;
    try {
      return Permisos.sinAnotar(leer);
    } catch (e) {
      if (Permisos.esFaltaDePermiso(e)) return null;
      console.warn('Ficha ' + deQue + ', pestaña ' + modulo + ': ' + e.message);
      return [];
    }
  };
}

// --- Campanita (notificaciones de todos los módulos) ---
// La campana: los avisos de todos los módulos en una llamada ({ lineas, vehiculos }; null = ese módulo falló)
function apiNotificaciones(token, limite) {
  Auth.automatica();   // la campanita se revisa sola cada tanto: no cuenta como actividad
  return NotificacionesService.campana(token, limite);
}

// --- Borrar: qué lo impide (Vehículos y Caja Chica) ---
// Antes de eliminar varios, la pantalla pregunta qué lo impide: si algo, no borra ninguno.
// El permiso es el mismo que para eliminar, porque solo tiene sentido para quien puede.
const MODULO_AL_BORRAR_ = { 'VEHICULOS': 'vehiculos', 'CAJAS CHICAS': 'caja-chica' };
function apiQueImpideBorrar(token, hoja, ids) {
  if (!MODULO_AL_BORRAR_[hoja]) throw new Error('"' + hoja + '" no se puede eliminar desde la app');
  Permisos.puedeEditar(token, MODULO_AL_BORRAR_[hoja]);
  return Relaciones.queImpideBorrar(hoja, ids);
}
