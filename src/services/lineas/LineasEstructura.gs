/**
 * LineasEstructura.gs
 * Las hojas de Líneas y las equivalencias de la migración (estatus, tipos, código de resguardo) que usan la lectura
 * (LineasLectura) y el guardado (LineasEscritura):
 *
 *   LINEAS        una línea contratada, toda su vida (aunque cambie de número)
 *   EQUIPOS       un aparato (su NUCO)
 *   ASIGNACIONES  quién tiene qué (o dónde está guardado), desde cuándo y hasta cuándo
 *   ADENDUMS      un contrato de una línea; cada renovación es otro renglón
 *   FACTURAS      lo cobrado por una línea en un periodo (vacía: se llena con la carga de la parte 7)
 *   CUENTAS       cuentas padre del proveedor → compañía y razón social
 *   CATALOGOS     listas de opciones que no salen de Capital Humano
 *
 * La función que armó las hojas nuevas desde LINEAS TELEFONICAS (reestructuraArmarEstructura, 3-oct) se quitó el
 * 21-oct: ya se corrió y la hoja vieja está retirada; queda en el historial de git.
 */

const ESTRUCTURA_HOJAS = {
  // NUCO ANTERIOR y las rutas del AppSheet se llenan al retirar LINEAS TELEFONICAS (paso 4, 4-oct). Sin FECHA DE
  // ALTA desde el 16-oct (pendiente 2.51): el alta es el movimiento ALTA de MOVIMIENTOS
  LINEAS: ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'NUMERO TELEFONO', 'TIPO DE LINEA', 'COMPAÑIA', 'CUENTA PADRE', 'CUENTA', 'RAZON SOCIAL',
    'NUMERO SIM', 'PIN WHATSAPP', 'ESTATUS LINEA', 'NUCO ANTERIOR', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'],
  EQUIPOS: ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'NUCO', 'TIPO DE EQUIPO', 'MODELO', 'COLOR', 'IMEI', 'ACCESORIOS', 'PIN EQUIPO', 'PATRON',
    'CONTRASEÑA MODEM', 'ESTATUS EQUIPO', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION', 'PIN WHATSAPP'],
  ASIGNACIONES: ['ID', 'TIPO', 'ID LINEA', 'ID EQUIPO', 'ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO',
    'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'DIRECTOR', 'CUENTA GOOGLE',
    'FECHA INICIO', 'FECHA FIN', 'JEFE DIRECTO'], // JEFE DIRECTO: usuario, 4-oct (lo traen Reasignar y Editar). Sin «quien lo usa» (6-oct)
  ADENDUMS: ['ID', 'ID LINEA', 'NUMERO TELEFONO', 'COMPAÑIA', 'CUENTA PADRE', 'PLAN', 'COSTO PLAN', 'INICIO PLAN',
    'FIN PLAN', 'FUENTE', 'ARCHIVO', 'FECHA DEL ARCHIVO', 'FECHA DE CARGA'],
  FACTURAS: ['ID', 'ID LINEA', 'COMPAÑIA', 'CUENTA PADRE', 'NUMERO EN FACTURA', 'PERIODO', 'FECHA DE CORTE', 'PLAN',
    'TOTAL CON IVA', 'MINUTOS', 'MENSAJES', 'DATOS MB', 'CONCEPTOS', 'ARCHIVO', 'FECHA DE CARGA'],
  CUENTAS: ['CUENTA PADRE', 'COMPAÑIA', 'RAZON SOCIAL', 'RFC', 'DIA DE CORTE', 'TIPO'],
  CATALOGOS: ['LISTA', 'VALOR'],
};

const ESTRUCTURA_PREFIJOS = { LINEAS: 'LIN', EQUIPOS: 'EQU', ASIGNACIONES: 'ASG', ADENDUMS: 'ADE', FACTURAS: 'FAC' };

