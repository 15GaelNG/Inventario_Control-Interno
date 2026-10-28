/**
 * Bitacora (src/services/Bitacora.gs): lo que escribe SheetUtils queda anotado solo, campo por campo, con quién y
 * desde dónde; los secretos nunca; lo masivo en un renglón; una escritura por operación; huellas encadenadas; y si el
 * libro falla, el guardado no truena y queda en la cola.
 *
 * Correr: node tests/bitacora.test.js
 */
const { crearEntorno } = require('./apps-script-simulado');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function entorno(opciones) {
  const archivos = [];   // lo que hay en la carpeta BITACORA
  const carpeta = {
    getFilesByName: (n) => { const lista = archivos.filter((a) => a.nombre === n); let i = 0; return { hasNext: () => i < lista.length, next: () => lista[i++] }; },
  };
  const e = crearEntorno(Object.assign({
    libros: {
      libro: {
        TICKETS: [['ID', 'ASUNTO', 'ESTADO', 'NOTA'], ['TCK-1', 'uno', 'ABIERTO', ''], ['TCK-2', 'dos', 'ABIERTO', '']],
        USUARIOS: [['CORREO', 'NOMBRE', 'PASSWORD_HASH'], ['ana@x.com', 'Ana', 'abc']],
        ACCESOS: [['FECHA', 'CORREO', 'METODO', 'RESULTADO', 'DISPOSITIVO', 'DETALLE']],
        APP_HELPDESK: [['ID', 'ASUNTO'], ['H-1', 'x']],
        COPIA: [['CLAVE', 'VALOR'], ['a', 1]],
      },
    },
    globales: {
      DriveUtils: { carpetaEnRaiz: () => carpeta },
      DriveApp: { getFileById: (id) => ({ moveTo: () => { archivos.push({ nombre: e.libros[id].getName(), getId: () => id }); } }) },
    },
  }, opciones || {}));
  e.cargar('src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs', 'src/services/Bitacora.gs');
  const S = e.global('SheetUtils');
  const B = e.global('Bitacora');
  const renglones = () => {
    const id = Object.keys(e.libros).find((k) => /^nuevo-/.test(k));
    if (!id) return [];
    const h = e.libros[id].getSheets()[0];
    return h._datos.slice(1).map((r) => Object.fromEntries(B.COLUMNAS.map((c, i) => [c, r[i]])));
  };
  return { e, S, B, renglones, archivos };
}

console.log('1. Cambiar: un renglón por campo que de verdad cambió, con antes y después');
{
  const { e, S, B, renglones, archivos } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'CERRADO', ASUNTO: 'uno' });
  const r = renglones();
  ok(archivos.length === 1 && archivos[0].nombre === 'BITACORA 2026', 'el libro del año se crea solo en la carpeta BITACORA');
  ok(e.libros[archivos[0].getId()].getSheets().map((h) => h.getName()).join() === '2026-10', 'una pestaña por mes (y sin la "Hoja 1" vacía)');
  ok(r.length === 1 && r[0].ACCION === 'CAMBIAR' && r[0].CAMPO === 'ESTADO' && r[0].ANTES === 'ABIERTO' && r[0].DESPUES === 'CERRADO',
    'solo ESTADO (ASUNTO no cambió), con antes y después');
  ok(r[0].QUIEN === 'ana@x.com' && r[0].ORIGEN === 'app' && r[0]['ID REGISTRO'] === 'TCK-1' && r[0].HOJA === 'TICKETS', 'quién, desde la app, qué registro');
  ok(e.registro.api.filter((x) => x.append).every((x) => x.modo === 'RAW'), 'se escribe como texto (RAW): un "=" no se vuelve fórmula');
}

console.log('2. Una escritura por operación (al soltar el candado), todos con la misma OPERACION');
{
  const { e, S, B, renglones } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  const t = S.tabla('libro', 'TICKETS');
  e.global('Candado').con(() => {
    S.cambiarCeldas(t, [{ fila: 2, cambios: { ESTADO: 'X' } }]);
    S.cambiarCeldas(t, [{ fila: 3, cambios: { NOTA: 'hola' } }]);
    S.agregarFilas(t, [{ ASUNTO: 'tres', ESTADO: 'ABIERTO' }]);
  });
  const r = renglones();
  ok(e.registro.api.filter((x) => x.append).length === 1 && r.length === 3, '3 renglones en una sola escritura');
  ok(new Set(r.map((x) => x.OPERACION)).size === 1, 'la misma operación');
  ok(r[2].ACCION === 'AGREGAR' && /^TCK-/.test(r[2]['ID REGISTRO']) && /"ASUNTO":"tres"/.test(r[2].DESPUES), 'agregar: el registro completo, con su ID');
}

