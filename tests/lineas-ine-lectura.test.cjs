// Pendiente 2.28, etapa B (9-oct): leer las INE que encontró el inventario y decir de quién es cada una (ensayo).
// Los textos son inventados, con la forma que da el OCR de Drive.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const fuente = fs.readFileSync(path.join(__dirname, '..', 'src/services/lineas/LineasIneLectura.gs'), 'utf8').replace(/\r/g, '');

function cargar() {
  const ctx = vm.createContext({});
  vm.runInContext(fuente + '\nthis.f = { ineLecDigitoCurp_, ineLecCurp_, ineLecInterpretar_, ineLecPersonas_, ineLecIndice_, ' +
    'ineLecPersonaDe_, ineLecDocumentoDeRuta_, ineLecEnsayo_ };', ctx);
  return ctx.f;
}

const FRENTE = [
  'MÉXICO', 'INSTITUTO NACIONAL ELECTORAL', 'CREDENCIAL PARA VOTAR', 'NOMBRE', 'PÉREZ', 'LÓPEZ', 'JUAN CARLOS', 'SEXO H',
  'DOMICILIO', 'C SIEMPRE VIVA 123', 'CLAVE DE ELECTOR PRLPJN85010122H400',
  'CURP PELJ85O1O1HQTRPN08', 'FECHA DE NACIMIENTO', '01/01/1985', 'AÑO DE REGISTRO 2003 01', 'VIGENCIA 2023 - 2033',
].join('\n');
const VUELTA = ['IDMEX1234567890<<1234567890123', '8501018H3312315MEX<02<<12345<7', 'PEREZ<LOPEZ<<JUAN<CARLOS<<<<<<'].join('\n');
const VOCABULARIO = { JUAN: true, CARLOS: true, PEREZ: true, LOPEZ: true, MARIA: true, GARCIA: true, RUIZ: true, ANA: true };

test('la CURP: corrige lo que el OCR cambia según la posición y revisa su dígito verificador', () => {
  const { ineLecCurp_, ineLecDigitoCurp_ } = cargar();
  assert.equal(ineLecDigitoCurp_('PELJ850101HQTRPN08'), '8');
  assert.deepEqual({ ...ineLecCurp_('CURP PELJ85O1O1HQTRPN08') }, { curp: 'PELJ850101HQTRPN08', ok: true });
  assert.equal(ineLecCurp_('CURP PELJ850101HQTRPN07').ok, false, 'dígito que no cuadra: se guarda, sin OK');
  assert.equal(ineLecCurp_('CLAVE PRLPJN85010122H400'), null, 'la clave de elector no es CURP');
  assert.equal(ineLecCurp_('PELJ851301HQTRPN08'), null, 'mes 13');
});

test('el frente: CURP, fecha, sexo, clave de elector y solo las palabras que son nombres (no el domicilio)', () => {
  const { ineLecInterpretar_ } = cargar();
  const r = ineLecInterpretar_(FRENTE, VOCABULARIO);
  assert.equal(r.tipo, 'INE');
  assert.equal(r.lado, 'FRENTE');
  assert.equal(r.curp, 'PELJ850101HQTRPN08');
  assert.equal(r.curpOk, true);
  assert.equal(r.nacimiento, '1985-01-01');
  assert.equal(r.sexo, 'H');
  assert.equal(r.clave, 'PRLPJN85010122H400');
  assert.deepEqual([...r.nombres], ['PEREZ', 'LOPEZ', 'JUAN', 'CARLOS']);
});

