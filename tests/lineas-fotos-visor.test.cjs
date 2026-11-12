const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');
const API = require('./api-fuente');   // ClientApi.gs + src/api/*.gs (fase 6.3)

// Fotos de la inspección (usuario, 13-oct; pendiente 2.41): clic = visor en la misma pantalla (ampliar, pasar entre
// fotos, acercar) en vez de Drive, y quitar una foto enviada por error (a la papelera, con comentario en el historial).
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r/g, '');
const lineas = LINEAS;
const servicio = read('src/services/TelefoniaService.gs');
const cuerpo = (texto, inicio, fin) => texto.slice(texto.indexOf(inicio), texto.indexOf(fin, texto.indexOf(inicio)));

test('la galería de la inspección abre el visor; un video o una foto sin vista previa sigue yendo a Drive', () => {
  const pintar = cuerpo(lineas, 'function pintarInspeccion(detalle, id)', '    /** Desde una bitácora');
  assert.match(pintar, /const enVisor = \(f\) => !!f\.miniatura && !f\.video;/);
  assert.match(pintar, /' data-foto="' \+ n \+ '"'/);
  assert.match(pintar, /verFotos\(enGaleria, enGaleria\.indexOf\(f\), r\.puedeOperar \? \{ alQuitar: alQuitar \} : \{\}\)/);
  assert.match(pintar, /if \(ev\.ctrlKey \|\| ev\.metaKey \|\| ev\.shiftKey \|\| ev\.button === 1\) return;/);
  // Quitar: sin comentario (usuario, 13-oct), ventana por encima del visor, con espera
  assert.match(pintar, /pedirDatos\('¿Quitar foto\?', '', \[\], 'Quitar foto', \{/);
  // La espera de una ventana chica no sale aplastada
  assert.match(read('src/html/lineas-estilos.html'), /\.modal-card:not\(\.ln-captura-modal\):has\(> \.ln-espera:not\(\[hidden\]\)\) \{ min-height: 280px; \}/);
  assert.ok(read('src/html/lineas-estilos.html').includes('.modal-card:not(.ln-captura-modal) > .ln-espera { background: var(--color-surface); backdrop-filter: none; }'), 'la espera de una ventana chica tapa lo de atrás');
  assert.match(pintar, /llamar\('apiLineasQuitarFotoInspeccion', id, f\.id, ''\)/);
  assert.match(pintar, /peligro: true, encima: true, espera: 'Quitando la foto'/);
});

test('el visor: flechas, Escape, acercar con clic y la foto grande de Drive; la captura también lo usa', () => {
  const visor = cuerpo(lineas, 'function verFotos(fotos, inicio, opciones)', '    /**\n     * Lo que va al servidor');
  for (const parte of ["ev.key === 'Escape'", "ev.key === 'ArrowLeft'", "ev.key === 'ArrowRight'", 'ln-visor-cerca', 'transformOrigin', 'data-quitar', 'data-drive']) {
    assert.ok(visor.includes(parte), parte);
  }
  assert.match(lineas, /function verFotoEnGrande\(url\) \{\s+verFotos\(\[\{ grande: url \}\], 0\);/);
  assert.match(lineas, /const miniaturaDe = \(url, lado\) =>/);
  assert.match(lineas, /if \(o\.encima\) fondo\.style\.zIndex = '800';/);
  const css = read('src/html/lineas-estilos.html');
  assert.match(css, /\.ln-visor \{ position: fixed; inset: 0; z-index: 700;/);
  assert.match(css, /\.ln-visor-cerca img \{ transform: scale\(2\.5\);/);
  assert.doesNotMatch(css, /ln-ine-visor/);
});

test('el servidor solo quita una foto de esa inspección, con permiso de operar, y lo anota', () => {
  assert.match(API, /function apiLineasQuitarFotoInspeccion\(token, id, archivoId, comentario\) \{\s+return TelefoniaService\.quitarFotoInspeccion\(token, id, archivoId, comentario\);/);
  const quitar = cuerpo(servicio, 'function quitarFotoInspeccion(token, id, archivoId, comentario)', '  /**\n   * Abre un archivo');
  assert.match(quitar, /const sesion = operar_\(token\);/);
  assert.doesNotMatch(quitar, /motivo\.length/, 'el comentario no es obligatorio');
  assert.match(quitar, /const carpetas = carpetasFotos_\(doc, id\);/);
  assert.match(quitar, /carpetas\.indexOf\(c\.getId\(\)\) >= 0/);
  assert.match(quitar, /if \(!carpeta \|\| !esFotoDeInspeccion_\(archivo\.getName\(\), archivo\.getMimeType\(\)\)\) throw new Error\('La foto no es de esta inspección\.'\);/);
  assert.match(quitar, /DriveUtils\.aPapelera\(archivo\);/);   // por DriveUtils (28-oct): se anota en la bitácora
  assert.match(quitar, /'FOTOS QUITADAS'/);
  assert.match(quitar, /registrarMovimiento\('FOTO_QUITADA', \{ motivo: motivo \}/);
  assert.match(quitar, /cambios: \[\{ campo: 'FOTO', antes: nombre, despues: '' \}\]/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /FOTO_QUITADA: 'Foto quitada',/);
  // La página y quitar leen las mismas carpetas
  assert.match(servicio, /const fotos = esInspeccion \? fotosDe_\(carpetasFotos_\(doc, id\)\) : \[\];/);
});

test('clic derecho solo en la galería, y su menú no se queda encima del visor; la foto abre del tamaño final (usuario, 13-oct)', () => {
  const pintar = cuerpo(lineas, 'function pintarInspeccion(detalle, id)', '    /** Desde una bitácora');
  assert.ok(pintar.includes("a.addEventListener('contextmenu'"), 'galería');
  for (const t of ["texto: 'Ampliar'", "texto: 'Abrir en Drive'", "texto: 'Quitar foto', peligro: true"]) assert.ok(pintar.includes(t), t);
  const visor = cuerpo(lineas, 'function verFotos(fotos, inicio, opciones)', '    /**\n     * Lo que va al servidor');
  assert.ok(!visor.includes("addEventListener('contextmenu'"), 'el visor no tiene clic derecho propio');
  assert.ok(visor.includes('cerrarMenusFlotantes();'), 'al abrir el visor se cierra el menú de la galería');
  assert.ok(lineas.includes("const fuera = (ev) => { if (!menu.contains(ev.target) && (punto || !ancla.contains(ev.target))) cerrar(); };"));
  assert.ok(visor.includes("if (document.querySelector('.ln-menu-flotante')) return;"), 'Escape cierra primero el menú');
  assert.ok(lineas.includes("function menuFlotante(ancla, items, punto) {"));
  assert.ok(lineas.includes("menu.style.zIndex = '900';"), 'el menú por encima del visor');
  assert.ok(read('src/html/lineas-estilos.html').includes('.ln-visor-escena img { width: 100%; height: 100%; object-fit: contain;'));
  // Clic fuera de la foto (lo oscuro alrededor) cierra; sobre ella acerca (usuario, 13-oct)
  assert.ok(visor.includes("if (!cerca && !sobreFoto(ev)) { cerrar(); return; }"));
  assert.ok(visor.includes("img.style.cursor = cerca ? 'zoom-out' : (sobreFoto(ev) ? 'zoom-in' : 'default');"));
});

// Bajar fotos (usuario, 12-nov): seleccionar y bajar las elegidas, o todas de un jalón, en un ZIP
test('bajar fotos: el servidor arma el ZIP solo con las fotos de esa inspección; una sola va suelta', () => {
  const fuente = servicio.match(/function fotosInspeccionZip\(token, id, ids\) \{[\s\S]*?\n  \}\n/)[0];
  const blob = (nombre, n) => { let nm = nombre; return { getBytes: () => new Array(n).fill(1), getName: () => nm, setName(x) { nm = x; return this; }, getContentType: () => 'image/jpeg' }; };
  const archivos = { A: blob('a.jpg', 10), B: blob('a.jpg', 20), C: blob('c.jpg', 5) };
  const zips = [];
  const ctx = {
    inspeccion: () => ({ inspeccion: { fecha: '2026-11-12T16:00:00.000Z', nuco: '979' }, equipo: { nuco: '979' },
      fotos: [{ id: 'A', nombre: 'a.jpg' }, { id: 'B', nombre: 'a.jpg' }, { id: 'C', nombre: 'c.jpg' }] }),
    LineasUtil: { nuco4: (n) => ('000' + n).slice(-4) }, LineasDatos: { ZONA_APP: 'America/Mexico_City' },
    DriveApp: { getFileById: (id) => ({ getBlob: () => archivos[id] }) },
    Utilities: {
      formatDate: () => '12-11-2026', base64Encode: (b) => 'B64:' + b.length,
      zip: (bs, nombre) => { zips.push({ nombres: bs.map((b) => b.getName()), nombre }); return { getBytes: () => [1, 2], getContentType: () => 'application/zip' }; },
    },
    TOPE_FOTOS_BYTES: 32,
  };
  const correr = (ids) => new Function(...Object.keys(ctx), 'return (' + fuente + ')(\'T\', \'INS-1\', ' + JSON.stringify(ids) + ');')(...Object.values(ctx));
  // Las elegidas: en un ZIP con el NUCO y el día; dos con el mismo nombre no se pisan
  assert.deepEqual(correr(['A', 'B']), { nombre: 'Fotos INSP 0979 12-11-2026.zip', mimeType: 'application/zip', base64: 'B64:2' });
  assert.deepEqual(zips[0].nombres, ['a.jpg', 'a (2).jpg']);
  // Una sola: suelta, con su nombre
  assert.equal(correr(['C']).nombre, 'Fotos INSP 0979 12-11-2026 - c.jpg');
  // Una que no es de esta inspección, o más del tope: no
  assert.throws(() => correr(['C', 'OTRA']), /ya no está en esta inspección/);
  assert.throws(() => correr(null), /más de 40 MB/);
  // La pantalla: Seleccionar / Bajar seleccionadas / Bajar todas; eligiendo, el clic marca la foto en vez de abrirla
  assert.match(lineas, /llamar\('apiLineasFotosInspeccionZip', id, lista \? lista\.map\(\(f\) => f\.id\) : null\)/);
  assert.match(lineas, /if \(eleccion\.activa\(\)\) \{ ev\.preventDefault\(\); ev\.stopImmediatePropagation\(\); eleccion\.alternar\(n, a\); \}/);
  assert.match(lineas, /' Bajar seleccionadas \(<span data-fotos-cuenta>0<\/span>\)<\/button>'/);
  assert.match(API, /function apiLineasFotosInspeccionZip\(token, id, ids\) \{\s*return TelefoniaService\.fotosInspeccionZip\(token, id, ids\);/);
});
