/**
 * FotosDirectorio.gs
 * Las fotos de perfil de Google de todas las personas del dominio, por correo, para pintarlas
 * en la app (componente Avatar). Mismo camino que Minuta (Instalacion.js → fotosDelDirectorio):
 *
 *   - Se lee el DIRECTORIO del dominio (People API, people:listDirectoryPeople) y se cruza por
 *     correo. No sirve "la foto de quien entra": la app corre como quien la desplegó
 *     (USER_DEPLOYING), así que siempre saldría la misma.
 *   - Al endpoint REST con ScriptApp.getOAuthToken(), no al servicio avanzado "People": no hay
 *     que activar nada en el editor. Solo el permiso directory.readonly del manifiesto.
 *   - Solo la URL de la foto (la imagen la carga el navegador desde Google), y nunca la silueta
 *     gris (default: true) de quien no subió foto: para eso están las iniciales.
 *
 * Dónde vive: en la caché del script, en pedazos (un valor aguanta 100 KB y el dominio da
 * ~2,000 personas). El Calentador la rehace cada REHACER_HORAS; si no está (de noche, o la
 * caché se vació), la primera persona que la pida la rehace (una o dos llamadas, ~1 s).
 * Si el directorio falla (sin permiso, Workspace cerrado), la app sigue con iniciales.
 *
 * Al agregar el permiso directory.readonly, quien desplegó la app tiene que autorizarlo UNA vez
 * en cada proyecto: correr revisarFotosDirectorio() desde el editor. Mientras no lo haga, la
 * app desplegada como él no arranca (Apps Script pide el permiso nuevo para todo).
 */

const FotosDirectorio = (function () {
  const ENDPOINT = 'https://people.googleapis.com/v1/people:listDirectoryPeople';
  const PREFIJO = 'fotos_dir_';
  const PEDAZO = 90000;            // caracteres por valor de caché (el límite es 100 KB)
  const VIDA_SEG = 6 * 3600;       // lo más que guarda CacheService
  const REHACER_HORAS = 3;         // el Calentador la rehace antes de que venza
  const MAX_PAGINAS = 20;          // 20,000 personas: si hay más, algo raro pasa (nunca un ciclo sin fin)

  const cache_ = () => CacheService.getScriptCache();

  /** El directorio completo → { correo: url }. Truena si Google responde con error. */
  function delDirectorio_() {
    const mapa = {};
    let pagina = null;
    for (let i = 0; i < MAX_PAGINAS; i++) {
      const url = ENDPOINT + '?readMask=emailAddresses,photos&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE&pageSize=1000' +
        (pagina ? '&pageToken=' + encodeURIComponent(pagina) : '');
      const r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
      const codigo = r.getResponseCode();
      if (codigo !== 200) {
        // El cuerpo de Google dice qué falta (el permiso, el directorio cerrado); el token no viene ahí
        throw new Error('El directorio de Google respondió ' + codigo + ': ' + String(r.getContentText()).slice(0, 300));
      }
      const datos = JSON.parse(r.getContentText());
      (datos.people || []).forEach((p) => {
        const foto = (p.photos || []).find((f) => f && f.url && !f.default);
        if (!foto || !/^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//i.test(foto.url)) return;
        (p.emailAddresses || []).forEach((e) => {
          const correo = String((e && e.value) || '').trim().toLowerCase();
          if (correo) mapa[correo] = foto.url;
        });
      });
      pagina = datos.nextPageToken;
      if (!pagina) return mapa;
    }
    return mapa;
  }

  /** Guarda el mapa en pedazos, con cuándo se armó */
  function guardar_(mapa) {
    const texto = JSON.stringify(mapa);
    const valores = {};
    let n = 0;
    for (let i = 0; i < texto.length; i += PEDAZO) valores[PREFIJO + (n++)] = texto.slice(i, i + PEDAZO);
    valores[PREFIJO + 'meta'] = JSON.stringify({ pedazos: n, armado: Date.now() });
    cache_().putAll(valores, VIDA_SEG);
  }

  /** Lo guardado ({ mapa, armado }) o null si falta algún pedazo */
  function leer_() {
    const c = cache_();
    const meta = c.get(PREFIJO + 'meta');
    if (!meta) return null;
    const m = JSON.parse(meta);
    const llaves = [];
    for (let i = 0; i < m.pedazos; i++) llaves.push(PREFIJO + i);
    const partes = c.getAll(llaves);
    if (llaves.some((k) => partes[k] === undefined || partes[k] === null)) return null;
    try {
      return { mapa: JSON.parse(llaves.map((k) => partes[k]).join('')), armado: m.armado };
    } catch (e) {
      return null;
    }
  }

  /** Arma el mapa desde el directorio y lo guarda. Regresa cuántas fotos trajo. */
  function rehacer_() {
    const mapa = delDirectorio_();
    guardar_(mapa);
    return Object.keys(mapa).length;
  }

  /**
   * { correo: url } de todo el dominio, para la pantalla. Si no está guardado, se arma ahora; si
   * el directorio falla, {} (la app sigue con iniciales) y el error queda en el registro.
   */
  function todas(token) {
    Auth.validarSesion(token);
    const guardado = leer_();
    if (guardado) return guardado.mapa;
    try {
      rehacer_();
      const nuevo = leer_();
      return nuevo ? nuevo.mapa : {};
    } catch (e) {
      console.warn('[fotos] ' + e.message);
      return {};
    }
  }

  /** La foto de un correo, solo de lo ya guardado (no llama a Google). Para la pantalla de entrada. */
  function de(correo) {
    const guardado = leer_();
    return (guardado && guardado.mapa[String(correo || '').trim().toLowerCase()]) || '';
  }

  /** Paso del Calentador: la rehace si falta o si ya tiene REHACER_HORAS. Truena si falla (queda en su registro). */
  function calentar() {
    const guardado = leer_();
    if (guardado && Date.now() - guardado.armado < REHACER_HORAS * 3600 * 1000) return 'al día';
    return rehacer_() + ' fotos';
  }

  return { todas, de, calentar, rehacer_, LIMITES: { PEDAZO, VIDA_SEG, REHACER_HORAS, MAX_PAGINAS } };
})();

/**
 * Desde el editor (una vez por proyecto, quien desplegó la app): autoriza el permiso del
 * directorio y trae las fotos. Regresa cuántas encontró.
 */
function revisarFotosDirectorio() {
  soloEditor_();
  // El editor pide los permisos con casillas (consentimiento granular): si el del directorio se
  // quedó sin marcar, ya no lo vuelve a pedir solo y Google responde 403 "insufficient scopes".
  // requireScopes lo pide otra vez (en el editor abre la ventana de permisos).
  const DIRECTORIO = 'https://www.googleapis.com/auth/directory.readonly';
  const info = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL, [DIRECTORIO]);
  console.log('Permiso del directorio: ' + info.getAuthorizationStatus());
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [DIRECTORIO]);
  const n = FotosDirectorio.rehacer_();
  const msg = n ? 'Listo: ' + n + ' correos con foto en el directorio.' : 'El directorio no regresó ninguna foto.';
  console.log(msg);
  return msg;
}
