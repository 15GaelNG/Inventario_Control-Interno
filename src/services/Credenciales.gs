/**
 * Credenciales.gs — las contraseñas de USUARIOS (23-oct).
 *
 * Antes la contraseña vivía en texto plano en la columna CONTRASEÑA de USUARIOS (la de AppSheet), en el libro
 * compartido: quien leía ese libro veía todas. Ahora se guarda solo su huella en PASSWORD_HASH:
 *
 *   v2$<iteraciones>$<sal>$<hash>      PBKDF2-HMAC-SHA256 (RFC 8018), un bloque de 32 bytes
 *
 * La versión y las iteraciones van en el valor: subir ITERACIONES después no rompe las que ya están (se rehacen
 * solas la siguiente vez que esa persona entra). Lo de antes se sigue aceptando para no dejar fuera a nadie, y al
 * entrar bien se pasa a v2 y se BORRA la celda CONTRASEÑA:
 *   - texto plano en CONTRASEÑA (AppSheet);
 *   - v1: SALT + PASSWORD_HASH = HMAC-SHA256(contraseña, sal), sin iteraciones (Auth de antes, SetupInicial).
 *
 *   Credenciales.verificar(fila, contraseña) → { ok, migrar }
 *   Credenciales.guardar(correo, contraseña, { debeCambiar })   escribe la huella y borra CONTRASEÑA
 *   Credenciales.revisarNueva(contraseña, { correo, nombre, actual })   truena con el motivo si no sirve
 *
 * Desde el editor: contrasenasAHashRevisar() / contrasenasAHash() (todas de una vez) y medirHashContrasena().
 * USUARIOS no tiene columna ID: se escribe por CORREO, sin mayúsculas ni espacios.
 */
