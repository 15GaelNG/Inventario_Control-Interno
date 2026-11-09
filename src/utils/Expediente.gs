/**
 * Expediente.gs — UN solo motor para las carpetas de Drive de cada activo (6-nov, homologación 5.7: «Generalizar
 * ExpedienteNuco, no copiarlo»). Antes Vehículos (ExpedienteNuco) y Líneas (LineasArchivos) tenían cada uno su buscador,
 * su mapa de carpetas y su caché; ahora los dos son fachadas sobre esto y un activo nuevo es una entrada en TIPOS.
 *
 * Un expediente es: raíz → carpeta del activo → ramas del documento → (carpeta del día). Las carpetas en Drive NO
 * cambian: cada tipo declara SU estructura (la de Líneas la llena el área a mano: docs/nucos-expediente.md, lineas-guia).
 *
 *   vehiculo  NUCOS VEHICULOS / 88 / 4.-INSPECCIONES / 2026 / 4TO TRIMESTRE
 *             NUCOS VEHICULOS / 88 / 1.-DOCUMENTACIÓN / 2.-SEGURO
 *   equipo    NUCOS TELEFONICOS / 0599 / INSPECCIONES / 2026 / 3ER CUATRIMESTRE / NOVIEMBRE / INSP 06 11 (+ FOTOS)
 *             NUCOS TELEFONICOS / 0599 / CARTA RESPONSIVA / 2026 / RESP 06 11
 *   linea     LINEAS / 4421234567 / CARTA RESPONSIVA / 2026 / RESP 06 11   (la carpeta se reconoce por su idLinea)
 *
 * Uso:
 *   Expediente.carpetaActivo('vehiculo', 88)                               → Folder (la crea con su estructura)
 *   Expediente.carpetaDocumento('vehiculo', 88, 'INSPECCION', fecha)       → { carpeta, activo, ramas }
 *   Expediente.carpetaDelDia('equipo', '0599', 'RESPONSIVA', fecha)        → { carpeta, fotos, activo, ramas }
 *   Expediente.idActivo('equipo', '0599')                                  → id o null (solo lee)
 *   Expediente.raizDe(carpetaId, { equipo: id1, linea: id2 })              → 'linea' | 'equipo' | null (una subida)
 *   Expediente.hijos([id1, id2], { soloCarpetas, campos })                 → lo que hay dentro (una consulta por cada 40)
 *
 * Toda escritura en Drive va por DriveUtils. Nada corre al cargar el archivo.
 */
