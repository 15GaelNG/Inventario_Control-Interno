/**
 * InspeccionesService.gs
 * Inspección vehicular: checklist de estado de la unidad, con diagramas de daños,
 * firmas y un PDF generado a partir de la plantilla del tipo de unidad.
 *
 * Hoja real "INSPECCION VEHICULAR" (290 registros, 195 columnas):
 *   46 de cabecera (folio, responsable, llantas, puntuaciones…)
 *  143 de checklist (BUENO / REGULAR / MALO / N/A según la pieza)
 *    6 de imágenes (2 firmas + 4 diagramas)
 *
 * Cosas que definen el módulo:
 * - **TIPO manda**: decide qué piezas se revisan (de 87 a 132 según el tipo), qué plantilla
 *   se usa, qué diagramas se muestran y en qué subcarpeta se archiva el PDF.
 * - Las columnas de llantas cambian con el tipo: un auto usa DD/DI/TD/TI, una moto D/T,
 *   y un camión con rueda doble TII/TID/TEI/TED. Por eso se leen todas y se muestran
 *   solo las que traen valor.
 * - `FORMATO INSPECCION VEHICULAR` guarda la RUTA del PDF dentro de la carpeta de
 *   formatos, con subcarpeta por tipo: "INSPECCIONES VEHICULARES/INSPECCIONES L200/….pdf".
 *
 * Imágenes: los diagramas marcados y las firmas llegan del cliente como PNG y se guardan
 * con la ruta de AppSheet (INSPECCION VEHICULAR_Images/<id>.<COLUMNA>.<hora>.png). Un
 * diagrama sin marcar guarda la ruta del dibujo en blanco del tipo, como hacía AppSheet.
 */

