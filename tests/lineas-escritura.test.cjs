const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Reestructura, etapa 3 paso 1 (LineasEscritura.gs): guardar escribe en las hojas nuevas. Se prueba el ciclo completo
// con las hojas en memoria: el renglón armado (LineasLectura) → guardar → cómo quedan las hojas y el renglón armado.
const leer = (archivo) => fs.readFileSync(path.join(__dirname, '../src/services/lineas', archivo), 'utf8');

function cargar(inicial, retirada) {
  const hojas = JSON.parse(JSON.stringify(inicial), (k, v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) ? new Date(v) : v));
  hojas['LINEAS TELEFONICAS'] = hojas['LINEAS TELEFONICAS'] || [];
  const escrituras = [];
  const lecturas = [];
  const LineasDatos = {
    ZONA_APP: 'America/Mexico_City',
    existeTabla: (n) => !!hojas[n],
    leerTabla: (n) => { lecturas.push(n); return (hojas[n] || []).map((f, i) => Object.assign({ _fila: i + 2 }, f)); },
    actualizarFila: (n, fila, cambios) => { escrituras.push([n, 'actualizar']); Object.assign(hojas[n][fila - 2], cambios); },
    agregarFilas: (n, objetos) => objetos.map((o) => { escrituras.push([n, 'agregar']); hojas[n].push(Object.assign({}, o)); return hojas[n].length + 1; }),
    recordar: (clave, nombres, armar) => JSON.parse(JSON.stringify(armar())),
    esColumnaFecha: (h) => /FECHA|INICIO PLAN|FIN PLAN|_EN$/i.test(h),
    normCol: (h) => String(h || '').toUpperCase().replace(/\s+/g, ' ').trim(),
    olvidarTabla: () => {}, cacheBorrar: () => {}, tocar: () => {},
  };
  const LineasRepo = { DEPARTAMENTO_DISPONIBLE: 'DISPONIBLE', folioRegistro: (t, n) => t + n, borrarCaches: () => {} };
  let n = 0;
  const Ids = { nuevo: (p) => p + '-NUEVO' + (++n) };
  const Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };
  const PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (k === 'LINEAS_HOJA_VIEJA_RETIRADA' ? retirada || null : 'ESTRUCTURA') }) };
  const fuente = leer('LineasUtil.gs') + ';' + leer('LineasEstructura.gs') + ';' + leer('LineasLectura.gs') + ';' + leer('LineasEscritura.gs') +
    '; return { LineasLectura, LineasEscritura };';
  const m = new Function('LineasDatos', 'LineasRepo', 'Ids', 'Utilities', 'PropertiesService', 'soloEditor_', fuente)(
    LineasDatos, LineasRepo, Ids, Utilities, PropertiesService, () => {});
  const usuario = { correo: 'prueba@x', nombre: 'PRUEBA' };
  const ahora = new Date('2026-10-03T18:00:00Z');
  const registro = (id) => m.LineasLectura.filas().find((f) => f['ID'] === id);
  return {
    hojas, escrituras, lecturas, registro, olvidar: () => m.LineasLectura.olvidar(),
    guardar: (id, cambios, opciones) => m.LineasEscritura.guardar(registro(id), cambios, usuario, ahora, opciones),
    agregar: (datos) => m.LineasEscritura.agregar(datos),
    cuantos: (id) => m.LineasLectura.filas().filter((f) => f['ID'] === id).length,
    tocados: () => m.LineasEscritura.tocados(),
    vigentes: () => hojas.ASIGNACIONES.filter((a) => !a['FECHA FIN']),
  };
}

