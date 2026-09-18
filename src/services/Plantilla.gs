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
 *   Funciones: IF, AND, UPPER · Operadores: = <= >= *
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
  const sinComillas_ = (v) => limpiar_(v).replace(/^"([\s\S]*)"$/, '$1');

  /** Nombre de campo → valor de los datos. Acepta "[CAMPO]" y "CAMPO", sin importar mayúsculas. */
  function valorCampo(nombre, datos) {
    const clave = limpiar_(nombre).replace(/^\[|\]$/g, '');
    if (Object.prototype.hasOwnProperty.call(datos, clave)) return datos[clave];
    // Búsqueda tolerante: las plantillas y las hojas no siempre coinciden en mayúsculas
    const buscado = clave.toUpperCase();
    const encontrada = Object.keys(datos).find((k) => k.toUpperCase() === buscado);
    return encontrada === undefined ? '' : datos[encontrada];
  }

  const aNumero_ = (v) => {
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

  /**
   * Un término de una condición: campo, texto entre comillas o número.
   * @return {{valor: *, esNumero: boolean}}
   */
  function termino_(texto, datos) {
    const t = limpiar_(texto);
    if (/^".*"$/.test(t)) return { valor: sinComillas_(t), esNumero: false };
    if (/^-?[\d.]+$/.test(t)) return { valor: Number(t), esNumero: true };
    return { valor: valorCampo(t, datos), esNumero: false };
  }

  /** Separa por comas que estén FUERA de comillas y de paréntesis */
  function partirArgumentos_(texto) {
    const partes = [];
    let actual = '';
    let nivel = 0;
    let enComillas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (c === '"') enComillas = !enComillas;
      if (!enComillas) {
        if (c === '(') nivel++;
        if (c === ')') nivel--;
        if (c === ',' && nivel === 0) { partes.push(actual); actual = ''; continue; }
      }
      actual += c;
    }
    partes.push(actual);
    return partes.map(limpiar_);
  }

  /** Quita un par de paréntesis que envuelva TODA la expresión */
  function sinParentesis_(texto) {
    let t = limpiar_(texto);
    while (/^\(/.test(t)) {
      let nivel = 0;
      let cierraAlFinal = true;
      for (let i = 0; i < t.length; i++) {
        if (t[i] === '(') nivel++;
        if (t[i] === ')') nivel--;
        if (nivel === 0 && i < t.length - 1) { cierraAlFinal = false; break; }
      }
      if (!cierraAlFinal) break;
      t = limpiar_(t.slice(1, -1));
    }
    return t;
  }

  /** @return {boolean} ¿se cumple la condición? */
  function evaluarCondicion(texto, datos) {
    const t = sinParentesis_(texto);

    const logica = /^(AND|OR)\s*\(([\s\S]*)\)$/i.exec(t);
    if (logica) {
      const partes = partirArgumentos_(logica[2]).map((p) => evaluarCondicion(p, datos));
      return logica[1].toUpperCase() === 'AND' ? partes.every(Boolean) : partes.some(Boolean);
    }

    // El orden importa: <= y >= antes que < y >
    const comparacion = /^([\s\S]+?)\s*(<=|>=|<>|=|<|>)\s*([\s\S]+)$/.exec(t);
    if (!comparacion) throw new Error('No se entiende la condición: ' + texto);

    const izq = termino_(comparacion[1], datos);
    const operador = comparacion[2];
    const der = termino_(comparacion[3], datos);

    if (operador === '=' || operador === '<>') {
      // Comparación de texto sin importar mayúsculas ni espacios (como AppSheet)
      const a = limpiar_(izq.valor).toUpperCase();
      const b = limpiar_(der.valor).toUpperCase();
      return operador === '=' ? a === b : a !== b;
    }

    const a = aNumero_(izq.valor);
    const b = aNumero_(der.valor);
    if (a === null || b === null) return false;   // sin número que comparar, no se cumple
    if (operador === '<=') return a <= b;
    if (operador === '>=') return a >= b;
    if (operador === '<') return a < b;
    return a > b;
  }

  /**
   * Evalúa el contenido de un <<…>> que produce texto.
   * @return {string}
   */
  function evaluarExpresion(texto, datos) {
    const t = limpiar_(texto);

    const si = /^IF\s*\(([\s\S]*)\)$/i.exec(t);
    if (si) {
      const args = partirArgumentos_(si[1]);
      if (args.length !== 3) throw new Error('IF necesita 3 partes (condición, sí, no): ' + texto);
      return sinComillas_(evaluarCondicion(args[0], datos) ? args[1] : args[2]);
    }

    const mayusculas = /^UPPER\s*\(([\s\S]*)\)$/i.exec(t);
    if (mayusculas) return limpiar_(valorCampo(mayusculas[1], datos)).toUpperCase();

    const multiplicacion = /^(\[[^\]]+\])\s*\*\s*([\d.]+)$/.exec(t);
    if (multiplicacion) {
      const n = aNumero_(valorCampo(multiplicacion[1], datos));
      return n === null ? '' : formatearNumero_(n * Number(multiplicacion[2]));
    }

    // Campo suelto: "[CAMPO]" o "CAMPO"
    if (/^\[[^\]]+\]$/.test(t) || /^[^()<>*"]+$/.test(t)) {
      const v = valorCampo(t, datos);
      return v === null || v === undefined ? '' : String(v);
    }

    throw new Error('Marcador no soportado: <<' + texto + '>>');
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
    return secciones;
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
