// Firma a distancia de Arqueos (Responsable y Asistente, 14-oct-2026): a diferencia de
// Responsiva/Adherente Vehicular, aquí "pendiente" se deriva nada más mirando si FIRMA
// RESPONSABLE/FIRMA ASISTENTE están vacías (sin ESTADO FIRMA ni columnas …TEMP -- las firmas ya
// se suben a Drive al dibujarlas y la celda solo guarda la URL). Una sola función
// (generarLigaArqueo) sirve tanto para mandar la primera liga de un arqueo que ya existe como
// para regenerar una que venció o se firmó mal. Solo se prueba lo nuevo de este archivo -- no se
// vuelve a probar calcularCampos_ ni el resto de la alta/edición normal de un arqueo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function filaBase(extra) {
  return Object.assign({
    'ID ARQUEO': 'ARQ-1', 'ID CCH': '1', RESPONSABLE: 'JUAN PEREZ', 'NOMBRE ASISTENTE': 'ANA LOPEZ',
    'FECHA INICIO': new Date('2026-10-01T12:00:00Z'), 'TOTAL GENERAL': 1000, DIFERENCIA: 0,
    'FIRMA RESPONSABLE': '', 'FIRMA ASISTENTE': '', 'FIRMA ESPECIALISTA': 'https://drive.google.com/file/d/CIFILE/view',
    'TOKEN FIRMA RESPONSABLE': '', 'TOKEN FIRMA RESPONSABLE EXPIRA': '', 'FIRMADO POR RESPONSABLE': '',
    'TOKEN FIRMA ASISTENTE': '', 'TOKEN FIRMA ASISTENTE EXPIRA': '', 'FIRMADO POR ASISTENTE': '',
  }, extra || {});
}

