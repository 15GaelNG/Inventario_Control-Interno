/**
 * LineasFirmaRemota.gs
 * Firma a distancia de documentos de Líneas (liga por token, sin sesión) — aparte del mecanismo
 * de la Responsiva/Adherente Vehicular (api/FirmaRemota.gs, ResponsivaVehicularService.gs), que está
 * armado para exactamente 2 roles diferibles con columnas fijas. Aquí el número de firmantes varía:
 * siempre quien entrega por Flotillas/CI (Responsiva) o el Inspector (Inspección) -- NUNCA se
 * difiere, firma siempre al capturar -- y el responsable principal, más de 0 a 4 responsables
 * adicionales (SEGUNDO…QUINTO) que puede traer ese documento — cada uno puede firmar presencial o,
 * si no está, por su propia liga.
 *
 * Sirve a dos documentos (Responsiva e Inspección, 6-nov: "me comentan que igual firman las mismas
 * personas") con el mismo motor: cada función recibe un `doc` (uno de `DOCUMENTOS`, abajo) que dice
 * su tabla, su rol "CI" (NOMBRE CI/FIRMA CI en Responsiva, NOMBRE INSPECTOR/FIRMA INSPECTOR en
 * Inspección) y su carpeta temporal -- todo lo demás (los 5 roles diferibles, sus columnas
 * TOKEN FIRMA.../FIRMA...TEMP/FIRMADO POR..., el patrón de liga) es idéntico entre las dos tablas.
 *
 * Mismo patrón de columnas que Vehicular (`ResponsivaVehicularService.gs`: TOKEN FIRMA, …EXPIRA,
 * FIRMA … TEMP), repetido por cada rol diferible en vez de solo 2. Las firmas de espera se guardan
 * como archivo temporal en Drive (nunca como base64 en la celda: Sheets tiene un tope de 50,000
 * caracteres por celda y una firma por foto lo rebasa fácil — el mismo bug que corrigió Vehicular
 * el 9-oct). A diferencia de Vehicular, aquí NUNCA se respalda la firma como archivo permanente: el
 * acuerdo del 18-sep para Líneas sigue (LineasCaptura.gs: "las firmas NO se guardan como archivos"),
 * así que el archivo temporal se borra en cuanto el documento queda FIRMADO — no hay paso de
 * guardar una copia suelta en Drive.
 *
 * Una firma, aquí y en el resto de Líneas (LineasCaptura.gs: firmasCache_/blobBase64_), es un base64
 * PLANO (PNG del trazo, o JPEG de una foto que se detecta por sus bytes "/9j/") — a diferencia de
 * Vehicular, que usa {base64,mimeType}. Las columnas …TEMP sí guardan su mimeType (hace falta para
 * el archivo de Drive), pero lo que entra y sale de aquí hacia generarPdf es siempre el string.
 *
 * Cuando NADA se difiere (el caso de hoy, el más común), nada de este archivo se usa: guardarResponsiva
 * y guardarInspeccion siguen exactamente igual que antes.
 */