const BASE = {
  EQUIPOS: [
    { 'ID': 'EQU-1', 'ID ANTERIOR': 'LIN-V1', 'NUCO': '0012', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'HONOR X6', 'IMEI': '111', 'ESTATUS EQUIPO': 'USO' },
    { 'ID': 'EQU-2', 'ID ANTERIOR': 'LIN-V2', 'NUCO': '0020', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO', 'IMEI': '222', 'ESTATUS EQUIPO': 'RESGUARDO' },
    { 'ID': 'EQU-3', 'ID ANTERIOR': 'LIN-V3', 'NUCO': '0030', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'MOTO', 'IMEI': '333', 'ESTATUS EQUIPO': 'VENDIDO' },
  ],
  LINEAS: [
    { 'ID': 'LIN-A', 'NUMERO TELEFONO': '4421090805', 'TIPO DE LINEA': 'PLAN', 'COMPAÑIA': 'AT&T', 'NUMERO SIM': '8952', 'ESTATUS LINEA': 'USO', 'PIN WHATSAPP': '123456' },
    { 'ID': 'LIN-B', 'NUMERO TELEFONO': '4425550000', 'TIPO DE LINEA': 'PLAN', 'COMPAÑIA': 'TELCEL', 'ESTATUS LINEA': 'DISPONIBLE' },
    { 'ID': 'LIN-C', 'ID ANTERIOR': 'LIN-V4', 'NUMERO TELEFONO': '4461456538', 'TIPO DE LINEA': 'SIM BASICO', 'ESTATUS LINEA': 'USO' },
  ],
  ASIGNACIONES: [
    { 'ID': 'ASG-1', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-A', 'ID EQUIPO': 'EQU-1', 'ID PERSONA': 'PER-9', 'NO EMPLEADO': '500', 'RESPONSABLE': 'DANAE',
      'PUESTO': 'ASESOR', 'DEPARTAMENTO': 'COMERCIALIZACION', 'SEDE': 'QUERETARO', 'OFICINA / DESARROLLO': 'CORPORATIVO', 'FECHA INICIO': '2026-01-01T12:00:00Z', 'FECHA FIN': '' },
    { 'ID': 'ASG-2', 'TIPO': 'RESGUARDO', 'ID LINEA': 'LIN-B', 'ID EQUIPO': 'EQU-2', 'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'MERIDA', 'OFICINA / DESARROLLO': 'ALMACEN',
      'FECHA INICIO': '2026-02-01T12:00:00Z', 'FECHA FIN': '' },
    { 'ID': 'ASG-3', 'TIPO': 'PERSONA', 'ID LINEA': 'LIN-C', 'ID EQUIPO': '', 'RESPONSABLE': 'LUIS', 'FECHA INICIO': '2026-03-01T12:00:00Z', 'FECHA FIN': '' },
  ],
  ADENDUMS: [
    { 'ID': 'ADE-1', 'ID LINEA': 'LIN-A', 'COSTO PLAN': 449, 'FIN PLAN': '2026-04-08T12:00:00Z', 'FUENTE': 'INVENTARIO (SIN CONFIRMAR)' },
  ],
};

test('corregir datos del aparato: solo cambia EQUIPOS y la asignación sigue igual', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', { 'IMEI': '999', 'EQUIPO': 'HONOR X7' });
  assert.strictEqual(t.hojas.EQUIPOS[0]['IMEI'], '999');
  assert.strictEqual(t.hojas.EQUIPOS[0]['MODELO'], 'HONOR X7');
  assert.deepStrictEqual(r.campos.map((c) => c.campo).sort(), ['EQUIPO', 'IMEI']);
  assert.deepStrictEqual(r.idsCambios, []); // la bitácora CAMBIOS ya no se escribe
  assert.strictEqual(t.hojas.ASIGNACIONES.length, 3);
  assert.ok(!t.escrituras.some(([n]) => n === 'LINEAS TELEFONICAS'));
});

test('corregir sede o puesto edita la asignación vigente', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', { 'SEDE': 'MERIDA', 'JEFE DIRECTO': 'ALGUIEN' });
  assert.strictEqual(t.hojas.ASIGNACIONES.length, 3);
  assert.strictEqual(t.hojas.ASIGNACIONES[0]['SEDE'], 'MERIDA');
  assert.deepStrictEqual(r.campos.map((c) => c.campo), ['SEDE']); // JEFE DIRECTO ya no se guarda (parte 3)
});

test('llenar un responsable vacío no es reasignar', () => {
  const t = cargar(Object.assign({}, BASE, { ASIGNACIONES: BASE.ASIGNACIONES.map((a) => (a['ID'] === 'ASG-1' ? Object.assign({}, a, { 'RESPONSABLE': '' }) : a)) }));
  t.guardar('EQU-1', { 'RESPONSABLE': 'DANAE' });
  assert.strictEqual(t.hojas.ASIGNACIONES.length, 3);
  assert.strictEqual(t.hojas.ASIGNACIONES[0]['RESPONSABLE'], 'DANAE');
});