function crearContexto(filas) {
  const llamadas = {
    update: [], subidas: [], trasheados: [], docAbiertos: 0, carpetaCreateFile: [],
  };
  let uuids = 0;
  const hoja = (filas || []).map((f) => Object.assign({}, f));
  const contexto = vm.createContext({
    Config: {
      SPREADSHEET_IDS: { VEHICULOS: () => 'SS' },
      urlFirmaPublica: () => '',
    },
    Permisos: {
      puedeLeer: (token, modulo) => { llamadas.puedeLeer = modulo; },
      puedeEditar: (token, modulo) => { llamadas.puedeEditar = modulo; return { nombre: 'TESTER' }; },
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/exec' }) },
    Session: {
      getActiveUser: () => ({ getEmail: () => 'firmante@ciudadmaderas.com' }),
      getScriptTimeZone: () => 'America/Mexico_City',
      getEffectiveUser: () => ({ getEmail: () => 'app@ciudadmaderas.com' }),
    },
    Utilities: {
      getUuid: () => 'token-' + (++uuids),
      formatDate: () => '01/10/2026',
    },
    DriveApp: {
      // Un solo fake genérico: sirve para abrir la plantilla (makeCopy), para exportar/borrar la
      // copia después (getAs/setTrashed) y para leer la imagen de una firma (getBlob, la usa
      // insertarFirma_) -- no hace falta distinguir el id salvo cuando una prueba lo sobreescribe
      // a propósito (ver "no se pudo leer una firma").
      getFileById: (id) => ({
        getId: () => id,
        makeCopy: (nombre) => ({ getId: () => 'copia-' + id, getName: () => nombre }),
        getAs: () => ({ bytes: 'pdf-bytes', mimeType: 'application/pdf' }),
        setTrashed: (v) => { llamadas.trasheados.push({ id, v }); },
        getBlob: () => ({ getBytes: () => 'bytes', getContentType: () => 'image/png' }),
      }),
    },
    DriveUtils: {
      marcarAutor: (archivo) => archivo,
      compartirLoMasAmplioPosible: () => true,
      carpetaEnRaiz: (nombre) => ({ getId: () => nombre, getName: () => nombre }),
      carpetaDelAnio: () => ({
        getName: () => 'ARQUEOS/2026',
        createFile: (blob) => {
          llamadas.carpetaCreateFile.push(blob);
          return { setName: (nombre) => ({ getUrl: () => 'https://drive/' + nombre, getName: () => nombre }) };
        },
      }),
    },
    DocumentApp: {
      openById: () => {
        llamadas.docAbiertos++;
        const parrafo = { clear: () => {}, appendInlineImage: () => ({ getWidth: () => 100, getHeight: () => 40, setWidth: () => {}, setHeight: () => {} }) };
        return {
          getBody: () => ({
            // "Encuentra" cualquier marcador, para que insertarFirma_ sí intente leer el
            // archivo de Drive (DriveApp.getFileById().getBlob()) -- el caso real que importa
            // probar (una firma que ya no se puede leer) solo se dispara si se llega ahí.
            findText: () => ({ getElement: () => ({ getParent: () => ({ asParagraph: () => parrafo }) }) }),
            replaceText: () => {},       // reemplazarMarcador_
          }),
          saveAndClose: () => {},
        };
      },
    },
    SheetUtils: {
      getSheet: () => ({ getName: () => 'ARQUEOS' }),
      findById: (ssId, nombreHoja, id) => {
        const fila = hoja.find((f) => f['ID ARQUEO'] === id);
        return fila ? { data: fila, rowIndex: 2 } : null;
      },
      update: (ssId, nombreHoja, id, cambios) => {
        llamadas.update.push({ id, cambios });
        const fila = hoja.find((f) => f['ID ARQUEO'] === id);
        if (fila) Object.assign(fila, cambios);
      },
      getAll: () => hoja,
    },
    HojaServicio: {
      // Las 3 firmas de Arqueos ya se suben a Drive al dibujarlas (subirFirma/subirEn_): la
      // firma remota reusa el mismo helper, directo (sin pasar por Permisos: no hay sesión).
      subirArchivo: (carpetaId, de, nombreArchivo) => {
        llamadas.subidas.push({ carpetaId, nombreArchivo });
        return { url: 'https://drive.google.com/file/d/FIRMA-' + (++uuids) + '/view' };
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '../src/services/ArqueosService.gs'), 'utf8') +
    '\nthis.Servicio = ArqueosService;',
    contexto
  );
  return { contexto, llamadas, hoja };
}

const FIRMA_IMG = { base64: 'abc', mimeType: 'image/png' };

// ---------- generarLigaArqueo ----------

test('generarLigaArqueo: manda la primera liga de un arqueo existente sin firma', () => {
  const { contexto, llamadas, hoja } = crearContexto([filaBase()]);
  const liga = contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'responsable');
  assert.match(liga, /tipo=arqueo/);
  assert.doesNotMatch(liga, /quien=asistente/);
  assert.match(liga, /token=token-1/);
  assert.equal(llamadas.puedeEditar, 'arqueos');
  const fila = hoja[0];
  assert.equal(fila['TOKEN FIRMA RESPONSABLE'], 'token-1');
  // El Date se crea DENTRO del vm (otro realm): instanceof Date del host no aplica.
  assert.equal(Object.prototype.toString.call(fila['TOKEN FIRMA RESPONSABLE EXPIRA']), '[object Date]');
  assert.equal(fila['FIRMA RESPONSABLE'], '');
  assert.equal(fila['FIRMADO POR RESPONSABLE'], '');
});

test('generarLigaArqueo: la liga del asistente lleva &quien=asistente y toca sus propias columnas', () => {
  const { contexto, hoja } = crearContexto([filaBase()]);
  const liga = contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'asistente');
  assert.match(liga, /quien=asistente/);
  const fila = hoja[0];
  assert.equal(fila['TOKEN FIRMA ASISTENTE'], 'token-1');
  // No toca nada del Responsable
  assert.equal(fila['TOKEN FIRMA RESPONSABLE'], '');
});

test('generarLigaArqueo: regenera una liga ya mandada (sin firma todavía) sin tocar Drive', () => {
  const { contexto, llamadas, hoja } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'viejo-token', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date('2026-10-02'),
  })]);
  const liga = contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'responsable');
  assert.match(liga, /token=token-1/);
  assert.equal(hoja[0]['TOKEN FIRMA RESPONSABLE'], 'token-1');
  assert.deepEqual(llamadas.trasheados, []);
});

test('generarLigaArqueo: descarta en Drive una firma anterior ya completada por liga (mal firmada)', () => {
  const { contexto, llamadas, hoja } = crearContexto([filaBase({
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/VIEJAFIRMA/view',
    'TOKEN FIRMA RESPONSABLE': '', 'FIRMADO POR RESPONSABLE': 'responsable@ciudadmaderas.com',
  })]);
  contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'responsable');
  assert.deepEqual(llamadas.trasheados, [{ id: 'VIEJAFIRMA', v: true }]);
  assert.equal(hoja[0]['FIRMA RESPONSABLE'], '');
  assert.equal(hoja[0]['FIRMADO POR RESPONSABLE'], '');
});

