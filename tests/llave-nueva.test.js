/**
 * Vigila que la identidad de renglón sea la llave NUEVA, y que las huellas de pestaña no
 * la usen. Son dos cosas distintas y es fácil confundirlas:
 *
 *   - La LLAVE DE RENGLÓN identifica un registro. Debe ser 'ID'.
 *   - La HUELLA DE PESTAÑA (COLUMNAS_CLAVE, las `firma` de Relaciones.MAPA) sirve para
 *     saber CUÁL HOJA es, porque getSheetByName no es confiable en este libro. NO debe
 *     incluir 'ID': después de la migración lo tienen las 24 hojas, así que meterlo haría
 *     la huella menos específica, no más.
 *
 * Esta prueba lee el código fuente, no lo ejecuta: lo que protege es que nadie vuelva a
 * poner un nombre viejo de columna en una búsqueda, ni 'ID' en una huella.
 *
 * Correr: node tests/llave-nueva.test.js
 */
const fs = require('fs');
const path = require('path');

let fallas = 0;
function ok(condicion, descripcion) {
  console.log('  ' + (condicion ? '✔' : '✘') + ' ' + descripcion);
  if (!condicion) fallas++;
}

const SRC = path.join(__dirname, '..', 'src');
const lee = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const servicios = fs.readdirSync(path.join(SRC, 'services'))
  .filter((f) => f.endsWith('.gs'))
  .map((f) => ({ nombre: f, texto: lee('services', f) }));

/** Los nombres de columna que la migración renombra a "ID ANTERIOR". */
const VIEJOS = ['ID_VEHICULO', 'ID_SENSOR', 'ID_HOLOGRAMA', 'ID_VERIFICACION',
  'ID_INCIDENCIA', 'ID_CAMBIO', 'ID Reasignacion Vehicular', 'ID Historial',
  'ID_DESECHO', 'ID_Movimiento'];

/**
 * Los que se quedan porque NO son ids de AppSheet sino datos de la empresa
 * (ver llaveEsDato en src/config/Entidades.gs).
 */
const DE_NEGOCIO = ['ID INSPECCION', 'ID ARQUEO', 'ID CCH', 'No EMPLEADO'];

// AccesoriosService.gs se retiró el 1-oct (quedó un solo inventario, el de Líneas:
// LineasAccesorios.gs, que ya usa ID / ID ACCESORIO y cae a ID_Accesorio ↔ ID ANTERIOR).
const PENDIENTES = [];

console.log('1. Ningún servicio busca renglones por el nombre viejo');
{
  const patron = new RegExp(
    '(findById|\\.update|\\.remove|buscarPor)\\([^;]{0,200}?\'(' +
    VIEJOS.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')\'', 'g');
  const culpables = [];
  servicios.forEach((s) => {
    if (PENDIENTES.indexOf(s.nombre) !== -1) return;
    const m = s.texto.match(patron);
    if (m) culpables.push(s.nombre + ': ' + m[0].slice(0, 70));
  });
  ok(culpables.length === 0,
     culpables.length ? culpables.join(' | ') : 'ninguno de los ' +
       (servicios.length - PENDIENTES.length) + ' servicios revisados');
}

console.log('\n2. Toda llave de renglón es "ID" o una columna de negocio declarada');
{
  // El invariante no es "todos usan ID": las cuatro hojas con llaveEsDato siguen
  // buscando por su columna de negocio, y eso es correcto. Lo que NO puede haber es una
  // llave que no sea ninguna de las dos cosas.
  const PERMITIDAS = ['ID'].concat(DE_NEGOCIO);
  // SheetUtils a la fuerza: un `.update(` suelto también atrapa CacheService, y su llave
  // ('geotab_sesion') no es una columna.
  const re = /SheetUtils\.(?:findById|update|remove)\(([^;]{0,220}?)\)/g;
  const raras = [];
  servicios.forEach((s) => {
    if (PENDIENTES.indexOf(s.nombre) !== -1) return;
    let m;
    while ((m = re.exec(s.texto)) !== null) {
      // el último argumento es la columna llave; puede venir como literal o como variable
      const lit = m[1].match(/'([^']+)'\s*$/);
      if (!lit) continue;                       // variable (ID_COLUMN, COL_ID): se revisa abajo
      if (PERMITIDAS.indexOf(lit[1]) === -1) raras.push(s.nombre + " -> '" + lit[1] + "'");
    }
  });
  ok(raras.length === 0,
     raras.length ? raras.join(' | ') : 'ninguna llave fuera de ID o de las 4 de negocio');

  // Y las que van por variable: la variable tiene que estar puesta a algo permitido.
  const porVariable = [];
  servicios.forEach((s) => {
    if (PENDIENTES.indexOf(s.nombre) !== -1) return;
    const d = s.texto.match(/const (?:ID_COLUMN|COL_ID) = '([^']+)';/);
    if (d) porVariable.push({ nombre: s.nombre, valor: d[1] });
  });
  const malas = porVariable.filter((v) => PERMITIDAS.indexOf(v.valor) === -1);
  ok(malas.length === 0,
     malas.length ? malas.map((v) => v.nombre + " = '" + v.valor + "'").join(', ')
       : porVariable.length + ' servicios usan una variable, y todas valen algo permitido: ' +
         porVariable.map((v) => v.valor).filter((v, i, a) => a.indexOf(v) === i).join(', '));
}