test('la vuelta: IDMEX, la fecha del renglón de máquina y el nombre con «<»', () => {
  const { ineLecInterpretar_ } = cargar();
  const r = ineLecInterpretar_(VUELTA, VOCABULARIO);
  assert.equal(r.tipo, 'INE');
  assert.equal(r.lado, 'VUELTA');
  assert.equal(r.idmex, '1234567890/1234567890123');
  assert.equal(r.nacimiento, '1985-01-01');
  assert.equal(r.nombreVuelta, 'JUAN CARLOS PEREZ LOPEZ');
  assert.equal(ineLecInterpretar_(FRENTE + '\n' + VUELTA, VOCABULARIO).lado, 'LOS DOS', 'un PDF con los dos lados');
  assert.equal(ineLecInterpretar_('', VOCABULARIO).lado, '', 'sin texto');
});

function mundo() {
  const f = cargar();
  const ch = [
    { 'No EMPLEADO': 'HA001', 'NOMBRE COMPLETO': 'JUAN CARLOS PÉREZ LÓPEZ', 'APELLIDO PATERNO': 'PÉREZ', 'APELLIDO MATERNO': 'LÓPEZ', NOMBRES: 'JUAN CARLOS', 'FECHA DE NACIMIENTO': '01/01/1985' },
    { 'No EMPLEADO': 'HA777', 'NOMBRE COMPLETO': 'JUAN CARLOS PÉREZ LÓPEZ', 'APELLIDO PATERNO': 'PÉREZ', 'APELLIDO MATERNO': 'LÓPEZ', NOMBRES: 'JUAN CARLOS', 'FECHA DE NACIMIENTO': '01/01/1985' },
    { 'No EMPLEADO': 'HA002', 'NOMBRE COMPLETO': 'MARIA GARCIA RUIZ', 'APELLIDO PATERNO': 'GARCIA', 'APELLIDO MATERNO': 'RUIZ', NOMBRES: 'MARIA', 'FECHA DE NACIMIENTO': '15/06/1990' },
    { 'No EMPLEADO': 'HA003', 'NOMBRE COMPLETO': 'ANA GARCIA RUIZ', 'APELLIDO PATERNO': 'GARCIA', 'APELLIDO MATERNO': 'RUIZ', NOMBRES: 'ANA', 'FECHA DE NACIMIENTO': '' },
  ];
  const personas = f.ineLecPersonas_(ch, { 'HA001|JUAN CARLOS PEREZ LOPEZ': 'PER-1', 'HA002|MARIA GARCIA RUIZ': 'PER-2' });
  return { f, personas, ix: f.ineLecIndice_(personas) };
}

test('la persona: la recontratación es una sola; por fecha y nombre (CURP) o, sin fecha, por nombre completo', () => {
  const { f, personas, ix } = mundo();
  assert.equal(personas.length, 3);
  assert.deepEqual([...personas[0].numeros], ['HA001', 'HA777']);
  assert.equal(personas[0].id, 'PER-1');
  const frente = f.ineLecInterpretar_(FRENTE, VOCABULARIO);
  const r = f.ineLecPersonaDe_({ ...frente, nombres: frente.nombres.join(' ') }, ix);
  assert.equal(r.persona.id, 'PER-1');
  assert.equal(r.como, 'CURP');
  const ana = f.ineLecPersonaDe_({ lado: 'FRENTE', nombres: 'ANA GARCIA RUIZ', nombreVuelta: '' }, ix);
  assert.equal(ana.persona.nombre, 'ANA GARCIA RUIZ');
  assert.equal(ana.como, 'NOMBRE');
  assert.equal(f.ineLecPersonaDe_({ lado: '', nombres: '', nombreVuelta: '' }, ix).nota, 'no se leyó');
  assert.equal(f.ineLecPersonaDe_({ lado: 'FRENTE', nombres: 'GARCIA RUIZ', nombreVuelta: '' }, ix).persona, null, 'sin nombre de pila no se adivina');
});

