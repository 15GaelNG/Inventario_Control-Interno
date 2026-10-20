/**
 * PendientesInspeccionService.gs
 * "Pendientes de inspección": lo que el inspector detecta que hay que subir a Help Desk como
 * ticket, con su familia/grupo y su prioridad. Vive en una hoja propia porque TICKETS está
 * enfocada a otros rubros (Uber, tarjetas de combustible EOX/EDENRED, hologramas) y porque el
 * responsable del vehículo es un TERCERO sin acceso a este sistema: no llena nada aquí.
 *
 * Flujo (acordado con Jorge, 20-oct-2026):
 *  1. Al cerrar una inspección, el inspector anota cada cosa que hay que reportar: un ASUNTO
 *     (texto libre: "qué debe reportar el responsable"), la FAMILIA O GRUPO (catálogo cerrado,
 *     FAMILIAS_PENDIENTE_INSPECCION en modulos/inspecciones.html -- es para que Kike filtre y dé
 *     seguimiento, punto C; no participa en el match) y la PRIORIDAD (urgente/no urgente, la
 *     decide el inspector). agregar() le pone AL ASUNTO, en automático, el ID real de ESTA
 *     inspección por delante ("INS-67M8DXDS439WXR - Reparación de faro", NO el folio de negocio
 *     "2026_649_314": ese se puede repetir o confundirse entre inspecciones, el ID nunca): es lo
 *     único que hace el match más exacto, porque es el único texto que de verdad llega a Help Desk.
 *  2. Van en el correo de aviso, en su propia sección de color (Asunto / Familia o grupo a
 *     reportar / Prioridad, cada quien su línea), con instrucciones de usar ESE mismo texto de
 *     "Asunto" como asunto del ticket en Help Desk (InspeccionesService.avisarInspeccion_).
 *  3. El responsable da de alta el ticket en el Help Desk de verdad (fuera de este sistema). Esta
 *     app nunca le habla directo: solo LEE el Help Desk por su API, con el token de quien tenga
 *     sesión aquí (HelpdeskApi.gs) y guarda una copia en APP_HELPDESK (HelpdeskService.gs) cada
 *     vez que alguien abre esa pantalla -- no hay cuenta de servicio para leerlo sin que nadie
 *     entre.
 *  4. revisarCargaHelpdesk() (llamada por el Calentador cada 10 min) compara cada pendiente
 *     "SIN CARGAR EN HELPDESK" contra esa copia (TITULO + DESCRIPCION): si el texto del ticket
 *     contiene el ID DE LA INSPECCIÓN en cualquier parte (no hace falta el asunto completo:
 *     tolera que el responsable edite o resuma el resto al pegarlo en Help Desk), lo marca
 *     "CARGADO EN HELPDESK" con el número real del ticket. Si una misma inspección generó más de
 *     un pendiente (el mismo ID aparece en varios tickets), desempata por las palabras propias
 *     de CADA pendiente (sin el ID): el candidato que más comparte. Si ninguno se distingue, no
 *     adivina -- lo deja "SIN CARGAR" para que alguien lo vincule a mano (ver el punto 6). Nunca
 *     llama al Help Desk ella misma: solo lee lo que YA se sincronizó la última vez que alguien
 *     abrió esa pantalla (ver la nota de credenciales ahí).
 *  5. Kike ve los que llevan tiempo "SIN CARGAR EN HELPDESK" (vista de seguimiento, punto C).
 *  6. Cuando el match automático no lo encuentra (texto irreconocible, o Help Desk todavía no
 *     sincronizado), Kike lo vincula a mano con vincularManual(): escribe el número de ticket que
 *     ya vio ella misma en Help Desk, y si ese ticket ya está en la copia local, lo liga igual que
 *     si lo hubiera encontrado solo.
 *
 * La hoja no viene de AppSheet -- no existe hasta que hace falta (mismo patrón que
 * SolicitudCompraService.hoja_ / HelpdeskService.hoja_, NO el de HojaServicio: ese exige que
 * la hoja ya exista).
 */
