/**
 * Galeria (componentes/galeria.html) y la pestaña Inspecciones de la ficha (app-inspecciones-vehiculo.html) en un
 * navegador simulado (jsdom): el visor abre, pasa de foto, cierra con Esc y escapa lo que pinta; una inspección de la
 * app se empata con su carpeta del expediente por la fecha del PDF o por su periodo, y las que solo están en Drive
 * también salen.
 *
 * Correr: node tests/galeria-inspecciones.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const leer = (r) => { const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', r), 'utf8'); return h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>')); };
const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(`
  const escaparHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const Iconos = { svg: (n) => '<i data-i="' + n + '"></i>' };
  const formatearFecha = (v) => String(v).slice(0, 10);
  const tablaFicha = (cols, filas) => '<table>' + filas.map((f) => '<tr>' + cols.map((c) => '<td>' + c.r(f) + '</td>').join('') + '</tr>').join('') + '</table>';
  ` + leer('componentes/galeria.html') + '\n' + leer('app-inspecciones-vehiculo.html') + '\nwindow.Galeria = Galeria; window.InspeccionesFicha = InspeccionesFicha;');
const { Galeria, InspeccionesFicha } = window;
const doc = window.document;

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. Galeria');
const foto = (n, extra) => Object.assign({ id: 'i' + n, nombre: 'f' + n + '.jpg', mime: 'image/jpeg', miniatura: 'https://lh3.googleusercontent.com/x' + n + '=s220', enlace: 'https://drive.google.com/file/d/i' + n }, extra || {});
const grupos = [{ titulo: 'NEUMATICOS', fotos: [foto(1), foto(2)] }, { titulo: 'VACIA', fotos: [] }, { titulo: '<b>X</b>', fotos: [foto(3, { mime: 'video/mp4' })] }];
const c = doc.getElementById('c');
c.innerHTML = Galeria.html(grupos);
ok(c.querySelectorAll('.galeria-mini').length === 3 && c.querySelectorAll('.galeria-seccion').length === 2, 'una miniatura por foto; la sección vacía no sale');
ok(!c.innerHTML.includes('<b>X</b>') && c.innerHTML.includes('&lt;b&gt;'), 'los títulos van escapados');
ok(Galeria.grande('https://lh3.googleusercontent.com/abc=s220') === 'https://lh3.googleusercontent.com/abc=s1600', 'la foto grande pide =s1600');
Galeria.ligar(c, grupos, { titulo: 'Inspección' });
c.querySelectorAll('.galeria-mini')[1].click();
let visor = doc.querySelector('.galeria-visor');
ok(visor && visor.textContent.includes('2 / 3') && visor.querySelector('img').getAttribute('src').endsWith('x2=s1600'), 'el clic abre el visor en esa foto, grande');
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
visor = doc.querySelector('.galeria-visor');
ok(visor.textContent.includes('3 / 3') && !visor.querySelector('img') && visor.textContent.includes('Abrir en Drive'), 'con la flecha pasa a la siguiente; un video se abre en Drive');
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight' }));
ok(doc.querySelector('.galeria-visor').textContent.includes('1 / 3'), 'después de la última vuelve a la primera');
doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape' }));
ok(!doc.querySelector('.galeria-visor'), 'Esc lo cierra');

console.log('\n2. Inspecciones de la ficha: app + expediente');
ok(InspeccionesFicha.periodo('2026-07-09') === '3ER TRIMESTRE' && InspeccionesFicha.periodo('2025-07-09') === '4TO BIMESTRE', 'periodo: trimestre desde 2026, bimestre antes');
const exp = [
  { id: 'd1', anio: '2026', nombre: '3ER TRIMESTRE', fecha: '2026-07-09', fotos: 40 },
  { id: 'd2', anio: '2026', nombre: 'POR BAJA 2026-05-13', fecha: '2026-05-13', fotos: 12 },
  { id: 'd3', anio: '2025', nombre: '4TO BIMESTRE', fecha: '', fotos: 30 },
  { id: 'd4', anio: '2023', nombre: 'SIN PERIODO - INSPECCION 2023', fecha: '', fotos: 8 },
];
const app = [{ ID: 'a1', FECHA: '2026-07-09T17:00:00Z' }, { ID: 'a2', FECHA: '2025-08-02T17:00:00Z' }, { ID: 'a3', FECHA: '2026-02-10T17:00:00Z' }];
const f = InspeccionesFicha.juntar(app, exp);
const de = (id) => f.find((x) => x.app && x.app.ID === id);
ok(de('a1').exp && de('a1').exp.id === 'd1', 'por la fecha de su PDF');
ok(de('a2').exp && de('a2').exp.id === 'd3', 'sin fecha en el expediente: por su periodo (agosto 2025 → 4TO BIMESTRE)');
ok(de('a3').exp === null, 'sin carpeta en el expediente: sale sin fotos');
ok(f.filter((x) => !x.app).map((x) => x.exp.id).join() === 'd2,d4', 'las que solo están en el expediente también salen');
ok(f.map((x) => x.anio).join() === '2026,2026,2026,2025,2023', 'de la más nueva a la más vieja (agrupables por año)');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
