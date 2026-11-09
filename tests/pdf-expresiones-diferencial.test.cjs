// Motor único de PDF, fase 1 (docs/pdf-motor.md): cada marcador REAL de cada plantilla en uso
// (tests/fixtures/plantillas-marcadores.json, de `node tools/pdf/inventario.js`) se llena con el motor único
// (src/services/Plantilla.gs) igual que con el motor que hoy llena esa plantilla (tests/referencia/, congelados).
//
// - Vehículos (Inspección, Responsiva, Adherente): hoy Plantilla.gs → debe dar lo mismo SIEMPRE.
// - Líneas: hoy LineasPdf → es la meta de la fase 2 (todo hasta entonces).
// - Arqueo: su motor pone cada valor a mano (formato de moneda); se compara en la fase 5, no aquí.
//
// Una diferencia aceptada a propósito va en ACEPTADAS con su razón; nada más.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FIXTURE = process.env.PDF_INVENTARIO || path.join(__dirname, 'fixtures', 'plantillas-marcadores.json');
const ACEPTADAS = {
  // 'marcador exacto': 'razón (usuario, fecha)'
};

/** Utilities.formatDate de mentira: solo los formatos que usan los motores */
const Utilities = {
  formatDate(f, zona, formato) {
    const d = (n) => String(n).padStart(2, '0');
    return formato.replace('dd', d(f.getDate())).replace('MM', d(f.getMonth() + 1)).replace('yyyy', f.getFullYear())
      .replace('HH', d(f.getHours())).replace('mm', d(f.getMinutes())).replace('ss', d(f.getSeconds()));
  },
};

function cargarPlantillaNueva() {
  const ctx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/services/Plantilla.gs'), 'utf8') + '\nthis.P = Plantilla;', ctx);
  return ctx.P;
}

/** Como PdfService.datosParaPlantilla_ / textoDeFecha_: las fechas ya como texto (con hora si la traen, 6-nov) */
function comoVehiculos(datos) {
  const salida = {};
  Object.keys(datos).forEach((k) => {
    const v = datos[k];
    const conHora = v instanceof Date && Utilities.formatDate(v, '', 'HHmmss') !== '000000';
    salida[k] = v instanceof Date ? Utilities.formatDate(v, '', conHora ? 'dd/MM/yyyy HH:mm:ss' : 'dd/MM/yyyy') : v;
  });
  return salida;
}

/**
 * Juegos de datos para los campos de una plantilla: vacío; cada campo con el 1er valor contra el que se compara;
 * con el 2º; el 1º en minúsculas y con espacios; números a un lado y otro de cada umbral; una fecha con y sin hora.
 */
