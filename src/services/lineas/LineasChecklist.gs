/**
 * LineasChecklist.gs
 * Checklist de INSPECCIONES LINEAS, réplica exacta del AppSheet (v1.001924):
 * mismo orden del formulario (INSPECCIONES LINEAS_Form), mismos títulos de sección,
 * mismas etiquetas (nombre de columna o su "display name"), mismas opciones en el
 * mismo orden, y los Show_If / Required_If evaluados sobre el texto de [TIPO].
 *
 * Cada punto: [columna, clave interna, etiqueta del AppSheet, escala, mostrar, requerido]
 * `mostrar` y `requerido` son códigos de CONDICIONES (abajo); un punto oculto no se
 * pide aunque sea obligatorio (así se comporta AppSheet).
 */

const LineasChecklist = (function () {
  const ESCALAS = {
    SI_NO: { valores: ['SI', 'NO', 'N/A'] },
    CALIDAD: { valores: ['BUENO', 'REGULAR', 'MALO'] },
    APP: { valores: ['INSTALADA', 'NO INSTALADA'] },
  };

  /** Condiciones del AppSheet sobre [TIPO] (texto tal cual de LINEAS TELEFONICAS). */
  const CONDICIONES = {
    SIEMPRE: () => true,
    NUNCA: () => false,
    NO_LINEA: (t) => t !== 'LINEA',                                               // NOT([TIPO]="LINEA")
    NO_EQUIPO: (t) => t !== 'EQUIPO',                                             // NOT([TIPO]="EQUIPO")
    EQUIPOS: (t) => t === 'EQUIPO + SIM' || t === 'EQUIPO',                       // OR([TIPO]="EQUIPO + SIM",[TIPO]="EQUIPO")
    VOZ: (t) => t === 'EQUIPO + SIM' || t === 'LINEA',                            // OR([TIPO]="EQUIPO + SIM",[TIPO]="LINEA")
    BATERIA: (t) => ['EQUIPO + SIM', 'EQUIPO', 'BANDA ANCHA'].indexOf(t) >= 0,
    EQUIPOS_Y_MODEMS: (t) => ['EQUIPO + SIM', 'EQUIPO', 'MODEM', 'BANDA ANCHA'].indexOf(t) >= 0,
    MODEM: (t) => t.indexOf('MODEM') >= 0 || t.indexOf('BANDA ANCHA') >= 0,       // CONTAINS([TIPO],"MODEM") o "BANDA ANCHA"
    MODEM_Y_BANDA: (t) => t.indexOf('MODEM') >= 0 && t.indexOf('BANDA ANCHA') >= 0,
  };

  function cumple(codigo, tipo) {
    const f = CONDICIONES[codigo];
    return !!f && f(String(tipo || '').trim().toUpperCase());
  }

  // Orden y títulos del formulario del AppSheet (TITULO_* son encabezados de página).
  const SECCIONES = [
    { seccion: 'DOCUMENTACIÓN / ACCESORIOS', puntos: [
      ['IDENTIFICACION', 'identificacion', 'IDENTIFICACION', 'SI_NO', 'SIEMPRE', 'SIEMPRE'],
      ['CUBO', 'cubo', 'CUBO', 'SI_NO', 'NO_LINEA', 'SIEMPRE'],
      ['CABLE', 'cable', 'CABLE', 'SI_NO', 'NO_LINEA', 'SIEMPRE'],
      ['FUNDA', 'funda', 'FUNDA', 'SI_NO', 'EQUIPOS', 'SIEMPRE'],
      ['MICA', 'mica', 'MICA', 'SI_NO', 'EQUIPOS', 'SIEMPRE'],
      // CUBO 2 / CABLE 2 dependen de [CUBO]/[CABLE] = "PRESENTA", valor que no existe: nunca se muestran
      ['CUBO 2', 'cubo2', 'CUBO 2', 'SI_NO', 'NUNCA', 'NUNCA'],
      ['CABLE 2', 'cable2', 'CABLE 2', 'SI_NO', 'NUNCA', 'NUNCA'],
    ] },
    { seccion: 'SISTEMA', puntos: [
      ['SO', 'sistemaOperativo', 'SISTEMA OPERATIVO', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['ACTUALIZACIONES', 'actualizaciones', 'ACTUALIZACIONES', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['PANTALLA TACTIL', 'pantallaTactil', 'PANTALLA TACTIL', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['MULTITAREA', 'multitarea', 'MULTITAREA', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
    ] },
    { seccion: 'CONECTIVIDAD', puntos: [
      ['WIFI', 'wifi', 'WIFI', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['RED MOVIL', 'redMovil', 'RED MOVIL', 'SI_NO', 'NO_EQUIPO', 'NO_EQUIPO'],
      ['GPS', 'gps', 'GPS', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['USO DATOS', 'usoDatos', 'USO DATOS', 'SI_NO', 'NO_EQUIPO', 'NO_EQUIPO'],
    ] },
    { seccion: 'ESTADO FÍSICO GENERAL', puntos: [
      ['PANTALLA', 'pantalla', 'PANTALLA', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['BOTONES VOLUMEN', 'botonesVolumen', 'BOTONES VOLUMEN', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['BOTON ENCENDIDO', 'botonEncendido', 'BOTON ENCENDIDO', 'SI_NO', 'NO_LINEA', 'NO_LINEA'],
      ['CUERPO EQUIPO', 'cuerpoEquipo', 'CUERPO EQUIPO', 'SI_NO', 'NO_LINEA', 'NO_LINEA'],
      ['CAMARA', 'camara', 'CAMARA', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['PUERTO CARGA', 'puertoCarga', 'PUERTO CARGA', 'SI_NO', 'NO_LINEA', 'NO_LINEA'],
      ['ALTAVOZ', 'altavoz', 'ALTAVOZ', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['BOCINAS', 'bocinas', 'BOCINAS', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['MICROFONO', 'microfono', 'MICROFONO', 'SI_NO', 'EQUIPOS', 'EQUIPOS'],
      ['LINEA DE VOZ', 'lineaVoz', 'LINEA DE VOZ', 'SI_NO', 'VOZ', 'VOZ'],
    ] },
    { seccion: 'DESEMPEÑO', puntos: [
      ['DURACION BATERIA', 'duracionBateria', 'DURACION BATERIA', 'CALIDAD', 'BATERIA', 'BATERIA'],
      ['TEMPERATURA', 'temperatura', 'TEMPERATURA', 'CALIDAD', 'EQUIPOS_Y_MODEMS', 'NO_LINEA'],
      ['DESEMPEÑO', 'desempeno', 'DESEMPEÑO', 'CALIDAD', 'EQUIPOS_Y_MODEMS', 'NO_LINEA'],
    ] },
    { seccion: 'APPS INSTALADAS', puntos: [
      ['WHATSAPP', 'appWhatsapp', 'WHATSAPP', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['E COMMERCE', 'appEnlaceWindows', 'ENLACE A WINDOWS', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['MOVILIDAD / DELIVERY', 'appUber', 'UBER', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['TIKTOK', 'appWaze', 'WAZE', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['NETFLIX', 'appEscanerDocumentos', 'LECTOR/ESCANER DE DOCUMENTOS', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['MUSICA', 'appLectorQr', 'LECTOR DE CODIGO QR', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['GMAIL', 'appGoogle', 'APPS DE GOOGLE (GMAIL, DRIVE, ENTRE OTRAS)', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['YOUTUBE', 'appYoutube', 'YOUTUBE', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['JUEGOS', 'appTimestamp', 'TIMESTAMP', 'APP', 'EQUIPOS', 'EQUIPOS'],
      ['TIMEMARK', 'appTimemark', 'TIMEMARK', 'APP', 'EQUIPOS', 'EQUIPOS'],
    ] },
  ];

  const aPunto_ = (p, seccion) => ({ columna: p[0], clave: p[1], etiqueta: p[2], escala: p[3], mostrar: p[4], requerido: p[5], seccion: seccion });

  /** Lista plana en el orden del formulario. */
  function puntos() {
    const lista = [];
    SECCIONES.forEach((s) => s.puntos.forEach((p) => lista.push(aPunto_(p, s.seccion))));
    return lista;
  }

  /** Secciones completas (para mostrar un checklist capturado). */
  function secciones() {
    return SECCIONES.map((s) => ({ seccion: s.seccion, puntos: s.puntos.map((p) => aPunto_(p, s.seccion)) }));
  }

  /** Secciones con los puntos que el formulario muestra para ese [TIPO]. */
  function seccionesVisibles(tipo) {
    return secciones().map((s) => ({ seccion: s.seccion, puntos: s.puntos.filter((p) => cumple(p.mostrar, tipo)) }))
      .filter((s) => s.puntos.length);
  }

  // CALIFICACION (AppFormula del AppSheet): 15 puntos SI/NO + 3 de desempeño.
  const PUNTOS_CALIFICACION_SI = ['IDENTIFICACION', 'CUBO', 'CABLE', 'FUNDA', 'MICA', 'PANTALLA', 'BOTONES VOLUMEN', 'BOTON ENCENDIDO',
    'CUERPO EQUIPO', 'CAMARA', 'PUERTO CARGA', 'ALTAVOZ', 'BOCINAS', 'MICROFONO', 'LINEA DE VOZ'];
  const PUNTOS_CALIFICACION_DESEMPENO = ['DURACION BATERIA', 'TEMPERATURA', 'DESEMPEÑO'];
  const VALOR_DESEMPENO = { BUENO: 1, REGULAR: 0.5, MALO: 0 };

  /**
   * Réplica exacta de la fórmula del AppSheet, sobre los valores por columna:
   *   (SI de los 15 puntos + BUENO 1 / REGULAR 0.5 / MALO 0 de los 3 de desempeño)
   *   / MAX(1, puntos contestados con SI o NO + puntos de desempeño contestados)
   * N/A, conectividad, sistema y apps no cuentan. Regresa 0..1 (Percent del AppSheet).
   */
  function calificacion(valoresPorColumna) {
    const v = (c) => String(valoresPorColumna[c] === null || valoresPorColumna[c] === undefined ? '' : valoresPorColumna[c]).trim().toUpperCase();
    let suma = 0;
    let contestados = 0;
    PUNTOS_CALIFICACION_SI.forEach((c) => {
      if (v(c) === 'SI') { suma += 1; contestados += 1; } else if (v(c) === 'NO') contestados += 1;
    });
    PUNTOS_CALIFICACION_DESEMPENO.forEach((c) => {
      if (v(c) in VALOR_DESEMPENO) { suma += VALOR_DESEMPENO[v(c)]; contestados += 1; }
    });
    return suma / Math.max(1, contestados);
  }

  /** Como la muestra el AppSheet (Percent con 2 decimales): 0.9444 → "94.44%". */
  function calificacionTexto(valor) {
    if (valor === null || valor === undefined || valor === '') return '';
    const n = Number(valor);
    if (isNaN(n)) return String(valor);
    return (n > 1 ? n : n * 100).toFixed(2) + '%';
  }

  return { ESCALAS, CONDICIONES: Object.keys(CONDICIONES), cumple, puntos, secciones, seccionesVisibles, calificacion, calificacionTexto };
})();