console.log('3. Borrar, secretos, masivas y hojas que no se anotan');
{
  const { S, B, renglones } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  S.removeMany('libro', 'TICKETS', ['TCK-2']);
  S.update('libro', 'USUARIOS', 'ana@x.com', { PASSWORD_HASH: 'zzz', NOMBRE: 'Ana María' }, 'CORREO');
  S.reemplazarFilas(S.tabla('libro', 'COPIA'), [['b', 2], ['c', 3]]);
  S.cambiarCeldas(S.tabla('libro', 'APP_HELPDESK'), [{ fila: 2, cambios: { ASUNTO: 'y' } }]);
  const r = renglones();
  const borrar = r.find((x) => x.ACCION === 'BORRAR');
  ok(borrar && borrar['ID REGISTRO'] === 'TCK-2' && /"ASUNTO":"dos"/.test(borrar.ANTES), 'borrar: lo que tenía');
  const hash = r.find((x) => x.CAMPO === 'PASSWORD_HASH');
  ok(hash && hash.ANTES === '' && hash.DESPUES === '(cambió)' && r.some((x) => x.CAMPO === 'NOMBRE' && x.DESPUES === 'Ana María'),
    'un secreto: "(cambió)", nunca el valor; lo demás normal');
  ok(r.some((x) => x.ACCION === 'CARGA' && x.HOJA === 'COPIA' && /2 renglones/.test(x.DETALLE)), 'reescribir la pestaña: un renglón CARGA');
  ok(!r.some((x) => x.HOJA === 'APP_HELPDESK'), 'APP_HELPDESK (copia) no se anota');
  const muchos = Array.from({ length: 60 }, (_, i) => ({ fila: 2, cambios: { NOTA: 'n' + i } }));
  S.cambiarCeldas(S.tabla('libro', 'TICKETS'), muchos);
  ok(renglones().filter((x) => x.ACCION === 'CARGA' && x.HOJA === 'TICKETS').length === 1, 'más de 50 renglones: un renglón CARGA');
  ok(Object.keys(B.HOJAS).every((k) => !('no' in B.HOJAS[k]) || String(B.HOJAS[k].no).length > 10), 'toda hoja que no se anota dice por qué');
}

console.log('4. Ingresos: de lo que Accesos ya anota');
{
  const { S, renglones } = entorno();
  const t = S.tabla('libro', 'ACCESOS');
  S.agregarFilas(t, [[new Date(), 'beto@x.com', 'google', 'entro', 'Chrome', '']]);
  S.agregarFilas(t, [[new Date(), 'beto@x.com', 'contrasena', 'contrasena-mala', 'Chrome', '']]);
  const r = renglones();
  ok(r.map((x) => x.ACCION).join() === 'INGRESO,INGRESO FALLIDO', 'entró / falló');
  ok(r[0].QUIEN === 'beto@x.com' && r[0].ORIGEN === 'sistema' && /google · entro/.test(r[0].DETALLE), 'a nombre de quien intentó entrar');
}

console.log('5. Huellas encadenadas');
{
  const { e, S, B, renglones, archivos } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'A' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'B' });
  S.update('libro', 'TICKETS', 'TCK-2', { ESTADO: 'C' });
  ok(renglones().every((x) => /^[0-9a-f]{64}$/.test(x.HUELLA)), 'cada renglón con su huella SHA-256');
  ok(B.revisarCadena().rota === null && B.revisarCadena().renglones === 3, 'la cadena verifica');
  const hoja = e.libros[archivos[0].getId()].getSheets()[0];
  hoja._datos[2][11] = 'Z';   // alguien cambió el DESPUES del segundo renglón
  ok(B.revisarCadena().rota && B.revisarCadena().rota.fila === 3, 'si alguien edita un renglón, se rompe desde ahí');
  hoja._datos[2][11] = 'B';
  hoja._datos.splice(3, 1);   // y si borra el último
  ok(B.revisarCadena().rota && /faltan/.test(B.revisarCadena().rota.motivo), 'si borra el último, también se nota');
}

console.log('6. Si el libro falla, el guardado no truena y queda en la cola');
{
  const { e, S, B, renglones } = entorno({ appendFalla: true });
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'X' });
  ok(e.hojaComoTexto('libro', 'TICKETS')[1][2] === 'X', 'el cambio sí se guardó');
  ok(JSON.parse(e.propiedades.get('BITACORA_COLA')).length === 1 && renglones().length === 0, 'lo de la bitácora quedó en la cola');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
