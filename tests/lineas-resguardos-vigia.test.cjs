const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

// Resguardos y cancelaciones se pone al día solo (usuario, 19-nov: «cuando cambian de estatus no cambian»). El panel
// pasa por la lista con huella, como el índice de Líneas: el vigía de api.html pregunta cada minuto si cambió alguna de
// sus hojas y lo repinta en su lugar.
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('el panel se pide por la lista con huella y escucha al vigía', () => {
  const cliente = LINEAS;
  assert.match(cliente, /const BANDEJA = 'apiLineasBandejaResguardos';/);
  assert.doesNotMatch(cliente, /llamar\('apiLineasBandejaResguardos'/, 'por la lista con huella, no con una llamada suelta');
  // Al entrar, con «Actualizar» y después de cada acción: lo del servidor, nunca la copia guardada
  assert.match(cliente, /invalidarCacheLista\(BANDEJA, state\.token\);\n\s+callServerListaCacheada\(BANDEJA, state\.token\)\.then/);
  // Lo que llega distinto se repinta en su lugar (setDatos conserva filtros, orden y selección), no se rehace la tabla
  assert.match(cliente, /escucharLista\(BANDEJA, \(\) => callServerListaCacheada\(BANDEJA, state\.token\)\.then\(\(texto\) => \{\n\s+if \(!vigente\(\) \|\| !tabla \|\| !datos\) return;\n\s+datos = JSON\.parse\(texto\);\n\s+tabla\.setDatos\(filasVista\(\)\);/);
});

test('el servidor deja pedir el panel con huella y la huella trae sus hojas', () => {
  assert.match(read('src/ClientApi.gs'), /LISTAS_CON_HUELLA_ = [^\n]*\|LineasBandejaResguardos\|/);
  const resguardos = read('src/services/lineas/LineasResguardos.gs');
  assert.match(resguardos, /function bandeja\(usuario\) \{\r?\n\s+huellaBandeja_\(\);/);
  // APP_RESGUARDOS se lee directo (sin CacheHojas): si no se anota, un cambio de fase de otra persona no se vería
  assert.match(resguardos, /CacheHojas\.versiones\(\[TAB, H\.LINEAS, H\.EQUIPOS, H\.ASIGNACIONES, H\.ADENDUMS\]\.map\(\(n\) => \[LineasDatos\.id\(\), n\]\)\);/);
  assert.match(resguardos, /const TAB = 'APP_RESGUARDOS';/);
});
