/**
 * Verificacion.gs — el segundo paso del inicio de sesión: un código por correo, solo cuando hace falta (23-oct).
 *
 * Como lo hace Google: se pide el código cuando el dispositivo es nuevo o algo se ve raro, no cada vez. La señal es una
 * LLAVE aleatoria que el navegador guarda al pasar el código (localStorage) y de la que el servidor solo guarda la
 * huella (SHA-256) en la hoja DISPOSITIVOS del libro de USUARIOS. Quien se roba la contraseña no tiene la llave. La IP
 * no se usa: Apps Script no la da y la que reporte el navegador se puede inventar.
 *
 * Se pide el código aunque la llave sea buena si: tiene más de DIAS_VIGENCIA días, cambió el navegador o el sistema,
 * hubo 3+ contraseñas malas recientes con ese correo, o hay alerta de muchos fallos (Accesos.enAlerta).
 *
 *   Verificacion.decidir(fila, metodo, dispositivo) → null (pasa) | { pendiente: 'codigo', reto, correoOculto, motivo }
 *   Verificacion.verificarCodigo(reto, codigo, recordar) → { correo, metodo, llave }   (llave solo si se recuerda)
 *   Verificacion.reenviar(reto) / misDispositivos(token, llave) / quitar(token, id) / olvidarDispositivos(correo, nota)
 *
 * Encendido por proyecto: VERIFICACION_DOS_PASOS = 'APAGADA' en Entornos.gs lo apaga (prod, hasta avisar al equipo).
 * VERIFICACION_DISPOSITIVOS = 'APAGADA' (29-oct) apaga solo lo del dispositivo (nuevo, vencido o con otro navegador): el
 * código se sigue pidiendo con 3+ contraseñas malas recientes y con alerta. Los dos van en Entornos.gs o como propiedad
 * del proyecto (leerConfig_): como propiedad se prenden y apagan sin desplegar.
 * Salvo `decidir(…, { confirmar: true })` (26-oct): quien cambia una contraseña VIEJA (Credenciales.pedirCambio) siempre
 * confirma con el código, encendido o no, porque esa contraseña pudo verse en la hoja; apagado, ese paso no recuerda el
 * dispositivo (sin llave ni correo de "dispositivo nuevo": una sola vez y sin más fricción).
 * El reto vive 10 min en CacheService: el código va con huella, 5 intentos, hasta 3 reenvíos con 60 s entre cada uno.
 */