const InspeccionesService = (function () {
  const MODULO = 'inspeccion-vehicular';
  const TABLA = 'INSPECCION VEHICULAR';
  const COL_ID = 'ID INSPECCION';
  const COL_PDF = 'FORMATO INSPECCION VEHICULAR';
  const COLUMNAS_CLAVE = [COL_ID, 'FOLIO', 'TIPO'];

  /** Columnas que necesita la tabla. Leer las 195 serían ~57,000 celdas por consulta. */
  const COLUMNAS_LISTA = [
    COL_ID, 'ID VEHICULO', 'NUCO', 'FOLIO', 'TIPO', 'FECHA', 'RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE',
    'OFICINA / DESARROLLO', 'CONDUCTOR', 'JEFE DIRECTO', 'VEHICULO', 'NO SERIE',
    'MODELO / AÑO', 'PLACAS', 'FECHA ULTIMO SERVICIO', 'HOLOGRAMA', 'TIPO COMBUSTIBLE',
    'VOLTAJE', 'OBSERVACIONES', 'NOMBRE INSPECTOR', 'PUNTAJE FINAL INSPECCION', COL_PDF,
  ];

  /** Cada tipo de unidad usa unas u otras; se muestran las que traigan valor */
  const COLUMNAS_LLANTAS = [
    ['LLANTA DD', 'Delantera derecha'], ['LLANTA DI', 'Delantera izquierda'],
    ['LLANTA TD', 'Trasera derecha'], ['LLANTA TI', 'Trasera izquierda'],
    ['LLANTA D', 'Delantera'], ['LLANTA T', 'Trasera'],
    ['LLANTA TII', 'Trasera interior izquierda'], ['LLANTA TID', 'Trasera interior derecha'],
    ['LLANTA TEI', 'Trasera exterior izquierda'], ['LLANTA TED', 'Trasera exterior derecha'],
  ];

  /** Puntuación por sección del checklist (las llena el formato, no el capturista) */
  const COLUMNAS_PUNTUACION = [
    ['PUNTUACION_DOCUMENTACION', 'Documentación'],
    ['PUNTUACION_CRISTALERIA', 'Cristalería'],
    ['PUNTUACION_LATONERIA Y PINTURA', 'Latonería y pintura'],
    ['PUNTUACION_NEUMATICOS', 'Neumáticos'],
    ['PUNTUACION_INVENTARIOS', 'Inventarios'],
    ['PUNTUACION_CERRADURAS', 'Cerraduras'],
    ['PUNTUACION_LIMPIEZA', 'Limpieza'],
    ['PUNTUACION_INTERIORES', 'Interiores'],
    ['PUNTUACION_SISTEMAS INTERIORES', 'Sistemas interiores'],
    ['PUNTUACION_SISTEMA MECANICO', 'Sistema mecánico'],
    ['PUNTUACION_NIVELES', 'Niveles'],
    ['PUNTUACION_BATERIA INFLADA', 'Batería inflada'],
  ];

  const COLUMNAS_IMAGEN = [
    ['INS FRONTAL', 'Frontal'], ['INS TRASERA', 'Trasera'],
    ['INS IZQUIERDA', 'Izquierda'], ['INS DERECHA', 'Derecha'],
    ['FIRMA RESPONSABLE', 'Firma del responsable'], ['FIRMA INSPECTOR', 'Firma del inspector'],
  ];

  /** Configuración por tipo de unidad: diagramas, plantilla y carpeta del PDF */
  const HOJA_MODELOS = 'MODELOS INSPECCION';
  const COL_PLANTILLA = 'PLANTILLA';
  const COL_CARPETA = 'CARPETA';
  const DIAGRAMAS = ['FRONTAL', 'TRASERA', 'IZQUIERDA', 'DERECHA'];

  /**
   * El nombre del formato no siempre coincide con el del tipo: hay motos que en la
   * plantilla llevan "MOTO" al frente y un tipo en singular cuyo formato está en plural.
   * Se usa para adivinar la plantilla la primera vez; después queda escrita en la hoja.
   */
  const NOMBRE_PLANTILLA = {
    'HONDA 150XR': 'MOTO HONDA 150XR',
    'ITALIKA AT125': 'MOTO ITALIKA AT125',
    'ITALIKA DM250': 'MOTO ITALIKA DM250',
    'MOTOCARRO': 'MOTOCARROS',
  };
  /** Igual con la carpeta donde se archiva el PDF (el tipo MOTOCARRO va a MOTOCARROS) */
  const NOMBRE_CARPETA = { 'MOTOCARRO': 'MOTOCARROS' };

  function ssId() {
    return Config.SPREADSHEET_IDS.VEHICULOS();
  }
  function hoja_() {
    return SheetUtils.getSheetByColumns(ssId(), COLUMNAS_CLAVE);
  }

  const limpiar_ = (v) => String(v == null ? '' : v).trim();
  const fechaISO_ = (valor) => HojaServicio.fechaISO(valor);

  /** "84.50%", 0.845 o 84.5 → 84.5 sin redondear, o null si no es un número */
  function enCien_(valor) {
    const texto = limpiar_(valor);
    if (!texto) return null;
    const n = Number(texto.replace('%', '').replace(/,/g, ''));
    if (isNaN(n)) return null;
    // Sin el símbolo, AppSheet guarda la fracción (0.845); con él, el número ya es 84.5
    return texto.indexOf('%') === -1 && n <= 1 ? n * 100 : n;
  }

  /** "84.50%" o 0.845 → 84.5 (número, para poder ordenar y promediar en la tabla) */
  function porcentaje_(valor) {
    const n = enCien_(valor);
    return n === null ? '' : Math.round(n * 10) / 10;
  }

  /** "84.50%" o 0.845 → "84.50%": como se escribe en la hoja y se ve al exportar (27-oct: salía en decimal) */
  function porcentajeTexto_(valor) {
    const n = enCien_(valor);
    return n === null ? valor : n.toFixed(2) + '%';
  }

  /** Las 13 columnas de calificación: el total y una por sección */
  const COLUMNAS_CALIFICACION = () => ['PUNTAJE FINAL INSPECCION'].concat(COLUMNAS_PUNTUACION.map((p) => p[0]));

  /**
   * Lo más que podía sacar esa unidad (27-oct): la suma de los pesos de las secciones con algo evaluado. Una sección
   * toda N/A vale 0 y su peso no se gana, así que 79% de 90% no es lo mismo que 79% de 100%. Solo lo escribe la app:
   * las de AppSheet no lo tienen. La crea registrar() la primera vez (la hoja de prod no la trae).
   */
  const COL_MAXIMO = 'PUNTAJE MAXIMO';

  /** Agrega la columna al final si la hoja no la tiene (solo el encabezado; bajo el candado: dos a la vez no la duplican) */
  function asegurarColumna_(hoja, columna) {
    const tiene = () => SheetUtils.indiceDeColumnas(
      hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0], [columna])[columna] !== -1;
    if (tiene()) return;
    Candado.con(() => {
      if (!tiene()) hoja.getRange(1, hoja.getLastColumn() + 1).setValue(columna);
    });
  }

  /** Un renglón crudo con su calificación en porcentaje (copia: la caché es de todos y no se toca) */
  function conPorcentajes_(row) {
    if (!row) return row;
    const copia = Object.assign({}, row);
    COLUMNAS_CALIFICACION().concat(COL_MAXIMO).forEach((c) => { if (c in copia) copia[c] = porcentajeTexto_(copia[c]); });
    return copia;
  }

  /** Lee solo las columnas pedidas (no las 195) → [{columna: valor}] */
  function leerColumnas_(columnas) {
    // Agrupa las columnas en bloques: 3 lecturas en vez de una por columna
    const { filas: total, datos } = SheetUtils.leerColumnas(hoja_(), columnas);
    const filas = [];
    for (let i = 0; i < total; i++) {
      const fila = {};
      columnas.forEach((nombre) => { fila[nombre] = (datos[nombre][i] === undefined ? '' : datos[nombre][i]); });
      filas.push(fila);
    }
    return filas;
  }

  function desdeOriginal_(row) {
    return {
      ID: row[COL_ID],
      ID_VEHICULO: row['ID VEHICULO'] || '',
      NUCCO: row['NUCO'] || '',
      FOLIO: row['FOLIO'] || '',
      TIPO: row['TIPO'] || '',
      FECHA: fechaISO_(row['FECHA']),
      RESPONSABLE: row['RESPONSABLE'] || '',
      DEPARTAMENTO: row['DEPARTAMENTO'] || '',
      AREA: row['AREA'] || '',
      SEDE: row['SEDE'] || '',
      OFICINA: row['OFICINA / DESARROLLO'] || '',
      CONDUCTOR: row['CONDUCTOR'] || '',
      JEFE_DIRECTO: row['JEFE DIRECTO'] || '',
      VEHICULO: row['VEHICULO'] || '',
      SERIE: row['NO SERIE'] || '',
      MODELO: row['MODELO / AÑO'] || '',
      PLACAS: row['PLACAS'] || '',
      ULTIMO_SERVICIO: fechaISO_(row['FECHA ULTIMO SERVICIO']),
      HOLOGRAMA: row['HOLOGRAMA'] || '',
      COMBUSTIBLE: row['TIPO COMBUSTIBLE'] || '',
      VOLTAJE: row['VOLTAJE'] === '' ? '' : row['VOLTAJE'],
      OBSERVACIONES: row['OBSERVACIONES'] || '',
      INSPECTOR: row['NOMBRE INSPECTOR'] || '',
      PUNTAJE: porcentaje_(row['PUNTAJE FINAL INSPECCION']),
      PDF: row[COL_PDF] || '',
    };
  }

  /**
   * La hoja, para HojaServicio. La lista lee solo COLUMNAS_LISTA, no las 195: la hoja es pesada.
   * completo() sí la lee entera, a propósito (exportar).
   */
  const INSPECCIONES = {
    modulo: MODULO,
    nombre: 'la inspección',
    libro: ssId,
    hoja: TABLA,
    huella: COLUMNAS_CLAVE,
    id: COL_ID,
    columnas: COLUMNAS_LISTA,
    incluir: (r) => !!limpiar_(r[COL_ID]),
    fila: desdeOriginal_,
    orden: { campo: 'FECHA', desc: true },
  };

  /**
   * Una inspección completa: cabecera, llantas, puntuaciones por sección y el checklist
   * agrupado. Se lee la fila entera (195 columnas) solo cuando alguien abre el detalle.
   */
  function detalle(token, id) {
    Permisos.puedeLeer(token, MODULO);
    const hoja = hoja_();
    const encontrada = SheetUtils.findById(ssId(), hoja.getName(), id, COL_ID);
    if (!encontrada) throw new Error('No se encontró la inspección ' + id);
    const row = encontrada.data;

    const conValor = (pares) => pares
      .filter(([columna]) => limpiar_(row[columna]) !== '')
      .map(([columna, etiqueta]) => ({ campo: columna, etiqueta: etiqueta, valor: row[columna] }));

    // Lo que no es cabecera, ni imagen, ni puntuación, ni llanta: el checklist de piezas
    const conocidas = {};
    COLUMNAS_LISTA.concat(COL_MAXIMO, COLUMNAS_LLANTAS.map((p) => p[0]), COLUMNAS_PUNTUACION.map((p) => p[0]),
      COLUMNAS_IMAGEN.map((p) => p[0])).forEach((c) => { conocidas[c] = true; });

    const checklist = Object.keys(row)
      .filter((columna) => columna && !conocidas[columna] && limpiar_(row[columna]) !== '')
      .map((columna) => ({ pieza: columna, estado: limpiar_(row[columna]) }));

    return Object.assign(desdeOriginal_(row), {
      llantas: conValor(COLUMNAS_LLANTAS),
      puntuaciones: conValor(COLUMNAS_PUNTUACION).map((p) => ({
        campo: p.campo, etiqueta: p.etiqueta, valor: porcentaje_(p.valor),
      })),
      imagenes: conValor(COLUMNAS_IMAGEN),
      checklist: checklist,
      piezasRevisadas: checklist.length,
      conProblema: checklist.filter((c) => /^(MALO|REGULAR)$/i.test(c.estado)),
    });
  }

  /**
   * Abre el PDF del formato. La ruta guardada es relativa a la carpeta de formatos e
   * incluye la subcarpeta del tipo ("INSPECCIONES VEHICULARES/INSPECCIONES L200/….pdf").
   */
  function urlFormato(token, ruta) {
    Permisos.puedeLeer(token, MODULO);
    const url = DriveUtils.urlDeRutaProfunda(ruta, Config.DRIVE_FOLDERS.RAIZ());
    if (!url) throw new Error('No se encontró el archivo del formato en Drive: ' + ruta);
    return url;
  }

  /**
   * Carpeta desde la que se resuelve una ruta de imagen. Los dibujos en blanco del tipo
   * ("MODELOS INSPECCION/L200/…") se leen de DRIVE_FOLDERS.MODELOS; lo demás (diagramas
   * marcados, firmas) de la raíz, que es donde se escribe.
   */
  const raizDe_ = (ruta) => (/^MODELOS INSPECCION\//i.test(limpiar_(ruta))
    ? Config.DRIVE_FOLDERS.MODELOS()
    : Config.DRIVE_FOLDERS.RAIZ());

  /**
   * Imagen (diagrama o firma) para verla dentro del panel de detalle. Los diagramas
   * pueden venir de dos lados: marcados por el usuario ("INSPECCION VEHICULAR_Images/…")
   * o el dibujo en blanco del tipo ("MODELOS INSPECCION/L200/…").
   */
  function previsualizarImagen(token, ruta) {
    Permisos.puedeLeer(token, MODULO);
    const vista = DriveUtils.previsualizarRutaProfunda(ruta, raizDe_(ruta));
    if (!vista) throw new Error('No se encontró la imagen en Drive: ' + ruta);
    return vista;
  }

  // ---------- captura ----------
  /** Columna de la puntuación de cada sección (los títulos traen acentos; las columnas no) */
  function columnaPuntuacion_(titulo) {
    const objetivo = SheetUtils.normalizarEncabezado_(titulo);
    const par = COLUMNAS_PUNTUACION.find(([columna]) => {
      const resto = SheetUtils.normalizarEncabezado_(columna.replace('PUNTUACION_', ''));
      return resto === objetivo || resto.indexOf(objetivo) === 0 || objetivo.indexOf(resto) === 0;
    });
    return par ? par[0] : null;
  }

  /**
   * Id con la forma que ya usa la hoja: <año>_<nucco>_<consecutivo del año>.
   * Se respeta para que los documentos viejos y los nuevos se ordenen igual.
   */
  function nuevoId_(nucco) {
    const anio = new Date().getFullYear();
    const existentes = leerColumnas_([COL_ID]).map((r) => limpiar_(r[COL_ID]));
    const delAnio = existentes
      .map((id) => new RegExp('^' + anio + '_[^_]*_(\\d+)$').exec(id))
      .filter(Boolean)
      .map((m) => Number(m[1]));
    const siguiente = (delAnio.length ? Math.max.apply(null, delAnio) : 0) + 1;
    return anio + '_' + (limpiar_(nucco) || 'SN') + '_' + siguiente;
  }

  /** Datos del vehículo que se copian a la inspección (columna aquí → columna en VEHICULOS) */
  const DEL_VEHICULO = {
    'FOLIO': 'FOLIO',
    'NUCO': 'NUCCO',
    'RESPONSABLE': 'RESPONSABLE VEHICULO',
    'DEPARTAMENTO': 'DEPARTAMENTO',
    'SEDE': 'SEDE',
    'OFICINA / DESARROLLO': 'OFICINA / DESARROLLO',   // en VEHICULOS se llamaba UBICACION (limpieza #23)
    'VEHICULO': 'LINEA VEHICULO',
    'NO SERIE': 'SERIE VEHICULO',
    'MODELO / AÑO': 'MODELO',
    'PLACAS': 'PLACA',
    'TIPO COMBUSTIBLE': 'TIPO DE COMBUSTIBLE',
  };

  /** Caja de las firmas en el PDF: la misma de los formatos de AppSheet (150 × 60 pt) */
  const FIRMA_PDF = { ancho: 150, alto: 60 };

  /**
   * El PDF sale como lo imprimía AppSheet, que es el que todos conocen: en Arial y con sus
   * márgenes (medidos sobre un formato suyo: 20 pt a los lados, 27 arriba). Las plantillas
   * están en Century Gothic a 0.2"; exportadas así, las etiquetas largas se parten y una
   * sección se corta al pie de la primera hoja. Solo se ajusta la copia, no la plantilla.
   */
  const FORMATO_PDF = { fuente: 'Arial', margenes: { arriba: 27, abajo: 27, izquierda: 20, derecha: 20 } };

  /** Lo que captura el inspector además del checklist */
  const CAPTURADOS = {
    CONDUCTOR: 'CONDUCTOR',
    JEFE_DIRECTO: 'JEFE DIRECTO',
    AREA: 'AREA',
    ULTIMO_SERVICIO: 'FECHA ULTIMO SERVICIO',
    HOLOGRAMA: 'HOLOGRAMA',
    VOLTAJE: 'VOLTAJE',
    OBSERVACIONES: 'OBSERVACIONES',
    INSPECTOR: 'NOMBRE INSPECTOR',
  };

  /**
   * Guarda una inspección: escribe la fila, sube las imágenes y genera el PDF del formato.
   *
   * @param {Object} p
   * @param {string} p.ID_VEHICULO vehículo (de ahí se copian sus datos); p.FOLIO solo de una página vieja
   * @param {string} p.TIPO        tipo de unidad: decide checklist, plantilla y carpeta
   * @param {Object} p.checklist   { 'PIEZA': 'BUENO' }
   * @param {Object} p.llantas     { 'LLANTA DD': 7 }
   * @param {Object} [p.imagenes]  { 'INS FRONTAL': {base64, mimeType}, 'FIRMA INSPECTOR': {…} }
   * @param {Array} [p.PENDIENTES] [{asunto, familia, prioridad}] -- lo que el inspector dice que hay
   *   que subir a Help Desk (PendientesInspeccionService.agregar); se ignoran los sin asunto
   * @return {{ID, puntaje, pdf, url}}
   */
  function registrar(token, p, imagenes) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const porId = limpiar_(p && p.ID_VEHICULO);
    const folio = porId || limpiar_(p && p.FOLIO);
    if (!folio) throw new Error('Elige el vehículo');

    const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', folio, porId ? 'ID' : 'FOLIO');
    if (!vehiculo) throw new Error('No existe el vehículo ' + folio);

    const estructura = estructuraDeTipo(token, p.TIPO);
    const checklist = p.checklist || {};
    const puntaje = puntajeDe_(estructura, checklist, p.VOLTAJE, p.llantas);
    if (!puntaje.evaluadas) throw new Error('Responde al menos una pieza del checklist antes de guardar');

    const id = nuevoId_(vehiculo.data['NUCCO']);
    const ahora = new Date();

    // ---- la fila ----
    // 'ID VEHICULO' es la llave foránea. DEL_VEHICULO se queda como está: copia 11 columnas
    // al crear, mientras el MAPA de Relaciones solo vigila 4 para deriva (es bitácora, así
    // que reporta y no corrige). Son dos listas con propósitos distintos, no una duplicada.
    const idVehiculo = vehiculo.data['ID'];
    if (!idVehiculo) {
      throw new Error('El vehículo con folio ' + folio + ' no tiene ID. Corre el pipeline ' +
        'de IDs sobre este libro antes de registrar inspecciones.');
    }
    const fila = {
      [COL_ID]: id, 'TIPO': estructura.tipo, 'FECHA': ahora, 'ID VEHICULO': idVehiculo,
    };
    Object.keys(DEL_VEHICULO).forEach((destino) => {
      const valor = vehiculo.data[DEL_VEHICULO[destino]];
      fila[destino] = valor === undefined || valor === null ? '' : valor;
    });
    Object.keys(CAPTURADOS).forEach((campo) => {
      if (p[campo] !== undefined) fila[CAPTURADOS[campo]] = p[campo];
    });
    // El <input type="date"> manda "2026-09-14": como texto no se ordena ni se filtra como
    // fecha, y las demás filas tienen fecha real. Se guarda como Date.
    const servicio = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpiar_(p.ULTIMO_SERVICIO));
    if (servicio) fila['FECHA ULTIMO SERVICIO'] = new Date(+servicio[1], +servicio[2] - 1, +servicio[3]);
    if (!limpiar_(fila['NOMBRE INSPECTOR'])) fila['NOMBRE INSPECTOR'] = sesion.nombre;

    // Solo las piezas que ese tipo de unidad pide: si el cliente manda de más, se ignoran
    estructura.secciones.forEach((s) => s.campos.forEach((c) => {
      if (checklist[c.campo] !== undefined) fila[c.campo] = checklist[c.campo];
    }));
    estructura.llantas.forEach((l) => {
      if (p.llantas && p.llantas[l.campo] !== undefined) fila[l.campo] = p.llantas[l.campo];
    });
    puntaje.secciones.forEach((s) => {
      const columna = columnaPuntuacion_(s.titulo);
      // Igual que el total ("8.33%", no 0.0833): la hoja lo guarda como porcentaje (27-oct)
      if (columna) fila[columna] = (s.valor * 100).toFixed(2) + '%';
    });
    fila['PUNTAJE FINAL INSPECCION'] = puntaje.final.toFixed(2) + '%';
    fila[COL_MAXIMO] = puntaje.maximo.toFixed(2) + '%';

    // ---- dónde: el expediente del NUCO (12-oct-2026) ----
    // 4.-INSPECCIONES/<año>/<N> TRIMESTRE con su PDF (INSPECCION-0088 2026-10-12.pdf) y, en FIRMAS Y DIAGRAMAS, lo
    // que se dibujó o firmó; la hoja guarda las ligas. Un vehículo sin NUCCO usa las carpetas de antes (rutas).
    const nucco = vehiculo.data['NUCCO'];
    const enNuco = ExpedienteNuco.tieneNuco(nucco);
    let carpetaInsp = null;
    let carpetaFirmas = null;
    const carpetaInspeccion_ = () => (carpetaInsp = carpetaInsp || ExpedienteNuco.carpetaInspeccion(nucco, ahora));
    const carpetaFirmas_ = () => (carpetaFirmas = carpetaFirmas ||
      ExpedienteNuco.subcarpeta(carpetaInspeccion_(), ExpedienteNuco.FIRMAS_Y_DIAGRAMAS));

    // ---- imágenes (diagramas y firmas) ----
    const subidas = [];
    const paraPdf = {};
    const sinDibujo = [];   // diagramas en blanco que no están en Drive
    let pendientes = [];    // lo que el inspector dijo que hay que subir a Help Desk (si hubo)
    try {
      COLUMNAS_IMAGEN.forEach(([columna]) => {
        const imagen = (imagenes || {})[columna];
        if (imagen && imagen.base64 && enNuco) {
          const revisado = DriveUtils.blobRevisado(imagen, ['image/png', 'image/jpeg'], 'la imagen de ' + columna);
          const archivo = ExpedienteNuco.guardar(revisado.blob, carpetaFirmas_(), columna, nucco, ahora, revisado.extension);
          subidas.push(archivo.getId());
          fila[columna] = archivo.getUrl();
          paraPdf[columna] = /^FIRMA /.test(columna) ? Object.assign({}, imagen, FIRMA_PDF) : imagen;
          return;
        }
        if (imagen && imagen.base64) {
          const guardada = DriveUtils.guardarArchivoAppSheet({
            carpetaId: Config.DRIVE_FOLDERS.INSPECCIONES_IMAGENES(),
            carpetaRelativa: TABLA + '_Images',
            idFila: id,
            columna: columna,
            archivo: imagen,
            permitidos: ['image/png', 'image/jpeg'],
            etiqueta: 'la imagen de ' + columna,
          });
          subidas.push(guardada.fileId);
          fila[columna] = guardada.ruta;
          paraPdf[columna] = /^FIRMA /.test(columna) ? Object.assign({}, imagen, FIRMA_PDF) : imagen;
          return;
        }
        // Sin marcar: se guarda el diagrama en blanco del tipo, igual que hacía AppSheet
        const diagrama = estructura.diagramas.find((d) => d.campo === columna);
        if (diagrama) {
          fila[columna] = diagrama.ruta;
          const archivo = DriveUtils.archivoDeRutaProfunda(diagrama.ruta, raizDe_(diagrama.ruta));
          if (archivo) paraPdf[columna] = { blob: archivo.getBlob() };
          else sinDibujo.push(diagrama.etiqueta + ' (' + diagrama.ruta + ')');
        }
      });

      // ID PERSONA de la persona capturada, calculado de su nombre (CapitalHumano.LIGAS)
      if (typeof CapitalHumano !== 'undefined') CapitalHumano.conPersona('INSPECCION VEHICULAR', fila, fila);
      const hoja = hoja_();
      asegurarColumna_(hoja, COL_MAXIMO);
      SheetUtils.insert(ssId(), hoja.getName(), fila);   // aquí nace fila['ID'] (prefijo INS), aparte del folio en COL_ID
      // Los MISMOS correos validados que recibieron el aviso original (no los de Capital Humano):
      // así el recordatorio de un pendiente le llega exactamente a quien ya se avisó -- responsable
      // y copia -- aunque el inspector lo haya corregido a mano al capturar.
      // El ID que antepone el folio al asunto es fila['ID'] (INS-xxxxx, único de verdad), NO el
      // folio de negocio en COL_ID (2026_649_314): dos inspecciones de un mismo vehículo el mismo
      // año pueden mezclarse en el folio, nunca en el ID.
      const dest = destinatariosNotificar_(p.NOTIFICAR);
      pendientes = PendientesInspeccionService.agregar(fila, fila['ID'], p.PENDIENTES, dest.para, dest.cc);
    } catch (err) {
      subidas.forEach((fileId) => DriveUtils.eliminar(fileId));   // no dejar imágenes huérfanas
      throw err;
    }

    // ---- el PDF del formato ----
    let pdf = null;
    try {
      pdf = PdfService.generar({
        plantillaId: estructura.plantillaId,
        // Una imagen que no llegó deja su marcador vacío: si no, el PDF imprimiría la ruta
        // del archivo ("MODELOS INSPECCION/HONDA 150XR/IZQUIERDA.png") en lugar del dibujo
        datos: Object.assign({}, fila, COLUMNAS_IMAGEN.reduce((vacias, [columna]) => {
          if (!paraPdf[columna]) vacias[columna] = '';
          return vacias;
        }, {})),
        imagenes: paraPdf,
        formato: FORMATO_PDF,
        carpetaId: enNuco ? carpetaInspeccion_().getId() : Config.DRIVE_FOLDERS.REPORTES(),
        subcarpeta: enNuco ? undefined : estructura.carpeta,
        nombre: enNuco
          ? ExpedienteNuco.nombreConFecha(carpetaInspeccion_(), 'INSPECCION', nucco, '.pdf', ahora).replace(/\.pdf$/, '')
          : PdfService.nombreArchivo(['INSPECCION', fila['RESPONSABLE'], fila['PLACAS'], PdfService.fechaParaNombre(ahora)]),
      });
      if (enNuco) ExpedienteNuco.olvidar(nucco);
      SheetUtils.update(ssId(), hoja_().getName(), id,
        { [COL_PDF]: enNuco ? pdf.url
          : estructura.carpeta ? 'INSPECCIONES VEHICULARES/' + estructura.carpeta + '/' + pdf.nombre : pdf.nombre },
        COL_ID);
    } catch (err) {
      // La inspección ya quedó guardada: el PDF se puede volver a generar, así que no se
      // pierde la captura por esto — pero hay que decirlo, no callarlo
      return {
        ID: id,
        puntaje: puntaje.final,
        pdf: null,
        aviso: 'La inspección se guardó, pero no se pudo generar el PDF: ' + err.message,
        correo: avisarInspeccion_(p.NOTIFICAR, fila, p.HALLAZGOS, null, pendientes),
      };
    }

    return {
      ID: id, puntaje: puntaje.final, pdf: pdf.url, sinResolver: pdf.sinResolver,
      advertencia: sinDibujo.length
        ? 'El PDF salió sin estos dibujos porque no están en Drive: ' + sinDibujo.join(', ') +
          '. Súbelos a esa ruta para que aparezcan en las siguientes inspecciones.'
        : '',
      correo: avisarInspeccion_(p.NOTIFICAR, fila, p.HALLAZGOS, pdf.url, pendientes),
    };
  }

  /**
   * El blob de una imagen YA guardada (firma o diagrama), para volver a armar el PDF sin que el
   * cliente tenga que reenviarla -- actualizar() no toca firmas ni diagramas, así que para
   * regenerar el PDF hay que releer de Drive lo que ya está en la fila. `valor` es lo que guarda
   * la columna: una URL completa (expediente del NUCO, ExpedienteNuco.guardar) o una ruta relativa
   * (legado sin NUCCO, o el dibujo en blanco del tipo). Mismo patrón que extraerIdDrive_ de
   * ArqueosService.gs (generarLigaArqueo). null si no hay nada guardado o no se pudo leer.
   */
  function blobDeImagenGuardada_(valor) {
    const v = limpiar_(valor);
    if (!v) return null;
    try {
      if (/^https?:/i.test(v)) {
        const m = v.match(/\/d\/([a-zA-Z0-9_-]+)/) || v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        return m ? DriveApp.getFileById(m[1]).getBlob() : null;
      }
      const archivo = DriveUtils.archivoDeRutaProfunda(v, raizDe_(v));
      return archivo ? archivo.getBlob() : null;
    } catch (e) { return null; }   // mejor esfuerzo: el PDF sale sin esa imagen, no truena la edición
  }

  /**
   * Edita una inspección ya guardada: checklist, llantas, voltaje y los datos de encabezado que
   * captura el inspector (conductor, jefe directo, holograma, fecha de último servicio,
   * observaciones). A propósito NO toca firmas ni diagramas (se quedan tal como se firmaron/
   * dibujaron la primera vez) ni manda el aviso por correo (eso solo pasa al registrar). El PDF SÍ
   * se regenera, con las imágenes que ya estaban guardadas (ver blobDeImagenGuardada_).
   *
   * @param {Object} p   mismas llaves que registrar() acepta en CAPTURADOS, más `checklist` y
   *   `llantas` -- lo que no venga se queda con el valor que ya tenía la fila.
   * @return {{ID, puntaje, pdf}}
   */
  function actualizar(token, id, p) {
    Permisos.puedeEditar(token, MODULO);
    const datos = Candado.con(() => {
      const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, COL_ID);
      if (!encontrado) throw new Error('No se encontró la inspección ' + id);
      const actual = encontrado.data;
      const estructura = estructuraDeTipo(token, actual['TIPO']);

      // Lo que ya estaba + lo que mandó el cliente: calcularPuntaje_ necesita el checklist
      // COMPLETO, no solo lo que cambió.
      const checklist = {};
      estructura.secciones.forEach((s) => s.campos.forEach((c) => {
        checklist[c.campo] = (p.checklist && p.checklist[c.campo] !== undefined) ? p.checklist[c.campo] : actual[c.campo];
      }));
      const llantas = {};
      estructura.llantas.forEach((l) => {
        llantas[l.campo] = (p.llantas && p.llantas[l.campo] !== undefined) ? p.llantas[l.campo] : actual[l.campo];
      });
      const voltaje = p.VOLTAJE !== undefined ? p.VOLTAJE : actual['VOLTAJE'];
      const puntaje = puntajeDe_(estructura, checklist, voltaje, llantas);
      if (!puntaje.evaluadas) throw new Error('Responde al menos una pieza del checklist antes de guardar');

      const cambios = {};
      // Solo estos CAPTURADOS son editables -- sin INSPECTOR: quién inspeccionó no cambia después.
      ['CONDUCTOR', 'JEFE_DIRECTO', 'AREA', 'HOLOGRAMA', 'VOLTAJE', 'OBSERVACIONES'].forEach((campo) => {
        if (p[campo] !== undefined) cambios[CAPTURADOS[campo]] = p[campo];
      });
      const servicio = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpiar_(p.ULTIMO_SERVICIO));
      if (servicio) cambios['FECHA ULTIMO SERVICIO'] = new Date(+servicio[1], +servicio[2] - 1, +servicio[3]);

      // Solo las piezas que ese tipo pide (si el cliente manda de más, se ignoran -- igual que registrar)
      estructura.secciones.forEach((s) => s.campos.forEach((c) => {
        if (p.checklist && p.checklist[c.campo] !== undefined) cambios[c.campo] = p.checklist[c.campo];
      }));
      estructura.llantas.forEach((l) => {
        if (p.llantas && p.llantas[l.campo] !== undefined) cambios[l.campo] = p.llantas[l.campo];
      });
      puntaje.secciones.forEach((s) => {
        const columna = columnaPuntuacion_(s.titulo);
        if (columna) cambios[columna] = (s.valor * 100).toFixed(2) + '%';
      });
      cambios['PUNTAJE FINAL INSPECCION'] = puntaje.final.toFixed(2) + '%';
      cambios[COL_MAXIMO] = puntaje.maximo.toFixed(2) + '%';

      const registro = SheetUtils.update(ssId(), hoja_().getName(), id, cambios, COL_ID);
      return { registro: registro, estructura: estructura, puntaje: puntaje };
    });

    // ---- el PDF, fuera del candado (como registrar(): copiar/llenar/exportar tarda) ----
    const fila = datos.registro;
    const estructura = datos.estructura;
    const paraPdf = {};
    COLUMNAS_IMAGEN.forEach(([columna]) => {
      const blob = blobDeImagenGuardada_(fila[columna]);
      if (blob) paraPdf[columna] = /^FIRMA /.test(columna) ? Object.assign({ blob: blob }, FIRMA_PDF) : { blob: blob };
    });
    const nucco = fila['NUCO'];
    const enNuco = ExpedienteNuco.tieneNuco(nucco);
    try {
      const pdf = PdfService.generar({
        plantillaId: estructura.plantillaId,
        datos: Object.assign({}, fila, COLUMNAS_IMAGEN.reduce((vacias, [columna]) => {
          if (!paraPdf[columna]) vacias[columna] = '';
          return vacias;
        }, {})),
        imagenes: paraPdf,
        formato: FORMATO_PDF,
        carpetaId: enNuco ? ExpedienteNuco.carpetaInspeccion(nucco, fila['FECHA']).getId() : Config.DRIVE_FOLDERS.REPORTES(),
        subcarpeta: enNuco ? undefined : estructura.carpeta,
        nombre: (fila[COL_PDF] || '').replace(/^.*\//, '').replace(/\.pdf$/i, '') ||
          PdfService.nombreArchivo(['INSPECCION', fila['RESPONSABLE'], fila['PLACAS'], PdfService.fechaParaNombre(new Date())]),
      });
      if (enNuco) ExpedienteNuco.olvidar(nucco);
      SheetUtils.update(ssId(), hoja_().getName(), id,
        { [COL_PDF]: enNuco ? pdf.url
          : estructura.carpeta ? 'INSPECCIONES VEHICULARES/' + estructura.carpeta + '/' + pdf.nombre : pdf.nombre },
        COL_ID);
      return { ID: id, puntaje: datos.puntaje.final, pdf: pdf.url };
    } catch (err) {
      return { ID: id, puntaje: datos.puntaje.final, pdf: null,
        aviso: 'Se guardaron los cambios, pero no se pudo regenerar el PDF: ' + err.message };
    }
  }

  // ---------- aviso por correo ----------
  /** Suficiente para no mandar correos basura; no hace falta validar contra el RFC completo */
  function correoValido_(correo) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(limpiar_(correo));
  }

  function escaparHtml_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /**
   * Separa lo que el inspector capturó en NOTIFICAR en "para" (el responsable, si su correo es
   * válido) y "cc" (inspector + asistente + otros, validados, sin duplicar al responsable). La usan
   * avisarInspeccion_ (el aviso original) y registrar() (para guardarlos en PendientesInspeccionService
   * y que el recordatorio le llegue a la MISMA gente que ya se avisó).
   * @param {Object} notificar  { responsable, inspector, asistente, otros: [] } -- puede venir undefined
   * @return {{para: string, cc: Array<string>}}
   */
  function destinatariosNotificar_(notificar) {
    if (!notificar) return { para: '', cc: [] };
    const para = correoValido_(notificar.responsable) ? limpiar_(notificar.responsable) : '';
    const cc = Array.from(new Set([notificar.inspector, notificar.asistente].concat(notificar.otros || [])
      .map(limpiar_)
      .filter((c) => c && correoValido_(c) && c.toLowerCase() !== para.toLowerCase())));
    return { para: para, cc: cc };
  }

  /**
   * El aviso que arma el inspector en el paso "Revisar y firmar": nunca bloquea el guardado
   * de la inspección, un fallo aquí solo queda en lo que regresa `registrar` (igual que el
   * aviso de diagramas faltantes). Los correos no se guardan en la hoja: son solo para
   * mandar este aviso, no quedan como dato de la inspección.
   * @param {Object} notificar  { responsable, inspector, asistente, otros: [] } -- puede venir undefined
   * @param {Object} fila       la fila ya armada de la inspección (vehículo, puntaje, observaciones…)
   * @param {Array} hallazgos   [{pieza, estado, seccion}], lo mismo que ya vio el inspector en "Revisar"
   * @param {string|null} pdfUrl
   * @param {Array} [pendientes] los pendientes de Help Desk que ya se dieron de alta (PendientesInspeccionService.agregar):
   *   van en su propia sección de color -- el responsable los sube como ticket con la MISMA familia
   */
  function avisarInspeccion_(notificar, fila, hallazgos, pdfUrl, pendientes) {
    if (!notificar) return { enviado: false, motivo: 'No se capturó ningún correo' };
    const dest = destinatariosNotificar_(notificar);
    const para = dest.para;
    const cc = dest.cc;
    let destinatario = para;
    let copia = cc;
    if (!destinatario) {
      if (!cc.length) return { enviado: false, motivo: 'No se capturó ningún correo válido' };
      destinatario = cc[0];
      copia = cc.slice(1);
    }

    const dato = (etiqueta, valor) => (valor
      ? '<tr><td style="padding:3px 14px 3px 0;color:#666">' + etiqueta + '</td><td><b>' + escaparHtml_(valor) + '</b></td></tr>'
      : '');
    const listaHallazgos = (hallazgos || []).length
      ? '<ul style="margin:4px 0 0;padding-left:18px">' + hallazgos.map((h) =>
          '<li>' + escaparHtml_(h.pieza) + (h.seccion ? ' <span style="color:#888">(' + escaparHtml_(h.seccion) + ')</span>' : '') +
          ': <b>' + escaparHtml_(h.estado) + '</b></li>').join('') + '</ul>'
      : '<p style="margin:4px 0 0">Ninguno: todo lo revisado salió bien.</p>';

    // Sección de color propia (ámbar): lo que el inspector dijo que hay que subir a Help Desk.
    // El ASUNTO ya trae el folio de esta inspección al frente (PendientesInspeccionService.agregar):
    // usar ese mismo texto como asunto del ticket es lo que hace que el sistema lo detecte solo.
    const seccionPendientes = (pendientes || []).length
      ? '<div style="margin-top:16px;padding:10px 14px;background:#fff4e5;border:1px solid #f0b429;border-radius:6px">' +
        '<h3 style="font-size:15px;margin:0 0 6px;color:#92400e">Tickets por generar en Help Desk</h3>' +
        '<p style="margin:0 0 10px;font-size:13px;color:#78350f">Registra cada pendiente como un ticket en Help Desk, ' +
        'utilizando exactamente el texto del campo "Asunto", ya que incluye el folio de la inspección correspondiente. ' +
        'De esta manera, el sistema podrá identificarlo automáticamente, sin necesidad de realizar búsquedas manuales.</p>' +
        pendientes.map((pe) =>
          '<div style="margin:0 0 8px;padding:8px 10px;background:#fff;border:1px solid #f0b429;border-radius:4px">' +
          '<div style="margin:0 0 3px"><span style="color:#92400e">Asunto:</span> <code>' + escaparHtml_(pe['ASUNTO']) + '</code></div>' +
          '<div style="margin:0 0 3px"><span style="color:#92400e">Familia o grupo a reportar:</span> ' +
            escaparHtml_(pe['FAMILIA O GRUPO A REPORTAR']) + '</div>' +
          '<div><span style="color:#92400e">Prioridad:</span> <b>' + escaparHtml_(pe['PRIORIDAD']) + '</b></div>' +
          '</div>').join('') + '</div>'
      : '';

    const fechaInspeccion = Utilities.formatDate(fila['FECHA'], Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const asunto = 'INSPECCION: ' +
      [fila['NUCO'], fila['DEPARTAMENTO'], fila['TIPO'], fila['NO SERIE']].filter(Boolean).join('-') + ' ' + fechaInspeccion;
    const cuerpo = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:560px">' +
      '<h2 style="margin:0 0 12px;font-size:18px">Inspección vehicular</h2>' +
      '<table style="border-collapse:collapse">' +
        dato('Vehículo', fila['VEHICULO']) + dato('Placas', fila['PLACAS']) + dato('Folio', fila['FOLIO']) +
        dato('Fecha', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')) +
        dato('Inspector', fila['NOMBRE INSPECTOR']) + dato('Puntaje final', fila['PUNTAJE FINAL INSPECCION']) +
      '</table>' +
      (fila['OBSERVACIONES'] ? '<p><b>Observaciones:</b> ' + escaparHtml_(fila['OBSERVACIONES']) + '</p>' : '') +
      '<h3 style="font-size:15px;margin:16px 0 0">Piezas con hallazgo (REGULAR o MALO)</h3>' + listaHallazgos +
      seccionPendientes +
      (pdfUrl ? '<p style="margin-top:16px"><a href="' + pdfUrl + '">Ver el formato en PDF</a></p>' : '') +
      '</div>';

    try {
      MailApp.sendEmail({ to: destinatario, cc: copia.join(','), subject: asunto, htmlBody: cuerpo });
      return { enviado: true, para: destinatario, cc: copia };
    } catch (err) {
      return { enviado: false, motivo: 'No se pudo mandar el correo: ' + err.message };
    }
  }

  /**
   * Calificación del voltaje de la batería, según el semáforo del formulario de captura
   * (mismo umbral que la imagen junto al campo Voltaje): <11.6V peligro, 11.6-12.8V
   * revisión, >12.8V óptimo. Se expresa en las mismas categorías BUENO/REGULAR/MALO que
   * ya entiende valorDeRespuesta_, para que cuente como una pieza más (decisión 2-oct:
   * entra dentro de la sección "Batería" ya existente, junto a sarro/derrame/batería
   * inflada -- no se le da un peso propio).
   * @return {string|null} null si no se capturó voltaje (no cuenta, ni a favor ni en contra)
   */
  function calificacionVoltaje_(voltaje) {
    const v = Number(voltaje);
    if (voltaje === undefined || voltaje === null || voltaje === '' || isNaN(v)) return null;
    if (v < 11.6) return 'MALO';
    if (v > 12.8) return 'BUENO';
    return 'REGULAR';
  }

  /**
   * Calificación de UNA llanta, según el semáforo del formulario de captura (mismo umbral
   * que la imagen junto a "Profundidad de las llantas"): <=1.6mm peligro, 1.6-4mm
   * precaución, >4mm seguro. Mismo criterio que calificacionVoltaje_: entra dentro de la
   * sección "Neumáticos" ya existente, junto a rines/tapones/tuercas-birlos/alineación/
   * balanceo -- cada llanta medida cuenta como una pieza más, sin peso propio.
   * @return {string|null} null si no se capturó esa llanta (no cuenta, ni a favor ni en contra)
   */
  function calificacionLlanta_(mm) {
    const v = Number(mm);
    if (mm === undefined || mm === null || mm === '' || isNaN(v)) return null;
    if (v <= 1.6) return 'MALO';
    if (v > 4) return 'BUENO';
    return 'REGULAR';
  }

  /**
   * Las 13 columnas de calificación de la hoja a porcentaje (27-oct): las secciones se guardaban como fracción
   * (0.0833), el total como "84.50%" y lo de AppSheet en fracción. Deja la fracción como valor y el formato 0.00%,
   * que es como la hoja guarda un "84.50%". Una celda que no es número no se toca (se cuenta en raras).
   * @param {boolean} aplicar  false = solo contar
   */
  function puntajesAPorcentaje(aplicar) {
    const hoja = hoja_();
    const filas = Math.max(0, hoja.getLastRow() - 1);
    const indices = SheetUtils.indiceDeColumnas(
      hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0], COLUMNAS_CALIFICACION());
    const r = { filas: filas, columnas: 0, faltan: [], celdas: 0, cambian: 0, raras: 0 };
    COLUMNAS_CALIFICACION().forEach((columna) => {
      if (indices[columna] === -1) { r.faltan.push(columna); return; }
      r.columnas++;
      if (!filas) return;
      const rango = hoja.getRange(2, indices[columna] + 1, filas, 1);
      const valores = rango.getValues();
      const formatos = rango.getNumberFormats();
      let cambia = false;
      const nuevos = valores.map(([v], i) => {
        if (limpiar_(v) === '') return [v];
        r.celdas++;
        const n = enCien_(v);
        if (n === null) { r.raras++; return [v]; }
        const fraccion = Math.round(n * 100) / 10000;
        if (typeof v !== 'number' || Math.abs(v - fraccion) > 1e-9 || formatos[i][0] !== '0.00%') {
          r.cambian++;
          cambia = true;
        }
        return [fraccion];
      });
      if (aplicar && cambia) {
        rango.setValues(nuevos);
        rango.setNumberFormat('0.00%');
      }
    });
    if (aplicar && r.cambian) CacheHojas.tocarHoja(hoja);
    return r;
  }

  /**
   * El puntaje de unas respuestas con la estructura de su tipo: lo usan registrar() y puntajesMaximos() (las ya
   * guardadas, que traen las mismas respuestas en su renglón).
   */
  function puntajeDe_(estructura, checklist, voltaje, llantas) {
    // El voltaje de la batería cuenta en el puntaje como una pieza más de la sección
    // "Batería" -- seccionesParaPuntaje/checklistParaPuntaje son copias SOLO para esta
    // cuenta: estructura.secciones y checklist siguen intactos para la fila y el PDF (ahí
    // "VOLTAJE BATERIA" no es una columna real).
    const calificacionVoltaje = calificacionVoltaje_(voltaje);
    const calificacionesLlantas = {};
    estructura.llantas.forEach((l) => {
      const cal = calificacionLlanta_(llantas && llantas[l.campo]);
      if (cal !== null) calificacionesLlantas[l.campo] = cal;
    });
    const hayLlantas = Object.keys(calificacionesLlantas).length > 0;
    const seccionesParaPuntaje = estructura.secciones.map((s) => {
      if (s.titulo === 'Batería' && calificacionVoltaje !== null) {
        return Object.assign({}, s, { campos: s.campos.concat([{ campo: 'VOLTAJE BATERIA', opciones: ['BUENO', 'REGULAR', 'MALO'] }]) });
      }
      if (s.titulo === 'Neumáticos' && hayLlantas) {
        return Object.assign({}, s, { campos: s.campos.concat(Object.keys(calificacionesLlantas)
          .map((campo) => ({ campo: campo, opciones: ['BUENO', 'REGULAR', 'MALO'] }))) });
      }
      return s;
    });
    const checklistParaPuntaje = Object.assign({}, checklist,
      calificacionVoltaje !== null ? { 'VOLTAJE BATERIA': calificacionVoltaje } : {},
      calificacionesLlantas);
    return calcularPuntaje_(seccionesParaPuntaje, checklistParaPuntaje);
  }

  /**
   * PUNTAJE MAXIMO de las inspecciones ya guardadas (27-oct): sale de sus respuestas con la plantilla de su tipo, igual
   * que al guardar. Sirve también para las de AppSheet (no tienen puntuaciones, pero sí las respuestas). No toca las que
   * ya lo tienen ni ninguna otra columna.
   * @param {boolean} aplicar  false = solo contar
   */
  function puntajesMaximos(aplicar) {
    const hoja = hoja_();
    if (aplicar) asegurarColumna_(hoja, COL_MAXIMO);
    const datos = hoja.getDataRange().getValues();
    const encabezados = datos[0];
    const norm = SheetUtils.normalizarEncabezado_;
    const col = (nombre) => encabezados.findIndex((e) => norm(e) === norm(nombre));
    const iTipo = col('TIPO');
    const iMaximo = col(COL_MAXIMO);
    const estructuras = {};
    const r = { filas: datos.length - 1, calculadas: 0, yaTenian: 0, sinRespuestas: 0, sinTipo: 0, porMaximo: {}, errores: {} };
    const nuevos = datos.slice(1).map((row) => {
      const actual = iMaximo === -1 ? '' : row[iMaximo];
      if (limpiar_(actual) !== '') { r.yaTenian++; return [actual]; }
      const tipo = limpiar_(row[iTipo]);
      if (!tipo) { r.sinTipo++; return ['']; }
      if (!(tipo in estructuras)) {
        try { estructuras[tipo] = estructura_(tipo); } catch (err) { estructuras[tipo] = null; r.errores[tipo] = err.message; }
      }
      const estructura = estructuras[tipo];
      if (!estructura) return [''];
      const valor = {};
      encabezados.forEach((e, i) => { valor[norm(e)] = row[i]; });
      const deColumna = (campo) => valor[norm(campo)];
      const checklist = {};
      estructura.secciones.forEach((s) => s.campos.forEach((c) => { checklist[c.campo] = deColumna(c.campo); }));
      const llantas = {};
      estructura.llantas.forEach((l) => { llantas[l.campo] = deColumna(l.campo); });
      const puntaje = puntajeDe_(estructura, checklist, deColumna('VOLTAJE'), llantas);
      if (!puntaje.evaluadas) { r.sinRespuestas++; return ['']; }
      r.calculadas++;
      r.porMaximo[puntaje.maximo] = (r.porMaximo[puntaje.maximo] || 0) + 1;
      return [puntaje.maximo / 100];
    });
    if (aplicar && r.calculadas) {
      const columna = col(COL_MAXIMO) + 1;
      const rango = hoja.getRange(2, columna, nuevos.length, 1);
      rango.setValues(nuevos);
      rango.setNumberFormat('0.00%');
      CacheHojas.tocarHoja(hoja);
    }
    return r;
  }

  /**
   * Recalcula el PUNTAJE FINAL INSPECCION de las inspecciones ya guardadas con la fórmula corregida
   * (30-oct): el total ahora es relativo a lo aplicable, no sobre 100 fijo (ver calcularPuntaje_).
   * Se recalcula desde las respuestas crudas con la plantilla del tipo, igual que puntajesMaximos --
   * por eso correr esto más de una vez no vuelve a tocar lo que ya quedó bien: solo escribe donde el
   * recálculo da distinto de lo guardado (tolerancia de 0.01 puntos, por redondeo).
   * @param {boolean} aplicar  false = solo contar
   */
  function puntajesRelativos(aplicar) {
    const hoja = hoja_();
    const datos = hoja.getDataRange().getValues();
    const encabezados = datos[0];
    const norm = SheetUtils.normalizarEncabezado_;
    const col = (nombre) => encabezados.findIndex((e) => norm(e) === norm(nombre));
    const iTipo = col('TIPO');
    const iFinal = col('PUNTAJE FINAL INSPECCION');
    const estructuras = {};
    const r = { filas: datos.length - 1, corregidas: 0, yaCorrectas: 0, sinCalificar: 0, sinRespuestas: 0, sinTipo: 0, errores: {} };
    let huboCambios = false;
    const nuevos = datos.slice(1).map((row) => {
      const actual = iFinal === -1 ? '' : row[iFinal];
      if (limpiar_(actual) === '') { r.sinCalificar++; return [actual]; }
      const tipo = limpiar_(row[iTipo]);
      if (!tipo) { r.sinTipo++; return [actual]; }
      if (!(tipo in estructuras)) {
        try { estructuras[tipo] = estructura_(tipo); } catch (err) { estructuras[tipo] = null; r.errores[tipo] = err.message; }
      }
      const estructura = estructuras[tipo];
      if (!estructura) return [actual];
      const valor = {};
      encabezados.forEach((e, j) => { valor[norm(e)] = row[j]; });
      const deColumna = (campo) => valor[norm(campo)];
      const checklist = {};
      estructura.secciones.forEach((s) => s.campos.forEach((c) => { checklist[c.campo] = deColumna(c.campo); }));
      const llantas = {};
      estructura.llantas.forEach((l) => { llantas[l.campo] = deColumna(l.campo); });
      const puntaje = puntajeDe_(estructura, checklist, deColumna('VOLTAJE'), llantas);
      if (!puntaje.evaluadas) { r.sinRespuestas++; return [actual]; }
      const actualPorcentaje = enCien_(actual);
      if (actualPorcentaje !== null && Math.abs(actualPorcentaje - puntaje.final) < 0.01) { r.yaCorrectas++; return [actual]; }
      r.corregidas++;
      huboCambios = true;
      return [puntaje.final / 100];
    });
    if (aplicar && huboCambios) {
      const columna = iFinal + 1;
      const rango = hoja.getRange(2, columna, nuevos.length, 1);
      rango.setValues(nuevos);
      rango.setNumberFormat('0.00%');
      CacheHojas.tocarHoja(hoja);
    }
    return r;
  }

  // ---------- puntaje ----------
  /**
   * Cuánto suma cada respuesta.
   *
   * Regla (acordada 2026-09-17): BUENO 1 · REGULAR medio punto · MALO 0 · lo que no
   * aplica (N/A) no cuenta, ni a favor ni en contra. En las secciones cuyas piezas son
   * DEFECTOS —sarro en terminales, derrame, batería inflada— las opciones son SÍ/NO y
   * ahí lo bueno es NO.
   *
   * Se calcula así y no copiando la fórmula vieja de AppSheet porque aquella no se puede
   * reproducir: en los datos históricos hay inspecciones con las MISMAS respuestas y
   * puntajes distintos (contaba columnas que ni siquiera aplican a ese tipo de unidad).
   * @return {number|null} null = la respuesta no suma ni resta
   */
  function valorDeRespuesta_(estado, opciones) {
    const e = String(estado || '').trim().toUpperCase();
    const ops = (opciones || []).map((o) => String(o).trim().toUpperCase());
    if (ops.indexOf('SI') !== -1 && ops.indexOf('NO') !== -1) {
      return e === 'NO' ? 1 : (e === 'SI' ? 0 : null);
    }
    const valores = { 'BUENO': 1, 'REGULAR': 0.5, 'MALO': 0, 'PRESENTA': 1, 'NO PRESENTA': 0 };
    return valores[e] === undefined ? null : valores[e];
  }

  /**
   * Puntaje por sección y total, a partir del checklist capturado.
   * Cada sección vale su peso; el total es relativo a lo aplicable, no a 100 fijo (30-oct): una
   * sección entera N/A (p. ej. unas herramientas que esa unidad no carga) no resta su peso del
   * total, igual que ya no lo resta de `maximo` -- antes, el total SÍ se calculaba sobre 100 aunque
   * `maximo` dijera que lo más que se podía sacar era menos, y una unidad en buen estado salía con
   * una calificación baja y engañosa solo por tener secciones que no le aplican (usuario, 30-oct,
   * caso real: moto NUCO 395, 83.13% con un 90% de máximo real -- 92.37% de lo aplicable).
   *
   * @param {Array} secciones   las de la plantilla (ver Plantilla.seccionesDe)
   * @param {Object} respuestas { 'PIEZA': 'BUENO' }
   * @return {{secciones: Array, final: number, evaluadas: number}}
   */
  function calcularPuntaje_(secciones, respuestas) {
    const detalle = (secciones || []).map((s) => {
      let puntos = 0;
      let evaluadas = 0;
      s.campos.forEach((c) => {
        const valor = valorDeRespuesta_(respuestas[c.campo], c.opciones);
        if (valor === null) return;     // sin responder o N/A: fuera del cálculo
        puntos += valor;
        evaluadas++;
      });
      // Una sección sin nada que evaluar no arrastra el puntaje hacia abajo: vale 0 de 0,
      // y su peso simplemente no se gana (igual que en el formato de papel)
      const fraccion = evaluadas ? (s.peso / 100) * (puntos / evaluadas) : 0;
      return {
        titulo: s.titulo,
        peso: s.peso,
        evaluadas: evaluadas,
        puntos: Math.round(puntos * 100) / 100,
        valor: Math.round(fraccion * 10000) / 10000,
      };
    });

    const finalNominal = detalle.reduce((suma, s) => suma + s.valor, 0) * 100;
    const maximo = detalle.reduce((suma, s) => suma + (s.evaluadas ? s.peso : 0), 0);
    // Relativo a `maximo`, no a 100: lo que no aplica no cuenta en contra del total, solo en lo
    // que de verdad se evaluó. Sin nada evaluado (maximo = 0) el total es 0, no una división por cero.
    const final = maximo ? Math.round((finalNominal / maximo) * 10000) / 100 : 0;
    return {
      secciones: detalle,
      final: final,
      maximo: maximo,
      evaluadas: detalle.reduce((n, s) => n + s.evaluadas, 0),
    };
  }

  // ---------- configuración por tipo de unidad ----------
  /** Fila de MODELOS INSPECCION del tipo dado (ahí viven diagramas, plantilla y carpeta) */
  function configuracionDe_(tipo) {
    const buscado = SheetUtils.normalizarEncabezado_(tipo);
    const fila = SheetUtils.getAll(ssId(), HOJA_MODELOS)
      .find((f) => SheetUtils.normalizarEncabezado_(f['TIPO']) === buscado);
    if (!fila) {
      throw new Error(
        'El tipo de unidad "' + tipo + '" no está en la hoja ' + HOJA_MODELOS + '. ' +
        'Agrégalo ahí con sus diagramas y su plantilla.'
      );
    }
    return fila;
  }

  /** Nombre del documento de plantilla que le toca a un tipo */
  function nombrePlantilla_(tipo) {
    const clave = String(tipo || '').trim().toUpperCase();
    return 'FORMATO ' + (NOMBRE_PLANTILLA[clave] || clave);
  }

  /** Carpeta donde se archiva el PDF de ese tipo */
  function carpetaDe_(tipo, configuracion) {
    const escrita = limpiar_((configuracion || {})[COL_CARPETA]);
    if (escrita) return escrita;
    const clave = String(tipo || '').trim().toUpperCase();
    return 'INSPECCIONES ' + (NOMBRE_CARPETA[clave] || clave);
  }

  /**
   * Todo lo que el formulario necesita para capturar una inspección de ese tipo:
   * el checklist (secciones, piezas y opciones, sacados de la plantilla), los diagramas
   * en blanco y qué columnas de llanta aplican.
   *
   * Se guarda en caché 6 horas: leer el documento y analizarlo tarda, y estas plantillas
   * casi no cambian. Si se edita una, con vaciar la caché basta (ver olvidarTipo).
   */
  /**
   * Reagrupa a la fuerza las piezas de ciertos tipos en las secciones "correctas" --
   * Plantilla.seccionesDe arma las secciones en el orden en que el texto plano del
   * documento (DocumentApp.getBody().getText()) las va encontrando, y cuando una
   * sección se corta a la mitad por el acomodo a dos columnas de la página SIN
   * repetir su encabezado (pasa con "Sistemas interiores" y "Sistema mecánico"),
   * esa segunda mitad se le pega a la sección que el parser haya reconocido más
   * recientemente en el texto -- no a la suya real. Confirmado con Jorge contra el
   * PDF crudo de la plantilla de RAM 700 (2026-09-30): "Sistemas interiores" y
   * "Sistema mecánico" se parten así, y sus piezas de la segunda mitad terminaban
   * cayendo todas en "Niveles".
   *
   * Por tipo: el orden/peso correctos de cada sección, con el nombre EXACTO de cada
   * pieza tal como aparece en los marcadores <<IF([PIEZA]=...)>> de la plantilla (no
   * la etiqueta bonita del PDF renderizado) -- si se agrega otro tipo, hay que sacar
   * los nombres del PDF crudo de esa plantilla (Ctrl+A en el Doc, exportar a PDF, o
   * pedirlo tal cual), no adivinarlos.
   */
  const REAGRUPAR_SECCIONES = {
    'RAM 700': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'PUERTA TRASERA IZQUIERDA', 'PUERTA TRASERA DERECHA', 'BATEA / BETLINER', 'CABINA', 'REDILAS'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA PUERTA TRASERA DERECHA', 'CERRADURA PUERTA TRASERA IZQUIERDA', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'ASIENTOS TRASEROS2', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ASIENTOS TRASEROS', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO', 'TAPA PUERTA TRASERA DERECHA', 'TAPA PUERTA TRASERA IZQUIERDA'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    'AUTOS': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      // Sin Batea/Cabina/Redilas (eso es de pickup) -- en su lugar, Maletero.
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'PUERTA TRASERA IZQUIERDA', 'PUERTA TRASERA DERECHA', 'MALETERO'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA PUERTA TRASERA DERECHA', 'CERRADURA PUERTA TRASERA IZQUIERDA', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'ASIENTOS TRASEROS2', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ASIENTOS TRASEROS', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO', 'TAPA PUERTA TRASERA DERECHA', 'TAPA PUERTA TRASERA IZQUIERDA'] },
      // A diferencia de RAM 700, aquí sí trae "Limpiaparabrisas trasero" (16 piezas).
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'LIMPIAPARABRISAS TRASERO', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // RAM 4000 es de 2 puertas (sin puerta/asiento/tapa trasera) -- distinto a RAM 700
    // en Latonería, Cerraduras, Limpieza e Interiores; el resto de las secciones son
    // iguales. Confirmado contra el PDF crudo de su propia plantilla.
    'RAM 4000': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'BATEA / BETLINER', 'CABINA', 'REDILAS'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // SAVEIRO es de 2 puertas como RAM 4000 (sin puerta/asiento/tapa trasera), pero
    // SIN Redilas en Latonería (11 piezas en vez de 12) y con una pieza extra en
    // Sistemas interiores ("Botones volante") que ningún otro tipo tiene -- sin
    // Limpiaparabrisas trasero (16 piezas). Confirmado contra su propio PDF crudo.
    'SAVEIRO': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'BATEA / BETLINER', 'CABINA'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'BOTONES VOLANTE', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // PIPA no coincide con ningún tipo anterior: Latonería con puerta trasera +
    // Maletero (como AUTOS), pero Cerraduras trae "Cerradura tanque de combustible"
    // en vez de tapa batea/maletero, Interiores trae "Asientos traseros" sin tapas
    // de puerta trasera, y Sistemas interiores es igual al de SAVEIRO (con "Botones
    // volante", sin Limpiaparabrisas trasero). Confirmado contra su propio PDF crudo.
    'PIPA': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'PUERTA TRASERA IZQUIERDA', 'PUERTA TRASERA DERECHA', 'MALETERO'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA TANQUE COMBUSTIBLE'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ASIENTOS TRASEROS', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'BOTONES VOLANTE', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // L200 es una pickup de 4 puertas: Latonería/Cerraduras/Limpieza/Interiores
    // iguales a RAM 700 (con Redilas, 14 piezas en Latonería), pero su Sistemas
    // interiores trae "Botones volante" (como SAVEIRO/PIPA) en vez del listado de
    // RAM 700, y sin Limpiaparabrisas trasero. Confirmado contra su propio PDF crudo.
    'L200': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'PUERTA TRASERA IZQUIERDA', 'PUERTA TRASERA DERECHA', 'BATEA / BETLINER', 'CABINA', 'REDILAS'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA PUERTA TRASERA DERECHA', 'CERRADURA PUERTA TRASERA IZQUIERDA', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'ASIENTOS TRASEROS2', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ASIENTOS TRASEROS', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO', 'TAPA PUERTA TRASERA DERECHA', 'TAPA PUERTA TRASERA IZQUIERDA'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'BOTONES VOLANTE', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // URVAN es una van con una sola puerta corrediza trasera (derecha, sin
    // izquierda) -- Latonería/Cerraduras/Interiores no coinciden con ningún tipo
    // anterior por esa asimetría, pero su Limpieza y Sistemas interiores sí son
    // iguales a AUTOS (con Limpiaparabrisas trasero, sin Botones volante).
    // Confirmado contra su propio PDF crudo.
    'URVAN': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'PUERTA TRASERA DERECHA', 'MALETERO'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA PUERTA TRASERA DERECHA', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'ASIENTOS TRASEROS2', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ASIENTOS TRASEROS', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO', 'TAPA PUERTA TRASERA DERECHA'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'LIMPIAPARABRISAS TRASERO', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // NP300 ESTACA es una pickup de 2 puertas con Redilas: su Latonería (12 piezas)/
    // Cerraduras/Limpieza/Interiores son iguales a RAM 4000, pero su Sistemas
    // interiores trae "Botones volante" (como SAVEIRO) en vez del listado de RAM
    // 4000. Confirmado contra su propio PDF crudo.
    'NP300 ESTACA': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO', 'FAROS DELANTEROS', 'CALAVERAS TRASERAS'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['COFRE', 'FASCIA / PARRILLA / DEFENSA DELANTERA', 'FASCIA / DEFENSA TRASERA', 'GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA', 'GUARDAFANGO / SALPICADERA FRONTAL DERECHA', 'GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA', 'GUARDAFANGO / SALPICADERA POSTERIOR DERECHA', 'PUERTA PILOTO', 'PUERTA COPILOTO', 'BATEA / BETLINER', 'CABINA', 'REDILAS'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TAPONES', 'TUERCAS / BIRLOS', 'ALINEACION', 'BALANCEO'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLANTA DE REFACCION', 'GATO MECANICO', 'GATO HIDRAULICO', 'CRUCETA', 'MANERAL', 'EXTINTOR', 'CABLE PASACORRIENTE', 'TRIANGULOS DE SEÑALIZACION', 'TAPETES', 'CUBREASIENTOS', 'CUBREVOLANTE', 'BEDLINER', 'CUBREBATEA', 'PARASOL'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['CERRADURA PUERTA PILOTO', 'CERRADURA PUERTA COPILOTO', 'CERRADURA TAPA BATEA/MALETERO'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTOS DELANTEROS', 'CIELO Y ALFOMBRA', 'EXTERIOR DE UNIDAD', 'OTROS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO', 'ALFOMBRA', 'CIELO', 'TABLERO', 'CONSOLA CENTRAL', 'GUANTERA', 'MANIJAS INTERNAS', 'TAPA PUERTA PILOTO', 'TAPA PUERTA COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'LIMPIAPARABRISAS DELANTERO', 'BOTONES VOLANTE', 'SISTEMA MULTIMEDIA', 'CLAXON', 'AC / PERILLAS', 'LUCES INTERIORES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'SUSPENSION', 'AMORTIGUADORES', 'SOPORTES DE MOTOR', 'BANDAS', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'REFRIGERANTE', 'LIQUIDO FRENOS', 'LIQUIDO DE DIRECCION', 'LIQUIDO LIMPIAPARABRISAS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // MOTOCARRO MUEVETEC: estructura totalmente distinta a los formatos de auto/
    // pickup, pero tiene el mismo bug de fondo -- "Carburador", "Clutch" y "Cardan"
    // (con opción N/A) aparecen en el texto plano justo después del encabezado
    // "Niveles 10%" (que solo trae Aceite de motor/Liquido de frenos, sin N/A),
    // pero son piezas mecánicas de "Sistema mecánico" (igual que Bandas/Clutch/
    // Transmisión en los formatos de auto) -- se reagrupan ahí. Confirmado con
    // Jorge (2026-09-30) y contra su propio PDF crudo.
    'MOTOCARRO MUEVETEC': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['FAROS DELANTEROS', 'CALAVERAS TRASERAS', 'DIRECCIONALES', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['SALPICADERA DELANTERA', 'CARCASA MANUBRIO Y FARO', 'MANUBRIO', 'TAPA LATERAL DERECHA', 'TAPA LATERAL IZQUIERDA', 'POSAPIE DERECHO', 'POSAPIE IZQUIERDO', 'SALPICADERA DERECHA', 'SALPICADERA IZQUIERDA', 'BATEA / BETLINER', 'TAPA DE BATEA', 'DEFENSA TRASERA', 'CHASIS'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['GATO HIDRAULICO', 'CRUCETA', 'REFACCION'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['SWITCH', 'CERRADURA TAPON TANQUE GASOLINA'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTO', 'EXTERIOR DE UNIDAD'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TUERCAS/BIRLOS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'NIEBLEROS / OTROS', 'STOP', 'CLAXON', 'PUÑO ACELERADOR', 'DIRECCIONALES DERECHAS', 'INTERMITENTES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'AMORTIGUADORES DELANTEROS', 'AMORTIGUADOR TRASERO', 'SOPORTES DE MOTOR', 'CARBURADOR', 'CLUTCH', 'CARDAN'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'LIQUIDO FRENOS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // MOTOCARRO KINGWAY: casi idéntico a MOTOCARRO MUEVETEC (mismo bug de
    // Carburador/Clutch/Cardan pegados a Niveles), salvo que su Neumáticos trae
    // "Tapones" en vez de "Rines" -- no se puede alias directo. Confirmado contra
    // su propio PDF crudo.
    'MOTOCARRO KINGWAY': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['FAROS DELANTEROS', 'CALAVERAS TRASERAS', 'DIRECCIONALES', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['SALPICADERA DELANTERA', 'CARCASA MANUBRIO Y FARO', 'MANUBRIO', 'TAPA LATERAL DERECHA', 'TAPA LATERAL IZQUIERDA', 'POSAPIE DERECHO', 'POSAPIE IZQUIERDO', 'SALPICADERA DERECHA', 'SALPICADERA IZQUIERDA', 'BATEA / BETLINER', 'TAPA DE BATEA', 'DEFENSA TRASERA', 'CHASIS'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['GATO HIDRAULICO', 'CRUCETA', 'REFACCION'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['SWITCH', 'CERRADURA TAPON TANQUE GASOLINA'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTO', 'EXTERIOR DE UNIDAD'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['TAPONES', 'TUERCAS/BIRLOS'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'NIEBLEROS / OTROS', 'STOP', 'CLAXON', 'PUÑO ACELERADOR', 'DIRECCIONALES DERECHAS', 'INTERMITENTES'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'FRENO DE MANO', 'AMORTIGUADORES DELANTEROS', 'AMORTIGUADOR TRASERO', 'SOPORTES DE MOTOR', 'CARBURADOR', 'CLUTCH', 'CARDAN'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'LIQUIDO FRENOS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // ITALIKA DM250: mismo bug que MOTOCARRO MUEVETEC -- "Carburador", "Clutch" y
    // "Transmisión/cadena" (con N/A) aparecen en el texto plano justo después de
    // "Niveles 10%" (que solo trae Aceite de motor/Liquido de frenos, sin N/A),
    // pero son piezas mecánicas de "Sistema mecánico". Se reagrupan ahí. El campo
    // de "Posapies" usa el nombre interno [PASAPIES] (typo de la plantilla, no mío).
    // Confirmado contra su propio PDF crudo.
    'ITALIKA DM250': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['FAROS DELANTEROS', 'CALAVERAS TRASERAS', 'DIRECCIONALES', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['SALPICADERA DELANTERA', 'PROTECTORES / EMBELLECEDORES DE BARRAS', 'SALPICADERA TRASERA / GUARDAFANGO', 'PROTECTOR / CARCASA FARO', 'PROTECTOR / EMBELLECEDOR LADO DERECHO', 'PROTECTOR / EMBELLECEDOR LADO IZQUIERDO', 'SLIDER PROTECTOR DERECHO', 'SLIDER PROTECTOR IZQUIERDO', 'TAPA DERECHA', 'TAPA IZQUIERDA', 'ESCAPE', 'PASAPIES', 'MANUBRIO'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TUERCAS / BIRLOS'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLAVE CRUZ', 'DADO'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['SWITCH', 'CERRADURA TAPON TANQUE GASOLINA'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTO', 'EXTERIOR DE UNIDAD'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'CLAXON', 'PUÑO ACELERADOR'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'AMORTIGUADORES DELANTEROS', 'AMORTIGUADOR TRASERO', 'SOPORTES DE MOTOR', 'CARBURADOR', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'LIQUIDO FRENOS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
    // ITALIKA AT125: idéntico a ITALIKA DM250 pieza por pieza (mismo bug de
    // Carburador/Clutch/Transmisión pegados a Niveles), salvo que su Inventarios
    // trae una pieza extra ("Kit de herramientas") -- no se puede alias directo.
    // Confirmado contra su propio PDF crudo.
    'ITALIKA AT125': [
      { titulo: 'Documentación', peso: 5, piezas: ['GAFETTE', 'TARJETA CIRCULACION', 'LICENCIA', 'POLIZA SEGURO', 'VERIFICACION', 'KARDEX'] },
      { titulo: 'Cristalería', peso: 10, piezas: ['FAROS DELANTEROS', 'CALAVERAS TRASERAS', 'DIRECCIONALES', 'RETROVISOR IZQUIERDO', 'RETROVISOR DERECHO'] },
      { titulo: 'Latonería y pintura', peso: 5, piezas: ['SALPICADERA DELANTERA', 'PROTECTORES / EMBELLECEDORES DE BARRAS', 'SALPICADERA TRASERA / GUARDAFANGO', 'PROTECTOR / CARCASA FARO', 'PROTECTOR / EMBELLECEDOR LADO DERECHO', 'PROTECTOR / EMBELLECEDOR LADO IZQUIERDO', 'SLIDER PROTECTOR DERECHO', 'SLIDER PROTECTOR IZQUIERDO', 'TAPA DERECHA', 'TAPA IZQUIERDA', 'ESCAPE', 'PASAPIES', 'MANUBRIO'] },
      { titulo: 'Neumáticos', peso: 15, piezas: ['RINES', 'TUERCAS / BIRLOS'] },
      { titulo: 'Inventarios', peso: 10, piezas: ['LLAVE CRUZ', 'DADO', 'KIT HERRAMIENTAS'] },
      { titulo: 'Cerraduras', peso: 5, piezas: ['SWITCH', 'CERRADURA TAPON TANQUE GASOLINA'] },
      { titulo: 'Limpieza', peso: 5, piezas: ['ASIENTO', 'EXTERIOR DE UNIDAD'] },
      { titulo: 'Interiores', peso: 5, piezas: ['ASIENTO DE CONDUCTOR', 'ASIENTO DE COPILOTO'] },
      { titulo: 'Sistemas interiores', peso: 10, piezas: ['MANDOS / BOTONERA VIDRIOS Y SEGUROS', 'CLUSTER / TABLERO', 'LUCES ALTAS', 'LUCES BAJAS', 'CUARTOS', 'DIRECCIONALES IZQUIERDAS', 'DIRECCIONALES DERECHAS', 'INTERMITENTES', 'NIEBLEROS / OTROS', 'STOP', 'CLAXON', 'PUÑO ACELERADOR'] },
      { titulo: 'Sistema mecánico', peso: 15, piezas: ['FRENOS DELANTEROS', 'FRENOS TRASEROS', 'AMORTIGUADORES DELANTEROS', 'AMORTIGUADOR TRASERO', 'SOPORTES DE MOTOR', 'CARBURADOR', 'CLUTCH', 'TRANSMISION / CADENA'] },
      { titulo: 'Niveles', peso: 10, piezas: ['ACEITE MOTOR', 'LIQUIDO FRENOS'] },
      { titulo: 'Batería', peso: 5, piezas: ['TERMINALES CON SARRO', 'DERRAME LIQUIDO / MAL OLOR', 'BATERIA INFLADA'] },
    ],
  };
  // KWID usa el mismo formato que AUTOS, pieza por pieza (confirmado contra el PDF
  // crudo de ambas plantillas: mismo Maletero, mismo Limpiaparabrisas trasero, todo
  // igual) -- se le apunta a la misma tabla en vez de repetirla.
  REAGRUPAR_SECCIONES['KWID'] = REAGRUPAR_SECCIONES['AUTOS'];
  // RIFTER también es igual a AUTOS pieza por pieza (confirmado contra su PDF crudo:
  // Latonería con puertas traseras + Maletero, Cerraduras con tapa batea/maletero,
  // Limpieza con Asientos traseros2, Interiores con tapa de puerta trasera, y
  // Sistemas interiores con Limpiaparabrisas trasero -- las 16 piezas) -- mismo alias.
  REAGRUPAR_SECCIONES['RIFTER'] = REAGRUPAR_SECCIONES['AUTOS'];
  // XPANDER también es igual a AUTOS pieza por pieza (mismo patrón: Latonería con
  // puertas traseras + Maletero, Sistemas interiores con Limpiaparabrisas trasero y
  // sin Botones volante) -- confirmado contra su propio PDF crudo.
  REAGRUPAR_SECCIONES['XPANDER'] = REAGRUPAR_SECCIONES['AUTOS'];
  // NP300 CABINA REDILAS es igual a L200 pieza por pieza (misma Latonería con
  // Redilas, mismas Cerraduras/Limpieza/Interiores de 4 puertas, y el mismo
  // Sistemas interiores con "Botones volante") -- confirmado contra su PDF crudo.
  REAGRUPAR_SECCIONES['NP300 CABINA REDILAS'] = REAGRUPAR_SECCIONES['L200'];
  // HONDA 150XR es igual a ITALIKA DM250 pieza por pieza (mismo Inventarios de 2
  // piezas, sin "Kit de herramientas") -- confirmado contra su propio PDF crudo.
  REAGRUPAR_SECCIONES['HONDA 150XR'] = REAGRUPAR_SECCIONES['ITALIKA DM250'];
  // MOTOCARRO (genérico, sin marca) es igual a MOTOCARRO KINGWAY pieza por pieza
  // (mismo Neumáticos con "Tapones" en vez de "Rines") -- confirmado contra su
  // propio PDF crudo.
  REAGRUPAR_SECCIONES['MOTOCARRO'] = REAGRUPAR_SECCIONES['MOTOCARRO KINGWAY'];
  /** Sin espacios ni mayúsculas/minúsculas: una palabra que se corta a la mitad de
   *  línea en el documento a veces pierde el espacio al leerse como texto plano
   *  (pasó con "ASIENTOS TRASEROS 2" -> "ASIENTOS TRASEROS2" al leer el PDF de la
   *  plantilla), así que comparar ignorando espacios es más confiable que esperar
   *  que el nombre de REAGRUPAR_SECCIONES calce carácter por carácter. */
  function normalizarNombrePieza_(nombre) {
    return String(nombre || '').toUpperCase().replace(/\s+/g, '');
  }
  function reagruparSiAplica_(tipo, secciones) {
    const mapa = REAGRUPAR_SECCIONES[String(tipo || '').trim().toUpperCase()];
    if (!mapa) return secciones;

    const porPieza = {};
    secciones.forEach((s) => s.campos.forEach((c) => { porPieza[normalizarNombrePieza_(c.campo)] = c; }));

    const usadas = {};
    const reagrupadas = mapa.map((grupo) => {
      const campos = grupo.piezas.map((nombre) => {
        const clave = normalizarNombrePieza_(nombre);
        usadas[clave] = true;
        return porPieza[clave];
      }).filter(Boolean);
      return { titulo: grupo.titulo, peso: grupo.peso, campos: campos };
    })
      // Si NINGUNA pieza del grupo calzó con la plantilla real (se editó el documento y los
      // nombres de REAGRUPAR_SECCIONES quedaron viejos), no deja un grupo fantasma con
      // campos: [] -- el mismo problema que una "sección" sin piezas de Plantilla.seccionesDe.
      .filter((g) => g.campos.length > 0);

    // Si la plantilla real trae una pieza que este mapa no contempla (se agregó
    // después, o falta en la lista de arriba), no se pierde en silencio: se deja
    // aparte con peso 0 (no afecta la calificación) para que se note y se pueda
    // agregar aquí.
    const faltantes = [];
    secciones.forEach((s) => s.campos.forEach((c) => { if (!usadas[normalizarNombrePieza_(c.campo)]) faltantes.push(c); }));
    if (faltantes.length) reagrupadas.push({ titulo: 'Otras piezas (revisar agrupación)', peso: 0, campos: faltantes });
    return reagrupadas;
  }

  function estructuraDeTipo(token, tipo) {
    Permisos.puedeLeer(token, MODULO);
    return estructura_(tipo);
  }

  /** Lo mismo sin sesión, para lo que corre desde el editor (puntajesMaximos) */
  function estructura_(tipo) {
    const clave = 'inspeccion_tipo_' + SheetUtils.normalizarEncabezado_(tipo);
    const guardado = CacheService.getScriptCache().get(clave);
    if (guardado) {
      try { return JSON.parse(guardado); } catch (e) { /* recalcular */ }
    }

    const configuracion = configuracionDe_(tipo);
    const plantillaId = limpiar_(configuracion[COL_PLANTILLA]);
    if (!plantillaId) {
      throw new Error(
        'El tipo "' + tipo + '" no tiene plantilla configurada. Corre configurarInspecciones ' +
        'o escribe el id del documento "' + nombrePlantilla_(tipo) + '" en la columna ' +
        COL_PLANTILLA + ' de la hoja ' + HOJA_MODELOS + '.'
      );
    }

    let texto;
    try {
      texto = DocumentApp.openById(plantillaId).getBody().getText();
    } catch (err) {
      throw new Error('No se pudo abrir la plantilla del tipo "' + tipo + '" (' + err.message + ')');
    }

    const estructura = {
      tipo: limpiar_(configuracion['TIPO']),
      plantillaId: plantillaId,
      carpeta: carpetaDe_(tipo, configuracion),
      secciones: reagruparSiAplica_(tipo, Plantilla.seccionesDe(texto)),
      // Las llantas que aplican salen de la propia plantilla: un auto trae DD/DI/TD/TI,
      // una moto D/T y un camión de rueda doble las TII/TID/TEI/TED
      llantas: COLUMNAS_LLANTAS
        .filter(([columna]) => texto.indexOf('[' + columna + ']') !== -1)
        .map(([columna, etiqueta]) => ({ campo: columna, etiqueta: etiqueta })),
      diagramas: DIAGRAMAS
        .filter((d) => limpiar_(configuracion[d]))
        .map((d) => ({ campo: 'INS ' + d, etiqueta: d.charAt(0) + d.slice(1).toLowerCase(), ruta: configuracion[d] })),
    };
    estructura.piezas = estructura.secciones.reduce((n, s) => n + s.campos.length, 0);

    try {
      CacheService.getScriptCache().put(clave, JSON.stringify(estructura), 6 * 60 * 60);
    } catch (e) { /* si no cupo en caché, solo se recalcula la próxima vez */ }
    return estructura;
  }

  /** Olvida lo cacheado de un tipo (al editar su plantilla, para verlo de inmediato) */
  function olvidarTipo(token, tipo) {
    Permisos.puedeEditar(token, MODULO);
    CacheService.getScriptCache().remove('inspeccion_tipo_' + SheetUtils.normalizarEncabezado_(tipo));
    return 'Listo: se volverá a leer la plantilla de "' + tipo + '".';
  }

  /** Tipos disponibles, para el formulario */
  function tipos(token) {
    Permisos.puedeLeer(token, MODULO);
    return SheetUtils.getAll(ssId(), HOJA_MODELOS)
      .filter((f) => limpiar_(f['TIPO']))
      .map((f) => ({
        tipo: limpiar_(f['TIPO']),
        listo: !!limpiar_(f[COL_PLANTILLA]),
      }))
      .sort((a, b) => a.tipo.localeCompare(b.tipo));
  }

  /** La plantilla de cada tipo (revisarEntorno: la cuenta que despliega tiene que poder copiarlas) */
  function plantillas() {
    return SheetUtils.getAll(ssId(), HOJA_MODELOS)
      .filter((f) => limpiar_(f['TIPO']) && limpiar_(f[COL_PLANTILLA]))
      .map((f) => ({ tipo: limpiar_(f['TIPO']), id: limpiar_(f[COL_PLANTILLA]) }));
  }

  return {
    listar: (token) => HojaServicio.listar(INSPECCIONES, token),
    /** Para el activador (Calentador.gs): la deja armada sin esperar a nadie */
    calentar: () => HojaServicio.calentar(INSPECCIONES),
    /** Inspecciones de un solo vehículo (ficha de Vehículos) */
    listarPorFolio: (token, folio) => HojaServicio.listarPor(INSPECCIONES, token, 'FOLIO', folio),
    listarPorVehiculo: (token, id) => HojaServicio.listarPorVehiculo(INSPECCIONES, token, id),
    /** Registro completo -- TODAS las 195 columnas crudas -- por ID (para "Ver completo" desde
     *  la ficha de Vehículos; distinto de detalle(), que ya viene agrupado/calculado) */
    buscarPorId: (token, id) => conPorcentajes_(HojaServicio.buscarPorId(INSPECCIONES, token, id)),
    completo: (token) => HojaServicio.completo(INSPECCIONES, token).map(conPorcentajes_),
    puntajesAPorcentaje, puntajesMaximos, puntajesRelativos,
    detalle, registrar, actualizar, urlFormato, previsualizarImagen,
    estructuraDeTipo, olvidarTipo, tipos, plantillas,
    nombrePlantilla_, carpetaDe_,   // las usa configurarInspecciones
    calcularPuntaje_, valorDeRespuesta_,   // expuestas para las pruebas
  };
})();

/** Desde el editor (27-oct): cuántas calificaciones de INSPECCION VEHICULAR no están en porcentaje (no cambia nada) */
function inspeccionesPuntajesRevisar() {
  soloEditor_();
  const r = InspeccionesService.puntajesAPorcentaje(false);
  Logger.log('Inspecciones: ' + r.filas + ' · celdas con calificación: ' + r.celdas + ' · se pasarían a porcentaje: ' +
    r.cambian + ' · no son número (no se tocan): ' + r.raras +
    (r.faltan.length ? ' · columnas que no están: ' + r.faltan.join(', ') : '') + ' (entorno: ' + (leerConfig_('ENTORNO') || '?') + ')');
  return r;
}

/**
 * Desde el editor (27-oct): pasa las 13 columnas de calificación a porcentaje (correr antes inspeccionesPuntajesRevisar).
 * En PROD no corre sin inspeccionesPuntajesAPorcentaje('SI, EN PROD').
 */
function inspeccionesPuntajesAPorcentaje(confirmacion) {
  soloEditor_();
  if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("Esto es PRODUCCIÓN. Si de verdad es aquí, corre inspeccionesPuntajesAPorcentaje('SI, EN PROD').");
  }
  const r = InspeccionesService.puntajesAPorcentaje(true);
  Logger.log('Pasadas a porcentaje: ' + r.cambian + ' de ' + r.celdas + ' celdas (no son número: ' + r.raras + ').');
  return r;
}

/** Desde el editor (27-oct): a cuántas inspecciones ya guardadas se les calcularía el PUNTAJE MAXIMO (no cambia nada) */
function inspeccionesMaximosRevisar() {
  soloEditor_();
  const r = InspeccionesService.puntajesMaximos(false);
  Logger.log('Inspecciones: ' + r.filas + ' · se calcularían: ' + r.calculadas + ' · ya lo tenían: ' + r.yaTenian +
    ' · sin respuestas: ' + r.sinRespuestas + ' · sin tipo: ' + r.sinTipo + ' · cuántas por máximo: ' + JSON.stringify(r.porMaximo) +
    (Object.keys(r.errores).length ? ' · tipos que no se pudieron leer: ' + JSON.stringify(r.errores) : '') +
    ' (entorno: ' + (leerConfig_('ENTORNO') || '?') + ')');
  return r;
}

/**
 * Desde el editor (27-oct): escribe el PUNTAJE MAXIMO de las inspecciones que no lo tienen (correr antes
 * inspeccionesMaximosRevisar). En PROD no corre sin inspeccionesMaximosCalcular('SI, EN PROD').
 */
function inspeccionesMaximosCalcular(confirmacion) {
  soloEditor_();
  if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("Esto es PRODUCCIÓN. Si de verdad es aquí, corre inspeccionesMaximosCalcular('SI, EN PROD').");
  }
  const r = InspeccionesService.puntajesMaximos(true);
  Logger.log('PUNTAJE MAXIMO calculado: ' + r.calculadas + ' de ' + r.filas + ' inspecciones (ya lo tenían: ' + r.yaTenian + ').');
  return r;
}

/**
 * Desde el editor (30-oct): a cuántas inspecciones ya guardadas les cambiaría el PUNTAJE FINAL con la
 * fórmula corregida (relativo a lo aplicable, no sobre 100 fijo -- ver calcularPuntaje_). No cambia nada;
 * correr inspeccionesMaximosCalcular antes si hace falta (este no depende de PUNTAJE MAXIMO: lo recalcula
 * todo desde las respuestas crudas).
 */
function inspeccionesRelativoRevisar() {
  soloEditor_();
  const r = InspeccionesService.puntajesRelativos(false);
  Logger.log('Inspecciones: ' + r.filas + ' · se corregirían: ' + r.corregidas + ' · ya estaban bien: ' + r.yaCorrectas +
    ' · sin calificar: ' + r.sinCalificar + ' · sin respuestas: ' + r.sinRespuestas + ' · sin tipo: ' + r.sinTipo +
    (Object.keys(r.errores).length ? ' · tipos que no se pudieron leer: ' + JSON.stringify(r.errores) : '') +
    ' (entorno: ' + (leerConfig_('ENTORNO') || '?') + ')');
  return r;
}

/**
 * Desde el editor (30-oct): escribe el PUNTAJE FINAL corregido de las inspecciones que lo tenían mal (correr
 * antes inspeccionesRelativoRevisar). En PROD no corre sin inspeccionesRelativoCalcular('SI, EN PROD').
 */
function inspeccionesRelativoCalcular(confirmacion) {
  soloEditor_();
  if (String(leerConfig_('ENTORNO') || '').toUpperCase() === 'PROD' && confirmacion !== 'SI, EN PROD') {
    throw new Error("Esto es PRODUCCIÓN. Si de verdad es aquí, corre inspeccionesRelativoCalcular('SI, EN PROD').");
  }
  const r = InspeccionesService.puntajesRelativos(true);
  Logger.log('PUNTAJE FINAL corregido: ' + r.corregidas + ' de ' + r.filas + ' inspecciones (ya estaban bien: ' + r.yaCorrectas + ').');
  return r;
}
