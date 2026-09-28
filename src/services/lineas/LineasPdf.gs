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
  const PLANTILLAS = {
    INSPECCION_CELULAR: '1YVYDhQ9aWOEjkqxO8_4AvHdmP3f91W7QVRB8C9kjlUI',
    RESPONSIVA_CELULAR: '1EfSbZaQwl6c3ylQ1Z60gxjOeIXAqZ7g1_IN-qfw-pMc',
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
   */
  function generarPdfDesdePlantilla(plantillaId, registro, imagenes, carpeta, nombrePdf) {
    const avisos = [];
    const copia = DriveApp.getFileById(plantillaId).makeCopy('TMP ' + nombrePdf, carpeta);
    try {
      const doc = DocumentApp.openById(copia.getId());
      const secciones = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(Boolean);
      secciones.forEach((seccion) => {
        procesarBloquesIf_(seccion, registro, avisos);
        reemplazarEtiquetas_(seccion, registro, imagenes || {}, avisos);
      });
      doc.saveAndClose();
      const pdf = carpeta.createFile(copia.getAs('application/pdf').setName(nombrePdf));
      // Sin esto, el PDF solo lo puede ver la cuenta que despliega la app
      // (quien lo creó) — nadie más puede abrir el link, aunque sea válido.
      pdf.setSharing(DriveApp.Access.DOMAIN, DriveApp.Permission.VIEW);
      return { id: pdf.getId(), nombre: pdf.getName(), url: pdf.getUrl(), avisos: avisos };
    } finally {
      copia.setTrashed(true); // la copia temporal es nuestra; la plantilla original no se toca
    }
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
      if (valor === '') {
        m.elemento.deleteText(m.inicio, m.fin);
      } else {
        m.elemento.deleteText(m.inicio, m.fin);
        m.elemento.insertText(m.inicio, valor);
      }
    }
  }

  return { PLANTILLAS, generarPdfDesdePlantilla };
})();
