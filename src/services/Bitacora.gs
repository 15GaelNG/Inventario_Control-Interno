/**
 * Bitacora.gs — la bitácora de ingresos y cambios (28-oct; autorizada para producción).
 *
 * Toda escritura de una hoja pasa por SheetUtils (fase 8), y cada primitiva avisa aquí con Bitacora.anotar(evento):
 * nadie escribe la bitácora a mano y un módulo nuevo nace anotado. Lo que se junta en una ejecución sale en UNA
 * escritura al soltar el candado (Candado.con → vaciar), así nunca se cruzan dos operaciones.
 *
 * Dónde: carpeta BITACORA en la raíz del proyecto → libro "BITACORA <año>" → una pestaña por mes ("2026-10"). Solo la
 * cuenta que despliega (la dueña) lo abre: no se comparte (usuario, 28-oct).
 *
 * Un renglón: FECHA · QUIEN · ORIGEN (app / a mano / sistema) · OPERACION (una por ejecución) · ACCION · LIBRO · HOJA ·
 * ID REGISTRO · FILA · CAMPO · ANTES · DESPUES · DETALLE · HUELLA.
 *   - CAMBIAR: un renglón por campo que de verdad cambió. AGREGAR / BORRAR: uno por registro, con el registro completo.
 *   - Las cargas masivas (reemplazar una pestaña, una columna entera, más de MASIVA renglones): un renglón CARGA.
 *   - Secretos (contraseñas, huellas, PIN, códigos): nunca el valor, solo "(cambió)". Valores como texto (RAW: un "="
 *     no se vuelve fórmula) y recortados.
 *   - HUELLA: SHA-256 de la huella anterior de la pestaña + el renglón. Si alguien edita o borra uno, la cadena se rompe
 *     desde ahí (revisarCadena).
 * Si escribir falla, el guardado NO truena: lo pendiente va a una cola (PropertiesService) que se reintenta.
 *
 *   Bitacora.anotar(evento)      el enganche de SheetUtils: { libro, hoja, tipo, filas }
 *   Bitacora.sesion(sesion)      quién (Auth.validarSesion); sin sesión es "sistema"
 *   Bitacora.aMano(correo)       lo que sigue lo editó una persona en la hoja (AvisoDeCambios)
 *   Bitacora.evento(accion, …)   algo que no es una escritura de hoja (un acceso denegado, un archivo de Drive)
 *   Bitacora.vaciar()            escribe lo juntado (lo llama Candado al soltar el candado)
 *   Bitacora.quiereAntes(hoja)   si SheetUtils debe leer el renglón antes de cambiarlo o borrarlo
 * Prueba: tests/bitacora.test.js.
 */

