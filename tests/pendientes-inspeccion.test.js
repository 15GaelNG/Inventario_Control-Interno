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

function entorno(ticketsHelpdesk, colaboradores, correos, helpdeskApi, hojasExtra) {
  const e = crearEntorno({ libros: { libro: hojasExtra || {} } });
  const tocados = [];
  const contexto = {
    Config: { SPREADSHEET_IDS: { VEHICULOS: () => 'libro' } },
    CacheHojas: { tocar: (ssId, hojaNombre) => tocados.push(hojaNombre) },
    HelpdeskService: { copiaLocal_: () => ticketsHelpdesk || [] },
    Permisos: { puedeLeer: () => ({ nombre: 'KIKE' }), puedeEditar: () => ({ nombre: 'KIKE' }) },
    HojaServicio: { fechaISO: (v) => (v instanceof Date ? v.toISOString() : (v || '')) },
    CapitalHumano: { listarColaboradores: () => colaboradores || [] },
    MailApp: { sendEmail: (opciones) => { (correos || []).push(opciones); } },
  };
  if (helpdeskApi) contexto.HelpdeskApi = helpdeskApi;
  Object.assign(e.contexto, contexto);
  e.cargar('src/utils/SheetUtils.gs', 'src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/services/PendientesInspeccionService.gs');
  return { e, P: e.global('PendientesInspeccionService'), tocados };
}

const FILA_INSPECCION = {
  'ID VEHICULO': 'VEH-00000000AAAAAA', 'PLACAS': 'ggr658f', 'NUCO': '25',
  'VEHICULO': 'HONDA 150XR', 'RESPONSABLE': 'JORGE AVECILLA', 'NOMBRE INSPECTOR': 'AYRTON SEPULVEDA',
};

