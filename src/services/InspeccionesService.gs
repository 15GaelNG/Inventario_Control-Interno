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
    COL_ID, 'FOLIO', 'TIPO', 'FECHA', 'RESPONSABLE', 'DEPARTAMENTO', 'AREA', 'SEDE',
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

  /** Fechas de la hoja → texto ISO (igual que en los demás servicios) */
  function fechaISO_(valor) {
    if (!valor) return '';
    if (valor instanceof Date) return isNaN(valor.getTime()) ? '' : valor.toISOString();
    const m = String(valor).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (!m) return '';
    const f = new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  /** "84.50%" o 0.845 → 84.5 (número, para poder ordenar y promediar en la tabla) */
  function porcentaje_(valor) {
    const texto = limpiar_(valor);
    if (!texto) return '';
    const n = Number(texto.replace('%', '').replace(/,/g, ''));
    if (isNaN(n)) return '';
    // Sin el símbolo, AppSheet guarda la fracción (0.845); con él, el número ya es 84.5
    return texto.indexOf('%') === -1 && n <= 1 ? Math.round(n * 1000) / 10 : Math.round(n * 10) / 10;
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

  function listar(token) {
    Permisos.puedeLeer(token, MODULO);
    return leerColumnas_(COLUMNAS_LISTA)
      .filter((r) => limpiar_(r[COL_ID]))
      .map(desdeOriginal_)
      .sort((a, b) => (b.FECHA || '').localeCompare(a.FECHA || ''));
  }

  /** Inspecciones de un solo vehículo (ficha de Vehículos). */
  function listarPorFolio(token, folio) {
    if (!folio) return [];
    return listar(token).filter((i) => i.FOLIO === folio);
  }

  /** Registro completo -- TODAS las 195 columnas crudas -- por ID (para "Ver completo" desde
   *  la ficha de Vehículos; distinto de detalle(), que ya viene agrupado/calculado). */
  function buscarPorId(token, id) {
    Permisos.puedeLeer(token, MODULO);
    const encontrado = SheetUtils.findById(ssId(), hoja_().getName(), id, COL_ID);
    if (!encontrado) return null;
    const limpio = {};
    Object.keys(encontrado.data).forEach((k) => {
      const v = encontrado.data[k];
      limpio[k] = v instanceof Date ? v.toISOString() : v;
    });
    return limpio;
  }

  /**
   * Todas las 195 columnas de TODAS las inspecciones (para exportar completo) — a
   * diferencia de listar()/detalle(), que evitan leer la hoja entera por lo pesado
   * que es (ver el comentario de COLUMNAS_LISTA); aquí sí se lee completa, a propósito.
   */
  function completo(token) {
    Permisos.puedeLeer(token, MODULO);
    return SheetUtils.getAll(ssId(), hoja_().getName());
  }

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
    COLUMNAS_LISTA.concat(COLUMNAS_LLANTAS.map((p) => p[0]), COLUMNAS_PUNTUACION.map((p) => p[0]),
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
    'OFICINA / DESARROLLO': 'UBICACION',
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
   * @param {string} p.FOLIO       vehículo (de ahí se copian sus datos)
   * @param {string} p.TIPO        tipo de unidad: decide checklist, plantilla y carpeta
   * @param {Object} p.checklist   { 'PIEZA': 'BUENO' }
   * @param {Object} p.llantas     { 'LLANTA DD': 7 }
   * @param {Object} [p.imagenes]  { 'INS FRONTAL': {base64, mimeType}, 'FIRMA INSPECTOR': {…} }
   * @return {{ID, puntaje, pdf, url}}
   */
  function registrar(token, p, imagenes) {
    const sesion = Permisos.puedeEditar(token, MODULO);
    const folio = limpiar_(p && p.FOLIO);
    if (!folio) throw new Error('El folio del vehículo es obligatorio');

    const vehiculo = SheetUtils.findById(ssId(), 'VEHICULOS', folio, 'FOLIO');
    if (!vehiculo) throw new Error('No existe un vehículo con folio ' + folio);

    const estructura = estructuraDeTipo(token, p.TIPO);
    const checklist = p.checklist || {};
    const puntaje = calcularPuntaje_(estructura.secciones, checklist);
    if (!puntaje.evaluadas) throw new Error('Responde al menos una pieza del checklist antes de guardar');

    const id = nuevoId_(vehiculo.data['NUCCO']);
    const ahora = new Date();

    // ---- la fila ----
    const fila = { [COL_ID]: id, 'TIPO': estructura.tipo, 'FECHA': ahora };
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
      if (columna) fila[columna] = s.valor;
    });
    fila['PUNTAJE FINAL INSPECCION'] = puntaje.final.toFixed(2) + '%';

    // ---- imágenes (diagramas y firmas) ----
    const subidas = [];
    const paraPdf = {};
    const sinDibujo = [];   // diagramas en blanco que no están en Drive
    try {
      COLUMNAS_IMAGEN.forEach(([columna]) => {
        const imagen = (imagenes || {})[columna];
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

      SheetUtils.insert(ssId(), hoja_().getName(), fila);
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
        carpetaId: Config.DRIVE_FOLDERS.REPORTES(),
        subcarpeta: estructura.carpeta,
        nombre: PdfService.nombreArchivo([
          'INSPECCION', fila['RESPONSABLE'], fila['PLACAS'], PdfService.fechaParaNombre(ahora),
        ]),
      });
      SheetUtils.update(ssId(), hoja_().getName(), id,
        { [COL_PDF]: estructura.carpeta ? 'INSPECCIONES VEHICULARES/' + estructura.carpeta + '/' + pdf.nombre : pdf.nombre },
        COL_ID);
    } catch (err) {
      // La inspección ya quedó guardada: el PDF se puede volver a generar, así que no se
      // pierde la captura por esto — pero hay que decirlo, no callarlo
      return {
        ID: id,
        puntaje: puntaje.final,
        pdf: null,
        aviso: 'La inspección se guardó, pero no se pudo generar el PDF: ' + err.message,
      };
    }

    return {
      ID: id, puntaje: puntaje.final, pdf: pdf.url, sinResolver: pdf.sinResolver,
      advertencia: sinDibujo.length
        ? 'El PDF salió sin estos dibujos porque no están en Drive: ' + sinDibujo.join(', ') +
          '. Súbelos a esa ruta para que aparezcan en las siguientes inspecciones.'
        : '',
    };
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
   * Cada sección vale su peso; el total es la suma de las 12. Función pura: se prueba sola.
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

    const final = detalle.reduce((suma, s) => suma + s.valor, 0) * 100;
    return {
      secciones: detalle,
      final: Math.round(final * 100) / 100,
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
    });

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

  return {
    listar, listarPorFolio, buscarPorId, completo, detalle, registrar, urlFormato, previsualizarImagen,
    estructuraDeTipo, olvidarTipo, tipos,
    nombrePlantilla_, carpetaDe_,   // las usa configurarInspecciones
    calcularPuntaje_, valorDeRespuesta_,   // expuestas para las pruebas
  };
})();
