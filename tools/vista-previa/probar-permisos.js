/**
 * Clics de verdad en la ventana "Editar permisos" sobre la vista previa: "Todo el grupo", una
 * excepción, ↺, las secciones de un módulo (Hereda / propia), lo que implica cada permiso y lo que se
 * manda al guardar. Luego la matriz por área: el clic que cambia la celda (también la de una sección,
 * que pasa por Hereda), volver a como estaba y lo que manda Guardar. Necesita Chrome (por eso
 * no va en npm test, que corre en GitHub sin navegador):
 *
 *   node tools/vista-previa/probar-permisos.js
 */
const puppeteer = require('puppeteer-core');
const { construir } = require('./construir');

(async () => {
  const pagina = construir();
  const chrome = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((r) => require('fs').existsSync(r));
  const nav = await puppeteer.launch({ executablePath: chrome, headless: 'new', protocolTimeout: 60000 });
  let fallas = 0;
  const p = await nav.newPage();
  const errores = [];
  p.on('pageerror', (e) => errores.push(e.message));
  await p.setViewport({ width: 1400, height: 1000 });
  await p.goto('file:///' + pagina.replace(/\\/g, '/') + '#escena=usuarios-editar-permisos');
  await p.waitForSelector('#usr-modal:not([hidden]) .usr-op', { timeout: 20000 });
  const estado = () => p.evaluate(() => ({
    cuenta: document.getElementById('usr-modal-cuenta').textContent,
    guardar: !document.getElementById('usr-modal-guardar').disabled,
    hologramas: document.querySelector('[data-modulo="hologramas"] .usr-op.activa').dataset.nivel,
    holoExcepcion: document.querySelector('[data-modulo="hologramas"]').classList.contains('excepcion'),
    vehiculos: document.querySelector('[data-modulo="vehiculos"] .usr-op.activa').dataset.nivel,
    grupoActivo: (document.querySelector('[data-usr-grupo="servicios-vehiculares"] .usr-op.activa') || { dataset: {} }).dataset.nivel || null,
    implica: Array.from(document.querySelectorAll('#usr-modal-cuerpo .usr-implica li')).map((li) => li.textContent.trim()),
  }));
  const clic = (sel) => p.evaluate((s) => document.querySelector(s).click(), sel);
  const ok = (c, t) => { console.log((c ? '  ✔ ' : '  ✘ ') + t); if (!c) fallas++; };

  const enGrupo = await p.evaluate(() => document.querySelector('[data-usr-grupo="servicios-vehiculares"]').closest('.usr-editar-grupo')
    .nextElementSibling.querySelectorAll('[data-modulo]').length);
  let e = await estado();
  ok(e.cuenta === 'Sin cambios' && !e.guardar && e.hologramas === 'EDICION' && e.holoExcepcion, 'al abrir: sin cambios, Hologramas es excepción en Editar');

  await clic('[data-usr-grupo="servicios-vehiculares"] [data-nivel="LECTURA"]');
  e = await estado();
  ok(e.vehiculos === 'LECTURA' && e.hologramas === 'LECTURA' && e.grupoActivo === 'LECTURA', 'Todo el grupo → Ver: los ' + enGrupo + ' módulos quedan en Ver');
  ok(e.cuenta === enGrupo + ' cambios sin guardar' && e.guardar, 'cuenta ' + enGrupo + ' cambios y deja guardar (' + e.cuenta + ')');

  await clic('[data-usr-restablecer="hologramas"]');
  e = await estado();
  ok(e.hologramas === 'NINGUNO' && !e.holoExcepcion, '↺ en Hologramas: vuelve a lo de su área (Sin acceso) y deja de ser excepción');
  ok(e.grupoActivo === null, 'el grupo ya no está parejo: "Todo el grupo" sin marcar');

  await clic('[data-modulo="instalacion-sensores"] [data-nivel="EDICION"]');
  await clic('[data-modulo="vehiculos"] [data-nivel="EDICION"]');
  e = await estado();
  ok(e.implica.some((t) => /En Vehículos también podrá editar la sección/.test(t)), 'Editar en Vehículos y en Sensores: dice que podrá editar la sección de sensor');
  await clic('[data-modulo="instalacion-sensores"] [data-nivel="LECTURA"]');
  e = await estado();
  ok(e.implica.some((t) => /En Vehículos no podrá editar la sección/.test(t)), 'Sensores solo en Ver: dice que en Vehículos no podrá editar esa sección');

  // Secciones de Vehículos (permisos en árbol): plegadas; al abrirlas, cada una hereda
  const seccion = (id) => p.evaluate((s) => {
    const fila = document.querySelector('[data-modulo="' + s + '"]');
    return fila ? { activa: fila.querySelector('.usr-op.activa').dataset.nivel, propia: fila.classList.contains('excepcion'),
      texto: fila.querySelector('.usr-editar-hereda').textContent } : null;
  }, id);
  ok(!(await seccion('vehiculos.exportar')), 'las secciones de un módulo salen plegadas');
  await clic('[data-usr-secciones="vehiculos"]');
  let s = await seccion('vehiculos.exportar');
  ok(s && s.activa === 'HEREDA' && !s.propia && /Hereda: Editar/.test(s.texto), 'al abrirlas, Exportar hereda lo de Vehículos (' + (s && s.texto) + ')');
  await clic('[data-modulo="vehiculos.exportar"] [data-nivel="NINGUNO"]');
  s = await seccion('vehiculos.exportar');
  ok(s.activa === 'NINGUNO' && s.propia && s.texto === 'Propia', 'Sin acceso en Exportar: queda como regla propia de la sección');
  await clic('[data-usr-restablecer="vehiculos.exportar"]');
  s = await seccion('vehiculos.exportar');
  ok(s.activa === 'HEREDA' && !s.propia, '↺ en la sección: vuelve a heredar');

  await clic('[data-usr-grupo="servicios-vehiculares"] [data-nivel="NINGUNO"]');
  e = await estado();
  ok(e.cuenta === '1 cambio sin guardar', 'Todo el grupo → Sin acceso: solo queda 1 cambio (quitar la excepción de Hologramas) (' + e.cuenta + ')');

  // Lo que se manda al guardar
  const enviado = await p.evaluate(() => new Promise((resolve) => {
    const original = window.callServer;
    window.callServer = (fn, ...a) => { if (fn === 'apiPermisosGuardar') { resolve(a[1]); return new Promise(() => {}); } return original(fn, ...a); };
    document.getElementById('usr-modal-guardar').click();
  }));
  ok(enviado.length === 1 && enviado[0].modulo === 'hologramas' && enviado[0].permiso === null && /@/.test(enviado[0].quien),
    'Guardar manda solo eso: Hologramas → sin regla (vuelve a lo del área) ' + JSON.stringify(enviado));

  // ---- Matriz por área (la escena ya cambió TESORERIA·Vehículos y TI·Hologramas a Ver)
  await p.goto('about:blank');
  await p.goto('file:///' + pagina.replace(/\\/g, '/') + '#escena=usuarios-matriz');
  await p.waitForSelector('#usr-matriz .usr-celda.cambiada', { timeout: 20000 });
  const celda = (area, modulo) => '[data-celda-area="' + area + '"][data-celda-modulo="' + modulo + '"]';
  const matriz = (area, modulo) => p.evaluate((sel) => {
    const c = document.querySelector(sel);
    return { nivel: ['NINGUNO', 'LECTURA', 'EDICION'].find((n) => c.classList.contains(n)), cambiada: c.classList.contains('cambiada'),
      excepcion: c.classList.contains('con-excepcion'), cuenta: document.getElementById('usr-matriz-cuenta').textContent,
      guardar: !document.getElementById('usr-matriz-guardar').disabled };
  }, celda(area, modulo));
  let m = await matriz('TESORERIA', 'vehiculos');
  ok(m.nivel === 'LECTURA' && m.cambiada && m.cuenta === '2 cambios sin guardar' && m.guardar, 'un clic pasa de Sin acceso a Ver, marcada y contada (' + m.cuenta + ')');
  ok((await matriz('CONTROL INTERNO', 'hologramas')).excepcion, 'el punto de excepción sale donde alguien del área tiene una');
  await clic(celda('TESORERIA', 'vehiculos'));
  m = await matriz('TESORERIA', 'vehiculos');
  ok(m.nivel === 'EDICION', 'otro clic: Editar');
  await clic(celda('TESORERIA', 'vehiculos'));
  m = await matriz('TESORERIA', 'vehiculos');
  ok(m.nivel === 'NINGUNO' && !m.cambiada && m.cuenta === '1 cambio sin guardar', 'y otro vuelve a como estaba: deja de contar (' + m.cuenta + ')');

  // Secciones en la matriz: TI tiene Vehículos con Editar y Exportar cortado con Sin acceso (datos-falsos.js)
  const heredada = (area, modulo) => p.evaluate((sel) => document.querySelector(sel).classList.contains('heredada'), celda(area, modulo));
  m = await matriz('TI', 'vehiculos.exportar');
  ok(m.nivel === 'NINGUNO' && !(await heredada('TI', 'vehiculos.exportar')), 'TI · Vehículos › Exportar: su regla (Sin acceso), no heredada');
  m = await matriz('TI', 'vehiculos.documentos');
  ok(m.nivel === 'EDICION' && await heredada('TI', 'vehiculos.documentos'), 'TI · Vehículos › Documentos: hereda Editar (tenue)');
  await clic(celda('TI', 'vehiculos.documentos'));
  m = await matriz('TI', 'vehiculos.documentos');
  ok(m.nivel === 'NINGUNO' && m.cambiada && !(await heredada('TI', 'vehiculos.documentos')), 'un clic en una sección que hereda: Sin acceso propio');
  for (let i = 0; i < 3; i++) await clic(celda('TI', 'vehiculos.documentos'));
  m = await matriz('TI', 'vehiculos.documentos');
  ok(await heredada('TI', 'vehiculos.documentos') && !m.cambiada && m.cuenta === '1 cambio sin guardar', 'Ver, Editar y otra vez Hereda: como estaba (' + m.cuenta + ')');

  // Perfiles en la matriz: CAPITAL HUMANO tiene el perfil Flotilla - consulta (Vehículos en Ver, Exportar cortado)
  m = await matriz('CAPITAL HUMANO', 'vehiculos');
  ok(m.nivel === 'LECTURA' && await heredada('CAPITAL HUMANO', 'vehiculos'), 'un área con perfil: Vehículos en Ver, de su perfil (Hereda, tenue)');
  ok((await matriz('CAPITAL HUMANO', 'vehiculos.exportar')).nivel === 'NINGUNO', 'y Exportar cortado por el perfil');
  await clic('#usr-matriz-modo [data-modo="perfiles"]');
  m = await matriz('perfil:Flotilla - consulta', 'vehiculos');
  ok(m.nivel === 'LECTURA' && !(await heredada('perfil:Flotilla - consulta', 'vehiculos')) && m.cuenta === '1 cambio sin guardar',
    'Por perfil: la columna del perfil con su regla (Ver), sin perder el cambio pendiente del otro modo');
  await clic('#usr-matriz-modo [data-modo="areas"]');
  const enviadoMatriz = await p.evaluate(() => new Promise((resolve) => {
    const original = window.callServer;
    window.callServer = (fn, ...a) => { if (fn === 'apiPermisosGuardar') { resolve(a[1]); return new Promise(() => {}); } return original(fn, ...a); };
    document.getElementById('usr-matriz-guardar').click();
  }));
  ok(enviadoMatriz.length === 1 && enviadoMatriz[0].quien === 'TI' && enviadoMatriz[0].modulo === 'hologramas' && enviadoMatriz[0].permiso === 'LECTURA',
    'Guardar manda solo lo que cambió, con el mismo formato que la ventana ' + JSON.stringify(enviadoMatriz));

  ok(!errores.length, errores.length ? 'errores: ' + errores.join(' | ') : 'sin errores de JS');
  await nav.close();
  console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
