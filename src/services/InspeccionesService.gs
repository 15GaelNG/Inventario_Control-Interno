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
      secciones: Plantilla.seccionesDe(texto),
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
    listar, detalle, registrar, urlFormato, previsualizarImagen,
    estructuraDeTipo, olvidarTipo, tipos,
    nombrePlantilla_, carpetaDe_,   // las usa configurarInspecciones
    calcularPuntaje_, valorDeRespuesta_,   // expuestas para las pruebas
  };
})();
