// Etapa 3, paso 2: las acciones de Líneas (LineasAcciones.gs y la pantalla). «¿Qué pasó?» se quitó el 4-oct (usuario).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const LINEAS = require('./lineas-fuente');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('sin «¿Qué pasó?» ni regla de estatus: regresa «Cambiar estatus» (usuario, 4-oct)', () => {
  const acciones = read('src/services/lineas/LineasAcciones.gs');
  assert.match(acciones, /return \{ responsiva, vincular, aplicarVinculo: aplicarVinculo_, PERSONA_DE_RESPONSIVA, datoDeCH_, esRenovacion, exigirEstatusParaResponsiva \};/);
  // Reasignar: el director sale de la responsiva y el jefe directo de la inspección (si es de la misma persona) o de
  // Capital Humano (usuario, 6-oct)
  assert.match(acciones, /cambios\['JEFE DIRECTO'\] = deInspeccion \|\| datoDeCH_\(valores\['No EMPLEADO'\], valores\['RESPONSABLE'\], 'jefe'\);/);
  assert.match(acciones, /may\(LineasCaptura\.datoDeInspeccion\(inspeccionId, 'RESPONSABLE'\)\) === nuevo \? LineasCaptura\.datoDeInspeccion\(inspeccionId, 'JEFE DIRECTO'\) : ''/);
  assert.doesNotMatch(acciones, /function (reglas|permite|hayCamino|cerrar|cambiar)\(/);
  assert.match(read('src/services/TelefoniaService.gs'), /function catalogos\(token\) \{\r?\n    leer_\(token\);\r?\n    return LineasRepo\.catalogos\(\);/);
  const api = read('src/ClientApi.gs');
  assert.doesNotMatch(api, /apiLineasCerrarEquipos|apiLineasCambiar\(|apiLineasAgregarNota|apiLineasCambiarEstatus/);
  // El servidor ya no rechaza por estatus (resguardo, cancelación, acciones masivas)
  ['LineasResguardos', 'LineasRegistros'].forEach((m) => assert.doesNotMatch(read('src/services/lineas/' + m + '.gs'), /LineasAcciones\.(permite|hayCamino|motivoSinCamino|accion)\(/, m));
  assert.doesNotMatch(read('src/services/lineas/LineasEscritura.gs'), /function cambiar(Equipo|Linea)\(/);
  assert.doesNotMatch(read('src/services/lineas/LineasCaptura.gs'), /filaDelCambio_|ref\.cambio|'CAMBIO'/);
  // La pantalla: el botón «Cambiar estatus» y todas las acciones sin depender del estatus
  const cliente = LINEAS;
  assert.doesNotMatch(cliente, /texto: '¿Qué pasó\?'|function (abrirQuePaso|accionesPosibles|permiteAccion|abrirCierre|abrirCambio)\(|ACCION_ENTREGAR|estatusPosibles/);
  assert.match(cliente, /texto: 'Mandar a resguardo'[^\n]*\n\s+visible: operar, alHacer: \(f\) => abrirResguardo\(f\)/);
  // Reasignar se volvió la Responsiva (pendiente 2.49, usuario 16-oct): solo revisa lo que ya no se entrega
  assert.match(cliente, /texto: 'Responsiva'[^\n]*visible: operar,/);
  assert.doesNotMatch(cliente, /apiLineasAgregarNota|esNota/);
});

test('sin «Cambiar estatus»: los estatus se cambian en Editar; los del panel de Pau, con aviso (usuario, 4-oct y 8-oct)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.doesNotMatch(reg, /function cambiarEstatus\(/);
  // Sin el aviso confirmado (datos.sinPanel) el servidor sigue pidiendo el formulario de resguardo o el aviso de la línea
  assert.match(reg, /const sinPanel = !!\(datos && datos\.sinPanel\);/);
  assert.match(reg, /if \(!sinPanel\) \{\s+if \('ESTATUS EQUIPO' in cambios\) exigirFormularioResguardo_/);
  assert.match(reg, /ESTATUS_LINEA_PANEL\.indexOf\(estatusLinea\) >= 0/);
  // El equipo que se guarda deja DISPONIBLE su línea en uso
  assert.match(reg, /if \(sinPanel && aGuardado && !\('ESTATUS LINEA' in cambios\) && texto_\(base\['ESTATUS LINEA'\]\)\.toUpperCase\(\) === 'USO'\)/);
  // Y al revés (usuario, 13-oct): el equipo guardado que pasa a USO se lleva su línea DISPONIBLE (antes se desvinculaba)
  assert.match(reg, /const aUso = 'ESTATUS EQUIPO' in cambios && estatusEquipo === 'USO';/);
  assert.match(reg, /if \(aUso && lineaConEquipo && !\('ESTATUS LINEA' in cambios\) && \['DISPONIBLE', 'RESGUARDO'\]\.indexOf\(texto_\(base\['ESTATUS LINEA'\]\)\.toUpperCase\(\)\) >= 0\) \{\s+cambios\['ESTATUS LINEA'\] = 'USO';/);
  assert.match(reg, /guardarCambiosRegistro\(fila, cambios, usuario, new Date\(\), \{ corregir: true \}\)/);
  const cliente = LINEAS;
  assert.doesNotMatch(cliente, /abrirCambioEstatus|fichaDeFila|texto: 'Cambiar estatus'/);
  const editar = cliente.slice(cliente.indexOf('function abrirEditor('), cliente.indexOf('// ---- Captura: inspección y responsiva nuevas'));
  // Ya no abre Mandar a resguardo ni Mandar a cancelación: avisa, se confirma y se guarda con sinPanel
  assert.match(editar, /cambiaA\('ESTATUS EQUIPO', ESTATUS_EQUIPO_RESGUARDO\)/);
  assert.match(editar, /cambiaA\('ESTATUS LINEA', ESTATUS_LINEA_PANEL\)/);
  assert.match(editar, /mensaje: 'Este cambio no se agregará en el panel de Resguardos y cancelaciones, pero se quedará en el historial\.'/);
  assert.match(editar, /sinPanel: avisos\.length > 0/);
  assert.doesNotMatch(editar, /seguirFlujo|abrirResguardo\(|abrirCancelacion\(/);
  assert.doesNotMatch(editar, /placeholder=|class="ln-nota"/); // sin textos de ayuda
  // Agregar equipo y Agregar línea en lugar de Registrar NUCO
  const vista = read('src/html/views/lineas/lineas-telefonicas.html');
  assert.match(vista, /id="ln-nuevo-equipo"[^\n]*Agregar equipo/);
  assert.match(vista, /id="ln-nueva-linea"[^\n]*Agregar línea/);
  assert.doesNotMatch(vista, /Registrar NUCO/);
  // La escritura: corrección de la persona en su lugar, tipo de línea y poner línea a un equipo
  const esc = read('src/services/lineas/LineasEscritura.gs');
  assert.match(esc, /const enSuLugar = mismaForma && !\(claseActual === 'PERSONA' && cambiaPersona && !corregir\);/);
  assert.match(esc, /'TIPO DE LINEA': 'TIPO DE LINEA' \};/);
  assert.match(esc, /function lineaParaEquipo_\(e, num, sim, cambios, a, ahora\)/);
});

test('Mandar a resguardo: la inspección se captura dentro de la acción (usuario, 3-oct)', () => {
  const cliente = LINEAS;
  assert.match(cliente, /function capturarEnFlujo\(tipo, ref, opciones\)/);
  assert.match(cliente, /if \(borrador && borrador\.flujo && !borrador\.guardada\) borrador\.flujo\.resolver\(null\);/);
  // La última inspección se guarda con el resguardo, en la misma llamada (rapidez, 13-oct)
  assert.match(cliente, /const hechas = await inspeccionesEnFlujo\(deUnaPersona, 'al mandarlo a resguardo', \{\s+espera: textoEspera, guardar: \(datos, previas\) => enviar\(\{ inspecciones: previas, inspeccion: datos \}\),/);
  assert.match(cliente, /conLaAccion \? \{ espera: ultima\.espera, guardar: \(datos\) => ultima\.guardar\(datos, Object\.assign\(\{\}, ids\)\) \} : \{\}/);
  assert.match(read('src/services/TelefoniaService.gs'), /LineasCaptura\.guardarInspeccion\(d\.inspeccion, usuarioOperacion_\(sesion\), puedeVerSecretos_\(sesion\), \{ sinIndice: true \}\);/);
  assert.doesNotMatch(read('src/services/TelefoniaService.gs'), /LineasEscritura\.olvidar/); // el resguardo usa las hojas que leyó la inspección
  assert.match(read('src/services/lineas/LineasResguardos.gs'), /LineasCaptura\.exigirInspeccion\(\(d\.inspecciones \|\| \{\}\)\[id\]/);
  // La responsiva se revisa antes de hacer la acción (Reasignar), con el mismo candado
  const captura = read('src/services/lineas/LineasCaptura.gs');
  const revisa = captura.indexOf("if (r.errores.length) throw new Error(r.errores.join(' · '));");
  const aplica = captura.indexOf('const hecho = accion ? accion.aplicar(ahora, valores) : null;');
  assert.ok(revisa > 0 && aplica > revisa, 'primero se revisa la responsiva, después la acción');
});

test('inspección: el equipo y la línea vienen del registro y no se cambian; el color y el responsable sí', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const leer = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
  const captura = leer('src/services/lineas/LineasCaptura.gs');
  const cuerpo = captura.slice(captura.indexOf('function formularioInspeccion_'), captura.indexOf('const agregarSeccion'));
  ['NUCO', 'TIPO', 'MODELO', 'IMEI', 'No TELEFONO', 'SIM', 'COMPAÑIA', 'PLAN', 'RAZON SOCIAL'].forEach((c) => {
    assert.match(cuerpo, new RegExp("campo_\\('" + c + "', '[^']+', 'texto', fijo\\("), c + ' debe ser fijo');
  });
  assert.match(cuerpo, /campo_\('COLOR', 'Color', 'listaAbierta', \{ valor: deResp\('COLOR', v\('COLOR'\)\)/);
  assert.match(cuerpo, /campo_\('RESPONSABLE', 'Nombre', 'listaAbierta'/);
  const pantalla = LINEAS;
  assert.doesNotMatch(pantalla, /Opcional\. Se guardan en Drive/);
  assert.match(pantalla, /desde: 'titulo:EQUIPO'/);
  assert.match(pantalla, /ln-segmento/);
});

test('sin acciones masivas por ahora: las acciones de la barra son de un registro a la vez', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const pantalla = LINEAS;
  const barra = pantalla.slice(pantalla.indexOf('function accionesSeleccionDe'), pantalla.indexOf('let detallesAbiertos'));
  assert.doesNotMatch(barra, /minimo: 2/);
  ["texto: 'Mandar a resguardo'", "texto: 'Responsiva'", "texto: 'Mandar a cancelación'"].forEach((t) => {
    barra.split(t).slice(1).forEach((resto) => assert.match(resto.slice(0, 260), /maximo: (UNO|1)/, t + ' debe ser de uno'));
  });
});

test('patrón con orden y dirección, y pantalla de espera al guardar (usuario, 4-oct)', () => {
  const pantalla = LINEAS;
  assert.match(pantalla, /function flechasPatron\(/);
  assert.match(pantalla, /ln-patron-flecha/);
  assert.match(pantalla, /fillText\(String\(i \+ 1\)/); // el PDF lleva el número de cada punto
  assert.match(pantalla, /function mostrarEspera\(titulo, o\)/);
  assert.match(pantalla, /estadoGuardado\(sesion\.flujo && sesion\.flujo\.espera \? sesion\.flujo\.espera : \(sesion\.flujo \? 'Guardando la inspección' : 'Generando tu PDF'\)\)/);
  assert.doesNotMatch(pantalla, /Firmas cargadas|Del registro: no se cambian aquí|Captura el color y confirma/);
  assert.match(read('src/html/views/lineas/lineas-telefonicas.html'), /id="ln-captura-espera"/);
});

test('paso de firmas en tres partes; el resultado y los errores usan la pantalla de espera (usuario, 4-oct)', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  ["titulo_('DATOS DE LA INSPECCIÓN'", "titulo_('COMENTARIO'", "titulo_('FIRMAS'"].forEach((t) => assert.ok(captura.includes(t), t));
  const pantalla = LINEAS;
  assert.match(pantalla, /desde: 'titulo:DATOS DE LA INSPECCIÓN'/);
  assert.match(pantalla, /desde: 'titulo:DATOS DE LA RESPONSIVA'/);
  // Un clic afuera no cierra las ventanas (usuario, 4-oct)
  assert.doesNotMatch(pantalla, /ev\.target\.id === 'ln-modal-captura'|ev\.target === fondo|ev\.target\.id === 'lac-modal/);
  assert.match(pantalla, /e\.llenarVacios && e\.autollenar/);
  assert.match(pantalla, /mostrarEspera\(conOtro \? 'Tus PDF están listos' : 'Tu PDF está listo'/);
  assert.match(pantalla, /mostrarEspera\('No se pudo generar el PDF'/);
  const cuerpo = pantalla.slice(pantalla.indexOf('function errorAlGuardar'), pantalla.indexOf('function estadoGuardado'));
  assert.doesNotMatch(cuerpo.slice(cuerpo.indexOf('{')), /errorAlGuardar\(/);
  assert.doesNotMatch(pantalla, /mostrarErrorCaptura\(mensajeError\(e\)\);\s*restaurarGuardado\(\);[\s\S]{0,40}\}\);/);
});

test('accesorios: NINGUNO quita los demás y elegir otro quita NINGUNO', () => {
  const cliente = LINEAS;
  const i = cliente.indexOf('function alternarMulti(boton)');
  const fuente = cliente.slice(i, cliente.indexOf('\n    }', i) + 6);
  const alternarMulti = new Function(fuente + '; return alternarMulti;')();
  const boton = (valor, activa) => ({ dataset: { valor: valor }, _a: !!activa,
    classList: { contains() { return this._b._a; }, remove() { this._b._a = false; }, toggle(_, v) { this._b._a = v; } } });
  const grupo = [boton('CAJA', true), boton('FUNDA', true), boton('NINGUNO')];
  grupo.forEach((b) => { b.classList._b = b; b.parentElement = { querySelectorAll: () => grupo }; });
  alternarMulti(grupo[2]);
  assert.deepEqual(grupo.map((b) => b._a), [false, false, true]);
  alternarMulti(grupo[0]);
  assert.deepEqual(grupo.map((b) => b._a), [true, false, false]);
  alternarMulti(grupo[1]);
  assert.deepEqual(grupo.map((b) => b._a), [true, true, false]);
});


test('opciones separadas: el equipo no trae lo de la línea (usuario, 4-oct)', () => {
  const cliente = LINEAS;
  const barra = cliente.slice(cliente.indexOf('function accionesSeleccionDe'), cliente.indexOf('let detallesAbiertos'));
  const equipo = barra.slice(barra.indexOf("if (modulo === 'equipos')"), barra.indexOf('historial];') + 11);
  assert.doesNotMatch(equipo, /abrirCancelacion|Mandar línea a cancelación/);
  assert.match(equipo, /texto: 'Ir a la línea', maximo: 1, grupo: 'ir', visible: \(f\) => !!f\[0\]\.lineaId, alHacer: \(f\) => abrir\('linea', f\[0\]\.lineaId\)/);
  const linea = barra.slice(barra.indexOf('historial];') + 11);
  ["texto: 'Mandar a cancelación'", "texto: 'Ir al equipo'"].forEach((t) => assert.ok(linea.includes(t), t));
  assert.doesNotMatch(linea, /abrirResguardo|abrirReasignar|abrirCaptura/);
  // La línea sin equipo entrega con su Responsiva (pendiente 2.49)
  assert.match(linea, /visible: \(f\) => operar\(\) && !f\[0\]\.equipoId, alHacer: \(f\) => abrirResponsiva\('linea', f\[0\]\)/);
  const ficha = cliente.slice(cliente.indexOf('function abrirMenuFicha'), cliente.indexOf('menuFlotante(boton, items.filter(Boolean));'));
  assert.doesNotMatch(ficha, /Mandar línea a cancelación/);
  // En la ficha ya no van Ir a la línea ni Ir al equipo: están en su información (usuario, 12-oct; pendiente 2.34)
  assert.doesNotMatch(ficha, /texto: 'Ir a la línea'|texto: 'Ir al equipo'/);
});

test('orden de las opciones (usuario, 12-oct; pendiente 2.34): clic derecho y ⋮ de la ficha', () => {
  const cliente = LINEAS;
  const barra = cliente.slice(cliente.indexOf('function accionesSeleccionDe'), cliente.indexOf('let detallesAbiertos'));
  const equipo = barra.slice(barra.indexOf("if (modulo === 'equipos')"), barra.indexOf('historial];') + 11);
  const linea = barra.slice(barra.indexOf('historial];') + 11);
  const enOrden = (txt, lista) => {
    const pos = lista.map((t) => txt.indexOf(t));
    pos.forEach((p, i) => assert.ok(p >= 0, lista[i]));
    assert.deepEqual(pos.slice().sort((a, b) => a - b), pos, lista.join(' · '));
  };
  // Responsiva en lugar de Reasignar y de Nueva responsiva (pendiente 2.49, usuario 16-oct)
  assert.doesNotMatch(equipo, /'Reasignar'|'Nueva responsiva'/);
  // Responsiva e Inspección juntas, la Responsiva primero (usuario, 16-oct; pendiente 2.50)
  enOrden(equipo, ['[detalles,', "'Responsiva'", "'Inspección'", "'Mandar a resguardo'", '    editar,',
    "'Vincular línea'", "'Cambiar línea'", "'Desvincular línea'", "'Ir a la línea'", 'historial];']);
  // En el clic derecho del equipo solo se corrige el equipo: la línea se corrige desde la línea (usuario, 13-oct); «Corregir»
  // en lugar de «Editar» (usuario, 16-oct; pendiente 2.50)
  assert.doesNotMatch(barra, /'Editar línea'|'Editar equipo'/);
  assert.match(barra, /const editar = \{ icono: 'pencil', texto: 'Corregir', maximo: 1, enBarra: false, grupo: 'abrir', visible: operar,/);
  assert.doesNotMatch(cliente, /'Editar información'/);
  // Ver la última inspección o responsiva ya no va en el clic derecho del equipo
  assert.doesNotMatch(equipo, /Ver última/);
  enOrden(linea, ['[detalles,', "'Responsiva'", "'Mandar a cancelación'", '  editar,', "'Vincular a equipo'", "'Cambiar de equipo'",
    "'Desvincular del equipo'", "'Ir al equipo'", 'historial];']);
  const ficha = cliente.slice(cliente.indexOf('function abrirMenuFicha'), cliente.indexOf('menuFlotante(boton, items.filter(Boolean));'));
  // La Responsiva está en los botones de la ficha (pendiente 2.49)
  assert.doesNotMatch(ficha, /texto: 'Reasignar'/);
  enOrden(ficha, ["texto: 'Mandar a resguardo'", '.concat(documentos, drive, operar ? editar.concat(vinculo) : [], historial)']);
  // La línea: mover · su carpeta en LINEAS (sin equipo, pendiente 2.45) · editar · vincular · historial
  assert.match(ficha, /\.concat\(drive, editar, vinculo, historial\);/);
  // En el ⋮ del equipo ya no está Editar línea
  assert.doesNotMatch(ficha, /abrirEditor\(r\.lineaId, 'LINEA'\)/);
});

test('POSIBLE VENTA-DAÑO ya no existe y PARA VENTA CON DETALLE sí: 9 estatus de equipo (usuario, 4-oct y 13-oct)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /estatusEquipo: \['USO', 'RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'\],/);
  assert.match(read('src/services/lineas/LineasResguardos.gs'), /const ESTATUS_EQUIPO_RESGUARDO = \['RESGUARDO', 'PARA VENTA', 'PARA VENTA CON DETALLE', 'PARA DESECHO'\];/);
  const estructura = read('src/services/lineas/LineasEstructura.gs');
  assert.doesNotMatch(estructura, /'POSIBLE VENTA': 'POSIBLE VENTA-DAÑO'|'POSIBLE VENTA-DAÑO'/);
  assert.match(estructura, /'POSIBLE VENTA': 'RESGUARDO'/); // sigue guardado mientras Líneas lo corrige
  assert.doesNotMatch(LINEAS, /POSIBLE VENTA-DAÑO/);
  const fn = read('src/services/lineas/LineasReestructura.gs');
  // \r?\n: en Windows git deja los archivos con CRLF (core.autocrlf) y con \n solo fallaba ahí
  assert.match(fn, /function reestructuraQuitarPosibleVentaDano\(\) \{\r?\n\s+soloEditor_\(\);/);
  assert.match(fn, /guardarCambiosRegistro\(f, \{ 'ESTATUS EQUIPO': 'POSIBLE VENTA' \}/);
});

// Pendiente 2.39 (13-oct): el error del pie de las capturas flotaba sin fondo y se pintaba encima del Comentario de
// Mandar a resguardo. Va en su lugar, arriba de los botones
test('el error del pie de las capturas no flota encima de los campos', () => {
  const estilos = read('src/html/lineas-estilos.html');
  const regla = (estilos.match(/\.ln-error-fijo \{[^}]*\}/) || [''])[0];
  assert.equal(regla, '.ln-error-fijo { margin: 14px 0; }');
});