test('reasignar: cierra la asignación y abre otra con la persona nueva (equipo y línea juntos)', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', { 'RESPONSABLE': 'MARIO', 'NO EMPLEADO': '777', 'ESTATUS EQUIPO': 'USO' });
  const vieja = t.hojas.ASIGNACIONES[0];
  assert.ok(vieja['FECHA FIN'] instanceof Date, 'la anterior queda cerrada, no se borra');
  const nueva = t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-1');
  assert.strictEqual(nueva['TIPO'], 'PERSONA');
  assert.strictEqual(nueva['ID LINEA'], 'LIN-A');
  assert.strictEqual(nueva['RESPONSABLE'], 'MARIO');
  assert.strictEqual(nueva['SEDE'], 'QUERETARO'); // lo que no cambió en el formulario se queda
  assert.strictEqual(nueva['ID PERSONA'], ''); // el ID de la persona anterior no pasa a la nueva
  assert.ok(r.refs.indexOf(nueva['ID']) >= 0 && r.refs.indexOf('ASG-1') >= 0);
  const f = t.registro('EQU-1');
  assert.strictEqual(f['RESPONSABLE'], 'MARIO');
  assert.strictEqual(f['NUMERO TELEFONO'], '4421090805');
});

test('mandar a resguardo: asignación de resguardo sin persona, con departamento DISPONIBLE, sede y oficina', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', {
    'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'CANCUN', 'OFICINA / DESARROLLO': 'ALMACEN', 'ESTATUS EQUIPO': 'RESGUARDO', 'ESTATUS LINEA': 'DISPONIBLE',
    'RESPONSABLE': 'N/A', 'PUESTO': 'N/A', 'JEFE DIRECTO': 'N/A', 'DIRECTOR': 'N/A', 'PIN WHATSAPP': 'N/A', 'COMENTARIOS': 'SE GUARDA POR BAJA',
  });
  const nueva = t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-1');
  assert.strictEqual(nueva['TIPO'], 'RESGUARDO');
  assert.strictEqual(nueva['ID LINEA'], 'LIN-A');
  assert.strictEqual(nueva['RESPONSABLE'], '');
  assert.strictEqual(nueva['NO EMPLEADO'], ''); // sin persona, aunque la hoja vieja lo dejaba
  assert.strictEqual(nueva['DEPARTAMENTO'], 'DISPONIBLE');
  assert.strictEqual(nueva['SEDE'], 'CANCUN');
  assert.strictEqual(t.hojas.EQUIPOS[0]['ESTATUS EQUIPO'], 'RESGUARDO');
  assert.strictEqual(t.hojas.LINEAS[0]['ESTATUS LINEA'], 'DISPONIBLE');
  assert.strictEqual(t.hojas.LINEAS[0]['PIN WHATSAPP'], ''); // N/A se guarda en blanco
  const campos = r.campos.map((c) => c.campo);
  assert.ok(campos.indexOf('COMENTARIOS') >= 0, 'el comentario va al historial');
  assert.ok(campos.indexOf('RESPONSABLE') >= 0, 'la salida de la persona queda en el historial');
});

test('mandar a cancelación: la línea sigue con su equipo y su persona hasta que se confirma', () => {
  const t = cargar(BASE);
  t.guardar('EQU-1', { 'ESTATUS LINEA': 'EN PROCESO DE CANCELACION' });
  assert.strictEqual(t.hojas.ASIGNACIONES.length, 3);
  assert.strictEqual(t.registro('EQU-1')['ESTATUS LINEA'], 'EN PROCESO DE CANCELACION');
});

