/**
 * AdherenteVehicularService.gs
 * Corresponsabilidad vehicular firmada por un ADHERENTE (formato F-CI01-047) — hoja propia
 * `ADHERENTE VEHICULAR`. Un adherente es alguien que también usa el vehículo sin ser su
 * responsable; puede haber varios adherentes a la vez para un mismo vehículo, y dar de alta
 * uno NO toca RESPONSABLE VEHICULO (a diferencia de ResponsivaVehicularService, que si el
 * responsable cambia sí reasigna). Gemela de ResponsivaVehicularService.gs, pero sin la
 * tabla de accesorios (ese formato no la pide) ni el enganche de reasignación.
 *
 * Es un registro de solo alta en cuanto a sus datos firmados (no se editan: cambiarlos a mano
 * desincronizaría el documento del historial real). Sí se puede eliminar (solo ADMIN) para
 * corregir un error de captura, y SÍ tiene un ESTATUS editable (ACTIVO/BAJA, mismo vocabulario
 * que SensoresService) para llevar el control de qué adherentes sigue usando el vehículo hoy
 * sin perder el historial de los que ya no — cambiar el estatus no toca el resto del registro
 * ni el PDF ya firmado.
 *
 * Las firmas (Adherente, Jefe Directo, Control Interno) NO se guardan en la hoja: llegan
 * como { base64, mimeType } por campo, se insertan directo en el PDF (PdfService.generar) y,
 * aparte, se respaldan como imagen suelta en Drive (misma carpeta que usa Responsiva
 * Vehicular para firmas — decisión del usuario, 06-oct-2026), sin ligarlas desde la hoja. Si
 * el PDF o el respaldo de una firma fallan, el adherente ya quedó guardado — se avisa en vez
 * de perder la captura.
 */

