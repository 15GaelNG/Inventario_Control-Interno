/**
 * TablaFicha (componentes/tabla-ficha.html) en un navegador simulado (jsdom): tabla con anchos fijos y alineación,
 * renglones separadores por grupo, lo vacío y el botón de acción único (liga o botón con data-…), todo escapado.
 *
 * Correr: node tests/tabla-ficha.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const h = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'componentes', 'tabla-ficha.html'), 'utf8');
const js = h.slice(h.indexOf('<script>') + 8, h.lastIndexOf('</script>'));
const dom = new JSDOM('<!doctype html><body><div id="c"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only' });
const { window } = dom;
window.eval(`const escaparHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const Iconos = { svg: (n) => '<i data-i="' + n + '"></i>' };` + js + '\nwindow.TablaFicha = TablaFicha;');
const { TablaFicha } = window;
const c = window.document.getElementById('c');
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

console.log('1. La tabla');
const filas = [{ a: '2026', n: 'uno', m: 5 }, { a: '2026', n: 'dos', m: 7 }, { a: '2025', n: '<b>tres</b>', m: 9 }];
c.innerHTML = TablaFicha.html([
  { t: 'Nombre', r: (f) => window.escapeHtmlSafe ? '' : f.n.replace(/</g, '&lt;'), ancho: '60%', parte: true },
  { t: 'Monto', r: (f) => String(f.m), ancho: '40%', alinear: 'derecha', num: true },
], filas, { grupo: (f) => f.a, minAncho: 500 });
ok(c.querySelectorAll('tbody tr:not(.tf-grupo)').length === 3 && c.querySelectorAll('tr.tf-grupo').length === 2, 'un renglón por fila y un separador cada vez que cambia el grupo');
ok(c.querySelector('tr.tf-grupo td').getAttribute('colspan') === '2' && c.querySelector('tr.tf-grupo').textContent === '2026', 'el separador ocupa todo lo ancho');
ok(c.querySelector('.tf-wrap').classList.contains('tf-fija') && c.querySelectorAll('col').length === 2, 'con anchos: anchos fijos (las tablas se alinean entre sí)');
ok(c.querySelector('td.tf-derecha.tf-num') && c.querySelector('th.tf-derecha'), 'alineación a la derecha en encabezado y celda');
ok(c.querySelector('.tf-wrap').hasAttribute('data-scroll-x') && c.querySelector('table').style.minWidth === '500px', 'se desliza de lado, con su ancho mínimo');
ok(/tf-vacio/.test(TablaFicha.html([{ t: 'x', r: () => '' }], [], { vacio: 'Nada aquí' })) && /Nada aquí/.test(TablaFicha.html([{ t: 'x', r: () => '' }], [], { vacio: 'Nada aquí' })), 'sin filas: su texto de vacío');

console.log('\n2. El botón de acción');
const liga = TablaFicha.boton({ href: 'https://drive.google.com/x?a=1&b="2"' });
ok(/^<a class="tf-btn" href="https:\/\/drive.google.com\/x\?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener">/.test(liga) && /<span>Ver<\/span>/.test(liga), 'con href: liga a otra pestaña, escapada, texto Ver por omisión');
const b = TablaFicha.boton({ texto: '12', icono: 'image', datos: { inspFotos: 'id"1', archivo: 'x' }, titulo: 'Fotos' });
c.innerHTML = b;
const btn = c.querySelector('button.tf-btn');
ok(btn && btn.dataset.inspFotos === 'id"1' && btn.dataset.archivo === 'x' && btn.title === 'Fotos' && btn.textContent === '12', 'sin href: <button> con sus data-… (camelCase → data-insp-fotos)');
ok(TablaFicha.conSub('11/10/2026', 'App').includes('<span class="tf-sub">App</span>'), 'conSub: la línea chica abajo');

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
