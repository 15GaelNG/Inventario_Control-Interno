/**
 * PdfHtml.gs — los documentos del sistema (responsivas, inspecciones, arqueo) como HTML convertido a PDF (10-nov-2026).
 *
 * En vez de copiar un Google Doc, llenarlo y exportarlo (10-30 s y frágil), cada documento es un HTML con medidas en
 * puntos (hoja carta, 612 × 792 pt) en src/html/pdf/<documento>.html, y el convertidor de Apps Script lo pasa a PDF
 * (Utilities.newBlob(html, 'text/html').getAs('application/pdf')). PdfService.generar({ html: '<documento>' }) lo usa;
 * el proceso para replicar un documento y comprobarlo contra los PDF reales está en docs/pdf-motor.md.
 *
 * Marcadores (dentro del HTML):
 *   {{CAMPO}}              el valor de la columna, escapado (una fecha: dd/mm/aaaa)
 *   {{SI:CAMPO}}           ✓ si el valor es SI (casillas)            {{NO:CAMPO}}  ✓ si es NO
 *   {{IMG:CAMPO:AxB}}      la imagen (firma, diagrama), a lo más A × B pt, sin deformar (agranda o achica, como Docs)
 *   {{IMG:CAMPO:AxB:tope}} igual, pero nunca más grande que su tamaño natural (1 pixel = 0.75 pt): como insertaba Docs una
 *                          imagen suelta que luego solo se achicaba (Líneas, LineasPdf)
 *   {{IMG:CAMPO:AxB:tope:linea}}  además, en su renglón cuenta solo su alto ÷ 1.211 (lo de arriba se encima), como en
 *                          Docs con el interlineado de AppSheet que le pone LineasPdf: una firma no empuja la hoja
 *   {{LOGO:nombre}}        el logo (data URI) del archivo logo-<nombre>.png de RECURSOS PDF
 *   {{HTML:CLAVE}}         un pedazo de HTML que ya armó (y escapó) el servicio del documento: tablas que dependen del tipo
 *   {{#SI CAMPO}}…{{/SI}}  el bloque solo si el campo trae algo         {{#VACIO CAMPO}}…{{/VACIO}}  solo si viene vacío
 *
 * Lo que el convertidor exige (medido el 10-nov contra 10 responsivas reales; docs/pdf-motor.md):
 *   - la tipografía INCRUSTADA (no tiene fuentes instaladas ni carga URLs): llenar() pone las @font-face en su propio
 *     <style> al inicio del <head> (un marcador dentro del CSS lo tira el compresor de `npm run push`);
 *   - `text-rendering: geometricPrecision` en el body: sin eso redondea cada letra a pixeles y los renglones cortan distinto.
 *
 * Las tipografías (comerciales) y los logos NO van en el repo (es público): viven en la carpeta RECURSOS PDF de la raíz
 * de cada proyecto como <Familia>-<regular|bold|italic|boldItalic>.ttf y logo-<nombre>.png, y se guardan en la caché.
 * La parte de llenar no toca Drive: también corre en node (tests/pdf-html.test.cjs).
 */