function juegosDeDatos(marcadores) {
  const texto = marcadores.join('\n');
  const literales = {};
  for (const m of texto.matchAll(/\[([^\]]+)\]\s*(?:=|<>)\s*"([^"]*)"/g)) (literales[m[1]] = literales[m[1]] || []).push(m[2]);
  const umbrales = {};
  for (const m of texto.matchAll(/\[([^\]]+)\]\s*(?:<=|>=|<|>)\s*([\d.]+)/g)) umbrales[m[1]] = Number(m[2]);
  const campos = new Set();
  for (const m of texto.matchAll(/\[([^\]]+)\]/g)) campos.add(m[1].trim());
  for (const m of texto.matchAll(/<<\s*([^<>[\]()"&*+=]+?)\s*>>/g)) if (!/^(EndIf|If:)/i.test(m[1])) campos.add(m[1].trim());
  const armar = (fn) => { const d = {}; campos.forEach((c) => { d[c] = fn(c); }); return d; };
  const lit = (c, i) => (literales[c] ? literales[c][Math.min(i, literales[c].length - 1)] : 'TEXTO ' + c.slice(0, 3));
  return [
    ['vacío', armar(() => '')],
    ['1er valor', armar((c) => (c in umbrales ? String(umbrales[c] - 1) : lit(c, 0)))],
    ['2º valor', armar((c) => (c in umbrales ? String(umbrales[c] + 1) : lit(c, 1)))],
    ['minúsculas y espacios', armar((c) => (c in umbrales ? ' ' + umbrales[c] + ' ' : ' ' + lit(c, 0).toLowerCase() + ' '))],
    ['números', armar(() => '12.5')],
    ['fechas', armar((c) => (/FECHA/i.test(c) ? new Date(2026, 10, 5, 9, 30, 0) : lit(c, 0)))],
    ['fecha sin hora', armar((c) => (/FECHA/i.test(c) ? new Date(2026, 10, 5) : lit(c, 0)))],
  ];
}

const intentar = (fn) => { try { return { texto: String(fn()) }; } catch (e) { return { error: true }; } };

/** Lo que hoy pone en el documento el motor de Vehículos (PdfService.llenarTexto_ con Plantilla.resolver) */
function vehiculos(P, marcador, datos) {
  const d = comoVehiculos(datos);
  if (/^<<If:/i.test(marcador)) return intentar(() => P.evaluarCondicion(marcador.replace(/^<<If:/i, '').replace(/>>$/, ''), d));
  return intentar(() => P.resolver(marcador, d));
}

const existe = fs.existsSync(FIXTURE);
const inventario = existe ? JSON.parse(fs.readFileSync(FIXTURE, 'utf8')) : { plantillas: [] };
const conMarcadores = inventario.plantillas.filter((p) => p.marcadores);

test('el inventario de plantillas existe y trae marcadores (node tools/pdf/inventario.js)', { skip: !existe && 'falta tests/fixtures/plantillas-marcadores.json' }, () => {
  assert.ok(conMarcadores.length > 0);
  assert.deepEqual(inventario.plantillas.filter((p) => p.error).map((p) => p.nombre + ': ' + p.error), []);
});

const Antes = require('./referencia/plantilla-antes');
const Nueva = cargarPlantillaNueva();

conMarcadores.filter((p) => !/^Líneas |^Arqueo$/.test(p.nombre)).forEach((p) => {
  test('Vehículos · ' + p.nombre + ': el motor único llena cada marcador igual que hoy', () => {
    const marcadores = Object.keys(p.marcadores).filter((m) => !/^<<\s*EndIf\s*>>$/i.test(m));
    const diferencias = [];
    juegosDeDatos(marcadores).forEach(([juego, datos]) => {
      marcadores.forEach((m) => {
        if (ACEPTADAS[m]) return;
        const antes = vehiculos(Antes, m, datos);
        const ahora = vehiculos(Nueva, m, datos);
        if (JSON.stringify(antes) !== JSON.stringify(ahora)) diferencias.push(juego + ' · ' + m + ' · antes ' + JSON.stringify(antes) + ' · ahora ' + JSON.stringify(ahora));
      });
    });
    assert.deepEqual(diferencias.slice(0, 20), [], diferencias.length + ' diferencias');
  });
});

const L = require('./referencia/lineas-expresiones-antes')(Utilities);
conMarcadores.filter((p) => /^Líneas /.test(p.nombre)).forEach((p) => {
  test('Líneas · ' + p.nombre + ': el motor único llena cada marcador igual que LineasPdf', { todo: 'fase 2: Plantilla aprende lo de LineasPdf' }, () => {
    const marcadores = Object.keys(p.marcadores).filter((m) => !/^<<\s*EndIf\s*>>$/i.test(m));
    const diferencias = [];
    juegosDeDatos(marcadores).forEach(([juego, datos]) => {
      marcadores.forEach((m) => {
        if (ACEPTADAS[m]) return;
        const antes = /^<<If:/i.test(m) ? L.condicionIf(m, datos) : L.resolverMarcador(m, datos);
        const ahora = vehiculos(Nueva, m, datos);
        const a = antes.error ? { error: true } : { texto: String('valor' in antes ? antes.valor : antes.texto) };
        if (JSON.stringify(a) !== JSON.stringify(ahora)) diferencias.push(juego + ' · ' + m + ' · LineasPdf ' + JSON.stringify(a) + ' · único ' + JSON.stringify(ahora));
      });
    });
    assert.deepEqual(diferencias.slice(0, 20), [], diferencias.length + ' diferencias');
  });
});