test('la carpeta de la responsiva: «RESP DD MM» con el año de arriba', () => {
  const { ineLecDocumentoDeRuta_ } = cargar();
  assert.deepEqual({ ...ineLecDocumentoDeRuta_('CARTA RESPONSIVA/2025/RESP 10 05') }, { tipo: 'RESP', fecha: '2025-05-10' });
  assert.deepEqual({ ...ineLecDocumentoDeRuta_('INSPECCIONES/2024/3ER CUATRIMESTRE/SEPTIEMBRE/INSP 3 9/FOTOS') }, { tipo: 'INSP', fecha: '2024-09-03' });
  assert.equal(ineLecDocumentoDeRuta_('FOTOS'), null);
});

test('el ensayo: SEGURA si la CURP y la responsiva coinciden; DUDOSA si no o si solo hay responsiva; SIN DUEÑO', () => {
  const { f, ix } = mundo();
  const frente = f.ineLecInterpretar_(FRENTE, VOCABULARIO);
  const leido = (id, ruta, l) => ({ id, nuco: '0012', ruta, lado: l.lado, curp: l.curp || '', nacimiento: l.nacimiento || '',
    nombreVuelta: l.nombreVuelta || '', nombres: Array.isArray(l.nombres) ? l.nombres.join(' ') : l.nombres || '' });
  const vuelta = f.ineLecInterpretar_(VUELTA, VOCABULARIO);
  const ilegible = { lado: '', nombres: '' };
  const leidos = [
    leido('a', 'CARTA RESPONSIVA/2025/RESP 10 05', frente), leido('b', 'CARTA RESPONSIVA/2025/RESP 10 05', ilegible),
    leido('c', 'CARTA RESPONSIVA/2025/RESP 11 06', frente),
    leido('d', 'CARTA RESPONSIVA/2025/RESP 12 07', ilegible),
    leido('e', 'INSPECCIONES/2025/2DO CUATRIMESTRE/MAYO/INSP 1 5/FOTOS', ilegible),
    leido('g', 'CARTA RESPONSIVA/2025/RESP 13 08', vuelta),
  ];
  const documentos = {
    '12|RESP|2025-05-10': ['JUAN CARLOS PEREZ LOPEZ'],
    '12|RESP|2025-06-11': ['MARIA GARCIA RUIZ'],
    '12|RESP|2025-07-12': ['MARIA GARCIA RUIZ'],
  };
  const filas = f.ineLecEnsayo_(leidos, ix, documentos);
  const de = (carpeta) => filas.filter((r) => r[1] === carpeta).map((r) => ({ archivos: r[2], ids: r[4], id: r[5], como: r[8], resultado: r[10], nota: r[11] }));
  const a = de('CARTA RESPONSIVA/2025/RESP 10 05');
  assert.equal(a.length, 1);
  assert.equal(a[0].resultado, 'SEGURA');
  assert.equal(a[0].ids, 'a, b', 'la vuelta ilegible de la misma carpeta va con el frente');
  assert.equal(a[0].como, 'CURP');
  const c = de('CARTA RESPONSIVA/2025/RESP 11 06');
  assert.equal(c[0].resultado, 'DUDOSA');
  assert.match(c[0].nota, /no es responsable del documento/);
  const d = de('CARTA RESPONSIVA/2025/RESP 12 07');
  assert.equal(d[0].resultado, 'DUDOSA');
  assert.equal(d[0].como, 'RESPONSIVA');
  assert.equal(d[0].id, 'PER-2');
  const e = de('INSPECCIONES/2025/2DO CUATRIMESTRE/MAYO/INSP 1 5/FOTOS');
  assert.equal(e[0].resultado, 'SIN DUEÑO');
  const g = de('CARTA RESPONSIVA/2025/RESP 13 08');
  assert.equal(g[0].resultado, 'SEGURA', 'la vuelta sola: fecha del renglón de máquina y nombre; sin documento en la hoja');
  assert.equal(g[0].como, 'FECHA Y NOMBRE');
});

