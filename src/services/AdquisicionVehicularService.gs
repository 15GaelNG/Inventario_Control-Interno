/**
 * AdquisicionVehicularService.gs
 * "ADQUISICIÓN VEHICULAR" es un proceso de compra de vehículos que vive FUERA de esta app
 * (carpetas de Drive + Excel, dueño gestor.vehicular@ciudadmaderas.com). buscar(), lo que usa el
 * botón "Buscar expediente de adquisición" de la ficha, YA NO lee esos archivos externos en
 * vivo (se rompió dos veces por el formato de archivos que no controlamos: una columna con otro
 * nombre, un encabezado que no era la primera fila -- 12-oct-2026). En vez de eso consulta la
 * hoja propia ADQUISICION_VEHICULAR_INDICE, que llena AdquisicionVehicularIndice.gs (Excel
 * 2024/2025/2026 + OCR de facturas para lo que esos tres Excel no cubren) con una corrida manual
 * desde el editor.
 *
 * Lo que queda aquí (FUENTES, leerFuente_, listarCarpetasAdquisicion_, indiceHoja_…) es lo que
 * usa ese constructor del índice -- el botón de la ficha solo llama buscar().
 *
 * IDs fijos a propósito (no por Config.SPREADSHEET_IDS/DRIVE_FOLDERS: esos son para recursos
 * PROPIOS de la app, por ambiente). La carpeta/archivos de Adquisición Vehicular son de otra
 * cuenta, de solo lectura — mismo caso que PLANTILLA_ARQUEO_DOC_ID (ArqueosService.gs) o
 * CARPETA_RESPONSIVAS_HEREDADAS (MigracionResponsivasHeredadas.gs): CLAUDE.md permite ID fijo
 * cuando solo se lee/copia.
 */

