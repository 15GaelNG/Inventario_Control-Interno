const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Vínculos (usuario, 8-oct): el grafo con todo, el cajón y el lienzo donde soltar abre la acción que ya existe

const fuente = read('src/html/js/lineas-vinculos.html').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const cargar = (dom) => {
  const w = dom ? dom.window : {};
  return new Function('window', 'document', 'getComputedStyle', 'localStorage', 'requestAnimationFrame', 'performance', fuente + '; return LineasVinculos;')(
    w, w.document || {}, w.getComputedStyle || null, w.localStorage || null, w.requestAnimationFrame || ((f) => setTimeout(f, 16)), w.performance || performance);
};
const V = cargar();

// NUCO 0012 con Ana (y su línea en USO); 0013 en resguardo con su línea DISPONIBLE; 0020 para venta; 0030 vendido;
// línea suelta DISPONIBLE, otra suelta en USO con Ana, una en cancelación y una cancelada
const indice = () => ({
  equipos: [
    { id: 'E12', nuco: '0012', tipo: 'CELULAR', modelo: 'A15', imei: '351111', estatus: 'USO', responsable: 'ANA RUIZ', departamento: 'VENTAS', lineaId: 'L1', numero: '4424754517', 'NO EMPLEADO': '501' },
    { id: 'E13', nuco: '0013', tipo: 'CELULAR', estatus: 'RESGUARDO', responsable: 'RES-12', lineaId: 'L2', numero: '4421090805' },
    { id: 'E20', nuco: '0020', tipo: 'MODEM', estatus: 'PARA VENTA', responsable: '' },
    { id: 'E30', nuco: '0030', tipo: 'CELULAR', estatus: 'VENDIDO', responsable: '' },
  ],
  lineas: [
    { id: 'L1', numero: '4424754517', compania: 'TELCEL', estatus: 'USO', equipoId: 'E12', suelta: false },
    { id: 'L2', numero: '4421090805', compania: 'TELCEL', estatus: 'DISPONIBLE', equipoId: 'E13', suelta: false },
    { id: 'L3', numero: '9990000001', compania: 'AT&T', estatus: 'DISPONIBLE', suelta: true, numerosAnteriores: '9990000000' },
    { id: 'L4', numero: '4425550190', compania: 'TELCEL', estatus: 'USO', suelta: true, responsable: 'ANA RUIZ', 'NO EMPLEADO': '501', departamento: 'VENTAS' },
    { id: 'L5', numero: '4428887731', compania: 'AT&T', estatus: 'EN PROCESO DE CANCELACION', suelta: true },
    { id: 'L6', numero: '4420000000', compania: 'AT&T', estatus: 'CANCELADA', suelta: true },
  ],
});

test('agrupar: la persona con su equipo y su línea sola; lo suelto, el resguardo, la venta y la cancelación en su zona', () => {
  const r = V.agrupar(indice(), {});
  const ana = r.zonas.uso.filter((g) => g.persona)[0];
  assert.equal(ana.persona.nombre, 'ANA RUIZ');
  assert.equal(ana.persona.noEmpleado, '501');
  assert.deepEqual(ana.pares.map((p) => [p.equipo && p.equipo.nuco, p.linea && p.linea.numero]), [['0012', '4424754517'], [null, '4425550190']]);
  assert.deepEqual(r.zonas.uso.filter((g) => !g.persona).map((g) => g.pares[0].linea.numero), ['9990000001']);
  // El código de resguardo no es una persona; la línea se queda con su equipo
  assert.deepEqual(r.zonas.resguardo.map((g) => [g.persona, g.pares[0].equipo.nuco, g.pares[0].linea.numero]), [[null, '0013', '4421090805']]);
  // Sin buscar no salen las bajas (VENDIDO, CANCELADA)
  assert.deepEqual(r.zonas.venta.map((g) => g.pares[0].equipo.nuco), ['0020']);
  assert.deepEqual(r.zonas.cancelacion.map((g) => g.pares[0].linea.numero), ['4428887731']);
  assert.deepEqual(r.companias, ['AT&T', 'TELCEL']);
});

