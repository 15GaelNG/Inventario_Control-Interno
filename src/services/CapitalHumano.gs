/**
 * CapitalHumano.gs
 *
 * Quién es quién. **El único lugar del código que lee personas** (contrato en source-contracts): la pestaña
 * COLABORADORES ACTUALIZADO, la lista de Capital Humano, con una columna más que pone la app: **ID PERSONA**
 * (12-oct-2026, docs/personas-unificar.md). Ya no hay otra pestaña de personas: PERSONAS (la de antes) y COLABORADORES
 * (la vieja) se retiran.
 *
 * Nadie pega en esa pestaña: la lista se sube desde Administración > Capital humano (cargar()), que la combina por
 * EMPLEO (número + nombre), nunca por renglón. Si alguien pegara encima, el ID de un renglón quedaría junto a otra
 * persona sin que nada truene; por eso la pestaña queda protegida (aviso) y la carga reescribe la hoja completa con
 * cada ID pegado a su empleo.
 *
 * Cada renglón es un EMPLEO, no una persona:
 *   - El mismo número se repite al recontratar a alguien (920 números, medido el 01/10/2026).
 *   - CH REUTILIZA números: HA00059 es de Francisco Ramírez y también de Vanessa Llera (11 números).
 *   - Una persona puede tener dos números a la vez: otra razón social o un ascenso (36 personas).
 *
 * Dos empleos son la misma persona (el mismo ID PERSONA) si:
 *   1. tienen el mismo número y el mismo nombre (una recontratación);
 *   2. tienen el mismo nombre y la misma fecha de nacimiento (sin fecha no se junta nada: hay homónimos);
 *   3. uno dice que el otro es su N. EMPLEADO ANTERIOR — salvo que ese número exista con OTRO nombre (reutilizado).
 *
 * Reglas que no se rompen:
 *   - Un ID dado nunca cambia. Si una carga nueva hace parecer que dos personas con ID son una, se avisa y no se toca.
 *   - Nunca se borra a nadie: quien no venga en el archivo se queda (sigue citado en documentos) y se avisa.
 *   - Solo entran las columnas de PERMITIDAS (sin NÚMERO DE CUENTA, CURP, RFC, CLABE, domicilio…). TELEFONO sí
 *     (usuario, 12-oct-2026). La fecha de nacimiento solo sirve para la regla 2.
 */
