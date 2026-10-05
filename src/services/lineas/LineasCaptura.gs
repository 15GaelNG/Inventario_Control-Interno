/**
 * LineasCaptura.gs
 * Captura de INSPECCIONES LINEAS y RESPONSIVAS LINEAS, réplica del AppSheet (v1.001924).
 *
 * El servidor arma cada formulario como lista ordenada de elementos (mismo orden que
 * INSPECCIONES LINEAS_Form / RESPONSIVAS LINEAS_Form), con valores iniciales calculados
 * como los "Initial value" del AppSheet a partir de la fila de LINEAS TELEFONICAS, y con
 * los Show_If / Required_If / Valid_If como códigos (LineasChecklist.CONDICIONES).
 *
 * Al guardar se replica lo que hacen los bots del AppSheet:
 *   - Inspección  → fila en INSPECCIONES LINEAS (CALIFICACION con la fórmula del AppSheet) y
 *                   bot ACTUALIZAR DESDE INSPECCION: copia 13 campos a LINEAS TELEFONICAS
 *                   (con su bitácora en CAMBIOS LINEAS TELEFONICAS / HISTORIAL_REASIGNACIONES), y el COLOR.
 *   - Responsiva  → fila en RESPONSIVAS LINEAS; bot MAYUSCULAS (IDENTIFICACION, OBSERVACIONES).
 *                   Del registro solo toca el COLOR del equipo (decisión del usuario, 3-oct).
 *   - Ambos       → PDF con las plantillas del AppSheet, después de guardar (generarPdf).
 * PDF en NUCOS (desde el corte a producción, 2-oct-2026), igual que los que sube el área a mano:
 *   <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/INSP <NUCO> DD MM.pdf   (junto a su FOTOS)
 *   <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/RESP <NUCO> DD MM.pdf
 * La columna File de la hoja guarda el enlace de Drive del PDF. Un registro sin NUCO sigue con las rutas del
 * AppSheet en la carpeta de la app: INSPECCIONES_Files_/INSPECCION - <ID>.pdf y Files/RESPONSIVA<ID>.pdf.
 * Las firmas NO se guardan como archivos (acuerdo del 18-sep): viajan en memoria para el PDF y las columnas
 * FIRMA quedan vacías. En AppSheet eran imágenes en <TABLA>_Images.
 * Del sistema nuevo se conservan: fotos opcionales de la inspección (INSPECCIONES LINEAS_Images/FOTOS <ID>),
 * APP_EVIDENCIAS y APP_MOVIMIENTOS (pestañas propias, no las lee AppSheet).
 */

