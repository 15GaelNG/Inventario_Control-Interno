const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

// Vínculos (usuario, 8-oct): personas, equipos y líneas en un espacio; arrastrar abre la acción que ya existe

const fuente = read('src/html/js/lineas-vinculos.html').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const cargar = (contexto) => new Function('window', 'document', 'getComputedStyle', fuente + '; return LineasVinculos;')(
  contexto ? contexto.window : {}, contexto ? contexto.window.document : {}, contexto ? contexto.window.getComputedStyle : null);
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

test('agrupar: la búsqueda encuentra personas, NUCO, números anteriores e IMEI, y con ella salen las bajas', () => {
  const zonasCon = (q) => Object.entries(V.agrupar(indice(), { q: q }).zonas).filter(([, gs]) => gs.length).map(([z, gs]) => z + ':' + gs.length);
  assert.deepEqual(zonasCon('ana ruiz'), ['uso:1']);
  assert.deepEqual(zonasCon('0013'), ['resguardo:1']);
  assert.deepEqual(zonasCon('9990000000'), ['uso:1']);
  assert.deepEqual(zonasCon('351111'), ['uso:1']);
  assert.deepEqual(zonasCon('vendido'), ['venta:1']);
  assert.deepEqual(zonasCon('4420000000'), ['cancelacion:1']);
  assert.deepEqual(zonasCon('442 475 4517'), ['uso:1']);
  const r = V.agrupar(indice(), { departamento: 'VENTAS', compania: 'TELCEL' });
  assert.deepEqual(Object.entries(r.zonas).filter(([, gs]) => gs.length).map(([z]) => z), ['uso']);
});

test('alSoltar: cada movimiento abre la acción de siempre con lo que se soltó ya elegido', () => {
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
  // Sacarla al espacio o las tijeras: desvincular desde el equipo
  const fuera = V.alSoltar(deEquipo, { tipo: 'zona', zona: 'uso' });
  assert.deepEqual([fuera.modo, fuera.fila.id], ['DESVINCULAR', 'E13']);
  // Solo líneas DISPONIBLE y equipos en USO o RESGUARDO, como LineasAcciones.vincular
  assert.match(V.alSoltar({ tipo: 'linea', fila: l('L4'), equipo: null }, { tipo: 'equipo', fila: sinLinea, linea: null }).aviso, /DISPONIBLE/);
  assert.match(V.alSoltar(suelta, { tipo: 'equipo', fila: e('E20'), linea: null }).aviso, /USO o RESGUARDO/);
  // Cancelación, resguardo, venta y reasignar
  assert.deepEqual(V.alSoltar(suelta, { tipo: 'zona', zona: 'cancelacion' }), { tipo: 'cancelacion', fila: l('L3') });
  assert.equal(V.alSoltar({ tipo: 'linea', fila: l('L5') }, { tipo: 'zona', zona: 'cancelacion' }), null);
  const equipo = { tipo: 'equipo', fila: e('E12'), persona: 'p:501' };
  assert.deepEqual(V.alSoltar(equipo, { tipo: 'zona', zona: 'resguardo' }), { tipo: 'resguardo', fila: e('E12'), estatus: 'RESGUARDO' });
  assert.deepEqual(V.alSoltar(equipo, { tipo: 'zona', zona: 'venta' }), { tipo: 'resguardo', fila: e('E12'), estatus: 'PARA VENTA' });
  assert.match(V.alSoltar(equipo, { tipo: 'zona', zona: 'cancelacion' }).aviso, /arrastra la línea/);
  assert.equal(V.alSoltar(equipo, { tipo: 'persona', persona: { clave: 'p:501', nombre: 'ANA RUIZ' } }), null);
  const guardado = { tipo: 'equipo', fila: e('E13'), persona: null };
  assert.equal(V.alSoltar(guardado, { tipo: 'persona', persona: { clave: 'p:501', nombre: 'ANA RUIZ' } }).tipo, 'reasignar');
  assert.equal(V.describir(V.alSoltar(guardado, { tipo: 'persona', persona: { clave: 'p:501', nombre: 'ANA RUIZ' } })), 'Reasignar · NUCO 0013 → ANA RUIZ');
  assert.deepEqual(V.alSoltar(guardado, { tipo: 'zona', zona: 'uso' }), { tipo: 'reasignar', fila: e('E13'), persona: null });
});

test('montar: pinta las zonas con íconos, la vista rápida al dar clic y las tijeras desvinculan', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><body><div id="v"></div></body>');
  const W = cargar(dom);
  const vistos = [];
  const soltados = [];
  const cont = dom.window.document.getElementById('v');
  const esc = (v) => String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const espacio = W.montar(cont, {
    indice: indice, puedeOperar: () => true, icono: (n) => '<i data-i="' + n + '"></i>', esc: esc,
    color: (s) => ({ USO: 'verde', DISPONIBLE: 'azul', RESGUARDO: 'azul' }[s] || ''),
    alVer: (tipo, fila) => vistos.push(tipo + ':' + fila.id), alAbrir: () => {}, alSoltar: (a) => soltados.push(a), alAvisar: () => {},
  });
  espacio.pintar();
  const uso = cont.querySelector('[data-vn-zona="uso"]');
  assert.ok(uso.querySelector('.vn-con-persona .vn-persona'));
  assert.equal(uso.querySelector('[data-vn-ver="e:E12"]').className, 'vn-nodo vn-equipo vn-verde');
  assert.ok(uso.querySelector('[data-vn-ver="e:E12"] [data-i="smartphone"]'));
  assert.ok(cont.querySelector('[data-vn-zona="venta"] [data-vn-ver="e:E20"] [data-i="router"]'));
  assert.ok(cont.querySelector('[data-vn-zona="resguardo"] [data-vn-ver="l:L2"][data-vn-arrastre]'));
  // La línea en cancelación no se arrastra
  assert.equal(cont.querySelector('[data-vn-zona="cancelacion"] [data-vn-ver="l:L5"]').hasAttribute('data-vn-arrastre'), false);
  cont.querySelector('[data-vn-ver="l:L3"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(vistos, ['linea:L3']);
  cont.querySelector('[data-vn-cortar="E12"]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(soltados.map((a) => [a.modo, a.fila.id, a.linea.id]), [['DESVINCULAR', 'E12', 'L1']]);
  // Sin permiso de operar: ni tijeras ni arrastre
  const sinPermiso = W.montar(cont, { indice: indice, puedeOperar: () => false, icono: () => '', esc: esc, color: () => '',
    alVer: () => {}, alAbrir: () => {}, alSoltar: () => {}, alAvisar: () => {} });
  sinPermiso.pintar();
  assert.equal(cont.querySelectorAll('[data-vn-cortar], [data-vn-arrastre]').length, 0);
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
