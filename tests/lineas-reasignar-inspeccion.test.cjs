// Reasignar (usuario, 6-oct): la inspección empieza con lo capturado en la responsiva y no cambia a la persona del
// inventario. Antes la inspección copiaba a la persona nueva y Reasignar fallaba con «NUCO … ya lo tiene …».
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

test('la inspección de Reasignar se llena con la responsiva, también el jefe directo (19-oct)', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const form = captura.slice(captura.indexOf('function formularioInspeccion_('), captura.indexOf('function ocultarSecretos_'));
  assert.match(form, /const resp = !enAccion && deResponsiva && deResponsiva\.valores \? deResponsiva\.valores : null;/);
  // Los datos del responsable, por la columna del documento (No EMPLEADO, CORREO, JEFE DIRECTO…): de la responsiva o de la ficha
  assert.match(form, /const persona = \(c\) => \(enAccion \? '' : \(resp \? deResp\(c, ''\) : v\(columnaFicha_\(c\)\)\)\);/);
  assert.match(form, /camposResponsable_\(catalogos, persona, \{ soloProcesos: !!enAccion \}\)/);
  assert.doesNotMatch(form, /jefeDeCH|datoDeCH_/);
  ['COLOR', 'PIN WHATSAPP', 'PIN EQUIPO', 'TICKET', 'COMENTARIO'].forEach((c) => assert.match(form, new RegExp("deResp\\('" + c + "'"), c));
  assert.match(form, /deResponsiva\.patron !== undefined && deResponsiva\.patron !== null \? String\(deResponsiva\.patron\)/);
  // Es una inspección normal: lo de la responsiva llega llenado y se puede cambiar (usuario, 6-oct en la tarde)
  assert.doesNotMatch(form, /bloquear|soloLectura: true, requerido: 'NUNCA'/);
  assert.match(form, /\(c\) => \(resp \? deResp\(c, ''\) : v\(c\)\)\)\);/, 'los adicionales de la responsiva, editables');
  assert.match(captura, /if \(datos\.patron !== undefined && datos\.patron !== null\) valores\['PATRON'\] = String\(datos\.patron\);/);
  // Contexto y guardado arman el mismo formulario
  assert.match(captura, /ref && ref\.reasignar \? ref\.desdeResponsiva : null/);
  assert.match(captura, /datos\.reasignar \? datos\.desdeResponsiva : null/);
});

test('guardar la inspección de Reasignar no cambia a la persona del inventario (lo hace la reasignación); solo los accesos', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /const ACCESOS_INSPECCION = \['PIN WHATSAPP', 'PIN EQUIPO', 'PATRON', 'CONTRASEÑA MODEM'\];/);
  assert.match(captura, /if \(datos\.reasignar\) COPIA_INSPECCION_A_LINEA\.filter\(\(\[d\]\) => ACCESOS_INSPECCION\.indexOf\(d\) >= 0\)\.forEach\(copiar\);/);
  // Fuera de una acción, también los responsables adicionales
  assert.match(captura, /else if \(!datos\.enAccion\) COPIA_INSPECCION_A_LINEA\.concat\(ADICIONALES\.map\(\(c\) => \[c, c\]\)\)\.forEach\(copiar\);/);
  const cliente = read('src/html/js/lineas.html');
  const fn = cliente.slice(cliente.indexOf('async function abrirResponsiva(tipo, fila, para, opciones)'), cliente.indexOf('const inspeccionesDelDia = {};'));
  assert.match(fn, /reasignar: true, desdeResponsiva: \{ valores: resp\.datos\.valores, patron: resp\.datos\.patron \} \},\s+desdeCorregir \? \{ desdeCorregir: true \} : \{\}\)/);
});
