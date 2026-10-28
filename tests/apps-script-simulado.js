/**
 * Apps Script simulado para probar servicios del servidor en Node: hojas en memoria
 * (SpreadsheetApp), CacheService, LockService, Utilities, Session y una fecha fija.
 *
 *   const { crearEntorno } = require('./apps-script-simulado');
 *   const e = crearEntorno({ libros: { libro: { TICKETS: [['ID', 'FECHA'], ['TIC-1', e.fecha('2026-10-01')]] } } });
 *   e.cargar('src/utils/SheetUtils.gs', 'src/utils/CacheHojas.gs', 'src/utils/HojaServicio.gs');
 *   e.global('HojaServicio').listar(…)
 *
 * Las hojas se dan como renglones (el primero, encabezados). Las fechas de la hoja tienen que
 * ser de este entorno (e.fecha / e.Date): los servicios preguntan `instanceof Date`.
 * Zona horaria: America/Mexico_City (UTC-6, sin horario de verano desde 2022).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// Apps Script corre en la zona del manifiesto: new Date(a, m, d) es medianoche de México
// aunque la prueba corra en otra zona (la GitHub Action corre en UTC)
process.env.TZ = 'America/Mexico_City';

const RAIZ = path.resolve(__dirname, '..');
const DESFASE_MS = -6 * 3600 * 1000;           // Ciudad de México
const AHORA = Date.UTC(2026, 9, 5, 18, 30, 0);  // 05/10/2026 12:30 hora local

function crearEntorno(opciones) {
  const cfg = opciones || {};
  let ahora = cfg.ahora || AHORA;

  /** Date del entorno: sin argumentos es la hora fija (e.avanzar la mueve), para que dos corridas den lo mismo */
  class FechaFija extends Date {
    constructor(...args) { if (args.length) super(...args); else super(ahora); }
    static now() { return ahora; }
  }
  const fecha = (texto) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(texto);
    return new FechaFija(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - DESFASE_MS);
  };

  // locks: cuántas veces se pidió el candado; candadoTomado: si alguien lo tiene ahora mismo
  // api: cada llamada a la API de Sheets (Sheets.Spreadsheets.Values.batchUpdate), para contarlas en las pruebas
  const registro = { locks: 0, candadoTomado: 0, consola: [], api: [] };
  /** 'B5' → [5, 2] (renglón, columna; base 1) */
  const deA1 = (a1) => {
    const m = /^([A-Z]+)(\d+)$/.exec(a1);
    if (!m) throw new Error('A1 simulado: ' + a1);
    return [Number(m[2]), m[1].split('').reduce((n, l) => n * 26 + l.charCodeAt(0) - 64, 0)];
  };

  // ------------------------------------------------------------------ hojas
  function crearHoja(libro, nombre, renglones) {
    const datos = renglones.map((r) => r.slice());
    const ancho = () => (datos[0] || []).length;
    const ultimaFila = () => {
      for (let i = datos.length; i > 0; i--) if (datos[i - 1].some((v) => v !== '' && v !== null && v !== undefined)) return i;
      return 0;
    };
    const celda = (f, c) => { const v = (datos[f] || [])[c]; return v === undefined || v === null ? '' : v; };
    const hoja = {
      getName: () => nombre,
      getParent: () => libro,
      getLastRow: ultimaFila,
      getLastColumn: ancho,
      getMaxRows: () => datos.length,
      getRange(fila, col, filas, cols) {
        if (typeof fila === 'string') return hoja.getRange(...deA1(fila));
        const nf = filas || 1;
        const nc = cols || 1;
        return {
          getValues: () => Array.from({ length: nf }, (_, i) => Array.from({ length: nc }, (__, j) => celda(fila - 1 + i, col - 1 + j))),
          getValue: () => celda(fila - 1, col - 1),
          setValues(valores) {
            valores.forEach((r, i) => {
              while (datos.length < fila + i) datos.push(Array(ancho()).fill(''));
              r.forEach((v, j) => { datos[fila - 1 + i][col - 1 + j] = v; });
            });
            return this;
          },
          setValue(v) { return this.setValues([[v]]); },
          clearContent() { return this.setValues(Array.from({ length: nf }, () => Array(nc).fill(''))); },
          // Formato: no cambia los datos, solo se acepta
          setFontWeight() { return this; },
          setNumberFormat() { return this; },
          setBackground() { return this; },
          setFontColor() { return this; },
          setFontSize() { return this; },
          setHorizontalAlignment() { return this; },
          setVerticalAlignment() { return this; },
          setWrap() { return this; },
          createFilter() { hoja._filtro = {}; return hoja._filtro; },
        };
      },
      setRowHeight: () => hoja,
      setColumnWidth: () => hoja,
      // Formato condicional: las reglas quedan en hoja._reglas para revisarlas
      setConditionalFormatRules(reglas) { hoja._reglas = reglas; return hoja; },
      getConditionalFormatRules: () => hoja._reglas || [],
      getFilter: () => hoja._filtro || null,
      setFrozenRows: () => hoja,
      getMaxColumns: () => Math.max(26, ancho()),
      protect() { const p = { setDescription: () => p, setWarningOnly: () => p }; return p; },
      clearContents() { datos.forEach((r) => r.fill('')); return hoja; },
      getDataRange() { return this.getRange(1, 1, ultimaFila(), ancho()); },
      appendRow(r) { datos.splice(ultimaFila(), 0, r.slice()); return hoja; },
      deleteRow(f) { datos.splice(f - 1, 1); },
      deleteRows(f, n) { datos.splice(f - 1, n); },
      insertRowsAfter(f, n) { datos.splice(f, 0, ...Array.from({ length: n }, () => Array(ancho()).fill(''))); return hoja; },
      deleteColumn(c) { datos.forEach((r) => r.splice(c - 1, 1)); },
      deleteColumns(c, n) { datos.forEach((r) => r.splice(c - 1, n)); },
      getRangeList(a1s) { return { setValue: (v) => { registro.rangeLists = (registro.rangeLists || 0) + 1; a1s.forEach((a) => hoja.getRange(a).setValue(v)); } }; },
      _datos: datos,
    };
    return hoja;
  }

  const libros = {};
  function crearLibro(id, nombreLibro, hojas) {
    const libro = { getId: () => id, getName: () => nombreLibro || 'Libro ' + id, _hojas: [] };
    libro.getSheets = () => libro._hojas.slice();
    libro.getSheetByName = (n) => libro._hojas.find((h) => h.getName() === n) || null;
    libro.insertSheet = (n) => {   // (la posición no importa en las pruebas)
      if (libro.getSheetByName(n)) throw new Error('Ya existe la hoja ' + n);
      const h = crearHoja(libro, n, []);
      libro._hojas.push(h);
      return h;
    };
    libro.deleteSheet = (h) => { libro._hojas = libro._hojas.filter((x) => x !== h); };
    Object.keys(hojas || {}).forEach((nombre) => libro._hojas.push(crearHoja(libro, nombre, hojas[nombre])));
    libros[id] = libro;
    return libro;
  }
  Object.keys(cfg.libros || {}).forEach((id) => crearLibro(id, null, cfg.libros[id]));
  let nuevos = 0;

  // ------------------------------------------------------------------ servicios de Apps Script
  const cacheMem = new Map();
  const cache = {
    get: (k) => (cacheMem.has(k) ? cacheMem.get(k) : null),
    put: (k, v) => { cacheMem.set(k, String(v)); },
    getAll: (ks) => { const r = {}; ks.forEach((k) => { if (cacheMem.has(k)) r[k] = cacheMem.get(k); }); return r; },
    putAll: (o) => { Object.keys(o).forEach((k) => cacheMem.set(k, String(o[k]))); },
    remove: (k) => { cacheMem.delete(k); },
    removeAll: (ks) => { ks.forEach((k) => cacheMem.delete(k)); },
    _claves: () => Array.from(cacheMem.keys()),   // solo para las pruebas (no existe en Apps Script)
  };

  const blob = (bytes, tipo, nombre) => ({
    getBytes: () => Array.from(bytes),
    getDataAsString: () => Buffer.from(bytes).toString('utf8'),
    getContentType: () => tipo || '',
    getName: () => nombre || '',
    _bytes: bytes,
  });
  const dosDigitos = (n) => String(n).padStart(2, '0');
  const enLocal = (d) => new Date(d.getTime() + DESFASE_MS);

  const Utilities = {
    // Distinto desde el principio: CacheHojas usa los primeros 8 caracteres como versión de la hoja
    getUuid: (() => { let n = 0; return () => (++n).toString(16).padStart(8, '0') + '-0000-4000-8000-000000000000'; })(),
    newBlob: (datos, tipo, nombre) => blob(typeof datos === 'string' ? Buffer.from(datos, 'utf8') : Buffer.from(datos), tipo, nombre),
    gzip: (b) => blob(zlib.gzipSync(Buffer.from(b._bytes)), 'application/x-gzip'),
    ungzip: (b) => blob(zlib.gunzipSync(Buffer.from(b._bytes))),
    base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
    base64Decode: (texto) => Array.from(Buffer.from(texto, 'base64')),
    base64DecodeWebSafe: (texto) => Array.from(Buffer.from(texto.replace(/-/g, '+').replace(/_/g, '/'), 'base64')),
    formatDate(d, zona, formato) {
      const l = enLocal(d);
      return formato
        .replace('yyyy', l.getUTCFullYear()).replace('MM', dosDigitos(l.getUTCMonth() + 1)).replace('dd', dosDigitos(l.getUTCDate()))
        .replace('HH', dosDigitos(l.getUTCHours())).replace('mm', dosDigitos(l.getUTCMinutes())).replace('ss', dosDigitos(l.getUTCSeconds()));
    },
    parseDate(texto, zona, formato) {
      if (formato !== 'yyyy-MM-dd') throw new Error('parseDate simulado: solo yyyy-MM-dd');
      return fecha(texto);
    },
    DigestAlgorithm: { SHA_256: 'sha256' },
    // Como Apps Script: bytes con signo (-128…127)
    computeDigest: (alg, texto) => Array.from(require('crypto').createHash('sha256').update(String(texto), 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
  };

  const propiedades = new Map();
  const globales = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (propiedades.has(k) ? propiedades.get(k) : null),
        setProperty: (k, v) => { propiedades.set(k, String(v)); },
        deleteProperty: (k) => { propiedades.delete(k); },
        getKeys: () => Array.from(propiedades.keys()),
      }),
    },
    console: {
      log: () => {}, info: () => {},
      warn: (...a) => registro.consola.push('warn: ' + a.join(' ')),
      error: (...a) => registro.consola.push('error: ' + a.join(' ')),
    },
    Logger: { log: () => {} },
    Date: FechaFija,
    SpreadsheetApp: {
      openById: (id) => { if (!libros[id]) throw new Error('No existe el libro ' + id); return libros[id]; },
      flush: () => {},
      // Un libro nuevo trae su "Hoja 1" vacía, como el de verdad
      create: (nombre) => crearLibro('nuevo-' + (++nuevos), nombre, { 'Hoja 1': [] }),
      // Una regla de formato condicional: guarda lo que se le pidió (texto, fondo, letra) para revisarlo
      newConditionalFormatRule: () => {
        const r = {};
        const b = {
          whenTextEqualTo: (t) => { r.texto = t; return b; },
          whenFormulaSatisfied: (f) => { r.formula = f; return b; },
          setBackground: (c) => { r.fondo = c; return b; },
          setFontColor: (c) => { r.letra = c; return b; },
          setRanges: (rs) => { r.rangos = rs; return b; },
          build: () => r,
        };
        return b;
      },
    },
    CacheService: { getScriptCache: () => cache, getUserCache: () => cache },
    // La API de Sheets (servicio avanzado): batchUpdate con rangos 'HOJA'!B5. cfg.apiSheets === false: apagada en el proyecto
    Sheets: {
      Spreadsheets: {
        Values: {
          batchUpdate(cuerpo, id) {
            if (cfg.apiSheets === false) throw new Error('Sheets API has not been used in project 1 before or it is disabled. SERVICE_DISABLED');
            registro.api.push({ libro: id, modo: cuerpo.valueInputOption, celdas: cuerpo.data.length });
            cuerpo.data.forEach((d) => {
              const m = /^'((?:[^']|'')*)'!([A-Z]+\d+)$/.exec(d.range);
              const v = d.values[0][0];
              const tecleada = cuerpo.valueInputOption === 'USER_ENTERED' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v);
              libros[id].getSheetByName(m[1].replace(/''/g, "'")).getRange(m[2]).setValue(tecleada ? fecha(v.slice(0, 16)) : v);
            });
            return {};
          },
          // Renglones al final de la pestaña del rango ('HOJA'!A1); cfg.appendFalla: el libro no responde
          append(cuerpo, id, rango, opciones) {
            if (cfg.appendFalla) throw new Error('Service unavailable');
            registro.api.push({ libro: id, modo: opciones.valueInputOption, renglones: cuerpo.values.length, append: true });
            const h = libros[id].getSheetByName(/^'((?:[^']|'')*)'!/.exec(rango)[1].replace(/''/g, "'"));
            cuerpo.values.forEach((r) => h.appendRow(r));
            return {};
          },
        },
      },
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { registro.locks++; registro.candadoTomado++; },
        tryLock: () => { registro.locks++; registro.candadoTomado++; return true; },
        releaseLock: () => { registro.candadoTomado = Math.max(0, registro.candadoTomado - 1); },
      }),
    },
    Utilities,
    Session: {
      getScriptTimeZone: () => 'America/Mexico_City',
      getEffectiveUser: () => ({ getEmail: () => 'despliega@ejemplo.com' }),
      getActiveUser: () => ({ getEmail: () => 'persona@ejemplo.com' }),
    },
  };
  Object.assign(globales, cfg.globales || {});
  const contexto = vm.createContext(globales);
  // El candado reentrante lo usa todo lo que escribe (SheetUtils, HojaServicio, los servicios): va siempre
  vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src/utils/Candado.gs'), 'utf8'), contexto, { filename: 'src/utils/Candado.gs' });

  return {
    Date: FechaFija,
    fecha,
    /** Mueve el reloj del entorno `ms` milisegundos */
    avanzar: (ms) => { ahora += ms; },
    registro,
    libros,
    propiedades,
    contexto,
    /** Carga archivos del repo (rutas desde la raíz) o código suelto { codigo, nombre } */
    cargar(...archivos) {
      archivos.forEach((a) => {
        const codigo = typeof a === 'string' ? fs.readFileSync(path.join(RAIZ, a), 'utf8') : a.codigo;
        vm.runInContext(codigo, contexto, { filename: typeof a === 'string' ? a : a.nombre });
      });
      return this;
    },
    /** Un global del entorno, incluidos los `const` de nivel superior de los archivos cargados */
    global: (nombre) => vm.runInContext(nombre, contexto),
    /** Una hoja como renglones, con las fechas en ISO (para comparar) */
    hojaComoTexto(libro, nombre) {
      const h = libros[libro].getSheetByName(nombre);
      return h._datos.map((r) => r.map((v) => (v instanceof Date ? v.toISOString() : v)));
    },
  };
}

module.exports = { crearEntorno, AHORA };
