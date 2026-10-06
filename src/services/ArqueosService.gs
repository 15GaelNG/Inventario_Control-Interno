/**
 * ArqueosService.gs
 * Bitácora de auditorías/conteo de efectivo hechas a una Caja Chica —
 * referencia su ID CCH. Vive en el mismo spreadsheet original de AppSheet
 * que el resto de los módulos — la pestaña real se ubica por firma de
 * columnas, no por nombre fijo.
 *
 * Columnas reales (79) — la lista completa vive en CAMPOS_ARQUEO del
 * cliente (src/html/js/app.html); aquí solo se listan las que este archivo
 * toca directamente. Varias columnas son "campo formulado" en AppSheet
 * (autollenado/calculado) — el cliente NUNCA las manda con un valor real:
 * este servicio las recalcula siempre, de la misma forma que ya se hace con
 * el Folio de Vehículos y el Estatus/estatus-al-crear de Caja Chica:
 *
 *   - ID ARQUEO: se genera solo — "{año}_{ID CCH}_{consecutivo 3 dígitos}",
 *     el siguiente disponible para ESE ID CCH en el año actual.
 *   - RESPONSABLE, PUESTO, AREA / DEPARTAMENTO, RAZON SOCIAL, METODO
 *     REEMBOLSO, MONTO CAJA: se copian de la Caja Chica (RESPONSABLE DE
 *     CAJA CHICA, PUESTO DE RESPONSABLE, DEPARTAMENTO, EMPRESA ORIGEN,
 *     METODO DE REEMBOLSO, MONTO ACTUAL) al crear, y no se vuelven a tocar
 *     al editar (el arqueo queda "fotografiado" con los datos de ese
 *     momento).
 *   - QUIEN REGISTRO: nombre de la sesión que crea el arqueo.
 *   - FECHA DEL ULTIMO ARQUEO / FECHA INICIO / FECHA FIN: "ahora" al crear;
 *     no se tocan al editar.
 *   - CANTIDAD M / TOTAL M / CANTIDAD B / TOTAL B / TOTAL EFECTIVO / TOTAL
 *     GENERAL / DIFERENCIA / CALIFICACION_AUDITORIA_FINAL: se recalculan
 *     siempre a partir de las columnas manuales (denominaciones, totales de
 *     gasto, los 17 reactivos de auditoría), tanto al crear como al editar
 *     — ver calcularCampos_. CANTIDAD M/B = suma de las CANTIDADES de cada
 *     denominación (no su valor) — la plantilla del PDF (F-CI03-009) fue la
 *     que confirmó la fórmula, antes no se tenía clara.
 *   - FORMATO ARQUEO / ESTADO PDF: el PDF se genera solo al crear y al
 *     editar (ver generarPdfArqueo_/actualizarPdfArqueo_), a partir de la
 *     plantilla de Google Docs F-CI03-009 — ya no se sube a mano.
 */

