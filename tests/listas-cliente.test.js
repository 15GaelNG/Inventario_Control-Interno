/**
 * Pruebas de las listas del cliente que pintan al instante (src/html/js/api.html):
 * callServerListaCacheada devuelve la copia guardada y actualiza por detrás, avisa con
 * "lista-actualizada" solo si cambió, invalidarCacheLista fuerza lo fresco y al cerrar
 * sesión no queda nada guardado. google.script.run es de mentira. Correr: npm test
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'api.html'), 'utf8');
const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(api)[1];

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 10));

function navegador(localStorageInicial) {
  const dom = new JSDOM('<!doctype html><body><div id="vista"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  Object.keys(localStorageInicial || {}).forEach((k) => w.localStorage.setItem(k, localStorageInicial[k]));
  const servidor = { respuestas: {}, llamadas: [], huellas: {}, vigentes: {}, preguntas: 0 };
  // google.script.run de mentira: responde lo que diga servidor.respuestas[fn], un poco después. Las listas llegan
  // por apiListaConHuella (con la huella de servidor.huellas[fn]) y el vigía pregunta a apiHuellasVigentes.
  w.google = { script: { run: new Proxy({}, {
    get(_, prop) {
      if (prop === 'withSuccessHandler') {
        return (ok) => ({ withFailureHandler: () => new Proxy({}, { get: (__, fn) => (...args) => {
          if (fn === 'apiHuellasVigentes') {
            servidor.preguntas++;
            setTimeout(() => ok(JSON.parse(JSON.stringify(servidor.vigentes))), 5);
            return;
          }
          const real = fn === 'apiListaConHuella' ? args[1] : fn;
          servidor.llamadas.push(real);
          const valor = JSON.parse(JSON.stringify(servidor.respuestas[real] === undefined ? null : servidor.respuestas[real]));
          setTimeout(() => ok(fn === 'apiListaConHuella' ? { v: valor, huella: servidor.huellas[real] || {} } : valor), 5);
        } }) });
      }
      return undefined;
    },
  }) } };
  w.eval(js + '\nwindow.callServerListaCacheada = callServerListaCacheada; window.invalidarCacheLista = invalidarCacheLista;' +
    'window.escucharLista = escucharLista; window.limpiarListasGuardadas = limpiarListasGuardadas; window.precargarLista = precargarLista;' +
    'window.verTiempos = verTiempos; window.adelantar = adelantar; window.callServer = callServer;');
  w.eval('var state = { sesion: { correo: "ana@x.com" } };');
  return { w, servidor };
}

(async () => {
  console.log('1. Sin copia: espera al servidor y la guarda');
  let { w, servidor } = navegador();
  servidor.respuestas.apiListarX = [{ ID: 1 }];
  let r = await w.callServerListaCacheada('apiListarX', 'token-1');
  ok(r.length === 1 && servidor.llamadas.length === 1, 'la primera vez pide al servidor');
  ok(w.localStorage.getItem('lista:ana@x.com:apiListarX[]') === '[{"ID":1}]', 'y la guarda en el navegador (sin el token en la llave)');
  r = await w.callServerListaCacheada('apiListarX', 'token-1');
  ok(servidor.llamadas.length === 1, 'pedida hace un momento: no vuelve a ir al servidor');

  console.log('2. Con copia de una visita anterior (la página se recargó)');
  ({ w, servidor } = navegador({ 'lista:ana@x.com:apiListarX[]': '[{"ID":1}]' }));
  servidor.respuestas.apiListarX = [{ ID: 1 }, { ID: 2 }];
  const avisos = [];
  w.addEventListener('lista-actualizada', (ev) => avisos.push(ev.detail.fn));
  const t0 = Date.now();
  r = await w.callServerListaCacheada('apiListarX', 'token-NUEVO');
  ok(r.length === 1 && Date.now() - t0 < 5, 'pinta AL INSTANTE con la copia, aunque el token sea otro');
  await espera(20);
  ok(servidor.llamadas.length === 1, 'y por detrás pide lo fresco');
  ok(avisos.join() === 'apiListarX', 'como llegó distinto, avisa con "lista-actualizada"');
  r = await w.callServerListaCacheada('apiListarX', 'token-NUEVO');
  ok(r.length === 2, 'la siguiente vez ya da lo fresco');

  console.log('3. Si lo fresco llega igual, no avisa');
  ({ w, servidor } = navegador({ 'lista:ana@x.com:apiListarX[]': '[{"ID":1}]' }));
  servidor.respuestas.apiListarX = [{ ID: 1 }];
  let avisosIgual = 0;
  w.addEventListener('lista-actualizada', () => avisosIgual++);
  await w.callServerListaCacheada('apiListarX', 't');
  await espera(20);
  ok(servidor.llamadas.length === 1 && avisosIgual === 0, 'pidió, comparó y no molestó a nadie');

  console.log('4. escucharLista');
  ({ w, servidor } = navegador({ 'lista:ana@x.com:apiListarX[]': '[]' }));
  servidor.respuestas.apiListarX = [{ ID: 9 }];
  let repintados = 0;
  const vista = w.document.getElementById('vista');
  w.escucharLista('apiListarX', () => repintados++, vista);
  w.escucharLista('apiListarOtra', () => { repintados += 100; }, vista);
  await w.callServerListaCacheada('apiListarX', 't');
  await espera(20);
  ok(repintados === 1, 'el módulo de esa lista se vuelve a pintar (y no el de otra lista)');
  vista.remove();
  w.invalidarCacheLista('apiListarX', 't');
  w.localStorage.setItem('lista:ana@x.com:apiListarX[]', '[]');
  await w.callServerListaCacheada('apiListarX', 't');
  await espera(20);
  ok(repintados === 1, 'si ya se salió del módulo (su vista no está), no lo repinta');

  console.log('5. invalidarCacheLista: después de guardar, lo fresco');
  ({ w, servidor } = navegador({ 'lista:ana@x.com:apiListarX[]': '[{"ID":1}]' }));
  servidor.respuestas.apiListarX = [{ ID: 1, EDITADO: true }];
  w.invalidarCacheLista('apiListarX', 't');
  await espera(5);
  ok(w.localStorage.getItem('lista:ana@x.com:apiListarX[]') === null, 'borra la copia guardada');
  r = await w.callServerListaCacheada('apiListarX', 't');
  ok(r[0].EDITADO === true, 'y el cargar() que sigue espera el dato recién guardado');

  console.log('6. Cerrar sesión y precarga');
  ({ w, servidor } = navegador({ 'lista:ana@x.com:apiListarX[]': '[1]', 'lista:ana@x.com:apiListarY[]': '[2]', 'lineas.modoVista': 'tabla' }));
  await w.limpiarListasGuardadas();
  ok(w.localStorage.getItem('lista:ana@x.com:apiListarX[]') === null && w.localStorage.getItem('lista:ana@x.com:apiListarY[]') === null,
    'al cerrar sesión se borran todas las listas guardadas');
  ok(w.localStorage.getItem('lineas.modoVista') === 'tabla', 'y no toca otras preferencias del navegador');
  servidor.respuestas.apiListarZ = [3];
  await w.precargarLista('apiListarZ', 't');
  ok(w.localStorage.getItem('lista:ana@x.com:apiListarZ[]') === '[3]', 'precargarLista la deja lista sin pintar nada');
  ok(w.verTiempos().some((t) => t.funcion === 'apiListarZ'), 'verTiempos() registra cuánto tardó cada llamada');

  console.log('7. Sin localStorage (navegación privada, bloqueado)');
  ({ w, servidor } = navegador());
  Object.defineProperty(w, 'localStorage', { get() { throw new Error('bloqueado'); } });
  servidor.respuestas.apiListarX = [{ ID: 1 }];
  r = await w.callServerListaCacheada('apiListarX', 't');
  ok(r.length === 1, 'funciona igual, solo con memoria');
  await w.limpiarListasGuardadas();
  ok(true, 'y cerrar sesión no truena');

  console.log('8. adelantar(): pedir antes de que la pantalla lo necesite');
  ({ w, servidor } = navegador());
  servidor.respuestas.apiResumenInicio = { kpi: 1 };
  w.adelantar('apiResumenInicio', 'tok');
  ok(servidor.llamadas.length === 1, 'adelantar ya manda la llamada');
  r = await w.callServer('apiResumenInicio', 'tok');
  ok(r.kpi === 1 && servidor.llamadas.length === 1, 'la pantalla recibe esa misma respuesta, sin pedirla otra vez');
  await w.callServer('apiResumenInicio', 'tok');
  ok(servidor.llamadas.length === 2, 'se usa una sola vez: la siguiente sí va al servidor');
  w.adelantar('apiResumenInicio', 'tok');
  await w.callServer('apiResumenInicio', 'OTRO');
  ok(servidor.llamadas.length === 4, 'con otros argumentos no se confunde');

  console.log('9. El vigía: la pantalla abierta se actualiza sola cuando cambia su hoja');
  ({ w, servidor } = navegador());
  w.eval('window.vigilarListas = vigilarListas; state.token = "tok-v";');
  // jsdom arranca con la página "escondida" (document.hidden = true): aquí la pestaña está a la vista
  Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
  servidor.respuestas.apiListarV = [{ ID: 1 }];
  servidor.huellas.apiListarV = { ver_libro_VEHICULOS: 'a1' };
  servidor.vigentes = { ver_libro_VEHICULOS: 'a1' };
  const vistaV = w.document.getElementById('vista');
  let repintadas = 0;
  w.escucharLista('apiListarV', () => repintadas++, vistaV);
  await w.callServerListaCacheada('apiListarV', 'tok-v');
  ok(servidor.llamadas.join() === 'apiListarV', 'la lista llega con su huella (por apiListaConHuella)');
  await w.vigilarListas(true);
  await espera(20);
  ok(servidor.preguntas === 1 && servidor.llamadas.length === 1, 'sin cambios: solo pregunta (barato) y no vuelve a pedir la lista');
  servidor.vigentes = { ver_libro_VEHICULOS: 'b2' };
  servidor.respuestas.apiListarV = [{ ID: 1 }, { ID: 2 }];
  servidor.huellas.apiListarV = { ver_libro_VEHICULOS: 'b2' };   // la lista nueva llega con la versión nueva
  await w.vigilarListas(true);
  await espera(30);
  ok(servidor.llamadas.length === 2, 'cambió la versión de su hoja: vuelve a pedir esa lista');
  ok(repintadas === 1, 'y como llegó distinta, la pantalla se vuelve a pintar sola');
  servidor.vigentes = { ver_libro_VEHICULOS: 'b2' };
  await w.vigilarListas(true);
  await espera(20);
  ok(servidor.llamadas.length === 2, 'con la huella nueva ya no la vuelve a pedir');
  servidor.vigentes = {};   // el servidor no pudo leer las versiones (CacheService lento)
  const llamadasAntes = servidor.llamadas.length;
  await w.vigilarListas(true);
  await espera(20);
  ok(servidor.llamadas.length === llamadasAntes, 'si el servidor no sabe las versiones, no repide nada (nada de pedir todo a la vez)');
  servidor.vigentes = { ver_libro_VEHICULOS: 'b2' };
  Object.defineProperty(w.document, 'hidden', { value: true, configurable: true });
  const antes = servidor.preguntas;
  await w.vigilarListas(true);
  ok(servidor.preguntas === antes, 'con la pestaña escondida no pregunta nada');
  Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
  vistaV.remove();
  await w.vigilarListas(true);
  ok(servidor.preguntas === antes, 'si ya se navegó a otro módulo, esa lista ya no se vigila');
  w.eval('state.token = "";');
  ok((await w.vigilarListas(true)) === 0, 'sin sesión no hace nada');

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.log('✘ ERROR', e.stack); process.exit(1); });
