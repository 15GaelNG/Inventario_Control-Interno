/**
 * Integración real entre LineasCaptura.gs y LineasFirmaRemota.gs (las dos juntas, no una de mentira):
 * una responsiva con UN responsable adicional que firma en el formulario y OTRO que se difiere por
 * liga. Cuando el último pendiente (el de la liga) se completa, LineasFirmaRemota.completarFirma llama
 * a LineasCaptura.generarPdf de verdad -- el bug reportado (usuario, 6-nov) es que, en ese caso mixto,
 * la firma del que firmó EN EL FORMULARIO (no por liga) sale en blanco en el PDF final.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function entorno() {
  const hechos = { generados: [] };
  const tablas = { RESP: [], APP_EVID: [] };
  const contador = { RESP: 1, APP_EVID: 1 };
  const nuevaFilaEn = (tabla, datos) => {
    contador[tabla] += 1;
    const f = Object.assign({ _fila: contador[tabla] }, datos);
    tablas[tabla].push(f);
    return f;
  };
  const driveFiles = new Map();
  let driveSeq = 1;
  const archivoFalso = (id) => {
    const a = driveFiles.get(id);
    if (!a) throw new Error('Archivo no encontrado: ' + id);
    return { getId: () => id, getBlob: () => ({ getBytes: () => a.bytes }), setTrashed: () => driveFiles.delete(id) };
  };
  const FILA_EQUIPO = { 'NUMERO TELEFONO': '5555555555', 'ESTATUS EQUIPO': 'USO' };

  const ctx = vm.createContext({
    console,
    Utilities: {
      base64Decode: (b) => Array.from(Buffer.from(b, 'base64')),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
      formatDate: () => '06 11',
      getUuid: (() => { let n = 1; return () => 'tok-' + (n++); })(),
    },
    CacheService: { getScriptCache: () => { const cache = {}; return { get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }; } },
    DriveApp: { getFileById: (id) => archivoFalso(id), getFolderById: () => ({ getName: () => 'RESP 06 11' }) },
    DriveUtils: {
      carpetaEnRaiz: (nombre) => ({ nombre: nombre }),
      crearArchivo: (carpeta, blob) => {
        const id = 'drv-' + (driveSeq++);
        driveFiles.set(id, { bytes: Buffer.from(blob.bytes), mimeType: blob.mime });
        return { getId: () => id };
      },
      aPapelera: (archivoObj) => archivoObj.setTrashed(),
    },
    Config: { urlFirmaPublica: () => 'https://firma.publica/exec' },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://dev.exec' }) },
    Session: { getActiveUser: () => ({ getEmail: () => 'quien-firma@x.com' }) },
    LineasRepo: {
      TAB: { INSP: 'INSP', RESP: 'RESP', APP_EVID: 'APP_EVID' },
      COL_LINEA_ENTREGADA: 'ID LINEA ENTREGADA',
      evidenciaDesdeFila: (row) => ({ origen: row.ORIGEN, carpetaId: row.CARPETA_ID, pdfs: JSON.parse(row.PDFS_JSON || '[]'), fecha: row.FECHA }),
      revisarPdfsLigados: () => {},
      registrarMovimiento: () => {},
      indiceColaboradores: () => ({ columnas: ['nombre', 'correo'], filas: [] }),
      leerRegistroObligatorio: () => FILA_EQUIPO,
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
      carpetaEvidenciaNuco: () => ({ carpetaId: 'CARNUCO', ruta: 'NUCOS/0669/CARTA RESPONSIVA', nombrePdf: 'RESP 0669 06 11.pdf' }),
    },
    LineasPdf: {
      PLANTILLAS: { RESPONSIVA_CELULAR: 'R', INSPECCION_CELULAR: 'I' },
      plantillaInspeccion: () => 'I',
      generarPdfDesdePlantilla: (plantilla, registro, imagenes, carpeta, nombre) => {
        hechos.generados.push({ plantilla, imagenes, nombre });
        return { id: 'PDFNUEVO', nombre, url: 'url-nuevo', avisos: [] };
      },
    },
    LineasChecklist: { cumple: (condicion) => condicion !== 'NUNCA' },
    LineasAcciones: { PERSONA_DE_RESPONSIVA: [] },
    LineasRegistros: {
      CUENTA_ADICIONALES: 'CUENTA_ADICIONALES_RESP',
      camposAdicionales: (campoFn, persona) => ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'].reduce((a, n) => a.concat([
        campoFn('NO EMPLEADO ' + n + ' RESPONSABLE', 'No. empleado', 'texto', { valor: persona('NO EMPLEADO ' + n + ' RESPONSABLE') }),
        campoFn('NOMBRE ' + n + ' RESPONSABLE', 'Nombre', 'texto', { valor: persona('NOMBRE ' + n + ' RESPONSABLE') }),
      ]), []),
    },
    LineasIdentificaciones: { revisar: () => [], fechaDe: (s) => new Date(s || Date.now()), registrar: () => {}, descartar: () => {} },
    LineasDatos: {
      conCandado: (fn) => fn(),
      buscarFilasPorId: (tabla, id) => tablas[tabla].filter((f) => f.ID === id).map((f) => f._fila),
      buscarFilasVarios: (tabla, columna, valores) => tablas[tabla].filter((f) => valores.indexOf(f[columna]) >= 0).map((f) => f._fila),
      leerFilas: (peticiones) => peticiones.map((p) => p.filas.map((n) => tablas[p.tabla].find((f) => f._fila === n))),
      leerTabla: (tabla) => tablas[tabla],
      actualizarFila: (tabla, numFilaObjetivo, cambios) => {
        const f = tablas[tabla].find((x) => x._fila === numFilaObjetivo);
        if (!f) throw new Error('fila no encontrada: ' + numFilaObjetivo);
        Object.assign(f, cambios);
      },
      agregarFilas: (tabla, nuevas) => nuevas.forEach((f) => nuevaFilaEn(tabla, f)),
      asegurarColumnas: () => {},
      idsDeFila: (f) => [f.ID],
      existeTabla: () => true,
      nuevoId: () => 'RES-99',
    },
  });
  vm.runInContext(read('src/utils/Cronometro.gs') + '\n' + read('src/services/lineas/LineasPatronPng.gs') + '\n' + read('src/services/lineas/LineasCaptura.gs') +
    '\nthis.C = LineasCaptura;', ctx);
  vm.runInContext(read('src/services/lineas/LineasFirmaRemota.gs') + '\nthis.F = LineasFirmaRemota;', ctx);
  return { C: ctx.C, F: ctx.F, hechos: hechos, tablas: tablas };
}

const USUARIO = { correo: 'a@b.mx', nombre: 'JORGE' };

test('mixto: un adicional firma en el formulario y otro por liga -- al completar la liga, NINGUNA de las dos se pierde', () => {
  const { C, F, hechos, tablas } = entorno();
  const datos = {
    equipoId: 'EQU-1', id: 'RES-99',
    valores: {
      'No EMPLEADO': 'E1', 'RESPONSABLE': 'ANDREA LOPEZ CAMPOS', 'PUESTO': 'P', 'DEPARTAMENTO': 'D', 'AREA': 'A',
      'SEDE': 'S', 'OFICINA / DESARROLLO': 'O', 'COLOR': 'NEGRO', 'IDENTIFICACION': 'INE',
      'FECHA RESPONSIVA': '2026-11-06T10:00', 'COMENTARIO': 'PRUEBA MIXTA EN FORMULARIO Y A DISTANCIA',
      'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA CHOWEL', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'E2',
      'NOMBRE TERCER RESPONSABLE': 'EMMANUEL CHAVEZ MARTINEZ', 'NO EMPLEADO TERCER RESPONSABLE': 'E3',
    },
    firmaCiBase64: Buffer.from('firma-ci').toString('base64'),
    firmaResponsableBase64: Buffer.from('firma-principal').toString('base64'),
    // Solo SEGUNDO firmó en el formulario (adicionalesAFirmar del cliente excluye a los diferidos);
    // TERCER se difirió, así que su lienzo nunca se mandó
    firmasAdicionales: { SEGUNDO: Buffer.from('firma-ayrton').toString('base64') },
    diferir: ['TERCER'], identificaciones: [],
  };
  const r = C.guardarResponsiva(datos, USUARIO, true, null);
  assert.equal(r.pendiente, true);
  assert.ok(r.ligas.TERCER, 'se generó la liga de TERCER');
  assert.equal(hechos.generados.length, 0, 'todavía no se genera el PDF: falta que TERCER firme');

  const filaResp = tablas.RESP[0];
  assert.ok(filaResp['FIRMA SEGUNDO RESPONSABLE TEMP'], 'la firma de SEGUNDO (en el formulario) ya quedó guardada en su TEMP');
  const tokenTercer = filaResp['TOKEN FIRMA TERCER'];
  assert.ok(tokenTercer);

  const resultado = F.completarFirma(F.DOCUMENTOS.RESPONSIVA, tokenTercer, Buffer.from('firma-emmanuel').toString('base64'));
  assert.equal(resultado.pendiente, false, 'TERCER era el último pendiente: el documento se cierra');
  assert.equal(hechos.generados.length, 1);
  const img = hechos.generados[0].imagenes;
  assert.ok(img['FIRMA RESPONSABLE 2'], 'SEGUNDO (firmó en el formulario) no debe salir en blanco');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 2'].bytes).toString('utf8'), 'firma-ayrton');
  assert.ok(img['FIRMA RESPONSABLE 3'], 'TERCER (firmó por liga) tampoco debe salir en blanco');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 3'].bytes).toString('utf8'), 'firma-emmanuel');
  // Usuario, 9-nov: la Inspección del 6-nov llama a la casilla del principal <<FIRMA RESPONSABLE 1>> y la Responsiva
  // <<FIRMA RESPONSABLE>>; la firma del principal va con los dos nombres o en la Inspección no entraba
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE'].bytes).toString('utf8'), 'firma-principal');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 1'].bytes).toString('utf8'), 'firma-principal');
});

// El usuario dijo "los que firmaron a distancia" (plural): varios diferidos, completados uno por uno, no uno solo.
test('mixto: SEGUNDO firma en el formulario; TERCER y CUARTO se difieren y completan uno por uno (no juntos)', () => {
  const { C, F, hechos, tablas } = entorno();
  const datos = {
    equipoId: 'EQU-1', id: 'RES-99',
    valores: {
      'No EMPLEADO': 'E1', 'RESPONSABLE': 'ANDREA LOPEZ CAMPOS', 'PUESTO': 'P', 'DEPARTAMENTO': 'D', 'AREA': 'A',
      'SEDE': 'S', 'OFICINA / DESARROLLO': 'O', 'COLOR': 'NEGRO', 'IDENTIFICACION': 'INE',
      'FECHA RESPONSIVA': '2026-11-06T10:00', 'COMENTARIO': 'PRUEBA MIXTA VARIOS A DISTANCIA',
      'NOMBRE SEGUNDO RESPONSABLE': 'AYRTON SEPULVEDA CHOWEL', 'NO EMPLEADO SEGUNDO RESPONSABLE': 'E2',
      'NOMBRE TERCER RESPONSABLE': 'EMMANUEL CHAVEZ MARTINEZ', 'NO EMPLEADO TERCER RESPONSABLE': 'E3',
      'NOMBRE CUARTO RESPONSABLE': 'DAFNE DONIS GARCIA', 'NO EMPLEADO CUARTO RESPONSABLE': 'E4',
    },
    firmaCiBase64: Buffer.from('firma-ci').toString('base64'),
    firmaResponsableBase64: Buffer.from('firma-principal').toString('base64'),
    firmasAdicionales: { SEGUNDO: Buffer.from('firma-ayrton').toString('base64') },
    diferir: ['TERCER', 'CUARTO'], identificaciones: [],
  };
  const r = C.guardarResponsiva(datos, USUARIO, true, null);
  assert.equal(r.pendiente, true);
  assert.ok(r.ligas.TERCER && r.ligas.CUARTO);

  const filaResp = tablas.RESP[0];
  const tokenTercer = filaResp['TOKEN FIRMA TERCER'];
  const tokenCuarto = filaResp['TOKEN FIRMA CUARTO'];

  // TERCER firma primero: NO es el último, solo se guarda (pendiente)
  const r1 = F.completarFirma(F.DOCUMENTOS.RESPONSIVA, tokenTercer, Buffer.from('firma-emmanuel').toString('base64'));
  assert.equal(r1.pendiente, true);
  assert.equal(hechos.generados.length, 0, 'todavía falta CUARTO: no se genera el PDF');

  // CUARTO firma al final: ahora sí se genera el PDF, con los TRES (SEGUNDO del formulario, TERCER y CUARTO por liga)
  const r2 = F.completarFirma(F.DOCUMENTOS.RESPONSIVA, tokenCuarto, Buffer.from('firma-dafne').toString('base64'));
  assert.equal(r2.pendiente, false);
  assert.equal(hechos.generados.length, 1);
  const img = hechos.generados[0].imagenes;
  assert.ok(img['FIRMA RESPONSABLE 2'], 'SEGUNDO (formulario) no debe salir en blanco');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 2'].bytes).toString('utf8'), 'firma-ayrton');
  assert.ok(img['FIRMA RESPONSABLE 3'], 'TERCER (liga, firmó primero) no debe salir en blanco');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 3'].bytes).toString('utf8'), 'firma-emmanuel');
  assert.ok(img['FIRMA RESPONSABLE 4'], 'CUARTO (liga, firmó al final) no debe salir en blanco');
  assert.equal(Buffer.from(img['FIRMA RESPONSABLE 4'].bytes).toString('utf8'), 'firma-dafne');
});
