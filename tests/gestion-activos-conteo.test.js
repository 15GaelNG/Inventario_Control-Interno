/**
 * Gestión de Activos (src/html/js/lineas-activos.html): de quién es cada activo y si sigue vigente. Una sola regla para
 * el recuadro de la persona, su panel y el Excel (usuario, 12-nov: el recuadro decía 3 y el panel enseñaba 4 porque
 * mostraba también la caja chica cerrada).
 *
 * Se extrae el bloque REAL (entre «[repartir: inicio]» y «[repartir: fin]», no una copia a mano) y se corre con datos
 * de prueba inventados.
 *
 * Correr: node tests/gestion-activos-conteo.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'lineas-activos.html'), 'utf8');
const inicio = html.indexOf('// [repartir: inicio]');
const fin = html.indexOf('// [repartir: fin]');
if (inicio === -1 || fin === -1) throw new Error('No se encontró el bloque [repartir] en lineas-activos.html (¿cambió el código?)');
const bloque = html.slice(inicio, fin);
const formatoHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'formato.html'), 'utf8');
const formatoJs = formatoHtml.slice(formatoHtml.indexOf('<script>') + 8, formatoHtml.lastIndexOf('</script>'));
const ctx = vm.createContext({});
// El bloque usa normal (Formato.normal, de Lineas.comun)
vm.runInContext(formatoJs + ';this.normal = Formato.normal;', ctx);
vm.runInContext(bloque + '\nthis.repartirActivos = repartirActivos; this.totalVigentes = totalVigentes; this.totalRepetidos = totalRepetidos; this.comparable = comparable;', ctx);

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const vacio = { indice: { equipos: [], lineas: [] }, vehiculos: [], hologramas: [], uber: [], cajasChicas: [] };
const repartir = (personas, cat) => ctx.repartirActivos(personas, Object.assign({}, vacio, cat));
const cuantos = (g) => g.vigentes.length + '/' + g.historial.length;

console.log('1. Lo vigente cuenta; lo demás va al historial del panel (no desaparece)');
{
  const r = repartir([{ nombre: 'JUAN PEREZ' }], {
    indice: {
      equipos: [{ responsable: 'JUAN PEREZ', estatus: 'USO' }, { responsable: 'JUAN PEREZ', estatus: 'ESPERA DE RESPONSIVA' }],
      lineas: [{ responsable: 'JUAN PEREZ', estatus: 'USO', suelta: true }, { responsable: 'JUAN PEREZ', estatus: 'USO', suelta: false }],
    },
    vehiculos: [{ RESPONSABLE_VEHICULO: 'JUAN PEREZ', ESTATUS: 'ACTIVO' }, { RESPONSABLE_VEHICULO: 'JUAN PEREZ', ESTATUS: 'BAJA VEHICULAR' }],
    hologramas: [{ RESPONSABLE: 'JUAN PEREZ', ESTATUS_EOX: 'HABILITADO' }, { RESPONSABLE: 'JUAN PEREZ', ESTATUS_EOX: 'DESHABILITADO' }],
    uber: [{ NOMBRE_COMPLETO: 'JUAN PEREZ', ESTATUS: 'ACTIVO' }, { NOMBRE_COMPLETO: 'JUAN PEREZ', ESTATUS: 'BAJA' }],
    cajasChicas: [{ RESPONSABLE: 'JUAN PEREZ', ESTATUS: 'VIGENTE' }, { RESPONSABLE: 'JUAN PEREZ', ESTATUS: 'CERRADA' }],
  });
  const a = r.porPersona[0];
  ok(cuantos(a.lineas) === '2/1', 'líneas: el equipo en USO y la suelta en USO cuentan; la que va con equipo no se duplica (' + cuantos(a.lineas) + ')');
  ok(['vehiculos', 'hologramas', 'uber', 'cajasChicas'].every((t) => cuantos(a[t]) === '1/1'), 'vehículos, hologramas, Uber y cajas: 1 vigente y 1 al historial');
  ok(ctx.totalVigentes(a) === 6, 'el total del recuadro es lo mismo que suman las tarjetas: 6');
}

console.log('2. El caso reportado: equipo + caja vigente + caja cerrada + Uber → 3, y la cerrada solo en el historial');
{
  const a = repartir([{ nombre: 'ANA PRUEBA GARCIA' }], {
    indice: { equipos: [{ responsable: 'ANA PRUEBA GARCIA', estatus: 'USO' }], lineas: [] },
    uber: [{ NOMBRE_COMPLETO: 'ANA PRUEBA GARCIA', ESTATUS: 'ACTIVO' }],
    cajasChicas: [{ RESPONSABLE: 'ANA PRUEBA GARCIA', ESTATUS: 'VIGENTE' }, { RESPONSABLE: 'ANA PRUEBA GARCIA', ESTATUS: 'CERRADA' }],
  }).porPersona[0];
  ok(ctx.totalVigentes(a) === 3 && a.cajasChicas.vigentes.length === 1 && a.cajasChicas.historial.length === 1, 'recuadro 3; «Cajas chicas (1)» y la cerrada plegada');
}

console.log('3. El otro caso reportado: el equipo ya en RESGUARDO no se le cuenta, su línea en uso sí');
{
  const a = repartir([{ nombre: 'LUIS PRUEBA SOTO' }], {
    indice: { equipos: [{ responsable: 'LUIS PRUEBA SOTO', estatus: 'RESGUARDO' }], lineas: [{ responsable: 'LUIS PRUEBA SOTO', estatus: 'USO', suelta: true }] },
  }).porPersona[0];
  ok(ctx.totalVigentes(a) === 1 && a.lineas.vigentes[0].clase === 'linea' && a.lineas.historial[0].clase === 'equipo', '1 activo (la línea); el equipo en resguardo, al historial');
}

console.log('4. Nombre comparable: acentos, «MA.», puntos y paréntesis');
{
  ok(ctx.comparable('Ma. Teresa Núñez') === ctx.comparable('MA TERESA NUNEZ'), 'MA. = MA = MARIA, sin acentos');
  ok(ctx.comparable('MARIA JOSE PRUEBA (ARRENDADA)') === 'MARIA JOSE PRUEBA', 'sin lo que va entre paréntesis');
  const a = repartir([{ nombre: 'MA TERESA NUNEZ PRUEBA' }], { vehiculos: [{ RESPONSABLE_VEHICULO: 'MA. TERESA NUNEZ PRUEBA', ESTATUS: 'ACTIVO' }] }).porPersona[0];
  ok(a.vehiculos.vigentes.length === 1, 'el vehículo capturado como «MA. TERESA…» le toca');
}

console.log('5. ID PERSONA: rescata lo mal escrito, pero no le da a nadie lo de otra persona');
{
  const personas = [{ nombre: 'LUZ IVONNE PRUEBA ROJAS', idPersona: 'PER-1' }, { nombre: 'ROSA PRUEBA LARA', idPersona: 'PER-2' }, { nombre: 'ANA PRUEBA RIOS', idPersona: 'PER-3' }];
  const r = repartir(personas, {
    uber: [
      { NOMBRE_COMPLETO: 'LUZ PRUEBA ROJAS', ESTATUS: 'ACTIVO', ID_PERSONA: 'PER-1' },   // le falta un nombre: el ID lo rescata
      { NOMBRE_COMPLETO: 'OTRA PERSONA DISTINTA', ESTATUS: 'ACTIVO', ID_PERSONA: 'PER-2' },   // ID del correo del puesto: no
      { NOMBRE_COMPLETO: 'ANA PRUEBA RIOS', ESTATUS: 'ACTIVO', ID_PERSONA: 'PER-2' },    // el nombre manda sobre el ID
    ],
  });
  ok(r.porPersona[0].uber.vigentes.length === 1, 'el Uber de «LUZ PRUEBA ROJAS» le toca a LUZ IVONNE por su ID');
  ok(r.porPersona[1].uber.vigentes.length === 0, 'un ID que apunta a alguien sin nombres en común no se usa');
  ok(r.porPersona[2].uber.vigentes.length === 1, 'si el nombre es de alguien, manda el nombre (aunque el ID diga otra cosa)');
  ok(r.sinDueno.uber === 1, 'lo que no es de nadie se cuenta aparte (sinDueno): ' + JSON.stringify(r.sinDueno));
}

console.log('6. «A / B» le toca a las dos; el mismo nombre en dos renglones comparte sus activos');
{
  const r = repartir([{ nombre: 'JUAN UNO' }, { nombre: 'PEDRO DOS' }, { nombre: 'JUAN UNO' }],
    { vehiculos: [{ RESPONSABLE_VEHICULO: 'JUAN UNO / PEDRO DOS', ESTATUS: 'ACTIVO' }] });
  ok(r.porPersona[0].vehiculos.vigentes.length === 1 && r.porPersona[1].vehiculos.vigentes.length === 1, 'el vehículo compartido sale con los dos');
  ok(r.porPersona[2] === r.porPersona[0], 'el segundo renglón de JUAN UNO ve lo mismo que el primero');
}

console.log('6b. Homónimos (usuario, 12-nov: dos ADRIANA RAMIREZ GONZALEZ con el mismo NUCO 1427)');
{
  const personas = [
    { nombre: 'ADRIANA RAMIREZ GONZALEZ', idPersona: 'PER-1', noEmpleado: '100' },
    { nombre: 'ADRIANA RAMIREZ GONZALEZ', idPersona: 'PER-2', noEmpleado: '200' },
    { nombre: 'ADRIANA RAMIREZ GONZALEZ', idPersona: 'PER-1', noEmpleado: '100' }, // la misma PER-1 en otro departamento
  ];
  const r = repartir(personas, {
    indice: {
      equipos: [
        { nuco: '1427', responsable: 'ADRIANA RAMIREZ GONZALEZ', estatus: 'USO', idPersona: 'PER-2', noEmpleado: '200' },
        { nuco: '0001', responsable: 'ADRIANA RAMIREZ GONZALEZ', estatus: 'USO', noEmpleado: '100' },     // sin ID: por número
        { nuco: '0002', responsable: 'ADRIANA RAMIREZ GONZALEZ', estatus: 'USO', idPersona: 'PER-2', noEmpleado: '100' }, // el ID manda
        { nuco: '0003', responsable: 'ADRIANA RAMIREZ GONZALEZ / OTRA PERSONA', estatus: 'USO', noEmpleado: '200 / 300' },
      ],
      lineas: [],
    },
    hologramas: [{ RESPONSABLE: 'ADRIANA RAMIREZ GONZALEZ', ESTATUS_EOX: 'HABILITADO' }], // sin nada con qué desempatar
  });
  const nucos = (i) => r.porPersona[i].lineas.vigentes.map((x) => x.nuco).sort().join(',');
  ok(nucos(0) === '0001', 'PER-1 solo tiene el 0001 (por su No. de empleado): ' + nucos(0));
  ok(nucos(1) === '0002,0003,1427', 'PER-2 tiene el 1427 (ID), el 0002 (el ID manda sobre el número) y el 0003 («A / B» con «200 / 300»): ' + nucos(1));
  ok(r.porPersona[2] === r.porPersona[0] && r.porPersona[1] !== r.porPersona[0], 'la misma PER-1 en dos renglones comparte; PER-2 no');
  const h0 = r.porPersona[0].hologramas.vigentes;
  const h1 = r.porPersona[1].hologramas.vigentes;
  ok(h0.length === 1 && h1.length === 1 && h0[0]._nombreRepetido && h1[0]._nombreRepetido && h0[0]._de === h1[0]._de,
    'el holograma sin ID ni número se le muestra a las dos, marcado «nombre repetido» (el mismo original)');
  ok(ctx.totalRepetidos(r.porPersona[0]) === 1 && ctx.totalRepetidos(r.porPersona[1]) === 1, 'cada una cuenta 1 por revisar');
  ok(!r.porPersona[1].lineas.vigentes.some((x) => x._nombreRepetido), 'lo que sí se desempató no se marca');
}

console.log('7. Un módulo sin permiso (null) no se reparte');
{
  const r = repartir([{ nombre: 'JUAN PEREZ' }], { vehiculos: null, uber: null });
  ok(ctx.totalVigentes(r.porPersona[0]) === 0, 'sin vehículos ni Uber, nada truena');
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