test('confirmar la cancelación: la línea conserva su número, queda CANCELADA y deja al equipo', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', {
    'NUMERO TELEFONO': 'NO APLICA', 'NUMERO SIM': 'NO APLICA', 'PIN WHATSAPP': 'NO APLICA', 'COMPAÑIA': '', 'COSTO PLAN': 0,
    'INICIO PLAN': '', 'FIN PLAN': '', 'ESTATUS LINEA': 'CANCELADA', 'TIPO': 'EQUIPO',
  });
  assert.strictEqual(t.hojas.LINEAS[0]['NUMERO TELEFONO'], '4421090805');
  assert.strictEqual(t.hojas.LINEAS[0]['COMPAÑIA'], 'AT&T');
  assert.strictEqual(t.hojas.LINEAS[0]['ESTATUS LINEA'], 'CANCELADA');
  assert.strictEqual(t.hojas.ADENDUMS[0]['COSTO PLAN'], 449);
  const nueva = t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-1');
  assert.strictEqual(nueva['ID LINEA'], '');
  assert.strictEqual(nueva['RESPONSABLE'], 'DANAE');
  assert.ok(!t.vigentes().some((a) => a['ID LINEA'] === 'LIN-A'), 'la línea cancelada no vive en ninguna asignación');
  assert.deepStrictEqual(t.tocados(), ['LIN-A']);
  assert.ok(r.campos.some((c) => c.campo === 'NUMERO TELEFONO' && c.despues === ''));
  assert.strictEqual(t.registro('EQU-1')['TIPO'], 'EQUIPO');
  assert.strictEqual(t.registro('LIN-A')['ESTATUS LINEA'], 'CANCELADA');
});

test('vendido: el equipo sale de toda asignación y la línea disponible se queda guardada aparte', () => {
  const t = cargar(BASE);
  t.guardar('EQU-2', { 'ESTATUS EQUIPO': 'VENDIDO' });
  assert.ok(!t.vigentes().some((a) => a['ID EQUIPO'] === 'EQU-2'));
  const linea = t.vigentes().find((a) => a['ID LINEA'] === 'LIN-B');
  assert.strictEqual(linea['TIPO'], 'RESGUARDO');
  assert.strictEqual(linea['SEDE'], 'MERIDA');
  const f = t.registro('EQU-2');
  assert.strictEqual(f['DEPARTAMENTO'], 'N/A');
  assert.strictEqual(f['SEDE'], 'MERIDA'); // muestra su última asignación cerrada
});

test('de resguardo a uso con su persona (reasignar): abre la asignación con persona y deja DISPONIBLE fuera', () => {
  const t = cargar(BASE);
  t.guardar('EQU-2', { 'ESTATUS EQUIPO': 'USO', 'ESTATUS LINEA': 'USO', 'RESPONSABLE': 'ANA', 'PUESTO': 'GERENTE' });
  const nueva = t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-2');
  assert.strictEqual(nueva['TIPO'], 'PERSONA');
  assert.strictEqual(nueva['ID LINEA'], 'LIN-B');
  assert.strictEqual(nueva['RESPONSABLE'], 'ANA');
  assert.strictEqual(nueva['DEPARTAMENTO'], ''); // DISPONIBLE es de lo guardado
});

test('lo que no tiene dónde guardarse avisa; la inspección (tolerante) lo ignora', () => {
  const t = cargar(BASE);
  assert.throws(() => t.guardar('EQU-3', { 'RESPONSABLE': 'PEDRO' }), /no tiene asignación vigente/);
  assert.throws(() => t.guardar('EQU-2', { 'RESPONSABLE': 'PEDRO' }), /Reasignar/);
  assert.throws(() => t.guardar('LIN-C', { 'NUCO': '1500' }), /NUCO es del aparato/);
  const r = t.guardar('EQU-2', { 'RESPONSABLE': 'PEDRO', 'SEDE': 'CANCUN' }, { tolerante: true });
  assert.deepStrictEqual(r.campos.map((c) => c.campo), ['SEDE']);
  assert.strictEqual(t.hojas.ASIGNACIONES[1]['RESPONSABLE'], undefined);
});

test('TIPO: quitar o poner la línea es una acción; cambiar el tipo de línea sí se corrige', () => {
  const t = cargar(BASE);
  assert.throws(() => t.guardar('EQU-1', { 'TIPO': 'EQUIPO', 'NUMERO TELEFONO': 'NO APLICA' }), /Mandar a cancelación/);
  assert.throws(() => t.guardar('EQU-3', { 'TIPO': 'EQUIPO + SIM' }), /acción/);
  t.guardar('EQU-1', { 'TIPO': 'EQUIPO + SIM BASICO' });
  assert.strictEqual(t.hojas.LINEAS[0]['TIPO DE LINEA'], 'SIM BASICO');
});

