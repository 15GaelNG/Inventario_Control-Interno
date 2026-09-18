/**
 * PdfService.gs
 * Llena una plantilla de Google Docs con datos y la entrega como PDF.
 *
 * Usa LAS MISMAS plantillas que llenaba AppSheet, sin editarlas: Plantilla.gs entiende
 * sus marcadores << >> (ver ahí el detalle). Así el mismo documento sirve en los dos
 * sistemas mientras conviven, y no hay que rehacer 19 formatos a mano.
 *
 * Flujo:
 *   1. Se copia la plantilla a una carpeta de trabajo.
 *   2. Se sustituyen los marcadores de texto (incluidos los bloques <<If:>>…<<EndIf>>).
 *   3. Se insertan las imágenes (firmas y diagramas de daños marcados por el usuario).
 *   4. Se exporta a PDF, se guarda en Drive y se borra la copia del Doc.
 *
 * Nota sobre el formato: las sustituciones se hacen marcador por marcador (no se
 * reescribe el párrafo completo), para no perder el diseño de las tablas ni las fuentes.
 */

const PdfService = (function () {
  const CARPETA_REPORTES_ID_PROP = 'DRIVE_FOLDER_ID_REPORTES';
  const ANCHO_IMAGEN_PUNTOS = 200;   // ancho por defecto de firmas y diagramas

  function carpetaReportes_() {
    const id = PropertiesService.getScriptProperties().getProperty(CARPETA_REPORTES_ID_PROP);
    if (!id) {
      throw new Error(
        'Falta configurar "' + CARPETA_REPORTES_ID_PROP + '" en Script Properties ' +
        '(corre configurarEntornoDev para dejarlo listo en el ambiente de pruebas).'
      );
    }
    return DriveApp.getFolderById(id);
  }

  /**
   * Arma el nombre del archivo a partir de sus partes, quitando lo que no conviene en un
   * nombre de archivo. Las partes vacías se omiten, para que no queden dobles espacios
   * cuando falta un dato (p. ej. una unidad sin placa).
   *
   *   nombreArchivo(['INSPECCION', 'JUAN PEREZ', 'ST0443E', '2026-09-17'])
   *     → 'INSPECCION JUAN PEREZ ST0443E 2026-09-17'
   */
  function nombreArchivo(partes) {
    return (partes || [])
      .map((p) => String(p == null ? '' : p).trim())
      .filter(Boolean)
      .join(' ')
      .replace(/[\\/:*?"<>|]/g, ' ')   // caracteres que estorban en Drive y al descargar
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180);                  // un nombre larguísimo se corta al verlo en pantalla
  }

  /**
   * Fecha para el nombre: "aaaa-mm-dd", así la carpeta queda en orden cronológico.
   * Acepta Date, texto ISO o "dd/mm/aaaa", que es como vienen algunas celdas de AppSheet.
   */
  function fechaParaNombre(valor) {
    if (!valor) return '';
    let f = valor instanceof Date ? valor : null;
    if (!f) {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(valor).trim());
      f = m ? new Date(+m[3], +m[2] - 1, +m[1]) : new Date(valor);
    }
    if (isNaN(f.getTime())) return '';
    return [f.getFullYear(), String(f.getMonth() + 1).padStart(2, '0'), String(f.getDate()).padStart(2, '0')].join('-');
  }

  /** Texto literal → patrón de búsqueda (replaceText y findText usan expresiones regulares) */
  function escaparRegex_(texto) {
    return String(texto).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Todos los elementos de texto del cuerpo, incluidos los de las tablas */
  function textosDe_(elemento, acumulado) {
    acumulado = acumulado || [];
    const tipo = elemento.getType();
    if (tipo === DocumentApp.ElementType.TEXT) {
      acumulado.push(elemento.asText());
      return acumulado;
    }
    if (typeof elemento.getNumChildren !== 'function') return acumulado;
    for (let i = 0; i < elemento.getNumChildren(); i++) {
      textosDe_(elemento.getChild(i), acumulado);
    }
    return acumulado;
  }

  /**
   * Sustituye los marcadores de texto del documento.
   * @return {{marcadores: number, sinResolver: string[]}}
   */
  function llenarTexto_(body, datos) {
    let sustituidos = 0;
    const errores = [];

    textosDe_(body).forEach((texto) => {
      const contenido = texto.getText();
      if (contenido.indexOf('<<') === -1) return;

      // 1. Bloques completos: <<If:(cond)>> contenido <<EndIf>>
      (contenido.match(/<<If:[\s\S]*?<<EndIf>>/gi) || []).forEach((bloque) => {
        try {
          texto.replaceText(escaparRegex_(bloque), Plantilla.resolver(bloque, datos));
          sustituidos++;
        } catch (err) {
          errores.push(bloque.slice(0, 60) + ' → ' + err.message);
        }
      });

      // 2. Expresiones sueltas (se relee: los bloques ya cambiaron el contenido)
      (texto.getText().match(/<<[\s\S]*?>>/g) || []).forEach((marcador) => {
        try {
          const valor = Plantilla.resolver(marcador, datos);
          texto.replaceText(escaparRegex_(marcador), valor);
          sustituidos++;
        } catch (err) {
          errores.push(marcador.slice(0, 60) + ' → ' + err.message);
        }
      });
    });

    return { marcadores: sustituidos, sinResolver: errores };
  }

  /**
   * Cambia un marcador por una imagen. Se usa para las firmas y los diagramas de daños
   * (en las plantillas son <<[FIRMA INSPECTOR]>>, <<[INS FRONTAL]>>, etc.).
   * @return {boolean} si encontró el marcador
   */
  function insertarImagen_(body, marcador, blob, anchoPuntos) {
    const encontrado = body.findText(escaparRegex_(marcador));
    if (!encontrado) return false;

    const elemento = encontrado.getElement();
    elemento.asText().deleteText(encontrado.getStartOffset(), encontrado.getEndOffsetInclusive());

    // La imagen va en el párrafo (o celda) donde estaba el marcador
    let contenedor = elemento.getParent();
    while (contenedor && contenedor.getType() !== DocumentApp.ElementType.PARAGRAPH) {
      contenedor = contenedor.getParent();
    }
    if (!contenedor) return false;

    const imagen = contenedor.asParagraph().appendInlineImage(blob);
    const proporcion = imagen.getHeight() / imagen.getWidth();
    const ancho = anchoPuntos || ANCHO_IMAGEN_PUNTOS;
    imagen.setWidth(ancho).setHeight(Math.round(ancho * proporcion));
    return true;
  }

  /**
   * Subcarpeta por nombre dentro de otra; la crea si no existe.
   * AppSheet archiva los formatos llenados en subcarpetas por tipo de unidad
   * ("INSPECCIONES L200", "INSPECCIONES XPANDER"…): se respeta esa organización para
   * que quien busca un documento lo siga encontrando donde siempre.
   */
  function subcarpeta_(carpeta, nombre) {
    const existentes = carpeta.getFoldersByName(nombre);
    return existentes.hasNext() ? existentes.next() : carpeta.createFolder(nombre);
  }

  /**
   * Genera un PDF a partir de una plantilla.
   *
   * @param {Object} p
   * @param {string} p.plantillaId   id del Google Doc que sirve de plantilla
   * @param {Object} p.datos         { 'NOMBRE DEL CAMPO': valor } como los pide la plantilla
   * @param {Object} [p.imagenes]    { 'FIRMA INSPECTOR': {base64, mimeType}, … }
   * @param {string} [p.nombre]      nombre del archivo final
   * @param {string} [p.carpetaId]   dónde guardarlo (por defecto, la carpeta de reportes)
   * @param {string} [p.subcarpeta]  subcarpeta dentro de la anterior, ej. 'INSPECCIONES L200'
   * @return {{url: string, fileId: string, marcadores: number, sinResolver: string[]}}
   */
  function generar(p) {
    if (!p || !p.plantillaId) throw new Error('Falta indicar la plantilla');
    let carpeta = p.carpetaId ? DriveApp.getFolderById(p.carpetaId) : carpetaReportes_();
    if (p.subcarpeta) carpeta = subcarpeta_(carpeta, p.subcarpeta);

    let nombre = p.nombre || ('Documento ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm.ss'));
    // Dos inspecciones de la misma unidad el mismo día: se distingue con la hora, en vez
    // de dejar dos archivos con el mismo nombre (en Drive sí se permite, y confunde)
    if (carpeta.getFilesByName(nombre + '.pdf').hasNext()) {
      nombre += ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH.mm');
    }

    let copia;
    try {
      copia = DriveApp.getFileById(p.plantillaId).makeCopy(nombre, carpeta);
    } catch (err) {
      throw new Error(
        'No se pudo copiar la plantilla (' + err.message + '). Revisa que el id sea de un ' +
        'documento de Google Docs y que tu cuenta (' + Session.getEffectiveUser().getEmail() + ') pueda verlo.'
      );
    }

    let resultado;
    try {
      const doc = DocumentApp.openById(copia.getId());
      const body = doc.getBody();

      // Primero las imágenes: si no, el paso de texto borraría sus marcadores
      Object.keys(p.imagenes || {}).forEach((campo) => {
        const imagen = p.imagenes[campo];
        if (!imagen || (!imagen.base64 && !imagen.blob)) return;
        // Puede venir capturada por el usuario (base64) o ya como archivo de Drive (blob),
        // que es el caso de los diagramas en blanco cuando no se marcó ningún daño
        const blob = imagen.blob || Utilities.newBlob(
          Utilities.base64Decode(imagen.base64), imagen.mimeType || 'image/png', campo + '.png'
        );
        // En las plantillas el marcador de imagen se escribe con corchetes
        if (!insertarImagen_(body, '<<[' + campo + ']>>', blob, imagen.ancho)) {
          insertarImagen_(body, '<<' + campo + '>>', blob, imagen.ancho);
        }
      });

      resultado = llenarTexto_(body, p.datos || {});
      doc.saveAndClose();

      const pdf = carpeta.createFile(DriveApp.getFileById(copia.getId()).getAs('application/pdf'))
        .setName(nombre + '.pdf');
      return {
        url: pdf.getUrl(),
        fileId: pdf.getId(),
        nombre: pdf.getName(),
        marcadores: resultado.marcadores,
        sinResolver: resultado.sinResolver,
      };
    } finally {
      // La copia del Doc ya no se necesita: lo que queda es el PDF
      try { DriveApp.getFileById(copia.getId()).setTrashed(true); } catch (e) { /* no-op */ }
    }
  }

  /** Qué campos pide una plantilla (útil para armar el formulario del módulo) */
  function camposDePlantilla(plantillaId) {
    const doc = DocumentApp.openById(plantillaId);
    return Plantilla.camposDe(doc.getBody().getText());
  }

  return { generar, camposDePlantilla, nombreArchivo, fechaParaNombre, subcarpeta_ };
})();
