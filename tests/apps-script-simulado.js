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
  const registro = { locks: 0, candadoTomado: 0, consola: [] };

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
          // Formato: no cambia los datos, solo se acepta
          setFontWeight() { return this; },
          setNumberFormat() { return this; },
        };
      },
      setFrozenRows: () => hoja,
      clearContents() { datos.forEach((r) => r.fill('')); return hoja; },
      getDataRange() { return this.getRange(1, 1, ultimaFila(), ancho()); },
      appendRow(r) { datos.splice(ultimaFila(), 0, r.slice()); return hoja; },
      deleteRow(f) { datos.splice(f - 1, 1); },
      deleteRows(f, n) { datos.splice(f - 1, n); },
      _datos: datos,
    };
    return hoja;
  }

  const libros = {};
  Object.keys(cfg.libros || {}).forEach((id) => {
    const libro = { getId: () => id, getName: () => 'Libro ' + id, _hojas: [] };
    libro.getSheets = () => libro._hojas.slice();
    libro.getSheetByName = (n) => libro._hojas.find((h) => h.getName() === n) || null;
    libro.insertSheet = (n) => {
      if (libro.getSheetByName(n)) throw new Error('Ya existe la hoja ' + n);
      const h = crearHoja(libro, n, []);
      libro._hojas.push(h);
      return h;
    };
    Object.keys(cfg.libros[id]).forEach((nombre) => libro._hojas.push(crearHoja(libro, nombre, cfg.libros[id][nombre])));
    libros[id] = libro;
  });

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
    },
    CacheService: { getScriptCache: () => cache, getUserCache: () => cache },
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
