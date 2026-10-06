// Etapa 3, paso 2: las acciones de Líneas (LineasAcciones.gs y la pantalla). «¿Qué pasó?» se quitó el 4-oct (usuario).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('sin «¿Qué pasó?» ni regla de estatus: regresa «Cambiar estatus» (usuario, 4-oct)', () => {
  const acciones = read('src/services/lineas/LineasAcciones.gs');
  assert.match(acciones, /return \{ reasignar, PERSONA_DE_RESPONSIVA, datoDeCH_ \};/);
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
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /texto: '¿Qué pasó\?'|function (abrirQuePaso|accionesPosibles|permiteAccion|abrirCierre|abrirCambio)\(|ACCION_ENTREGAR|estatusPosibles/);
  assert.match(cliente, /texto: 'Mandar a resguardo'[^\n]*\n\s+visible: operar, alHacer: \(f\) => abrirResguardo\(f\)/);
  assert.match(cliente, /texto: 'Reasignar'[^\n]*visible: operar,/);
  assert.doesNotMatch(cliente, /apiLineasAgregarNota|esNota/);
});

test('sin «Cambiar estatus»: los estatus se cambian en Editar y los de resguardo y cancelación siguen su flujo (usuario, 4-oct)', () => {
  const reg = read('src/services/lineas/LineasRegistros.gs');
  assert.doesNotMatch(reg, /function cambiarEstatus\(/);
  assert.match(reg, /throw new Error\('Para mandar la línea a cancelación usa «Mandar a cancelación»/);
  assert.match(reg, /guardarCambiosRegistro\(fila, cambios, usuario, new Date\(\), \{ corregir: true \}\)/);
  const cliente = read('src/html/js/lineas.html');
  assert.doesNotMatch(cliente, /abrirCambioEstatus|fichaDeFila|texto: 'Cambiar estatus'/);
  const editar = cliente.slice(cliente.indexOf('function abrirEditor('), cliente.indexOf('// ---- Captura: inspección y responsiva nuevas'));
  assert.match(editar, /ESTATUS_EQUIPO_RESGUARDO\.indexOf\(valores\['ESTATUS EQUIPO'\]\) >= 0/);
  assert.match(editar, /valores\['ESTATUS LINEA'\] === 'EN PROCESO DE CANCELACION'/);
  assert.match(editar, /if \(flujo && !otros\) \{ cerrarCaptura\(true\); seguirFlujo\(\); return; \}/);
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
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /function capturarEnFlujo\(tipo, ref, opciones\)/);
  assert.match(cliente, /if \(borrador && borrador\.flujo && !borrador\.guardada\) borrador\.flujo\.resolver\(null\);/);
  assert.match(cliente, /inspecciones = await inspeccionesEnFlujo\(deUnaPersona, 'al mandarlo a resguardo'\);/);
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
  const pantalla = leer('src/html/js/lineas.html');
  assert.doesNotMatch(pantalla, /Opcional\. Se guardan en Drive/);
  assert.match(pantalla, /desde: 'titulo:EQUIPO'/);
  assert.match(pantalla, /ln-segmento/);
});

test('sin acciones masivas por ahora: las acciones de la barra son de un registro a la vez', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const pantalla = fs.readFileSync(path.join(__dirname, '..', 'src/html/js/lineas.html'), 'utf8');
  const barra = pantalla.slice(pantalla.indexOf('function accionesSeleccionDe'), pantalla.indexOf('let detallesAbiertos'));
  assert.doesNotMatch(barra, /minimo: 2/);
  ["texto: 'Mandar a resguardo'", "texto: 'Reasignar'", "texto: 'Mandar a cancelación'"].forEach((t) => {
    barra.split(t).slice(1).forEach((resto) => assert.match(resto.slice(0, 260), /maximo: (UNO|1)/, t + ' debe ser de uno'));
  });
});

test('patrón con orden y dirección, y pantalla de espera al guardar (usuario, 4-oct)', () => {
  const pantalla = read('src/html/js/lineas.html');
  assert.match(pantalla, /function flechasPatron\(/);
  assert.match(pantalla, /ln-patron-flecha/);
  assert.match(pantalla, /fillText\(String\(i \+ 1\)/); // el PDF lleva el número de cada punto
  assert.match(pantalla, /function mostrarEspera\(titulo, o\)/);
  assert.match(pantalla, /estadoGuardado\(sesion\.flujo \? 'Guardando la inspección' : 'Generando tu PDF'\)/);
  assert.doesNotMatch(pantalla, /Firmas cargadas|Del registro: no se cambian aquí|Captura el color y confirma/);
  assert.match(read('src/html/views/lineas/lineas-telefonicas.html'), /id="ln-captura-espera"/);
});

test('paso de firmas en tres partes; el resultado y los errores usan la pantalla de espera (usuario, 4-oct)', () => {
  const captura = read('src/services/lineas/LineasCaptura.gs');
  ["titulo_('DATOS DE LA INSPECCIÓN'", "titulo_('COMENTARIO'", "titulo_('FIRMAS'"].forEach((t) => assert.ok(captura.includes(t), t));
  const pantalla = read('src/html/js/lineas.html');
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

test('Reasignar: la responsiva es la acción; equipo y línea fijos; accesorios varios y TARJETA SD (usuario, 4-oct)', () => {
  const acciones = read('src/services/lineas/LineasAcciones.gs');
  const cuerpo = acciones.slice(acciones.indexOf('function reasignar('), acciones.indexOf('return { reasignar'));
  assert.match(cuerpo, /ref: \{ equipoId: id \}, modo: 'REASIGNAR'/);
  assert.doesNotMatch(cuerpo, /permite\(/); // desde cualquier estatus (usuario, 4-oct)
  assert.match(cuerpo, /ya lo tiene/); // la misma persona no es reasignación
  assert.match(cuerpo, /registrarMovimiento\('REASIGNACION', \{ motivo: comentario, ticket: txt\(valores\['TICKET'\]\) \}/);
  assert.match(acciones, /\['DIRECTOR', 'DIRECTOR'\]/); // la responsiva lleva al director (usuario, 6-oct)
  assert.match(read('src/ClientApi.gs'), /function apiLineasReasignar\(token, responsiva\)/);
  const captura = read('src/services/lineas/LineasCaptura.gs');
  assert.match(captura, /const persona = \(c\) => \(reasignar \? '' : v\(c\)\);/);
  const cliente = read('src/html/js/lineas.html');
  assert.match(cliente, /capturarEnFlujo\('RESPONSIVA', \{ equipoId: fila\.id, modo: 'REASIGNAR' \}/);
  assert.match(cliente, /llamar\('apiLineasReasignar', Object\.assign\(\{\}, d, \{ inspeccionId: inspeccionId \}\)\)/);
  assert.match(cliente, /function alternarMulti\(boton\)/);
  assert.match(cliente, /agregar: e\.control === 'listaAbierta' && !e\.soloLista,/);
  assert.match(read('src/services/lineas/LineasRepo.gs'), /accesorios: \['CAJA', 'CABLE', 'CUBO', 'FUNDA', 'MICA', 'TARJETA SD', 'NINGUNO'\]/);
});

test('accesorios: NINGUNO quita los demás y elegir otro quita NINGUNO', () => {
  const cliente = read('src/html/js/lineas.html');
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
  const cliente = read('src/html/js/lineas.html');
  const barra = cliente.slice(cliente.indexOf('function accionesSeleccionDe'), cliente.indexOf('let detallesAbiertos'));
  const equipo = barra.slice(barra.indexOf("if (modulo === 'equipos')"), barra.indexOf('historial];') + 11);
  assert.doesNotMatch(equipo, /abrirCancelacion|Mandar línea a cancelación/);
  assert.match(equipo, /texto: 'Ir a la línea', maximo: 1, grupo: 'mover', visible: \(f\) => !!f\[0\]\.lineaId, alHacer: \(f\) => abrir\('linea', f\[0\]\.lineaId\)/);
  const linea = barra.slice(barra.indexOf('historial];') + 11);
  ["texto: 'Mandar a cancelación'", "texto: 'Ir al equipo'"].forEach((t) => assert.ok(linea.includes(t), t));
  assert.doesNotMatch(linea, /abrirResguardo|abrirReasignar|abrirCaptura/);
  const ficha = cliente.slice(cliente.indexOf('function abrirMenuFicha'), cliente.indexOf('menuFlotante(boton, items.filter(Boolean));'));
  assert.doesNotMatch(ficha, /Mandar línea a cancelación/);
  assert.match(ficha, /texto: 'Ir a la línea'/);
  assert.match(ficha, /texto: 'Ir al equipo'/);
});

test('POSIBLE VENTA-DAÑO ya no existe: 8 estatus de equipo y los que lo tenían regresan a POSIBLE VENTA (usuario, 4-oct)', () => {
  const repo = read('src/services/lineas/LineasRepo.gs');
  assert.match(repo, /estatusEquipo: \['USO', 'RESGUARDO', 'PARA VENTA', 'PARA DESECHO', 'VENDIDO', 'DONADO', 'DESECHADO', 'EXTRAVIO-ROBO'\],/);
  assert.match(read('src/services/lineas/LineasResguardos.gs'), /const ESTATUS_EQUIPO_RESGUARDO = \['RESGUARDO', 'PARA VENTA', 'PARA DESECHO'\];/);
  const estructura = read('src/services/lineas/LineasEstructura.gs');
  assert.doesNotMatch(estructura, /'POSIBLE VENTA': 'POSIBLE VENTA-DAÑO'|'POSIBLE VENTA-DAÑO'/);
  assert.match(estructura, /'POSIBLE VENTA': 'RESGUARDO'/); // sigue guardado mientras Líneas lo corrige
  assert.doesNotMatch(read('src/html/js/lineas.html'), /POSIBLE VENTA-DAÑO/);
  const fn = read('src/services/lineas/LineasReestructura.gs');
  // \r?\n: en Windows git deja los archivos con CRLF (core.autocrlf) y con \n solo fallaba ahí
  assert.match(fn, /function reestructuraQuitarPosibleVentaDano\(\) \{\r?\n\s+soloEditor_\(\);/);
  assert.match(fn, /guardarCambiosRegistro\(f, \{ 'ESTATUS EQUIPO': 'POSIBLE VENTA' \}/);
});

test('Reasignar: la inspección es obligatoria (usuario, 5-oct): de ese equipo y de hoy, antes de tocar el registro', () => {
  const vm = require('node:vm');
  const exigidas = [];
  const escritos = [];
  const ctx = vm.createContext({
    LineasUtil: { col: (f, c) => f[c], nucoVisible: (n) => String(n).padStart(4, '0') },
    LineasDatos: { idsDeFila: (f) => [f.ID] },
    LineasRepo: {
      leerRegistroObligatorio: () => ({ ID: 'EQU-1', NUCO: 12, 'ESTATUS EQUIPO': 'RESGUARDO', RESPONSABLE: 'ANA' }),
      guardarCambiosRegistro: (...a) => { escritos.push(a); return { refs: [], campos: [] }; },
      registrarMovimiento: (...a) => escritos.push(a),
      indiceColaboradores: () => ({ columnas: ['noEmpleado', 'nombre', 'director', 'jefe'], filas: [] }),
    },
    LineasCaptura: {
      exigirInspeccion: (id, ids, nombre) => {
        exigidas.push([id, ids, nombre]);
        if (!id) throw new Error(nombre + ': falta su inspección (se captura dentro de la acción).');
        return id;
      },
      datoDeInspeccion: (id, c) => ({ RESPONSABLE: 'LUIS', 'JEFE DIRECTO': 'JEFA DE LA INSPECCION' })[c] || '',
      guardarResponsiva: (datos, usuario, secretos, accion) => {
        const hecho = accion.aplicar(new Date(), { COMENTARIO: 'CAMBIO DE PUESTO', RESPONSABLE: 'LUIS', 'No EMPLEADO': 'AC1' });
        return { id: 'RES-1', registroId: hecho.id, filas: [] };
      },
    },
  });
  vm.runInContext(read('src/services/lineas/LineasAcciones.gs') + '\nthis.A = LineasAcciones;', ctx);
  assert.throws(() => ctx.A.reasignar({ equipoId: 'EQU-1' }, { correo: 'a@b.mx' }, false), /NUCO 0012: falta su inspección/);
  assert.equal(escritos.length, 0, 'sin inspección no se escribe nada');
  const r = ctx.A.reasignar({ equipoId: 'EQU-1', inspeccionId: 'INS-9' }, { correo: 'a@b.mx' }, false);
  assert.equal(r.id, 'RES-1');
  assert.deepEqual(JSON.parse(JSON.stringify(exigidas[1])), ['INS-9', ['EQU-1'], 'NUCO 0012']);
  const mov = escritos.find((a) => a[0] === 'REASIGNACION');
  assert.equal(mov[4].detalle.inspeccionId, 'INS-9');
  // El jefe directo que se corrigió en la inspección (de la misma persona) es el que queda
  assert.equal(escritos.find((a) => a[1] && a[1]['ESTATUS EQUIPO'] === 'USO')[1]['JEFE DIRECTO'], 'JEFA DE LA INSPECCION');

  const cliente = read('src/html/js/lineas.html');
  const fn = cliente.slice(cliente.indexOf('async function abrirReasignar(fila)'), cliente.indexOf('const inspeccionesDelDia = {};'));
  // Orden (usuario, 5-oct): responsiva (se revisa, no se guarda) → inspección (se guarda) → reasignar con las dos
  const iResp = fn.indexOf("capturarEnFlujo('RESPONSIVA'");
  const iInsp = fn.indexOf("capturarEnFlujo('INSPECCION', { equipoId: fila.id, reasignar: true, desdeResponsiva: { valores: resp.datos.valores, patron: resp.datos.patron } }");
  const iReasignar = fn.indexOf("llamar('apiLineasReasignar'");
  assert.ok(iResp > 0 && iResp < iInsp && iInsp < iReasignar, 'responsiva, inspección y luego reasignar');
  assert.match(fn, /sinPdf: true/);
  assert.match(fn, /return Promise\.resolve\(\{ datos: datos \}\);/);
  assert.match(fn, /if \(!resp\) return;/);
  assert.match(fn, /if \(!r\) return;/);
  assert.match(fn, /let inspeccionId = inspeccionHecha\(fila\.id\);/);
  assert.match(fn, /refrescarDespuesDeCaptura\(fila\.id, 'RESPONSIVA', r\.id, false, pdfInspeccion/);
  assert.match(cliente, /const pdf = sesion\.flujo\.sinPdf \? null : llamar\('apiLineasGenerarPdf'/);
});
