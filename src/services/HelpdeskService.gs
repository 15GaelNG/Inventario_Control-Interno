/**
 * HelpdeskService.gs
 * Lo NUESTRO de Help Desk: la copia de sus tickets en la hoja APP_HELPDESK y el registro de un
 * ticket en nuestra bitácora de Tickets. Lo que habla con el helpdesk vive en HelpdeskApi.gs.
 *
 * La copia se llena sola (decisión del 05/10/2026): cada vez que HelpdeskApi trae datos FRESCOS
 * del helpdesk (la lista o un detalle), se guardan aquí. No hace llamadas al helpdesk: usa lo que
 * ya llegó. Escribe solo lo que cambió, y si otra persona tiene el candado se salta esa vez (la
 * siguiente consulta lo pone al día). La conversación NO se copia: solo la ficha del ticket.
 *
 * La hoja la crea este archivo la primera vez que hace falta (no hay que correr nada a mano), y
 * si un día se agrega una columna a ENCABEZADOS, se agrega sola al final de la hoja.
 */

const HelpdeskService = (function () {
  const HOJA = 'APP_HELPDESK';
  const COL_HD = 'ID TICKET HD';
  const COL_CI = 'ID TICKET CI';
  const ENCABEZADOS = [
    'ID', COL_HD, 'TITULO', 'DESCRIPCION', 'ESTATUS', 'PRIORIDAD', 'FORMULARIO', 'GRUPO', 'SOLICITANTE',
    'CORREO SOLICITANTE', 'AREA SOLICITANTE', 'DEPARTAMENTO SOLICITANTE', 'AGENTE', 'AREA DESTINO',
    'FECHA CREACION', 'FECHA CIERRE', COL_CI, 'VISTO PRIMERO', 'ACTUALIZADO', 'ACTUALIZADO POR',
  ];
  // Las que vienen del helpdesk: si alguna cambia, el renglón se actualiza
  const DEL_HELPDESK = ENCABEZADOS.slice(1, 16);
  const MAX_DESCRIPCION = 5000;   // una celda aguanta 50,000; esto es una ficha, no un archivo

  const libro_ = () => Config.SPREADSHEET_IDS.VEHICULOS();

  /** La hoja (o null si todavía no existe y no se pide crearla), con todas las ENCABEZADOS */
  function hoja_(crear) {
    const ss = SpreadsheetApp.openById(libro_());
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

  /** Un ticket ya en nuestro formato (HelpdeskApi.normalizar_) → las columnas de la hoja */
  function columnasDe_(t) {
    const fecha = (iso) => (iso ? HojaServicio.fechaDeEntrada(iso) : '');
    return {
      [COL_HD]: t.ID,
      'TITULO': t.TITULO || '',
      'DESCRIPCION': String(t.DESCRIPCION || '').slice(0, MAX_DESCRIPCION),
      'ESTATUS': t.ESTATUS || '',
      'PRIORIDAD': t.PRIORIDAD || '',
      'FORMULARIO': t.FORMULARIO || '',
      'GRUPO': t.GRUPO || '',
      'SOLICITANTE': t.SOLICITANTE || '',
      'CORREO SOLICITANTE': t.CORREO_SOLICITANTE || '',
      'AREA SOLICITANTE': t.AREA_SOLICITANTE || '',
      'DEPARTAMENTO SOLICITANTE': t.DEPARTAMENTO_SOLICITANTE || '',
      'AGENTE': t.AGENTE || '',
      'AREA DESTINO': t.AREA_DESTINO || '',
      'FECHA CREACION': fecha(t.FECHA_CREACION),
      'FECHA CIERRE': fecha(t.FECHA_CIERRE),
    };
  }

  /** Para comparar lo de la hoja con lo que llegó sin falsos cambios (fechas, números) */
  const comoTexto_ = (v) => (v instanceof Date ? (isNaN(v.getTime()) ? '' : v.toISOString()) : String(v === null || v === undefined ? '' : v).trim());

  /**
   * Guarda o actualiza en APP_HELPDESK los tickets que acaban de llegar del helpdesk.
   * Solo escribe lo nuevo y lo que cambió. Regresa { nuevos, actualizados } o { saltado: true }.
   * La llama HelpdeskApi; nunca truena hacia afuera (una copia que falla no debe tumbar la pantalla).
   * parcial: los tickets vienen de una lista que no trae todos los campos (la del inicio del
   * helpdesk): un campo vacío ahí es "no vino", no "se borró", así que no toca lo guardado.
   */
  function sincronizar_(tickets, correo, parcial) {
    const lista = (tickets || []).filter((t) => t && t.ID);
    if (!lista.length) return { nuevos: 0, actualizados: 0 };
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(5000)) return { saltado: true };
    try {
      const hoja = hoja_(true);
      const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0].map((h) => String(h).trim());
      const pos = SheetUtils.indiceDeColumnas(enc, ENCABEZADOS);
      const ultima = hoja.getLastRow();
      const filas = ultima > 1 ? hoja.getRange(2, 1, ultima - 1, enc.length).getValues() : [];
      const renglonDe = {};
      filas.forEach((f, i) => { const hd = comoTexto_(f[pos[COL_HD]]); if (hd) renglonDe[hd] = i; });

      const ahora = new Date();
      const nuevos = [];
      let actualizados = 0;
      lista.forEach((t) => {
        const datos = columnasDe_(t);
        const clave = comoTexto_(t.ID);
        const i = renglonDe[clave];
        if (i === undefined) {
          const fila = enc.map(() => '');
          Object.keys(datos).forEach((c) => { fila[pos[c]] = datos[c]; });
          fila[pos['ID']] = Ids.nuevo(Entidades.prefijo(HOJA));
          fila[pos['VISTO PRIMERO']] = ahora;
          fila[pos['ACTUALIZADO']] = ahora;
          fila[pos['ACTUALIZADO POR']] = correo || '';
          nuevos.push(fila);
          renglonDe[clave] = 'nuevo';   // el mismo ticket dos veces en una lista no se duplica
          return;
        }
        if (i === 'nuevo') return;
        const fila = filas[i];
        const columnas = parcial ? DEL_HELPDESK.filter((c) => comoTexto_(datos[c]) !== '') : DEL_HELPDESK;
        const cambio = columnas.some((c) => comoTexto_(fila[pos[c]]) !== comoTexto_(datos[c]));
        if (!cambio) return;
        columnas.forEach((c) => { fila[pos[c]] = datos[c]; });
        fila[pos['ACTUALIZADO']] = ahora;
        fila[pos['ACTUALIZADO POR']] = correo || '';
        hoja.getRange(i + 2, 1, 1, enc.length).setValues([fila]);
        actualizados++;
      });
      if (nuevos.length) hoja.getRange(ultima + 1, 1, nuevos.length, enc.length).setValues(nuevos);
      if (nuevos.length || actualizados) CacheHojas.tocarHoja(hoja);
      return { nuevos: nuevos.length, actualizados: actualizados };
    } finally {
      lock.releaseLock();
    }
  }

  /** La hoja, para HojaServicio: la copia la ve quien puede leer Tickets */
  const HELPDESK = {
    modulo: 'tickets',
    nombre: 'el ticket del helpdesk',
    libro: libro_,
    hoja: HOJA,
    orden: { campo: 'FECHA CREACION', desc: true },
  };

  /** Los tickets guardados (pestaña "Guardados"). Vacío si la hoja todavía no existe. */
  function listarGuardados(token) {
    Permisos.puedeLeer(token, 'tickets');
    if (!hoja_(false)) return [];
    return HojaServicio.listar(HELPDESK, token);
  }

  /**
   * Registra un ticket del helpdesk en nuestra bitácora de Tickets (quien puede editar Tickets).
   * `datos` son los campos del formulario de Tickets ya prellenados por la pantalla; TICKET es
   * siempre el número del helpdesk. No se registra dos veces: ni si la copia ya tiene su
   * ID TICKET CI, ni si en TICKETS ya hay uno con ese número.
   */
  function registrarEnTickets(token, idTicketHd, datos) {
    Permisos.puedeEditar(token, 'tickets');
    const id = Number(idTicketHd);
    if (!Number.isInteger(id) || id <= 0) throw new Error('Ticket inválido.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const hoja = hoja_(false);
      const enCopia = hoja ? SheetUtils.findById(libro_(), HOJA, String(id), COL_HD) : null;
      if (!enCopia) throw new Error('Abre el ticket en Help Desk primero, para tener sus datos.');
      if (comoTexto_(enCopia.data[COL_CI])) throw new Error('Este ticket ya está registrado en Tickets (' + enCopia.data[COL_CI] + ').');
      const yaEnTickets = SheetUtils.findById(libro_(), 'TICKETS', String(id), 'TICKET');
      if (yaEnTickets) {
        SheetUtils.update(libro_(), HOJA, enCopia.data['ID'], { [COL_CI]: yaEnTickets.data['ID'] }, 'ID');
        throw new Error('En Tickets ya hay un registro con el ticket ' + id + ' (' + yaEnTickets.data['ID'] + '). Se ligó a ese.');
      }
      const registro = TicketsService.crear(token, Object.assign({}, datos || {}, { TICKET: String(id) }));
      SheetUtils.update(libro_(), HOJA, enCopia.data['ID'], { [COL_CI]: registro.ID }, 'ID');
      return { ID: registro.ID, ID_TICKET_HD: id };
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Para la pantalla (la etiqueta "En Tickets" / "Falta registrar" y la bandeja "Por registrar"):
   * cuáles de estos tickets del helpdesk ya están en Tickets → { idHelpdesk: idTicketCI }.
   * Cuenta lo registrado desde aquí (ID TICKET CI de la copia) y lo capturado a mano: la columna
   * TICKET de Tickets es el folio del helpdesk (revisado el 07/10/2026 en sus 2,109 registros).
   * Sale de la lista de Tickets que ya está en caché (HojaServicio + Calentador): no lee la hoja.
   * Lo pide quien lee Tickets, igual que la lista de donde sale.
   */
  function registrados(token, idsHd) {
    const enTickets = TicketsService.listarResumen(token);
    if (!Array.isArray(idsHd) || !idsHd.length) return {};
    const buscados = new Set(idsHd.slice(0, 200).map((x) => String(Number(x))));
    const r = {};
    // A mano a veces va más de un folio o con texto ("61800 Y 61801", "#61800"): cuenta cada número
    enTickets.forEach((t) => {
      (String(t['TICKET'] || '').match(/\d{3,}/g) || []).forEach((n) => {
        const hd = String(Number(n));
        if (buscados.has(hd) && !r[hd]) r[hd] = t['ID'];
      });
    });
    const hoja = hoja_(false);
    if (hoja) {
      const { filas, datos } = SheetUtils.leerColumnas(hoja, [COL_HD, COL_CI]);
      for (let i = 0; i < filas; i++) {
        const hd = comoTexto_(datos[COL_HD][i]);
        const ci = comoTexto_(datos[COL_CI][i]);
        if (ci && buscados.has(hd)) r[hd] = ci;
      }
    }
    return r;
  }

  /**
   * A qué módulo NUESTRO corresponde cada formulario del helpdesk (idForm → id de Modulos.gs), para
   * enseñarlo en Formularios y ligar un ticket con su registro. PROPUESTA del 07/10/2026 a partir
   * de los nombres y campos del catálogo: revisarla con el área. Los que no están (Análisis de
   * Datos, Auditoría, Procesos, CXP, CH…) no tienen módulo en la app.
   * Los de 'tickets' son los que se registran en la bitácora de Tickets (la etiqueta "Falta
   * registrar" y la bandeja "Por registrar" salen de aquí): combustible y NIP, y también Holograma
   * (149) y Uber (288), porque en los registros reales de Tickets ahí es donde se anotan.
   */
  const MODULO_POR_FORMULARIO = {
    101: 'caja-chica', 102: 'caja-chica', 103: 'caja-chica', 109: 'caja-chica', 306: 'caja-chica',
    148: 'instalacion-sensores',
    241: 'vehiculos', 294: 'vehiculos',
    281: 'lineas-telefonicas', 283: 'lineas-telefonicas', 284: 'lineas-telefonicas', 286: 'lineas-telefonicas',
    282: 'accesorios-lineas',
    285: 'incidencias', 289: 'incidencias',
    287: 'inspeccion-vehicular',
    149: 'tickets', 288: 'tickets', 290: 'tickets', 291: 'tickets', 292: 'tickets', 293: 'tickets', 317: 'tickets',
  };

  /** Los formularios de nuestro grupo (HelpdeskFormularios.gs, del Excel) con su módulo. Todos con sesión. */
  function catalogo(token) {
    Auth.validarSesion(token);
    return HELPDESK_FORMULARIOS.map((f) => {
      const modulo = MODULO_POR_FORMULARIO[f.id] || '';
      return Object.assign({}, f, { modulo: modulo, moduloEtiqueta: modulo ? Modulos.etiqueta(modulo) : '' });
    });
  }

  return { sincronizar_, listarGuardados, registrarEnTickets, registrados, catalogo, ENCABEZADOS, MODULO_POR_FORMULARIO };
})();
