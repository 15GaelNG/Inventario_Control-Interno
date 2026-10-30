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
  const archivos = [];   // lo que hay en la carpeta LOGS
  const correos = [];    // lo que mandó la revisión diaria
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
      DriveUtils: { carpetaEnRaiz: () => carpeta, carpetaEnRaizSiExiste: () => (archivos.length ? carpeta : null) },
      Config: { DRIVE_FOLDERS: { RAIZ: () => 'RAIZ' } },
      DriveApp: { getFileById: (id) => ({ moveTo: () => { archivos.push({ nombre: e.libros[id].getName(), getId: () => id }); } }), getFolderById: () => ({}) },
      MailApp: { sendEmail: (m) => correos.push(m) },
    },
  }, opciones || {}));
  e.cargar('src/utils/Ids.gs', 'src/config/Entidades.gs', 'src/utils/CacheHojas.gs', 'src/utils/SheetUtils.gs', 'src/utils/Correos.gs',
    'src/services/Bitacora.gs');
  const S = e.global('SheetUtils');
  const B = e.global('Bitacora');
  const renglones = () => {
    const id = Object.keys(e.libros).find((k) => /^nuevo-/.test(k));
    if (!id) return [];
    const h = e.libros[id].getSheets()[0];
    return h._datos.slice(1).filter((r) => r.some((v) => v !== '' && v !== undefined))   // los renglones vacíos de por delante no cuentan
      .map((r) => Object.fromEntries(B.COLUMNAS.map((c, i) => [c, r[i]])));
  };
  return { e, S, B, renglones, archivos, correos };
}

console.log('1. Cambiar: un renglón por campo que de verdad cambió, con antes y después');
{
  const { e, S, B, renglones, archivos } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'CERRADO', ASUNTO: 'uno' });
  const r = renglones();
  ok(archivos.length === 1 && archivos[0].nombre === 'LOGS 2026', 'el libro del año (LOGS 2026) se crea solo en la carpeta LOGS');
  ok(e.libros[archivos[0].getId()].getSheets().map((h) => h.getName()).join() === '2026-10', 'una pestaña por mes (y sin la "Hoja 1" vacía)');
  ok(r.length === 1 && r[0].ACCION === 'CAMBIAR' && r[0].CAMPO === 'ESTADO' && r[0].ANTES === 'ABIERTO' && r[0].DESPUES === 'CERRADO',
    'solo ESTADO (ASUNTO no cambió), con antes y después');
  ok(r[0].QUIEN === 'ana@x.com' && r[0].ORIGEN === 'app' && r[0]['ID REGISTRO'] === 'TCK-1' && r[0].HOJA === 'TICKETS', 'quién, desde la app, qué registro');
  ok(e.registro.api.filter((x) => x.append).every((x) => x.modo === 'RAW'), 'se escribe como texto (RAW): un "=" no se vuelve fórmula');
  const pestana = e.libros[archivos[0].getId()].getSheets()[0];
  const regla = (t) => (pestana._reglas || []).find((x) => x.texto === t) || {};
  ok(regla('AGREGAR').fondo === '#e6f4ea' && regla('CAMBIAR').fondo === '#e8f0fe' && regla('BORRAR').fondo === '#fce8e6' &&
    regla('INGRESO').fondo === '#f3e8fd' && regla('DENEGADO').fondo === '#fef7e0' && regla('CARGA').fondo === '#f1f3f4',
    'un color por acción: verde agregar, azul cambiar, rojo borrar, morado ingresos, ámbar seguridad, gris masivo');
  ok((pestana._reglas || []).every((x) => !x.formula) && pestana._filtro, 'sin fórmulas (no dependen del idioma) y con filtros en el encabezado');
  ok(e.propiedades.get('BITACORA_FORMATO_' + archivos[0].getId() + '_2026-10') === '2', 'el formato se da una vez por pestaña (y versión)');
  ok(e.registro.api.filter((x) => x.append).every((x) => x.insertar === 'OVERWRITE'),
    'escribe sobre renglones vacíos (OVERWRITE): un renglón insertado copiaba el formato del encabezado (prod, 28-oct)');
  ok(pestana.getMaxRows() >= 2000, 'la pestaña nace con 2000 renglones por delante (los colores y el filtro los cubren)');
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