test('adendum: se corrige el más reciente si no viene del proveedor', () => {
  const t = cargar(BASE);
  t.guardar('EQU-1', { 'COSTO PLAN': 499 });
  assert.strictEqual(t.hojas.ADENDUMS[0]['COSTO PLAN'], 499);
  const p = cargar(Object.assign({}, BASE, { ADENDUMS: [Object.assign({}, BASE.ADENDUMS[0], { 'FUENTE': 'BARRIDO AT&T' })] }));
  assert.throws(() => p.guardar('EQU-1', { 'COSTO PLAN': 499 }), /viene del proveedor/);
  assert.strictEqual(p.hojas.EQUIPOS[0]['IMEI'], '111');
});

test('alta: equipo, línea, adendum y asignación en las hojas nuevas; el ID del registro es el del equipo', () => {
  const t = cargar(BASE);
  const datos = { 'TIPO': 'EQUIPO + SIM', 'NUCO': '77', 'EQUIPO': 'HONOR', 'IMEI': '444', 'NUMERO TELEFONO': '4420000000',
    'COMPAÑIA': 'TELCEL', 'COSTO PLAN': 300, 'FIN PLAN': new Date('2027-01-01T12:00:00Z'), 'ESTATUS EQUIPO': 'USO', 'ESTATUS LINEA': '',
    'RESPONSABLE': 'ROSA', 'SEDE': 'QUERETARO', 'PIN WHATSAPP': 'NO APLICA', 'FECHA REGISTRO': new Date('2026-10-03T18:00:00Z') };
  const r = t.agregar(datos);
  assert.ok(/^EQU-/.test(datos['ID']) && r.id === datos['ID']);
  const e = t.hojas.EQUIPOS.find((x) => x['ID'] === r.id);
  assert.strictEqual(e['NUCO'], '0077');
  const l = t.hojas.LINEAS.find((x) => x['NUMERO TELEFONO'] === '4420000000');
  assert.strictEqual(l['TIPO DE LINEA'], 'PLAN');
  assert.strictEqual(l['PIN WHATSAPP'], '');
  assert.strictEqual(t.hojas.ADENDUMS.find((x) => x['ID LINEA'] === l['ID'])['FUENTE'], 'CAPTURA A MANO');
  const a = t.vigentes().find((x) => x['ID EQUIPO'] === r.id);
  assert.strictEqual(a['ID LINEA'], l['ID']); // la línea sin estatus va con su equipo
  assert.strictEqual(a['RESPONSABLE'], 'ROSA');
  assert.strictEqual(t.registro(r.id)['NUMERO TELEFONO'], '4420000000');
  // Una sola vez, aunque el alta sea lo primero que se escribe (antes quedaba dos veces en memoria, prueba del 4-oct)
  assert.strictEqual(t.cuantos(r.id), 1);
  assert.strictEqual(t.hojas.EQUIPOS.filter((x) => x['ID'] === r.id).length, 1);
});

test('alta de una línea sola disponible: asignación de resguardo con DISPONIBLE', () => {
  const t = cargar(BASE);
  const datos = { 'TIPO': 'LINEA', 'NUMERO TELEFONO': '4421111111', 'ESTATUS LINEA': 'DISPONIBLE', 'NUCO': '1600' };
  const r = t.agregar(datos);
  assert.ok(/^LIN-/.test(r.id));
  const a = t.vigentes().find((x) => x['ID LINEA'] === r.id);
  assert.strictEqual(a['TIPO'], 'RESGUARDO');
  assert.strictEqual(a['DEPARTAMENTO'], 'DISPONIBLE');
  assert.ok(!t.hojas.EQUIPOS.some((x) => x['NUCO'] === '1600'), 'el NUCO es solo del aparato');
});