const PendientesInspeccionService = (function () {
  const HOJA = 'PENDIENTES INSPECCION';
  const ENCABEZADOS = [
    'ID', 'ID INSPECCION', 'FECHA', 'ID VEHICULO', 'PLACAS', 'NUCO', 'VEHICULO', 'RESPONSABLE',
    'ASUNTO', 'FAMILIA O GRUPO A REPORTAR', 'PRIORIDAD', 'ESTATUS', 'ID TICKET HELPDESK', 'ESTATUS HELPDESK',
    'FECHA CARGADO', 'ULTIMO RECORDATORIO', 'CORREO RESPONSABLE', 'CORREOS CC',
  ];
  const ESTATUS_SIN_CARGAR = 'SIN CARGAR EN HELPDESK';
  const ESTATUS_CARGADO = 'CARGADO EN HELPDESK';
  // Antes era parte del permiso de 'inspeccion-vehicular' (una pestaña suya); tiene su propio
  // módulo (Modulos.gs) desde que se independizó a su propia vista (20-oct-2026): quien le da
  // seguimiento a esto no necesariamente captura inspecciones.
  const MODULO = 'pendientes-inspeccion';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /**
   * La hoja (o null si no existe y no se pide crearla) -- mismo patrón que SolicitudCompraService.hoja_.
   * Si ya existe pero le falta alguna columna (un ENCABEZADOS que creció después), se la agrega sola
   * al final, como HelpdeskService.hoja_.
   */
  function hoja_(crear) {
    const ss = SpreadsheetApp.openById(ssId());
    let hoja = ss.getSheetByName(HOJA);
    if (!hoja) {
      if (!crear) return null;
      hoja = ss.insertSheet(HOJA);
      hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');
      hoja.setFrozenRows(1);
      return hoja;
    }
    const enc = hoja.getRange(1, 1, 1, Math.max(1, hoja.getLastColumn())).getValues()[0].map((h) => String(h).trim());
    const indices = SheetUtils.indiceDeColumnas(enc, ENCABEZADOS);
    const faltan = ENCABEZADOS.filter((c) => indices[c] === -1);
    if (faltan.length && crear) {
      const desde = enc.filter(Boolean).length + 1;
      hoja.getRange(1, desde, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
    }
    return hoja;
  }

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  /** Sin acentos, en mayúsculas y con los espacios de sobra colapsados -- para comparar texto libre */
  const normalizar_ = (v) => limpiar_(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\s+/g, ' ');
  function escaparHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Da de alta los pendientes de UNA inspección ya guardada (InspeccionesService.registrar).
   * Nunca truena por un renglón vacío: los que no traen asunto simplemente se ignoran.
   * @param {Object} filaInspeccion la fila ya armada de la inspección (folio, placas, nuco…)
   * @param {string} idInspeccion   el ID real de esa inspección (fila['ID'], prefijo INS -- NO el
   *   folio de negocio de ID INSPECCION), para la liga Y para anteponerlo al asunto (el
   *   responsable lo pega tal cual en Help Desk: es lo que hace el match exacto en
   *   revisarCargaHelpdesk(), sin depender de un folio que se pueda repetir o confundir)
   * @param {Array} items          [{ asunto, familia, prioridad }] -- lo que escribió el inspector
   * @param {string} [correoResponsable] el correo YA VALIDADO que de verdad recibió el aviso original
   *   (InspeccionesService.avisarInspeccion_) -- se guarda tal cual para que el recordatorio le
   *   llegue a la MISMA persona, aunque el inspector lo haya corregido a mano al capturar
   * @param {Array<string>} [correosCc] los demás correos (inspector, asistente, otros) que SÍ
   *   recibieron el aviso original en copia -- el recordatorio se los manda también en cc
   * @return {Array} los pendientes creados (mismas columnas que la hoja), para el correo
   */
  function agregar(filaInspeccion, idInspeccion, items, correoResponsable, correosCc) {
    const limpios = (items || [])
      .map((it) => ({
        asunto: limpiar_(it && it.asunto),
        familia: limpiar_(it && it.familia),
        prioridad: /^URGENTE$/i.test(limpiar_(it && it.prioridad)) ? 'URGENTE' : 'NO URGENTE',
      }))
      .filter((it) => it.asunto);
    if (!limpios.length) return [];

    const hoja = hoja_(true);
    const ahora = new Date();
    const creados = limpios.map((it) => {
      const fila = {
        'ID': Ids.nuevo(Entidades.prefijo(HOJA)),
        'ID INSPECCION': idInspeccion,
        'FECHA': ahora,
        'ID VEHICULO': filaInspeccion['ID VEHICULO'] || '',
        'PLACAS': filaInspeccion['PLACAS'] || '',
        'NUCO': filaInspeccion['NUCO'] || '',
        'VEHICULO': filaInspeccion['VEHICULO'] || '',
        'RESPONSABLE': filaInspeccion['RESPONSABLE'] || '',
        // El folio de la inspección va AL FRENTE del asunto, en automático: es el texto que el
        // responsable debe pegar tal cual como asunto de su ticket en Help Desk.
        'ASUNTO': limpiar_(idInspeccion) ? limpiar_(idInspeccion) + ' - ' + it.asunto : it.asunto,
        'FAMILIA O GRUPO A REPORTAR': it.familia,
        'PRIORIDAD': it.prioridad,
        'ESTATUS': ESTATUS_SIN_CARGAR,
        'ID TICKET HELPDESK': '',
        'ESTATUS HELPDESK': '',
        'FECHA CARGADO': '',
        'ULTIMO RECORDATORIO': '',
        'CORREO RESPONSABLE': limpiar_(correoResponsable),
        'CORREOS CC': (correosCc || []).map(limpiar_).filter(Boolean).join(', '),
      };
      hoja.appendRow(ENCABEZADOS.map((c) => fila[c]));
      return fila;
    });
    CacheHojas.tocarHoja(hoja);
    return creados;
  }

  /** Palabras de 4+ letras del texto propio del inspector (sin el ID por delante): para
   *  desempatar cuando el ID por sí solo encuentra más de un ticket. Las de 1-3 letras
   *  ("DE", "LA", "EN"...) casi nunca distinguen nada y se descartan solas, sin necesidad de
   *  una lista de palabras vacías. */
  function palabrasPropias_(asuntoCompleto, idInsp) {
    const prefijo = idInsp ? idInsp + ' - ' : '';
    const libre = prefijo && asuntoCompleto.indexOf(prefijo) === 0 ? asuntoCompleto.slice(prefijo.length) : asuntoCompleto;
    return libre.split(/[^A-Z0-9Ñ]+/).filter((p) => p.length >= 4);
  }

  /**
   * Compara los pendientes SIN CARGAR contra lo que ya se sincronizó de Help Desk (APP_HELPDESK,
   * HelpdeskService.gs): si el ID de la inspección (el que agregar() antepone al asunto) aparece
   * en cualquier parte del título o la descripción de algún ticket, ese pendiente queda CARGADO
   * EN HELPDESK con el número real del ticket -- no hace falta el asunto completo, para tolerar
   * que el responsable edite o resuma el resto del texto al pegarlo en Help Desk. Si el MISMO ID
   * aparece en más de un ticket (una inspección que generó varios pendientes, cada quien con el
   * suyo), desempata por las palabras propias de CADA pendiente (palabrasPropias_); si ninguno
   * se distingue, no adivina -- lo deja SIN CARGAR para vincularManual(). De paso, a los que YA
   * estaban CARGADO les refresca ESTATUS HELPDESK (Abierto/Resuelto/Cerrado…, lo que diga Help
   * Desk hoy) -- es OTRO estatus, el de nuestro propio seguimiento (ESTATUS: si ya se encontró
   * el ticket o no) nunca se le pisa ni se le confunde una vez que ya es CARGADO.
   *
   * OJO -- no llama al Help Desk ella misma: HelpdeskApi.gs necesita el token personal de
   * alguien con sesión ahí (24 h, no hay cuenta de servicio), así que esta función solo lee la
   * copia local, que se actualiza cuando alguien abre Help Desk en la app. Por eso "cada 10 min
   * se revisa" es la REVISIÓN, no la lectura de Help Desk: si nadie abre esa pantalla, la copia
   * no trae tickets nuevos (ni dice si alguno ya se resolvió) y aquí no hay nada nuevo que ver.
   *
   * La llama el Calentador (pasosCalentador_, cada 10 min). Nunca truena hacia afuera: un fallo
   * aquí no debe tumbar el resto de lo que calienta.
   * @return {{revisados: number, encontrados: number}}
   */
  function revisarCargaHelpdesk() {
    const hoja = hoja_(false);
    if (!hoja || hoja.getLastRow() < 2) return { revisados: 0, encontrados: 0 };
    const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS.length).getValues();
    const colEstatus = ENCABEZADOS.indexOf('ESTATUS');
    const colAsunto = ENCABEZADOS.indexOf('ASUNTO');
    const colIdInspeccion = ENCABEZADOS.indexOf('ID INSPECCION');
    const colIdTicket = ENCABEZADOS.indexOf('ID TICKET HELPDESK');
    const colEstatusHelpdesk = ENCABEZADOS.indexOf('ESTATUS HELPDESK');
    const pendientes = [];
    const cargados = [];
    valores.forEach((fila, i) => {
      if (normalizar_(fila[colEstatus]) === ESTATUS_SIN_CARGAR) pendientes.push(i);
      else if (fila[colIdTicket]) cargados.push(i);
    });
    if (!pendientes.length && !cargados.length) return { revisados: 0, encontrados: 0 };

    // APP_HELPDESK todavía podría no existir (nadie ha abierto Help Desk en esta app)
    if (typeof HelpdeskService === 'undefined') return { revisados: pendientes.length, encontrados: 0 };
    const tickets = HelpdeskService.copiaLocal_();
    if (!tickets.length) return { revisados: pendientes.length, encontrados: 0 };
    const textosDeTicket = tickets.map((t) => ({
      idTicket: t['ID TICKET HD'], estatus: limpiar_(t['ESTATUS']),
      texto: normalizar_((t['TITULO'] || '') + ' ' + (t['DESCRIPCION'] || '')),
    }));
    const porIdTicket = {};
    textosDeTicket.forEach((t) => { porIdTicket[String(t.idTicket)] = t; });

    return Candado.con(() => {
      let encontrados = 0;
      let tocado = false;
      const colFechaCargado = ENCABEZADOS.indexOf('FECHA CARGADO');
      const ahora = new Date();
      pendientes.forEach((i) => {
        const asuntoCompleto = normalizar_(valores[i][colAsunto]);
        if (!asuntoCompleto) return;
        const idInsp = normalizar_(valores[i][colIdInspeccion]);
        // Con ID: basta con que aparezca en cualquier parte (tolera texto editado). Sin ID
        // (pendientes de antes de que existiera, o algún caso raro): la regla estricta de
        // siempre, el asunto completo tal cual.
        const candidatos = idInsp
          ? textosDeTicket.filter((t) => t.texto.indexOf(idInsp) !== -1)
          : textosDeTicket.filter((t) => t.texto.indexOf(asuntoCompleto) !== -1);
        if (!candidatos.length) return;
        let match = candidatos[0];
        if (candidatos.length > 1) {
          const palabras = palabrasPropias_(asuntoCompleto, idInsp);
          let mejorPuntaje = 0;
          let elegido = null;
          candidatos.forEach((t) => {
            const puntaje = palabras.filter((p) => t.texto.indexOf(p) !== -1).length;
            if (puntaje > mejorPuntaje) { mejorPuntaje = puntaje; elegido = t; }
          });
          // Ninguno se distingue de los demás: mejor dejarlo para vincular a mano que arriesgar
          // el ticket equivocado de un pendiente hermano de la misma inspección.
          if (!elegido) return;
          match = elegido;
        }
        hoja.getRange(i + 2, colEstatus + 1, 1, 1).setValue(ESTATUS_CARGADO);
        hoja.getRange(i + 2, colIdTicket + 1, 1, 1).setValue(match.idTicket);
        hoja.getRange(i + 2, colEstatusHelpdesk + 1, 1, 1).setValue(match.estatus);
        hoja.getRange(i + 2, colFechaCargado + 1, 1, 1).setValue(ahora);
        encontrados++;
        tocado = true;
      });
      cargados.forEach((i) => {
        const ticket = porIdTicket[String(valores[i][colIdTicket])];
        if (!ticket || ticket.estatus === limpiar_(valores[i][colEstatusHelpdesk])) return;
        hoja.getRange(i + 2, colEstatusHelpdesk + 1, 1, 1).setValue(ticket.estatus);
        tocado = true;
      });
      if (tocado) CacheHojas.tocarHoja(hoja);
      return { revisados: pendientes.length, encontrados: encontrados };
    });
  }

  /**
   * La vista de Kike (punto C): todos los pendientes, con lo que hace falta para priorizar
   * (prioridad, estatus, cuánto llevan) y decidir a quién recordarle. Vacío si todavía no hay
   * ninguno. Mismo permiso que el resto del módulo: no es una sección aparte.
   */
  function listar(token) {
    Permisos.puedeLeer(token, MODULO);
    const hoja = hoja_(false);
    if (!hoja) return [];
    return SheetUtils.getAll(ssId(), HOJA).map((r) => Object.assign({}, r, {
      FECHA: HojaServicio.fechaISO(r['FECHA']),
      'FECHA CARGADO': HojaServicio.fechaISO(r['FECHA CARGADO']),
      'ULTIMO RECORDATORIO': HojaServicio.fechaISO(r['ULTIMO RECORDATORIO']),
    }));
  }

  /**
   * Le manda al responsable un recordatorio de un pendiente que sigue SIN CARGAR -- Kike lo
   * dispara a mano desde su vista. Va al MISMO correo que recibió el aviso original de esa
   * inspección (CORREO RESPONSABLE, guardado por agregar()); si ese pendiente es de antes de que
   * existiera esa columna (o nunca se capturó un correo válido), se busca por su nombre en
   * Capital Humano, como antes. También va en cc a los demás que ya habían recibido ese mismo
   * aviso original (CORREOS CC: inspector, asistente, otros) -- si el correo del responsable se
   * tuvo que buscar en Capital Humano, no hay cc porque no hay forma de saber quiénes eran.
   * @return {{enviado: true, correo: string, cc: Array<string>}}
   */
  function enviarRecordatorio(token, id) {
    Permisos.puedeEditar(token, MODULO);
    const hoja = hoja_(false);
    const encontrado = hoja && SheetUtils.findById(ssId(), HOJA, id, 'ID');
    if (!encontrado) throw new Error('No se encontró ese pendiente.');
    const fila = encontrado.data;
    if (normalizar_(fila['ESTATUS']) !== ESTATUS_SIN_CARGAR) {
      throw new Error('Ese pendiente ya está cargado en Help Desk: no hace falta recordarlo.');
    }
    let correo = limpiar_(fila['CORREO RESPONSABLE']);
    let cc = [];
    if (!correo) {
      const nombreBuscado = normalizar_(fila['RESPONSABLE']);
      if (!nombreBuscado) throw new Error('Este pendiente no tiene responsable capturado.');
      const colaborador = (CapitalHumano.listarColaboradores(token) || [])
        .find((c) => normalizar_(c.NOMBRE) === nombreBuscado);
      if (!colaborador || !limpiar_(colaborador.CORREO)) {
        throw new Error('No se encontró el correo de ' + fila['RESPONSABLE'] + ' en Capital Humano; avísale directamente.');
      }
      correo = limpiar_(colaborador.CORREO);
    } else {
      cc = limpiar_(fila['CORREOS CC']).split(',').map(limpiar_)
        .filter((c) => c && c.toLowerCase() !== correo.toLowerCase());
    }
    const asunto = 'Recordatorio: pendiente de inspección sin subir a Help Desk';
    const cuerpo = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">' +
      '<h2 style="margin:0 0 12px;font-size:18px">Pendiente sin subir a Help Desk</h2>' +
      '<p style="margin:0 0 10px">Hola, este pendiente de una inspección a tu unidad ' +
      (fila['VEHICULO'] ? '(<b>' + escaparHtml_(fila['VEHICULO']) + (fila['PLACAS'] ? ' · ' + escaparHtml_(fila['PLACAS']) : '') + '</b>) ' : '') +
      'todavía no aparece como ticket en el Help Desk:</p>' +
      '<p style="margin:0 0 6px;padding:10px 14px;background:#fff4e5;border:1px solid #f0b429;border-radius:6px">' +
      '<code>' + escaparHtml_(fila['ASUNTO']) + '</code></p>' +
      '<p style="margin:10px 0 0">Da de alta el ticket en Help Desk usando EXACTAMENTE ese texto como asunto, ' +
      'para que quede ligado a esta inspección.</p>' +
      '</div>';
    MailApp.sendEmail({ to: correo, cc: cc.join(','), subject: asunto, htmlBody: cuerpo });
    SheetUtils.update(ssId(), HOJA, id, { 'ULTIMO RECORDATORIO': new Date() }, 'ID');
    CacheHojas.tocarHoja(hoja);
    return { enviado: true, correo: correo, cc: cc };
  }

  /**
   * Vincula a mano un pendiente SIN CARGAR con un ticket que Kike ya vio ella misma en Help
   * Desk, para cuando revisarCargaHelpdesk() no lo encontró solo (texto irreconocible, o un
   * pendiente hermano de la misma inspección que ganó el desempate). Mismo resultado que un
   * match automático: CARGADO EN HELPDESK, con el número real y su estatus de allá -- pero el
   * ticket tiene que estar YA en la copia sincronizada (no se inventa, y esta app no escribe en
   * Help Desk): si no está, hay que abrir esa pantalla primero para que se sincronice.
   * @return {{vinculado: true, idTicketHelpdesk, estatusHelpdesk: string}}
   */
  function vincularManual(token, id, idTicketHelpdesk) {
    Permisos.puedeEditar(token, MODULO);
    const hoja = hoja_(false);
    const encontrado = hoja && SheetUtils.findById(ssId(), HOJA, id, 'ID');
    if (!encontrado) throw new Error('No se encontró ese pendiente.');
    if (normalizar_(encontrado.data['ESTATUS']) !== ESTATUS_SIN_CARGAR) {
      throw new Error('Ese pendiente ya está cargado en Help Desk.');
    }
    const idBuscado = limpiar_(idTicketHelpdesk);
    if (!idBuscado) throw new Error('Escribe el número de ticket de Help Desk.');
    const tickets = typeof HelpdeskService !== 'undefined' ? HelpdeskService.copiaLocal_() : [];
    const ticket = tickets.find((t) => String(t['ID TICKET HD']) === idBuscado);
    if (!ticket) {
      throw new Error('Ese ticket no está en la copia sincronizada de Help Desk todavía: abre esa pantalla ' +
        'para traerlo y vuelve a intentar.');
    }
    const estatusHelpdesk = limpiar_(ticket['ESTATUS']);
    SheetUtils.update(ssId(), HOJA, id, {
      'ESTATUS': ESTATUS_CARGADO,
      'ID TICKET HELPDESK': ticket['ID TICKET HD'],
      'ESTATUS HELPDESK': estatusHelpdesk,
      'FECHA CARGADO': new Date(),
    }, 'ID');
    CacheHojas.tocarHoja(hoja);
    return { vinculado: true, idTicketHelpdesk: ticket['ID TICKET HD'], estatusHelpdesk: estatusHelpdesk };
  }

  return {
    agregar, revisarCargaHelpdesk, listar, enviarRecordatorio, vincularManual,
    ENCABEZADOS, HOJA, ESTATUS_SIN_CARGAR, ESTATUS_CARGADO,
  };
})();
