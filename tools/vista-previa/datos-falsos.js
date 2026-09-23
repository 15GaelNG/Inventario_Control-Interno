/* Servidor falso de la vista previa (ver construir.js). Todo aquí es de mentira. */
(function () {
  // ---------- sesión ya iniciada, con permiso de edición en todo ----------
  sessionStorage.setItem('token', 'vista-previa');
  sessionStorage.setItem('sesion', JSON.stringify({ token: 'vista-previa', nombre: 'AYRTON SEPULVEDA CHOWEL', correo: 'prueba@ciudadmaderas.com' }));
  const tema = /tema=oscuro/.test(location.hash) ? 'dark' : 'light';
  try { localStorage.setItem('tema', tema); } catch (e) { /* no-op */ }

  const MODULOS = [
    ['servicios-vehiculares', 'Servicios Vehiculares', 'car', [
      ['vehiculos', 'Vehículos'], ['verificaciones', 'Verificaciones'], ['inspeccion-vehicular', 'Inspección Vehicular'],
      ['instalacion-sensores', 'Instalación de Sensores'], ['hologramas', 'Hologramas']]],
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

  const respuestas = {
    apiMisPermisos: { correo: 'prueba@ciudadmaderas.com', permisos, grupos },
    apiListarVehiculosBasico: [{ FOLIO: 'AUT0024', PLACA: 'GGY886F', MARCA: 'CHEVROLET', LINEA_VEHICULO: 'BEAT' },
      { FOLIO: 'AUT0100', PLACA: 'ABC123A', MARCA: 'MITSUBISHI', LINEA_VEHICULO: 'L200' }],
    apiBuscarVehiculoPorFolio: VEHICULO,
    apiListarInspecciones: [
      { ID: '2026_24_292', FOLIO: 'AUT0024', TIPO: 'RIFTER', FECHA: hace(1), PLACAS: 'GGY886F', PUNTAJE: 96.3, RESPONSABLE: 'JUAN MANUEL FULGENCIO', INSPECTOR: 'AYRTON SEPULVEDA', PDF: 'x.pdf' },
      { ID: '2026_25_291', FOLIO: 'AUT0025', TIPO: 'HONDA 150XR', FECHA: hace(3), PLACAS: 'GGR658F', PUNTAJE: 84.5, RESPONSABLE: 'JORGE LUIS AVECILLA', INSPECTOR: 'AYRTON SEPULVEDA', PDF: '' },
      { ID: '2026_30_290', FOLIO: 'AUT0030', TIPO: 'L200', FECHA: hace(40), PLACAS: 'UNK093H', PUNTAJE: 71, RESPONSABLE: 'MOISÉS MALDONADO', INSPECTOR: 'J. ENRIQUE MORA', PDF: 'x.pdf' },
    ],
    apiTiposInspeccion: [{ tipo: 'BEAT', listo: true }, { tipo: 'L200', listo: true }, { tipo: 'PIPA', listo: true }],
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
  async function elegirVehiculo(selector) {
    const campo = await hasta(selector);
    campo.value = 'AUT0024';
    evento(campo, 'input');
    evento(campo, 'change');
    evento(campo, 'blur');
    await esperar(800);
  }
  const firmar = (canvas) => {
    const r = canvas.getBoundingClientRect();
    const p = (tipo, x, y) => canvas.dispatchEvent(new PointerEvent(tipo, { clientX: r.left + x, clientY: r.top + y, bubbles: true, pointerId: 1, pointerType: 'mouse' }));
    p('pointerdown', 60, 120);
    [[90, 100], [130, 130], [170, 90], [210, 120], [260, 110], [320, 125]].forEach(([x, y]) => p('pointermove', x, y));
    p('pointerup', 320, 125);
  };

  const ESCENAS = {
    'inspecciones-detalle': async () => { await abrir('inspeccion-vehicular'); await esperar(400); (await hasta('.dt-btn-ver')).click(); await esperar(900); },
    'sensores-detalle': async () => { await abrir('instalacion-sensores'); await esperar(400); (await hasta('.dt-btn-ver')).click(); await esperar(900); },
    'hologramas-detalle': async () => { await abrir('hologramas'); await esperar(400); (await hasta('.dt-btn-ver')).click(); await esperar(900); },
    'verificaciones-detalle': async () => { await abrir('verificaciones'); await esperar(400); (await hasta('.dt-btn-ver')).click(); await esperar(900); },
    'menu-abierto': async () => { await abrir('inspeccion-vehicular'); $('#topbar-menu-btn').click(); await esperar(400); },
    'verificaciones': () => abrir('verificaciones'),
    'verificaciones-form': async () => { await abrir('verificaciones', 'nuevo'); await elegirVehiculo('[data-panel="nuevo"] input[type="text"]'); },
    'sensores': () => abrir('instalacion-sensores'),
    'sensores-form': async () => { await abrir('instalacion-sensores', 'nuevo'); await elegirVehiculo('#sen-form input[type="text"]'); },
    'hologramas': () => abrir('hologramas'),
    'hologramas-form': async () => { await abrir('hologramas', 'nuevo'); },
    'inspecciones': () => abrir('inspeccion-vehicular'),
    'inspecciones-form': async () => { await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-folio'); },
    'inspecciones-checklist': async () => {
      await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-folio');
      $('#ins-siguiente').click(); await esperar(500);
    },
    'inspecciones-danos': async () => {
      await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-folio');
      for (let i = 0; i < 5; i++) { $('#ins-siguiente').click(); await esperar(300); }
    },
    'inspecciones-firmas': async () => {
      await abrir('inspeccion-vehicular', 'nueva'); await elegirVehiculo('#ins-folio');
      for (let i = 0; i < 7; i++) { $('#ins-siguiente').click(); await esperar(300); }
      await esperar(300);
      firmar($('[data-firma="FIRMA INSPECTOR"] canvas'));
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
