/**
 * VehiculosService.gs
 * Módulo de vehículos: alta, reasignación, verificaciones, servicios e inspección
 * con checklist de daños (diagrama + firma). Pendiente de finalizar esquema de columnas
 * (ver mapeo de tablas originales del AppSheet en /docs/mapeo-modulos.md).
 *
 * Hojas previstas en Config.SPREADSHEET_IDS.VEHICULOS():
 *   VEHICULOS          — catálogo de unidades
 *   CAMBIOS VEHICULOS  — bitácora automática de ediciones (ver
 *                         CambiosVehiculosService, se llena sola desde
 *                         actualizar(), nadie la captura a mano)
 *   REASIGNACIONES     — historial de cambio de responsable
 *   VERIFICACIONES     — verificación vehicular periódica
 *   SERVICIOS          — mantenimiento (aceite, llantas, etc.)
 *   INSPECCIONES       — checklist de daños + referencia a imagen anotada (ver PdfService)
 */

const VehiculosService = (function () {
  const SHEET_VEHICULOS = 'VEHICULOS';
  // La llave de renglon es la NUEVA. La columna 'ID_VEHICULO' pasa a llamarse
  // "ID ANTERIOR" en el paso 2 del pipeline de IDs y queda solo como rastro: sus valores
  // (REFWF1, REFWF2...) eran un prefijo mas un contador de AppSheet, no un dato.
  const ID_COLUMN = 'ID';
  // Campos tipo archivo (ver buscarPorFolio): en datos migrados de AppSheet
  // guardan una ruta relativa, no una URL — hay que resolverlos antes de
  // mandarlos al cliente.
  const CAMPOS_ARCHIVO = ['RESPONSIVA', 'DOCUMENTO BAJA', 'POLIZA SEGURO', 'ARCHIVO TENENCIA', 'ADJUNTAR FACTURA',
    'TARJETA CIRCULACION', 'ALTA PLACAS'];
  // Columnas de documento que la hoja vieja no traía (9-oct-2026): si faltan, se agregan al final la primera vez que
  // se sube uno (asegurarColumnasDocumento_). ADJUNTAR FACTURA ya existía (como texto, vacía en los 648).
  const COLUMNAS_DOCUMENTO_NUEVAS = ['TARJETA CIRCULACION', 'ALTA PLACAS'];

  // Lo que el vehículo trae puesto ahora mismo (sección "Accesorios del vehículo" de la ficha, usuario
  // 15-oct-2026) -- mismos 13 nombres que ResponsivaVehicularService.ACCESORIOS / RESV_ACCESORIOS en
  // app.html (es el mismo objeto físico), pero vive en su PROPIA hoja (ACCESORIOS_SHEET, abajo), no en
  // VEHICULOS: a propósito una copia independiente de lo que quedó firmado en la Responsiva, y para no
  // seguir engordando la hoja grande con 13 columnas más. Se edita libremente (cualquiera con EDICIÓN en
  // Vehículos) y nunca toca la hoja RESPONSIVA ni dispara una firma nueva. Se junta sola al leer la ficha
  // (buscarPor_ -> obtenerAccesoriosVehiculo_) y se reparte sola al guardar (despues ->
  // guardarAccesoriosVehiculo_): para quien usa la ficha es invisible que sea otra hoja.
  const ACCESORIOS_VEHICULO = [
    'GATO HIDRAULICO', 'GATO MECANICO', 'LLAVE CRUZ', 'MANERAL', 'LLANTA REFACCION',
    'KIT SEGURIDAD', 'PARASOL', 'TAPETES RUDO', 'TAPETES ALFOMBRA', 'CUBRE VOLANTE',
    'CUBRE ASIENTOS', 'BED LINER', 'CUBIERTA BATEA',
  ];
  const ACCESORIOS_SHEET = 'ACCESORIOS VEHICULO';
  const ENCABEZADOS_ACCESORIOS = ['ID VEHICULO'].concat(ACCESORIOS_VEHICULO);
  // Etiqueta corta para el nombre de archivo en Drive, por columna ("<ID>_<ETIQUETA>_<fecha>.ext")
  const ETIQUETA_ARCHIVO = {
    'RESPONSIVA': 'RESPONSIVA',
    'DOCUMENTO BAJA': 'DOCUMENTO_BAJA',
    'POLIZA SEGURO': 'POLIZA_SEGURO',
    'ARCHIVO TENENCIA': 'TENENCIA',
    'ADJUNTAR FACTURA': 'FACTURA',
    'TARJETA CIRCULACION': 'TARJETA_CIRCULACION',
    'ALTA PLACAS': 'ALTA_PLACAS',
  };

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /**
   * La hoja, para HojaServicio. Al crear: FOLIO (por Clase), NUCCO, ID y FECHA REGISTRO
   * SISTEMA CI no los manda el cliente, se calculan aquí bajo candado (dos altas a la vez no
   * deben terminar con el mismo folio NI el mismo NUCCO). Al editar: se compara contra lo que
   * había y la diferencia va a la bitácora de Cambios Vehículos (CambiosVehiculosService), y
   * los campos copiados (placa, marca, línea…) se propagan a Instalación de Sensores,
   * Verificaciones y Hologramas (Relaciones.gs / docs/relaciones.md).
   */
  const VEHICULOS = {
    modulo: 'vehiculos',
    nombre: 'el vehículo',
    libro: ssId,
    hoja: SHEET_VEHICULOS,
    // Un rol CLIENT solo ve los vehículos de sus departamentos (lo heredan BASICO, RESUMEN y SEGURO,
    // y buscarPor_ lo revisa a mano)
    alcance: 'DEPARTAMENTO',
    // El catálogo completo trae también los renglones sin ID (diagnosticoIds los cuenta)
    incluir: () => true,
    archivos: ETIQUETA_ARCHIVO,
    candadoAlCrear: true,
    // ID PERSONA del responsable: se calcula de su nombre al crear y al cambiarlo (CapitalHumano, 01/10/2026)
    persona: true,
    alCrear: (fila, ctx) => {
      asegurarColumnasDocumento_(fila);
      // Se guarda aparte (despues, más abajo): aquí solo se saca de fila lo que va a la hoja de
      // accesorios, para que nunca llegue a VEHICULOS ni a la bitácora de Cambios Vehículos.
      ctx.accesoriosVehiculo = extraerAccesorios_(fila);
      // Las columnas que manda otra hoja (SERIE SENSOR y SENSOR, que manda Instalación de
      // Sensores) no se capturan aquí: un vehículo nuevo nace "sin sensor".
      const ajenas = Relaciones.deOtraHoja(SHEET_VEHICULOS);
      ajenas.columnas.forEach((c) => { delete fila[c]; });
      Object.assign(fila, ajenas.sinDueno);
      fila.FOLIO = generarFolio_(ctx.datos.CLASE);
      fila.NUCCO = generarNucco_();
      fila[ID_COLUMN] = Ids.nuevo(Entidades.prefijo(SHEET_VEHICULOS));
      fila['FECHA REGISTRO SISTEMA CI'] = new Date();
      // El puente desde "Ya crear vehículo" (SolicitudCompraService.gs) manda estas dos ya
      // resueltas -- noEditables solo bloquea actualizar(), no crear(), así nace el vehículo ya
      // ligado a su expediente sin pasar por "Buscar expediente" (eso sigue siendo para los
      // vehículos de antes de Solicitud de compra).
      if (ctx.datos['FOLIO ADQUISICION']) fila['FOLIO ADQUISICION'] = ctx.datos['FOLIO ADQUISICION'];
      if (ctx.datos['LIGA EXPEDIENTE ADQUISICION']) fila['LIGA EXPEDIENTE ADQUISICION'] = ctx.datos['LIGA EXPEDIENTE ADQUISICION'];
    },
    // FOLIO ADQUISICION / LIGA EXPEDIENTE ADQUISICION: las llena guardarExpedienteAdquisicion_
    // (abajo) o alCrear de arriba, nunca la edición normal de la ficha -- ver
    // AdquisicionVehicularService.gs / SolicitudCompraService.gs.
    noEditables: ['FOLIO', 'NUCCO', 'FECHA REGISTRO SISTEMA CI', 'FOLIO ADQUISICION', 'LIGA EXPEDIENTE ADQUISICION'],
    // La sección "Accesorios y sensor" de la ficha: solo la edita quien tiene EDICION en
    // Instalación de Sensores (en la pantalla: DE_SENSORES en CAMPOS_VEHICULO, app.html)
    deOtroModulo: { 'instalacion-sensores': ['ACCESORIOS', 'ADITAMENTOS', 'ACTIVADOR', '$ Costo del Sensor', 'LLAVE DUPLICADA'] },
    alActualizar: (cambios, ctx) => {
      asegurarColumnasDocumento_(cambios);
      ctx.accesoriosVehiculo = extraerAccesorios_(cambios);
      // Las que manda otra hoja: editarlas aquí se perdería en la siguiente sincronización.
      // Se cambian desde su dueña (SERIE SENSOR y SENSOR: el módulo de Sensores).
      Relaciones.deOtraHoja(SHEET_VEHICULOS).columnas.forEach((c) => { delete cambios[c]; });
    },
    despues: (registro, ctx) => {
      archivarEnExpediente_(registro, ctx.accion === 'actualizar' ? ctx.cambios : registro);
      if (ctx.accesoriosVehiculo) guardarAccesoriosVehiculo_(registro[ID_COLUMN], ctx.accesoriosVehiculo);
      if (ctx.accion !== 'actualizar') return;
      CambiosVehiculosService.registrarCambios(ctx.actual.FOLIO, ctx.actual, ctx.cambios, ctx.sesion.nombre);
      // El vehículo YA se guardó: si propagar falla no se revierte nada, solo se avisa en los
      // logs y revisar() lo corrige en la corrida nocturna.
      try {
        Relaciones.propagar('VEHICULOS', registro, ctx.cambios);
      } catch (err) {
        console.error('Relaciones.propagar falló para el vehículo ' + ctx.id + ': ' + err.message);
      }
    },
  };

  /**
   * Catálogo ligero (FOLIO + datos clave) para autocompletar otros módulos que referencian
   * un vehículo por folio (ej. Incidencias, Reasignaciones). Excluye los dados de baja.
   * MODELO en esta hoja es el año del vehículo, no el nombre del modelo (ese es LINEA
   * VEHICULO). Lee solo estas columnas, no las 41.
   *
   * 'ID' va aquí para que el catálogo que consumen los formularios pueda identificar un
   * vehículo sin depender del folio. Hoy los formularios siguen MANDANDO el folio y el
   * servidor resuelve el ID: el control de búsqueda de vehículo no es un <select> con
   * valor oculto, es una caja de texto donde lo que se manda es lo que se ve (ver
   * Combobox, que mete `valor` en el input).
   */
  // El catálogo para elegir la unidad (FolioNucco) en Sensores, Hologramas, Verificaciones,
  // Inspección, Reasignaciones e Incidencias: lo lee toda la familia, no solo Vehículos
  const BASICO = Object.assign({}, VEHICULOS, {
    referencia: true,
    columnas: ['ID', 'FOLIO', 'DEPARTAMENTO', 'MARCA', 'LINEA VEHICULO', 'MODELO', 'ESTATUS',
      'RESPONSABLE VEHICULO', 'NO EMPLEADO', 'SERIE VEHICULO', 'NUCCO', 'PLACA'],
    incluir: (r) => !!r['FOLIO'] && String(r['ESTATUS'] || '').toUpperCase() !== 'BAJA VEHICULAR',
    fila: (r) => ({
      ID: r['ID'],
      FOLIO: r['FOLIO'],
      // La etiqueta de Verificaciones la usa, y Help Desk busca la unidad por placa en el ticket
      PLACA: r['PLACA'] || '',
      DEPARTAMENTO: r['DEPARTAMENTO'] || '',
      MARCA: r['MARCA'] || '',
      LINEA_VEHICULO: r['LINEA VEHICULO'] || '',
      MODELO: r['MODELO'] || '',
      RESPONSABLE_VEHICULO: r['RESPONSABLE VEHICULO'] || '',
      NO_EMPLEADO: r['NO EMPLEADO'] || '',
      VIN: r['SERIE VEHICULO'] || '',
      NUCO: r['NUCCO'] || '',
    }),
    orden: { campo: 'FOLIO' },
  });

  /**
   * Catálogo ligero para la lista/tarjetas del módulo (solo las columnas que se muestran) —
   * incluye vehículos de baja (a diferencia de BASICO, que es para autocompletar).
   * Ojo: la propiedad de salida sigue llamandose ID_VEHICULO porque es el contrato con
   * el frontend (app.html usa idCampo: 'ID_VEHICULO'), pero el VALOR sale de la columna 'ID'.
   */
  const RESUMEN = Object.assign({}, VEHICULOS, {
    // El Panorama de Vehículos se arma con esta lista (su propio permiso desde el 14-oct).
    // Gestión de Activos también (20-oct): a diferencia de BASICO (solo para autocompletar,
    // nunca trae BAJA VEHICULAR), esta sí los incluye con su ESTATUS -- es la que necesita para
    // seguir mostrando en el panel de la persona un vehículo que ya dio de baja, sin que cuente
    // como activo (RESPONSABLE VEHICULO se agregó para ese match).
    leenTambien: ['panorama-vehiculos', 'gestion-activos'],
    columnas: ['ID', 'FOLIO', 'NUCCO', 'DEPARTAMENTO', 'NO ECONOMICO', 'MARCA', 'CLASE',
      'LINEA VEHICULO', 'MODELO', 'COLOR', 'PLACA', 'SERIE VEHICULO', 'SEDE', 'ESTATUS', 'FECHA REGISTRO SISTEMA CI',
      'RESPONSABLE VEHICULO'],
    incluir: (r) => !!r['FOLIO'],
    fila: (r) => ({
      ID_VEHICULO: r['ID'],
      FOLIO: r['FOLIO'],
      NUCCO: r['NUCCO'] || '',
      DEPARTAMENTO: r['DEPARTAMENTO'] || '',
      NO_ECONOMICO: r['NO ECONOMICO'] || '',
      MARCA: r['MARCA'] || '',
      CLASE: r['CLASE'] || '',
      LINEA_VEHICULO: r['LINEA VEHICULO'] || '',
      MODELO: r['MODELO'] || '',
      COLOR: r['COLOR'] || '',
      PLACA: r['PLACA'] || '',
      SERIE_VEHICULO: r['SERIE VEHICULO'] || '',
      SEDE: r['SEDE'] || '',
      ESTATUS: r['ESTATUS'] || '',
      FECHA_REGISTRO: r['FECHA REGISTRO SISTEMA CI'] || '',
      RESPONSABLE_VEHICULO: r['RESPONSABLE VEHICULO'] || '',
    }),
    orden: { campo: 'FOLIO' },
  });

  /** Lectura ligera para la campanita (vencimientosSeguro): 4 columnas, con caché como las demás */
  const SEGURO = Object.assign({}, VEHICULOS, {
    columnas: ['FOLIO', 'NUCCO', 'ESTATUS', 'FECHA VENCIMIENTO SEGURO', 'DEPARTAMENTO'],
    incluir: (r) => !!r['FOLIO'],
    fila: (r) => ({
      FOLIO: r['FOLIO'], NUCCO: r['NUCCO'] || '', ESTATUS: r['ESTATUS'] || '',
      'FECHA VENCIMIENTO SEGURO': r['FECHA VENCIMIENTO SEGURO'] || '',
      DEPARTAMENTO: r['DEPARTAMENTO'] || '',
    }),
  });

  /**
   * Diagnóstico de solo lectura: cuántas filas de VEHICULOS tienen la columna
   * ID (ID_COLUMN) vacía -- si hay más de una, todas esas filas colisionan en
   * el mismo "id" de fila en la tabla del navegador y hacer doble clic en
   * cualquiera de ellas abre siempre la ficha de la ÚLTIMA fila con ID vacío,
   * sin importar en cuál se haya hecho clic. Antes de la migración de IDs
   * (ver MigracionIds.gs) esto leía la columna vieja ID_VEHICULO, que daba
   * 653 de 653 vacías -- la migración ya corrió y renombró esa columna vieja
   * a "ID ANTERIOR", así que ahora se revisa la columna nueva de verdad.
   */
  function diagnosticoIds(token) {
    // Recorre todos los vehículos: no es para quien solo ve los de su departamento
    if (Permisos.puedeLeer(token, 'vehiculos').alcance) throw new Error('No tienes acceso a este diagnóstico.');
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, [ID_COLUMN, 'FOLIO', 'NUCCO']);
    const vacios = [];
    for (let i = 0; i < filas; i++) {
      if (!datos['FOLIO'][i]) continue;
      if (!datos[ID_COLUMN][i]) vacios.push({ FOLIO: datos['FOLIO'][i], NUCCO: datos['NUCCO'][i] || '' });
    }
    return { totalFilas: filas, totalConIdVacio: vacios.length, ejemplos: vacios.slice(0, 20) };
  }

  /** Lectura ligera (solo 4 columnas, no las 41 de completo()) para la campanita de
   *  notificaciones -- NotificacionesService.itemsSeguro_ vigila FECHA VENCIMIENTO
   *  SEGURO de cada vehículo activo. */
  function vencimientosSeguro(token) {
    return HojaServicio.listar(SEGURO, token);
  }

  /**
   * El registro completo de un vehículo (todas sus columnas) por su ID, o null. Así se pide un vehículo
   * (12-oct-2026, "serie o NUCO, jamás folio"): el folio se reasigna, el ID no.
   */
  function buscarPorId(token, id) {
    return buscarPor_(token, ID_COLUMN, id);
  }

  /**
   * Por el ID del vehículo; si lo que llega no tiene forma de ID, por su folio. Lo segundo es solo para
   * una página abierta antes de que los formularios mandaran el ID: nada nuevo debe llegar por ahí.
   */
  function buscar(token, clave) {
    const limpio = String(clave == null ? '' : clave).trim();
    return Ids.tieneForma(limpio) ? buscarPorId(token, limpio) : buscarPorFolio(token, limpio);
  }

  /** Por FOLIO (lo que la gente escribe en un buscador). Para ligar un registro, buscarPorId. */
  function buscarPorFolio(token, folio) {
    return buscarPor_(token, 'FOLIO', folio);
  }

  /**
   * Regresa el registro completo de un vehículo (todas sus columnas) por una
   * columna (ID o FOLIO), o null. Optimizado: en vez de leer las 648 filas x 41 columnas
   * completas (SheetUtils.getAll) solo para buscar una, primero lee nada
   * más esa columna para ubicar el renglón, y luego lee solo esa fila.
   */
  function buscarPor_(token, columna, valor) {
    // Referencia: el detalle de una incidencia o una reasignación también necesita el vehículo
    const sesion = Permisos.puedeLeerFamilia(token, 'vehiculos');
    if (!valor) return null;

    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const col = headers.indexOf(columna);
    if (col === -1) return null;

    const valores = sheet.getRange(2, col + 1, lastRow - 1, 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < valores.length; i++) {
      if (String(valores[i][0]).trim() === String(valor).trim()) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) return null;

    const fila = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    // Un CLIENT no abre un vehículo de otro departamento aunque sepa su ID (VEHICULOS.alcance)
    if (!Permisos.dentroDeAlcance(sesion.alcance, fila[headers.indexOf(VEHICULOS.alcance)])) return null;
    const limpio = {};
    headers.forEach((h, i) => {
      const valor = fila[i];
      // google.script.run puede fallar con Date crudo — se manda como texto ISO.
      limpio[h] = valor instanceof Date ? valor.toISOString() : valor;
    });

    // Responsiva/Documento de baja/Póliza/Archivo de tenencia: en datos viejos
    // (migrados de AppSheet) el valor es una RUTA relativa ("VEHICULOS_Files_/
    // AUT0017.DOCUMENTO BAJA...pdf"), no una URL — el cliente solo convierte en
    // link lo que empieza con "http", así que se veían como texto suelto sin
    // poder abrirse. Se resuelve aquí a la URL real de Drive antes de mandarla
    // (los archivos subidos con esta app ya guardan la URL directa, así que
    // esos quedan igual).
    const indicesArchivo = SheetUtils.indiceDeColumnas(headers, CAMPOS_ARCHIVO);
    CAMPOS_ARCHIVO.forEach((campo) => {
      const idx = indicesArchivo[campo];
      if (idx === -1) return;
      const headerReal = headers[idx];
      const valor = limpio[headerReal];
      if (valor && typeof valor === 'string' && !/^https?:\/\//.test(valor)) {
        try {
          const url = DriveUtils.urlDeRutaProfunda(valor, Config.DRIVE_FOLDERS.RAIZ());
          if (url) limpio[headerReal] = url;
        } catch (err) {
          console.error('No se pudo resolver el archivo "' + valor + '": ' + err.message);
        }
      }
    });

    // Lo que el vehículo trae puesto ahora (hoja ACCESORIOS VEHICULO aparte, ver su comentario
    // arriba): se junta aquí para que la ficha lo vea como si fuera una columna más de VEHICULOS.
    Object.assign(limpio, obtenerAccesoriosVehiculo_(token, limpio[ID_COLUMN]));

    return limpio;
  }

  // Prefijo de folio según Clase — folio = PREFIJO + consecutivo de 4 dígitos,
  // el siguiente disponible para ESE prefijo (no se reutilizan aunque se
  // borre a la mitad un vehículo). Clases sin prefijo propio (CUATRIMOTO,
  // NUCO SIN INFORMACION, etc.) caen en el prefijo genérico "FOL". MOTOCARRO
  // comparte el prefijo MOT con MOTOCICLETA (confirmado con Jorge 2026-09-30:
  // los folios de motocarro ya existentes usan MOT).
  const PREFIJOS_CLASE = {
    AUTOMOVIL: 'AUT',
    CAMION: 'CON',
    CAMIONETA: 'CTA',
    MOTOCICLETA: 'MOT',
    MOTOCARRO: 'MOT',
    REMOLQUE: 'REM',
    'MAQUINARIA MENOR': 'MAQ',
  };
  const PREFIJO_POR_DEFECTO = 'FOL';

  /** Calcula el siguiente folio disponible para el prefijo de una Clase dada. */
  function generarFolio_(clase) {
    const prefijo = PREFIJOS_CLASE[String(clase || '').toUpperCase().trim()] || PREFIJO_POR_DEFECTO;
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf('FOLIO');
      if (col !== -1) {
        const patron = new RegExp('^' + prefijo + '(\\d+)$', 'i');
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const match = patron.exec(String(fila[0] || '').trim());
          if (match) maximo = Math.max(maximo, parseInt(match[1], 10));
        });
      }
    }
    return prefijo + String(maximo + 1).padStart(4, '0');
  }

  /** Solo para mostrarlo en el formulario de Registrar mientras se llena (el
   * campo Folio es de solo lectura) — NO reserva el folio, es una vista previa;
   * el que de verdad queda asignado se recalcula bajo candado dentro de crear(). */
  function previsualizarFolio(token, clase) {
    Permisos.puedeLeer(token, 'vehiculos');
    return generarFolio_(clase);
  }

  /** NUCCO: consecutivo simple (no depende de la Clase, a diferencia del
   * Folio) — el siguiente número disponible es el máximo NUCCO numérico ya
   * usado + 1, con ceros a la izquierda a 5 dígitos (00001, 00002…). Valores
   * viejos que no sean puramente numéricos se ignoran al calcular el máximo. */
  function generarNucco_() {
    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    let maximo = 0;
    if (lastRow >= 2) {
      const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
      const col = headers.indexOf('NUCCO');
      if (col !== -1) {
        sheet.getRange(2, col + 1, lastRow - 1, 1).getValues().forEach((fila) => {
          const texto = String(fila[0] || '').trim();
          if (/^\d+$/.test(texto)) maximo = Math.max(maximo, parseInt(texto, 10));
        });
      }
    }
    return String(maximo + 1).padStart(5, '0');
  }

  /** Vista previa de NUCCO para el formulario de Registrar (mismo criterio que
   * previsualizarFolio: no reserva nada, el valor real se recalcula bajo
   * candado dentro de crear()). No depende de ningún otro campo del formulario,
   * así que se pide una sola vez al abrir el módulo. */
  function previsualizarNucco(token) {
    // De la lista ya guardada, no de la hoja: es solo lo que se enseña en el formulario; el
    // NUCCO de verdad lo calcula generarNucco_() bajo candado al guardar
    let maximo = 0;
    HojaServicio.listar(RESUMEN, token).forEach((v) => {
      const texto = String(v.NUCCO || '').trim();
      if (/^\d+$/.test(texto)) maximo = Math.max(maximo, parseInt(texto, 10));
    });
    return String(maximo + 1).padStart(5, '0');
  }


  // Carpetas de Drive de los adjuntos (responsiva, documento de baja, póliza, tenencia): PDF a
  // "VEHICULOS_Files_", imagen (foto del documento) a "VEHICULOS_Images", las dos en la raíz de
  // la app (DriveUtils.carpetaEnRaiz). El archivo hereda los permisos que ya tenga la carpeta.
  const CARPETA_ADJUNTOS = 'VEHICULOS_Files_';

  // Qué documento del expediente es cada columna de archivo (ExpedienteNuco: carpeta del NUCO)
  const DOCUMENTO_DE = {
    'RESPONSIVA': 'RESPONSIVA', 'DOCUMENTO BAJA': 'ALTA', 'POLIZA SEGURO': 'SEGURO', 'ARCHIVO TENENCIA': 'TENENCIA',
    'ADJUNTAR FACTURA': 'FACTURA', 'TARJETA CIRCULACION': 'TARJETA', 'ALTA PLACAS': 'ALTA',
  };
  // El documento de baja va con las placas, pero en su subcarpeta y con su nombre (BAJA-0088.pdf): no es el alta vigente
  const APARTE_DE = { 'DOCUMENTO BAJA': { subcarpeta: 'BAJAS', prefijo: 'BAJA' } };

  /**
   * SheetUtils escribe solo en las columnas que la hoja ya tiene: sin esto, la liga de la tarjeta o del alta se perdía
   * (el archivo sí llegaba al NUCO). Agrega al final de VEHICULOS las de COLUMNAS_DOCUMENTO_NUEVAS que traiga lo que se
   * va a guardar y la hoja no tenga. Solo encabezados: los renglones de antes quedan vacíos en esas columnas.
   */
  function asegurarColumnasDocumento_(datos) {
    const quiere = COLUMNAS_DOCUMENTO_NUEVAS.filter((c) => datos && datos[c]);
    if (!quiere.length) return;
    const hoja = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const indices = SheetUtils.indiceDeColumnas(encabezados, quiere);
    const faltan = quiere.filter((c) => indices[c] === -1);
    if (!faltan.length) return;
    hoja.getRange(1, encabezados.length + 1, 1, faltan.length).setValues([faltan]);
    CacheHojas.tocarHoja(hoja);
  }

  /** Saca de `datos` las claves de ACCESORIOS_VEHICULO (y las quita de ahí): lo que regresa es lo
   *  que se guarda en la hoja aparte; lo que se queda en `datos` nunca llega a VEHICULOS ni a la
   *  bitácora de Cambios Vehículos, que no sabría qué hacer con una columna que no tiene. */
  function extraerAccesorios_(datos) {
    const encontrados = {};
    ACCESORIOS_VEHICULO.forEach((c) => {
      if (datos[c] !== undefined) { encontrados[c] = datos[c]; delete datos[c]; }
    });
    return encontrados;
  }

  /** La hoja ACCESORIOS VEHICULO, creándola (con sus encabezados) la primera vez que haga falta
   *  -- mismo patrón que PermisosService.anotarHistorial_ / MigracionPipeline con su hoja de log. */
  function hojaAccesorios_() {
    const ss = SpreadsheetApp.openById(ssId());
    let hoja = ss.getSheetByName(ACCESORIOS_SHEET);
    if (!hoja) {
      hoja = ss.insertSheet(ACCESORIOS_SHEET);
      hoja.getRange(1, 1, 1, ENCABEZADOS_ACCESORIOS.length).setValues([ENCABEZADOS_ACCESORIOS]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  /** Los accesorios de un vehículo ({columna: 'SI'|'NO'}), o {} si todavía no tiene renglón (o la
   *  hoja ni siquiera existe: nadie ha guardado accesorios de nadie todavía). */
  function obtenerAccesoriosVehiculo_(token, idVehiculo) {
    if (!idVehiculo) return {};
    try {
      const encontrado = SheetUtils.findById(ssId(), ACCESORIOS_SHEET, idVehiculo, 'ID VEHICULO');
      if (encontrado) return encontrado.data;
    } catch (e) {
      // La hoja propia todavía no existe: sigue abajo, a precargar de la Responsiva.
    }
    return accesoriosDeResponsivaMasReciente_(token, idVehiculo);
  }

  /**
   * Mientras el vehículo no tenga su propio renglón en ACCESORIOS VEHICULO (nadie ha guardado
   * nada ahí todavía), se precarga con lo que diga su Responsiva más reciente -- "el vehículo se
   * entrega con..." es la entrada original de estos datos (usuario, 15-oct-2026); las
   * inspecciones periódicas son harina de otro costal (su checklist de "Inventarios" no tiene
   * los mismos 13 nombres ni la misma granularidad -- CRUCETA/TAPETES ahí, LLAVE CRUZ/TAPETES
   * RUDO+ALFOMBRA aquí -- así que no se intenta mapear). En cuanto se guarde aquí una vez, el
   * vehículo ya tiene su propio renglón y esto deja de consultarse para él. Sin acceso a
   * Responsiva (ResponsivaVehicularService ya revisa el permiso) o sin ninguna responsiva
   * todavía: se deja en blanco, nunca truena la ficha por esto.
   */
  function accesoriosDeResponsivaMasReciente_(token, idVehiculo) {
    try {
      const responsivas = ResponsivaVehicularService.listarPorVehiculo(token, idVehiculo);
      if (!responsivas.length) return {};
      const completa = ResponsivaVehicularService.buscarPorId(token, responsivas[0].ID);
      const datos = {};
      ACCESORIOS_VEHICULO.forEach((c) => { if (completa && completa[c]) datos[c] = completa[c]; });
      return datos;
    } catch (e) {
      return {};
    }
  }

  /** Upsert de los accesorios de un vehículo: si ya tiene renglón lo actualiza, si no lo crea */
  function guardarAccesoriosVehiculo_(idVehiculo, cambios) {
    if (!idVehiculo || !cambios || !Object.keys(cambios).length) return;
    hojaAccesorios_();   // se asegura de que la hoja ya exista antes de buscar/escribir
    const existente = SheetUtils.findById(ssId(), ACCESORIOS_SHEET, idVehiculo, 'ID VEHICULO');
    if (existente) SheetUtils.update(ssId(), ACCESORIOS_SHEET, idVehiculo, cambios, 'ID VEHICULO');
    else SheetUtils.insert(ssId(), ACCESORIOS_SHEET, Object.assign({ 'ID VEHICULO': idVehiculo }, cambios));
  }

  /**
   * Después de guardar: cada archivo nuevo de la ficha (la liga a Drive que dejó subirArchivo) pasa al expediente de su
   * NUCO con su nombre (SEGURO-0088.pdf) y el que estaba vigente, a "anteriores". Mover no cambia el ID, así que la
   * liga de la columna sigue sirviendo. Las rutas de AppSheet ("VEHICULOS_Files_/…") no son ligas: no se tocan. Si
   * algo falla el vehículo ya quedó guardado: se anota y sigue.
   */
  function archivarEnExpediente_(registro, cambios) {
    Object.keys(DOCUMENTO_DE).forEach((columna) => {
      const id = ExpedienteNuco.idDeLiga((cambios || {})[columna]);
      if (!id) return;
      try {
        ExpedienteNuco.archivar(DriveApp.getFileById(id), registro.NUCCO, DOCUMENTO_DE[columna], APARTE_DE[columna]);
      } catch (err) {
        console.error('No se pudo guardar ' + columna + ' en el expediente del NUCO ' + registro.NUCCO + ': ' + err.message);
      }
    });
  }
  const CARPETA_ADJUNTOS_IMAGENES = 'VEHICULOS_Images';

  /**
   * Guarda el folio y la liga que encontró AdquisicionVehicularService.buscar() -- el único
   * camino para escribir estas dos columnas (noEditables las bloquea en actualizar() normal).
   */
  function guardarExpedienteAdquisicion(token, id, datos) {
    Permisos.puedeEditar(token, 'vehiculos');
    // La pestaña Adquisición de la ficha es de su propio permiso (14-oct)
    Permisos.puedeLeer(token, 'adquisicion-vehicular');
    return SheetUtils.update(ssId(), SHEET_VEHICULOS, id, {
      'FOLIO ADQUISICION': datos['FOLIO ADQUISICION'] || '',
      'LIGA EXPEDIENTE ADQUISICION': datos['LIGA EXPEDIENTE ADQUISICION'] || '',
    }, ID_COLUMN);
  }

  /**
   * Lo mismo que guardarExpedienteAdquisicion, pero para TODOS los vehículos de un jalón --
   * así no hay que abrir cada ficha y darle clic a "Buscar expediente". Solo se corre desde el
   * editor (adquisicionVehicularIndice_autoLlenarVehiculos, AdquisicionVehicularIndice.gs);
   * `mapaSerieAFolioLiga` es { SERIE_NORMALIZADA: { folio, liga } }, ya armado por quien llama.
   *
   * Nunca pisa un vehículo que ya tenía algo en FOLIO ADQUISICION (ni a mano, ni de una corrida
   * anterior de esto) -- y solo toca esas dos columnas, nunca el resto de la fila: una sola
   * lectura y una sola escritura POR COLUMNA (no SheetUtils.update por vehículo, son cientos y
   * cada uno relee la hoja completa para encontrar su fila).
   */
  function autoLlenarAdquisicion(mapaSerieAFolioLiga) {
    soloEditor_();
    const hoja = SpreadsheetApp.openById(ssId()).getSheetByName(SHEET_VEHICULOS);
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
    const colSerie = encabezados.indexOf('SERIE VEHICULO') + 1;
    const colFolio = encabezados.indexOf('FOLIO ADQUISICION') + 1;
    const colLiga = encabezados.indexOf('LIGA EXPEDIENTE ADQUISICION') + 1;
    if (!colSerie || !colFolio || !colLiga) throw new Error('VEHICULOS no tiene las columnas SERIE VEHICULO/FOLIO ADQUISICION/LIGA EXPEDIENTE ADQUISICION.');
    const nFilas = hoja.getLastRow() - 1;
    if (nFilas <= 0) return 0;
    const series = hoja.getRange(2, colSerie, nFilas, 1).getValues();
    const folios = hoja.getRange(2, colFolio, nFilas, 1).getValues();
    const ligas = hoja.getRange(2, colLiga, nFilas, 1).getValues();
    let llenados = 0;
    for (let i = 0; i < nFilas; i++) {
      if (folios[i][0]) continue;
      const serie = String(series[i][0] || '').toUpperCase().replace(/\s+/g, '');
      const encontrado = serie && mapaSerieAFolioLiga[serie];
      if (!encontrado) continue;
      folios[i][0] = encontrado.folio;
      ligas[i][0] = encontrado.liga;
      llenados++;
    }
    if (llenados) {
      hoja.getRange(2, colFolio, nFilas, 1).setValues(folios);
      hoja.getRange(2, colLiga, nFilas, 1).setValues(ligas);
      CacheHojas.tocar(ssId(), SHEET_VEHICULOS);
    }
    return llenados;
  }

  return {
    /** Catálogo completo, todas las columnas. Pesado (648 filas x 41 columnas) —
     * usar listarResumen() para listas/tarjetas y buscarPorFolio() para detalle. */
    listar: (token) => HojaServicio.listar(VEHICULOS, token),
    listarBasico: (token) => HojaServicio.listar(BASICO, token),
    listarResumen: (token) => HojaServicio.listar(RESUMEN, token),
    /** Para el activador (Calentador.gs): las listas que se piden en cada pantalla, ya armadas */
    calentar: () => [BASICO, RESUMEN, SEGURO].forEach(HojaServicio.calentar),
    /** Todas las columnas de TODOS los vehículos (para "Vista": mostrar/exportar cualquier columna) */
    completo: (token) => HojaServicio.completo(VEHICULOS, token),
    /** Para el activador: que nadie pague la primera lectura de las 41 columnas al abrir "Vista" */
    calentarCompleto: () => HojaServicio.calentarCompleto(VEHICULOS),
    buscarPorId, buscar, buscarPorFolio, previsualizarFolio, previsualizarNucco,
    /** ¿Este NUCO es de un vehículo que la persona puede ver? (sus documentos en Drive van por NUCO) */
    nuccoEnAlcance: (token, nucco) => !!buscarPor_(token, 'NUCCO', nucco),
    /** Lo mismo por la serie (el expediente de Adquisición va por serie) */
    serieEnAlcance: (token, serie) => !!buscarPor_(token, 'SERIE VEHICULO', serie),
    crear: (token, datos) => HojaServicio.crear(VEHICULOS, token, datos),
    actualizar: (token, id, cambios, opciones) => HojaServicio.actualizar(VEHICULOS, token, id, cambios, opciones),
    /** Borrado físico, para altas hechas por error — el negocio normalmente "da de baja"
     * (ESTATUS = BAJA VEHICULAR). Por Relaciones (lo hace HojaServicio): se niega si el
     * vehículo tiene historial (inspecciones, incidencias, hologramas…). */
    eliminar: (token, id) => HojaServicio.eliminar(VEHICULOS, token, id),
    /**
     * Sube un adjunto (PDF/imagen) en base64 y regresa su URL — el cliente guarda esa URL en
     * la columna (RESPONSIVA / DOCUMENTO BAJA / …) al llamar crear()/actualizar().
     */
    subirArchivo(token, nombreArchivo, mimeType, base64Data) {
      Permisos.puedeEditar(token, 'vehiculos');
      const carpeta = DriveUtils.carpetaEnRaiz(/^image\//.test(mimeType || '') ? CARPETA_ADJUNTOS_IMAGENES : CARPETA_ADJUNTOS).getId();
      return HojaServicio.subirArchivo(carpeta, 'de adjuntos de Vehículos', nombreArchivo, mimeType, base64Data);
    },
    diagnosticoIds, vencimientosSeguro,
    guardarExpedienteAdquisicion, autoLlenarAdquisicion,
  };
})();
