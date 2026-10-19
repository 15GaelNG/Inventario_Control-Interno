/**
 * LineasPdf.gs
 * Generación de PDF con las plantillas Google Docs del AppSheet (portado del prototipo,
 * fase 1 de "CI Control Activos"). Soporta la sintaxis usada en las plantillas de Telefonía:
 *   <<COLUMNA>>  <<[COLUMNA]>>  <<IF([COL] = "VAL", "✓", "")>>  <<UPPER([COL])>>
 *   <<RIGHT("000" & [NUCO], 4)>>  <<If:([COL] = "SI")>> … <<EndIf>>
 * y etiquetas de imagen (firmas) que se reemplazan por la imagen.
 *
 * La plantilla original NUNCA se modifica: se copia, se rellena la copia,
 * se exporta a PDF y la copia temporal se envía a la papelera.
 */

const LineasPdf = (function () {
  /** Plantillas del AppSheet: no se modifican. */
  const PLANTILLAS_APPSHEET = {
    INSPECCION_CELULAR: '1YVYDhQ9aWOEjkqxO8_4AvHdmP3f91W7QVRB8C9kjlUI',
    RESPONSIVA_CELULAR: '1EfSbZaQwl6c3ylQ1Z60gxjOeIXAqZ7g1_IN-qfw-pMc',
  };
  /**
   * Las que usa el sistema: copias «(SISTEMA)» de las del AppSheet, en sus mismas carpetas (FORMATOS y
   * RESPONSIVAS_LINEAS), con el título «Comentario» y el marcador [COMENTARIO] (6-oct; la función que las hizo,
   * lineasPlantillasComentario_copiar, se quitó el 7-oct y sigue en el historial de git).
   * Desde el 19-oct (pendiente 2.54), sus copias «- PRUEBA RESPONSABLE 19-oct» con los mismos datos del responsable en
   * las dos: la responsiva agrega JEFE DIRECTO y la inspección No. empleado y Director de Dpto. Las «(SISTEMA)» de
   * antes (inspección 11l9vL9K…, responsiva 13qeTsLm…) siguen como estaban: las usa producción hasta que salga este cambio.
   */
  const PLANTILLAS = {
    INSPECCION_CELULAR: '1TcIyGtyEDm_Ied2nBxSuCzBd0uNQzKM9QyiqBf1QkOA',
    RESPONSIVA_CELULAR: '1sbV_lv6-U8xxGU0Gbcsmtw4iKBfKfIfNdaQ_li4ioBQ',
  };

  // Cómo imprime el AppSheet ("Task for GENERAR PDF": carta, márgenes de la tarea en 0): convierte el Doc a HTML y lo
  // imprime con Chromium. Los márgenes del Doc (responsiva: 14.2 pt arriba y a los lados, 0 abajo) se respetan, y el
  // interlineado (1.0 / 1.15 / 1.5) se aplica sobre el tamaño de la letra; Google Docs lo aplica sobre la altura
  // natural de la fuente (Century Gothic: 1.211 veces la letra) y la responsiva salía en 3 hojas (5-oct). Un párrafo
  // vacío en ese HTML mide 11 pt. Sin interlineado propio, el párrafo toma el del estilo Normal (responsiva: 1.0). La
  // hoja 2 empieza en las sanciones: en el AppSheet el título cae ahí por espacio. `hojas`: si el PDF sale con más, la
  // hoja 1 no alcanzó y el salto se quita (ver generarPdfDesdePlantilla).
  const COMO_APPSHEET = {
    [PLANTILLAS.RESPONSIVA_CELULAR]: { altoFuente: 1.211, altoVacio: 11, interlineadoNormal: 1, saltoAntesDe: 'SANCIONES POR MAL MANEJO', hojas: 2 },
  };
  // Con varios responsables, sus nombres bajo la firma van en letra más chica: en 11 pt, dos nombres ocupaban tres
  // renglones y la hoja 1 no alcanzaba (NUCO 1137, 12-oct). La etiqueta es la del párrafo que solo tiene el nombre.
  const NOMBRES_BAJO_FIRMA = {
    [PLANTILLAS.RESPONSIVA_CELULAR]: { etiqueta: '<<RESPONSABLE>>', columna: 'RESPONSABLE', letra: 8 },
  };

  // ---------------- Evaluador de expresiones AppSheet (subconjunto) ----------------

  function evaluarExpresion_(texto, registro) {
    const tokens = tokenizar_(texto);
    let pos = 0;
    const ver = () => tokens[pos];
    const tomar = (tipo, valor) => {
      const t = tokens[pos];
      if (!t || (tipo && t.tipo !== tipo) || (valor !== undefined && t.valor !== valor)) throw new Error('Expresión no soportada: ' + texto);
      pos++;
      return t;
    };
    const comparar = () => {
      let izq = concatenar();
      while (ver() && ver().tipo === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(ver().valor) >= 0) {
        const op = tomar().valor;
        izq = compararValores_(izq, op, concatenar());
      }
      return izq;
    };
    const concatenar = () => {
      let izq = sumar();
      while (ver() && ver().tipo === 'op' && ver().valor === '&') { tomar(); izq = aTexto_(izq) + aTexto_(sumar()); }
      return izq;
    };
    const sumar = () => {
      let izq = multiplicar();
      while (ver() && ver().tipo === 'op' && (ver().valor === '+' || ver().valor === '-')) {
        const op = tomar().valor;
        const der = multiplicar();
        izq = op === '+' ? aNumero_(izq) + aNumero_(der) : aNumero_(izq) - aNumero_(der);
      }
      return izq;
    };
    const multiplicar = () => {
      let izq = unario();
      while (ver() && ver().tipo === 'op' && (ver().valor === '*' || ver().valor === '/')) {
        const op = tomar().valor;
        const der = unario();
        izq = op === '*' ? aNumero_(izq) * aNumero_(der) : aNumero_(izq) / (aNumero_(der) || 1);
      }
      return izq;
    };
    const unario = () => {
      if (ver() && ver().tipo === 'op' && ver().valor === '-') { tomar(); return -aNumero_(unario()); }
      return primario();
    };
    const primario = () => {
      const t = ver();
      if (!t) throw new Error('Expresión incompleta: ' + texto);
      if (t.tipo === 'num') { pos++; return t.valor; }
      if (t.tipo === 'str') { pos++; return t.valor; }
      if (t.tipo === 'col') { pos++; return valorColumna_(registro, t.valor); }
      if (t.tipo === 'par' && t.valor === '(') { tomar(); const v = comparar(); tomar('par', ')'); return v; }
      if (t.tipo === 'id') {
        pos++;
        const nombre = t.valor.toUpperCase();
        if (ver() && ver().tipo === 'par' && ver().valor === '(') {
          tomar();
          const args = [];
          if (!(ver() && ver().tipo === 'par' && ver().valor === ')')) {
            args.push(comparar());
            while (ver() && ver().tipo === 'coma') { tomar(); args.push(comparar()); }
          }
          tomar('par', ')');
          return funcion_(nombre, args);
        }
        if (nombre === 'TRUE') return true;
        if (nombre === 'FALSE') return false;
        return valorColumna_(registro, t.valor);
      }
      throw new Error('Token inesperado en: ' + texto);
    };
    const resultado = comparar();
    if (pos < tokens.length) throw new Error('Expresión no soportada: ' + texto);
    return resultado;
  }

  function tokenizar_(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        let j = i + 1, v = '';
        while (j < s.length && s[j] !== '"') { v += s[j]; j++; }
        tokens.push({ tipo: 'str', valor: v }); i = j + 1; continue;
      }
      if (c === '[') {
        const j = s.indexOf(']', i);
        tokens.push({ tipo: 'col', valor: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        tokens.push({ tipo: 'num', valor: Number(s.slice(i, j)) }); i = j; continue;
      }
      if (c === '(' || c === ')') { tokens.push({ tipo: 'par', valor: c }); i++; continue; }
      if (c === ',') { tokens.push({ tipo: 'coma' }); i++; continue; }
      const dos = s.slice(i, i + 2);
      if (dos === '<>' || dos === '<=' || dos === '>=') { tokens.push({ tipo: 'op', valor: dos }); i += 2; continue; }
      if ('=<>&+-*/'.indexOf(c) >= 0) { tokens.push({ tipo: 'op', valor: c }); i++; continue; }
      if (/[A-Za-z_ÁÉÍÓÚÑáéíóúñ]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z0-9_ÁÉÍÓÚÑáéíóúñ]/.test(s[j])) j++;
        tokens.push({ tipo: 'id', valor: s.slice(i, j) }); i = j; continue;
      }
      throw new Error('Carácter no soportado "' + c + '" en: ' + s);
    }
    return tokens;
  }

  function valorColumna_(registro, nombre) {
    const buscado = String(nombre).toUpperCase().trim();
    for (const k in registro) { if (k.toUpperCase().trim() === buscado) return registro[k]; }
    return '';
  }

  function aTexto_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'America/Mexico_City', 'dd/MM/yyyy');
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    return String(v);
  }
  function aNumero_(v) {
    if (typeof v === 'number') return v;
    const n = Number(String(v || '').replace(/[$,%\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function compararValores_(a, op, b) {
    const numericos = (typeof a === 'number' || typeof b === 'number') && !isNaN(aNumero_(a)) && !isNaN(aNumero_(b)) && a !== '' && b !== '';
    const x = numericos ? aNumero_(a) : aTexto_(a).toUpperCase();
    const y = numericos ? aNumero_(b) : aTexto_(b).toUpperCase();
    switch (op) {
      case '=': return x === y;
      case '<>': return x !== y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
    return false;
  }

  function funcion_(nombre, a) {
    switch (nombre) {
      case 'IF': return a[0] ? a[1] : a[2];
      case 'UPPER': return aTexto_(a[0]).toUpperCase();
      case 'LOWER': return aTexto_(a[0]).toLowerCase();
      case 'RIGHT': { const t = aTexto_(a[0]); return t.slice(Math.max(0, t.length - aNumero_(a[1]))); }
      case 'LEFT': return aTexto_(a[0]).slice(0, aNumero_(a[1]));
      case 'LEN': return aTexto_(a[0]).length;
      case 'CONCATENATE': return a.map(aTexto_).join('');
      case 'AND': return a.every(Boolean);
      case 'OR': return a.some(Boolean);
      case 'NOT': return !a[0];
      case 'ISBLANK': return aTexto_(a[0]) === '';
      case 'ISNOTBLANK': return aTexto_(a[0]) !== '';
      case 'ROUND': return Math.round(aNumero_(a[0]) * Math.pow(10, aNumero_(a[1] || 0))) / Math.pow(10, aNumero_(a[1] || 0));
      case 'TODAY': return new Date();
      case 'NOW': return new Date();
      case 'TEXT': return aTexto_(a[0]);
      default: return ''; // Funciones no soportadas (p. ej. LOOKUP) quedan vacías.
    }
  }

  // ---------------- Relleno del documento ----------------

  /**
   * Copia la plantilla, la rellena y guarda el PDF en `carpeta`.
   *   registro: { 'COLUMNA APPSHEET': valor, ... }
   *   imagenes: { 'FIRMA RESPONSABLE': Blob, ... }  (etiquetas que se sustituyen por imagen)
   * Devuelve { id, nombre, url, avisos[] }.
   * `sinCompartir`: no abrir el PDF al dominio (en NUCOS cada archivo toma los permisos de su carpeta).
   */
  function generarPdfDesdePlantilla(plantillaId, registro, imagenes, carpeta, nombrePdf, sinCompartir) {
    const avisos = [];
    const copia = DriveApp.getFileById(plantillaId).makeCopy('TMP ' + nombrePdf, carpeta);
    try {
      const doc = DocumentApp.openById(copia.getId());
      const secciones = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(Boolean);
      if (NOMBRES_BAJO_FIRMA[plantillaId]) achicarNombresBajoFirma_(doc.getBody(), NOMBRES_BAJO_FIRMA[plantillaId], registro);
      secciones.forEach((seccion) => {
        procesarBloquesIf_(seccion, registro, avisos);
        reemplazarEtiquetas_(seccion, registro, imagenes || {}, avisos);
      });
      const ajuste = COMO_APPSHEET[plantillaId];
      if (ajuste) ajustarComoAppSheet_(doc.getBody(), ajuste, avisos);
      doc.saveAndClose();
      let blob = copia.getAs('application/pdf');
      // La hoja 1 no alcanzó (p. ej. muchos responsables): sin el salto, las sanciones siguen donde termina y no queda
      // una hoja en blanco
      if (ajuste && ajuste.hojas && paginas_(blob) > ajuste.hojas && quitarSalto_(copia.getId())) blob = copia.getAs('application/pdf');
      const pdf = DriveUtils.marcarAutor(carpeta.createFile(blob.setName(nombrePdf)));
      // Fuera de NUCOS y LINEAS se abre al dominio; si Drive no lo deja, se queda con los permisos de su carpeta
      if (!sinCompartir) LineasArchivos.compartirEnDominio(pdf);
      return { id: pdf.getId(), nombre: pdf.getName(), url: pdf.getUrl(), avisos: avisos };
    } finally {
      copia.setTrashed(true); // la copia temporal es nuestra; la plantilla original no se toca
    }
  }

  /** Párrafo sin texto ni imágenes (el salto de página tampoco cuenta como contenido). */
  function vacio_(p) {
    if (p.getText().trim() !== '') return false;
    for (let i = 0; i < p.getNumChildren(); i++) {
      const t = p.getChild(i).getType();
      if (t !== DocumentApp.ElementType.TEXT && t !== DocumentApp.ElementType.PAGE_BREAK) return false;
    }
    return true;
  }

  /** La copia rellena queda con las alturas de la impresión del AppSheet (ver COMO_APPSHEET). */
  function ajustarComoAppSheet_(body, ajuste, avisos) {
    const T = DocumentApp.ElementType;
    let conSalto = null;
    // Salto de página antes del título de la hoja 2; los renglones vacíos que lo separaban de la hoja 1 se quitan
    if (ajuste.saltoAntesDe) {
      let titulo = null;
      for (let i = 0; i < body.getNumChildren() && !titulo; i++) {
        const el = body.getChild(i);
        if (el.getType() === T.PARAGRAPH && el.getText().trim().indexOf(ajuste.saltoAntesDe) === 0) titulo = el;
      }
      if (!titulo) avisos.push('No se encontró «' + ajuste.saltoAntesDe + '» para el salto de página.');
      else {
        const vacios = [];
        for (let p = titulo.getPreviousSibling(); p && p.getType() === T.PARAGRAPH && vacio_(p); p = p.getPreviousSibling()) vacios.unshift(p);
        // Después de una tabla Docs exige un párrafo: el primero se queda y lleva el salto
        conSalto = vacios.length ? vacios.shift() : body.insertParagraph(body.getChildIndex(titulo), '');
        vacios.forEach((p) => p.removeFromParent());
        conSalto.appendPageBreak();
      }
    }

    const recorrer = (el) => {
      const t = el.getType();
      if (t !== T.PARAGRAPH && t !== T.LIST_ITEM) {
        if (el.getNumChildren) for (let i = 0; i < el.getNumChildren(); i++) recorrer(el.getChild(i));
      } else if (vacio_(el)) {
        const letra = Number(el.getAttributes()[DocumentApp.Attribute.FONT_SIZE]) || 11;
        el.setLineSpacing(ajuste.altoVacio / (letra * ajuste.altoFuente));
      } else {
        el.setLineSpacing((Number(el.getLineSpacing()) || ajuste.interlineadoNormal) / ajuste.altoFuente);
      }
    };
    recorrer(body);
    // El renglón del salto queda en la hoja 1 y casi no mide: con 11 pt no cabía cuando la hoja 1 venía llena y él solo
    // hacía una hoja en blanco (NUCO 1137, 12-oct). La hoja 2 empieza igual en el título.
    if (conSalto) {
      conSalto.setAttributes({ [DocumentApp.Attribute.FONT_SIZE]: 1 });
      conSalto.setLineSpacing(1).setSpacingBefore(0).setSpacingAfter(0);
    }
  }

  /** Hojas del PDF (Docs las escribe sin comprimir: «/Type /Page» por hoja). */
  function paginas_(blob) {
    return (blob.getDataAsString('ISO-8859-1').match(/\/Type\s*\/Page(?![a-z])/g) || []).length;
  }

  /** Quita de la copia el párrafo con el salto de página (ver ajustarComoAppSheet_). Devuelve si lo encontró. */
  function quitarSalto_(docId) {
    const doc = DocumentApp.openById(docId);
    const body = doc.getBody();
    const T = DocumentApp.ElementType;
    let quitado = false;
    for (let i = body.getNumChildren() - 1; i >= 0 && !quitado; i--) {
      const el = body.getChild(i);
      if (el.getType() !== T.PARAGRAPH) continue;
      for (let j = 0; j < el.getNumChildren(); j++) {
        if (el.getChild(j).getType() === T.PAGE_BREAK) { el.removeFromParent(); quitado = true; break; }
      }
    }
    doc.saveAndClose();
    return quitado;
  }

  /** Con varios nombres (« / »), el párrafo que solo lleva la etiqueta del nombre va en letra más chica. */
  function achicarNombresBajoFirma_(body, cfg, registro) {
    if (aTexto_(valorColumna_(registro, cfg.columna)).indexOf(' / ') < 0) return;
    const T = DocumentApp.ElementType;
    const recorrer = (el) => {
      const t = el.getType();
      if (t === T.PARAGRAPH || t === T.LIST_ITEM) {
        if (el.getText().trim() === cfg.etiqueta) el.setAttributes({ [DocumentApp.Attribute.FONT_SIZE]: cfg.letra });
      } else if (el.getNumChildren) {
        for (let i = 0; i < el.getNumChildren(); i++) recorrer(el.getChild(i));
      }
    };
    recorrer(body);
  }

  function buscarTodas_(seccion, patron) {
    const encontradas = [];
    // Una lectura por bloque de texto; evita buscar de nuevo en todo el documento por cada etiqueta.
    const recorrer = (elemento) => {
      if (elemento.getType() === DocumentApp.ElementType.TEXT) {
        const texto = elemento.asText();
        const contenido = texto.getText();
        const expresion = new RegExp(patron, 'g');
        let m;
        while ((m = expresion.exec(contenido)) !== null) {
          encontradas.push({ elemento: texto, inicio: m.index, fin: m.index + m[0].length - 1, etiqueta: m[0] });
        }
      } else if (elemento.getNumChildren) {
        const total = elemento.getNumChildren();
        for (let i = 0; i < total; i++) recorrer(elemento.getChild(i));
      }
    };
    recorrer(seccion);
    return encontradas;
  }

  function procesarBloquesIf_(seccion, registro, avisos) {
    for (let guarda = 0; guarda < 500; guarda++) {
      const ini = seccion.findText('<<If:.*?>>');
      if (!ini) return;
      const fin = seccion.findText('<<EndIf>>', ini);
      const elIni = ini.getElement().asText();
      const textoIf = elIni.getText().slice(ini.getStartOffset(), ini.getEndOffsetInclusive() + 1);
      let condicion = false;
      try {
        condicion = !!evaluarExpresion_(textoIf.replace(/^<<If:/i, '').replace(/>>$/, ''), registro);
      } catch (e) {
        avisos.push(e.message);
      }
      if (!fin) {
        elIni.deleteText(ini.getStartOffset(), ini.getEndOffsetInclusive());
        avisos.push('If sin EndIf: ' + textoIf);
        continue;
      }
      const elFin = fin.getElement().asText();
      const finEnMismo = elIni.findText('<<EndIf>>');
      const mismoElemento = !!(finEnMismo && finEnMismo.getStartOffset() > ini.getEndOffsetInclusive() &&
        finEnMismo.getStartOffset() === fin.getStartOffset() && elIni.getText() === elFin.getText());
      if (mismoElemento) {
        if (condicion) {
          elFin.deleteText(fin.getStartOffset(), fin.getEndOffsetInclusive());
          elIni.deleteText(ini.getStartOffset(), ini.getEndOffsetInclusive());
        } else {
          elIni.deleteText(ini.getStartOffset(), fin.getEndOffsetInclusive());
        }
        continue;
      }
      const parIni = elIni.getParent(), parFin = elFin.getParent();
      if (!condicion) {
        elFin.deleteText(0, fin.getEndOffsetInclusive());
        if (ini.getStartOffset() <= elIni.getText().length - 1) elIni.deleteText(ini.getStartOffset(), elIni.getText().length - 1);
        const contenedor = parIni.getParent();
        if (contenedor && parFin.getParent() && contenedor.getChildIndex && parFin.getParent().getType() === contenedor.getType()) {
          try {
            const a = contenedor.getChildIndex(parIni), b = contenedor.getChildIndex(parFin);
            for (let k = b - 1; k > a; k--) contenedor.getChild(k).removeFromParent();
          } catch (e) {
            avisos.push('Bloque If entre contenedores distintos; se eliminaron solo los extremos.');
          }
        }
      } else {
        elFin.deleteText(fin.getStartOffset(), fin.getEndOffsetInclusive());
        elIni.deleteText(ini.getStartOffset(), ini.getEndOffsetInclusive());
      }
    }
  }

  function reemplazarEtiquetas_(seccion, registro, imagenes, avisos) {
    const clavesImagen = {};
    Object.keys(imagenes).forEach((k) => { clavesImagen[k.toUpperCase()] = imagenes[k]; });
    const fijas = {};
    Object.keys(registro._fijas || {}).forEach((k) => { fijas[k.toUpperCase()] = registro._fijas[k]; });
    const coincidencias = buscarTodas_(seccion, '<<[^<>]*>>');
    for (let i = coincidencias.length - 1; i >= 0; i--) {
      const m = coincidencias[i];
      const etiqueta = m.etiqueta;
      const interior = etiqueta.slice(2, -2).trim();
      const nombreImagen = interior.replace(/^\[|\]$/g, '').toUpperCase();
      if (/^(End|Start:)/i.test(interior)) { m.elemento.deleteText(m.inicio, m.fin); continue; }
      if (nombreImagen in clavesImagen) {
        m.elemento.deleteText(m.inicio, m.fin);
        const blob = clavesImagen[nombreImagen];
        if (blob) {
          try {
            const parrafo = m.elemento.getParent();
            const img = parrafo.insertInlineImage(parrafo.getChildIndex(m.elemento) + 1, blob);
            const ancho = img.getWidth(), alto = img.getHeight();
            if (/^(PATRON|CONTRASEÑA)$/.test(nombreImagen)) {
              // Las plantillas colocan el patrón en una celda baja. Limitar también
              // la altura evita que Google Docs recorte las filas inferior y superior.
              const maxAncho = 56, maxAlto = 56;
              const escala = Math.min(1, maxAncho / ancho, maxAlto / alto);
              img.setWidth(Math.max(1, Math.round(ancho * escala)));
              img.setHeight(Math.max(1, Math.round(alto * escala)));
              parrafo.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
            } else {
              // Firmas: llegan recortadas al trazo (componente Firma); caben en 160 × 70 sin deformarse. Con responsables
              // adicionales, la del principal cabe en 90 × 40 y deja lugar para que los demás firmen el impreso (6-oct)
              const chica = /^firma-principal/.test(String(blob.getName ? blob.getName() : ''));
              const escala = Math.min(1, (chica ? 90 : 160) / ancho, (chica ? 40 : 70) / alto);
              img.setWidth(Math.max(1, Math.round(ancho * escala)));
              img.setHeight(Math.max(1, Math.round(alto * escala)));
            }
          } catch (e) {
            avisos.push('No se pudo insertar la imagen ' + nombreImagen + ': ' + e.message);
          }
        }
        continue;
      }
      let valor = '';
      const esColumnaSimple = /^[^\[\]"()&*+<>=]+$/.test(interior) && !/^[\d.]+$/.test(interior);
      // `registro._fijas` { COLUMNA: texto }: la etiqueta que usa esa columna sale con ese texto aunque sea una fórmula
      // (la responsiva de la línea sin equipo: «NO APLICA» en RIGHT("000" & [NUCO], 4), no «000»; pendiente 2.45)
      const usadas = esColumnaSimple ? [interior] : (interior.match(/\[[^\]]+\]/g) || []).map((c) => c.slice(1, -1));
      const fija = usadas.map((c) => c.trim().toUpperCase()).filter((c) => Object.prototype.hasOwnProperty.call(fijas, c))[0];
      try {
        valor = fija ? String(fijas[fija]) : aTexto_(esColumnaSimple ? valorColumna_(registro, interior) : evaluarExpresion_(interior, registro));
      } catch (e) {
        avisos.push(e.message);
      }
      // El valor lleva el formato de la etiqueta (fondo azul, negritas…): insertado solo, tomaba el del carácter vecino
      const formato = formatoDe_(m.elemento, m.inicio);
      m.elemento.deleteText(m.inicio, m.fin);
      if (valor !== '') {
        m.elemento.insertText(m.inicio, valor);
        if (formato) m.elemento.setAttributes(m.inicio, m.inicio + valor.length - 1, formato);
      }
    }
  }

  /** Formato del texto en `offset` sin los atributos vacíos (un null en setAttributes no debe borrar nada). */
  function formatoDe_(elemento, offset) {
    try {
      const todos = elemento.getAttributes(offset);
      const formato = {};
      Object.keys(todos).forEach((k) => { if (todos[k] !== null && todos[k] !== undefined) formato[k] = todos[k]; });
      return Object.keys(formato).length ? formato : null;
    } catch (e) {
      return null;
    }
  }

  return { PLANTILLAS, PLANTILLAS_APPSHEET, generarPdfDesdePlantilla };
})();