const CapitalHumano = (function () {
  const HOJA_CH = 'COLABORADORES ACTUALIZADO';
  /** La pestaña de antes (un renglón por empleo con su ID). Solo se lee si COLABORADORES ACTUALIZADO todavía no tiene
   *  su columna ID PERSONA (un DEV sin migrar). Se retira en la fase 4 del plan. */
  const HOJA_PERSONAS = 'PERSONAS';
  const COLUMNA = 'ID PERSONA';
  const HISTORIAL = 'CAPITAL HUMANO HISTORIAL';
  // Las ÚNICAS columnas de la lista de CH que viven en el libro de la app (más ID PERSONA): las que ya tenía la hoja de
  // producción, sin NÚMERO DE CUENTA (Ayrton, 01/10/2026; TELEFONO sí, 12-oct-2026). Es lista de permitidas, no de
  // prohibidas: el Excel de CH trae ~60 columnas (CURP, RFC, IMSS, domicilio, CLABE, banco, beneficiarios, INE…) y
  // con nombres que cambian (la cuenta llegó como CLABE el 12-oct); lo que no esté aquí no entra. Una columna nueva
  // que la app necesite se agrega aquí y en app-capital-humano.html (contrato).
  const PERMITIDAS = ['No EMPLEADO', 'No INGRESOS', 'OFICINA/DESARROLLO', 'SEDE', 'APELLIDO PATERNO', 'APELLIDO MATERNO',
    'NOMBRES', 'NOMBRE COMPLETO', 'ANTIGUEDAD', 'N. EMPLEADO ANTERIOR', 'STATUS', 'FECHA DE INGRESO', 'FECHA DE NACIMIENTO',
    'CORREO EMPRESARIAL', 'TELEFONO', 'DEPARTAMENTO', 'AREA', 'PUESTO', 'TIPO PUESTO', 'DIRECTOR', 'JEFE DIRECTO',
    'RAZON SOCIAL', 'TIPO CONTRATO', 'FECHA DE BAJA', 'MOTIVO DE BAJA'];
  /** Sin estas, un archivo no es la lista de CH: se rechaza antes de tocar nada */
  const OBLIGATORIAS = ['No EMPLEADO', 'NOMBRE COMPLETO', 'STATUS', 'N. EMPLEADO ANTERIOR', 'FECHA DE NACIMIENTO'];
  /** Un archivo con menos de esta parte de los renglones que ya hay se rechaza (¿se exportó solo una hoja, un filtro?) */
  const MINIMO_RENGLONES = 0.9;

  const norm = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().toUpperCase();
  const claveEmpleo = (numero, nombre) => norm(numero) + '|' + norm(nombre);
  const PERMITIDAS_N = PERMITIDAS.map((c) => String(c).replace(/\s+/g, ' ').trim().toUpperCase());
  /** Una columna que no debe estar en el libro: todo lo que no sea permitida ni la del ID */
  const esSensible = (c) => !!String(c == null ? '' : c).trim() && norm(c) !== COLUMNA && PERMITIDAS_N.indexOf(norm(c)) === -1;
  const esActivo = (f) => /^ACTIV/.test(norm(f['STATUS']));

  function libro_() {
    return SpreadsheetApp.openById(Config.SPREADSHEET_IDS.VEHICULOS());
  }

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

  /** La lista de CH como objetos (sin columnas sensibles). Solo para el servidor (p. ej. la revisión de INE de Líneas). */
  function filasCH() {
    const ch = leer_(libro_().getSheetByName(HOJA_CH));
    return ch.filas.map((f) => { const o = {}; Object.keys(f).forEach((k) => { if (!esSensible(k)) o[k] = f[k]; }); return o; });
  }

  /**
   * Lo ya identificado: { empleo (número|nombre) → ID PERSONA }. De la columna ID PERSONA de COLABORADORES ACTUALIZADO;
   * si la hoja todavía no la tiene (un DEV sin migrar), de PERSONAS.
   */
  function existentes_(ss, ch) {
    const ex = {};
    if (ch.encabezados.indexOf(COLUMNA) !== -1) {
      ch.filas.forEach((f) => { if (norm(f[COLUMNA])) ex[claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO'])] = norm(f[COLUMNA]); });
      return ex;
    }
    leer_(ss.getSheetByName(HOJA_PERSONAS)).filas.forEach((f) => {
      if (norm(f[COLUMNA])) ex[claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO'])] = norm(f[COLUMNA]);
    });
    return ex;
  }

  /** { número|nombre → ID PERSONA } (para quien tenga que cruzar por empleo, como la revisión de INE de Líneas) */
  function idsPorEmpleo() {
    const ss = libro_();
    return existentes_(ss, leer_(ss.getSheetByName(HOJA_CH)));
  }

  /**
   * Quién es quién (las tres reglas de arriba), puro: renglones de CH + lo ya identificado →
   * { asignado: {empleo → ID}, nuevos: [{numero, nombre, id, motivo}], avisos, conflictos, personasNuevas, ambiguos }.
   * Un empleo de un grupo con dos IDs distintos (conflicto) no recibe ID.
   */
  function identificarFilas_(filas, existentes) {
    const padre = {};
    const motivo = {};
    const datos = {};
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
    const renglones = {};    // empleos que sí son renglón de la lista
    filas.forEach((f) => {
      const numero = norm(f['No EMPLEADO']);
      if (!numero || !norm(f['NOMBRE COMPLETO'])) return;
      renglones[nodo(numero, f['NOMBRE COMPLETO'])] = true;
      (nombresPorNumero[numero] = nombresPorNumero[numero] || {})[norm(f['NOMBRE COMPLETO'])] = true;
    });

    // Regla 2: mismo nombre y misma fecha de nacimiento
    const porNacimiento = {};
    filas.forEach((f) => {
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
    const avisos = [];
    filas.forEach((f) => {
      const numero = norm(f['No EMPLEADO']);
      const nombre = norm(f['NOMBRE COMPLETO']);
      const anterior = norm(f['N. EMPLEADO ANTERIOR']);
      if (!numero || !nombre || !anterior || anterior === numero) return;
      const otros = nombresPorNumero[anterior];
      if (otros && !otros[nombre]) {
        avisos.push(numero + ' (' + nombre + ') dice que su número anterior es ' + anterior +
          ', pero en la lista ' + anterior + ' es de ' + Object.keys(otros).join(' / ') + '. No se juntaron.');
        return;
      }
      unir(nodo(anterior, nombre), claveEmpleo(numero, nombre), 'número anterior de ' + numero);
    });

    const grupos = {};
    Object.keys(datos).forEach((k) => { (grupos[raiz(k)] = grupos[raiz(k)] || []).push(k); });
    const asignado = {};
    const nuevos = [];
    const conflictos = [];
    let personasNuevas = 0;
    Object.keys(grupos).forEach((r) => {
      const ks = grupos[r];
      const ids = Array.from(new Set(ks.map((k) => existentes[k]).filter(Boolean)));
      ks.forEach((k) => { if (existentes[k]) asignado[k] = existentes[k]; });
      if (ids.length > 1) {
        conflictos.push('Parecen la misma persona pero ya tienen IDs distintos (' + ids.join(', ') + '): ' +
          ks.map((k) => datos[k].numero + ' ' + datos[k].nombre).join(' · ') + '. No se tocó.');
        return;
      }
      // Solo los empleos que son renglón de la lista: un número anterior (AC00255 de Ana) no tiene renglón donde vivir;
      // sirve para juntar y se encuentra por la columna N. EMPLEADO ANTERIOR
      const faltan = ks.filter((k) => !existentes[k] && renglones[k]);
      if (!faltan.length) return;
      let id = ids[0];
      if (!id) { id = Ids.nuevo(Entidades.prefijo(HOJA_PERSONAS)); personasNuevas++; }
      faltan.forEach((k) => {
        asignado[k] = id;
        nuevos.push({ numero: datos[k].numero, nombre: datos[k].nombre, id: id,
          motivo: motivo[k] || (ids.length ? 'otro empleo de una persona ya identificada' : 'persona nueva') });
      });
    });
    const ambiguos = Object.keys(nombresPorNumero).filter((n) => Object.keys(nombresPorNumero[n]).length > 1);
    return { asignado, nuevos, avisos, conflictos, personasNuevas, ambiguos, personas: new Set(Object.keys(renglones).map((k) => asignado[k] || raiz(k))).size };
  }

  /** Escribe la columna ID PERSONA (la crea al final si falta) con el ID de cada renglón según su empleo */
  function escribirColumna_(hoja, ch, asignado) {
    let col = ch.encabezados.indexOf(COLUMNA) + 1;
    if (!col) {
      col = ch.encabezados.length + 1;
      if (hoja.getMaxColumns() < col) hoja.insertColumnsAfter(hoja.getMaxColumns(), col - hoja.getMaxColumns());
      hoja.getRange(1, col).setValue(COLUMNA);
    }
    // Por renglón de la hoja (leer_ se salta los vacíos: aquí se recorre la hoja tal cual)
    const n = hoja.getLastRow() - 1;
    if (n < 1) return;
    const enc = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getDisplayValues()[0].map((h) => String(h).trim());
    const iNum = enc.indexOf('No EMPLEADO');
    const iNom = enc.indexOf('NOMBRE COMPLETO');
    const valores = hoja.getRange(2, 1, n, enc.length).getDisplayValues();
    hoja.getRange(2, col, n, 1).setValues(valores.map((r) => [asignado[claveEmpleo(r[iNum], r[iNom])] || r[col - 1] || '']));
    CacheHojas.tocarHoja(hoja);
  }

  /**
   * Desde el editor (pipeline 5, capitalHumano1Ensayo / capitalHumano2Escribir): pone el ID PERSONA a los renglones de
   * COLABORADORES ACTUALIZADO que no lo tienen. Regresa el reporte en texto. La carga desde la app (cargar) hace lo mismo.
   */
  function identificar(opciones) {
    const cfg = Object.assign({ escribir: false }, opciones || {});
    if (!cfg.escribir) return identificarSinCandado_(cfg);
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
    const hojaCh = ss.getSheetByName(HOJA_CH);
    if (!hojaCh) throw new Error('No existe la pestaña "' + HOJA_CH + '": súbela desde Administración > Capital humano.');
    const ch = leer_(hojaCh);
    OBLIGATORIAS.forEach((c) => {
      if (ch.encabezados.indexOf(c) === -1) throw new Error('A "' + HOJA_CH + '" le falta la columna "' + c + '".');
    });
    const existentes = existentes_(ss, ch);
    const r = identificarFilas_(ch.filas, existentes);
    const avisos = r.conflictos.concat(r.avisos);
    const sensibles = ch.encabezados.filter(esSensible);
    if (sensibles.length) {
      avisos.unshift('La hoja trae datos sensibles que no deben estar en el libro: ' + sensibles.join(', ') +
        '. La próxima carga desde Administración > Capital humano los quita.');
    }
    lineas.push('  ' + ch.filas.length + ' empleos en la lista de Capital Humano');
    lineas.push('  ' + r.personas + ' personas (' + r.personasNuevas + ' nuevas)');
    lineas.push('  ' + r.nuevos.length + ' empleos por identificar · ' + Object.keys(existentes).length + ' ya identificados');
    lineas.push('  ' + r.ambiguos.length + ' números usados por más de una persona (ambiguos)' +
      (r.ambiguos.length ? ' — ' + r.ambiguos.slice(0, 10).join(', ') + (r.ambiguos.length > 10 ? '…' : '') : ''));
    if (r.conflictos.length) lineas.push('  ' + r.conflictos.length + ' conflictos: personas con ID distinto que ahora parecen una (ver AVISOS)');
    if (avisos.length) {
      lineas.push('', 'AVISOS (' + avisos.length + '):');
      avisos.slice(0, 40).forEach((a) => lineas.push('  - ' + a));
      if (avisos.length > 40) lineas.push('  … y ' + (avisos.length - 40) + ' más');
    }
    if (cfg.escribir && r.nuevos.length) {
      escribirColumna_(hojaCh, ch, r.asignado);
      lineas.push('', '  ' + r.nuevos.length + ' empleos identificados en ' + HOJA_CH + ' (columna ' + COLUMNA + ')');
    } else if (!cfg.escribir) {
      lineas.push('', 'Si cuadra, corre capitalHumano2Escribir.');
    }
    const texto = lineas.join('\n');
    Logger.log(texto);
    return texto;
  }

  // ======================================================================
  // Cargar la lista de CH desde Administración > Capital humano (solo admins)
  // ======================================================================

  /** Para emparejar renglones (no personas): un empleo puede tener varios ingresos */
  const claveRenglon_ = (f) => claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO']) + '|' + norm(f['FECHA DE INGRESO']);

  /**
   * Sube la lista de CH: { encabezados, filas: [[…]] } en JSON, comprimido (gzip) y en base64 (así viaja chico).
   * El navegador ya quitó lo sensible; aquí se quita otra vez por si acaso. Con opciones.escribir reescribe
   * COLABORADORES ACTUALIZADO completa: los renglones del archivo (cada uno con el ID PERSONA de su empleo) y, al final,
   * los que ya estaban y no vienen (nunca se borra a nadie). Sin escribir, es el ensayo.
   * → { ensayo, renglones, nuevos, cambian, faltan, personasNuevas, empleosNuevos, conflictos, avisos, quitadas }
   */
  function cargar(token, comprimido, opciones) {
    const sesion = Permisos.puedeEditar(token, 'capital-humano');
    const cfg = Object.assign({ escribir: false }, opciones || {});
    const subido = JSON.parse(Utilities.ungzip(Utilities.newBlob(Utilities.base64Decode(comprimido), 'application/x-gzip'))
      .getDataAsString('UTF-8'));
    const encArchivo = (subido.encabezados || []).map((h) => String(h == null ? '' : h).replace(/\s+/g, ' ').trim());
    const faltan = OBLIGATORIAS.filter((c) => encArchivo.indexOf(c) === -1);
    if (faltan.length) throw new Error('El archivo no parece la lista de Capital Humano: le falta ' + faltan.join(', ') + '.');
    const quitadas = encArchivo.filter(esSensible);
    const filasArchivo = (subido.filas || []).map((r) => {
      const o = {};
      encArchivo.forEach((h, i) => { if (h && !esSensible(h) && h !== COLUMNA) o[h] = String(r[i] == null ? '' : r[i]).trim(); });
      return o;
    }).filter((f) => norm(f['No EMPLEADO']) && norm(f['NOMBRE COMPLETO']));

    const lock = cfg.escribir ? LockService.getScriptLock() : null;
    if (lock) lock.waitLock(30000);
    try {
      const ss = libro_();
      let hoja = ss.getSheetByName(HOJA_CH);
      const actual = leer_(hoja);
      if (actual.filas.length && filasArchivo.length < actual.filas.length * MINIMO_RENGLONES) {
        throw new Error('El archivo trae ' + filasArchivo.length + ' renglones y la lista tiene ' + actual.filas.length +
          ': ¿es la lista completa (activos y bajas)? No se cambió nada.');
      }
      const existentes = existentes_(ss, actual);
      // Los que ya estaban y no vienen se quedan; cuentan para identificar (sus números anteriores, sus fechas)
      const enArchivo = {};
      filasArchivo.forEach((f) => { enArchivo[claveRenglon_(f)] = true; });
      const seQuedan = actual.filas.filter((f) => !enArchivo[claveRenglon_(f)]);
      const r = identificarFilas_(filasArchivo.concat(seQuedan), existentes);

      // Qué cambia, renglón por renglón (para el ensayo)
      const antes = {};
      actual.filas.forEach((f) => { antes[claveRenglon_(f)] = f; });
      let nuevos = 0;
      let cambian = 0;
      filasArchivo.forEach((f) => {
        const a = antes[claveRenglon_(f)];
        if (!a) { nuevos++; return; }
        if (Object.keys(f).some((c) => norm(f[c]) !== norm(a[c]))) cambian++;
      });

      // Las columnas: las del archivo (sin lo sensible), luego las que la hoja tenía y el archivo no, y al final el ID
      const encabezados = encArchivo.filter((h) => h && !esSensible(h) && h !== COLUMNA);
      actual.encabezados.forEach((h) => { if (h && !esSensible(h) && h !== COLUMNA && encabezados.indexOf(h) === -1) encabezados.push(h); });
      encabezados.push(COLUMNA);
      const resultado = {
        ensayo: !cfg.escribir, renglones: filasArchivo.length, nuevos: nuevos, cambian: cambian, faltan: seQuedan.length,
        empleosNuevos: r.nuevos.length, personasNuevas: r.personasNuevas, conflictos: r.conflictos,
        avisos: r.avisos.concat(seQuedan.slice(0, 50).map((f) => 'No viene en el archivo y se queda: ' + norm(f['No EMPLEADO']) + ' ' + norm(f['NOMBRE COMPLETO']))),
        quitadas: quitadas.concat(actual.encabezados.filter(esSensible)).filter((v, i, a) => a.indexOf(v) === i),
      };
      if (!cfg.escribir) return resultado;

      const filas = filasArchivo.concat(seQuedan).map((f) => encabezados.map((h) =>
        (h === COLUMNA ? r.asignado[claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO'])] || '' : (f[h] == null ? '' : String(f[h])))));
      if (!hoja) hoja = ss.insertSheet(HOJA_CH);
      hoja.clearContents();
      const total = filas.length + 1;
      if (hoja.getMaxRows() < total) hoja.insertRowsAfter(hoja.getMaxRows(), total - hoja.getMaxRows());
      if (hoja.getMaxColumns() < encabezados.length) hoja.insertColumnsAfter(hoja.getMaxColumns(), encabezados.length - hoja.getMaxColumns());
      // Texto: que Sheets no convierta un número de empleado o una fecha
      hoja.getRange(1, 1, total, encabezados.length).setNumberFormat('@');
      hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
      if (filas.length) hoja.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
      // Las columnas no permitidas que tuviera la hoja quedan vacías al final: se quitan
      if (hoja.getMaxColumns() > encabezados.length) hoja.deleteColumns(encabezados.length + 1, hoja.getMaxColumns() - encabezados.length);
      proteger_(hoja);
      CacheHojas.tocarHoja(hoja);
      colaboradores_(true);
      anotarHistorial_(ss, sesion, resultado);
      return resultado;
    } finally {
      if (lock) lock.releaseLock();
    }
  }

  /** Que quien la abra sepa que no se pega a mano (solo aviso: la app escribe con la cuenta que despliega) */
  function proteger_(hoja) {
    try {
      if (hoja.getProtections(SpreadsheetApp.ProtectionType.SHEET).length) return;
      hoja.protect().setWarningOnly(true).setDescription('La actualiza la app: Administración > Capital humano. No pegues aquí: ' +
        'los ID PERSONA quedarían junto a otra persona.');
    } catch (e) {
      console.warn('Capital humano: no se pudo proteger la pestaña: ' + e.message);
    }
  }

  function anotarHistorial_(ss, sesion, r) {
    try {
      let h = ss.getSheetByName(HISTORIAL);
      if (!h) {
        h = ss.insertSheet(HISTORIAL);
        h.appendRow(['FECHA', 'QUIEN', 'RENGLONES', 'NUEVOS', 'CAMBIAN', 'NO VINIERON', 'EMPLEOS NUEVOS', 'PERSONAS NUEVAS', 'AVISOS']);
      }
      h.appendRow([new Date(), (sesion && sesion.correo) || '', r.renglones, r.nuevos, r.cambian, r.faltan, r.empleosNuevos,
        r.personasNuevas, r.conflictos.concat(r.avisos).slice(0, 20).join('\n')]);
    } catch (e) {
      console.warn('Capital humano: no se pudo anotar el historial: ' + e.message);
    }
  }

  /** Las últimas cargas (para la pantalla), de la más nueva a la más vieja */
  function historial(token) {
    Permisos.puedeLeer(token, 'capital-humano');
    const h = libro_().getSheetByName(HISTORIAL);
    if (!h || h.getLastRow() < 2) return [];
    const desde = Math.max(2, h.getLastRow() - 19);
    const v = h.getRange(desde, 1, h.getLastRow() - desde + 1, 9).getDisplayValues();
    return v.reverse().map((r) => ({ FECHA: r[0], QUIEN: r[1], RENGLONES: r[2], NUEVOS: r[3], CAMBIAN: r[4], FALTAN: r[5],
      EMPLEOS_NUEVOS: r[6], PERSONAS_NUEVAS: r[7], AVISOS: r[8] }));
  }

  /** Cuántos hay hoy (para la pantalla) */
  function resumen(token) {
    Permisos.puedeLeer(token, 'capital-humano');
    const ch = leer_(libro_().getSheetByName(HOJA_CH));
    return {
      renglones: ch.filas.length,
      activos: ch.filas.filter(esActivo).length,
      sinId: ch.filas.filter((f) => !norm(f[COLUMNA])).length,
      tieneColumna: ch.encabezados.indexOf(COLUMNA) !== -1,
      sensibles: ch.encabezados.filter(esSensible),
    };
  }

  // ======================================================================
  // Ligar a los responsables con su persona (ID PERSONA)
  // ======================================================================
  //
  // Los formularios capturan el NOMBRE como texto: MANDA EL NOMBRE (decisión de Ayrton, 01/10/2026). ID PERSONA se
  // calcula de él al guardar (conPersona) y nunca se toca un nombre que alguien escribió.
  //
  // Por qué nombre primero y no número: en VEHICULOS, 152 de 654 traen en NO EMPLEADO el número de OTRA persona
  // (medido 01/10/2026; quedó viejo al reasignar). El número solo desempata homónimos.

  /**
   * Cada hoja que guarda a una persona: de qué columnas sale, en qué columna va su ID y con qué se reconoce el renglón.
   * `persona: true` en una definición de HojaServicio usa la liga de su hoja. opcional: si la pestaña no existe en el
   * libro (LINEAS TELEFONICAS solo vive en el libro de pruebas de Líneas) no es error.
   */
  const VEH = () => Config.SPREADSHEET_IDS.VEHICULOS();
  const TEL = () => Config.SPREADSHEET_IDS.TELEFONIA();
  const LIGAS = [
    { nombre: 'VEHICULOS (persona)', hoja: 'VEHICULOS', libro: VEH, columnaNombre: 'RESPONSABLE VEHICULO', columnaNumero: 'NO EMPLEADO', etiqueta: 'FOLIO' },
    { nombre: 'CAJAS CHICAS (persona)', hoja: 'CAJAS CHICAS', libro: VEH, columnaNombre: 'RESPONSABLE DE CAJA CHICA',
      columnaCorreo: 'CORREO ELECTRONICO DE RESPONSABLE', etiqueta: 'ID CCH' },
    // Líneas: la persona vive en ASIGNACIONES desde la reestructura (LINEAS TELEFONICAS ya no existe en producción)
    { nombre: 'ASIGNACIONES (persona)', hoja: 'ASIGNACIONES', libro: TEL, columnaNombre: 'RESPONSABLE', columnaNumero: 'NO EMPLEADO',
      columnaCorreo: 'CUENTA GOOGLE', etiqueta: 'ID' },
    { nombre: 'LINEAS TELEFONICAS (persona)', hoja: 'LINEAS TELEFONICAS', libro: TEL, columnaNombre: 'RESPONSABLE', columnaNumero: 'NO EMPLEADO',
      columnaCorreo: 'EMAIL USUARIO', etiqueta: 'NUCO', opcional: true },
    { nombre: 'RESPONSIVA VEHICULAR (persona)', hoja: 'RESPONSIVA VEHICULAR', libro: VEH, columnaNombre: 'RESPONSABLE', columnaNumero: 'NO EMPLEADO', etiqueta: 'ID' },
    { nombre: 'ADHERENTE VEHICULAR (persona)', hoja: 'ADHERENTE VEHICULAR', libro: VEH, columnaNombre: 'ADHERENTE', columnaNumero: 'NO EMPLEADO', etiqueta: 'ID' },
    { nombre: 'REASIGNACIONES (persona entrante)', hoja: 'REASIGNACIONES_VEHICULOS', libro: VEH, columnaNombre: 'Responsable Entrante',
      columnaNumero: 'No Empleado Entrante', etiqueta: 'ID' },
    { nombre: 'INSPECCION VEHICULAR (conductor)', hoja: 'INSPECCION VEHICULAR', libro: VEH, columnaNombre: 'CONDUCTOR', etiqueta: 'ID INSPECCION',
      columna: 'ID PERSONA CONDUCTOR' },
    { nombre: 'UBER (persona)', hoja: 'UBER', libro: VEH, columnaNombre: 'NOMBRE COMPLETO', columnaCorreo: 'CORREO ELECTRONICO', etiqueta: 'ID' },
    { nombre: 'ARQUEOS (responsable)', hoja: 'ARQUEOS', libro: VEH, columnaNombre: 'RESPONSABLE', etiqueta: 'ID ARQUEO' },
    { nombre: 'TICKETS (solicitante)', hoja: 'TICKETS', libro: VEH, columnaNombre: 'SOLICITANTE', etiqueta: 'TICKET' },
  ];
  const columnaDe_ = (l) => l.columna || COLUMNA;
  const ligaDe_ = (hoja) => LIGAS.filter((x) => x.hoja === hoja)[0] || null;

  /**
   * Lo que se escribe donde iría una persona y NO es una persona: es normal, no un error.
   * Medido el 01/10/2026: BAJA VEHICULAR ×104 en VEHICULOS, CANCELACION ×17 en Líneas…
   */
  const NO_PERSONA = ['BAJA VEHICULAR', 'NUCO SIN INFORMACION', 'DONACION', 'FUERA DE SERVICIO', 'POR ASIGNAR',
    'SIN ESPECIFICAR', 'CANCELACION', 'NO APLICA', 'N/A', 'NA', '-', 'NO SE ENCUENTRA EN CH', 'SIN ASIGNAR'];
  const ES_CODIGO = /^[A-Z]{1,4}-?\d/;

  const sinAcentos = (s) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  /**
   * El nombre como para comparar: sin acentos, sin títulos (LIC., ING., ARQ., C.P.), sin paréntesis ("(CERRADA)") y con
   * MA. = MARIA. Conservador a propósito: lo que no sea una de estas variantes conocidas no se adivina.
   */
  function nombreComparable(s) {
    return sinAcentos(s)
      .replace(/\([^)]*\)/g, ' ')
      .replace(/^(LIC|ING|ARQ|C\.?P|DR|DRA|MTRO|MTRA)\.?\s+/, '')
      .replace(/\bMA\.?\s/g, 'MARIA ')
      .replace(/\s+/g, ' ').trim();
  }

  /**
   * Índice de personas de COLABORADORES ACTUALIZADO: por nombre comparable, por número (también el N. EMPLEADO
   * ANTERIOR: documentos viejos citan a la persona con él) y por correo. null si la hoja todavía no tiene IDs.
   */
  function indice_(ss) {
    const ch = leer_(ss.getSheetByName(HOJA_CH));
    const existentes = existentes_(ss, ch);
    if (!Object.keys(existentes).length) return null;
    const agregar = (mapa, clave, id) => { if (clave) (mapa[clave] = mapa[clave] || {})[id] = true; };
    const ix = { porNombre: {}, porNumero: {}, porCorreo: {}, etiqueta: {} };
    const visto = (numero, nombre, id) => {
      agregar(ix.porNombre, nombreComparable(nombre), id);
      agregar(ix.porNumero, norm(numero), id);
      if (!ix.etiqueta[id]) ix.etiqueta[id] = norm(nombre) + ' · ' + norm(numero);
    };
    ch.filas.forEach((f) => {
      const id = existentes[claveEmpleo(f['No EMPLEADO'], f['NOMBRE COMPLETO'])];
      if (!id) return;
      visto(f['No EMPLEADO'], f['NOMBRE COMPLETO'], id);
      if (norm(f['N. EMPLEADO ANTERIOR'])) agregar(ix.porNumero, norm(f['N. EMPLEADO ANTERIOR']), id);
      const correo = String(f['CORREO EMPRESARIAL'] || '').trim().toLowerCase();
      if (correo.indexOf('@') > 0) agregar(ix.porCorreo, correo, id);
    });
    // Un DEV sin migrar: los empleos de PERSONAS que no son renglón de CH (números anteriores) también cuentan
    if (ch.encabezados.indexOf(COLUMNA) === -1) {
      leer_(ss.getSheetByName(HOJA_PERSONAS)).filas.forEach((f) => { if (norm(f[COLUMNA])) visto(f['No EMPLEADO'], f['NOMBRE COMPLETO'], norm(f[COLUMNA])); });
    }
    return ix;
  }

  /** El índice de esta ejecución (una alta masiva no relee la lista por renglón) */
  let indiceCache_ = null;
  function indiceGuardado_() {
    if (!indiceCache_) indiceCache_ = { ix: indice_(libro_()) };
    return indiceCache_.ix;
  }

  /**
   * La persona de un responsable: { id, como } si se encontró; si no, { id: '', tipo, motivo } con el tipo que Salud
   * entiende (normal, a mano, homónimos).
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
   * Nunca escribe un ID vacío encima de uno que había.
   *
   * @param {Object} opciones  { escribir, hojas: [nombres de liga], filas, quien, detalle }
   */
  function revisarLigas(opciones) {
    const cfg = Object.assign({ escribir: false }, opciones || {});
    const resultado = {};
    const soloFilas = Array.isArray(cfg.filas) && cfg.filas.length ? cfg.filas.map(Number) : null;
    const ix = indice_(libro_());
    if (!ix) throw new Error('Todavía no hay ID PERSONA en ' + HOJA_CH + ': sube la lista desde Administración > Capital humano.');
    LIGAS.filter((l) => !cfg.hojas || cfg.hojas.indexOf(l.nombre) !== -1).forEach((l) => {
      const columna = columnaDe_(l);
      const r = { tipo: 'cache', revisadas: 0, diferencias: 0, huerfanos: 0, clavesDuplicadasOmitidas: 0, centinelasOmitidos: 0,
        vaciosOmitidos: 0, diferenciasHistoricas: 0, sinDuenoEsperado: 0, emparejadasPorId: 0, emparejadasPorClave: 0, corregido: false };
      const entradas = [];
      let hoja;
      try {
        hoja = SpreadsheetApp.openById(l.libro()).getSheetByName(l.hoja);
        if (!hoja) {
          if (l.opcional) return;
          throw new Error('no existe la pestaña ' + l.hoja);
        }
      } catch (err) {
        resultado[l.nombre] = r;
        r.error = err.message;
        return;
      }
      resultado[l.nombre] = r;
      Object.defineProperty(r, 'entradas', { value: entradas });
      const enc = migEncabezados_(hoja);
      let col = migColumna_(enc, columna);
      const filas = leer_(hoja).filas;
      const nuevos = [];
      filas.forEach((f, i) => {
        const fila = i + 2;
        const p = personaDe(ix, l.columnaNumero ? f[l.columnaNumero] : '', f[l.columnaNombre], l.columnaCorreo ? f[l.columnaCorreo] : '');
        const tenia = norm(f[columna]);
        if (p.tipo === 'VACIO') { nuevos.push([f[columna] || '']); return; }
        r.revisadas++;
        const base = { hoja: l.hoja, fila: fila, clave: norm(f[l.columnaNombre]), dueno: String(f[l.etiqueta] || '').trim(), columna: columna };
        if (p.id) {
          if (p.como === 'correo' || p.como === 'nombre') r.emparejadasPorClave++; else r.emparejadasPorId++;
          if (tenia === p.id) { nuevos.push([p.id]); return; }
          r.diferencias++;
          entradas.push(Object.assign({ tipo: 'DIFERENCIA', tenia: tenia ? (ix.etiqueta[tenia] || tenia) : '', quedo: ix.etiqueta[p.id] || p.id }, base));
          nuevos.push([cfg.escribir && (!soloFilas || soloFilas.indexOf(fila) !== -1) ? p.id : (f[columna] || '')]);
          return;
        }
        nuevos.push([f[columna] || '']);
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
          hoja.getRange(1, col).setValue(columna);
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
   * El ID PERSONA de un registro que se está guardando. '' si no se puede ligar; null si la hoja no se liga o todavía no
   * hay IDs (y entonces no se toca nada).
   */
  function idPara(hoja, registro) {
    const l = ligaDe_(hoja);
    if (!l) return null;
    let ix;
    try { ix = indiceGuardado_(); } catch (e) { return null; }
    if (!ix) return null;
    return personaDe(ix, l.columnaNumero ? registro[l.columnaNumero] : '', registro[l.columnaNombre],
      l.columnaCorreo ? registro[l.columnaCorreo] : '').id;
  }

  /** Las columnas que, si cambian, cambian a la persona de un registro de `hoja`. */
  function columnasDePersona(hoja) {
    const l = ligaDe_(hoja);
    return l ? [l.columnaNombre, l.columnaNumero, l.columnaCorreo].filter(Boolean) : [];
  }

  /** La columna donde va el ID de la persona en `hoja` ('ID PERSONA', o la suya: INSPECCION → ID PERSONA CONDUCTOR) */
  function columnaPara(hoja) {
    const l = ligaDe_(hoja);
    return l ? columnaDe_(l) : COLUMNA;
  }

  /**
   * Al guardar: si en `datos` cambia la persona (nombre, número o correo), le pone su ID PERSONA, calculado del
   * `registro` como va a quedar. El ID nunca lo manda el cliente (se ignora). Nunca truena: un ID que no se pudo calcular
   * lo pone al día Salud después. Lo usan HojaServicio (`persona: true`) y los servicios escritos a mano.
   */
  function conPersona(hoja, datos, registro) {
    const columna = columnaPara(hoja);
    delete datos[columna];
    if (!columnasDePersona(hoja).some((c) => datos[c] !== undefined)) return datos;
    try {
      const id = idPara(hoja, registro || datos);
      if (id !== null) datos[columna] = id;
    } catch (err) {
      console.error('CapitalHumano: no se pudo calcular la persona de ' + hoja + ': ' + err.message);
    }
    return datos;
  }

  /** Para Datos conectados y Salud: las ligas como si fueran copias del MAPA. */
  function describirLigas() {
    return LIGAS.filter((l) => !l.opcional).map((l) => ({ nombre: l.nombre, hoja: l.hoja, columna: columnaDe_(l), etiqueta: l.etiqueta,
      desde: [l.columnaCorreo, l.columnaNombre, l.columnaNumero].filter(Boolean) }));
  }

  // ======================================================================
  // Las listas para elegir a una persona (solo activos; se puede escribir otro nombre a mano)
  // ======================================================================

  /**
   * Los ACTIVOS de la lista, para autocompletar "Responsable", "Nombre completo"… en cualquier módulo: al elegir a
   * alguien se sugieren sus datos. Uno por nombre + departamento. Sin Razón social (es del contrato, no de la persona)
   * ni nada sensible. Líneas usa esta misma lista (LineasRepo.indiceColaboradores).
   */
  function listarColaboradores(token) {
    Auth.validarSesion(token);
    return colaboradores_(false);
  }
  const activos = () => colaboradores_(false);

  function colaboradores_(rehacer) {
    return CacheHojas.recordar('colaboradores_v2', [[Config.SPREADSHEET_IDS.VEHICULOS(), HOJA_CH]], armarColaboradores_,
      rehacer ? 25 * 60 : undefined, rehacer);
  }

  function armarColaboradores_() {
    const hoja = libro_().getSheetByName(HOJA_CH);
    if (!hoja) return [];
    const vistos = new Set();
    const resultado = [];
    leer_(hoja).filas.forEach((f) => {
      const nombre = String(f['NOMBRE COMPLETO'] || '').trim();
      if (!nombre || !esActivo(f)) return;
      const departamento = String(f['DEPARTAMENTO'] || '').trim();
      const clave = nombre.toUpperCase() + '|' + departamento.toUpperCase();
      if (vistos.has(clave)) return;
      vistos.add(clave);
      resultado.push({
        ID_PERSONA: norm(f[COLUMNA]),
        NOMBRE: nombre,
        NO_EMPLEADO: String(f['No EMPLEADO'] || '').trim(),
        DEPARTAMENTO: departamento,
        AREA: String(f['AREA'] || '').trim(),
        PUESTO: String(f['PUESTO'] || '').trim(),
        SEDE: String(f['SEDE'] || '').trim(),
        OFICINA: String(f['OFICINA/DESARROLLO'] || '').trim(),
        JEFE_DIRECTO: String(f['JEFE DIRECTO'] || '').trim(),
        DIRECTOR: String(f['DIRECTOR'] || '').trim(),
        CORREO: String(f['CORREO EMPRESARIAL'] || '').trim(),
        ESTATUS: 'ACTIVO',
      });
    });
    return resultado.sort((a, b) => a.NOMBRE.localeCompare(b.NOMBRE));
  }

  return {
    identificar, cargar, historial, resumen, revisarLigas, idPara, conPersona, columnasDePersona, columnaPara, describirLigas,
    personaDe, nombreComparable, listarColaboradores, activos, calentarColaboradores: () => colaboradores_(true), filasCH,
    idsPorEmpleo, HOJA_CH, HOJA_PERSONAS, claveEmpleo, COLUMNA, PERMITIDAS, OBLIGATORIAS,
  };
})();

// capitalHumano1Ensayo / capitalHumano2Escribir viven en MigracionFamilia.gs (pipeline 5).
