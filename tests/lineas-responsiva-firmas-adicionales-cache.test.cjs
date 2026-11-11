/**
 * Bug real (usuario, 6-nov, NUCO 0669): guardarResponsiva armaba firmasAdicionales desde la pantalla
 * (lineas-telefonicas-captura.html) pero el servidor solo lo usaba dentro del bloque de "algo se
 * difiere" (diferir.length > 0). Sin nada diferido -- el caso normal, todos firman en el sistema --
 * firmasCache_ solo guardaba responsable/ci/patron: las firmas de los responsables adicionales se
 * perdían en silencio y el PDF salía con esas casillas en blanco, sin avisar nada.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function entorno() {
  const hechos = { generados: [], ligados: [] };
  const ev = { origen: 'SISTEMA', carpetaId: 'CAR', pdfs: [], fecha: new Date('2026-11-06T12:00:00') };
  const cache = {};
  const FILA_RESP = {
    ID: 'RES-99', 'ID LINEA': 'EQU-1', NUCO: 669, RESPONSABLE: 'ANDREA LOPEZ CAMPOS', 'NOMBRE CI': 'JORGE',
    'FIRMA CI': '', CONTRASEÑA: '', 'PIN EQUIPO': '', 'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA CHOWEL',
  };
  const ctx = vm.createContext({
    console,
    Utilities: {
      base64Decode: (b) => Array.from(Buffer.from(b, 'base64')),
      newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
      formatDate: () => '06 11',
      getUuid: () => 'uuid-x',
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    DriveUtils: require('./drive-utils-real')(),
    DriveApp: { getFolderById: () => ({ getName: () => 'RESP 06 11' }), getFileById: () => ({}) },
    LineasRepo: {
      TAB: { INSP: 'INSP', RESP: 'RESP', APP_EVID: 'APP_EVID' },
      COL_LINEA_ENTREGADA: 'ID LINEA ENTREGADA',
      evidenciaDesdeFila: () => ev,
      revisarPdfsLigados: () => {},
      registrarMovimiento: () => {},
      indiceColaboradores: () => ({ columnas: ['nombre', 'correo'], filas: [] }),
      leerRegistroObligatorio: () => FILA_RESP,
      convertirRegistro: () => ({ equipo: true, linea: false, id: 'EQU-1', nuco: 669 }),
      guardarCambiosRegistro: () => ({ refs: [], idsCambios: [], campos: [] }),
      asegurarPestanaApp: () => {},
      catalogos: () => ({ puestos: [], departamentos: [], areas: [], sedes: [], oficinas: [], jefes: [], directores: [], colores: [] }),
      CATALOGO: { accesorios: [] },
      refrescarIndice: (ids) => ids,
    },
    LineasUtil: {
      col: (f, c) => (c in f ? f[c] : null),
      patronVigente: (pin, p) => (!pin || /^PATR[OÓ]N$/i.test(pin) ? (p || '') : ''),
      nucoVisible: (n) => n || null,
      nuco4: (n) => String(n).padStart(4, '0'),
      exigirPinEquipo: () => {},
      bloqueoSinPatron: () => false,
      sinCargador: (texto) => texto,
    },
    LineasArchivos: {
      blob: () => null, enNucos: () => true, enLineas: () => false, olvidarNuco: () => {},
      reemplazarPdf: () => ({ id: 'NUEVO', name: 'RESP 0669 06 11.pdf' }),
    },
    LineasPdf: {
      PLANTILLAS: { RESPONSIVA_CELULAR: 'R', INSPECCION_CELULAR: 'I' },
      plantillaInspeccion: () => 'I',
      generarPdfDesdePlantilla: (plantilla, registro, imagenes, carpeta, nombre) => {
        hechos.generados.push({ plantilla, imagenes, nombre });
        return { id: 'PDFNUEVO', nombre, url: 'url-nuevo', avisos: [] };
      },
      // El camino de DEV y producción desde el 10-nov (PdfHtml encendido): las mismas imágenes van a la plantilla HTML
      generarPdfHtml: (documento, datos, imagenes, carpeta, nombre) => {
        hechos.generados.push({ plantilla: documento, datos, imagenes, nombre });
        return { id: 'PDFNUEVO', nombre, url: 'url-nuevo', avisos: [] };
      },
    },
    PdfHtml: { encendido: () => true },
    LineasChecklist: { cumple: (condicion) => condicion !== 'NUNCA' },
    LineasFirmaRemota: { ROLES_DIFERIBLES: ['PRINCIPAL', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'] },
    LineasAcciones: { PERSONA_DE_RESPONSIVA: [] },
    LineasRegistros: {
      CUENTA_ADICIONALES: 'CUENTA_ADICIONALES_RESP',
      camposAdicionales: (campoFn, persona) => ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat([
        campoFn('NO EMPLEADO ' + n + ' RESPONSABLE', 'No. empleado', 'texto', { valor: persona('NO EMPLEADO ' + n + ' RESPONSABLE') }),
        campoFn('NOMBRE ' + n + ' RESPONSABLE', 'Nombre', 'texto', { valor: persona('NOMBRE ' + n + ' RESPONSABLE') }),
      ]), []),
    },
    LineasIdentificaciones: {
      revisar: () => [], fechaDe: (s) => new Date(s || Date.now()), registrar: () => {}, descartar: () => {},
    },
    LineasDatos: {
      buscarFilasPorId: () => [2], leerFilas: () => [[FILA_RESP]], idsDeFila: () => [FILA_RESP.ID], existeTabla: () => true,
      buscarFilasVarios: () => [7], conCandado: (f) => f(), actualizarFila: (...a) => hechos.ligados.push(a),
      agregarFilas: () => {}, asegurarColumnas: () => {}, nuevoId: () => 'RES-99',
    },
  });
  vm.runInContext(read('src/utils/Cronometro.gs') + '\n' + read('src/services/lineas/LineasPatronPng.gs') + '\n' + read('src/services/lineas/LineasCaptura.gs') + '\nthis.C = LineasCaptura;', ctx);
  return { C: ctx.C, hechos };
}

const USUARIO = { correo: 'a@b.mx', nombre: 'JORGE' };

test('guardarResponsiva sin nada diferido: la firma de un responsable adicional (firmasAdicionales) sí llega al PDF', () => {
  const { C, hechos } = entorno();
  const datos = {
    equipoId: 'EQU-1', id: 'RES-99',
    valores: {
      'No EMPLEADO': 'E1', 'RESPONSABLE': 'ANDREA LOPEZ CAMPOS', 'PUESTO': 'P', 'DEPARTAMENTO': 'D', 'AREA': 'A',
      'SEDE': 'S', 'OFICINA / DESARROLLO': 'O', 'COLOR': 'NEGRO', 'IDENTIFICACION': 'INE',
      'FECHA RESPONSIVA': '2026-11-06T10:00', 'COMENTARIO': 'PRUEBA DE CACHE DE FIRMAS ADICIONALES',
      'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA CHOWEL', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'E2',
    },
    firmaCiBase64: Buffer.from('firma-ci').toString('base64'),
    firmaResponsableBase64: Buffer.from('firma-principal').toString('base64'),
    firmasAdicionales: { SEGUNDO: Buffer.from('firma-ayrton').toString('base64') },
    diferir: [], identificaciones: [],
  };
  const r = C.guardarResponsiva(datos, USUARIO, true, null);
  assert.equal(r.pdfPendiente, true);
  assert.equal(r.pendiente, undefined, 'nada se difirió: no hay ligas que esperar');

  // El camino REAL del cliente (refrescarDespuesDeCaptura, lineas-telefonicas-captura.html): después de guardar,
  // pide el PDF con sesionCaptura.pdfFirmas = { responsable, ci, patron } -- SIN 'segundo' (ese objeto nunca lo
  // tuvo, solo se armó con lo del principal/CI/patrón). Si firmasCache_ no conservara lo que ya se cacheó al
  // guardar, este segundo llamado lo borraría otra vez.
  const pdf = C.generarPdf('RESPONSIVA', 'RES-99', false, USUARIO,
    { responsable: datos.firmaResponsableBase64, ci: datos.firmaCiBase64, patron: null });
  assert.equal(pdf.faltanFirmas, undefined);
  const img = hechos.generados[0].imagenes;
  assert.equal(img['FIRMA RESPONSABLE'].nombre, 'firma-responsable.png'); // 9-nov: ya no va más chica con adicionales
  assert.ok(img['FIRMA RESPONSABLE 2'], 'la firma de Ayrton (SEGUNDO) no debe salir en blanco');
  assert.equal(img['FIRMA RESPONSABLE 2'].nombre, 'firma-segundo.png');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 2'].bytes).toString('utf8'), 'firma-ayrton');
});
