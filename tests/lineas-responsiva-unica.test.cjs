// Pendiente 2.49 (usuario, 16-oct): «una reasignación es lo mismo que una responsiva, quiero simplificar esto… y usamos esa
// misma lógica para las líneas sueltas». Un solo botón «Responsiva»: la misma persona renueva (lo de la responsiva pasa a
// la ficha, sin inspección); otra persona, o el registro en resguardo o DISPONIBLE, reasigna (en un equipo con su
// inspección obligatoria: «Mejor que la inspección sea obligatoria igual»). Reasignar se quitó.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

/** LineasAcciones con hojas en memoria: `registro` es la fila que regresa leerRegistroObligatorio. */
function accionesCon(registro) {
  const exigidas = [];
  const escritos = [];
  const ctx = vm.createContext({
    LineasUtil: { col: (f, c) => f[c], nucoVisible: (n) => String(n).padStart(4, '0') },
    LineasDatos: { idsDeFila: (f) => [f.ID] },
    LineasResguardos: { enPanel: (f) => !!f._enPanel },
    LineasRepo: {
      leerRegistroObligatorio: () => registro,
      guardarCambiosRegistro: (...a) => { escritos.push(a); return { refs: [], campos: [] }; },
      registrarMovimiento: (...a) => escritos.push(a),
    },
    LineasCaptura: {
      exigirInspeccion: (id, ids, nombre) => {
        exigidas.push([id, ids, nombre]);
        if (!id) throw new Error(nombre + ': falta su inspección (se captura dentro de la acción).');
        return id;
      },
      guardarResponsiva: (datos, usuario, secretos, accion) => {
        const hecho = accion.aplicar(new Date(), Object.assign({ COMENTARIO: 'CAMBIO DE PUESTO', RESPONSABLE: 'LUIS', 'No EMPLEADO': 'AC1',
          'JEFE DIRECTO': 'JEFA DE LA RESPONSIVA', DIRECTOR: 'DIR' }, datos.valores || {}));
        return { id: 'RES-1', registroId: hecho.id, filas: [], hecho: hecho };
      },
    },
  });
  vm.runInContext(read('src/services/lineas/LineasAcciones.gs') + '\nthis.A = LineasAcciones;', ctx);
  return { A: ctx.A, exigidas: exigidas, escritos: escritos };
}

