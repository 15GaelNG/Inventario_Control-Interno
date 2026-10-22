const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Desde el 12-oct-2026 Líneas toma a las personas de CapitalHumano (src/services/CapitalHumano.gs), como todos los módulos:
// la misma lista de activos de COLABORADORES ACTUALIZADO, con su ID PERSONA. Ya no tiene su propia lectura de CH ni cae a
// COLABORADORES (la vieja, que se retira). docs/personas-unificar.md
const repo = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasRepo.gs'), 'utf8');

test('Capital Humano en Líneas: la lista de personas sale de CapitalHumano.conBajasRecientes (activos y bajas de 12 meses, en mayúsculas)', () => {
  const ix = repo.slice(repo.indexOf('function indiceColaboradores()'), repo.indexOf('/** Vacía las cachés del módulo'));
  assert.match(ix, /CapitalHumano\.conBajasRecientes\(\)\.map\(/);
  assert.match(ix, /p\.ESTATUS === 'BAJA' \? 'BAJA' : 'ACTIVO'/);
  assert.match(ix, /indice_colaboradores_v7/);
  // Los catálogos (puestos, jefes, sedes…) solo con activos (2.58)
  assert.match(repo, /const ch = ix\.filas\.filter\(\(f\) => f\[iEstatus\] !== 'BAJA'\)\.map\(/);
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
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  assert.match(cliente, /const autoDe = \(e\) => !!\(e\.formula \|\| e\.deriva \|\| e\.auto\);/);
  assert.doesNotMatch(cliente, /e\.soloLectura \|\| e\.deriva \? ' data-auto'/);
  assert.doesNotMatch(cliente, /<div data-auto class="ln-af-calculado/);
});

test('La ventana de captura se abre sin la marca de guardado de la anterior (firma en Reasignar, 4-oct)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  assert.match(cliente, /function mostrarModalCaptura\(\) \{\s*const modal = \$\('#ln-modal-captura', raiz\);\s*modal\.removeAttribute\('aria-busy'\);/);
  assert.doesNotMatch(cliente, /\$\('#ln-modal-captura', raiz\)\.hidden = false;/);
});

test('La X de la ventana se prende al abrirla: un guardado que cerró la ventana la dejaba apagada (usuario, 22-oct, 2.64)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  const inicio = cliente.indexOf('function mostrarModalCaptura()');
  const fuente = cliente.slice(inicio, cliente.indexOf('function cerrarCaptura(', inicio));
  // La ventana como la dejó un Corregir guardado: X y Cancelar apagados, con la marca de guardado y escondida
  const botones = [{ disabled: true }, { disabled: true }];
  const atributos = { 'aria-busy': 'true' };
  const modal = {
    hidden: true,
    removeAttribute: (a) => { delete atributos[a]; },
    querySelectorAll: (sel) => (sel === '[data-cerrar-modal]' ? botones : []),
  };
  const mostrar = new Function('$', 'raiz', fuente + '\nreturn mostrarModalCaptura;')(() => modal, {});
  mostrar();
  assert.strictEqual(modal.hidden, false);
  assert.strictEqual(atributos['aria-busy'], undefined);
  assert.deepStrictEqual(botones.map((b) => b.disabled), [false, false]);
});

test('Después de Reasignar se vuelve a pintar la ficha abierta (producción, 4-oct)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  const reasignar = cliente.slice(cliente.indexOf('function abrirResponsiva(tipo, fila, para, opciones)'), cliente.indexOf('const inspeccionesDelDia = {};'));
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

test('Capital Humano: conBajasRecientes trae los activos y las bajas de los últimos 12 meses, sin repetir a un activo (2.58)', () => {
  const hoy = new Date();
  const fecha = (meses) => { const d = new Date(hoy.getFullYear(), hoy.getMonth() - meses, 15); return [d.getDate(), d.getMonth() + 1, d.getFullYear()].map((n) => String(n).padStart(2, '0')).join('/'); };
  const enc = ['ID PERSONA', 'No EMPLEADO', 'NOMBRE COMPLETO', 'STATUS', 'FECHA DE BAJA', 'DEPARTAMENTO'];
  const valores = [enc,
    ['PER-1', '1', 'ZOE ACTIVA', 'ACTIVO', '', 'VENTAS'],
    ['PER-2', '2', 'ANA RECIENTE', 'BAJA', fecha(2), 'VENTAS'],
    ['PER-3', '3', 'BETO VIEJO', 'BAJA', fecha(14), 'VENTAS'],
    ['PER-4', '4', 'CARLA SIN FECHA', 'BAJA', '', 'VENTAS'],
    ['PER-5', '5', 'ZOE ACTIVA', 'BAJA', fecha(1), 'COMPRAS'],
  ];
  const hoja = { getLastRow: () => valores.length, getLastColumn: () => enc.length, getRange: () => ({ getDisplayValues: () => valores }) };
  const CH = new Function('SpreadsheetApp', 'CacheHojas', 'Config', fs.readFileSync(path.join(__dirname, '../src/services/CapitalHumano.gs'), 'utf8') +
    '\nreturn CapitalHumano;')({ openById: () => ({ getSheetByName: () => hoja }) }, { recordar: (k, h, armar) => armar() },
    { SPREADSHEET_IDS: { VEHICULOS: () => 'libro' } });
  const lista = CH.conBajasRecientes().map((p) => p.NOMBRE + ' ' + p.ESTATUS);
  assert.deepEqual(lista, ['ANA RECIENTE BAJA', 'ZOE ACTIVA ACTIVO']);
  assert.deepEqual(CH.activos().map((p) => p.NOMBRE), ['ZOE ACTIVA'], 'los demás módulos siguen solo con activos');
});

test('Capital Humano en Líneas: la lista marca a las bajas y Gestión de activos sigue solo con activos (2.58)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  assert.match(cliente, /baja: c\.estatus && String\(c\.estatus\)\.toUpperCase\(\) !== 'ACTIVO',/);
  assert.match(cliente, /const etiquetaDe = \(partes, c\) => \(c\.baja \? \['BAJA'\] : \[\]\)\.concat\(partes\)\.filter\(Boolean\)\.join\(' · '\);/);
  assert.match(cliente, /const distintos = \(campo\) => gente\.filter\(\(c\) => !c\.baja\)/);
  assert.match(cliente, /colaboradores = filasComoObjetos\(r\)\.filter\(\(c\) => c\.estatus !== 'BAJA'\)/);
  // Otra copia en el navegador: la de antes (sin bajas) no se enseña mientras llega la nueva
  assert.match(cliente, /const cargarColaboradores = \(forzar\) => catalogoLineas_\('apiLineasColaboradores', forzar, 'bajas'\);/);
});
