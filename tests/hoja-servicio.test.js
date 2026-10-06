/**
 * Pruebas de HojaServicio (src/utils/HojaServicio.gs) sobre hojas simuladas: listar con caché,
 * listarPor, buscar, crear, actualizar y eliminar con sus ganchos, las fechas y los archivos.
 * Y que ningún servicio llame nada al cargarse (Apps Script no garantiza el orden de los archivos).
 *
 * Correr: node tests/hoja-servicio.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const truena = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

// ---------------------------------------------------------------------------------- entorno
function entorno() {
  const base = crearEntorno({ libros: {} });
  const f = base.fecha;
  const e = crearEntorno({
    libros: {
      libro: {
        COSAS: [
          ['ID', 'NOMBRE', 'FECHA', 'MONTO', 'ARCHIVO', 'NOTA'],
          ['C-1', 'Beta', f('2026-09-01'), 10, '', ''],
          ['', 'sin id', '', '', '', ''],
          ['C-2', 'alfa', f('2026-09-05'), 2, '', ''],
          ['C-3', 'Gama', '12/09/2026', 30, '', ''],
        ],
        PADRES: [['ID', 'NOMBRE'], ['P-1', 'Uno'], ['P-2', 'Dos']],
        BITACORA: [['ID', 'FOLIO', 'TEXTO'], ['B-1', 'A', 'uno'], ['B-2', 'B', 'dos'], ['B-3', 'A', 'tres'], ['B-4', 'A', 'cuatro']],
        OTRA: [['CLAVE', 'VALOR'], ['x', 'equis']],
      },
    },
  });
  // Las fechas de la semilla, del entorno donde corre el código
  e.libros.libro._hojas.forEach((h) => h._datos.forEach((r) => r.forEach((v, i) => {
    if (v instanceof Date) r[i] = new e.Date(v.getTime());
  })));
  const log = { permisos: [], relaciones: [], renombres: [] };
  Object.assign(e.contexto, {
    Permisos: {
      puedeLeer: (t, m) => { log.permisos.push('leer:' + m); if (t === 'sin-permiso') throw new Error('Sin permiso'); return { nombre: 'ANA' }; },
      EDICION: 'EDICION',
      // 'con-sensores': además tiene EDICION en sensores (para deOtroModulo)
      puedeEditar: (t, m) => {
        log.permisos.push('editar:' + m);
        if (t === 'sin-permiso') throw new Error('Sin permiso');
        return { nombre: 'ANA', permisos: t === 'con-sensores' ? { cosas: 'EDICION', sensores: 'EDICION' } : { cosas: 'EDICION', sensores: 'LECTURA' } };
      },
    },
    Entidades: { prefijo: (h) => h.slice(0, 1) },
    Ids: (() => { let n = 0; return { nuevo: (p) => p + '-N' + (++n) }; })(),
    Relaciones: {
      protegeBorrado: (h) => h === 'PADRES',
      borrar: (h, ids) => {
        log.relaciones.push(h + ':' + ids.join(','));
        if (ids.includes('P-1')) throw new Error('P-1 tiene hijos');
        return { eliminadas: e.global('SheetUtils').removeMany('libro', h, ids, 'ID') };
      },
    },
    DriveApp: { getFileById: (id) => ({ getName: () => 'subido.pdf', setName: (n) => log.renombres.push(id + '→' + n) }) },
  });
  e.cargar('src/utils/SheetUtils.gs', 'src/utils/CacheHojas.gs', 'src/utils/HojaServicio.gs');
  return { e, H: e.global('HojaServicio'), log, hoja: (n) => e.hojaComoTexto('libro', n) };
}

const COSAS = {
  modulo: 'cosas', nombre: 'la cosa', libro: () => 'libro', hoja: 'COSAS',
  columnas: ['ID', 'NOMBRE', 'FECHA', 'MONTO'],
};

// ---------------------------------------------------------------------------------- 1
console.log('1. Ningún servicio llama nada mientras se carga');
{
  // Peor caso del orden de carga: el servicio carga ANTES que todo lo demás (ni HojaServicio,
  // ni Config, ni SheetUtils existen todavía). Si algo corre al cargar, aquí truena.
  const dir = path.join(__dirname, '..', 'src', 'services');
  const archivos = fs.readdirSync(dir).filter((a) => a.endsWith('.gs'));
  const malos = [];
  archivos.forEach((a) => {
    try { vm.runInContext(fs.readFileSync(path.join(dir, a), 'utf8'), vm.createContext({})); }
    catch (err) { malos.push(a + ': ' + err.message); }
  });
  ok(malos.length === 0, malos.length ? 'truenan al cargar solos: ' + malos.join(' | ') : archivos.length + ' servicios cargan sin nada más alrededor');
  const usan = archivos.filter((a) => /HojaServicio\./.test(fs.readFileSync(path.join(dir, a), 'utf8')));
  ok(usan.length >= 13, usan.length + ' servicios usan HojaServicio');
}

// ---------------------------------------------------------------------------------- 2
console.log('\n2. listar');
{
  const { H, log, e } = entorno();
  const def = Object.assign({}, COSAS, { orden: { campo: 'NOMBRE' } });
  const lista = H.listar(def, 'tok');
  ok(lista.length === 3, 'solo los renglones con id (3 de 4)');
  ok(lista.map((c) => c.NOMBRE).join() === 'alfa,Beta,Gama', 'orden por texto: ' + lista.map((c) => c.NOMBRE).join());
  ok(lista[0].FECHA === '2026-09-05T06:00:00.000Z', 'las fechas salen en ISO (sin fila(), por omisión)');
  ok(log.permisos[0] === 'leer:cosas', 'revisa el permiso de leer del módulo');
  ok(truena(() => H.listar(def, 'sin-permiso')) === 'Sin permiso', 'sin permiso no regresa nada, aunque esté en caché');
  ok(H.listar(Object.assign({}, def, { orden: { campo: 'MONTO', numero: true, desc: true } }), 'tok').map((c) => c.MONTO).join() === '30,10,2',
    'orden numérico descendente');
  const porFecha = Object.assign({}, def, {
    fila: (r) => ({ ID: r.ID, FECHA: H.fechaISO(r.FECHA) }),
    orden: { campo: 'FECHA', desc: true },
  });
  ok(H.listar(porFecha, 'tok').map((c) => c.ID).join() === 'C-3,C-2,C-1',
    'orden por fecha descendente ("12/09/2026" es 12 de septiembre), y no se mezcla con la otra lista de la misma hoja');

  // Caché: se rehace sola al escribir
  H.crear(Object.assign({}, def), 'tok', { NOMBRE: 'Delta' });
  ok(H.listar(def, 'tok').length === 4, 'después de crear, la lista ya trae el nuevo (la caché se rehízo)');

  // preparar(): una vez por lista
  let veces = 0;
  const conIndice = Object.assign({}, COSAS, {
    tambienLee: ['OTRA'],
    preparar: () => { veces++; return { x: 'equis' }; },
    fila: (r, p) => ({ ID: r.ID, extra: p.x }),
  });
  const conExtra = H.listar(conIndice, 'tok');
  ok(veces === 1 && conExtra.every((c) => c.extra === 'equis'), 'preparar() corre una vez y su resultado llega a cada fila()');
  e.global('SheetUtils').insert('libro', 'OTRA', { CLAVE: 'y', VALOR: 'ye' });
  H.listar(conIndice, 'tok');
  ok(veces === 2, 'si cambia una hoja de tambienLee, la lista se rehace');
}

// ---------------------------------------------------------------------------------- 3
console.log('\n3. listarPor');
{
  const { H, log } = entorno();
  const BIT = { modulo: 'bit', libro: () => 'libro', hoja: 'BITACORA', columnas: ['ID', 'FOLIO', 'TEXTO'], ultimosPrimero: true, maximo: 2 };
  ok(H.listar(BIT, 'tok').map((b) => b.ID).join() === 'B-4,B-3', 'ultimosPrimero + maximo: los 2 más recientes');
  ok(H.listarPor(BIT, 'tok', 'FOLIO', 'B').map((b) => b.ID).join() === 'B-2',
    'con la lista cortada, busca en TODA la hoja (B-2 no está en los 2 recientes)');
  ok(H.listarPor(BIT, 'tok', 'FOLIO', 'A', { maximo: 2 }).map((b) => b.ID).join() === 'B-4,B-3', 'y respeta su propio máximo');
  log.permisos.length = 0;
  ok(H.listarPor(COSAS, 'tok', 'NOMBRE', '').length === 0 && log.permisos[0] === 'leer:cosas',
    'valor vacío → [], pero el permiso se revisa igual');
  ok(H.listarPor(COSAS, 'tok', 'MONTO', '30').map((c) => c.ID).join() === 'C-3', 'compara como texto (30 = "30")');
}

// ---------------------------------------------------------------------------------- 4
console.log('\n4. Fechas');
{
  const { H } = entorno();
  ok(H.fechaDeEntrada('2026-10-05').toISOString() === '2026-10-05T06:00:00.000Z',
    '"yyyy-MM-dd" es medianoche en México, no las 18:00 del día anterior');
  ok(H.fechaDeEntrada('') === '' && H.fechaDeEntrada(null) === '', 'vacío se queda vacío');
  ok(truena(() => H.fechaDeEntrada('mañana')) === 'La fecha "mañana" no es válida', 'texto que no es fecha truena con mensaje claro');
  ok(H.fechaISO('12/09/2026') === '2026-09-12T06:00:00.000Z', '"dd/mm/yyyy" de AppSheet se lee como día/mes');
  ok(H.fechaISO('basura') === '' && H.fechaISO('') === '', 'lo que no es fecha sale vacío');
  ok(truena(() => H.fechaObligatoria('', 'fecha de prueba')) === 'Falta o es inválida la fecha de prueba', 'fechaObligatoria pide la fecha');
}

// ---------------------------------------------------------------------------------- 5
console.log('\n5. crear');
{
  const { H, e, log, hoja } = entorno();
  let candadoEnDespues = null;
  let ctxAlCrear = null;
  const def = Object.assign({}, COSAS, {
    fechas: ['FECHA'],
    obligatorios: { NOMBRE: 'Falta el nombre' },
    archivos: { ARCHIVO: 'DOC' },
    candadoAlCrear: true,
    alCrear: (fila, ctx) => { ctxAlCrear = ctx; return { NOTA: 'por ' + ctx.sesion.nombre }; },
    despues: (registro, ctx) => { candadoEnDespues = e.registro.candadoTomado; },
  });
  ok(truena(() => H.crear(def, 'tok', { NOMBRE: '  ' })) === 'Falta el nombre', 'obligatorio vacío o con espacios truena con su mensaje');
  const r = H.crear(def, 'tok', { NOMBRE: 'Nuevo', FECHA: '2026-10-01', ARCHIVO: 'https:\/\/d/1', ARCHIVO_FILE_ID: 'f-9' });
  const fila = hoja('COSAS').find((x) => x[0] === r.ID);
  ok(r.ID === 'C-N1' && fila, 'el id lo pone SheetUtils.insert y regresa en la respuesta: ' + r.ID);
  ok(fila[2] === '2026-10-01T06:00:00.000Z', 'la fecha del formulario se guarda como medianoche local');
  ok(fila[5] === 'por ANA', 'lo que regresa alCrear va encima (con la sesión en ctx)');
  ok(ctxAlCrear.hoja.getName() === 'COSAS' && ctxAlCrear.datos.ARCHIVO_FILE_ID === 'f-9', 'ctx trae la hoja y lo que mandó el cliente');
  ok(log.renombres[0] === 'f-9→C-N1_DOC_2026-10-05.pdf', 'el archivo subido se renombra "<id>_<etiqueta>_<fecha>.ext": ' + log.renombres[0]);
  ok(!hoja('COSAS')[0].includes('ARCHIVO_FILE_ID'), 'ARCHIVO_FILE_ID no se escribe en la hoja');
  ok(e.registro.locks === 1 && candadoEnDespues === 0, 'crea bajo candado, y despues() corre ya sin él');
  ok(r.NOMBRE === 'Nuevo' && r.FECHA === '2026-10-01T06:00:00.000Z', 'regresa el registro como en la lista (fechas en ISO)');

  const conCampos = Object.assign({}, COSAS, { campos: { NOMBRE_COSA: 'NOMBRE', MONTO_COSA: 'MONTO' } });
  const r2 = H.crear(conCampos, 'tok', { NOMBRE_COSA: 'Traducido', MONTO_COSA: 5, NOTA: 'no pasa' });
  const fila2 = hoja('COSAS').find((x) => x[0] === r2.ID);
  ok(fila2[1] === 'Traducido' && fila2[3] === 5 && fila2[5] === '', 'campos traduce lo del formulario y deja fuera lo demás');
}

// ---------------------------------------------------------------------------------- 6
console.log('\n6. actualizar');
{
  const { H, hoja } = entorno();
  ok(/No se encontró el registro con ID=NO/.test(truena(() => H.actualizar(COSAS, 'tok', 'NO', { NOTA: 'x' }))),
    'sin ganchos, el que no existe truena (SheetUtils)');
  let visto = null;
  const def = Object.assign({}, COSAS, {
    noEditables: ['NOMBRE'],
    alActualizar: (cambios, ctx) => { visto = ctx; return { NOTA: 'antes ' + ctx.actual.NOMBRE }; },
    despues: (registro, ctx) => { visto.despues = { registro, cambios: ctx.cambios }; },
  });
  ok(truena(() => H.actualizar(def, 'tok', 'NO', {})) === 'No se encontró la cosa con ID=NO', 'con ganchos, el mensaje nombra el registro');
  const r = H.actualizar(def, 'tok', 'C-1', { NOMBRE: 'no cambia', ID: 'X', MONTO: 99 }, { algo: true });
  const fila = hoja('COSAS')[1];
  ok(fila[0] === 'C-1' && fila[1] === 'Beta' && fila[3] === 99, 'no toca el id ni lo noEditable; sí lo demás');
  ok(fila[5] === 'antes Beta' && visto.opciones.algo === true, 'alActualizar ve el renglón de antes y las opciones');
  ok(visto.despues.cambios.MONTO === 99 && visto.despues.registro.NOMBRE === 'Beta', 'despues recibe el registro completo y los cambios');
  ok(r.ID === 'C-1' && r.MONTO === 99, 'regresa el registro como en la lista');
}

// ---------------------------------------------------------------------------------- 7
console.log('\n7. eliminar');
{
  const { H, log, hoja } = entorno();
  ok(truena(() => H.eliminar(COSAS, 'tok', 'NO')) === 'No se encontró la cosa con ID=NO', 'uno que no existe truena');
  ok(truena(() => H.eliminar(COSAS, 'tok', [])) === 'No se indicaron registros a eliminar', 'sin ids truena');
  ok(H.eliminar(COSAS, 'tok', 'C-2').ID === 'C-2' && !hoja('COSAS').some((x) => x[0] === 'C-2'), 'uno → { ID }');
  ok(H.eliminar(COSAS, 'tok', ['C-1', 'NO']).eliminadas === 1, 'varios → { eliminadas }');
  const PADRES = { modulo: 'padres', libro: () => 'libro', hoja: 'PADRES' };
  ok(truena(() => H.eliminar(PADRES, 'tok', 'P-1')) === 'P-1 tiene hijos', 'una hoja protegida pasa por Relaciones.borrar, que se puede negar');
  ok(H.eliminar(PADRES, 'tok', 'P-2').ID === 'P-2' && log.relaciones.join() === 'PADRES:P-1,PADRES:P-2', 'y borra lo que no tiene hijos');
  let antes = null;
  const conGancho = Object.assign({}, COSAS, { despuesDeEliminar: (registros) => { antes = registros; } });
  H.eliminar(conGancho, 'tok', ['C-3']);
  ok(antes && antes.length === 1 && antes[0].NOMBRE === 'Gama', 'despuesDeEliminar recibe los renglones como estaban');
}

console.log('deOtroModulo: columnas que solo cambia quien edita otro módulo');
{
  const { H, hoja } = entorno();
  const def = Object.assign({}, COSAS, { deOtroModulo: { sensores: ['NOTA'] } });
  H.actualizar(def, 'tok', 'C-1', { NOMBRE: 'Beta 2', NOTA: 'desde la consola' });
  let fila = hoja('COSAS').find((r) => r[0] === 'C-1');
  ok(fila[1] === 'Beta 2' && fila[5] === '', 'sin EDICION en ese módulo: lo demás se guarda y esa columna se ignora');
  H.actualizar(def, 'con-sensores', 'C-1', { NOTA: 'con permiso' });
  fila = hoja('COSAS').find((r) => r[0] === 'C-1');
  ok(fila[5] === 'con permiso', 'con EDICION en ese módulo: se guarda');
  H.crear(def, 'tok', { NOMBRE: 'Nueva', NOTA: 'no debe quedar' });
  const nueva = hoja('COSAS').find((r) => r[1] === 'Nueva');
  ok(nueva && nueva[5] === '', 'al crear, igual');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