test('servidor: la responsiva es la acción; Reasignar ya no existe', () => {
  const acciones = read('src/services/lineas/LineasAcciones.gs');
  const cuerpo = acciones.slice(acciones.indexOf('function responsiva('), acciones.indexOf('// ---------------- Vincular'));
  assert.match(cuerpo, /ref: ref, modo: 'RESPONSIVA'/);
  assert.match(cuerpo, /registrarMovimiento\('REASIGNACION', \{ motivo: comentario, ticket: txt\(valores\['TICKET'\]\) \}/);
  assert.match(acciones, /\['DIRECTOR', 'DIRECTOR'\]/); // la responsiva lleva al director (usuario, 6-oct)
  assert.doesNotMatch(acciones, /function reasignar\(/);
  assert.doesNotMatch(read('src/ClientApi.gs'), /apiLineasReasignar/);
  assert.match(read('src/services/TelefoniaService.gs'), /LineasAcciones\.responsiva\(datos \|\| \{\}, usuarioOperacion_\(sesion\), puedeVerSecretos_\(sesion\)\)/);
});

test('otra persona en un equipo es reasignación y la inspección es obligatoria (usuario, 5-oct y 16-oct)', () => {
  const { A, exigidas, escritos } = accionesCon({ ID: 'EQU-1', NUCO: 12, 'ESTATUS EQUIPO': 'USO', 'ESTATUS LINEA': 'DISPONIBLE', RESPONSABLE: 'ANA' });
  assert.throws(() => A.responsiva({ equipoId: 'EQU-1' }, { correo: 'a@b.mx' }, false), /NUCO 0012: falta su inspección/);
  assert.equal(escritos.length, 0, 'sin inspección no se escribe nada');
  const r = A.responsiva({ equipoId: 'EQU-1', inspeccionId: 'INS-9' }, { correo: 'a@b.mx' }, false);
  assert.equal(r.id, 'RES-1');
  assert.equal(r.reasignado, true);
  assert.deepEqual(JSON.parse(JSON.stringify(exigidas[1])), ['INS-9', ['EQU-1'], 'NUCO 0012']);
  const mov = escritos.find((a) => a[0] === 'REASIGNACION');
  assert.equal(mov[4].detalle.inspeccionId, 'INS-9');
  const cambios = escritos.find((a) => a[1] && a[1]['ESTATUS EQUIPO'] === 'USO')[1];
  // El jefe directo y el director son los de la responsiva (usuario, 19-oct); su línea DISPONIBLE se va con él (L1)
  assert.equal(cambios['JEFE DIRECTO'], 'JEFA DE LA RESPONSIVA');
  assert.equal(cambios['DIRECTOR'], 'DIR');
  assert.equal(cambios['NO EMPLEADO'], 'AC1');
  assert.equal(cambios['ESTATUS LINEA'], 'USO');
  assert.equal(cambios['RESPONSABLE'], 'LUIS');
});

test('la misma persona es renovación (sin inspección ni reasignación); en resguardo siempre reasigna', () => {
  const misma = accionesCon({ ID: 'EQU-1', NUCO: 12, 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'Luís ' });
  const r = misma.A.responsiva({ equipoId: 'EQU-1' }, { correo: 'a@b.mx' }, false);
  assert.equal(r.reasignado, false);
  assert.equal(misma.exigidas.length, 0, 'sin inspección');
  assert.equal(misma.escritos.length, 0, 'lo de la responsiva lo pasa a la ficha guardarResponsivaEnCandado_');
  const guardado = accionesCon({ ID: 'EQU-1', NUCO: 12, 'ESTATUS EQUIPO': 'RESGUARDO', RESPONSABLE: 'LUIS' });
  assert.throws(() => guardado.A.responsiva({ equipoId: 'EQU-1' }, { correo: 'a@b.mx' }, false), /falta su inspección/);
  assert.equal(misma.A.esRenovacion('USO', 'ana maría', 'ANA MARIA'), true);
  assert.equal(misma.A.esRenovacion('USO', '', ''), false);
  assert.equal(misma.A.esRenovacion('DISPONIBLE', 'ANA', 'ANA'), false);
});

test('la línea sin equipo: DISPONIBLE pasa a USO con la persona, sin inspección; lo cancelado o vendido no se entrega', () => {
  const { A, exigidas, escritos } = accionesCon({ ID: 'LIN-1', 'NUMERO TELEFONO': '4421234567', 'ESTATUS LINEA': 'DISPONIBLE', RESPONSABLE: '' });
  const r = A.responsiva({ lineaId: 'LIN-1' }, { correo: 'a@b.mx' }, false);
  assert.equal(r.reasignado, true);
  assert.equal(exigidas.length, 0, 'la línea sin equipo no lleva inspección');
  const cambios = escritos.find((a) => a[1] && a[1]['ESTATUS LINEA'] === 'USO')[1];
  assert.equal(cambios['RESPONSABLE'], 'LUIS');
  assert.equal(cambios['JEFE DIRECTO'], 'JEFA DE LA RESPONSIVA');
  assert.ok(!('ESTATUS EQUIPO' in cambios));
  assert.ok(escritos.some((a) => a[0] === 'REASIGNACION'));
  [['LIN-2', { 'ESTATUS LINEA': 'CANCELADA', 'NUMERO TELEFONO': '4420000000' }, /La línea 4420000000 está CANCELADA\./],
    ['LIN-3', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION', 'NUMERO TELEFONO': '4420000001' }, /está EN PROCESO DE CANCELACION/]].forEach(([id, f, error]) => {
    assert.throws(() => accionesCon(Object.assign({ ID: id }, f)).A.responsiva({ lineaId: id }, { correo: 'a@b.mx' }, false), error);
  });
  ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'].forEach((e) => {
    assert.throws(() => accionesCon({ ID: 'EQU-1', NUCO: 7, 'ESTATUS EQUIPO': e }).A.responsiva({ equipoId: 'EQU-1', inspeccionId: 'I' }, {}, false),
      new RegExp('NUCO 0007 está ' + e));
  });
});

