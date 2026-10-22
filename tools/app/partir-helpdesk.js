/**
 * partir-helpdesk.js — abre initHelpdesk (app-helpdesk.html) en partes (homologación, fase 6.3; 22-oct).
 *
 *   node tools/app/partir-helpdesk.js            revisa y escribe
 *   node tools/app/partir-helpdesk.js --revisar  solo revisa y dice qué haría
 *   … --raiz <carpeta>                           sobre otra copia del repo (otra rama en su carpeta)
 *
 * initHelpdesk era una sola función de 747 líneas. Se queda como el arranque: bandejas, filtros, lista, búsqueda y
 * atajos; el ticket abierto y el registro de un ticket se van a app-helpdesk-<parte>.html (motor:
 * tools/partir/en-partes.js; mecanismo: componentes/partes.html).
 */
const path = require('path');
const { partir } = require('../partir/en-partes');

const iRaiz = process.argv.indexOf('--raiz');
partir({
  raiz: iRaiz > 0 ? path.resolve(process.argv[iRaiz + 1]) : path.resolve(__dirname, '..', '..'),
  soloRevisar: process.argv.includes('--revisar'),
  archivo: 'app-helpdesk',
  funcion: 'initHelpdesk',
  pantalla: 'Help Desk',
  registro: 'Helpdesk',
  fase: 'fase 6.3',
  script: 'tools/app/partir-helpdesk.js',
  sangria: 4,
  // La región de cada sentencia es la del último ancla visto (su primer nombre)
  partes: [
    { parte: 'ticket', desde: ['abierto'] },
    { parte: 'registro', desde: ['prepararRegistro'] },
  ],
  vuelveAPrincipal: ['modalAtajos'],
  titulos: {
    ticket: 'el ticket abierto: su detalle, el contexto de la persona, respuestas y archivos',
    registro: 'registrar un ticket en el sistema desde su formulario',
  },
  comoValorPermitido: {},
});
