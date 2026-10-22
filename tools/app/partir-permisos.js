/**
 * partir-permisos.js — abre initPermisosAdmin (app-permisos.html) en partes (homologación, fase 6.1c; 22-oct).
 *
 *   node tools/app/partir-permisos.js            revisa y escribe
 *   node tools/app/partir-permisos.js --revisar  solo revisa y dice qué haría
 *   … --raiz <carpeta>                           sobre otra copia del repo (otra rama en su carpeta)
 *
 * initPermisosAdmin era una sola función de 1,294 líneas. Se queda como el arranque: el estado, las reglas (que
 * tests/permisos-pantalla.test.cjs lee de este archivo), las tablas y los KPIs; la ficha, la ventana de editar y la
 * matriz se van a app-permisos-<parte>.html (motor: tools/partir/en-partes.js; mecanismo: componentes/partes.html).
 */
const path = require('path');
const { partir } = require('../partir/en-partes');

const iRaiz = process.argv.indexOf('--raiz');
partir({
  raiz: iRaiz > 0 ? path.resolve(process.argv[iRaiz + 1]) : path.resolve(__dirname, '..', '..'),
  soloRevisar: process.argv.includes('--revisar'),
  archivo: 'app-permisos',
  funcion: 'initPermisosAdmin',
  pantalla: 'Usuarios y permisos',
  registro: 'PermisosAdmin',
  fase: 'fase 6.1c',
  script: 'tools/app/partir-permisos.js',
  sangria: 4,
  // La región de cada sentencia es la del último ancla visto (su primer nombre)
  partes: [
    { parte: 'ficha', desde: ['renglon'] },
    { parte: 'ventana', desde: ['edicion'] },
    { parte: 'matriz', desde: ['ICONO_CELDA'] },
  ],
  vuelveAPrincipal: ['filaPersona'],
  titulos: {
    ficha: 'la ficha de una persona, un área o un perfil',
    ventana: 'la ventana "Editar permisos" y la de asignar perfiles',
    matriz: 'la matriz por área o por perfil: sus celdas y guardarla',
  },
  comoValorPermitido: {
    alClicVentana: "addEventListener('click', …) del cuerpo de la ventana (sin removeEventListener)",
    alClicMatriz: "addEventListener('click', …) de la matriz (sin removeEventListener)",
    guardarMatriz: "addEventListener('click', …) del botón Guardar de la matriz (sin removeEventListener)",
    guardarEdicion: "addEventListener('click', …) del botón Guardar de la ventana (sin removeEventListener)",
    cerrarEditar: "addEventListener('click', …) de Cancelar y cerrar la ventana (sin removeEventListener)",
  },
});