test('todo lo de la responsiva pasa a la ficha: persona, modelo, IMEI, accesorios, color, bloqueo y PIN (L2)', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const resp = captura.slice(captura.indexOf('  function guardarResponsivaEnCandado_('), captura.indexOf('  function exigirInspeccion('));
  assert.match(resp, /const sinEquipo = !obj\.equipo;/);
  assert.match(resp, /if \(hecho\) obj = objetivoCaptura_\(ref\);/);
  assert.match(resp, /LineasAcciones\.PERSONA_DE_RESPONSIVA\.forEach\(\(\[destino, origen\]\) => \{ if \(origen in valores\) copia\[destino\] = valores\[origen\]; \}\);/);
  ["copia['EQUIPO'] = valores['MODELO'] || '';", "copia['IMEI'] = valores['IMEI'] || '';", "copia['ACCESORIOS'] = valores['ACCESORIOS'] || '';"]
    .forEach((t) => assert.ok(resp.includes(t), t));
  // La misma persona se corrige en la misma asignación (no abre otra)
  assert.match(resp, /guardarCambiosRegistro\(obj\.fila, copia, usuario, ahora, \{ tolerante: true, corregir: true \}\)/);
  // La línea sin equipo guarda su carpeta en LINEAS también dentro de la acción
  assert.match(captura, /const carpetaLinea = objetivo\.equipo \? null\s*: LineasArchivos\.carpetaEvidenciaLinea\(/);
  // Lo vendido o cancelado no abre la responsiva (Vincular ya lo revisó)
  assert.match(captura, /LineasAcciones\.exigirEstatusParaResponsiva\(obj\.fila, !!obj\.equipo, !!\(ref && ref\.desdeCorregir\)\);/);
});

