/**
 * Las copias del navegador en IndexedDB (Almacen, src/html/js/api.html): las listas y los
 * catálogos se guardan ahí, sobreviven a recargar la página, se borran al invalidar y al cerrar
 * sesión, y los catálogos pintan al instante con la copia mientras piden lo fresco por detrás.
 * IndexedDB es fake-indexeddb (el mismo "disco" para dos cargas de página); google.script.run
 * es de mentira. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'api.html'), 'utf8');
const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(api)[1];

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 20));

/** Una carga de página. `disco` es el IndexedDB (compartido entre cargas = el mismo navegador) */
function pagina(disco, localStorageInicial) {
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  w.indexedDB = disco;
  w.IDBKeyRange = IDBKeyRange;
  Object.keys(localStorageInicial || {}).forEach((k) => w.localStorage.setItem(k, localStorageInicial[k]));
  const servidor = { respuestas: {}, llamadas: [], fallar: {} };
  w.google = { script: { run: new Proxy({}, {
    get(_, prop) {
      if (prop !== 'withSuccessHandler') return undefined;
      return (exito) => ({ withFailureHandler: (falla) => new Proxy({}, { get: (__, fn) => (...args) => {
        servidor.llamadas.push(fn + JSON.stringify(args));
        setTimeout(() => (servidor.fallar[fn] ? falla(new Error('servidor caído')) : exito(JSON.parse(JSON.stringify(servidor.respuestas[fn] === undefined ? null : servidor.respuestas[fn])))), 5);
      } }) });
    },
  }) } };
  w.eval(js + '\nwindow.api = { callServerListaCacheada, callServerCacheado, invalidarCacheLista, invalidarCacheCatalogo, limpiarListasGuardadas, Almacen };');
  w.eval('var state = { token: "tok-' + Math.random() + '", sesion: { correo: "ana@x.com" } };');
  return { w, api: w.api, servidor };
}

