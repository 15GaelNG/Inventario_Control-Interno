/* Servidor falso de la vista previa (ver construir.js). Todo aquí es de mentira. */
(function () {
  // ---------- sesión ya iniciada, con permiso de edición en todo ----------
  sessionStorage.setItem('token', 'vista-previa');
  sessionStorage.setItem('sesion', JSON.stringify({ token: 'vista-previa', nombre: 'AYRTON SEPULVEDA CHOWEL', correo: 'prueba@ciudadmaderas.com' }));
  const tema = /tema=oscuro/.test(location.hash) ? 'dark' : 'light';
  try { localStorage.setItem('tema', tema); } catch (e) { /* no-op */ }

  // Los mismos grupos que src/config/Modulos.gs (sin Líneas: sus escenas llegan con la Fase 4 del plan responsivo)
  const MODULOS = [
    ['servicios-vehiculares', 'Servicios Vehiculares', 'car', [
      ['incidencias', 'Incidencias'], ['vehiculos', 'Vehículos'], ['cambios-vehiculos', 'Cambios Vehículos'],
      ['reasignaciones-vehiculares', 'Reasignaciones Vehiculares'], ['verificaciones', 'Verificaciones'],
      ['inspeccion-vehicular', 'Inspección Vehicular'], ['instalacion-sensores', 'Instalación de Sensores'], ['hologramas', 'Hologramas']]],
    ['arqueos', 'Arqueos', 'wallet', [['arqueos', 'Arqueos'], ['caja-chica', 'Caja Chica']]],
    ['uber', 'Uber', 'car-taxi-front', [['uber', 'Uber'], ['tickets', 'Tickets']]],
    ['administracion', 'Administración', 'settings', [['usuarios', 'Usuarios y permisos'], ['relaciones', 'Datos conectados'], ['salud', 'Salud']]],
  ];
  const grupos = MODULOS.map(([id, etiqueta, icono, mods]) => ({ id, etiqueta, icono, modulos: mods.map(([i, e]) => ({ id: i, etiqueta: e })) }));
  const permisos = {};
  grupos.forEach((g) => g.modulos.forEach((m) => { permisos[m.id] = 'EDICION'; }));

  const hace = (dias) => new Date(Date.now() - dias * 864e5).toISOString();
  const VEHICULO = {
    FOLIO: 'AUT0024', PLACA: 'GGY886F', MARCA: 'CHEVROLET', 'LINEA VEHICULO': 'BEAT', MODELO: 2019,
    'RESPONSABLE VEHICULO': 'JUAN MANUEL FULGENCIO HERNANDEZ', DEPARTAMENTO: 'TI', SEDE: 'QUERETARO',
    'SERIE VEHICULO': 'MA6CA6CD4KT046623', ESTATUS: 'UTILITARIO',
  };
  const opciones = ['BUENO', 'REGULAR', 'MALO', 'N/A'];
  const seccion = (titulo, peso, piezas, ops) => ({ titulo, peso, campos: piezas.map((p) => ({ campo: p, opciones: ops || opciones })) });
  // Un dibujo simple para los diagramas (SVG → dataURL no sirve: el servidor manda base64 de PNG)
  const DIBUJO = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';


  // ---------- Relaciones entre hojas ----------
  // El mapa es la salida real de Relaciones.describir(); la revisión es de mentira.
  const REL_MAPA = {"duenos":[{"hoja":"CAJAS CHICAS","etiqueta":{"nombre":"Caja Chica","uno":"caja chica","varios":"cajas chicas","familia":"Caja Chica"},"llaveDeNegocio":"ID CCH","copias":[{"nombre":"ARQUEOS","etiqueta":{"nombre":"Arqueos","uno":"arqueo","varios":"arqueos","familia":"Caja Chica"},"tipo":"bitacora","llaveForanea":"ID CAJA CHICA","claveOrigen":"ID CCH","clave":"ID CCH","columnas":[{"origen":"RESPONSABLE DE CAJA CHICA","destino":"RESPONSABLE","calculada":false},{"origen":"PUESTO DE RESPONSABLE","destino":"PUESTO","calculada":false},{"origen":"DEPARTAMENTO","destino":"AREA / DEPARTAMENTO","calculada":false},{"origen":"EMPRESA ORIGEN","destino":"RAZON SOCIAL","calculada":false},{"origen":"METODO DE REEMBOLSO","destino":"METODO REEMBOLSO","calculada":false},{"origen":"MONTO ACTUAL","destino":"MONTO CAJA","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""},{"nombre":"INCREMENTOS","etiqueta":{"nombre":"Cambios de Monto","uno":"cambio de monto","varios":"cambios de monto","familia":"Caja Chica"},"tipo":"bitacora","llaveForanea":"ID CAJA CHICA","claveOrigen":"ID CCH","clave":"ID CCH","columnas":[],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""}]},{"hoja":"VEHICULOS","etiqueta":{"nombre":"Vehículos","uno":"vehículo","varios":"vehículos","familia":"Vehículos"},"llaveDeNegocio":"FOLIO","copias":[{"nombre":"INSTALACION DE SENSORES","etiqueta":{"nombre":"Instalación de Sensores","uno":"sensor","varios":"sensores","familia":"Vehículos"},"tipo":"cache","llaveForanea":"ID VEHICULO","claveOrigen":"SERIE VEHICULO","clave":"SERIE VEHICULO","columnas":[{"origen":"FOLIO","destino":"FOLIO","calculada":false},{"origen":"PLACA","destino":"PLACA","calculada":false},{"origen":"MARCA","destino":"MARCA","calculada":false},{"origen":"CLASE","destino":"CLASE","calculada":false},{"origen":"LINEA VEHICULO","destino":"LINEA VEHICULO","calculada":false},{"origen":"MODELO","destino":"MODELO","calculada":false},{"origen":"COLOR","destino":"COLOR","calculada":false},{"origen":"CAPACIDAD COMBUSTIBLE (LTS)","destino":"CAPACIDAD DE COMBUSTIBLE","calculada":false},{"origen":"RAZON SOCIAL","destino":"RAZON SOCIAL","calculada":false},{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"SEDE","destino":"SEDE","calculada":false},{"origen":"OFICINA / DESARROLLO","destino":"OFICINA / DESARROLLO","calculada":false},{"origen":"RESPONSABLE VEHICULO","destino":"RESPONSABLE","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""},{"nombre":"VERIFICACIONES","etiqueta":{"nombre":"Verificaciones","uno":"verificación","varios":"verificaciones","familia":"Vehículos"},"tipo":"cache","llaveForanea":"ID VEHICULO","claveOrigen":"FOLIO","clave":"FOLIO VEHICULO","columnas":[{"origen":"PLACA","destino":"PLACA","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""},{"nombre":"HOLOGRAMAS","etiqueta":{"nombre":"Hologramas","uno":"holograma","varios":"hologramas","familia":"Vehículos"},"tipo":"cache","llaveForanea":"ID VEHICULO","claveOrigen":"SERIE VEHICULO","clave":"SERIE VEHICULO","columnas":[{"origen":"PLACA","destino":"PLACA","calculada":false},{"origen":"MARCA","destino":"MARCA","calculada":false},{"origen":"LINEA VEHICULO","destino":"LINEA VEHICULO","calculada":false},{"origen":"MODELO","destino":"MODELO","calculada":false},{"origen":"RESPONSABLE VEHICULO","destino":"RESPONSABLE","calculada":false},{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"CAPACIDAD COMBUSTIBLE (LTS)","destino":"CAPACIDAD DEL TANQUE","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":"vehículos personales"},{"nombre":"INSPECCION VEHICULAR","etiqueta":{"nombre":"Inspección Vehicular","uno":"inspección","varios":"inspecciones","familia":"Vehículos"},"tipo":"bitacora","llaveForanea":"ID VEHICULO","claveOrigen":"SERIE VEHICULO","clave":"NO SERIE","columnas":[{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"SEDE","destino":"SEDE","calculada":false},{"origen":"OFICINA / DESARROLLO","destino":"OFICINA / DESARROLLO","calculada":false},{"origen":"RESPONSABLE VEHICULO","destino":"RESPONSABLE","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""},{"nombre":"INCIDENCIAS","etiqueta":{"nombre":"Incidencias","uno":"incidencia","varios":"incidencias","familia":"Vehículos"},"tipo":"bitacora","llaveForanea":"ID VEHICULO","claveOrigen":"FOLIO","clave":"FOLIO","columnas":[{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"MODELO","destino":"MODELO","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""}]},{"hoja":"LINEAS TELEFONICAS","etiqueta":{"nombre":"Líneas Telefónicas","uno":"línea","varios":"líneas","familia":"Líneas"},"llaveDeNegocio":"NUCO","copias":[{"nombre":"INSPECCIONES LINEAS","etiqueta":{"nombre":"Inspecciones de Líneas","uno":"inspección","varios":"inspecciones","familia":"Líneas"},"tipo":"bitacora","llaveForanea":"ID LINEA","claveOrigen":"NUCO","clave":"NUCO","columnas":[{"origen":"NUMERO TELEFONO","destino":"No TELEFONO","calculada":false},{"origen":"NUMERO SIM","destino":"SIM","calculada":false},{"origen":"EQUIPO","destino":"MODELO","calculada":false},{"origen":"IMEI","destino":"IMEI","calculada":false},{"origen":"TIPO","destino":"TIPO","calculada":false},{"origen":"COMPAÑIA","destino":"COMPAÑIA","calculada":false},{"origen":"RAZON SOCIAL","destino":"RAZON SOCIAL","calculada":false},{"origen":"RESPONSABLE","destino":"RESPONSABLE","calculada":false},{"origen":"PUESTO","destino":"PUESTO","calculada":false},{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"AREA","destino":"AREA","calculada":false},{"origen":"SEDE","destino":"SEDE","calculada":false},{"origen":"OFICINA / DESARROLLO","destino":"OFICINA / DESARROLLO","calculada":false},{"origen":"JEFE DIRECTO","destino":"JEFE DIRECTO","calculada":false},{"origen":"CUENTA GOOGLE","destino":"CORREO","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"Al guardar una inspección, la línea toma de ella el responsable, su puesto, área, sede y jefe. La línea queda con lo de la última inspección, y cada inspección conserva lo de su día.","notaColumnas":["RESPONSABLE","DEPARTAMENTO","AREA","SEDE","OFICINA / DESARROLLO","PUESTO","JEFE DIRECTO","CUENTA GOOGLE"],"huerfanaEsperada":""},{"nombre":"RESPONSIVAS LINEAS","etiqueta":{"nombre":"Responsivas de Líneas","uno":"responsiva","varios":"responsivas","familia":"Líneas"},"tipo":"bitacora","llaveForanea":"ID LINEA","claveOrigen":"NUCO","clave":"NUCO","columnas":[{"origen":"NUMERO TELEFONO","destino":"No TELEFONO","calculada":false},{"origen":"NUMERO SIM","destino":"SIM","calculada":false},{"origen":"EQUIPO","destino":"MODELO","calculada":false},{"origen":"IMEI","destino":"IMEI","calculada":false},{"origen":"COMPAÑIA","destino":"COMPAÑIA","calculada":false},{"origen":"RAZON SOCIAL","destino":"RAZON SOCIAL","calculada":false},{"origen":"NO EMPLEADO","destino":"No EMPLEADO","calculada":false},{"origen":"RESPONSABLE","destino":"RESPONSABLE","calculada":false},{"origen":"PUESTO","destino":"PUESTO","calculada":false},{"origen":"DEPARTAMENTO","destino":"DEPARTAMENTO","calculada":false},{"origen":"AREA","destino":"AREA","calculada":false},{"origen":"SEDE","destino":"SEDE","calculada":false},{"origen":"OFICINA / DESARROLLO","destino":"OFICINA / DESARROLLO","calculada":false},{"origen":"DIRECTOR","destino":"DIRECTOR","calculada":false},{"origen":"CUENTA GOOGLE","destino":"CORREO","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""},{"nombre":"CAMBIOS LINEAS TELEFONICAS","etiqueta":{"nombre":"Control de Cambios - Líneas","uno":"cambio","varios":"cambios","familia":"Líneas"},"tipo":"bitacora","llaveForanea":"ID_LINEA","claveOrigen":"NUCO","clave":"NUCO","columnas":[{"origen":"NUCO","destino":"NUCO","calculada":false},{"origen":"IMEI","destino":"IMEI","calculada":false}],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""}]},{"hoja":"ACCESORIOS CELULARES","etiqueta":{"nombre":"Inventario de Accesorios (Líneas)","uno":"artículo","varios":"artículos","familia":"Líneas"},"llaveDeNegocio":"Nombre del Articulo","copias":[{"nombre":"MOVIMIENTOS_ACCESORIOS","etiqueta":{"nombre":"Movimientos de Accesorios","uno":"movimiento","varios":"movimientos","familia":"Líneas"},"tipo":"bitacora","llaveForanea":"ID ACCESORIO","claveOrigen":"ID ANTERIOR","clave":"ID_Accesorio","columnas":[],"campoEnDueno":"ID","sinDueno":null,"nota":"","notaColumnas":null,"huerfanaEsperada":""}]},{"hoja":"INSTALACION DE SENSORES","etiqueta":{"nombre":"Instalación de Sensores","uno":"sensor","varios":"sensores","familia":"Vehículos"},"llaveDeNegocio":"FOLIO","copias":[{"nombre":"VEHICULOS","etiqueta":{"nombre":"Vehículos","uno":"vehículo","varios":"vehículos","familia":"Vehículos"},"tipo":"cache","llaveForanea":"ID","claveOrigen":"SERIE VEHICULO","clave":"SERIE VEHICULO","columnas":[{"origen":"SERIE SENSOR","destino":"SERIE SENSOR","calculada":true},{"origen":"ESTATUS SENSOR","destino":"SENSOR","calculada":true}],"campoEnDueno":"ID VEHICULO","sinDueno":{"SERIE SENSOR":"","SENSOR":"NO TIENE SENSOR"},"nota":"Si el vehículo tiene un sensor activo, aquí aparece su serie y dice SI TIENE SENSOR. Si el sensor se dio de baja, o el vehículo nunca tuvo uno, la serie queda vacía y dice NO TIENE SENSOR. Cambia solo al registrar, editar, mover o borrar un sensor; desde Vehículos no se puede editar.","notaColumnas":null,"huerfanaEsperada":""}]},{"hoja":"PERSONAS","etiqueta":{"nombre":"Capital Humano","uno":"persona","varios":"personas","familia":"Capital Humano"},"llaveDeNegocio":"NOMBRE COMPLETO","copias":[{"nombre":"VEHICULOS (persona)","etiqueta":{"nombre":"Vehículos","uno":"vehículo","varios":"vehículos","familia":"Vehículos"},"tipo":"cache","llaveForanea":"ID PERSONA","campoEnDueno":"ID PERSONA","claveOrigen":"NOMBRE COMPLETO","clave":"RESPONSABLE VEHICULO / NO EMPLEADO","columnas":[{"origen":"ID PERSONA","destino":"ID PERSONA","calculada":true}],"llaveRegistro":"FOLIO","sinDueno":null,"notaColumnas":null,"huerfanaEsperada":"un responsable que no es persona (BAJA VEHICULAR, DONACIÓN, un código de desarrollo…)","nota":"Se calcula del responsable que está escrito (RESPONSABLE VEHICULO, NO EMPLEADO): primero por correo, luego por nombre, y el número de empleado solo desempata a dos personas que se llaman igual. Nunca cambia el nombre que alguien escribió; si el responsable cambia, su persona se actualiza."},{"nombre":"CAJAS CHICAS (persona)","etiqueta":{"nombre":"Caja Chica","uno":"caja chica","varios":"cajas chicas","familia":"Caja Chica"},"tipo":"cache","llaveForanea":"ID PERSONA","campoEnDueno":"ID PERSONA","claveOrigen":"NOMBRE COMPLETO","clave":"CORREO ELECTRONICO DE RESPONSABLE / RESPONSABLE DE CAJA CHICA","columnas":[{"origen":"ID PERSONA","destino":"ID PERSONA","calculada":true}],"llaveRegistro":"ID CCH","sinDueno":null,"notaColumnas":null,"huerfanaEsperada":"un responsable que no es persona (BAJA VEHICULAR, DONACIÓN, un código de desarrollo…)","nota":"Se calcula del responsable que está escrito (CORREO ELECTRONICO DE RESPONSABLE, RESPONSABLE DE CAJA CHICA): primero por correo, luego por nombre, y el número de empleado solo desempata a dos personas que se llaman igual. Nunca cambia el nombre que alguien escribió; si el responsable cambia, su persona se actualiza."},{"nombre":"LINEAS TELEFONICAS (persona)","etiqueta":{"nombre":"Líneas Telefónicas","uno":"línea","varios":"líneas","familia":"Líneas"},"tipo":"cache","llaveForanea":"ID PERSONA","campoEnDueno":"ID PERSONA","claveOrigen":"NOMBRE COMPLETO","clave":"EMAIL USUARIO / RESPONSABLE / NO EMPLEADO","columnas":[{"origen":"ID PERSONA","destino":"ID PERSONA","calculada":true}],"llaveRegistro":"NUCO","sinDueno":null,"notaColumnas":null,"huerfanaEsperada":"un responsable que no es persona (BAJA VEHICULAR, DONACIÓN, un código de desarrollo…)","nota":"Se calcula del responsable que está escrito (EMAIL USUARIO, RESPONSABLE, NO EMPLEADO): primero por correo, luego por nombre, y el número de empleado solo desempata a dos personas que se llaman igual. Nunca cambia el nombre que alguien escribió; si el responsable cambia, su persona se actualiza."}]}],"centinelas":{"*":["BAJA VEHICULAR","FUERA DE SERVICIO","NUCO SIN INFORMACION","SIN ESPECIFICAR"],"PLACA":["SIN PLACA","BAJA DE PLACA"]}};
  const relE = (tipo, fila, dueno, columna, tenia, quedo) => ({ tipo, hoja: '', fila, clave: dueno, dueno, columna, tenia, quedo });
  const relHoja = (nombre, tipo, cifras, entradas) => Object.assign({ nombre, tipo, revisadas: 0, diferencias: 0, huerfanos: 0,
    clavesDuplicadasOmitidas: 0, centinelasOmitidos: 0, vaciosOmitidos: 0, diferenciasHistoricas: 0,
    emparejadasPorId: 0, emparejadasPorClave: 0, corregido: false, entradas: entradas || [] }, cifras);
  const relMal = (fila, serie) => Object.assign(relE('HUERFANO', fila, serie, 'SERIE VEHICULO', '', ''), { malEscrita: true });
  const REL_REVISION = [
    relHoja('ARQUEOS', 'bitacora', { revisadas: 145, diferenciasHistoricas: 11, emparejadasPorId: 145 },
      [relE('DIFERENCIA_HISTORICA', 12, '7', 'MONTO CAJA', 3000, 5000), relE('DIFERENCIA_HISTORICA', 40, '12', 'PUESTO', 'AUXILIAR', 'COORDINADOR')]),
    relHoja('INCREMENTOS', 'bitacora', { revisadas: 9, emparejadasPorId: 9 }),
    relHoja('INSTALACION DE SENSORES', 'cache', { revisadas: 207, diferencias: 1, huerfanos: 2, centinelasOmitidos: 2, emparejadasPorId: 205 },
      [relE('DIFERENCIA', 15, 'AUT0024', 'DEPARTAMENTO', 'POST VENTA', 'TI'),
       relE('HUERFANO', 208, 'JM1BN1V39J1192551', 'SERIE VEHICULO', '', ''), relE('HUERFANO', 171, 'VEH-0000009ZZ1QQ0A', 'ID VEHICULO', 'VEH-0000009ZZ1QQ0A', ''),
       relE('OMITIDO_CENTINELA', 140, 'MOT0002', 'OFICINA / DESARROLLO', 'CONSTRUCCION', 'BAJA VEHICULAR'),
       relE('OMITIDO_CENTINELA', 141, 'CON0618', 'DEPARTAMENTO', '', 'BAJA VEHICULAR')]),
    relHoja('VERIFICACIONES', 'cache', { revisadas: 426, emparejadasPorId: 426 }),
    relHoja('HOLOGRAMAS', 'cache', { revisadas: 255, huerfanos: 3, sinDuenoEsperado: 2, emparejadasPorId: 146 },
      [relMal(6, '_VR3EC9HP2MJ503983'), relMal(9, 'IN4AL3AP6FN318778'), relMal(30, '123456789'),
       relE('SIN_DUENO_ESPERADO', 11, '3G1SF21X58S113728', 'SERIE VEHICULO', '', ''),
       relE('SIN_DUENO_ESPERADO', 12, '3N1CK3CD6GL227863', 'SERIE VEHICULO', '', '')]),
    relHoja('INSPECCION VEHICULAR', 'bitacora', { revisadas: 302, diferenciasHistoricas: 166, emparejadasPorId: 301 },
      [relE('DIFERENCIA_HISTORICA', 22, 'AUT0024', 'DEPARTAMENTO', 'VENTAS', 'TI')]),
    relHoja('INCIDENCIAS', 'bitacora', { revisadas: 1, diferenciasHistoricas: 3, emparejadasPorId: 1 },
      [relE('DIFERENCIA_HISTORICA', 2, 'AUT0010', 'MODELO', '2019', '2020')]),
    relHoja('INSPECCIONES LINEAS', 'bitacora', { revisadas: 1432, diferenciasHistoricas: 6412, huerfanos: 3, emparejadasPorId: 1429 },
      [relE('DIFERENCIA_HISTORICA', 40, '451', 'RESPONSABLE', 'JUAN PEREZ', 'ANA LOPEZ'), relE('HUERFANO', 951, 'EEBA06A3', 'ID LINEA', 'eeba06a3', '')]),
    relHoja('RESPONSIVAS LINEAS', 'bitacora', { revisadas: 743, diferenciasHistoricas: 2200, huerfanos: 4, emparejadasPorId: 739 },
      [relE('DIFERENCIA_HISTORICA', 12, '451', 'PUESTO', 'AUXILIAR', 'COORDINADOR'), relE('HUERFANO', 378, 'EEBA06A3', 'ID LINEA', 'eeba06a3', '')]),
    relHoja('CAMBIOS LINEAS TELEFONICAS', 'bitacora', { revisadas: 33664, diferenciasHistoricas: 140, huerfanos: 114, emparejadasPorId: 33550 },
      [relE('DIFERENCIA_HISTORICA', 2, '451', 'NUCO', '450', '451'), relE('HUERFANO', 2, 'DV1SD13', 'ID_LINEA', 'dv1sd13', '')]),
    relHoja('MOVIMIENTOS_ACCESORIOS', 'bitacora', { revisadas: 228, huerfanos: 3, emparejadasPorId: 224 },
      [relE('HUERFANO', 40, '07F1B94D', 'ID_Accesorio', '', '')]),
    relHoja('VEHICULOS (persona)', 'cache', { revisadas: 653, diferencias: 382, huerfanos: 132, sinDuenoEsperado: 139 },
      [Object.assign(relE('DIFERENCIA', 15, 'AUT0024', 'ID PERSONA', '', 'JUAN MANUEL FULGENCIO HERNANDEZ · HA00241'), { tenia: '' }),
       Object.assign(relE('HUERFANO', 40, 'CTA0101', 'ID PERSONA', 'FERNANDO FUENTES ALMAZAN / JULIO CESAR MACIAS', ''), { motivo: 'trae varias personas en la misma celda' }),
       Object.assign(relE('HUERFANO', 41, 'CTA0102', 'ID PERSONA', 'HECTOR VAZQUEZ FONSECA', ''), { motivo: 'no está en la lista de Capital Humano' }),
       Object.assign(relE('SIN_DUENO_ESPERADO', 50, 'CTA0200', 'ID PERSONA', 'BAJA VEHICULAR', ''), { motivo: 'dice «BAJA VEHICULAR», que no es una persona' })]),
    relHoja('CAJAS CHICAS (persona)', 'cache', { revisadas: 285, diferencias: 282, huerfanos: 3 },
      [relE('DIFERENCIA', 2, '1', 'ID PERSONA', '', 'ANA ISABEL CHI BUENFIL · CIB01347'),
       Object.assign(relE('HUERFANO', 90, '88', 'ID PERSONA', 'PRUEBA PRUEBA PRUEBA', ''), { motivo: 'no está en la lista de Capital Humano' })]),
    relHoja('LINEAS TELEFONICAS (persona)', 'cache', { revisadas: 1615, diferencias: 766, huerfanos: 130, sinDuenoEsperado: 719 },
      [relE('DIFERENCIA', 3, '451', 'ID PERSONA', '', 'MARIA LOPEZ · AC00101'),
       Object.assign(relE('HUERFANO', 9, '460', 'ID PERSONA', 'ANA / LUIS', ''), { motivo: 'trae varias personas en la misma celda' }),
       Object.assign(relE('SIN_DUENO_ESPERADO', 12, '470', 'ID PERSONA', 'DS0054', ''), { motivo: 'dice «DS0054», que no es una persona' })]),
    relHoja('VEHICULOS', 'cache', { revisadas: 648, diferencias: 4, clavesDuplicadasOmitidas: 1, emparejadasPorId: 208 },
      [relE('DIFERENCIA', 30, 'AUT0029', 'SERIE SENSOR', 'G90EU60FC9P2', ''), relE('DIFERENCIA', 30, 'AUT0029', 'SENSOR', 'SI TIENE SENSOR', 'NO TIENE SENSOR'),
       relE('DIFERENCIA', 296, 'CTA0295', 'SERIE SENSOR', 'G95Z0ZTP77A1', ''), relE('DIFERENCIA', 410, 'CTA0350', 'SENSOR', 'CANCELADO', 'NO TIENE SENSOR'),
       relE('CLAVE_DUPLICADA_EN_ORIGEN', 25, 'AUT0025', 'ID', '', '')]),
  ];

  // ---------- Listas de los módulos (suficientes filas para ver la tabla y las tarjetas llenas) ----------
  const filas = (n, f) => Array.from({ length: n }, (_, i) => f(i));
  const de = (lista, i) => lista[i % lista.length];
  const PERSONAS = ['JUAN MANUEL FULGENCIO HERNANDEZ', 'ANA ISABEL CHI BUENFIL', 'JORGE LUIS AVECILLA', 'MOISÉS MALDONADO RUIZ', 'MARÍA FERNANDA LÓPEZ'];
  const DEPTOS = ['TI', 'POST VENTA', 'CONSTRUCCIÓN', 'COMERCIAL', 'ADMINISTRACIÓN'];
  const SEDES = ['QUERETARO', 'LEON', 'SAN LUIS POTOSI', 'MERIDA'];
  const VEHICULOS = filas(14, (i) => ({
    ID_VEHICULO: 'VEH-' + (i + 1), FOLIO: 'AUT' + String(24 + i).padStart(4, '0'), NUCCO: String(24 + i),
    DEPARTAMENTO: de(DEPTOS, i), CLASE: de(['AUTOMOVIL', 'CAMIONETA', 'CAMION', 'MOTOCARRO'], i),
    MARCA: de(['CHEVROLET', 'NISSAN', 'MITSUBISHI', 'RAM', 'HONDA'], i), LINEA_VEHICULO: de(['BEAT', 'NP300', 'L200', '700', '150XR'], i),
    MODELO: 2017 + (i % 8), PLACA: 'GG' + String.fromCharCode(65 + i) + (880 + i) + 'F', ESTATUS: de(['UTILITARIO', 'UTILITARIO', 'PERSONAL', 'BAJA VEHICULAR'], i),
    NO_ECONOMICO: 'E-' + (100 + i), COLOR: de(['BLANCO', 'GRIS', 'ROJO'], i), SEDE: de(SEDES, i), FECHA_REGISTRO: hace(30 * i + 3),
  }));
  const LISTAS = {
    apiListarVehiculosResumen: JSON.stringify(VEHICULOS),
    apiListarIncidencias: filas(9, (i) => ({
      ID: 'INC-' + (i + 1), FECHA_REGISTRO: hace(4 * i + 1), FOLIO: VEHICULOS[i].FOLIO, DEPARTAMENTO: de(DEPTOS, i),
      ESTADO: de(['ABIERTA', 'EN TALLER', 'CERRADA'], i), MODELO: VEHICULOS[i].MODELO, ANIO: VEHICULOS[i].MODELO, KILOMETRAJE: 48000 + i * 3100,
      TICKET: 'TK-' + (900 + i), DESCRIPCION_TRABAJO: de(['Cambio de balatas delanteras', 'Afinación mayor y cambio de aceite', 'Revisión de suspensión'], i),
      MECANICO: de(['TALLER LÓPEZ', 'AGENCIA NISSAN'], i), SEGURO_AUTO: 'VIGENTE',
    })),
    apiListarCambiosVehiculos: JSON.stringify(filas(10, (i) => ({
      ID: 'CV-' + (i + 1), FECHA: hace(2 * i + 1), FOLIO: VEHICULOS[i].FOLIO, CAMPO: de(['RESPONSABLE VEHICULO', 'DEPARTAMENTO', 'ESTATUS', 'PLACA'], i),
      ANTES: de(PERSONAS, i), DESPUES: de(PERSONAS, i + 1), ACTUALIZADO_POR: 'prueba@ciudadmaderas.com',
    }))),
    apiListarReasignacionesVehiculares: filas(8, (i) => ({
      ID: 'RV-' + (i + 1), FECHA: hace(6 * i + 2), FOLIO_VEHICULO: VEHICULOS[i].FOLIO, NUCO: VEHICULOS[i].NUCCO,
      RESPONSABLE_SALIENTE: de(PERSONAS, i), DEPARTAMENTO_SALIENTE: de(DEPTOS, i),
      RESPONSABLE_ENTRANTE: de(PERSONAS, i + 2), DEPARTAMENTO_ENTRANTE: de(DEPTOS, i + 1), QUIEN_REGISTRO: 'AYRTON SEPULVEDA',
    })),
    apiListarUberResumen: filas(9, (i) => ({
      ID: 'UB-' + (i + 1), NOMBRE_COMPLETO: de(PERSONAS, i), RAZON_SOCIAL: 'CIUDAD MADERAS', ROL: de(['USUARIO', 'ADMINISTRADOR'], i),
      DEPARTAMENTO: de(DEPTOS, i), PUESTO: de(['COORDINADOR', 'AUXILIAR', 'GERENTE'], i), ESTATUS: de(['ACTIVO', 'ACTIVO', 'BAJA'], i),
      'CORREO ELECTRONICO': 'persona' + i + '@ciudadmaderas.com', 'NUMERO TELEFONO': '442 555 01' + String(i).padStart(2, '0'), SEDE: de(SEDES, i),
    })),
    apiListarTicketsResumen: filas(9, (i) => ({
      ID: 'TK-' + (i + 1), TICKET: 'TK-' + (900 + i), FECHA: hace(3 * i + 1), DEPARTAMENTO: de(DEPTOS, i), SOLICITANTE: de(PERSONAS, i),
      'TIPO ATENCION': de(['VIAJE PROGRAMADO', 'URGENTE'], i), 'QUIEN ATENDIO': 'AYRTON SEPULVEDA',
    })),
    apiListarCajasChicasResumen: filas(10, (i) => ({
      ID: String(i + 1), 'ID CCH': String(i + 1), ESTATUS: de(['VIGENTE', 'VIGENTE', 'EN PROCESO DE CIERRE', 'CERRADA'], i),
      RESPONSABLE: de(PERSONAS, i), 'RESPONSABLE DE CAJA CHICA': de(PERSONAS, i), DEPARTAMENTO: de(DEPTOS, i), OFICINA: de(['CORPORATIVO', 'DESARROLLO NORTE'], i),
      SEDE: de(SEDES, i), 'MONTO ACTUAL': 3000 + 1000 * (i % 4), 'EMPRESA ORIGEN': 'CIUDAD MADERAS', 'FECHA DE APERTURA': hace(60 * i + 10),
    })),
    apiListarCambiosMontoCCH: filas(6, (i) => ({
      ID: 'CM-' + (i + 1), FECHA: hace(9 * i + 1), ID_CCH: String(i + 1), RESPONSABLE: de(PERSONAS, i), TIPO: de(['INCREMENTO', 'DECREMENTO'], i),
      CANTIDAD: 500 * (i + 1), CANTIDAD_ANTERIOR: 3000, CANTIDAD_ACTUALIZADA: 3000 + 500 * (i + 1), QUIEN_REALIZO: 'AYRTON SEPULVEDA',
    })),
    apiListarArqueosResumen: filas(10, (i) => ({
      ID: 'ARQ-' + (145 - i), ID_CCH: String(i + 1), RESPONSABLE: de(PERSONAS, i), TIPO_ARQUEO: de(['ORDINARIO', 'SORPRESA'], i),
      FECHA_INICIO: hace(7 * i + 1), TOTAL_GENERAL: 2900 + i * 37, DIFERENCIA: de([0, 0, -120, 35], i), CALIFICACION: de([100, 95, 80], i),
      ESTADO_PDF: de(['LISTO', 'PENDIENTE'], i),
    })),
    apiResumenInicio: JSON.stringify({
      vehiculos: { activos: 512, baja: 41, total: 653 },
      ticketsIncidencias: { incidenciasAbiertas: 7, incidenciasTotal: 63, ticketsRecientes: 18 },
      cajasChicas: { vigentes: 214, enProcesoCierre: 9, total: 285 },
      alertas: { verificaciones: { vencidas: 12, porVencer: 30, total: 426 }, inspecciones: { atrasadas: 22, total: 302 } },
      actividad: filas(6, (i) => ({ icono: de(['car', 'wallet', 'ticket'], i), tipo: de(['Vehículo actualizado', 'Arqueo registrado', 'Ticket nuevo'], i), texto: VEHICULOS[i].FOLIO + ' · ' + de(PERSONAS, i), fecha: hace(i * 0.3) })),
    }),
  };

  // ---------- Fichas (Vehículo, Caja Chica): lo que piden al abrir un registro ----------
  const CAJA = Object.assign({}, LISTAS.apiListarCajasChicasResumen[0], {
    'PUESTO DE RESPONSABLE': 'COORDINADOR', 'JEFE INMEDIATO DEL REPSONSABLE': PERSONAS[3], 'ADMINISTRADA POR': 'CONTROL INTERNO',
    'CAPTURISTA DE CAJA CHICA': PERSONAS[1], 'METODO DE REEMBOLSO': 'TRANSFERENCIA', 'CORREO ELECTRONICO DE RESPONSABLE': 'persona0@ciudadmaderas.com',
    'TELEFONO DE RESPONSABLE': '442 555 0100', OBSERVACIONES: 'Sin observaciones',
  });
  const FICHAS = {
    apiBuscarCajaChicaPorId: CAJA,
    apiArqueosPorIdCch: JSON.stringify(LISTAS.apiListarArqueosResumen.slice(0, 3)),
    apiCambiosMontoPorIdCch: JSON.stringify(LISTAS.apiListarCambiosMontoCCH.slice(0, 2)),
    // Cada una regresa JSON.stringify (ver abrirFichaVehiculo en app.html)
    apiListarCambiosVehiculosPorFolio: JSON.stringify(JSON.parse(LISTAS.apiListarCambiosVehiculos).slice(0, 3)),
    apiListarReasignacionesVehicularesPorFolio: LISTAS.apiListarReasignacionesVehiculares.slice(0, 2),
    apiVerificacionesPorFolio: '[]', apiInspeccionesPorFolio: '[]', apiSensoresPorFolio: '[]', apiHologramasPorFolio: '[]',
    apiIncidenciasPorFolio: JSON.stringify(LISTAS.apiListarIncidencias.slice(0, 2)),
  };

  // ---------- Usuarios y permisos (app-permisos.html: cargar(respuesta)) ----------
  const AREAS = ['TI', 'CONTROL INTERNO', 'POST VENTA'];
  const PERMISOS_PANEL = {
    grupos,
    areas: AREAS.map((nombre) => ({ nombre })),
    personas: PERSONAS.concat(['ROBERTO SÁNCHEZ', 'LUCÍA HERNÁNDEZ']).map((nombre, i) => ({
      correo: 'persona' + i + '@ciudadmaderas.com', nombre, area: de(AREAS, i), rol: de(['USER', 'USER', 'VIEWER', 'ADMIN'], i),
      activo: i !== 4, coordinacion: 'OPERACIONES', oficina: 'CORPORATIVO', sede: de(SEDES, i), noEmpleado: 'CI0' + (100 + i),
    })),
    reglas: [
      { quien: 'TI', modulo: 'vehiculos', permiso: 'EDICION' }, { quien: 'TI', modulo: 'verificaciones', permiso: 'LECTURA' },
      { quien: 'CONTROL INTERNO', modulo: 'arqueos', permiso: 'EDICION' }, { quien: 'CONTROL INTERNO', modulo: 'caja-chica', permiso: 'EDICION' },
      { quien: 'persona1@ciudadmaderas.com', modulo: 'hologramas', permiso: 'EDICION' },
    ],
  };

  const respuestas = {
    ...LISTAS,
    ...FICHAS,
    apiPermisosPanel: PERMISOS_PANEL,
    apiRelacionesMapa: JSON.stringify(REL_MAPA),
    apiSaludRevisar: JSON.stringify({ mapa: REL_MAPA, reporte: REL_REVISION }),
    apiMisPermisos: { correo: 'prueba@ciudadmaderas.com', permisos, grupos },
    apiListarVehiculosBasico: [{ FOLIO: 'AUT0024', NUCO: '24', PLACA: 'GGY886F', MARCA: 'CHEVROLET', LINEA_VEHICULO: 'BEAT' },
      { FOLIO: 'AUT0100', NUCO: '100', PLACA: 'ABC123A', MARCA: 'MITSUBISHI', LINEA_VEHICULO: 'L200' }],
    apiBuscarVehiculoPorFolio: VEHICULO,
    apiListarInspecciones: [
      { ID: '2026_24_292', FOLIO: 'AUT0024', TIPO: 'RIFTER', FECHA: hace(1), PLACAS: 'GGY886F', PUNTAJE: 96.3, RESPONSABLE: 'JUAN MANUEL FULGENCIO', INSPECTOR: 'AYRTON SEPULVEDA', PDF: 'x.pdf' },
      { ID: '2026_25_291', FOLIO: 'AUT0025', TIPO: 'HONDA 150XR', FECHA: hace(3), PLACAS: 'GGR658F', PUNTAJE: 84.5, RESPONSABLE: 'JORGE LUIS AVECILLA', INSPECTOR: 'AYRTON SEPULVEDA', PDF: '' },
      { ID: '2026_30_290', FOLIO: 'AUT0030', TIPO: 'L200', FECHA: hace(40), PLACAS: 'UNK093H', PUNTAJE: 71, RESPONSABLE: 'MOISÉS MALDONADO', INSPECTOR: 'J. ENRIQUE MORA', PDF: 'x.pdf' },
    ],
    // Un folio AUT… solo ofrece KWID y AUTOS (TIPOS_POR_PREFIJO_FOLIO en modulos/inspecciones.html)
    apiTiposInspeccion: [{ tipo: 'AUTOS', listo: true }, { tipo: 'KWID', listo: true }, { tipo: 'L200', listo: true }, { tipo: 'PIPA', listo: true }],
    apiEstructuraInspeccion: {
      tipo: 'BEAT', carpeta: 'INSPECCIONES BEAT',
      secciones: [
        seccion('Documentación', 5, ['GAFETTE', 'TARJETA DE CIRCULACION', 'LICENCIA'], ['PRESENTA', 'NO PRESENTA', 'N/A']),
        seccion('Cristalería', 10, ['PARABRISAS', 'MEDALLON', 'CRISTALES PUERTAS']),
        seccion('Neumáticos', 15, ['RINES', 'TAPONES']),
        seccion('Interiores', 5, ['ASIENTO DE CONDUCTOR', 'TABLERO']),
        seccion('Latonería y pintura', 5, ['COFRE', 'PUERTA PILOTO']),
        seccion('Sistema mecánico', 15, ['FRENOS DELANTEROS', 'FRENOS TRASEROS']),
        seccion('Niveles', 10, ['ACEITE DE MOTOR']),
        seccion('Batería', 5, ['TERMINALES CON SARRO', 'BATERIA INFLADA'], ['SI', 'NO']),
      ],
      llantas: [{ campo: 'LLANTA DD', etiqueta: 'Delantera derecha' }, { campo: 'LLANTA DI', etiqueta: 'Delantera izquierda' }],
      diagramas: [
        { campo: 'INS FRONTAL', etiqueta: 'Frontal', ruta: 'MODELOS INSPECCION/BEAT/FRONTAL.png' },
        { campo: 'INS TRASERA', etiqueta: 'Trasera', ruta: 'MODELOS INSPECCION/BEAT/TRASERA.png' },
      ],
      piezas: 17,
    },
    apiDetalleInspeccion: {
      ID: '2026_24_292', FOLIO: 'AUT0024', PUNTAJE: 84.5, piezasRevisadas: 95,
      conProblema: [{ pieza: 'COFRE', estado: 'REGULAR' }, { pieza: 'FRENOS TRASEROS', estado: 'MALO' }],
      llantas: [{ campo: 'LLANTA DD', etiqueta: 'Delantera derecha', valor: 4 }, { campo: 'LLANTA DI', etiqueta: 'Delantera izquierda', valor: 5 }],
      puntuaciones: [{ campo: 'P1', etiqueta: 'Documentación', valor: 5 }, { campo: 'P2', etiqueta: 'Cristalería', valor: 10 }, { campo: 'P3', etiqueta: 'Neumáticos', valor: 11.25 }],
      imagenes: [{ campo: 'INS FRONTAL', etiqueta: 'Frontal', valor: 'MODELOS INSPECCION/BEAT/FRONTAL.png' }, { campo: 'FIRMA INSPECTOR', etiqueta: 'Firma del inspector', valor: 'x.png' }],
      checklist: [], 
    },
    apiPrevisualizarImagenInspeccion: { base64: DIBUJO, mimeType: 'image/png' },
    apiListarVerificaciones: [
      { ID: 'v1', FOLIO: 'AUT0024', PLACA: 'GGY886F', PERIODO: '2DO SEMESTRE 2026', FECHA: hace(10), ESTATUS: 'VERIFICADO' },
      { ID: 'v2', FOLIO: 'AUT0025', PLACA: 'GGR658F', PERIODO: '2DO SEMESTRE 2026', FECHA: hace(2), ESTATUS: 'PENDIENTE' },
    ],
    apiListarSensores: [
      { ID: 's1', FOLIO: 'AUT0024', PLACA: 'GGY886F', SERIE_SENSOR: 'G9HT5CEWRJV7', ESTATUS: 'ACTIVO', FECHA_INSTALACION: hace(30) },
    ],
    apiEstadoEnVivoSensores: { disponible: false, estados: {} },
    apiDatosVehiculoParaSensor: {
      copiados: { PLACA: 'GGY886F', MARCA: 'CHEVROLET', 'LINEA VEHICULO': 'BEAT', MODELO: 2019, DEPARTAMENTO: 'TI', RESPONSABLE: 'JUAN MANUEL FULGENCIO' },
      combustibles: ['MAGNA', 'PREMIUM'], sensoresActivos: [], estatusVehiculo: 'UTILITARIO', serieSensorSugerida: '',
    },
    apiListarHologramas: [
      { ID: 'h1', FOLIO: 'AUT0024', PLACA: 'GGY886F', PROVEEDOR: 'EDENRED', ESTATUS_EOX: 'HABILITADO', FECHA: hace(5) },
    ],
    apiCatalogosHologramas: {
      proveedores: ['EOX', 'EDENRED', 'N/A'], estatusEox: ['HABILITADO', 'DESHABILITADO'], combustibles: ['MAGNA', 'PREMIUM', 'DIESEL'],
      estatusVehiculo: ['UTILITARIO', 'PERSONAL'], razonesSociales: ['CIUDAD MADERAS', 'OTRA'],
    },
    apiDatosVehiculoParaHolograma: {
      PLACA: 'GGY886F', MARCA: 'CHEVROLET', LINEA: 'BEAT', MODELO: 2019, RESPONSABLE: 'JUAN MANUEL FULGENCIO',
      DEPARTAMENTO: 'TI', SERIE_VEHICULO: 'MA6CA6CD4KT046623', CAPACIDAD: 35, RAZON_SOCIAL: 'CIUDAD MADERAS',
      estatusVehiculoCatalogo: 'UTILITARIO', tipoCombustibleVehiculo: 'MAGNA',
    },
  };

  // ---------- google.script.run de mentira ----------
  function corredor() {
    let exito = () => {};
    let falla = () => {};
    const api = new Proxy({}, {
      get(_, nombre) {
        if (nombre === 'withSuccessHandler') return (f) => { exito = f; return api; };
        if (nombre === 'withFailureHandler') return (f) => { falla = f; return api; };
        return () => {
          const r = respuestas[nombre];
          setTimeout(() => (r === undefined ? exito(/^apiListar/.test(nombre) ? [] : null) : exito(JSON.parse(JSON.stringify(r)))), 120);
        };
      },
    });
    return api;
  }
  window.google = { script: { get run() { return corredor(); } } };

  // ---------- escenas: #escena=<nombre> ----------
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  const $ = (s) => document.querySelector(s);
  const evento = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles: true }));
  async function hasta(selector, max) {
    for (let t = 0; t < (max || 60); t++) { const el = $(selector); if (el) return el; await esperar(100); }
    throw new Error('No apareció ' + selector);
  }
  async function abrir(modulo, pestana) {
    await hasta('.nav-subitem');
    navegarA(modulo);
    await esperar(900);
    if (pestana) { (await hasta(`.tab-btn[data-tab="${pestana}"]`)).click(); await esperar(600); }
  }
  /** La pantalla Datos conectados recuerda la vista; cada escena dice cuál quiere. */
  async function vistaSalud(tecnica) {
    const t = await hasta('#salud-tecnico-toggle');
    if (t.checked !== tecnica) { t.checked = tecnica; evento(t, 'change'); }
    await esperar(300);
  }
  async function vistaRelaciones(tecnica) {
    const t = await hasta('#rel-tecnico-toggle');
    if (t.checked !== tecnica) { t.checked = tecnica; evento(t, 'change'); }
    await esperar(300);
  }
  async function elegirVehiculo(selector, valor) {
    const campo = await hasta(selector);
    campo.value = valor || 'AUT0024';
    evento(campo, 'input');
    evento(campo, 'change');
    evento(campo, 'blur');
    await esperar(800);
  }
  /** Nueva inspección con vehículo y tipo elegidos: sin tipo de unidad el paso 1 no deja avanzar */
  async function iniciarInspeccion() {
    await abrir('inspeccion-vehicular', 'nueva');
    await elegirVehiculo('#ins-folio');
    const tipo = await hasta('#ins-tipo option[value="AUTOS"]').then(() => $('#ins-tipo'));
    if (!tipo.value) { tipo.value = 'AUTOS'; evento(tipo, 'change'); await esperar(800); }
  }
  /** Abre la primera fila de la tabla (las tablas estilo Drive ya no traen botón "Ver": doble clic) */
  async function abrirPrimeraFila() {
    const fila = await hasta('.dt tbody tr[data-id]');
    fila.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await esperar(900);
  }
  const firmar = (canvas) => {
    const r = canvas.getBoundingClientRect();
    const p = (tipo, x, y) => canvas.dispatchEvent(new PointerEvent(tipo, { clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    p('pointerdown', 60, 120);
    [[90, 100], [130, 130], [170, 90], [210, 120], [260, 110], [320, 125]].forEach(([x, y]) => p('pointermove', x, y));
    p('pointerup', 320, 125);
  };

  const ESCENAS = {
    'relaciones': async () => { await abrir('relaciones'); await vistaRelaciones(false); await hasta('.rel-s-tabla'); await esperar(300); },
    'relaciones-lineas': async () => { await abrir('relaciones'); await vistaRelaciones(false); (await hasta('.tab-btn[data-tab="familia-1"]')).click(); await esperar(400); },
    'relaciones-mapa': async () => { await abrir('relaciones'); await vistaRelaciones(true); await hasta('.rel-matriz'); await esperar(300); },
    'salud': async () => { await abrir('salud'); await vistaSalud(false); await hasta('.rel-s-pend'); await esperar(300); },
    'salud-lineas': async () => { await abrir('salud'); await vistaSalud(false); (await hasta('#salud-tabs .tab-btn[data-tab="familia-1"]')).click(); await esperar(400); },
    'salud-detalle-seleccion': async () => { await abrir('salud'); await vistaSalud(false); (await hasta('[data-s-ver]')).click(); await esperar(700); const cajas = document.querySelectorAll('#salud-tabla tbody input[type="checkbox"]'); if (cajas[0]) cajas[0].click(); await esperar(400); },
    'salud-tecnica': async () => { await abrir('salud'); await vistaSalud(true); await hasta('.rel-tarjeta'); await esperar(300); },
    'salud-capital': async () => { await abrir('salud'); await vistaSalud(false); const b = [...document.querySelectorAll('#salud-tabs .tab-btn')].find((x) => /Capital/.test(x.textContent)); b.click(); await esperar(500); },
    'relaciones-capital': async () => { await abrir('relaciones'); await vistaRelaciones(false); const b = [...document.querySelectorAll('#rel-s-tabs .tab-btn')].find((x) => /Capital/.test(x.textContent)); b.click(); await esperar(400); },
    'inspecciones-detalle': async () => { await abrir('inspeccion-vehicular'); await abrirPrimeraFila(); },
    'sensores-detalle': async () => { await abrir('instalacion-sensores'); await abrirPrimeraFila(); },
    'hologramas-detalle': async () => { await abrir('hologramas'); await abrirPrimeraFila(); },
    'verificaciones-detalle': async () => { await abrir('verificaciones'); await abrirPrimeraFila(); },
    // El botón de menú solo se ve en pantalla angosta (shell-movil.html): capturar con --ancho=390 o --matriz
    'menu-abierto': async () => { await abrir('inspeccion-vehicular'); (await hasta('.shell-menu-btn')).click(); await esperar(400); },
    // ---- Módulos de la base (Inicio, Vehículos, Caja Chica, Uber, Administración) ----
    'inicio': async () => { await abrir('dashboard'); await hasta('#dash-actividad .historial-item'); await esperar(300); },
    'vehiculos': () => abrir('vehiculos'),
    'vehiculos-ficha': async () => { await abrir('vehiculos'); await abrirPrimeraFila(); },
    'panorama-vehiculos': async () => { await abrir('panorama-vehiculos'); await esperar(700); },
    'incidencias': () => abrir('incidencias'),
    'incidencias-detalle': async () => { await abrir('incidencias'); await abrirPrimeraFila(); },
    'cambios-vehiculos': () => abrir('cambios-vehiculos'),
    'reasignaciones': () => abrir('reasignaciones-vehiculares'),
    'uber': () => abrir('uber'),
    'uber-detalle': async () => { await abrir('uber'); await abrirPrimeraFila(); },
    'tickets': () => abrir('tickets'),
    'caja-chica': () => abrir('caja-chica'),
    'caja-chica-ficha': async () => { await abrir('caja-chica'); await abrirPrimeraFila(); },
    'panorama-cajachica': async () => { await abrir('panorama-cajachica'); await esperar(700); },
    'cambios-monto': () => abrir('cambios-monto-cch'),
    'arqueos': () => abrir('arqueos'),
    'arqueos-detalle': async () => { await abrir('arqueos'); await abrirPrimeraFila(); },
    'sistemas': () => abrir('sistemas-vehiculos'),
    'usuarios': async () => { await abrir('usuarios'); await hasta('.dt tbody tr[data-id]'); },
    'usuarios-ficha': async () => { await abrir('usuarios'); await abrirPrimeraFila(); },
    // ---- Formularios de alta (rejilla de campos .form-rejilla y componente Formulario) ----
    'vehiculos-registrar': () => abrir('vehiculos', 'registrar'),
    'incidencias-registrar': () => abrir('incidencias', 'registrar'),
    'uber-registrar': () => abrir('uber', 'registrar'),
    'caja-chica-registrar': () => abrir('caja-chica', 'registrar'),
    'arqueos-registrar': () => abrir('arqueos', 'registrar'),
    // ---- Ventanas (styles.html, sección Modal): chica = hoja abajo en celular; ancha = pantalla completa ----
    'modal-confirmar': async () => {
      await abrir('vehiculos');
      Confirmar.pedir({ titulo: '¿Eliminar 3 vehículos?', mensaje: 'Esta acción no se puede deshacer.', detalle: ['AUT0024', 'AUT0025', 'AUT0026'], textoConfirmar: 'Eliminar', peligro: true, palabraClave: 'ELIMINAR' });
      await esperar(400);
    },
    // Los dos avisos del sistema: el de la app (arriba) y el de Notificar (abajo)
    'avisos': async () => {
      await abrir('vehiculos');
      toastExito('Actualizado exitosamente');
      Notificar.info('Se copiaron 3 registros: pégalos en Excel');
      await esperar(500);
    },
    'modal-editar-vehiculo': async () => {
      await abrir('vehiculos');
      // Se abre igual que el ⋮ → Editar, pero sin depender del menú de la fila
      (await hasta('#modal-editar-vehiculo')).hidden = false;
      await esperar(400);
    },
    'verificaciones': () => abrir('verificaciones'),
    'verificaciones-form': async () => { await abrir('verificaciones', 'nuevo'); await elegirVehiculo('#ver-form #f-FOLIO'); },
    // Por Nucco (buscar.nucco): escribir el Nucco llena el folio y trae la ficha
    'verificaciones-nucco': async () => { await abrir('verificaciones', 'nuevo'); await elegirVehiculo('#ver-form [data-nucco-de] input', '24'); await esperar(500); },
    'inspecciones-nucco': async () => { await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-nucco', '24'); },
    'sensores': () => abrir('instalacion-sensores'),
    'sensores-form': async () => { await abrir('instalacion-sensores', 'nuevo'); await elegirVehiculo('#sen-form #f-FOLIO'); },
    'hologramas': () => abrir('hologramas'),
    'hologramas-form': async () => { await abrir('hologramas', 'nuevo'); },
    'inspecciones': () => abrir('inspeccion-vehicular'),
    'inspecciones-form': async () => { await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-folio'); },
    'inspecciones-checklist': async () => {
      await iniciarInspeccion();
      $('#ins-siguiente').click(); await esperar(500);
    },
    'inspecciones-danos': async () => {
      await iniciarInspeccion();
      for (let i = 0; i < 5; i++) { $('#ins-siguiente').click(); await esperar(300); }
    },
    'inspecciones-firmas': async () => {
      await iniciarInspeccion();
      // Avanza hasta el paso de firmas (cuántos pasos hay depende del tipo de unidad)
      for (let i = 0; i < 12 && !$('[data-firma="FIRMA INSPECTOR"] canvas'); i++) { $('#ins-siguiente').click(); await esperar(300); }
      await esperar(300);
      firmar(await hasta('[data-firma="FIRMA INSPECTOR"] canvas'));
      const f = $('.ins-firmas'); if (f) f.scrollIntoView({ block: 'end' });
    },
  };

  window.addEventListener('load', async () => {
    const m = /escena=([\w-]+)/.exec(location.hash);
    if (!m || !ESCENAS[m[1]]) return;
    try { await ESCENAS[m[1]](); } catch (err) { console.error('Escena:', err); }
    document.title = 'LISTO';
  });
  window.__ESCENAS = Object.keys(ESCENAS);
})();
