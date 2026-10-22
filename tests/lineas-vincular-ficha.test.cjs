const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Pendiente 2.61 (usuario, 21-oct): después de Vincular a equipo o Desvincular desde la ficha de una LÍNEA, la página se
// quedaba en «Cargando…» (se pintaba la ficha del equipo con la de la línea arriba en la pila). Ahora vuelve a pintar la
// ficha que estaba abierta, como las demás acciones.
const cliente = fs.readFileSync(path.join(__dirname, '../src/html/js/lineas.html'), 'utf8');

test('Vincular / desvincular vuelve a pintar la ficha abierta, sea del equipo o de la línea (2.61)', () => {
  const vinculo = cliente.slice(cliente.indexOf('async function abrirVinculo(modo, fila, pre)'), cliente.indexOf('"Mandar a cancelación" (30-sep)'));
  assert.match(vinculo, /const arriba = pila\[pila\.length - 1\];/);
  assert.match(vinculo, /if \(vigente\(\) && arriba\) abrir\(arriba\.tipo, arriba\.id, true\);/);
  // La línea cambia de registro al vincularla o desvincularla: su ficha se busca otra vez por su número (DEV, 22-oct)
  assert.match(vinculo, /const numero = String\(\(arriba && arriba\.tipo === 'linea' && \(fila\.numero \|\| numeroActual\)\) \|\| ''\);/);
  assert.match(vinculo, /if \(laLinea\) arriba\.id = laLinea\.id;/);
  assert.doesNotMatch(vinculo, /abrir\('equipo', equipo\.id, true\)/);
  // La razón: cada ficha solo se pinta si es la de arriba de la pila
  assert.match(cliente, /if \(!vigente\(\) \|\| !pila\.length \|\| pila\[pila\.length - 1\]\.tipo !== 'equipo' \|\| pila\[pila\.length - 1\]\.id !== id\) return;/);
});