console.log('\n3. Las huellas de pestaña NO llevan ID');
{
  const huellas = [];
  servicios.concat([{ nombre: 'Relaciones.gs', texto: lee('services', 'Relaciones.gs') }])
    .forEach((s) => {
      const re = /(?:COLUMNAS_CLAVE|COLUMNAS|firma)\s*[:=]\s*\[([^\]]*)\]/g;
      let m;
      while ((m = re.exec(s.texto)) !== null) huellas.push({ archivo: s.nombre, cols: m[1] });
    });
  ok(huellas.length >= 8, 'se encontraron ' + huellas.length + ' huellas en el código');
  const conId = huellas.filter((h) => /'ID'/.test(h.cols));
  ok(conId.length === 0,
     conId.length ? 'LLEVAN ID: ' + conId.map((h) => h.archivo).join(', ')
                  : 'ninguna incluye ID, que después de la migración no distingue nada');
  const conViejo = huellas.filter((h) =>
    VIEJOS.some((v) => h.cols.indexOf("'" + v + "'") !== -1));
  ok(conViejo.length === 0,
     conViejo.length ? 'llevan un nombre viejo: ' + conViejo.map((h) => h.archivo).join(', ')
                     : 'ni un nombre de los que la migración renombra');
}

console.log('\n4. Las columnas de negocio NO se tocaron');
{
  // ID INSPECCION, ID ARQUEO, ID CCH y No EMPLEADO son datos de la empresa: sus servicios
  // deben seguir usándolas. Si alguien las "moderniza", esto lo cacha.
  const insp = lee('services', 'InspeccionesService.gs');
  ok(/COL_ID = 'ID INSPECCION'/.test(insp),
     'InspeccionesService sigue con su folio ID INSPECCION');
  const arq = lee('services', 'ArqueosService.gs');
  ok(/ID_COLUMN = 'ID ARQUEO'/.test(arq), 'ArqueosService sigue con ID ARQUEO');
  const cch = lee('services', 'CajasChicasService.gs');
  ok(/ID_COLUMN = 'ID CCH'/.test(cch), 'CajasChicasService sigue con ID CCH');
  ok(DE_NEGOCIO.length === 4, 'son cuatro, y están declaradas en Entidades con llaveEsDato');
}

