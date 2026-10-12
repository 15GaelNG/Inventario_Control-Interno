/**
 * AdquisicionVehicularService.gs
 * "ADQUISICIÓN VEHICULAR" es un proceso de compra de vehículos que vive FUERA de esta app
 * (carpetas de Drive + Excel, dueño gestor.vehicular@ciudadmaderas.com) — no es una hoja ni una
 * carpeta propia de Control Interno. Este servicio solo LEE esos archivos externos para
 * encontrar, por número de serie, el folio y la carpeta de una compra ya hecha; nunca escribe
 * ahí. Lo usa un botón manual en la ficha del vehículo ("Buscar expediente de adquisición"),
 * no un sincronizador automático — ver VehiculosService.guardarExpedienteAdquisicion, que es
 * quien de verdad guarda lo que aquí se encuentra.
 *
 * El nombre de las columnas de folio/serie/carpeta cambia de año a año (confirmado a mano,
 * navegando Drive, 12-oct-2026) — por eso FUENTES es una lista con un registro por año en vez
 * de asumir que todas comparten esquema. 2026 no tiene archivo maestro conocido todavía.
 *
 * IDs fijos a propósito (no por Config.SPREADSHEET_IDS/DRIVE_FOLDERS: esos son para recursos
 * PROPIOS de la app, por ambiente). Esta carpeta/archivos son de otra cuenta, de solo lectura
 * — mismo caso que PLANTILLA_ARQUEO_DOC_ID (ArqueosService.gs) o CARPETA_RESPONSIVAS_HEREDADAS
 * (MigracionResponsivasHeredadas.gs): CLAUDE.md permite ID fijo cuando solo se lee/copia.
 */

const AdquisicionVehicularService = (function () {
  const RAIZ_ADQUISICION_VEHICULAR = '13c8hkl5lUn_46CydAvKy-aUOl5Bzgneo';

  const FUENTES = [
    {
      año: '2024', fileId: '1dduU0ItSqOi7T3qoY_m1h_RW0sY7LxsS',
      colSerie: 'NO. SERIE', colFolio: 'REGISTRO 2024 FOLIO', colArea: 'ÁREA SOLICITANTE',
      colCarpeta: 'NOMBRE DE LA CARPETA', colLiga: null,
    },
    {
      año: '2025', fileId: '13KU1abKg1MzSRzH8vAFoS0MwnqFWjyLj',
      colSerie: '# DE SERIE', colFolio: 'TICKET HELP', colArea: 'ÁREA SOLICITANTE',
      colCarpeta: null, colLiga: 'LIGA DE LA CARPETA',
    },
  ];

  function normalizarSerie_(serie) {
    return String(serie || '').toUpperCase().replace(/\s+/g, '');
  }

  /** {ENCABEZADO_TRIM: índice de columna}, para no depender de espacios sueltos en el encabezado */
  function indiceEncabezados_(fila) {
    const indices = {};
    fila.forEach((valor, i) => { indices[String(valor || '').trim()] = i; });
    return indices;
  }

  /** Busca, bajo la raíz, una subcarpeta del año y luego, dentro de ella, una cuyo nombre
   *  coincida (exacto o como substring en cualquier sentido, para tolerar espacios/acentos de
   *  más) con "nombreEsperado" -- el valor de la columna colCarpeta de esa fuente (es el único
   *  dato que tenemos del nombre real de la carpeta; el folio por sí solo no siempre aparece
   *  en el nombre, se vio navegando Drive a mano). Si algo no existe (carpeta del año, del
   *  mes, o de la solicitud), regresa '' sin tronar: no todos los registros tienen carpeta
   *  viva hoy. */
  function buscarCarpeta_(año, nombreEsperado) {
    const nombreBuscado = String(nombreEsperado || '').trim();
    if (!nombreBuscado) return '';
    try {
      const raiz = DriveApp.getFolderById(RAIZ_ADQUISICION_VEHICULAR);
      const carpetasAño = raiz.getFoldersByName(año);
      if (!carpetasAño.hasNext()) return '';
      const carpetaAño = carpetasAño.next();
      const meses = carpetaAño.getFolders();
      while (meses.hasNext()) {
        const mes = meses.next();
        const solicitudes = mes.getFolders();
        while (solicitudes.hasNext()) {
          const solicitud = solicitudes.next();
          const nombre = solicitud.getName();
          if (nombre === nombreBuscado || nombre.indexOf(nombreBuscado) !== -1 || nombreBuscado.indexOf(nombre) !== -1) {
            return solicitud.getUrl();
          }
        }
      }
      return '';
    } catch (err) {
      console.error('AdquisicionVehicularService.buscarCarpeta_ falló para "' + nombreBuscado + '": ' + err.message);
      return '';
    }
  }

  function buscarEnFuente_(fuente, serieBuscada) {
    const hoja = SpreadsheetApp.openById(fuente.fileId).getSheets()[0];
    const valores = hoja.getDataRange().getValues();
    if (!valores.length) return null;
    const indices = indiceEncabezados_(valores[0]);
    const colSerie = indices[fuente.colSerie];
    if (colSerie === undefined) return null;

    for (let i = 1; i < valores.length; i++) {
      const celdaSerie = valores[i][colSerie];
      if (!celdaSerie) continue;
      const series = String(celdaSerie).split(/\s+/).map(normalizarSerie_).filter(Boolean);
      if (series.indexOf(serieBuscada) === -1) continue;

      const folio = fuente.colFolio && indices[fuente.colFolio] !== undefined
        ? String(valores[i][indices[fuente.colFolio]] || '').trim() : '';
      const area = fuente.colArea && indices[fuente.colArea] !== undefined
        ? String(valores[i][indices[fuente.colArea]] || '').trim() : '';
      let liga = fuente.colLiga && indices[fuente.colLiga] !== undefined
        ? String(valores[i][indices[fuente.colLiga]] || '').trim() : '';
      if (!liga && fuente.colCarpeta && indices[fuente.colCarpeta] !== undefined) {
        liga = buscarCarpeta_(fuente.año, valores[i][indices[fuente.colCarpeta]]);
      }

      return { año: fuente.año, folio, area, liga };
    }
    return null;
  }

  /** Busca el expediente de adquisición de un vehículo por su número de serie, en las fuentes
   *  externas conocidas (una por año). Regresa { año, folio, area, liga } o null si no se
   *  encontró en ninguna -- "no encontrado" no es un error. */
  function buscar(token, serie) {
    Permisos.puedeLeer(token, 'vehiculos');
    const serieBuscada = normalizarSerie_(serie);
    if (!serieBuscada) return null;
    for (let i = 0; i < FUENTES.length; i++) {
      const encontrado = buscarEnFuente_(FUENTES[i], serieBuscada);
      if (encontrado) return encontrado;
    }
    return null;
  }

  return { buscar };
})();
