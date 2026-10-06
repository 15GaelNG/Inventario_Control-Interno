/**
 * Clics de verdad en la ventana "Editar permisos" sobre la vista previa: "Todo el grupo", una
 * excepción, ↺, lo que implica cada permiso y lo que se manda al guardar. Necesita Chrome (por eso
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

  let e = await estado();
  ok(e.cuenta === 'Sin cambios' && !e.guardar && e.hologramas === 'EDICION' && e.holoExcepcion, 'al abrir: sin cambios, Hologramas es excepción en Editar');

  await clic('[data-usr-grupo="servicios-vehiculares"] [data-nivel="LECTURA"]');
  e = await estado();
  ok(e.vehiculos === 'LECTURA' && e.hologramas === 'LECTURA' && e.grupoActivo === 'LECTURA', 'Todo el grupo → Ver: los 8 módulos quedan en Ver');
  ok(e.cuenta === '8 cambios sin guardar' && e.guardar, 'cuenta 8 cambios y deja guardar (' + e.cuenta + ')');

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
  ok(!errores.length, errores.length ? 'errores: ' + errores.join(' | ') : 'sin errores de JS');
  await nav.close();
  console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
