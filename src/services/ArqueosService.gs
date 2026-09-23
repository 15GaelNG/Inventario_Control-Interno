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

  function fechaISO_(valor) {
    if (!valor) return '';
    const f = valor instanceof Date ? valor : new Date(valor);
    return isNaN(f.getTime()) ? '' : f.toISOString();
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
    Auth.validarSesion(token);
    if (!idCch) return '';
    return generarIdArqueo_(hoja_(), idCch);
  }

  const COLUMNAS_RESUMEN = [
    'ID ARQUEO', 'ID CCH', 'RESPONSABLE', 'TIPO DE ARQUEO', 'FECHA INICIO',
    'TOTAL GENERAL', 'DIFERENCIA', 'CALIFICACION_AUDITORIA_FINAL', 'ESTADO PDF', 'FORMATO ARQUEO',
  ];

  /** Catálogo ligero para la tabla (9 columnas, no las 79 completas). */
  function listarResumen(token) {
    Auth.validarSesion(token);
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);

    const resultado = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['ID ARQUEO'][i]) continue;
      resultado.push({
        ID: datos['ID ARQUEO'][i],
        ID_CCH: datos['ID CCH'][i] || '',
        RESPONSABLE: datos['RESPONSABLE'][i] || '',
        TIPO_ARQUEO: datos['TIPO DE ARQUEO'][i] || '',
        FECHA_INICIO: fechaISO_(datos['FECHA INICIO'][i]),
        TOTAL_GENERAL: datos['TOTAL GENERAL'][i] || '',
        DIFERENCIA: datos['DIFERENCIA'][i] || '',
        CALIFICACION: datos['CALIFICACION_AUDITORIA_FINAL'][i] || '',
        ESTADO_PDF: datos['ESTADO PDF'][i] || '',
        FORMATO_ARQUEO: datos['FORMATO ARQUEO'][i] || '',
      });
    }
    return resultado.sort((a, b) => new Date(b.FECHA_INICIO) - new Date(a.FECHA_INICIO));
  }

  /** Registro completo por ID ARQUEO (para el modal de detalle/editar). */
  function buscarPorId(token, id) {
    Auth.validarSesion(token);
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => {
      const v = encontrado.data[k];
      limpio[k] = v instanceof Date ? v.toISOString() : v;
    });
    return limpio;
  }

  /** Da de alta un arqueo. Ver el bloque de comentarios de arriba del
   * archivo: ID ARQUEO, los datos de la Caja Chica, Quién registró, las 3
   * fechas y todos los totales/calificación se calculan aquí — no se
   * confía en lo que mande el cliente para ninguno de esos. */
  function crear(token, datos) {
    const sesion = Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const idCch = datos['ID CCH'];
    if (!idCch) throw new Error('Selecciona la caja chica.');

    let filaParaPdf;
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const caja = CajasChicasService.buscarPorId(token, idCch);
      if (!caja) throw new Error('No se encontró la caja chica con ID CCH=' + idCch);

      const sheet = hoja_();
      const fila = Object.assign({}, datos);
      fila['ID CCH'] = idCch;
      fila['ID ARQUEO'] = generarIdArqueo_(sheet, idCch);

      fila['RESPONSABLE'] = caja['RESPONSABLE DE CAJA CHICA'] || '';
      fila['PUESTO'] = caja['PUESTO DE RESPONSABLE'] || '';
      fila['AREA / DEPARTAMENTO'] = caja['DEPARTAMENTO'] || '';
      fila['RAZON SOCIAL'] = caja['EMPRESA ORIGEN'] || '';
      fila['METODO REEMBOLSO'] = caja['METODO DE REEMBOLSO'] || '';
      fila['MONTO CAJA'] = caja['MONTO ACTUAL'] || 0;

      fila['QUIEN REGISTRO'] = sesion.nombre;
      const ahora = new Date();
      fila['FECHA DEL ULTIMO ARQUEO'] = ahora;
      fila['FECHA INICIO'] = ahora;
      fila['FECHA FIN'] = ahora;

      Object.assign(fila, calcularCampos_(datos, fila['MONTO CAJA']));

      SheetUtils.insert(ssId(), sheet.getName(), fila);
      filaParaPdf = fila;
    } finally {
      lock.releaseLock();
    }
    // El PDF se genera FUERA del candado (tarda unos segundos — copiar la
    // plantilla, llenarla, exportar) para no alargarle la espera a otra
    // alta de arqueo que esté esperando el mismo candado.
    actualizarPdfArqueo_(filaParaPdf);
    return { ID: filaParaPdf['ID ARQUEO'] };
  }

  /** Actualiza un arqueo. Igual que en crear(): los campos "formulados" no
   * se dejan editar (se descartan de `cambios` si vinieran) y los totales/
   * calificación se recalculan siempre, combinando lo ya guardado con lo
   * nuevo. */
  function actualizar(token, id, cambios) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    const registro = SheetUtils.findById(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!registro) throw new Error('No se encontró el arqueo con ID ARQUEO=' + id);

    const datos = Object.assign({}, cambios);
    [
      'ID CCH', 'ID ARQUEO', 'RESPONSABLE', 'PUESTO', 'AREA / DEPARTAMENTO', 'RAZON SOCIAL',
      'METODO REEMBOLSO', 'MONTO CAJA', 'QUIEN REGISTRO',
      'FECHA DEL ULTIMO ARQUEO', 'FECHA INICIO', 'FECHA FIN',
      'FORMATO ARQUEO', 'ESTADO PDF', // se recalculan/regeneran aquí abajo, no los manda el cliente
    ].forEach((campo) => { delete datos[campo]; });

    const combinado = Object.assign({}, registro.data, datos);
    Object.assign(datos, calcularCampos_(combinado, registro.data['MONTO CAJA']));

    SheetUtils.update(ssId(), hoja_().getName(), id, datos, ID_COLUMN);

    // Fila final (para el PDF) = lo que ya estaba + los cambios de esta
    // edición, con los totales recién recalculados encima.
    actualizarPdfArqueo_(Object.assign({}, combinado, datos));
    return { ID: id };
  }

  function eliminar(token, id) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN]);
    const ok = SheetUtils.remove(ssId(), hoja_().getName(), id, ID_COLUMN);
    if (!ok) throw new Error('No se encontró el arqueo con ID ARQUEO=' + id);
    return { ID: id };
  }

  // Carpeta de Drive donde se guardan los archivos de Arqueos (firmas,
  // evidencias, formato arqueo) — una sola carpeta para los 6 campos.
  const CARPETA_ARCHIVOS_ID = '1UMHf-zKY6sRz-0Zkt_CxnNCPdrJMHF5o';
  const TAMANO_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  function subirArchivo(token, nombreArchivo, mimeType, base64Data) {
    Auth.requiereRol(token, [Config.ROLES.ADMIN, Config.ROLES.OPERADOR]);
    if (!base64Data) throw new Error('No se recibió ningún archivo.');

    const bytes = Utilities.base64Decode(base64Data);
    if (bytes.length > TAMANO_MAX_BYTES) {
      throw new Error('El archivo pesa más de 10 MB — súbelo más ligero.');
    }

    const blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', nombreArchivo || 'archivo');
    const carpeta = DriveApp.getFolderById(CARPETA_ARCHIVOS_ID);
    const archivo = carpeta.createFile(blob);

    return { url: archivo.getUrl(), id: archivo.getId(), nombre: nombreArchivo };
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
    const copia = DriveApp.getFileById(PLANTILLA_ARQUEO_DOC_ID).makeCopy(
      'Arqueo_' + (fila['ID ARQUEO'] || Utilities.getUuid()),
      DriveApp.getFolderById(CARPETA_ARCHIVOS_ID)
    );
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

    doc.saveAndClose();

    const pdfBlob = DriveApp.getFileById(copia.getId()).getAs('application/pdf');
    const pdfFile = DriveApp.getFolderById(CARPETA_ARCHIVOS_ID).createFile(pdfBlob).setName(copia.getName() + '.pdf');
    DriveApp.getFileById(copia.getId()).setTrashed(true); // ya no se necesita el Doc, solo el PDF

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
    AUDIT_ITEMS, listarResumen, buscarPorId, previsualizarIdArqueo,
    crear, actualizar, eliminar, subirArchivo,
  };
})();