const Bitacora = (function () {
  const COLUMNAS = ['FECHA', 'QUIEN', 'ORIGEN', 'OPERACION', 'ACCION', 'LIBRO', 'HOJA', 'ID REGISTRO', 'FILA', 'CAMPO',
    'ANTES', 'DESPUES', 'DETALLE', 'HUELLA'];
  const CARPETA = 'BITACORA';
  const MASIVA = 50;              // más renglones que esto en una escritura: un solo renglón CARGA
  const MAX_TEXTO = 5000;         // una celda aguanta 50,000; la bitácora no necesita tanto
  const MAX_CELDAS = 8000000;     // un libro aguanta 10 millones: antes de eso, otro libro del año
  const MAX_COLA = 300;           // renglones pendientes que se guardan si el libro falla
  const SECRETO = /CONTRASE|PASSWORD|HASH|HUELLA|SALT|TOKEN|CODIGO|(^|[\s_])PIN([\s_]|$)/;
  const FALLOS = ['contrasena-mala', 'correo-desconocido', 'bloqueado', 'inactivo', 'codigo-malo', 'recuperar-desconocido'];

  /**
   * Las hojas con algo especial. Las demás se anotan completas (un módulo nuevo nace anotado). Una que no se anota
   * lleva su razón (contrato).
   */
  const HOJAS = {
    // Cada inicio de sesión (y cada intento fallido): un renglón, a nombre de quien intentó entrar
    'ACCESOS': {
      renglon: (r) => ({
        accion: r.RESULTADO === 'entro' ? 'INGRESO' : FALLOS.indexOf(r.RESULTADO) !== -1 ? 'INGRESO FALLIDO' : 'ACCESO',
        quien: r.CORREO,
        detalle: [r.METODO, r.RESULTADO, r.DISPOSITIVO, r.DETALLE].filter(Boolean).join(' · '),
      }),
    },
    'APP_HELPDESK': { no: 'copia de los tickets del Help Desk: lo que cuenta es su original' },
    'ADQUISICION_VEHICULAR_INDICE': { no: 'índice que se rehace solo desde las carpetas de Drive' },
    'MEDICIONES LINEAS': { no: 'tiempos del medidor del DEV' },
    'LOG_RELACIONES': { no: 'ya es una bitácora (lo que corrigió Relaciones); el cambio en la hoja sí se anota' },
    'DATOS CONECTADOS_HISTORIAL': { no: 'ya es una bitácora; el cambio en DATOS CONECTADOS sí se anota' },
    'CAPITAL HUMANO HISTORIAL': { no: 'ya es una bitácora; la carga de Capital Humano sí se anota (como CARGA)' },
  };
  // Marcar notificaciones como leídas es ruido: solo esa columna de APP_NOTIFICACIONES no se anota
  const IGNORAR = { 'APP_NOTIFICACIONES': ['LEIDA_POR'] };

  // ------------------------------------------------------------------ quién y desde dónde (una ejecución)
  let sesion_ = null;
  let aMano_ = '';
  let idOperacion_ = '';
  let pendientes_ = [];
  let vaciando_ = false;

  function sesion(s) { if (s && s.correo) sesion_ = s; }
  function aMano(correo) { aMano_ = correo || 'desconocido'; }
  function operacion_() {
    if (!idOperacion_) idOperacion_ = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    return idOperacion_;
  }
  function quien_() {
    if (aMano_) return aMano_;
    if (sesion_) return sesion_.correo;
    try { return Session.getActiveUser().getEmail() || ''; } catch (e) { return ''; }
  }
  const origen_ = () => (aMano_ ? 'a mano' : sesion_ ? 'app' : 'sistema');

  // ------------------------------------------------------------------ valores
  const clave_ = (h) => String(h == null ? '' : h).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  const esSecreto_ = (hoja, columna) => SECRETO.test(clave_(columna)) ||
    ((HOJAS[hoja] && HOJAS[hoja].secretas) || []).some((s) => clave_(s) === clave_(columna));
  const ignorada_ = (hoja, columna) => (IGNORAR[hoja] || []).some((c) => clave_(c) === clave_(columna));

  function texto_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > MAX_TEXTO ? s.slice(0, MAX_TEXTO) + '…' : s;
  }
  /** Un registro completo como texto, sin vacíos y con los secretos tapados */
  function registro_(hoja, obj) {
    const o = {};
    Object.keys(obj || {}).forEach((k) => {
      const v = obj[k];
      if (!k || v === '' || v === null || v === undefined) return;
      o[k] = esSecreto_(hoja, k) ? '(oculto)' : (v instanceof Date ? texto_(v) : v);
    });
    return texto_(o);
  }
  const iguales_ = (a, b) => texto_(a) === texto_(b);
  const valorDe_ = (obj, columna) => {
    if (!obj) return undefined;
    if (columna in obj) return obj[columna];
    const k = Object.keys(obj).find((x) => clave_(x) === clave_(columna));
    return k === undefined ? undefined : obj[k];
  };

  // ------------------------------------------------------------------ anotar
  /** ¿SheetUtils lee el renglón antes de cambiarlo o borrarlo? No en lo que no se anota ni en lo masivo (va en resumen) */
  function quiereAntes(hoja, cuantos) {
    const h = HOJAS[hoja];
    return !(h && (h.no || h.renglon)) && !(cuantos > MASIVA);
  }

  /** Un renglón de la bitácora (sin HUELLA: la pone vaciar) */
  function renglon_(accion, libro, hoja, id, fila, campo, antes, despues, detalle, quien) {
    return [texto_(new Date()), quien || quien_(), origen_(), operacion_(), accion, libro || '', hoja || '', texto_(id),
      fila ? String(fila) : '', campo || '', texto_(antes), texto_(despues), texto_(detalle)];
  }

  /** El enganche de SheetUtils: { libro, hoja, tipo: agregar|cambiar|borrar|reemplazar|columna|estructura, filas } */
  function anotar(evento) {
    const e = evento || {};
    const h = HOJAS[e.hoja] || {};
    if (h.no) return;
    const filas = e.filas || [];
    const nuevos = [];
    if (h.renglon && e.tipo === 'agregar') {
      filas.forEach((f) => {
        const r = h.renglon(f.despues || {});
        nuevos.push(renglon_(r.accion, e.libro, e.hoja, f.id, f.fila, '', '', '', r.detalle, r.quien));
      });
    } else if (e.tipo === 'reemplazar' || e.tipo === 'columna' || (e.tipo === 'cambiar' && filas.length > MASIVA) ||
        (e.tipo === 'borrar' && filas.length > MASIVA) || (e.tipo === 'agregar' && filas.length > MASIVA)) {
      const f0 = filas[0] || {};
      const detalle = e.tipo === 'reemplazar' ? 'reescribió la pestaña: ' + f0.filas + ' renglones'
        : e.tipo === 'columna' ? 'columna ' + f0.columna + ': ' + f0.filas + ' renglones desde el ' + f0.desde
          : e.tipo + ' en ' + filas.length + ' renglones';
      nuevos.push(renglon_('CARGA', e.libro, e.hoja, '', '', '', '', '', detalle));
    } else if (e.tipo === 'agregar') {
      filas.forEach((f) => nuevos.push(renglon_('AGREGAR', e.libro, e.hoja, f.id, f.fila, '', '', registro_(e.hoja, f.despues), '')));
    } else if (e.tipo === 'borrar') {
      filas.forEach((f) => nuevos.push(renglon_('BORRAR', e.libro, e.hoja, f.id || valorDe_(f.antes, 'ID'), f.fila, '',
        f.antes ? registro_(e.hoja, f.antes) : '', '', f.antes ? '' : 'sin el registro de antes')));
    } else if (e.tipo === 'cambiar') {
      filas.forEach((f) => Object.keys(f.cambios || {}).forEach((columna) => {
        if (ignorada_(e.hoja, columna)) return;
        const antes = valorDe_(f.antes, columna);
        const despues = f.cambios[columna];
        if (f.antes && iguales_(antes, despues)) return;   // no cambió de verdad
        const secreto = esSecreto_(e.hoja, columna);
        nuevos.push(renglon_('CAMBIAR', e.libro, e.hoja, f.id || valorDe_(f.antes, 'ID'), f.fila, columna,
          secreto ? '' : antes, secreto ? '(cambió)' : despues, ''));
      }));
    } else if (e.tipo === 'estructura') {
      filas.forEach((f) => nuevos.push(renglon_('ESTRUCTURA', e.libro, e.hoja, '', '', '', '', '', f)));
    }
    if (!nuevos.length) return;
    pendientes_ = pendientes_.concat(nuevos);
    // Sin candado (un appendRow suelto) nadie va a vaciar después: se escribe ya
    if (typeof Candado === 'undefined' || !Candado.tomado()) vaciar();
  }

  /**
   * Algo que no pasa por SheetUtils: un acceso denegado, un archivo de Drive, una celda editada a mano.
   * datos: { libro, hoja, id, fila, campo, antes, despues, detalle, quien }. → se escribe con lo demás
   */
  function evento(accion, datos) {
    const d = datos || {};
    if (d.hoja && HOJAS[d.hoja] && HOJAS[d.hoja].no) return;
    if (d.hoja && d.campo && ignorada_(d.hoja, d.campo)) return;
    const secreto = d.hoja && d.campo && esSecreto_(d.hoja, d.campo);
    pendientes_.push(renglon_(accion, d.libro, d.hoja, d.id, d.fila, d.campo, secreto ? '' : d.antes,
      secreto ? '(cambió)' : d.despues, d.detalle, d.quien));
    if (typeof Candado === 'undefined' || !Candado.tomado()) vaciar();
  }

  // ------------------------------------------------------------------ escribir
  const huella_ = (previa, valores) => Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, previa + '|' + valores.join('␟'))
    .map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  const props_ = () => PropertiesService.getScriptProperties();

  /** Escribe lo juntado (y lo que quedó en la cola), bajo el candado. Nunca truena. */
  function vaciar(conCola) {
    // Corre en cada candado que se suelta: sin nada pendiente no lee nada (la cola sola la reintenta el Calentador)
    if (vaciando_ || (!pendientes_.length && !conCola)) return;
    const cola = leerCola_();
    if (!pendientes_.length && !cola.length) return;
    const lote = cola.concat(pendientes_);
    pendientes_ = [];
    vaciando_ = true;
    try {
      Candado.con(() => escribir_(lote));
      if (cola.length) props_().deleteProperty('BITACORA_COLA');
    } catch (err) {
      console.error('Bitácora: no se pudo escribir (' + lote.length + ' renglones, quedan en la cola): ' + err.message);
      guardarCola_(lote);
    } finally {
      vaciando_ = false;
    }
  }

  function escribir_(renglones) {
    const destino = pestana_();
    const clave = 'BITACORA_HUELLA_' + destino.libroId + '_' + destino.nombre;
    let previa = props_().getProperty(clave) || 'INICIO|' + destino.nombre;
    const valores = renglones.map((r) => {
      const h = huella_(previa, r);
      previa = h;
      return r.concat([h]);
    });
    Sheets.Spreadsheets.Values.append({ values: valores }, destino.libroId, "'" + destino.nombre + "'!A1",
      { valueInputOption: 'RAW', insertDataOption: 'INSERT_ROWS' });
    props_().setProperty(clave, previa);
  }

  function leerCola_() {
    try { return JSON.parse(props_().getProperty('BITACORA_COLA') || '[]'); } catch (e) { return []; }
  }
  function guardarCola_(renglones) {
    try {
      props_().setProperty('BITACORA_COLA', JSON.stringify(renglones.slice(-MAX_COLA)));
      if (renglones.length > MAX_COLA) console.error('Bitácora: la cola se llenó, se perdieron ' + (renglones.length - MAX_COLA) + ' renglones');
    } catch (e) {
      console.error('Bitácora: tampoco se pudo guardar la cola: ' + e.message);
    }
  }

  // ------------------------------------------------------------------ el libro y la pestaña del mes
  /** { libroId, nombre } de la pestaña del mes (la crea, y el libro del año, si faltan) */
  function pestana_() {
    const ahora = new Date();
    const anio = Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy');
    const mes = Utilities.formatDate(ahora, Session.getScriptTimeZone(), 'yyyy-MM');
    const cache = CacheService.getScriptCache();
    const clave = 'bitacora_v1_f' + FORMATO + '_' + mes;   // con la versión del formato: uno nuevo vuelve a pasar por aquí
    const guardado = cache.get(clave);
    if (guardado) return { libroId: guardado, nombre: mes };

    const carpeta = DriveUtils.carpetaEnRaiz(CARPETA);
    let libro = libroDelAnio_(carpeta, anio);
    let hoja = libro.getSheetByName(mes);
    if (!hoja) {
      if (celdas_(libro) > MAX_CELDAS) libro = libroNuevo_(carpeta, anio, true);
      hoja = libro.getSheetByName(mes) || libro.insertSheet(mes, 0);
      hoja.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
      try { hoja.protect().setDescription('La escribe la app (bitácora): no se edita a mano.'); } catch (e) { /* sin proteger */ }
      const vacia = libro.getSheets().filter((s) => s.getName() !== mes && s.getLastRow() === 0);
      vacia.forEach((s) => { try { libro.deleteSheet(s); } catch (e) { /* la única que queda */ } });
    }
    // El formato (colores por acción…): una vez por pestaña y por versión del formato
    const marca = 'BITACORA_FORMATO_' + libro.getId() + '_' + mes;
    if (props_().getProperty(marca) !== String(FORMATO)) {
      try {
        darFormato_(hoja);
        props_().setProperty(marca, String(FORMATO));
      } catch (e) {
        console.warn('Bitácora: no se pudo dar formato a la pestaña ' + mes + ': ' + e.message);   // se intenta la próxima vez
      }
    }
    cache.put(clave, libro.getId(), 6 * 60 * 60);
    return { libroId: libro.getId(), nombre: mes };
  }

  // ------------------------------------------------------------------ cómo se ve (28-oct)
  /*
   * Como los registros de auditoría de los grandes: el color va en la ACCION (una etiqueta), con su texto siempre (el
   * color nunca es lo único que lo dice) y un color por significado: verde lo que se agrega, azul lo que cambia, rojo lo
   * que se borra, morado los ingresos, ámbar lo de seguridad (intentos fallidos, accesos negados), gris lo masivo y la
   * estructura. ANTES en rojo y DESPUES en verde, como un "diff". Las columnas técnicas, chicas y en gris.
   * Subir FORMATO repinta una vez las pestañas que ya existen.
   */
  const FORMATO = 1;
  const COLORES = [
    // [acciones, fondo, texto]
    [['AGREGAR', 'SUBIR', 'CARPETA', 'COPIAR'], '#e6f4ea', '#137333'],
    [['CAMBIAR', 'RENOMBRAR', 'MOVER', 'REEMPLAZAR'], '#e8f0fe', '#1967d2'],
    [['BORRAR', 'PAPELERA'], '#fce8e6', '#c5221f'],
    [['INGRESO', 'ACCESO'], '#f3e8fd', '#8430ce'],
    [['INGRESO FALLIDO', 'DENEGADO'], '#fef7e0', '#b06000'],
    [['CARGA', 'ESTRUCTURA'], '#f1f3f4', '#3c4043'],
  ];
  const ANCHOS = [140, 210, 70, 85, 130, 85, 170, 130, 45, 160, 230, 230, 300, 90];

  function darFormato_(hoja) {
    const n = COLUMNAS.length;
    const col = (nombre) => COLUMNAS.indexOf(nombre) + 1;
    const filas = Math.max(hoja.getMaxRows(), 2);
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, 1, n).setBackground('#202124').setFontColor('#ffffff').setFontWeight('bold').setVerticalAlignment('middle');
    hoja.setRowHeight(1, 28);
    ANCHOS.forEach((ancho, i) => hoja.setColumnWidth(i + 1, ancho));
    const cuerpo = (nombre) => hoja.getRange(2, col(nombre), filas - 1, 1);
    // Lo técnico, chico y en gris; el valor de antes en rojo y el de después en verde
    ['OPERACION', 'LIBRO', 'FILA', 'HUELLA'].forEach((c) => cuerpo(c).setFontSize(8).setFontColor('#80868b'));
    cuerpo('ANTES').setFontColor('#c5221f');
    cuerpo('DESPUES').setFontColor('#137333');
    cuerpo('ACCION').setFontWeight('bold').setHorizontalAlignment('center');
    hoja.getRange(2, 1, filas - 1, n).setVerticalAlignment('top').setWrap(false);

    // Un color por acción, una regla por acción con "el texto es" (sin fórmulas: no dependen del idioma del libro, que
    // en español separa con ";"). Y en ORIGEN, "a mano" resalta: no pasó por la app
    const rangoAccion = cuerpo('ACCION');
    const reglas = [];
    COLORES.forEach(([acciones, fondo, texto]) => acciones.forEach((a) => reglas.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(a).setBackground(fondo).setFontColor(texto).setRanges([rangoAccion]).build())));
    reglas.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('a mano')
      .setBackground('#fef7e0').setFontColor('#b06000').setRanges([cuerpo('ORIGEN')]).build());
    hoja.setConditionalFormatRules(reglas);

    // Filtros en el encabezado (buscar por quién, acción, hoja…)
    if (!hoja.getFilter()) hoja.getRange(1, 1, filas, n).createFilter();
  }

  /** El libro del año que todavía tiene lugar: "BITACORA 2026", "BITACORA 2026 (2)"… */
  function libroDelAnio_(carpeta, anio) {
    let ultimo = null;
    for (let n = 1; n < 50; n++) {
      const archivos = carpeta.getFilesByName(nombreLibro_(anio, n));
      if (!archivos.hasNext()) break;
      ultimo = archivos.next();
    }
    return ultimo ? SpreadsheetApp.openById(ultimo.getId()) : libroNuevo_(carpeta, anio, false);
  }
  const nombreLibro_ = (anio, n) => 'BITACORA ' + anio + (n > 1 ? ' (' + n + ')' : '');
  function libroNuevo_(carpeta, anio, siguiente) {
    let n = 1;
    if (siguiente) while (carpeta.getFilesByName(nombreLibro_(anio, n)).hasNext()) n++;
    const libro = SpreadsheetApp.create(nombreLibro_(anio, n));
    DriveApp.getFileById(libro.getId()).moveTo(carpeta);
    return libro;
  }
  const celdas_ = (libro) => libro.getSheets().reduce((t, s) => t + s.getMaxRows() * s.getMaxColumns(), 0);

  /**
   * Revisa la cadena de huellas de la pestaña de un mes ('2026-10'; por omisión el actual). → { renglones, rota: null |
   * { fila, motivo } }. Si alguien editó o borró un renglón, la cadena se rompe desde ahí.
   */
  function revisarCadena(mes) {
    const nombre = mes || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    const destino = pestana_();
    const hoja = SpreadsheetApp.openById(destino.libroId).getSheetByName(nombre);
    if (!hoja || hoja.getLastRow() < 2) return { renglones: 0, rota: null };
    const datos = hoja.getRange(2, 1, hoja.getLastRow() - 1, COLUMNAS.length).getValues();
    let previa = 'INICIO|' + nombre;
    for (let i = 0; i < datos.length; i++) {
      const valores = datos[i].slice(0, COLUMNAS.length - 1).map((v) => (v instanceof Date ? texto_(v) : String(v)));
      if (huella_(previa, valores) !== String(datos[i][COLUMNAS.length - 1])) {
        return { renglones: datos.length, rota: { fila: i + 2, motivo: 'la huella no corresponde: se editó o borró desde aquí' } };
      }
      previa = String(datos[i][COLUMNAS.length - 1]);
    }
    const guardada = props_().getProperty('BITACORA_HUELLA_' + destino.libroId + '_' + nombre);
    if (guardada && guardada !== previa) return { renglones: datos.length, rota: { fila: datos.length + 1, motivo: 'faltan los últimos renglones' } };
    return { renglones: datos.length, rota: null };
  }

  /**
   * El Calentador, una vez al día: reintenta la cola, revisa la cadena del mes y que se siga escribiendo (de martes a
   * viernes, algo en las últimas 24 h). Si algo anda mal, avisa por correo a la cuenta que despliega (la única que
   * abre la bitácora; usuario, 28-oct). → lo que encontró
   */
  function revisarDiaria() {
    const props = props_();
    const zona = Session.getScriptTimeZone();
    const hoy = Utilities.formatDate(new Date(), zona, 'yyyy-MM-dd');
    if (props.getProperty('BITACORA_REVISION') === hoy) return 'ya se revisó hoy';
    props.setProperty('BITACORA_REVISION', hoy);
    vaciar(true);
    const problemas = [];
    const cadena = revisarCadena();
    if (cadena.rota) problemas.push('La cadena de huellas se rompe en el renglón ' + cadena.rota.fila + ' de la pestaña del mes: ' + cadena.rota.motivo + '.');
    const enCola = leerCola_().length;
    if (enCola) problemas.push(enCola + ' renglones siguen en la cola: el libro no se pudo escribir.');
    const dia = new Date().getDay();
    if (dia >= 2 && dia <= 5 && Number(hoy.slice(8)) > 1) {
      const ultima = ultimaFecha_();
      if (!ultima || Date.now() - ultima.getTime() > 24 * 60 * 60 * 1000) problemas.push('No hay renglones en las últimas 24 horas: ¿dejó de escribir?');
    }
    if (problemas.length) avisar_(problemas, cadena.renglones);
    return problemas.length ? problemas.join(' ') : 'bien: ' + cadena.renglones + ' renglones este mes';
  }

  /** La fecha del último renglón de la pestaña del mes (o null) */
  function ultimaFecha_() {
    const destino = pestana_();
    const hoja = SpreadsheetApp.openById(destino.libroId).getSheetByName(destino.nombre);
    if (!hoja || hoja.getLastRow() < 2) return null;
    const v = String(hoja.getRange(hoja.getLastRow(), 1).getValue());
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(v);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }

  function avisar_(problemas, renglones) {
    try {
      const para = Session.getEffectiveUser().getEmail();
      if (!para) return;
      MailApp.sendEmail(Correos.mensaje(para, 'Control Interno: revisar la bitácora', {
        preencabezado: problemas[0],
        etiqueta: 'Bitácora',
        titulo: 'La revisión diaria de la bitácora encontró algo',
        parrafos: problemas,
        detalle: [['Renglones este mes', String(renglones)], ['Fecha', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')]],
        aviso: 'La bitácora está en la carpeta <b>BITACORA</b> de la raíz del proyecto (solo la abre esta cuenta).',
      }));
    } catch (e) {
      console.error('Bitácora: no se pudo avisar por correo: ' + e.message);
    }
  }

  /** Deja listo el libro del año y la pestaña del mes (instalarBitacora). → el enlace */
  function instalar() {
    const d = pestana_();
    return SpreadsheetApp.openById(d.libroId).getUrl() + ' (pestaña ' + d.nombre + ')';
  }

  return { COLUMNAS, HOJAS, anotar, evento, sesion, aMano, vaciar, quiereAntes, revisarCadena, revisarDiaria, instalar };
})();

/**
 * Desde el editor, una vez por proyecto (en producción, antes de desplegar la bitácora): crea la carpeta BITACORA en la
 * raíz, el libro del año y la pestaña del mes. En un DEV se crean solos con el primer cambio; en producción las carpetas
 * no se crean solas (DriveUtils.carpetaEnRaiz) y revisarEntorno avisa si falta.
 */
function instalarBitacora() {
  soloEditor_();
  const raiz = DriveApp.getFolderById(Config.DRIVE_FOLDERS.RAIZ());
  if (!DriveUtils.carpetaEnRaizSiExiste(raiz, 'BITACORA')) DriveUtils.crearCarpeta(raiz, 'BITACORA');
  return 'Bitácora lista: ' + Bitacora.instalar();
}
