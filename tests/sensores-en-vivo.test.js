/**
 * apiEstadoEnVivoSensores (src/api/Sensores.gs): la pantalla lo pide sola cada minuto. Con la sesión vencida contesta
 * { sesionExpirada } sin error (cada pestaña abierta dejaba un "Sesión expirada" por minuto en el log de producción,
 * 28-oct); con sesión, lo de siempre; cualquier otro error sí sale.
 *
 * Correr: node tests/sensores-en-vivo.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

function cargar(validar) {
  const ctx = vm.createContext({
    Auth: { automatica: () => {}, validarSesion: validar },
    SensoresService: { estadoEnVivo: () => ({ disponible: true, estados: { S1: 'en línea' } }) },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'Sensores.gs'), 'utf8'), ctx);
  return ctx;
}

console.log('1. El estado en vivo con la sesión vencida no es un error');
{
  const vencida = cargar(() => { throw new Error('Sesión expirada, inicia sesión de nuevo'); });
  const r = vencida.apiEstadoEnVivoSensores('viejo');
  ok(r.sesionExpirada === true && r.disponible === false, 'contesta { sesionExpirada } en vez de tronar (no va al log)');
  const bien = cargar(() => ({ correo: 'a@x.com' }));
  ok(bien.apiEstadoEnVivoSensores('t').estados.S1 === 'en línea', 'con sesión, el estado de siempre');
  const otro = cargar(() => { throw new Error('Algo más falló'); });
  let tronó = false;
  try { otro.apiEstadoEnVivoSensores('t'); } catch (e) { tronó = /Algo más/.test(e.message); }
  ok(tronó, 'otro error sí sale (no se esconde)');
  const pantalla = fs.readFileSync(path.join(__dirname, '..', 'src', 'html', 'js', 'modulos', 'sensores.html'), 'utf8');
  ok(/if \(vivo\.sesionExpirada\) \{\s*clearInterval\(temporizador\);\s*if \(typeof manejarSesionExpirada === 'function'\) manejarSesionExpirada\(\);/.test(pantalla),
    'la pantalla, con sesionExpirada, deja de pedir y va al login');
}

if (fallas) { console.error('\n' + fallas + ' FALLA(S)'); process.exit(1); }
console.log('\nTODO OK');
