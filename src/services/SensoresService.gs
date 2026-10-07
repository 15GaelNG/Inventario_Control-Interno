/**
 * SensoresService.gs
 * Instalación de sensores GPS: una fila por equipo instalado en un vehículo.
 *
 * Hoja real "INSTALACION DE SENSORES" (misma estructura que producción/AppSheet):
 *   ID_SENSOR | FOLIO | SERIE VEHICULO | SERIE SENSOR | RESPONSABLE | RESPONSIVA SENSOR |
 *   PLACA | MARCA | CLASE | LINEA VEHICULO | MODELO | TIPO DE COMBUSTIBLE | COLOR |
 *   CAPACIDAD DE COMBUSTIBLE | RAZON SOCIAL | DEPARTAMENTO | SEDE | OFICINA / DESARROLLO |
 *   ESTATUS SENSOR | FECHA INSTALACION | FECHA REGISTRO | RENDIMIENTO (KM/L) |
 *   CONSUMO RALENTI (L/HR) | COMENTARIOS
 *
 * - 12 columnas son COPIA de VEHICULOS (coinciden 207/207 en producción). Se llenan
 *   solas a partir del folio y no se editan aquí — ver docs/relaciones.md.
 * - TIPO DE COMBUSTIBLE sí es propio: en VEHICULOS es el tipo (GASOLINA/DIESEL) y aquí
 *   el producto que carga la unidad (MAGNA/PREMIUM/DIESEL).
 * - RESPONSIVA SENSOR es un PDF en la carpeta "INSTALACION DE SENSORES_Files_".
 * - RENDIMIENTO y CONSUMO RALENTI se capturan a mano o se calculan con Geotab
 *   (GeotabService.gs); el usuario confirma antes de guardarlos.
 */

