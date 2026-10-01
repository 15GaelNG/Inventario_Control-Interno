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
 * Desde el editor: capitalHumano1Ensayo (no escribe) y capitalHumano2Escribir.
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

    lineas.push('  Empleos en la lista de CH: ' + ch.filas.length);
    lineas.push('  Personas: ' + personas + ' (' + personasNuevas + ' nuevas)');
    lineas.push('  Empleos por identificar: ' + nuevos.length + ' · ya identificados: ' + Object.keys(existentes).length);
    lineas.push('  Números usados por más de una persona (ambiguos): ' + ambiguos.length +
      (ambiguos.length ? ' — ' + ambiguos.slice(0, 10).join(', ') + (ambiguos.length > 10 ? '…' : '') : ''));
    if (conflictos) lineas.push('  Conflictos: ' + conflictos);
    if (avisos.length) {
      lineas.push('', 'AVISOS (' + avisos.length + '):');
      avisos.slice(0, 40).forEach((a) => lineas.push('  - ' + a));
      if (avisos.length > 40) lineas.push('  … y ' + (avisos.length - 40) + ' más');
    }

    if (cfg.escribir && nuevos.length) {
      const lock = LockService.getScriptLock();
      lock.waitLock(30000);
      try {
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
        lineas.push('', '  Escritos ' + nuevos.length + ' empleos en ' + HOJA_PERSONAS + '.');
      } finally {
        lock.releaseLock();
      }
    } else if (!cfg.escribir) {
      lineas.push('', 'Si cuadra, corre capitalHumano2Escribir.');
    }
    const texto = lineas.join('\n');
    Logger.log(texto);
    return texto;
  }

  return { identificar, HOJA_CH, HOJA_PERSONAS, claveEmpleo };
})();

/** Ensayo: cuántas personas salen de la lista de CH y qué se agregaría a PERSONAS. No escribe. */
function capitalHumano1Ensayo() {
  return CapitalHumano.identificar();
}

/** Agrega a PERSONAS los empleos que todavía no tienen ID. Nunca cambia uno que ya lo tiene. */
function capitalHumano2Escribir() {
  return CapitalHumano.identificar({ escribir: true });
}