test('solo lee NUCOS: la única copia va a la carpeta temporal del DEV y solo esa copia se tira; solo en un DEV, desde el editor', () => {
  assert.equal((fuente.match(/Drive\.Files\.copy\(/g) || []).length, 1);
  assert.match(fuente, /Drive\.Files\.copy\(\{ name: 'OCR ' \+ id, mimeType: 'application\/vnd\.google-apps\.document', parents: \[temporal\] \}/);
  assert.match(fuente, /if \(raiz === LINEAS_DRIVE_NUCOS_ID\) throw/);
  assert.equal((fuente.match(/setTrashed\(true\)/g) || []).length, 1);
  assert.match(fuente, /DriveApp\.getFileById\(copia\.id\)\.setTrashed\(true\)/);
  assert.doesNotMatch(fuente, /createFile|setName|moveTo|addFile|removeFile|Drive\.Files\.(update|create|remove|delete)|makeCopy/);
  ['lineasIneLectura_muestra', 'lineasIneLectura_todo', 'lineasIneEnsayo'].forEach((fn) => {
    assert.match(fuente, new RegExp('function ' + fn + '\\(\\) \\{\\n  soloEditor_\\(\\);\\n  ineNucosExigirDev_\\(\\);'));
  });
});

test('lo que salió en la muestra del 9-oct: renglones de máquina juntos, O en vez de 0 en la CURP, firmas impresas', () => {
  const { ineLecInterpretar_, ineLecCurp_ } = cargar();
  const juntos = ineLecInterpretar_('IDMEX1234567890<<1234567890123 8501018H3312315MEX<02<<12345<7 PEREZ <LOPEZ<<JUAN<CARLOS<<<<', VOCABULARIO);
  assert.equal(juntos.nacimiento, '1985-01-01');
  assert.equal(juntos.nombreVuelta, 'JUAN CARLOS PEREZ LOPEZ');
  assert.equal(juntos.idmex, '1234567890/1234567890123');
  const o = ineLecCurp_('PELJ850101HQTRPNO8');
  assert.equal(o.curp, 'PELJ850101HQTRPN08', 'nacido en 1985: la posición 17 es dígito');
  assert.equal(ineLecInterpretar_('CURP PELJ850101HQTRPNO8', VOCABULARIO).nacimiento, '1985-01-01', 'no 2085');
  assert.equal(ineLecCurp_('PELJ050101HQTRPNA0').curp[16], 'A', 'nacido en 2005: letra');
  const firmas = ineLecInterpretar_('IDMEX1234567890 EDMUNDO JACOBO MOLINA CLAUDIA EDITH SUAREZ OJEDA PEREZ LOPEZ JUAN',
    { ...VOCABULARIO, EDMUNDO: true, JACOBO: true, MOLINA: true, CLAUDIA: true, EDITH: true, SUAREZ: true, OJEDA: true });
  assert.deepEqual([...firmas.nombres], ['PEREZ', 'LOPEZ', 'JUAN'], 'la firma del funcionario no es de quien trae la credencial');
});

test('sin nombre completo: apellidos y primer nombre, si es una sola persona (el OCR se comió el segundo nombre)', () => {
  const { f, ix } = mundo();
  const r = f.ineLecPersonaDe_({ lado: 'VUELTA', nombres: 'PEREZ LOPEZ JUAN', nombreVuelta: '' }, ix);
  assert.equal(r.persona && r.persona.id, 'PER-1');
  assert.equal(r.como, 'NOMBRE');
});

test('un límite de Google no se anota como error del archivo: se pausa y sigue en 30 min', () => {
  const ctx = vm.createContext({});
  vm.runInContext(fuente + '\nthis.c = ineLecEsCuota_;', ctx);
  assert.equal(ctx.c(new Error('User rate limit exceeded.')), true);
  assert.equal(ctx.c(new Error('Service invoked too many times for one day: driveapp.')), true);
  assert.equal(ctx.c(new Error('File not found: 1abc')), false);
  assert.match(fuente, /if \(ineLecEsCuota_\(e\)\) throw e;/);
  assert.match(fuente, /espera = 30 \* 60;/);
});
