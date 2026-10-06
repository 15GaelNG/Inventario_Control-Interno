// Reasignar (usuario, 6-oct): la inspección empieza con lo capturado en la responsiva y no cambia a la persona del
// inventario. Antes la inspección copiaba a la persona nueva y Reasignar fallaba con «NUCO … ya lo tiene …».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('la inspección de Reasignar se llena con la responsiva y el jefe directo sale de Capital Humano', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const form = captura.slice(captura.indexOf('function formularioInspeccion_('), captura.indexOf('function ocultarSecretos_'));
  assert.match(form, /const resp = !enAccion && deResponsiva && deResponsiva\.valores \? deResponsiva\.valores : null;/);
  assert.match(form, /valor: persona\('CUENTA GOOGLE', 'CORREO'\)/);
  assert.match(form, /valor: resp \? jefeDeCH\(\) : persona\('JEFE DIRECTO'\)/);
  assert.match(form, /LineasAcciones\.datoDeCH_\(resp\['No EMPLEADO'\], resp\['RESPONSABLE'\], 'jefe'\)/);
  ['COLOR', 'PIN WHATSAPP', 'PIN EQUIPO', 'TICKET', 'COMENTARIO'].forEach((c) => assert.match(form, new RegExp("deResp\\('" + c + "'"), c));
  assert.match(form, /deResponsiva\.patron !== undefined && deResponsiva\.patron !== null \? String\(deResponsiva\.patron\)/);
  // Contexto y guardado arman el mismo formulario
  assert.match(captura, /ref && ref\.reasignar \? ref\.desdeResponsiva : null/);
  assert.match(captura, /datos\.reasignar \? datos\.desdeResponsiva : null/);
});

test('guardar la inspección de Reasignar no cambia a la persona del inventario (lo hace la reasignación)', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /if \(!datos\.enAccion && !datos\.reasignar\) COPIA_INSPECCION_A_LINEA\.forEach/);
  const cliente = read('src/html/js/lineas.html');
  const fn = cliente.slice(cliente.indexOf('async function abrirReasignar(fila)'), cliente.indexOf('const inspeccionesDelDia = {};'));
  assert.match(fn, /reasignar: true, desdeResponsiva: \{ valores: resp\.datos\.valores, patron: resp\.datos\.patron \}/);
});
