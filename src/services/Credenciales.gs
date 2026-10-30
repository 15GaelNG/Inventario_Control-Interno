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
  const MINIMO = 8;
  // Lo que debe traer una contraseña nueva, como "Mar1posa!" (la pantalla repite la misma lista para palomearla)
  const TIPOS = {
    'una mayúscula': /[A-ZÁÉÍÓÚÑ]/,
    'una minúscula': /[a-záéíóúñ]/,
    'un número': /\d/,
    'un símbolo': /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/,
  };
  const COL = { HASH: 'PASSWORD_HASH', SAL: 'SALT', PLANA: 'CONTRASEÑA', CAMBIAR: 'DEBE CAMBIAR CONTRASEÑA', CAMBIADA: 'CONTRASEÑA CAMBIADA',
    BLOQUEO: 'BLOQUEO SEGURIDAD' };

  /**
   * Bloqueo por seguridad (23-oct): un admin sospecha que tomaron el correo (o la cuenta de Google) de alguien. Mientras
   * dure, nada pasa por ese correo: sin enlace de recuperación (Recuperacion.gs), sin "Continuar como…" (Auth.gs) y sin
   * avisos informativos (avisar_, Verificacion). Solo se entra con la temporal que el admin da en persona o por teléfono.
   * La columna guarda un texto legible: '2026-10-23 10:40 | admin@… | motivo'; vacía = sin bloqueo.
   */
  const bloqueado = (fila) => !!(fila && String(fila[COL.BLOQUEO] == null ? '' : fila[COL.BLOQUEO]).trim());
  // Las que se prueban primero (y las de aquí): no se aceptan como contraseña nueva
  const COMUNES = ['12345678', '123456789', '1234567890', '0123456789', '1234512345', 'qwertyuiop', 'contraseña',
    'contrasena', 'password', 'password1', 'password123', 'ciudadmaderas', 'ciudad maderas', 'maderas', 'controlinterno',
    'control interno', 'postventa', 'post venta', 'bienvenido', 'bienvenida', 'administrador', 'iloveyou', 'aaaaaaaaaa',
    'abcdefghij', 'abc1234567', 'mexico1234', 'queretaro', 'mérida2026', 'merida2026', 'cancun2026',
    // Las comunes que sí traen mayúscula, número y símbolo: justo las que alguien elige para "pasar" la regla
    'password1!', 'password123!', 'qwerty123!', 'contraseña1!', 'contrasena1!', 'ciudadmaderas1!', 'ciudadmaderas2026!',
    'maderas123!', 'bienvenido1!', 'bienvenida1!', 'mexico123!', 'admin123!', 'abc123456!', 'controlinterno1!'];

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
    // Como "Mar1posa!": mayúscula, minúscula, número y símbolo (lo pidió el área, 23-oct; el espacio no cuenta como símbolo)
    const falta = Object.keys(TIPOS).filter((k) => !TIPOS[k].test(p));
    if (falta.length) throw new Error('A la contraseña le falta: ' + falta.join(', ') + '.');
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

  /** Las columnas que falten al final de USUARIOS (solo el encabezado). → los encabezados, ya con ellas */
  function asegurarColumnas_(hoja, columnas) {
    const t = SheetUtils.tabla(hoja);
    SheetUtils.asegurarColumnas(t, columnas, { negritas: false });
    return t.encabezados;
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
      SheetUtils.cambiarCeldas(SheetUtils.tabla(hoja, { encabezados: encabezados }), [{
        fila: i + 2,
        columnas: Object.keys(cambios).filter((c) => indices[c] >= 0).map((c) => ({ i: indices[c], valor: cambios[c] })),
      }]);
      return true;
    });
  }

  /** Guarda la contraseña de un correo (su huella v2) y borra la de texto plano. debeCambiar: la temporal de un admin */
  function guardar(correo, contrasena, opciones) {
    const o = opciones || {};
    const cambios = { [COL.HASH]: crear(contrasena), [COL.SAL]: '', [COL.PLANA]: '', [COL.CAMBIADA]: new Date() };
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

  /** 10 caracteres sin los que se confunden (0/O, 1/l/I), de dos UUID aleatorios (Utilities.getUuid es v4) */
  const LARGO_TEMPORAL = 10;
  function temporal_() {
    const abc = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    const hex = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    let t = '';
    for (let i = 0; t.length < LARGO_TEMPORAL; i += 2) t += abc[parseInt(hex.substr(i, 2), 16) % abc.length];
    return t;
  }

  /**
   * Una temporal para CADA usuario activo (23-oct, lo pidió el área): la cambia al entrar (DEBE CAMBIAR), sus sesiones y
   * dispositivos recordados se cierran. Se lee USUARIOS una vez y se escribe columna por columna (uno por uno, con
   * cientos de usuarios, pasaría de los 6 min). aplicar = false solo cuenta. → { activos, asignadas, lista }
   */
  function temporalesParaActivos(aplicar) {
    const r = Candado.con(() => {
      const hoja = SheetUtils.getSheet(ssId(), HOJA);
      const columnas = [COL.HASH, COL.SAL, COL.PLANA, COL.CAMBIAR, COL.CAMBIADA];
      const encabezados = aplicar ? asegurarColumnas_(hoja, columnas) : hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
      const idx = SheetUtils.indiceDeColumnas(encabezados, ['CORREO', 'NOMBRE', 'ACTIVO', 'AREA'].concat(columnas));
      const ultima = hoja.getLastRow();
      const datos = ultima < 2 ? [] : hoja.getRange(2, 1, ultima - 1, encabezados.length).getValues();
      const activos = datos.map((f, i) => ({ f, i })).filter(({ f }) =>
        String(idx.ACTIVO >= 0 ? f[idx.ACTIVO] : '').toUpperCase() === 'TRUE' && String(f[idx.CORREO] || '').trim());
      if (!aplicar) return { activos: activos.length, asignadas: 0, lista: [] };
      const ahora = new Date();
      const lista = [];
      activos.forEach(({ f }) => {
        const temporal = temporal_();
        f[idx[COL.HASH]] = crear(temporal);
        f[idx[COL.SAL]] = '';
        f[idx[COL.PLANA]] = '';
        f[idx[COL.CAMBIAR]] = 'TRUE';
        f[idx[COL.CAMBIADA]] = ahora;
        lista.push({ correo: String(f[idx.CORREO]).trim(), nombre: idx.NOMBRE >= 0 ? f[idx.NOMBRE] : '', area: idx.AREA >= 0 ? f[idx.AREA] : '', temporal });
      });
      // Solo las columnas de la contraseña, de un jalón cada una: lo demás del renglón no se toca
      const t = SheetUtils.tabla(hoja, { encabezados: encabezados });
      columnas.forEach((c) => SheetUtils.cambiarColumna(t, idx[c], datos.map((f) => f[idx[c]])));
      return { activos: activos.length, asignadas: lista.length, lista };
    });
    if (aplicar && r.lista.length) {
      const correos = r.lista.map((x) => x.correo);
      if (typeof Verificacion !== 'undefined') Verificacion.olvidarDispositivosDe(correos, 'temporal para todos');
      correos.forEach((c) => Auth.cerrarSesiones(c));
    }
    return r;
  }

  /**
   * Que cada activo cambie SU contraseña la próxima vez que entre, sin repartir temporales (26-oct): solo la columna
   * DEBE CAMBIAR CONTRASEÑA = 'VIEJA'. Con contraseña, antes de elegir la nueva confirma con el código por correo (la vieja
   * pudo verse en la hoja de AppSheet); con Google, elige la nueva directo (Auth.continuar_). No toca la contraseña, ni
   * cierra sesiones, ni pisa una temporal pendiente ('TRUE'). aplicar = false solo cuenta.
   */
  function pedirCambioATodos(aplicar) {
    return Candado.con(() => {
      const hoja = SheetUtils.getSheet(ssId(), HOJA);
      const encabezados = aplicar ? asegurarColumnas_(hoja, [COL.CAMBIAR]) : hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
      const idx = SheetUtils.indiceDeColumnas(encabezados, ['CORREO', 'ACTIVO', COL.HASH, COL.PLANA, COL.CAMBIAR]);
      const ultima = hoja.getLastRow();
      const datos = ultima < 2 ? [] : hoja.getRange(2, 1, ultima - 1, encabezados.length).getValues();
      const cuenta = { activos: 0, marcados: 0, yaTemporal: 0, yaMarcados: 0, sinContrasena: 0 };
      const columna = datos.map((f) => {
        const actual = idx[COL.CAMBIAR] >= 0 ? f[idx[COL.CAMBIAR]] : '';
        const activo = String(idx.ACTIVO >= 0 ? f[idx.ACTIVO] : '').toUpperCase() === 'TRUE' && String(f[idx.CORREO] || '').trim();
        if (!activo) return [actual];
        cuenta.activos++;
        // Sin ninguna contraseña: solo entra con Google, que le pedirá elegir una
        if (!String(idx[COL.HASH] >= 0 ? f[idx[COL.HASH]] : '').trim() && !String(idx[COL.PLANA] >= 0 ? f[idx[COL.PLANA]] : '').trim()) cuenta.sinContrasena++;
        const v = String(actual || '').trim().toUpperCase();
        if (v === 'TRUE') { cuenta.yaTemporal++; return [actual]; }
        if (v === 'VIEJA') { cuenta.yaMarcados++; return [actual]; }
        cuenta.marcados++;
        return ['VIEJA'];
      });
      if (aplicar && datos.length && cuenta.marcados) {
        // Solo esa columna, de un jalón: lo demás del renglón no se toca
        SheetUtils.cambiarColumna(SheetUtils.tabla(hoja, { encabezados: encabezados }), idx[COL.CAMBIAR], columna.map((r) => r[0]));
      }
      return cuenta;
    });
  }

  /**
   * Un admin (EDICIÓN en Usuarios y permisos) le pone una contraseña temporal: se muestra UNA vez, al entrar con ella se
   * pide una nueva, y sus dispositivos recordados se olvidan (quien la tenía ya no entra sin el código).
   */
  function restablecer(token, correo, opciones) {
    const sesion = Permisos.puedeEditar(token, 'usuarios');
    const o = opciones || {};
    const fila = fila_(correo);
    if (!fila) throw new Error('No existe el usuario ' + correo + '.');
    // El "|" separa fecha, quién y motivo en la columna: no puede ir dentro del motivo
    const motivo = String(o.motivo || '').replace(/[|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (o.bloquear && !motivo) throw new Error('Escribe el motivo del bloqueo (qué se sospecha).');
    const temporal = temporal_();
    guardar(fila.CORREO, temporal, { debeCambiar: true });
    if (o.bloquear) {
      const cuando = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      escribirPorCorreo_(fila.CORREO, { [COL.BLOQUEO]: [cuando, sesion.correo, motivo].join(' | ') });
      if (typeof Accesos !== 'undefined') Accesos.anotar(fila.CORREO, 'admin', 'bloqueo-seguridad', '', 'por ' + sesion.correo + ': ' + motivo);
    }
    if (typeof Verificacion !== 'undefined') Verificacion.olvidarDispositivos(fila.CORREO, 'restablecida por ' + sesion.correo);
    Auth.cerrarSesiones(fila.CORREO);   // quien estaba adentro (o quien se la robó) sale
    // Con bloqueo, nada a ese correo: quien lo tomó se enteraría de que ya lo detectaron (el admin llama por teléfono)
    if (!o.bloquear) avisar_(fila, 'restablecida', sesion);
    return { correo: fila.CORREO, temporal, bloqueada: !!o.bloquear || bloqueado(fila) };
  }

  /** Quita el bloqueo (admin), cuando la persona ya recuperó su correo; ahora sí se le avisa */
  function desbloquear(token, correo) {
    const sesion = Permisos.puedeEditar(token, 'usuarios');
    const fila = fila_(correo);
    if (!fila) throw new Error('No existe el usuario ' + correo + '.');
    if (!bloqueado(fila)) return { correo: fila.CORREO, bloqueada: false };
    escribirPorCorreo_(fila.CORREO, { [COL.BLOQUEO]: '' });
    if (typeof Accesos !== 'undefined') Accesos.anotar(fila.CORREO, 'admin', 'desbloqueo-seguridad', '', 'por ' + sesion.correo);
    try {
      MailApp.sendEmail(Correos.mensaje(fila.CORREO, 'Se quitó el bloqueo de seguridad de tu cuenta de Control Interno', {
        preencabezado: 'Ya puedes volver a recuperar tu contraseña por correo.',
        etiqueta: 'Seguridad de tu cuenta',
        titulo: 'Se quitó el bloqueo de seguridad',
        parrafos: ['Tu cuenta estuvo en revisión de seguridad. Ya se quitó: puedes entrar como siempre y, si olvidas tu contraseña, ' +
          'recuperarla desde "¿Olvidaste tu contraseña?".'],
        detalle: [['Cuenta', fila.CORREO], ['Fecha', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')], ['Lo hizo', sesion.correo]],
        aviso: 'Te recomendamos activar la verificación en dos pasos de tu correo y no usar ahí la misma contraseña que en Control Interno.',
      }));
    } catch (e) {
      console.warn('aviso de desbloqueo: ' + e.message);
    }
    return { correo: fila.CORREO, bloqueada: false };
  }

  /**
   * El correo de "tu contraseña cambió" (Correos.gs). motivo: 'cambiada' (la persona, en Mi perfil o al entrar con la
   * temporal) o 'restablecida' (un admin; nunca lleva la temporal, que se entrega por otro medio). Nunca truena.
   */
  function avisar_(fila, motivo, quien) {
    if (bloqueado(fila)) return;   // bloqueada por seguridad: nada a ese correo
    try {
      const cuando = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
      const restablecida = motivo === 'restablecida';
      MailApp.sendEmail(Correos.mensaje(fila.CORREO, restablecida ? 'Un administrador restableció tu contraseña de Control Interno'
        : 'Tu contraseña de Control Interno se cambió', {
        preencabezado: restablecida ? 'Te darán una contraseña temporal por otro medio.' : 'Si no fuiste tú, avisa a Control Interno.',
        etiqueta: 'Seguridad de tu cuenta',
        titulo: restablecida ? 'Tu contraseña se restableció' : 'Tu contraseña se cambió',
        parrafos: [restablecida
          ? 'Un administrador te puso una contraseña temporal. Te la darán en persona o por teléfono; al entrar con ella te pediremos una nueva. ' +
            'Tus sesiones abiertas y tus dispositivos recordados se cerraron.'
          : 'La contraseña de tu cuenta se cambió. Las demás sesiones que tenías abiertas se cerraron.'],
        detalle: [['Cuenta', fila.CORREO], ['Fecha', cuando]].concat(restablecida && quien ? [['Lo hizo', quien.correo]] : []),
        aviso: '<b>¿No fuiste tú?</b> Avisa a Control Interno de inmediato para que restablezcan tu contraseña.',
      }));
    } catch (e) {
      console.warn('aviso de contraseña: ' + e.message);
    }
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
    avisar_(fila, 'cambiada');
    // Las demás sesiones se cierran; esta sigue con un token nuevo (la pantalla lo guarda)
    return { ok: true, sesion: Auth.cerrarSesiones(fila.CORREO, { conservar: token }) };
  }

  /** Lo de Mi perfil: si ya tiene contraseña (para pedir la actual), cuándo la cambió y si hay código por correo */
  function estado(token) {
    const sesion = Auth.validarSesion(token);
    const fila = fila_(sesion.correo);
    const cambiada = fila && fila[COL.CAMBIADA] instanceof Date
      ? Utilities.formatDate(fila[COL.CAMBIADA], Session.getScriptTimeZone(), 'dd/MM/yyyy') : '';
    return {
      tieneContrasena: !!fila && tieneContrasena_(fila), minimo: MINIMO, cambiada,
      dosPasos: typeof Verificacion !== 'undefined' && Verificacion.encendida(),
    };
  }

  return { crear, verificar, revisarNueva, guardar, pasarTodasAHash, temporalesParaActivos, restablecer, desbloquear, bloqueado, cambiarMia, estado,
    bloqueadoCorreo: (correo) => bloqueado(fila_(correo)), pedirCambioATodos, escribirPorCorreo_, avisar_,
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

/** Desde el editor: a cuántos usuarios activos se les pondría una contraseña temporal (no cambia nada) */
function contrasenasTemporalesRevisar() {
  soloEditor_();
  const r = Credenciales.temporalesParaActivos(false);
  Logger.log('Usuarios activos a los que se les pondría una temporal: ' + r.activos + ' (entorno: ' + (leerConfig_('ENTORNO') || '?') + ')');
  return r;
}

/**
 * Desde el editor: una temporal de 10 para CADA usuario activo, que la cambia al entrar; sus sesiones y dispositivos se
 * cierran. La lista (correo, nombre, área, temporal) queda en una hoja NUEVA y privada en tu Drive para repartirla en
 * persona; bórrala al terminar. En producción no corre sin la confirmación: contrasenasTemporalesParaTodos('SI, EN PROD').
 */
function contrasenasTemporalesParaTodos(confirmacion) {
  soloEditor_();
  if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error('Esto es PRODUCCIÓN: cambia la contraseña de todos. Si de verdad es aquí, corre contrasenasTemporalesParaTodos(\'SI, EN PROD\').');
  }
  const r = Credenciales.temporalesParaActivos(true);
  const libro = SpreadsheetApp.create('CONTRASEÑAS TEMPORALES ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm') +
    ' (' + (leerConfig_('ENTORNO') || '?') + ') - BORRAR AL REPARTIR');
  const h = libro.getSheets()[0];
  // Un libro NUEVO y privado, fuera del sistema y con contraseñas: no pasa por SheetUtils (ni por la bitácora)
  h.getRange(1, 1, 1, 4).setValues([['CORREO', 'NOMBRE', 'AREA', 'CONTRASEÑA TEMPORAL']]);   // fuera del sistema
  if (r.lista.length) h.getRange(2, 1, r.lista.length, 4).setValues(r.lista.map((x) => [x.correo, x.nombre, x.area, x.temporal]));   // fuera del sistema
  h.setFrozenRows(1);
  h.autoResizeColumns(1, 4);
  Logger.log('Temporales asignadas: ' + r.asignadas + '. La lista (privada, solo tuya): ' + libro.getUrl() + ' — bórrala al terminar de repartir.');
  return { asignadas: r.asignadas, lista: libro.getUrl() };
}

/**
 * Desde el editor (26-oct): cuántos activos quedarían marcados para cambiar su contraseña la próxima vez que entren
 * (Credenciales.pedirCambioATodos). No cambia nada.
 */
function contrasenasPedirCambioRevisar() {
  soloEditor_();
  const r = Credenciales.pedirCambioATodos(false);
  Logger.log('Activos: ' + r.activos + ' · se marcarían: ' + r.marcados + ' · ya tienen temporal: ' + r.yaTemporal +
    ' · ya marcados: ' + r.yaMarcados + ' · sin contraseña (solo Google): ' + r.sinContrasena + ' (entorno: ' + (leerConfig_('ENTORNO') || '?') + ')');
  return r;
}

/**
 * Desde el editor (26-oct): cada activo cambia su contraseña la próxima vez que entre, sin repartir temporales. Con su
 * contraseña de siempre confirma con el código por correo y elige la nueva; con Google, elige la nueva. No cierra
 * sesiones. En PROD no corre sin contrasenasPedirCambioATodos('SI, EN PROD').
 */
function contrasenasPedirCambioATodos(confirmacion) {
  soloEditor_();
  if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("Esto es PRODUCCIÓN: a todos se les pedirá cambiar su contraseña. Si de verdad es aquí, corre contrasenasPedirCambioATodos('SI, EN PROD').");
  }
  const r = Credenciales.pedirCambioATodos(true);
  Logger.log('Marcados para cambiar su contraseña: ' + r.marcados + ' de ' + r.activos + ' activos (ya tenían temporal: ' + r.yaTemporal +
    ', ya marcados: ' + r.yaMarcados + ').');
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
