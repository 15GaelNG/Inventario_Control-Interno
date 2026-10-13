const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Fotos de la inspección (usuario, 13-oct; pendiente 2.41): clic = visor en la misma pantalla (ampliar, pasar entre
// fotos, acercar) en vez de Drive, y quitar una foto enviada por error (a la papelera, con comentario en el historial).
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const lineas = read('src/html/js/lineas.html');
const servicio = read('src/services/TelefoniaService.gs');
const cuerpo = (texto, inicio, fin) => texto.slice(texto.indexOf(inicio), texto.indexOf(fin, texto.indexOf(inicio)));

test('la galería de la inspección abre el visor; un video o una foto sin vista previa sigue yendo a Drive', () => {
  const pintar = cuerpo(lineas, 'function pintarInspeccion(detalle, id)', '    /** Desde una bitácora');
  assert.match(pintar, /const enVisor = \(f\) => !!f\.miniatura && !f\.video;/);
  assert.match(pintar, /' data-foto="' \+ n \+ '"'/);
  assert.match(pintar, /verFotos\(enGaleria, enGaleria\.indexOf\(f\), r\.puedeOperar \? \{ alQuitar: alQuitar \} : \{\}\)/);
  assert.match(pintar, /if \(ev\.ctrlKey \|\| ev\.metaKey \|\| ev\.shiftKey \|\| ev\.button === 1\) return;/);
  // Quitar: sin comentario (usuario, 13-oct), ventana por encima del visor, con espera
  assert.match(pintar, /pedirDatos\('¿Quitar esta foto\?', f\.nombre, \[\], 'Quitar foto', \{/);
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
  assert.match(read('src/ClientApi.gs'), /function apiLineasQuitarFotoInspeccion\(token, id, archivoId, comentario\) \{\s+return TelefoniaService\.quitarFotoInspeccion\(token, id, archivoId, comentario\);/);
  const quitar = cuerpo(servicio, 'function quitarFotoInspeccion(token, id, archivoId, comentario)', '  /**\n   * Abre un archivo');
  assert.match(quitar, /const sesion = operar_\(token\);/);
  assert.doesNotMatch(quitar, /motivo\.length/, 'el comentario no es obligatorio');
  assert.match(quitar, /const carpetas = carpetasFotos_\(doc, id\);/);
  assert.match(quitar, /carpetas\.indexOf\(c\.getId\(\)\) >= 0/);
  assert.match(quitar, /if \(!carpeta \|\| !esFotoDeInspeccion_\(archivo\.getName\(\), archivo\.getMimeType\(\)\)\) throw new Error\('La foto no es de esta inspección\.'\);/);
  assert.match(quitar, /archivo\.setTrashed\(true\);/);
  assert.match(quitar, /'FOTOS QUITADAS'/);
  assert.match(quitar, /registrarMovimiento\('FOTO_QUITADA', \{ motivo: motivo \}/);
  assert.match(quitar, /cambios: \[\{ campo: 'FOTO', antes: nombre, despues: '' \}\]/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /FOTO_QUITADA: 'Foto quitada',/);
  // La página y quitar leen las mismas carpetas
  assert.match(servicio, /const fotos = esInspeccion \? fotosDe_\(carpetasFotos_\(doc, id\)\) : \[\];/);
});
