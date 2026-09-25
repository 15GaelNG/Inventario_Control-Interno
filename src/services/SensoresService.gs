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
  const COLUMNAS_CLAVE = ['ID_SENSOR', 'FOLIO', 'SERIE SENSOR'];
  const ESTATUS = ['ACTIVO', 'BAJA'];

  /**
   * TEMPORAL — se reemplaza por Relaciones.datosParaNuevo cuando exista
   * (ver docs/relaciones.md). Columna en esta hoja → columna en VEHICULOS.
   */
  const COPIADAS_DE_VEHICULO = {
    'SERIE VEHICULO': 'SERIE VEHICULO',
    'PLACA': 'PLACA',
    'MARCA': 'MARCA',
    'CLASE': 'CLASE',
    'LINEA VEHICULO': 'LINEA VEHICULO',
    'MODELO': 'MODELO',
    'COLOR': 'COLOR',
    'CAPACIDAD DE COMBUSTIBLE': 'CAPACIDAD COMBUSTIBLE (LTS)',
    'RAZON SOCIAL': 'RAZON SOCIAL',
    'DEPARTAMENTO': 'DEPARTAMENTO',
    'SEDE': 'SEDE',
    'OFICINA / DESARROLLO': 'UBICACION',
    'RESPONSABLE': 'RESPONSABLE VEHICULO',
  };

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

  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS_CLAVE);
  }

  /** Igual que en VerificacionesService: fechas de la hoja → texto ISO para el cliente */
  function fechaISO_(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
    const m = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return '';
    const f = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  /** "yyyy-MM-dd" → Date a medianoche local (new Date('yyyy-MM-dd') se iría al día anterior) */
  function fechaDesdeInput_(texto, nombreCampo) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(texto || ''))) throw new Error('Falta o es inválida la ' + nombreCampo);
    return Utilities.parseDate(texto, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }

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
      ID: row['ID_SENSOR'],
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
  function datosDeVehiculo_(folio) {
    const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', folio, 'FOLIO');
    if (!vehiculo) throw new Error('No existe un vehículo con folio ' + folio);
    const columnas = { 'FOLIO': folio };
    Object.keys(COPIADAS_DE_VEHICULO).forEach((destino) => {
      const origen = vehiculo.data[COPIADAS_DE_VEHICULO[destino]];
      columnas[destino] = origen === undefined || origen === null ? '' : origen;
    });
    return { columnas: columnas, vehiculo: vehiculo.data };
  }

  /** Productos de combustible válidos según el tipo que trae el vehículo */
  function combustiblesDe_(tipoVehiculo) {
    return COMBUSTIBLES_POR_TIPO[enMayusculas_(tipoVehiculo)] || COMBUSTIBLES;
  }

  function listar(token) {
    Permisos.puedeLeer(token, 'instalacion-sensores');
    return SheetUtils.getAll(ssId(), hoja_().getName())
      .filter((r) => r['ID_SENSOR'])
      .map(desdeOriginal_)
      .sort((a, b) => (b.FECHA_INSTALACION || '').localeCompare(a.FECHA_INSTALACION || ''));
  }

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

    const yaInstalado = SheetUtils.getAll(ssId(), hoja_().getName())
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
   * @param {Object} datos  { FOLIO, SERIE_SENSOR, COMBUSTIBLE, FECHA_INSTALACION, ESTATUS,
   *                          RENDIMIENTO?, RALENTI?, COMENTARIOS? }
   * @param {{base64: string, mimeType: string}} archivo  responsiva en PDF
   */
  function registrar(token, datos, archivo) {
    Permisos.puedeEditar(token, 'instalacion-sensores');

    const folio = limpiar_(datos.FOLIO);
    if (!folio) throw new Error('El folio del vehículo es obligatorio');
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
    const duplicado = SheetUtils.getAll(ssId(), hoja_().getName()).find((r) =>
      enMayusculas_(r['SERIE SENSOR']) === serieSensor && enMayusculas_(r['ESTATUS SENSOR']) === 'ACTIVO');
    if (duplicado && estatus === 'ACTIVO') {
      throw new Error('La serie ' + serieSensor + ' ya está instalada y activa en el folio ' + duplicado['FOLIO']);
    }

    const id = Utilities.getUuid().slice(0, 8);
    const guardado = DriveUtils.guardarArchivoAppSheet({
      carpetaId: Config.DRIVE_FOLDERS.SENSORES(),
      carpetaRelativa: CARPETA_RELATIVA,
      idFila: id,
      columna: COL_RESPONSIVA,
      archivo: archivo,
      permitidos: ['application/pdf'],
      etiqueta: 'la responsiva',
    });

    try {
      SheetUtils.insert(ssId(), hoja_().getName(), Object.assign({}, columnas, {
        'ID_SENSOR': id,
        'SERIE SENSOR': serieSensor,
        [COL_RESPONSIVA]: guardado.ruta,
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
    return { ID: id };
  }

  /**
   * Edición de UNA celda desde la tabla. Las columnas copiadas del vehículo NO se editan
   * aquí (regla 2 de docs/relaciones.md): cambian al cambiar el folio.
   */
  function actualizarCampo(token, id, campo, valor) {
    Permisos.puedeEditar(token, 'instalacion-sensores');
    const nombreHoja = hoja_().getName();
    const actual = SheetUtils.findById(ssId(), nombreHoja, id, 'ID_SENSOR');
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

    return desdeOriginal_(SheetUtils.update(ssId(), nombreHoja, id, cambios, 'ID_SENSOR'));
  }

  /** Borra instalaciones — solo ADMIN. Las responsivas NO se borran de Drive (quedan de respaldo). */
  function eliminar(token, ids) {
    Permisos.puedeEditar(token, 'instalacion-sensores');
    if (!Array.isArray(ids) || !ids.length) throw new Error('No se indicaron registros a eliminar');
    return { eliminadas: SheetUtils.removeMany(ssId(), hoja_().getName(), ids, 'ID_SENSOR') };
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
    const actual = SheetUtils.findById(ssId(), hoja_().getName(), id, 'ID_SENSOR');
    if (!actual) throw new Error('No se encontró la instalación ' + id);
    const serie = limpiar_(actual.data['SERIE SENSOR']);
    if (!serie) throw new Error('Esta instalación no tiene serie de sensor');
    return Geotab.resumen(serie, dias);
  }

  return {
    listar, datosParaFormulario, registrar, actualizarCampo, eliminar, urlResponsiva,
    geotabDisponible, estadoEnVivo, resumenGeotab,
  };
})();
