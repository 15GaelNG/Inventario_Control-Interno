/**
 * La marca Control Interno / Flotillas (4-nov-2026):
 *   1. El componente Marca (src/html/js/componentes/marca.html) en un navegador simulado (jsdom): lo que pone el servidor
 *      en el body, uno o dos logos, iniciales sin logo, el nombre del marco y el del contenido de un módulo.
 *   2. Marcas.gs con hojas simuladas: la persona por su DEPARTAMENTO, el módulo por la pestaña MODULOS (y por omisión),
 *      el login sin cuenta, y que sincronizar() solo agregue lo que falta.
 *   3. Correos.gs: el marco del correo es el de quien lo recibe; varios destinatarios (los ADMIN), Control Interno.
 *
 * Correr: node tests/marca.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src');
const leer = (r) => fs.readFileSync(path.join(SRC, r), 'utf8');
const FORMATO = require('./formato-fuente');

let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };

const LISTA = {
  CI: { id: 'CI', nombre: 'Control Interno', logo: 'https://ejemplo.local/ci.png' },
  FT: { id: 'FT', nombre: 'Flotillas', logo: '' },
  CM: { id: 'CM', nombre: 'Ciudad Maderas', logo: '' },
};

// ------------------------------------------------------------------ 1. el componente
function pagina(marca, modulos) {
  const html = leer('html/js/componentes/marca.html');
  const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const body = '<body data-marca="' + marca + '" data-marcas=\'' + JSON.stringify(LISTA) + '\' data-marcas-modulos=\'' +
    JSON.stringify(modulos || {}) + '\'><div class="login-icon-badge"><span data-marca-logo=""></span></div>' +
    '<span class="sidebar-brand-logos" data-marca-logo="sidebar-brand-icon"></span>' +
    '<h1 data-marca-nombre></h1><b data-marca-nombre="mayusculas"></b><div id="despues"></div></body>';
  const dom = new JSDOM('<!doctype html>' + body, { url: 'https://prueba.local/', runScripts: 'outside-only' });
  dom.window.eval(FORMATO + js + '\nwindow.Marca = Marca;');
  return dom.window;
}

console.log('1. El componente Marca');
{
  const w = pagina('AMBAS', { 'lineas-telefonicas': 'FT', 'caja-chica': 'CI', 'gestion-activos': 'AMBAS' });
  const { Marca, document: d } = w;
  Marca.persona();
  const insignia = d.querySelector('.login-icon-badge');
  ok(insignia.querySelectorAll('img, .marca-iniciales').length === 2 && insignia.getAttribute('data-marca-actual') === 'AMBAS',
    'sin cuenta detectada (lo del servidor): los dos logos y la insignia se ensancha');
  ok(d.querySelector('h1').textContent === 'Control Interno · Flotillas', 'el nombre del marco con las dos');

  Marca.persona('FT');
  const ft = d.querySelectorAll('.login-icon-badge .marca-iniciales');
  ok(ft.length === 1 && ft[0].textContent === 'FT' && !d.querySelector('.login-icon-badge img'), 'Flotillas sin logo todavía: sus iniciales');
  ok(d.querySelector('b').textContent === 'FLOTILLAS', 'el nombre en mayúsculas donde se pide');
  ok(d.querySelector('.sidebar-brand-logos .sidebar-brand-icon.marca-iniciales'), 'la clase del contenedor pasa al logo (los estilos de siempre)');

  Marca.persona('CI');
  const img = d.querySelector('.login-icon-badge img');
  ok(img && img.getAttribute('src') === LISTA.CI.logo && img.getAttribute('alt') === 'Control Interno', 'Control Interno: su logo');

  Marca.persona('POST VENTA');
  ok(Marca.actual() === 'CM' && d.querySelector('h1').textContent === 'Ciudad Maderas', 'una marca que no existe: la neutra');

  d.getElementById('despues').innerHTML = '<span data-marca-logo=""></span>';
  Marca.pintar(d.getElementById('despues'));
  ok(d.querySelector('#despues .marca-iniciales[data-marca="CM"]'), 'lo que se monta después se pinta con pintar(raiz)');

  ok(Marca.textoDe('lineas-telefonicas') === 'Flotillas' && Marca.textoDe('caja-chica.detalles') === 'Control Interno',
    'el contenido va por el módulo (y una sección, por el suyo), sin importar quién entró');
  ok(Marca.textoDe('gestion-activos') === 'Control Interno y Flotillas', 'un módulo de los dos: "Control Interno y Flotillas"');
  ok(Marca.textoDe('modulo-nuevo') === 'Flotillas', 'un módulo sin dato: Flotillas, como en el servidor');
  Marca.modulos({ 'lineas-telefonicas': 'CI' });
  ok(Marca.textoDe('lineas-telefonicas') === 'Control Interno', 'modulos(mapa) lo cambia (lo de apiMisPermisos)');

  const x = pagina('<b>', {});
  x.Marca.persona();
  ok(!x.document.body.innerHTML.includes('<b>') || x.Marca.actual() === 'CM', 'lo que venga raro en el body no se pinta tal cual');
}

// ------------------------------------------------------------------ 2. Marcas.gs
console.log('\n2. Marcas.gs');
function servidor(hojas) {
  const escritas = [];
  const ctx = {
    console,
    Config: { SPREADSHEET_IDS: { USUARIOS: () => 'LIBRO' } },
    CacheHojas: { recordar: (clave, deps, armar) => armar() },
    SpreadsheetApp: { newDataValidation: () => ({ requireValueInList() { return this; }, setAllowInvalid() { return this; }, build: () => ({}) }) },
    SheetUtils: {
      getSheet: (libro, nombre) => { if (!hojas[nombre]) throw new Error('No existe la hoja ' + nombre); return {}; },
      getAll: (libro, nombre) => (hojas[nombre] || []).slice(),
      asegurarPestana: (libro, nombre) => {
        hojas[nombre] = hojas[nombre] || [];
        return { getMaxRows: () => 100, getRange: () => ({ setDataValidation: () => {} }) };
      },
      tabla: (hoja) => ({ hoja }),
      agregarFilas: (t, filas) => { escritas.push(...filas); hojas.MODULOS.push(...filas); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(leer('config/Modulos.gs') + '\n' + leer('services/Marcas.gs') + '\nthis.Marcas = Marcas; this.Modulos = Modulos;', ctx);
  return { Marcas: ctx.Marcas, Modulos: ctx.Modulos, escritas };
}
{
  const usuarios = [
    { CORREO: 'ana.ci@x.com', DEPARTAMENTO: 'CONTROL INTERNO' },
    { CORREO: 'Beto.FT@x.com ', DEPARTAMENTO: 'Flotillas' },
    { CORREO: 'seguridad@gph.mx', DEPARTAMENTO: 'POST VENTA' },
    { CORREO: 'sin@x.com', DEPARTAMENTO: '' },
  ];
  const { Marcas, Modulos, escritas } = servidor({ USUARIOS: usuarios });
  ok(Marcas.dePersona(usuarios[0]) === 'CI' && Marcas.dePersona(usuarios[1]) === 'FT', 'la persona: CONTROL INTERNO → CI, Flotillas → FT (sin importar mayúsculas)');
  ok(Marcas.dePersona(usuarios[2]) === 'CM' && Marcas.dePersona(usuarios[3]) === 'CM', 'POST VENTA o vacío: la neutra');
  ok(Marcas.deCorreo('beto.ft@x.com') === 'FT' && Marcas.deCorreo('nadie@x.com') === 'CM', 'por correo (para los correos): sin usuario, la neutra');
  ok(Marcas.paraLogin('') === 'AMBAS' && Marcas.paraLogin('nadie@x.com') === 'AMBAS' && Marcas.paraLogin('ANA.CI@x.com') === 'CI',
    'el login: sin cuenta o sin usuario, las dos; con usuario, la suya');

  const mapa = Marcas.mapa();
  ok(mapa['vehiculos'] === 'FT' && mapa['lineas-telefonicas'] === 'FT' && mapa['uber'] === 'FT', 'sin la pestaña: Vehículos, Líneas y Uber son de Flotillas');
  ok(mapa['caja-chica'] === 'CI' && mapa['arqueos'] === 'CI' && mapa['usuarios'] === 'CI', 'Caja Chica, Arqueos y Administración, de CI');
  ok(mapa['gestion-activos'] === 'AMBAS', 'Gestión de Activos, de los dos');
  ok(Modulos.todos().every((m) => mapa[m.id]), 'todos los módulos del catálogo tienen marca');
  ok(Marcas.deModulo('vehiculos.responsiva') === 'FT', 'una sección, la de su módulo');

  ok(Marcas.sincronizar() === Modulos.todos().length && escritas.every((f) => f.MODULO && f.NOMBRE && f.MARCA),
    'sincronizar(): crea la pestaña con un renglón por módulo (id, nombre del menú y su marca por omisión)');
  ok(Marcas.sincronizar() === 0, 'la segunda vez no agrega nada');

  const hoja = Modulos.todos().map((m) => ({ MODULO: m.id, NOMBRE: m.etiqueta, MARCA: m.id === 'uber' ? 'ci' : m.id === 'vehiculos' ? 'Flotilas' : '' }));
  const otro = servidor({ USUARIOS: usuarios, MODULOS: hoja }).Marcas;
  ok(otro.deModulo('uber') === 'CI', 'lo que dice la pestaña manda');
  ok(otro.deModulo('vehiculos') === 'FT' && otro.deModulo('caja-chica') === 'CI', 'mal escrito o vacío: la de omisión');
  ok(otro.nombreDe('AMBAS') === 'Control Interno y Flotillas CM' && otro.nombreDe('FT') === 'Flotillas CM', 'nombreDe');
}

// ------------------------------------------------------------------ 3. Correos.gs
console.log('\n3. Correos');
{
  const ctx = {
    console,
    Marcas: { LISTA, deCorreo: (c) => ({ 'beto.ft@x.com': 'FT', 'ana.ci@x.com': 'CI' })[c] || 'CM' },
  };
  vm.createContext(ctx);
  vm.runInContext(leer('utils/Correos.gs') + '\nthis.Correos = Correos;', ctx);
  const { Correos } = ctx;
  const ft = Correos.mensaje('beto.ft@x.com', 'Asunto', { titulo: 'Hola', parrafos: ['x'] });
  ok(ft.name === 'Flotillas' && ft.htmlBody.includes('FLOTILLAS') && !ft.htmlBody.includes('CONTROL INTERNO'), 'a alguien de Flotillas: su nombre en la barra y como remitente');
  ok(ft.htmlBody.includes('Ciudad Maderas · Flotillas') && ft.body.includes('Ciudad Maderas · Flotillas'), 'el pie, en HTML y en texto');
  ok(Correos.sistema('beto.ft@x.com') === 'Flotillas' && Correos.sistema('ana.ci@x.com') === 'Control Interno', 'sistema(para): el nombre para los asuntos');
  const cm = Correos.mensaje('nadie@gph.mx', 'A', { titulo: 'T' });
  ok(cm.name === 'Ciudad Maderas' && cm.body.includes('— Ciudad Maderas (correo'), 'sin departamento: la neutra, sin repetir "Ciudad Maderas"');
  const admins = Correos.mensaje('beto.ft@x.com,ana.ci@x.com', 'A', { titulo: 'T' });
  ok(admins.name === 'Control Interno', 'varios destinatarios (los avisos a los ADMIN): Control Interno');
  ok(Correos.mensaje('beto.ft@x.com', 'A', { titulo: 'T', marca: 'CI' }).name === 'Control Interno', 'o.marca la fija');
  ok(ft.htmlBody.includes('>FT<'), 'sin logo: sus iniciales en la barra');
}

console.log(fallas ? '\n' + fallas + ' FALLA(S)' : '\nTODO OK');
process.exit(fallas ? 1 : 0);
