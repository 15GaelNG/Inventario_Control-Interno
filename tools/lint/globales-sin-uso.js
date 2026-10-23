/**
 * globales-sin-uso.js — lo de primer nivel que nadie usa en ningún archivo (lo que ESLint no ve: revisa uno a la vez).
 *
 *   node tools/lint/globales-sin-uso.js
 *
 * Busca cada nombre como palabra en todo el texto de src (los .gs, los .html con sus vistas y atributos, y
 * appsscript.json): si solo aparece donde se declara, nadie lo usa. Es conservador: una mención en un comentario o en
 * un string cuenta como uso, así que lo que sale aquí de verdad no se nombra en ningún otro lado.
 *
 * Del servidor se separan las funciones públicas (sin _ al final, que no son api…): se corren a mano desde el editor
 * (soloEditor_) o las llama un activador por su nombre, así que es normal que nadie más las nombre. Se listan aparte
 * para revisarlas, no son código muerto por fuerza.
 */
const fs = require('fs');
const path = require('path');
const { declarados, archivos, SRC, RAIZ } = require('./globales');

// Los que llama Apps Script mismo (web app, menús, activadores simples) o el template de Index.html
const DE_APPS_SCRIPT = new Set(['doGet', 'doPost', 'onOpen', 'onEdit', 'onInstall', 'onFormSubmit', 'include']);

const textos = [...archivos(SRC, '.gs'), ...archivos(SRC, '.html'), path.join(SRC, 'appsscript.json')]
  .map((f) => fs.readFileSync(f, 'utf8'));
const todo = textos.join('\n');

const veces = (nombre) => (todo.match(new RegExp('(?<![\\w$])' + nombre.replace(/\$/g, '\\$') + '(?![\\w$])', 'g')) || []).length;

const sinUso = (lado) => declarados(lado).filter((d) => !DE_APPS_SCRIPT.has(d.nombre) && veces(d.nombre) <= 1);

const linea = (d) => '  ' + d.archivo + ':' + d.linea + '  ' + d.tipo + ' ' + d.nombre;

const pantalla = sinUso('pantalla');
const servidor = sinUso('servidor');
const aMano = servidor.filter((d) => d.tipo === 'function' && !d.nombre.endsWith('_') && !/^api[A-Z]/.test(d.nombre));
const muertos = servidor.filter((d) => !aMano.includes(d));

console.log('Pantalla: nadie lo usa (' + pantalla.length + ')');
pantalla.forEach((d) => console.log(linea(d)));
console.log('\nServidor: nadie lo usa (' + muertos.length + ')');
muertos.forEach((d) => console.log(linea(d)));
console.log('\nServidor: funciones públicas que nadie nombra: ¿se corren a mano o ya no sirven? (' + aMano.length + ')');
aMano.forEach((d) => console.log(linea(d)));
console.log('\n' + path.relative(RAIZ, __filename).replace(/\\/g, '/') + ': ' + (pantalla.length + muertos.length) + ' sin uso, ' + aMano.length + ' por revisar');