test('COLOR es del aparato: se guarda en EQUIPOS, se muestra en el registro y entra en el alta', () => {
  const t = cargar(BASE);
  const r = t.guardar('EQU-1', { 'COLOR': 'NEGRO' });
  assert.strictEqual(t.hojas.EQUIPOS[0]['COLOR'], 'NEGRO');
  assert.deepStrictEqual(r.campos.map((c) => c.campo), ['COLOR']);
  assert.strictEqual(t.registro('EQU-1')['COLOR'], 'NEGRO');
  assert.throws(() => t.guardar('LIN-C', { 'COLOR': 'AZUL' }), /COLOR es del aparato/);
  const datos = { 'TIPO': 'EQUIPO', 'NUCO': '78', 'EQUIPO': 'MOTO', 'COLOR': 'VERDE', 'ESTATUS EQUIPO': 'RESGUARDO', 'SEDE': 'MERIDA' };
  const alta = t.agregar(datos);
  assert.strictEqual(t.hojas.EQUIPOS.find((x) => x['ID'] === alta.id)['COLOR'], 'VERDE');
});

test('rapidez: después de escribir, la lectura usa las hojas en memoria (no las vuelve a leer) y lee como la hoja', () => {
  const t = cargar(BASE);
  t.guardar('EQU-1', { 'SEDE': 'QRO' }); // se guarda como CH ("QRO") y se lee completo ("QUERETARO")
  t.lecturas.length = 0;
  t.olvidar();
  const f = t.registro('EQU-1');
  assert.strictEqual(f['SEDE'], 'QUERETARO');
  assert.deepStrictEqual(t.lecturas.filter((n) => ['LINEAS', 'EQUIPOS', 'ASIGNACIONES', 'ADENDUMS'].indexOf(n) >= 0), []);
});

// ---- Editar (usuario, 4-oct): corregir a la persona en su lugar y ponerle línea a un equipo sin línea ----
const CON_SIN_LINEA = Object.assign({}, BASE, {
  EQUIPOS: BASE.EQUIPOS.concat([{ 'ID': 'EQU-4', 'NUCO': '0040', 'TIPO DE EQUIPO': 'CELULAR', 'MODELO': 'A15', 'IMEI': '444', 'ESTATUS EQUIPO': 'USO' }]),
  LINEAS: BASE.LINEAS.concat([{ 'ID': 'LIN-D', 'NUMERO TELEFONO': '4420001111', 'TIPO DE LINEA': 'PLAN', 'COMPAÑIA': 'TELCEL', 'NUMERO SIM': '8953', 'ESTATUS LINEA': 'DISPONIBLE' }]),
  ASIGNACIONES: BASE.ASIGNACIONES.concat([
    { 'ID': 'ASG-4', 'TIPO': 'PERSONA', 'ID LINEA': '', 'ID EQUIPO': 'EQU-4', 'RESPONSABLE': 'ROSA', 'SEDE': 'QUERETARO', 'FECHA INICIO': '2026-05-01T12:00:00Z', 'FECHA FIN': '' },
    { 'ID': 'ASG-5', 'TIPO': 'RESGUARDO', 'ID LINEA': 'LIN-D', 'ID EQUIPO': '', 'DEPARTAMENTO': 'DISPONIBLE', 'SEDE': 'QUERETARO', 'FECHA INICIO': '2026-05-01T12:00:00Z', 'FECHA FIN': '' },
  ]),
});

test('corregir a la persona (Editar): el dato cambia en la misma asignación, no es reasignar', () => {
  const t = cargar(BASE);
  t.guardar('EQU-1', { 'RESPONSABLE': 'DANAE PEREZ' }, { corregir: true });
  assert.strictEqual(t.hojas.ASIGNACIONES.length, 3);
  assert.strictEqual(t.hojas.ASIGNACIONES[0]['RESPONSABLE'], 'DANAE PEREZ');
  assert.strictEqual(t.hojas.ASIGNACIONES[0]['FECHA FIN'], '');
});