console.log('7. Lo que no pasa por SheetUtils: a mano y accesos denegados');
{
  const { B, renglones } = entorno();
  B.aMano('luis@x.com');
  B.evento('CAMBIAR', { libro: 'libro', hoja: 'TICKETS', fila: 2, id: 'TCK-1', campo: 'ESTADO', antes: 'ABIERTO', despues: 'X' });
  B.evento('CAMBIAR', { libro: 'libro', hoja: 'USUARIOS', fila: 2, campo: 'PASSWORD_HASH', antes: 'abc', despues: 'def' });
  B.evento('CAMBIAR', { libro: 'libro', hoja: 'APP_HELPDESK', fila: 2, campo: 'ASUNTO', antes: 'x', despues: 'y' });
  const r = renglones();
  ok(r.length === 2 && r[0].ORIGEN === 'a mano' && r[0].QUIEN === 'luis@x.com' && r[0].ANTES === 'ABIERTO', 'a mano: quién y lo de antes');
  ok(r[1].ANTES === '' && r[1].DESPUES === '(cambió)', 'a mano, un secreto tampoco se anota');
  const fs = require('fs');
  const permisos = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'services', 'PermisosService.gs'), 'utf8');
  ok(/if \(!silencio_ && typeof Bitacora !== 'undefined'\) \{\s*Bitacora\.evento\('DENEGADO'/.test(permisos), 'Permisos.exigir anota DENEGADO');
  const fuente = (f) => fs.readFileSync(require('path').join(__dirname, '..', 'src', f), 'utf8');
  ok(['ClientApi.gs', 'services/DashboardService.gs', 'services/NotificacionesService.gs'].every((f) => /Permisos\.sinAnotar\(/.test(fuente(f))),
    'lo que se pide por si acaso (ficha, Inicio, campanita) no cuenta como denegado');
  ok(/Bitacora\.aMano\(quien\)/.test(fuente('AvisoDeCambios.gs')), 'el activador de edición anota lo hecho a mano');
}

console.log('8. Drive: lo que se sube, mueve, renombra o tira (lo temporal no)');
{
  const { e, B, renglones } = entorno();
  const carpetaBitacora = e.global('DriveUtils').carpetaEnRaiz;   // la de mentira (la carpeta LOGS)
  e.cargar('src/utils/DriveUtils.gs');
  const D = e.global('DriveUtils');
  D.carpetaEnRaiz = carpetaBitacora;
  B.sesion({ correo: 'ana@x.com' });
  const archivo = (id, nombre) => ({ getId: () => id, getName: () => nombre, setName(n) { nombre = n; return this; },
    setDescription() { return this; }, setTrashed() {}, moveTo() { return this; }, makeCopy: (n) => archivo('copia-' + id, n) });
  const carpeta = { getId: () => 'CARP-1', createFile: (b) => archivo('F-1', b.getName()), createFolder: (n) => archivo('C-9', n) };
  const blob = { n: 'a.pdf', getName() { return this.n; }, setName(n) { this.n = n; return this; } };
  D.crearArchivo(carpeta, blob, 'RESP-0088.pdf');
  D.renombrar(archivo('F-2', 'viejo.pdf'), 'nuevo.pdf');
  D.mover(archivo('F-3', 'foto.jpg'), carpeta, 'NEUMATICOS-0088.jpg');
  const tmp = D.copiar(archivo('PLANTILLA', 'Formato'), 'TMP x', carpeta, { temporal: true });
  D.aPapelera(tmp, { temporal: true });
  D.aPapelera(archivo('F-4', 'quitada.jpg'));
  const movidas = [];
  e.contexto.Drive = { Files: { update: (recurso, id, blob, args) => { movidas.push(id + '→' + args.addParents + ':' + recurso.name); return {}; } } };
  D.moverConApi('F-5', 'TEMP', carpeta, 'NEUMATICOS-0088 (2).jpg');
  const r = renglones();
  ok(r.map((x) => x.ACCION).join() === 'SUBIR,RENOMBRAR,MOVER,PAPELERA,MOVER', 'subir, renombrar, mover y tirar; la copia temporal de la plantilla no');
  ok(movidas.join() === 'F-5→CARP-1:NEUMATICOS-0088 (2).jpg' && r[4]['ID REGISTRO'] === 'F-5', 'moverConApi: mueve y renombra en una llamada, y se anota');
  ok(r[0].HOJA === 'DRIVE' && r[0]['ID REGISTRO'] === 'F-1' && r[0].CAMPO === 'RESP-0088.pdf' && /CARP-1/.test(r[0].DETALLE), 'qué archivo y dónde');
  ok(r[1].ANTES === 'viejo.pdf' && r[1].DESPUES === 'nuevo.pdf', 'renombrar: el nombre de antes y el nuevo');
}

console.log('9. Revisión diaria (Calentador)');
{
  const { e, S, B, archivos, correos } = entorno();
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'A' });
  S.update('libro', 'TICKETS', 'TCK-2', { ESTADO: 'B' });
  ok(/^bien: 2 renglones/.test(B.revisarDiaria()) && correos.length === 0, 'todo bien: no avisa');
  ok(B.revisarDiaria() === 'ya se revisó hoy', 'una vez al día');
  e.libros[archivos[0].getId()].getSheets()[0]._datos[1][11] = 'Z';   // alguien editó un renglón
  e.propiedades.delete('BITACORA_REVISION');
  const r = B.revisarDiaria();
  ok(/cadena de huellas se rompe en el renglón 2/.test(r) && correos.length === 1 && correos[0].to === 'despliega@ejemplo.com',
    'la cadena rota: avisa por correo a la cuenta que despliega');
  const fuente = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'Calentador.gs'), 'utf8');
  ok(/Bitacora\.revisarDiaria\(\)/.test(fuente), 'es un paso del Calentador');
}

console.log('10. Una pestaña que ya existía sin formato se repinta sola (Calentador) o desde el editor');
{
  const { e, S, B, archivos } = entorno();
  ok(B.alDia() === 'sin bitácora todavía', 'donde no hay bitácora no la crea');
  B.sesion({ correo: 'ana@x.com' });
  S.update('libro', 'TICKETS', 'TCK-1', { ESTADO: 'A' });
  const pestana = e.libros[archivos[0].getId()].getSheets()[0];
  // Como la del DEV: hecha antes de que existiera el formato
  pestana._reglas = [];
  e.propiedades.delete('BITACORA_FORMATO_' + archivos[0].getId() + '_2026-10');
  e.contexto.CacheService.getScriptCache().remove('bitacora_v2_f2_2026-10');
  ok(B.alDia() === 'revisada' && pestana._reglas.length === 17, 'el Calentador la ve sin formato y la pinta (17 reglas)');
  ok(B.alDia() === 'al día', 'la siguiente vuelta solo lee la caché');
  pestana._reglas = [];
  ok(/2026-10/.test(B.repintar()) && pestana._reglas.length === 17, 'repintarBitacora() la vuelve a pintar al momento');
  const calentador = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'Calentador.gs'), 'utf8');
  ok(/Bitacora\.alDia\(\)/.test(calentador), 'es un paso del Calentador');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
