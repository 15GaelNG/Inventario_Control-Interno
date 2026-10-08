/**
 * ResponsivaVehicularService.gs
 * Responsiva vehicular firmada (formato F-CI01-045) — hoja propia `RESPONSIVA VEHICULAR`,
 * separada de VEHICULOS: la mayoría de sus columnas (Tarjeta de circulación, Licencia, INE,
 * Área, Lugar de resguardo, accesorios entregados…) son propias del documento y no existen
 * en el catálogo de vehículos.
 *
 * Es un registro de solo alta (no se edita, como ReasignacionesVehicularesService): cambiar a
 * mano una responsiva ya firmada desincronizaría el documento del historial real. Sí se puede
 * eliminar (solo ADMIN) para corregir un error de captura.
 *
 * Dar de alta una responsiva con un RESPONSABLE distinto al actual del vehículo también
 * actualiza RESPONSABLE VEHICULO / NO EMPLEADO / DEPARTAMENTO en la misma operación (bajo
 * candado) vía VehiculosService.actualizar(), que de paso ya deja su propio rastro en Cambios
 * Vehículos — mismo patrón que ReasignacionesVehicularesService, sin duplicar esa lógica aquí.
 *
 * Las firmas (Responsable, Jefe Directo, Entrega/CI) NO se guardan en la hoja: llegan como
 * { base64, mimeType } por campo, se insertan directo en el PDF (PdfService.generar, mismo
 * motor que Inspección) y, aparte, se respaldan como imagen suelta en CARPETA_IMAGENES (sin
 * ligarlas desde la hoja — decisión del usuario, 06-oct-2026). Si el PDF o el respaldo de una
 * firma fallan, la responsiva ya quedó guardada — se avisa en vez de perder la captura.
 */