const SensoresService = (function () {
  const TABLA = 'INSTALACION DE SENSORES';
  const CARPETA_RELATIVA = TABLA + '_Files_';
  const COL_RESPONSIVA = 'RESPONSIVA SENSOR';
  // Huella de la pestaña, no llave de renglon (ver la nota en HologramasService).
  const COLUMNAS_CLAVE = ['FOLIO', 'SERIE SENSOR', 'ESTATUS SENSOR'];
  const ESTATUS = ['ACTIVO', 'BAJA'];

  /**
   * TEMPORAL — se reemplaza por Relaciones.datosParaNuevo cuando exista
   * (ver docs/relaciones.md). Columna en esta hoja → columna en VEHICULOS.
   */
  // Las columnas que se copian del vehículo viven en Relaciones.MAPA, no aquí. Antes había
  // una copia de la lista en este archivo: el mismo juego de 14 columnas escrito dos veces,
  // y solo una de las dos sabía de la llave foránea.

  /** Combustible del vehículo → productos que puede cargar (lo que se elige en esta hoja) */
  const COMBUSTIBLES_POR_TIPO = {
    'DIESEL': ['DIESEL'],
    'GASOLINA': ['MAGNA', 'PREMIUM'],
    'HIBRIDO': ['MAGNA', 'PREMIUM'],
  };
  const COMBUSTIBLES = ['MAGNA', 'PREMIUM', 'DIESEL'];

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /** Nombre real de la pestaña (se ubica por su huella de columnas) */
  const nombreHoja_ = () => HojaServicio.nombreHoja(SENSORES);
  const fechaISO_ = (valor) => HojaServicio.fechaISO(valor);
  const fechaDesdeInput_ = (texto, nombreCampo) => HojaServicio.fechaObligatoria(texto, nombreCampo);

  function numeroOpcional_(valor, nombreCampo) {
    if (valor === '' || valor === null || valor === undefined) return '';
    const n = Number(String(valor).replace(/,/g, '').trim());
    if (isNaN(n) || n < 0) throw new Error('El ' + nombreCampo + ' debe ser un número mayor o igual a cero');
    return n;
  }

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const enMayusculas_ = (v) => limpiar_(v).toUpperCase();

  function desdeOriginal_(row) {
    return {
      ID: row['ID'],
      FOLIO: row['FOLIO'] || '',
      SERIE_SENSOR: row['SERIE SENSOR'] || '',
      SERIE_VEHICULO: row['SERIE VEHICULO'] || '',
      RESPONSABLE: row['RESPONSABLE'] || '',
      RESPONSIVA: row[COL_RESPONSIVA] || '',
      PLACA: row['PLACA'] || '',
      MARCA: row['MARCA'] || '',
      CLASE: row['CLASE'] || '',
      LINEA: row['LINEA VEHICULO'] || '',
      MODELO: row['MODELO'] || '',
      COMBUSTIBLE: row['TIPO DE COMBUSTIBLE'] || '',
      COLOR: row['COLOR'] || '',
      CAPACIDAD: row['CAPACIDAD DE COMBUSTIBLE'] === '' ? '' : row['CAPACIDAD DE COMBUSTIBLE'],
      RAZON_SOCIAL: row['RAZON SOCIAL'] || '',
      DEPARTAMENTO: row['DEPARTAMENTO'] || '',
      SEDE: row['SEDE'] || '',
      OFICINA: row['OFICINA / DESARROLLO'] || '',
      ESTATUS: row['ESTATUS SENSOR'] || '',
      FECHA_INSTALACION: fechaISO_(row['FECHA INSTALACION']),
      FECHA_REGISTRO: fechaISO_(row['FECHA REGISTRO']),
      RENDIMIENTO: row['RENDIMIENTO (KM/L)'] === '' ? '' : row['RENDIMIENTO (KM/L)'],
      RALENTI: row['CONSUMO RALENTI (L/HR)'] === '' ? '' : row['CONSUMO RALENTI (L/HR)'],
      COMENTARIOS: row['COMENTARIOS'] || '',
    };
  }

  /**
   * TEMPORAL (ver docs/relaciones.md, regla 1): datos que esta hoja copia del vehículo.
   * Cuando exista Relaciones.gs, esta función se reemplaza por Relaciones.datosParaNuevo.
   * @return {{columnas: Object, vehiculo: Object}}
   */
  /**
   * Las columnas que hereda un sensor del vehículo, más la llave foránea `ID VEHICULO`.
   *
   * Acepta el ID del vehículo o su folio: lo resuelve Relaciones.datosParaNuevo. Por eso
   * el parámetro ya no se llama `folio` — mientras el frontend se mueve, llega cualquiera
   * de los dos, y el FOLIO que se guarda sale del renglón del vehículo, no de aquí.
   */
  function datosDeVehiculo_(idOFolio) {
    const r = Relaciones.datosParaNuevo('INSTALACION DE SENSORES', idOFolio);
    return { columnas: r.datos, vehiculo: r.origen };
  }

  /** Productos de combustible válidos según el tipo que trae el vehículo */
  function combustiblesDe_(tipoVehiculo) {
    return COMBUSTIBLES_POR_TIPO[enMayusculas_(tipoVehiculo)] || COMBUSTIBLES;
  }

  /** La hoja, para HojaServicio */
  const SENSORES = {
    modulo: 'instalacion-sensores',
    nombre: 'la instalación',
    libro: ssId,
    hoja: TABLA,
    huella: COLUMNAS_CLAVE,
    fila: desdeOriginal_,
    orden: { campo: 'FECHA_INSTALACION', desc: true },
    // El sensor deja su vehículo (VEHICULOS.SERIE SENSOR / SENSOR, ver alVehiculo_)
    despuesDeEliminar: (registros) => registros.forEach((r) => alVehiculo_(r, null)),
  };

  /**
   * Datos que el formulario llena solos al escribir un folio: lo copiado del vehículo,
   * los combustibles válidos, la serie del sensor que ya trae VEHICULOS y si ya tiene
   * una instalación activa (para no duplicar sin avisar).
   */
  function datosParaFormulario(token, folio) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    const limpio = limpiar_(folio);
    if (!limpio) return null;
    const { columnas, vehiculo } = datosDeVehiculo_(limpio);

    const yaInstalado = SheetUtils.getAll(ssId(), nombreHoja_())
      .filter((r) => enMayusculas_(r['FOLIO']) === enMayusculas_(limpio) && enMayusculas_(r['ESTATUS SENSOR']) === 'ACTIVO')
      .map((r) => r['SERIE SENSOR']);

    return {
      copiados: columnas,
      combustibles: combustiblesDe_(vehiculo['TIPO DE COMBUSTIBLE']),
      tipoCombustibleVehiculo: vehiculo['TIPO DE COMBUSTIBLE'] || '',
      serieSensorSugerida: vehiculo['SERIE SENSOR'] || '',
      sensoresActivos: yaInstalado,
      // Para la ficha de confirmación: que se vea si la unidad está dada de baja
      estatusVehiculo: vehiculo['ESTATUS'] || '',
      sensorEnVehiculo: vehiculo['SENSOR'] || '',
    };
  }

  /**
   * VEHICULOS.SERIE SENSOR y VEHICULOS.SENSOR los manda ESTA hoja (ver la entrada
   * 'INSTALACION DE SENSORES' en Relaciones.MAPA): al revés que el resto de las columnas,
   * que manda VEHICULOS. Mismo trato que en VehiculosService.actualizar: el sensor YA se
   * guardó, así que si esto falla no se revierte nada — se avisa en el log, y la pantalla
   * Administración > Relaciones lo muestra como "por sincronizar".
   *
   * @param {Object} fila     el renglón del sensor (ya actualizado; o como estaba, al soltar)
   * @param {Object} cambios  lo que cambió; null = el sensor dejó ese vehículo (soltar)
   */
  function alVehiculo_(fila, cambios) {
    try {
      if (cambios) Relaciones.propagar(TABLA, fila, cambios);
      else Relaciones.soltar(TABLA, fila);
    } catch (err) {
      console.error('Relaciones: no se pudo actualizar el vehículo del sensor ' + (fila && fila['ID']) + ': ' + err.message);
    }
  }

  /**
   * @param {Object} datos  { FOLIO, SERIE_SENSOR, COMBUSTIBLE, FECHA_INSTALACION, ESTATUS,
   *                          RENDIMIENTO?, RALENTI?, COMENTARIOS? }
   * @param {{base64: string, mimeType: string}} archivo  responsiva en PDF
   */
  function registrar(token, datos, archivo) {
    Permisos.puedeEditar(token, 'instalacion-sensores');

    // Trae el ID del vehículo o su folio, según qué tan migrado esté el formulario.
    const folio = limpiar_(datos.FOLIO);
    if (!folio) throw new Error('Selecciona el vehículo');
    const serieSensor = enMayusculas_(datos.SERIE_SENSOR);
    if (!serieSensor) throw new Error('La serie del sensor es obligatoria');

    const { columnas, vehiculo } = datosDeVehiculo_(folio);
    const combustible = enMayusculas_(datos.COMBUSTIBLE);
    const validos = combustiblesDe_(vehiculo['TIPO DE COMBUSTIBLE']);
    if (validos.indexOf(combustible) === -1) {
      throw new Error('El combustible debe ser ' + validos.join(' o ') + ' (el vehículo usa ' +
        (vehiculo['TIPO DE COMBUSTIBLE'] || 'sin especificar') + ')');
    }
    const estatus = enMayusculas_(datos.ESTATUS) || 'ACTIVO';
    if (ESTATUS.indexOf(estatus) === -1) throw new Error('El estatus debe ser ACTIVO o BAJA');
    const fechaInstalacion = fechaDesdeInput_(datos.FECHA_INSTALACION, 'fecha de instalación');
    if (!archivo || !archivo.base64) throw new Error('Adjunta la responsiva del sensor en PDF');

    // La misma serie no puede estar activa en dos vehículos a la vez
    const duplicado = SheetUtils.getAll(ssId(), nombreHoja_()).find((r) =>
      enMayusculas_(r['SERIE SENSOR']) === serieSensor && enMayusculas_(r['ESTATUS SENSOR']) === 'ACTIVO');
    if (duplicado && estatus === 'ACTIVO') {
      throw new Error('La serie ' + serieSensor + ' ya está instalada y activa en el folio ' + duplicado['FOLIO']);
    }

    const id = Ids.nuevo(Entidades.prefijo('INSTALACION DE SENSORES'));
    const guardado = DriveUtils.guardarArchivoAppSheet({
      carpetaId: Config.DRIVE_FOLDERS.SENSORES(),
      carpetaRelativa: CARPETA_RELATIVA,
      idFila: id,
      columna: COL_RESPONSIVA,
      archivo: archivo,
      permitidos: ['application/pdf'],
      etiqueta: 'la responsiva',
    });
    // "<ID>_RESPONSIVA_SENSOR_<fecha>.ext": urlResponsiva() busca el archivo por ese nombre exacto
    const rutaResponsiva = HojaServicio.renombrarRuta(guardado.fileId, id, 'RESPONSIVA_SENSOR', guardado.ruta);

    let nueva;
    try {
      nueva = SheetUtils.insert(ssId(), nombreHoja_(), Object.assign({}, columnas, {
        'ID': id,
        'SERIE SENSOR': serieSensor,
        [COL_RESPONSIVA]: rutaResponsiva,
        'TIPO DE COMBUSTIBLE': combustible,
        'ESTATUS SENSOR': estatus,
        'FECHA INSTALACION': fechaInstalacion,
        'FECHA REGISTRO': new Date(),
        'RENDIMIENTO (KM/L)': numeroOpcional_(datos.RENDIMIENTO, 'rendimiento'),
        'CONSUMO RALENTI (L/HR)': numeroOpcional_(datos.RALENTI, 'consumo en ralentí'),
        'COMENTARIOS': limpiar_(datos.COMENTARIOS),
      }));
    } catch (err) {
      DriveUtils.eliminar(guardado.fileId);   // no dejar PDFs huérfanos
      throw err;
    }
    alVehiculo_(nueva, nueva);
    return { ID: id };
  }

  /**
   * Edición de UNA celda desde la tabla. Las columnas copiadas del vehículo NO se editan
   * aquí (regla 2 de docs/relaciones.md): cambian al cambiar el folio.
   */
  function actualizarCampo(token, id, campo, valor) {
    Permisos.puedeEditar(token, 'instalacion-sensores');
    const nombreHoja = nombreHoja_();
    const actual = SheetUtils.findById(ssId(), nombreHoja, id, 'ID');
    if (!actual) throw new Error('No se encontró la instalación ' + id);

    const cambios = {};
    if (campo === 'FOLIO') {
      // Cambiar de vehículo vuelve a copiar TODOS los datos del vehículo nuevo
      const folio = limpiar_(valor);
      if (!folio) throw new Error('El folio del vehículo es obligatorio');
      Object.assign(cambios, datosDeVehiculo_(folio).columnas);
    } else if (campo === 'SERIE_SENSOR') {
      const serie = enMayusculas_(valor);
      if (!serie) throw new Error('La serie del sensor es obligatoria');
      cambios['SERIE SENSOR'] = serie;
    } else if (campo === 'COMBUSTIBLE') {
      const validos = combustiblesDe_(
        (SheetUtils.findById(ssId(), 'VEHICULOS', actual.data['FOLIO'], 'FOLIO') || { data: {} }).data['TIPO DE COMBUSTIBLE']
      );
      const combustible = enMayusculas_(valor);
      if (validos.indexOf(combustible) === -1) throw new Error('El combustible debe ser ' + validos.join(' o '));
      cambios['TIPO DE COMBUSTIBLE'] = combustible;
    } else if (campo === 'ESTATUS') {
      const estatus = enMayusculas_(valor);
      if (ESTATUS.indexOf(estatus) === -1) throw new Error('El estatus debe ser ACTIVO o BAJA');
      cambios['ESTATUS SENSOR'] = estatus;
    } else if (campo === 'FECHA_INSTALACION') {
      cambios['FECHA INSTALACION'] = fechaDesdeInput_(valor, 'fecha de instalación');
    } else if (campo === 'RENDIMIENTO') {
      cambios['RENDIMIENTO (KM/L)'] = numeroOpcional_(valor, 'rendimiento');
    } else if (campo === 'RALENTI') {
      cambios['CONSUMO RALENTI (L/HR)'] = numeroOpcional_(valor, 'consumo en ralentí');
    } else if (campo === 'COMENTARIOS') {
      cambios['COMENTARIOS'] = limpiar_(valor);
    } else {
      throw new Error('El campo "' + campo + '" no se puede editar aquí');
    }

    const actualizado = SheetUtils.update(ssId(), nombreHoja, id, cambios, 'ID');
    if (campo === 'FOLIO') {
      // Se mudó de vehículo: el de antes se queda sin sensor y el nuevo lo recibe. Se
      // compara por ID VEHICULO, no por folio: es lo que de verdad dice a qué unidad va.
      const antes = actual.data['ID VEHICULO'] || actual.data['FOLIO'];
      const despues = actualizado['ID VEHICULO'] || actualizado['FOLIO'];
      if (String(antes) !== String(despues)) {
        alVehiculo_(actual.data, null);
        alVehiculo_(actualizado, { 'ESTATUS SENSOR': actualizado['ESTATUS SENSOR'] });
      }
    } else {
      // propagar solo escribe si cambió una de sus columnas (SERIE SENSOR, ESTATUS SENSOR)
      alVehiculo_(actualizado, cambios);
    }
    return desdeOriginal_(actualizado);
  }

  function urlResponsiva(token, ruta) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    const url = DriveUtils.urlDeRuta(ruta, [Config.DRIVE_FOLDERS.SENSORES()]);
    if (!url) throw new Error('No se encontró la responsiva en Drive');
    return url;
  }

  // ---------- Geotab ----------
  /** ¿Está configurado Geotab? Lo usa la vista para mostrar u ocultar lo que depende de él. */
  function geotabDisponible(token) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    return Geotab.configurado();
  }

  /**
   * Estado en vivo por SERIE SENSOR (para la columna "En vivo" de la tabla).
   * Si Geotab no está configurado o falla, regresa el motivo en vez de tronar:
   * la pantalla tiene que servir igual sin telemetría.
   */
  function estadoEnVivo(token) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    if (!Geotab.configurado()) return { disponible: false, motivo: 'Geotab no está configurado', estados: {} };
    try {
      return { disponible: true, estados: Geotab.estados(), consultado: new Date().toISOString() };
    } catch (err) {
      return { disponible: false, motivo: err.message, estados: {} };
    }
  }

  /**
   * Actividad de la unidad en Geotab (viajes, combustible y ralentí de los últimos días).
   * Solo informativo: no se guarda nada en la hoja. El rendimiento (km/L) y el consumo en
   * ralentí (L/h) de la hoja se siguen capturando a mano.
   */
  function resumenGeotab(token, id, dias) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    const actual = SheetUtils.findById(ssId(), nombreHoja_(), id, 'ID');
    if (!actual) throw new Error('No se encontró la instalación ' + id);
    const serie = limpiar_(actual.data['SERIE SENSOR']);
    if (!serie) throw new Error('Esta instalación no tiene serie de sensor');
    return Geotab.resumen(serie, dias);
  }

  return {
    listar: (token) => HojaServicio.listar(SENSORES, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(SENSORES),
    /** Sensores de un solo vehículo (ficha de Vehículos) */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(SENSORES, token, 'FOLIO', folio),
    /** Registro completo (todas las columnas) por ID -- "Ver completo" desde la ficha de Vehículos */
    buscarPorId: (token, id) => HojaServicio.buscarPorId(SENSORES, token, id),
    /** Todas las columnas de TODOS los sensores (para exportar completo) */
    completo: (token) => HojaServicio.completo(SENSORES, token),
    datosParaFormulario, registrar, actualizarCampo,
    /** Borra instalaciones — solo ADMIN. Las responsivas NO se borran de Drive (quedan de respaldo). */
    eliminar: (token, ids) => HojaServicio.eliminar(SENSORES, token, ids),
    urlResponsiva,
    geotabDisponible, estadoEnVivo, resumenGeotab,
  };
})();
