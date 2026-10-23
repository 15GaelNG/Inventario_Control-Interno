/**
 * Recuperacion.gs — "¿Olvidaste tu contraseña?": un enlace por correo para poner una nueva (23-oct, guía de OWASP).
 *
 *   Recuperacion.pedir(correo)           siempre la MISMA respuesta, exista o no el correo (no se averigua quién está)
 *   Recuperacion.estado(enlace)          si el enlace sirve todavía → { correo, minimo }
 *   Recuperacion.cambiar(enlace, nueva)  la pone, cierra sus sesiones y avisa; NO entra solo (vuelve al login)
 *
 * El enlace: la app de siempre con ?recuperar=<64 hex> (Config.urlApp; la app ya está abierta a cualquier cuenta de
 * Google, no hace falta otro despliegue como el de la firma). Del enlace el servidor guarda solo su huella, en
 * CacheService: vence a los 30 min, sirve una vez, y pedir otro anula el anterior. Hasta 3 por correo por hora. Todo
 * queda en ACCESOS (Accesos.gs); los correos que no existen cuentan para la alerta de muchos fallos.
 * El de admin ("Restablecer contraseña") sigue para quien no puede entrar a su correo o si se sospecha que lo tomaron.
 */
const Recuperacion = (function () {
  const SEG_ENLACE = 30 * 60;
  const MAX_POR_HORA = 3;
  const RESPUESTA = { ok: true, mensaje: 'Si el correo está registrado, te mandamos un enlace para crear una contraseña nueva. Revisa tu bandeja (y el spam).' };

  const cache_ = () => CacheService.getScriptCache();
  const clave_ = (correo) => String(correo == null ? '' : correo).trim().toLowerCase();
  const hex_ = (bytes) => bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  const huella_ = (texto) => hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto)));
  const anotar_ = (correo, resultado) => { if (typeof Accesos !== 'undefined') Accesos.anotar(correo, 'recuperar', resultado); };

  function activo_(correo) {
    return SheetUtils.getAll(Config.SPREADSHEET_IDS.USUARIOS(), 'USUARIOS')
      .find((u) => clave_(u.CORREO) === clave_(correo) && String(u.ACTIVO).toUpperCase() === 'TRUE') || null;
  }

  function pedir(correo) {
    const c = clave_(correo);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c)) return RESPUESTA;
    const n = Number(cache_().get('recuperar_n_' + c) || 0);
    if (n >= MAX_POR_HORA) { anotar_(c, 'recuperar-limite'); return RESPUESTA; }
    cache_().put('recuperar_n_' + c, String(n + 1), 3600);
    const fila = activo_(c);
    if (!fila) { anotar_(c, 'recuperar-desconocido'); return RESPUESTA; }

    const enlace = huella_('rec:' + Utilities.getUuid() + Utilities.getUuid());   // 64 hex, aleatorio
    const h = huella_(enlace);
    cache_().put('recuperar_t_' + h, JSON.stringify({ correo: fila.CORREO }), SEG_ENLACE);
    cache_().put('recuperar_vigente_' + c, h, SEG_ENLACE);   // pedir otro anula este
    MailApp.sendEmail(Correos.mensaje(fila.CORREO, 'Crea tu contraseña nueva de Control Interno', {
      preencabezado: 'El enlace vence en 30 minutos y sirve una sola vez.',
      etiqueta: 'Seguridad de tu cuenta',
      titulo: 'Crea tu contraseña nueva',
      parrafos: [(fila.NOMBRE ? 'Hola, ' + Correos.esc(fila.NOMBRE) + '. ' : '') +
        'Pediste recuperar el acceso a Control Interno. Con este botón pones una contraseña nueva.'],
      boton: { texto: 'Crear contraseña nueva', url: Config.urlApp() + '?recuperar=' + enlace },
      detalle: [['Cuenta', fila.CORREO], ['Vence', 'En 30 minutos'],
        ['Solicitado', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')]],
      aviso: '<b>¿No lo pediste?</b> Ignora este correo: tu contraseña no cambia. Si te llegan varios sin pedirlos, avisa a Control Interno.',
    }));
    anotar_(c, 'enlace-enviado');
    return RESPUESTA;
  }

  /** El enlace, si todavía sirve → { r, h }; si no, el mismo mensaje (vencido, usado o anulado por uno nuevo) */
  function leer_(enlace) {
    const vencido = new Error('El enlace ya venció o ya se usó. Pide otro desde "¿Olvidaste tu contraseña?".');
    if (!/^[0-9a-f]{64}$/.test(String(enlace || ''))) throw vencido;
    const h = huella_(enlace);
    const raw = cache_().get('recuperar_t_' + h);
    if (!raw) throw vencido;
    const r = JSON.parse(raw);
    if (cache_().get('recuperar_vigente_' + clave_(r.correo)) !== h) throw vencido;
    return { r, h };
  }

  function estado(enlace) {
    const { r } = leer_(enlace);
    return { correo: r.correo, minimo: Credenciales.MINIMO };
  }

  function cambiar(enlace, nueva) {
    const { r, h } = leer_(enlace);
    const fila = activo_(r.correo);
    if (!fila) throw new Error('Usuario inactivo, contacta al administrador');
    Credenciales.revisarNueva(nueva, { correo: fila.CORREO, nombre: fila.NOMBRE });
    Credenciales.guardar(fila.CORREO, nueva, { debeCambiar: false });
    cache_().remove('recuperar_t_' + h);
    cache_().remove('recuperar_vigente_' + clave_(fila.CORREO));
    Auth.cerrarSesiones(fila.CORREO);   // quien estuviera adentro (o quien la tenía) sale
    Credenciales.avisar_(fila, 'cambiada');
    anotar_(fila.CORREO, 'contrasena-recuperada');
    return { ok: true, correo: fila.CORREO };
  }

  return { pedir, estado, cambiar, SEG_ENLACE, MAX_POR_HORA };
})();