console.log('\n5. Los ids nuevos nacen con Ids.nuevo, no con getUuid');
{
  const patron = /const id = Utilities\.getUuid\(\)\.slice\(0, 8\)/;
  const culpables = servicios.filter((s) =>
    patron.test(s.texto) && PENDIENTES.indexOf(s.nombre) === -1);
  ok(culpables.length === 0,
     culpables.length ? 'todavía generan ids al estilo AppSheet: ' +
       culpables.map((s) => s.nombre).join(', ')
     : 'ningún servicio revisado genera ids de 8 hex al crear');
  const conIds = servicios.filter((s) => /Ids\.nuevo\(/.test(s.texto));
  ok(conIds.length >= 6,
     conIds.length + ' servicios usan Ids.nuevo: ' +
       conIds.map((s) => s.nombre.replace('Service.gs', '')).join(', '));
}

console.log('\n6. Lo que queda pendiente está declarado, no olvidado');
{
  const acc = lee('services', 'lineas/LineasAccesorios.gs');
  ok(/'ID ACCESORIO'/.test(acc) && /'ID ANTERIOR'/.test(acc),
     'el inventario de accesorios (Líneas) cita al artículo por ID ACCESORIO y cae a la llave vieja');
}

console.log('\n7. NINGUNA mención al nombre viejo, aunque no sea una búsqueda');
{
  // Esta revisión existe porque las de arriba no alcanzaron. Buscaban LLAMADAS
  // (findById/update/remove) y se les escaparon 12 lugares reales, cada uno por una razón
  // distinta y todas aburridas:
  //
  //   - `removeMany(` no empata con `remove\(`, así que tres eliminar() pasaron derecho.
  //   - La llamada de IncidenciasService.cerrar() lleva un objeto de 4 campos en medio y
  //     pasa de los 220 caracteres que miraba el regex.
  //   - `.filter((r) => r['ID_HOLOGRAMA'])` no es una llamada a SheetUtils: es el filtro
  //     de listar(). Con el nombre viejo devolvía undefined en cada renglón, así que
  //     listar() regresaba CERO filas — el módulo entero se veía vacío.
  //   - COLUMNAS_RESUMEN y COLUMNAS_FIRMA son arreglos de nombres, tampoco llamadas.
  //
  // La lección: mientras la revisión intente adivinar CÓMO se usa el nombre, va a haber
  // una forma más de usarlo. Así que esta no adivina: el nombre viejo no aparece, punto.
  // Si algún día uno de estos hace falta de verdad, va en PENDIENTES con su razón escrita.
  const sinComentarios = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

  const culpables = [];
  servicios.forEach((s) => {
    if (PENDIENTES.indexOf(s.nombre) !== -1) return;
    const limpio = sinComentarios(s.texto);
    VIEJOS.forEach((v) => {
      // La propiedad de SALIDA ID_VEHICULO es el contrato con el frontend (app.html usa
      // idCampo: 'ID_VEHICULO'), así que esa sí puede aparecer; lo que no puede es leerse
      // de la hoja con ese nombre, o sea entre comillas.
      const re = new RegExp("['\"]" + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]", 'g');
      const cuantas = (limpio.match(re) || []).length;
      if (cuantas) culpables.push(s.nombre + ' -> ' + v + ' x' + cuantas);
    });
  });
  ok(culpables.length === 0,
     culpables.length
       ? 'quedan nombres viejos entre comillas:\n       ' + culpables.join('\n       ')
       : 'ningún servicio revisado nombra una columna vieja de id, en ningún contexto');

  // Y que la propiedad de salida del frontend siga intacta: arreglar lo de arriba
  // cambiando ESTO habría roto la lista de vehículos de otra manera.
  const veh = lee('services', 'VehiculosService.gs');
  ok(/ID_VEHICULO: datos\['ID'\]\[i\]/.test(veh),
     "VehiculosService entrega la propiedad ID_VEHICULO leyéndola de la columna 'ID'");
}

console.log('\n8. Cada hijo escribe su LLAVE FORÁNEA, no solo la llave de negocio');
{
  // Por qué existe esta revisión: los IDs ya estaban puestos, pero la FK solo la llenaba
  // el paso por lotes de la migración. Existía para los 60,000 renglones viejos y moría
  // para todo lo nuevo — un sensor creado desde la app nacía con ID VEHICULO vacío.
  //
  // Se acepta cualquiera de las dos formas, porque las dos son legítimas:
  //   - nombrar la columna (los servicios cuyo copiado al crear NO coincide con lo que el
  //     MAPA vigila, así que mover todo a Relaciones les tiraría columnas), o
  //   - delegar en Relaciones.datosParaNuevo (los que sí coinciden).
  //
  // Lo que NO se acepta es que un módulo de estas dos familias no mencione su FK en
  // ningún lado: eso significa que sus registros nuevos nacen sueltos.
  const HIJOS = {
    'SensoresService.gs': 'ID VEHICULO',
    'VerificacionesService.gs': 'ID VEHICULO',
    'HologramasService.gs': 'ID VEHICULO',
    'InspeccionesService.gs': 'ID VEHICULO',
    'IncidenciasService.gs': 'ID VEHICULO',
    'ReasignacionesVehicularesService.gs': 'ID VEHICULO',
    'CambiosVehiculosService.gs': 'ID VEHICULO',
    'ArqueosService.gs': 'ID CAJA CHICA',
    'CambiosMontoCCHService.gs': 'ID CAJA CHICA',
  };
  const sinVinculo = [];
  Object.keys(HIJOS).forEach((archivo) => {
    const s = servicios.filter((x) => x.nombre === archivo)[0];
    if (!s) { sinVinculo.push(archivo + ' (no encontré el archivo)'); return; }
    const nombra = s.texto.indexOf("'" + HIJOS[archivo] + "'") !== -1;
    const delega = /Relaciones\.datosParaNuevo\(/.test(s.texto);
    if (!nombra && !delega) sinVinculo.push(archivo + ' -> ' + HIJOS[archivo]);
  });
  ok(sinVinculo.length === 0,
     sinVinculo.length
       ? 'no escriben su llave foránea:\n       ' + sinVinculo.join('\n       ')
       : 'los ' + Object.keys(HIJOS).length + ' hijos de Vehículos y Caja Chica escriben su FK');

  // Y que el resolvedor compartido siga entregándola: si alguien le quita la llaveForanea
  // al MAPA, los que delegan se quedarían sin FK y la revisión de arriba no lo vería.
  //
  // Se comprueba copia por copia en vez de contar, para que agregar una familia al MAPA no
  // rompa la prueba por el número — pero sí la rompa si a la copia nueva se le olvida su FK.
  const rel = lee('services', 'Relaciones.gs');
  const COPIAS = rel.match(/nombre: '([^']+)'/g) || [];
  const sinFk = [];
  COPIAS.forEach((m) => {
    const nombre = m.replace(/nombre: '|'/g, '');
    const re = new RegExp("nombre: '" + nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') +
      "',\\s*\\n\\s*llaveForanea: '");
    if (!re.test(rel)) sinFk.push(nombre);
  });
  ok(sinFk.length === 0,
     sinFk.length
       ? 'copias del MAPA sin llaveForanea: ' + sinFk.join(', ')
       : 'las ' + COPIAS.length + ' copias del MAPA declaran su llaveForanea');
  ok(/datos\[copia\.llaveForanea\]\s*=/.test(rel),
     'y datosParaNuevo la pone en los datos del registro nuevo');
  ok(/if \(fk\)/.test(rel) && /porFk\+\+/.test(rel),
     'y propagar() empareja por la llave foránea, no solo por la de negocio');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
