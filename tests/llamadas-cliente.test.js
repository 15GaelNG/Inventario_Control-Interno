/**
 * El cupo de ejecuciones de Apps Script desde el navegador (src/html/js/api.html, 29-oct): cada pestaña tiene a lo más
 * llamadasConfig.maxEnVuelo llamadas en curso (las demás esperan su turno) y el error "Hay demasiadas secuencias de
 * comandos ejecutándose de forma simultánea…" se reintenta solo (Google lo da ANTES de correr la función). Cualquier
 * otro error sale tal cual. google.script.run es de mentira. Correr: node tests/llamadas-cliente.test.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'api.html'), 'utf8');
const js = /<script[^>]*>([\s\S]*?)<\/script>/.exec(api)[1];

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const espera = (ms) => new Promise((r) => setTimeout(r, ms || 10));
const SATURADO = 'Hay demasiadas secuencias de comandos ejecutándose de forma simultánea para esta cuenta de usuario de Google.';

/** Un navegador con google.script.run de mentira: `servidor.responder(fn, args)` decide (valor, o { error }) */
function navegador() {
  const dom = new JSDOM('<!doctype html><body><div id="vista"></div></body>', { runScripts: 'outside-only', url: 'https://x.test/' });
  const w = dom.window;
  const servidor = { enCurso: 0, maximo: 0, llamadas: [], responder: () => 'ok', tarda: 20 };
  w.google = { script: { run: new Proxy({}, {
    get(_, prop) {
      if (prop !== 'withSuccessHandler') return undefined;
      return (bien) => ({ withFailureHandler: (mal) => new Proxy({}, { get: (__, fn) => (...args) => {
        servidor.llamadas.push(fn);
        servidor.enCurso++;
        servidor.maximo = Math.max(servidor.maximo, servidor.enCurso);
        setTimeout(() => {
          servidor.enCurso--;
          const r = servidor.responder(fn, args);
          if (r && r.error) mal(new Error(r.error));
          else bien(r);
        }, servidor.tarda);
      } }) });
    },
  }) } };
  // En las pruebas, sin esperar segundos entre reintentos
  w.eval(js + '\nllamadasConfig.esperas = [5, 10, 20, 40]; window.callServer = callServer;');
  return { w, servidor, llamar: (fn, ...args) => w.callServer(fn, ...args) };
}

(async () => {
  console.log('1. A lo más 4 llamadas en curso por pestaña; las demás esperan su turno');
  {
    const { servidor, llamar } = navegador();
    const respuestas = await Promise.all(Array.from({ length: 10 }, (_, i) => llamar('apiAlgo', i)));
    ok(servidor.maximo === 4, 'nunca hubo más de 4 a la vez (hubo ' + servidor.maximo + ')');
    ok(servidor.llamadas.length === 10 && respuestas.every((r) => r === 'ok'), 'y las 10 se contestaron');
  }

  console.log('2. "Demasiadas secuencias…" se reintenta solo');
  {
    const { servidor, llamar } = navegador();
    let veces = 0;
    servidor.responder = () => (++veces <= 2 ? { error: SATURADO } : 'por fin');
    const r = await llamar('apiGuardarAlgo', 'x');
    ok(r === 'por fin' && veces === 3, 'a la tercera contesta (dos rechazos por cupo y luego bien)');
    const viejo = navegador();
    viejo.servidor.responder = () => ({ error: 'There are too many scripts running simultaneously for this Google user account.' });
    let error = '';
    try { await viejo.llamar('apiAlgo'); } catch (e) { error = e.message; }
    ok(/too many scripts/.test(error) && viejo.servidor.llamadas.length === 5, 'en inglés también; tras 4 reintentos se rinde y dice el error');
  }

  console.log('3. Cualquier otro error sale tal cual, sin reintentar');
  {
    const { servidor, llamar } = navegador();
    servidor.responder = () => ({ error: 'Sin permiso para editar Vehículos' });
    let error = '';
    try { await llamar('apiActualizarVehiculo', 'x'); } catch (e) { error = e.message; }
    ok(error === 'Sin permiso para editar Vehículos' && servidor.llamadas.length === 1, 'un error de verdad no se repite');
  }

  console.log('4. Un rechazo por cupo libera su lugar mientras espera');
  {
    const { servidor, llamar } = navegador();
    const rechazos = {};
    servidor.responder = (fn, args) => ((rechazos[args[0]] = (rechazos[args[0]] || 0) + 1) === 1 && args[0] < 4 ? { error: SATURADO } : 'ok');
    const r = await Promise.all(Array.from({ length: 8 }, (_, i) => llamar('apiAlgo', i)));
    ok(r.every((x) => x === 'ok') && servidor.maximo <= 4, 'las 8 terminan y nunca hay más de 4 en curso, contando los reintentos');
  }

  await espera(50);
  if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
  console.log('\nTODO OK');
  process.exit(0);
})();