const Credenciales = (function () {
  const HOJA = 'USUARIOS';
  // Lo que aguanta Apps Script en ~300 ms por login (medirHashContrasena). PBKDF2 en un servidor normal usa cientos
  // de miles; aquí cada vuelta es una llamada a Utilities. Lo compensan el límite de intentos y el código por correo.
  const ITERACIONES = 3000;
  const MINIMO = 10;
  const COL = { HASH: 'PASSWORD_HASH', SAL: 'SALT', PLANA: 'CONTRASEÑA', CAMBIAR: 'DEBE CAMBIAR CONTRASEÑA' };
  // Las que se prueban primero (y las de aquí): no se aceptan como contraseña nueva
  const COMUNES = ['12345678', '123456789', '1234567890', '0123456789', '1234512345', 'qwertyuiop', 'contraseña',
    'contrasena', 'password', 'password1', 'password123', 'ciudadmaderas', 'ciudad maderas', 'maderas', 'controlinterno',
    'control interno', 'postventa', 'post venta', 'bienvenido', 'bienvenida', 'administrador', 'iloveyou', 'aaaaaaaaaa',
    'abcdefghij', 'abc1234567', 'mexico1234', 'queretaro', 'mérida2026', 'merida2026', 'cancun2026'];

  const ssId = () => Config.SPREADSHEET_IDS.USUARIOS();
  const clave_ = (correo) => String(correo == null ? '' : correo).trim().toLowerCase();
  const bytes_ = (texto) => Utilities.newBlob(String(texto)).getBytes();
  const hex_ = (bytes) => bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');

  /** Compara sin cortar en la primera diferencia (no dice por tiempo cuántos caracteres atinaste) */
  function iguales_(a, b) {
    a = String(a || '');
    b = String(b || '');
    let diferencia = a.length ^ b.length;
    const largo = Math.max(a.length, b.length);
    for (let i = 0; i < largo; i++) diferencia |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    return diferencia === 0;
  }

  /** PBKDF2-HMAC-SHA256, un bloque (32 bytes): U1 = HMAC(P, S || 1), Ui = HMAC(P, Ui-1), T = U1 xor … xor Uc */
  function pbkdf2_(contrasena, sal, iteraciones) {
    const llave = bytes_(contrasena);
    let u = Utilities.computeHmacSha256Signature(bytes_(sal).concat([0, 0, 0, 1]), llave);
    const t = u.slice();
    for (let i = 1; i < iteraciones; i++) {
      u = Utilities.computeHmacSha256Signature(u, llave);
      for (let j = 0; j < t.length; j++) t[j] ^= u[j];
    }
    return hex_(t);
  }

  /** La huella v2 de una contraseña (sal nueva cada vez) */
  function crear(contrasena) {
    const sal = Utilities.getUuid().replace(/-/g, '');
    return ['v2', ITERACIONES, sal, pbkdf2_(contrasena, sal, ITERACIONES)].join('$');
  }

  /**
   * ¿Es su contraseña? → { ok, migrar }. migrar: entró bien con algo que no es v2 vigente (texto plano, v1 o v2 con
   * menos iteraciones): hay que volver a guardarla.
   */
  function verificar(fila, contrasena) {
    const guardado = String(fila[COL.HASH] || '');
    const plana = fila[COL.PLANA] === undefined || fila[COL.PLANA] === null ? '' : String(fila[COL.PLANA]);
    if (/^v2\$/.test(guardado)) {
      const [, iter, sal, hash] = guardado.split('$');
      if (iguales_(pbkdf2_(contrasena, sal, Number(iter)), hash)) return { ok: true, migrar: Number(iter) < ITERACIONES || plana !== '' };
    } else if (guardado && fila[COL.SAL]) {
      if (iguales_(hex_(Utilities.computeHmacSha256Signature(String(contrasena), String(fila[COL.SAL]))), guardado)) {
        return { ok: true, migrar: true };
      }
    }
    // Texto plano: el de AppSheet, o uno que un admin escribió en la hoja antes de que hubiera "Restablecer". Al entrar
    // bien pasa a la huella y la celda se borra: solo vive hasta el primer login.
    if (plana !== '' && iguales_(plana, String(contrasena))) return { ok: true, migrar: true };
    return { ok: false, migrar: false };
  }

  /** Por qué una contraseña nueva no sirve (truena con el motivo); nada si sirve */
  function revisarNueva(contrasena, contexto) {
    const c = contexto || {};
    const p = String(contrasena || '');
    const minus = p.toLowerCase();
    if (p.length < MINIMO) throw new Error('La contraseña debe tener al menos ' + MINIMO + ' caracteres.');
    if (/^(.)\1+$/.test(p)) throw new Error('La contraseña no puede ser un solo carácter repetido.');
    if (COMUNES.indexOf(minus) !== -1) throw new Error('Esa contraseña es de las más usadas: elige otra.');
    const usuario = clave_(c.correo).split('@')[0];
    if (usuario.length >= 4 && minus.indexOf(usuario) !== -1) throw new Error('La contraseña no puede contener tu correo.');
    const nombre = String(c.nombre || '').trim().toLowerCase();
    if (nombre && nombre.split(/\s+/).some((n) => n.length >= 4 && minus.indexOf(n) !== -1)) {
      throw new Error('La contraseña no puede contener tu nombre.');
    }
    if (c.actual !== undefined && c.actual === p) throw new Error('La contraseña nueva debe ser distinta de la actual.');
  }

  /** Las columnas que falten al final de USUARIOS (solo el encabezado) */
  function asegurarColumnas_(hoja, columnas) {
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const indices = SheetUtils.indiceDeColumnas(encabezados, columnas);
    const faltan = columnas.filter((c) => indices[c] === -1);
    if (faltan.length) hoja.getRange(1, encabezados.length + 1, 1, faltan.length).setValues([faltan]);
    return hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  }

  /** Escribe cambios en el renglón de un correo (por CORREO, USUARIOS no tiene ID). Bajo el candado. */
  function escribirPorCorreo_(correo, cambios) {
    return Candado.con(() => {
      const hoja = SheetUtils.getSheet(ssId(), HOJA);
      const encabezados = asegurarColumnas_(hoja, Object.keys(cambios));
      const indices = SheetUtils.indiceDeColumnas(encabezados, ['CORREO'].concat(Object.keys(cambios)));
      if (indices.CORREO === -1) throw new Error('USUARIOS no tiene la columna CORREO.');
      const ultima = hoja.getLastRow();
      const correos = ultima < 2 ? [] : hoja.getRange(2, indices.CORREO + 1, ultima - 1, 1).getValues();
      const i = correos.findIndex((r) => clave_(r[0]) === clave_(correo));
      if (i < 0) throw new Error('No existe el usuario ' + correo + '.');
      Object.keys(cambios).forEach((c) => {
        if (indices[c] >= 0) hoja.getRange(i + 2, indices[c] + 1).setValue(cambios[c]);
      });
      CacheHojas.tocarHoja(hoja);
      return true;
    });
  }

  /** Guarda la contraseña de un correo (su huella v2) y borra la de texto plano. debeCambiar: la temporal de un admin */
  function guardar(correo, contrasena, opciones) {
    const o = opciones || {};
    const cambios = { [COL.HASH]: crear(contrasena), [COL.SAL]: '', [COL.PLANA]: '' };
    if (o.debeCambiar !== undefined) cambios[COL.CAMBIAR] = o.debeCambiar ? 'TRUE' : '';
    return escribirPorCorreo_(correo, cambios);
  }

  /**
   * Todas las de texto plano (o v1) a v2, de una vez. aplicar = false solo cuenta. Las de texto plano se pueden pasar
   * sin que la persona entre (se conoce la contraseña); las v1 no (solo está su huella): esas esperan a su login.
   */
  function pasarTodasAHash(aplicar) {
    const hoja = SheetUtils.getSheet(ssId(), HOJA);
    const filas = SheetUtils.getAll(ssId(), HOJA);
    const r = { total: filas.length, planas: 0, v1: 0, v2: 0, sinContrasena: 0, pasadas: 0, errores: [] };
    filas.forEach((f) => {
      const hash = String(f[COL.HASH] || '');
      const plana = f[COL.PLANA] === undefined || f[COL.PLANA] === null ? '' : String(f[COL.PLANA]);
      if (/^v2\$/.test(hash)) r.v2++;
      else if (hash && f[COL.SAL]) r.v1++;
      if (plana === '') { if (!hash) r.sinContrasena++; return; }
      r.planas++;
      if (!aplicar) return;
      try {
        // Si ya tenía huella, la de texto plano manda (es la que AppSheet y los admins tenían a la vista)
        guardar(f.CORREO, plana);
        r.pasadas++;
      } catch (e) {
        r.errores.push(f.CORREO + ': ' + e.message);
      }
    });
    if (aplicar) CacheHojas.tocarHoja(hoja);
    return r;
  }

  const fila_ = (correo) => SheetUtils.getAll(ssId(), HOJA).find((f) => clave_(f.CORREO) === clave_(correo)) || null;
  const tieneContrasena_ = (fila) => !!(String(fila[COL.HASH] || '') || String(fila[COL.PLANA] == null ? '' : fila[COL.PLANA]));

  /** 12 caracteres sin los que se confunden (0/O, 1/l/I), de dos UUID aleatorios (Utilities.getUuid es v4) */
  function temporal_() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    let t = '';
    for (let i = 0; t.length < 12; i += 2) t += abc[parseInt(hex.substr(i, 2), 16) % abc.length];
    return t;
  }

  /**
   * Un admin (EDICIÓN en Usuarios y permisos) le pone una contraseña temporal: se muestra UNA vez, al entrar con ella se
   * pide una nueva, y sus dispositivos recordados se olvidan (quien la tenía ya no entra sin el código).
   */
  function restablecer(token, correo) {
    const sesion = Permisos.puedeEditar(token, 'usuarios');
    const fila = fila_(correo);
    if (!fila) throw new Error('No existe el usuario ' + correo + '.');
    const temporal = temporal_();
    guardar(fila.CORREO, temporal, { debeCambiar: true });
    if (typeof Verificacion !== 'undefined') Verificacion.olvidarDispositivos(fila.CORREO, 'restablecida por ' + sesion.correo);
    return { correo: fila.CORREO, temporal };
  }

  // Intentos de "cambiar mi contraseña" con la actual mal: 5 cada 15 min (que una sesión robada no la adivine)
  const claveCambio_ = (correo) => 'cambio_fallos_' + clave_(correo);

  /** Cada quien la suya (Mi perfil). Sin contraseña todavía (solo entraba con Google), la crea sin pedir la actual */
  function cambiarMia(token, actual, nueva) {
    const sesion = Auth.validarSesion(token);
    const fila = fila_(sesion.correo);
    if (!fila) throw new Error('Tu usuario ya no existe.');
    const cache = CacheService.getScriptCache();
    const fallos = Number(cache.get(claveCambio_(fila.CORREO)) || 0);
    if (fallos >= 5) throw new Error('Demasiados intentos. Espera 15 minutos.');
    if (tieneContrasena_(fila) && !verificar(fila, actual).ok) {
      cache.put(claveCambio_(fila.CORREO), String(fallos + 1), 15 * 60);
      throw new Error('La contraseña actual no es correcta.');
    }
    revisarNueva(nueva, { correo: fila.CORREO, nombre: fila.NOMBRE, actual: tieneContrasena_(fila) ? actual : undefined });
    guardar(fila.CORREO, nueva, { debeCambiar: false });
    cache.remove(claveCambio_(fila.CORREO));
    return true;
  }

  /** Lo de Mi perfil: si ya tiene contraseña (para pedir la actual) */
  function estado(token) {
    const sesion = Auth.validarSesion(token);
    const fila = fila_(sesion.correo);
    return { tieneContrasena: !!fila && tieneContrasena_(fila), minimo: MINIMO };
  }

  return { crear, verificar, revisarNueva, guardar, pasarTodasAHash, restablecer, cambiarMia, estado, escribirPorCorreo_,
    ITERACIONES, MINIMO, COL };
})();