const Expediente = (function () {
  const CARPETA = 'application/vnd.google-apps.folder';
  const SEG_MAPA = 21600;
  const ORDINAL = ['', '1ER', '2DO', '3ER', '4TO', '5TO', '6TO'];
  const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const CUATRIMESTRES = ['1ER CUATRIMESTRE', '2DO CUATRIMESTRE', '3ER CUATRIMESTRE'];
  const ZONA_LINEAS = 'America/Mexico_City';
  const zonaScript_ = () => Session.getScriptTimeZone();
  const fecha_ = (f, zona, formato) => Utilities.formatDate(f || new Date(), zona, formato);

  /** Periodo de una inspección vehicular: desde 2026 trimestre, antes bimestre ("4TO TRIMESTRE", "3ER BIMESTRE") */
  function periodoInspeccion(fecha) {
    const anio = Number(fecha_(fecha, zonaScript_(), 'yyyy'));
    const mes = Number(fecha_(fecha, zonaScript_(), 'M'));
    return anio >= 2026 ? ORDINAL[Math.floor((mes - 1) / 3) + 1] + ' TRIMESTRE' : ORDINAL[Math.floor((mes - 1) / 2) + 1] + ' BIMESTRE';
  }

  /** Semestre de una verificación ("1ER SEMESTRE" enero-junio, "2DO SEMESTRE" julio-diciembre) */
  function semestreVerificacion(fecha) {
    return (Number(fecha_(fecha, zonaScript_(), 'M')) <= 6 ? ORDINAL[1] : ORDINAL[2]) + ' SEMESTRE';
  }

  // ---- Vehículos: la estructura que pidió el área (junta del 8-oct, docs/nucos-expediente.md)
  const DOCUMENTACION = '1.-DOCUMENTACIÓN';
  const OTRAS = ['2.-SERVICIOS', '3.-VERIFICACIONES', '4.-INSPECCIONES'];
  /** Cada documento: su carpeta, el prefijo del nombre y dónde van las versiones anteriores (null: se quedan junto) */
  const DOCUMENTOS_VEHICULO = {
    FACTURA: { carpeta: '1.-FACTURA', prefijo: 'FACTURA', anteriores: null },
    SEGURO: { carpeta: '2.-SEGURO', prefijo: 'SEGURO', anteriores: 'SEGUROS ANTERIORES' },
    ALTA: { carpeta: '3.-ALTA DE PLACAS', prefijo: 'ALTA DE PLACAS', anteriores: null },
    TARJETA: { carpeta: '4.-TARJETA DE CIRCULACIÓN', prefijo: 'TARJETA DE CIRCULACION', anteriores: null },
    RESPONSIVA: { carpeta: '5.-RESPONSIVA', prefijo: 'RESPONSIVA', anteriores: 'RESPONSIVAS ANTERIORES' },
    TENENCIA: { carpeta: '6.-TENENCIA', prefijo: 'TENENCIA', anteriores: 'TENENCIAS ANTERIORES' },
  };

  const digitos_ = (v) => String(v == null ? '' : v).replace(/\D/g, '');

  /**
   * Cada tipo de activo:
   *   raiz()                    ID de su carpeta raíz (Entornos.gs; en un DEV sin la clave, una de pruebas)
   *   clave(valor, datos)       la clave del activo ("88", "0599", "LIN-…"); truena si no hay
   *   claveDeCarpeta(f)         la clave de una carpeta de la raíz (f: { name, properties }) o null si no es de un activo
   *   campos                    lo que se pide a Drive al listar la raíz
   *   crear(raiz, clave, datos) la carpeta de un activo nuevo (por omisión: con su clave como nombre)
   *   alCrear(carpeta)          lo que lleva un activo nuevo (Vehículos: toda la estructura)
   *   alUsar(carpeta, clave, datos, raiz)  al usar una que ya existe (Líneas: renombrarla si cambió el número)
   *   documentos[DOC](fecha)    las ramas del documento bajo la carpeta del activo
   *   delDia[DOC]               la carpeta del día: { prefijo, fotos }  ("RESP 06 11", "INSP 06 11" con su FOTOS)
   *   zona()                    la zona con que se arman las fechas de sus carpetas
   */
  const TIPOS = {
    vehiculo: {
      etiqueta: 'NUCOS VEHICULOS',
      raiz: () => Config.DRIVE_FOLDERS.NUCOS_VEHICULOS() || DriveUtils.carpetaEnRaiz('NUCOS VEHICULOS').getId(),
      /** "88", "0088" y 88 son el mismo NUCO; la carpeta se llama sin ceros, como las que ya existen */
      clave: (nucco) => {
        const n = String(nucco == null ? '' : nucco).trim();
        if (!/^\d+$/.test(n)) throw new Error('El vehículo no tiene NUCCO: no se puede guardar en su expediente');
        return String(Number(n));
      },
      claveDeCarpeta: (f) => String(f.name || '').trim(),
      campos: 'nextPageToken,files(id,name,mimeType)',
      alCrear: (nueva) => {
        const doc = DriveUtils.crearCarpeta(nueva, DOCUMENTACION);
        Object.keys(DOCUMENTOS_VEHICULO).forEach((k) => DriveUtils.crearCarpeta(doc, DOCUMENTOS_VEHICULO[k].carpeta));
        OTRAS.forEach((o) => DriveUtils.crearCarpeta(nueva, o));
      },
      documentacion: DOCUMENTACION,
      otras: OTRAS,
      archivos: DOCUMENTOS_VEHICULO,
      documentos: Object.assign({
        SERVICIOS: () => [OTRAS[0]],
        VERIFICACION: (f) => [OTRAS[1], fecha_(f, zonaScript_(), 'yyyy'), semestreVerificacion(f)],
        INSPECCION: (f) => [OTRAS[2], fecha_(f, zonaScript_(), 'yyyy'), periodoInspeccion(f)],
      }, Object.keys(DOCUMENTOS_VEHICULO).reduce((m, k) => { m[k] = () => [DOCUMENTACION, DOCUMENTOS_VEHICULO[k].carpeta]; return m; }, {})),
      zona: zonaScript_,
    },
    equipo: {
      etiqueta: 'NUCOS TELEFONICOS',
      // Sin LINEAS_DRIVE_NUCOS (un DEV): una "NUCOS TELEFONICOS" de pruebas en la raíz de ESE proyecto (15-oct)
      raiz: () => leerConfig_('LINEAS_DRIVE_NUCOS') || DriveUtils.carpetaEnRaiz('NUCOS TELEFONICOS').getId(),
      clave: (nuco) => {
        const n4 = LineasUtil.nuco4(nuco);
        if (!n4) throw new Error('El registro no tiene NUCO.');
        return n4;
      },
      // "0599" o "599": la que ya exista; las que no son número no son de un equipo
      claveDeCarpeta: (f) => (/^\d+$/.test(String(f.name || '').trim()) ? LineasUtil.nuco4(String(f.name).trim()) : null),
      campos: 'nextPageToken,files(id,name,mimeType)',
      documentos: {
        INSPECCION: (f) => {
          const mes = Number(fecha_(f, ZONA_LINEAS, 'M'));
          return ['INSPECCIONES', fecha_(f, ZONA_LINEAS, 'yyyy'), CUATRIMESTRES[Math.floor((mes - 1) / 4)], MESES[mes - 1]];
        },
        RESPONSIVA: (f) => ['CARTA RESPONSIVA', fecha_(f, ZONA_LINEAS, 'yyyy')],
      },
      delDia: { INSPECCION: { prefijo: 'INSP ', fotos: 'FOTOS' }, RESPONSIVA: { prefijo: 'RESP ' } },
      zona: () => ZONA_LINEAS,
    },
    linea: {
      etiqueta: 'LINEAS',
      // En producción la crea el área junto a NUCOS (LINEAS_DRIVE_LINEAS); en un DEV, «LINEAS» dentro de la de pruebas
      raiz: () => {
        const id = leerConfig_('LINEAS_DRIVE_LINEAS');
        if (id) return id;
        if (Config.ENTORNO === 'PROD') throw new Error('Falta la carpeta LINEAS en Drive (LINEAS_DRIVE_LINEAS en Entornos.gs).');
        return DriveUtils.subcarpeta(DriveApp.getFolderById(raiz('equipo')), 'LINEAS').getId();
      },
      // La carpeta se reconoce por la propiedad `idLinea` de Drive, no por su nombre: el número cambia y la compañía lo
      // recicla para otra línea
      clave: (lineaId, datos) => {
        if (!lineaId) throw new Error('Falta la línea.');
        if (datos && !digitos_(datos.numero)) throw new Error('La línea no tiene número: captúralo con Corregir.');
        return String(lineaId);
      },
      claveDeCarpeta: (f) => (f.properties && f.properties.idLinea) || null,
      campos: 'nextPageToken,files(id,name,mimeType,properties)',
      // Se crea con su primera responsiva, con el número de hoy («… (2)» si ya hay otra con ese número: reciclado)
      crear: (raizCarpeta, clave, datos) => {
        const nueva = DriveUtils.crearConApi({ name: nombreLibre_(raizCarpeta, digitos_(datos.numero), null), mimeType: CARPETA,
          parents: [raizCarpeta.getId()], properties: { idLinea: clave } }, null, { supportsAllDrives: true, fields: 'id' });
        return DriveApp.getFolderById(nueva.id);
      },
      // Si el número cambió desde que se creó, la carpeta toma el de hoy
      alUsar: (carpeta, clave, datos, raizCarpeta) => {
        const nombre = digitos_(datos && datos.numero);
        if (!nombre || carpeta.getName().replace(/ \(\d+\)$/, '') === nombre) return false;
        DriveUtils.renombrar(carpeta, nombreLibre_(raizCarpeta, nombre, carpeta.getId()));
        return true;
      },
      documentos: { RESPONSIVA: (f) => ['CARTA RESPONSIVA', fecha_(f, ZONA_LINEAS, 'yyyy')] },
      delDia: { RESPONSIVA: { prefijo: 'RESP ' } },
      zona: () => ZONA_LINEAS,
    },
  };

  function tipo_(tipo) {
    const t = TIPOS[tipo];
    if (!t) throw new Error('Tipo de expediente desconocido: ' + tipo);
    return t;
  }

  /** ID de la raíz del tipo */
  function raiz(tipo) {
    return tipo_(tipo).raiz();
  }

  // ---- Caché del mapa clave → carpeta (CacheHojas: cabe aunque sean miles). Sin caché (pruebas) se lee de Drive.
  const claveMapa_ = (tipo, raizId) => 'exp_activos_v1_' + tipo + '_' + raizId;
  const leer_ = (k) => { try { return CacheHojas.leer(k); } catch (e) { return null; } };
  const guardar_ = (k, v) => { try { CacheHojas.guardar(k, v, SEG_MAPA); } catch (e) { /* sin copia: no pasa nada */ } };
  const borrar_ = (k) => { try { CacheHojas.borrar(k); } catch (e) { /* no-op */ } };

  /**
   * Hijos de varias carpetas a la vez (API de Drive, una consulta por cada 40 padres), lo que no está en la papelera.
   * opciones: { campos, soloCarpetas }. Por omisión trae miniatura, liga y fecha.
   */
  const CAMPOS = 'nextPageToken,files(id,name,mimeType,parents,thumbnailLink,webViewLink,createdTime)';
  function hijos(padres, opciones) {
    const o = opciones || {};
    const out = [];
    for (let i = 0; i < padres.length; i += 40) {
      const grupo = padres.slice(i, i + 40);
      let pagina = null;
      do {
        const r = Drive.Files.list({
          q: '(' + grupo.map((p) => "'" + p + "' in parents").join(' or ') + ') and trashed = false' +
            (o.soloCarpetas ? " and mimeType = '" + CARPETA + "'" : ''),
          pageSize: 1000, orderBy: 'name', supportsAllDrives: true, includeItemsFromAllDrives: true,
          fields: o.campos || CAMPOS,
          pageToken: pagina || undefined,
        });
        (r.files || []).forEach((f) => { if (!(o.soloCarpetas && f.mimeType && f.mimeType !== CARPETA)) out.push(f); });
        pagina = r.nextPageToken;
      } while (pagina);
    }
    return out;
  }

  /** Clave del activo → ID de su carpeta, de toda la raíz (6 h; un activo nuevo lo vuelve a leer) */
  function activos(tipo) {
    const t = tipo_(tipo);
    const raizId = t.raiz();
    const k = claveMapa_(tipo, raizId);
    const guardado = leer_(k);
    if (guardado) return guardado;
    const mapa = {};
    hijos([raizId], { soloCarpetas: true, campos: t.campos }).forEach((f) => {
      const c = t.claveDeCarpeta(f);
      if (c) mapa[c] = f.id;
    });
    guardar_(k, mapa);
    return mapa;
  }

  /** La próxima lectura del mapa va a Drive (al crear, renombrar o borrar la carpeta de un activo) */
  function olvidarActivos(tipo) {
    try { borrar_(claveMapa_(tipo, tipo_(tipo).raiz())); } catch (e) { /* sin raíz: no hay qué olvidar */ }
  }

  /** ID de la carpeta del activo, o null. Solo lee: si no está en el mapa guardado, lo vuelve a leer una vez. */
  function idActivo(tipo, valor) {
    const clave = tipo_(tipo).clave(valor);
    const id = activos(tipo)[clave];
    if (id) return id;
    olvidarActivos(tipo);
    return activos(tipo)[clave] || null;
  }

  const abrir_ = (id) => {
    if (!id) return null;
    try { const c = DriveApp.getFolderById(id); return c && !c.isTrashed() ? c : null; } catch (e) { return null; }
  };

  /**
   * La carpeta del activo. Si el mapa guardado apunta a una que ya no está (se borró), se vuelve a leer; si no existe,
   * se crea (con lo que lleva un activo nuevo). `datos`: lo que necesita su tipo (Líneas: { numero }).
   */
  function carpetaActivo(tipo, valor, datos) {
    const t = tipo_(tipo);
    const clave = t.clave(valor, datos);
    let carpeta = abrir_(activos(tipo)[clave]);
    if (!carpeta) {
      olvidarActivos(tipo);
      carpeta = abrir_(activos(tipo)[clave]);
    }
    const raizCarpeta = DriveApp.getFolderById(t.raiz());
    if (!carpeta) {
      carpeta = t.crear ? t.crear(raizCarpeta, clave, datos) : DriveUtils.crearCarpeta(raizCarpeta, clave);
      if (t.alCrear) t.alCrear(carpeta);
      olvidarActivos(tipo);
      return carpeta;
    }
    if (t.alUsar && t.alUsar(carpeta, clave, datos, raizCarpeta)) olvidarActivos(tipo);
    return carpeta;
  }

  function ramas_(t, documento, fecha) {
    const ramas = t.documentos[documento];
    if (!ramas) throw new Error('Documento desconocido para el expediente: ' + documento);
    return ramas(fecha);
  }

  /**
   * La carpeta de un documento del activo (la crea si falta; reconoce las que ya están aunque varíen espacios o acentos:
   * DriveUtils.subcarpeta). `subcarpetas`: más niveles debajo (['SENSORES'], ['ADHERENTES']).
   * → { carpeta, activo, ramas }
   */
  function carpetaDocumento(tipo, valor, documento, fecha, subcarpetas, datos) {
    const t = tipo_(tipo);
    const ramas = ramas_(t, documento, fecha).concat(subcarpetas || []);
    const activo = carpetaActivo(tipo, valor, datos);
    const carpeta = ramas.reduce((c, nombre) => DriveUtils.subcarpeta(c, nombre), activo);
    return { carpeta: carpeta, activo: activo, ramas: ramas };
  }

  /** Crea una carpeta con nombre único (agrega " (2)", " (3)"… si ya existe). */
  function carpetaUnica(padre, nombre) {
    let candidato = nombre;
    for (let n = 2; padre.getFoldersByName(candidato).hasNext(); n++) candidato = nombre + ' (' + n + ')';
    return DriveUtils.crearCarpeta(padre, candidato);
  }

  /** «4421234567» o, si ya hay otra carpeta con ese nombre (un número reciclado), «4421234567 (2)». */
  function nombreLibre_(padre, nombre, propiaId) {
    const ocupado = (n) => {
      const it = padre.getFoldersByName(n);
      while (it.hasNext()) { if (it.next().getId() !== propiaId) return true; }
      return false;
    };
    let candidato = nombre;
    for (let n = 2; ocupado(candidato); n++) candidato = nombre + ' (' + n + ')';
    return candidato;
  }

  /**
   * La carpeta NUEVA de un documento del día ("RESP 06 11"; si ya hay una ese día, "RESP 06 11 (2)"), con su FOTOS si el
   * tipo la lleva. → { carpeta, fotos, activo, ramas, ddmm }
   */
  function carpetaDelDia(tipo, valor, documento, fecha, datos) {
    const t = tipo_(tipo);
    const dia = t.delDia && t.delDia[documento];
    if (!dia) throw new Error('Tipo de evidencia inválido.');
    const ddmm = fecha_(fecha, t.zona(), 'dd MM');
    const d = carpetaDocumento(tipo, valor, documento, fecha, null, datos);
    const carpeta = carpetaUnica(d.carpeta, dia.prefijo + ddmm);
    const fotos = dia.fotos ? DriveUtils.crearCarpeta(carpeta, dia.fotos) : null;
    return { carpeta: carpeta, fotos: fotos, activo: d.activo, ramas: d.ramas, ddmm: ddmm };
  }

  /**
   * ¿En cuál de estas raíces está la carpeta? `raices` = { nombre: id }. UNA subida por los padres (hasta 12 niveles) que
   * compara contra todas a la vez y se detiene en la primera que encuentra (la más cercana): antes se subía una vez por
   * raíz. → el nombre de la raíz o null.
   */
  function raizDe(carpetaId, raices) {
    const porId = {};
    Object.keys(raices || {}).forEach((k) => { if (raices[k]) porId[raices[k]] = k; });
    let actual = [DriveApp.getFolderById(carpetaId)];
    for (let nivel = 0; nivel < 12 && actual.length; nivel++) {
      const siguiente = [];
      for (let i = 0; i < actual.length; i++) {
        const id = actual[i].getId();
        if (porId[id]) return porId[id];
        const padres = actual[i].getParents();
        while (padres.hasNext()) siguiente.push(padres.next());
      }
      actual = siguiente;
    }
    return null;
  }

  /** ¿La carpeta está dentro de `raizId`? */
  function dentroDe(carpetaId, raizId) {
    return !!raizId && raizDe(carpetaId, { raiz: raizId }) === 'raiz';
  }

  return { TIPOS, CARPETA, raiz, hijos, activos, olvidarActivos, idActivo, carpetaActivo, carpetaDocumento, carpetaDelDia,
    carpetaUnica, raizDe, dentroDe, periodoInspeccion, semestreVerificacion };
})();