(async () => {
  const disco = new IDBFactory();

  console.log('1. Listas en IndexedDB');
  let p = pagina(disco, { 'lista:ana@x.com:apiVieja[]': '[1]', 'lineas.modoVista': 'tabla' });
  p.servidor.respuestas.apiListarX = [{ ID: 1 }];
  let r = await p.api.callServerListaCacheada('apiListarX', p.w.state.token);
  ok(r[0].ID === 1, 'sin copia, espera al servidor');
  await espera();
  ok(await p.api.Almacen.leer('lista:ana@x.com:apiListarX[]') === '[{"ID":1}]', 'y la guarda en IndexedDB (sin el token en la llave)');
  ok(p.w.localStorage.getItem('lista:ana@x.com:apiListarX[]') === null, 'no en localStorage');
  ok(p.w.localStorage.getItem('lista:ana@x.com:apiVieja[]') === null && p.w.localStorage.getItem('lineas.modoVista') === 'tabla',
    'las copias viejas de localStorage se limpian (y lo demás se queda)');

  console.log('2. Recargar la página');
  p = pagina(disco);
  p.servidor.respuestas.apiListarX = [{ ID: 1 }, { ID: 2 }];
  const t0 = Date.now();
  r = await p.api.callServerListaCacheada('apiListarX', p.w.state.token);
  ok(r.length === 1 && Date.now() - t0 < 50, 'pinta al instante con la copia de IndexedDB');
  await espera();
  ok(p.servidor.llamadas.length === 1, 'y pide lo fresco por detrás');

  console.log('3. Algo grande cabe (en localStorage no cabía)');
  const grande = Array.from({ length: 40000 }, (_, i) => ({ NOMBRE: 'PERSONA ' + i, CORREO: 'p' + i + '@ciudadmaderas.com' }));
  p.servidor.respuestas.apiListarGrande = grande;
  await p.api.callServerListaCacheada('apiListarGrande', p.w.state.token);
  await espera();
  const guardado = await p.api.Almacen.leer('lista:ana@x.com:apiListarGrande[]');
  ok(guardado && guardado.length > 1500000 && JSON.parse(guardado).length === 40000, 'una lista de ' + Math.round(JSON.stringify(grande).length / 1e6 * 10) / 10 + ' M caracteres se guarda completa');

  console.log('4. Catálogos persistentes');
  p = pagina(disco);
  p.servidor.respuestas.apiListarMarcas = ['FORD', 'NISSAN'];
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r.length === 2 && p.servidor.llamadas.length === 1, 'la primera vez espera al servidor');
  await espera();
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(p.servidor.llamadas.length === 1, 'en la misma carga de página no se vuelve a pedir');
  p = pagina(disco);   // otra carga de página, otro token
  p.servidor.respuestas.apiListarMarcas = ['FORD', 'NISSAN', 'TOYOTA'];
  const t1 = Date.now();
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r.length === 2 && Date.now() - t1 < 50, 'al recargar sale AL INSTANTE la copia, aunque el token sea otro');
  await espera();
  ok(p.servidor.llamadas.length === 1, 'y por detrás pide lo fresco');
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r.length === 3, 'la siguiente vez ya da lo fresco');

  console.log('5. Si el servidor falla, se queda la copia');
  p = pagina(disco);
  p.servidor.fallar.apiListarMarcas = true;
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  await espera();
  ok(r.length === 3, 'con copia: sale la copia aunque el servidor falle');
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r.length === 3, 'y se sigue usando');
  let error = null;
  p.servidor.fallar.apiListarSedes = true;
  try { await p.api.callServerCacheado('apiListarSedes', p.w.state.token); } catch (e) { error = e; }
  ok(error && /caído/.test(error.message), 'sin copia y con el servidor caído, truena como antes');
  delete p.servidor.fallar.apiListarSedes;
  p.servidor.respuestas.apiListarSedes = ['QRO'];
  r = await p.api.callServerCacheado('apiListarSedes', p.w.state.token);
  ok(r[0] === 'QRO', 'y la siguiente vez lo vuelve a intentar (el error no se queda guardado)');

  console.log('6. Invalidar');
  p = pagina(disco);
  p.servidor.respuestas.apiListarMarcas = ['UNA'];
  p.api.invalidarCacheCatalogo('apiListarMarcas', p.w.state.token);
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r.length === 1 && r[0] === 'UNA', 'invalidarCacheCatalogo: no sale la copia vieja, espera al servidor');
  p.servidor.respuestas.apiListarX = [{ ID: 9 }];
  p.api.invalidarCacheLista('apiListarX', p.w.state.token);
  r = await p.api.callServerListaCacheada('apiListarX', p.w.state.token);
  ok(r[0].ID === 9, 'invalidarCacheLista: el cargar() que sigue espera lo recién guardado');

  console.log('7. Cerrar sesión');
  await p.api.limpiarListasGuardadas();
  ok(await p.api.Almacen.leer('lista:ana@x.com:apiListarX[]') === null && await p.api.Almacen.leer('catalogo:ana@x.com:apiListarMarcas[]') === null,
    'no queda ninguna lista ni catálogo guardado');
  p = pagina(disco);
  p.servidor.respuestas.apiListarMarcas = ['NUEVA'];
  r = await p.api.callServerCacheado('apiListarMarcas', p.w.state.token);
  ok(r[0] === 'NUEVA', 'y la siguiente sesión empieza de cero');

  console.log('8. Sin IndexedDB ni localStorage');
  const sin = new JSDOM('<!doctype html><body></body>', { runScripts: 'outside-only', url: 'https://x.test/' }).window;
  Object.defineProperty(sin, 'localStorage', { get() { throw new Error('bloqueado'); } });
  sin.google = p.w.google;
  sin.eval(js + '\nwindow.api = { callServerCacheado };');
  sin.eval('var state = { token: "t", sesion: { correo: "ana@x.com" } };');
  r = await sin.api.callServerCacheado('apiListarMarcas', 't');
  ok(r[0] === 'NUEVA', 'funciona igual, solo en memoria');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.log('✘ ERROR', e.stack); process.exit(1); });
