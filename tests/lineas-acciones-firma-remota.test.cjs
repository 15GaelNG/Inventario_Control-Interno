/**
 * Bug real (usuario, 6-nov): LineasCaptura.guardarResponsiva YA regresaba { pendiente: true, ligas }
 * cuando algo se diferia, pero LineasAcciones.responsiva (la acción que en verdad guarda la Responiva
 * desde la pantalla) reconstruía su propio objeto de salida sin esos dos campos: el cliente nunca se
 * enteraba y pedía el PDF de una vez, sin esperar las ligas. Mismo bug en vincular(). Esta prueba
 * corre las funciones REALES (no solo regex sobre el texto) con un LineasCaptura de mentira.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function entorno(respuestaGuardarResponsiva) {
  const ctx = vm.createContext({
    console,
    LineasCaptura: {
      guardarResponsiva: () => respuestaGuardarResponsiva,
    },
    LineasRepo: {
      TIPOS_CON_EQUIPO: { EQUIPO: true },
      leerRegistroObligatorio: (id) => ({ _fila: 2, ESTATUS_EQUIPO: 'USO' }),
      refrescarIndice: (ids) => ids,
    },
    LineasUtil: { col: (fila, c) => (c === 'ESTATUS EQUIPO' ? 'DISPONIBLE' : '') },
    LineasDatos: { conCandado: (fn) => fn() },
    LineasResguardos: { mandarCancelacion: () => {} },
  });
  vm.runInContext(read('src/services/lineas/LineasAcciones.gs') + '\nthis.A = LineasAcciones;', ctx);
  return ctx.A;
}

test('responsiva(): si LineasCaptura.guardarResponsiva regresa pendiente, se propaga tal cual (no pdfPendiente)', () => {
  const A = entorno({ id: 'RESP-1', registroId: 'EQ-1', filas: [1, 2], pendiente: true, ligas: { PRINCIPAL: 'https://liga/1' } });
  const r = A.responsiva({ equipoId: 'EQ-1' }, { nombre: 'Quien captura' }, true);
  assert.equal(r.pendiente, true);
  assert.deepEqual(r.ligas, { PRINCIPAL: 'https://liga/1' });
  assert.equal(r.pdfPendiente, undefined, 'con pendiente, no se pide el PDF de una vez');
});

test('responsiva(): sin nada diferido, sigue como antes (pdfPendiente, sin pendiente ni ligas)', () => {
  const A = entorno({ id: 'RESP-2', registroId: 'EQ-2', filas: [1], hecho: { reasignado: true } });
  const r = A.responsiva({ equipoId: 'EQ-2' }, { nombre: 'Quien captura' }, true);
  assert.equal(r.pdfPendiente, true);
  assert.equal(r.reasignado, true);
  assert.equal(r.pendiente, undefined);
  assert.equal(r.ligas, undefined);
});

test('vincular(): mismo arreglo (propagar pendiente/ligas de la responsiva) -- aplicarVinculo_ es muy pesado para correr aquí', () => {
  const acc = read('src/services/lineas/LineasAcciones.gs');
  const fn = acc.slice(acc.indexOf('  function vincular('), acc.indexOf('  /** El cambio en sí'));
  assert.match(fn, /responsivaPendiente = !!r\.pendiente;/);
  assert.match(fn, /responsivaLigas = r\.ligas \|\| \{\};/);
  assert.match(fn, /if \(responsivaPendiente\) return \{ id: responsivaId, responsivaId: responsivaId, equipoId: equipoId, pendiente: true, ligas: responsivaLigas, filas: filas \};/);
});
