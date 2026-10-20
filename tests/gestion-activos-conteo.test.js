/**
 * El conteo de "activos" por colaborador en Gestión de Activos (src/html/js/lineas.html,
 * dentro de initGestionActivos): debe contar solo lo que sigue activo hoy -- lo dado de baja
 * (vehículo, holograma, Uber, caja chica, línea o equipo) se queda en el panel de la persona
 * (eso no lo toca este bloque), pero ya no debe sumar al total.
 *
 * Se extrae el bloque REAL de lineas.html (no una copia a mano, para no desalinearse si el
 * código cambia) y se corre con datos de prueba.
 *
 * Correr: node tests/gestion-activos-conteo.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const lineasHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'lineas.html'), 'utf8');
const formatoHtml = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'formato.html'), 'utf8');
const formatoJs = formatoHtml.slice(formatoHtml.indexOf('<script>') + 8, formatoHtml.lastIndexOf('</script>'));

const inicio = lineasHtml.indexOf('const conteo = {};');
const fin = lineasHtml.indexOf('colaboradores = filasComoObjetos(r)');
if (inicio === -1 || fin === -1) throw new Error('No se encontró el bloque de conteo en lineas.html (¿cambió el código?)');
const bloqueConteo = lineasHtml.slice(inicio, fin);

const contexto = vm.createContext({});
vm.runInContext(formatoJs + '\nthis.Formato = Formato;', contexto);

/** Corre el bloque real con los catálogos que le pasemos; regresa el objeto conteo.
 *  OJO: un `const` de nivel superior en vm.runInContext no queda como propiedad del contexto
 *  (es de bloque, no global), y se queda vivo en el contexto entre llamadas (tronaría
 *  "ya declarado" la segunda vez) -- por eso se envuelve en una función que se autollama,
 *  con su propio scope, y se regresa "conteo" como valor de salida. */
function conteoDe(indice, vehiculos, hologramas, uber, cajasChicas) {
  contexto.normal = contexto.Formato.normal;
  contexto.indice = indice;
  contexto.vehiculos = vehiculos;
  contexto.hologramas = hologramas;
  contexto.uber = uber;
  contexto.cajasChicas = cajasChicas;
  return vm.runInContext('(function () {\n' + bloqueConteo + '\nreturn conteo;\n})()', contexto);
}

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Vehículos: ya vienen sin los de baja (el servidor los excluye) -- cuenta tal cual');
{
  const c = conteoDe({ equipos: [], lineas: [] },
    [{ RESPONSABLE_VEHICULO: 'JUAN PEREZ' }], [], [], []);
  ok(c['juan perez'] === 1, 'un vehículo cuenta: ' + JSON.stringify(c));
}

console.log('2. Hologramas: DESHABILITADO no cuenta, HABILITADO sí');
{
  const c = conteoDe({ equipos: [], lineas: [] }, [],
    [{ RESPONSABLE: 'JUAN PEREZ', ESTATUS_EOX: 'HABILITADO' }, { RESPONSABLE: 'JUAN PEREZ', ESTATUS_EOX: 'DESHABILITADO' }], [], []);
  ok(c['juan perez'] === 1, 'solo el habilitado cuenta, el deshabilitado no: ' + JSON.stringify(c));
}

console.log('3. Uber: ACTIVO cuenta, BAJA y PENDIENTE no');
{
  const c = conteoDe({ equipos: [], lineas: [] }, [], [],
    [{ NOMBRE_COMPLETO: 'JUAN PEREZ', ESTATUS: 'ACTIVO' }, { NOMBRE_COMPLETO: 'ANA LOPEZ', ESTATUS: 'BAJA' }, { NOMBRE_COMPLETO: 'LUIS RUIZ', ESTATUS: 'PENDIENTE' }], []);
  ok(c['juan perez'] === 1 && !c['ana lopez'] && !c['luis ruiz'],
    'solo el activo cuenta: ' + JSON.stringify(c));
}

console.log('4. Caja chica: VIGENTE cuenta, CERRADA no');
{
  const c = conteoDe({ equipos: [], lineas: [] }, [], [], [],
    [{ RESPONSABLE: 'JUAN PEREZ', ESTATUS: 'VIGENTE' }, { RESPONSABLE: 'ANA LOPEZ', ESTATUS: 'CERRADA' }]);
  ok(c['juan perez'] === 1 && !c['ana lopez'], 'solo la vigente cuenta: ' + JSON.stringify(c));
}

console.log('5. Equipos y líneas sueltas: USO cuenta, cualquier otro estatus no (sigue viéndose en el panel, pero no suma)');
{
  const indice = {
    equipos: [
      { responsable: 'JUAN PEREZ', estatus: 'USO' },
      { responsable: 'ANA LOPEZ', estatus: 'DISPONIBLE' },
    ],
    lineas: [
      { responsable: 'JUAN PEREZ', estatus: 'USO', suelta: true },
      { responsable: 'LUIS RUIZ', estatus: 'CANCELADA', suelta: true },
      // No suelta (va con un equipo): aunque estuviera en USO, ya la cuenta el equipo -- no doble
      { responsable: 'JUAN PEREZ', estatus: 'USO', suelta: false },
    ],
  };
  const c = conteoDe(indice, [], [], [], []);
  ok(c['juan perez'] === 2, 'el equipo en uso y la línea suelta en uso de Juan, dos activos (la línea no suelta no suma aparte): ' + JSON.stringify(c));
  ok(!c['ana lopez'], 'el equipo DISPONIBLE de Ana no cuenta');
  ok(!c['luis ruiz'], 'la línea CANCELADA de Luis no cuenta');
}

console.log('6. El ejemplo del usuario: a alguien con un vehículo y una línea se le da de baja la línea -- queda en 1');
{
  const indice = { equipos: [], lineas: [{ responsable: 'JUAN PEREZ', estatus: 'USO', suelta: true }] };
  const antes = conteoDe(indice, [{ RESPONSABLE_VEHICULO: 'JUAN PEREZ' }], [], [], []);
  ok(antes['juan perez'] === 2, 'antes de la baja: 2 activos (vehículo + línea): ' + JSON.stringify(antes));

  const indiceDespues = { equipos: [], lineas: [{ responsable: 'JUAN PEREZ', estatus: 'CANCELADA', suelta: true }] };
  const despues = conteoDe(indiceDespues, [{ RESPONSABLE_VEHICULO: 'JUAN PEREZ' }], [], [], []);
  ok(despues['juan perez'] === 1, 'después de dar de baja la línea: 1 activo (el vehículo), no 2: ' + JSON.stringify(despues));
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