/** Desde el editor: cuántas contraseñas siguen en texto plano (no cambia nada) */
function contrasenasAHashRevisar() {
  soloEditor_();
  const r = Credenciales.pasarTodasAHash(false);
  Logger.log('USUARIOS: ' + r.total + ' · en texto plano: ' + r.planas + ' · v1: ' + r.v1 + ' · v2: ' + r.v2 +
    ' · sin contraseña: ' + r.sinContrasena);
  return r;
}

/** Desde el editor: pasa a hash todas las de texto plano y borra la celda CONTRASEÑA (correr antes contrasenasAHashRevisar) */
function contrasenasAHash() {
  soloEditor_();
  const r = Credenciales.pasarTodasAHash(true);
  Logger.log('Pasadas a hash: ' + r.pasadas + ' de ' + r.planas + (r.errores.length ? ' · errores: ' + r.errores.join(' | ') : ''));
  return r;
}

/** Desde el editor: cuánto tarda una huella con las ITERACIONES de ahora (apuntar a ~300 ms) */
function medirHashContrasena() {
  soloEditor_();
  const inicio = Date.now();
  for (let i = 0; i < 3; i++) Credenciales.crear('prueba de velocidad ' + i);
  const ms = Math.round((Date.now() - inicio) / 3);
  Logger.log(Credenciales.ITERACIONES + ' iteraciones: ' + ms + ' ms por huella');
  return ms;
}
