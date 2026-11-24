/**
 * LineasCarta.gs
 * «Subir carta» en Resguardos y cancelaciones → Cancelaciones (usuario, 10-nov): la carta de cancelación que Pau ya mandó
 * al asesor es la prueba, y con ella las líneas pasan a CARTA ENVIADA.
 *
 *   1. leer: el PDF se guarda en «CARTAS DE CANCELACION/POR CONFIRMAR»; Drive lo copia como Documento con OCR (sirve para
 *      la carta hecha en Word y para la escaneada), se lee el texto y la copia se tira (como AdquisicionVehicularIndice).
 *      Del texto salen los números (10 dígitos), la fecha y el proveedor; LineasResguardos.vistaCarta dice qué le pasaría
 *      a cada número. No cambia nada de las hojas.
 *   2. aplicar: con lo que Pau dejó marcado, las líneas pasan a CARTA ENVIADA con la liga de la carta
 *      (LineasResguardos.cartaEnviada) y el PDF sale de POR CONFIRMAR a «CARTAS DE CANCELACION», con su nombre de siempre.
 *
 * Lo que se sube y no se confirma se queda en POR CONFIRMAR (se puede borrar a mano). Los nombres de quien firma y de los
 * asesores no van aquí (el repo es público): la carta se cruza con lo que dice el inventario de cada línea.
 */
