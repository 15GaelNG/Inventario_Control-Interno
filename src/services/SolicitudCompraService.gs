/**
 * SolicitudCompraService.gs
 * Puente hacia Adquisición Vehicular (proceso externo, ~35 días hábiles -- ver
 * AdquisicionVehicularService.gs): el vehículo no existe en VEHICULOS (sin Folio/Nucco) hasta
 * casi el final de la compra, así que aquí se lleva el expediente de la compra DESDE el folio
 * del ticket, antes de que el vehículo nazca.
 *
 * Al crear una solicitud, esta app crea sola una carpeta de Drive nombrada "<FOLIO>-<NOMBRE>"
 * dentro de raíz/AÑO/MES de Adquisición Vehicular (RAIZ_ADQUISICION_VEHICULAR, la misma carpeta
 * de la cuenta de Gestión Vehicular que AdquisicionVehicularService.gs solo lee) -- mismos 3
 * niveles y misma convención de mes ("NN. MES", p. ej. "11. NOVIEMBRE") que ya usan sus carpetas
 * reales (listarCarpetasAdquisicion_), así que una solicitud nueva ya nace en el lugar real, no
 * en uno aparte de esta app (decisión del usuario, 13-oct-2026). Para que esto funcione, la
 * cuenta que corre la app necesita permiso de EDITOR en esa carpeta (antes solo hacía falta
 * lectura); si no lo tiene, crear() truena con un mensaje que lo explica. Repositorio de solo ver
 * y subir documentos (nada de seguimiento de los 15 pasos del proceso, por ahora). El botón "Ya
 * crear vehículo" (app.html) manda el folio y la liga de esa carpeta al alta de Vehículos
 * (VehiculosService.gs, VEHICULOS.alCrear) y, si sale bien, marcarConvertida deja esta solicitud
 * como ABIERTA -> CONVERTIDA con el Nucco resultante.
 *
 * Solo ADMIN/SUPER por ahora (sin fila en PERMISOS_SEMILLA -- entran por código, nadie más ve
 * ni lee este módulo).
 *
 * La hoja SOLICITUD COMPRA no viene de AppSheet (no existe hasta que hace falta): mismo patrón
 * que HelpdeskService.hoja_/AdquisicionVehicularService.indiceHoja_, NO el de HojaServicio (ese
 * exige que la hoja ya exista -- SheetUtils.getSheet truena si no). Por eso aquí se lee/escribe
 * la hoja directo, sin pasar por HojaServicio.listar/crear/actualizar.
 */

