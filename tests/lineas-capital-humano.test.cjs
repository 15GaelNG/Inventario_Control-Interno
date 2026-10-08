const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Parte 3 en producción (usuario, 4-oct): COLABORADORES sale de la pestaña COLABORADORES ACTUALIZADO del mismo libro, con
// las mismas reglas que migracion/capital_humano/preparar_ch.py y sin leer las columnas que no se acordaron.
const fuente = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasReestructura.gs'), 'utf8');

function cargar() {
  const Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
  return new Function('Utilities', fuente + '\nreturn { reestructuraLeerHojaCH_, REESTRUCTURA_DE_CH };')(Utilities);
}

function libro(valores) {
  const leidas = [];
  const hoja = {
    getLastRow: () => valores.length,
    getLastColumn: () => valores[0].length,
    getRange: (fila, col, nf, nc) => ({
      getValues: () => {
        leidas.push(valores[0][col - 1]);
        return valores.slice(fila - 1, fila - 1 + nf).map((r) => r.slice(col - 1, col - 1 + nc));
      },
    }),
  };
  return { leidas, ss: { getSheetByName: (n) => (n === 'COLABORADORES ACTUALIZADO' ? hoja : null), getSpreadsheetTimeZone: () => 'UTC' } };
}

const ENC = ['No EMPLEADO', 'No INGRESOS', 'OFICINA/DESARROLLO', 'SEDE', 'NOMBRES', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'STATUS',
  'FECHA DE INGRESO', 'FECHA DE NACIMIENTO', 'CORREO EMPRESARIAL', 'DEPARTAMENTO', 'AREA', 'PUESTO', 'DIRECTOR', 'JEFE DIRECTO',
  'NÚMERO DE CUENTA', 'FECHA DE BAJA', 'MOTIVO DE BAJA'];

test('Capital Humano desde COLABORADORES ACTUALIZADO: solo las columnas acordadas y como preparar_ch.py', () => {
  const { reestructuraLeerHojaCH_ } = cargar();
  const fila = (o) => ENC.map((h) => (o[h] === undefined ? '' : o[h]));
  const { ss, leidas } = libro([ENC,
    fila({ 'No EMPLEADO': 1234, 'NOMBRE COMPLETO': '  ana   pérez ', STATUS: 'activo', 'FECHA DE INGRESO': new Date('2024-03-05T00:00:00Z'),
      'CORREO EMPRESARIAL': 'Ana.Perez@CiudadMaderas.com', DEPARTAMENTO: 'líneas', 'NÚMERO DE CUENTA': '999', 'FECHA DE NACIMIENTO': new Date('1990-01-01') }),
    fila({}),
    fila({ 'No EMPLEADO': 'CM-9', STATUS: 'BAJA', 'FECHA DE INGRESO': '7/1/2023', 'FECHA DE BAJA': '2025-02-28 00:00' }),
  ]);
  const ch = reestructuraLeerHojaCH_(ss);
  assert.equal(ch.length, 2, 'el renglón vacío no cuenta');
  assert.deepEqual(ch[0], {
    'No EMPLEADO': '1234', 'NOMBRE COMPLETO': 'ANA PÉREZ', 'DEPARTAMENTO': 'LÍNEAS', 'AREA': '', 'PUESTO': '', 'SEDE': '', 'OFICINA/DESARROLLO': '',
    'ESTATUS COLABORADOR': 'ACTIVO', 'DIRECTOR': '', 'JEFE DIRECTO': '', 'CORREO EMPRESARIAL': 'ana.perez@ciudadmaderas.com',
    'FECHA DE INGRESO': '2024-03-05', 'FECHA DE BAJA': '', 'N. EMPLEADO ANTERIOR': '',
  });
  assert.equal(ch[1]['FECHA DE INGRESO'], '2023-01-07', 'dd/mm/yyyy');
  assert.equal(ch[1]['FECHA DE BAJA'], '2025-02-28');
  // Ni la cuenta ni la fecha de nacimiento ni el motivo de baja se leen
  ['NÚMERO DE CUENTA', 'FECHA DE NACIMIENTO', 'MOTIVO DE BAJA', 'NOMBRES', 'No INGRESOS'].forEach((c) => assert.ok(leidas.indexOf(c) < 0, c));
});

test('Capital Humano: si falta una columna acordada no carga nada', () => {
  const { reestructuraLeerHojaCH_ } = cargar();
  const enc = ENC.filter((h) => h !== 'JEFE DIRECTO');
  const { ss } = libro([enc, enc.map(() => 'X')]);
  assert.throws(() => reestructuraLeerHojaCH_(ss), /Faltan columnas en COLABORADORES ACTUALIZADO: JEFE DIRECTO/);
});

test('Capital Humano en producción: Líneas lee COLABORADORES ACTUALIZADO y no reescribe COLABORADORES', () => {
  const repo = fs.readFileSync(path.join(__dirname, '../src/services/lineas/LineasRepo.gs'), 'utf8');
  assert.match(repo, /typeof reestructuraLeerHojaCH_ === 'function' \? reestructuraLeerHojaCH_\(LineasDatos\.libro\(\)\) : null;/);
  assert.match(repo, /\(ch \|\| LineasDatos\.leerTabla\(TAB\.COLAB\)\)\.filter/);
  // La carga a COLABORADORES se niega en un libro que tiene la pestaña de Ayrton
  assert.match(fuente, /if \(ss\.getSheetByName\(REESTRUCTURA_HOJA_CH\)\) \{\s*throw new Error/);
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

test('Después de Reasignar se vuelve a pintar la ficha abierta (producción, 4-oct)', () => {
  const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');
  const reasignar = cliente.slice(cliente.indexOf('function abrirReasignar(fila, para)'), cliente.indexOf('const inspeccionesDelDia = {};'));
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
