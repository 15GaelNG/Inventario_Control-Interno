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
 * Esto corre siempre al CREAR el renglón (presencial o a distancia) y nunca al completar una
 * firma a distancia: VehiculosService.actualizar exige una sesión con permiso, y quien completa
 * una firma a distancia no necesariamente tiene una — la reasignación ya quedó decidida por
 * quien capturó, la firma solo falta para el papel.
 *
 * Las firmas (Responsable, Jefe Directo, Entrega/CI) NO se guardan en la hoja: llegan como
 * { base64, mimeType } por campo, se insertan directo en el PDF (PdfService.generar, mismo
 * motor que Inspección) y, aparte, se respaldan como imagen suelta en CARPETA_IMAGENES (sin
 * ligarlas desde la hoja — decisión del usuario, 06-oct-2026). Si el PDF o el respaldo de una
 * firma fallan, la responsiva ya quedó guardada — se avisa en vez de perder la captura.
 *
 * Firma a distancia (opciones.remoto / opciones.remotoJefe en crear): el responsable y el jefe
 * pueden firmar cada quien por SU PROPIA liga, independiente uno del otro -- no es la misma
 * página ni hace falta que coincidan en tiempo o dispositivo. Cada uno tiene su propio token de
 * un solo uso (TOKEN FIRMA / TOKEN FIRMA JEFE) y, si no está presente, el renglón se guarda sin
 * su firma, en ESTADO FIRMA="PENDIENTE". Quien entrega (CI) siempre firma al capturar -- nunca
 * se difiere -- así que en cuanto se difiere CUALQUIERA de los otros dos, su firma (y la del que
 * sí firmó presencial, si solo se difirió uno) se guarda temporalmente (columnas …TEMP, como
 * JSON) hasta que la ÚLTIMA liga pendiente se complete: ESE es el momento en que de verdad se
 * junta todo y se genera el PDF (intentarFinalizar_). completarFirma()/completarFirmaJefe() no
 * piden `token` de sesión ni pasan por Permisos -- el TOKEN FIRMA de la liga ya es la credencial
 * de esa llamada (quien firma puede no tener usuario en el sistema).
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
  // El PDF (y la copia temporal de la vista previa) va al expediente del vehículo en su NUCO (ExpedienteNuco,
  // 08-oct-2026): la carpeta RESPONSIVAS_VEHICULARES de la raíz ya no se usa.

  // Caja de las firmas en el PDF: la misma que usa InspeccionesService (150 × 60 pt).
  const FIRMA_PDF = { ancho: 150, alto: 60 };

  // Firma a distancia: cuánto dura cada liga antes de que haya que mandar una nueva.
  const FIRMA_REMOTA_DIAS_VIGENCIA = 5;

  // El vehículo se entrega con... (SI/NO cada uno; columna = <<IF([CLAVE]="SI",...)>> en la plantilla)
  const ACCESORIOS = [
    'GATO HIDRAULICO', 'GATO MECANICO', 'LLAVE CRUZ', 'MANERAL', 'LLANTA REFACCION',
    'KIT SEGURIDAD', 'PARASOL', 'TAPETES RUDO', 'TAPETES ALFOMBRA', 'CUBRE VOLANTE',
    'CUBRE ASIENTOS', 'BED LINER', 'CUBIERTA BATEA',
  ];

  const COLUMNAS_RESUMEN = [
    ID_COLUMN, 'FECHA', 'FOLIO VEHICULO', 'NUCCO', 'RESPONSABLE', 'DEPARTAMENTO', 'ESTADO FIRMA',
    'TOKEN FIRMA', 'TOKEN FIRMA JEFE', 'PDF', 'REGISTRADO POR',
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

  /** La liga que se manda a quien tiene que firmar a distancia (responsable o jefe, cada uno
   *  con la suya -- ver el comentario del archivo). Usa el despliegue público si ya está
   *  configurado (Config.urlFirmaPublica) -- así la puede abrir alguien sin cuenta de dominio;
   *  si no, cae al despliegue normal de siempre (igual que antes). */
  function construirLiga_(tokenFirma, quien) {
    const base = Config.urlFirmaPublica() || ScriptApp.getService().getUrl();
    return base + '?firmar=1&tipo=responsiva' +
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

  /** ¿Ya no falta ninguna liga pendiente? (ni la del responsable ni la del jefe). Se evalúa
   *  sobre la fila YA actualizada en memoria (con el token que se acaba de limpiar). */
  function listoParaFinalizar_(fila) {
    return !fila['TOKEN FIRMA'] && !fila['TOKEN FIRMA JEFE'];
  }

  /** Las firmas que ya se tienen guardadas en las columnas TEMP, listas para el PDF. */
  function imagenesDesdeTemp_(fila) {
    const imagenesPdf = {};
    [['FIRMA RESPONSABLE', 'FIRMA RESPONSABLE TEMP'], ['FIRMA JEFE', 'FIRMA JEFE TEMP'], ['FIRMA CI', 'FIRMA CI TEMP']].forEach(([campo, columna]) => {
      const guardada = fila[columna];
      if (!guardada) return;
      try { imagenesPdf[campo] = Object.assign({}, JSON.parse(guardada), FIRMA_PDF); } catch (e) { /* se ignora, sin esa firma */ }
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
            campo, fila['RESPONSABLE'], fila['PLACA'] || fila['FOLIO VEHICULO'], PdfService.fechaParaNombre(ahora),
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
        // Directo en el expediente del vehículo (NUCOS VEHICULOS/<NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA)
        carpetaId: ExpedienteNuco.carpeta(fila['NUCCO'], 'RESPONSIVA').getId(),
        nombre: PdfService.nombreArchivo([
          'RESPONSIVA VEHICULAR', fila['RESPONSABLE'], fila['PLACA'] || fila['FOLIO VEHICULO'], PdfService.fechaParaNombre(ahora),
        ]),
      });
      // Su nombre en el expediente (RESPONSIVA-0088.pdf) y, si es responsiva, la vigente pasa a RESPONSIVAS ANTERIORES.
      // Si esto falla el PDF ya existe y queda ligado: solo se avisa.
      try {
        ExpedienteNuco.archivar(DriveApp.getFileById(pdf.fileId), fila['NUCCO'], 'RESPONSIVA');
      } catch (e) {
        avisos.push('El PDF se generó, pero no se pudo acomodar en el expediente del NUCO: ' + e.message);
      }
      SheetUtils.update(ssId(), hoja_().getName(), id, Object.assign({
        'PDF': pdf.url, 'ESTADO FIRMA': 'FIRMADO',
        'TOKEN FIRMA': '', 'TOKEN FIRMA EXPIRA': '', 'TOKEN FIRMA JEFE': '', 'TOKEN FIRMA JEFE EXPIRA': '',
        'FIRMA RESPONSABLE TEMP': '', 'FIRMA JEFE TEMP': '', 'FIRMA CI TEMP': '',
      }, camposExtra || {}), ID_COLUMN);
    } catch (e) {
      avisos.push('Se guardó, pero no se pudo generar el PDF: ' + e.message);
    }
    return { ID: id, PDF: pdf ? pdf.url : null, aviso: avisos.join(' ') };
  }

  /**
   * Registra una responsiva y, si el responsable es distinto al actual del vehículo, actualiza
   * el vehículo en la misma operación (candado) -- sin importar si las firmas son presenciales
   * o a distancia: la reasignación ya la decidió quien captura, aquí y ahora, con su sesión.
   *
   * opciones.remoto: no exige la firma del responsable, le genera su propia liga.
   * opciones.remotoJefe: le genera al jefe su propia liga (independiente de la del responsable);
   *   la firma del jefe NUNCA es obligatoria -- esto es solo para pedirla a distancia en vez de
   *   dejarla en blanco. Los dos se pueden usar juntos o por separado.
   * Si ninguna de las dos aplica: exige lo que corresponda y genera el PDF de una vez, como
   * siempre. Si cualquiera aplica, el PDF se genera hasta que TODAS las ligas que se hayan
   * mandado se completen (ver completarFirma/completarFirmaJefe/listoParaFinalizar_).
   *
   * @param {Object} datos      { 'FOLIO VEHICULO', 'RESPONSABLE', ... las demás columnas de captura manual }
   * @param {Object} imagenes   { 'FIRMA RESPONSABLE': {base64,mimeType}, 'FIRMA JEFE': ..., 'FIRMA CI': ... }
   */
  function crear(token, datos, imagenes, opciones) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const remoto = !!(opciones && opciones.remoto);
    const remotoJefe = !!(opciones && opciones.remotoJefe);
    const folio = String((datos || {})['FOLIO VEHICULO'] || '').trim();
    if (!folio) throw new Error('Selecciona el vehículo (Folio).');
    const responsable = String((datos || {})['RESPONSABLE'] || '').trim();
    if (!responsable) throw new Error('Captura el responsable.');
    if (!remoto && (!imagenes || !imagenes['FIRMA RESPONSABLE'] || !imagenes['FIRMA RESPONSABLE'].base64)) {
      throw new Error('Falta la firma del responsable.');
    }
    // Quien entrega SIEMPRE firma al capturar, presencial o a distancia -- a diferencia del
    // responsable y del jefe (cada quien puede firmar después por su propia liga), quien
    // entrega es quien está armando este renglón ahora mismo, así que no hay "después" para él.
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
        'ESTADO FIRMA': (remoto || remotoJefe) ? 'PENDIENTE' : 'FIRMADO',
        'TOKEN FIRMA': '',
        'TOKEN FIRMA EXPIRA': '',
        'TOKEN FIRMA JEFE': '',
        'TOKEN FIRMA JEFE EXPIRA': '',
        'FIRMA RESPONSABLE TEMP': '',
        'FIRMA JEFE TEMP': '',
        'FIRMA CI TEMP': '',
        'FIRMADO POR': '',
        'FIRMADO POR JEFE': '',
        'REGISTRADO POR': sesion.nombre,
        'FECHA REGISTRO': new Date(),
      };
      ACCESORIOS.forEach((clave) => {
        fila[clave] = String(datos[clave] || '').trim().toUpperCase() === 'SI' ? 'SI' : 'NO';
      });

      let liga = '';
      let ligaJefe = '';
      if (remoto || remotoJefe) {
        // Todo lo que YA se tiene (CI siempre; responsable y/o jefe si no son ellos los que
        // se están difiriendo) se guarda en TEMP hasta que la última liga pendiente complete.
        fila['FIRMA CI TEMP'] = JSON.stringify(imagenes['FIRMA CI']);
        if (!remoto && imagenes['FIRMA RESPONSABLE'] && imagenes['FIRMA RESPONSABLE'].base64) {
          fila['FIRMA RESPONSABLE TEMP'] = JSON.stringify(imagenes['FIRMA RESPONSABLE']);
        }
        if (!remotoJefe && imagenes['FIRMA JEFE'] && imagenes['FIRMA JEFE'].base64) {
          fila['FIRMA JEFE TEMP'] = JSON.stringify(imagenes['FIRMA JEFE']);
        }
        if (remoto) {
          const tokenFirma = Utilities.getUuid();
          fila['TOKEN FIRMA'] = tokenFirma;
          fila['TOKEN FIRMA EXPIRA'] = new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
          liga = construirLiga_(tokenFirma, 'responsable');
        }
        if (remotoJefe) {
          const tokenFirmaJefe = Utilities.getUuid();
          fila['TOKEN FIRMA JEFE'] = tokenFirmaJefe;
          fila['TOKEN FIRMA JEFE EXPIRA'] = new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
          ligaJefe = construirLiga_(tokenFirmaJefe, 'jefe');
        }
      }

      SheetUtils.insert(ssId(), hoja_().getName(), fila);

      // Enganche con reasignación: si el responsable que firma es distinto al actual del
      // vehículo, se actualiza en la misma operación -- candadoTomado porque este hilo ya
      // tiene el candado de arriba (waitLock no es reentrante). Corre siempre aquí (presencial
      // o a distancia): es la única sesión con permiso que esta operación va a tener.
      const actual = String(vehiculo['RESPONSABLE VEHICULO'] || '').trim().toUpperCase();
      if (responsable.toUpperCase() !== actual) {
        VehiculosService.actualizar(token, idVehiculo, {
          'RESPONSABLE VEHICULO': responsable,
          'NO EMPLEADO': fila['NO EMPLEADO'],
          'DEPARTAMENTO': fila['DEPARTAMENTO'] || vehiculo['DEPARTAMENTO'],
        }, { candadoTomado: true });
      }

      if (remoto || remotoJefe) {
        const resultado = { ID: id };
        if (liga) resultado.liga = liga;
        if (ligaJefe) resultado.ligaJefe = ligaJefe;
        return resultado;
      }

      const imagenesPdf = {};
      ['FIRMA RESPONSABLE', 'FIRMA JEFE', 'FIRMA CI'].forEach((campo) => {
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

  /** Lo mínimo para pintar la página de firma a distancia del RESPONSABLE (nunca el renglón
   *  completo). */
  function obtenerPendientePorToken(tokenFirma) {
    const fila = buscarPorToken_(tokenFirma, 'TOKEN FIRMA');
    if (!fila) return { vigente: false, motivo: 'no-existe' };
    if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE' || !fila['TOKEN FIRMA']) return { vigente: false, motivo: 'ya-firmado' };
    const expira = fila['TOKEN FIRMA EXPIRA'] ? new Date(fila['TOKEN FIRMA EXPIRA']) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) return { vigente: false, motivo: 'vencido' };
    return {
      vigente: true,
      documento: 'Responsiva Vehicular',
      nombre: fila['RESPONSABLE'] || '',
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
      documento: 'Responsiva Vehicular',
      // A quién pertenece la responsiva (el jefe firma como jefe DE alguien, no por sí mismo)
      nombre: fila['RESPONSABLE'] || '',
      folio: fila['FOLIO VEHICULO'] || '',
      placa: fila['PLACA'] || '',
      marca: fila['MARCA'] || '',
      modelo: fila['MODELO'] || '',
    };
  }

  /** El PDF tal como va a quedar hasta ahora, con un aviso de "VISTA PREVIA" -- sin guardar
   *  nada en Drive. Para que quien va a firmar (responsable o jefe, por su propia liga) vea el
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
      plantillaId: PLANTILLA, datos: datosPdf, imagenes: imagenesDesdeTemp_(fila), carpetaId: ExpedienteNuco.carpeta(fila['NUCCO'], 'RESPONSIVA').getId(),
    });
  }

  /**
   * Completa la firma del RESPONSABLE que llegó por su liga. Si la del jefe también está
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

      fila['FIRMA RESPONSABLE TEMP'] = JSON.stringify(imagen);
      fila['TOKEN FIRMA'] = '';
      fila['TOKEN FIRMA EXPIRA'] = '';
      fila['FIRMADO POR'] = Session.getActiveUser().getEmail() || '';

      if (!listoParaFinalizar_(fila)) {
        SheetUtils.update(ssId(), hoja_().getName(), fila['ID'], {
          'FIRMA RESPONSABLE TEMP': fila['FIRMA RESPONSABLE TEMP'],
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
   * lado. Si la del responsable todavía está pendiente, solo se guarda y se espera.
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

      fila['FIRMA JEFE TEMP'] = JSON.stringify(imagenJefe);
      fila['TOKEN FIRMA JEFE'] = '';
      fila['TOKEN FIRMA JEFE EXPIRA'] = '';
      fila['FIRMADO POR JEFE'] = Session.getActiveUser().getEmail() || '';

      if (!listoParaFinalizar_(fila)) {
        SheetUtils.update(ssId(), hoja_().getName(), fila['ID'], {
          'FIRMA JEFE TEMP': fila['FIRMA JEFE TEMP'],
          'TOKEN FIRMA JEFE': '', 'TOKEN FIRMA JEFE EXPIRA': '', 'FIRMADO POR JEFE': fila['FIRMADO POR JEFE'],
        }, ID_COLUMN);
        return { ID: fila['ID'], PDF: null, pendiente: true, aviso: 'Tu firma quedó registrada. Falta la firma del responsable para generar el documento.' };
      }

      return generarPdfYGuardar_(fila['ID'], fila, imagenesDesdeTemp_(fila), new Date(), { 'FIRMADO POR JEFE': fila['FIRMADO POR JEFE'] });
    } finally {
      lock.releaseLock();
    }
  }

  /** La hoja, para HojaServicio.eliminar (que además respeta Relaciones) */
  const HOJA = { modulo: MODULO, libro: ssId, hoja: SHEET, columnas: COLUMNAS_RESUMEN };

  function eliminar(token, id) {
    return HojaServicio.eliminar(HOJA, token, id);
  }

  return {
    listarPorFolio, buscarPorId, crear, eliminar, ligaDeToken,
    obtenerPendientePorToken, obtenerPendienteJefePorToken, vistaPrevia, completarFirma, completarFirmaJefe,
    PLANTILLA,
  };
})();