test('generarLigaArqueo: truena si esa parte firmó presencial (firma sin token ni firmado por)', () => {
  const { contexto } = crearContexto([filaBase({
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/PRESENCIAL/view',
  })]);
  assert.throws(
    () => contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'responsable'),
    /firmó presencial, no a distancia/
  );
});

test('generarLigaArqueo: truena si ya se completaron las dos firmas', () => {
  const { contexto } = crearContexto([filaBase({
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/R1/view',
    'FIRMA ASISTENTE': 'https://drive.google.com/file/d/A1/view',
  })]);
  assert.throws(
    () => contexto.Servicio.generarLigaArqueo('tok', 'ARQ-1', 'responsable'),
    /Ya se completaron las dos firmas/
  );
});

test('generarLigaArqueo: truena si no existe el arqueo', () => {
  const { contexto } = crearContexto([]);
  assert.throws(() => contexto.Servicio.generarLigaArqueo('tok', 'ARQ-X', 'responsable'), /No se encontró el arqueo/);
});

// ---------- copiarLigaArqueo ----------

test('copiarLigaArqueo: arma la misma liga sin tocar la hoja', () => {
  const { contexto, llamadas } = crearContexto([filaBase()]);
  const liga = contexto.Servicio.copiarLigaArqueo('tok', 'token-existente', 'asistente');
  assert.equal(liga, 'https://script.google.com/exec?firmar=1&tipo=arqueo&quien=asistente&token=token-existente');
  assert.equal(llamadas.puedeLeer, 'arqueos');
  assert.deepEqual(llamadas.update, []);
});

// ---------- obtenerPendienteArqueoPorToken ----------

test('obtenerPendienteArqueoPorToken: token válido y vigente regresa los detalles del arqueo', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  const r = contexto.Servicio.obtenerPendienteArqueoPorToken('tok-resp', 'responsable');
  assert.equal(r.vigente, true);
  assert.equal(r.documento, 'Arqueo ARQ-1');
  assert.equal(r.nombre, 'JUAN PEREZ');
  assert.ok(Array.isArray(r.detalles) && r.detalles.length > 0);
  assert.ok(r.detalles.some((d) => d.etiqueta === 'Caja chica' && d.valor === '1'));
});

test('obtenerPendienteArqueoPorToken: del asistente trae su propio nombre', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA ASISTENTE': 'tok-asis', 'TOKEN FIRMA ASISTENTE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  const r = contexto.Servicio.obtenerPendienteArqueoPorToken('tok-asis', 'asistente');
  assert.equal(r.vigente, true);
  assert.equal(r.nombre, 'ANA LOPEZ');
});

test('obtenerPendienteArqueoPorToken: token que no existe', () => {
  const { contexto } = crearContexto([filaBase()]);
  const r = contexto.Servicio.obtenerPendienteArqueoPorToken('no-existe', 'responsable');
  assert.equal(r.vigente, false);
  assert.equal(r.motivo, 'no-existe');
});

test('obtenerPendienteArqueoPorToken: ya firmado (la firma ya no está vacía)', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/X/view',
  })]);
  const r = contexto.Servicio.obtenerPendienteArqueoPorToken('tok-resp', 'responsable');
  assert.equal(r.vigente, false);
  assert.equal(r.motivo, 'ya-firmado');
});

test('obtenerPendienteArqueoPorToken: liga vencida', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date(Date.now() - 1000),
  })]);
  const r = contexto.Servicio.obtenerPendienteArqueoPorToken('tok-resp', 'responsable');
  assert.equal(r.vigente, false);
  assert.equal(r.motivo, 'vencido');
});

// ---------- completarFirmaArqueo ----------

test('completarFirmaArqueo: guarda la firma y espera si falta la otra (sin generar PDF)', () => {
  const { contexto, llamadas, hoja } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  const r = contexto.Servicio.completarFirmaArqueo('tok-resp', 'responsable', FIRMA_IMG);
  assert.equal(r.PDF, null);
  assert.match(r.aviso, /Falta la del Asistente/);
  assert.equal(llamadas.docAbiertos, 0);
  const fila = hoja[0];
  assert.match(fila['FIRMA RESPONSABLE'], /^https:\/\/drive\.google\.com/);
  assert.equal(fila['TOKEN FIRMA RESPONSABLE'], '');
  assert.equal(fila['TOKEN FIRMA RESPONSABLE EXPIRA'], '');
  assert.equal(fila['FIRMADO POR RESPONSABLE'], 'firmante@ciudadmaderas.com');
  assert.equal(fila['ESTADO PDF'], undefined);
});

