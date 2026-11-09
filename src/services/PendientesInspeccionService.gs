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
 *     contiene el ASUNTO completo tal cual se escribió (con su ID de inspección), lo marca
 *     "CARGADO EN HELPDESK" con el número real del ticket. Nunca llama al Help Desk ella misma:
 *     solo lee lo que YA se sincronizó la última vez que alguien abrió esa pantalla (ver la nota
 *     de credenciales ahí).
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
    'FECHA CARGADO', 'ULTIMO RECORDATORIO', 'CORREO RESPONSABLE', 'CORREOS CC', 'ASUNTO AVISO ORIGINAL',
    'NOMBRE INSPECTOR', 'CORREO INSPECTOR',
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

  /** Solo para leer: null si la hoja todavía no existe (nadie ha agregado un pendiente todavía).
   *  Nunca crea ni corrige columnas -- eso es trabajo de SheetUtils.asegurarPestana, y solo
   *  agregar() (la única que escribe de verdad) lo necesita. */
  function existeHoja_() {
    return SpreadsheetApp.openById(ssId()).getSheetByName(HOJA);
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
   * @param {string} [asuntoAviso] el ASUNTO exacto del correo de aviso original
   *   (InspeccionesService.asuntoAviso_) -- enviarRecordatorio lo reutiliza con un "Re:" al
   *   frente para que el recordatorio quede en la MISMA conversación de correo que el aviso
   * @param {string} [correoInspector] el correo de quien capturó la inspección (sesion.correo en
   *   InspeccionesService.registrar) -- enviarRecordatorio lo usa como replyTo, igual que el
   *   aviso original, para que la respuesta le llegue a él y no a quien desplegó la app
   * @return {Array} los pendientes creados (mismas columnas que la hoja), para el correo
   */
  function agregar(filaInspeccion, idInspeccion, items, correoResponsable, correosCc, asuntoAviso, correoInspector) {
    const limpios = (items || [])
      .map((it) => ({
        asunto: limpiar_(it && it.asunto),
        familia: limpiar_(it && it.familia),
        prioridad: /^URGENTE$/i.test(limpiar_(it && it.prioridad)) ? 'URGENTE' : 'NO URGENTE',
      }))
      .filter((it) => it.asunto);
    if (!limpios.length) return [];

    SheetUtils.asegurarPestana(ssId(), HOJA, ENCABEZADOS);
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
        'ASUNTO AVISO ORIGINAL': limpiar_(asuntoAviso),
        'NOMBRE INSPECTOR': limpiar_(filaInspeccion['NOMBRE INSPECTOR']),
        'CORREO INSPECTOR': limpiar_(correoInspector),
      };
      SheetUtils.insert(ssId(), HOJA, fila);
      return fila;
    });
    return creados;
  }

  /**
   * Compara los pendientes SIN CARGAR contra lo que ya se sincronizó de Help Desk (APP_HELPDESK,
   * HelpdeskService.gs): si el título o la descripción de algún ticket contienen el ASUNTO
   * completo tal cual se escribió (con el ID de inspección que se le antepuso en agregar()), ese
   * pendiente queda CARGADO EN HELPDESK con el número real del ticket. De paso, a los que YA
   * estaban CARGADO les refresca ESTATUS HELPDESK (Abierto/Resuelto/Cerrado…, lo que diga Help
   * Desk hoy) -- es OTRO estatus, el de nuestro propio seguimiento (ESTATUS: si ya se encontró
   * el ticket o no) nunca se le pisa ni se le confunde una vez que ya es CARGADO.
   *
   * Si el texto no coincide tal cual (el responsable lo editó al pegarlo en Help Desk, o
   * Help Desk aún no se ha sincronizado), esta función simplemente no lo encuentra -- para esos
   * casos está vincularManual(), que Kike dispara a mano desde su vista con el número de ticket
   * que ya vio ella misma (y que, a diferencia de ésta, sí puede ir a traerlo en vivo).
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
    if (!existeHoja_()) return { revisados: 0, encontrados: 0 };
    const filas = SheetUtils.getAll(ssId(), HOJA);
    const pendientes = filas.filter((f) => normalizar_(f['ESTATUS']) === ESTATUS_SIN_CARGAR);
    const cargados = filas.filter((f) => normalizar_(f['ESTATUS']) !== ESTATUS_SIN_CARGAR && f['ID TICKET HELPDESK']);
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

    // Una sola lectura + una sola escritura para TODOS los renglones que cambien (SheetUtils.updateMany,
    // bajo su propio candado), en vez de un setValue por celda como antes.
    const ahora = new Date();
    const updates = [];
    let encontrados = 0;
    pendientes.forEach((f) => {
      const asunto = normalizar_(f['ASUNTO']);
      if (!asunto) return;
      const match = textosDeTicket.find((t) => t.texto.indexOf(asunto) !== -1);
      if (!match) return;
      updates.push({
        id: f['ID'],
        changes: {
          'ESTATUS': ESTATUS_CARGADO, 'ID TICKET HELPDESK': match.idTicket,
          'ESTATUS HELPDESK': match.estatus, 'FECHA CARGADO': ahora,
        },
      });
      encontrados++;
    });
    cargados.forEach((f) => {
      const ticket = porIdTicket[String(f['ID TICKET HELPDESK'])];
      if (!ticket || ticket.estatus === limpiar_(f['ESTATUS HELPDESK'])) return;
      updates.push({ id: f['ID'], changes: { 'ESTATUS HELPDESK': ticket.estatus } });
    });
    if (updates.length) SheetUtils.updateMany(ssId(), HOJA, updates, 'ID');
    return { revisados: pendientes.length, encontrados: encontrados };
  }

  /**
   * La vista de Kike (punto C): todos los pendientes, con lo que hace falta para priorizar
   * (prioridad, estatus, cuánto llevan) y decidir a quién recordarle. Vacío si todavía no hay
   * ninguno. Mismo permiso que el resto del módulo: no es una sección aparte.
   */
  function listar(token) {
    Permisos.puedeLeer(token, MODULO);
    if (!existeHoja_()) return [];
    return SheetUtils.getAll(ssId(), HOJA).map((r) => Object.assign({}, r, {
      FECHA: HojaServicio.fechaISO(r['FECHA']),
      'FECHA CARGADO': HojaServicio.fechaISO(r['FECHA CARGADO']),
      'ULTIMO RECORDATORIO': HojaServicio.fechaISO(r['ULTIMO RECORDATORIO']),
    }));
  }

  /**
   * Le manda al responsable un recordatorio de un pendiente que sigue SIN CARGAR -- Kike lo
   * dispara a mano desde su vista. Si esa MISMA inspección tiene otros pendientes que también
   * sigan SIN CARGAR, se incluyen todos en el mismo correo (pedido de Jorge, 3-nov-2026): el
   * responsable no tiene por qué recibir uno por cada observación de una sola visita. Va al
   * MISMO correo que recibió el aviso original de esa inspección (CORREO RESPONSABLE, guardado
   * por agregar()); si ese pendiente es de antes de que existiera esa columna (o nunca se
   * capturó un correo válido), se busca por su nombre en Capital Humano, como antes. También va
   * en cc a los demás que ya habían recibido ese mismo aviso original (CORREOS CC: inspector,
   * asistente, otros) -- si el correo del responsable se tuvo que buscar en Capital Humano, no
   * hay cc porque no hay forma de saber quiénes eran. Quien inspeccionó SIEMPRE va en cc, de
   * primera mano (CORREO INSPECTOR, su correo real al capturar -- no el que se haya tecleado a
   * mano en "Notificar"), con o sin CORREOS CC; además queda como replyTo.
   * @return {{enviado: true, correo: string, cc: Array<string>, incluidos: Array<string>}}
   */
  function enviarRecordatorio(token, id) {
    Permisos.puedeEditar(token, MODULO);
    const encontrado = existeHoja_() && SheetUtils.findById(ssId(), HOJA, id, 'ID');
    if (!encontrado) throw new Error('No se encontró ese pendiente.');
    const fila = encontrado.data;
    if (normalizar_(fila['ESTATUS']) !== ESTATUS_SIN_CARGAR) {
      throw new Error('Ese pendiente ya está cargado en Help Desk: no hace falta recordarlo.');
    }
    // Hermanos: los demás pendientes de la MISMA inspección que también sigan sin cargar
    // (comparten correo/cc/asunto de aviso porque nacieron juntos en el mismo agregar()).
    const hermanos = SheetUtils.getAll(ssId(), HOJA)
      .filter((r) => r['ID INSPECCION'] === fila['ID INSPECCION'] && normalizar_(r['ESTATUS']) === ESTATUS_SIN_CARGAR);
    const pendientes = hermanos.length ? hermanos : [fila];

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
    // Quien inspeccionó va en cc siempre, de primera mano -- no solo como replyTo (más abajo):
    // CORREOS CC viene de lo que el inspector tecleó a mano en "Notificar" (puede traer un correo
    // distinto, o quedar vacío), CORREO INSPECTOR es el de su sesión real al capturar, confiable.
    const correoInspector = limpiar_(fila['CORREO INSPECTOR']);
    if (correoInspector && correoInspector.toLowerCase() !== correo.toLowerCase() &&
      !cc.some((c) => c.toLowerCase() === correoInspector.toLowerCase())) {
      cc.push(correoInspector);
    }
    // Mismo asunto que el correo de aviso original, con "Re:" al frente: así Gmail agrupa el
    // recordatorio en la MISMA conversación en vez de abrir un hilo nuevo (pedido de Jorge,
    // 3-nov-2026). Un pendiente de antes de este campo (o si en su momento no se pudo calcular
    // el asunto del aviso) cae al título genérico de siempre.
    const asuntoOriginal = limpiar_(fila['ASUNTO AVISO ORIGINAL']);
    const asunto = asuntoOriginal ? 'Re: ' + asuntoOriginal : 'Recordatorio: pendiente de subir Ticket a Help Desk por inspección.';
    const unidad = fila['VEHICULO']
      ? ' (<b>' + escaparHtml_(fila['VEHICULO']) + ' · ' + escaparHtml_(fila['PLACAS'] || 'SIN PLACA') + '</b>)'
      : '';
    const tarjetas = pendientes.map((p) =>
      '<div style="margin:0 0 10px;padding:8px 10px;background:#fff4e5;border:1px solid #f0b429;border-radius:6px">' +
      '<div style="margin:0 0 3px"><span style="color:#92400e">Asunto:</span> <code>' + escaparHtml_(p['ASUNTO']) + '</code></div>' +
      '<div style="margin:0 0 3px"><span style="color:#92400e">Familia o grupo a reportar:</span> ' +
        escaparHtml_(p['FAMILIA O GRUPO A REPORTAR']) + '</div>' +
      '<div><span style="color:#92400e">Prioridad:</span> <b>' + escaparHtml_(p['PRIORIDAD']) + '</b></div>' +
      '</div>').join('');
    const cuerpo = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">' +
      '<p style="margin:0 0 10px">Hola:</p>' +
      '<p style="margin:0 0 10px">Te recordamos que continúa pendiente subir a Help Desk lo identificado durante ' +
      'la inspección de tu unidad' + unidad + '.</p>' +
      '<p style="margin:0 0 6px"><b>Esto es lo que falta subir a Help Desk:</b></p>' +
      tarjetas +
      '<p style="margin:0 0 10px">Por favor, genera cada ticket en Help Desk utilizando EXACTAMENTE el texto de ' +
      '«Asunto» indicado arriba, ya que esto permitirá que el sistema lo vincule automáticamente con la ' +
      'inspección correspondiente.</p>' +
      '<p style="margin:0 0 10px">Si ya generaste alguno de estos tickets, te pedimos responder a este correo ' +
      'compartiendo el número de folio asignado en Help Desk, ya que en caso de que no hayas utilizado el folio ' +
      'de inspección en el asunto, será necesario realizar la vinculación manualmente.</p>' +
      '<p style="margin:0 0 10px">Recordemos que el cuidado y mantenimiento de las unidades es responsabilidad de ' +
      'todos. Atender oportunamente estas observaciones nos permite garantizar su correcto funcionamiento y ' +
      'contribuir al aprovechamiento adecuado de los recursos de la empresa.</p>' +
      '<p style="margin:0 0 10px">Agradecemos tu apoyo y atención para dar seguimiento a lo anterior.</p>' +
      '<p style="margin-top:16px">¡Saludos! 🙌</p>' +
      '</div>';
    // La app manda desde la cuenta de quien la desplegó (executeAs: USER_DEPLOYING); name/replyTo
    // no cambian eso, pero el responsable ve el nombre del inspector y, si responde, le llega a
    // él directo -- mismo criterio que el correo de aviso original (InspeccionesService.avisarInspeccion_).
    const opciones = { to: correo, cc: cc.join(','), subject: asunto, htmlBody: cuerpo };
    if (limpiar_(fila['NOMBRE INSPECTOR'])) opciones.name = fila['NOMBRE INSPECTOR'];
    if (limpiar_(fila['CORREO INSPECTOR'])) opciones.replyTo = fila['CORREO INSPECTOR'];
    MailApp.sendEmail(opciones);
    const ahora = new Date();
    pendientes.forEach((p) => SheetUtils.update(ssId(), HOJA, p['ID'], { 'ULTIMO RECORDATORIO': ahora }, 'ID'));
    return { enviado: true, correo: correo, cc: cc, incluidos: pendientes.map((p) => p['ID']) };
  }

  /**
   * Vincula a mano un pendiente SIN CARGAR con un ticket que Kike ya vio ella misma en Help
   * Desk, para cuando revisarCargaHelpdesk() no lo encontró solo (texto irreconocible, o un
   * pendiente hermano de la misma inspección que ganó el desempate). Mismo resultado que un
   * match automático: CARGADO EN HELPDESK, con el número real y su estatus de allá.
   *
   * Si ese ticket todavía no está en la copia sincronizada (nadie ha abierto la Bandeja con ese
   * folio reciente), se intenta traer EN VIVO (HelpdeskApi.detalle) con el token de HELPDESK de
   * quien está vinculando (el mismo `token` de su sesión aquí) -- de paso lo sincroniza a
   * APP_HELPDESK, como si lo hubiera visto en la Bandeja. Si esa persona no tiene su cuenta de
   * Help Desk conectada, HelpdeskApi avisa claro ("Conecta tu cuenta del helpdesk primero.");
   * esta app sigue sin escribir nada allá (solo lee).
   * @return {{vinculado: true, idTicketHelpdesk, estatusHelpdesk: string}}
   */
  function vincularManual(token, id, idTicketHelpdesk) {
    Permisos.puedeEditar(token, MODULO);
    const encontrado = existeHoja_() && SheetUtils.findById(ssId(), HOJA, id, 'ID');
    if (!encontrado) throw new Error('No se encontró ese pendiente.');
    if (normalizar_(encontrado.data['ESTATUS']) !== ESTATUS_SIN_CARGAR) {
      throw new Error('Ese pendiente ya está cargado en Help Desk.');
    }
    const idBuscado = limpiar_(idTicketHelpdesk);
    if (!idBuscado) throw new Error('Escribe el número de ticket de Help Desk.');
    const buscar_ = () => (typeof HelpdeskService !== 'undefined' ? HelpdeskService.copiaLocal_() : [])
      .find((t) => String(t['ID TICKET HD']) === idBuscado);
    let ticket = buscar_();
    if (!ticket && typeof HelpdeskApi !== 'undefined') {
      HelpdeskApi.detalle(token, idBuscado);
      ticket = buscar_();
    }
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
    return { vinculado: true, idTicketHelpdesk: ticket['ID TICKET HD'], estatusHelpdesk: estatusHelpdesk };
  }

  return {
    agregar, revisarCargaHelpdesk, listar, enviarRecordatorio, vincularManual,
    ENCABEZADOS, HOJA, ESTATUS_SIN_CARGAR, ESTATUS_CARGADO,
  };
})();
