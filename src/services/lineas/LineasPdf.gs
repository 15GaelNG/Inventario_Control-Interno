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
   * RESPONSIVAS_LINEAS), con «Comentario» (lineasPlantillasComentario_copiar, 6-oct).
   */
  const PLANTILLAS = {
    INSPECCION_CELULAR: '11l9vL9KK4T1vawnI-X0arnNTMHDa53Y92kmO-m5Alw4',
    RESPONSIVA_CELULAR: '13qeTsLmV5FiRxgNI9hbb_8BH83olIiSVB6GdXNbXIF0',
  };

  // Cómo imprime el AppSheet ("Task for GENERAR PDF": carta, márgenes de la tarea en 0): convierte el Doc a HTML y lo
  // imprime con Chromium. Los márgenes del Doc (responsiva: 14.2 pt arriba y a los lados, 0 abajo) se respetan, y el
  // interlineado (1.0 / 1.15 / 1.5) se aplica sobre el tamaño de la letra; Google Docs lo aplica sobre la altura
  // natural de la fuente (Century Gothic: 1.211 veces la letra) y la responsiva salía en 3 hojas (5-oct). Un párrafo
  // vacío en ese HTML mide 11 pt. Sin interlineado propio, el párrafo toma el del estilo Normal (responsiva: 1.0). La
  // hoja 2 empieza en las sanciones: en el AppSheet el título cae ahí por espacio.
  const COMO_APPSHEET = {
    [PLANTILLAS.RESPONSIVA_CELULAR]: { altoFuente: 1.211, altoVacio: 11, interlineadoNormal: 1, saltoAntesDe: 'SANCIONES POR MAL MANEJO' },
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
      secciones.forEach((seccion) => {
        procesarBloquesIf_(seccion, registro, avisos);
        reemplazarEtiquetas_(seccion, registro, imagenes || {}, avisos);
      });
      if (COMO_APPSHEET[plantillaId]) ajustarComoAppSheet_(doc.getBody(), COMO_APPSHEET[plantillaId], avisos);
      doc.saveAndClose();
      const pdf = carpeta.createFile(copia.getAs('application/pdf').setName(nombrePdf));
      // Sin esto, el PDF solo lo puede ver la cuenta que despliega la app
      // (quien lo creó) — nadie más puede abrir el link, aunque sea válido.
      if (!sinCompartir) pdf.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
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
        const conSalto = vacios.length ? vacios.shift() : body.insertParagraph(body.getChildIndex(titulo), '');
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
              // Firmas: llegan recortadas al trazo (componente Firma); caben en 160 × 70 sin deformarse
              const escala = Math.min(1, 160 / ancho, 70 / alto);
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
      try {
        const esColumnaSimple = /^[^\[\]"()&*+<>=]+$/.test(interior) && !/^[\d.]+$/.test(interior);
        valor = aTexto_(esColumnaSimple ? valorColumna_(registro, interior) : evaluarExpresion_(interior, registro));
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

  // ---------------- Copias del sistema de las plantillas (parte 6, pendiente 2.3; usuario, 6-oct) ----------------
  // La plantilla del AppSheet no se toca: se copia en su misma carpeta y en la copia «Observaciones» pasa a «Comentario»,
  // con su marcador ([COMENTARIO]; las columnas de LineasDatos.COLUMNAS_RENOMBRADAS).
  // Se corre desde LineasAdmin (lineasPlantillasComentario_revisar / _copiar).

  /** `nuevo` (en mayúsculas) escrito como `palabra`: OBSERVACIONES → COMENTARIO, Observaciones → Comentario, … */
  function comoEscrito_(palabra, nuevo) {
    if (palabra === palabra.toUpperCase()) return nuevo;
    const minus = nuevo.toLowerCase();
    return palabra.charAt(0) === palabra.charAt(0).toUpperCase() ? minus.charAt(0).toUpperCase() + minus.slice(1) : minus;
  }

  /**
   * Qué cambiar en un texto de la plantilla. mapa = { VIEJO: NUEVO }. Fuera de un marcador es el título que se lee;
   * dentro, solo la columna sola ([OBSERVACIONES] o <<OBSERVACIONES>>). Una columna que solo la contiene
   * ([TITULO_CALIFICACION OBSERVACIONES Y FIRMAS]) es otra y no se toca: despues = null.
   * Regresa [{ inicio, fin (exclusivo), antes, despues, marcador }].
   */
  function renombresEnTexto(texto, mapa) {
    const s = String(texto || '');
    const viejos = Object.keys(mapa || {});
    if (!viejos.length) return [];
    const marcadores = [];
    const reMarcador = /<<[^<>]*>>/g;
    let m;
    while ((m = reMarcador.exec(s)) !== null) marcadores.push([m.index, m.index + m[0].length]);
    const letra = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ_';
    const re = new RegExp('(^|[^' + letra + '])(' + viejos.join('|') + ')(?![' + letra + '])', 'gi');
    const salida = [];
    while ((m = re.exec(s)) !== null) {
      const inicio = m.index + m[1].length;
      const fin = inicio + m[2].length;
      const nuevo = mapa[m[2].toUpperCase()];
      const marcador = marcadores.filter((r) => inicio > r[0] && fin < r[1])[0];
      if (!marcador) { salida.push({ inicio: inicio, fin: fin, antes: m[2], despues: comoEscrito_(m[2], nuevo), marcador: null }); continue; }
      const sola = (s.charAt(inicio - 1) === '[' && s.charAt(fin) === ']') || (inicio === marcador[0] + 2 && fin === marcador[1] - 2);
      salida.push({ inicio: inicio, fin: fin, antes: m[2], despues: sola ? nuevo : null, marcador: s.slice(marcador[0], marcador[1]) });
    }
    return salida;
  }

  /** Lo que renombresEnTexto encuentra en el Doc, con su contexto; con `aplicar` lo cambia conservando el formato. */
  function renombrarEnDoc_(doc, mapa, aplicar) {
    const encontrados = [];
    [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(Boolean).forEach((seccion) => {
      buscarTodas_(seccion, '[\\s\\S]+').forEach((bloque) => {
        const cambios = renombresEnTexto(bloque.etiqueta, mapa);
        cambios.forEach((c) => encontrados.push({
          antes: c.antes, despues: c.despues, marcador: c.marcador,
          contexto: bloque.etiqueta.slice(Math.max(0, c.inicio - 30), c.fin + 30).replace(/\s+/g, ' '),
        }));
        if (!aplicar) return;
        cambios.filter((c) => c.despues).reverse().forEach((c) => {
          const formato = formatoDe_(bloque.elemento, c.inicio);
          bloque.elemento.deleteText(c.inicio, c.fin - 1);
          bloque.elemento.insertText(c.inicio, c.despues);
          if (formato) bloque.elemento.setAttributes(c.inicio, c.inicio + c.despues.length - 1, formato);
        });
      });
    });
    return encontrados;
  }

  /** Carpeta de la plantilla y nombre de su copia del sistema. */
  function datosCopia_(plantillaId) {
    const original = DriveApp.getFileById(plantillaId);
    const padres = original.getParents();
    if (!padres.hasNext()) throw new Error('La plantilla ' + original.getName() + ' no está en una carpeta que se pueda leer.');
    return { original: original, carpeta: padres.next(), nombre: original.getName() + ' (SISTEMA)' };
  }

  /** Sin escribir nada: qué se cambiaría en la plantilla, dónde quedaría la copia y si ya existe. */
  function revisarRenombres(plantillaId, mapa) {
    const d = datosCopia_(plantillaId);
    const existente = d.carpeta.getFilesByName(d.nombre);
    return {
      plantilla: d.original.getName(), carpeta: d.carpeta.getName() + ' (' + d.carpeta.getId() + ')', copia: d.nombre,
      copiaExistente: existente.hasNext() ? existente.next().getId() : null,
      encontrados: renombrarEnDoc_(DocumentApp.openById(plantillaId), mapa, false),
    };
  }

  /** Hace la copia (si no existe ya una con ese nombre en la carpeta) y le aplica los cambios. Regresa su ID. */
  function copiaConRenombres(plantillaId, mapa) {
    const d = datosCopia_(plantillaId);
    const existente = d.carpeta.getFilesByName(d.nombre);
    if (existente.hasNext()) return { id: existente.next().getId(), nombre: d.nombre, yaExistia: true, cambios: [] };
    const copia = d.original.makeCopy(d.nombre, d.carpeta);
    const doc = DocumentApp.openById(copia.getId());
    const cambios = renombrarEnDoc_(doc, mapa, true);
    doc.saveAndClose();
    return { id: copia.getId(), nombre: d.nombre, yaExistia: false, cambios: cambios };
  }

  return { PLANTILLAS, PLANTILLAS_APPSHEET, generarPdfDesdePlantilla, renombresEnTexto, revisarRenombres, copiaConRenombres };
})();
