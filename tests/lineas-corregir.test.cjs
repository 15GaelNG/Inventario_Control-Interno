const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// «Corregir» en lugar de «Editar», el responsable en blanco en estatus finales y la línea del equipo que sale del
// inventario (usuario, 16-oct; pendiente 2.50)
function cargar(vencida) {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const LineasResguardos = { lineaVencida: () => !!vencida, LINEA_SIN_PANEL: 'CANCELADA' };
  return new Function('LineasRepo', 'CacheService', 'Utilities', 'SpreadsheetApp', 'Config', 'LineasUtil', 'LineasResguardos',
    read('src/services/lineas/LineasRegistros.gs') + '; return LineasRegistros;')(
    { CATALOGO: { estatusLinea: ['USO', 'DISPONIBLE', 'EN PROCESO DE CANCELACION', 'CANCELADA'],
      estatusEquipo: ['USO', 'RESGUARDO', 'PARA VENTA', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'] },
      TIPOS_CON_EQUIPO: { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR' } },
    { getScriptCache: () => ({ get: () => '', put: () => {} }) },
    { formatDate: () => '2026-10-16' }, {}, {}, LineasUtil, LineasResguardos);
}
const usuario = { correo: 'x@y.z' };
const campo = (els, c) => els.filter((e) => e.columna === c)[0];
const titulos = (els) => els.filter((e) => e.tipo === 'titulo').map((e) => e.texto);
const enUso = { TIPO: 'EQUIPO + SIM', NUCO: '12', 'NUMERO TELEFONO': '4421090805', 'ESTATUS LINEA': 'USO', 'ESTATUS EQUIPO': 'USO', RESPONSABLE: 'DANAE', 'NO EMPLEADO': 'CM1' };
const guardado = { TIPO: 'EQUIPO', NUCO: '13', 'ESTATUS EQUIPO': 'RESGUARDO' };
const sola = { TIPO: 'LINEA', 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'USO', RESPONSABLE: 'JUAN', 'COMPAÑIA': 'TELCEL' };

test('Corregir equipo no trae la pestaña Responsable; Agregar equipo y Corregir la línea sola sí', () => {
  const Reg = cargar();
  const conLinea = Reg._elementos(enUso, {}, usuario, Reg._contextoEdicion(enUso, null));
  assert.ok(titulos(conLinea).indexOf('RESPONSABLE') < 0);
  ['RESPONSABLE', 'NO EMPLEADO', 'PUESTO', 'DEPARTAMENTO', 'CUENTA GOOGLE', 'NOMBRE SEGUNDO RESPONSABLE'].forEach((c) => assert.ok(!campo(conLinea, c), c));
  // Conserva Equipo y Accesorios y accesos (la línea y su adendum, con Corregir de la línea)
  assert.deepEqual(titulos(conLinea), ['EQUIPO', 'ACCESORIOS Y ACCESOS']);
  const sinLinea = Reg._elementos(guardado, {}, usuario, Reg._contextoEdicion(guardado, null));
  assert.deepEqual(titulos(sinLinea), ['EQUIPO', 'LÍNEA', 'ADENDUM', 'ACCESORIOS Y ACCESOS']);
  assert.ok(campo(Reg._elementos({}, {}, usuario, { nuevo: true, parte: 'EQUIPO' }), 'RESPONSABLE'));
  assert.ok(campo(Reg._elementos(sola, {}, usuario, Reg._contextoEdicion(sola, null)), 'RESPONSABLE'));
});

test('Corregir equipo ofrece USO: con responsable vigente se guarda directo; sin él lo pasa la Responsiva (pendiente 2.55)', () => {
  const Reg = cargar();
  const opciones = (base) => campo(Reg._elementos(base, {}, usuario, Reg._contextoEdicion(base, null)), 'ESTATUS EQUIPO').opciones;
  // USO, RESGUARDO y los finales, más el que ya tiene; PARA VENTA y PARA DESECHO, con «Mandar a resguardo» (usuario, 21-oct)
  assert.deepEqual(opciones(guardado), ['USO', 'RESGUARDO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO']);
  assert.deepEqual(opciones(Object.assign({}, guardado, { 'ESTATUS EQUIPO': 'PARA VENTA' })), ['USO', 'RESGUARDO', 'PARA VENTA', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO']);
  assert.ok(opciones(enUso).indexOf('USO') >= 0);
  // true = el estatus no cambia aquí y la pantalla abre la Responsiva; responsable vigente = TIPO ASIGNACION PERSONA y RESPONSABLE
  const vendido = { TIPO: 'EQUIPO', NUCO: '14', 'ESTATUS EQUIPO': 'VENDIDO', RESPONSABLE: 'ANA', 'TIPO ASIGNACION': 'PERSONA' };
  assert.equal(Reg._exigirSinPersona(guardado, { 'ESTATUS EQUIPO': 'USO' }), true);
  assert.equal(Reg._exigirSinPersona(vendido, { 'ESTATUS EQUIPO': 'USO' }), false);
  assert.equal(Reg._exigirSinPersona(Object.assign({}, vendido, { 'TIPO ASIGNACION': 'RESGUARDO' }), { 'ESTATUS EQUIPO': 'USO' }), true);
  assert.equal(Reg._exigirSinPersona(Object.assign({}, vendido, { RESPONSABLE: 'N/A' }), { 'ESTATUS EQUIPO': 'USO' }), true);
  assert.equal(Reg._exigirSinPersona(vendido, { 'ESTATUS EQUIPO': 'DONADO' }), false);
  assert.equal(Reg._exigirSinPersona(enUso, { 'ESTATUS EQUIPO': 'USO' }), false);
  // Se guarda lo demás sin el estatus; si solo pedía USO, no se escribe nada
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(reg, /const pideResponsiva = parte === 'EQUIPO' && exigirSinPersona_\(base, enviados\);/);
  assert.match(reg, /if \(pideResponsiva\) delete pedidos\['ESTATUS EQUIPO'\];/);
  assert.match(reg, /const r = resolver_\(elementos, base, pedidos, ctx\);/);
  assert.match(reg, /if \(pideResponsiva && !Object\.keys\(cambios\)\.length\) return \{ guardado: \{ campos: \[\] \}, lineaAlPanel: null, responsiva: true \};/);
  assert.match(reg, /return \{ id: id, cambios: resultado\.guardado\.campos, responsiva: !!resultado\.responsiva,/);
  assert.match(reg, /conResponsable: !!fila && responsableVigente_\(base\)/);
  // La pantalla abre la Responsiva obligatoria: ya, si solo cambió el estatus; si no, después de guardar lo demás
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const aResponsiva = form\.parte !== 'LINEA' && !form\.conResponsable && cambiaA\('ESTATUS EQUIPO', \['USO'\]\);/);
  assert.match(cliente, /const responsivaDeCorregir = \(\) => abrirResponsiva\('equipo', filaDelIndice\('equipo', id\), null, \{ desdeCorregir: true \}\);/);
  assert.match(cliente, /abrirRegistro\(id \|\| r\.id\);\s+if \(r\.responsiva\) responsivaDeCorregir\(\);/);
});

test('estatus finales: sin Responsiva ni Inspección, salvo la Responsiva que abre Corregir equipo (pendiente 2.55)', () => {
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Acc = new Function('LineasRepo', 'LineasDatos', 'LineasUtil', 'LineasResguardos', read('src/services/lineas/LineasAcciones.gs') + '; return LineasAcciones;')({}, {}, LineasUtil, { enPanel: (f) => !!f._enPanel });
  const vendido = { NUCO: '14', 'ESTATUS EQUIPO': 'VENDIDO' };
  const cancelada = { 'NUMERO TELEFONO': '4420000001', 'ESTATUS LINEA': 'CANCELADA' };
  assert.throws(() => Acc.exigirEstatusParaResponsiva(vendido, true), /NUCO 0014 está VENDIDO\./);
  assert.equal(Acc.exigirEstatusParaResponsiva(vendido, true, true), 'VENDIDO');
  // La línea cancelada no se reactiva con Responsiva: con Corregir a DISPONIBLE
  assert.throws(() => Acc.exigirEstatusParaResponsiva(cancelada, false, true), /La línea 4420000001 está CANCELADA\./);
  assert.deepEqual(Acc.ESTATUS_SIN_RESPONSIVA.equipo, ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO', 'EXTRAVIADO', 'ROBADO', 'ROBO']);
  assert.match(read('src/services/lineas/LineasAcciones.gs'), /aplicarResponsiva_\(ref, valores, inspeccionId, usuario, ahora, !!d\.desdeCorregir\)/);
  // La Inspección también: al abrirla y al guardarla; dentro de la Responsiva de Corregir sí
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /if \(!\(ref && ref\.reasignar && ref\.desdeCorregir\) && LineasAcciones\.ESTATUS_SIN_RESPONSIVA\.equipo\.indexOf\(estatus\) >= 0\) \{/);
  assert.match(captura, /const obj = exigirEquipoParaInspeccion_\(objetivoCaptura_\(ref\), ref\);/);
  assert.match(captura, /const obj = exigirEquipoParaInspeccion_\(objetivoCaptura_\(ref\), datos\);/);
  // La pantalla no muestra los botones (ficha y menú de la lista), sin mensaje
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const SIN_DOCUMENTOS = \{ equipo: ESTATUS_EQUIPO_FINAL\.concat\(\['EXTRAVIADO', 'ROBADO', 'ROBO'\]\), linea: ESTATUS_LINEA_PANEL \};/);
  assert.match(cliente, /botonesFicha\('data-linea-id', id, 'linea', puedeOperarLinea && !e && conDocumentos\('linea', l\.estatus\),/);
  assert.equal((cliente.match(/conDocumentos\('equipo', f\[0\]\.estatus, f\[0\]\.panel\)/g) || []).length, 2);
});

test('el servidor rechaza otra persona desde Corregir equipo (una pestaña abierta antes la manda)', () => {
  const Reg = cargar();
  assert.throws(() => Reg._exigirSinPersona(enUso, { RESPONSABLE: 'OTRA PERSONA' }), /RESPONSABLE: la persona se cambia con «Responsiva»\./);
  assert.throws(() => Reg._exigirSinPersona(enUso, { 'NOMBRE SEGUNDO RESPONSABLE': 'ANA' }), /la persona se cambia con «Responsiva»/);
  // Lo mismo que ya tenía no cuenta
  assert.doesNotThrow(() => Reg._exigirSinPersona(enUso, { RESPONSABLE: 'danae', 'NO EMPLEADO': 'CM1', 'ESTATUS EQUIPO': 'USO', EQUIPO: 'HONOR' }));

});

test('el equipo que sale del inventario: su línea en USO queda DISPONIBLE o, con el adendum vencido, al panel o CANCELADA', () => {
  const vigente = cargar(false);
  assert.equal(vigente._lineaSaleDelEquipo(false, enUso, {}), null);
  assert.deepEqual(vigente._lineaSaleDelEquipo(true, enUso, {}), { estatus: 'DISPONIBLE', alPanel: false });
  const vencida = cargar(true);
  assert.throws(() => vencida._lineaSaleDelEquipo(true, enUso, {}), /Línea 4421090805: su adendum venció; elige si va al panel de Resguardos y cancelaciones\./);
  assert.deepEqual(vencida._lineaSaleDelEquipo(true, enUso, { cancelacionLinea: 'PANEL' }), { estatus: 'DISPONIBLE', alPanel: true });
  assert.deepEqual(vencida._lineaSaleDelEquipo(true, enUso, { cancelacionLinea: 'DIRECTO' }), { estatus: 'CANCELADA', alPanel: false });
  assert.deepEqual(vencida.ESTATUS_EQUIPO_FINAL, ['VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO']);
  const reg = read('src/services/lineas/LineasRegistros.gs');
  // Al panel: ya suelta, entra a la bandeja como con «Mandar a cancelación», desde su propio registro (ID LINEA)
  assert.match(reg, /lineaAlPanel: lineaSale && lineaSale\.alPanel \? texto_\(base\['ID LINEA'\]\) : null/);
  assert.match(reg, /LineasResguardos\.mandarCancelacion\(\[resultado\.lineaAlPanel\], \{ comentario: resultado\.motivo, ticket: texto_\(datos && datos\.ticket\) \}, usuario,\s+\{ motivoDelAdendum: true, nucos: \{ \[resultado\.lineaAlPanel\]: resultado\.nuco \} \}\);/);
  // La pantalla lo pregunta en la ventana del comentario
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /const lineaACancelar = form\.lineaVencida && cambiaA\('ESTATUS EQUIPO', ESTATUS_EQUIPO_FINAL\);/);
  assert.match(cliente, /clave: 'cancelacionLinea', etiqueta: 'Línea · adendum vencido', opciones: CANCELACION_LINEA\.map\(\(x\) => x\.texto\), elegir: true, requerido: true/);
});

test('Mandar a resguardo con el adendum vencido: se elige el panel o CANCELADA sin panel', () => {
  const resg = read('src/services/lineas/LineasResguardos.gs');
  assert.match(resg, /const LINEA_SIN_PANEL = 'CANCELADA';/);
  assert.match(resg, /directa: may\(p\.cancelacionLinea\) === CANCELACION_DIRECTA/);
  // La línea se separa: al panel entra sola a Cancelaciones; sin panel queda CANCELADA suelta (pendiente 3.12)
  assert.match(resg, /const sale = !tieneLinea \? '' : \(enCurso \? \(corregir \? '' : 'SIGUE'\) : \(\{ \[LINEA_CANCELACION\]: 'PANEL', \[LINEA_SIN_PANEL\]: 'DIRECTA' \}\)/);
  const cliente = read('src/html/js/lineas.html');
  // CANCELADA directo queda en el historial como cancelación (usuario, 16-oct), también desde Corregir
  assert.match(resg, /registrarCancelacionDirecta\(f0, idLinea, pedido\.COMENTARIO \|\| motivo, ticket, usuario, ahora\);/);
  assert.match(resg, /LineasRepo\.registrarMovimiento\('CANCELACION_LINEA', \{ motivo: motivo, ticket: ticket \}, usuario, ahora, \{\s+refs: \[idLinea, txt\(f\['ID'\]\)\]/);
  assert.match(read('src/services/lineas/LineasRegistros.gs'), /if \(lineaSale && lineaSale\.estatus === LineasResguardos\.LINEA_SIN_PANEL\) \{\s+LineasResguardos\.registrarCancelacionDirecta\(fila, texto_\(base\['ID LINEA'\]\)/);
  assert.match(cliente, /cancelacionLinea: q\.tieneLinea && !q\.cancelacion && v\('ESTATUS LINEA'\) === LINEA_SIN_PANEL \? 'DIRECTO' : ''/);
});

test('responsable en blanco en el equipo VENDIDO, DONADO, DESECHADO o EXTRAVIO-ROBO y en la línea sola CANCELADA', () => {
  const fin = new Date('2026-10-01T12:00:00Z');
  const hojas = {
    LINEAS: [{ 'ID': 'LIN-C', 'NUMERO TELEFONO': '4420000009', 'ESTATUS LINEA': 'CANCELADA' }],
    EQUIPOS: [{ 'ID': 'EQU-V', 'NUCO': '0001', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'VENDIDO' },
      { 'ID': 'EQU-R', 'NUCO': '0002', 'TIPO DE EQUIPO': 'CELULAR', 'ESTATUS EQUIPO': 'RESGUARDO' }],
    ASIGNACIONES: [
      { 'ID': 'ASG-1', 'TIPO': 'PERSONA', 'ID EQUIPO': 'EQU-V', 'RESPONSABLE': 'ANA', 'NO EMPLEADO': 'CM1', 'SEDE': 'QUERETARO', 'FECHA FIN': fin },
      { 'ID': 'ASG-2', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-C', 'RESPONSABLE': 'LUIS', 'FECHA FIN': fin },
      { 'ID': 'ASG-3', 'TIPO': 'PERSONA', 'ID EQUIPO': 'EQU-R', 'RESPONSABLE': 'PEPE', 'FECHA FIN': fin },
    ],
  };
  const LineasDatos = {
    existeTabla: (n) => !!hojas[n], leerTabla: (n) => (hojas[n] || []).map((f) => Object.assign({}, f)),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN/i.test(h), normCol: (h) => String(h || '').toUpperCase().trim(),
    // El alta sale del movimiento ALTA de MOVIMIENTOS (pendiente 2.51)
    cacheLeer: () => null, cacheGuardar: () => {},
    buscarFilas: (n, col, valor) => (hojas[n] || []).map((f, i) => (String(f[col]) === valor ? i + 2 : 0)).filter(Boolean),
    leerFilas: (pedidos) => pedidos.map((p) => p.filas.map((i) => Object.assign({ _fila: i }, hojas[p.tabla][i - 2]))),
  };
  const L = new Function('LineasDatos', 'LineasRepo', read('src/services/lineas/LineasLectura.gs') + '; return LineasLectura;')(
    LineasDatos, { folioRegistro: () => '', borrarCaches: () => {} });
  const por = (id) => L.filas().filter((f) => f.ID === id)[0];
  assert.equal(por('EQU-V').RESPONSABLE, '');
  assert.equal(por('EQU-V')['NO EMPLEADO'], '');
  // Tampoco la ubicación (usuario, 22-oct: «aún queda oficina y sede»)
  assert.deepEqual(['SEDE', 'OFICINA / DESARROLLO', 'DEPARTAMENTO', 'AREA'].map((c) => por('EQU-V')[c] || ''), ['', '', '', '']);
  assert.equal(por('LIN-C').RESPONSABLE, '');
  // Guardado no es final: sigue mostrando con quién estuvo
  assert.equal(por('EQU-R').RESPONSABLE, 'PEPE');
});

test('pantalla: «Corregir» e «Inspección», Responsiva primero', () => {
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /'Editar línea'|'Editar equipo'|Nueva inspección/);
  assert.match(cliente, /textContent = tipo === 'INSPECCION' \? 'Inspección' : 'Responsiva';/);
  const botones = cliente.slice(cliente.indexOf('function botonesFicha('), cliente.indexOf('function abrirMenuFicha('));
  assert.ok(botones.indexOf('data-ln-captura="RESPONSIVA"') < botones.indexOf('data-ln-captura="INSPECCION"'));
});

test('en el panel de Pau: Corregir no cambia el estatus y no hay Responsiva ni Inspección (pendiente 3.15)', () => {
  const Reg = cargar();
  const enPanel = campo(Reg._elementos(guardado, {}, usuario, Reg._contextoEdicion(guardado, null, true)), 'ESTATUS EQUIPO');
  assert.ok(enPanel.soloLectura);
  assert.equal(enPanel.valor, 'RESGUARDO');
  assert.ok(!campo(Reg._elementos(guardado, {}, usuario, Reg._contextoEdicion(guardado, null, false)), 'ESTATUS EQUIPO').soloLectura);
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.match(reg, /const edicion = contextoEdicion_\(base, datos && datos\.parte, equipoEnPanel_\(fila, base, datos && datos\.parte\)\);/);
  assert.match(reg, /está en Resguardos y cancelaciones: su estatus lo cambia el panel\./);
  const LineasUtil = new Function('LineasDatos', 'LineasArchivos', read('src/services/lineas/LineasUtil.gs') + '; return LineasUtil;')({}, {});
  const Acc = new Function('LineasRepo', 'LineasDatos', 'LineasUtil', 'LineasResguardos', read('src/services/lineas/LineasAcciones.gs') + '; return LineasAcciones;')({}, {}, LineasUtil, { enPanel: (f) => !!f._enPanel });
  assert.throws(() => Acc.exigirEstatusParaResponsiva({ NUCO: '15', 'ESTATUS EQUIPO': 'POR RECIBIR', _enPanel: true }, true), /NUCO 0015 está en Resguardos y cancelaciones\./);
  assert.match(read('src/services/lineas/LineasCaptura.gs'), /if \(LineasResguardos\.enPanel\(obj\.fila\)\) throw new Error/);
});
