/**
 * REFERENCIA CONGELADA (5-nov-2026, commit 715d4355): el evaluador de expresiones de src/services/lineas/LineasPdf.gs
 * (evaluarExpresion_, tokenizar_, valorColumna_, aTexto_, aNumero_, compararValores_, funcion_) copiado tal cual, y la
 * parte de texto de reemplazarEtiquetas_ / procesarBloquesIf_ (cómo decide el valor de una etiqueta y la condición de
 * un If). No se edita: la prueba diferencial compara el motor único contra esto. Se borra al terminar la fase 4.
 *
 * Uso: const L = require('./referencia/lineas-expresiones-antes')(Utilities);   // Utilities.formatDate, para fechas
 *      L.resolverMarcador('<<RIGHT("000" & [NUCO], 4)>>', registro) → { texto } o { error }
 *      L.condicionIf('<<If:([TIPO] = "LINEA")>>', registro)          → { valor: true|false } o { error }
 */
module.exports = function (Utilities) {
  // ---------------- Evaluador de expresiones AppSheet (subconjunto) ----------------

  function evaluarExpresion_(texto, registro) {
    const tokens = tokenizar_(texto);
    let pos = 0;
    const ver = () => tokens[pos];
    const tomar = (tipo, valor) => {
      const t = tokens[pos];
      if (!t || (tipo && t.tipo !== tipo) || (valor !== undefined && t.valor !== valor)) throw new Error('Expresión no soportada: ' + texto);
      pos++;
      return t;
    };
    const comparar = () => {
      let izq = concatenar();
      while (ver() && ver().tipo === 'op' && ['=', '<>', '<', '>', '<=', '>='].indexOf(ver().valor) >= 0) {
        const op = tomar().valor;
        izq = compararValores_(izq, op, concatenar());
      }
      return izq;
    };
    const concatenar = () => {
      let izq = sumar();
      while (ver() && ver().tipo === 'op' && ver().valor === '&') { tomar(); izq = aTexto_(izq) + aTexto_(sumar()); }
      return izq;
    };
    const sumar = () => {
      let izq = multiplicar();
      while (ver() && ver().tipo === 'op' && (ver().valor === '+' || ver().valor === '-')) {
        const op = tomar().valor;
        const der = multiplicar();
        izq = op === '+' ? aNumero_(izq) + aNumero_(der) : aNumero_(izq) - aNumero_(der);
      }
      return izq;
    };
    const multiplicar = () => {
      let izq = unario();
      while (ver() && ver().tipo === 'op' && (ver().valor === '*' || ver().valor === '/')) {
        const op = tomar().valor;
        const der = unario();
        izq = op === '*' ? aNumero_(izq) * aNumero_(der) : aNumero_(izq) / (aNumero_(der) || 1);
      }
      return izq;
    };
    const unario = () => {
      if (ver() && ver().tipo === 'op' && ver().valor === '-') { tomar(); return -aNumero_(unario()); }
      return primario();
    };
    const primario = () => {
      const t = ver();
      if (!t) throw new Error('Expresión incompleta: ' + texto);
      if (t.tipo === 'num') { pos++; return t.valor; }
      if (t.tipo === 'str') { pos++; return t.valor; }
      if (t.tipo === 'col') { pos++; return valorColumna_(registro, t.valor); }
      if (t.tipo === 'par' && t.valor === '(') { tomar(); const v = comparar(); tomar('par', ')'); return v; }
      if (t.tipo === 'id') {
        pos++;
        const nombre = t.valor.toUpperCase();
        if (ver() && ver().tipo === 'par' && ver().valor === '(') {
          tomar();
          const args = [];
          if (!(ver() && ver().tipo === 'par' && ver().valor === ')')) {
            args.push(comparar());
            while (ver() && ver().tipo === 'coma') { tomar(); args.push(comparar()); }
          }
          tomar('par', ')');
          return funcion_(nombre, args);
        }
        if (nombre === 'TRUE') return true;
        if (nombre === 'FALSE') return false;
        return valorColumna_(registro, t.valor);
      }
      throw new Error('Token inesperado en: ' + texto);
    };
    const resultado = comparar();
    if (pos < tokens.length) throw new Error('Expresión no soportada: ' + texto);
    return resultado;
  }

  function tokenizar_(s) {
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '"') {
        let j = i + 1, v = '';
        while (j < s.length && s[j] !== '"') { v += s[j]; j++; }
        tokens.push({ tipo: 'str', valor: v }); i = j + 1; continue;
      }
      if (c === '[') {
        const j = s.indexOf(']', i);
        tokens.push({ tipo: 'col', valor: s.slice(i + 1, j) }); i = j + 1; continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
        let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++;
        tokens.push({ tipo: 'num', valor: Number(s.slice(i, j)) }); i = j; continue;
      }
      if (c === '(' || c === ')') { tokens.push({ tipo: 'par', valor: c }); i++; continue; }
      if (c === ',') { tokens.push({ tipo: 'coma' }); i++; continue; }
      const dos = s.slice(i, i + 2);
      if (dos === '<>' || dos === '<=' || dos === '>=') { tokens.push({ tipo: 'op', valor: dos }); i += 2; continue; }
      if ('=<>&+-*/'.indexOf(c) >= 0) { tokens.push({ tipo: 'op', valor: c }); i++; continue; }
      if (/[A-Za-z_ÁÉÍÓÚÑáéíóúñ]/.test(c)) {
        let j = i; while (j < s.length && /[A-Za-z0-9_ÁÉÍÓÚÑáéíóúñ]/.test(s[j])) j++;
        tokens.push({ tipo: 'id', valor: s.slice(i, j) }); i = j; continue;
      }
      throw new Error('Carácter no soportado "' + c + '" en: ' + s);
    }
    return tokens;
  }

  function valorColumna_(registro, nombre) {
    const buscado = String(nombre).toUpperCase().trim();
    for (const k in registro) { if (k.toUpperCase().trim() === buscado) return registro[k]; }
    return '';
  }

  function aTexto_(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'America/Mexico_City', 'dd/MM/yyyy');
    if (typeof v === 'boolean') return v ? 'Y' : 'N';
    return String(v);
  }
  function aNumero_(v) {
    if (typeof v === 'number') return v;
    const n = Number(String(v || '').replace(/[$,%\s]/g, ''));
    return isNaN(n) ? 0 : n;
  }
  function compararValores_(a, op, b) {
    const numericos = (typeof a === 'number' || typeof b === 'number') && !isNaN(aNumero_(a)) && !isNaN(aNumero_(b)) && a !== '' && b !== '';
    const x = numericos ? aNumero_(a) : aTexto_(a).toUpperCase();
    const y = numericos ? aNumero_(b) : aTexto_(b).toUpperCase();
    switch (op) {
      case '=': return x === y;
      case '<>': return x !== y;
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
    }
    return false;
  }

  function funcion_(nombre, a) {
    switch (nombre) {
      case 'IF': return a[0] ? a[1] : a[2];
      case 'UPPER': return aTexto_(a[0]).toUpperCase();
      case 'LOWER': return aTexto_(a[0]).toLowerCase();
      case 'RIGHT': { const t = aTexto_(a[0]); return t.slice(Math.max(0, t.length - aNumero_(a[1]))); }
      case 'LEFT': return aTexto_(a[0]).slice(0, aNumero_(a[1]));
      case 'LEN': return aTexto_(a[0]).length;
      case 'CONCATENATE': return a.map(aTexto_).join('');
      case 'AND': return a.every(Boolean);
      case 'OR': return a.some(Boolean);
      case 'NOT': return !a[0];
      case 'ISBLANK': return aTexto_(a[0]) === '';
      case 'ISNOTBLANK': return aTexto_(a[0]) !== '';
      case 'ROUND': return Math.round(aNumero_(a[0]) * Math.pow(10, aNumero_(a[1] || 0))) / Math.pow(10, aNumero_(a[1] || 0));
      case 'TODAY': return new Date();
      case 'NOW': return new Date();
      case 'TEXT': return aTexto_(a[0]);
      default: return ''; // Funciones no soportadas (p. ej. LOOKUP) quedan vacías.
    }
  }

  // Como reemplazarEtiquetas_ (LineasPdf.gs), sin imágenes ni _fijas: si la evaluación truena, el valor queda vacío
  function resolverMarcador(etiqueta, registro) {
    const interior = etiqueta.slice(2, -2).trim();
    if (/^(End|Start:)/i.test(interior)) return { texto: '' };
    const esColumnaSimple = /^[^\[\]"()&*+<>=]+$/.test(interior) && !/^[\d.]+$/.test(interior);
    try {
      return { texto: aTexto_(esColumnaSimple ? valorColumna_(registro, interior) : evaluarExpresion_(interior, registro)) };
    } catch (e) {
      return { error: e.message };
    }
  }

  // Como procesarBloquesIf_: la condición de un <<If:…>> (si truena, el bloque se quita: falso)
  function condicionIf(textoIf, registro) {
    try {
      return { valor: !!evaluarExpresion_(textoIf.replace(/^<<If:/i, '').replace(/>>$/, ''), registro) };
    } catch (e) {
      return { error: e.message };
    }
  }

  return { resolverMarcador, condicionIf, evaluarExpresion_ };
};
