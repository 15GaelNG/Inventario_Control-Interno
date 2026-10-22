const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const LINEAS = require('./lineas-fuente');

// Desde el 12-oct-2026 Líneas toma a las personas de CapitalHumano (src/services/CapitalHumano.gs), como todos los módulos:
// la misma lista de activos de COLABORADORES ACTUALIZADO, con su ID PERSONA. Ya no tiene su propia lectura de CH ni cae a
// COLABORADORES (la vieja, que se retira). docs/personas-unificar.md
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasReestructura.gs'), 'utf8');
const repo = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasRepo.gs'), 'utf8');

test('Capital Humano en Líneas: la lista de personas sale de CapitalHumano.activos (solo activos, en mayúsculas)', () => {
  const ix = repo.slice(repo.indexOf('function indiceColaboradores()'), repo.indexOf('/** Vacía las cachés del módulo'));
  assert.match(ix, /CapitalHumano\.activos\(\)\.map\(/);
  assert.match(ix, /'ACTIVO'/);
  assert.match(ix, /indice_colaboradores_v6/);
  // Sede, área y oficina como las muestra el sistema: QRO → QUERETARO (usuario, 13-oct)
  assert.match(ix, /comoSeMuestra\('AREA', p\.AREA\), comoSeMuestra\('SEDE', p\.SEDE\), comoSeMuestra\('OFICINA\/DESARROLLO', p\.OFICINA\)/);
  assert.match(ix, /const comoSeMuestra = \(c, v\) => \{ const t = may\(v\); return t && LineasUtil\.mostrarCH\(c, t\); \};/);
  const Util = new Function('LineasDatos', 'LineasArchivos', fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasUtil.gs'), 'utf8') +
    '\nreturn LineasUtil;')({ normCol: (c) => String(c).toUpperCase().trim() }, {});
  assert.equal(Util.mostrarCH('SEDE', 'QRO'), 'QUERETARO');
  assert.equal(Util.mostrarCH('OFICINA/DESARROLLO', 'CARRANZA SLP'), 'CARRANZA SAN LUIS POTOSI');
  assert.equal(Util.guardarCH('SEDE', 'QUERETARO'), 'QRO', 'en la hoja se guarda como en CH');
  assert.doesNotMatch(repo, /colaboradoresActivos_|TAB\.COLAB|COLAB: 'COLABORADORES'/, 'sin la lectura vieja');
});

test('Capital Humano en Líneas: nadie en Líneas lee la pestaña de CH directo', () => {
  assert.doesNotMatch(fuente, /reestructuraLeerHojaCH_|REESTRUCTURA_HOJA_CH/);
  const ine = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasIneLectura.gs'), 'utf8');
  assert.match(ine, /CapitalHumano\.filasCH\(\)/);
  assert.doesNotMatch(ine, /getSheetByName\(CapitalHumano\.HOJA_(CH|PERSONAS)\)|leer\(CapitalHumano\.HOJA_/);
  const ident = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasIdentificaciones.gs'), 'utf8');
  assert.match(ident, /CapitalHumano\.idPara\('ASIGNACIONES'/);
});

test('Capital Humano en Líneas: una asignación con persona calcula su ID PERSONA al guardarse', () => {
  const esc = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasEscritura.gs'), 'utf8');
  assert.match(esc, /if \(k !== 'ASIGNACIONES' \|\| typeof CapitalHumano === 'undefined'\) return cambios;/);
  assert.match(esc, /CapitalHumano\.conPersona\('ASIGNACIONES', cambios, registro\);/);
  // Sin persona no se busca (rapidez, 13-oct; lineas-escritura lo prueba)
  assert.match(esc, /if \(columnas\.every\(\(c\) => limpio_\(registro\[c\]\) === ''\)\) \{\s+cambios\['ID PERSONA'\] = '';/);
  assert.match(esc, /function actualizar_\(k, fila, cambios\) \{\s*conPersona_\(k, cambios, Object\.assign\(\{\}, fila, cambios\)\);/);
  assert.match(esc, /const h = hojas\(\);\s*conPersona_\(k, objeto, objeto\);/);
});

test('Etiqueta AUTO en Líneas: solo en lo que el formulario llena solo, no en lo que solo se muestra (usuario, 4-oct)', () => {
  const cliente = LINEAS;
  assert.match(cliente, /const autoDe = \(e\) => !!\(e\.formula \|\| e\.deriva \|\| e\.auto\);/);
  assert.doesNotMatch(cliente, /e\.soloLectura \|\| e\.deriva \? ' data-auto'/);
  assert.doesNotMatch(cliente, /<div data-auto class="ln-af-calculado/);
});

test('La ventana de captura se abre sin la marca de guardado de la anterior (firma en Reasignar, 4-oct)', () => {
  const cliente = LINEAS;
  assert.match(cliente, /function mostrarModalCaptura\(\) \{\s*const modal = \$\('#ln-modal-captura', raiz\);\s*modal\.removeAttribute\('aria-busy'\);/);
  assert.doesNotMatch(cliente, /\$\('#ln-modal-captura', raiz\)\.hidden = false;/);
});

test('Después de Reasignar se vuelve a pintar la ficha abierta (producción, 4-oct)', () => {
  const cliente = LINEAS;
  const reasignar = cliente.slice(cliente.indexOf('function abrirResponsiva(tipo, fila, para)'), cliente.indexOf('const inspeccionesDelDia = {};'));
  assert.match(reasignar, /if \(vigente\(\) && actual && actual\.id === fila\.id\) abrir\(actual\.tipo, actual\.id, true\);/);
});

test('JEFE DIRECTO y los responsables adicionales: al agregar los encabezados se olvida la tabla para que la escritura los vea', () => {
  const esc = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasEscritura.gs'), 'utf8');
  const f = esc.slice(esc.indexOf('function asegurarJefeDirecto_()'), esc.indexOf('function hojas()'));
  assert.match(f, /LineasDatos\.asegurarColumnas\(HOJA\.ASIGNACIONES, \['JEFE DIRECTO'\]\.concat\(ADICIONALES\)\);/);
  const datos = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasDatos.gs'), 'utf8');
  const a = datos.slice(datos.indexOf('function asegurarColumnas('), datos.indexOf('function asegurarPestana('));
  assert.match(a, /delete bd\.tablas\[nombre\];/);
  assert.match(a, /cacheBorrar\('enc_' \+ nombre\);/);
  assert.doesNotMatch(a, /setNumberFormat/, 'sin tocar formatos');
});
