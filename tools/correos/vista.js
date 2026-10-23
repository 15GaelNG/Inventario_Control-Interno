/**
 * Vista previa de los correos del sistema (src/utils/Correos.gs): arma cada uno con datos de ejemplo, deja el HTML y
 * toma capturas en escritorio y celular, claro y oscuro, en tools/vista-previa/salida/correo-*.
 *
 *   node tools/correos/vista.js
 *
 * Es la plantilla de verdad (la misma que corre en Apps Script). Solo enseña cómo se ve en un navegador: Gmail y
 * Outlook la dibujan a su modo (la plantilla está hecha para eso), así que antes de cambiar algo grande conviene
 * mandarse una de prueba.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const puppeteer = require('puppeteer-core');

const RAIZ = path.resolve(__dirname, '..', '..');
const SALIDA = path.join(RAIZ, 'tools', 'vista-previa', 'salida');
const NAVEGADORES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];

const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(RAIZ, 'src', 'utils', 'Correos.gs'), 'utf8') + '\nthis.Correos = Correos;', ctx);
const { Correos } = ctx;

const EJEMPLOS = {
  codigo: {
    preencabezado: 'Vence en 10 minutos. Nadie de Control Interno te lo va a pedir.',
    etiqueta: 'Verificación', titulo: 'Tu código para entrar',
    parrafos: ['Hola, Ana. Escribe este código en Control Interno para terminar de iniciar sesión.'],
    codigo: '482915',
    detalle: [['Dispositivo', 'Chrome en Windows'], ['Solicitado', '23/10/2026 10:42'], ['Vence', 'En 10 minutos']],
    aviso: '<b>¿No fuiste tú?</b> Alguien tiene tu contraseña: cámbiala en Mi perfil o pide a Control Interno que la restablezca. ' +
      'Nadie de Control Interno te va a pedir este código.',
  },
  dispositivo: {
    preencabezado: 'Se recordó Safari en iPhone o iPad para tu cuenta.',
    etiqueta: 'Seguridad de tu cuenta', titulo: 'Se recordó un dispositivo nuevo',
    parrafos: ['Desde este dispositivo ya no se te pedirá código por un tiempo. Puedes verlo y quitarlo en <b>Mi perfil → Contraseña y seguridad</b>.'],
    detalle: [['Dispositivo', 'Safari en iPhone o iPad'], ['Fecha', '23/10/2026 10:43'], ['Cuenta', 'ana.lopez@gph.com']],
    aviso: '<b>¿No fuiste tú?</b> Cambia tu contraseña y avisa a Control Interno.',
  },
  alerta: {
    preencabezado: '17 correos distintos fallaron en 10 minutos.',
    etiqueta: 'Alerta de seguridad', titulo: 'Muchos inicios de sesión fallidos',
    parrafos: ['En los últimos 10 minutos fallaron <b>17 correos distintos</b> al iniciar sesión. Puede ser alguien probando contraseñas comunes en muchas cuentas.',
      'Durante la siguiente hora se le pide el código por correo a todos, aunque entren desde un dispositivo conocido.'],
    detalle: [['Correos distintos', '17'], ['Ventana', '10 minutos'], ['Fecha', '23/10/2026 11:05']],
    aviso: 'El detalle de cada intento está en la hoja <b>ACCESOS</b> del libro de usuarios.',
  },
};

(async () => {
  const navegador = NAVEGADORES.find((n) => fs.existsSync(n));
  if (!navegador) throw new Error('No encontré Chrome ni Edge');
  fs.mkdirSync(SALIDA, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: navegador, headless: 'new' });
  try {
    for (const [nombre, datos] of Object.entries(EJEMPLOS)) {
      const html = Correos.html(datos);
      const archivo = path.join(SALIDA, 'correo-' + nombre + '.html');
      fs.writeFileSync(archivo, html);
      fs.writeFileSync(path.join(SALIDA, 'correo-' + nombre + '.txt'), Correos.texto(datos));
      for (const [sufijo, ancho, oscuro] of [['', 760, false], ['-celular', 390, false], ['-oscuro', 760, true]]) {
        const p = await browser.newPage();
        await p.setViewport({ width: ancho, height: 900, deviceScaleFactor: 1 });
        await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: oscuro ? 'dark' : 'light' }]);
        await p.goto('file://' + archivo.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
        const salida = path.join(SALIDA, 'correo-' + nombre + sufijo + '.png');
        await p.screenshot({ path: salida, fullPage: true });
        console.log(salida + '  (' + html.length + ' bytes de HTML)');
        await p.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
