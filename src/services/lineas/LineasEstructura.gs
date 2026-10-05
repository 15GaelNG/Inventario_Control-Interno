/**
 * LineasEstructura.gs
 * Etapa 1 de la implementación de las partes 4 y 5 del plan (migracion/PLAN_REESTRUCTURA_LINEAS.md): arma las hojas
 * nuevas con los datos reales de LINEAS TELEFONICAS, para comprobar que el diseño aguanta la base de verdad.
 *
 *   LINEAS        una línea contratada, toda su vida (aunque cambie de número)
 *   EQUIPOS       un aparato (su NUCO)
 *   ASIGNACIONES  quién tiene qué (o dónde está guardado), desde cuándo y hasta cuándo
 *   ADENDUMS      un contrato de una línea; cada renovación es otro renglón
 *   FACTURAS      lo cobrado por una línea en un periodo (vacía: se llena con la carga de la parte 7)
 *   CUENTAS       cuentas padre del proveedor → compañía y razón social
 *   CATALOGOS     listas de opciones que no salen de Capital Humano
 *
 * REGLA DEL USUARIO (3-oct): la migración COPIA, no corrige. Los valores pasan tal como están en LINEAS TELEFONICAS
 * (estatus, departamento, datos de la persona, fechas…). Solo cambia lo que confirma un documento (adendum, factura,
 * PDF), y eso lo aplica la migración de la parte 9, no esta función. Lo dudoso va a Correcciones de Líneas o como
 * pregunta. Lo único que no se copia, por decisión del usuario:
 *   - "quien usa" cuando es el mismo responsable (parte 3, §3.7);
 *   - el código de resguardo que se escribía en RESPONSABLE (P0132, PA-0570 (28/11/2026)…): solo servía en la hoja;
 *   - las columnas que el plan quita (responsables 2 a 5 vacíos, JEFE DIRECTO, PUESTO INV, FOLIO, COMENTARIOS…).
 * COLOR del aparato (decisión del usuario, 3-oct): la hoja vieja no tiene ninguno (en el AppSheet salía de las
 * inspecciones). Se copia el de INSPECCIONES LINEAS y RESPONSIVAS LINEAS, tal como está escrito, solo si todas dicen el
 * mismo color; si dicen colores distintos o no hay documento, queda vacío hasta su próxima responsiva, inspección o
 * edición.
 * "N/A", "NA", "NO APLICA" y similares se guardan en blanco: es el mismo dato escrito de muchas formas (parte 1).
 * Reglas acordadas que el usuario aprobó aplicar al migrar (D-I3, 3-oct): los nombres nuevos de los estatus (reunión
 * del 30-sep) y el departamento DISPONIBLE de lo guardado. DISPONIBLE no reemplaza a CONTROL INTERNO: son distintos.
 *
 * LINEAS TELEFONICAS NO se toca: el sistema sigue leyendo de ella hasta la etapa 2. Esta función se puede volver a
 * correr: borra y vuelve a armar las hojas nuevas, conservando los IDs que ya se habían dado (por ID ANTERIOR, por
 * número o por la pareja línea/equipo). Al final imprime la revisión: todo lo que no cabe en el diseño.
 *
 * IDs (sistema de Ayrton): todo renglón nuevo recibe uno nuevo; el ID de la fila vieja (LIN-…) se guarda en
 * ID ANTERIOR del EQUIPO (la fila vieja era un aparato) o, si la fila era solo línea, de la LÍNEA; y el ID que tenía en
 * el AppSheet (la columna "ID ANTERIOR" de la hoja vieja) en ID APPSHEET, porque hay referencias viejas que lo usan. El prefijo LIN pasa
 * a la hoja LINEAS cuando se retire LINEAS TELEFONICAS (etapa 3); mientras tanto se genera directo con Ids.nuevo.
 */