const AdquisicionVehicularService = (function () {
  const RAIZ_ADQUISICION_VEHICULAR = '13c8hkl5lUn_46CydAvKy-aUOl5Bzgneo';
  const HOJA_INDICE = 'ADQUISICION_VEHICULAR_INDICE';
  const ENCABEZADOS_INDICE = ['SERIE', 'FOLIO', 'AREA', 'AÑO', 'LIGA_CARPETA', 'FUENTE', 'ACTUALIZADO'];
  const TTL_INDICE_SEGUNDOS = 1800;

  // El nombre de las columnas de folio/serie/carpeta cambia de año a año (confirmado a mano,
  // descomprimiendo los .xlsx reales, 12-oct-2026) -- un registro por año en vez de asumir que
  // comparten esquema. 2026 SÍ tiene archivo maestro (estaba en la raíz de la carpeta "2026" de
  // Drive, no en ningún mes -- se encontró tarde, 12-oct-2026, mismo formato que el de 2025): el
  // OCR de AdquisicionVehicularIndice.gs queda como respaldo solo para lo que ni este Excel
  // tenga capturado todavía (una compra tan reciente que nadie la registró aquí).
  const FUENTES = [
    {
      año: '2024', fileId: '1dduU0ItSqOi7T3qoY_m1h_RW0sY7LxsS',
      colSerie: 'NO. SERIE', colFolio: 'FOLIO', colArea: 'ÁREA SOLICITANTE', colCarpeta: 'NOMBRE DE LA CARPETA', colLiga: null,
    },
    {
      año: '2025', fileId: '13KU1abKg1MzSRzH8vAFoS0MwnqFWjyLj',
      colSerie: '# DE SERIE', colFolio: 'TICKET HELP', colArea: 'ÁREA SOLICITANTE', colCarpeta: null, colLiga: 'LIGA DE LA CARPETA',
    },
    {
      año: '2026', fileId: '1lKg7bcODcAiFcqkJK9I0ShEL5wxWL1x7',
      colSerie: '# DE SERIE', colFolio: 'TICKET HELP', colArea: 'ÁREA SOLICITANTE', colCarpeta: null, colLiga: 'LIGA DE LA CARPETA',
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

  /** El encabezado real no siempre es el primer renglón (el archivo de 2025 trae un bloque de
   *  título/resumen arriba, confirmado descomprimiendo el .xlsx) -- se busca la fila que de
   *  verdad trae colSerie como encabezado, en vez de asumir que es la primera. */
  function encontrarEncabezado_(valores, colSerie) {
    for (let i = 0; i < valores.length; i++) {
      const indices = indiceEncabezados_(valores[i]);
      if (indices[colSerie] !== undefined) return { indices, fila: i };
    }
    return null;
  }

  /** TODAS las filas de una fuente (no se detiene en la primera que haga match), una por cada
   *  serie -- una celda con varias (compra de lote) se separa. `nombreCarpeta` es el valor crudo
   *  de colCarpeta, si la fuente lo tiene: resolverlo a una liga real es trabajo del índice
   *  (listarCarpetasAdquisicion_ + buscarEnListaCarpetas_), no de esta función. */
  function leerFuente_(fuente) {
    const hoja = SpreadsheetApp.openById(fuente.fileId).getSheets()[0];
    const valores = hoja.getDataRange().getValues();
    if (!valores.length) return [];
    const encabezado = encontrarEncabezado_(valores, fuente.colSerie);
    if (!encabezado) return [];
    const indices = encabezado.indices;
    const filas = [];
    for (let i = encabezado.fila + 1; i < valores.length; i++) {
      const celdaSerie = valores[i][indices[fuente.colSerie]];
      if (!celdaSerie) continue;
      const series = String(celdaSerie).split(/\s+/).map(normalizarSerie_).filter(Boolean);
      if (!series.length) continue;
      const folio = fuente.colFolio && indices[fuente.colFolio] !== undefined
        ? String(valores[i][indices[fuente.colFolio]] || '').trim() : '';
      const area = fuente.colArea && indices[fuente.colArea] !== undefined
        ? String(valores[i][indices[fuente.colArea]] || '').trim() : '';
      const liga = fuente.colLiga && indices[fuente.colLiga] !== undefined
        ? String(valores[i][indices[fuente.colLiga]] || '').trim() : '';
      const nombreCarpeta = fuente.colCarpeta && indices[fuente.colCarpeta] !== undefined
        ? String(valores[i][indices[fuente.colCarpeta]] || '').trim() : '';
      series.forEach((serie) => filas.push({ serie, año: fuente.año, folio, area, liga, nombreCarpeta }));
    }
    return filas;
  }

  /** Recorre de verdad Drive, UNA vez por corrida (raíz -> carpeta de cada año -> de cada mes ->
   *  de cada solicitud) -- la usan las dos pasadas del índice: la A para resolver la carpeta de
   *  2024 (por nombre) y la B para encontrar lo que 2026 no tiene en ningún Excel. */
  function listarCarpetasAdquisicion_() {
    const salida = [];
    const raiz = DriveApp.getFolderById(RAIZ_ADQUISICION_VEHICULAR);
    const años = raiz.getFolders();
    while (años.hasNext()) {
      const carpetaAño = años.next();
      const año = carpetaAño.getName().trim();
      if (!/^\d{4}$/.test(año)) continue;   // ignora "REPORTE ANUAL PROVEEDORES" y similares
      const meses = carpetaAño.getFolders();
      while (meses.hasNext()) {
        const mes = meses.next();
        const solicitudes = mes.getFolders();
        while (solicitudes.hasNext()) {
          const solicitud = solicitudes.next();
          salida.push({ año, mes: mes.getName(), nombre: solicitud.getName(), id: solicitud.getId(), url: solicitud.getUrl() });
        }
      }
    }
    return salida;
  }

  /** Busca en una lista YA recorrida (listarCarpetasAdquisicion_) una carpeta del año dado cuyo
   *  nombre coincida con nombreEsperado -- sin volver a tocar Drive. */
  function buscarEnListaCarpetas_(lista, año, nombreEsperado) {
    const nombreBuscado = String(nombreEsperado || '').trim();
    if (!nombreBuscado) return '';
    const match = lista.find((c) => c.año === año &&
      (c.nombre === nombreBuscado || c.nombre.indexOf(nombreBuscado) !== -1 || nombreBuscado.indexOf(c.nombre) !== -1));
    return match ? match.url : '';
  }

  /** Busca en una lista YA recorrida una carpeta del año dado cuyo nombre empiece con
   *  "<folio>-" (la convención real de 2025/2026, confirmada navegando Drive: "30371-
   *  CONSTRUCCIÓN") -- a diferencia de buscarEnListaCarpetas_, no necesita el texto de
   *  "NOMBRE DE LA CARPETA" del Excel, que para 2025 ni siquiera existe (ahí la liga viene de
   *  otra columna, a veces a Dropbox; esto permite preferir la carpeta real de Drive cuando sí
   *  está, en vez de usar siempre ese link). */
  function buscarCarpetaPorFolio_(lista, año, folio) {
    const folioBuscado = String(folio || '').trim();
    if (!folioBuscado) return '';
    const prefijo = new RegExp('^' + folioBuscado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*-');
    const match = lista.find((c) => c.año === año && prefijo.test(c.nombre));
    return match ? match.url : '';
  }

  /** La hoja del índice (o null si no existe y no se pide crearla) -- mismo patrón que
   *  HelpdeskService.hoja_: se crea sola la primera vez que hace falta. */
  function indiceHoja_(crear) {
    const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
    let hoja = ss.getSheetByName(HOJA_INDICE);
    if (!hoja) {
      if (!crear) return null;
      hoja = ss.insertSheet(HOJA_INDICE);
      hoja.getRange(1, 1, 1, ENCABEZADOS_INDICE.length).setValues([ENCABEZADOS_INDICE]).setFontWeight('bold');
      hoja.setFrozenRows(1);
    }
    return hoja;
  }

  function mapaIndice_() {
    return CacheHojas.recordar('adquisicion_vehicular_indice', [[Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_INDICE]], () => {
      const hoja = indiceHoja_(false);
      const mapa = {};
      if (!hoja || hoja.getLastRow() < 2) return mapa;
      hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS_INDICE.length).getValues().forEach((f) => {
        const serie = String(f[0]).trim();
        if (serie) mapa[serie] = { año: String(f[3]), folio: String(f[1]), area: String(f[2]), liga: String(f[4]) };
      });
      return mapa;
    }, TTL_INDICE_SEGUNDOS);
  }

  /** Busca el expediente de un vehículo por su serie, en el índice propio -- no abre ningún
   *  archivo externo. Regresa { año, folio, area, liga } o null si no se encontró. */
  function buscar(token, serie) {
    Permisos.puedeLeer(token, 'vehiculos');
    const serieBuscada = normalizarSerie_(serie);
    if (!serieBuscada) return null;
    return mapaIndice_()[serieBuscada] || null;
  }

  /** TODOS los expedientes del índice (no por serie) -- para el apartado "Adquisición vehicular".
   *  Solo las filas con serie (las de OCR sin serie encontrada son ruido de auditoría interna,
   *  no expedientes para mostrar). Mismo permiso y misma caché que buscar()/mapaIndice_(). */
  function listar(token) {
    Permisos.puedeLeer(token, 'vehiculos');
    return CacheHojas.recordar('adquisicion_vehicular_lista', [[Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_INDICE]], () => {
      const hoja = indiceHoja_(false);
      if (!hoja || hoja.getLastRow() < 2) return [];
      return hoja.getRange(2, 1, hoja.getLastRow() - 1, ENCABEZADOS_INDICE.length).getValues()
        .filter((f) => String(f[0]).trim())
        .map((f) => ({
          serie: String(f[0]).trim(), folio: String(f[1]).trim(), area: String(f[2]).trim(),
          año: String(f[3]).trim(), liga: String(f[4]).trim(), fuente: String(f[5]).trim(), actualizado: String(f[6]).trim(),
        }));
    }, TTL_INDICE_SEGUNDOS);
  }

  /** El id de carpeta de Drive de una liga ("https://drive.google.com/drive/folders/<id>" o
   *  "...?id=<id>"), o '' si la liga no es de Drive (p. ej. Dropbox) -- esas solo se abren tal cual. */
  function idCarpetaDrive_(liga) {
    const texto = String(liga || '');
    if (!/drive\.google\.com/.test(texto)) return '';
    const m = texto.match(/\/folders\/([a-zA-Z0-9_-]+)/) || texto.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    return m ? m[1] : '';
  }

  /** Archivos de la carpeta de Drive de un expediente (nombre, miniatura, liga -- mismo formato
   *  que ya espera el componente Galeria). { soportado: false } si la liga no es de Drive: ahí
   *  solo se puede abrir la carpeta tal cual, no listar su contenido. */
  function archivos(token, liga) {
    Permisos.puedeLeer(token, 'vehiculos');
    const carpetaId = idCarpetaDrive_(liga);
    if (!carpetaId) return { soportado: false };
    return { soportado: true, archivos: DriveUtils.archivosDeCarpeta(carpetaId) };
  }

  return {
    buscar, listar, archivos,
    // Lo de abajo lo usa AdquisicionVehicularIndice.gs para construir el índice; el botón de la
    // ficha solo llama buscar().
    FUENTES, leerFuente_, listarCarpetasAdquisicion_, buscarEnListaCarpetas_, buscarCarpetaPorFolio_,
    indiceHoja_, HOJA_INDICE, ENCABEZADOS_INDICE, normalizarSerie_,
    // La raíz real de Adquisición Vehicular (de otra cuenta) -- SolicitudCompraService.gs
    // también crea ahí (con permiso de EDITOR, a diferencia de este servicio que solo lee).
    RAIZ_ADQUISICION_VEHICULAR,
  };
})();