const ResponsivaVehicularService = (function () {
  const SHEET = 'RESPONSIVA VEHICULAR';
  const ID_COLUMN = 'ID';
  const MODULO = 'responsiva-vehicular';
  const ZONA = 'America/Mexico_City';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Doc de Google con los marcadores <<CAMPO>> (formato F-CI01-045, corregido por el área).
  const PLANTILLA = '1JCbmKTFkSQlY5mXG0RFi54K3d7rSyuO_lb4oVCHjmHc';

  // Carpetas de Drive dedicadas a esta responsiva (decisión del usuario, 06-oct-2026) --
  // no la carpeta general de REPORTES que usan los demás módulos.
  // Por nombre dentro de la raíz de la app (DriveUtils.carpetaEnRaiz): cada proyecto usa las suyas
  const CARPETA_IMAGENES = 'RESPONSIVAS VEHICULARES_Images';
  const CARPETA_PDF = 'RESPONSIVAS_VEHICULARES';

  // Caja de las firmas en el PDF: la misma que usa InspeccionesService (150 × 60 pt).
  const FIRMA_PDF = { ancho: 150, alto: 60 };

  // El vehículo se entrega con... (SI/NO cada uno; columna = <<IF([CLAVE]="SI",...)>> en la plantilla)
  const ACCESORIOS = [
    'GATO HIDRAULICO', 'GATO MECANICO', 'LLAVE CRUZ', 'MANERAL', 'LLANTA REFACCION',
    'KIT SEGURIDAD', 'PARASOL', 'TAPETES RUDO', 'TAPETES ALFOMBRA', 'CUBRE VOLANTE',
    'CUBRE ASIENTOS', 'BED LINER', 'CUBIERTA BATEA',
  ];

  const COLUMNAS_RESUMEN = [
    ID_COLUMN, 'FECHA', 'FOLIO VEHICULO', 'NUCCO', 'RESPONSABLE', 'DEPARTAMENTO', 'PDF', 'REGISTRADO POR',
  ];

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  function hoja_() {
    return SheetUtils.getSheet(ssId(), SHEET);
  }

  function filaAResumen_(datos, i) {
    return {
      ID: datos[ID_COLUMN][i],
      FECHA: HojaServicio.fechaISO(datos['FECHA'][i]),
      FOLIO_VEHICULO: datos['FOLIO VEHICULO'][i] || '',
      NUCCO: datos['NUCCO'][i] || '',
      RESPONSABLE: datos['RESPONSABLE'][i] || '',
      DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
      PDF: datos['PDF'][i] || '',
      REGISTRADO_POR: datos['REGISTRADO POR'][i] || '',
    };
  }

  /** Un registro completo por ID (para "Ver completo" en la ficha de Vehículos). */
  function buscarPorId(token, id) {
    Permisos.puedeLeer(token, MODULO);
    const found = SheetUtils.findById(ssId(), SHEET, id, ID_COLUMN);
    return found ? found.data : null;
  }

  /** Responsivas de UN vehículo (para la ficha de Vehículos), más recientes primero. */
  function listarPorFolio(token, folio) {
    Permisos.puedeLeer(token, MODULO);
    if (!folio) return [];
    const sheet = hoja_();
    const { filas, datos } = SheetUtils.leerColumnasDeHoja(sheet, COLUMNAS_RESUMEN);
    const resultado = [];
    for (let i = filas - 1; i >= 0; i--) {
      if (!datos[ID_COLUMN][i]) continue;
      if (String(datos['FOLIO VEHICULO'][i] || '') !== String(folio)) continue;
      resultado.push(filaAResumen_(datos, i));
    }
    return resultado;
  }

  /**
   * Registra una responsiva firmada y, si el responsable es distinto al actual del vehículo,
   * actualiza el vehículo en la misma operación (candado). Genera el PDF al final; si falla,
   * la responsiva ya quedó guardada (se regresa el aviso, no se pierde la captura).
   *
   * @param {Object} datos      { 'FOLIO VEHICULO', 'RESPONSABLE', ... las demás columnas de captura manual }
   * @param {Object} imagenes   { 'FIRMA RESPONSABLE': {base64,mimeType}, 'FIRMA JEFE': ..., 'FIRMA CI': ... }
   */
  function crear(token, datos, imagenes) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const folio = String((datos || {})['FOLIO VEHICULO'] || '').trim();
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const responsable = String((datos || {})['RESPONSABLE'] || '').trim();
    if (!responsable) throw new Error('Captura el responsable.');
    if (!imagenes || !imagenes['FIRMA RESPONSABLE'] || !imagenes['FIRMA RESPONSABLE'].base64) {
      throw new Error('Falta la firma del responsable.');
    }

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const vehiculo = VehiculosService.buscarPorFolio(token, folio);
      if (!vehiculo) throw new Error('No se encontró el vehículo con Folio=' + folio);
      const idVehiculo = vehiculo['ID'];
      if (!idVehiculo) throw new Error('El vehículo con Folio=' + folio + ' no tiene ID.');

      const ahora = datos['FECHA'] ? new Date(datos['FECHA']) : new Date();
      const id = Ids.nuevo(Entidades.prefijo(SHEET));

      const fila = {
        [ID_COLUMN]: id,
        'FECHA': ahora,
        'FOLIO VEHICULO': vehiculo['FOLIO'] || folio,
        'ID VEHICULO': idVehiculo,
        'NUCCO': vehiculo['NUCCO'] || '',
        'MARCA': vehiculo['MARCA'] || '',
        'CLASE': vehiculo['CLASE'] || '',
        'MODELO': vehiculo['MODELO'] || '',
        'COLOR': vehiculo['COLOR'] || '',
        'SERIE VEHICULO': vehiculo['SERIE VEHICULO'] || '',
        'PLACA': vehiculo['PLACA'] || '',
        'RAZON SOCIAL': vehiculo['RAZON SOCIAL'] || '',
        'LUGAR DE RESGUARDO': datos['LUGAR DE RESGUARDO'] || '',
        'ESTADO DE ENTREGA': datos['ESTADO DE ENTREGA'] || '',
        'RESPONSABLE': responsable,
        'NO EMPLEADO': datos['NO EMPLEADO'] || vehiculo['NO EMPLEADO'] || '',
        'DEPARTAMENTO': datos['DEPARTAMENTO'] || vehiculo['DEPARTAMENTO'] || '',
        'AREA': datos['AREA'] || '',
        'PUESTO': datos['PUESTO'] || '',
        'SEDE': datos['SEDE'] || vehiculo['SEDE'] || '',
        'OFICINA / DESARROLLO': datos['OFICINA / DESARROLLO'] || vehiculo['OFICINA / DESARROLLO'] || '',
        'TARJETA DE CIRCULACION': datos['TARJETA DE CIRCULACION'] || '',
        'LICENCIA': datos['LICENCIA'] || '',
        'VIGENCIA LICENCIA': datos['VIGENCIA LICENCIA'] || '',
        'INE': datos['INE'] || '',
        'NO DE INVENTARIO': datos['NO DE INVENTARIO'] || '',
        'POLIZA DE SEGURO': datos['POLIZA DE SEGURO'] || '',
        'VIGENCIA POLIZA': datos['VIGENCIA POLIZA'] || '',
        'OTROS': datos['OTROS'] || '',
        'OBSERVACIONES': datos['OBSERVACIONES'] || '',
        'NOMBRE JEFE': datos['NOMBRE JEFE'] || '',
        'NOMBRE CI': datos['NOMBRE CI'] || sesion.nombre,
        'PDF': '',
        'REGISTRADO POR': sesion.nombre,
        'FECHA REGISTRO': new Date(),
      };
      ACCESORIOS.forEach((clave) => {
        fila[clave] = String(datos[clave] || '').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
      });

      SheetUtils.insert(ssId(), hoja_().getName(), fila);

      // Enganche con reasignación: si el responsable que firma es distinto al actual del
      // vehículo, se actualiza en la misma operación — candadoTomado porque este hilo ya
      // tiene el candado de arriba (waitLock no es reentrante).
      const actual = String(vehiculo['RESPONSABLE VEHICULO'] || '').trim().toUpperCase();
      if (responsable.toUpperCase() !== actual) {
        VehiculosService.actualizar(token, idVehiculo, {
          'RESPONSABLE VEHICULO': responsable,
          'NO EMPLEADO': fila['NO EMPLEADO'],
          'DEPARTAMENTO': fila['DEPARTAMENTO'] || vehiculo['DEPARTAMENTO'],
        }, { candadoTomado: true });
      }

      let pdf = null;
      const avisos = [];
      try {
        const imagenesPdf = {};
        ['FIRMA RESPONSABLE', 'FIRMA JEFE', 'FIRMA CI'].forEach((campo) => {
          const img = imagenes[campo];
          // FIRMA_PDF: misma caja que usa Inspección (150 × 60 pt) -- sin esto, PdfService
          // no tiene de dónde más sacar un tope y la firma se estira a lo ancho de la celda.
          if (img && img.base64) imagenesPdf[campo] = Object.assign({}, img, FIRMA_PDF);
        });

        // Respaldo de cada firma como imagen suelta en Drive, además de insertarla en el
        // PDF -- no se liga en la hoja (decisión del usuario: no agregar columnas para
        // esto), solo queda ahí por si hace falta la imagen fuera del documento. Un fallo
        // aquí no debe perder la responsiva ni tumbar el PDF: se avisa y sigue.
        Object.keys(imagenesPdf).forEach((campo) => {
          try {
            const img = imagenesPdf[campo];
            const nombreImagen = PdfService.nombreArchivo([
              campo, responsable, vehiculo['PLACA'] || vehiculo['FOLIO'], PdfService.fechaParaNombre(ahora),
            ]) + '.png';
            const blob = Utilities.newBlob(Utilities.base64Decode(img.base64), img.mimeType || 'image/png', nombreImagen);
            const archivo = DriveUtils.marcarAutor(DriveUtils.carpetaEnRaiz(CARPETA_IMAGENES).createFile(blob));
            DriveUtils.compartirLoMasAmplioPosible(archivo);
          } catch (e) {
            avisos.push('No se pudo respaldar ' + campo.toLowerCase() + ' en Drive: ' + e.message);
          }
        });

        const datosPdf = Object.assign({}, fila, {
          'DIA': Utilities.formatDate(ahora, ZONA, 'd'),
          'MES': MESES[Number(Utilities.formatDate(ahora, ZONA, 'M')) - 1],
          'AÑO': Utilities.formatDate(ahora, ZONA, 'yyyy'),
        });
        pdf = PdfService.generar({
          plantillaId: PLANTILLA,
          datos: datosPdf,
          imagenes: imagenesPdf,
          carpetaId: DriveUtils.carpetaEnRaiz(CARPETA_PDF).getId(),
          nombre: PdfService.nombreArchivo([
            'RESPONSIVA VEHICULAR', responsable, vehiculo['PLACA'] || vehiculo['FOLIO'], PdfService.fechaParaNombre(ahora),
          ]),
        });
        // Se guarda la URL completa (no una ruta relativa a resolver después): es un
        // documento nuevo, sin el legado de rutas de AppSheet que cargan Inspección/Vehículos.
        SheetUtils.update(ssId(), hoja_().getName(), id, { 'PDF': pdf.url }, ID_COLUMN);
      } catch (e) {
        avisos.push('La responsiva se guardó, pero no se pudo generar el PDF: ' + e.message);
      }

      return { ID: id, PDF: pdf ? pdf.url : null, aviso: avisos.join(' ') };
    } finally {
      lock.releaseLock();
    }
  }

  /** La hoja, para HojaServicio.eliminar (que además respeta Relaciones) */
  const HOJA = { modulo: MODULO, libro: ssId, hoja: SHEET, columnas: COLUMNAS_RESUMEN };

  function eliminar(token, id) {
    return HojaServicio.eliminar(HOJA, token, id);
  }

  return { listarPorFolio, buscarPorId, crear, eliminar, PLANTILLA };
})();
