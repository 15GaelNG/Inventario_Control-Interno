/**
 * ExpedienteNuco.gs — dónde se guarda cada documento de un vehículo: en la carpeta de su NUCO, dentro de
 * NUCOS VEHICULOS, con la estructura que pidió el área (junta del 8-oct-2026, docs/nucos-expediente.md):
 *
 *   <NUCO>/1.-DOCUMENTACIÓN/
 *      1.-FACTURA  2.-SEGURO  3.-ALTA DE PLACAS  4.-TARJETA DE CIRCULACIÓN  5.-RESPONSIVA  6.-TENENCIA
 *   <NUCO>/2.- SERVICIOS   3.- VERIFICACIONES   4.- INSPECCIONES
 *
 * Es lo mismo que hace tools/nucos (que ordenó la carpeta real): si cambia una regla, cambia en los dos.
 *
 * Uso:
 *   ExpedienteNuco.archivar(archivo, nucco, 'SEGURO')            → 2.-SEGURO/SEGURO-0088.pdf; la póliza que estaba
 *                                                                  ahí pasa a SEGUROS ANTERIORES con su fecha
 *   ExpedienteNuco.archivar(archivo, nucco, 'RESPONSIVA', { adherente: true })   → 5.-RESPONSIVA/ADHERENTES/ADHERENTE-0088.pdf
 *   ExpedienteNuco.carpeta(nucco, 'RESPONSIVA')                  → la carpeta (para generar un PDF directo ahí)
 *
 * De dónde sale NUCOS VEHICULOS: DRIVE_FOLDER_ID_NUCOS_VEHICULOS en Entornos.gs (producción: la real). Sin eso
 * (un DEV), una carpeta "NUCOS VEHICULOS" de pruebas en la raíz de ESE proyecto: un DEV nunca escribe en la real.
 *
 * Archivar MUEVE el archivo (no lo copia): conserva su ID, así que la liga que guarda la hoja sigue abriendo.
 * Nada corre al cargar el archivo.
 */
