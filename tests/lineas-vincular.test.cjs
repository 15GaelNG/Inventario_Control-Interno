const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Etapa 3 (usuario, 8-oct; pendiente 2.24): vincular, cambiar y desvincular línea y equipo

test('separar la línea de su equipo deja dos asignaciones: el equipo como estaba y la línea suelta DISPONIBLE', () => {
  const esc = read('src/services/lineas/LineasEscritura.gs');
  const fn = esc.slice(esc.indexOf('function separarLinea('), esc.indexOf('  return {\n    ADICIONALES') > 0 ? esc.indexOf('  return {\n    ADICIONALES') : esc.indexOf('ADICIONALES, guardar'));
  assert.match(fn, /actualizar_\('ASIGNACIONES', a, \{ 'FECHA FIN': ahora \}\)/);
  assert.match(fn, /'ID LINEA': '', 'FECHA INICIO': ahora, 'FECHA FIN': ''/);
  assert.match(fn, /datosAsignacion_\('RESGUARDO', a \|\| \{\}, \{\}, null\)/);
  assert.match(fn, /'TIPO': 'RESGUARDO', 'ID LINEA': l\['ID'\], 'ID EQUIPO': ''/);
  assert.match(fn, /actualizar_\('LINEAS', l, \{ 'ESTATUS LINEA': 'DISPONIBLE' \}\)/);
  assert.match(fn, /tocados_\.push\(String\(l\['ID'\]\)\)/);
  assert.match(esc, /ADICIONALES, guardar, agregar, hojasEnMemoria, separarLinea,/);
});

test('vincular: solo líneas DISPONIBLE, equipos en USO o RESGUARDO, y responsiva si el equipo queda en uso', () => {
  const acc = read('src/services/lineas/LineasAcciones.gs');
  assert.match(acc, /const ESTATUS_VINCULABLE = \['USO', 'RESGUARDO'\];/);
  assert.match(acc, /solo se vinculan líneas DISPONIBLE/);
  assert.match(acc, /const conResponsiva = !!lineaId && may\(LineasUtil\.col\(fE, 'ESTATUS EQUIPO'\)\) === 'USO';/);
  assert.match(acc, /if \(!d\.responsiva\) throw new Error\('Falta la responsiva/);
  assert.match(acc, /modo: 'LINEA', lineaFila: LineasRepo\.leerRegistroObligatorio\(lineaId, 'la línea'\)/);
  // La que deja el equipo y va a cancelación entra a la bandeja de Pau
  assert.match(acc, /LineasResguardos\.mandarCancelacion\(\[hecho\.anteriorACancelar\]/);
  // Cada caso con su movimiento
  assert.match(acc, /lineaFila \? \(desde \? 'CAMBIO_EQUIPO' : \(tieneLinea \? 'CAMBIO_LINEA' : 'ASIGNAR_LINEA'\)\) : 'RETIRAR_LINEA'/);
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /ASIGNAR_LINEA: 'Vincular línea', RETIRAR_LINEA: 'Desvincular línea', CAMBIO_EQUIPO: 'Cambio de equipo'/);
  assert.match(read('src/ClientApi.gs'), /function apiLineasVincular\(token, datos\) \{\r?\n  return TelefoniaService\.vincular\(token, datos\);/);
});

test('la responsiva enseña fija la línea que se pone', () => {
  const cap = read('src/services/lineas/LineasCaptura.gs');
  assert.match(cap, /const COLUMNAS_DE_LINEA = \['NUMERO TELEFONO', 'NUMERO SIM', 'COMPAÑIA', 'RAZON SOCIAL', 'PIN WHATSAPP'\];/);
  assert.match(cap, /const v = \(c\) => valorLinea_\(lineaFila && COLUMNAS_DE_LINEA\.indexOf\(c\) >= 0 \? lineaFila : fila, c\);/);
  assert.match(cap, /return ref && ref\.lineaNueva \? LineasRepo\.leerRegistroObligatorio\(String\(ref\.lineaNueva\), 'la línea'\) : null;/);
  assert.match(cap, /accion \? accion\.lineaFila \|\| null : null\)/);
});

test('la pantalla: las acciones en el ⋮ y el formulario de la acción', () => {
  const html = read('src/html/js/lineas.html');
  ['Vincular línea', 'Cambiar línea', 'Desvincular línea', 'Cambiar de equipo', 'Desvincular del equipo', 'Vincular a equipo']
    .forEach((t) => assert.match(html, new RegExp("texto: '" + t + "'"), t));
  assert.match(html, /async function abrirVinculo\(modo, fila\)/);
  assert.match(html, /tipo === 'LINEAS_DISPONIBLES'/);
  assert.match(html, /const conResponsiva = !!datos\.lineaId && may\(equipo\.estatus\) === 'USO';/);
  assert.match(html, /capturarEnFlujo\('RESPONSIVA', \{ equipoId: equipo\.id, lineaNueva: datos\.lineaId, modo: 'LINEA' \}/);
  assert.match(html, /opciones: \['DISPONIBLE', 'MANDAR A CANCELACIÓN'\]/);
  // Sin «N/A»: el comentario de más de 3 caracteres
  assert.match(html, /\{ clave: 'comentario', etiqueta: 'Comentario', requerido: true, area: true, minimo: 4 \}, \{ clave: 'ticket', etiqueta: 'Ticket' \}\],\r?\n\s+titulo, \{ espera: titulo/);
});

test('la ventana de comentario sigue las esquinas redondeadas', () => {
  assert.match(read('src/html/lineas-estilos.html'), /border-bottom-left-radius: inherit; border-bottom-right-radius: inherit;/);
});
