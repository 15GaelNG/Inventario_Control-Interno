/**
 * PdfHtml.gs — llenar una plantilla HTML de documento (experimento, 10-nov-2026).
 *
 * La idea: en vez de copiar un Google Doc, llenarlo y exportarlo (10-30 s y frágil), el documento es un HTML con
 * medidas en puntos (hoja carta, 612 × 792 pt) y el servidor lo convierte a PDF. Esto solo LLENA: no sabe de hojas ni
 * de Drive, así que también corre en node (tests y la vista previa local).
 *
 * Marcadores (dentro del HTML de src/html/pdf/<documento>.html):
 *   {{CAMPO}}            el valor de la columna, escapado
 *   {{SI:CAMPO}}         ✓ si el valor es SI (casillas de "se entrega")
 *   {{NO:CAMPO}}         ✓ si el valor es NO
 *   {{IMG:CAMPO:AxB}}    la imagen de esa firma, a lo más A × B pt, sin deformar (agranda o achica, como Docs)
 *   {{LOGO}}             el logo (data URI)
 *   (las @font-face de la tipografía las pone llenar() solo, al inicio del <head>, si llegan en recursos.fuentes)
 *
 * Las tipografías y el logo NO van en el repo (es público y la tipografía es comercial): llegan en `recursos`, que el
 * servidor lee de Drive.
 */
const PdfHtml = (function () {
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const PALOMITA = '✓';

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

  function imagen(img, maxAncho, maxAlto) {
    if (!img || !img.base64) return '';
    const m = medidas(img.base64);
    let estilo = 'max-width:' + maxAncho + 'pt;max-height:' + maxAlto + 'pt';
    if (m && m.w && m.h) {
      const k = Math.min(maxAncho / m.w, maxAlto / m.h);
      estilo = 'width:' + (m.w * k).toFixed(2) + 'pt;height:' + (m.h * k).toFixed(2) + 'pt';
    }
    return '<img src="data:' + (img.mimeType || 'image/png') + ';base64,' + img.base64 + '" style="' + estilo + '">';
  }

  function fuentes(f, familia) {
    if (!f) return '';
    const cara = (archivo, peso, estilo) => (f[archivo] ? '@font-face{font-family:"' + familia + '";src:url(data:font/ttf;base64,' +
      f[archivo] + ') format("truetype");font-weight:' + peso + ';font-style:' + estilo + '}' : '');
    return cara('regular', 400, 'normal') + cara('bold', 700, 'normal') + cara('italic', 400, 'italic') + cara('boldItalic', 700, 'italic');
  }

  /**
   * @param {string} plantilla  el HTML con marcadores
   * @param {Object} datos      { COLUMNA: valor }
   * @param {Object} imagenes   { 'FIRMA RESPONSABLE': { base64, mimeType } }
   * @param {Object} recursos   { logo: { base64, mimeType }, fuentes: { regular, bold, italic, boldItalic } (base64) }
   */
  /** Una fecha (Date o "aaaa-mm-dd…") como la escribe el documento: dd/mm/aaaa. Lo demás, tal cual */
  function texto(v) {
    if (Object.prototype.toString.call(v) === '[object Date]') {
      if (isNaN(v.getTime())) return '';
      return ('0' + v.getDate()).slice(-2) + '/' + ('0' + (v.getMonth() + 1)).slice(-2) + '/' + v.getFullYear();
    }
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?Z?)?$/.exec(String(v == null ? '' : v).trim());
    return iso ? iso[3] + '/' + iso[2] + '/' + iso[1] : (v == null ? '' : v);
  }

  function llenar(plantilla, datos, imagenes, recursos) {
    const d = datos || {};
    const r = recursos || {};
    const valor = (c) => (d[c] === undefined ? '' : texto(d[c]));
    // Las @font-face van en su propio <style> al inicio del <head>: un marcador dentro del CSS lo tira el compresor
    // de `npm run push` (no es CSS válido) y el documento sale en Arial
    const conFuentes = r.fuentes ? plantilla.replace(/<head>/i, '<head><style>' + fuentes(r.fuentes, 'Century Gothic Doc') + '</style>') : plantilla;
    return conFuentes.replace(/\{\{([^{}]+)\}\}/g, (todo, marcador) => {
      const m = marcador.trim();
      if (m === 'LOGO') return r.logo ? 'data:' + (r.logo.mimeType || 'image/png') + ';base64,' + r.logo.base64 : '';
      let x = /^(SI|NO):(.+)$/.exec(m);
      if (x) return String(valor(x[2].trim())).trim().toUpperCase() === x[1] ? PALOMITA : '';
      x = /^IMG:(.+):(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(m);
      if (x) return imagen((imagenes || {})[x[1].trim()], Number(x[2]), Number(x[3]));
      return esc(valor(m));
    });
  }

  return { llenar, medidas, esc };
})();
