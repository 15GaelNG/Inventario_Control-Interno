/**
 * Plantilla.gs
 * Entiende los marcadores << >> de las plantillas que ya existen (las que llenaba AppSheet),
 * para poder seguir usando LOS MISMOS documentos de Google Docs sin editarlos.
 *
 * Por qué no se reescribieron las plantillas a un formato más simple: son 19 documentos
 * con miles de marcadores y mucho diseño. Tocarlos a mano es caro y arriesga el formato;
 * además, mientras AppSheet siga vivo, el mismo documento debe servir en los dos sistemas.
 *
 * Lo que se usa en las plantillas reales (medido sobre los 19 archivos):
 *   5254  <<IF([CAMPO] = "VALOR", "✓", "")>>   expresión con resultado
 *    675  <<[CAMPO]>>                           valor del campo
 *    249  <<If:(condición)>> … <<EndIf>>        bloque que aparece o no
 *    108  <<CAMPO>>                             igual, sin corchetes
 *     12  <<[CAMPO] * 0.50>>                    multiplicación (arqueos)
 *      3  <<UPPER([CAMPO])>>                    a mayúsculas
 *
 * Desde el 9-nov (fase 2 del motor único de PDF, docs/pdf-motor.md) es UN analizador para las plantillas de Vehículos
 * y de Líneas: la estructura del de LineasPdf (piezas + precedencia) con las reglas de aquí. Entiende comparaciones
 * (= <> < > <= >=), & para unir textos, + - * /, paréntesis y las funciones IF AND OR NOT UPPER LOWER RIGHT LEFT LEN
 * CONCATENATE ISBLANK ISNOTBLANK ROUND TEXT TODAY NOW. Reglas: al comparar texto no importan los espacios de más ni
 * las mayúsculas; < > <= >= solo con números (un vacío no cumple: la llanta sin medir); una cuenta con un vacío da
 * vacío. Las fechas las formatea cada módulo antes (PdfService.textoDeFecha_); el motor solo llena.
 *
 * Regla importante: si aparece algo que este motor NO entiende, LANZA ERROR en vez de
 * dejarlo en blanco. Un documento con datos silenciosamente incompletos es peor que uno
 * que no se generó: nadie se daría cuenta hasta que el papel ya está firmado.
 */