test('agrupar: los estatus de antes del 30-sep van a su zona; lo que no se reconoce es baja y no va a «En uso»', () => {
  const ix = { equipos: [
    { id: 'A', nuco: '0003', estatus: 'FUERA DE INVENTARIO' }, { id: 'B', nuco: '0007', estatus: 'POSIBLE VENTA' },
    { id: 'C', nuco: '0008', estatus: 'ESPERA DE RESPONSIVA', responsable: 'LUIS' }, { id: 'D', nuco: '0009', estatus: 'ROBADO' },
  ], lineas: [{ id: 'X', numero: '1', estatus: 'SIN LINEA', suelta: true }, { id: 'Y', numero: '2', estatus: 'SUSPENDIDA', suelta: true }] };
  const nucos = (gs) => gs.map((g) => g.pares.map((p) => (p.equipo ? p.equipo.nuco : p.linea.numero)).join());
  const r = V.agrupar(ix, {});
  assert.deepEqual(nucos(r.zonas.uso).sort(), ['0008', '2']);
  assert.deepEqual(nucos(r.zonas.venta), ['0007']);
  assert.deepEqual(nucos(r.zonas.cancelacion), []);
  assert.deepEqual(nucos(V.agrupar(ix, { q: 'fuera de inventario' }).zonas.venta), ['0003']);
  assert.deepEqual(nucos(V.agrupar(ix, { q: '1' }).zonas.cancelacion), ['1']);
});

test('agrupar: la búsqueda encuentra personas, NUCO, números anteriores e IMEI, y con ella salen las bajas', () => {
  const zonasCon = (q) => Object.entries(V.agrupar(indice(), { q: q }).zonas).filter(([, gs]) => gs.length).map(([z, gs]) => z + ':' + gs.length);
  assert.deepEqual(zonasCon('ana ruiz'), ['uso:1']);
  assert.deepEqual(zonasCon('0013'), ['resguardo:1']);
  assert.deepEqual(zonasCon('9990000000'), ['uso:1']);
  assert.deepEqual(zonasCon('351111'), ['uso:1']);
  assert.deepEqual(zonasCon('vendido'), ['venta:1']);
  assert.deepEqual(zonasCon('4420000000'), ['cancelacion:1']);
  assert.deepEqual(zonasCon('442 475 4517'), ['uso:1']);
  // Con coma, las dos cosas que se van a juntar
  assert.deepEqual(zonasCon('9990000001, 0013'), ['uso:1', 'resguardo:1']);
  const r = V.agrupar(indice(), { departamento: 'VENTAS', compania: 'TELCEL' });
  assert.deepEqual(Object.entries(r.zonas).filter(([, gs]) => gs.length).map(([z]) => z), ['uso']);
});

test('alSoltar: en el lienzo cada movimiento abre la acción de siempre con lo que se soltó ya elegido', () => {
  const ix = indice();
  const e = (id) => ix.equipos.filter((x) => x.id === id)[0];
  const l = (id) => ix.lineas.filter((x) => x.id === id)[0];
  const suelta = { tipo: 'linea', fila: l('L3'), equipo: null };
  // Línea suelta a un equipo sin línea, o con línea (el ejemplo del usuario: cambiar la línea del equipo)
  const sinLinea = Object.assign({}, e('E12'), { lineaId: null });
  assert.deepEqual(V.alSoltar(suelta, { tipo: 'equipo', fila: sinLinea, linea: null }).pre, { linea: '9990000001' });
  assert.equal(V.alSoltar(suelta, { tipo: 'equipo', fila: sinLinea, linea: null }).modo, 'VINCULAR_LINEA');
  const cambiar = V.alSoltar(suelta, { tipo: 'equipo', fila: e('E12'), linea: l('L1') });
  assert.equal(cambiar.modo, 'CAMBIAR_LINEA');
  assert.equal(cambiar.fila.id, 'E12');
  assert.equal(V.describir(cambiar), 'Cambiar línea · NUCO 0012 · 4424754517 → 9990000001');
  // Línea de un equipo a otro sin línea: Cambiar de equipo desde la línea; a uno con línea, no
  const deEquipo = { tipo: 'linea', fila: l('L2'), equipo: e('E13') };
  const otro = V.alSoltar(deEquipo, { tipo: 'equipo', fila: sinLinea, linea: null });
  assert.deepEqual([otro.modo, otro.fila.id, otro.pre.nuco], ['CAMBIAR_EQUIPO', 'L2', '0012']);
  assert.match(V.alSoltar(deEquipo, { tipo: 'equipo', fila: e('E12'), linea: l('L1') }).aviso, /ya tiene línea/);
  // Soltar en el lienzo vacío solo mueve (desvincular es con las tijeras)
  assert.equal(V.alSoltar(deEquipo, null), null);
  // Solo líneas DISPONIBLE y equipos en USO o RESGUARDO, como LineasAcciones.vincular
  assert.match(V.alSoltar({ tipo: 'linea', fila: l('L4'), equipo: null }, { tipo: 'equipo', fila: sinLinea, linea: null }).aviso, /DISPONIBLE/);
  assert.match(V.alSoltar(suelta, { tipo: 'equipo', fila: e('E20'), linea: null }).aviso, /USO o RESGUARDO/);
  // Cajas: cancelación, resguardo, venta; reasignar sobre una persona
  assert.deepEqual(V.alSoltar(suelta, { tipo: 'caja', caja: 'cancelacion' }), { tipo: 'cancelacion', fila: l('L3') });
  assert.match(V.alSoltar(suelta, { tipo: 'caja', caja: 'resguardo' }).aviso, /con su equipo/);
  assert.equal(V.alSoltar({ tipo: 'linea', fila: l('L5') }, { tipo: 'caja', caja: 'cancelacion' }), null);
  const equipo = { tipo: 'equipo', fila: e('E12'), dueno: 'p:501' };
  assert.deepEqual(V.alSoltar(equipo, { tipo: 'caja', caja: 'resguardo' }), { tipo: 'resguardo', fila: e('E12'), estatus: 'RESGUARDO' });
  assert.deepEqual(V.alSoltar(equipo, { tipo: 'caja', caja: 'venta' }), { tipo: 'resguardo', fila: e('E12'), estatus: 'PARA VENTA' });
  assert.match(V.alSoltar(equipo, { tipo: 'caja', caja: 'cancelacion' }).aviso, /arrastra la línea/);
  assert.equal(V.alSoltar(equipo, { tipo: 'persona', persona: { clave: 'p:501', nombre: 'ANA RUIZ' } }), null);
  const guardado = { tipo: 'equipo', fila: e('E13'), dueno: null };
  assert.equal(V.describir(V.alSoltar(guardado, { tipo: 'persona', persona: { clave: 'p:501', nombre: 'ANA RUIZ' } })), 'Reasignar · NUCO 0013 → ANA RUIZ');
  assert.equal(V.alSoltar(guardado, { tipo: 'caja', caja: 'resguardo' }), null);
});

