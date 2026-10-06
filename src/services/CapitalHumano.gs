/**
 * CapitalHumano.gs
 *
 * Quién es quién. La lista de Capital Humano (pestaña COLABORADORES ACTUALIZADO) la pega
 * Ayrton tal cual cada vez que CH manda una versión nueva; la app solo la lee. Cada renglón
 * de esa lista es un EMPLEO, no una persona, y por eso esta pestaña sola no sirve de
 * catálogo de personas:
 *
 *   - El mismo número se repite al recontratar a alguien (920 números, medido el 01/10/2026).
 *   - CH REUTILIZA números: HA00059 es de Francisco Ramírez y también de Vanessa Llera
 *     (11 números). "Mismo número = misma persona" las fundiría.
 *   - Una persona puede tener dos números a la vez: otra razón social o un ascenso
 *     (36 personas con dos números activos, como Juan Manuel Fulgencio: HA00241 y VALLE02922).
 *
 * Así que la persona se arma aquí y se guarda en la pestaña PERSONAS, que mantiene la app y
 * nunca se pega: un renglón por empleo (número + nombre) con su ID PERSONA. Dos empleos son
 * la misma persona si:
 *
 *   1. tienen el mismo número y el mismo nombre (una recontratación);
 *   2. tienen el mismo nombre y la misma fecha de nacimiento (dos números a la vez, sin que
 *      la hoja los ligue). Sin fecha no se junta nada: el nombre solo tiene 20 homónimos;
 *   3. uno dice que el otro es su N. EMPLEADO ANTERIOR — salvo que ese número exista en la
 *      hoja con OTRO nombre (fue reutilizado): ahí no se junta y se avisa.
 *
 * Mismo número con nombre distinto son dos personas, y el número queda marcado como
 * AMBIGUO: quien lo cite tendrá que decir el nombre también.
 *
 * Reglas que no se rompen:
 *   - Una liga hecha nunca cambia sola. Si un pegado nuevo hace parecer que dos personas
 *     que ya tienen ID son una, se reporta y no se toca.
 *   - Nunca se borra a nadie de PERSONAS: quien se va de CH sigue citado en documentos.
 *   - La fecha de nacimiento se usa SOLO para la regla 2: no se copia a PERSONAS ni se
 *     muestra en ningún lado.
 *
 * Desde el editor: capitalHumano1Ensayo / capitalHumano2Escribir (pipeline 5, MigracionFamilia.gs).
 */
