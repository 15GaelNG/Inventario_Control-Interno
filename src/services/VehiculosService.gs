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
  const CAMPOS_ARCHIVO = ['RESPONSIVA', 'DOCUMENTO BAJA', 'POLIZA SEGURO', 'ARCHIVO TENENCIA'];
  // Etiqueta corta para el nombre de archivo en Drive, por columna ("<ID>_<ETIQUETA>_<fecha>.ext")
  const ETIQUETA_ARCHIVO = {
    'RESPONSIVA': 'RESPONSIVA',
    'DOCUMENTO BAJA': 'DOCUMENTO_BAJA',
    'POLIZA SEGURO': 'POLIZA_SEGURO',
    'ARCHIVO TENENCIA': 'TENENCIA',
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
    // El catálogo completo trae también los renglones sin ID (diagnosticoIds los cuenta)
    incluir: () => true,
    archivos: ETIQUETA_ARCHIVO,
    candadoAlCrear: true,
    alCrear: (fila, ctx) => {
      // Las columnas que manda otra hoja (SERIE SENSOR y SENSOR, que manda Instalación de
      // Sensores) no se capturan aquí: un vehículo nuevo nace "sin sensor".
      const ajenas = Relaciones.deOtraHoja(SHEET_VEHICULOS);
      ajenas.columnas.forEach((c) => { delete fila[c]; });
      Object.assign(fila, ajenas.sinDueno);
      conPersona_(fila, fila);
      fila.FOLIO = generarFolio_(ctx.datos.CLASE);
      fila.NUCCO = generarNucco_();
      fila[ID_COLUMN] = Ids.nuevo(Entidades.prefijo(SHEET_VEHICULOS));
      fila['FECHA REGISTRO SISTEMA CI'] = new Date();
    },
    noEditables: ['FOLIO', 'NUCCO', 'FECHA REGISTRO SISTEMA CI'],
    alActualizar: (cambios, ctx) => {
      // Las que manda otra hoja: editarlas aquí se perdería en la siguiente sincronización.
      // Se cambian desde su dueña (SERIE SENSOR y SENSOR: el módulo de Sensores).
      Relaciones.deOtraHoja(SHEET_VEHICULOS).columnas.forEach((c) => { delete cambios[c]; });
      conPersona_(cambios, Object.assign({}, ctx.actual, cambios));
    },
    despues: (registro, ctx) => {
      if (ctx.accion !== 'actualizar') return;
      CambiosVehiculosService.registrarCambios(ctx.actual.FOLIO, ctx.actual, ctx.cambios, ctx.sesion.nombre);
      // El vehículo YA se guardó: si propagar falla no se revierte nada, solo se avisa en los
      // logs y revisar() lo corrige en la corrida nocturna. candadoTomado: quien llama ya tiene
      // el candado (Reasignaciones) y waitLock no es reentrante.
      try {
        if (ctx.opciones.candadoTomado) Relaciones.propagarSinCandado('VEHICULOS', registro, ctx.cambios);
        else Relaciones.propagar('VEHICULOS', registro, ctx.cambios);
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
  const BASICO = Object.assign({}, VEHICULOS, {
    columnas: ['ID', 'FOLIO', 'DEPARTAMENTO', 'MARCA', 'LINEA VEHICULO', 'MODELO', 'ESTATUS',
      'RESPONSABLE VEHICULO', 'NO EMPLEADO', 'SERIE VEHICULO', 'NUCCO'],
    incluir: (r) => !!r['FOLIO'] && String(r['ESTATUS'] || '').toUpperCase() !== 'BAJA VEHICULAR',
    fila: (r) => ({
      ID: r['ID'],
      FOLIO: r['FOLIO'],
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
    columnas: ['ID', 'FOLIO', 'NUCCO', 'DEPARTAMENTO', 'NO ECONOMICO', 'MARCA', 'CLASE',
      'LINEA VEHICULO', 'MODELO', 'COLOR', 'PLACA', 'SEDE', 'ESTATUS', 'FECHA REGISTRO SISTEMA CI'],
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
      SEDE: r['SEDE'] || '',
      ESTATUS: r['ESTATUS'] || '',
      FECHA_REGISTRO: r['FECHA REGISTRO SISTEMA CI'] || '',
    }),
    orden: { campo: 'FOLIO' },
  });

  /** Lectura ligera para la campanita (vencimientosSeguro): 4 columnas, con caché como las demás */
  const SEGURO = Object.assign({}, VEHICULOS, {
    columnas: ['FOLIO', 'NUCCO', 'ESTATUS', 'FECHA VENCIMIENTO SEGURO'],
    incluir: (r) => !!r['FOLIO'],
    fila: (r) => ({
      FOLIO: r['FOLIO'], NUCCO: r['NUCCO'] || '', ESTATUS: r['ESTATUS'] || '',
      'FECHA VENCIMIENTO SEGURO': r['FECHA VENCIMIENTO SEGURO'] || '',
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
    Permisos.puedeLeer(token, 'vehiculos');
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
   * Regresa el registro completo de un vehículo (todas sus columnas) por
   * FOLIO, o null. Optimizado: en vez de leer las 648 filas x 41 columnas
   * completas (SheetUtils.getAll) solo para buscar una, primero lee nada
   * más la columna FOLIO para ubicar el renglón, y luego lee solo esa fila.
   */
  function buscarPorFolio(token, folio) {
    Permisos.puedeLeer(token, 'vehiculos');
    if (!folio) return null;

    const sheet = SheetUtils.getSheet(ssId(), SHEET_VEHICULOS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return null;

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const folioCol = headers.indexOf('FOLIO');
    if (folioCol === -1) return null;

    const folios = sheet.getRange(2, folioCol + 1, lastRow - 1, 1).getValues();
    let rowIndex = -1;
    for (let i = 0; i < folios.length; i++) {
      if (String(folios[i][0]) === String(folio)) {
        rowIndex = i + 2;
        break;
      }
    }
    if (rowIndex === -1) return null;

    const fila = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
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

  /**
   * ID PERSONA no se captura: se calcula del responsable (CapitalHumano, decisión del
   * 01/10/2026). Si cambió el responsable (o su número), se recalcula y va en el mismo
   * renglón. Si todavía no hay PERSONAS, no se toca; Salud lo pone al día después.
   *
   * @param {Object} datos     lo que se va a escribir (aquí se agrega ID PERSONA)
   * @param {Object} registro  el registro completo como va a quedar
   */
  function conPersona_(datos, registro) {
    delete datos[CapitalHumano.COLUMNA];
    if (!CapitalHumano.columnasDePersona(SHEET_VEHICULOS).some((c) => datos[c] !== undefined)) return;
    try {
      const id = CapitalHumano.idPara(SHEET_VEHICULOS, registro);
      if (id !== null) datos[CapitalHumano.COLUMNA] = id;
    } catch (err) {
      console.error('CapitalHumano: no se pudo calcular la persona del vehículo: ' + err.message);
    }
  }

  // Carpetas de Drive de los adjuntos (responsiva, documento de baja, póliza, tenencia): PDF a
  // "VEHICULOS_Files_", imagen (foto del documento) a "VEHICULOS_Images". El archivo hereda
  // los permisos que ya tenga la carpeta compartida.
  const CARPETA_ADJUNTOS_ID = '1BrGhaC18GtXDCw7k9kZlMdK-Pp15lupz';
  const CARPETA_ADJUNTOS_IMAGENES_ID = '11NfoCfZyGUvlLJ3PPKUTg5kwN8nYaZLP';

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
    buscarPorFolio, previsualizarFolio, previsualizarNucco,
    crear: (token, datos) => HojaServicio.crear(VEHICULOS, token, datos),
    /**
     * @param opciones.candadoTomado  true si el llamador YA tiene el candado del script.
     *   waitLock() no es reentrante, así que propagar() se colgaría 20 s y moriría en
     *   silencio. Lo usa ReasignacionesVehicularesService.crear().
     */
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
      const carpeta = /^image\//.test(mimeType || '') ? CARPETA_ADJUNTOS_IMAGENES_ID : CARPETA_ADJUNTOS_ID;
      return HojaServicio.subirArchivo(carpeta, 'de adjuntos de Vehículos', nombreArchivo, mimeType, base64Data);
    },
    diagnosticoIds, vencimientosSeguro,
  };
})();