const ESTRUCTURA_HOJAS = {
  // NUCO ANTERIOR y las rutas del AppSheet se llenan al retirar LINEAS TELEFONICAS (paso 4, LineasRetiro.gs)
  LINEAS: ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'NUMERO TELEFONO', 'TIPO DE LINEA', 'COMPAÑIA', 'CUENTA PADRE', 'CUENTA', 'RAZON SOCIAL',
    'NUMERO SIM', 'PIN WHATSAPP', 'ESTATUS LINEA', 'FECHA DE ALTA', 'NUCO ANTERIOR', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'],
  EQUIPOS: ['ID', 'ID ANTERIOR', 'ID APPSHEET', 'NUCO', 'TIPO DE EQUIPO', 'MODELO', 'COLOR', 'IMEI', 'ACCESORIOS', 'PIN EQUIPO', 'PATRON',
    'CONTRASEÑA MODEM', 'ESTATUS EQUIPO', 'FECHA DE ALTA', 'RESPONSIVA', 'FORMATO INSPECCION', 'FECHA INSPECCION'],
  ASIGNACIONES: ['ID', 'TIPO', 'ID LINEA', 'ID EQUIPO', 'ID PERSONA', 'NO EMPLEADO', 'RESPONSABLE', 'PUESTO',
    'DEPARTAMENTO', 'AREA', 'SEDE', 'OFICINA / DESARROLLO', 'DIRECTOR', 'CUENTA GOOGLE', 'NOMBRE QUIEN USA',
    'PUESTO QUIEN USA', 'FECHA INICIO', 'FECHA FIN', 'JEFE DIRECTO'], // JEFE DIRECTO: usuario, 4-oct (lo traen Reasignar y Editar)
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
  equipo: { 'USO': 'PERSONA', 'RESGUARDO': 'RESGUARDO', 'VENTA': 'RESGUARDO', 'PARA VENTA': 'RESGUARDO',
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
// alcanza para saberlo: lo confirma la factura (cuenta de SIM básicos o de planes). LINEA BASICA sí se sabe: se
// factura en la cuenta de SIM básicos (plan §5.6.1).
const ESTRUCTURA_TIPO_EQUIPO = { 'EQUIPO': 'CELULAR', 'EQUIPO + SIM': 'CELULAR', 'EQUIPO + SIM BASICO': 'CELULAR',
  'MODEM': 'MODEM', 'BANDA ANCHA': 'MODEM', 'CAMARA': 'CAMARA' };
const ESTRUCTURA_TIPO_LINEA = { 'EQUIPO + SIM': 'PLAN', 'LINEA': '', 'EQUIPO + SIM BASICO': 'SIM BASICO',
  'LINEA BASICA': 'SIM BASICO', 'BANDA ANCHA': 'BANDA ANCHA', 'MODEM': '', 'CAMARA': '' };

const ESTRUCTURA_FUENTE_INVENTARIO = 'INVENTARIO (SIN CONFIRMAR)';
// Código de resguardo escrito en RESPONSABLE (decisión del usuario: no se pasa). Dos formas: la vieja (P0132, R1-0006,
// V0024, DS0054) y la de 2026 (PA-0570 (28/11/2026) = NUCO + A/V de vigencia del adendum + fin del adendum). A veces
// lleva una nota después ("- SE TOMA PARA TICKET 103687"): la nota sí es información y sale en la revisión.
const ESTRUCTURA_ES_CODIGO_RESGUARDO = /^([A-Z]{1,3}\d?-?\d{3,}( ?\(\d{1,2}\/\d{1,2}\/\d{4}\))?)(?=$|[\s\-–(])/;

function reestructuraArmarEstructura() {
  soloEditor_();
  // Con LINEAS TELEFONICAS retirada (paso 4) volver a armar desde ella borraría todo lo guardado en las hojas nuevas
  if (LineasLectura.retirada()) throw new Error('LINEAS TELEFONICAS ya se retiró (' + LineasLectura.retirada() + '): ya no se arma la estructura desde ella.');
  const ss = SpreadsheetApp.openById(leerConfig_('SS_ID_TELEFONIA'));
  const ahora = new Date();
  const norm = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim().toUpperCase();
  const vacio = (v) => ['', 'N/A', 'NA', 'NO APLICA', '-', 'SOLO LINEA', 'SIN EQUIPO'].indexOf(norm(v)) >= 0;
  // El valor tal como está (texto recortado o fecha); los "no aplica" en blanco
  const tal = (v) => (v instanceof Date ? v : (vacio(v) ? '' : String(v).trim()));
  /** Accesorios tal cual, salvo "SD", que pasa a "TARJETA SD" (decisión del usuario, 4-oct; 13 registros). */
  const accesoriosDe = (v) => {
    const t = tal(v);
    const partes = t.split(',').map((x) => x.trim());
    return partes.some((x) => x.toUpperCase() === 'SD') ? partes.map((x) => (x.toUpperCase() === 'SD' ? 'TARJETA SD' : x)).join(' , ') : t;
  };
  const esFecha = (v) => v instanceof Date && !isNaN(v.getTime());
  const hay = (v) => v !== '' && v !== null && v !== undefined;

  const tabla = (nombre) => {
    const h = ss.getSheetByName(nombre);
    if (!h) return [];
    const v = h.getDataRange().getValues();
    const enc = v[0].map((x) => String(x).trim());
    return v.slice(1).filter((r) => r.some((c) => String(c).trim() !== '')).map((r) => {
      const o = {};
      enc.forEach((k, i) => { if (k) o[k] = r[i]; });
      return o;
    });
  };

  // Revisión: lo que no cabe en el diseño. Cada tema guarda cuántos y hasta 8 NUCO/números de ejemplo.
  const revision = {};
  const anotar = (tema, ejemplo) => {
    const t = revision[tema] = revision[tema] || { cuantos: 0, ejemplos: [] };
    t.cuantos++;
    if (ejemplo && t.ejemplos.length < 8) t.ejemplos.push(String(ejemplo));
  };

  // 1) IDs que ya existían en las hojas nuevas (si esto ya se había corrido)
  const previo = { equipoPorAnterior: {}, lineaPorAnterior: {}, lineaPorNumero: {}, asignacion: {}, adendum: {} };
  tabla('EQUIPOS').forEach((r) => { if (r['ID ANTERIOR']) previo.equipoPorAnterior[norm(r['ID ANTERIOR'])] = String(r['ID']); });
  tabla('LINEAS').forEach((r) => {
    if (r['ID ANTERIOR']) previo.lineaPorAnterior[norm(r['ID ANTERIOR'])] = String(r['ID']);
    if (r['NUMERO TELEFONO']) previo.lineaPorNumero[norm(r['NUMERO TELEFONO'])] = String(r['ID']);
  });
  tabla('ASIGNACIONES').forEach((r) => {
    previo.asignacion[[r['TIPO'], r['ID LINEA'], r['ID EQUIPO'], esFecha(r['FECHA FIN']) ? 'C' : 'V'].join('|')] = String(r['ID']);
  });
  tabla('ADENDUMS').forEach((r) => { if (r['FUENTE'] === ESTRUCTURA_FUENTE_INVENTARIO) previo.adendum[String(r['ID LINEA'])] = String(r['ID']); });

  // 2) Fechas para saber desde cuándo vale cada asignación: bitácora CAMBIOS y reasignaciones viejas
  const ultimoCambio = {}; // idFila → { RESPONSABLE: fecha, ESTATUS: fecha, CUALQUIERA: fecha }
  const masNueva = (k, campo, f) => {
    if (!esFecha(f)) return;
    const u = ultimoCambio[k] = ultimoCambio[k] || {};
    if (!u[campo] || f > u[campo]) u[campo] = f;
  };
  tabla('CAMBIOS LINEAS TELEFONICAS').forEach((r) => {
    const k = norm(r['ID_LINEA']);
    if (!k) return;
    const campo = norm(r['CAMPO']);
    const f = r['FECHA ACTUALIZACION'];
    masNueva(k, 'CUALQUIERA', f);
    if (campo === 'RESPONSABLE' || campo === 'NO EMPLEADO') masNueva(k, 'RESPONSABLE', f);
    if (campo === 'ESTATUS EQUIPO' || campo === 'ESTATUS LINEA') masNueva(k, 'ESTATUS', f);
  });
  tabla('HISTORIAL_REASIGNACIONES').forEach((r) => masNueva(norm(r['ID Linea']), 'RESPONSABLE', r['Fecha de Reasignacion']));

  // 3) Recorrer la hoja de hoy: cada fila puede dar una línea, un equipo y sus asignaciones
  // COLOR por NUCO desde inspecciones y responsivas: solo si todas dicen el mismo (ver la cabecera)
  const coloresPorNuco = {};
  ['INSPECCIONES LINEAS', 'RESPONSIVAS LINEAS'].forEach((hoja) => tabla(hoja).forEach((r) => {
    const n = LineasUtil.nucoVisible(r['NUCO']);
    const c = norm(r['COLOR']);
    if (!n || vacio(c)) return;
    (coloresPorNuco[n] = coloresPorNuco[n] || {})[c] = true;
  }));
  const UN_COLOR = 'un solo color en sus documentos (se copia)';
  const DISTINTOS = 'colores distintos (vacío)';
  const SIN_DOCUMENTO = 'sin documento con color (vacío)';
  const origenColor = {};
  [UN_COLOR, DISTINTOS, SIN_DOCUMENTO].forEach((k) => { origenColor[k] = 0; });
  const colorDe = (nuco) => {
    const cs = Object.keys(coloresPorNuco[nuco] || {});
    origenColor[cs.length === 1 ? UN_COLOR : (cs.length ? DISTINTOS : SIN_DOCUMENTO)]++;
    return cs.length === 1 ? cs[0] : '';
  };

  const viejas = tabla('LINEAS TELEFONICAS');
  const salida = { LINEAS: [], EQUIPOS: [], ASIGNACIONES: [], ADENDUMS: [] };
  const numerosVistos = {};
  const imeisVistos = {};
  const nuevoId = (hoja) => Ids.nuevo(ESTRUCTURA_PREFIJOS[hoja]);
  const origenFecha = {};
  const cambiosNombre = {};

  viejas.forEach((f) => {
    const idFila = String(f['ID'] || '').trim();
    const k = norm(idFila);
    const kAnt = norm(f['ID ANTERIOR']);
    const tipo = norm(f['TIPO']);
    const nuco = LineasUtil.nucoVisible(f['NUCO']) || '';
    const numero = tal(f['NUMERO TELEFONO']);
    const sim = tal(f['NUMERO SIM']);
    const imei = tal(f['IMEI']);
    const ref = nuco ? 'NUCO ' + nuco : (numero || idFila);

    if (!(tipo in ESTRUCTURA_TIPO_EQUIPO) && !(tipo in ESTRUCTURA_TIPO_LINEA)) anotar('TIPO desconocido o vacío (fila sin línea ni equipo)', ref + ' · ' + (tipo || 'vacío'));

    // ¿Tiene equipo? Los tipos con equipo (como hoy en LineasRepo); una línea suelta no lleva aparato (D4.2)
    const tieneEquipo = tipo in ESTRUCTURA_TIPO_EQUIPO;
    // ¿Tiene línea? Solo si hay número o SIM (un MODEM o un EQUIPO sin número es solo el aparato). Una fila de solo
    // línea (LINEA, LINEA BASICA) se copia aunque no tenga ni número ni SIM, para no perder el registro (NUCO 1217).
    const soloLinea = tipo === 'LINEA' || tipo === 'LINEA BASICA';
    const tieneLinea = tipo in ESTRUCTURA_TIPO_LINEA && (!!(numero || sim) || soloLinea);
    if (tipo in ESTRUCTURA_TIPO_LINEA && !numero && !sim) {
      anotar(soloLinea ? 'Línea sin número ni SIM (se copia para no perder el registro)' : 'TIPO con línea pero sin número ni SIM (queda solo el equipo)', ref + ' · ' + tipo);
    }
    if (!tieneEquipo && imei) anotar('Línea sin equipo que trae algo en IMEI (no se crea aparato: el NUCO solo es de aparatos)', ref + ' · IMEI ' + imei);
    if (tipo === 'EQUIPO' && numero) anotar('TIPO EQUIPO con número capturado (no se crea la línea)', ref + ' · ' + numero);

    // Estatus como vienen, con su nombre nuevo si lo tiene (D-I3)
    const viejoEq = tieneEquipo ? tal(f['ESTATUS EQUIPO']).toUpperCase() : '';
    const viejoLn = tieneLinea ? tal(f['ESTATUS LINEA']).toUpperCase() : '';
    const estEq = ESTRUCTURA_NOMBRE_NUEVO.equipo[viejoEq] || viejoEq;
    const estLn = ESTRUCTURA_NOMBRE_NUEVO.linea[viejoLn] || viejoLn;
    if (estEq !== viejoEq) cambiosNombre['equipo ' + viejoEq + ' → ' + estEq] = (cambiosNombre['equipo ' + viejoEq + ' → ' + estEq] || 0) + 1;
    if (estLn !== viejoLn) cambiosNombre['línea ' + viejoLn + ' → ' + estLn] = (cambiosNombre['línea ' + viejoLn + ' → ' + estLn] || 0) + 1;
    if (tieneEquipo && !ESTRUCTURA_CLASE.equipo[estEq]) anotar('Estatus de equipo que no dice dónde está (sin asignación hasta que Líneas lo resuelva): ' + (estEq || 'vacío'), ref);
    if (tieneLinea && !ESTRUCTURA_CLASE.linea[estLn]) anotar('Estatus de línea que no dice dónde está (sin asignación hasta que Líneas lo resuelva): ' + (estLn || 'vacío'), ref + ' · ' + numero);

    // LÍNEA
    let idLinea = '';
    let lineaDeEstaFila = false;
    if (tieneLinea) {
      const kNum = norm(numero || sim) || ('SIN NUMERO|' + idFila);
      if (numero && numerosVistos[kNum]) {
        anotar('Número repetido en dos filas (se crea una sola línea)', numero);
        idLinea = numerosVistos[kNum];
      } else {
        if (numero && /^D-\d+$/i.test(numero)) anotar('Marcador de Dirección General en lugar del número (D-001…)', ref + ' · ' + numero);
        idLinea = (!tieneEquipo && (previo.lineaPorAnterior[k] || previo.lineaPorAnterior[kAnt])) || previo.lineaPorNumero[kNum] || nuevoId('LINEAS');
        numerosVistos[kNum] = idLinea;
        lineaDeEstaFila = true;
        const tipoLinea = ESTRUCTURA_TIPO_LINEA[tipo];
        if (!tipoLinea) anotar('Tipo de línea por confirmar con la factura (TIPO ' + tipo + ')', ref + ' · ' + numero);
        salida.LINEAS.push({
          'ID': idLinea, 'ID ANTERIOR': tieneEquipo ? '' : idFila, 'ID APPSHEET': tieneEquipo ? '' : tal(f['ID ANTERIOR']),
          'NUMERO TELEFONO': numero, 'TIPO DE LINEA': tipoLinea,
          'COMPAÑIA': tal(f['COMPAÑIA']), 'CUENTA PADRE': '', 'CUENTA': '', 'RAZON SOCIAL': tal(f['RAZON SOCIAL']),
          'NUMERO SIM': sim, 'PIN WHATSAPP': tal(f['PIN WHATSAPP']), 'ESTATUS LINEA': estLn,
          'FECHA DE ALTA': tal(f['FECHA REGISTRO']),
        });
        // Adendum: lo que hoy dice el inventario, tal cual y marcado como no confirmado
        const ini = tal(f['INICIO PLAN']);
        const fin = tal(f['FIN PLAN']);
        const costo = typeof f['COSTO PLAN'] === 'number' ? f['COSTO PLAN'] : tal(f['COSTO PLAN']);
        if (hay(ini) || hay(fin) || hay(costo)) {
          if (tipoLinea === 'SIM BASICO' && hay(fin)) anotar('SIM básico con fin de plan capturado (se copia; los SIM básicos no tienen adendum: ¿de qué contrato es?)', ref + ' · ' + numero);
          if (hay(fin) && !esFecha(fin)) anotar('FIN PLAN escrito como texto (se copia como está)', ref + ' · ' + fin);
          salida.ADENDUMS.push({
            'ID': previo.adendum[idLinea] || nuevoId('ADENDUMS'), 'ID LINEA': idLinea, 'NUMERO TELEFONO': numero,
            'COMPAÑIA': tal(f['COMPAÑIA']), 'CUENTA PADRE': '', 'PLAN': '', 'COSTO PLAN': costo, 'INICIO PLAN': ini,
            'FIN PLAN': fin, 'FUENTE': ESTRUCTURA_FUENTE_INVENTARIO, 'ARCHIVO': '', 'FECHA DEL ARCHIVO': '',
            'FECHA DE CARGA': ahora,
          });
        } else if (estLn === 'USO') {
          anotar('Línea en uso sin datos de adendum', ref + ' · ' + numero);
        }
      }
    }

    // EQUIPO
    let idEquipo = '';
    if (tieneEquipo) {
      idEquipo = previo.equipoPorAnterior[k] || previo.equipoPorAnterior[kAnt] || nuevoId('EQUIPOS');
      if (imei && imeisVistos[imei]) anotar('IMEI repetido en dos aparatos', 'IMEI ' + imei + ' · NUCO ' + imeisVistos[imei] + ' y ' + nuco);
      if (imei) imeisVistos[imei] = nuco;
      if (!imei && estEq === 'USO') anotar('Equipo en uso sin IMEI', ref);
      if (tipo === 'BANDA ANCHA') anotar('Aparato de BANDA ANCHA → tipo de equipo MODEM (confirmar)', ref);
      salida.EQUIPOS.push({
        'ID': idEquipo, 'ID ANTERIOR': idFila, 'ID APPSHEET': tal(f['ID ANTERIOR']), 'NUCO': nuco, 'TIPO DE EQUIPO': ESTRUCTURA_TIPO_EQUIPO[tipo],
        'MODELO': tal(f['EQUIPO']), 'COLOR': colorDe(nuco), 'IMEI': imei, 'ACCESORIOS': accesoriosDe(f['ACCESORIOS']), 'PIN EQUIPO': tal(f['PIN EQUIPO']),
        'PATRON': tal(f['PATRON']), 'CONTRASEÑA MODEM': tal(f['CONTRASEÑA MODEM']), 'ESTATUS EQUIPO': estEq,
        'FECHA DE ALTA': tal(f['FECHA REGISTRO']),
      });
    }

    // ASIGNACIONES vigentes: una por clase (con persona / de resguardo) entre la línea y el equipo de la fila
    const partes = [];
    if (tieneEquipo) partes.push({ parte: 'equipo', clase: ESTRUCTURA_CLASE.equipo[estEq] || 'SIN DEFINIR' });
    if (lineaDeEstaFila) partes.push({ parte: 'linea', clase: ESTRUCTURA_CLASE.linea[estLn] || 'SIN DEFINIR' });
    const clases = {};
    partes.forEach((p) => { (clases[p.clase] = clases[p.clase] || []).push(p.parte); });
    if (clases['SIN DEFINIR']) anotar('Sin asignación: su estatus no dice dónde está', ref);
    if (clases.PERSONA && clases.RESGUARDO) anotar('Línea y equipo de la misma fila: uno con persona y otro guardado (dos asignaciones)', ref + ' · equipo ' + estEq + ' / línea ' + estLn);
    if (clases.PERSONA && clases.NINGUNA) anotar('Uno en uso y el otro ya dado de baja (equipo ' + estEq + ' / línea ' + estLn + ')', ref);

    const responsable = tal(f['RESPONSABLE']);
    const mCodigo = ESTRUCTURA_ES_CODIGO_RESGUARDO.exec(norm(responsable));
    const codigo = mCodigo ? mCodigo[1].trim() : '';
    if (codigo) anotar('Código de resguardo en RESPONSABLE (no se pasa: solo servía en la hoja, decisión del usuario)', ref);
    const notaCodigo = mCodigo ? norm(responsable).slice(mCodigo[0].length).replace(/^[\s\-–(]+|[)\s]+$/g, '') : '';
    if (notaCodigo) anotar('Nota escrita junto al código de resguardo (es información: en la migración pasa al historial)', ref + ' · ' + notaCodigo);
    const persona = codigo ? '' : responsable;
    const u = ultimoCambio[k] || ultimoCambio[kAnt] || {};

    ['PERSONA', 'RESGUARDO'].forEach((clase) => {
      const ps = clases[clase];
      if (!ps) return;
      const conLinea = ps.indexOf('linea') >= 0 ? idLinea : '';
      const conEquipo = ps.indexOf('equipo') >= 0 ? idEquipo : '';
      let inicio = clase === 'PERSONA' ? u.RESPONSABLE : u.ESTATUS;
      let origen = clase === 'PERSONA' ? 'último cambio de responsable' : 'último cambio de estatus';
      if (!inicio && u.CUALQUIERA) { inicio = u.CUALQUIERA; origen = 'último cambio de cualquier dato'; }
      if (!inicio && esFecha(f['FECHA REGISTRO'])) { inicio = f['FECHA REGISTRO']; origen = 'fecha de alta del registro'; }
      if (!inicio) { inicio = ''; origen = 'sin fecha'; }
      origenFecha[clase + ' · ' + origen] = (origenFecha[clase + ' · ' + origen] || 0) + 1;

      // Datos tal como están en la fila, también en lo guardado: si se limpian, lo decide Líneas (B13)
      const a = {
        'ID': previo.asignacion[[clase, conLinea, conEquipo, 'V'].join('|')] || nuevoId('ASIGNACIONES'), 'TIPO': clase,
        'ID LINEA': conLinea, 'ID EQUIPO': conEquipo, 'ID PERSONA': tal(f['ID PERSONA']), 'NO EMPLEADO': tal(f['NO EMPLEADO']),
        'RESPONSABLE': persona, 'PUESTO': tal(f['PUESTO']), 'AREA': tal(f['AREA']),
        // Lo guardado va a DISPONIBLE (reunión del 30-sep; aprobado para la migración, D-I3)
        'DEPARTAMENTO': clase === 'RESGUARDO' ? LineasRepo.DEPARTAMENTO_DISPONIBLE : tal(f['DEPARTAMENTO']),
        'SEDE': tal(f['SEDE']), 'OFICINA / DESARROLLO': tal(f['OFICINA / DESARROLLO']), 'DIRECTOR': tal(f['DIRECTOR']),
        'CUENTA GOOGLE': tal(f['CUENTA GOOGLE']), 'NOMBRE QUIEN USA': '', 'PUESTO QUIEN USA': '',
        'FECHA INICIO': inicio, 'FECHA FIN': '',
      };
      if (clase === 'PERSONA') {
        if (!responsable) anotar('En uso sin responsable', ref);
        if (codigo) anotar('En uso con un código de resguardo como responsable', ref + ' · ' + codigo);
        if (/\/|,| Y /.test(norm(responsable))) anotar('Varios nombres en RESPONSABLE (se copia tal cual; Líneas decide quién firma)', ref + ' · ' + responsable);
      } else if (persona) {
        anotar('Guardado con el nombre de una persona (se copia; si se limpia lo decide Líneas, B13)', ref + ' · ' + persona);
      }
      // "Quien usa" solo si es otra persona (decisión del usuario, parte 3 §3.7). A veces trae otro código de resguardo
      // (Y2-1051): tampoco se pasa.
      const usa = tal(f['NOMBRE QUIEN USA']);
      if (usa && ESTRUCTURA_ES_CODIGO_RESGUARDO.test(norm(usa))) {
        anotar('Código de resguardo en "quien usa" (no se pasa)', ref);
      } else if (usa && norm(usa) !== norm(responsable)) {
        a['NOMBRE QUIEN USA'] = usa;
        a['PUESTO QUIEN USA'] = tal(f['PUESTO QUIEN USA']);
      } else if (usa) {
        anotar('"Quien usa" igual al responsable (no se pasa, decisión §3.7)', ref);
      }
      salida.ASIGNACIONES.push(a);
    });
  });

  // 4) Catálogos
  const catalogos = [];
  const agregarLista = (lista, valores) => valores.forEach((v) => catalogos.push({ 'LISTA': lista, 'VALOR': v }));
  const modelos = {};
  tabla('LISTAS TELEFONOS').forEach((r) => { const m = tal(r['EQUIPO']); if (m) modelos[m] = true; });
  agregarLista('MODELO', Object.keys(modelos).sort());
  agregarLista('ACCESORIO', ['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO']);
  agregarLista('TIPO DE LINEA', ['PLAN', 'SIM BASICO', 'BANDA ANCHA']);
  agregarLista('TIPO DE EQUIPO', ['CELULAR', 'MODEM']);
  agregarLista('COMPAÑIA', ['TELCEL', 'AT&T']);
  const cuentas = ESTRUCTURA_CUENTAS.map((c) => {
    const o = {};
    ESTRUCTURA_HOJAS.CUENTAS.forEach((h, i) => { o[h] = c[i]; });
    return o;
  });

  // 5) Escribir las hojas nuevas (cada una completa, de una vez)
  const escribir = (nombre, objetos) => {
    const enc = ESTRUCTURA_HOJAS[nombre];
    let hoja = ss.getSheetByName(nombre);
    if (!hoja) hoja = ss.insertSheet(nombre, ss.getSheets().length);
    if (hoja.getFilter()) hoja.getFilter().remove();
    hoja.clearContents();
    const total = objetos.length + 1;
    if (hoja.getMaxRows() < total) hoja.insertRowsAfter(hoja.getMaxRows(), total - hoja.getMaxRows());
    if (hoja.getMaxColumns() < enc.length) hoja.insertColumnsAfter(hoja.getMaxColumns(), enc.length - hoja.getMaxColumns());
    enc.forEach((h, i) => {
      const r = hoja.getRange(2, i + 1, Math.max(1, hoja.getMaxRows() - 1), 1);
      if (/^FECHA/.test(h) || h === 'INICIO PLAN' || h === 'FIN PLAN') r.setNumberFormat('dd/MM/yyyy');
      else if (['COSTO PLAN', 'TOTAL CON IVA', 'MINUTOS', 'MENSAJES', 'DATOS MB', 'DIA DE CORTE'].indexOf(h) >= 0) r.setNumberFormat('0.##');
      else r.setNumberFormat('@'); // texto: que Sheets no quite ceros a NUCO, números ni IDs
    });
    const filas = objetos.map((o) => enc.map((h) => (o[h] === undefined || o[h] === null ? '' : o[h])));
    hoja.getRange(1, 1, total, enc.length).setValues([enc].concat(filas));
    hoja.getRange(1, 1, 1, enc.length).setFontWeight('bold');
    hoja.setFrozenRows(1);
    hoja.getRange(1, 1, total, enc.length).createFilter();
    return filas.length;
  };
  const escritos = {
    LINEAS: escribir('LINEAS', salida.LINEAS),
    EQUIPOS: escribir('EQUIPOS', salida.EQUIPOS),
    ASIGNACIONES: escribir('ASIGNACIONES', salida.ASIGNACIONES),
    ADENDUMS: escribir('ADENDUMS', salida.ADENDUMS),
    FACTURAS: ss.getSheetByName('FACTURAS') ? tabla('FACTURAS').length : escribir('FACTURAS', []),
    CUENTAS: escribir('CUENTAS', cuentas),
    CATALOGOS: escribir('CATALOGOS', catalogos),
  };
  SpreadsheetApp.flush();
  // Que el sistema vuelva a leer: las hojas nuevas cambiaron (y en la etapa 2 de ellas sale LINEAS TELEFONICAS)
  LineasDatos.tocar(Object.keys(ESTRUCTURA_HOJAS));
  LineasLectura.limpiarCaches();

  // 6) Revisión
  const contar = (lista, fn) => {
    const c = {};
    lista.forEach((x) => { const v = fn(x) || '(vacío)'; c[v] = (c[v] || 0) + 1; });
    return c;
  };
  const resumen = {
    filasDeLaHojaVieja: viejas.length,
    escritos: escritos,
    lineasPorTipo: contar(salida.LINEAS, (l) => l['TIPO DE LINEA']),
    lineasPorEstatus: contar(salida.LINEAS, (l) => l['ESTATUS LINEA']),
    equiposPorTipo: contar(salida.EQUIPOS, (e) => e['TIPO DE EQUIPO']),
    equiposPorEstatus: contar(salida.EQUIPOS, (e) => e['ESTATUS EQUIPO']),
    colorDelEquipo: origenColor,
    coloresCopiados: contar(salida.EQUIPOS.filter((e) => e['COLOR']), (e) => e['COLOR']),
    asignaciones: contar(salida.ASIGNACIONES, (a) => a['TIPO'] + ' · ' + (a['ID LINEA'] && a['ID EQUIPO'] ? 'línea + equipo' : (a['ID LINEA'] ? 'solo línea' : 'solo equipo'))),
    deDondeSaleLaFechaDeInicio: origenFecha,
    nombresNuevosDeEstatus: cambiosNombre,
    resguardoPorDepartamento: contar(salida.ASIGNACIONES.filter((a) => a['TIPO'] === 'RESGUARDO'), (a) => a['DEPARTAMENTO']),
  };
  const lineas = ['=== ESTRUCTURA NUEVA ===', JSON.stringify(resumen, null, 1), '', '=== REVISIÓN: lo que no cabe en el diseño ==='];
  Object.keys(revision).sort((a, b) => revision[b].cuantos - revision[a].cuantos).forEach((tema) => {
    lineas.push(revision[tema].cuantos + ' · ' + tema + ' · ej. ' + revision[tema].ejemplos.join(' | '));
  });
  for (let i = 0; i < lineas.length; i += 25) console.log(lineas.slice(i, i + 25).join('\n'));
  return 'Listo: ' + JSON.stringify(escritos);
}
