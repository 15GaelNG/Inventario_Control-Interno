/**
 * LineasPatronPng.gs
 * Imagen del patrón de desbloqueo para el PDF, dibujada en el servidor. La dibuja el navegador al capturar
 * (activarPatron → base64 en lineas.html) y viaja con las firmas; al regenerar un PDF cuando ya no está, se dibuja aquí
 * con los puntos guardados ("1-5-9"), sin mandarlos al navegador (solo los ven ADMIN y el área de Líneas). Mismo dibujo: 300 × 300, trazo
 * azul, flechas doradas hacia donde va cada tramo, cada punto con su orden (anillo dorado en el inicio) y los 9 puntos:
 * los que no se usan, grises y chicos, como en pantalla (svgPatron; usuario, 6-oct).
 * Apps Script no convierte SVG a PNG: se pinta pixel por pixel y el PNG se arma a mano (paleta, sin compresión).
 */

const LineasPatronPng = (function () {
  const LADO = 300;
  const POSICIONES = [[50, 50], [150, 50], [250, 50], [50, 150], [150, 150], [250, 150], [50, 250], [150, 250], [250, 250]];
  // Paleta: 0 = fondo de la celda del PDF, 1 = trazo y puntos, 2 = flechas y anillo, 3 = números, 4 = puntos sin usar
  const AZUL = [0x0b, 0x5d, 0x7a];
  const DORADO = [0xc9, 0xa2, 0x27];
  const BLANCO = [0xff, 0xff, 0xff];
  const GRIS = [0xb8, 0xc4, 0xca];
  // Números en 5 × 7, a 3× (15 × 21 px dentro del punto de 32 px)
  const DIGITOS = {
    1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
    3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
    4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
    5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
    7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
    9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  };

  /** "1-5-9" → [1, 5, 9]; null si no son puntos (p. ej. la ruta de una imagen del AppSheet). */
  function puntos(valor) {
    const v = String(valor === null || valor === undefined ? '' : valor).trim();
    return /^[1-9](-[1-9])*$/.test(v) ? v.split('-').map(Number) : null;
  }

  /** Igual que flechasPatron de lineas.html: triángulos [x1,y1, x2,y2, x3,y3] en los espacios libres de cada tramo. */
  function flechas_(pts, t) {
    const mcd = (x, y) => (y ? mcd(y, x % y) : x);
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = POSICIONES[pts[i - 1] - 1];
      const b = POSICIONES[pts[i] - 1];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const pasos = Math.max(1, mcd(Math.abs(b[0] - a[0]) / 100, Math.abs(b[1] - a[1]) / 100));
      for (let k = 0; k < pasos; k++) {
        const f = (2 * k + 1) / (2 * pasos);
        const cx = a[0] + (b[0] - a[0]) * f + Math.cos(ang) * t * 0.3;
        const cy = a[1] + (b[1] - a[1]) * f + Math.sin(ang) * t * 0.3;
        const p = (d, r) => [cx + Math.cos(ang + d) * r, cy + Math.sin(ang + d) * r];
        out.push([].concat(p(0, t * 0.6), p(Math.PI * 0.75, t), p(-Math.PI * 0.75, t)));
      }
    }
    return out;
  }

  function lienzo_() {
    const px = new Uint8Array(LADO * LADO);
    const pintar = (x0, y0, x1, y1, dentro, color) => {
      for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(LADO - 1, Math.ceil(y1)); y++) {
        for (let x = Math.max(0, Math.floor(x0)); x <= Math.min(LADO - 1, Math.ceil(x1)); x++) {
          if (dentro(x + 0.5, y + 0.5)) px[y * LADO + x] = color;
        }
      }
    };
    return {
      px,
      tramo(a, b, ancho, color) {
        const r = ancho / 2;
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        pintar(Math.min(a[0], b[0]) - r, Math.min(a[1], b[1]) - r, Math.max(a[0], b[0]) + r, Math.max(a[1], b[1]) + r, (x, y) => {
          const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l2));
          const ex = a[0] + t * dx - x, ey = a[1] + t * dy - y;
          return ex * ex + ey * ey <= r * r;
        }, color);
      },
      circulo(c, r, color) {
        pintar(c[0] - r, c[1] - r, c[0] + r, c[1] + r, (x, y) => (x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) <= r * r, color);
      },
      anillo(c, r, ancho, color) {
        const e = r + ancho / 2;
        pintar(c[0] - e, c[1] - e, c[0] + e, c[1] + e, (x, y) => Math.abs(Math.hypot(x - c[0], y - c[1]) - r) <= ancho / 2, color);
      },
      triangulo(t, color) {
        const lado = (x, y, i, j) => (t[j] - t[i]) * (y - t[i + 1]) - (t[j + 1] - t[i + 1]) * (x - t[i]);
        pintar(Math.min(t[0], t[2], t[4]), Math.min(t[1], t[3], t[5]), Math.max(t[0], t[2], t[4]), Math.max(t[1], t[3], t[5]), (x, y) => {
          const a = lado(x, y, 0, 2), b = lado(x, y, 2, 4), c = lado(x, y, 4, 0);
          return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
        }, color);
      },
      digito(c, n, color) {
        const g = DIGITOS[n];
        const x0 = Math.round(c[0] - 7.5), y0 = Math.round(c[1] - 10.5);
        g.forEach((fila, j) => fila.split('').forEach((b, i) => {
          if (b === '1') pintar(x0 + i * 3, y0 + j * 3, x0 + i * 3 + 2, y0 + j * 3 + 2, () => true, color);
        }));
      },
    };
  }

  // ---------------- PNG (paleta de 8 bits, IDAT con bloques "stored" de deflate) ----------------

  const TABLA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32_(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  const u32_ = (n) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
  function bloque_(tipo, datos) {
    const cuerpo = tipo.split('').map((c) => c.charCodeAt(0)).concat(Array.from(datos));
    return u32_(datos.length).concat(cuerpo, u32_(crc32_(cuerpo)));
  }
  function zlibSinComprimir_(datos) {
    const out = [0x78, 0x01];
    for (let i = 0; i < datos.length || i === 0; i += 65535) {
      const parte = datos.subarray(i, Math.min(datos.length, i + 65535));
      const ultimo = i + 65535 >= datos.length ? 1 : 0;
      out.push(ultimo, parte.length & 0xff, parte.length >>> 8, ~parte.length & 0xff, (~parte.length >>> 8) & 0xff);
      for (let k = 0; k < parte.length; k++) out.push(parte[k]);
    }
    let a = 1, b = 0;
    for (let i = 0; i < datos.length; i++) { a = (a + datos[i]) % 65521; b = (b + a) % 65521; }
    return out.concat(u32_(((b << 16) | a) >>> 0));
  }
  function png_(px, paleta) {
    const crudo = new Uint8Array(LADO * (LADO + 1));
    for (let y = 0; y < LADO; y++) crudo.set(px.subarray(y * LADO, (y + 1) * LADO), y * (LADO + 1) + 1); // filtro 0 por renglón
    return [137, 80, 78, 71, 13, 10, 26, 10]
      .concat(bloque_('IHDR', u32_(LADO).concat(u32_(LADO), [8, 3, 0, 0, 0])))
      .concat(bloque_('PLTE', [].concat.apply([], paleta)))
      .concat(bloque_('IDAT', zlibSinComprimir_(crudo)))
      .concat(bloque_('IEND', []));
  }

  function rgb_(hex) {
    const m = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
    const n = m ? parseInt(m[1], 16) : 0xffffff;
    return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
  }

  /** Bytes del PNG del patrón (0-255), o null sin puntos. `fondo`: color de la celda ("#ffffff" responsiva, "#ddebf7" inspección). */
  function dibujar(pts, fondo) {
    if (!pts || !pts.length) return null;
    const l = lienzo_();
    for (let i = 1; i < pts.length; i++) l.tramo(POSICIONES[pts[i - 1] - 1], POSICIONES[pts[i] - 1], 8, 1);
    flechas_(pts, 24).forEach((f) => l.triangulo(f, 2));
    // Los que no se usan, encima del trazo (un tramo 1→3 pasa por el 2)
    POSICIONES.forEach((p, i) => { if (pts.indexOf(i + 1) < 0) l.circulo(p, 10, 4); });
    pts.forEach((n, i) => {
      const p = POSICIONES[n - 1];
      l.circulo(p, 16, 1);
      if (!i) l.anillo(p, 20, 5, 2);
      l.digito([p[0], p[1] + 1], i + 1, 3);
    });
    return png_(l.px, [rgb_(fondo), AZUL, DORADO, BLANCO, GRIS]);
  }

  /** Blob PNG para la plantilla a partir del valor guardado ("1-5-9"); null si no es un patrón. */
  function blob(valor, fondo, nombre) {
    const bytes = dibujar(puntos(valor), fondo);
    return bytes ? Utilities.newBlob(bytes.map((b) => (b > 127 ? b - 256 : b)), 'image/png', nombre || 'patron.png') : null;
  }

  return { puntos, dibujar, blob };
})();
