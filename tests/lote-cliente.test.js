/**
 * El lote en la pantalla (src/html/js/api.html, 29-oct): las llamadas de fondo (precargar una lista, revalidar una lista
 * que ya se ve, el vigía) pedidas al mismo tiempo viajan como UNA ejecución (apiLote), de a lo más 6; cada una recibe su
 * respuesta o su error; lo interactivo nunca va en lote; si el lote se rechaza por cupo, se reintenta entero.
 * google.script.run es de mentira. Correr: node tests/lote-cliente.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'api.html'), 'utf8');
const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(api)[1];

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 30));
const SATURADO = 'Hay demasiadas secuencias de comandos ejecutándose de forma simultánea para esta cuenta de usuario de Google.';

function navegador() {
  const dom = new JSDOM('<!doctype html><body><div id="vista"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  // ejecuciones: cada llamada de google.script.run (lo que gasta cupo); lote: las partes de cada apiLote
  const servidor = { ejecuciones: [], lotes: [], fallar: {}, rechazarLote: 0 };
  const lista = (fn) => {
    if (servidor.fallar[fn]) throw new Error(servidor.fallar[fn]);
    return { v: [fn + ':dato'], huella: { ['ver_x_' + fn]: '1' } };
  };
  const correr = (fn, args) => {
    if (fn === 'apiListaConHuella') return lista(args[1]);
    if (fn === 'apiHuellasVigentes') { const r = {}; args[1].forEach((c) => { r[c] = '1'; }); return r; }
    return fn + ':directo';
  };
  w.google = { script: { run: new Proxy({}, {
    get(_, prop) {
      if (prop !== 'withSuccessHandler') return undefined;
      return (bien) => ({ withFailureHandler: (mal) => new Proxy({}, { get: (__, fn) => (...args) => {
        servidor.ejecuciones.push(fn);
        setTimeout(() => {
          try {
            if (fn === 'apiLote') {
              if (servidor.rechazarLote > 0) { servidor.rechazarLote--; throw new Error(SATURADO); }
              servidor.lotes.push(args[1].map((p) => (p.fn === 'apiListaConHuella' ? p.args[1] : p.fn)));
              bien(args[1].map((p) => { try { return { ok: true, v: correr(p.fn, p.args) }; } catch (e) { return { ok: false, error: e.message }; } }));
              return;
            }
            bien(correr(fn, args));
          } catch (e) { mal(e); }
        }, 15);
      } }) });
    },
  }) } };
  w.eval(js + '\nllamadasConfig.esperas = [5, 10, 20, 40];' +
    'window.precargarLista = precargarLista; window.callServerListaCacheada = callServerListaCacheada; window.callServer = callServer;' +
    'window.verTiempos = verTiempos; window.__cacheListas = cacheListas;');
  w.eval('var state = { token: "tok", sesion: { correo: "ana@x.com" } };');
  w.console.table = () => {};
  return { w, servidor };
}

(async () => {
  console.log('1. Lo de fondo pedido al mismo tiempo: una sola ejecución');
  {
    const { w, servidor } = navegador();
    const r = await Promise.all(['apiListarA', 'apiListarB', 'apiListarC'].map((fn) => w.precargarLista(fn, 'tok')));
    ok(servidor.ejecuciones.length === 1 && servidor.ejecuciones[0] === 'apiLote', 'tres precargas → un apiLote');
    ok(JSON.stringify(servidor.lotes[0]) === '["apiListarA","apiListarB","apiListarC"]', 'con las tres listas adentro');
    ok(r.map((x) => x[0]).join(',') === 'apiListarA:dato,apiListarB:dato,apiListarC:dato', 'y cada una recibe lo suyo');
    const tiempos = w.verTiempos().map((t) => t.funcion);
    ok(tiempos.includes('apiListarA') && tiempos.some((f) => /^apiLote ×3$/.test(f)), 'verTiempos anota cada lista y el lote');
  }

  console.log('2. De 6 en 6');
  {
    const { w, servidor } = navegador();
    await Promise.all(Array.from({ length: 8 }, (_, i) => w.precargarLista('apiListar' + i, 'tok')));
    ok(servidor.ejecuciones.filter((f) => f === 'apiLote').length === 2 && servidor.lotes.map((l) => l.length).join(',') === '6,2',
      'ocho precargas → dos lotes (6 y 2)');
  }

  console.log('3. Una sola sale como siempre, sin envoltura');
  {
    const { w, servidor } = navegador();
    await w.precargarLista('apiListarSola', 'tok');
    ok(JSON.stringify(servidor.ejecuciones) === '["apiListaConHuella"]', 'una precarga sola → apiListaConHuella directo');
  }

  console.log('4. Lo interactivo nunca va en lote');
  {
    const { w, servidor } = navegador();
    const fondo = [w.precargarLista('apiListarA', 'tok'), w.precargarLista('apiListarB', 'tok')];
    const esperando = w.callServerListaCacheada('apiListarC', 'tok');   // sin copia: la persona la está esperando
    const guardar = w.callServer('apiGuardarAlgo', 'tok', { x: 1 });
    await Promise.all(fondo.concat([esperando, guardar]));
    ok(servidor.ejecuciones.filter((f) => f === 'apiLote').length === 1 && JSON.stringify(servidor.lotes[0]) === '["apiListarA","apiListarB"]',
      'el lote lleva solo las dos de fondo');
    ok(servidor.ejecuciones.includes('apiListaConHuella') && servidor.ejecuciones.includes('apiGuardarAlgo'), 'la lista esperada y el guardar salen solos');
  }

  console.log('5. Cada parte con su error');
  {
    const { w, servidor } = navegador();
    servidor.fallar.apiListarMala = 'Sin permiso para Mala';
    const [buena, mala] = await Promise.all([
      w.precargarLista('apiListarBuena', 'tok'),
      w.callServerListaCacheada('apiListarMala', 'tok').catch((e) => 'error: ' + e.message),
    ]);
    ok(buena[0] === 'apiListarBuena:dato', 'la buena llega');
    ok(mala === 'error: Sin permiso para Mala' || mala === null, 'la mala falla sola');
    const r = await Promise.all([w.precargarLista('apiListarX', 'tok'), w.precargarLista('apiListarMala', 'tok')]);
    ok(r[0][0] === 'apiListarX:dato' && r[1] === null, 'en el mismo lote: una llega y la otra falla (precargar se traga su error)');
  }

  console.log('6. Si el lote se rechaza por cupo, se reintenta entero');
  {
    const { w, servidor } = navegador();
    servidor.rechazarLote = 2;
    const r = await Promise.all([w.precargarLista('apiListarA', 'tok'), w.precargarLista('apiListarB', 'tok')]);
    ok(servidor.ejecuciones.filter((f) => f === 'apiLote').length === 3 && r.every((x) => x && x.length === 1), 'a la tercera pasa, con las dos listas');
    ok(w.verTiempos().some((t) => /^saturado:apiLote/.test(t.funcion)), 'y verTiempos cuenta los rechazos por cupo');
  }

  console.log('7. Revalidar una lista que ya se ve va de fondo');
  {
    const { w, servidor } = navegador();
    await Promise.all([w.callServerListaCacheada('apiListarA', 'tok'), w.callServerListaCacheada('apiListarB', 'tok')]);   // sin copia: solas
    servidor.ejecuciones.length = 0;
    Object.values(w.__cacheListas).forEach((e) => { e.ts = 0; });   // ya pasaron los 15 s
    const r = await Promise.all([w.callServerListaCacheada('apiListarA', 'tok'), w.callServerListaCacheada('apiListarB', 'tok')]);
    ok(r.every((x) => x[0].endsWith(':dato')), 'con copia: se pinta al instante');
    await espera(60);
    ok(JSON.stringify(servidor.ejecuciones) === '["apiLote"]', 'y lo fresco de las dos viaja en un solo lote');
  }

  await espera(50);
  if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
  console.log('\nTODO OK');
  process.exit(0);
})();