const LineasFirmaRemota = (function () {
  const FIRMA_REMOTA_DIAS_VIGENCIA = 15;

  // Los 4 adicionales (como ORDEN_ADICIONALES de LineasCaptura.gs) + el principal
  const ROLES_DIFERIBLES = ['PRINCIPAL', 'SEGUNDO', 'TERCER', 'CUARTO', 'QUINTO'];
  const TODOS_LOS_ROLES = ROLES_DIFERIBLES.concat(['CI']);

  /**
   * Lo que cambia entre Responsiva e Inspección -- todo lo demás (roles, columnas de los
   * adicionales, el patrón de liga) es igual en las dos tablas. `claveCI` es la clave que entiende
   * LineasCaptura.generarPdf para el firmante que nunca se difiere (`ci` o `inspector`, como ya
   * distinguía generarPdf con su `rolCI`).
   */
  const DOCUMENTOS = {
    RESPONSIVA: {
      tabla: () => LineasRepo.TAB.RESP, tipoLiga: 'lineas-responsiva', tipoPdf: 'RESPONSIVA', claveCI: 'ci',
      colNombreCI: 'NOMBRE CI', marcadorCI: 'FIRMA CI', carpetaTemp: 'RESPONSIVAS LINEAS_FirmasTemp',
      documento: 'Responsiva de línea telefónica',
    },
    INSPECCION: {
      tabla: () => LineasRepo.TAB.INSP, tipoLiga: 'lineas-inspeccion', tipoPdf: 'INSPECCION', claveCI: 'inspector',
      colNombreCI: 'NOMBRE INSPECTOR', marcadorCI: 'FIRMA INSPECTOR', carpetaTemp: 'INSPECCIONES LINEAS_FirmasTemp',
      documento: 'Inspección de línea telefónica',
    },
  };

  /** El nombre de ese responsable en la fila del documento (para pintar la liga y el PDF). */
  function columnaNombre_(doc, rol) {
    return rol === 'PRINCIPAL' ? 'RESPONSABLE' : rol === 'CI' ? doc.colNombreCI : 'NOMBRE ' + rol + ' RESPONSABLE';
  }
  /** El marcador de imagen que ya espera (o esperará, una vez que la plantilla lo tenga) el PDF. */
  function marcadorFirma_(doc, rol) {
    return rol === 'PRINCIPAL' ? 'FIRMA RESPONSABLE' : rol === 'CI' ? doc.marcadorCI : 'FIRMA ' + rol + ' RESPONSABLE';
  }
  /** La clave que ya entiende (o entenderá) LineasCaptura.generarPdf dentro de `firmasNuevas`. */
  function claveGenerarPdf_(doc, rol) {
    return rol === 'PRINCIPAL' ? 'responsable' : rol === 'CI' ? doc.claveCI : rol.toLowerCase();
  }
  function colToken_(rol) { return rol === 'PRINCIPAL' ? 'TOKEN FIRMA' : 'TOKEN FIRMA ' + rol; }
  function colTokenExpira_(rol) { return colToken_(rol) + ' EXPIRA'; }
  function colTemp_(doc, rol) { return marcadorFirma_(doc, rol) + ' TEMP'; }
  function colFirmadoPor_(rol) { return rol === 'PRINCIPAL' ? 'FIRMADO POR' : 'FIRMADO POR ' + rol; }

  /** Todas las columnas que puede llegar a usar un documento con firma a distancia (para asegurarColumnas). */
  function columnasNuevas_(doc) {
    const cols = ['ESTADO FIRMA'];
    ROLES_DIFERIBLES.forEach((rol) => { cols.push(colToken_(rol), colTokenExpira_(rol), colTemp_(doc, rol), colFirmadoPor_(rol)); });
    cols.push(colTemp_(doc, 'CI'));
    return cols;
  }

  /**
   * FirmaExterna.html es la misma página que usa Vehicular (firma.exportar() ahí SIEMPRE regresa
   * { base64, mimeType }, su convención) -- aquí todo lo demás trabaja con el base64 plano de
   * Líneas, así que se desenvuelve en el único punto de entrada (completarFirma). Sin esto,
   * Utilities.base64Decode(String({...})) decodifica "[object Object]" sin truenar (Apps Script
   * ignora los caracteres que no son base64) y el archivo queda guardado con bytes que no son una
   * imagen real -- se ve "bien" hasta que algo intenta INSERTARLA (vista previa o el PDF final),
   * donde Docs sí truena al no poder leerla como imagen (usuario, 6-nov: "No se pudo descifrar la
   * cadena").
   */
  function base64DeImagen_(imagen) {
    return imagen && typeof imagen === 'object' ? imagen.base64 : imagen;
  }

  /** La firma de la pantalla: PNG, o JPEG si era una foto que se achicó para caber (igual que blobBase64_ de LineasCaptura.gs). */
  function blobDeBase64_(base64, nombre) {
    if (!base64) return null;
    const jpeg = String(base64).indexOf('/9j/') === 0;
    return Utilities.newBlob(Utilities.base64Decode(String(base64)), jpeg ? 'image/jpeg' : 'image/png', nombre || 'firma.png');
  }

  /**
   * Una columna …TEMP nunca guarda el base64 directo (ver el comentario del archivo): se guarda
   * como archivo chico, temporal, en su propia carpeta — en la celda solo va su ID.
   */
  function guardarFirmaTemp_(doc, rol, base64) {
    const mimeType = String(base64).indexOf('/9j/') === 0 ? 'image/jpeg' : 'image/png';
    const nombreImagen = 'firma-' + rol.toLowerCase() + '-' + Utilities.getUuid() + (mimeType === 'image/jpeg' ? '.jpg' : '.png');
    const blob = Utilities.newBlob(Utilities.base64Decode(String(base64)), mimeType, nombreImagen);
    const archivo = DriveUtils.crearArchivo(DriveUtils.carpetaEnRaiz(doc.carpetaTemp), blob, nombreImagen, { temporal: true });
    return JSON.stringify({ archivoId: archivo.getId(), mimeType: mimeType });
  }

  /** Lo que haya en una columna …TEMP, como base64 plano listo para el PDF, o null si no hay nada o ya no existe. */
  function leerFirmaTemp_(valor) {
    if (!valor) return null;
    let datos;
    try { datos = JSON.parse(valor); } catch (e) { return null; }
    if (!datos || !datos.archivoId) return null;
    try {
      const archivo = DriveApp.getFileById(datos.archivoId);
      return Utilities.base64Encode(archivo.getBlob().getBytes());
    } catch (e) {
      return null;
    }
  }

  /** Borra de Drive el archivo temporal de una columna …TEMP, ya que el documento quedó FIRMADO. */
  function borrarFirmaTempSiHay_(valor) {
    if (!valor) return;
    try {
      const datos = JSON.parse(valor);
      if (datos && datos.archivoId) DriveUtils.aPapelera(DriveApp.getFileById(datos.archivoId), { temporal: true });
    } catch (e) { /* no-op: si no se pudo borrar, queda un archivo suelto en Drive, nada más */ }
  }

  /**
   * Al guardar (guardarResponsivaEnCandado_/guardarInspeccion de LineasCaptura.gs): `roles` son los
   * que se difieren (ya validados: tienen nombre en el documento); `imagenesYaCapturadas` = { rol:
   * base64 } de los que SÍ firmaron ahora (incluido CI/INSPECTOR, siempre, y cualquier diferible
   * que no se haya diferido). Regresa los cambios a fusionar en la fila antes de
   * `LineasDatos.agregarFilas`.
   */
  function generarPendientes_(doc, roles, imagenesYaCapturadas) {
    const cambios = { 'ESTADO FIRMA': 'PENDIENTE' };
    const expira = new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000);
    roles.forEach((rol) => {
      cambios[colToken_(rol)] = Utilities.getUuid();
      cambios[colTokenExpira_(rol)] = expira;
    });
    TODOS_LOS_ROLES.forEach((rol) => {
      const base64 = imagenesYaCapturadas && imagenesYaCapturadas[rol];
      if (base64) cambios[colTemp_(doc, rol)] = guardarFirmaTemp_(doc, rol, base64);
    });
    return cambios;
  }

  /**
   * La liga pública (FirmaExterna.html: tipo=lineas-responsiva / lineas-inspeccion). Se arma
   * siempre en el servidor (dentro de la app, location.origin es el sandbox de Apps Script, no la
   * URL real -- mismo motivo que ya documenta ResponsivaVehicularService.gs sobre
   * construirLiga_/ligaDeToken).
   */
  function construirLiga_(doc, tokenFirma) {
    const base = Config.urlFirmaPublica() || ScriptApp.getService().getUrl();
    return base + '?firmar=1&tipo=' + encodeURIComponent(doc.tipoLiga) + '&token=' + encodeURIComponent(tokenFirma);
  }
  /** Las ligas recién generadas, { rol: liga }, para mostrarlas a quien capturó. */
  function ligasDe_(doc, cambios) {
    const ligas = {};
    ROLES_DIFERIBLES.forEach((rol) => { if (cambios[colToken_(rol)]) ligas[rol] = construirLiga_(doc, cambios[colToken_(rol)]); });
    return ligas;
  }

  /** La fila del documento (RESPONSIVAS LINEAS o INSPECCIONES LINEAS) y el rol a los que pertenece ese token, o null. */
  function buscarPorToken_(doc, tokenFirma) {
    const limpio = String(tokenFirma || '').trim();
    if (!limpio) return null;
    const filas = LineasDatos.leerTabla(doc.tabla());
    for (let i = 0; i < filas.length; i++) {
      for (let j = 0; j < ROLES_DIFERIBLES.length; j++) {
        const rol = ROLES_DIFERIBLES[j];
        if (String(filas[i][colToken_(rol)] || '') === limpio) return { fila: filas[i], rol: rol };
      }
    }
    return null;
  }

  /** ¿Ya no falta ninguna liga pendiente? Sobre la fila YA actualizada en memoria. */
  function listoParaFinalizar_(fila) {
    return ROLES_DIFERIBLES.every((rol) => !fila[colToken_(rol)]);
  }

  /** Las firmas que ya se tienen guardadas en las columnas TEMP, como base64 con las claves que entiende generarPdf. */
  function imagenesDesdeTemp_(doc, fila) {
    const imagenes = {};
    TODOS_LOS_ROLES.forEach((rol) => {
      const guardada = fila[colTemp_(doc, rol)];
      if (!guardada) return;
      const base64 = leerFirmaTemp_(guardada);
      if (base64) imagenes[claveGenerarPdf_(doc, rol)] = base64;
    });
    return imagenes;
  }

  /** Lo mínimo para pintar la página de firma a distancia (sin exponer el renglón completo). */
  function obtenerPendientePorToken(doc, tokenFirma) {
    const hallado = buscarPorToken_(doc, tokenFirma);
    if (!hallado) return { vigente: false, motivo: 'no-existe' };
    const fila = hallado.fila, rol = hallado.rol;
    const expira = fila[colTokenExpira_(rol)] ? new Date(fila[colTokenExpira_(rol)]) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) return { vigente: false, motivo: 'vencido' };
    return {
      vigente: true,
      documento: doc.documento,
      nombre: fila[columnaNombre_(doc, rol)] || '',
      // Igual que obtenerPendienteArqueoPorToken: FirmaExterna.html ya sabe pintar esta forma
      // genérica (Array.isArray(info.detalles)), sin bifurcar su JS por tipo.
      detalles: [
        { etiqueta: 'Número', valor: fila['No TELEFONO'] || '' },
        { etiqueta: 'Modelo', valor: fila['MODELO'] || '' },
        { etiqueta: 'NUCO', valor: LineasUtil.nucoVisible(fila['NUCO']) || '' },
      ],
    };
  }

  /** PDF con lo que ya hay (otras firmas ya capturadas o llegadas por liga) + aviso de VISTA PREVIA, sin guardar nada. */
  function vistaPrevia(doc, tokenFirma) {
    const hallado = buscarPorToken_(doc, tokenFirma);
    if (!hallado) throw new Error('Esta liga no es válida.');
    const fila = hallado.fila, rol = hallado.rol;
    const expira = fila[colTokenExpira_(rol)] ? new Date(fila[colTokenExpira_(rol)]) : null;
    if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
      throw new Error('Esta liga ya venció -- pide que te manden una nueva.');
    }
    const registro = Object.assign({}, LineasCaptura._registroPlantilla(fila), { 'COMENTARIO': (fila['COMENTARIO'] || '') + ' (VISTA PREVIA — AÚN SIN FIRMAR)' });
    const imagenesBase64 = imagenesDesdeTemp_(doc, fila);
    const imagenesBlob = {};
    TODOS_LOS_ROLES.forEach((r) => {
      const base64 = imagenesBase64[claveGenerarPdf_(doc, r)];
      if (base64) imagenesBlob[marcadorFirma_(doc, r)] = blobDeBase64_(base64, 'firma-' + r.toLowerCase() + '.png');
    });
    const carpeta = DriveUtils.carpetaEnRaiz(doc.carpetaTemp);
    const plantilla = doc.tipoPdf === 'INSPECCION' ? LineasPdf.plantillaInspeccion(fila) : LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR;
    const pdf = LineasPdf.generarPdfDesdePlantilla(plantilla, registro, imagenesBlob, carpeta, 'vista previa ' + Utilities.getUuid() + '.pdf', true);
    try {
      const blob = DriveApp.getFileById(pdf.id).getBlob();
      return { base64: Utilities.base64Encode(blob.getBytes()), mimeType: 'application/pdf' };
    } finally {
      try { DriveUtils.aPapelera(DriveApp.getFileById(pdf.id), { temporal: true }); } catch (e) { /* no-op */ }
    }
  }

  /**
   * Completa la firma de quien llegó por su liga (`imagenBase64`: el base64 plano del trazo). Si
   * queda otro rol pendiente, solo se guarda y se espera -- el PDF se genera hasta que el ÚLTIMO
   * pendiente se completa (como Vehicular).
   */
  function completarFirma(doc, tokenFirma, imagen) {
    const imagenBase64 = base64DeImagen_(imagen);
    if (!imagenBase64) throw new Error('Falta la firma.');
    return LineasDatos.conCandado(() => {
      const hallado = buscarPorToken_(doc, tokenFirma);
      if (!hallado) throw new Error('Esta liga no es válida.');
      const fila = hallado.fila, rol = hallado.rol;
      const expira = fila[colTokenExpira_(rol)] ? new Date(fila[colTokenExpira_(rol)]) : null;
      if (!expira || isNaN(expira.getTime()) || expira.getTime() < Date.now()) {
        throw new Error('Esta liga ya venció -- pide que te manden una nueva.');
      }

      fila[colTemp_(doc, rol)] = guardarFirmaTemp_(doc, rol, imagenBase64);
      fila[colToken_(rol)] = '';
      fila[colTokenExpira_(rol)] = '';
      fila[colFirmadoPor_(rol)] = Session.getActiveUser().getEmail() || '';
      const cambiosDeEsteRol = { [colTemp_(doc, rol)]: fila[colTemp_(doc, rol)], [colToken_(rol)]: '', [colTokenExpira_(rol)]: '', [colFirmadoPor_(rol)]: fila[colFirmadoPor_(rol)] };

      if (!listoParaFinalizar_(fila)) {
        LineasDatos.actualizarFila(doc.tabla(), fila._fila, cambiosDeEsteRol);
        return { ID: fila['ID'], pendiente: true, aviso: 'Tu firma quedó registrada. Falta que alguien más firme para generar el documento.' };
      }

      // Antes de cerrar el documento como FIRMADO: cada …TEMP que sí tiene algo guardado debe poder
      // leerse (si el archivo de Drive ya no existe, NO se cierra -- se avisa y se queda PENDIENTE
      // para reintentar; el mismo resguardo del bug real que corrigió Vehicular el 14-oct).
      const imagenesPdf = imagenesDesdeTemp_(doc, fila);
      const faltantes = TODOS_LOS_ROLES.filter((r) => fila[colTemp_(doc, r)] && !imagenesPdf[claveGenerarPdf_(doc, r)]);
      LineasDatos.actualizarFila(doc.tabla(), fila._fila, cambiosDeEsteRol);
      if (faltantes.length) {
        return { ID: fila['ID'], pendiente: true,
          aviso: 'Tu firma quedó registrada, pero no se pudo leer otra firma ya guardada. El documento sigue pendiente -- avisa a soporte.' };
      }

      const resultado = LineasCaptura.generarPdf(doc.tipoPdf, fila['ID'], false, { nombre: 'Firma a distancia', correo: '' }, imagenesPdf);
      if (resultado && resultado.avisos && resultado.avisos.length) {
        console.error('completarFirma ' + fila['ID'] + ': ' + resultado.avisos.join(' | '));
      }
      TODOS_LOS_ROLES.forEach((r) => borrarFirmaTempSiHay_(fila[colTemp_(doc, r)]));
      LineasDatos.actualizarFila(doc.tabla(), fila._fila, Object.assign({ 'ESTADO FIRMA': 'FIRMADO' },
        TODOS_LOS_ROLES.reduce((o, r) => Object.assign(o, { [colTemp_(doc, r)]: '' }), {})));
      return { ID: fila['ID'], pendiente: false, PDF: resultado && resultado.url ? resultado.url : null };
    });
  }

  /**
   * El estado de cada rol que SÍ se difirió alguna vez (tiene o tuvo liga), con su nombre -- para
   * "Ver ligas de firma" en Documentos (usuario, 6-nov: mostrar el nombre de cada quien, no
   * "Responsable (segundo)", y poder volver a copiar o regenerar una liga después de cerrar el
   * recuadro que aparece al guardar, como ya hace la Responsiva/Adherente Vehicular). Un rol que
   * firmó presencial (nunca tuvo token ni quedó "FIRMADO POR") no sale aquí: no hay nada que ver.
   */
  function estadoLigas(doc, token, documentoId) {
    Permisos.puedeEditar(token, 'lineas-telefonicas');
    const filas = LineasDatos.buscarFilasPorId(doc.tabla(), documentoId);
    if (!filas.length) throw new Error('No se encontró el documento.');
    const fila = LineasDatos.leerFilas([{ tabla: doc.tabla(), filas: filas.slice(0, 1) }])[0][0];
    // La liga de quien falta va incluida (usuario, 9-nov: el recuadro para copiarla en la página de la inspección o
    // responsiva y en "Ver ligas de firma"), armada aquí como en copiarLiga; quien ya firmó no la lleva.
    return ROLES_DIFERIBLES.filter((rol) => fila[colToken_(rol)] || fila[colFirmadoPor_(rol)]).map((rol) => ({
      rol: rol, nombre: fila[columnaNombre_(doc, rol)] || '',
      estado: fila[colToken_(rol)] ? 'PENDIENTE' : 'FIRMADO',
      liga: fila[colToken_(rol)] ? construirLiga_(doc, fila[colToken_(rol)]) : '',
    }));
  }

  /** "Copiar liga de nuevo" desde la ficha: SIEMPRE se arma aquí, nunca en el navegador (mismo motivo que Vehicular). */
  function copiarLiga(doc, token, documentoId, rol) {
    Permisos.puedeEditar(token, 'lineas-telefonicas');
    if (ROLES_DIFERIBLES.indexOf(rol) < 0) throw new Error('Rol inválido.');
    const filas = LineasDatos.buscarFilasPorId(doc.tabla(), documentoId);
    if (!filas.length) throw new Error('No se encontró el documento.');
    const fila = LineasDatos.leerFilas([{ tabla: doc.tabla(), filas: filas.slice(0, 1) }])[0][0];
    const token2 = fila[colToken_(rol)];
    if (!token2) throw new Error('Ese rol no tiene una liga pendiente.');
    return construirLiga_(doc, token2);
  }

  /**
   * "Generar liga de nuevo" (botón manual): token nuevo para una liga PENDIENTE que venció o se
   * perdió, sin crear otro registro -- el link viejo deja de servir solo (buscarPorToken_ ya no lo
   * encuentra en cuanto se sobrescribe). Si ese rol firmó presencial (nunca tuvo liga), truena.
   */
  function regenerarLiga(doc, token, documentoId, rol) {
    Permisos.puedeEditar(token, 'lineas-telefonicas');
    if (ROLES_DIFERIBLES.indexOf(rol) < 0) throw new Error('Rol inválido.');
    return LineasDatos.conCandado(() => {
      const filas = LineasDatos.buscarFilasPorId(doc.tabla(), documentoId);
      if (!filas.length) throw new Error('No se encontró el documento.');
      const fila = LineasDatos.leerFilas([{ tabla: doc.tabla(), filas: filas.slice(0, 1) }])[0][0];
      if (String(fila['ESTADO FIRMA'] || '') !== 'PENDIENTE') throw new Error('Este documento ya quedó firmado; no se puede generar una liga nueva.');
      if (!fila[colToken_(rol)] && !fila[colFirmadoPor_(rol)]) throw new Error('Esa persona firmó presencial, no a distancia; no hay liga que regenerar.');
      borrarFirmaTempSiHay_(fila[colTemp_(doc, rol)]);
      const tokenNuevo = Utilities.getUuid();
      const cambios = {
        [colToken_(rol)]: tokenNuevo, [colTokenExpira_(rol)]: new Date(Date.now() + FIRMA_REMOTA_DIAS_VIGENCIA * 24 * 60 * 60 * 1000),
        [colTemp_(doc, rol)]: '', [colFirmadoPor_(rol)]: '',
      };
      LineasDatos.actualizarFila(doc.tabla(), fila._fila, cambios);
      return construirLiga_(doc, tokenNuevo);
    });
  }

  return {
    ROLES_DIFERIBLES: ROLES_DIFERIBLES, DOCUMENTOS: DOCUMENTOS, columnasNuevas_: columnasNuevas_, generarPendientes_: generarPendientes_, ligasDe_: ligasDe_,
    obtenerPendientePorToken: obtenerPendientePorToken, vistaPrevia: vistaPrevia, completarFirma: completarFirma,
    copiarLiga: copiarLiga, regenerarLiga: regenerarLiga, estadoLigas: estadoLigas,
    // Para pruebas
    _buscarPorToken: buscarPorToken_, _colToken: colToken_, _colTemp: colTemp_, _imagenesDesdeTemp: imagenesDesdeTemp_,
    _base64DeImagen: base64DeImagen_,
  };
})();