test('red y cajaDe: cada nodo con su clave y sus vínculos; en el lienzo vive en la caja de su estatus', () => {
  const r = V.red(indice());
  assert.deepEqual(Object.keys(r.nodos).sort(), ['e:E12', 'e:E13', 'e:E20', 'e:E30', 'l:L1', 'l:L2', 'l:L3', 'l:L4', 'l:L5', 'l:L6', 'p:501']);
  assert.deepEqual(r.enlaces.map((x) => x.join('-')).sort(), ['e:E12-l:L1-l', 'e:E13-l:L2-l', 'p:501-e:E12-p', 'p:501-l:L4-p']);
  assert.equal(r.porRef['n:4421090805'], 'l:L2');
  assert.equal(r.porRef['u:0012'], 'e:E12');
  assert.deepEqual(['e:E12', 'e:E13', 'l:L2', 'e:E20', 'l:L5', 'l:L3', 'p:501'].map((k) => V.cajaDe(r.nodos[k])),
    [null, 'resguardo', 'resguardo', 'venta', 'cancelacion', null, null]);
});

test('montar: el grafo con las capas, al cajón, el lienzo y lo que se recuerda en el navegador', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body><div id="v" class="vn"></div></body>', { url: 'https://vinculos.test/', pretendToBeVisual: true });
  const W = cargar(dom);
  const doc = dom.window.document;
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cfg = { indice: indice, puedeOperar: () => true, icono: (n) => '<i data-i="' + n + '"></i>', esc: esc,
    color: (s) => ({ USO: 'verde', DISPONIBLE: 'azul', RESGUARDO: 'azul' }[s] || ''),
    alVer: () => {}, alAbrir: () => {}, alSoltar: () => {}, alAvisar: () => {} };
  const cont = doc.getElementById('v');
  W.montar(cont, cfg).pintar();
  const claves = (raiz, tipo) => [...raiz.querySelectorAll('[data-vn-espacio="' + tipo + '"] [data-vn-k]')].map((n) => n.dataset.vnK).sort();
  // Personas y sueltos prendidos; el resguardo se prende aparte
  assert.deepEqual(claves(cont, 'grafo'), ['e:E12', 'l:L1', 'l:L3', 'l:L4', 'p:501']);
  cont.querySelector('[data-vn-capa="resguardo"]').click();
  assert.deepEqual(claves(cont, 'grafo'), ['e:E12', 'e:E13', 'l:L1', 'l:L2', 'l:L3', 'l:L4', 'p:501']);
  // Un clic en un nodo elige su relación; «Al cajón» la guarda
  const nodo = cont.querySelector('[data-vn-k="e:E12"]');
  nodo.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, clientX: 5, clientY: 5 }));
  nodo.dispatchEvent(new dom.window.MouseEvent('pointerup', { bubbles: true, clientX: 5, clientY: 5 }));
  assert.equal(cont.querySelector('[data-vn-sel]').hidden, false);
  cont.querySelector('[data-vn-sel-cajon]').click();
  assert.match(cont.querySelector('[data-vn-cajon-lista]').textContent, /ANA RUIZ · NUCO 0012 · 4424754517 · 4425550190/);
  // El lienzo empieza en blanco y del cajón se saca arrastrando
  cont.querySelector('[data-vn-modo="lienzo"]').click();
  assert.deepEqual(claves(cont, 'lienzo'), []);
  assert.ok(cont.querySelector('[data-vn-cajon-lista] .vn-ficha-saca'));
  cont.remove();

  // Lo guardado en el navegador vuelve: el lienzo con sus nodos y su caja (la clave vieja se encuentra por el número)
  dom.window.localStorage.setItem('lineas.vinculos.v1', JSON.stringify({ modo: 'lienzo', cajon: [['l:L3']],
    recuerdo: { 'l:VIEJA': { ref: 'n:4421090805', tipo: 'linea' } },
    lienzo: { nodos: [['e:E12', 0, 0, 1], ['l:L1', 0, 60, 0], ['l:VIEJA', 90, 0, 1]], cajas: [['resguardo', 200, 0, 260, 220]], vista: [0, 0, 1] } }));
  const otro = doc.createElement('div');
  otro.className = 'vn';
  doc.body.appendChild(otro);
  W.montar(otro, cfg).pintar();
  assert.deepEqual(claves(otro, 'lienzo'), ['e:E12', 'l:L1', 'l:L2']);
  assert.ok(otro.querySelector('[data-vn-caja="resguardo"]'));
  assert.equal(otro.querySelector('[data-vn-poner="resguardo"]').hidden, true);
  assert.match(otro.querySelector('[data-vn-cajon-lista]').textContent, /9990000001/);
  otro.remove();
  dom.window.close();
});

