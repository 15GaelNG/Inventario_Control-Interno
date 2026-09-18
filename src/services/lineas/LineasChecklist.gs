/**
 * LineasChecklist.gs
 * Checklist de inspección de equipo telefónico.
 * `columna` = encabezado en INSPECCIONES LINEAS; `clave` = nombre interno;
 * `etiqueta` = texto visible (respeta los "display name" del AppSheet, que
 * renombraban columnas como TIKTOK → "Waze").
 */

const LineasChecklist = (function () {
  const ESCALAS = {
    SI_NO: { valores: ['SI', 'NO', 'N/A'], orden: { SI: 2, NO: 1 } },
    CALIDAD: { valores: ['BUENO', 'REGULAR', 'MALO'], orden: { BUENO: 3, REGULAR: 2, MALO: 1 } },
    APP: { valores: ['INSTALADA', 'NO INSTALADA'], orden: null },
  };

  const SECCIONES = [
    { seccion: 'Documentación y accesorios', puntos: [
      ['IDENTIFICACION', 'identificacion', 'Identificación', 'SI_NO'],
      ['CUBO', 'cubo', 'Cubo', 'SI_NO'],
      ['CABLE', 'cable', 'Cable', 'SI_NO'],
      ['FUNDA', 'funda', 'Funda', 'SI_NO'],
      ['MICA', 'mica', 'Mica', 'SI_NO'],
      ['CUBO 2', 'cubo2', 'Cubo (2)', 'SI_NO'],
      ['CABLE 2', 'cable2', 'Cable (2)', 'SI_NO'],
    ] },
    { seccion: 'Estado físico general', puntos: [
      ['PANTALLA', 'pantalla', 'Pantalla', 'SI_NO'],
      ['BOTONES VOLUMEN', 'botonesVolumen', 'Botones de volumen', 'SI_NO'],
      ['BOTON ENCENDIDO', 'botonEncendido', 'Botón de encendido', 'SI_NO'],
      ['CUERPO EQUIPO', 'cuerpoEquipo', 'Cuerpo del equipo', 'SI_NO'],
      ['CAMARA', 'camara', 'Cámara', 'SI_NO'],
      ['PUERTO CARGA', 'puertoCarga', 'Puerto de carga', 'SI_NO'],
      ['ALTAVOZ', 'altavoz', 'Altavoz', 'SI_NO'],
      ['BOCINAS', 'bocinas', 'Bocinas', 'SI_NO'],
      ['MICROFONO', 'microfono', 'Micrófono', 'SI_NO'],
      ['LINEA DE VOZ', 'lineaVoz', 'Línea de voz', 'SI_NO'],
    ] },
    { seccion: 'Sistema', puntos: [
      ['SO', 'sistemaOperativo', 'Sistema operativo', 'SI_NO'],
      ['ACTUALIZACIONES', 'actualizaciones', 'Actualizaciones', 'SI_NO'],
      ['PANTALLA TACTIL', 'pantallaTactil', 'Pantalla táctil', 'SI_NO'],
      ['MULTITAREA', 'multitarea', 'Multitarea', 'SI_NO'],
    ] },
    { seccion: 'Conectividad', puntos: [
      ['WIFI', 'wifi', 'WiFi', 'SI_NO'],
      ['RED MOVIL', 'redMovil', 'Red móvil', 'SI_NO'],
      ['GPS', 'gps', 'GPS', 'SI_NO'],
      ['USO DATOS', 'usoDatos', 'Uso de datos', 'SI_NO'],
    ] },
    { seccion: 'Desempeño', puntos: [
      ['DURACION BATERIA', 'duracionBateria', 'Duración de batería', 'CALIDAD'],
      ['TEMPERATURA', 'temperatura', 'Temperatura', 'CALIDAD'],
      ['DESEMPEÑO', 'desempeno', 'Desempeño', 'CALIDAD'],
    ] },
    { seccion: 'Apps instaladas', puntos: [
      ['WHATSAPP', 'appWhatsapp', 'WhatsApp', 'APP'],
      ['E COMMERCE', 'appEnlaceWindows', 'Enlace a Windows', 'APP'],
      ['MOVILIDAD / DELIVERY', 'appUber', 'Uber', 'APP'],
      ['TIKTOK', 'appWaze', 'Waze', 'APP'],
      ['NETFLIX', 'appEscanerDocumentos', 'Lector/escáner de documentos', 'APP'],
      ['MUSICA', 'appLectorQr', 'Lector de código QR', 'APP'],
      ['GMAIL', 'appGoogle', 'Apps de Google', 'APP'],
      ['YOUTUBE', 'appYoutube', 'YouTube', 'APP'],
      ['JUEGOS', 'appTimestamp', 'Timestamp', 'APP'],
      ['TIMEMARK', 'appTimemark', 'Timemark', 'APP'],
    ] },
  ];

  /**
   * En qué inspecciones aplica cada punto (equivalente a los Show_If del AppSheet,
   * ahora por tipo de equipo y no por un formulario único):
   *   S = smartphone (CELULAR)   K = celular básico   D = módem / banda ancha
   *   B = solo banda ancha       LN = cualquier equipo con línea   L = línea suelta   VOZ = celular con línea o línea suelta
   */
  const APLICA = {
    identificacion: ['S', 'K', 'D', 'L'],
    cubo: ['S', 'K', 'D'], cable: ['S', 'K', 'D'], funda: ['S', 'K'], mica: ['S', 'K'],
    cubo2: [], cable2: [],
    pantalla: ['S', 'K'], botonesVolumen: ['S', 'K'], camara: ['S', 'K'], altavoz: ['S', 'K'], bocinas: ['S', 'K'], microfono: ['S', 'K'],
    botonEncendido: ['S', 'K', 'D'], cuerpoEquipo: ['S', 'K', 'D'], puertoCarga: ['S', 'K', 'D'],
    lineaVoz: ['VOZ'],
    sistemaOperativo: ['S'], actualizaciones: ['S'], pantallaTactil: ['S'], multitarea: ['S'], wifi: ['S'], gps: ['S'],
    redMovil: ['LN', 'L'], usoDatos: ['LN', 'L'],
    duracionBateria: ['S', 'K', 'B'], temperatura: ['S', 'K', 'D'], desempeno: ['S', 'K', 'D'],
  };

  /** Lista plana { columna, clave, etiqueta, escala, seccion }. */
  function puntos() {
    const lista = [];
    SECCIONES.forEach((s) => {
      s.puntos.forEach((p) => {
        lista.push({ columna: p[0], clave: p[1], etiqueta: p[2], escala: p[3], seccion: s.seccion });
      });
    });
    return lista;
  }

  /** Secciones con puntos { clave, etiqueta, escala } (para mostrar un checklist capturado). */
  function secciones() {
    return SECCIONES.map((s) => ({
      seccion: s.seccion,
      puntos: s.puntos.map((p) => ({ columna: p[0], clave: p[1], etiqueta: p[2], escala: p[3] })),
    }));
  }

  /** Puntos que aplican a una inspección según el tipo de equipo y si tiene línea. */
  function puntosAplicables(tipoEquipo, tieneLinea) {
    const codigos = [];
    if (tipoEquipo === 'CELULAR') codigos.push('S');
    if (tipoEquipo === 'CELULAR_BASICO') codigos.push('K');
    if (tipoEquipo === 'MODEM' || tipoEquipo === 'BANDA_ANCHA') codigos.push('D');
    if (tipoEquipo === 'BANDA_ANCHA') codigos.push('B');
    if (!tipoEquipo) codigos.push('L');
    if (tipoEquipo && tieneLinea) codigos.push('LN');
    if ((tipoEquipo === 'CELULAR' || tipoEquipo === 'CELULAR_BASICO') && tieneLinea) codigos.push('VOZ');
    if (!tipoEquipo) codigos.push('VOZ');
    return SECCIONES.map((s) => {
      const lista = s.puntos.filter((p) => {
        const aplica = s.seccion === 'Apps instaladas' ? ['S'] : (APLICA[p[1]] || []);
        return aplica.some((c) => codigos.indexOf(c) >= 0);
      }).map((p) => ({ columna: p[0], clave: p[1], etiqueta: p[2], escala: p[3] }));
      return { seccion: s.seccion, puntos: lista };
    }).filter((s) => s.puntos.length);
  }

  /** Calificación 0..1: SI/BUENO = 1, REGULAR = 0.5, NO/MALO = 0; N/A y apps no cuentan. */
  function calificacion(checklist, secs) {
    let suma = 0;
    let total = 0;
    secs.forEach((s) => {
      s.puntos.forEach((p) => {
        const v = checklist[p.clave];
        if (p.escala === 'APP' || !v || v === 'N/A') return;
        total++;
        if (v === 'SI' || v === 'BUENO') suma += 1;
        else if (v === 'REGULAR') suma += 0.5;
      });
    });
    return total ? Math.round(suma / total * 1000) / 1000 : null;
  }

  return { ESCALAS, puntos, secciones, puntosAplicables, calificacion };
})();