const LineasCarta = (function () {
  const CARPETA_CARTAS = 'CARTAS DE CANCELACION';
  const POR_CONFIRMAR = 'POR CONFIRMAR';
  const MAX_BYTES = 15 * 1024 * 1024;
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());
  /** Mayúsculas, sin acentos ni signos, un espacio entre palabras: para buscar una razón social en el texto. */
  const plano = (s) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ').trim();
  const dos = (n) => ('0' + n).slice(-2);

  /** El proveedor de un texto: TELCEL (Radiomóvil Dipsa) o AT&T; el que aparezca primero. '' si ninguno. */
  function proveedorDe(texto) {
    const t = ' ' + plano(texto) + ' ';
    const telcel = t.search(/ (RADIOMOVIL|DIPSA|TELCEL) /);
    const att = t.search(/ (AT AND T|ATT|COMERCIALIZACION MOVIL) /);
    if (telcel < 0 && att < 0) return '';
    if (att < 0) return 'TELCEL';
    if (telcel < 0) return 'AT&T';
    return telcel < att ? 'TELCEL' : 'AT&T';
  }

  /**
   * Puro: el texto de una carta → { numeros, fecha: 'yyyy-MM-dd' | '', proveedor }.
   * Números: 10 dígitos seguidos o como se escribe un teléfono (442 405 1478, 442-405-1478); la cuenta (8–9 dígitos),
   * la región y la fecha no cuentan. En el orden de la carta y sin repetir.
   */
  function interpretar(texto) {
    const t = String(texto || '');
    const numeros = [];
    const re = /(?<!\d)(\d{10}|\d{2,3}[ .-]\d{3,4}[ .-]\d{4})(?!\d)/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const d = m[1].replace(/\D/g, '');
      if (d.length === 10 && numeros.indexOf(d) < 0) numeros.push(d);
    }
    const p = plano(t);
    let fecha = '';
    const larga = p.match(new RegExp('\\b(\\d{1,2}) (?:DE )?(' + MESES.join('|') + ') (?:DE |DEL )?(\\d{4})\\b'));
    if (larga) fecha = larga[3] + '-' + dos(MESES.indexOf(larga[2]) + 1) + '-' + dos(Number(larga[1]));
    else {
      const corta = t.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
      if (corta && Number(corta[2]) >= 1 && Number(corta[2]) <= 12) fecha = corta[3] + '-' + dos(Number(corta[2])) + '-' + dos(Number(corta[1]));
    }
    return { numeros: numeros, fecha: fecha, proveedor: proveedorDe(t) };
  }

  /** La compañía del inventario como la nombra la carta: TELCEL, AT&T o ''. */
  const companiaDe = (c) => (/AT ?& ?T|\bATT\b/i.test(txt(c)) ? 'AT&T' : /TELCEL/i.test(txt(c)) ? 'TELCEL' : '');

  /**
   * Puro: lo que no cuadra entre la carta y la línea (vistaCarta): otra compañía, o su razón social no está escrita en la
   * carta. Solo avisa; Pau decide.
   */
  function avisos(x, lectura, texto) {
    const salida = [];
    if (['AVANZA', 'LIGA'].indexOf(x.estado) < 0) return salida;
    const cia = companiaDe(x.compania);
    if (lectura.proveedor && cia && cia !== lectura.proveedor) salida.push('La carta es para ' + lectura.proveedor + ' y la línea es ' + cia);
    // Sin las siglas de la sociedad (S.A. DE C.V., SC…): la carta y el inventario las escriben distinto
    const razon = sinSiglas_(x.razon);
    if (razon && (' ' + sinSiglas_(texto) + ' ').indexOf(' ' + razon + ' ') < 0) salida.push('Su razón social (' + x.razon + ') no aparece en la carta');
    return salida;
  }
  const sinSiglas_ = (s) => plano(s).replace(/\b(SA|DE|CV|SC|S|A|C|V|R|L|RL)\b/g, ' ').replace(/\s+/g, ' ').trim();

  const huellaDe_ = (bytes) => Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
    .map((b) => ('0' + (b & 255).toString(16)).slice(-2)).join('');

  // En producción, la carpeta de siempre (LINEAS_CARTAS_CARPETA, 17-nov); en un DEV, la suya en la raíz
  const carpetaCartas_ = () => {
    const id = leerConfig_('LINEAS_CARTAS_CARPETA');
    return id ? DriveApp.getFolderById(id) : DriveUtils.carpetaEnRaiz('CARTAS DE CANCELACION');
  };
  const pendientes_ = () => DriveUtils.subcarpeta(carpetaCartas_(), POR_CONFIRMAR);

  function exigirAprobador_(usuario) {
    if (!LineasResguardos.puedeAprobar(usuario)) throw new Error('Solo puedes consultar Resguardos y cancelaciones, no modificarlo.');
  }

  /** Un número de teléfono como lo busca interpretar(). */
  const CON_NUMERO = /(?<!\d)(\d{10}|\d{2,3}[ .-]\d{3,4}[ .-]\d{4})(?!\d)/;

  /** Lee el Documento con OCR que se acaba de crear y lo tira. */
  function leerYTirar_(doc) {
    try {
      return DocumentApp.openById(doc.id).getBody().getText();
    } finally {
      try { DriveUtils.aPapelera(DriveApp.getFileById(doc.id), { temporal: true }); } catch (e) { console.warn('LineasCarta: no se tiró la copia ' + doc.id); }
    }
  }

  /**
   * El texto del PDF: copia como Documento con OCR en `carpeta`, se lee y se tira la copia. Si ese texto no trae ningún
   * número, se lee también la imagen de la primera página (textoDeLaPagina_): en 25 de las 42 cartas de antes la tabla
   * venía pegada como imagen dentro de un PDF con texto, y Drive solo lee la capa de texto (13-nov).
   */
  function textoDe_(archivo, carpeta) {
    const texto = leerYTirar_(DriveUtils.copiarConApi({ name: 'OCR ' + archivo.getId(), mimeType: 'application/vnd.google-apps.document', parents: [carpeta.getId()] },
      archivo.getId(), { ocrLanguage: 'es', supportsAllDrives: true, fields: 'id' }, { temporal: true }));
    if (CON_NUMERO.test(texto)) return texto;
    let pagina = '';
    try { pagina = textoDeLaPagina_(archivo, carpeta); } catch (e) { console.warn('LineasCarta: no se leyó la imagen de la página: ' + e.message); }
    return pagina ? texto + '\n' + pagina : texto;
  }

  /**
   * La primera página como imagen (la miniatura de Drive pedida en grande, 2400 px) pasada por OCR. Drive arma la miniatura
   * unos segundos después de subir el archivo: se espera hasta ~8 s. '' si no hay. Usa los permisos que ya tiene el
   * proyecto (drive y script.external_request).
   */
  function textoDeLaPagina_(archivo, carpeta) {
    let enlace = '';
    for (let i = 0; i < 5 && !enlace; i++) {
      if (i) Utilities.sleep(2000);
      enlace = txt(Drive.Files.get(archivo.getId(), { fields: 'thumbnailLink', supportsAllDrives: true }).thumbnailLink);
    }
    if (!enlace) return '';
    const grande = /=s\d+$/.test(enlace) ? enlace.replace(/=s\d+$/, '=s2400') : enlace + '=s2400';
    const r = UrlFetchApp.fetch(grande, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) return '';
    return leerYTirar_(DriveUtils.crearConApi({ name: 'OCR pagina ' + archivo.getId(), mimeType: 'application/vnd.google-apps.document', parents: [carpeta.getId()] },
      r.getBlob(), { ocrLanguage: 'es', supportsAllDrives: true, fields: 'id' }, { temporal: true }));
  }

  /**
   * Paso 1: guarda el PDF en POR CONFIRMAR y regresa lo que haría. → { archivoId, nombre, huella, fecha, proveedor,
   * sinTexto, numeros: [vistaCarta + avisos], duplicada }.
   */
  function leer(nombre, base64, usuario) {
    exigirAprobador_(usuario);
    const bytes = Utilities.base64Decode(String(base64 || ''));
    if (!bytes.length) throw new Error('El archivo está vacío.');
    if (bytes.length > MAX_BYTES) throw new Error('La carta supera 15 MB.');
    if (String.fromCharCode.apply(null, bytes.slice(0, 4).map((b) => b & 255)) !== '%PDF') throw new Error('La carta tiene que ser un PDF.');
    const huella = huellaDe_(bytes);
    const limpio = txt(nombre).replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 150) || 'CARTA DE CANCELACION.pdf';
    const carpeta = pendientes_();
    const archivo = DriveUtils.crearArchivo(carpeta, Utilities.newBlob(bytes, 'application/pdf', /\.pdf$/i.test(limpio) ? limpio : limpio + '.pdf'));
    const texto = textoDe_(archivo, carpeta);
    const l = interpretar(texto);
    const v = LineasResguardos.vistaCarta(l.numeros, huella, usuario);
    v.numeros.forEach((x) => { x.avisos = avisos(x, l, texto); });
    return { archivoId: archivo.getId(), nombre: archivo.getName(), huella: huella, fecha: l.fecha, proveedor: l.proveedor,
      sinTexto: !txt(texto), numeros: v.numeros, duplicada: v.duplicada };
  }

  /** 'yyyy-MM-dd' → la fecha de la carta (hoy: ahora; otro día: a mediodía, sin brincar de día por la zona). */
  function fechaEnvio_(ymd) {
    const m = txt(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return new Date();
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
    if (isNaN(d.getTime()) || d > new Date()) return new Date();
    return Utilities.formatDate(d, LineasDatos.ZONA_APP, 'yyyy-MM-dd') === Utilities.formatDate(new Date(), LineasDatos.ZONA_APP, 'yyyy-MM-dd') ? new Date() : d;
  }

  /**
   * Paso 2: `ids` (renglones de Cancelaciones que Pau dejó marcados) pasan a CARTA ENVIADA con la carta `archivoId`, que
   * tiene que estar en POR CONFIRMAR (la subió `leer`). datos = { fecha: 'yyyy-MM-dd', asunto }. Si ninguna cambió, la carta
   * se queda donde estaba. → lo de cartaEnviada ({ hechos, omitidos }).
   */
  function aplicar(archivoId, ids, datos, usuario) {
    exigirAprobador_(usuario);
    const d = datos || {};
    let archivo = null;
    try { archivo = DriveApp.getFileById(txt(archivoId)); } catch (e) { archivo = null; }
    const carpeta = pendientes_();
    let enPendientes = false;
    if (archivo && !archivo.isTrashed()) {
      const padres = archivo.getParents();
      while (padres.hasNext()) if (padres.next().getId() === carpeta.getId()) enPendientes = true;
    }
    if (!enPendientes) throw new Error('Esa carta ya se guardó o no se subió aquí: vuelve a subirla.');
    const enviadaEn = fechaEnvio_(d.fecha);
    const r = LineasResguardos.cartaEnviada(ids, { carta: archivo.getUrl(), huella: huellaDe_(archivo.getBlob().getBytes()),
      enviadaEn: enviadaEn, asunto: d.asunto }, usuario);
    if (!r.hechos.length) return r;
    // Ya guardada, con su nombre de siempre (13-nov): CARTA CANCELACION <PROVEEDOR> <RAZÓN SOCIAL> <aaaa-mm-dd>.pdf
    const destino = carpetaCartas_();
    const nombre = nombreLibre_(destino, nombreGuardada(r.lineas || [], Utilities.formatDate(enviadaEn, LineasDatos.ZONA_APP, 'yyyy-MM-dd')));
    DriveUtils.mover(archivo, destino, nombre);
    LineasArchivos.compartirEnDominio(archivo);
    r.nombre = nombre;
    delete r.lineas;
    return r;
  }

  /**
   * Puro: el nombre de la carta ya guardada, con lo que dicen sus líneas: la compañía y la razón social que más se
   * repiten (una carta trae una sola). lineas = [{ compania, razon }].
   */
  function nombreGuardada(lineas, ymd) {
    const masComun = (lista) => {
      const n = {};
      lista.filter(Boolean).forEach((x) => { n[x] = (n[x] || 0) + 1; });
      return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0] || '';
    };
    const proveedor = masComun(lineas.map((l) => proveedorDeCompania(l.compania))) || 'LINEAS';
    const razon = masComun(lineas.map((l) => txt(l.razon).toUpperCase())) || 'SIN RAZON SOCIAL';
    return nombreCarta(proveedor, razon, ymd);
  }

  /** El nombre, o «… (2).pdf», «… (3).pdf» si en la carpeta ya hay uno igual. */
  function nombreLibre_(carpeta, nombre) {
    const base = nombre.replace(/\.pdf$/i, '');
    for (let i = 1; i < 100; i++) {
      const prueba = i === 1 ? nombre : base + ' (' + i + ').pdf';
      if (!carpeta.getFilesByName(prueba).hasNext()) return prueba;
    }
    return base + ' ' + Utilities.getUuid().slice(0, 8) + '.pdf';
  }

  // ------------------------------------------------------------------ «Preparar carta»: el borrador (11-nov)
  //
  // El sistema arma la carta (src/html/pdf/carta-cancelacion.html) con la redacción de las cartas reales; NO cambia ninguna
  // fase ni guarda nada: la carta que cuenta es la que Pau firma, manda desde su correo y sube con «Subir carta» (un solo
  // camino a CARTA ENVIADA). Una carta por proveedor + razón social. Quien firma sale de la propiedad del proyecto
  // LINEAS_CARTA_FIRMANTE (nunca del código: el repo es público).

  const DOCUMENTO = 'carta-cancelacion';
  const SIN_FIRMANTE = '______________________________';
  const MESES_CARTA = MESES.map((m) => m.toLowerCase());

  /** Lo que cambia de un proveedor a otro (de las 44 cartas reales). n = cuántas líneas lleva la carta. */
  const REDACCION = {
    'TELCEL': {
      legal: 'RADIOMÓVIL DIPSA, S.A. DE C.V.',
      tituloCuenta: 'CUENTA PADRE',
      solicitud: (n) => (n === 1
        ? 'la cancelación de la siguiente línea debido a que las actividades a las cuales estaba asignada ya no serán necesarias:'
        : 'la cancelación de las siguientes líneas debido a que las actividades a las cuales estaban asignadas ya no serán necesarias:'),
      despues: () => '',
      firmaRazon: () => '',
    },
    'AT&T': {
      legal: 'AT&T Comercialización Móvil, S de R.L de C.V.',
      tituloCuenta: 'CUENTA',
      solicitud: (n) => (n === 1 ? 'la cancelación de la línea que a continuación se indica:'
        : 'la cancelación de las líneas que a continuación se indican:'),
      despues: (n) => (n === 1 ? 'La solicitud de la baja se debe a que ya no requerimos la línea y ha culminado su periodo de contratación.'
        : 'La solicitud de las bajas se debe a que ya no requerimos las líneas y han culminado su periodo de contratación.'),
      firmaRazon: (razon) => razon + ', REPRESENTADA EN ESTE ACTO POR CONDUCTO DE SU APODERADA LEGAL',
    },
  };

  /** La compañía de una línea → 'TELCEL' | 'AT&T' | '' (las demás no llevan esta carta). */
  function proveedorDeCompania(compania) {
    const c = plano(compania);
    if (/\bTELCEL\b/.test(c)) return 'TELCEL';
    if (/^(AT AND T|ATT|AT T)\b/.test(c)) return 'AT&T';
    return '';
  }

  /** 'yyyy-MM-dd' → '21 de octubre de 2026' ('' si no es fecha). */
  function fechaEnLetra(ymd) {
    const m = txt(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return '';
    return Number(m[3]) + ' de ' + MESES_CARTA[Number(m[2]) - 1] + ' de ' + m[1];
  }

  /**
   * Puro: los renglones de la bandeja → una carta por proveedor + razón social, TELCEL primero.
   * → { grupos: [{ proveedor, razon, filas }], fuera: [renglones de otra compañía] }.
   */
  function agrupar(filas) {
    const grupos = {};
    const fuera = [];
    (filas || []).forEach((f) => {
      const proveedor = proveedorDeCompania(f['COMPANIA']);
      if (!proveedor) { fuera.push(f); return; }
      const razon = txt(f['RAZON_SOCIAL']).toUpperCase() || 'SIN RAZÓN SOCIAL';
      const clave = proveedor + '|' + plano(razon);
      (grupos[clave] = grupos[clave] || { proveedor: proveedor, razon: razon, filas: [] }).filas.push(f);
    });
    const orden = (g) => (g.proveedor === 'TELCEL' ? 0 : 1);
    const lista = Object.keys(grupos).map((k) => grupos[k]).sort((a, b) => orden(a) - orden(b) || a.razon.localeCompare(b.razon));
    // Dentro de la carta: por región, cuenta y número (las cartas a mano no seguían ningún orden)
    lista.forEach((g) => g.filas.sort((a, b) => txt(a['REGION']).localeCompare(txt(b['REGION']), 'es', { numeric: true }) ||
      txt(a['CUENTA_PADRE']).localeCompare(txt(b['CUENTA_PADRE'])) || txt(a['NUMERO']).localeCompare(txt(b['NUMERO']))));
    return { grupos: lista, fuera: fuera };
  }

  /** Puro: los datos de la plantilla para un grupo de agrupar(), con la fecha 'yyyy-MM-dd' y quien firma. */
  function datosCarta(grupo, ymd, firmante) {
    const r = REDACCION[grupo.proveedor];
    const n = grupo.filas.length;
    return {
      'FECHA_LETRA': fechaEnLetra(ymd),
      'ASUNTO': n === 1 ? 'Cancelación de línea' : 'Cancelación de líneas',
      'PROVEEDOR_LEGAL': r.legal,
      'FIRMANTE': txt(firmante) || SIN_FIRMANTE,
      'SOLICITUD': r.solicitud(n),
      'TITULO_CUENTA': r.tituloCuenta,
      'LINEAS': grupo.filas.map((f) => ({
        // HIJA: la cuenta hija, junto a la padre (Telcel la pidió, 20-nov; también en AT&T)
        'REGION': txt(f['REGION']), 'CUENTA': txt(f['CUENTA_PADRE']), 'HIJA': txt(f['CUENTA_HIJA']), 'NUMERO': LineasUtil.digitos(f['NUMERO']) || txt(f['NUMERO']),
        'RAZON': txt(f['RAZON_SOCIAL']).toUpperCase(), 'ASESOR': txt(f['ASESOR']).toUpperCase(),
      })),
      'DESPUES': r.despues(n),
      'FIRMA_RAZON': r.firmaRazon(grupo.razon),
    };
  }

  /**
   * Quien firma: lo que escribió Pau (un espacio, sin signos raros; tope de 80) o, si no, la propiedad del
   * proyecto LINEAS_CARTA_FIRMANTE (también la que ve la pantalla para llenarlo; nunca va en el código).
   */
  function firmanteDe(quienFirma) {
    const escrito = txt(quienFirma).replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ. ]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
    return escrito.length >= 5 ? escrito : txt(leerConfig_('LINEAS_CARTA_FIRMANTE'));
  }

  /** El nombre del PDF: CARTA CANCELACION <COMPAÑÍA> <RAZÓN SOCIAL> <aaaa-mm-dd>.pdf (el mismo que tendrá ya subida). */
  function nombreCarta(proveedor, razon, ymd) {
    return ('CARTA CANCELACION ' + proveedor.replace('&', '') + ' ' + razon + ' ' + ymd).replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, ' ').trim() + '.pdf';
  }

  /**
   * Los borradores de los renglones `ids` (Cancelaciones, lo seleccionado), con fecha 'yyyy-MM-dd' (hoy si no viene) y
   * quien firma (lo escribe Pau; si no, la propiedad LINEAS_CARTA_FIRMANTE).
   * → { fecha, cartas: [{ nombre, proveedor, razon, lineas, asesores, numeros, tabla, base64 }], omitidas: [{ numero, motivo }],
   *     sinFirmante }. tabla: los renglones de la carta (REGION, CUENTA, NUMERO, RAZON, ASESOR), para pegarlos en el correo.
   *     No escribe nada.
   */
  function preparar(ids, ymd, usuario, quienFirma) {
    exigirAprobador_(usuario);
    if (!PdfHtml.encendido(DOCUMENTO)) throw new Error('El borrador de la carta todavía no está disponible aquí.');
    const dia = /^\d{4}-\d{2}-\d{2}$/.test(txt(ymd)) ? txt(ymd) : Utilities.formatDate(new Date(), LineasDatos.ZONA_APP, 'yyyy-MM-dd');
    const sel = LineasResguardos.filasParaCarta(ids, usuario);
    const g = agrupar(sel.filas);
    const omitidas = sel.omitidas.map((o) => ({ numero: o.numero, motivo: o.motivo }))
      .concat(g.fuera.map((f) => ({ numero: txt(f['NUMERO']), motivo: 'La carta es solo para TELCEL y AT&T (' + (txt(f['COMPANIA']) || 'sin compañía') + ')' })));
    const firmante = firmanteDe(quienFirma);
    const cartas = g.grupos.map((grupo) => {
      const datos = datosCarta(grupo, dia, firmante);
      const pdf = PdfHtml.pdf(DOCUMENTO, datos).blob;
      const asesores = grupo.filas.map((f) => txt(f['ASESOR']).toUpperCase()).filter((a, i, l) => a && l.indexOf(a) === i);
      return { nombre: nombreCarta(grupo.proveedor, grupo.razon, dia), proveedor: grupo.proveedor, razon: grupo.razon,
        lineas: grupo.filas.length, asesores: asesores, numeros: grupo.filas.map((f) => txt(f['NUMERO'])), tabla: datos['LINEAS'],
        base64: Utilities.base64Encode(pdf.getBytes()) };
    });
    return { fecha: dia, cartas: cartas, omitidas: omitidas, sinFirmante: !firmante };
  }

  // ------------------------------------------------------------------ Las cartas de antes (13-nov)
  //
  // Las cartas que se mandaron antes de «Subir carta» viven en una carpeta de Drive. Se leen igual que una que se sube
  // (OCR) y se ligan a sus renglones ya CARTA ENVIADA o CANCELADA que no tienen carta. Nunca cambia una fase y nunca mueve
  // ni renombra los PDF (la carpeta puede ser de otro proyecto: el DEV solo la lee).

  const USUARIO_EDITOR_ = () => ({ puedeAprobar: true, esAdmin: true, nombre: 'Carga de cartas de antes (editor)',
    correo: (Session.getEffectiveUser().getEmail() || '').toLowerCase() });
  const LIMITE_MS = 4.5 * 60 * 1000; // Apps Script corta a los 6 min: lo leído se guarda y la siguiente corrida sigue

  /** El texto de una carta de la carpeta, guardado 6 h (la OCR es lo lento: ~5 s por carta). */
  function textoGuardado_(archivo, carpetaOcr) {
    const cache = CacheService.getScriptCache();
    const clave = 'carta_ocr_' + archivo.getId();
    const antes = cache.get(clave);
    if (antes !== null) return antes;
    const texto = textoDe_(archivo, carpetaOcr);
    try { cache.put(clave, texto.slice(0, 90000), 21600); } catch (e) { /* solo es un atajo */ }
    return texto;
  }

  /**
   * Lee la carpeta y dice qué carta va con qué renglones; con aplicar, las liga. → { completo, reporte (texto), cartas,
   * ligadas, sinCarta }. completo = false si se acabó el tiempo: se corre otra vez y sigue (lo leído está en caché).
   */
  function cargarViejas(idCarpeta, aplicar) {
    const inicio = Date.now();
    const usuario = USUARIO_EDITOR_();
    const carpeta = DriveApp.getFolderById(idCarpeta);
    const carpetaOcr = pendientes_(); // las copias para OCR se hacen en el proyecto, nunca en la carpeta de las cartas
    const archivos = [];
    const it = carpeta.getFilesByType('application/pdf');
    while (it.hasNext()) archivos.push(it.next());
    archivos.sort((a, b) => a.getName().localeCompare(b.getName()));

    // 1. Leer cada carta (lo lento); si se acaba el tiempo, se para aquí
    const leidas = [];
    const porHuella = {};
    for (let i = 0; i < archivos.length; i++) {
      if (Date.now() - inicio > LIMITE_MS) {
        return { completo: false, reporte: 'Leídas ' + i + ' de ' + archivos.length + ' cartas: se acabó el tiempo. Corre la función otra vez y sigue donde se quedó.' };
      }
      const a = archivos[i];
      const huella = huellaDe_(a.getBlob().getBytes());
      if (porHuella[huella]) { porHuella[huella].copias.push(a.getName()); continue; }
      const texto = textoGuardado_(a, carpetaOcr);
      const l = interpretar(texto);
      const carta = { nombre: a.getName(), url: a.getUrl(), huella: huella, fecha: l.fecha, proveedor: l.proveedor, numeros: l.numeros,
        sinTexto: !txt(texto), copias: [] };
      porHuella[huella] = carta;
      leidas.push(carta);
    }

    // 2. Qué es cada número hoy (una sola lectura de la bandeja para todas)
    const todos = [];
    leidas.forEach((c) => c.numeros.forEach((n) => { if (todos.indexOf(n) < 0) todos.push(n); }));
    const v = LineasResguardos.vistaCarta(todos, '', usuario);
    const estado = {};
    v.numeros.forEach((x) => { estado[x.numero] = x; });

    // 3. Un número en varias cartas (se volvió a pedir): se queda con la más reciente
    const duena = {};
    leidas.forEach((c) => c.numeros.forEach((n) => {
      const otra = duena[n];
      if (!otra || (c.fecha || '') > (otra.fecha || '')) duena[n] = c;
    }));

    // 4. Por carta: qué se liga
    let ligadas = 0;
    const lineas = [];
    leidas.forEach((c) => {
      const cuenta = { LIGA: [], YA: 0, AVANZA: [], FUERA: 0, NO_INVENTARIO: 0, otraCarta: 0 };
      c.numeros.forEach((n) => {
        const x = estado[n] || { estado: 'NO_INVENTARIO' };
        if (x.estado === 'LIGA' && duena[n] !== c) { cuenta.otraCarta++; return; }
        if (x.estado === 'LIGA') cuenta.LIGA.push(x.id);
        else if (x.estado === 'AVANZA') cuenta.AVANZA.push(n);
        else cuenta[x.estado] = (cuenta[x.estado] || 0) + 1;
      });
      let hechas = 0;
      if (aplicar && cuenta.LIGA.length) {
        const r = LineasResguardos.cartaEnviada(cuenta.LIGA, { carta: c.url, huella: c.huella, enviadaEn: null }, usuario);
        hechas = r.hechos.length;
        ligadas += hechas;
      }
      lineas.push('• ' + c.nombre + (c.copias.length ? ' (= ' + c.copias.join(', ') + ')' : '') + '\n    ' +
        [c.proveedor || 'proveedor ?', c.fecha || 'sin fecha', c.numeros.length + ' número(s)'].join(' · ') +
        (c.sinTexto ? ' · NO SE PUDO LEER' : '') + '\n    ' +
        (aplicar ? 'ligadas ' + hechas : 'se ligarían ' + cuenta.LIGA.length) +
        (cuenta.YA ? ' · ya con carta ' + cuenta.YA : '') +
        (cuenta.otraCarta ? ' · en una carta más reciente ' + cuenta.otraCarta : '') +
        (cuenta.AVANZA.length ? ' · OJO: siguen POR FIRMAR/FIRMADA ' + cuenta.AVANZA.join(', ') : '') +
        (cuenta.FUERA ? ' · no están en Cancelaciones ' + cuenta.FUERA : '') +
        (cuenta.NO_INVENTARIO ? ' · no están en el inventario ' + cuenta.NO_INVENTARIO : ''));
    });

    // 5. Lo que sigue sin carta (enviado o cancelado) después de esto
    const conCarta = {};
    leidas.forEach((c) => c.numeros.forEach((n) => { if (estado[n] && estado[n].estado === 'LIGA') conCarta[estado[n].id] = true; }));
    const sinCarta = LineasResguardos.bandeja(usuario).filas.filter((f) => !f.ANTERIOR && !f.dg &&
      [LineasResguardos.FASE.ENVIADA, LineasResguardos.FASE.CANCELADA].indexOf(txt(f['CANCELACION'])) >= 0 &&
      !/^https:\/\//i.test(txt(f['CARTA'])) && !conCarta[txt(f['ID'])]).map((f) => txt(f['NUMERO']) + ' (' + txt(f['CANCELACION']).toLowerCase() + ')');

    const duplicadas = leidas.reduce((t, c) => t + c.copias.length, 0);
    const reporte = (aplicar ? 'CARGA' : 'REVISIÓN (no se escribió nada)') + ' de cartas de antes: ' + archivos.length + ' PDF, ' +
      leidas.length + ' distintas' + (duplicadas ? ' (' + duplicadas + ' repetidas por huella)' : '') + '.\n' +
      (aplicar ? 'Renglones ligados: ' + ligadas : 'Renglones que se ligarían: ' + Object.keys(conCarta).length) + '.\n\n' +
      lineas.join('\n') + '\n\nEnviadas o canceladas que seguirían sin carta: ' + sinCarta.length +
      (sinCarta.length ? '\n    ' + sinCarta.slice(0, 80).join(', ') + (sinCarta.length > 80 ? '…' : '') : '');
    return { completo: true, reporte: reporte, cartas: leidas.length, ligadas: aplicar ? ligadas : Object.keys(conCarta).length, sinCarta: sinCarta.length };
  }

  return { leer, aplicar, interpretar, avisos, proveedorDe, CARPETA_CARTAS, nombreGuardada, cargarViejas, firmanteDe,
    preparar, agrupar, datosCarta, fechaEnLetra, proveedorDeCompania, nombreCarta, DOCUMENTO };
})();