const CapitalHumano = (function () {
  const HOJA_CH = 'COLABORADORES ACTUALIZADO';
  const HOJA_PERSONAS = 'PERSONAS';
  const ENCABEZADOS = ['ID PERSONA', 'No EMPLEADO', 'NOMBRE COMPLETO', 'MOTIVO', 'IDENTIFICADO EL'];
  // Columnas que la lista de CH trae y que no deben vivir en el libro de la app
  // (decisión de Ayrton, 01/10/2026): se quitan antes de pegar, y aquí se avisa si llegan.
  const SENSIBLES = ['NÚMERO DE CUENTA', 'NUMERO DE CUENTA', 'TELEFONO', 'TELÉFONO'];

  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  const claveEmpleo = (numero, nombre) => norm(numero) + '|' + norm(nombre);

  /** Lee una pestaña como objetos, con los valores tal como se ven (fechas incluidas). */
  function leer_(hoja) {
    if (!hoja || hoja.getLastRow() < 2) return { encabezados: hoja ? migEncabezados_(hoja) : [], filas: [] };
    const valores = hoja.getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn()).getDisplayValues();
    const enc = valores[0].map((h) => String(h).trim());
    const filas = valores.slice(1)
      .filter((r) => r.some((c) => String(c).trim() !== ''))
      .map((r) => { const o = {}; enc.forEach((h, i) => { o[h] = r[i]; }); return o; });
    return { encabezados: enc, filas: filas };
  }

  /**
   * Arma las personas y, con { escribir: true }, agrega a PERSONAS los empleos que todavía
   * no tienen ID. Regresa el reporte en texto (también va al registro de ejecución).
   */
  function identificar(opciones) {
    const cfg = Object.assign({ escribir: false }, opciones || {});
    if (!cfg.escribir) return identificarSinCandado_(cfg);
    // Escribiendo, TODO va bajo el candado —leer lo ya identificado, calcular lo nuevo y
    // escribirlo—: si dos corridas leyeran PERSONAS a la vez, las dos agregarían los mismos
    // empleos con IDs distintos.
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      return identificarSinCandado_(cfg);
    } finally {
      lock.releaseLock();
    }
  }

  function identificarSinCandado_(cfg) {
    const ssId = migracionSs_(cfg);
    const ss = SpreadsheetApp.openById(ssId);
    const lineas = [(cfg.escribir ? 'IDENTIFICANDO PERSONAS' : 'ENSAYO (no escribe nada)') + ' — ' + ssId, ''];
    const avisos = [];

    const hojaCh = ss.getSheetByName(HOJA_CH);
    if (!hojaCh) throw new Error('No existe la pestaña "' + HOJA_CH + '": pega ahí la lista de Capital Humano.');
    const ch = leer_(hojaCh);
    ['No EMPLEADO', 'NOMBRE COMPLETO', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO'].forEach((c) => {
      if (ch.encabezados.indexOf(c) === -1) throw new Error('A "' + HOJA_CH + '" le falta la columna "' + c + '".');
    });
    const sensibles = ch.encabezados.filter((c) => SENSIBLES.indexOf(norm(c)) !== -1);
    if (sensibles.length) {
      avisos.push('La lista trae datos sensibles que no deben estar en el libro: ' + sensibles.join(', ') +
        '. Borra esas columnas (no se usan para nada).');
    }

    // Lo que ya está identificado: nunca cambia
    const hojaPer = ss.getSheetByName(HOJA_PERSONAS);
    const existentes = {};
    leer_(hojaPer).filas.forEach((f) => {
      const k = claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO']);
      if (norm(f['ID PERSONA'])) existentes[k] = norm(f['ID PERSONA']);
    });

    // ---- los empleos (nodos) y quién es quién (unión de conjuntos)
    const padre = {};
    const motivo = {};       // clave → por qué se ligó con otro empleo
    const datos = {};        // clave → { numero, nombre }
    const raiz = (a) => {
      if (!(a in padre)) padre[a] = a;
      while (padre[a] !== a) { padre[a] = padre[padre[a]]; a = padre[a]; }
      return a;
    };
    const unir = (a, b, porque) => {
      const ra = raiz(a), rb = raiz(b);
      if (ra === rb) return;
      padre[ra] = rb;
      if (!motivo[a]) motivo[a] = porque;
    };
    const nodo = (numero, nombre) => {
      const k = claveEmpleo(numero, nombre);
      if (!datos[k]) datos[k] = { numero: norm(numero), nombre: norm(nombre) };
      raiz(k);
      return k;
    };

    const nombresPorNumero = {};
    ch.filas.forEach((f) => {
      const numero = norm(f['No EMPLEADO']);
      if (!numero || !norm(f['NOMBRE COMPLETO'])) return;
      nodo(numero, f['NOMBRE COMPLETO']);
      (nombresPorNumero[numero] = nombresPorNumero[numero] || {})[norm(f['NOMBRE COMPLETO'])] = true;
    });

    // Regla 2: mismo nombre y misma fecha de nacimiento
    const porNacimiento = {};
    ch.filas.forEach((f) => {
      const nombre = norm(f['NOMBRE COMPLETO']);
      const nac = norm(f['FECHA DE NACIMIENTO']);
      if (!norm(f['No EMPLEADO']) || !nombre || !nac) return;
      (porNacimiento[nombre + '|' + nac] = porNacimiento[nombre + '|' + nac] || []).push(claveEmpleo(f['No EMPLEADO'], nombre));
    });
    Object.keys(porNacimiento).forEach((k) => {
      const ks = porNacimiento[k];
      ks.slice(1).forEach((o) => unir(o, ks[0], 'mismo nombre y fecha de nacimiento que ' + datos[ks[0]].numero));
    });

    // Regla 3: número anterior
    ch.filas.forEach((f) => {
      const numero = norm(f['No EMPLEADO']);
      const nombre = norm(f['NOMBRE COMPLETO']);
      const anterior = norm(f['N. EMPLEADO ANTERIOR']);
      if (!numero || !nombre || !anterior || anterior === numero) return;
      const otros = nombresPorNumero[anterior];
      if (otros && !otros[nombre]) {
        // El número anterior existe en la hoja, pero con otro nombre: fue reutilizado.
        avisos.push(numero + ' (' + nombre + ') dice que su número anterior es ' + anterior +
          ', pero en la hoja ' + anterior + ' es de ' + Object.keys(otros).join(' / ') + '. No se juntaron.');
        return;
      }
      // Si el número anterior no está en la hoja, también se registra: hay documentos
      // viejos que citan a la persona con ese número.
      unir(nodo(anterior, nombre), claveEmpleo(numero, nombre), 'número anterior de ' + numero);
    });

    // ---- asignar IDs por persona
    const grupos = {};
    Object.keys(datos).forEach((k) => { (grupos[raiz(k)] = grupos[raiz(k)] || []).push(k); });
    const nuevos = [];
    let personasNuevas = 0, conflictos = 0;
    Object.keys(grupos).forEach((r) => {
      const ks = grupos[r];
      const ids = Array.from(new Set(ks.map((k) => existentes[k]).filter(Boolean)));
      if (ids.length > 1) {
        conflictos++;
        avisos.push('Parecen la misma persona pero ya tienen IDs distintos (' + ids.join(', ') + '): ' +
          ks.map((k) => datos[k].numero + ' ' + datos[k].nombre).join(' · ') + '. No se tocó.');
        return;
      }
      const faltan = ks.filter((k) => !existentes[k]);
      if (!faltan.length) return;
      let id = ids[0];
      if (!id) { id = Ids.nuevo(Entidades.prefijo(HOJA_PERSONAS)); personasNuevas++; }
      // Por qué este empleo tiene este ID. Una recontratación (mismo número y nombre) ni
      // llega aquí: es el mismo empleo, una sola clave.
      faltan.forEach((k) => {
        const porque = motivo[k] || (ids.length ? 'otro empleo de una persona ya identificada' : 'persona nueva');
        nuevos.push([id, datos[k].numero, datos[k].nombre, porque, new Date()]);
      });
    });

    const ambiguos = Object.keys(nombresPorNumero).filter((n) => Object.keys(nombresPorNumero[n]).length > 1);
    const personas = new Set(Object.keys(datos).map((k) => existentes[k] || raiz(k))).size;

    // Las cifras primero, como en los demás pasos del pipeline: así las recoge su resumen
    lineas.push('  ' + ch.filas.length + ' empleos en la lista de Capital Humano');
    lineas.push('  ' + personas + ' personas (' + personasNuevas + ' nuevas)');
    lineas.push('  ' + nuevos.length + ' empleos por identificar · ' + Object.keys(existentes).length + ' ya identificados');
    lineas.push('  ' + ambiguos.length + ' números usados por más de una persona (ambiguos)' +
      (ambiguos.length ? ' — ' + ambiguos.slice(0, 10).join(', ') + (ambiguos.length > 10 ? '…' : '') : ''));
    if (conflictos) lineas.push('  ' + conflictos + ' conflictos: personas con ID distinto que ahora parecen una (ver AVISOS)');
    if (avisos.length) {
      lineas.push('', 'AVISOS (' + avisos.length + '):');
      avisos.slice(0, 40).forEach((a) => lineas.push('  - ' + a));
      if (avisos.length > 40) lineas.push('  … y ' + (avisos.length - 40) + ' más');
    }

    if (cfg.escribir && nuevos.length) {
      let hoja = ss.getSheetByName(HOJA_PERSONAS);
      if (!hoja) {
        hoja = ss.insertSheet(HOJA_PERSONAS);
        hoja.getRange(1, 1, 1, ENCABEZADOS.length).setValues([ENCABEZADOS]).setFontWeight('bold');
        // Texto: que Sheets no convierta un número de empleado en número
        hoja.getRange(2, 1, Math.max(1, hoja.getMaxRows() - 1), 4).setNumberFormat('@');
      }
      const desde = hoja.getLastRow() + 1;
      if (hoja.getMaxRows() < desde + nuevos.length - 1) hoja.insertRowsAfter(hoja.getMaxRows(), desde + nuevos.length - 1 - hoja.getMaxRows());
      hoja.getRange(desde, 1, nuevos.length, ENCABEZADOS.length).setValues(nuevos);
      CacheHojas.tocarHoja(hoja);
      lineas.push('', '  ' + nuevos.length + ' empleos escritos en ' + HOJA_PERSONAS);
    } else if (!cfg.escribir) {
      lineas.push('', 'Si cuadra, corre capitalHumano2Escribir.');
    }
    const texto = lineas.join('\n');
    Logger.log(texto);
    return texto;
  }

  // ======================================================================
  // Ligar a los responsables con su persona (ID PERSONA)
  // ======================================================================
  //
  // Hoy los formularios capturan el NOMBRE del responsable como texto, y AppSheet también lo
  // edita. Así que MANDA EL NOMBRE (decisión de Ayrton, 01/10/2026): ID PERSONA se calcula
  // de él, y nunca se toca un nombre que alguien escribió. Cuando los formularios elijan a la
  // persona de una lista, esto se voltea.
  //
  // Por qué nombre primero y no número: en VEHICULOS, 152 de 654 traen en NO EMPLEADO el
  // número de OTRA persona (medido 01/10/2026; quedó viejo al reasignar), y en 133 de ellos el
  // nombre identifica sin duda a alguien. El número solo desempata homónimos.

  /** Dónde se liga: la hoja, de qué columnas sale la persona, y con qué se reconoce el renglón. */
  const LIGAS = [
    { nombre: 'VEHICULOS (persona)', hoja: 'VEHICULOS', libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      columnaNombre: 'RESPONSABLE VEHICULO', columnaNumero: 'NO EMPLEADO', etiqueta: 'FOLIO' },
    { nombre: 'CAJAS CHICAS (persona)', hoja: 'CAJAS CHICAS', libro: () => Config.SPREADSHEET_IDS.VEHICULOS(),
      columnaNombre: 'RESPONSABLE DE CAJA CHICA', columnaCorreo: 'CORREO ELECTRONICO DE RESPONSABLE', etiqueta: 'ID CCH' },
    // Líneas también lo recalcula al guardar (LineasRepo.conPersona_, 01/10/2026); Salud pone al día lo de antes.
    { nombre: 'LINEAS TELEFONICAS (persona)', hoja: 'LINEAS TELEFONICAS', libro: () => Config.SPREADSHEET_IDS.TELEFONIA(),
      columnaNombre: 'RESPONSABLE', columnaNumero: 'NO EMPLEADO', columnaCorreo: 'EMAIL USUARIO', etiqueta: 'NUCO' },
  ];
  const COLUMNA = 'ID PERSONA';

  /**
   * Lo que se escribe donde iría una persona y NO es una persona: es normal, no un error.
   * Medido el 01/10/2026: BAJA VEHICULAR ×104 en VEHICULOS, CANCELACION ×17 en Líneas…
   * Los códigos de desarrollo (DS0054, 529 líneas) son líneas asignadas a un lugar.
   */
  const NO_PERSONA = ['BAJA VEHICULAR', 'NUCO SIN INFORMACION', 'DONACION', 'FUERA DE SERVICIO', 'POR ASIGNAR',
    'SIN ESPECIFICAR', 'CANCELACION', 'NO APLICA', 'N/A', 'NA', '-', 'NO SE ENCUENTRA EN CH', 'SIN ASIGNAR'];
  const ES_CODIGO = /^[A-Z]{1,4}-?\d/;

  const sinAcentos = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  /**
   * El nombre como para comparar: sin acentos, sin títulos (LIC., ING., ARQ., C.P.), sin
   * paréntesis ("(CERRADA)") y con MA. = MARIA. Conservador a propósito: lo que no sea
   * una de estas variantes conocidas no se adivina.
   */
  function nombreComparable(s) {
    return sinAcentos(s)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^(LIC|ING|ARQ|C\.?P|DR|DRA|MTRO|MTRA)\.?\s+/, '')
      .replace(/\bMA\.?\s/g, 'MARIA ')
      .replace(/\s+/g, ' ').trim();
  }

  /** Índice de personas: por nombre comparable, por número y por correo (de la lista de CH). */
  function indice_(ss, conCorreo) {
    const hojaPer = ss.getSheetByName(HOJA_PERSONAS);
    if (!hojaPer || hojaPer.getLastRow() < 2) {
      throw new Error('Todavía no existe ' + HOJA_PERSONAS + ': corre capitalHumano2Escribir primero.');
    }
    const agregar = (mapa, clave, id) => { if (clave) (mapa[clave] = mapa[clave] || {})[id] = true; };
    const ix = { porNombre: {}, porNumero: {}, porCorreo: {}, porEmpleo: {}, etiqueta: {} };
    leer_(hojaPer).filas.forEach((f) => {
      const id = norm(f['ID PERSONA']);
      if (!id) return;
      const numero = norm(f['No EMPLEADO']);
      const nombre = norm(f['NOMBRE COMPLETO']);
      ix.porEmpleo[numero + '|' + nombre] = id;
      agregar(ix.porNombre, nombreComparable(nombre), id);
      agregar(ix.porNumero, numero, id);
      if (!ix.etiqueta[id]) ix.etiqueta[id] = nombre + ' · ' + numero;
    });
    // Los correos salen de la lista de CH (15 mil renglones): solo se leen si hacen falta
    const ch = conCorreo === false ? null : ss.getSheetByName(HOJA_CH);
    if (ch) {
      leer_(ch).filas.forEach((f) => {
        const correo = String(f['CORREO EMPRESARIAL'] || '').trim().toLowerCase();
        const id = ix.porEmpleo[norm(f['No EMPLEADO']) + '|' + norm(f['NOMBRE COMPLETO'])];
        if (correo.indexOf('@') > 0 && id) agregar(ix.porCorreo, correo, id);
      });
    }
    return ix;
  }

  /**
   * La persona de un responsable: { id, como } si se encontró; si no, { id: '', tipo, motivo }
   * con el tipo que Salud entiende (normal, a mano, homónimos).
   */
  function personaDe(ix, numero, nombre, correo) {
    const nom = norm(nombre);
    const num = norm(numero);
    const cor = String(correo || '').trim().toLowerCase();
    if (!nom && !num && !cor) return { id: '', tipo: 'VACIO' };
    const comparable = nombreComparable(nom);
    if (NO_PERSONA.indexOf(comparable) !== -1 || ES_CODIGO.test(comparable)) {
      return { id: '', tipo: 'SIN_DUENO_ESPERADO', motivo: 'dice «' + nombre + '», que no es una persona' };
    }
    if (/\//.test(nom)) return { id: '', tipo: 'HUERFANO', motivo: 'trae varias personas en la misma celda' };
    const llaves = (m, k) => Object.keys(m[k] || {});
    const porCorreo = cor ? llaves(ix.porCorreo, cor) : [];
    if (porCorreo.length === 1) return { id: porCorreo[0], como: 'correo' };
    const porNombre = comparable ? llaves(ix.porNombre, comparable) : [];
    if (porNombre.length === 1) return { id: porNombre[0], como: 'nombre' };
    if (porNombre.length > 1) {
      const desempata = llaves(ix.porNumero, num).filter((i) => porNombre.indexOf(i) !== -1);
      if (desempata.length === 1) return { id: desempata[0], como: 'nombre + número' };
      return { id: '', tipo: 'CLAVE_DUPLICADA_EN_ORIGEN', motivo: 'hay ' + porNombre.length + ' personas con ese nombre y el número no desempata' };
    }
    if (!nom && num) {
      const porNumero = llaves(ix.porNumero, num);
      if (porNumero.length === 1) return { id: porNumero[0], como: 'número' };
    }
    return { id: '', tipo: 'HUERFANO', motivo: 'no está en la lista de Capital Humano' };
  }

  /**
   * Revisa (y con escribir, pone al día) la columna ID PERSONA de las hojas ligadas.
   * Regresa lo mismo que Relaciones.revisar por hoja, para que Salud lo pinte igual:
   *   DIFERENCIA            le falta su ID PERSONA o ya no es el de su responsable → «Actualizar»
   *   HUERFANO / CLAVE_…     su responsable no se puede ligar → a mano
   *   SIN_DUENO_ESPERADO     dice algo que no es una persona (BAJA VEHICULAR) → normal
   * Nunca escribe un ID vacío encima de uno que había: si el responsable ya no se puede
   * ligar, se avisa y el ID anterior se queda hasta que alguien lo corrija.
   *
   * @param {Object} opciones  { escribir, hojas: [nombres de liga], filas, quien, detalle }
   */
  function revisarLigas(opciones) {
    const cfg = Object.assign({ escribir: false }, opciones || {});
    const resultado = {};
    const soloFilas = Array.isArray(cfg.filas) && cfg.filas.length ? cfg.filas.map(Number) : null;
    const ix = indice_(SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS()));
    LIGAS.filter((l) => !cfg.hojas || cfg.hojas.indexOf(l.nombre) !== -1).forEach((l) => {
      const r = { tipo: 'cache', revisadas: 0, diferencias: 0, huerfanos: 0, clavesDuplicadasOmitidas: 0, centinelasOmitidos: 0,
        vaciosOmitidos: 0, diferenciasHistoricas: 0, sinDuenoEsperado: 0, emparejadasPorId: 0, emparejadasPorClave: 0, corregido: false };
      const entradas = [];
      resultado[l.nombre] = r;
      Object.defineProperty(r, 'entradas', { value: entradas });
      let hoja;
      try {
        hoja = SpreadsheetApp.openById(l.libro()).getSheetByName(l.hoja);
        if (!hoja) throw new Error('no existe la pestaña ' + l.hoja);
      } catch (err) {
        r.error = err.message;
        return;
      }
      const enc = migEncabezados_(hoja);
      let col = migColumna_(enc, COLUMNA);
      const filas = leer_(hoja).filas;
      const nuevos = [];
      filas.forEach((f, i) => {
        const fila = i + 2;
        const p = personaDe(ix, l.columnaNumero ? f[l.columnaNumero] : '', f[l.columnaNombre], l.columnaCorreo ? f[l.columnaCorreo] : '');
        const tenia = norm(f[COLUMNA]);
        if (p.tipo === 'VACIO') { nuevos.push([f[COLUMNA] || '']); return; }
        r.revisadas++;
        const base = { hoja: l.hoja, fila: fila, clave: norm(f[l.columnaNombre]), dueno: String(f[l.etiqueta] || '').trim(), columna: COLUMNA };
        if (p.id) {
          if (p.como === 'correo' || p.como === 'nombre') r.emparejadasPorClave++; else r.emparejadasPorId++;
          if (tenia === p.id) { nuevos.push([p.id]); return; }
          r.diferencias++;
          entradas.push(Object.assign({ tipo: 'DIFERENCIA', tenia: tenia ? (ix.etiqueta[tenia] || tenia) : '', quedo: ix.etiqueta[p.id] || p.id }, base));
          nuevos.push([cfg.escribir && (!soloFilas || soloFilas.indexOf(fila) !== -1) ? p.id : (f[COLUMNA] || '')]);
          return;
        }
        nuevos.push([f[COLUMNA] || '']);
        if (p.tipo === 'SIN_DUENO_ESPERADO') r.sinDuenoEsperado++;
        else if (p.tipo === 'CLAVE_DUPLICADA_EN_ORIGEN') r.clavesDuplicadasOmitidas++;
        else r.huerfanos++;
        entradas.push(Object.assign({ tipo: p.tipo, motivo: p.motivo, tenia: f[l.columnaNombre], quedo: '' }, base));
      });
      if (cfg.escribir && r.diferencias) {
        if (!col) {
          // La columna se crea al final la primera vez; los formularios la ignoran
          col = enc.length + 1;
          if (hoja.getMaxColumns() < col) hoja.insertColumnsAfter(hoja.getMaxColumns(), col - hoja.getMaxColumns());
          hoja.getRange(1, col).setValue(COLUMNA);
        }
        hoja.getRange(2, col, nuevos.length, 1).setValues(nuevos);
        CacheHojas.tocarHoja(hoja);
        r.corregido = true;
        Relaciones.anotar(l.libro(), entradas.filter((e) => e.tipo === 'DIFERENCIA' && (!soloFilas || soloFilas.indexOf(e.fila) !== -1)), cfg.quien);
      }
    });
    return resultado;
  }

  /**
   * El ID PERSONA de un registro que se está guardando, para escribirlo en el mismo renglón.
   * '' si no se puede ligar; null si todavía no hay PERSONAS (y entonces no se toca nada).
   * Lo usan VehiculosService y CajasChicasService al crear y al editar.
   */
  function idPara(hoja, registro) {
    const l = LIGAS.filter((x) => x.hoja === hoja)[0];
    if (!l) return null;
    let ix;
    try { ix = indice_(SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS()), !!l.columnaCorreo); } catch (e) { return null; }
    return personaDe(ix, l.columnaNumero ? registro[l.columnaNumero] : '', registro[l.columnaNombre],
      l.columnaCorreo ? registro[l.columnaCorreo] : '').id;
  }

  /** Las columnas que, si cambian, cambian a la persona de un registro de `hoja`. */
  function columnasDePersona(hoja) {
    const l = LIGAS.filter((x) => x.hoja === hoja)[0];
    return l ? [l.columnaNombre, l.columnaNumero, l.columnaCorreo].filter(Boolean) : [];
  }

  /** Para Datos conectados y Salud: las ligas como si fueran copias del MAPA. */
  function describirLigas() {
    return LIGAS.map((l) => ({ nombre: l.nombre, hoja: l.hoja, columna: COLUMNA, etiqueta: l.etiqueta,
      desde: [l.columnaCorreo, l.columnaNombre, l.columnaNumero].filter(Boolean) }));
  }

  /**
   * Colaboradores para autocompletar "Responsable"/"Nombre completo" en otros módulos (ej.
   * Vehículos y Uber: al elegir el nombre, se sugieren Departamento, Puesto, Sede, Oficina-
   * Desarrollo, Correo y No. de empleado). Son los renglones de COLABORADORES ACTUALIZADO tal
   * cual, sin pasar por identificar()/PERSONAS -- no hace falta resolver quién es quién para
   * esto, solo sugerir. Por eso un mismo nombre puede salir más de una vez (otro departamento
   * tras un cambio de área, o un número reutilizado con otro departamento): se desduplica solo
   * nombre+departamento exacto, no por persona. Si el responsable que se captura no aparece
   * aquí (alguien nuevo que CH todavía no cargó), el campo se queda como texto libre -- no
   * bloquea nada.
   *
   * A propósito NO trae Razón social (es del contrato -- vehículo/línea/caja chica -- no de la
   * persona, y puede variar entre uno y otro) ni Teléfono (SENSIBLES lo excluye de lo que se
   * pega del CH al libro de la app, por privacidad): esos dos se quedan siempre a mano.
   */
  function listarColaboradores(token) {
    Auth.validarSesion(token);
    return colaboradores_(false);
  }

  /** La lista ya armada (CacheHojas): la hoja se pega a mano, así que se renueva al vencer o con
   *  el activador (Calentador.gs), que la rehace en cada vuelta. */
  function colaboradores_(rehacer) {
    return CacheHojas.recordar('colaboradores_v1', [[Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_CH]], armarColaboradores_,
      rehacer ? 25 * 60 : undefined, rehacer);
  }

  function armarColaboradores_() {
    const ss = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
    const hoja = ss.getSheetByName(HOJA_CH);
    if (!hoja) return [];
    const { filas } = leer_(hoja);
    const vistos = new Set();
    const resultado = [];
    filas.forEach((f) => {
      const nombre = String(f['NOMBRE COMPLETO'] || '').trim();
      if (!nombre) return;
      const departamento = String(f['DEPARTAMENTO'] || '').trim();
      const clave = nombre.toUpperCase() + '|' + departamento.toUpperCase();
      if (vistos.has(clave)) return;
      vistos.add(clave);
      resultado.push({
        NOMBRE: nombre,
        NO_EMPLEADO: String(f['No EMPLEADO'] || '').trim(),
        DEPARTAMENTO: departamento,
        PUESTO: String(f['PUESTO'] || '').trim(),
        SEDE: String(f['SEDE'] || '').trim(),
        OFICINA: String(f['OFICINA/DESARROLLO'] || '').trim(),
        CORREO: String(f['CORREO EMPRESARIAL'] || '').trim(),
      });
    });
    return resultado.sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE));
  }

  return {
    identificar, revisarLigas, idPara, columnasDePersona, describirLigas, personaDe, nombreComparable,
    listarColaboradores, calentarColaboradores: () => colaboradores_(true), HOJA_CH, HOJA_PERSONAS, claveEmpleo, COLUMNA,
  };
})();

// capitalHumano1Ensayo / capitalHumano2Escribir viven en MigracionFamilia.gs (pipeline 5):
// corren `personas` (identificar) y `ligar` (revisarLigas), igual que los demás pipelines.