const Plantilla = (function () {
  /** Todos los marcadores de un texto, en orden y sin repetir */
  function marcadores(texto) {
    const encontrados = [];
    const vistos = {};
    // Sin avaricia: la condición puede traer < y >, pero nunca ">>"
    String(texto || '').replace(/<<([\s\S]*?)>>/g, (todo) => {
      if (!vistos[todo]) { vistos[todo] = true; encontrados.push(todo); }
      return todo;
    });
    return encontrados;
  }

  const limpiar_ = (v) => String(v == null ? '' : v).trim();

  /** Nombre de campo → valor de los datos. Acepta "[CAMPO]" y "CAMPO", sin importar mayúsculas ni espacios a los lados. */
  function valorCampo(nombre, datos) {
    const clave = limpiar_(nombre).replace(/^\[|\]$/g, '').trim();
    if (Object.prototype.hasOwnProperty.call(datos, clave)) return datos[clave];
    // Búsqueda tolerante: las plantillas y las hojas no siempre coinciden en mayúsculas
    const buscado = clave.toUpperCase();
    const encontrada = Object.keys(datos).find((k) => k.toUpperCase().trim() === buscado);
    return encontrada === undefined ? '' : datos[encontrada];
  }

  const aNumero_ = (v) => {
    if (typeof v === 'number') return isNaN(v) ? null : v;
    const texto = String(v == null ? '' : v).replace(/[$,\s]/g, '');
    // Ojo: Number('') es 0, no NaN. Sin esta guarda, una llanta sin medir se compararía
    // como 0 mm y saldría en el documento como desgastada al límite.
    if (texto === '') return null;
    const n = Number(texto);
    return isNaN(n) ? null : n;
  };

  function formatearNumero_(n) {
    return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
  }

  /** Una fecha que llegó sin formatear: solo el día (cada módulo manda sus fechas ya como texto, PdfService.textoDeFecha_) */
  function textoDeFecha_(f) {
    if (typeof Utilities !== 'undefined') return Utilities.formatDate(f, 'America/Mexico_City', 'dd/MM/yyyy');
    const d = (n) => String(n).padStart(2, '0');
    return d(f.getDate()) + '/' + d(f.getMonth() + 1) + '/' + f.getFullYear();
  }

  /** El resultado de una expresión como texto: número con a lo más 2 decimales, sí/no como Y/N (AppSheet) */
  function aTexto_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return textoDeFecha_(v);
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    if (typeof v === 'number') return formatearNumero_(v);
    return String(v);
  }

  // ---------------- El analizador (fase 2 del motor único de PDF, 9-nov) ----------------
  // Uno solo para todas las plantillas: la estructura del de Líneas (piezas + precedencia) con las reglas de aquí
  // (espacios de más, número vacío, lo desconocido lanza error).

  /** Parte una expresión en piezas: texto "…", columna […], número, paréntesis, coma, operador o nombre */
  function tokenizar_(s) {
    const piezas = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        const j = s.indexOf('"', i + 1);
        if (j < 0) throw new Error('Comillas sin cerrar en: ' + s);
        piezas.push({ tipo: 'str', valor: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (c === '[') {
        const j = s.indexOf(']', i);
        if (j < 0) throw new Error('Corchete sin cerrar en: ' + s);
        piezas.push({ tipo: 'col', valor: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) {
        let j = i;
        while (j < s.length && /[0-9.]/.test(s[j])) j++;
        piezas.push({ tipo: 'num', valor: Number(s.slice(i, j)), texto: s.slice(i, j) }); i = j; continue;
      }
      if (c === '(' || c === ')') { piezas.push({ tipo: 'par', valor: c }); i++; continue; }
      if (c === ',') { piezas.push({ tipo: 'coma' }); i++; continue; }
      const dos = s.slice(i, i + 2);
      if (dos === '<>' || dos === '<=' || dos === '>=') { piezas.push({ tipo: 'op', valor: dos }); i += 2; continue; }
      if ('=<>&+-*/'.indexOf(c) >= 0) { piezas.push({ tipo: 'op', valor: c }); i++; continue; }
      if (/[A-Za-z_ÁÉÍÓÚÑáéíóúñÜü]/.test(c)) {
        let j = i;
        while (j < s.length && /[A-Za-z0-9_ÁÉÍÓÚÑáéíóúñÜü]/.test(s[j])) j++;
        piezas.push({ tipo: 'id', valor: s.slice(i, j) }); i = j; continue;
      }
      throw new Error('Carácter no soportado "' + c + '" en: ' + s);
    }
    return piezas;
  }

  /** Cuántas partes pide cada función: [mínimo, máximo] */
  const FUNCIONES = {
    IF: [3, 3], AND: [1, 99], OR: [1, 99], NOT: [1, 1], UPPER: [1, 1], LOWER: [1, 1], RIGHT: [2, 2], LEFT: [2, 2],
    LEN: [1, 1], CONCATENATE: [1, 99], ISBLANK: [1, 1], ISNOTBLANK: [1, 1], ROUND: [1, 2], TEXT: [1, 1], TODAY: [0, 0],
    NOW: [0, 0],
  };
  const esSiNo_ = (v) => typeof v === 'boolean';

  function funcion_(nombre, a, texto) {
    const partes = FUNCIONES[nombre];
    if (!partes) throw new Error('Marcador no soportado: <<' + texto + '>> (la función ' + nombre + ' no se conoce)');
    if (a.length < partes[0] || a.length > partes[1]) {
      throw new Error(nombre === 'IF' ? 'IF necesita 3 partes (condición, sí, no): ' + texto : nombre + ' no lleva ' + a.length + ' partes en: ' + texto);
    }
    const siNo = (v) => { if (!esSiNo_(v)) throw new Error(nombre + ' necesita una condición en: ' + texto); return v; };
    switch (nombre) {
      case 'IF': return siNo(a[0]) ? a[1] : a[2];
      case 'AND': return a.map(siNo).every(Boolean);
      case 'OR': return a.map(siNo).some(Boolean);
      case 'NOT': return !siNo(a[0]);
      case 'UPPER': return limpiar_(aTexto_(a[0])).toUpperCase();
      case 'LOWER': return limpiar_(aTexto_(a[0])).toLowerCase();
      case 'RIGHT': { const t = aTexto_(a[0]); return t.slice(Math.max(0, t.length - (aNumero_(a[1]) || 0))); }
      case 'LEFT': return aTexto_(a[0]).slice(0, aNumero_(a[1]) || 0);
      case 'LEN': return aTexto_(a[0]).length;
      case 'CONCATENATE': return a.map(aTexto_).join('');
      case 'ISBLANK': return limpiar_(aTexto_(a[0])) === '';
      case 'ISNOTBLANK': return limpiar_(aTexto_(a[0])) !== '';
      case 'ROUND': {
        const n = aNumero_(a[0]);
        const p = Math.pow(10, aNumero_(a[1]) || 0);
        return n === null ? '' : Math.round(n * p) / p;
      }
      case 'TEXT': return aTexto_(a[0]);
      default: return new Date();   // TODAY, NOW
    }
  }

  /**
   * Compara como AppSheet, con las reglas de aquí: = y <> comparan números si los dos lo son (y uno es número de
   * verdad: un literal o una cuenta), si no, texto sin espacios de más ni mayúsculas; < > <= >= solo con números, y
   * un lado vacío o que no es número no cumple (la llanta sin medir no sale como desgastada).
   */
  function comparar_(a, op, b) {
    if (op === '=' || op === '<>') {
      const numericos = (typeof a === 'number' || typeof b === 'number') && aNumero_(a) !== null && aNumero_(b) !== null;
      const igual = numericos ? aNumero_(a) === aNumero_(b) : limpiar_(aTexto_(a)).toUpperCase() === limpiar_(aTexto_(b)).toUpperCase();
      return op === '=' ? igual : !igual;
    }
    const x = aNumero_(a);
    const y = aNumero_(b);
    if (x === null || y === null) return false;
    if (op === '<=') return x <= y;
    if (op === '>=') return x >= y;
    if (op === '<') return x < y;
    return x > y;
  }

  /** Aritmética: con un vacío (o algo que no es número) el resultado es vacío, como hoy con [X] * 0.50 */
  function cuenta_(a, op, b) {
    const x = aNumero_(a);
    const y = aNumero_(b);
    if (x === null || y === null) return '';
    if (op === '+') return x + y;
    if (op === '-') return x - y;
    if (op === '*') return x * y;
    return y === 0 ? '' : x / y;
  }

  /** Evalúa una expresión completa (descenso recursivo): comparación → & → + - → * / → - → valor */
  function analizar_(texto, datos) {
    const piezas = tokenizar_(texto);
    let pos = 0;
    const ver = () => piezas[pos];
    const esOp = (...ops) => ver() && ver().tipo === 'op' && ops.indexOf(ver().valor) >= 0;
    const esPar = (v) => ver() && ver().tipo === 'par' && ver().valor === v;
    const cerrar = () => { if (!esPar(')')) throw new Error('Falta cerrar un paréntesis en: ' + texto); pos++; };
    const comparacion = () => {
      let izq = concatenacion();
      while (esOp('=', '<>', '<', '>', '<=', '>=')) { const op = piezas[pos++].valor; izq = comparar_(izq, op, concatenacion()); }
      return izq;
    };
    const concatenacion = () => {
      let izq = suma();
      while (esOp('&')) { pos++; izq = aTexto_(izq) + aTexto_(suma()); }
      return izq;
    };
    const suma = () => {
      let izq = producto();
      while (esOp('+', '-')) { const op = piezas[pos++].valor; izq = cuenta_(izq, op, producto()); }
      return izq;
    };
    const producto = () => {
      let izq = unario();
      while (esOp('*', '/')) { const op = piezas[pos++].valor; izq = cuenta_(izq, op, unario()); }
      return izq;
    };
    const unario = () => {
      if (esOp('-')) { pos++; return cuenta_(0, '-', unario()); }
      return valor();
    };
    const valor = () => {
      const t = ver();
      if (!t) throw new Error('Expresión incompleta: ' + texto);
      if (t.tipo === 'num' || t.tipo === 'str') { pos++; return t.valor; }
      if (t.tipo === 'col') { pos++; return valorCampo(t.valor, datos); }
      if (esPar('(')) { pos++; const v = comparacion(); cerrar(); return v; }
      if (t.tipo === 'id') {
        pos++;
        if (esPar('(')) {
          pos++;
          const args = [];
          if (!esPar(')')) {
            args.push(comparacion());
            while (ver() && ver().tipo === 'coma') { pos++; args.push(comparacion()); }
          }
          cerrar();
          return funcion_(t.valor.toUpperCase(), args, texto);
        }
        if (/^TRUE$/i.test(t.valor)) return true;
        if (/^FALSE$/i.test(t.valor)) return false;
        // Columna sin corchetes: puede tener varias palabras ("LLANTA DD"), como en AppSheet
        const nombre = [t.valor];
        while (ver() && (ver().tipo === 'id' || ver().tipo === 'num') &&
          !(piezas[pos + 1] && piezas[pos + 1].tipo === 'par' && piezas[pos + 1].valor === '(')) {
          nombre.push(ver().tipo === 'num' ? ver().texto : ver().valor);
          pos++;
        }
        return valorCampo(nombre.join(' '), datos);
      }
      throw new Error('No se entiende la expresión: ' + texto);
    };
    const resultado = comparacion();
    if (pos < piezas.length) throw new Error('Marcador no soportado: <<' + texto + '>>');
    return resultado;
  }

  /** @return {boolean} ¿se cumple la condición? */
  function evaluarCondicion(texto, datos) {
    const r = analizar_(limpiar_(texto), datos);
    if (!esSiNo_(r)) throw new Error('No se entiende la condición: ' + texto);
    return r;
  }

  /**
   * Evalúa el contenido de un <<…>> que produce texto.
   * @return {string}
   */
  function evaluarExpresion(texto, datos) {
    const t = limpiar_(texto);
    // Campo suelto: "[CAMPO]" o "CAMPO" (con espacios: «PUNTAJE FINAL INSPECCION»), tal cual está en los datos
    if (/^\[[^\]]+\]$/.test(t) || (/^[^()<>*"[\]&=+]+$/.test(t) && !/^[\d.]+$/.test(t))) {
      const v = valorCampo(t, datos);
      if (v === null || v === undefined) return '';
      return v instanceof Date ? textoDeFecha_(v) : String(v);
    }
    return aTexto_(analizar_(t, datos));
  }

  /**
   * Resuelve TODOS los marcadores de un texto: primero los bloques, luego las expresiones.
   * Sirve para probar el motor sin tocar un documento.
   */
  function resolver(texto, datos) {
    // 1. Bloques <<If:(cond)>> contenido <<EndIf>>
    let salida = String(texto || '').replace(
      /<<If:([\s\S]*?)>>([\s\S]*?)<<EndIf>>/gi,
      (todo, condicion, contenido) => (evaluarCondicion(condicion, datos) ? contenido : '')
    );
    // 2. Expresiones sueltas
    salida = salida.replace(/<<([\s\S]*?)>>/g, (todo, expresion) => {
      if (/^\s*EndIf\s*$/i.test(expresion)) return '';   // un EndIf suelto no estorba
      return evaluarExpresion(expresion, datos);
    });
    return salida;
  }

  /**
   * El checklist que pide una plantilla, agrupado en secciones y en el orden del documento.
   *
   * La plantilla ya trae todo lo que el formulario necesita saber, así que no hay que
   * escribirlo dos veces: el encabezado de cada sección viene con su peso ("Neumáticos 15%")
   * y cada pieza aparece como un juego de IF con sus opciones ("BUENO", "REGULAR", "MALO"…),
   * en el mismo orden en que salen impresas.
   *
   * Verificado contra los 18 formatos reales: los 18 dan 12 secciones y ninguna pieza queda
   * fuera de su sección.
   *
   * @return {Array<{titulo: string, peso: number, campos: Array<{campo: string, opciones: string[]}>}>}
   */
  function seccionesDe(texto) {
    const contenido = String(texto || '');
    const eventos = [];

    // Encabezado de sección: nombre seguido de su peso
    const seccion = /([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ/ ]{3,34}?)\s?(\d{1,2})%/g;
    let m;
    while ((m = seccion.exec(contenido)) !== null) {
      eventos.push({ pos: m.index, tipo: 'seccion', titulo: m[1].trim(), peso: Number(m[2]) });
    }

    // Cada opción de cada pieza: <<IF([PIEZA] = "BUENO", "✓", "")>>
    const campo = /<<IF\(\[([^\]]+)\]\s*=\s*"([^"]*)"/gi;
    while ((m = campo.exec(contenido)) !== null) {
      eventos.push({ pos: m.index, tipo: 'campo', campo: m[1].trim(), opcion: m[2].trim() });
    }

    eventos.sort((a, b) => a.pos - b.pos);

    const secciones = [];
    let actual = null;
    const porCampo = {};
    eventos.forEach((e) => {
      if (e.tipo === 'seccion') {
        actual = { titulo: e.titulo, peso: e.peso, campos: [] };
        secciones.push(actual);
        return;
      }
      if (!actual) return;   // no debería pasar; si pasa, esa pieza no se pide
      if (!porCampo[e.campo]) {
        porCampo[e.campo] = { campo: e.campo, opciones: [] };
        actual.campos.push(porCampo[e.campo]);
      }
      if (e.opcion && porCampo[e.campo].opciones.indexOf(e.opcion) === -1) {
        porCampo[e.campo].opciones.push(e.opcion);
      }
    });
    // Un "Palabra 5%" que haya en el documento sin ninguna pieza <<IF(...)>> detrás antes del
    // siguiente encabezado real no es una sección -- es ruido del propio texto (otro número con
    // signo de porcentaje que la expresión regular confunde con un título). Dejarla pasar con
    // campos: [] rompe a cualquiera que asuma que toda sección tiene al menos una pieza
    // (campos[0], como el botón "Todo bien" de la captura).
    return secciones.filter((s) => s.campos.length > 0);
  }

  /** Campos que pide una plantilla (para saber qué hay que capturar) */
  function camposDe(texto) {
    const campos = {};
    String(texto || '').replace(/<<([\s\S]*?)>>/g, (todo, expresion) => {
      if (/^\s*EndIf\s*$/i.test(expresion)) return todo;
      const limpio = limpiar_(expresion).replace(/^If:/i, '');
      // Campos entre corchetes
      limpio.replace(/\[([^\]]+)\]/g, (t, nombre) => { campos[limpiar_(nombre)] = true; return t; });
      // Campo suelto sin corchetes ni funciones
      if (/^[^()<>*"[\]]+$/.test(limpio)) campos[limpiar_(limpio)] = true;
      return todo;
    });
    return Object.keys(campos).sort();
  }

  return { marcadores, camposDe, seccionesDe, resolver, evaluarExpresion, evaluarCondicion, valorCampo };
})();