/**
 * Editor: las cartas de cancelación de antes (una carpeta de Drive con los PDF) a sus renglones ya CARTA ENVIADA o CANCELADA
 * sin carta. Sin argumento, la carpeta sale de LINEAS_CARTAS_ANTES (Entornos.gs o propiedad del script). Si se acaba el
 * tiempo, se corre otra vez y sigue (la lectura de cada carta queda 6 h en caché). Reemplaza a lineasCartaAplicar.
 *   lineasCartasAntesRevisar()               → solo dice qué haría
 *   lineasCartasAntesAplicar('SI, EN PROD')  → las liga (en un DEV basta con lineasCartasAntesAplicar())
 */
function lineasCartasAntesRevisar(idCarpeta) {
  soloEditor_();
  const r = LineasCarta.cargarViejas(lineasCartasAntesCarpeta_(idCarpeta), false);
  console.log(r.reporte);
  return r.reporte;
}

function lineasCartasAntesAplicar(confirmacion, idCarpeta) {
  soloEditor_();
  if (String(Config.ENTORNO || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("En producción pide la confirmación: lineasCartasAntesAplicar('SI, EN PROD'). Primero lineasCartasAntesRevisar().");
  }
  const r = LineasCarta.cargarViejas(lineasCartasAntesCarpeta_(idCarpeta), true);
  console.log(r.reporte);
  return r.reporte;
}

function lineasCartasAntesCarpeta_(idCarpeta) {
  const id = typeof idCarpeta === 'string' && idCarpeta ? idCarpeta : leerConfig_('LINEAS_CARTAS_ANTES');
  if (!id) throw new Error('Falta la carpeta de las cartas de antes: pásala o ponla como LINEAS_CARTAS_ANTES (Entornos.gs o propiedad del script).');
  return id;
}