const PdfHtml = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const PALOMITA = '✓';

  /**
   * Qué documento ya sale del HTML. En un DEV en cuanto pasa su comparación con los PDF reales; en producción solo con
   * autorización. Con false, el documento sigue saliendo del Google Doc de siempre.
   */
  const DOCUMENTOS = {
    'responsiva-vehicular': { dev: true, prod: false },
    'adherente-vehicular': { dev: true, prod: false },
    'arqueo': { dev: true, prod: false },
    // Igual en 9 de 10 contra prod en el Chrome local (tools/pdf/html/local.js); se enciende en DEV al confirmarla con
    // el convertidor de Apps Script (pedir.js)
    'responsiva-celular': { dev: false, prod: false },
  };
  const encendido = (documento) => {
    const d = DOCUMENTOS[documento];
    if (!d) return false;
    return typeof Config !== 'undefined' && Config.ENTORNO === 'PROD' ? !!d.prod : !!d.dev;
  };

  // ------------------------------------------------------------------ llenar (sin Drive)

  /** Ancho y alto en pixeles de un PNG o JPEG en base64 (sin abrir la imagen) */
  function medidas(base64) {
    const b = base64ABytes_(base64.slice(0, 64 * 1024));
    if (b[0] === 0x89 && b[1] === 0x50) {
      return { w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 };
    }
    for (let i = 2; i < b.length - 9;) {   // JPEG: el primer SOFn
      if (b[i] !== 0xFF) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: b[i + 5] << 8 | b[i + 6], w: b[i + 7] << 8 | b[i + 8] };
      i += 2 + (b[i + 2] << 8 | b[i + 3]);
    }
    return null;
  }
  function base64ABytes_(s) {
    const limpio = s.slice(0, s.length - (s.length % 4));
    if (typeof Utilities !== 'undefined') return Utilities.base64Decode(limpio).map((x) => x & 0xFF);
    return Array.from(Buffer.from(limpio, 'base64'));
  }

  function imagen(img, maxAncho, maxAlto, tope, linea) {
    if (!img || !img.base64) return '';
    const m = medidas(img.base64);
    let estilo = 'max-width:' + maxAncho + 'pt;max-height:' + maxAlto + 'pt';
    if (m && m.w && m.h) {
      const k = Math.min(maxAncho / m.w, maxAlto / m.h, tope ? 0.75 : Infinity);
      estilo = 'width:' + (m.w * k).toFixed(2) + 'pt;height:' + (m.h * k).toFixed(2) + 'pt';
      // Una imagen en el renglón cuenta con su margen: uno negativo arriba hace que cuente menos y se encime
      if (linea) estilo += ';margin-top:-' + (m.h * k * (1 - 1 / 1.211)).toFixed(2) + 'pt';
    }
    return '<img src="data:' + (img.mimeType || 'image/png') + ';base64,' + img.base64 + '" style="' + estilo + '">';
  }

  const CARAS = { regular: [400, 'normal'], bold: [700, 'normal'], italic: [400, 'italic'], boldItalic: [700, 'italic'] };
  /** Las @font-face de las familias que el documento nombra (las demás no se incrustan: pesan) */
  function fuentes(familias, plantilla) {
    return Object.keys(familias || {}).filter((f) => plantilla.indexOf(f) !== -1).map((f) =>
      Object.keys(CARAS).filter((c) => familias[f][c]).map((c) => '@font-face{font-family:"' + f + '";src:url(data:font/ttf;base64,' +
        familias[f][c] + ') format("truetype");font-weight:' + CARAS[c][0] + ';font-style:' + CARAS[c][1] + '}').join('')).join('');
  }

  /** Una fecha (Date o "aaaa-mm-dd…") como la escribe el documento: dd/mm/aaaa. Lo demás, tal cual */
  function texto(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?Z?)?$/.exec(String(v == null ? '' : v).trim());
    return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : (v == null ? '' : v);
  }

  /**
   * @param {string} plantilla  el HTML con marcadores
   * @param {Object} datos      { COLUMNA: valor }
   * @param {Object} imagenes   { 'FIRMA RESPONSABLE': { base64, mimeType } }
   * @param {Object} recursos   { fuentes: { Familia: { regular, bold, italic, boldItalic } }, logos: { nombre: { base64, mimeType } } }
   * @param {Object} [opciones] { aviso: 'VISTA PREVIA — AÚN SIN FIRMAR' } (un letrero arriba de la primera hoja)
   * @return {string} el HTML listo para convertir
   */
  function llenar(plantilla, datos, imagenes, recursos, opciones) {
    const d = datos || {};
    const r = recursos || {};
    const o = opciones || {};
    const valor = (c) => (d[c] === undefined ? '' : texto(d[c]));
    const lleno = (c) => String(valor(c)).trim() !== '';
    let html = plantilla
      .replace(/\{\{#SI ([^{}]+)\}\}([\s\S]*?)\{\{\/SI\}\}/g, (t, c, bloque) => (lleno(c.trim()) ? bloque : ''))
      .replace(/\{\{#VACIO ([^{}]+)\}\}([\s\S]*?)\{\{\/VACIO\}\}/g, (t, c, bloque) => (lleno(c.trim()) ? '' : bloque));
    // Las @font-face en su propio <style> al inicio del <head>: un marcador dentro del CSS lo tira el compresor
    const caras = fuentes(r.fuentes, html);
    if (caras) html = html.replace(/<head>/i, '<head><style>' + caras + '</style>');
    if (o.aviso) {
      html = html.replace(/<body([^>]*)>/i, '<body$1><div style="position:absolute;left:0;top:2pt;width:612pt;text-align:center;' +
        'font-weight:700;font-size:14pt;color:#8a6d3a;z-index:9">' + esc(o.aviso) + '</div>');
    }
    return html.replace(/\{\{(?![#/])([^{}]+)\}\}/g, (todo, marcador) => {
      const m = marcador.trim();
      let x = /^LOGO(?::(.+))?$/.exec(m);
      if (x) {
        const logos = r.logos || {};
        const l = logos[(x[1] || '').trim()] || logos[Object.keys(logos)[0]];
        return l ? 'data:' + (l.mimeType || 'image/png') + ';base64,' + l.base64 : '';
      }
      x = /^(SI|NO):(.+)$/.exec(m);
      if (x) return String(valor(x[2].trim())).trim().toUpperCase() === x[1] ? PALOMITA : '';
      x = /^IMG:(.+?):(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)((?::(?:tope|linea))*)$/.exec(m);
      if (x) return imagen((imagenes || {})[x[1].trim()], Number(x[2]), Number(x[3]), /:tope/.test(x[4]), /:linea/.test(x[4]));
      x = /^HTML:(.+)$/.exec(m);
      if (x) return String(d[x[1].trim()] == null ? '' : d[x[1].trim()]);
      return esc(valor(m));
    });
  }

  /** Los campos que la plantilla pide y no llegaron en `datos` (como sinResolver del motor de Docs) */
  function faltantes(plantilla, datos) {
    const d = datos || {};
    const vistos = {};
    (plantilla.match(/\{\{[^{}]+\}\}/g) || []).forEach((t) => {
      const m = t.slice(2, -2).trim().replace(/^#(SI|VACIO) /, '').replace(/^(SI|NO|HTML):/, '');
      if (/^(LOGO|IMG:|\/)/.test(m)) return;
      if (d[m] === undefined) vistos[m] = true;
    });
    return Object.keys(vistos);
  }

  // ------------------------------------------------------------------ servidor (Drive, caché, convertir)

  const CARPETA_RECURSOS = 'RECURSOS PDF';
  const TROZO = 90 * 1000;   // CacheService guarda hasta 100 KB por clave

  /** Un archivo de RECURSOS PDF en base64, guardado en la caché por trozos (6 h) */
  function base64De_(archivo) {
    const cache = CacheService.getScriptCache();
    const clave = 'pdfrec_' + archivo.getId() + '_' + archivo.getLastUpdated().getTime();
    const n = Number(cache.get(clave) || 0);
    if (n) {
      const trozos = cache.getAll(Array.from({ length: n }, (_, i) => clave + '_' + i));
      const unido = Array.from({ length: n }, (_, i) => trozos[clave + '_' + i]);
      if (unido.every((t) => t)) return unido.join('');
    }
    const b64 = Utilities.base64Encode(archivo.getBlob().getBytes());
    const guardar = {};
    for (let i = 0; i * TROZO < b64.length; i++) guardar[clave + '_' + i] = b64.slice(i * TROZO, (i + 1) * TROZO);
    try {
      cache.putAll(guardar, 6 * 60 * 60);
      cache.put(clave, String(Object.keys(guardar).length), 6 * 60 * 60);
    } catch (e) { /* sin caché: se lee de Drive la próxima vez */ }
    return b64;
  }

  /** Las tipografías y los logos de RECURSOS PDF: { fuentes: { Familia: { cara: base64 } }, logos: { nombre: {…} } } */
  function recursos() {
    const salida = { fuentes: {}, logos: {} };
    const archivos = DriveUtils.carpetaEnRaiz(CARPETA_RECURSOS).getFiles();
    while (archivos.hasNext()) {
      const a = archivos.next();
      const n = a.getName();
      let x = /^(.+)-(regular|bold|italic|boldItalic)\.ttf$/.exec(n);
      if (x) { (salida.fuentes[x[1]] = salida.fuentes[x[1]] || {})[x[2]] = base64De_(a); continue; }
      x = /^logo-(.+)\.(png|jpe?g)$/i.exec(n);
      if (x) salida.logos[x[1]] = { base64: base64De_(a), mimeType: x[2].toLowerCase() === 'png' ? 'image/png' : 'image/jpeg' };
    }
    return salida;
  }

  function plantilla(documento) {
    if (!/^[\w-]+$/.test(documento || '')) throw new Error('Documento HTML no válido: ' + documento);
    return HtmlService.createHtmlOutputFromFile('html/pdf/' + documento).getContent();
  }

  /**
   * El PDF de un documento: { blob, sinResolver }. imagenes acepta { base64, mimeType } o { blob } (un archivo de Drive,
   * como los diagramas en blanco).
   */
  function pdf(documento, datos, imagenes, opciones) {
    const p = plantilla(documento);
    const imgs = {};
    Object.keys(imagenes || {}).forEach((k) => {
      const i = imagenes[k];
      if (!i) return;
      imgs[k] = i.base64 ? i : (i.blob ? { base64: Utilities.base64Encode(i.blob.getBytes()), mimeType: i.blob.getContentType() } : null);
    });
    const html = llenar(p, datos, imgs, recursos(), opciones);
    return { blob: Utilities.newBlob(html, 'text/html', documento + '.html').getAs('application/pdf'), sinResolver: faltantes(p, datos) };
  }

  /**
   * Copia a RECURSOS PDF (en la raíz de ESTE proyecto) las tipografías y logos que hay en otra carpeta: así se instala
   * cada entorno sin subir nada al repo. Reemplaza los que tengan el mismo nombre. → los nombres copiados
   */
  function instalarRecursos(origenId) {
    const destino = DriveUtils.carpetaEnRaiz(CARPETA_RECURSOS);
    const copiados = [];
    const archivos = DriveApp.getFolderById(origenId).getFiles();
    while (archivos.hasNext()) {
      const a = archivos.next();
      const n = a.getName();
      if (!/^(.+-(regular|bold|italic|boldItalic)\.ttf|logo-.+\.(png|jpe?g))$/i.test(n)) continue;
      const viejos = destino.getFilesByName(n);
      while (viejos.hasNext()) DriveUtils.aPapelera(viejos.next());
      DriveUtils.copiar(a, n, destino);
      copiados.push(n);
    }
    return copiados;
  }

  return { DOCUMENTOS, encendido, llenar, faltantes, medidas, esc, texto, recursos, plantilla, pdf, instalarRecursos, CARPETA_RECURSOS };
})();

/**
 * Desde el editor (cualquier proyecto, también producción): instala las tipografías y logos de los documentos HTML en
 * RECURSOS PDF de este proyecto, copiándolos de la carpeta `origenId` (la que deja tools/pdf/html/recursos.py).
 */
function pdfRecursosInstalar(origenId) {
  soloEditor_();
  const r = PdfHtml.instalarRecursos(origenId);
  console.log('Instalados en ' + PdfHtml.CARPETA_RECURSOS + ': ' + (r.join(', ') || 'nada'));
  return r;
}