const ArqueosService = (function () {
  // Nombre real de la pestaña ya confirmado ("ARQUEOS") — se busca directo
  // por nombre, no por firma de columnas (SheetUtils.getSheetByColumns).
  // Con la caché fría (6h), buscar por columnas implica escanear las ~50
  // pestañas del spreadsheet una por una — se notaba, sobre todo siendo
  // Arqueos uno de los módulos con más tráfico.
  const NOMBRE_HOJA = 'ARQUEOS';
  const ID_COLUMN = 'ID ARQUEO';

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), NOMBRE_HOJA);
  }

  function num_(valor) {
    const n = Number(valor);
    return isNaN(n) ? 0 : n;
  }

  /**
   * Los 17 reactivos de auditoría — texto exacto de cada opción (tal como
   * queda guardado en la celda) + los puntos que de verdad le da la
   * fórmula SWITCH original de AppSheet. OJO: en AUDIT_16 y AUDIT_17 el
   * texto de una opción dice un % pero el SWITCH le da otro puntaje
   * distinto (confirmado con el usuario que es a propósito, no error de
   * captura) — se respeta el puntaje del SWITCH, no el que dice el texto.
   */
  const AUDIT_ITEMS = [
    {
      clave: 'AUDIT_01_Facturas_Pendientes', etiqueta: 'Facturas pendientes',
      opciones: [
        { texto: 'a) Semana actual - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Facturas anteriores - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Facturas anteriores - 50%', puntos: 50 },
        { texto: 'd) 7 o más Facturas anteriores - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_02_Folios_Rechazados', etiqueta: 'Folios rechazados',
      opciones: [
        { texto: 'a) 0 folios rechazados - 100%', puntos: 100 },
        { texto: 'b) Incidencia justificada - 75%', puntos: 75 },
        { texto: 'c) 1 a 4 Folios - 50%', puntos: 50 },
        { texto: 'd) 5 o más Folios - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_03_Folios_No_Reembolsados', etiqueta: 'Folios no reembolsados',
      opciones: [
        { texto: 'a) 0 folios no reembolsados - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Folios - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Folios - 50%', puntos: 50 },
        { texto: 'd) 7 o más Folios - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_04_Folios_Errores_Captura', etiqueta: 'Folios con errores de captura',
      opciones: [
        { texto: 'a) 0 Folios sin errores - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Folios - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Folios - 50%', puntos: 50 },
        { texto: 'd) 7 o más Folios - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_05_Gastos_No_Capturados', etiqueta: 'Gastos no capturados',
      opciones: [
        { texto: 'a) 0 Gastos - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Gastos - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Gastos - 50%', puntos: 50 },
        { texto: 'd) 7 o más Gastos - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_06_Seguimiento_No_Facturados', etiqueta: 'Seguimiento a no facturados',
      opciones: [
        { texto: 'a) 0 Tickets - 100%', puntos: 100 },
        { texto: 'b) 1 a 2 Tickets - 75%', puntos: 75 },
        { texto: 'c) 3 a 5 Tickets - 50%', puntos: 50 },
        { texto: 'd) 6 o más Tickets - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_07_Vales_Rosas', etiqueta: 'Vales rosas',
      opciones: [
        { texto: 'a) 0 Vales - 100%', puntos: 100 },
        { texto: 'b) 1 a 2 Vales - 75%', puntos: 75 },
        { texto: 'c) 3 a 5 Vales - 50%', puntos: 50 },
        { texto: 'd) 6 Vales o más - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_08_Comprobante_Transferencia', etiqueta: 'Comprobante de transferencia',
      opciones: [
        { texto: 'a) 0 Transferencias - 100%', puntos: 100 },
        { texto: 'b) 1 a 2 Transferencias - 75%', puntos: 75 },
        { texto: 'c) 3 a 5 Transferencias - 50%', puntos: 50 },
        { texto: 'd) 6 o más Transferencias - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_09_Transferencias_No_Enviadas', etiqueta: 'Transferencias no enviadas',
      opciones: [
        { texto: 'a) 0 Transferencias - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Transferencias - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Transferencias - 50%', puntos: 50 },
        { texto: 'd) 7 o más Transferencias - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_10_Gastos_No_Deducibles', etiqueta: 'Gastos no deducibles',
      opciones: [
        { texto: 'a) 0 Folios - 100%', puntos: 100 },
        { texto: 'b) 1 a 3 Folios - 75%', puntos: 75 },
        { texto: 'c) 4 a 6 Folios - 50%', puntos: 50 },
        { texto: 'd) 7 o más Folios - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_11_Sobrante_Dinero', etiqueta: 'Sobrante de dinero',
      opciones: [
        { texto: 'a) $20 o menos - 100%', puntos: 100 },
        { texto: 'b) $21 a $200 - 75%', puntos: 75 },
        { texto: 'c) $201 a $300 - 50%', puntos: 50 },
        { texto: 'd) $301 o más - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_12_Faltante_Dinero_1', etiqueta: 'Faltante de dinero',
      opciones: [
        { texto: 'a) $1 o menos - 100%', puntos: 100 },
        { texto: 'b) $2 a $100 - 75%', puntos: 75 },
        { texto: 'c) $101 a $500 - 50%', puntos: 50 },
        { texto: 'd) $501 o más - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_13_Prestamo_Dinero', etiqueta: 'Préstamo de dinero',
      opciones: [
        { texto: 'a) No - 100%', puntos: 100 },
        { texto: 'b) Sí - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_14_Cuenta_Para_CCH', etiqueta: 'Cuenta exclusiva para CCH',
      opciones: [
        { texto: 'a) Sí - 100%', puntos: 100 },
        { texto: 'b) No - 0%', puntos: 0 },
        { texto: 'c) No aplica', puntos: 100 },
      ],
    },
    {
      clave: 'AUDIT_15_Cambio_Titular', etiqueta: 'Cambio de titular',
      opciones: [
        { texto: 'a) No - 100%', puntos: 100 },
        { texto: 'b) Sí - 0%', puntos: 0 },
      ],
    },
    {
      clave: 'AUDIT_16_Gastos_No_Permitioos', etiqueta: 'Gastos no permitidos',
      opciones: [
        { texto: 'a) Sí cuenta con autorización - 100%', puntos: 100 },
        { texto: 'b) No cuenta con autorización - 0%', puntos: 50 }, // sí, 50 — confirmado con el usuario
        { texto: 'c) No aplica', puntos: 100 },
      ],
    },
    {
      clave: 'AUDIT_17_Incidencias_contempladas', etiqueta: 'Incidencias contempladas',
      opciones: [
        { texto: 'a) Sin incidencias adicionales - 100%', puntos: 100 },
        { texto: 'b) Con incidencias adicionales - 0%', puntos: 75 }, // sí, 75 — confirmado con el usuario
      ],
    },
  ];

  /** Calcula todos los totales/calificación a partir de los campos manuales
   * de `datos` (denominaciones, totales de gasto, reactivos de auditoría)
   * + el MONTO CAJA ya fijado del arqueo. Se usa igual en crear() y en
   * actualizar() — nunca se confía en un total que mande el cliente. */
  function calcularCampos_(datos, montoCaja) {
    const calc = {};

    // CANTIDAD M/B = suma de las CANTIDADES tecleadas de cada denominación
    // (no su valor en pesos) — confirmado con la plantilla del PDF F-CI03-009.
    const monedas = { 'M 0,50': 0.5, 'M 1,00': 1, 'M 2,00': 2, 'M 5,00': 5, 'M 10,00': 10, 'M 20,00': 20 };
    let totalM = 0;
    let cantidadM = 0;
    Object.keys(monedas).forEach((clave) => {
      const cantidad = num_(datos[clave]);
      cantidadM += cantidad;
      totalM += cantidad * monedas[clave];
    });
    calc['CANTIDAD M'] = cantidadM;
    calc['TOTAL M'] = totalM;

    const billetes = { 'B 20,00': 20, 'B 50,00': 50, 'B 100,00': 100, 'B 200,00': 200, 'B 500,00': 500, 'B 1000,00': 1000 };
    let totalB = 0;
    let cantidadB = 0;
    Object.keys(billetes).forEach((clave) => {
      const cantidad = num_(datos[clave]);
      cantidadB += cantidad;
      totalB += cantidad * billetes[clave];
    });
    calc['CANTIDAD B'] = cantidadB;
    calc['TOTAL B'] = totalB;

    calc['TOTAL EFECTIVO'] = totalM + totalB;

    const disponible = num_(datos['DISPONIBLE CUENTA BANCARIA']);
    const totalCheques = num_(datos['TOTAL CHEQUES']);
    const CAMPOS_GASTO = [
      'TOTAL CAJA CHICA CON FACTURAS / XML',
      'TOTAL CAJA CHICA GASTOS NO DEDUCIBLES',
      'TOTAL VIATICOS CON FACTURAS / XML',
      'TOTAL VIATICOS NO DEDUCIBLES',
      'TOTAL CAJA CHICA CON FACTURAS (PENDIENTES)',
      'TOTAL VIATICOS CON FACTURAS (PENDIENTES)',
      'TOTAL CAJA CHICA NO DEDUCIBLES (PENDIENTES)',
      'TOTAL VIATICOS NO DEDUCIBLES (PENDIENTES)',
    ];
    const sumaGastos = CAMPOS_GASTO.reduce((acc, clave) => acc + num_(datos[clave]), 0);
    const otros = num_(datos['OTROS']);

    calc['TOTAL GENERAL'] = calc['TOTAL EFECTIVO'] + disponible + totalCheques + sumaGastos + otros;
    calc['DIFERENCIA'] = calc['TOTAL GENERAL'] - num_(montoCaja);

    // Calificación final = promedio de los 17 reactivos, guardada ya
    // multiplicada por 100 (ej. 97.06, no 0.9706) — así lo pidió el usuario.
    let sumaAudit = 0;
    AUDIT_ITEMS.forEach((item) => {
      const seleccion = datos[item.clave];
      const opcion = item.opciones.find((o) => o.texto === seleccion);
      sumaAudit += opcion ? opcion.puntos : 0;
    });
    calc['CALIFICACION_AUDITORIA_FINAL'] = Math.round((sumaAudit / 17) * 100) / 100;

    return calc;
  }

  /** Siguiente ID ARQUEO disponible para un ID CCH en el año actual:
   * "{año}_{ID CCH}_{consecutivo 3 dígitos}". */
  function generarIdArqueo_(sheet, idCch) {
    const anio = new Date().getFullYear();
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf(ID_COLUMN);
      if (col !== -1) {
        const patron = new RegExp('^' + anio + '_' + idCch + '_(\\d+)$');
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const match = patron.exec(String(fila[0] || '').trim());
          if (match) maximo = Math.max(maximo, parseInt(match[1], 10));
        });
      }
    }
    return anio + '_' + idCch + '_' + String(maximo + 1).padStart(3, '0');
  }

  /** Solo para mostrarlo en el formulario de Registrar mientras se llena —
   * NO reserva el ID, es una vista previa (igual que el Folio de Vehículos). */
  function previsualizarIdArqueo(token, idCch) {
    Permisos.puedeLeer(token, 'arqueos');
    if (!idCch) return '';
    return generarIdArqueo_(hoja_(), idCch);
  }

  /**
   * La hoja, para HojaServicio. Ver el bloque de comentarios de arriba del archivo: ID ARQUEO,
   * los datos de la Caja Chica, Quién registró, las 3 fechas y todos los totales/calificación
   * se calculan aquí — no se confía en lo que mande el cliente para ninguno de esos.
   */
  const ARQUEOS = {
    modulo: 'arqueos',
    nombre: 'el arqueo',
    libro: ssId,
    hoja: NOMBRE_HOJA,
    id: ID_COLUMN,
    // Catálogo ligero para la tabla (11 columnas, no las 79 completas)
    columnas: [
      'ID ARQUEO', 'ID CCH', 'RESPONSABLE', 'TIPO DE ARQUEO', 'FECHA INICIO',
      'TOTAL GENERAL', 'DIFERENCIA', 'CALIFICACION_AUDITORIA_FINAL', 'ESTADO PDF', 'FORMATO ARQUEO', 'EVIDENCIAS',
    ],
    fila: (r) => ({
      ID: r['ID ARQUEO'],
      ID_CCH: r['ID CCH'] || '',
      RESPONSABLE: r['RESPONSABLE'] || '',
      TIPO_ARQUEO: r['TIPO DE ARQUEO'] || '',
      FECHA_INICIO: HojaServicio.fechaISO(r['FECHA INICIO']),
      TOTAL_GENERAL: r['TOTAL GENERAL'] || '',
      DIFERENCIA: r['DIFERENCIA'] || '',
      CALIFICACION: r['CALIFICACION_AUDITORIA_FINAL'] || '',
      ESTADO_PDF: r['ESTADO PDF'] || '',
      FORMATO_ARQUEO: r['FORMATO ARQUEO'] || '',
      EVIDENCIAS: r['EVIDENCIAS'] || '',
    }),
    orden: { campo: 'FECHA_INICIO', desc: true },
    // Las 3 firmas ("<ID ARQUEO>_<quién firma>_<fecha>") y la evidencia, una vez que se sabe el ID
    archivos: {
      'FIRMA RESPONSABLE': 'RESPONSABLE', 'FIRMA ESPECIALISTA': 'ESPECIALISTA', 'FIRMA ASISTENTE': 'ASISTENTE',
      'EVIDENCIAS': 'EVIDENCIA',
    },
    obligatorios: { 'ID CCH': 'Selecciona la caja chica.' },
    // El ID ARQUEO es un consecutivo por caja y año: se calcula bajo candado
    candadoAlCrear: true,
    alCrear: (fila, ctx) => {
      const idCch = fila['ID CCH'];
      const caja = CajasChicasService.buscarPorId(ctx.token, idCch);
      if (!caja) throw new Error('No se encontró la caja chica con ID CCH=' + idCch);
      // La llave foránea de verdad. 'ID CCH' se queda porque es dato de negocio (el
      // consecutivo 1,2,3 que usa la gente) y porque AppSheet lo usa, pero el vínculo es el ID.
      const idCaja = caja['ID'];
      if (!idCaja) {
        throw new Error('La caja chica con ID CCH=' + idCch + ' no tiene ID. Corre el ' +
          'pipeline de IDs sobre este libro antes de registrar arqueos.');
      }
      const ahora = new Date();
      Object.assign(fila, {
        'ID CAJA CHICA': idCaja,
        'ID ARQUEO': generarIdArqueo_(ctx.hoja, idCch),
        'RESPONSABLE': caja['RESPONSABLE DE CAJA CHICA'] || '',
        'PUESTO': caja['PUESTO DE RESPONSABLE'] || '',
        'AREA / DEPARTAMENTO': caja['DEPARTAMENTO'] || '',
        'RAZON SOCIAL': caja['EMPRESA ORIGEN'] || '',
        'METODO REEMBOLSO': caja['METODO DE REEMBOLSO'] || '',
        'MONTO CAJA': caja['MONTO ACTUAL'] || 0,
        'QUIEN REGISTRO': ctx.sesion.nombre,
        'FECHA DEL ULTIMO ARQUEO': ahora,
        'FECHA INICIO': ahora,
        'FECHA FIN': ahora,
      });
      Object.assign(fila, calcularCampos_(ctx.datos, fila['MONTO CAJA']));
    },
    // Los "formulados" no se editan: se recalculan/regeneran, no los manda el cliente
    noEditables: [
      'ID CCH', 'RESPONSABLE', 'PUESTO', 'AREA / DEPARTAMENTO', 'RAZON SOCIAL',
      'METODO REEMBOLSO', 'MONTO CAJA', 'QUIEN REGISTRO',
      'FECHA DEL ULTIMO ARQUEO', 'FECHA INICIO', 'FECHA FIN',
      'FORMATO ARQUEO', 'ESTADO PDF',
    ],
    // Los totales y la calificación se recalculan siempre, con lo guardado + lo nuevo
    alActualizar: (cambios, ctx) => calcularCampos_(Object.assign({}, ctx.actual, cambios), ctx.actual['MONTO CAJA']),
    // El PDF se genera FUERA del candado (tarda unos segundos — copiar la plantilla, llenarla,
    // exportar) para no alargarle la espera a otra alta de arqueo que espere el mismo candado
    despues: (registro) => actualizarPdfArqueo_(registro),
  };

  // Carpeta de Drive donde se guarda FIRMA EXTERNA -- Evidencias, las 3 firmas y
  // el Formato arqueo (generado solo) van cada uno en su propia carpeta aparte,
  // ver CARPETA_EVIDENCIAS_ID/CARPETA_FIRMAS_ID/CARPETA_FORMATO_RAIZ_ID.
  const CARPETA_ARCHIVOS_ID = '1UMHf-zKY6sRz-0Zkt_CxnNCPdrJMHF5o';
  // Carpeta de Drive solo para firmas (FIRMA RESPONSABLE/ESPECIALISTA/ASISTENTE),
  // separada de CARPETA_ARCHIVOS_ID a petición de Jorge (2026-10-01).
  const CARPETA_FIRMAS_ID = '1rIN0RMwLOGZXiDc_YXZ7KroqKXYlZgLL';
  // Carpeta de Drive solo para Evidencias (el PDF combinado de fotos), aparte
  // de CARPETA_ARCHIVOS_ID -- a petición de Jorge (2026-10-01).
  const CARPETA_EVIDENCIAS_ID = '1IFjsxPDPPppRDY-Jq6ciJzNIkxd7AMWw';
  // Carpeta raíz donde se guarda el PDF de Formato arqueo generado solo, organizada
  // por año (ARQUEOS/2026/, ARQUEOS/2027/...) -- carpetaDelAnioActual_ busca o crea
  // la subcarpeta del año en curso cada vez, para no tener que tocar nada cada enero.
  const CARPETA_FORMATO_RAIZ_ID = '1u4nZ84rxkMvJDjZNUFHFnNiNqDo0Yqwo';

  /** Subcarpeta del año en curso dentro de `raizId` (la crea si no existe todavía). */
  function carpetaDelAnioActual_(raizId) {
    const anio = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy');
    const raiz = DriveApp.getFolderById(raizId);
    const existentes = raiz.getFoldersByName(anio);
    return existentes.hasNext() ? existentes.next() : raiz.createFolder(anio);
  }
  /** Sube un archivo a una de las carpetas de Arqueos (`de` completa los mensajes de error) */
  function subirEn_(token, carpetaId, de, nombreArchivo, mimeType, base64Data) {
    Permisos.puedeEditar(token, 'arqueos');
    return HojaServicio.subirArchivo(carpetaId, 'de ' + de + ' de Arqueos', nombreArchivo, mimeType, base64Data);
  }

  // ---------- Generación automática del PDF (plantilla F-CI03-009) ----------
  // Plantilla de Google Docs compartida por el usuario — mismo patrón que
  // PdfService.gs (copiar plantilla, reemplazar marcadores, exportar a PDF,
  // borrar la copia), pero esta plantilla usa marcadores "<<[CAMPO]>>" (no
  // "{{CAMPO}}") porque así viene ya armada — no hay necesidad de tocarla.
  const PLANTILLA_ARQUEO_DOC_ID = '1ZIhyDvbG5WENKL73lyGPZWDehAPXRf9yu3-en5vhX-w';

  function escaparRegex_(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Reemplaza TODAS las ocurrencias del marcador literal `<<[texto]>>` (o
   * la variante que sea) por `valor`, en cualquier parte del body (incluye
   * texto dentro de tablas). */
  function reemplazarMarcador_(body, marcadorLiteral, valor) {
    body.replaceText(escaparRegex_(marcadorLiteral), (valor === undefined || valor === null) ? '' : String(valor));
  }

  /** Saca el fileId de Drive de una URL como las que regresa subirArchivo()
   * (".../file/d/{id}/view..." o "...?id={id}..."). */
  function extraerIdDrive_(url) {
    if (!url) return null;
    const m = String(url).match(/\/d\/([a-zA-Z0-9_-]+)/) || String(url).match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : null;
  }

  /** Busca el marcador de una firma y, si hay archivo, inserta la imagen ahí
   * mismo (mismo patrón que {{DIAGRAMA}} en PdfService.gs); si no hay
   * archivo o no es una imagen, solo borra el texto del marcador. Achica la
   * imagen si viene más ancha de 150pt, para que no se salga de la celda. */
  function insertarFirma_(body, marcadorLiteral, urlArchivo) {
    const encontrado = body.findText(escaparRegex_(marcadorLiteral));
    if (!encontrado) return;
    const parrafo = encontrado.getElement().getParent().asParagraph();
    parrafo.clear();
    const fileId = extraerIdDrive_(urlArchivo);
    if (!fileId) return;
    try {
      const blob = DriveApp.getFileById(fileId).getBlob();
      if (String(blob.getContentType() || '').indexOf('image/') !== 0) return;
      const imagen = parrafo.appendInlineImage(blob);
      const ANCHO_MAX = 150;
      if (imagen.getWidth() > ANCHO_MAX) {
        const proporcion = ANCHO_MAX / imagen.getWidth();
        imagen.setHeight(Math.round(imagen.getHeight() * proporcion));
        imagen.setWidth(ANCHO_MAX);
      }
    } catch (err) {
      // No se pudo leer/insertar la imagen (archivo borrado, sin permiso,
      // etc.) — se deja el marcador vacío, no se rompe todo el PDF por esto.
    }
  }

  /**
   * Genera el PDF del arqueo a partir de la plantilla F-CI03-009 y `fila`
   * (el registro YA completo: datos capturados + los calculados por
   * calcularCampos_ + lo copiado de la Caja Chica). Regresa la URL del PDF.
   */
  function generarPdfArqueo_(fila) {
    // Mismo patrón defensivo que subirArchivo(): "Acceso denegado: DriveApp" a secas no
    // dice ni qué recurso ni con qué cuenta -- aquí sí, para poder arreglarlo sin adivinar
    // (compartir la plantilla/carpeta con la cuenta que despliega este proyecto).
    const cuenta = () => Session.getEffectiveUser().getEmail();
    let plantilla;
    try {
      plantilla = DriveApp.getFileById(PLANTILLA_ARQUEO_DOC_ID);
    } catch (e) {
      throw new Error('No se pudo abrir la plantilla del PDF de Arqueo en Drive (ID ' + PLANTILLA_ARQUEO_DOC_ID +
        '). La cuenta con la que corre la app ahora mismo (' + cuenta() + ') no tiene acceso a ese documento.');
    }
    let carpeta;
    try {
      carpeta = carpetaDelAnioActual_(CARPETA_FORMATO_RAIZ_ID);
    } catch (e) {
      throw new Error('No se pudo abrir o crear la carpeta del año actual para los PDFs de Arqueo en Drive (raíz ' +
        CARPETA_FORMATO_RAIZ_ID + '). La cuenta con la que corre la app ahora mismo (' + cuenta() + ') no tiene acceso a esa carpeta.');
    }
    let copia;
    try {
      copia = plantilla.makeCopy('Arqueo_' + (fila['ID ARQUEO'] || Utilities.getUuid()), carpeta);
    } catch (e) {
      throw new Error('Se pudo abrir la plantilla y la carpeta de Arqueos, pero no copiar el documento ahí. La ' +
        'cuenta ' + cuenta() + ' necesita permiso de editor (no solo lector) en la carpeta. Error original: ' + e.message);
    }
    const doc = DocumentApp.openById(copia.getId());
    const body = doc.getBody();

    const moneda = (v) => num_(v).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
    const numero = (v) => num_(v).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const texto = (v) => (v === undefined || v === null) ? '' : String(v);

    // Campos de texto plano.
    ['ID ARQUEO', 'ID CCH', 'RESPONSABLE', 'PUESTO', 'AREA / DEPARTAMENTO', 'RAZON SOCIAL',
      'METODO REEMBOLSO', 'QUIEN REGISTRO', 'NOMBRE ASISTENTE',
    ].forEach((clave) => reemplazarMarcador_(body, '<<[' + clave + ']>>', texto(fila[clave])));

    // Montos: en la plantilla estos marcadores NO tienen un "$" literal
    // antes (a diferencia de la tabla de denominaciones, ver abajo).
    ['MONTO CAJA', 'DIFERENCIA', 'TOTAL EFECTIVO', 'DISPONIBLE CUENTA BANCARIA', 'TOTAL CHEQUES',
      'TOTAL CAJA CHICA CON FACTURAS / XML', 'TOTAL CAJA CHICA GASTOS NO DEDUCIBLES',
      'TOTAL VIATICOS CON FACTURAS / XML', 'TOTAL VIATICOS NO DEDUCIBLES',
      'TOTAL CAJA CHICA CON FACTURAS (PENDIENTES)', 'TOTAL VIATICOS CON FACTURAS (PENDIENTES)',
      'TOTAL CAJA CHICA NO DEDUCIBLES (PENDIENTES)', 'TOTAL VIATICOS NO DEDUCIBLES (PENDIENTES)',
      'OTROS', 'TOTAL GENERAL', 'TOTAL M', 'TOTAL B',
    ].forEach((clave) => reemplazarMarcador_(body, '<<[' + clave + ']>>', moneda(fila[clave])));

    // Cantidades (piezas, no dinero — CANTIDAD M/B y cada denominación).
    ['CANTIDAD M', 'CANTIDAD B', 'M 0,50', 'M 1,00', 'M 2,00', 'M 5,00', 'M 10,00', 'M 20,00',
      'B 20,00', 'B 50,00', 'B 100,00', 'B 200,00', 'B 500,00', 'B 1000,00',
    ].forEach((clave) => reemplazarMarcador_(body, '<<[' + clave + ']>>', texto(num_(fila[clave]))));

    // Subtotal por denominación (columna "Total" de las tablas de Monedas/
    // Billetes) — ahí sí lleva un "$" literal antes en la plantilla, así
    // que aquí solo va el número. IMPORTANTE: el texto del marcador tiene
    // que calzar carácter por carácter con la plantilla (ej. "0.50", no
    // "0.5" — si se arma el marcador concatenando el número de JS en vez de
    // copiar el texto tal cual, "0.5" !== "0.50" y no encuentra nada que
    // reemplazar). Por eso van escritos literales, uno por uno, en vez de
    // armarlos con un objeto {clave: valor}. El de $1000 dice "* 10000" en
    // la plantilla (typo de origen) — se busca ese texto EXACTO, pero el
    // valor que se calcula es el correcto (cantidad × 1000).
    const SUBTOTALES_DENOMINACION = [
      { marcador: '<<[M 0,50] * 0.50>>', clave: 'M 0,50', valor: 0.5 },
      { marcador: '<<[M 1,00] * 1>>', clave: 'M 1,00', valor: 1 },
      { marcador: '<<[M 2,00] * 2>>', clave: 'M 2,00', valor: 2 },
      { marcador: '<<[M 5,00] * 5>>', clave: 'M 5,00', valor: 5 },
      { marcador: '<<[M 10,00] * 10>>', clave: 'M 10,00', valor: 10 },
      { marcador: '<<[M 20,00] * 20>>', clave: 'M 20,00', valor: 20 },
      { marcador: '<<[B 20,00] * 20>>', clave: 'B 20,00', valor: 20 },
      { marcador: '<<[B 50,00] * 50>>', clave: 'B 50,00', valor: 50 },
      { marcador: '<<[B 100,00] * 100>>', clave: 'B 100,00', valor: 100 },
      { marcador: '<<[B 200,00] * 200>>', clave: 'B 200,00', valor: 200 },
      { marcador: '<<[B 500,00] * 500>>', clave: 'B 500,00', valor: 500 },
      { marcador: '<<[B 1000,00] * 10000>>', clave: 'B 1000,00', valor: 1000 }, // typo de la plantilla, ver comentario arriba
    ];
    SUBTOTALES_DENOMINACION.forEach((item) => {
      const cantidad = num_(fila[item.clave]);
      reemplazarMarcador_(body, item.marcador, numero(cantidad * item.valor));
    });

    // Textos en mayúsculas.
    reemplazarMarcador_(body, '<<UPPER([OBSERVACIONES FINALES])>>', texto(fila['OBSERVACIONES FINALES']).toUpperCase());
    reemplazarMarcador_(body, '<<UPPER([DESCRIPCION CUENTA BANCARIA])>>', texto(fila['DESCRIPCION CUENTA BANCARIA']).toUpperCase());
    reemplazarMarcador_(body, '<<UPPER([Nombre_Fintech])>>', texto(fila['Nombre_Fintech']).toUpperCase());

    // Calificación (con "%") y fecha de inicio (dd/mm/aaaa).
    reemplazarMarcador_(body, '<<[CALIFICACION_AUDITORIA_FINAL]>>', texto(fila['CALIFICACION_AUDITORIA_FINAL']) + '%');
    const fechaInicio = fila['FECHA INICIO']
      ? Utilities.formatDate(new Date(fila['FECHA INICIO']), 'America/Mexico_City', 'dd/MM/yyyy')
      : '';
    reemplazarMarcador_(body, '<<[FECHA INICIO]>>', fechaInicio);

    // Los 17 reactivos de auditoría — texto exacto de la opción elegida.
    AUDIT_ITEMS.forEach((item) => {
      reemplazarMarcador_(body, '<<[' + item.clave + ']>>', texto(fila[item.clave]));
    });

    // Firmas — se insertan como imagen, no como texto.
    insertarFirma_(body, '<<[FIRMA RESPONSABLE]>>', fila['FIRMA RESPONSABLE']);
    insertarFirma_(body, '<<[FIRMA ESPECIALISTA]>>', fila['FIRMA ESPECIALISTA']);
    insertarFirma_(body, '<<[FIRMA ASISTENTE]>>', fila['FIRMA ASISTENTE']);

    try {
      doc.saveAndClose();
    } catch (e) {
      throw new Error('No se pudo guardar el documento ya llenado con los datos del arqueo. Error original: ' + e.message);
    }

    let pdfBlob;
    try {
      pdfBlob = DriveApp.getFileById(copia.getId()).getAs('application/pdf');
    } catch (e) {
      throw new Error('El documento se llenó bien, pero no se pudo exportar a PDF. La cuenta ' + cuenta() +
        ' necesita permiso de editor en la carpeta de Arqueos. Error original: ' + e.message);
    }
    let pdfFile;
    try {
      const fecha = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
      const nombrePdf = (fila['ID ARQUEO'] || copia.getName()) + '_ARQUEO_' + fecha + '.pdf';
      pdfFile = DriveUtils.marcarAutor(carpeta.createFile(pdfBlob).setName(nombrePdf));
    } catch (e) {
      throw new Error('Se generó el PDF pero no se pudo guardar en la carpeta de Arqueos en Drive (raíz ' +
        CARPETA_FORMATO_RAIZ_ID + '). La cuenta ' + cuenta() + ' necesita permiso de editor ahí. Error original: ' + e.message);
    }
    // Mejor esfuerzo, no bloquea el registro (mismo patrón que subirArchivo(), arriba):
    // la carpeta de Arqueos ya tiene acceso general configurado, así que casi siempre el
    // PDF hereda el compartir solo. Si una política de Workspace bloquea CUALQUIER
    // compartir explícito en esta carpeta/archivo (ni DOMAIN ni ANYONE_WITH_LINK), no vale
    // la pena tronar el registro solo por eso -- el PDF ya se generó y se guardó bien.
    if (!DriveUtils.compartirLoMasAmplioPosible(pdfFile)) {
      console.warn('No se pudo compartir explícitamente el PDF de Arqueo (cuenta ' + cuenta() +
        '); se deja como quedó por default de la carpeta. Archivo: ' + pdfFile.getUrl());
    }
    try {
      DriveApp.getFileById(copia.getId()).setTrashed(true); // ya no se necesita el Doc, solo el PDF
    } catch (e) {
      // Mejor esfuerzo: el PDF ya se generó y se compartió bien -- que sobreviva el Doc
      // temporal (mínimo) no vale la pena tronar el registro por esto.
    }

    return pdfFile.getUrl();
  }

  /** Genera el PDF y guarda su URL (+ "Generado") en la fila; si algo falla,
   * deja el motivo en ESTADO PDF en vez de tronar toda la alta/edición —
   * el arqueo ya se guardó bien, perder el PDF no debería perder los datos. */
  function actualizarPdfArqueo_(fila) {
    const idArqueo = fila['ID ARQUEO'];
    try {
      const url = generarPdfArqueo_(fila);
      SheetUtils.update(ssId(), hoja_().getName(), idArqueo, {
        'FORMATO ARQUEO': url, 'ESTADO PDF': 'Generado',
      }, ID_COLUMN);
    } catch (err) {
      try {
        SheetUtils.update(ssId(), hoja_().getName(), idArqueo, {
          'ESTADO PDF': 'Error al generar: ' + err.message,
        }, ID_COLUMN);
      } catch (err2) {
        // Si ni esto se pudo guardar, ya no hay más que hacer aquí.
      }
    }
  }

  return {
    AUDIT_ITEMS,
    listarResumen: (token) => HojaServicio.listar(ARQUEOS, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(ARQUEOS),
    /** Todas las columnas de TODOS los arqueos (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(ARQUEOS, token),
    /** Registro completo por ID ARQUEO (para el modal de detalle/editar) */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(ARQUEOS, token, id),
    /** Arqueos de una sola caja chica (ficha de Caja Chica) */
    listarPorIdCch: (token, idCch) => HojaServicio.listarPor(ARQUEOS, token, 'ID_CCH', idCch),
    previsualizarIdArqueo,
    crear: (token, datos) => HojaServicio.crear(ARQUEOS, token, datos),
    actualizar: (token, id, cambios) => HojaServicio.actualizar(ARQUEOS, token, id, cambios),
    eliminar: (token, id) => HojaServicio.eliminar(ARQUEOS, token, id),
    /** Evidencias y Formato arqueo */
    subirArchivo: (token, nombre, tipo, base64) => subirEn_(token, CARPETA_ARCHIVOS_ID, 'archivos', nombre, tipo, base64),
    /** Las 3 firmas (RESPONSABLE/ESPECIALISTA/ASISTENTE) -- carpeta aparte */
    subirFirma: (token, nombre, tipo, base64) => subirEn_(token, CARPETA_FIRMAS_ID, 'firmas', nombre, tipo, base64),
    /** Evidencias (el PDF combinado de fotos) -- carpeta aparte */
    subirEvidencia: (token, nombre, tipo, base64) => subirEn_(token, CARPETA_EVIDENCIAS_ID, 'evidencias', nombre, tipo, base64),
  };
})();