test('ponerle a un equipo una línea nueva: se crea y queda en su asignación', () => {
  const t = cargar(CON_SIN_LINEA);
  const r = t.guardar('EQU-4', { 'NUMERO TELEFONO': '4429998888', 'NUMERO SIM': '8954', 'COMPAÑIA': 'AT&T', 'TIPO DE LINEA': 'SIM BASICO', 'COSTO PLAN': 99, 'FIN PLAN': '2027-01-01' });
  const nueva = t.hojas.LINEAS.find((l) => l['NUMERO TELEFONO'] === '4429998888');
  assert.ok(nueva, 'la línea se creó');
  assert.strictEqual(nueva['ESTATUS LINEA'], 'USO'); // con una persona
  assert.strictEqual(nueva['TIPO DE LINEA'], 'SIM BASICO');
  const vigente = t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-4');
  assert.strictEqual(vigente['ID LINEA'], nueva['ID']);
  assert.strictEqual(vigente['RESPONSABLE'], 'ROSA');
  assert.ok(t.hojas.ADENDUMS.some((d) => d['ID LINEA'] === nueva['ID'] && d['COSTO PLAN'] === 99));
  assert.ok(r.campos.some((c) => c.campo === 'NUMERO TELEFONO' && c.despues === '4429998888'));
  assert.strictEqual(t.registro('EQU-4')['TIPO'], 'EQUIPO + SIM BASICO'); // el TIPO sale solo
});

test('ponerle a un equipo una línea sola que ya existe: deja su asignación y conserva lo que no se capturó', () => {
  const t = cargar(CON_SIN_LINEA);
  t.guardar('EQU-4', { 'NUMERO TELEFONO': '4420001111', 'NUMERO SIM': '', 'FIN PLAN': '2030-01-01' });
  const d = t.hojas.LINEAS.find((l) => l['ID'] === 'LIN-D');
  assert.strictEqual(d['NUMERO SIM'], '8953'); // lo vacío no borra lo que tenía
  assert.strictEqual(d['ESTATUS LINEA'], 'USO');
  assert.ok(t.hojas.ASIGNACIONES.find((a) => a['ID'] === 'ASG-5')['FECHA FIN'] instanceof Date, 'su asignación de resguardo se cierra');
  assert.strictEqual(t.vigentes().find((a) => a['ID EQUIPO'] === 'EQU-4')['ID LINEA'], 'LIN-D');
  assert.ok(t.tocados().indexOf('LIN-D') >= 0);
  assert.strictEqual(t.registro('EQU-4')['TIPO'], 'EQUIPO + SIM');
});

test('no se le pone a un equipo la línea de otro equipo, ni se borra el número de una línea', () => {
  const t = cargar(CON_SIN_LINEA);
  assert.throws(() => t.guardar('EQU-4', { 'NUMERO TELEFONO': '4421090805' }), /está en el NUCO 0012/);
  assert.throws(() => t.guardar('EQU-1', { 'NUMERO TELEFONO': '' }), /no se borra/);
});

test('paso 4: con LINEAS TELEFONICAS retirada no se lee; rutas y NUCO de la línea sola salen de las hojas nuevas', () => {
  const vieja = [{ 'ID': 'LIN-V4', 'NUCO': '0777', 'COMENTARIOS': 'VIEJO', 'RESPONSIVA': 'R_Files_/vieja.pdf' }];
  const base = Object.assign({}, BASE, { 'LINEAS TELEFONICAS': vieja });
  // Antes de retirarla: se lee de la hoja vieja
  const antes = cargar(base);
  assert.strictEqual(antes.registro('LIN-C')['NUCO'], '0777');
  assert.strictEqual(antes.registro('LIN-C')['COMENTARIOS'], 'VIEJO');
  // Retirada: la hoja vieja no se lee; lo copiado está en LINEAS (NUCO ANTERIOR y la ruta)
  const lineas = BASE.LINEAS.map((l) => (l['ID'] === 'LIN-C' ? Object.assign({}, l, { 'NUCO ANTERIOR': '0777', 'RESPONSIVA': 'R_Files_/vieja.pdf' }) : l));
  const t = cargar(Object.assign({}, base, { LINEAS: lineas }), '2026-10-04T23:00:00.000Z');
  assert.strictEqual(t.registro('LIN-C')['NUCO'], '0777');
  assert.strictEqual(t.registro('LIN-C')['RESPONSIVA'], 'R_Files_/vieja.pdf');
  assert.strictEqual(t.registro('LIN-C')['COMENTARIOS'], ''); // el comentario viejo vive en MOVIMIENTOS
  assert.ok(t.lecturas.indexOf('LINEAS TELEFONICAS') < 0, 'no se leyó la hoja vieja');
});