const ExpedienteNuco = (function () {
  const RAIZ_NOMBRE = 'NUCOS VEHICULOS';
  const DOCUMENTACION = '1.-DOCUMENTACIÓN';
  const OTRAS = ['2.- SERVICIOS', '3.- VERIFICACIONES', '4.- INSPECCIONES'];
  /** Cada documento: su carpeta, el prefijo del nombre y dónde van las versiones anteriores (null: se quedan junto) */
  const DOCUMENTOS = {
    FACTURA: { carpeta: '1.-FACTURA', prefijo: 'FACTURA', anteriores: null },
    SEGURO: { carpeta: '2.-SEGURO', prefijo: 'SEGURO', anteriores: 'SEGUROS ANTERIORES' },
    ALTA: { carpeta: '3.-ALTA DE PLACAS', prefijo: 'ALTA DE PLACAS', anteriores: null },
    TARJETA: { carpeta: '4.-TARJETA DE CIRCULACIÓN', prefijo: 'TARJETA DE CIRCULACION', anteriores: null },
    RESPONSIVA: { carpeta: '5.-RESPONSIVA', prefijo: 'RESPONSIVA', anteriores: 'RESPONSIVAS ANTERIORES' },
    TENENCIA: { carpeta: '6.-TENENCIA', prefijo: 'TENENCIA', anteriores: 'TENENCIAS ANTERIORES' },
  };
  const ADHERENTES = 'ADHERENTES';

  function raiz_() {
    const id = Config.DRIVE_FOLDERS.NUCOS_VEHICULOS();
    return id ? DriveApp.getFolderById(id) : DriveUtils.carpetaEnRaiz(RAIZ_NOMBRE);
  }

  function subcarpeta_(padre, nombre) {
    const hay = padre.getFoldersByName(nombre);
    return hay.hasNext() ? hay.next() : padre.createFolder(nombre);
  }

  /** "88", "0088" y 88 son el mismo NUCO; la carpeta se llama sin ceros, como las que ya existen */
  function nombreNuco_(nucco) {
    const n = String(nucco == null ? '' : nucco).trim();
    if (!/^\d+$/.test(n)) throw new Error('El vehículo no tiene NUCCO: no se puede guardar en su expediente');
    return String(Number(n));
  }

  /** La carpeta del NUCO; si no existe (un vehículo nuevo), se crea con toda la estructura */
  function carpetaNuco(nucco) {
    const nombre = nombreNuco_(nucco);
    const nucos = raiz_();
    const hay = nucos.getFoldersByName(nombre);
    if (hay.hasNext()) return hay.next();
    const nueva = nucos.createFolder(nombre);
    const doc = nueva.createFolder(DOCUMENTACION);
    Object.keys(DOCUMENTOS).forEach((k) => doc.createFolder(DOCUMENTOS[k].carpeta));
    OTRAS.forEach((o) => nueva.createFolder(o));
    return nueva;
  }

  function definicion_(documento) {
    const d = DOCUMENTOS[documento];
    if (!d) throw new Error('Documento desconocido para el expediente: ' + documento);
    return d;
  }

  /** La carpeta de un documento ("RESPONSIVA" → <NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA), más subcarpetas si se piden */
  function carpeta(nucco, documento, subcarpetas) {
    let c = subcarpeta_(subcarpeta_(carpetaNuco(nucco), DOCUMENTACION), definicion_(documento).carpeta);
    (subcarpetas || []).forEach((s) => { c = subcarpeta_(c, s); });
    return c;
  }

  function extension_(nombre) {
    const m = /\.([A-Za-z0-9]{2,4})$/.exec(nombre || '');
    return m ? '.' + m[1].toLowerCase() : '';
  }

  function existe_(carpetaDrive, nombre) {
    return carpetaDrive.getFilesByName(nombre).hasNext();
  }

  /** SEGURO-0088.pdf; si ya hay uno, con la fecha; si también, (2), (3)… (como tools/nucos/reglas.nombre_final) */
  function nombreLibre(carpetaDrive, prefijo, nucco, ext, fecha) {
    const base = prefijo + '-' + ('0000' + nombreNuco_(nucco)).slice(-4);
    const conFecha = base + ' ' + Utilities.formatDate(fecha || new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (!existe_(carpetaDrive, base + ext)) return base + ext;
    if (!existe_(carpetaDrive, conFecha + ext)) return conFecha + ext;
    let n = 2;
    while (existe_(carpetaDrive, base + ' (' + n + ')' + ext)) n++;
    return base + ' (' + n + ')' + ext;
  }

  /**
   * Lo que hoy es el documento vigente (los archivos sueltos de la carpeta) pasa a la de anteriores, con su fecha
   * en el nombre. Lo que no se puede mover (de otra cuenta, sin permiso) se queda y se avisa en el log.
   */
  function apartarVigente_(carpetaDoc, def, nucco, nuevoId) {
    if (!def.anteriores) return;
    const anteriores = subcarpeta_(carpetaDoc, def.anteriores);
    const hay = carpetaDoc.getFiles();
    while (hay.hasNext()) {
      const f = hay.next();
      if (f.getId() === nuevoId) continue;
      try {
        const nombre = nombreLibre(anteriores, def.prefijo, nucco, extension_(f.getName()), f.getLastUpdated());
        f.moveTo(anteriores);
        f.setName(nombre);
      } catch (e) {
        console.error('Expediente NUCO ' + nucco + ': no se pudo pasar "' + f.getName() + '" a ' + def.anteriores + ': ' + e.message);
      }
    }
  }

  /**
   * Guarda un archivo de Drive en el expediente del NUCO: lo mueve a la carpeta de su documento y le pone su nombre.
   * Si el documento lleva "anteriores" (seguro, responsiva, tenencia), lo que estaba vigente pasa ahí. Un adherente
   * va a 5.-RESPONSIVA/ADHERENTES y no toca la responsiva vigente.
   * @return {{ carpetaId: string, nombre: string }}
   */
  function archivar(archivo, nucco, documento, opciones) {
    const op = opciones || {};
    const def = definicion_(documento);
    const ext = extension_(archivo.getName());
    if (op.adherente) {
      const destino = carpeta(nucco, 'RESPONSIVA', [ADHERENTES]);
      const nombre = nombreLibre(destino, 'ADHERENTE', nucco, ext, new Date());
      archivo.moveTo(destino);
      archivo.setName(nombre);
      return { carpetaId: destino.getId(), nombre: nombre };
    }
    const destino = carpeta(nucco, documento);
    apartarVigente_(destino, def, nucco, archivo.getId());
    const nombre = nombreLibre(destino, def.prefijo, nucco, ext, new Date());
    archivo.moveTo(destino);
    archivo.setName(nombre);
    return { carpetaId: destino.getId(), nombre: nombre };
  }

  /** El ID de Drive dentro de una liga (".../file/d/<id>/view", "...?id=<id>") o null si no es una liga de Drive */
  function idDeLiga(liga) {
    const m = /\/d\/([A-Za-z0-9_-]{20,})|[?&]id=([A-Za-z0-9_-]{20,})/.exec(String(liga || ''));
    return m ? (m[1] || m[2]) : null;
  }

  return { DOCUMENTOS, carpetaNuco, carpeta, archivar, nombreLibre, idDeLiga };
})();
