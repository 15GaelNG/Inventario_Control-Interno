/**
 * Pruebas de PendientesInspeccionService.gs con Apps Script simulado: que la hoja nazca sola
 * con el primer pendiente, que agregar() ignore los renglones sin asunto y le anteponga el folio
 * de la inspección, y que revisarCargaHelpdesk() empate por texto contra la copia local de
 * Help Desk (HelpdeskService.copiaLocal_) -- nunca contra Help Desk en vivo.
 *
 * Correr: node tests/pendientes-inspeccion.test.js
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function entorno(ticketsHelpdesk, colaboradores, correos) {
  const e = crearEntorno({ libros: { libro: {} } });
  const tocados = [];
  Object.assign(e.contexto, {
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'libro' } },
    CacheHojas: { tocarHoja: (hoja) => tocados.push(hoja.getName()), tocar: () => {} },
    HelpdeskService: { copiaLocal_: () => ticketsHelpdesk || [] },
    Permisos: { puedeLeer: () => ({ nombre: 'KIKE' }), puedeEditar: () => ({ nombre: 'KIKE' }) },
    HojaServicio: { fechaISO: (v) => (v instanceof Date ? v.toISOString() : (v || '')) },
    CapitalHumano: { listarColaboradores: () => colaboradores || [] },
    MailApp: { sendEmail: (opciones) => { (correos || []).push(opciones); } },
  });
  e.cargar('src/utils/SheetUtils.gs', 'src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/services/PendientesInspeccionService.gs');
  return { e, P: e.global('PendientesInspeccionService'), tocados };
}

const FILA_INSPECCION = {
  'ID VEHICULO': 'VEH-00000000AAAAAA', 'PLACAS': 'ggr658f', 'NUCO': '25',
  'VEHICULO': 'HONDA 150XR', 'RESPONSABLE': 'JORGE AVECILLA',
};

console.log('1. agregar(): nace la hoja sola, ignora los sin asunto, antepone el folio de la inspección');
{
  const { e, P, tocados } = entorno();
  ok(e.libros.libro.getSheetByName('PENDIENTES INSPECCION') === null, 'todavía no existe');
  const creados = P.agregar(FILA_INSPECCION, '2026_25_1', [
    { asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' },
    { asunto: '   ', familia: 'OTROS', prioridad: 'NO URGENTE' },
    { asunto: 'Cambio de llanta', familia: 'ACCESORIOS', prioridad: 'raro' },
  ], 'responsable@x.com', ['inspector@x.com', 'otro@x.com']);
  ok(e.libros.libro.getSheetByName('PENDIENTES INSPECCION') !== null, 'se crea sola al primer uso');
  ok(creados.length === 2, 'el renglón sin asunto real se ignora: ' + creados.length);
  ok(creados[0]['ID'] && /^PDI-/.test(creados[0]['ID']), 'cada pendiente nace con su propio ID (prefijo PDI): ' + creados[0]['ID']);
  ok(creados[0]['ASUNTO'] === '2026_25_1 - Reparación de faro',
    'el asunto lleva el folio de la inspección al frente, en automático: ' + creados[0]['ASUNTO']);
  ok(creados[0]['PLACAS'] === 'ggr658f' && creados[0]['ID INSPECCION'] === '2026_25_1', 'se liga a la inspección y copia sus datos');
  ok(creados[0]['ESTATUS'] === 'SIN CARGAR EN HELPDESK' && creados[0]['ID TICKET HELPDESK'] === '', 'nace SIN CARGAR y sin ticket');
  ok(creados[1]['PRIORIDAD'] === 'NO URGENTE', 'una prioridad que no es "URGENTE" cae en NO URGENTE: ' + creados[1]['PRIORIDAD']);
  ok(creados[0]['CORREO RESPONSABLE'] === 'responsable@x.com',
    'guarda el correo YA VALIDADO del aviso original, el mismo para todos los pendientes de esa inspección');
  ok(creados[0]['CORREOS CC'] === 'inspector@x.com, otro@x.com',
    'y también los demás que recibieron ese aviso en copia: ' + creados[0]['CORREOS CC']);
  ok(tocados.indexOf('PENDIENTES INSPECCION') !== -1, 'invalida la caché de la hoja al escribir');

  console.log('1b. Sin correo validado al capturar (p. ej. no se llenó el aviso), se guarda vacío');
  const { P: P2 } = entorno();
  const sinCorreo = P2.agregar(FILA_INSPECCION, '2026_25_2', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  ok(sinCorreo[0]['CORREO RESPONSABLE'] === '', 'queda vacío, no "undefined" ni null: "' + sinCorreo[0]['CORREO RESPONSABLE'] + '"');
}

console.log('2. agregar(): sin items reales no crea la hoja ni nada');
{
  const { e, P } = entorno();
  ok(P.agregar(FILA_INSPECCION, '2026_25_2', []).length === 0, 'una lista vacía no crea nada');
  ok(P.agregar(FILA_INSPECCION, '2026_25_2', [{ asunto: '' }]).length === 0, 'ni una con solo asuntos vacíos');
  ok(e.libros.libro.getSheetByName('PENDIENTES INSPECCION') === null, 'y la hoja sigue sin existir');
}

console.log('3. revisarCargaHelpdesk(): sin pendientes o sin hoja, no hace nada');
{
  const { P } = entorno();
  ok(JSON.stringify(P.revisarCargaHelpdesk()) === JSON.stringify({ revisados: 0, encontrados: 0 }),
    'sin que nadie haya reportado nunca, no truena y no hay nada que revisar');
}

console.log('4. revisarCargaHelpdesk(): empata por el ASUNTO completo (con el folio), tolera mayúsculas/acentos');
{
  // Un array, no un literal suelto: 4c lo muta para simular que Help Desk cambia de estatus
  const ticketsHelpdesk = [
    { 'ID TICKET HD': 90001, TITULO: 'rifter abc123 | fundaciones', DESCRIPCION: 'algo sin relación', ESTATUS: 'Abierto' },
    // Mismo folio de inspección pero SIN el resto del asunto: no debe alcanzar para un match
    { 'ID TICKET HD': 90002, TITULO: '2026_25_1 - otra cosa distinta', DESCRIPCION: '', ESTATUS: 'Abierto' },
    // El asunto completo, con acentos/mayúsculas distintas y en la DESCRIPCION, no en el título
    { 'ID TICKET HD': 90003, TITULO: 'Ticket de Luis', DESCRIPCION: 'Hola, aquí está: 2026_25_1 - REPARACION DE FARO, gracias', ESTATUS: 'Abierto' },
  ];
  const { e, P, tocados } = entorno(ticketsHelpdesk);
  P.agregar(FILA_INSPECCION, '2026_25_1', [
    { asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' },
    { asunto: 'Cambio de amortiguador', familia: 'MECANICA', prioridad: 'NO URGENTE' },
  ]);
  const r = P.revisarCargaHelpdesk();
  ok(r.revisados === 2 && r.encontrados === 1, 'revisa los 2 pendientes y encuentra 1 match: ' + JSON.stringify(r));

  const col = (nombre) => P.ENCABEZADOS.indexOf(nombre);
  const buscarFaro = () => e.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1)
    .find((f) => f[col('ASUNTO')] === '2026_25_1 - Reparación de faro');
  let faro = buscarFaro();
  ok(faro[col('ESTATUS')] === 'CARGADO EN HELPDESK', 'el que sí matcheó (por texto, insensible a acentos/mayúsculas) queda CARGADO');
  ok(faro[col('ID TICKET HELPDESK')] === 90003, 'con el número real del ticket de Help Desk: ' + faro[col('ID TICKET HELPDESK')]);
  ok(faro[col('ESTATUS HELPDESK')] === 'Abierto', 'y guarda el estatus REAL del ticket allá, aparte del nuestro: ' + faro[col('ESTATUS HELPDESK')]);
  ok(faro[col('FECHA CARGADO')], 'y la fecha en que se cargó');
  const amortiguador = e.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1)
    .find((f) => f[col('ASUNTO')] === '2026_25_1 - Cambio de amortiguador');
  ok(amortiguador[col('ESTATUS')] === 'SIN CARGAR EN HELPDESK', 'el que no aparece completo en ningún ticket se queda SIN CARGAR');

  console.log('4b. Una segunda revisión, si Help Desk no cambió nada, no vuelve a tocar la hoja');
  const tocadosAntes = tocados.length;
  const r2 = P.revisarCargaHelpdesk();
  ok(r2.revisados === 1 && r2.encontrados === 0, 'solo revisa el que sigue SIN CARGAR: ' + JSON.stringify(r2));
  ok(tocados.length === tocadosAntes, 'y como el estatus de Help Desk sigue igual, no escribe nada de más');

  console.log('4c. Si el ticket YA CARGADO cambia de estatus en Help Desk (se resuelve), se refresca');
  ticketsHelpdesk[2].ESTATUS = 'Resuelto';
  const r3 = P.revisarCargaHelpdesk();
  ok(r3.revisados === 1, 'sigue revisando solo el SIN CARGAR -- el ya cargado no cuenta como "revisado"');
  faro = buscarFaro();
  ok(faro[col('ESTATUS HELPDESK')] === 'Resuelto', 'el estatus de Help Desk se actualiza: ' + faro[col('ESTATUS HELPDESK')]);
  ok(faro[col('ESTATUS')] === 'CARGADO EN HELPDESK' && faro[col('ID TICKET HELPDESK')] === 90003,
    'pero NUESTRO estatus (que ya se encontró) y el número de ticket no se tocan');
  ok(tocados.length === tocadosAntes + 1, 'y esta vez sí hizo falta escribir (cambió el estatus de Help Desk)');
}

console.log('5. revisarCargaHelpdesk(): si Help Desk nunca se ha abierto en esta app (sin copia local), no truena');
{
  const { P } = entorno();
  P.agregar(FILA_INSPECCION, '2026_25_3', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  const r = P.revisarCargaHelpdesk();
  ok(r.revisados === 1 && r.encontrados === 0, 'sin tickets que comparar, se queda SIN CARGAR, sin tronar: ' + JSON.stringify(r));
}

console.log('6. listar(): la vista de Kike -- vacía si nunca hubo nada, y con fechas en ISO');
{
  const { P } = entorno();
  ok(JSON.stringify(P.listar('token')) === '[]', 'sin hoja, lista vacía (no truena)');
  const { P: P2 } = (() => {
    const amb = entorno();
    amb.P.agregar(FILA_INSPECCION, '2026_25_9', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
    return amb;
  })();
  const lista = P2.listar('token');
  ok(lista.length === 1 && lista[0]['ASUNTO'] === '2026_25_9 - Algo', 'trae lo que ya se registró');
  ok(typeof lista[0]['FECHA'] === 'string', 'la fecha sale como texto ISO, no como Date: ' + typeof lista[0]['FECHA']);
}

console.log('7. enviarRecordatorio(): manda al correo GUARDADO del aviso original, no al de Capital Humano');
{
  const correos = [];
  // Capital Humano dice OTRO correo (o nada): no debería importarle, porque ya tiene el real guardado
  const { e, P } = entorno([], [{ NOMBRE: 'JORGE AVECILLA', CORREO: 'el-de-capital-humano@x.com' }], correos);
  const creados = P.agregar(FILA_INSPECCION, '2026_25_1',
    [{ asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' }], 'el-que-se-avisco@x.com',
    ['inspector@x.com', 'el-que-se-avisco@x.com', 'otro@x.com']);
  const res = P.enviarRecordatorio('token', creados[0]['ID']);
  ok(res.enviado === true && res.correo === 'el-que-se-avisco@x.com',
    'usa el correo guardado del aviso original, no el de Capital Humano: ' + res.correo);
  ok(correos.length === 1 && correos[0].to === 'el-que-se-avisco@x.com', 'de verdad se mandó ahí');
  ok(correos[0].cc.split(',').sort().join(',') === 'inspector@x.com,otro@x.com',
    'y también en cc a los demás que ya habían recibido el aviso original, sin repetir al responsable: ' + correos[0].cc);
  ok(res.cc.slice().sort().join(',') === 'inspector@x.com,otro@x.com', 'y lo regresa también en el resultado: ' + res.cc);
  ok(/2026_25_1 - Reparaci.n de faro/.test(correos[0].htmlBody), 'con el asunto exacto que debe pegar en Help Desk');
  const filas = e.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1);
  const col = (nombre) => P.ENCABEZADOS.indexOf(nombre);
  ok(/^\d{4}-\d{2}-\d{2}T/.test(filas[0][col('ULTIMO RECORDATORIO')]), 'y queda anotado cuándo se mandó el recordatorio');

  console.log('7b. Sin correo guardado (pendiente de antes, o no se validó ninguno), cae a Capital Humano y sin cc');
  const { P: P2 } = entorno([], [{ NOMBRE: 'JORGE AVECILLA', CORREO: 'jorge@x.com' }]);
  const creados2 = P2.agregar(FILA_INSPECCION, '2026_25_1', [{ asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' }]);
  ok(creados2[0]['CORREO RESPONSABLE'] === '', 'este, a propósito, no trae correo guardado');
  const res2 = P2.enviarRecordatorio('token', creados2[0]['ID']);
  ok(res2.correo === 'jorge@x.com', 'cae al de Capital Humano por nombre, como antes: ' + res2.correo);
  ok(res2.cc.length === 0, 'sin cc: no hay forma de saber quiénes más se habían notificado');

  console.log('7c. No se puede recordar uno que ya está cargado en Help Desk');
  const { e: e3, P: P3 } = entorno([{ 'ID TICKET HD': 1, TITULO: '2026_25_1 - Reparación de faro', DESCRIPCION: '' }],
    [{ NOMBRE: 'JORGE AVECILLA', CORREO: 'jorge@x.com' }]);
  const creados3 = P3.agregar(FILA_INSPECCION, '2026_25_1', [{ asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' }], 'resp@x.com');
  P3.revisarCargaHelpdesk();
  let truenaYaCargado = null;
  try { P3.enviarRecordatorio('token', creados3[0]['ID']); } catch (err) { truenaYaCargado = err.message; }
  ok(/ya está cargado/.test(truenaYaCargado || ''), 'truena en vez de mandar un recordatorio de algo que ya se resolvió: ' + truenaYaCargado);
  void e3;

  console.log('7d. Sin correo guardado NI en Capital Humano, truena claro (no manda nada a ciegas)');
  const { P: P4 } = entorno([], []);
  const creados4 = P4.agregar(FILA_INSPECCION, '2026_25_1', [{ asunto: 'Otra cosa', familia: 'OTROS', prioridad: 'NO URGENTE' }]);
  let truenaSinCorreo = null;
  try { P4.enviarRecordatorio('token', creados4[0]['ID']); } catch (err) { truenaSinCorreo = err.message; }
  ok(/No se encontr. el correo/.test(truenaSinCorreo || ''), 'avisa que no encontró el correo: ' + truenaSinCorreo);
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
