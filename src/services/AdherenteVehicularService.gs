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
 * ni el PDF ya firmado. ESTATUS es independiente de ESTADO FIRMA (ver abajo): uno dice si el
 * adherente sigue vigente, el otro si ya firmó.
 *
 * Las firmas (Adherente, Jefe Directo, Control Interno) NO se guardan en la hoja: llegan
 * como { base64, mimeType } por campo, se insertan directo en el PDF (PdfService.generar) y,
 * aparte, se respaldan como imagen suelta en Drive (misma carpeta que usa Responsiva
 * Vehicular para firmas — decisión del usuario, 06-oct-2026), sin ligarlas desde la hoja. Si
 * el PDF o el respaldo de una firma fallan, el adherente ya quedó guardado — se avisa en vez
 * de perder la captura.
 *
 * Firma a distancia (opciones.remoto / opciones.remotoJefe en crear): igual que en
 * ResponsivaVehicularService -- el adherente y el jefe pueden firmar cada quien por SU PROPIA
 * liga, independiente uno del otro. Ver el comentario largo al inicio de ese archivo (gemelo).
 */

const AdherenteVehicularService = (function () {
  const SHEET = 'ADHERENTE VEHICULAR';
  const ID_COLUMN = 'ID';
  const MODULO = 'adherente-vehicular';
  const ZONA = 'America/Mexico_City';
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  // Doc de Google con los marcadores <<CAMPO>> (formato F-CI01-047, corregido por el área).
  const PLANTILLA = '1vwDs6mtcGHGVF1RdirqC6Um30QGRclmJXMDoDO0LhMQ';

  // Carpetas de Drive (decisión del usuario, 06-oct-2026): las firmas van a la MISMA carpeta
  // que ya usa Responsiva Vehicular (ResponsivaVehicularService.CARPETA_IMAGENES); el PDF
  // final a una carpeta propia, separada de la de Responsiva.
  // Por nombre dentro de la raíz de la app (DriveUtils.carpetaEnRaiz): cada proyecto usa las suyas
  const CARPETA_IMAGENES = 'RESPONSIVAS VEHICULARES_Images';   // compartida con Responsiva
  // El PDF (y la copia temporal de la vista previa) va al expediente del vehículo en su NUCO (ExpedienteNuco,
  // 08-oct-2026): la carpeta ADHERENTES VEHICULAR de la raíz ya no se usa.

  // Caja de las firmas en el PDF: la misma que usa InspeccionesService (150 × 60 pt).
  const FIRMA_PDF = { ancho: 150, alto: 60 };

  // Firma a distancia: cuánto dura cada liga antes de que haya que mandar una nueva.
  const FIRMA_REMOTA_DIAS_VIGENCIA = 5;

  const ESTATUS_VALIDOS = ['ACTIVO', 'BAJA'];

  const COLUMNAS_RESUMEN = [
    ID_COLUMN, 'FECHA', 'FOLIO VEHICULO', 'NUCCO', 'ADHERENTE', 'DEPARTAMENTO', 'ESTATUS',
    'ESTADO FIRMA', 'TOKEN FIRMA', 'TOKEN FIRMA JEFE', 'PDF', 'REGISTRADO POR',
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
      // En blanco (renglones de antes de esta función) = ya estaba firmado presencial
      ESTADO_FIRMA: datos['ESTADO FIRMA'][i] || 'FIRMADO',
      TOKEN_FIRMA: datos['TOKEN FIRMA'][i] || '',
      TOKEN_FIRMA_JEFE: datos['TOKEN FIRMA JEFE'][i] || '',
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

  /** La liga que se manda a quien tiene que firmar a distancia (adherente o jefe, cada uno
   *  con la suya -- ver el comentario del archivo). Usa el despliegue público si ya está
   *  configurado (Config.urlFirmaPublica) -- así la puede abrir alguien sin cuenta de dominio;
   *  si no, cae al despliegue normal de siempre (igual que antes). */
  function construirLiga_(tokenFirma, quien) {
    const base = Config.urlFirmaPublica() || ScriptApp.getService().getUrl();
    return base + '?firmar=1&tipo=adherente' +
      (quien === 'jefe' ? '&quien=jefe' : '') + '&token=' + encodeURIComponent(tokenFirma);
  }

  /**
   * "Copiar liga de nuevo" desde la pestaña: SIEMPRE se arma aquí, nunca en el navegador --
   * dentro de la app, location.origin es el sandbox de Apps Script
   * (…-script.googleusercontent.com/userCodeAppPanel), no la URL real, así que una liga
   * armada del lado del cliente no abre para nadie más (8-oct, confirmado con el usuario).
   */
  function ligaDeToken(token, tokenFirma, quien) {
    Permisos.puedeLeer(token, MODULO);
    return construirLiga_(tokenFirma, quien);
  }

  /** El renglón completo (todas sus columnas) por el token vigente de la columna dada;
   *  null si no hay match. */
  function buscarPorToken_(tokenFirma, columna) {
    const limpio = String(tokenFirma || '').trim();
    if (!limpio) return null;
    return SheetUtils.getAll(ssId(), hoja_().getName()).find((f) => String(f[columna] || '') === limpio) || null;
  }

  /** ¿Ya no falta ninguna liga pendiente? (ni la del adherente ni la del jefe). Se evalúa
   *  sobre la fila YA actualizada en memoria (con el token que se acaba de limpiar). */
  function listoParaFinalizar_(fila) {
    return !fila['TOKEN FIRMA'] && !fila['TOKEN FIRMA JEFE'];
  }

  /**
   * Una columna …TEMP nunca guarda el base64 directo: Sheets no deja más de 50,000 caracteres
   * por celda y una firma por FOTO (no por trazo) fácil lo rebasa -- el JPEG de hasta 1200 px
   * que arma componentes/firma.html puede pesar 100-300 KB, 130,000-400,000 caracteres en
   * base64 (bug real, 9-oct: "límite de 50000" al mandar una liga con firma por foto). Se
   * guarda como archivo chico en la misma carpeta que ya usan las firmas finales
   * (CARPETA_IMAGENES) y en la celda solo va su ID -- un puñado de caracteres, sin importar
   * qué tan pesada sea la foto.
   */
  function guardarFirmaTemp_(campo, imagen) {
    const nombreImagen = PdfService.nombreArchivo([campo, 'temp', Utilities.getUuid()]) + (imagen.mimeType === 'image/jpeg' ? '.jpg' : '.png');
    const blob = Utilities.newBlob(Utilities.base64Decode(imagen.base64), imagen.mimeType || 'image/png', nombreImagen);
    const archivo = DriveUtils.marcarAutor(DriveUtils.carpetaEnRaiz(CARPETA_IMAGENES).createFile(blob));
    return JSON.stringify({ archivoId: archivo.getId(), mimeType: imagen.mimeType || 'image/png' });
  }

  /**
   * Lee lo que haya en una columna …TEMP: un archivo de Drive (guardarFirmaTemp_, lo normal
   * desde este arreglo) o, al revés, el base64 directo que dejó una liga creada ANTES de este
   * arreglo y que seguía pendiente al momento de desplegarlo -- sin esto, esa firma se perdía
   * en silencio (ni error ni aviso, solo faltaba del PDF) en cuanto alguien la completaba.
   * null si no hay nada o el archivo ya no existe.
   */
  function leerFirmaTemp_(valor) {
    if (!valor) return null;
    let datos;
    try { datos = JSON.parse(valor); } catch (e) { return null; }
    if (!datos) return null;
    if (datos.archivoId) {
      const archivo = DriveApp.getFileById(datos.archivoId);
      return { base64: Utilities.base64Encode(archivo.getBlob().getBytes()), mimeType: datos.mimeType || 'image/png' };
    }
    if (datos.base64) return { base64: datos.base64, mimeType: datos.mimeType || 'image/png' };
    return null;
  }

  /** Borra de Drive el archivo temporal de una columna …TEMP ya junta con las demás (el PDF
   *  final ya tiene su propio respaldo en Drive, aparte -- este solo servía para esperar). */
  function borrarFirmaTempSiHay_(valor) {
    if (!valor) return;
    try {
      const datos = JSON.parse(valor);
      if (datos && datos.archivoId) DriveApp.getFileById(datos.archivoId).setTrashed(true);
    } catch (e) { /* no-op: si no se pudo borrar, queda un archivo suelto en Drive, nada más */ }
  }

  /** Las firmas que ya se tienen guardadas en las columnas TEMP, listas para el PDF. */
  function imagenesDesdeTemp_(fila) {
    const imagenesPdf = {};
    [['FIRMA ADHERENTE', 'FIRMA ADHERENTE TEMP'], ['FIRMA JEFE', 'FIRMA JEFE TEMP'], ['FIRMA CI', 'FIRMA CI TEMP']].forEach(([campo, columna]) => {
      const guardada = fila[columna];
      if (!guardada) return;
      try {
        const datos = leerFirmaTemp_(guardada);
        if (datos) imagenesPdf[campo] = Object.assign({}, datos, FIRMA_PDF);
      } catch (e) { /* se ignora, sin esa firma */ }
    });
    return imagenesPdf;
  }

  /**
   * Respalda cada firma como imagen suelta en Drive, genera el PDF y guarda su URL -- lo
   * mismo sin importar si las firmas se capturaron en persona (crear) o llegaron por una o dos
   * ligas (completarFirma/completarFirmaJefe). Si algo de esto falla, el renglón ya estaba
   * guardado desde antes: se regresa el aviso en vez de perder la captura.
   */
  function generarPdfYGuardar_(id, fila, imagenesPdf, ahora, camposExtra) {
    const avisos = [];
    let pdf = null;
    try {
      Object.keys(imagenesPdf).forEach((campo) => {
        try {
          const img = imagenesPdf[campo];
          const nombreImagen = PdfService.nombreArchivo([
            campo, fila['ADHERENTE'], fila['PLACA'] || fila['FOLIO VEHICULO'], PdfService.fechaParaNombre(ahora),
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
        // Directo en el expediente del vehículo (NUCOS VEHICULOS/<NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA/ADHERENTES)
        carpetaId: ExpedienteNuco.carpeta(fila['NUCCO'], 'RESPONSIVA', ['ADHERENTES']).getId(),
        nombre: PdfService.nombreArchivo([
          'ADHERENTE VEHICULAR', fila['ADHERENTE'], fila['PLACA'] || fila['FOLIO VEHICULO'], PdfService.fechaParaNombre(ahora),
        ]),
      });
      // Su nombre en el expediente (ADHERENTE-0088.pdf) y, si es responsiva, la vigente pasa a RESPONSIVAS ANTERIORES.
      // Si esto falla el PDF ya existe y queda ligado: solo se avisa.
      try {
        ExpedienteNuco.archivar(DriveApp.getFileById(pdf.fileId), fila['NUCCO'], 'RESPONSIVA', { adherente: true });
      } catch (e) {
        avisos.push('El PDF se generó, pero no se pudo acomodar en el expediente del NUCO: ' + e.message);
      }
      SheetUtils.update(ssId(), hoja_().getName(), id, Object.assign({
        'PDF': pdf.url, 'ESTADO FIRMA': 'FIRMADO',
        'TOKEN FIRMA': '', 'TOKEN FIRMA EXPIRA': '', 'TOKEN FIRMA JEFE': '', 'TOKEN FIRMA JEFE EXPIRA': '',
        'FIRMA ADHERENTE TEMP': '', 'FIRMA JEFE TEMP': '', 'FIRMA CI TEMP': '',
      }, camposExtra || {}), ID_COLUMN);
      // Los archivos temporales de Drive (guardarFirmaTemp_) ya sirvieron: el PDF ya quedó con
      // su propia firma respaldada arriba. Si alguno no se pudo borrar, queda un archivo suelto
      // en Drive -- no afecta nada más.
      ['FIRMA ADHERENTE TEMP', 'FIRMA JEFE TEMP', 'FIRMA CI TEMP'].forEach((columna) => borrarFirmaTempSiHay_(fila[columna]));
    } catch (e) {
      avisos.push('Se guardó, pero no se pudo generar el PDF: ' + e.message);
    }
    return { ID: id, PDF: pdf ? pdf.url : null, aviso: avisos.join(' ') };
  }

  /**
   * Registra un adherente. A diferencia de ResponsivaVehicularService.crear, nunca toca
   * VEHICULOS: el adherente no reemplaza al responsable, solo se suma.
   *
   * opciones.remoto: no exige la firma del adherente, le genera su propia liga.
   * opciones.remotoJefe: le genera al jefe su propia liga (independiente de la del adherente);
   *   la firma del jefe NUNCA es obligatoria -- esto es solo para pedirla a distancia en vez de
   *   dejarla en blanco. Los dos se pueden usar juntos o por separado.
   * Si ninguna de las dos aplica: exige lo que corresponda y genera el PDF de una vez, como
   * siempre. Si cualquiera aplica, el PDF se genera hasta que TODAS las ligas que se hayan
   * mandado se completen (ver completarFirma/completarFirmaJefe/listoParaFinalizar_).
   *
   * @param {Object} datos      { 'FOLIO VEHICULO', 'ADHERENTE', ... las demás columnas de captura manual }
   * @param {Object} imagenes   { 'FIRMA ADHERENTE': {base64,mimeType}, 'FIRMA JEFE': ..., 'FIRMA CI': ... }
   */
  function crear(token, datos, imagenes, opciones) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const remoto = !!(opciones && opciones.remoto);
    const remotoJefe = !!(opciones && opciones.remotoJefe);
    const folio = String((datos || {})['FOLIO VEHICULO'] || '').trim();
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const adherente = String((datos || {})['ADHERENTE'] || '').trim();
    if (!adherente) throw new Error('Captura el adherente.');
    if (!remoto && (!imagenes || !imagenes['FIRMA ADHERENTE'] || !imagenes['FIRMA ADHERENTE'].base64)) {
      throw new Error('Falta la firma del adherente.');
    }
    // Quien entrega SIEMPRE firma al capturar, presencial o a distancia -- ver el comentario
    // gemelo en ResponsivaVehicularService.crear.
    if (!imagenes || !imagenes['FIRMA CI'] || !imagenes['FIRMA CI'].base64) {
      throw new Error('Falta la firma de quien entrega.');
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
        'ESTADO FIRMA': (remoto || remotoJefe) ? 'PENDIENTE' : 'FIRMADO',
        'TOKEN FIRMA': '',
        'TOKEN FIRMA EXPIRA': '',
        'TOKEN FIRMA JEFE': '',
        'TOKEN FIRMA JEFE EXPIRA': '',
        'FIRMA ADHERENTE TEMP': '',
        'FIRMA JEFE TEMP': '',
        'FIRMA CI TEMP': '',
        'FIRMADO POR': '',
        'FIRMADO POR JEFE': '',
        'REGISTRADO POR': sesion.nombre,
        'FECHA REGISTRO': new Date(),
      };

      let liga = '';
      let ligaJefe = '';
      if (remoto || remotoJefe) {
        fila['FIRMA CI TEMP'] = guardarFirmaTemp_('FIRMA CI', imagenes['FIRMA CI']);
        if (!remoto && imagenes['FIRMA ADHERENTE'] && imagenes['FIRMA ADHERENTE'].base64) {
          fila['FIRMA ADHERENTE TEMP'] = guardarFirmaTemp_('FIRMA ADHERENTE', imagenes['FIRMA ADHERENTE']);
        }
        if (!remotoJefe && imagenes['FIRMA JEFE'] && imagenes['FIRMA JEFE'].base64) {
          fila['FIRMA JEFE TEMP'] = guardarFirmaTemp_('FIRMA JEFE', imagenes['FIRMA JEFE']);
        }
        if (remoto) {
          const tokenFirma = Utilities.getUuid();
          fila['TOKEN FIRMA'] = tokenFirma;
          fila['TOKEN FIRMA EXPIRA'] = new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
          liga = construirLiga_(tokenFirma, 'adherente');
        }
        if (remotoJefe) {
          const tokenFirmaJefe = Utilities.getUuid();
          fila['TOKEN FIRMA JEFE'] = tokenFirmaJefe;
          fila['TOKEN FIRMA JEFE EXPIRA'] = new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
          ligaJefe = construirLiga_(tokenFirmaJefe, 'jefe');
        }
      }

      SheetUtils.insert(ssId(), hoja_().getName(), fila);

      if (remoto || remotoJefe) {
        const resultado = { ID: id };
        if (liga) resultado.liga = liga;
        if (ligaJefe) resultado.ligaJefe = ligaJefe;
        return resultado;
      }

      const imagenesPdf = {};
      ['FIRMA ADHERENTE', 'FIRMA JEFE', 'FIRMA CI'].forEach((campo) => {
        const img = imagenes[campo];
        // FIRMA_PDF: misma caja que usa Inspección (150 × 60 pt) -- sin esto, PdfService
        // no tiene de dónde más sacar un tope y la firma se estira a lo ancho de la celda.
        if (img && img.base64) imagenesPdf[campo] = Object.assign({}, img, FIRMA_PDF);
      });
      return generarPdfYGuardar_(id, fila, imagenesPdf, ahora, {});
    } finally {
      lock.releaseLock();
    }
  }

  /** Lo mínimo para pintar la página de firma a distancia del ADHERENTE (nunca el renglón
   *  completo). */
  function obtenerPendientePorToken(tokenFirma) {
    const fila = buscarPorToken_(tokenFirma, 'TOKEN FIRMA');
    if (!fila) return { vigente: false, motivo: 'no-existe' };
    if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE' || !fila['TOKEN FIRMA']) return { vigente: false, motivo: 'ya-firmado' };
    const expira = fila['TOKEN FIRMA EXPIRA'] ? new Date(fila['TOKEN FIRMA EXPIRA']) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) return { vigente: false, motivo: 'vencido' };
    return {
      vigente: true,
      documento: 'Adherente Vehicular',
      nombre: fila['ADHERENTE'] || '',
      folio: fila['FOLIO VEHICULO'] || '',
      placa: fila['PLACA'] || '',
      marca: fila['MARCA'] || '',
      modelo: fila['MODELO'] || '',
    };
  }

  /** Lo mínimo para pintar la página de firma a distancia del JEFE. */
  function obtenerPendienteJefePorToken(tokenFirmaJefe) {
    const fila = buscarPorToken_(tokenFirmaJefe, 'TOKEN FIRMA JEFE');
    if (!fila) return { vigente: false, motivo: 'no-existe' };
    if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE' || !fila['TOKEN FIRMA JEFE']) return { vigente: false, motivo: 'ya-firmado' };
    const expira = fila['TOKEN FIRMA JEFE EXPIRA'] ? new Date(fila['TOKEN FIRMA JEFE EXPIRA']) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) return { vigente: false, motivo: 'vencido' };
    return {
      vigente: true,
      documento: 'Adherente Vehicular',
      // A quién pertenece el adherente (el jefe firma como jefe DE alguien, no por sí mismo)
      nombre: fila['ADHERENTE'] || '',
      folio: fila['FOLIO VEHICULO'] || '',
      placa: fila['PLACA'] || '',
      marca: fila['MARCA'] || '',
      modelo: fila['MODELO'] || '',
    };
  }

  /** El PDF tal como va a quedar hasta ahora, con un aviso de "VISTA PREVIA" -- sin guardar
   *  nada en Drive. Para que quien va a firmar (adherente o jefe, por su propia liga) vea el
   *  documento antes de decidir. */
  function vistaPrevia(tokenFirma, quien) {
    const columna = quien === 'jefe' ? 'TOKEN FIRMA JEFE' : 'TOKEN FIRMA';
    const columnaExpira = quien === 'jefe' ? 'TOKEN FIRMA JEFE EXPIRA' : 'TOKEN FIRMA EXPIRA';
    const fila = buscarPorToken_(tokenFirma, columna);
    if (!fila) throw new Error('Esta liga no es válida.');
    if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE') throw new Error('Esta liga ya se usó.');
    const expira = fila[columnaExpira] ? new Date(fila[columnaExpira]) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
      throw new Error('Esta liga ya venció -- pide que te manden una nueva.');
    }
    const ahora = new Date();
    const datosPdf = Object.assign({}, fila, {
      'DIA': Utilities.formatDate(ahora, ZONA, 'd'),
      'MES': MESES[Number(Utilities.formatDate(ahora, ZONA, 'M')) - 1],
      'AÑO': Utilities.formatDate(ahora, ZONA, 'yyyy'),
    });
    return PdfService.generarVistaPrevia({
      plantillaId: PLANTILLA, datos: datosPdf, imagenes: imagenesDesdeTemp_(fila), carpetaId: ExpedienteNuco.carpeta(fila['NUCCO'], 'RESPONSIVA', ['ADHERENTES']).getId(),
    });
  }

  /**
   * Completa la firma del ADHERENTE que llegó por su liga. Si la del jefe también está
   * pendiente (tiene su propio token todavía), solo se guarda y se espera -- el PDF se genera
   * hasta que la última liga pendiente se complete. Sin `token` de sesión (ver el comentario
   * del archivo).
   */
  function completarFirma(tokenFirma, imagen) {
    if (!imagen || !imagen.base64) throw new Error('Falta la firma.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const fila = buscarPorToken_(tokenFirma, 'TOKEN FIRMA');
      if (!fila) throw new Error('Esta liga no es válida.');
      if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE' || !fila['TOKEN FIRMA']) throw new Error('Esta liga ya se usó.');
      const expira = fila['TOKEN FIRMA EXPIRA'] ? new Date(fila['TOKEN FIRMA EXPIRA']) : null;
      if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
        throw new Error('Esta liga ya venció -- pide que te manden una nueva.');
      }

      fila['FIRMA ADHERENTE TEMP'] = guardarFirmaTemp_('FIRMA ADHERENTE', imagen);
      fila['TOKEN FIRMA'] = '';
      fila['TOKEN FIRMA EXPIRA'] = '';
      fila['FIRMADO POR'] = Session.getActiveUser().getEmail() || '';

      if (!listoParaFinalizar_(fila)) {
        SheetUtils.update(ssId(), hoja_().getName(), fila['ID'], {
          'FIRMA ADHERENTE TEMP': fila['FIRMA ADHERENTE TEMP'],
          'TOKEN FIRMA': '', 'TOKEN FIRMA EXPIRA': '', 'FIRMADO POR': fila['FIRMADO POR'],
        }, ID_COLUMN);
        return { ID: fila['ID'], PDF: null, pendiente: true, aviso: 'Tu firma quedó registrada. Falta la firma del jefe directo para generar el documento.' };
      }

      return generarPdfYGuardar_(fila['ID'], fila, imagenesDesdeTemp_(fila), new Date(), { 'FIRMADO POR': fila['FIRMADO POR'] });
    } finally {
      lock.releaseLock();
    }
  }

  /**
   * Completa la firma del JEFE que llegó por su liga -- gemela de completarFirma, del otro
   * lado. Si la del adherente todavía está pendiente, solo se guarda y se espera.
   */
  function completarFirmaJefe(tokenFirmaJefe, imagenJefe) {
    if (!imagenJefe || !imagenJefe.base64) throw new Error('Falta la firma.');

    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const fila = buscarPorToken_(tokenFirmaJefe, 'TOKEN FIRMA JEFE');
      if (!fila) throw new Error('Esta liga no es válida.');
      if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE' || !fila['TOKEN FIRMA JEFE']) throw new Error('Esta liga ya se usó.');
      const expira = fila['TOKEN FIRMA JEFE EXPIRA'] ? new Date(fila['TOKEN FIRMA JEFE EXPIRA']) : null;
      if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
        throw new Error('Esta liga ya venció -- pide que te manden una nueva.');
      }

      fila['FIRMA JEFE TEMP'] = guardarFirmaTemp_('FIRMA JEFE', imagenJefe);
      fila['TOKEN FIRMA JEFE'] = '';
      fila['TOKEN FIRMA JEFE EXPIRA'] = '';
      fila['FIRMADO POR JEFE'] = Session.getActiveUser().getEmail() || '';

      if (!listoParaFinalizar_(fila)) {
        SheetUtils.update(ssId(), hoja_().getName(), fila['ID'], {
          'FIRMA JEFE TEMP': fila['FIRMA JEFE TEMP'],
          'TOKEN FIRMA JEFE': '', 'TOKEN FIRMA JEFE EXPIRA': '', 'FIRMADO POR JEFE': fila['FIRMADO POR JEFE'],
        }, ID_COLUMN);
        return { ID: fila['ID'], PDF: null, pendiente: true, aviso: 'Tu firma quedó registrada. Falta la firma del adherente para generar el documento.' };
      }

      return generarPdfYGuardar_(fila['ID'], fila, imagenesDesdeTemp_(fila), new Date(), { 'FIRMADO POR JEFE': fila['FIRMADO POR JEFE'] });
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

  return {
    listarPorFolio, buscarPorId, crear, cambiarEstatus, eliminar, ligaDeToken,
    obtenerPendientePorToken, obtenerPendienteJefePorToken, vistaPrevia, completarFirma, completarFirmaJefe,
    PLANTILLA,
  };
})();