const AdherenteVehicularService = (function () {
  const SHEET = 'ADHERENTE VEHICULAR';
  const ID_COLUMN = 'ID';
  const MODULO = 'adherente-vehicular';
  const ZONA = 'America/Mexico_City';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Doc de Google con los marcadores <<CAMPO>> (formato F-CI01-047, corregido por el área).
  const PLANTILLA = '1vwDs6mtcGHGVF1RdirqC6Um30QGRclmJXMDoDO0LhMQ';

  // Carpetas de Drive: las firmas van a la MISMA carpeta que ya usa Responsiva Vehicular
  // (ResponsivaVehicularService.CARPETA_IMAGENES, por nombre en la raíz de la app; decisión del 06-oct-2026).
  // El PDF va al expediente del vehículo, 5.-RESPONSIVA/ADHERENTES de su NUCO (ExpedienteNuco, 08-oct-2026);
  // la carpeta "ADHERENTES VEHICULAR" de la raíz ya no se usa.
  const CARPETA_IMAGENES = 'RESPONSIVAS VEHICULARES_Images';   // compartida con Responsiva

  // Caja de las firmas en el PDF: la misma que usa InspeccionesService (150 × 60 pt).
  const FIRMA_PDF = { ancho: 150, alto: 60 };

  const ESTATUS_VALIDOS = ['ACTIVO', 'BAJA'];

  const COLUMNAS_RESUMEN = [
    ID_COLUMN, 'FECHA', 'FOLIO VEHICULO', 'NUCCO', 'ADHERENTE', 'DEPARTAMENTO', 'ESTATUS', 'PDF', 'REGISTRADO POR',
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
      ADHERENTE: datos['ADHERENTE'][i] || '',
      DEPARTAMENTO: datos['DEPARTAMENTO'][i] || '',
      ESTATUS: datos['ESTATUS'][i] || 'ACTIVO',
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

  /** Adherentes de UN vehículo (para la ficha de Vehículos), más recientes primero. */
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
   * Registra un adherente firmado. A diferencia de ResponsivaVehicularService.crear, nunca
   * toca VEHICULOS: el adherente no reemplaza al responsable, solo se suma. Genera el PDF al
   * final; si falla, el adherente ya quedó guardado (se regresa el aviso, no se pierde la
   * captura).
   *
   * @param {Object} datos      { 'FOLIO VEHICULO', 'ADHERENTE', ... las demás columnas de captura manual }
   * @param {Object} imagenes   { 'FIRMA ADHERENTE': {base64,mimeType}, 'FIRMA JEFE': ..., 'FIRMA CI': ... }
   */
  function crear(token, datos, imagenes) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const folio = String((datos || {})['FOLIO VEHICULO'] || '').trim();
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const adherente = String((datos || {})['ADHERENTE'] || '').trim();
    if (!adherente) throw new Error('Captura el adherente.');
    if (!imagenes || !imagenes['FIRMA ADHERENTE'] || !imagenes['FIRMA ADHERENTE'].base64) {
      throw new Error('Falta la firma del adherente.');
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
        'ADHERENTE': adherente,
        'ESTATUS': 'ACTIVO',
        'NO EMPLEADO': datos['NO EMPLEADO'] || '',
        'DEPARTAMENTO': datos['DEPARTAMENTO'] || '',
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
        'NOMBRE JEFE': datos['NOMBRE JEFE'] || '',
        'NOMBRE CI': datos['NOMBRE CI'] || sesion.nombre,
        'PDF': '',
        'REGISTRADO POR': sesion.nombre,
        'FECHA REGISTRO': new Date(),
      };

      SheetUtils.insert(ssId(), hoja_().getName(), fila);

      let pdf = null;
      const avisos = [];
      try {
        const imagenesPdf = {};
        ['FIRMA ADHERENTE', 'FIRMA JEFE', 'FIRMA CI'].forEach((campo) => {
          const img = imagenes[campo];
          // FIRMA_PDF: misma caja que usa Inspección (150 × 60 pt) -- sin esto, PdfService
          // no tiene de dónde más sacar un tope y la firma se estira a lo ancho de la celda.
          if (img && img.base64) imagenesPdf[campo] = Object.assign({}, img, FIRMA_PDF);
        });

        // Respaldo de cada firma como imagen suelta en Drive (misma carpeta que Responsiva
        // Vehicular), además de insertarla en el PDF -- no se liga en la hoja. Un fallo aquí
        // no debe perder el adherente ni tumbar el PDF: se avisa y sigue.
        Object.keys(imagenesPdf).forEach((campo) => {
          try {
            const img = imagenesPdf[campo];
            const nombreImagen = PdfService.nombreArchivo([
              campo, adherente, vehiculo['PLACA'] || vehiculo['FOLIO'], PdfService.fechaParaNombre(ahora),
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
          // Directo en el expediente del vehículo (…/5.-RESPONSIVA/ADHERENTES), sin tocar la responsiva vigente
          carpetaId: ExpedienteNuco.carpeta(vehiculo['NUCCO'], 'RESPONSIVA', ['ADHERENTES']).getId(),
          nombre: PdfService.nombreArchivo([
            'ADHERENTE VEHICULAR', adherente, vehiculo['PLACA'] || vehiculo['FOLIO'], PdfService.fechaParaNombre(ahora),
          ]),
        });
        try {
          ExpedienteNuco.archivar(DriveApp.getFileById(pdf.fileId), vehiculo['NUCCO'], 'RESPONSIVA', { adherente: true });
        } catch (e) {
          avisos.push('El PDF se generó, pero no se pudo acomodar en el expediente del NUCO: ' + e.message);
        }
        SheetUtils.update(ssId(), hoja_().getName(), id, { 'PDF': pdf.url }, ID_COLUMN);
      } catch (e) {
        avisos.push('El adherente se guardó, pero no se pudo generar el PDF: ' + e.message);
      }

      return { ID: id, PDF: pdf ? pdf.url : null, aviso: avisos.join(' ') };
    } finally {
      lock.releaseLock();
    }
  }

  /** ACTIVO/BAJA: para saber qué adherentes siguen usando el vehículo sin perder el historial
   *  de los demás (no se eliminan solo porque ya no aplican). No toca ninguna otra columna. */
  function cambiarEstatus(token, id, estatus) {
    Permisos.puedeEditar(token, MODULO);
    const limpio = String(estatus || '').trim().toUpperCase();
    if (ESTATUS_VALIDOS.indexOf(limpio) === -1) {
      throw new Error('Estatus inválido: "' + estatus + '" (debe ser ACTIVO o BAJA).');
    }
    SheetUtils.update(ssId(), hoja_().getName(), id, { 'ESTATUS': limpio }, ID_COLUMN);
    return { ID: id, ESTATUS: limpio };
  }

  /** La hoja, para HojaServicio.eliminar (que además respeta Relaciones) */
  const HOJA = { modulo: MODULO, libro: ssId, hoja: SHEET, columnas: COLUMNAS_RESUMEN };

  function eliminar(token, id) {
    return HojaServicio.eliminar(HOJA, token, id);
  }

  return { listarPorFolio, buscarPorId, crear, cambiarEstatus, eliminar, PLANTILLA };
})();