test('el formulario: modelo e IMEI se corrigen; la línea fija; en Vincular la persona fija', () => {
  const ctx = vm.createContext({
    console, Utilities: { formatDate: () => '2026-10-16T12:00' },
    LineasRegistros: { camposAdicionales: () => [] },
    LineasRepo: { CATALOGO: { accesorios: ['CUBO'] }, TAB: { INSP: 'INSP', RESP: 'RESP' }, catalogos: () => ({}) },
    LineasDatos: { nuevoId: () => 'RES-1' }, LineasFirmas: { tiene: () => false }, LineasChecklist: { CONDICIONES: [] },
    LineasUtil: { col: (f, c) => (c in f ? f[c] : null), nucoVisible: (v) => (v ? String(v) : null) },
  });
  vm.runInContext(read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  const fila = { ID: 'EQU-1', NUCO: '12', EQUIPO: 'MOTO G', IMEI: '35', 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'ANA', 'NUMERO TELEFONO': '442' };
  const campos = (f, modo) => Object.fromEntries(ctx.C._formularioResponsiva(f, {}, { nombre: 'CI' }, 'RES-1', new Date(), modo, null, false)
    .filter((e) => e.tipo === 'campo').map((e) => [e.columna, e]));
  const c = campos(fila, 'RESPONSIVA');
  assert.equal(c['MODELO'].soloLectura, false);
  assert.equal(c['IMEI'].soloLectura, false);
  ['No TELEFONO', 'SIM', 'COMPAÑIA', 'RAZON SOCIAL'].forEach((k) => assert.equal(c[k].soloLectura, true, k));
  assert.equal(c['RESPONSABLE'].valor, 'ANA');
  assert.equal(c['RESPONSABLE'].soloLectura, false);
  // En resguardo no tiene persona: se elige
  assert.equal(campos(Object.assign({}, fila, { 'ESTATUS EQUIPO': 'RESGUARDO' }), 'RESPONSIVA')['RESPONSABLE'].valor, '');
  // Vincular o Cambiar línea: firma quien ya lo tiene (usuario, 16-oct)
  const v = campos(fila, 'LINEA');
  assert.equal(v['RESPONSABLE'].soloLectura, true);
  assert.equal(v['No EMPLEADO'].soloLectura, true);
});

test('pantalla: un botón «Responsiva»; inspección solo si otra persona recibe el equipo; luego se guarda con las dos', () => {
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /abrirReasignar|apiLineasReasignar|texto: 'Reasignar', alHacer|Nueva responsiva<\/button>/);
  assert.match(cliente, /icono\('signature'\) \+ ' Responsiva<\/button>'/);
  assert.match(cliente, /if \(btnCaptura\.dataset\.lnCaptura === 'RESPONSIVA'\) abrirResponsiva\(/);
  assert.match(cliente, /texto: 'Responsiva', titulo: 'Misma persona: renueva; otra: reasigna con su inspección', maximo: UNO, grupo: 'documentos',\s*visible: \(f\) => operar\(f\) && conDocumentos\('equipo', f\[0\]\.estatus, f\[0\]\.panel\), alHacer: \(f\) => abrirResponsiva\('equipo', f\[0\]\) \},/);
  assert.match(cliente, /visible: \(f\) => operar\(f\) && !f\[0\]\.equipoId && conDocumentos\('linea', f\[0\]\.estatus\), alHacer: \(f\) => abrirResponsiva\('linea', f\[0\]\) \},/);
  assert.match(cliente, /else if \(a\.tipo === 'responsiva'\) abrirResponsiva\('equipo', a\.fila, a\.persona\);/);
  const fn = cliente.slice(cliente.indexOf('async function abrirResponsiva(tipo, fila, para, opciones)'), cliente.indexOf('const inspeccionesDelDia = {};'));
  // Orden (usuario, 5-oct): responsiva (se revisa, no se guarda) → inspección (se guarda) → responsiva con las dos
  const iResp = fn.indexOf("capturarEnFlujo('RESPONSIVA'");
  const iInsp = fn.indexOf("capturarEnFlujo('INSPECCION', Object.assign({ equipoId: fila.id, reasignar: true, desdeResponsiva: { valores: resp.datos.valores, patron: resp.datos.patron } }");
  const iGuardar = fn.indexOf("llamar('apiLineasGuardarResponsiva', Object.assign({}, d, { inspeccionId: inspeccionId }))");
  assert.ok(iResp > 0 && iResp < iInsp && iInsp < iGuardar, 'responsiva, inspección y luego guardar');
  assert.match(fn, /const reasigna = \(valores\) => esEquipo && !mismaPersonaResponsiva\(fila, valores\);/);
  assert.match(fn, /guardar: \(datos\) => \(reasigna\(datos\.valores\) \? Promise\.resolve\(\{ reasignar: true, datos: datos \}\) : llamar\('apiLineasGuardarResponsiva', datos\)\)/);
  assert.match(fn, /pdfAqui: \(r\) => !r\.reasignar,/);
  assert.match(fn, /if \(!resp \|\| !resp\.reasignar\) return;/);
  assert.match(fn, /let inspeccionId = inspeccionHecha\(fila\.id\);/);
  assert.match(fn, /refrescarDespuesDeCaptura\(fila\.id, 'RESPONSIVA', r\.id, false, pdfInspeccion/);
  // La renovación termina en su ventana con el PDF; la acción no sigue
  assert.match(cliente, /if \(sesion\.flujo && sesion\.flujo\.resolver\) sesion\.flujo\.resolver\(null\);/);
  // Misma regla que el servidor (LineasAcciones.esRenovacion)
  assert.match(cliente, /return String\(fila\.estatus \|\| ''\)\.trim\(\)\.toUpperCase\(\) === 'USO' && !!antes && antes === nombre\(\(valores \|\| \{\}\)\.RESPONSABLE\);/);
  // SIN BLOQUEO escribe «NO APLICA» (usuario, 16-oct)
  assert.match(cliente, /else if \(t === 'SIN BLOQUEO'\) input\.value = 'NO APLICA';/);
});
