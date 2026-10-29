/**
 * Un solo vigía por navegador (src/html/js/api.html, VigiaCompartido, 29-oct): con varias pestañas de la misma persona,
 * la que tiene el candado (Web Locks) pregunta UNA vez por todas (apiHuellasVigentes) con las claves que le publican las
 * demás (BroadcastChannel); cada pestaña repide solo lo suyo que cambió. Si la vigía cierra sesión, otra toma el relevo.
 * Sin esas APIs, cada pestaña pregunta sola, como antes. Pestañas jsdom con un candado y un canal de mentira conectados.
 *
 * Correr: node tests/vigia-pestanas.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'api.html'), 'utf8');
const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(api)[1];

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 40));

/** El navegador: un candado y canales compartidos entre sus pestañas, y un servidor (versiones de hoja) para todos */
function navegador() {
  const candados = {};   // nombre → { dueno, fila: [{ cb, listo }] }
  const locks = {
    request(nombre, cb) {
      return new Promise((listo) => {
        const c = candados[nombre] || (candados[nombre] = { dueno: null, fila: [] });
        const turno = { cb: cb, listo: listo };
        const dar = (t) => {
          c.dueno = t;
          Promise.resolve(t.cb()).then((v) => { c.dueno = null; t.listo(v); const sig = c.fila.shift(); if (sig) dar(sig); });
        };
        if (!c.dueno) dar(turno);
        else c.fila.push(turno);
      });
    },
  };
  const canales = [];
  class Canal {
    constructor(nombre) { this.nombre = nombre; this.onmessage = null; canales.push(this); }
    postMessage(data) {
      const copia = JSON.parse(JSON.stringify(data));
      canales.filter((c) => c !== this && c.nombre === this.nombre).forEach((c) => setTimeout(() => c.onmessage && c.onmessage({ data: copia }), 1));
    }
    close() { const i = canales.indexOf(this); if (i !== -1) canales.splice(i, 1); }
  }
  const servidor = { versiones: {}, preguntas: 0, listas: [] };
  function pestana(token, opciones) {
    const o = opciones || {};
    const dom = new JSDOM('<!doctype html><body><div id="vista"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
    const w = dom.window;
    // jsdom arranca con la página "escondida" (document.hidden = true): aquí la pestaña está a la vista
    Object.defineProperty(w.document, 'hidden', { value: false, configurable: true });
    if (!o.sinApis) {
      Object.defineProperty(w.navigator, 'locks', { value: locks });
      w.BroadcastChannel = Canal;
    } else {
      w.BroadcastChannel = undefined;
    }
    w.google = { script: { run: new Proxy({}, {
      get(_, prop) {
        if (prop !== 'withSuccessHandler') return undefined;
        return (bien) => ({ withFailureHandler: () => new Proxy({}, { get: (__, fn) => (...args) => setTimeout(() => {
          if (fn === 'apiHuellasVigentes') {
            servidor.preguntas++;
            const r = {};
            args[1].forEach((c) => { r[c] = servidor.versiones[c] || '1'; });
            bien(r);
            return;
          }
          if (fn === 'apiListaConHuella') {
            const lista = args[1];
            servidor.listas.push(token + ':' + lista);
            const clave = 'ver_x_' + lista;
            bien({ v: [lista + '@' + (servidor.versiones[clave] || '1')], huella: { [clave]: servidor.versiones[clave] || '1' } });
            return;
          }
          bien(null);
        }, 5) }) });
      },
    }) } };
    w.eval(js + '\nwindow.callServerListaCacheada = callServerListaCacheada; window.escucharLista = escucharLista;' +
      'window.vigilarListas = vigilarListas; window.VigiaCompartido = VigiaCompartido; window.limpiarListasGuardadas = limpiarListasGuardadas;');
    w.eval('var state = { token: ' + JSON.stringify(token) + ', sesion: { correo: "ana@x.com" } };');
    const recargas = [];
    return {
      w, recargas,
      /** Abre una pantalla con su lista y la escucha */
      async ver(lista) {
        await w.callServerListaCacheada(lista, token);
        const el = w.document.createElement('div');
        w.document.getElementById('vista').appendChild(el);
        w.escucharLista(lista, () => recargas.push(lista), el);
      },
    };
  }
  return { pestana, servidor };
}

(async () => {
  console.log('1. Tres pestañas: una sola pregunta por todas');
  const nav = navegador();
  const a = nav.pestana('tokA');
  const b = nav.pestana('tokB');
  const c = nav.pestana('tokC');
  await a.ver('apiListarA');
  await b.ver('apiListarB');
  await c.ver('apiListarC');
  await a.w.vigilarListas(true);   // A toma el candado: es la vigía
  await espera();
  ok(a.w.VigiaCompartido.esVigia() && !b.w.VigiaCompartido.esVigia(), 'la primera pestaña es la vigía');
  await a.w.vigilarListas(true);
  await b.w.vigilarListas(true);
  await c.w.vigilarListas(true);
  await espera();
  ok(nav.servidor.preguntas === 0, 'las pestañas solo publican sus claves: nadie pregunta todavía');
  nav.servidor.versiones.ver_x_apiListarB = '2';   // alguien cambió lo que ve la pestaña B
  await a.w.VigiaCompartido.consultar();
  await espera(80);
  ok(nav.servidor.preguntas === 1, 'la vigía hace UNA sola pregunta por las tres');
  ok(b.recargas.join() === 'apiListarB' && !a.recargas.length && !c.recargas.length, 'solo la pestaña B, la que cambió, vuelve a pintar');
  ok(nav.servidor.listas.filter((l) => l === 'tokB:apiListarB').length === 2, 'y B repide su lista (con su propio token)');

  console.log('2. Si la vigía cierra sesión, otra toma el relevo');
  a.w.limpiarListasGuardadas();
  await espera();
  ok(!a.w.VigiaCompartido.esVigia() && (b.w.VigiaCompartido.esVigia() || c.w.VigiaCompartido.esVigia()), 'el candado pasa a otra pestaña');
  const nueva = b.w.VigiaCompartido.esVigia() ? b : c;
  await b.w.vigilarListas(true);
  await c.w.vigilarListas(true);
  await espera();
  nav.servidor.versiones.ver_x_apiListarC = '2';
  await nueva.w.VigiaCompartido.consultar();
  await espera(80);
  ok(nav.servidor.preguntas === 2 && c.recargas.join() === 'apiListarC', 'la nueva vigía pregunta y C se actualiza');

  console.log('3. Sin Web Locks / BroadcastChannel: cada pestaña pregunta sola, como antes');
  {
    const otro = navegador();
    const sola = otro.pestana('tokS', { sinApis: true });
    await sola.ver('apiListarS');
    otro.servidor.versiones.ver_x_apiListarS = '2';
    await sola.w.vigilarListas(true);
    await espera(80);
    ok(otro.servidor.preguntas === 1 && sola.recargas.join() === 'apiListarS', 'pregunta ella misma y se actualiza');
  }

  await espera(50);
  if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
  console.log('\nTODO OK');
  process.exit(0);
})();