test('completarFirmaArqueo: cierra y genera el PDF cuando ya no falta ninguna firma', () => {
  const { contexto, hoja } = crearContexto([filaBase({
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/R1/view', 'FIRMADO POR RESPONSABLE': 'responsable@ciudadmaderas.com',
    'TOKEN FIRMA ASISTENTE': 'tok-asis', 'TOKEN FIRMA ASISTENTE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  const r = contexto.Servicio.completarFirmaArqueo('tok-asis', 'asistente', FIRMA_IMG);
  assert.ok(r.PDF, 'debe regresar la URL del PDF generado');
  assert.equal(r.aviso, '');
  const fila = hoja[0];
  assert.equal(fila['ESTADO PDF'], 'Generado');
  assert.equal(fila['FORMATO ARQUEO'], r.PDF);
  assert.equal(fila['FIRMADO POR ASISTENTE'], 'firmante@ciudadmaderas.com');
  assert.equal(fila['TOKEN FIRMA ASISTENTE'], '');
});

test('completarFirmaArqueo: si la firma del Responsable (ya guardada) no se puede leer al cerrar, NO se marca Generado ni se pierde la firma del Asistente que sí se acaba de completar', () => {
  const { contexto, hoja } = crearContexto([filaBase({
    'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/R1/view', 'FIRMADO POR RESPONSABLE': 'responsable@ciudadmaderas.com',
    'TOKEN FIRMA ASISTENTE': 'tok-asis', 'TOKEN FIRMA ASISTENTE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  // El archivo de la firma del Responsable (R1) ya no se puede leer -- el resto de Drive
  // (plantilla, carpeta del año, la firma nueva que se está subiendo) sigue funcionando normal.
  const original = contexto.DriveApp.getFileById;
  contexto.DriveApp.getFileById = (id) => {
    if (id === 'R1') throw new Error('Archivo no encontrado o sin permiso');
    return original(id);
  };
  const r = contexto.Servicio.completarFirmaArqueo('tok-asis', 'asistente', FIRMA_IMG);
  assert.equal(r.PDF, null);
  assert.match(r.aviso, /no se pudo generar el documento final/i);
  const fila = hoja[0];
  // La firma del Asistente, recién completada, NO se pierde -- solo el cierre/PDF se detiene.
  assert.match(fila['FIRMA ASISTENTE'], /^https:\/\/drive\.google\.com/);
  assert.equal(fila['TOKEN FIRMA ASISTENTE'], '');
  assert.equal(fila['FIRMADO POR ASISTENTE'], 'firmante@ciudadmaderas.com');
  assert.match(fila['ESTADO PDF'], /^Error al generar:/);
  assert.notEqual(fila['ESTADO PDF'], 'Generado');
  assert.equal(fila['FORMATO ARQUEO'], undefined);
});

test('completarFirmaArqueo: token inválido', () => {
  const { contexto } = crearContexto([filaBase()]);
  assert.throws(() => contexto.Servicio.completarFirmaArqueo('no-existe', 'responsable', FIRMA_IMG), /liga no es válida/);
});

test('completarFirmaArqueo: liga ya usada (la firma ya no está vacía)', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'FIRMA RESPONSABLE': 'https://drive.google.com/file/d/X/view',
  })]);
  assert.throws(() => contexto.Servicio.completarFirmaArqueo('tok-resp', 'responsable', FIRMA_IMG), /liga ya se usó/);
});

test('completarFirmaArqueo: liga vencida', () => {
  const { contexto } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date(Date.now() - 1000),
  })]);
  assert.throws(() => contexto.Servicio.completarFirmaArqueo('tok-resp', 'responsable', FIRMA_IMG), /liga ya venció/);
});

test('completarFirmaArqueo: sin la imagen de la firma truena antes de tocar la hoja', () => {
  const { contexto, llamadas } = crearContexto([filaBase({
    'TOKEN FIRMA RESPONSABLE': 'tok-resp', 'TOKEN FIRMA RESPONSABLE EXPIRA': new Date(Date.now() + 86400000),
  })]);
  assert.throws(() => contexto.Servicio.completarFirmaArqueo('tok-resp', 'responsable', null), /Falta la firma/);
  assert.deepEqual(llamadas.update, []);
});