const LineasCaptura = (function () {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ZONA = 'America/Mexico_City';

  // Rutas del AppSheet para los PDF (acciones GUARDAR de sus bots)
  const PDF = {
    INSPECCION: { carpeta: 'INSPECCIONES_Files_', nombre: (id) => 'INSPECCION - ' + id + '.pdf', columna: 'FORMATO INSPECCIONES LINEAS' },
    RESPONSIVA: { carpeta: 'Files', nombre: (id) => 'RESPONSIVA' + id + '.pdf', columna: 'FORMATO RESPONSIVA' },
  };
  function blobBase64_(base64, nombre) {
    return base64 ? Utilities.newBlob(Utilities.base64Decode(String(base64)), 'image/png', nombre || 'firma.png') : null;
  }

  function firmasCache_(tipo, id, nuevas) {
    const clave = 'firmas_' + tipo + '_' + id;
    const serializadas = nuevas ? JSON.stringify(nuevas) : null;
    if (serializadas) {
      try { CacheService.getScriptCache().put(clave, serializadas, 21600); } catch (e) { console.warn('No se pudieron conservar temporalmente las firmas: ' + e.message); }
    }
    const raw = serializadas || CacheService.getScriptCache().get(clave);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /** Registro objetivo a partir de { equipoId } o { lineaId } (línea suelta). */
  function objetivoCaptura_(ref) {
    const id = ref.equipoId || ref.lineaId;
    const fila = LineasRepo.leerRegistroObligatorio(id, ref.equipoId ? 'el equipo' : 'la línea');
    const reg = LineasRepo.convertirRegistro(fila);
    if (ref.equipoId && !reg.equipo) throw new Error('El registro no es un equipo.');
    if (!ref.equipoId && !reg.linea) throw new Error('No existe la línea.');
    if (!ref.equipoId && reg.equipo) throw new Error('La línea está en un equipo: captura desde el equipo.');
    return { fila: fila, reg: reg, equipo: reg.equipo, linea: reg.linea };
  }

  /** Valor de la fila de LINEAS TELEFONICAS como texto (para los "Initial value"). */
  function valorLinea_(fila, columna) {
    const v = LineasUtil.col(fila, columna);
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Utilities.formatDate(v, ZONA, 'dd/MM/yyyy');
    return String(v);
  }

  function resumenEquipo_(e) {
    return e ? { nuco: e.nuco || null, estatus: e.estatus || null, lineaId: e.lineaId || null, responsable: e.responsable ? e.responsable.nombre || null : null } : null;
  }
  function resumenLinea_(l) {
    return l ? { numero: l.numero || null, estatus: l.estatus || null, equipoId: l.equipoId || null } : null;
  }

  function detalleCambios_(guardados) {
    const d = { idsCambios: [], idsReasignacion: [], cambios: [] };
    guardados.forEach((g) => {
      Array.prototype.push.apply(d.idsCambios, g.idsCambios);
      if (g.idReasignacion) d.idsReasignacion.push(g.idReasignacion);
      Array.prototype.push.apply(d.cambios, g.campos.map((c) => Object.assign({ nuco: g.nuco || null }, c)));
    });
    return d;
  }

  // ======================================================================
  // Definición de los formularios (orden, etiquetas, condiciones del AppSheet)
  // ======================================================================
  // Elemento: { tipo: 'titulo', texto } o { tipo: 'campo', columna, etiqueta, control, requerido, mostrar,
  //   soloLectura, opciones, escala, valor }. control: texto | area | lista | escala | fechaHora |
  //   patron | firma | calculado.   requerido/mostrar: código de LineasChecklist.CONDICIONES.

  const titulo_ = (texto, icono) => ({ tipo: 'titulo', texto: texto, icono: icono || null });
  const campo_ = (columna, etiqueta, control, extra) => Object.assign({
    tipo: 'campo', columna: columna, etiqueta: etiqueta, control: control, requerido: 'NUNCA', mostrar: 'SIEMPRE', soloLectura: false,
  }, extra || {});

  /**
   * Etiquetas para quien captura la inspección (usuario, 3-oct: "más clara e intuitiva", la llenarán también los
   * colaboradores). Solo cambia lo que se lee en pantalla: la columna, lo que se guarda y el PDF siguen igual.
   */
  /** Quienes reciben los equipos que se mandan a resguardo (procesos; usuario, 4-oct). */
  const PERSONAS_PROCESOS = ['DAFNE DONIS GARCIA', 'GAMALIEL JAIR MORA GONZALEZ', 'YOVANNI NAVA PERALTA'];

  const ETIQUETAS_INSPECCION = {
    'IDENTIFICACION': 'Identificación', 'CUBO': 'Cubo (cargador)', 'CABLE': 'Cable', 'FUNDA': 'Funda', 'MICA': 'Mica',
    'SO': 'Sistema operativo', 'ACTUALIZACIONES': 'Actualizaciones', 'PANTALLA TACTIL': 'Pantalla táctil', 'MULTITAREA': 'Multitarea',
    'WIFI': 'Wi-Fi', 'RED MOVIL': 'Red móvil', 'GPS': 'GPS', 'USO DATOS': 'Uso de datos',
    'PANTALLA': 'Pantalla', 'BOTONES VOLUMEN': 'Botones de volumen', 'BOTON ENCENDIDO': 'Botón de encendido', 'CUERPO EQUIPO': 'Cuerpo del equipo',
    'CAMARA': 'Cámara', 'PUERTO CARGA': 'Puerto de carga', 'ALTAVOZ': 'Altavoz', 'BOCINAS': 'Bocinas', 'MICROFONO': 'Micrófono', 'LINEA DE VOZ': 'Línea de voz',
    'DURACION BATERIA': 'Duración de la batería', 'TEMPERATURA': 'Temperatura', 'DESEMPEÑO': 'Desempeño',
    'WHATSAPP': 'WhatsApp', 'E COMMERCE': 'Enlace a Windows', 'MOVILIDAD / DELIVERY': 'Uber', 'TIKTOK': 'Waze',
    'NETFLIX': 'Lector o escáner de documentos', 'MUSICA': 'Lector de código QR', 'GMAIL': 'Apps de Google (Gmail, Drive…)',
    'YOUTUBE': 'YouTube', 'JUEGOS': 'Timestamp', 'TIMEMARK': 'Timemark',
  };

  /**
   * INSPECCIONES LINEAS_Form. `catalogos` trae las listas de LISTAS TELEFONOS (Valid_If).
   * La pestaña Datos va en tres partes (usuario, 3-oct): el equipo y la línea vienen del registro y no se cambian (se
   * inspecciona el aparato del registro; cambiar aquí el IMEI o el NUCO solo cambiaba el documento, no el inventario);
   * el COLOR sí se captura, precargado con el del equipo; los datos del responsable se pueden cambiar, como antes.
   */
  function formularioInspeccion_(fila, catalogos, usuario, id, ahora, enAccion) {
    const v = (c) => valorLinea_(fila, c);
    // Dentro de Mandar a resguardo (enAccion), el responsable es quien recibe: empieza en blanco y solo se elige entre
    // las personas de procesos; lo demás se llena con Capital Humano (usuario, 4-oct)
    const persona = (c) => (enAccion ? '' : v(c));
    const tipo = v('TIPO').trim().toUpperCase();
    const esEquipo = tipo === 'EQUIPO';
    const req = { requerido: 'SIEMPRE' };
    const fijo = (extra) => Object.assign({ soloLectura: true }, extra);
    // Datos del responsable: listas de Capital Humano y, al elegir a la persona, se llenan con lo que dice CH. El jefe
    // directo solo va en la inspección (PLAN_REESTRUCTURA_LINEAS.md §3.3)
    const datosCH = { 'PUESTO': 'puesto', 'DEPARTAMENTO': 'departamento', 'AREA': 'area', 'SEDE': 'sede',
      'OFICINA / DESARROLLO': 'oficina', 'JEFE DIRECTO': 'jefe', 'CORREO': 'correo' };
    const elementos = [
      titulo_('EQUIPO', 'smartphone'),
      campo_('ID', 'ID', 'texto', { valor: id, soloLectura: true }),
      campo_('ID LINEA', 'ID LINEA', 'texto', { valor: v('IMEI') || v('ID'), soloLectura: true }),
      campo_('NUCO', 'NUCO', 'texto', fijo({ valor: LineasUtil.nucoVisible(v('NUCO')) || '' })),
      campo_('TIPO', 'Tipo', 'texto', fijo({ valor: v('TIPO'), controlaTipo: true })),
      campo_('MODELO', 'Modelo', 'texto', fijo({ valor: v('EQUIPO'), mostrar: 'NO_LINEA' })),
      campo_('IMEI', 'IMEI', 'texto', fijo({ valor: v('IMEI'), mostrar: 'NO_LINEA' })),
      campo_('COLOR', 'Color', 'listaAbierta', { valor: v('COLOR'), opciones: catalogos.colores || [], mostrar: 'NO_LINEA', requerido: 'NO_LINEA' }),
      titulo_('LÍNEA', 'card-sim'),
      campo_('No TELEFONO', 'Número', 'texto', fijo({ valor: v('NUMERO TELEFONO'), mostrar: 'NO_EQUIPO' })),
      campo_('SIM', 'SIM', 'texto', fijo({ valor: v('NUMERO SIM'), mostrar: 'NO_EQUIPO' })),
      campo_('COMPAÑIA', 'Compañía', 'texto', fijo({ valor: esEquipo ? '' : v('COMPAÑIA'), mostrar: 'NO_EQUIPO' })),
      campo_('PLAN', 'Plan', 'texto', fijo({ valor: esEquipo ? '' : v('COSTO PLAN'), mostrar: 'NO_EQUIPO' })),
      campo_('RAZON SOCIAL', 'Razón social', 'texto', fijo({ valor: v('RAZON SOCIAL'), mostrar: 'NO_EQUIPO' })),
      titulo_('RESPONSABLE', 'user'),
      // llenarVacios: al abrir, lo que falte de la persona se llena con Capital Humano (usuario, 4-oct: el jefe directo no salía)
      campo_('RESPONSABLE', 'Nombre', 'listaAbierta', Object.assign({ valor: persona('RESPONSABLE'), sugerencias: 'PERSONAS', autollenar: datosCH, llenarVacios: true },
        enAccion ? { opciones: PERSONAS_PROCESOS, soloLista: true } : {}, req)),
      campo_('PUESTO', 'Puesto', 'listaAbierta', Object.assign({ valor: persona('PUESTO'), opciones: catalogos.puestos || [], sugerencias: 'PUESTOS' }, req)),
      campo_('DEPARTAMENTO', 'Departamento', 'listaAbierta', Object.assign({ valor: persona('DEPARTAMENTO'), opciones: catalogos.departamentos || [] }, req)),
      campo_('AREA', 'Área', 'listaAbierta', Object.assign({ valor: persona('AREA'), opciones: catalogos.areas || [] }, req)),
      campo_('SEDE', 'Sede', 'listaAbierta', Object.assign({ valor: persona('SEDE'), opciones: catalogos.sedes || [] }, req)),
      campo_('OFICINA / DESARROLLO', 'Oficina o desarrollo', 'listaAbierta', Object.assign({ valor: persona('OFICINA / DESARROLLO'), opciones: catalogos.oficinas || [] }, req)),
      campo_('JEFE DIRECTO', 'Jefe directo', 'listaAbierta', Object.assign({ valor: persona('JEFE DIRECTO'), opciones: catalogos.jefes || [] }, req)),
      campo_('CORREO', 'Correo', 'texto', Object.assign({ valor: persona('CUENTA GOOGLE'), literal: true }, req)),
    ];
    const agregarSeccion = (nombre) => {
      const s = LineasChecklist.secciones().filter((x) => x.seccion === nombre)[0];
      elementos.push(titulo_(s.seccion));
      s.puntos.filter((p) => p.mostrar !== 'NUNCA').forEach((p) => elementos.push(campo_(p.columna, ETIQUETAS_INSPECCION[p.columna] || p.etiqueta, 'escala', {
        escala: p.escala, opciones: LineasChecklist.ESCALAS[p.escala].valores, mostrar: p.mostrar, requerido: p.requerido, valor: '', checklist: true,
      })));
    };
    ['DOCUMENTACIÓN / ACCESORIOS', 'SISTEMA', 'CONECTIVIDAD', 'ESTADO FÍSICO GENERAL', 'DESEMPEÑO'].forEach(agregarSeccion);
    elementos.push(
      titulo_('BLOQUEO Y CONTRASEÑAS'),
      // Mejora sobre el AppSheet: se precarga la de la línea (en AppSheet no tiene valor inicial y el bot,
      // al copiarla, borraba la contraseña guardada si el campo se dejaba vacío)
      campo_('CONTRASEÑA MODEM', 'Contraseña del módem', 'texto', { valor: v('CONTRASEÑA MODEM'), mostrar: 'MODEM', literal: true, secreto: true }),
      campo_('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', { valor: v('PIN WHATSAPP'), mostrar: 'VOZ', literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: v('PIN EQUIPO'), mostrar: 'EQUIPOS', literal: true, secreto: true }),
      campo_('PATRON', 'Patrón', 'patron', { valor: v('PATRON'), mostrar: 'EQUIPOS', secreto: true })
    );
    agregarSeccion('APPS INSTALADAS');
    elementos.push(
      // Texto libre, sin lista (usuario, 4-oct)
      campo_('OTRA', 'Otra app', 'texto', { valor: '', mostrar: 'EQUIPOS' }),
      // El paso de firmas en tres partes (usuario, 4-oct)
      titulo_('DATOS DE LA INSPECCIÓN', 'calendar-check'),
      campo_('CALIFICACION', 'Calificación', 'calculado', { valor: '', soloLectura: true }),
      campo_('FECHA DE REGISTRO', 'Fecha de la inspección', 'fechaHora', Object.assign({ valor: Utilities.formatDate(ahora, ZONA, "yyyy-MM-dd'T'HH:mm") }, req)),
      campo_('TICKET', 'Ticket', 'texto', { valor: '' }),
      // Un solo COMENTARIO (plan §5.2): se guarda en OBSERVACIONES (lo que imprime el PDF) y en el historial. Dentro de
      // una acción que ya pidió el suyo (mandar a resguardo) no es obligatorio (usuario, 4-oct)
      titulo_('COMENTARIO', 'message-square-text'),
      campo_('OBSERVACIONES', 'Comentario', 'area', { valor: '', requerido: enAccion ? 'NUNCA' : 'SIEMPRE' }),
      titulo_('FIRMAS', 'signature'),
      campo_('FIRMA RESPONSABLE', 'FIRMA RESPONSABLE', 'firma', { valor: '' }),
      campo_('NOMBRE INSPECTOR', 'NOMBRE INSPECTOR', 'texto', { valor: usuario.nombre || '', soloLectura: true }),
      campo_('FIRMA INSPECTOR', 'FIRMA INSPECTOR', 'firma', Object.assign({ valor: '' }, req))
    );
    return elementos;
  }

  /**
   * RESPONSIVAS LINEAS_Form (sin Show_If; TIPO CONTRASEÑA está oculta en el AppSheet).
   * Mejora (pedido del área, 29-sep): los datos del responsable y del equipo vienen de la línea, como en el AppSheet,
   * pero se pueden corregir antes de firmar, igual que en la inspección (listas y autollenado del colaborador). Lo
   * corregido queda en la responsiva y su PDF; LINEAS TELEFONICAS no cambia (la responsiva no tiene el bot de la
   * inspección). Solo ID, ID LINEA, NUCO, FECHA RESPONSIVA y NOMBRE CI siguen fijos.
   */
  /** Sugerencias de identificación en la responsiva (usuario, 4-oct: la lista traía números y textos sin sentido; se puede escribir otra). */
  const IDENTIFICACIONES = ['INE', 'LICENCIA DE CONDUCIR'];

  /**
   * RESPONSIVAS LINEAS_Form, ordenada como la inspección (usuario, 4-oct): Datos en Equipo, Línea y Responsable;
   * accesorios y accesos; y el paso de firmas en Datos de la responsiva, Observaciones y Firmas. Los datos del equipo y
   * la línea se pueden corregir antes de firmar (lo dijo el usuario: la reasignación llevará directo a la responsiva).
   * La fecha es una sola, como en la inspección; DIA, MES y AÑO (los que usa el PDF) se sacan de ella al guardar.
   * El jefe directo se guarda en la columna DIRECTOR (decisión del usuario, 4-oct; el PDF lo imprime ahí).
   */
  function formularioResponsiva_(fila, catalogos, usuario, id, ahora, modo) {
    // Reasignar (usuario, 4-oct): la responsiva es la acción; equipo y línea fijos, la persona nueva se elige aquí y
    // accesorios y accesos empiezan vacíos
    const reasignar = String(modo || '').toUpperCase() === 'REASIGNAR';
    const acceso = (c) => (reasignar ? '' : v(c));
    const v = (c) => valorLinea_(fila, c);
    const persona = (c) => (reasignar ? '' : v(c));
    const ro = (columna, etiqueta, valor) => campo_(columna, etiqueta, 'texto', { valor: valor, soloLectura: true });
    const ed = (columna, etiqueta, control, valor, extra) => campo_(columna, etiqueta, control, Object.assign({ valor: valor }, extra || {}));
    // La línea: editable (con sugerencias) en la responsiva suelta; fija al reasignar
    const deLinea = (columna, etiqueta, valor, extra) => (reasignar ? ro(columna, etiqueta, valor) : ed(columna, etiqueta, 'listaAbierta', valor, extra));
    // Accesorios: la lista única (D5.5) con "TARJETA SD" (usuario, 4-oct; "SD" de antes cuenta como la misma) y lo que
    // ya traiga el equipo fuera de la lista, para no perderlo
    const accesorios = String(acceso('ACCESORIOS') || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).map((x) => (x === 'SD' ? 'TARJETA SD' : x));
    // Al elegir a la persona (o al abrir, si falta algo) se llenan sus datos con lo que dice Capital Humano
    const datosCH = { 'PUESTO': 'puesto', 'DEPARTAMENTO': 'departamento', 'AREA': 'area', 'SEDE': 'sede',
      'OFICINA / DESARROLLO': 'oficina', 'DIRECTOR': 'jefe', 'CORREO': 'correo' };
    const autoResponsable = Object.assign({ 'No EMPLEADO': 'noEmpleado' }, datosCH);
    return [
      titulo_('EQUIPO', 'smartphone'),
      ro('ID', 'ID', id),
      ro('ID LINEA', 'ID LINEA', v('IMEI') || v('ID')),
      ro('NUCO', 'NUCO', LineasUtil.nucoVisible(v('NUCO')) || ''),
      // El equipo no se cambia en la responsiva (usuario, 4-oct): se guarda en su NUCO; un dato mal capturado se corrige
      // con Editar. El color sí, como en la inspección
      ro('MODELO', 'Modelo', v('EQUIPO')),
      ro('IMEI', 'IMEI', v('IMEI')),
      campo_('COLOR', 'Color', 'listaAbierta', { valor: v('COLOR'), requerido: 'SIEMPRE', opciones: catalogos.colores || [] }),
      titulo_('LÍNEA', 'card-sim'),
      // Sugerencias del inventario; al elegir un número (o un SIM) se llenan los demás datos de esa línea (usuario, 4-oct)
      deLinea('No TELEFONO', 'Número', v('NUMERO TELEFONO'), { sugerencias: 'NUMEROS', autollenar: { 'SIM': 'sim', 'COMPAÑIA': 'compania', 'RAZON SOCIAL': 'razonSocial' } }),
      deLinea('SIM', 'SIM', v('NUMERO SIM'), { sugerencias: 'SIMS', autollenar: { 'No TELEFONO': 'numero', 'COMPAÑIA': 'compania', 'RAZON SOCIAL': 'razonSocial' } }),
      deLinea('COMPAÑIA', 'Compañía', v('COMPAÑIA'), { opciones: catalogos.companias || [] }),
      // La razón social es de la línea (la del contrato), no del responsable (§3.3)
      deLinea('RAZON SOCIAL', 'Razón social', v('RAZON SOCIAL'), { opciones: catalogos.razonesSociales || [] }),
      titulo_(reasignar ? 'NUEVO RESPONSABLE' : 'RESPONSABLE', reasignar ? 'user-round-check' : 'user'),
      ed('No EMPLEADO', 'No. de empleado', 'listaAbierta', persona('NO EMPLEADO'), { sugerencias: 'NO_EMPLEADO', autollenar: Object.assign({ 'RESPONSABLE': 'nombre' }, datosCH), llenarVacios: true }),
      ed('RESPONSABLE', 'Nombre', 'listaAbierta', persona('RESPONSABLE'), { requerido: 'SIEMPRE', sugerencias: 'PERSONAS', autollenar: autoResponsable, llenarVacios: true }),
      campo_('IDENTIFICACION', 'Identificación', 'listaAbierta', { valor: '', requerido: 'SIEMPRE', opciones: IDENTIFICACIONES }),
      // Listas abiertas: un valor viejo fuera de la lista no debe impedir firmar la responsiva
      ed('PUESTO', 'Puesto', 'listaAbierta', persona('PUESTO'), { opciones: catalogos.puestos || [], sugerencias: 'PUESTOS' }),
      ed('DEPARTAMENTO', 'Departamento', 'listaAbierta', persona('DEPARTAMENTO'), { opciones: catalogos.departamentos || [] }),
      ed('AREA', 'Área', 'listaAbierta', persona('AREA'), { opciones: catalogos.areas || [] }),
      ed('SEDE', 'Sede', 'listaAbierta', persona('SEDE'), { opciones: catalogos.sedes || [] }),
      ed('OFICINA / DESARROLLO', 'Oficina o desarrollo', 'listaAbierta', persona('OFICINA / DESARROLLO'), { opciones: catalogos.oficinas || [] }),
      ed('DIRECTOR', 'Jefe directo', 'listaAbierta', persona('JEFE DIRECTO'), { opciones: catalogos.jefes || [] }),
      ed('CORREO', 'Correo', 'texto', persona('CUENTA GOOGLE'), { literal: true }),
      titulo_('ACCESORIOS Y ACCESOS', 'key-round'),
      ed('ACCESORIOS', 'Accesorios entregados', 'multi', accesorios.join(' , '), {
        opciones: LineasRepo.CATALOGO.accesorios.concat(accesorios.filter((x) => LineasRepo.CATALOGO.accesorios.indexOf(x) < 0)),
      }),
      campo_('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', { valor: acceso('PIN WHATSAPP'), literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: acceso('PIN EQUIPO'), literal: true, secreto: true }),
      campo_('CONTRASEÑA', 'Patrón', 'patron', { valor: acceso('PATRON'), secreto: true }),
      // Paso de firmas en tres partes, como la inspección (usuario, 4-oct)
      titulo_('DATOS DE LA RESPONSIVA', 'calendar-check'),
      campo_('FECHA RESPONSIVA', 'Fecha de la responsiva', 'fechaHora', { valor: Utilities.formatDate(ahora, ZONA, "yyyy-MM-dd'T'HH:mm"), requerido: 'SIEMPRE' }),
      // Sin columna en RESPONSIVAS: va al historial con el comentario
      campo_('TICKET', 'Ticket', 'texto', { valor: '' }),
      // Un solo COMENTARIO (plan §5.2): se guarda en OBSERVACIONES (lo que imprime el PDF) y en el historial
      titulo_('COMENTARIO', 'message-square-text'),
      campo_('OBSERVACIONES', 'Comentario', 'area', { valor: '', requerido: 'SIEMPRE' }),
      titulo_('FIRMAS', 'signature'),
      campo_('FIRMA RESPONSABLE', 'FIRMA RESPONSABLE', 'firma', { valor: '' }),
      ro('NOMBRE CI', 'NOMBRE RESPONSABLE DE CONTROL INTERNO', usuario.nombre || ''),
      campo_('FIRMA CI', 'FIRMA RESPONSABLE DE CONTROL INTERNO', 'firma', { valor: '', requerido: 'SIEMPRE' }),
    ];
  }

  /** Oculta PIN/patrón/contraseñas a quien no es ADMIN (el PDF sí los lleva, como en el AppSheet). */
  function ocultarSecretos_(elementos, puedeVerSecretos) {
    if (puedeVerSecretos) return elementos;
    return elementos.map((e) => (e.secreto && e.valor ? Object.assign({}, e, { valor: '', valorOculto: true }) : e));
  }

  // ======================================================================
  // Contexto (formulario precargado)
  // ======================================================================

  function contextoInspeccion(ref, usuario, puedeVerSecretos) {
    const obj = objetivoCaptura_(ref);
    const ahora = new Date();
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoId(LineasRepo.TAB.INSP),
      formulario: null, inspector: usuario.nombre, condiciones: LineasChecklist.CONDICIONES,
      _armar: (id) => ocultarSecretos_(formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, !!(ref && ref.enAccion)), puedeVerSecretos),
    };
  }

  function contextoResponsiva(ref, usuario, puedeVerSecretos) {
    const obj = objetivoCaptura_(ref);
    const ahora = new Date();
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoId(LineasRepo.TAB.RESP), nombreCI: usuario.nombre,
      _armar: (id) => ocultarSecretos_(formularioResponsiva_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, ref && ref.modo), puedeVerSecretos),
    };
  }

  /** Lo que viaja al cliente: el formulario ya armado con el ID propuesto. */
  function paraCliente_(ctx) {
    const salida = Object.assign({}, ctx);
    salida.formulario = ctx._armar(ctx.idPropuesto);
    delete salida._armar;
    return salida;
  }

  // ======================================================================
  // Validación común (Required_If / Show_If / Valid_If del AppSheet)
  // ======================================================================

  /**
   * Toma los valores enviados solo de los campos editables del formulario, aplica los obligatorios
   * visibles, valida opciones y listas, y regresa { valores, errores }. Los campos ocultos conservan
   * su valor inicial (AppSheet calcula los "Initial value" aunque el campo no se muestre).
   * Los secretos que no se mostraron (sin permiso) conservan el valor de la línea.
   */
  function validarFormulario_(elementos, enviados, valoresOcultos) {
    const campos = elementos.filter((e) => e.tipo === 'campo');
    const valores = {};
    campos.forEach((e) => { valores[e.columna] = e.valor === undefined || e.valor === null ? '' : String(e.valor); });
    campos.forEach((e) => {
      if (e.soloLectura || e.control === 'firma' || e.control === 'calculado') return;
      if (e.valorOculto && !(enviados && String(enviados[e.columna] || '').trim())) { valores[e.columna] = valoresOcultos[e.columna] || ''; return; }
      if (enviados && Object.prototype.hasOwnProperty.call(enviados, e.columna)) {
        valores[e.columna] = String(enviados[e.columna] === null || enviados[e.columna] === undefined ? '' : enviados[e.columna]).trim();
      }
    });
    const tipo = valores['TIPO'] || '';
    const errores = [];
    campos.forEach((e) => {
      if (e.soloLectura || e.control === 'calculado' || e.control === 'firma') return;
      const visible = LineasChecklist.cumple(e.mostrar, tipo);
      const valor = valores[e.columna];
      if (visible && LineasChecklist.cumple(e.requerido, tipo) && !valor) { errores.push(e.etiqueta + ' es obligatorio'); return; }
      if (!valor) return;
      if (e.control === 'escala' && e.opciones.indexOf(valor.toUpperCase()) < 0) errores.push(e.etiqueta + ': valor no válido');
      if (e.control === 'escala') valores[e.columna] = valor.toUpperCase();
      // Valid_If = IN([COLUMNA], SORT(SELECT(LISTAS TELEFONOS[COLUMNA], TRUE)))
      if ((e.control === 'lista' || e.soloLista) && e.opciones.map((o) => String(o).toUpperCase()).indexOf(valor.toUpperCase()) < 0) errores.push(e.etiqueta + ': el valor no está en la lista');
    });
    return { valores: valores, errores: errores };
  }

  // ======================================================================
  // Inspección
  // ======================================================================

  /** Columnas de LINEAS TELEFONICAS que copia el bot ACTUALIZAR DESDE INSPECCION (acción ACTUALIZAR DESDE INSPECCION CELULAR). */
  const COPIA_INSPECCION_A_LINEA = [
    ['RESPONSABLE', 'RESPONSABLE'], ['DEPARTAMENTO', 'DEPARTAMENTO'], ['AREA', 'AREA'], ['SEDE', 'SEDE'],
    ['OFICINA / DESARROLLO', 'OFICINA / DESARROLLO'], ['PUESTO', 'PUESTO'], ['JEFE DIRECTO', 'JEFE DIRECTO'],
    ['CUENTA GOOGLE', 'CORREO'], ['PIN WHATSAPP', 'PIN WHATSAPP'], ['PIN EQUIPO', 'PIN EQUIPO'], ['PATRON', 'PATRON'],
    ['CONTRASEÑA MODEM', 'CONTRASEÑA MODEM'],
  ];

  function guardarInspeccion(datos, usuario, puedeVerSecretos) {
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.firmaInspectorBase64) throw new Error('FIRMA INSPECTOR es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoId(LineasRepo.TAB.INSP);
    // Las fotos son opcionales: la carpeta existe solo si se subió alguna
    if (datos.carpetaId) LineasEvidencias.validarArchivosEnCarpeta((datos.fotos || []).map((f) => f.id), [datos.carpetaId, datos.fotosCarpetaId].filter(Boolean));

    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const obj = objetivoCaptura_(ref);
      const elementos = formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, !!datos.enAccion)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.slice(0, 6).join(' · ') + (r.errores.length > 6 ? '…' : ''));
      const valores = r.valores;
      // PATRON: puntos trazados en el sistema ("1-2-3") o el valor que ya tenía la línea
      if (datos.patron !== undefined && datos.patron !== null) valores['PATRON'] = String(datos.patron);
      const fechaRegistro = valores['FECHA DE REGISTRO'] ? new Date(valores['FECHA DE REGISTRO']) : ahora;
      const calificacion = LineasChecklist.calificacion(valores);

      // 1) Fila en INSPECCIONES LINEAS con las columnas del AppSheet (las firmas, como imágenes del AppSheet).
      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.nucoVisible(valores['NUCO']) || '', 'FECHA DE REGISTRO': isNaN(fechaRegistro) ? ahora : fechaRegistro,
        'CALIFICACION': calificacion, 'NOMBRE INSPECTOR': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': '',
      });
      LineasDatos.agregarFilas(LineasRepo.TAB.INSP, [fila]);

      // 2) Bot ACTUALIZAR DESDE INSPECCION: copia a la línea (la bitácora la deja guardarCambiosRegistro).
      // FECHA INSPECCION es Date (sin hora) en LINEAS TELEFONICAS
      const fr = fila['FECHA DE REGISTRO'];
      const copia = { 'FECHA INSPECCION': new Date(fr.getFullYear(), fr.getMonth(), fr.getDate()) };
      // En Mandar a resguardo (enAccion) el responsable de la inspección es quien recibe, no quien lo tenía: no se copia
      // nada de la persona al inventario (el resguardo la deja en blanco); solo la fecha y el color
      if (!datos.enAccion) COPIA_INSPECCION_A_LINEA.forEach(([destino, origen]) => { copia[destino] = valores[origen] === undefined ? '' : valores[origen]; });
      // El color es del aparato (EQUIPOS): la inspección lo actualiza si trae uno (decisión del usuario, 3-oct)
      if (String(valores['COLOR'] || '').trim()) copia['COLOR'] = valores['COLOR'];
      // tolerante: lo que no tiene dónde guardarse en las hojas nuevas (p. ej. la persona de un equipo guardado) se ignora
      const g = LineasRepo.guardarCambiosRegistro(obj.fila, copia, usuario, ahora, { tolerante: true });

      // 3) Evidencia del sistema nuevo (carpeta y fotos) y movimiento.
      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'TIPO': 'INSPECCION', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId || '', 'RUTA': datos.ruta || '', 'FOTOS_CARPETA_ID': datos.fotosCarpetaId || '',
        'FOTOS': String((datos.fotos || []).length), 'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE',
        'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('INSPECCION', { motivo: valores['OBSERVACIONES'] || '', ticket: valores['TICKET'] }, usuario, ahora, {
        refs: [obj.reg.id].concat(g.refs || []), nuco: obj.reg.nuco, numero: valores['No TELEFONO'],
        antes: { estado: obj.equipo ? resumenEquipo_(obj.equipo) : resumenLinea_(obj.linea) },
        despues: { calificacion: calificacion },
        detalle: Object.assign(detalleCambios_([g]), { inspeccionId: id }),
      });
      return { obj: obj, calificacion: calificacion };
    });

    firmasCache_('INSPECCION', id, { inspector: datos.firmaInspectorBase64, responsable: datos.firmaResponsableBase64 || null, patron: datos.patronBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, calificacion: res.calificacion, pdfPendiente: true, filas: filas };
  }

  // ======================================================================
  // Responsiva
  // ======================================================================

  /**
   * accion (opcional, LineasAcciones.reasignar): { ref, modo, aplicar(ahora, valores) → { id } }. Primero se revisa la
   * responsiva; si está bien, se hace la acción (aplicar) y la responsiva se guarda en el registro, todo dentro del
   * mismo candado.
   */
  function guardarResponsiva(datos, usuario, puedeVerSecretos, accion) {
    const ref = accion ? accion.ref : { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (!datos.firmaCiBase64) throw new Error('FIRMA RESPONSABLE DE CONTROL INTERNO es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoId(LineasRepo.TAB.RESP);

    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      let obj = objetivoCaptura_(ref);
      const elementos = formularioResponsiva_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, accion ? accion.modo : '')
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.join(' · '));
      const valores = r.valores;
      if (datos.patron !== undefined && datos.patron !== null) valores['CONTRASEÑA'] = String(datos.patron);
      // Una sola fecha (como la inspección); el PDF sigue usando DIA, MES y AÑO
      const fechaDoc = valores['FECHA RESPONSIVA'] ? new Date(valores['FECHA RESPONSIVA']) : ahora;
      const fechaResp = isNaN(fechaDoc) ? ahora : fechaDoc;
      valores['FECHA RESPONSIVA'] = fechaResp;
      valores['DIA'] = Utilities.formatDate(fechaResp, ZONA, 'd');
      valores['MES'] = MESES[Number(Utilities.formatDate(fechaResp, ZONA, 'M')) - 1];
      valores['AÑO'] = Utilities.formatDate(fechaResp, ZONA, 'yyyy');
      // Bot MAYUSCULAS
      valores['IDENTIFICACION'] = String(valores['IDENTIFICACION'] || '').toUpperCase();
      valores['OBSERVACIONES'] = String(valores['OBSERVACIONES'] || '').toUpperCase();
      // La responsiva está completa: ahora sí la acción, y la responsiva queda en el registro
      const hecho = accion ? accion.aplicar(ahora, valores) : null;
      if (hecho) obj = objetivoCaptura_({ equipoId: hecho.id });

      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.nucoVisible(valores['NUCO']) || '', 'TIPO CONTRASEÑA': '',
        'NOMBRE CI': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA CI': '',
      });
      LineasDatos.agregarFilas(LineasRepo.TAB.RESP, [fila]);
      // El color es del aparato (EQUIPOS): la responsiva lo actualiza, igual que la inspección (decisión del usuario, 3-oct)
      const g = String(valores['COLOR'] || '').trim()
        ? LineasRepo.guardarCambiosRegistro(obj.fila, { 'COLOR': valores['COLOR'] }, usuario, ahora, { tolerante: true }) : null;

      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'TIPO': 'RESPONSIVA', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': '', 'RUTA': '', 'FOTOS': '0',
        'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('RESPONSIVA', { motivo: valores['OBSERVACIONES'] || '', ticket: valores['TICKET'] || '' }, usuario, ahora, {
        refs: [obj.reg.id].concat(g ? g.refs || [] : []), nuco: obj.reg.nuco, numero: valores['No TELEFONO'] || null,
        antes: {}, despues: { responsable: { nombre: valores['RESPONSABLE'] || null } },
        detalle: Object.assign(detalleCambios_(g ? [g] : []), { responsivaId: id }),
      });
      return { obj: obj, hecho: hecho };
    });

    firmasCache_('RESPONSIVA', id, { responsable: datos.firmaResponsableBase64 || null, ci: datos.firmaCiBase64, patron: datos.patronBase64 || null });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, pdfPendiente: true, filas: filas, hecho: res.hecho, registroId: res.obj.reg.id };
  }

  /**
   * Inspección capturada dentro de la acción (decisión del usuario, 3-oct: al mandar a resguardo): que exista, que sea
   * de ese registro y de hoy.
   */
  function exigirInspeccion(inspeccionId, idsRegistro, nombre) {
    const id = String(inspeccionId || '').trim();
    if (!id) throw new Error(nombre + ': falta su inspección (se captura dentro de la acción).');
    const fila = leerFilaPorId_(LineasRepo.TAB.INSP, id);
    if (!fila) throw new Error(nombre + ': no se encontró su inspección ' + id + '.');
    if ((idsRegistro || []).map(String).indexOf(String(LineasUtil.col(fila, 'ID LINEA') || '')) < 0) throw new Error(nombre + ': la inspección ' + id + ' es de otro registro.');
    const fecha = LineasUtil.col(fila, 'FECHA DE REGISTRO');
    const dia = (d) => Utilities.formatDate(d, ZONA, 'yyyy-MM-dd');
    if (!(fecha instanceof Date) || dia(fecha) !== dia(new Date())) throw new Error(nombre + ': la inspección ' + id + ' no es de hoy.');
    return id;
  }

  // ======================================================================
  // PDF (después de guardar), con la fila tal como quedó en la hoja
  // ======================================================================

  function leerFilaPorId_(tabla, id) {
    const filas = LineasDatos.buscarFilasPorId(tabla, id);
    if (!filas.length) return null;
    return LineasDatos.leerFilas([{ tabla: tabla, filas: filas.slice(0, 1) }])[0][0];
  }

  /** ids = los de la fila (el suyo y el del AppSheet): la evidencia pudo ligarse con cualquiera. */
  function evidenciaSistema_(ids) {
    const filasEv = LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID) ? LineasDatos.buscarFilasVarios(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', ids) : [];
    if (!filasEv.length) return null;
    const ev = LineasRepo.evidenciaDesdeFila(LineasDatos.leerFilas([{ tabla: LineasRepo.TAB.APP_EVID, filas: filasEv.slice(0, 1) }])[0][0]);
    return ev && ev.origen === 'SISTEMA' ? ev : null;
  }

  /** Registro para la plantilla: la fila con los formatos que muestra el AppSheet. */
  function registroPlantilla_(fila) {
    const registro = {};
    Object.keys(fila).forEach((k) => { if (k !== '_fila') registro[k] = fila[k]; });
    if ('CALIFICACION' in registro) registro['CALIFICACION'] = LineasChecklist.calificacionTexto(registro['CALIFICACION']);
    return registro;
  }

  /** Escribe la ruta del PDF en la fila (columna File del AppSheet, igual que su acción GUARDAR) y en APP_EVIDENCIAS. */
  function ligarPdf_(tabla, columnaPdf, ids, pdf, ruta) {
    const filas = LineasDatos.buscarFilasPorId(tabla, ids[0]);
    if (filas.length) { const o = {}; o[columnaPdf] = ruta; LineasDatos.actualizarFila(tabla, filas[0], o); }
    if (LineasDatos.existeTabla(LineasRepo.TAB.APP_EVID)) {
      const filasEv = LineasDatos.buscarFilasVarios(LineasRepo.TAB.APP_EVID, 'ID_REGISTRO', ids);
      if (filasEv.length) LineasDatos.actualizarFila(LineasRepo.TAB.APP_EVID, filasEv[0], { 'PDFS_JSON': JSON.stringify([{ id: pdf.id, nombre: pdf.nombre }]), 'ACTUALIZADO_EN': new Date() });
    }
  }

  /**
   * Carpeta y nombre del PDF:
   *   - la carpeta de NUCOS que ya tiene la captura (la de sus fotos: "INSP DD MM");
   *   - si no tiene y el registro tiene NUCO, una nueva en NUCOS del día de la captura (se liga en APP_EVIDENCIAS);
   *   - sin NUCO, la carpeta de la app con el nombre del AppSheet.
   */
  function destinoPdf_(tipo, fila, ev, id) {
    const nuco = LineasUtil.nuco4(LineasUtil.col(fila, 'NUCO'));
    const prefijo = tipo === 'INSPECCION' ? 'INSP ' : 'RESP ';
    if (ev.carpetaId && LineasArchivos.enNucos(ev.carpetaId)) {
      const carpeta = DriveApp.getFolderById(ev.carpetaId);
      const m = carpeta.getName().match(/^(?:INSP|RESP)\s+(\d{1,2})\s+(\d{1,2})/i);
      const ddmm = m ? m[1] + ' ' + m[2] : Utilities.formatDate(ev.fecha || new Date(), ZONA, 'dd MM');
      return { carpeta: carpeta, nombre: prefijo + (nuco || 'SIN NUCO') + ' ' + ddmm + '.pdf', enNucos: true, nuco: nuco };
    }
    if (nuco) {
      const fr = tipo === 'INSPECCION' ? LineasUtil.col(fila, 'FECHA DE REGISTRO') : null;
      const fecha = fr instanceof Date && !isNaN(fr) ? fr : (ev.fecha || new Date());
      const c = LineasArchivos.carpetaEvidenciaNuco(tipo, nuco, fecha);
      if (ev._fila) {
        LineasDatos.conCandado(() => LineasDatos.actualizarFila(LineasRepo.TAB.APP_EVID, ev._fila,
          Object.assign({ 'CARPETA_ID': c.carpetaId, 'RUTA': c.ruta, 'ACTUALIZADO_EN': new Date() },
            c.fotosCarpetaId && !ev.fotosCarpetaId ? { 'FOTOS_CARPETA_ID': c.fotosCarpetaId } : {})));
      }
      return { carpeta: DriveApp.getFolderById(c.carpetaId), nombre: c.nombrePdf, enNucos: true, nuco: nuco };
    }
    const destino = PDF[tipo];
    return { carpeta: LineasArchivos.carpetaDeApp(destino.carpeta), nombre: destino.nombre(id), enNucos: false, nuco: null };
  }

  /** Genera (o regenera con forzar=true) el PDF de una inspección o responsiva capturada en el sistema. */
  function generarPdf(tipo, id, forzar, usuario, firmasNuevas) {
    const esInspeccion = tipo === 'INSPECCION';
    if (!esInspeccion && tipo !== 'RESPONSIVA') throw new Error('Tipo de PDF inválido.');
    const tabla = esInspeccion ? LineasRepo.TAB.INSP : LineasRepo.TAB.RESP;
    const fila = leerFilaPorId_(tabla, id);
    if (!fila) throw new Error('No existe ' + (esInspeccion ? 'la inspección ' : 'la responsiva ') + id);
    const ids = LineasDatos.idsDeFila(fila);
    const ev = evidenciaSistema_(ids);
    if (!ev) throw new Error('Solo se generan PDF de registros capturados en el sistema.');
    if (!forzar && ev.pdfs && ev.pdfs.length) return ev.pdfs[0];

    const firmas = firmasCache_(tipo, id, firmasNuevas);
    // Firmas: las de esta sesión (caché 6 h); si la fila trae una ruta de imagen, se busca en la carpeta de la app
    const archivo = (col) => LineasArchivos.blob(LineasUtil.col(fila, col));
    const imagen = (clave, col, nombre) => (firmas && firmas[clave] ? blobBase64_(firmas[clave], nombre) : archivo(col));
    if (!firmas && !LineasUtil.col(fila, esInspeccion ? 'FIRMA INSPECTOR' : 'FIRMA CI')) {
      throw new Error('La firma temporal ya no está disponible. Captura ' + (esInspeccion ? 'una inspección nueva.' : 'una responsiva nueva.'));
    }
    const destino = PDF[tipo];
    const d = destinoPdf_(tipo, fila, ev, id);
    const carpeta = d.carpeta;
    const nombre = d.nombre;
    // Regenerar: el PDF anterior de este registro (el ligado y los del mismo nombre) se reemplaza
    if (forzar) {
      (ev.pdfs || []).forEach((p) => { try { DriveApp.getFileById(p.id).setTrashed(true); } catch (e) { /* ya no existe */ } });
      const viejos = carpeta.getFilesByName(nombre);
      while (viejos.hasNext()) viejos.next().setTrashed(true);
    }
    const imagenes = esInspeccion
      ? { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', 'firma-responsable.png'), 'FIRMA INSPECTOR': imagen('inspector', 'FIRMA INSPECTOR', 'firma-inspector.png'), 'PATRON': imagen('patron', 'PATRON', 'patron.png') }
      : { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', 'firma-responsable.png'), 'FIRMA CI': imagen('ci', 'FIRMA CI', 'firma-ci.png'), 'CONTRASEÑA': imagen('patron', 'CONTRASEÑA', 'patron.png') };
    try {
      const pdf = LineasPdf.generarPdfDesdePlantilla(
        esInspeccion ? LineasPdf.PLANTILLAS.INSPECCION_CELULAR : LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR,
        registroPlantilla_(fila), imagenes, carpeta, nombre, d.enNucos);
      const ruta = d.enNucos ? 'https://drive.google.com/file/d/' + pdf.id + '/view' : destino.carpeta + '/' + nombre;
      LineasDatos.conCandado(() => ligarPdf_(tabla, destino.columna, ids, pdf, ruta));
      if (d.enNucos) LineasArchivos.olvidarNuco(d.nuco);
      return pdf;
    } catch (e) {
      console.error('generarPdf ' + tipo + ' (' + id + '): ' + e.message);
      throw new Error('No se pudo generar el PDF de la ' + (esInspeccion ? 'inspección' : 'responsiva') + ': ' + e.message);
    }
  }

  /**
   * Fotos de una inspección ya guardada (mejora: en AppSheet no se podían agregar después).
   * 'preparar' → { fotosCarpetaId } autorizada para el usuario; si la inspección no tenía carpeta de fotos en la
   * carpeta de la app (p. ej. del AppSheet), crea INSPECCIONES LINEAS_Images/FOTOS <ID> y la registra en
   * APP_EVIDENCIAS. 'actualizar' → recuenta las fotos y regresa { fotos }.
   */
  /**
   * Agregar fotos a una inspección ya registrada. `externa` = la inspección de la carpeta NUCOS ("drive_<carpeta>",
   * la arma TelefoniaService): sus fotos nuevas van a su carpeta FOTOS en NUCOS y se ligan en APP_EVIDENCIAS (ORIGEN
   * NUCOS_FOTOS, ID_REGISTRO = "drive_<carpeta>") para el recuento. No es ORIGEN DRIVE para no aparecer como otra
   * inspección en Documentos. Una de la hoja sin carpeta crea la suya en NUCOS (del día de la inspección).
   */
  function fotosInspeccion(id, accion, correo, externa) {
    const insp = externa || (/^drive_/.test(id) ? null : LineasRepo.leerInspeccion(id));
    if (!insp) throw new Error('No existe la inspección ' + id);
    const TAB_EV = LineasRepo.TAB.APP_EVID;
    LineasRepo.asegurarPestanaApp(TAB_EV);
    const filas = LineasDatos.buscarFilasVarios(TAB_EV, 'ID_REGISTRO', [id].concat(insp._idsAnteriores || []));
    const fila = filas.length ? LineasDatos.leerFilas([{ tabla: TAB_EV, filas: filas.slice(0, 1) }])[0][0] : null;
    let carpetaId = fila ? String(fila['CARPETA_ID'] || '') : '';
    let fotosId = fila ? String(fila['FOTOS_CARPETA_ID'] || '') : '';

    if (accion === 'preparar') {
      // Ya tiene carpeta de fotos (en NUCOS o en la carpeta de la app): se reutiliza
      if (fotosId && (LineasArchivos.enNucos(fotosId) || LineasArchivos.estaDentroDe(fotosId, LineasArchivos.carpetaAppSheetId()))) {
        LineasEvidencias.autorizarSubida(correo, [fotosId]);
        return { fotosCarpetaId: fotosId };
      }
      // Inspección con carpeta en NUCOS: sus fotos van a su FOTOS (se crea si no tiene)
      const nucosDrive = externa ? externa.drive : (carpetaId && LineasArchivos.enNucos(carpetaId) ? { carpetaId: carpetaId } : null);
      if (nucosDrive && nucosDrive.carpetaId) {
        let fotosNucos = nucosDrive.fotosCarpetaId;
        if (!fotosNucos) {
          const carpetaInsp = DriveApp.getFolderById(nucosDrive.carpetaId);
          const it = carpetaInsp.getFoldersByName('FOTOS');
          fotosNucos = (it.hasNext() ? it.next() : carpetaInsp.createFolder('FOTOS')).getId();
        }
        LineasEvidencias.autorizarSubida(correo, [fotosNucos]);
        if (fila) {
          LineasDatos.actualizarFila(TAB_EV, fila._fila, Object.assign({ 'FOTOS_CARPETA_ID': fotosNucos, 'ACTUALIZADO_EN': new Date() },
            carpetaId ? {} : { 'CARPETA_ID': nucosDrive.carpetaId }));
        } else {
          LineasDatos.agregarFilas(TAB_EV, [{
            'TIPO': 'INSPECCION', 'ORIGEN': externa ? 'NUCOS_FOTOS' : (insp.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET'), 'ID_REGISTRO': id,
            'ID_LINEA': insp.registroId || '', 'NUCO': insp.nuco || '', 'FECHA': insp.fecha ? new Date(insp.fecha) : new Date(),
            'CARPETA_ID': nucosDrive.carpetaId, 'RUTA': '', 'FOTOS_CARPETA_ID': fotosNucos, 'FOTOS': '0', 'PDFS_JSON': '[]',
            'COINCIDENCIA_EXACTA': 'TRUE', 'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': new Date(),
          }]);
        }
        return { fotosCarpetaId: fotosNucos };
      }
      const c = LineasEvidencias.crearCarpetaFotos(id, correo, insp.nuco, insp.fecha ? new Date(insp.fecha) : new Date());
      if (fila) {
        LineasDatos.actualizarFila(TAB_EV, fila._fila, Object.assign({ 'FOTOS_CARPETA_ID': c.fotosCarpetaId, 'ACTUALIZADO_EN': new Date() },
          carpetaId ? {} : { 'CARPETA_ID': c.carpetaId, 'RUTA': c.ruta }));
      } else {
        LineasDatos.agregarFilas(TAB_EV, [{
          'TIPO': 'INSPECCION', 'ORIGEN': externa ? 'NUCOS_FOTOS' : (insp.origen === 'SISTEMA' ? 'SISTEMA' : 'APPSHEET'), 'ID_REGISTRO': id,
          'ID_LINEA': insp.registroId || '', 'NUCO': insp.nuco || '', 'FECHA': insp.fecha ? new Date(insp.fecha) : new Date(),
          'CARPETA_ID': c.carpetaId, 'RUTA': c.ruta, 'FOTOS_CARPETA_ID': c.fotosCarpetaId, 'FOTOS': '0', 'PDFS_JSON': '[]',
          'COINCIDENCIA_EXACTA': 'TRUE', 'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': new Date(),
        }]);
      }
      return { fotosCarpetaId: c.fotosCarpetaId };
    }

    if (!fila || !fotosId) return { fotos: 0 };
    const n = LineasEvidencias.contarImagenes(fotosId);
    LineasDatos.actualizarFila(TAB_EV, fila._fila, { 'FOTOS': String(n), 'ACTUALIZADO_EN': new Date() });
    return { fotos: n };
  }

  /**
   * PDF firmado (usuario, 5-oct): la inspección o la responsiva se pudo guardar sin la firma del responsable (se le
   * manda); al regresar firmada se sube aquí y reemplaza el PDF (LineasArchivos.reemplazarPdf: mismo archivo, la versión
   * sin firma queda en el historial de versiones de Drive). Solo PDF. Queda en el historial del registro.
   * `doc` = { tipo, id, pdfId } ya validado como documento de `registro` (TelefoniaService).
   */
  function subirPdfFirmado(registro, doc, base64, usuario) {
    if (!base64) throw new Error('Elige el PDF firmado.');
    const bytes = Utilities.base64Decode(String(base64));
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    if (String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-') throw new Error('Solo se aceptan archivos PDF.');
    const archivo = LineasArchivos.reemplazarPdf(doc.pdfId, bytes);
    if (registro.nuco) LineasArchivos.olvidarNuco(registro.nuco);
    LineasDatos.conCandado(() => LineasRepo.registrarMovimiento('PDF_FIRMADO', { motivo: '' }, usuario, new Date(), {
      refs: [registro.id], nuco: registro.nuco,
      detalle: Object.assign(doc.tipo === 'INSPECCION' ? { inspeccionId: doc.id } : { responsivaId: doc.id },
        { cambios: [{ campo: 'PDF', antes: '', despues: archivo.name }] }),
    }));
    return { id: archivo.id, nombre: archivo.name };
  }

  return {
    objetivo: objetivoCaptura_, guardarInspeccion, guardarResponsiva, exigirInspeccion, generarPdf, fotosInspeccion, subirPdfFirmado,
    contextoInspeccion: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoInspeccion(ref, usuario, puedeVerSecretos)),
    contextoResponsiva: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoResponsiva(ref, usuario, puedeVerSecretos)),
    // Para pruebas: las definiciones de los formularios
    _formularioInspeccion: formularioInspeccion_, _formularioResponsiva: formularioResponsiva_, _validar: validarFormulario_,
  };
})();
