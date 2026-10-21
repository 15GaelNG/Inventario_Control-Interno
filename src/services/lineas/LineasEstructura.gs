/**
 * LineasEstructura.gs
 * Las hojas de Líneas y las equivalencias de la migración (estatus y tipos) que usan la lectura
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
 * Las columnas de cada hoja: plan §4.3. La función que armó las hojas nuevas desde LINEAS TELEFONICAS
 * (reestructuraArmarEstructura, 3-oct) y las listas que solo ella usaba (columnas, prefijos, cuentas, nombres nuevos de
 * los estatus y el código de resguardo) se quitaron el 21-oct: ya se corrió y la hoja vieja está retirada; quedan en
 * el historial de git.
 */

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
// TIPO viejo (mezcla de línea y equipo) → tipo de equipo y tipo de línea (plan §5.6, D5.6). '' = el TIPO viejo no
// alcanza para saberlo: lo confirma la factura (cuenta de SIM básicos o de planes). SIM BASICO sí se sabe: se
// factura en la cuenta de SIM básicos (plan §5.6.1).
const ESTRUCTURA_TIPO_EQUIPO = { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR',
  'MODEM': 'MODEM', 'BANDA ANCHA': 'MODEM', 'CAMARA': 'CAMARA' };
const ESTRUCTURA_TIPO_LINEA = { 'EQUIPO + SIM': 'PLAN', 'LINEA': '', 'EQUIPO + SIM BASICO': 'SIM BASICO',
  'SIM BASICO': 'SIM BASICO', 'BANDA ANCHA': 'BANDA ANCHA', 'MODEM': '', 'CAMARA': '' };

const ESTRUCTURA_FUENTE_INVENTARIO = 'INVENTARIO (SIN CONFIRMAR)';
