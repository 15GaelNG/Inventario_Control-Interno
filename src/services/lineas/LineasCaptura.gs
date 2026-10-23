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
 *   - Responsiva  → fila en RESPONSIVAS LINEAS; bot MAYUSCULAS (IDENTIFICACION, COMENTARIO, antes OBSERVACIONES).
 *                   Es la acción que entrega (pendiente 2.49, usuario 16-oct: LineasAcciones.responsiva): lo de la
 *                   responsiva pasa a la ficha y, si firma otra persona, reasigna.
 *   - Ambos       → PDF con las plantillas del AppSheet, después de guardar (generarPdf).
 * PDF en NUCOS (desde el corte a producción, 2-oct-2026), igual que los que sube el área a mano:
 *   <NUCO>/INSPECCIONES/<AÑO>/<N> CUATRIMESTRE/<MES>/INSP DD MM/INSP <NUCO> DD MM.pdf   (junto a su FOTOS)
 *   <NUCO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/RESP <NUCO> DD MM.pdf
 * La columna File de la hoja guarda el enlace de Drive del PDF. Un registro sin NUCO sigue con las rutas del
 * AppSheet en la carpeta de la app: INSPECCIONES_Files_/INSPECCION - <ID>.pdf y Files/RESPONSIVA<ID>.pdf.
 * La línea sin equipo (pendiente 2.45, usuario 15-oct) solo tiene responsiva, sin datos del equipo («NO APLICA», como
 * el equipo sin línea), y va a la carpeta de su línea en LINEAS, no a NUCOS:
 *   LINEAS/<NÚMERO>/CARTA RESPONSIVA/<AÑO>/RESP DD MM/RESP <NÚMERO> DD MM.pdf
 * Un documento se queda donde se firmó: vincular, cambiar o desvincular la línea no mueve nada en Drive.
 * Las firmas NO se guardan como archivos (acuerdo del 18-sep): viajan en memoria para el PDF y las columnas
 * FIRMA quedan vacías. En AppSheet eran imágenes en <TABLA>_Images. Regenerar el PDF (Documentos) usa las de la captura
 * mientras siguen en caché (6 h); después se vuelven a firmar, sin capturar el formulario.
 * Del sistema nuevo se conservan: fotos opcionales de la inspección (INSPECCIONES LINEAS_Images/FOTOS <ID>),
 * APP_EVIDENCIAS y APP_MOVIMIENTOS (pestañas propias, no las lee AppSheet).
 */

