/**
 * LineasIdentificaciones.gs
 * Identificación de cada responsable en la responsiva (usuario, 9-oct; pendiente 2.27, paso 1).
 *
 * En la responsiva, por cada responsable (el principal y del segundo al quinto) se puede subir su identificación: una
 * foto, frente y vuelta, o un PDF. La pantalla junta las fotos en un solo PDF (sin achicarlas de más), así que aquí solo
 * llegan PDF. Se guardan en la carpeta de la responsiva en NUCOS, junto a su PDF (RESP DD MM), como
 * «INE - NOMBRE - PER-000123.pdf», y cada una queda en APP_IDENTIFICACIONES.
 *
 * La persona se reconoce por su ID PERSONA (CapitalHumano.idPara), no por su número de empleado: CH reutiliza números y
 * le da otro a quien vuelve a entrar. Con ese registro, el paso 3 (pendiente 2.29) encontrará la de una persona al
 * reasignar, y el paso 2 (2.28) anotará ahí las que ya están en NUCOS.
 *
 * Los archivos se escriben antes que la responsiva: si la responsiva no se guarda (le falta algo o la acción la rechaza),
 * la carpeta se manda a la papelera y no queda nada a medias.
 */
const LineasIdentificaciones = (function () {
  const HOJA = 'APP_IDENTIFICACIONES';
  const ENCABEZADOS = ['ID', 'ID PERSONA', 'NO EMPLEADO', 'NOMBRE', 'TIPO', 'ARCHIVO ID', 'ARCHIVO', 'NUCO', 'ID RESPONSIVA', 'ID LINEA',
    'ORIGEN', 'FECHA', 'QUIEN'];
  const ORDEN_ADICIONALES = ['SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];
  const MAXIMO_MB = 15;
  const txt = (v) => (v === null || v === undefined ? '' : String(v).trim());

  /** La persona de cada lugar de la responsiva: 0 = el principal; 1 a 4 = del segundo al quinto. */
  function personaDe_(valores, orden) {
    if (orden === 0) return { noEmpleado: txt(valores['No EMPLEADO']), nombre: txt(valores['RESPONSABLE']).toUpperCase(), correo: txt(valores['CORREO']) };
    const n = ORDEN_ADICIONALES[orden - 1];
    return { noEmpleado: txt(valores['NO EMPLEADO ' + n + ' RESPONSABLE']), nombre: txt(valores['NOMBRE ' + n + ' RESPONSABLE']).toUpperCase(), correo: '' };
  }

  /**
   * Revisa lo que mandó la pantalla, antes de escribir nada: datos.identificaciones = [{ orden, tipo, base64 }], un PDF
   * por responsable y de quien sí está en la responsiva. Regresa la lista lista para guardar ([] si no hay).
   */
  function revisar(lista, valores) {
    if (!lista || !lista.length) return [];
    if (lista.length > 1 + ORDEN_ADICIONALES.length) throw new Error('Son más identificaciones que responsables.');
    const vistos = {};
    return lista.map((x) => {
      const orden = Number(x && x.orden);
      if (!(orden >= 0 && orden <= ORDEN_ADICIONALES.length) || Math.floor(orden) !== orden) throw new Error('Identificación de un responsable que no existe.');
      if (vistos[orden]) throw new Error('Va dos veces la identificación del responsable ' + (orden + 1) + '.');
      vistos[orden] = true;
      const persona = personaDe_(valores, orden);
      const quien = orden === 0 ? 'del responsable' : 'del responsable ' + (orden + 1);
      if (!persona.nombre) throw new Error('Falta el nombre ' + quien + ' de la identificación.');
      const tipoElegido = (orden === 0 ? txt(valores['IDENTIFICACION']) : txt(x.tipo)).toUpperCase() || 'INE';
      // Paso 3: la que ya está en el registro (que sea de esta persona se revisa en escribir, con su ID PERSONA)
      if (x.reutilizar) return { orden: orden, tipo: tipoElegido, reutilizar: txt(x.reutilizar), persona: persona };
      const bytes = Utilities.base64Decode(String(x.base64 || ''));
      if (!bytes.length) throw new Error('La identificación ' + quien + ' está vacía.');
      if (bytes.length > MAXIMO_MB * 1024 * 1024) throw new Error('La identificación ' + quien + ' supera ' + MAXIMO_MB + ' MB.');
      if (String.fromCharCode.apply(null, bytes.slice(0, 5)) !== '%PDF-') throw new Error('La identificación ' + quien + ' no es un PDF.');
      return { orden: orden, tipo: tipoElegido, bytes: bytes, persona: persona };
    });
  }

  /** «INE - JUAN PEREZ LOPEZ - PER-000123.pdf»; sin ID PERSONA (no está en Capital Humano), solo el nombre. */
  function nombreArchivo(tipo, nombre, idPersona) {
    const limpio = (s) => txt(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
    return [limpio(tipo) || 'INE', limpio(nombre), limpio(idPersona)].filter(Boolean).join(' - ') + '.pdf';
  }

  function idPersona_(persona) {
    try {
      return txt(CapitalHumano.idPara(LineasRepo.TAB.LINEAS, { 'RESPONSABLE': persona.nombre, 'NO EMPLEADO': persona.noEmpleado, 'EMAIL USUARIO': persona.correo }));
    } catch (e) {
      console.warn('Identificación: no se pudo buscar a ' + persona.nombre + ' en PERSONAS: ' + e.message);
      return '';
    }
  }

  /**
   * Escribe los PDF (antes de guardar la responsiva). Con NUCO, en una carpeta nueva de la responsiva en NUCOS
   * (RESP DD MM, la misma que después usa su PDF); sin NUCO, en la carpeta de la app donde va su PDF.
   * Regresa { carpetaId, ruta, archivos: [{ orden, id, nombre, tipo, persona, idPersona }] } o null si no hay nada.
   */
  function escribir(lista, nuco, fecha, carpetaSinNuco) {
    if (!lista.length) return null;
    const n4 = LineasUtil.nuco4(nuco);
    const c = n4 ? LineasArchivos.carpetaEvidenciaNuco('RESPONSIVA', n4, fecha) : null;
    const carpeta = c ? DriveApp.getFolderById(c.carpetaId) : LineasArchivos.carpetaDeApp(carpetaSinNuco);
    const archivos = [];
    try {
      lista.forEach((x) => {
        const idPersona = idPersona_(x.persona);
        const nombre = nombreArchivo(x.tipo, x.persona.nombre, idPersona);
        let f;
        if (x.reutilizar) {
          // Paso 3: se copia la registrada a la carpeta de esta responsiva, si de verdad es de esta persona
          const previa = registro_(x.reutilizar);
          if (!previa || !idPersona || previa.idPersona !== idPersona) throw new Error('La identificación registrada no es de ' + x.persona.nombre + '.');
          f = DriveUtils.marcarAutor(DriveApp.getFileById(previa.archivoId).makeCopy(nombre, carpeta));
        } else {
          // Sin setSharing: en NUCOS el archivo toma los permisos de la carpeta (como el PDF firmado, 6-oct)
          f = DriveUtils.marcarAutor(carpeta.createFile(Utilities.newBlob(x.bytes, MimeType.PDF, nombre)));
        }
        archivos.push({ orden: x.orden, id: f.getId(), nombre: nombre, tipo: x.tipo, persona: x.persona, idPersona: idPersona,
          reutilizada: x.reutilizar || '' });
      });
    } catch (e) {
      descartar({ carpetaId: c ? c.carpetaId : '', archivos: archivos });
      throw new Error('No se pudo guardar la identificación: ' + e.message);
    }
    if (n4) LineasArchivos.olvidarNuco(n4);
    return { carpetaId: c ? c.carpetaId : '', ruta: c ? c.ruta : '', archivos: archivos };
  }

  /** La responsiva no se guardó: a la papelera la carpeta nueva (o, sin NUCO, los archivos sueltos). */
  function descartar(escritos) {
    if (!escritos) return;
    try {
      if (escritos.carpetaId) { LineasArchivos.descartarCarpeta(escritos.carpetaId); return; }
      (escritos.archivos || []).forEach((a) => DriveApp.getFileById(a.id).setTrashed(true));
    } catch (e) {
      console.warn('Identificación: no se pudo limpiar lo que se subió: ' + e.message);
    }
  }

  /** Dentro del candado de la responsiva: un renglón por identificación. */
  function registrar(escritos, responsivaId, reg, usuario, ahora) {
    if (!escritos || !escritos.archivos.length) return;
    if (!LineasDatos.existeTabla(HOJA)) LineasDatos.asegurarPestana(HOJA, ENCABEZADOS);
    LineasDatos.agregarFilas(HOJA, escritos.archivos.map((a) => ({
      'ID PERSONA': a.idPersona, 'NO EMPLEADO': a.persona.noEmpleado, 'NOMBRE': a.persona.nombre, 'TIPO': a.tipo,
      'ARCHIVO ID': a.id, 'ARCHIVO': a.nombre, 'NUCO': LineasUtil.nucoVisible(reg.nuco) || '', 'ID RESPONSIVA': responsivaId,
      'ID LINEA': reg.id, 'ORIGEN': a.reutilizada ? 'REUTILIZADA' : 'RESPONSIVA', 'FECHA': ahora, 'QUIEN': (usuario && usuario.correo) || '',
    })));
  }

  /** Las identificaciones de una responsiva, para su página: [{ id, nombre, tipo, persona }]. */
  function deResponsiva(ids) {
    const lista = (ids || []).map(txt).filter(Boolean);
    if (!lista.length || !LineasDatos.existeTabla(HOJA)) return [];
    const filas = LineasDatos.buscarFilasVarios(HOJA, 'ID RESPONSIVA', lista);
    if (!filas.length) return [];
    return LineasDatos.leerFilas([{ tabla: HOJA, filas: filas }])[0].map((f) => ({
      id: txt(f['ARCHIVO ID']), nombre: txt(f['ARCHIVO']), tipo: txt(f['TIPO']), persona: txt(f['NOMBRE']),
    })).filter((x) => x.id);
  }

  // ------------------------------------------------------------ paso 3 (pendiente 2.29): reutilizar la registrada

  const fechaMs_ = (v) => (v instanceof Date ? v.getTime() : (Date.parse(String(v || '').replace(/^(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1')) || 0));
  const deFila_ = (f) => ({ registro: txt(f['ID']), idPersona: txt(f['ID PERSONA']), archivoId: txt(f['ARCHIVO ID']), tipo: txt(f['TIPO']) || 'INE',
    nuco: txt(f['NUCO']), fecha: f['FECHA'] });

  /** Un renglón del registro por su ID, o null. */
  function registro_(id) {
    if (!id || !LineasDatos.existeTabla(HOJA)) return null;
    const filas = LineasDatos.buscarFilasVarios(HOJA, 'ID', [id]);
    const f = filas.length ? LineasDatos.leerFilas([{ tabla: HOJA, filas: filas.slice(0, 1) }])[0][0] : null;
    return f && txt(f['ID']) === id ? deFila_(f) : null;
  }

  /** La identificación más reciente de una persona (por ID PERSONA) cuyo archivo sigue en Drive, o null. */
  function ultimaDe_(idPersona) {
    if (!idPersona || !LineasDatos.existeTabla(HOJA)) return null;
    const filas = LineasDatos.buscarFilasVarios(HOJA, 'ID PERSONA', [idPersona]);
    if (!filas.length) return null;
    const lista = LineasDatos.leerFilas([{ tabla: HOJA, filas: filas }])[0].map(deFila_)
      .filter((r) => r.idPersona === idPersona && r.archivoId)
      .sort((a, b) => fechaMs_(b.fecha) - fechaMs_(a.fecha));
    for (let i = 0; i < lista.length; i++) {
      try { if (!DriveApp.getFileById(lista[i].archivoId).isTrashed()) return lista[i]; } catch (e) { /* ya no está: la siguiente */ }
    }
    return null;
  }

  /**
   * Para la pantalla de la responsiva: por cada responsable [{ orden, nombre, noEmpleado, correo }], su identificación
   * registrada → [{ orden, registrada: { registro, archivoId, tipo, nuco, fecha } | null }]. La pantalla pregunta
   * «¿Es correcta?»; si sí, manda { orden, reutilizar: registro } y escribir() la copia a la carpeta nueva.
   */
  function registradas(personas) {
    return (personas || []).slice(0, 1 + ORDEN_ADICIONALES.length).map((p) => {
      const persona = { nombre: txt(p && p.nombre).toUpperCase(), noEmpleado: txt(p && p.noEmpleado), correo: txt(p && p.correo) };
      const r = persona.nombre ? ultimaDe_(idPersona_(persona)) : null;
      const fecha = r && r.fecha ? (r.fecha instanceof Date ? Utilities.formatDate(r.fecha, Session.getScriptTimeZone(), 'dd/MM/yyyy') : txt(r.fecha).slice(0, 10)) : '';
      return { orden: Number(p && p.orden) || 0, registrada: r ? { registro: r.registro, archivoId: r.archivoId, tipo: r.tipo, nuco: r.nuco, fecha: fecha } : null };
    });
  }

  /** Fecha de la responsiva como la guarda LineasCaptura («yyyy-MM-ddTHH:mm» de la pantalla), para la carpeta del día. */
  function fechaDe(valor) {
    const d = valor ? new Date(valor) : new Date();
    return isNaN(d) ? new Date() : d;
  }

  return { HOJA, ENCABEZADOS, revisar, nombreArchivo, escribir, descartar, registrar, deResponsiva, fechaDe, registradas };
})();