const SolicitudCompraService = (function () {
  const HOJA = 'SOLICITUD COMPRA';
  const ENCABEZADOS = ['ID', 'FOLIO', 'AREA', 'NOMBRE', 'FECHA', 'ESTATUS', 'LIGA_CARPETA', 'CARPETA_ID', 'NUCCO_RESULTANTE'];
  const MESES_ES_ = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }

  /** La hoja (o null si no existe y no se pide crearla) -- mismo patrón que HelpdeskService.hoja_. */
  function hoja_(crear) {
    const ss = SpreadsheetApp.openById(ssId());
    let hoja = ss.getSheetByName(HOJA);
    if (!hoja) {
      if (!crear) return null;
      hoja = ss.insertSheet(HOJA);
      hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  /** La carpeta del mes en curso ("NN. MES", la misma convención que ya usan las carpetas reales
   *  de Adquisición Vehicular -- p. ej. "11. NOVIEMBRE") dentro de la carpeta del año. La crea si
   *  no existe. */
  function carpetaDelMes_(carpetaAnio) {
    const mes = Number(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'M'));
    const nombreMes = String(mes).padStart(2, '0') + '. ' + MESES_ES_[mes - 1];
    const existentes = carpetaAnio.getFoldersByName(nombreMes);
    return existentes.hasNext() ? existentes.next() : carpetaAnio.createFolder(nombreMes);
  }

  /** La subcarpeta "<folio>-<nombre>" dentro de raíz/AÑO/MES de Adquisición Vehicular (misma
   *  estructura de 3 niveles que ya usan sus carpetas reales -- listarCarpetasAdquisicion_,
   *  AdquisicionVehicularService.gs) -- las crea si no existen. Necesita permiso de EDITOR ahí,
   *  no solo lectura. */
  function carpetaDeSolicitud_(folio, nombre) {
    const nombreCarpeta = String(folio).trim() + '-' + String(nombre).trim();
    try {
      const raiz = DriveApp.getFolderById(AdquisicionVehicularService.RAIZ_ADQUISICION_VEHICULAR);
      const mesCarpeta = carpetaDelMes_(DriveUtils.carpetaDelAnio(raiz));
      const existentes = mesCarpeta.getFoldersByName(nombreCarpeta);
      return existentes.hasNext() ? existentes.next() : mesCarpeta.createFolder(nombreCarpeta);
    } catch (e) {
      // "Acceso denegado" casi siempre = la cuenta puede VER la carpeta de Adquisición Vehicular
      // pero no EDITARLA (falta carpeta de año o de mes, o la de la solicitud -- cualquiera).
      throw new Error('No se pudo crear la carpeta en Adquisición Vehicular (' + e.message + '). ' +
        'Verifica que la cuenta que corre la app tenga permiso de EDITOR en esa carpeta de Drive (no solo lectura).');
    }
  }

  function filaAObjeto_(valores) {
    const obj = {};
    ENCABEZADOS.forEach((c, i) => { obj[c] = valores[i] === undefined || valores[i] === null ? '' : valores[i]; });
    obj.FECHA = HojaServicio.fechaISO(obj.FECHA);
    return obj;
  }

  /** La fila de una solicitud por ID (ya como objeto), o null. */
  function filaPorId_(hoja, id) {
    if (!hoja || hoja.getLastRow() < 2) return null;
    const valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS.length).getValues();
    const encontrada = valores.find((f) => f[0] === id);
    return encontrada ? filaAObjeto_(encontrada) : null;
  }

  function listar(token) {
    Permisos.puedeLeer(token, 'solicitud-compra');
    const hoja = hoja_(false);
    if (!hoja || hoja.getLastRow() < 2) return [];
    return hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS.length).getValues()
      .map(filaAObjeto_).filter((f) => f.ID).reverse();   // más nuevas primero (se agregan al final)
  }

  function crear(token, datos) {
    Permisos.puedeEditar(token, 'solicitud-compra');
    const folio = String((datos || {}).FOLIO || '').trim();
    const nombre = String((datos || {}).NOMBRE || '').trim();
    if (!folio) throw new Error('El folio del ticket es obligatorio');
    if (!nombre) throw new Error('El nombre es obligatorio');
    const hoja = hoja_(true);
    const carpeta = carpetaDeSolicitud_(folio, nombre);
    const fila = {
      ID: Ids.nuevo(Entidades.prefijo(HOJA)),
      FOLIO: folio,
      AREA: String((datos || {}).AREA || '').trim(),
      NOMBRE: nombre,
      FECHA: new Date(),
      ESTATUS: 'ABIERTA',
      LIGA_CARPETA: carpeta.getUrl(),
      CARPETA_ID: carpeta.getId(),
      NUCCO_RESULTANTE: '',
    };
    hoja.appendRow(ENCABEZADOS.map((c) => fila[c]));
    CacheHojas.tocarHoja(hoja);
    return Object.assign({}, fila, { FECHA: HojaServicio.fechaISO(fila.FECHA) });
  }

  function eliminar(token, id) {
    Permisos.puedeEditar(token, 'solicitud-compra');
    const hoja = hoja_(false);
    if (!hoja || hoja.getLastRow() < 2) return false;
    const ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        hoja.deleteRow(i + 2);
        CacheHojas.tocarHoja(hoja);
        return true;
      }
    }
    return false;
  }

  /** Los archivos de la carpeta de una solicitud (mismo formato que ya espera Galeria). */
  function archivos(token, id) {
    Permisos.puedeLeer(token, 'solicitud-compra');
    const registro = filaPorId_(hoja_(false), id);
    if (!registro || !registro.CARPETA_ID) throw new Error('No se encontró la solicitud o no tiene carpeta.');
    return DriveUtils.archivosDeCarpeta(registro.CARPETA_ID);
  }

  /** Sube un archivo directo a la carpeta de la solicitud (mismo HojaServicio.subirArchivo que ya usan los demás módulos). */
  function subirArchivo(token, id, nombreArchivo, mimeType, base64Data) {
    Permisos.puedeEditar(token, 'solicitud-compra');
    const registro = filaPorId_(hoja_(false), id);
    if (!registro || !registro.CARPETA_ID) throw new Error('No se encontró la solicitud o no tiene carpeta.');
    return HojaServicio.subirArchivo(registro.CARPETA_ID, 'de la solicitud de compra', nombreArchivo, mimeType, base64Data);
  }

  /** La marca ABIERTA -> CONVERTIDA al dar de alta el vehículo. */
  function marcarConvertida(token, id, nucco) {
    Permisos.puedeEditar(token, 'solicitud-compra');
    const hoja = hoja_(false);
    if (!hoja || hoja.getLastRow() < 2) throw new Error('No se encontró la solicitud.');
    const ids = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getValues();
    const colEstatus = ENCABEZADOS.indexOf('ESTATUS') + 1;
    const colNucco = ENCABEZADOS.indexOf('NUCCO_RESULTANTE') + 1;
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === id) {
        hoja.getRange(i + 2, colEstatus, 1, 1).setValue('CONVERTIDA');
        hoja.getRange(i + 2, colNucco, 1, 1).setValue(nucco);
        CacheHojas.tocarHoja(hoja);
        return { ESTATUS: 'CONVERTIDA', NUCCO_RESULTANTE: nucco };
      }
    }
    throw new Error('No se encontró la solicitud.');
  }

  return { listar, crear, eliminar, archivos, subirArchivo, marcarConvertida };
})();