const LineasCaptura = (function () {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const ZONA = 'America/Mexico_City';
  /** Marca de tiempo del medidor del DEV (TelefoniaService.conPasosEnDev_); afuera no hace nada. */
  const marca_ = (que, desde) => { if (typeof LineasDatos.tiempo === 'function') LineasDatos.tiempo(que, desde); };

  // Rutas del AppSheet para los PDF (acciones GUARDAR de sus bots)
  const PDF = {
    INSPECCION: { carpeta: 'INSPECCIONES_Files_', nombre: (id) => 'INSPECCION - ' + id + '.pdf', columna: 'FORMATO INSPECCIONES LINEAS' },
    RESPONSIVA: { carpeta: 'Files', nombre: (id) => 'RESPONSIVA' + id + '.pdf', columna: 'FORMATO RESPONSIVA' },
  };
  /** La firma de la pantalla: PNG, o JPEG si era una foto que se achicó para caber en la caché (usuario, 22-oct). */
  function blobBase64_(base64, nombre) {
    if (!base64) return null;
    const jpeg = String(base64).indexOf('/9j/') === 0; // los bytes FF D8 FF de un JPEG en base64
    return Utilities.newBlob(Utilities.base64Decode(String(base64)), jpeg ? 'image/jpeg' : 'image/png', nombre || 'firma.png');
  }

  function firmasCache_(tipo, id, nuevas) {
    const clave = 'firmas_' + tipo + '_' + id;
    const cache = CacheService.getScriptCache();
    const leer = () => { const raw = cache.get(clave); try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; } };
    if (!nuevas) return leer();
    // Las nuevas mandan; lo que no traen (la firma guardada, que la pantalla no tiene) se queda como estaba
    const juntas = Object.assign({}, leer() || {});
    Object.keys(nuevas).forEach((k) => { if (nuevas[k]) juntas[k] = nuevas[k]; });
    try { cache.put(clave, JSON.stringify(juntas), 21600); } catch (e) { console.warn('No se pudieron conservar temporalmente las firmas: ' + e.message); }
    return juntas;
  }

  /**
   * Firma guardada de quien captura (LineasFirmas, usuario 6-oct): la pantalla solo pide usarla; la imagen la pone aquí
   * el servidor, y solo la del correo de la sesión.
   */
  function firmaPropia_(usuario) {
    const png = LineasFirmas.png(usuario && usuario.correo);
    if (!png) throw new Error('No tienes firma guardada: firma en el recuadro.');
    return png;
  }

  /** Nombre para comparar: mayúsculas, sin acentos ni espacios de más (igual que nombreDeFirma en lineas.html). */
  function nombreDeFirma_(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  }

  /**
   * Los nombres de quien captura (usuario, 19-oct): el de USUARIOS y el suyo en Capital Humano (por su correo). Si el
   * responsable es uno de ellos (p. ej. procesos recibe en Mandar a resguardo), su firma guardada va también como
   * FIRMA RESPONSABLE. Solo los de la sesión: cada quien con su firma.
   */
  function nombresPropios_(usuario) {
    const nombres = [nombreDeFirma_(usuario && usuario.nombre)];
    const correo = String((usuario && usuario.correo) || '').trim().toLowerCase();
    if (correo) {
      const ix = LineasRepo.indiceColaboradores();
      const iNom = ix.columnas.indexOf('nombre'), iCor = ix.columnas.indexOf('correo');
      ix.filas.forEach((f) => { if (String(f[iCor] || '').toLowerCase() === correo) nombres.push(nombreDeFirma_(f[iNom])); });
    }
    return nombres.filter((n, i) => n && nombres.indexOf(n) === i);
  }

  /** Los nombres de quien captura, solo si tiene firma guardada (la pantalla los compara con el responsable). */
  function nombresConFirma_(usuario) {
    return LineasFirmas.tiene(usuario && usuario.correo) ? nombresPropios_(usuario) : [];
  }

  /** La firma guardada como FIRMA RESPONSABLE: solo si el responsable es quien captura. */
  function firmaResponsablePropia_(usuario, responsable) {
    if (nombresPropios_(usuario).indexOf(nombreDeFirma_(responsable)) < 0) throw new Error('Tu firma guardada solo va si el responsable eres tú: firma en el recuadro.');
    return firmaPropia_(usuario);
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

  /**
   * La línea sin equipo solo tiene responsiva (pendiente 2.45, usuario 15-oct). El equipo VENDIDO, DONADO, DESECHADO o EXTRAVIO-ROBO no se inspecciona (usuario, 21-oct; pendiente 2.55; la pantalla no
   * muestra el botón), salvo dentro de la Responsiva que abre «Corregir equipo» al pasarlo a USO (ref.desdeCorregir).
   */
  function exigirEquipoParaInspeccion_(obj, ref) {
    if (!obj.equipo) throw new Error('La línea sin equipo no lleva inspección: solo responsiva.');
    const estatus = String(LineasUtil.col(obj.fila, 'ESTATUS EQUIPO') || '').trim().toUpperCase();
    if (!(ref && ref.reasignar && ref.desdeCorregir) && LineasAcciones.ESTATUS_SIN_RESPONSIVA.equipo.indexOf(estatus) >= 0) {
      throw new Error(LineasAcciones.nombreRegistro(obj.fila, true) + ' está ' + estatus + '.');
    }
    // En el panel de Pau tampoco (pendiente 3.15)
    if (LineasResguardos.enPanel(obj.fila)) throw new Error(LineasAcciones.nombreRegistro(obj.fila, true) + ' está en Resguardos y cancelaciones.');
    return obj;
  }

  /** Número de la línea sin equipo (su carpeta en LINEAS se llama así): sin número no hay responsiva (usuario, 15-oct). */
  function numeroParaResponsiva_(obj) {
    const numero = LineasUtil.digitos(LineasUtil.col(obj.fila, 'NUMERO TELEFONO'));
    if (!numero) throw new Error('La línea no tiene número: captúralo con Corregir.');
    return numero;
  }

  /**
   * Lo del equipo en la responsiva de una línea sin equipo: «NO APLICA», como VALORES_SIN_LINEA en el equipo sin línea
   * (usuario, 15-oct: la misma plantilla). El NUCO se guarda vacío (no hay carpeta en NUCOS) y el PDF dice «NO APLICA»
   * (registroPlantilla_). No pasa nada al inventario.
   */
  const SIN_EQUIPO = { 'NUCO': '', 'MODELO': 'NO APLICA', 'IMEI': 'NO APLICA', 'COLOR': 'NO APLICA', 'ACCESORIOS': 'NO APLICA',
    'PIN WHATSAPP': 'NO APLICA', 'PIN EQUIPO': 'NO APLICA', 'CONTRASEÑA': '' };
  /** Una fila de RESPONSIVAS LINEAS de una línea sin equipo (la que lleva SIN_EQUIPO). */
  function responsivaSinEquipo_(fila) {
    const t = (c) => String(fila[c] === null || fila[c] === undefined ? '' : fila[c]).trim().toUpperCase();
    return 'FECHA RESPONSIVA' in fila && !t('NUCO') && t('MODELO') === 'NO APLICA' && t('IMEI') === 'NO APLICA';
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
  /**
   * Datos del responsable, los mismos en la inspección y la responsiva (usuario, 19-oct; pendiente 2.54): número de
   * empleado, nombre, puesto, departamento, área, sede, oficina, jefe directo, director y correo. La responsiva agrega
   * la identificación (opciones.identificacion). Listas de Capital Humano y, al elegir a la persona, se llenan con lo que
   * dice CH. Obligatorio lo que CH siempre trae; jefe directo, director y correo pueden venir vacíos de CH (19-oct: 410,
   * 117 y 1,810 de los activos sin ellos) y no lo son.
   *   valor(columna): el valor inicial, por la columna del documento (No EMPLEADO, CORREO).
   *   opciones.personaFija: nombre y número fijos (Vincular o Cambiar línea: la persona es la que ya lo tiene).
   *   opciones.soloProcesos: Mandar a resguardo; el nombre solo se elige entre las personas de procesos.
   */
  const DATOS_CH = { 'PUESTO': 'puesto', 'DEPARTAMENTO': 'departamento', 'AREA': 'area', 'SEDE': 'sede',
    'OFICINA / DESARROLLO': 'oficina', 'JEFE DIRECTO': 'jefe', 'DIRECTOR': 'director', 'CORREO': 'correo' };
  /** Columna del inventario de cada dato del responsable que en los documentos se llama distinto. */
  const COLUMNA_FICHA = { 'No EMPLEADO': 'NO EMPLEADO', 'CORREO': 'CUENTA GOOGLE' };
  const columnaFicha_ = (c) => COLUMNA_FICHA[c] || c;
  /**
   * Lo que cada hoja del AppSheet no tenía: la inspección no pedía número ni director y la responsiva, jefe directo. La
   * inspección pide los accesorios con la lista de la responsiva desde el 22-oct (usuario).
   */
  const COLUMNAS_NUEVAS = { INSPECCION: ['No EMPLEADO', 'DIRECTOR', 'ACCESORIOS'], RESPONSIVA: ['JEFE DIRECTO'] };
  /**
   * Valor y opciones del campo ACCESORIOS, el mismo en la responsiva y la inspección (usuario, 22-oct): la lista única
   * (D5.5) con "TARJETA SD" (usuario, 4-oct; "SD" de antes cuenta como la misma), CARGADOR como CABLE y CUBO (usuario,
   * 22-oct) y lo que ya traiga el equipo fuera de la lista, para no perderlo.
   */
  function listaAccesorios_(texto) {
    const accesorios = String(LineasUtil.sinCargador(texto) || '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean).map((x) => (x === 'SD' ? 'TARJETA SD' : x));
    return {
      valor: accesorios.join(' , '),
      opciones: LineasRepo.CATALOGO.accesorios.concat(accesorios.filter((x) => LineasRepo.CATALOGO.accesorios.indexOf(x) < 0)),
    };
  }
  function camposResponsable_(catalogos, valor, opciones) {
    const o = opciones || {};
    const req = { requerido: 'SIEMPRE' };
    const lista = (columna, etiqueta, opcionesLista, extra) => campo_(columna, etiqueta, 'listaAbierta', Object.assign({ valor: valor(columna), opciones: opcionesLista || [] }, extra || {}));
    const fijo = (columna, etiqueta) => campo_(columna, etiqueta, 'texto', { valor: valor(columna), soloLectura: true });
    const noEmpleado = o.personaFija ? fijo('No EMPLEADO', 'No. de empleado')
      // En Mandar a resguardo el número sale de la persona de procesos elegida
      : lista('No EMPLEADO', 'No. de empleado', [], Object.assign(o.soloProcesos ? {} : { sugerencias: 'NO_EMPLEADO', autollenar: Object.assign({ 'RESPONSABLE': 'nombre' }, DATOS_CH), llenarVacios: true }, req));
    // llenarVacios: al abrir, lo que falte de la persona se llena con Capital Humano (usuario, 4-oct: el jefe directo no salía)
    const nombre = o.personaFija ? fijo('RESPONSABLE', 'Nombre')
      : lista('RESPONSABLE', 'Nombre', o.soloProcesos ? PERSONAS_PROCESOS : [], Object.assign({ sugerencias: 'PERSONAS', autollenar: Object.assign({ 'No EMPLEADO': 'noEmpleado' }, DATOS_CH), llenarVacios: true },
        o.soloProcesos ? { soloLista: true } : {}, req));
    return [noEmpleado, nombre].concat(o.identificacion || [], [
      // Listas abiertas: un valor viejo fuera de la lista no debe impedir guardar
      lista('PUESTO', 'Puesto', catalogos.puestos, Object.assign({ sugerencias: 'PUESTOS' }, req)),
      lista('DEPARTAMENTO', 'Departamento', catalogos.departamentos, req),
      lista('AREA', 'Área', catalogos.areas, req),
      lista('SEDE', 'Sede', catalogos.sedes, req),
      lista('OFICINA / DESARROLLO', 'Oficina o desarrollo', catalogos.oficinas, req),
      lista('JEFE DIRECTO', 'Jefe directo', catalogos.jefes),
      lista('DIRECTOR', 'Director', catalogos.directores),
      campo_('CORREO', 'Correo', 'texto', { valor: valor('CORREO'), literal: true }),
    ]);
  }

  function formularioInspeccion_(fila, catalogos, usuario, id, ahora, enAccion, deResponsiva) {
    const v = (c) => valorLinea_(fila, c);
    // Dentro de Reasignar (usuario, 6-oct), la inspección empieza con lo que se capturó en la responsiva: la persona
    // nueva (con su jefe directo y su director desde el 19-oct), el color, los accesos, el ticket y el comentario
    const resp = !enAccion && deResponsiva && deResponsiva.valores ? deResponsiva.valores : null;
    const deResp = (c, siNo) => (resp && Object.prototype.hasOwnProperty.call(resp, c) ? String(resp[c] === null || resp[c] === undefined ? '' : resp[c]) : siNo);
    // Dentro de Mandar a resguardo (enAccion), el responsable es quien recibe: empieza en blanco y solo se elige entre
    // las personas de procesos; lo demás se llena con Capital Humano (usuario, 4-oct)
    const persona = (c) => (enAccion ? '' : (resp ? deResp(c, '') : v(columnaFicha_(c))));
    // Es una inspección normal: lo de la responsiva solo llega llenado y se puede cambiar (usuario, 6-oct; del 6-oct en la
    // mañana a la tarde quedaba fijo)
    const patronResp = resp && deResponsiva.patron !== undefined && deResponsiva.patron !== null ? String(deResponsiva.patron) : '';
    const tipo = v('TIPO').trim().toUpperCase();
    const esEquipo = tipo === 'EQUIPO';
    const req = { requerido: 'SIEMPRE' };
    const fijo = (extra) => Object.assign({ soloLectura: true }, extra);
    const elementos = [
      titulo_('EQUIPO', 'smartphone'),
      campo_('ID', 'ID', 'texto', { valor: id, soloLectura: true }),
      campo_('ID LINEA', 'ID LINEA', 'texto', { valor: v('IMEI') || v('ID'), soloLectura: true }),
      campo_('NUCO', 'NUCO', 'texto', fijo({ valor: LineasUtil.nucoVisible(v('NUCO')) || '' })),
      campo_('TIPO', 'Tipo', 'texto', fijo({ valor: v('TIPO'), controlaTipo: true })),
      campo_('MODELO', 'Modelo', 'texto', fijo({ valor: v('EQUIPO'), mostrar: 'NO_LINEA' })),
      campo_('IMEI', 'IMEI', 'texto', fijo({ valor: v('IMEI'), mostrar: 'NO_LINEA' })),
      campo_('COLOR', 'Color', 'listaAbierta', { valor: deResp('COLOR', v('COLOR')), opciones: catalogos.colores || [], mostrar: 'NO_LINEA', requerido: 'NO_LINEA' }),
      titulo_('LÍNEA', 'card-sim'),
      campo_('No TELEFONO', 'Número', 'texto', fijo({ valor: v('NUMERO TELEFONO'), mostrar: 'NO_EQUIPO' })),
      campo_('SIM', 'SIM', 'texto', fijo({ valor: v('NUMERO SIM'), mostrar: 'NO_EQUIPO' })),
      campo_('COMPAÑIA', 'Compañía', 'texto', fijo({ valor: esEquipo ? '' : v('COMPAÑIA'), mostrar: 'NO_EQUIPO' })),
      campo_('PLAN', 'Plan', 'texto', fijo({ valor: esEquipo ? '' : v('COSTO PLAN'), mostrar: 'NO_EQUIPO' })),
      campo_('RAZON SOCIAL', 'Razón social', 'texto', fijo({ valor: v('RAZON SOCIAL'), mostrar: 'NO_EQUIPO' })),
      titulo_('RESPONSABLE', 'user'),
    ].concat(camposResponsable_(catalogos, persona, { soloProcesos: !!enAccion }),
      // Los responsables adicionales (usuario, 6-oct): los del registro o, en Reasignar, los de la responsiva; se pueden
      // quitar o agregar. Al mandar a resguardo no hay (recibe procesos)
      enAccion ? [] : LineasRegistros.camposAdicionales((columna, etiqueta, control, extra) => campo_(columna, etiqueta, control, extra),
        (c) => (resp ? deResp(c, '') : v(c))));
    const agregarSeccion = (nombre) => {
      const s = LineasChecklist.secciones().filter((x) => x.seccion === nombre)[0];
      elementos.push(titulo_(s.seccion));
      s.puntos.filter((p) => p.mostrar !== 'NUNCA').forEach((p) => elementos.push(campo_(p.columna, ETIQUETAS_INSPECCION[p.columna] || p.etiqueta, 'escala', {
        escala: p.escala, opciones: LineasChecklist.ESCALAS[p.escala].valores, mostrar: p.mostrar, requerido: p.requerido, valor: '', checklist: true,
      })));
      // Los accesorios, con la lista de la responsiva en lugar de CUBO, CABLE, FUNDA y MICA SI/NO (usuario, 22-oct): los
      // del equipo (en Reasignar, los de la responsiva) y pasan a la ficha. Donde antes iban CUBO y CABLE: todo menos la línea
      if (nombre === 'DOCUMENTACIÓN / ACCESORIOS') elementos.push(campo_('ACCESORIOS', 'Accesorios', 'multi', Object.assign(listaAccesorios_(deResp('ACCESORIOS', v('ACCESORIOS'))), { mostrar: 'NO_LINEA' })));
    };
    ['DOCUMENTACIÓN / ACCESORIOS', 'SISTEMA', 'CONECTIVIDAD', 'ESTADO FÍSICO GENERAL', 'DESEMPEÑO'].forEach(agregarSeccion);
    elementos.push(
      titulo_('BLOQUEO Y CONTRASEÑAS'),
      // Mejora sobre el AppSheet: se precarga la de la línea (en AppSheet no tiene valor inicial y el bot,
      // al copiarla, borraba la contraseña guardada si el campo se dejaba vacío)
      campo_('CONTRASEÑA MODEM', 'Contraseña del módem', 'texto', { valor: v('CONTRASEÑA MODEM'), mostrar: 'MODEM', literal: true, secreto: true }),
      campo_('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', { valor: deResp('PIN WHATSAPP', v('PIN WHATSAPP')), mostrar: 'VOZ', literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: deResp('PIN EQUIPO', v('PIN EQUIPO')), mostrar: 'EQUIPOS', literal: true, secreto: true }),
      // El patrón trazado en la responsiva (en ella se guarda en CONTRASEÑA)
      campo_('PATRON', 'Patrón', 'patron', { valor: patronResp || v('PATRON'), mostrar: 'EQUIPOS', secreto: true })
    );
    agregarSeccion('APPS INSTALADAS');
    elementos.push(
      // Texto libre, sin lista (usuario, 4-oct)
      campo_('OTRA', 'Otra app', 'texto', { valor: '', mostrar: 'EQUIPOS' }),
      // El paso de firmas en tres partes (usuario, 4-oct)
      titulo_('DATOS DE LA INSPECCIÓN', 'calendar-check'),
      campo_('CALIFICACION', 'Calificación', 'calculado', { valor: '', soloLectura: true }),
      campo_('FECHA DE REGISTRO', 'Fecha de la inspección', 'fechaHora', Object.assign({ valor: Utilities.formatDate(ahora, ZONA, "yyyy-MM-dd'T'HH:mm") }, req)),
      campo_('TICKET', 'Ticket', 'texto', { valor: deResp('TICKET', '') }),
      // Un solo COMENTARIO (plan §5.2): se guarda en COMENTARIO (lo que imprime el PDF) y en el historial. Dentro de
      // una acción que ya pidió el suyo (mandar a resguardo, reasignar) no es obligatorio (usuario, 4-oct)
      titulo_('COMENTARIO', 'message-square-text'),
      campo_('COMENTARIO', 'Comentario', 'area', { valor: deResp('COMENTARIO', ''), requerido: enAccion || resp ? 'NUNCA' : 'SIEMPRE', valida: 'COMENTARIOS' }),
      titulo_('FIRMAS', 'signature'),
      // En el sistema solo firma el responsable principal (el de Capital Humano); los adicionales firman el PDF impreso
      // (usuario, 6-oct)
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
   * corregido queda en la responsiva y su PDF y pasa a la ficha (usuario, 16-oct, L2: la persona, modelo, IMEI,
   * accesorios, color, bloqueo y PIN de WhatsApp; guardarResponsivaEnCandado_). ID, ID LINEA, NUCO, la línea, FECHA
   * RESPONSIVA y NOMBRE CI siguen fijos.
   */
  /** Sugerencias de identificación en la responsiva (usuario, 4-oct: la lista traía números y textos sin sentido; se puede escribir otra). */
  const IDENTIFICACIONES = ['INE', 'LICENCIA DE CONDUCIR'];

  /**
   * RESPONSIVAS LINEAS_Form, ordenada como la inspección (usuario, 4-oct): Datos en Equipo, Línea y Responsable;
   * accesorios y accesos; y el paso de firmas en Datos de la responsiva, Comentario y Firmas. Los datos del equipo se
   * pueden corregir antes de firmar; los de la línea van fijos (16-oct).
   * La fecha es una sola, como en la inspección; DIA, MES y AÑO (los que usa el PDF) se sacan de ella al guardar.
   * Lleva al DIRECTOR y al JEFE DIRECTO de la persona, como la inspección (usuario, 19-oct; hasta el 19-oct solo el
   * director, como el AppSheet, y el jefe iba en la inspección; del 4 al 6-oct la responsiva guardó al jefe en DIRECTOR).
   */
  /**
   * Identificación de cada responsable (usuario, 9-oct; pendiente 2.27): fotos o PDF que se revisan antes de subir. No
   * es columna de RESPONSIVAS LINEAS: la pantalla la manda aparte (datos.identificaciones) y se guarda en la carpeta de
   * la responsiva y en APP_IDENTIFICACIONES (LineasIdentificaciones). Opcional. orden 0 = el principal, cuyo tipo es
   * IDENTIFICACION; los demás eligen el suyo en el mismo apartado.
   */
  const archivoIdentificacion_ = (orden, mostrar) => campo_('_IDENTIFICACION_' + orden, 'Identificación', 'identificacion',
    { valor: '', orden: orden, conTipo: orden > 0, opciones: orden > 0 ? IDENTIFICACIONES : undefined, mostrar: mostrar || 'SIEMPRE', virtual: true });
  function conIdentificacionAdicional_(elementos) {
    return elementos.reduce((a, e) => {
      a.push(e);
      const m = e.tipo === 'campo' && String(e.columna).match(/^NOMBRE (SEGUNDO|TERCER|CUARTO|QUINTO) RESPONSABLE$/);
      if (m) a.push(archivoIdentificacion_(ORDEN_ADICIONALES.indexOf(m[1]) + 1, e.mostrar));
      return a;
    }, []);
  }

  /** Columnas de la línea en la responsiva: con Vincular / Cambiar línea salen de la línea que se pone. */
  const COLUMNAS_DE_LINEA = ['NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'RAZON SOCIAL', 'PIN WHATSAPP'];

  function formularioResponsiva_(fila, catalogos, usuario, id, ahora, modo, lineaFila, sinEquipo) {
    // Vincular, Cambiar línea o Cambiar de equipo (etapa 3, 8-oct): la línea es la que se pone (lineaFila), fija, y la
    // persona es la que ya lo tiene (usuario, 16-oct): para cambiarla, primero la Responsiva
    const conLinea = String(modo || '').toUpperCase() === 'LINEA';
    const v = (c) => valorLinea_(lineaFila && COLUMNAS_DE_LINEA.indexOf(c) >= 0 ? lineaFila : fila, c);
    const acceso = (c) => v(c);
    // La responsiva es la acción (pendiente 2.49, usuario 16-oct): empieza con la persona que lo tiene (si firma ella,
    // es renovación); si está en resguardo o DISPONIBLE no tiene persona y se elige aquí (reasignación)
    const sinPersona = String(valorLinea_(fila, sinEquipo ? 'ESTATUS LINEA' : 'ESTATUS EQUIPO')).trim().toUpperCase() !== 'USO';
    const persona = (c) => (sinPersona ? '' : v(columnaFicha_(c)));
    const ro = (columna, etiqueta, valor) => campo_(columna, etiqueta, 'texto', { valor: valor, soloLectura: true });
    const ed = (columna, etiqueta, control, valor, extra) => campo_(columna, etiqueta, control, Object.assign({ valor: valor }, extra || {}));
    // La línea, fija (usuario, 16-oct: lo que pasa a la ficha es de la persona y del equipo): se cambia con Vincular o
    // Cambiar línea y un dato mal capturado se corrige con Editar línea
    const deLinea = (columna, etiqueta, valor) => ro(columna, etiqueta, valor);
    // La línea sin equipo (pendiente 2.45): solo la línea, fija (es la responsiva de esa línea; un dato mal capturado se
    // corrige con Editar línea), sin equipo ni accesorios y accesos
    const datos = sinEquipo ? [
      titulo_('LÍNEA', 'card-sim'),
      ro('ID', 'ID', id),
      ro('ID LINEA', 'ID LINEA', v('ID')),
      ro('No TELEFONO', 'Número', v('NUMERO TELEFONO')),
      ro('SIM', 'SIM', v('NUMERO SIM')),
      ro('COMPAÑIA', 'Compañía', v('COMPAÑIA')),
      ro('RAZON SOCIAL', 'Razón social', v('RAZON SOCIAL')),
    ] : [
      titulo_('EQUIPO', 'smartphone'),
      ro('ID', 'ID', id),
      ro('ID LINEA', 'ID LINEA', v('IMEI') || v('ID')),
      ro('NUCO', 'NUCO', LineasUtil.nucoVisible(v('NUCO')) || ''),
      // Modelo e IMEI se corrigen aquí y pasan a la ficha (usuario, 16-oct, L2; del 4 al 16-oct iban fijos). El equipo
      // sigue siendo el mismo: se guarda en su NUCO
      ed('MODELO', 'Modelo', 'texto', v('EQUIPO')),
      ed('IMEI', 'IMEI', 'texto', v('IMEI'), { literal: true }),
      campo_('COLOR', 'Color', 'listaAbierta', { valor: v('COLOR'), requerido: 'SIEMPRE', opciones: catalogos.colores || [] }),
      titulo_('LÍNEA', 'card-sim'),
      deLinea('No TELEFONO', 'Número', v('NUMERO TELEFONO')),
      deLinea('SIM', 'SIM', v('NUMERO SIM')),
      deLinea('COMPAÑIA', 'Compañía', v('COMPAÑIA')),
      // La razón social es de la línea (la del contrato), no del responsable (§3.3)
      deLinea('RAZON SOCIAL', 'Razón social', v('RAZON SOCIAL')),
    ];
    const accesos = sinEquipo ? [] : [
      titulo_('ACCESORIOS Y ACCESOS', 'key-round'),
      campo_('ACCESORIOS', 'Accesorios entregados', 'multi', listaAccesorios_(acceso('ACCESORIOS'))),
      campo_('PIN WHATSAPP', 'PIN de WhatsApp', 'texto', { valor: acceso('PIN WHATSAPP'), literal: true, secreto: true }),
      campo_('PIN EQUIPO', 'PIN EQUIPO', 'texto', { valor: acceso('PIN EQUIPO'), literal: true, secreto: true }),
      campo_('CONTRASEÑA', 'Patrón', 'patron', { valor: acceso('PATRON'), secreto: true }),
    ];
    // Los mismos datos del responsable que la inspección (19-oct, pendiente 2.54), más su identificación
    return datos.concat([titulo_('RESPONSABLE', 'user')], camposResponsable_(catalogos, persona, { personaFija: conLinea, identificacion: [
      campo_('IDENTIFICACION', 'Identificación', 'listaAbierta', { valor: '', requerido: 'SIEMPRE', opciones: IDENTIFICACIONES }),
      archivoIdentificacion_(0),
    ] })).concat(
      // Hasta cuatro responsables más (usuario, 6-oct), como en Editar; sin persona empiezan vacíos. Cada uno con su
      // identificación debajo de su nombre (usuario, 9-oct)
      conIdentificacionAdicional_(LineasRegistros.camposAdicionales((columna, etiqueta, control, extra) => campo_(columna, etiqueta, control, extra), persona)), accesos, [
      // Paso de firmas en tres partes, como la inspección (usuario, 4-oct)
      titulo_('DATOS DE LA RESPONSIVA', 'calendar-check'),
      campo_('FECHA RESPONSIVA', 'Fecha de la responsiva', 'fechaHora', { valor: Utilities.formatDate(ahora, ZONA, "yyyy-MM-dd'T'HH:mm"), requerido: 'SIEMPRE' }),
      // Sin columna en RESPONSIVAS: va al historial con el comentario
      campo_('TICKET', 'Ticket', 'texto', { valor: '' }),
      // Un solo COMENTARIO (plan §5.2): se guarda en COMENTARIO (lo que imprime el PDF) y en el historial
      titulo_('COMENTARIO', 'message-square-text'),
      campo_('COMENTARIO', 'Comentario', 'area', { valor: '', requerido: 'SIEMPRE', valida: 'COMENTARIOS' }),
      titulo_('FIRMAS', 'signature'),
      campo_('FIRMA RESPONSABLE', 'FIRMA RESPONSABLE', 'firma', { valor: '' }),
      ro('NOMBRE CI', 'NOMBRE RESPONSABLE DE CONTROL INTERNO', usuario.nombre || ''),
      campo_('FIRMA CI', 'FIRMA RESPONSABLE DE CONTROL INTERNO', 'firma', { valor: '', requerido: 'SIEMPRE' }),
    ]);
  }

  /**
   * Responsables adicionales de la inspección y la responsiva (6-oct). El PDF los muestra como el AppSheet: los nombres
   * juntos con « / ». En el sistema solo firma el principal, con su firma más chica para que los demás firmen el impreso.
   */
  const ORDEN_ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];
  const ADICIONALES = ORDEN_ADICIONALES.reduce((a, n) => a.concat(['NO EMPLEADO ' + n + ' RESPONSABLE', 'NOMBRE ' + n + ' RESPONSABLE']), []);
  /** Los bloques que se quitaron se borran (la pantalla solo los oculta) y la cuenta no se guarda. */
  function limpiarAdicionales_(valores) {
    const cuenta = LineasRegistros.CUENTA_ADICIONALES;
    if (!Object.prototype.hasOwnProperty.call(valores, cuenta)) return;
    const k = Number(String(valores[cuenta] || '').trim()) || 0;
    ORDEN_ADICIONALES.forEach((n, i) => { if (i >= k) { valores['NO EMPLEADO ' + n + ' RESPONSABLE'] = ''; valores['NOMBRE ' + n + ' RESPONSABLE'] = ''; } });
    delete valores[cuenta];
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
    const obj = exigirEquipoParaInspeccion_(objetivoCaptura_(ref), ref);
    LineasDG.exigirAdmin(obj.fila, usuario); // Dirección General: solo ADMIN (pendiente 8.16)
    const ahora = new Date();
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoId(LineasRepo.TAB.INSP),
      formulario: null, inspector: usuario.nombre, condiciones: LineasChecklist.CONDICIONES, firmaGuardada: LineasFirmas.tiene(usuario.correo), nombresPropios: nombresConFirma_(usuario),
      _armar: (id) => ocultarSecretos_(formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, !!(ref && ref.enAccion),
        ref && ref.reasignar ? ref.desdeResponsiva : null), puedeVerSecretos),
    };
  }

  /** La línea que se pone con Vincular, Cambiar línea o Cambiar de equipo (ref.lineaNueva = su registro), o null. */
  function lineaDeRef_(ref) {
    return ref && ref.lineaNueva ? LineasRepo.leerRegistroObligatorio(String(ref.lineaNueva), 'la línea') : null;
  }

  function contextoResponsiva(ref, usuario, puedeVerSecretos) {
    const obj = objetivoCaptura_(ref);
    LineasDG.exigirAdmin(obj.fila, usuario); // Dirección General: solo ADMIN (pendiente 8.16)
    if (!obj.equipo) numeroParaResponsiva_(obj);
    // Lo vendido, desechado, robado o la línea cancelada ya no se entrega (usuario, 16-oct); Vincular ya lo revisó
    if (!(ref && String(ref.modo || '').toUpperCase() === 'LINEA')) LineasAcciones.exigirEstatusParaResponsiva(obj.fila, !!obj.equipo, !!(ref && ref.desdeCorregir));
    const ahora = new Date();
    const lineaFila = lineaDeRef_(ref);
    return {
      equipo: obj.equipo, linea: obj.linea, idPropuesto: LineasDatos.nuevoId(LineasRepo.TAB.RESP), nombreCI: usuario.nombre,
      firmaGuardada: LineasFirmas.tiene(usuario.correo), nombresPropios: nombresConFirma_(usuario),
      _armar: (id) => ocultarSecretos_(formularioResponsiva_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, ref && ref.modo, lineaFila, !obj.equipo), puedeVerSecretos),
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
    // La identificación (archivo) no es un valor del formulario: llega aparte (datos.identificaciones)
    const campos = elementos.filter((e) => e.tipo === 'campo' && e.control !== 'identificacion');
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
      // Comentario con contexto (más de 3 caracteres: «N/A» no), la misma regla que las acciones (usuario, 8-oct)
      if (e.valida === 'COMENTARIOS' && valor.length <= 3) errores.push(e.etiqueta + ': ESCRIBE MÁS DE 3 CARACTERES');
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
    // Número de empleado y director, desde que la inspección los pide como la responsiva (19-oct, pendiente 2.54)
    ['NO EMPLEADO', 'No EMPLEADO'], ['DIRECTOR', 'DIRECTOR'],
    ['CUENTA GOOGLE', 'CORREO'], ['PIN WHATSAPP', 'PIN WHATSAPP'], ['PIN EQUIPO', 'PIN EQUIPO'], ['PATRON', 'PATRON'],
    ['CONTRASEÑA MODEM', 'CONTRASEÑA MODEM'],
  ];
  /** Lo que no es de la persona: en Reasignar es lo único que la inspección pasa al inventario. */
  const ACCESOS_INSPECCION = ['PIN WHATSAPP', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM'];

  /** opciones.sinIndice: quien llama refresca el índice después (Mandar a resguardo con la inspección, 13-oct). */
  function guardarInspeccion(datos, usuario, puedeVerSecretos, opciones) {
    LineasUtil.exigirPinEquipo(datos);
    const ref = { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (datos.usarFirmaGuardada) datos.firmaInspectorBase64 = firmaPropia_(usuario);
    if (datos.usarFirmaGuardadaResponsable) datos.firmaResponsableBase64 = firmaResponsablePropia_(usuario, (datos.valores || {})['RESPONSABLE']);
    if (!datos.firmaInspectorBase64) throw new Error('FIRMA INSPECTOR es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoId(LineasRepo.TAB.INSP);
    // Las fotos son opcionales: la carpeta existe solo si se subió alguna
    if (datos.carpetaId) LineasEvidencias.validarArchivosEnCarpeta((datos.fotos || []).map((f) => f.id), [datos.carpetaId, datos.fotosCarpetaId].filter(Boolean));

    const res = LineasDatos.conCandado(() => {
      const ahora = new Date();
      const t0 = Date.now();
      const obj = exigirEquipoParaInspeccion_(objetivoCaptura_(ref), datos);
      LineasDG.exigirAdmin(obj.fila, usuario);
      const elementos = formularioInspeccion_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, !!datos.enAccion, datos.reasignar ? datos.desdeResponsiva : null)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      marca_('inspección · registro y formulario', t0);
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.slice(0, 6).join(' · ') + (r.errores.length > 6 ? '…' : ''));
      const valores = r.valores;
      // PATRON: puntos trazados en el sistema ("1-2-3") o el valor que ya tenía la línea
      if (datos.patron !== undefined && datos.patron !== null) valores['PATRON'] = String(datos.patron);
      if (LineasUtil.bloqueoSinPatron(datos)) valores['PATRON'] = '';
      limpiarAdicionales_(valores);
      const fechaRegistro = valores['FECHA DE REGISTRO'] ? new Date(valores['FECHA DE REGISTRO']) : ahora;
      const calificacion = LineasChecklist.calificacion(valores);

      // 1) Fila en INSPECCIONES LINEAS con las columnas del AppSheet (las firmas, como imágenes del AppSheet).
      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.nucoVisible(valores['NUCO']) || '', 'FECHA DE REGISTRO': isNaN(fechaRegistro) ? ahora : fechaRegistro,
        'CALIFICACION': calificacion, 'NOMBRE INSPECTOR': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA INSPECTOR': '',
      });
      if (ADICIONALES.some((c) => fila[c])) LineasDatos.asegurarColumnas(LineasRepo.TAB.INSP, ADICIONALES);
      // Las columnas que la hoja del AppSheet no tiene (19-oct, pendiente 2.54) se agregan con el primero que las trae
      const nuevas = COLUMNAS_NUEVAS.INSPECCION.filter((c) => fila[c]);
      if (nuevas.length) LineasDatos.asegurarColumnas(LineasRepo.TAB.INSP, nuevas);
      LineasDatos.agregarFilas(LineasRepo.TAB.INSP, [fila]);

      // 2) Bot ACTUALIZAR DESDE INSPECCION: copia a la línea (la bitácora la deja guardarCambiosRegistro).
      // FECHA INSPECCION es Date (sin hora) en LINEAS TELEFONICAS
      const fr = fila['FECHA DE REGISTRO'];
      const copia = { 'FECHA INSPECCION': new Date(fr.getFullYear(), fr.getMonth(), fr.getDate()) };
      // En Mandar a resguardo (enAccion) el responsable de la inspección es quien recibe, no quien lo tenía: no se copia
      // nada de la persona al inventario (el resguardo la deja en blanco); solo la fecha y el color. En Reasignar, solo los
      // accesos: la persona (con los adicionales y el jefe directo de esta inspección) la pone la reasignación, que viene
      // después (si la copiaba la inspección, Reasignar fallaba con «ya lo tiene», 6-oct)
      const copiar = ([destino, origen]) => { copia[destino] = valores[origen] === undefined ? '' : valores[origen]; };
      if (datos.reasignar) COPIA_INSPECCION_A_LINEA.filter(([d]) => ACCESOS_INSPECCION.indexOf(d) >= 0).forEach(copiar);
      else if (!datos.enAccion) COPIA_INSPECCION_A_LINEA.concat(ADICIONALES.map((c) => [c, c])).forEach(copiar);
      // El color es del aparato (EQUIPOS): la inspección lo actualiza si trae uno (decisión del usuario, 3-oct)
      if (String(valores['COLOR'] || '').trim()) copia['COLOR'] = valores['COLOR'];
      // Los accesorios también (usuario, 22-oct), como en la responsiva: lo que quedó marcado, aunque sea nada
      if (LineasChecklist.cumple('NO_LINEA', valores['TIPO'] || '')) copia['ACCESORIOS'] = valores['ACCESORIOS'] || '';
      // tolerante: lo que no tiene dónde guardarse en las hojas nuevas (p. ej. la persona de un equipo guardado) se ignora
      const t1 = Date.now();
      const g = LineasRepo.guardarCambiosRegistro(obj.fila, copia, usuario, ahora, { tolerante: true });
      marca_('inspección · guardar el registro', t1);

      // 3) Evidencia del sistema nuevo (carpeta y fotos) y movimiento.
      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'TIPO': 'INSPECCION', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': datos.carpetaId || '', 'RUTA': datos.ruta || '', 'FOTOS_CARPETA_ID': datos.fotosCarpetaId || '',
        'FOTOS': String((datos.fotos || []).length), 'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE',
        'ALERTAS_JSON': '[]', 'ID_ANTERIOR': '', 'ACTUALIZADO_EN': ahora,
      }]);
      LineasRepo.registrarMovimiento('INSPECCION', { motivo: valores['COMENTARIO'] || '', ticket: valores['TICKET'] }, usuario, ahora, {
        refs: [obj.reg.id].concat(g.refs || []), nuco: obj.reg.nuco, numero: valores['No TELEFONO'],
        antes: { estado: obj.equipo ? resumenEquipo_(obj.equipo) : resumenLinea_(obj.linea) },
        despues: { calificacion: calificacion },
        detalle: Object.assign(detalleCambios_([g]), { inspeccionId: id }),
      });
      return { obj: obj, calificacion: calificacion };
    });

    // sinResponsable: no firmó al capturar; al generar el PDF después no se le pide (usuario, 22-oct)
    firmasCache_('INSPECCION', id, { inspector: datos.firmaInspectorBase64, responsable: datos.firmaResponsableBase64 || null, patron: datos.patronBase64 || null,
      sinResponsable: !datos.firmaResponsableBase64 });
    const t2 = Date.now();
    const filas = opciones && opciones.sinIndice ? null : LineasRepo.refrescarIndice([res.obj.reg.id]);
    marca_('inspección · refrescar el índice', t2);
    return { id: id, calificacion: res.calificacion, pdfPendiente: true, filas: filas };
  }

  // ======================================================================
  // Responsiva
  // ======================================================================

  /**
   * accion (LineasAcciones.responsiva y vincular): { ref, modo, aplicar(ahora, valores) → { id } }. Primero se revisa la
   * responsiva; si está bien, se hace la acción (aplicar) y la responsiva se guarda en el registro, todo dentro del
   * mismo candado.
   */
  function guardarResponsiva(datos, usuario, puedeVerSecretos, accion) {
    LineasUtil.exigirPinEquipo(datos);
    const ref = accion ? accion.ref : { equipoId: datos.equipoId || null, lineaId: datos.equipoId ? null : datos.lineaId };
    if (datos.usarFirmaGuardada) datos.firmaCiBase64 = firmaPropia_(usuario);
    if (datos.usarFirmaGuardadaResponsable) datos.firmaResponsableBase64 = firmaResponsablePropia_(usuario, (datos.valores || {})['RESPONSABLE']);
    if (!datos.firmaCiBase64) throw new Error('FIRMA RESPONSABLE DE CONTROL INTERNO es obligatorio');
    const id = /^[\w-]{6,40}$/.test(String(datos.id || '')) ? String(datos.id) : LineasDatos.nuevoId(LineasRepo.TAB.RESP);
    // Identificación de cada responsable (usuario, 9-oct): se escribe antes, en la carpeta de la responsiva; si la
    // responsiva no se guarda, se manda a la papelera
    const enviados = datos.valores || {};
    const identificaciones = LineasIdentificaciones.revisar(datos.identificaciones, enviados);
    const objetivo = objetivoCaptura_(ref);
    const fecha = LineasIdentificaciones.fechaDe(enviados['FECHA RESPONSIVA']);
    // La línea sin equipo (pendiente 2.45): su carpeta en LINEAS se crea antes, como la de las identificaciones, y el
    // PDF va ahí (APP_EVIDENCIAS la liga); si la responsiva no se guarda, se manda a la papelera
    const carpetaLinea = objetivo.equipo ? null
      : LineasArchivos.carpetaEvidenciaLinea(objetivo.reg.id, numeroParaResponsiva_(objetivo), fecha);
    const escritos = identificaciones.length
      ? LineasIdentificaciones.escribir(identificaciones, LineasUtil.col(objetivo.fila, 'NUCO'), fecha, PDF.RESPONSIVA.carpeta, carpetaLinea)
      : (carpetaLinea ? { carpetaId: carpetaLinea.carpetaId, ruta: carpetaLinea.ruta, archivos: [] } : null);

    let res;
    try {
      res = guardarResponsivaEnCandado_(datos, usuario, puedeVerSecretos, accion, ref, id, escritos);
    } catch (e) {
      LineasIdentificaciones.descartar(escritos);
      throw e;
    }

    firmasCache_('RESPONSIVA', id, { responsable: datos.firmaResponsableBase64 || null, ci: datos.firmaCiBase64, patron: datos.patronBase64 || null,
      sinResponsable: !datos.firmaResponsableBase64 });
    const filas = LineasRepo.refrescarIndice([res.obj.reg.id]);
    return { id: id, pdfPendiente: true, filas: filas, hecho: res.hecho, registroId: res.obj.reg.id,
      identificaciones: escritos ? escritos.archivos.length : 0 };
  }

  function guardarResponsivaEnCandado_(datos, usuario, puedeVerSecretos, accion, ref, id, escritos) {
    return LineasDatos.conCandado(() => {
      const ahora = new Date();
      let obj = objetivoCaptura_(ref);
      const sinEquipo = !obj.equipo;
      const elementos = formularioResponsiva_(obj.fila, LineasRepo.catalogos(), usuario, id, ahora, accion ? accion.modo : '', accion ? accion.lineaFila || null : null, sinEquipo)
        .map((e) => (e.secreto && !puedeVerSecretos ? Object.assign({}, e, { valorOculto: true }) : e));
      const ocultos = {};
      elementos.forEach((e) => { if (e.secreto) ocultos[e.columna] = e.valor; });
      const r = validarFormulario_(elementos, datos.valores || {}, ocultos);
      if (r.errores.length) throw new Error(r.errores.join(' · '));
      const valores = r.valores;
      if (sinEquipo) Object.assign(valores, SIN_EQUIPO);
      if (!sinEquipo && datos.patron !== undefined && datos.patron !== null) valores['CONTRASEÑA'] = String(datos.patron);
      if (!sinEquipo && LineasUtil.bloqueoSinPatron(datos)) valores['CONTRASEÑA'] = '';
      // Una sola fecha (como la inspección); el PDF sigue usando DIA, MES y AÑO
      const fechaDoc = valores['FECHA RESPONSIVA'] ? new Date(valores['FECHA RESPONSIVA']) : ahora;
      const fechaResp = isNaN(fechaDoc) ? ahora : fechaDoc;
      valores['FECHA RESPONSIVA'] = fechaResp;
      valores['DIA'] = Utilities.formatDate(fechaResp, ZONA, 'd');
      valores['MES'] = MESES[Number(Utilities.formatDate(fechaResp, ZONA, 'M')) - 1];
      valores['AÑO'] = Utilities.formatDate(fechaResp, ZONA, 'yyyy');
      limpiarAdicionales_(valores);
      // Bot MAYUSCULAS
      valores['IDENTIFICACION'] = String(valores['IDENTIFICACION'] || '').toUpperCase();
      valores['COMENTARIO'] = String(valores['COMENTARIO'] || '').toUpperCase();
      // La responsiva está completa: ahora sí la acción, y la responsiva queda en el registro
      const hecho = accion ? accion.aplicar(ahora, valores) : null;
      if (hecho) obj = objetivoCaptura_(ref);

      // ID LINEA es el registro (el equipo, o la línea sin equipo); ID LINEA ENTREGADA, la línea que se entregó ese día
      // (pendiente 2.45): con ella la ficha de la línea encuentra las responsivas que firmó dentro de un equipo
      const fila = Object.assign({}, valores, {
        'ID': id, 'ID LINEA': obj.reg.id, 'NUCO': LineasUtil.nucoVisible(valores['NUCO']) || '', 'TIPO CONTRASEÑA': '',
        'NOMBRE CI': usuario.nombre, 'FIRMA RESPONSABLE': '', 'FIRMA CI': '',
        [LineasRepo.COL_LINEA_ENTREGADA]: obj.linea ? obj.linea.idLinea || obj.reg.id : '',
      });
      if (ADICIONALES.some((c) => fila[c])) LineasDatos.asegurarColumnas(LineasRepo.TAB.RESP, ADICIONALES);
      if (fila[LineasRepo.COL_LINEA_ENTREGADA]) LineasDatos.asegurarColumnas(LineasRepo.TAB.RESP, [LineasRepo.COL_LINEA_ENTREGADA]);
      const nuevas = COLUMNAS_NUEVAS.RESPONSIVA.filter((c) => fila[c]);
      if (nuevas.length) LineasDatos.asegurarColumnas(LineasRepo.TAB.RESP, nuevas);
      LineasDatos.agregarFilas(LineasRepo.TAB.RESP, [fila]);
      // Todo lo de la responsiva pasa a la ficha (usuario, 16-oct, L2; pendiente 2.49): la persona y, en un equipo, el
      // modelo, el IMEI, los accesorios, el color, el bloqueo y el PIN de WhatsApp. Si firmó otra persona, la acción ya la
      // puso (LineasAcciones.responsiva) y aquí no cambia nada; si es la misma, se corrige en la misma asignación
      // (corregir). En Vincular la persona va fija. La línea sin equipo solo pasa la persona
      const copia = {};
      LineasAcciones.PERSONA_DE_RESPONSIVA.forEach(([destino, origen]) => { if (origen in valores) copia[destino] = valores[origen]; });
      if (!sinEquipo) {
        copia['EQUIPO'] = valores['MODELO'] || '';
        copia['IMEI'] = valores['IMEI'] || '';
        copia['ACCESORIOS'] = valores['ACCESORIOS'] || '';
        // El color es del aparato (EQUIPOS): la responsiva lo actualiza, igual que la inspección (decisión del usuario, 3-oct)
        if (String(valores['COLOR'] || '').trim()) copia['COLOR'] = valores['COLOR'];
        // El patrón trazado (o borrado) en la responsiva también pasa al equipo, como el de la inspección (usuario, 5-oct);
        // PIN EQUIPO solo si dice PATRON. Sin trazar, datos.patron no llega y el del equipo se queda igual
        if (datos.patron !== undefined && datos.patron !== null) {
          copia['PATRON'] = String(datos.patron);
          if (String(valores['PIN EQUIPO'] || '').trim().toUpperCase() === 'PATRON') copia['PIN EQUIPO'] = 'PATRON';
        }
        // Con PIN, contraseña o sin bloqueo, el patrón del equipo se borra y su PIN EQUIPO queda el de la responsiva
        if (LineasUtil.bloqueoSinPatron(datos)) { copia['PATRON'] = ''; copia['PIN EQUIPO'] = valores['PIN EQUIPO'] || ''; }
        // El PIN de WhatsApp (del equipo con línea desde el 13-oct, pendiente 2.25) pasa de la responsiva al registro, como el de la inspección (usuario, 13-oct: el
        // NUCO 1712 se vinculó con su responsiva el 12-oct y el PIN se quedó el de antes hasta corregirlo con Editar)
        if (obj.linea && 'PIN WHATSAPP' in valores) copia['PIN WHATSAPP'] = valores['PIN WHATSAPP'];
      }
      const g = Object.keys(copia).length ? LineasRepo.guardarCambiosRegistro(obj.fila, copia, usuario, ahora, { tolerante: true, corregir: true }) : null;

      // Con identificación, la carpeta de la responsiva ya existe (la suya): su PDF se guarda ahí (destinoPdf_)
      LineasRepo.asegurarPestanaApp(LineasRepo.TAB.APP_EVID);
      LineasDatos.agregarFilas(LineasRepo.TAB.APP_EVID, [{
        'TIPO': 'RESPONSIVA', 'ORIGEN': 'SISTEMA', 'ID_REGISTRO': id, 'ID_LINEA': obj.reg.id, 'NUCO': sinEquipo ? '' : obj.reg.nuco || '',
        'FECHA': ahora, 'CARPETA_ID': escritos ? escritos.carpetaId : '', 'RUTA': escritos ? escritos.ruta : '', 'FOTOS': '0',
        'PDFS_JSON': '[]', 'COINCIDENCIA_EXACTA': 'TRUE', 'ACTUALIZADO_EN': ahora,
      }]);
      // Sin equipo, el NUCO del registro es el de su equipo anterior: no es de esta responsiva
      LineasIdentificaciones.registrar(escritos, id, sinEquipo ? Object.assign({}, obj.reg, { nuco: '' }) : obj.reg, usuario, ahora);
      LineasRepo.registrarMovimiento('RESPONSIVA', { motivo: valores['COMENTARIO'] || '', ticket: valores['TICKET'] || '' }, usuario, ahora, {
        refs: [obj.reg.id].concat(g ? g.refs || [] : []), nuco: sinEquipo ? null : obj.reg.nuco, numero: valores['No TELEFONO'] || null,
        antes: {}, despues: { responsable: { nombre: valores['RESPONSABLE'] || null } },
        detalle: Object.assign(detalleCambios_(g ? [g] : []), { responsivaId: id }),
      });
      return { obj: obj, hecho: hecho };
    });
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
    if (!ev || ev.origen !== 'SISTEMA') return null;
    LineasRepo.revisarPdfsLigados([ev]); // Regenerar: la versión nueva va al PDF que sí está en la carpeta (pendiente 2.18)
    return ev;
  }

  /** Registro para la plantilla: la fila con los formatos que muestra el AppSheet. */
  function registroPlantilla_(fila) {
    const registro = {};
    Object.keys(fila).forEach((k) => { if (k !== '_fila') registro[k] = fila[k]; });
    // Responsiva con más de un responsable: como el AppSheet, los nombres y los números de empleado juntos con « / »
    const nombres = ORDEN_ADICIONALES.map((n) => String(fila['NOMBRE ' + n + ' RESPONSABLE'] || '').trim()).filter(Boolean);
    if (nombres.length) {
      registro['RESPONSABLE'] = [String(fila['RESPONSABLE'] || '').trim()].concat(nombres).filter(Boolean).join(' / ');
      registro['No EMPLEADO'] = [String(fila['No EMPLEADO'] || '').trim()].concat(ORDEN_ADICIONALES.map((n) => String(fila['NO EMPLEADO ' + n + ' RESPONSABLE'] || '').trim()))
        .filter(Boolean).join(' / ');
    }
    if ('CALIFICACION' in registro) registro['CALIFICACION'] = LineasChecklist.calificacionTexto(registro['CALIFICACION']);
    // Responsiva: la plantilla pone «<<[CONTRASEÑA]>><<[PIN EQUIPO]>>»; con patrón, solo su imagen, sin la palabra PATRON
    // (usuario, 6-oct: como la inspección)
    if ('CONTRASEÑA' in registro && String(registro['CONTRASEÑA'] || '').trim() && /^PATR[OÓ]N$/i.test(String(registro['PIN EQUIPO'] || '').trim())) registro['PIN EQUIPO'] = '';
    // La línea sin equipo: la plantilla pone RIGHT("000" & [NUCO], 4), que sin NUCO daría «000» (pendiente 2.45)
    if (responsivaSinEquipo_(fila)) registro._fijas = { 'NUCO': 'NO APLICA' };
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
    // La responsiva de la línea sin equipo: la carpeta de su línea en LINEAS (pendiente 2.45), «RESP <NÚMERO> DD MM.pdf»
    if (ev.carpetaId && LineasArchivos.enLineas(ev.carpetaId)) {
      const carpeta = DriveApp.getFolderById(ev.carpetaId);
      const m = carpeta.getName().match(/^RESP\s+(\d{1,2})\s+(\d{1,2})/i);
      const ddmm = m ? m[1] + ' ' + m[2] : Utilities.formatDate(ev.fecha || new Date(), ZONA, 'dd MM');
      const numero = LineasUtil.digitos(LineasUtil.col(fila, 'No TELEFONO'));
      return { carpeta: carpeta, nombre: prefijo + (numero || 'SIN NUMERO') + ' ' + ddmm + '.pdf', enNucos: true, nuco: null };
    }
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

  /**
   * La responsiva de una línea sin equipo firmada antes de la v122 (pendiente 2.48, usuario 16-oct: la de la línea
   * 4461456715, del 14-oct): sin «NO APLICA» ni carpeta, al regenerar salía como de equipo (NUCO «0000», en `Files`, con
   * lo del equipo en blanco). Antes de hacer el PDF se deja como las de ahora: la fila con SIN_EQUIPO, su carpeta en
   * LINEAS (ligada en APP_EVIDENCIAS), su identificación movida ahí y los PDF de antes en `Files` a la papelera; el PDF
   * nuevo se liga solo (generarPdf). Regresa la ruta de `Files` que dejó, o '' si la responsiva ya estaba bien.
   */
  function pasarALineas_(fila, ev, id) {
    const lineaId = String(LineasUtil.col(fila, 'ID LINEA') || '').trim();
    if (!/^LIN-/i.test(lineaId) || (responsivaSinEquipo_(fila) && ev.carpetaId && LineasArchivos.enLineas(ev.carpetaId))) return '';
    const fr = LineasUtil.col(fila, 'FECHA RESPONSIVA');
    const fecha = fr instanceof Date && !isNaN(fr) ? fr : (ev.fecha || new Date());
    const c = LineasArchivos.carpetaEvidenciaLinea(lineaId, LineasUtil.col(fila, 'No TELEFONO'), fecha);
    LineasDatos.conCandado(() => {
      const filas = LineasDatos.buscarFilasPorId(LineasRepo.TAB.RESP, id);
      if (filas.length) LineasDatos.actualizarFila(LineasRepo.TAB.RESP, filas[0], SIN_EQUIPO);
      if (ev._fila) LineasDatos.actualizarFila(LineasRepo.TAB.APP_EVID, ev._fila, { 'CARPETA_ID': c.carpetaId, 'RUTA': c.ruta, 'ACTUALIZADO_EN': new Date() });
    });
    Object.assign(fila, SIN_EQUIPO);
    ev.carpetaId = c.carpetaId;
    ev.ruta = c.ruta;
    const carpeta = DriveApp.getFolderById(c.carpetaId);
    LineasIdentificaciones.deResponsiva(LineasDatos.idsDeFila(fila)).forEach((x) => DriveApp.getFileById(x.id).moveTo(carpeta));
    // Los PDF que dejó en `Files` cada intento (con el nombre del AppSheet: solo los de esta responsiva)
    const viejos = LineasArchivos.carpetaDeApp(PDF.RESPONSIVA.carpeta).getFilesByName(PDF.RESPONSIVA.nombre(id));
    while (viejos.hasNext()) viejos.next().setTrashed(true);
    return PDF.RESPONSIVA.carpeta + '/' + PDF.RESPONSIVA.nombre(id);
  }

  /**
   * Genera el PDF de una inspección o responsiva capturada en el sistema. `forzar` = Regenerar PDF (usuario, 5-oct): se
   * vuelve a hacer con la plantilla y los datos de la hoja, sin capturar de nuevo, y queda como versión nueva del MISMO
   * archivo (mismo enlace; la anterior se conserva en el historial de versiones de Drive, como Subir PDF firmado).
   * Firmas: las de la captura (caché 6 h) o `firmasNuevas`. Sin ellas regresa { faltanFirmas, nombres } y se vuelven a
   * firmar (no se guardan como archivos, acuerdo del 18-sep); sin la del responsable, { faltanFirmas, soloResponsable }. El patrón, si ya no está su imagen, se dibuja con sus puntos.
   */
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

    let firmas = firmasCache_(tipo, id, firmasNuevas);
    const col = (c) => LineasUtil.col(fila, c);
    // Sin la firma de Control Interno en caché (p. ej. Regenerar pasadas 6 h): si quien regenera es quien hizo el documento
    // y tiene firma guardada, se usa la suya
    const rolCI = esInspeccion ? 'inspector' : 'ci';
    const nombreCI = String(col(esInspeccion ? 'NOMBRE INSPECTOR' : 'NOMBRE CI') || '').trim().toUpperCase();
    if ((!firmas || !firmas[rolCI]) && usuario && nombreCI && nombreCI === String(usuario.nombre || '').trim().toUpperCase()) {
      const propia = LineasFirmas.png(usuario.correo);
      if (propia) firmas = firmasCache_(tipo, id, { [rolCI]: propia });
    }
    // Lo mismo con la del responsable, si es quien regenera (usuario, 19-oct) y ya está la de Control Interno
    if (firmas && firmas[rolCI] && !firmas.responsable && usuario && nombresPropios_(usuario).indexOf(nombreDeFirma_(col('RESPONSABLE'))) >= 0) {
      const propia = LineasFirmas.png(usuario.correo);
      if (propia) firmas = firmasCache_(tipo, id, { responsable: propia });
    }
    if (!firmas && !col(esInspeccion ? 'FIRMA INSPECTOR' : 'FIRMA CI')) {
      return { faltanFirmas: true, nombres: esInspeccion
        ? { inspector: col('NOMBRE INSPECTOR') || '', responsable: col('RESPONSABLE') || '' }
        : { ci: col('NOMBRE CI') || '', responsable: col('RESPONSABLE') || '' } };
    }
    // La del responsable se perdió (caché vencida, o no cupo, como una foto de la firma; usuario, 22-oct): se pide solo esa
    // en vez de sacar el recuadro vacío. No con firmas nuevas (las de la captura, o ya se pidió) ni si al capturar no firmó
    if (!firmasNuevas && firmas && firmas[rolCI] && !firmas.responsable && !firmas.sinResponsable && col('RESPONSABLE') && !col('FIRMA RESPONSABLE')) {
      return { faltanFirmas: true, soloResponsable: true, nombres: { responsable: col('RESPONSABLE') || '' } };
    }
    // Firmas: las de la captura o las nuevas; si la fila trae una ruta de imagen (AppSheet), se busca en la carpeta de la app
    const archivo = (c) => LineasArchivos.blob(col(c));
    const imagen = (clave, c, nombre) => (firmas && firmas[clave] ? blobBase64_(firmas[clave], nombre) : archivo(c));
    const colPatron = esInspeccion ? 'PATRON' : 'CONTRASEÑA';
    // Con un PIN o una contraseña en PIN EQUIPO, el patrón que quedó de antes no va en el PDF (usuario, 9-oct)
    const rutaPatron = LineasUtil.patronVigente(col('PIN EQUIPO'), col(colPatron));
    const patron = firmas && firmas.patron ? blobBase64_(firmas.patron, 'patron.png')
      : (rutaPatron ? LineasPatronPng.blob(rutaPatron, esInspeccion ? '#ddebf7' : '#ffffff') || LineasArchivos.blob(rutaPatron) : null);
    // Con responsables adicionales, la firma del principal va más chica: los demás firman el PDF impreso en la misma línea
    const nombreFirmaResponsable = ORDEN_ADICIONALES.some((n) => col('NOMBRE ' + n + ' RESPONSABLE')) ? 'firma-principal.png' : 'firma-responsable.png';
    const destino = PDF[tipo];
    const deFiles = esInspeccion ? '' : pasarALineas_(fila, ev, id);
    const d = destinoPdf_(tipo, fila, ev, id);
    const carpeta = d.carpeta;
    const nombre = d.nombre;
    const imagenes = esInspeccion
      ? { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', nombreFirmaResponsable), 'FIRMA INSPECTOR': imagen('inspector', 'FIRMA INSPECTOR', 'firma-inspector.png'), 'PATRON': patron }
      : { 'FIRMA RESPONSABLE': imagen('responsable', 'FIRMA RESPONSABLE', nombreFirmaResponsable),
        'FIRMA CI': imagen('ci', 'FIRMA CI', 'firma-ci.png'), 'CONTRASEÑA': patron };
    const anterior = forzar ? pdfVigente_(ev) : null;
    try {
      const tp = Date.now();
      const pdf = LineasPdf.generarPdfDesdePlantilla(
        esInspeccion ? LineasPdf.plantillaInspeccion(fila) : LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR,
        registroPlantilla_(fila), imagenes, carpeta, nombre, d.enNucos);
      marca_('pdf · copiar la plantilla y convertir', tp);
      if (d.enNucos) LineasArchivos.olvidarNuco(d.nuco);
      if (anterior) {
        const nuevo = DriveApp.getFileById(pdf.id);
        LineasArchivos.reemplazarPdf(anterior.getId(), nuevo.getBlob().getBytes());
        nuevo.setTrashed(true);
        LineasDatos.conCandado(() => LineasRepo.registrarMovimiento('PDF_REGENERADO', { motivo: '' }, usuario, new Date(), {
          refs: [col('ID LINEA')], nuco: col('NUCO'),
          detalle: Object.assign(esInspeccion ? { inspeccionId: id } : { responsivaId: id }, { cambios: [{ campo: 'PDF', antes: '', despues: anterior.getName() }] }),
        }));
        return { id: anterior.getId(), nombre: anterior.getName(), url: anterior.getUrl(), avisos: pdf.avisos };
      }
      const ruta = d.enNucos ? 'https://drive.google.com/file/d/' + pdf.id + '/view' : destino.carpeta + '/' + nombre;
      LineasDatos.conCandado(() => {
        ligarPdf_(tabla, destino.columna, ids, pdf, ruta);
        // La responsiva que pasó de `Files` a LINEAS queda en el historial
        if (deFiles) LineasRepo.registrarMovimiento('PDF_REGENERADO', { motivo: '' }, usuario, new Date(), {
          refs: [col('ID LINEA')], nuco: null,
          detalle: { responsivaId: id, cambios: [{ campo: 'PDF', antes: deFiles, despues: (ev.ruta || '') + '/' + pdf.nombre }] },
        });
      });
      return pdf;
    } catch (e) {
      console.error('generarPdf ' + tipo + ' (' + id + '): ' + e.message);
      throw new Error('No se pudo generar el PDF de la ' + (esInspeccion ? 'inspección' : 'responsiva') + ': ' + e.message);
    }
  }

  /** El PDF ligado al documento, si sigue en Drive (fuera de la papelera); al regenerar se le pone la versión nueva. */
  function pdfVigente_(ev) {
    const p = (ev.pdfs || [])[0];
    if (!p) return null;
    try {
      const f = DriveApp.getFileById(p.id);
      return f.isTrashed() ? null : f;
    } catch (e) {
      return null;
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
   * También las del AppSheet y las de la carpeta NUCOS (usuario, 5-oct: se sigue trabajando con registros de antes):
   * su PDF de NUCOS (Documentos le junta a la del AppSheet la carpeta de NUCOS del mismo día); si no tienen, se guarda
   * como nuevo en NUCOS (pdfFirmadoNuevo_). Los documentos salen de NUCOS, no de la carpeta del AppSheet (28-sep).
   * `doc` = { tipo, id, origen, fecha, pdfId, carpetaId } ya validado como documento de `registro` (TelefoniaService).
   */
  function subirPdfFirmado(registro, doc, base64, usuario) {
    if (!base64) throw new Error('Elige el PDF firmado.');
    const bytes = Utilities.base64Decode(String(base64));
    if (bytes.length > 15 * 1024 * 1024) throw new Error('El archivo supera 15 MB.');
    if (String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-') throw new Error('Solo se aceptan archivos PDF.');
    if (!doc.pdfId && doc.origen === 'SISTEMA') throw new Error('Primero genera el PDF.');
    const archivo = doc.pdfId ? LineasArchivos.reemplazarPdf(doc.pdfId, bytes) : pdfFirmadoNuevo_(registro, doc, bytes);
    if (registro.nuco) LineasArchivos.olvidarNuco(registro.nuco);
    LineasDatos.conCandado(() => LineasRepo.registrarMovimiento('PDF_FIRMADO', { motivo: '' }, usuario, new Date(), {
      refs: [registro.id], nuco: registro.nuco,
      detalle: Object.assign(doc.tipo === 'INSPECCION' ? { inspeccionId: doc.id } : { responsivaId: doc.id },
        { cambios: [{ campo: 'PDF', antes: '', despues: archivo.name }] }),
    }));
    return { id: archivo.id, nombre: archivo.name };
  }

  /**
   * PDF firmado de una captura de antes que no tiene PDF en NUCOS: va a su carpeta de NUCOS ("INSP DD MM" /
   * "RESP DD MM") o, si no tiene, a una nueva del día de la captura en la carpeta del NUCO (como destinoPdf_), que
   * Documentos junta con la del AppSheet del mismo día. Sin NUCO no hay carpeta en NUCOS.
   */
  function pdfFirmadoNuevo_(registro, doc, bytes) {
    const tipo = doc.tipo;
    const nuco = LineasUtil.nuco4(registro.nuco);
    const fecha = doc.fecha && !isNaN(new Date(doc.fecha)) ? new Date(doc.fecha) : new Date();
    let carpeta, nombre;
    if (doc.carpetaId && LineasArchivos.enNucos(doc.carpetaId)) {
      carpeta = DriveApp.getFolderById(doc.carpetaId);
      const m = carpeta.getName().match(/^(?:INSP|RESP)\s+(\d{1,2})\s+(\d{1,2})/i);
      nombre = (tipo === 'INSPECCION' ? 'INSP ' : 'RESP ') + (nuco || 'SIN NUCO') + ' ' + (m ? m[1] + ' ' + m[2] : Utilities.formatDate(fecha, ZONA, 'dd MM')) + '.pdf';
    } else if (nuco) {
      const c = LineasArchivos.carpetaEvidenciaNuco(tipo, nuco, fecha);
      carpeta = DriveApp.getFolderById(c.carpetaId);
      nombre = c.nombrePdf;
    } else {
      throw new Error('El registro no tiene NUCO: no hay carpeta en NUCOS para el PDF.');
    }
    LineasArchivos.exigirEscribible(carpeta.getId());
    const f = DriveUtils.marcarAutor(carpeta.createFile(Utilities.newBlob(bytes, MimeType.PDF, nombre)));
    // Sin setSharing: en NUCOS el archivo toma los permisos de la carpeta (LineasEvidencias) y la cuenta de la app no es
    // dueña de esa carpeta: setSharing lanzaba «Acceso denegado: DriveApp» con el PDF ya creado (6-oct).
    return { id: f.getId(), name: f.getName() };
  }

  return {
    objetivo: objetivoCaptura_, guardarInspeccion, guardarResponsiva, exigirInspeccion, generarPdf, fotosInspeccion, subirPdfFirmado,
    contextoInspeccion: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoInspeccion(ref, usuario, puedeVerSecretos)),
    contextoResponsiva: (ref, usuario, puedeVerSecretos) => paraCliente_(contextoResponsiva(ref, usuario, puedeVerSecretos)),
    // Para pruebas: las definiciones de los formularios
    _formularioInspeccion: formularioInspeccion_, _formularioResponsiva: formularioResponsiva_, _validar: validarFormulario_,
  };
})();