const Verificacion = (function () {
  const HOJA = 'DISPOSITIVOS';
  const COLUMNAS = ['CORREO', 'HUELLA', 'NOMBRE', 'NAVEGADOR', 'SISTEMA', 'CREADO', 'ULTIMO USO', 'ACTIVO', 'NOTA'];
  const DIAS_VIGENCIA = 60;
  const SEG_CODIGO = 10 * 60;
  const MAX_INTENTOS = 5;
  const MAX_ENVIOS = 4;            // el primero y 3 reenvíos
  const SEG_ENTRE_ENVIOS = 60;
  const FALLOS_SOSPECHOSOS = 3;    // contraseñas malas recientes con ese correo (Auth las cuenta)

  const ssId = () => Config.SPREADSHEET_IDS.USUARIOS();
  const clave_ = (correo) => String(correo == null ? '' : correo).trim().toLowerCase();
  const hex_ = (bytes) => bytes.map((b) => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
  const huella_ = (texto) => hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(texto)));
  const cache_ = () => CacheService.getScriptCache();
  const corto_ = (t, n) => String(t == null ? '' : t).replace(/[<>]/g, '').trim().slice(0, n || 40);

  function encendida() {
    return String(leerConfig_('VERIFICACION_DOS_PASOS') || '').trim().toUpperCase() !== 'APAGADA';
  }

  /** ¿Se pide el código por el dispositivo (nuevo, vencido, otro navegador)? Lo de los fallos y la alerta no depende de esto */
  function porDispositivo() {
    return String(leerConfig_('VERIFICACION_DISPOSITIVOS') || '').trim().toUpperCase() !== 'APAGADA';
  }

  /** Lo que manda el navegador, limpio: { llave, navegador, sistema, nombre } (todo lo puede inventar: solo la llave cuenta) */
  function limpiar_(d) {
    const x = d || {};
    const navegador = corto_(x.navegador, 20);
    const sistema = corto_(x.sistema, 20);
    return {
      llave: /^[0-9a-f]{64}$/.test(String(x.llave || '')) ? String(x.llave) : '',
      navegador, sistema,
      nombre: corto_(x.nombre, 60) || [navegador, sistema].filter(Boolean).join(' en ') || 'Un navegador',
    };
  }

  // ---------------------------------------------------------------- la hoja DISPOSITIVOS
  function hoja_() {
    return SheetUtils.asegurarPestana(ssId(), HOJA, COLUMNAS, { negritas: false, soloCrear: true });
  }
  /** Para escribir: por SheetUtils, como toda escritura (ahí se conecta la bitácora) */
  const tabla_ = (hoja) => SheetUtils.tabla(hoja, { encabezados: COLUMNAS });
  /** Los renglones de un correo, con su número de renglón (base 1) */
  function deCorreo_(hoja, correo) {
    const ultima = hoja.getLastRow();
    if (ultima < 2) return [];
    const valores = hoja.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();
    const c = clave_(correo);
    return valores.map((v, i) => {
      const o = { fila: i + 2 };
      COLUMNAS.forEach((col, j) => { o[col] = v[j]; });
      return o;
    }).filter((o) => clave_(o.CORREO) === c);
  }
  const activo_ = (d) => String(d.ACTIVO).toUpperCase() === 'TRUE';
  function poner_(hoja, fila, columna, valor) {
    const cambios = {};
    cambios[columna] = valor;
    SheetUtils.cambiarCeldas(tabla_(hoja), [{ fila: fila, cambios: cambios }]);
  }
  const hoy_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

  // ---------------------------------------------------------------- decidir
  /** null si el dispositivo es de confianza; si no, por qué se pide el código */
  function motivo_(correo, d) {
    if (typeof Accesos !== 'undefined' && Accesos.enAlerta()) return 'alerta';
    if (Number(cache_().get('login_fallos_' + clave_(correo)) || 0) >= FALLOS_SOSPECHOSOS) return 'fallos';
    if (!porDispositivo()) return null;
    if (!d.llave) return 'nuevo';
    const hoja = hoja_();
    const suyo = deCorreo_(hoja, correo).find((x) => activo_(x) && x.HUELLA === huella_(d.llave));
    if (!suyo) return 'nuevo';
    const creado = suyo.CREADO instanceof Date ? suyo.CREADO.getTime() : new Date(suyo.CREADO).getTime();
    if (!creado || Date.now() - creado > DIAS_VIGENCIA * 86400000) return 'vencido';
    if ((suyo.NAVEGADOR && d.navegador && suyo.NAVEGADOR !== d.navegador) ||
        (suyo.SISTEMA && d.sistema && suyo.SISTEMA !== d.sistema)) return 'cambio';
    // De confianza: su último uso, una vez al día
    const ultimo = suyo['ULTIMO USO'] instanceof Date ? Utilities.formatDate(suyo['ULTIMO USO'], Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
    if (ultimo !== hoy_()) Candado.con(() => poner_(hoja, suyo.fila, 'ULTIMO USO', new Date()));
    return null;
  }

  function decidir(fila, metodo, dispositivo, opciones) {
    const o = opciones || {};
    const prendida = encendida();
    if (!prendida && !o.confirmar) return null;
    const d = limpiar_(dispositivo);
    const motivo = o.confirmar ? 'confirmar' : motivo_(fila.CORREO, d);
    if (!motivo) return null;
    const reto = Utilities.getUuid();
    const r = { correo: fila.CORREO, nombre: fila.NOMBRE || '', metodo, motivo, dispositivo: d, intentos: 0, envios: 0,
      bloqueado: typeof Credenciales !== 'undefined' && Credenciales.bloqueado(fila), recordable: prendida };
    mandar_(reto, r);
    if (typeof Accesos !== 'undefined') Accesos.anotar(fila.CORREO, metodo, 'codigo-enviado', d.nombre, motivo);
    return { pendiente: 'codigo', reto, correoOculto: oculto_(fila.CORREO), motivo, recordable: prendida };
  }

  /** a•••@gph.com: lo justo para que la persona reconozca a dónde llegó */
  function oculto_(correo) {
    const [u, dom] = String(correo || '').split('@');
    return (u ? u.charAt(0) : '') + '•••' + (u && u.length > 3 ? u.slice(-1) : '') + '@' + (dom || '');
  }

  // ---------------------------------------------------------------- el código
  function nuevoCodigo_() {
    const hex = Utilities.getUuid().replace(/-/g, '');
    return String(parseInt(hex.slice(0, 12), 16) % 1000000).padStart(6, '0');
  }
  function guardarReto_(reto, r) {
    cache_().put('login_codigo_' + reto, JSON.stringify(r), SEG_CODIGO);
  }
  function leerReto_(reto) {
    const raw = reto ? cache_().get('login_codigo_' + String(reto)) : null;
    if (!raw) throw new Error('El código ya venció. Vuelve a iniciar sesión.');
    return JSON.parse(raw);
  }

  function mandar_(reto, r) {
    if (r.envios >= MAX_ENVIOS) throw new Error('Ya se mandaron varios códigos. Vuelve a iniciar sesión.');
    if (r.ultimoEnvio && Date.now() - r.ultimoEnvio < SEG_ENTRE_ENVIOS * 1000) {
      throw new Error('Espera un minuto antes de pedir otro código.');
    }
    const codigo = nuevoCodigo_();
    // Sin cuota de correo, no se entra: el paso no se salta (falla cerrado)
    if (MailApp.getRemainingDailyQuota() < 1) throw new Error('Hoy ya no se pueden mandar códigos. Intenta mañana o entra con tu cuenta de Google.');
    MailApp.sendEmail(correoCodigo_(r, codigo));
    r.codigo = huella_(reto + ':' + codigo);
    r.envios++;
    r.ultimoEnvio = Date.now();
    r.intentos = 0;
    guardarReto_(reto, r);
  }

  function reenviar(reto) {
    const r = leerReto_(reto);
    mandar_(reto, r);
    if (typeof Accesos !== 'undefined') Accesos.anotar(r.correo, r.metodo, 'codigo-reenviado', r.dispositivo.nombre);
    return { correoOculto: oculto_(r.correo) };
  }

  /** El código bueno → { correo, metodo, llave (si se recuerda el dispositivo) }; malo → error (5 y se acaba el reto) */
  function verificarCodigo(reto, codigo, recordar) {
    const r = leerReto_(reto);
    const limpio = String(codigo || '').replace(/\D/g, '');
    if (r.codigo !== huella_(reto + ':' + limpio)) {
      r.intentos++;
      if (typeof Accesos !== 'undefined') Accesos.anotar(r.correo, r.metodo, 'codigo-malo', r.dispositivo.nombre);
      if (r.intentos >= MAX_INTENTOS) {
        cache_().remove('login_codigo_' + reto);
        throw new Error('Demasiados intentos con ese código. Vuelve a iniciar sesión.');
      }
      guardarReto_(reto, r);
      throw new Error('Ese código no es correcto.');
    }
    cache_().remove('login_codigo_' + reto);
    if (typeof Accesos !== 'undefined') Accesos.anotar(r.correo, r.metodo, 'codigo-bueno', r.dispositivo.nombre);
    // recordable === false: el código se pidió solo para confirmar un cambio con la verificación apagada
    return { correo: r.correo, metodo: r.metodo, llave: recordar && r.recordable !== false ? recordar_(r) : '' };
  }

  /** Da de alta el dispositivo: una llave nueva (la vieja de ese navegador, si había, deja de servir) y el aviso por correo */
  function recordar_(r) {
    // 64 caracteres hex (lo que acepta limpiar_), de dos UUID aleatorios; el servidor guarda solo su huella
    const llave = huella_('llave:' + Utilities.getUuid() + Utilities.getUuid());
    Candado.con(() => {
      const hoja = hoja_();
      if (r.dispositivo.llave) {
        const vieja = huella_(r.dispositivo.llave);
        deCorreo_(hoja, r.correo).filter((x) => x.HUELLA === vieja && activo_(x)).forEach((x) => {
          poner_(hoja, x.fila, 'ACTIVO', 'FALSE');
          poner_(hoja, x.fila, 'NOTA', 'reemplazada (' + r.motivo + ')');
        });
      }
      const ahora = new Date();
      SheetUtils.agregarFilas(tabla_(hoja), [[r.correo, huella_(llave), r.dispositivo.nombre, r.dispositivo.navegador, r.dispositivo.sistema, ahora, ahora, 'TRUE', '']]);
    });
    avisarNuevo_(r);
    return llave;
  }

  function avisarNuevo_(r) {
    if (r.bloqueado) return;   // bloqueada por seguridad: nada informativo a ese correo (el código sí se manda)
    try {
      MailApp.sendEmail(correoDispositivo_(r));
    } catch (e) {
      console.warn('aviso de dispositivo nuevo: ' + e.message);   // el aviso no debe impedir entrar
    }
  }

  // ---------------------------------------------------------------- los correos (la plantilla: Correos.gs)
  const ahora_ = () => Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');

  function correoCodigo_(r, codigo) {
    return Correos.mensaje(r.correo, codigo + ' es tu código para entrar a Control Interno', {
      preencabezado: 'Vence en 10 minutos. Nadie de Control Interno te lo va a pedir.',
      etiqueta: 'Verificación',
      titulo: 'Tu código para entrar',
      parrafos: [(r.nombre ? 'Hola, ' + Correos.esc(r.nombre) + '. ' : '') + 'Escribe este código en Control Interno para terminar de iniciar sesión.'],
      codigo,
      detalle: [['Dispositivo', r.dispositivo.nombre], ['Solicitado', ahora_()], ['Vence', 'En 10 minutos']],
      aviso: '<b>¿No fuiste tú?</b> Alguien tiene tu contraseña: cámbiala en Mi perfil o pide a Control Interno que la ' +
        'restablezca. Nadie de Control Interno te va a pedir este código.',
    });
  }

  function correoDispositivo_(r) {
    return Correos.mensaje(r.correo, 'Nuevo dispositivo en Control Interno: ' + r.dispositivo.nombre, {
      preencabezado: 'Se recordó ' + r.dispositivo.nombre + ' para tu cuenta.',
      etiqueta: 'Seguridad de tu cuenta',
      titulo: 'Se recordó un dispositivo nuevo',
      parrafos: ['Desde este dispositivo ya no se te pedirá código por un tiempo. Puedes verlo y quitarlo en ' +
        '<b>Mi perfil → Contraseña y seguridad</b>.'],
      detalle: [['Dispositivo', r.dispositivo.nombre], ['Fecha', ahora_()], ['Cuenta', r.correo]],
      aviso: '<b>¿No fuiste tú?</b> Cambia tu contraseña y avisa a Control Interno.',
    });
  }

  // ---------------------------------------------------------------- Mi perfil y administración
  const id_ = (d) => String(d.HUELLA || '').slice(0, 16);
  const fecha_ = (f) => (f instanceof Date ? Utilities.formatDate(f, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') : '');

  /** Los dispositivos de quien pregunta (llave: la de este navegador, para marcarlo) */
  function misDispositivos(token, llave) {
    const sesion = Auth.validarSesion(token);
    const actual = limpiar_({ llave }).llave ? huella_(llave) : '';
    return deCorreo_(hoja_(), sesion.correo).filter(activo_).map((d) => ({
      id: id_(d), nombre: d.NOMBRE, creado: fecha_(d.CREADO), ultimoUso: fecha_(d['ULTIMO USO']), esEste: !!actual && d.HUELLA === actual,
    }));
  }

  /** Quita uno de los suyos */
  function quitar(token, id) {
    const sesion = Auth.validarSesion(token);
    return Candado.con(() => {
      const hoja = hoja_();
      const d = deCorreo_(hoja, sesion.correo).find((x) => activo_(x) && id_(x) === String(id || ''));
      if (!d) throw new Error('Ese dispositivo ya no está.');
      poner_(hoja, d.fila, 'ACTIVO', 'FALSE');
      poner_(hoja, d.fila, 'NOTA', 'quitado por la persona');
      // Lo que esté abierto se cierra (no se sabe en qué dispositivo); quien lo quitó sigue con un token nuevo
      return { sesion: Auth.cerrarSesiones(sesion.correo, { conservar: token }) };
    });
  }

  /** Mi perfil: "Cerrar en todos los demás": se quedan sin llave todos menos este navegador */
  function quitarOtros(token, llave) {
    const sesion = Auth.validarSesion(token);
    const este = limpiar_({ llave }).llave ? huella_(llave) : '';
    return Candado.con(() => {
      const hoja = hoja_();
      const otros = deCorreo_(hoja, sesion.correo).filter((x) => activo_(x) && x.HUELLA !== este);
      otros.forEach((d) => { poner_(hoja, d.fila, 'ACTIVO', 'FALSE'); poner_(hoja, d.fila, 'NOTA', 'cerrado desde otro dispositivo'); });
      // Y las sesiones abiertas en esos dispositivos: todas menos la de quien lo hizo (sigue con un token nuevo)
      return { cerrados: otros.length, sesion: Auth.cerrarSesiones(sesion.correo, { conservar: token }) };
    });
  }

  /** Todos los de un correo dejan de servir (restablecer la contraseña, o un admin) */
  function olvidarDispositivos(correo, nota) {
    return Candado.con(() => {
      const hoja = hoja_();
      const suyos = deCorreo_(hoja, correo).filter(activo_);
      suyos.forEach((d) => { poner_(hoja, d.fila, 'ACTIVO', 'FALSE'); poner_(hoja, d.fila, 'NOTA', nota || 'olvidado'); });
      return suyos.length;
    });
  }

  /** Los de varios correos de una vez (temporales para todos): DISPOSITIVOS se lee una vez */
  function olvidarDispositivosDe(correos, nota) {
    const buscados = new Set((correos || []).map(clave_));
    return Candado.con(() => {
      const hoja = hoja_();
      const ultima = hoja.getLastRow();
      if (ultima < 2) return 0;
      const valores = hoja.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();
      const iCorreo = COLUMNAS.indexOf('CORREO');
      const iActivo = COLUMNAS.indexOf('ACTIVO');
      const iNota = COLUMNAS.indexOf('NOTA');
      // Solo los renglones que cambian (antes se reescribía la hoja completa)
      const cambios = [];
      valores.forEach((v, i) => {
        if (buscados.has(clave_(v[iCorreo])) && String(v[iActivo]).toUpperCase() === 'TRUE') {
          cambios.push({ fila: i + 2, columnas: [{ i: iActivo, valor: 'FALSE' }, { i: iNota, valor: nota || 'olvidado' }] });
        }
      });
      return SheetUtils.cambiarCeldas(tabla_(hoja), cambios);
    });
  }

  /** Un admin (EDICIÓN en Usuarios y permisos) le olvida todos los dispositivos a alguien */
  function olvidarDe(token, correo) {
    const sesion = Permisos.puedeEditar(token, 'usuarios');
    const n = olvidarDispositivos(correo, 'olvidados por ' + sesion.correo);
    Auth.cerrarSesiones(correo);
    if (typeof Credenciales !== 'undefined' && Credenciales.bloqueadoCorreo(correo)) return n;   // bloqueada: sin aviso
    try {
      MailApp.sendEmail(Correos.mensaje(correo, 'Se cerraron tus sesiones de Control Interno', {
        preencabezado: 'La próxima vez que entres te pediremos un código.',
        etiqueta: 'Seguridad de tu cuenta',
        titulo: 'Se cerraron tus sesiones',
        parrafos: ['Un administrador cerró tus sesiones abiertas y olvidó tus dispositivos recordados. La próxima vez que entres, ' +
          'desde donde sea, te mandaremos un código a este correo. Tu contraseña no cambió.'],
        detalle: [['Cuenta', correo], ['Fecha', ahora_()], ['Lo hizo', sesion.correo]],
        aviso: '<b>¿No sabías de esto?</b> Pregunta a Control Interno.',
      }));
    } catch (e) {
      console.warn('aviso de sesiones cerradas: ' + e.message);
    }
    return n;
  }

  return { encendida, decidir, verificarCodigo, reenviar, misDispositivos, quitar, quitarOtros, olvidarDispositivos, olvidarDispositivosDe, olvidarDe,
    oculto_, HOJA };
})();