// Cuentas padre (documentación del reporte de líneas, §4 "Razones sociales y cuentas"; verificado en el CFDI)
const ESTRUCTURA_CUENTAS = [
  ['12419802', 'TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 27, 'PLANES'],
  ['45511805', 'TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 27, 'PLANES'],
  ['63733731', 'TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 27, 'PLANES'],
  ['83706999', 'TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 27, 'PLANES'],
  ['95982680', 'TELCEL', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 27, 'PLANES'],
  ['12500860', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['33255469', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['45373067', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['55499793', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['62637313', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['75505693', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['83632674', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['99022914', 'TELCEL', 'GPH SERVICIOS CONDOMINALES SC', 'TAL050620CI1', 27, 'PLANES'],
  ['507700044', 'AT&T', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 15, 'PLANES'],
  ['507727479', 'AT&T', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 15, 'PLANES'],
  ['643495915', 'AT&T', 'FRACCIONADORA LA ROMITA SA DE CV', 'FRO910430G61', 7, 'SIM BASICOS'],
];

// En qué asignación vive cada estatus (plan §5.4): con persona, de resguardo (sin persona) o ninguna (es el final). El
// estatus NO se cambia: se copia como viene. Aquí solo se decide dónde vive, con los nombres viejos y los nuevos. Lo que
// no está (FUERA DE INVENTARIO, CANCELADO, ESPERA DE RESPONSIVA, SUSPENDIDA, SIN LINEA con número…) se queda sin
// asignación hasta que Líneas lo resuelva en Correcciones.
const ESTRUCTURA_CLASE = {
  equipo: { 'USO': 'PERSONA', 'RESGUARDO': 'RESGUARDO', 'VENTA': 'RESGUARDO', 'PARA VENTA': 'RESGUARDO', 'PARA VENTA CON DETALLE': 'RESGUARDO',
    'POSIBLE VENTA': 'RESGUARDO', 'DESECHO': 'RESGUARDO', 'PARA DESECHO': 'RESGUARDO',
    'VENDIDO': 'NINGUNA', 'DONADO': 'NINGUNA', 'DESECHADO': 'NINGUNA', 'EXTRAVIADO': 'NINGUNA', 'ROBADO': 'NINGUNA',
    'ROBO': 'NINGUNA', 'EXTRAVIO-ROBO': 'NINGUNA' },
  linea: { 'USO': 'PERSONA', 'RESGUARDO': 'RESGUARDO', 'DISPONIBLE': 'RESGUARDO', 'EN PROCESO DE CANCELACION': 'RESGUARDO',
    'CANCELADA': 'NINGUNA' },
};
// Nombres nuevos de los estatus (reunión del 30-sep; aprobados para la migración, D-I3). Es el mismo estatus con su
// nombre nuevo. SIN LINEA no aparece: una fila sin número no da línea. POSIBLE VENTA ya no se renombra: POSIBLE
// VENTA-DAÑO se quitó (usuario, 4-oct) y POSIBLE VENTA se queda como viene, para Correcciones de Líneas.
const ESTRUCTURA_NOMBRE_NUEVO = {
  equipo: { 'VENTA': 'PARA VENTA', 'EXTRAVIADO': 'EXTRAVIO-ROBO',
    'ROBADO': 'EXTRAVIO-ROBO', 'ROBO': 'EXTRAVIO-ROBO', 'DESECHO': 'PARA DESECHO' },
  linea: { 'RESGUARDO': 'DISPONIBLE' },
};
// TIPO viejo (mezcla de línea y equipo) → tipo de equipo y tipo de línea (plan §5.6, D5.6). '' = el TIPO viejo no
// alcanza para saberlo: lo confirma la factura (cuenta de SIM básicos o de planes). SIM BASICO sí se sabe: se
// factura en la cuenta de SIM básicos (plan §5.6.1).
const ESTRUCTURA_TIPO_EQUIPO = { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR',
  'MODEM': 'MODEM', 'BANDA ANCHA': 'MODEM', 'CAMARA': 'CAMARA' };
const ESTRUCTURA_TIPO_LINEA = { 'EQUIPO + SIM': 'PLAN', 'LINEA': '', 'EQUIPO + SIM BASICO': 'SIM BASICO',
  'SIM BASICO': 'SIM BASICO', 'BANDA ANCHA': 'BANDA ANCHA', 'MODEM': '', 'CAMARA': '' };

const ESTRUCTURA_FUENTE_INVENTARIO = 'INVENTARIO (SIN CONFIRMAR)';
// Código de resguardo escrito en RESPONSABLE (decisión del usuario: no se pasa). Dos formas: la vieja (P0132, R1-0006,
// V0024, DS0054) y la de 2026 (PA-0570 (28/11/2026) = NUCO + A/V de vigencia del adendum + fin del adendum). A veces
// lleva una nota después ("- SE TOMA PARA TICKET 103687"): la nota sí es información y sale en la revisión.
const ESTRUCTURA_ES_CODIGO_RESGUARDO = /^([A-Z]{1,3}\d?-?\d{3,}( ?\(\d{1,2}\/\d{1,2}\/\d{4}\))?)(?=$|[\s\-–(])/;