console.log('1. agregar(): nace la hoja sola, ignora los sin asunto, antepone el folio de la inspección');
{
  const { e, P, tocados } = entorno();
  ok(e.libros.libro.getSheetByName('PENDIENTES INSPECCION') === null, 'todavía no existe');
  const creados = P.agregar(FILA_INSPECCION, '2026_25_1', [
    { asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' },
    { asunto: '   ', familia: 'OTROS', prioridad: 'NO URGENTE' },
    { asunto: 'Cambio de llanta', familia: 'ACCESORIOS', prioridad: 'raro' },
  ], 'responsable@x.com', ['inspector@x.com', 'otro@x.com'], 'INSPECCION: HONDA 150XR', 'ayrton@x.com');
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
  ok(creados[0]['NOMBRE INSPECTOR'] === 'AYRTON SEPULVEDA', 'y el nombre de quien inspeccionó, para el remitente visible del recordatorio');
  ok(creados[0]['CORREO INSPECTOR'] === 'ayrton@x.com', 'y su correo, para el replyTo del recordatorio');
  ok(tocados.indexOf('PENDIENTES INSPECCION') !== -1, 'invalida la caché de la hoja al escribir');

  console.log('1b. Sin correo validado al capturar (p. ej. no se llenó el aviso), se guarda vacío');
  const { P: P2 } = entorno();
  const sinCorreo = P2.agregar(FILA_INSPECCION, '2026_25_2', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  ok(sinCorreo[0]['CORREO RESPONSABLE'] === '', 'queda vacío, no "undefined" ni null: "' + sinCorreo[0]['CORREO RESPONSABLE'] + '"');

  console.log('1c. Una hoja YA EXISTENTE de antes de NOMBRE INSPECTOR/CORREO INSPECTOR: se agregan solas, sin tronar ni perder lo viejo');
  const ENCABEZADOS_VIEJOS = [
    'ID', 'ID INSPECCION', 'FECHA', 'ID VEHICULO', 'PLACAS', 'NUCO', 'VEHICULO', 'RESPONSABLE',
    'ASUNTO', 'FAMILIA O GRUPO A REPORTAR', 'PRIORIDAD', 'ESTATUS', 'ID TICKET HELPDESK', 'ESTATUS HELPDESK',
    'FECHA CARGADO', 'ULTIMO RECORDATORIO', 'CORREO RESPONSABLE', 'CORREOS CC', 'ASUNTO AVISO ORIGINAL',
  ];
  const filaVieja = ['PDI-VIEJO1', '2026_10_1', '', 'VEH-X', 'AAA111', '10', 'KWID', 'ALGUIEN',
    'Algo de antes', 'OTROS', 'NO URGENTE', 'CARGADO EN HELPDESK', 61000, 'Resuelto', '', '', 'viejo@x.com', '', ''];
  const { e: e9, P: P9 } = entorno(null, null, null, null, { 'PENDIENTES INSPECCION': [ENCABEZADOS_VIEJOS, filaVieja] });
  const creados9 = P9.agregar(FILA_INSPECCION, '2026_25_9', [{ asunto: 'Algo nuevo', familia: 'MECANICA', prioridad: 'URGENTE' }],
    'resp@x.com', [], '', 'ayrton@x.com');
  ok(creados9[0]['NOMBRE INSPECTOR'] === 'AYRTON SEPULVEDA' && creados9[0]['CORREO INSPECTOR'] === 'ayrton@x.com',
    'el renglón nuevo sí trae las columnas nuevas, aunque la hoja ya existiera sin ellas');
  const filasHoja = e9.hojaComoTexto('libro', 'PENDIENTES INSPECCION');
  const encabezadosHoja = filasHoja[0];
  ok(encabezadosHoja.indexOf('NOMBRE INSPECTOR') !== -1 && encabezadosHoja.indexOf('CORREO INSPECTOR') !== -1,
    'las columnas se agregaron solas al final: ' + encabezadosHoja.join(','));
  const colId = encabezadosHoja.indexOf('ID');
  const vieja = filasHoja.find((f) => f[colId] === 'PDI-VIEJO1');
  ok(vieja && vieja[encabezadosHoja.indexOf('ASUNTO')] === 'Algo de antes',
    'el renglón viejo sigue intacto, solo con las columnas nuevas vacías');
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
    ['inspector@x.com', 'el-que-se-avisco@x.com', 'otro@x.com'],
    'INSPECCION: 25-HONDA 150XR 12/10/2026', 'ayrton@x.com');
  const res = P.enviarRecordatorio('token', creados[0]['ID']);
  ok(res.enviado === true && res.correo === 'el-que-se-avisco@x.com',
    'usa el correo guardado del aviso original, no el de Capital Humano: ' + res.correo);
  ok(correos.length === 1 && correos[0].to === 'el-que-se-avisco@x.com', 'de verdad se mandó ahí');
  ok(correos[0].cc.split(',').sort().join(',') === 'ayrton@x.com,inspector@x.com,otro@x.com',
    'y también en cc a los demás que ya habían recibido el aviso original, sin repetir al responsable, y a quien inspeccionó de primera mano: ' + correos[0].cc);
  ok(res.cc.slice().sort().join(',') === 'ayrton@x.com,inspector@x.com,otro@x.com', 'y lo regresa también en el resultado: ' + res.cc);
  ok(/2026_25_1 - Reparaci.n de faro/.test(correos[0].htmlBody), 'con el asunto exacto que debe pegar en Help Desk');
  ok(correos[0].subject === 'Re: INSPECCION: 25-HONDA 150XR 12/10/2026',
    'el ASUNTO del correo lleva "Re:" + el del aviso original, para quedar en la misma conversación: ' + correos[0].subject);
  ok(correos[0].name === 'AYRTON SEPULVEDA', 'el remitente visible es quien inspeccionó, no quien desplegó: ' + correos[0].name);
  ok(correos[0].replyTo === 'ayrton@x.com', 'y responder le llega a él: ' + correos[0].replyTo);
  const filas = e.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1);
  const col = (nombre) => P.ENCABEZADOS.indexOf(nombre);
  ok(/^\d{4}-\d{2}-\d{2}T/.test(filas[0][col('ULTIMO RECORDATORIO')]), 'y queda anotado cuándo se mandó el recordatorio');

  console.log('7a2. Sin asunto de aviso guardado (pendiente de antes de este campo), cae al título genérico');
  const correosSinAsunto = [];
  const { P: Pg } = entorno([], [], correosSinAsunto);
  const creadosG = Pg.agregar(FILA_INSPECCION, '2026_25_1',
    [{ asunto: 'Otro', familia: 'OTROS', prioridad: 'URGENTE' }], 'resp@x.com');
  Pg.enviarRecordatorio('token', creadosG[0]['ID']);
  ok(correosSinAsunto[0].subject === 'Recordatorio: pendiente de subir Ticket a Help Desk por inspección.',
    'sin el asunto original guardado, usa el título genérico: ' + correosSinAsunto[0].subject);
  ok(correosSinAsunto[0].name === 'AYRTON SEPULVEDA', 'el nombre del inspector sí llega aunque no se mande su correo');
  ok(correosSinAsunto[0].replyTo === undefined, 'pero sin su correo no hay replyTo que poner: ' + correosSinAsunto[0].replyTo);

  console.log('7e. Si la MISMA inspección tiene otro pendiente SIN CARGAR, se manda junto en el mismo correo');
  const correosJuntos = [];
  const { e: e5, P: P5 } = entorno([], [], correosJuntos);
  const creados5 = P5.agregar(FILA_INSPECCION, 'INS-AAA',
    [
      { asunto: 'OLI', familia: 'HOJALATERIA Y PINTURA', prioridad: 'NO URGENTE' },
      { asunto: 'PAPPUS', familia: 'HOJALATERIA Y PINTURA', prioridad: 'URGENTE' },
    ], 'resp@x.com', ['inspector@x.com'], 'INSPECCION: 1-CONSTRUCCION-HONDA 150XR-808077 03/11/2026');
  ok(creados5.length === 2, 'se crean los dos pendientes de la misma inspección');
  const res5 = P5.enviarRecordatorio('token', creados5[0]['ID']);
  ok(correosJuntos.length === 1, 'manda un solo correo, no dos');
  ok(/OLI/.test(correosJuntos[0].htmlBody) && /PAPPUS/.test(correosJuntos[0].htmlBody), 'con los dos asuntos en el mismo cuerpo');
  ok(res5.incluidos.length === 2 && res5.incluidos.indexOf(creados5[0]['ID']) !== -1 && res5.incluidos.indexOf(creados5[1]['ID']) !== -1,
    'regresa los dos IDs incluidos');
  const filas5 = e5.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1);
  const col5 = (nombre) => P5.ENCABEZADOS.indexOf(nombre);
  ok(/^\d{4}-\d{2}-\d{2}T/.test(filas5[0][col5('ULTIMO RECORDATORIO')]) && /^\d{4}-\d{2}-\d{2}T/.test(filas5[1][col5('ULTIMO RECORDATORIO')]),
    'y los dos quedan anotados, no solo el que se clickeó');

  console.log('7f. Si alguno de los dos ya está CARGADO, solo se incluye el que sigue SIN CARGAR');
  const correosParcial = [];
  const { P: P6 } = entorno([{ 'ID TICKET HD': 55, TITULO: 'INS-BBB - YA RESUELTO', DESCRIPCION: '' }], [], correosParcial);
  const creados6 = P6.agregar(FILA_INSPECCION, 'INS-BBB',
    [
      { asunto: 'YA RESUELTO', familia: 'OTROS', prioridad: 'NO URGENTE' },
      { asunto: 'SIGUE PENDIENTE', familia: 'OTROS', prioridad: 'URGENTE' },
    ], 'resp2@x.com');
  P6.revisarCargaHelpdesk();
  const res6 = P6.enviarRecordatorio('token', creados6[1]['ID']);
  ok(res6.incluidos.length === 1 && res6.incluidos[0] === creados6[1]['ID'], 'solo incluye el que sigue sin cargar, no el ya resuelto');
  ok(!/YA RESUELTO/.test(correosParcial[0].htmlBody), 'y no menciona al que ya se cargó: ' + correosParcial[0].htmlBody);

  console.log('7b. Sin correo guardado (pendiente de antes, o no se validó ninguno), cae a Capital Humano y sin cc');
  const { P: P2 } = entorno([], [{ NOMBRE: 'JORGE AVECILLA', CORREO: 'jorge@x.com' }]);
  const creados2 = P2.agregar(FILA_INSPECCION, '2026_25_1', [{ asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' }]);
  ok(creados2[0]['CORREO RESPONSABLE'] === '', 'este, a propósito, no trae correo guardado');
  const res2 = P2.enviarRecordatorio('token', creados2[0]['ID']);
  ok(res2.correo === 'jorge@x.com', 'cae al de Capital Humano por nombre, como antes: ' + res2.correo);
  ok(res2.cc.length === 0, 'sin cc: no hay forma de saber quiénes más se habían notificado');

  console.log('7b2. Aunque caiga a Capital Humano (sin CORREOS CC), quien inspeccionó sí llega en cc si se guardó su correo');
  const { P: P2b } = entorno([], [{ NOMBRE: 'JORGE AVECILLA', CORREO: 'jorge@x.com' }]);
  const creados2b = P2b.agregar(FILA_INSPECCION, '2026_25_1',
    [{ asunto: 'Reparación de faro', familia: 'MECANICA', prioridad: 'URGENTE' }], '', [], '', 'ayrton@x.com');
  const res2b = P2b.enviarRecordatorio('token', creados2b[0]['ID']);
  ok(res2b.cc.join(',') === 'ayrton@x.com', 'de primera mano, aunque no haya CORREOS CC: ' + res2b.cc);

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

console.log('8. vincularManual(): liga a mano cuando el automático no lo encontró solo');
{
  const { e, P } = entorno([{ 'ID TICKET HD': 94001, TITULO: 'Lo que sea', DESCRIPCION: '', ESTATUS: 'Abierto' }]);
  const creados = P.agregar(FILA_INSPECCION, '2026_33_1', [{ asunto: 'Algo irreconocible', familia: 'OTROS', prioridad: 'URGENTE' }]);
  const res = P.vincularManual('token', creados[0]['ID'], '94001');
  ok(res.vinculado === true && res.idTicketHelpdesk === 94001 && res.estatusHelpdesk === 'Abierto', 'regresa el ticket y su estatus: ' + JSON.stringify(res));
  const col = (nombre) => P.ENCABEZADOS.indexOf(nombre);
  const fila = e.hojaComoTexto('libro', 'PENDIENTES INSPECCION').slice(1)[0];
  ok(fila[col('ESTATUS')] === 'CARGADO EN HELPDESK' && fila[col('ID TICKET HELPDESK')] === 94001 && fila[col('ESTATUS HELPDESK')] === 'Abierto' && fila[col('FECHA CARGADO')],
    'queda igual que si lo hubiera encontrado solo');

  console.log('8b. El número no corresponde a ningún ticket ya sincronizado: avisa, no inventa nada');
  const { P: P2 } = entorno([{ 'ID TICKET HD': 95001, TITULO: 'Otro', DESCRIPCION: '', ESTATUS: 'Abierto' }]);
  const creados2 = P2.agregar(FILA_INSPECCION, '2026_33_2', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  let truenaSinTicket = null;
  try { P2.vincularManual('token', creados2[0]['ID'], '99999'); } catch (err) { truenaSinTicket = err.message; }
  ok(/no est. en la copia sincronizada/.test(truenaSinTicket || ''), 'avisa que ese ticket no está sincronizado: ' + truenaSinTicket);

  console.log('8c. No se puede vincular uno que ya está cargado');
  const { P: P3 } = entorno([{ 'ID TICKET HD': 96001, TITULO: '2026_33_3 - Algo', DESCRIPCION: '', ESTATUS: 'Abierto' }]);
  const creados3 = P3.agregar(FILA_INSPECCION, '2026_33_3', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  P3.revisarCargaHelpdesk();
  let truenaYaCargado2 = null;
  try { P3.vincularManual('token', creados3[0]['ID'], '96001'); } catch (err) { truenaYaCargado2 = err.message; }
  ok(/ya está cargado/.test(truenaYaCargado2 || ''), 'truena en vez de vincular algo que ya se encontró solo: ' + truenaYaCargado2);

  console.log('8d. Sin número de ticket, avisa claro (no manda vacío)');
  const { P: P4 } = entorno([]);
  const creados4 = P4.agregar(FILA_INSPECCION, '2026_33_4', [{ asunto: 'Algo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  let truenaSinNumero = null;
  try { P4.vincularManual('token', creados4[0]['ID'], ''); } catch (err) { truenaSinNumero = err.message; }
  ok(/Escribe el n.mero de ticket/.test(truenaSinNumero || ''), 'pide el número de ticket: ' + truenaSinNumero);

  console.log('8e. Un pendiente que no existe, truena claro');
  const { P: P5 } = entorno([]);
  let truenaSinPendiente = null;
  try { P5.vincularManual('token', 'PDI-NOEXISTE', '1'); } catch (err) { truenaSinPendiente = err.message; }
  ok(/No se encontr. ese pendiente/.test(truenaSinPendiente || ''), 'avisa que no existe: ' + truenaSinPendiente);

  console.log('8f. No está en la copia local: lo trae EN VIVO (HelpdeskApi.detalle) y lo vincula igual');
  const ticketsVivos = [];
  let pedidoDetalle = null;
  const ticketsHelpdesk = ticketsVivos;
  const { P: P6 } = entorno(ticketsHelpdesk, null, null, {
    detalle: (token, idTicket) => {
      pedidoDetalle = { token: token, idTicket: idTicket };
      // Simula lo que HelpdeskApi.detalle hace de verdad: sincronizar la copia local al traerlo
      ticketsVivos.push({ 'ID TICKET HD': Number(idTicket), TITULO: 'Traído en vivo', DESCRIPCION: '', ESTATUS: 'Abierto' });
      return { ID: Number(idTicket), TITULO: 'Traído en vivo' };
    },
  });
  const creados6 = P6.agregar(FILA_INSPECCION, '2026_40_1', [{ asunto: 'Algo nuevo', familia: 'OTROS', prioridad: 'URGENTE' }]);
  const res6 = P6.vincularManual('mi-token', creados6[0]['ID'], '97001');
  ok(pedidoDetalle && pedidoDetalle.idTicket === '97001' && pedidoDetalle.token === 'mi-token',
    'le pide a HelpdeskApi ese ticket, con el token de quien está vinculando: ' + JSON.stringify(pedidoDetalle));
  ok(res6.vinculado === true && res6.idTicketHelpdesk === 97001 && res6.estatusHelpdesk === 'Abierto',
    'y una vez sincronizado, lo vincula igual que si ya hubiera estado ahí: ' + JSON.stringify(res6));

  console.log('8g. Si quien vincula no tiene su cuenta de Help Desk conectada, el aviso de HelpdeskApi se respeta tal cual');
  const { P: P7 } = entorno([], null, null, {
    detalle: () => { throw new Error('Conecta tu cuenta del helpdesk primero.'); },
  });
  const creados7 = P7.agregar(FILA_INSPECCION, '2026_40_2', [{ asunto: 'Otra cosa', familia: 'OTROS', prioridad: 'URGENTE' }]);
  let truenaSinConectar = null;
  try { P7.vincularManual('token', creados7[0]['ID'], '98001'); } catch (err) { truenaSinConectar = err.message; }
  ok(/Conecta tu cuenta del helpdesk primero/.test(truenaSinConectar || ''),
    'no inventa un mensaje propio: deja pasar el de HelpdeskApi: ' + truenaSinConectar);
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