test('Líneas Telefónicas: Vínculos es un modo de la lista y abre las ventanas de siempre', () => {
  const vista = read('src/html/views/lineas/lineas-telefonicas.html');
  assert.match(vista, /data-modo="vinculos"[^>]*>.*Vínculos<\/button>/);
  assert.match(vista, /<div class="vn" id="ln-vinculos" hidden><\/div>/);
  assert.match(read('src/html/Index.html'), /include\('html\/js\/lineas-vinculos'\); \?>\r?\n\s*<\?!= include\('html\/js\/lineas'\)/);
  const js = read('src/html/js/lineas.html');
  assert.match(js, /\['tabla', 'tarjetas', 'vinculos'\]\.indexOf\(guardado\)/);
  assert.match(js, /if \(a\.tipo === 'vinculo'\) abrirVinculo\(a\.modo, a\.fila, a\.pre\);/);
  assert.match(js, /else if \(a\.tipo === 'cancelacion'\) abrirCancelacion\(\[a\.fila\]\);/);
  assert.match(js, /else if \(a\.tipo === 'resguardo'\) abrirResguardo\(\[a\.fila\], \{ estatus: a\.estatus \}\);/);
  assert.match(js, /else if \(a\.tipo === 'reasignar'\) abrirReasignar\(a\.fila, a\.persona\);/);
  // Lo soltado llega ya elegido a la ventana de Vincular
  assert.match(js, /mensaje: 'ELIGE UNA LÍNEA DISPONIBLE', valor: elegido\.linea \|\| '' \}/);
  assert.match(js, /mensaje: 'ELIGE UN NUCO SIN LÍNEA', valor: elegido\.nuco \|\| '' \}/);
  // El permiso y el espacio existen antes de la carga inicial (aplicarModoVista los usa al entrar)
  const permiso = js.indexOf('let puedeOperarTabla = false;');
  const espacio = js.indexOf('const espacioVinculos = LineasVinculos.montar(');
  const carga = js.indexOf('// ---- Carga inicial ----');
  assert.ok(permiso > 0 && permiso < espacio && espacio < carga);
});
