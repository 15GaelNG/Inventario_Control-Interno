/**
 * partir-vehiculos.js — abre initVehiculos (app-vehiculos.html) en partes (homologación, fase 6.1b; 22-oct).
 *
 *   node tools/app/partir-vehiculos.js            revisa y escribe
 *   node tools/app/partir-vehiculos.js --revisar  solo revisa y dice qué haría
 *   … --raiz <carpeta>                            sobre otra copia del repo (otra rama en su carpeta)
 *
 * initVehiculos era una sola función de 2,044 líneas. Se queda como el arranque y la lista; la ficha, las acciones
 * sobre sus registros, las capturas y la responsiva/adherente se van a app-vehiculos-<parte>.html (motor:
 * tools/partir/en-partes.js; mecanismo: componentes/partes.html). Corta por nombres, no por renglones: cada rama lo
 * corre sobre su propio app-vehiculos.html (después de tools/app/partir.js) y lo que agregó dentro de una región viaja
 * con ella. Si falta un ancla, o algo no se puede mover sin cambiar código, falla y no escribe.
 */
const path = require('path');
const { partir } = require('../partir/en-partes');

const iRaiz = process.argv.indexOf('--raiz');
partir({
  raiz: iRaiz > 0 ? path.resolve(process.argv[iRaiz + 1]) : path.resolve(__dirname, '..', '..'),
  soloRevisar: process.argv.includes('--revisar'),
  archivo: 'app-vehiculos',
  funcion: 'initVehiculos',
  pantalla: 'Vehículos',
  registro: 'Vehiculos',
  fase: 'fase 6.1b',
  script: 'tools/app/partir-vehiculos.js',
  sangria: 4,
  // La región de cada sentencia es la del último ancla visto (su primer nombre)
  partes: [
    { parte: 'ficha', desde: ['cerrarFichaVehiculo', 'mostrarPestanaFichaVehiculo', 'abrirFichaVehiculo'] },
    { parte: 'registros', desde: ['API_VER_FICHA_REGISTRO'] },
    { parte: 'capturas', desde: ['abrirCapturaVehiculo', 'abrirAgregarVerificacion', 'abrirEditarVerificacionFicha'] },
    { parte: 'documentos', desde: ['RESV_ACCESORIOS'] },
    // Accesorios de la unidad: solo en la rama donde ya existe (ayrton)
    { parte: 'accesorios', desde: ['ACC_ESTADO'], opcional: true },
  ],
  vuelveAPrincipal: ['abrirCapturaRapidaVehiculo'],
  titulos: {
    ficha: 'la ficha de un vehículo: abrirla y cerrarla, sus secciones y pestañas',
    registros: 'ver, eliminar, cambiar estatus o devolver un registro de la ficha; adquisición y ligas de firma',
    capturas: 'agregar y editar desde la ficha: verificación, incidencia, sensor, holograma e inspección',
    documentos: 'la responsiva y el adherente vehicular',
    accesorios: 'los accesorios de la unidad en la ficha: su pestaña y registrar alta o baja',
  },
  // Funciones de otra parte que se usan como valor: un intermediario de T.de sirve donde solo se llama
  comoValorPermitido: {
    cerrarFichaVehiculo: "addEventListener('click', …) del botón Volver (sin removeEventListener)",
    cerrarCapturaVehiculo: "addEventListener('click', …) del botón cerrar (sin removeEventListener)",
    cerrarVerRegistroFicha: "addEventListener('click', …) del botón cerrar (sin removeEventListener)",
  },
});
