/**
 * Pruebas de comportamiento del DataTable (+ Iconos, Notificar y Confirmar) en un navegador simulado (jsdom).
 * Usan los componentes REALES de src/html/js/componentes. Correr con:  npm test
 *
 * Para probar también con los íconos reales de Lucide (opcional):
 *   LUCIDE=ruta/a/lucide.min.js npm test      (el mismo archivo que carga Index.html)
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SRC = path.join(__dirname, '..', 'src', 'html', 'js', 'componentes');
const scriptDe = (archivo) => {
  const html = fs.readFileSync(path.join(SRC, archivo), 'utf8');
  return html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
};

const dom = new JSDOM('<!doctype html><body><div id="t"></div></body>', { url: 'https://prueba.local/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;
window.CSS = { escape: (s) => String(s).replace(/["\\]/g, '\\$&') };
if (process.env.LUCIDE) window.eval(fs.readFileSync(process.env.LUCIDE, 'utf8'));
window.eval(['iconos.html', 'notificar.html', 'confirmar.html', 'datatable.html'].map(scriptDe).join('\n') +
  '\nwindow.DataTable = DataTable; window.Confirmar = Confirmar; window.Notificar = Notificar; window.Iconos = Iconos;');
let exportado = null;
window.ExportarExcel = { descargar: async (opciones) => { exportado = opciones; } };

const doc = window.document;
const $ = (s) => doc.querySelector(s);
const $$ = (s) => Array.from(doc.querySelectorAll(s));
const esperar = (ms = 0) => new Promise((r) => setTimeout(r, ms));
let fallas = 0;
const ok = (cond, texto) => { console.log((cond ? '  ✔ ' : '  ✘ ') + texto); if (!cond) fallas++; };
const click = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const cambiar = (el, checked) => { el.checked = checked; el.dispatchEvent(new window.Event('change', { bubbles: true })); };

(async () => {
  const datos = Array.from({ length: 60 }, (_, i) => ({
    ID: 'id' + i, FOLIO: 'F' + String(i).padStart(3, '0'), DIAS: i - 10,
    FECHA: `2026-0${1 + (i % 9)}-15`, ESTADO: i % 3 === 0 ? 'Vencida' : 'Vigente',
  }));
  let eliminados = null;
  let editado = null;
  const historialEdiciones = [];

  const tabla = window.DataTable.crear($('#t'), {
    idCampo: 'ID', tamanoPagina: 25, umbralPalabraClave: 10,
    etiquetaFila: (f) => f.FOLIO,
    columnas: [
      { campo: 'FOLIO', titulo: 'Folio', editable: true },
      { campo: 'DIAS', titulo: 'Días', tipo: 'numero' },
      { campo: 'FECHA', titulo: 'Fecha', tipo: 'fecha', editable: true },
      { campo: 'ESTADO', titulo: 'Estado', tipo: 'lista', editable: 'panel' },
    ],
    alEditar: async (fila, campo, valor) => {
      editado = { id: fila.ID, campo, valor };
      historialEdiciones.push(editado);
      return Object.assign({}, fila, { [campo]: valor });
    },
    alEliminar: async (filas) => { eliminados = filas.map((f) => f.ID); },
  });

  console.log('1. Estado de carga');
  ok($$('.dt-skel').length > 0, 'muestra filas skeleton antes de tener datos');
  ok(!$('tbody').textContent.includes('Sin registros'), 'NO dice "Sin registros" mientras carga');
  ok($('.dt-resumen').textContent === 'Cargando…', 'pie dice "Cargando…"');
  tabla.setError('Falló la red');
  ok($('.dt-vacio.dt-error') && $('.dt-vacio').textContent.includes('Falló la red'), 'setError muestra el error en la tabla');
  tabla.setDatos(datos);
  ok($$('.dt-skel').length === 0 && $$('tbody tr').length === 25, 'setDatos quita skeleton y pinta 25 filas');

  console.log('2. Seleccionar todo (patrón Gmail)');
  cambiar($('.dt-check-pagina'), true);
  ok(tabla.getSeleccion().length === 25, 'el check del encabezado selecciona SOLO la página (25)');
  ok(!$('.dt-banner').hidden && $('.dt-banner').textContent.includes('Seleccionar los 60'), 'aparece el aviso "Seleccionar los 60 registros"');
  click($('[data-seleccionar-todos]'));
  ok(tabla.getSeleccion().length === 60, 'al aceptar el aviso se seleccionan los 60');
  ok($('.dt-banner').textContent.includes('Los 60 registros'), 'el aviso cambia a "Los 60 registros están seleccionados"');
  click($('[data-quitar-seleccion]'));
  ok(tabla.getSeleccion().length === 0, '"Quitar selección" limpia');

  console.log('3. Chips de filtros + la selección se ajusta al filtrar');
  cambiar($('.dt-check-pagina'), true);                                  // 25 seleccionados
  tabla.setFiltro('DIAS', { op: '<', v1: '5' });                         // DIAS < 5 → i < 15 → 15 filas
  ok($$('tbody tr').length === 15, 'filtro numérico "< 5" deja 15 filas');
  ok($('.dt-filtros-activos').textContent.includes('Días < 5'), 'chip "Días < 5" visible');
  ok(tabla.getSeleccion().length === 15, 'se soltaron los seleccionados que ya no se ven (25 → 15)');
  tabla.setFiltro('ESTADO', { valores: ['Vencida'] });
  ok($('.dt-filtros-activos').textContent.includes('Estado: Vencida'), 'chip "Estado: Vencida" visible');
  tabla.setFiltro('FECHA', { op: 'entre', v1: '2026-01-01', v2: '2026-03-31' });
  ok($('.dt-filtros-activos').textContent.includes('Fecha entre 01/01/2026 y 31/03/2026'), 'chip de fecha legible');
  click($('[data-quitar-filtro="FECHA"]'));
  ok(!$('.dt-filtros-activos').textContent.includes('Fecha'), '✕ del chip quita ese filtro');
  click($('[data-limpiar-todo]'));
  ok($('.dt-filtros-activos').hidden && $$('tbody tr').length === 25, '"Limpiar todo" quita filtros');

  console.log('4. Eliminar con confirmación según riesgo');
  tabla.limpiarSeleccion();
  click($$('.dt-check')[0]);
  click($$('.dt-check')[1]);
  click($('.dt-btn-eliminar'));
  await esperar();
  ok($('.confirmar-card') && $('.confirmar-card h3').textContent === '¿Eliminar 2 registros?', 'modal propio "¿Eliminar 2 registros?"');
  ok($$('.confirmar-detalle li').length === 2, 'lista QUÉ se va a borrar (2 folios)');
  ok(!$('#confirmar-clave'), 'con 2 no pide escribir ELIMINAR');
  click($('[data-accion="cancelar"]'));
  await esperar();
  ok(!$('.confirmar-card') && eliminados === null, 'Cancelar no borra nada');

  click($('[data-seleccionar-todos]') || $('.dt-check-pagina'));       // intentar muchos
  cambiar($('.dt-check-pagina'), true);
  const nSel = tabla.getSeleccion().length;
  click($('.dt-btn-eliminar'));
  await esperar();
  ok(!!$('#confirmar-clave') && $('[data-accion="confirmar"]').disabled, `con ${nSel} (≥10) pide escribir ELIMINAR y el botón inicia deshabilitado`);
  const clave = $('#confirmar-clave');
  clave.value = 'eliminar'; clave.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok(!$('[data-accion="confirmar"]').disabled, 'al escribir "eliminar" se habilita');
  click($('[data-accion="confirmar"]'));
  await esperar(10);
  ok(Array.isArray(eliminados) && eliminados.length === nSel, `alEliminar recibió ${nSel} filas`);
  ok(tabla.getDatos().length === 60 - nSel, 'las filas desaparecen de la tabla');
  ok($$('.toast-exito').length > 0, 'toast de éxito (no alert)');

  console.log('5. Panel de detalle + edición');
  click($$('.dt-btn-ver')[0]);
  const idPanel = $$('tbody tr')[0].dataset.id;
  ok(!!$('.dt-panel') && $$('.dt-panel .dt-campo').length === 4, 'panel abierto con los 4 campos');
  ok($$('.dt-panel .dt-btn-editar-campo').length === 3, 'en el panel: 2 editables en celda + 1 "solo panel" tienen ✏️ Editar');
  click($('.dt-panel .dt-campo[data-campo="FOLIO"] .dt-btn-editar-campo'));
  const input = $('.dt-panel .dt-campo[data-campo="FOLIO"] input');
  ok(!!input, 'aparece el campo para editar dentro del panel');
  input.value = 'NUEVO';
  click($('.dt-panel .dt-campo[data-campo="FOLIO"] button'));
  await esperar(10);
  ok(editado && editado.campo === 'FOLIO' && editado.valor === 'NUEVO' && editado.id === idPanel, 'alEditar recibió el cambio desde el panel');
  ok($('.dt-panel .dt-campo[data-campo="FOLIO"]').textContent.includes('NUEVO'), 'el panel muestra el valor nuevo');
  ok(Array.from($$('tbody td[data-campo="FOLIO"]')).some((td) => td.firstChild && td.firstChild.textContent === 'NUEVO'), 'la tabla también se actualizó');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(!$('.dt-panel'), 'Esc cierra el panel');

  console.log('7. Edición en celda (explícita, cancelable, con deshacer)');
  const celda = () => $$('tbody tr')[1].querySelector('td[data-campo="FECHA"]');
  const idFila = $$('tbody tr')[1].dataset.id;
  const fechaOriginal = tabla.getDatos().find((f) => f.ID === idFila).FECHA;
  ok(!!celda().querySelector('.dt-btn-editar-celda'), 'celda editable tiene botón ✏️ real (accesible con Tab)');
  ok(!$$('tbody tr')[1].querySelector('td[data-campo="ESTADO"] .dt-btn-editar-celda'), 'columna editable:"panel" NO tiene ✏️ en la celda');

  click(celda().querySelector('.dt-btn-editar-celda'));
  ok(!!celda().querySelector('.dt-editor input[type="date"]') && celda().querySelectorAll('.dt-editor button').length === 2, 'un clic en ✏️ abre editor con ✓ y ✕');
  const n0 = historialEdiciones.length;
  let control = celda().querySelector('.dt-editor input');
  control.value = '2030-01-01';
  control.blur(); doc.body.focus();
  await esperar(10);
  ok(historialEdiciones.length === n0 && !celda().querySelector('.dt-editor'), 'salir de la celda sin confirmar CANCELA (no guarda)');
  ok(tabla.getDatos().find((f) => f.ID === idFila).FECHA === fechaOriginal, 'el valor sigue siendo el original');

  click(celda().querySelector('.dt-btn-editar-celda'));
  control = celda().querySelector('.dt-editor input');
  control.value = '2030-01-01';
  control.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await esperar(10);
  ok(historialEdiciones.length === n0 && !celda().querySelector('.dt-editor'), 'Esc cancela');

  celda().dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  control = celda().querySelector('.dt-editor input');
  ok(!!control, 'doble clic sigue funcionando como atajo');
  control.value = '2030-01-01';
  control.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await esperar(10);
  ok(historialEdiciones.length === n0 + 1 && editado.valor === '2030-01-01', 'Enter guarda y llama alEditar');
  ok(celda().textContent.includes('01/01/2030'), 'la celda muestra 01/01/2030');
  const deshacer = $$('.toast button').filter((b) => b.textContent === 'Deshacer').pop();   // el aviso más reciente
  ok(!!deshacer, 'el aviso de guardado ofrece "Deshacer"');
  click(deshacer);
  await esperar(10);
  ok(editado.valor === fechaOriginal && celda().textContent.includes(fechaOriginal.split('-').reverse().join('/')), 'Deshacer restaura el valor anterior');

  console.log('8. Pantalla táctil: tocar la fila abre el detalle');
  window.matchMedia = () => ({ matches: true });
  click($$('tbody tr')[2].querySelector('td[data-campo="DIAS"]'));
  ok(!!$('.dt-panel'), 'tocar una celda normal abre el panel');
  doc.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  click($$('.dt-check')[2]);
  ok(!$('.dt-panel'), 'tocar la casilla de selección NO abre el panel');
  window.matchMedia = () => ({ matches: false });

  console.log('6. Accesibilidad básica');
  ok($$('th[aria-sort]').length === 4, 'encabezados con aria-sort');
  ok(!!$('.toast-contenedor[aria-live="polite"]'), 'toasts anunciados (aria-live)');
  ok($$('td.dt-num').length > 0, 'columna numérica alineada a la derecha (dt-num)');

  // ======================= Mejoras "calidad de vida" =======================
  console.log('9. Shift+clic selecciona rango');
  tabla.limpiarFiltros(); tabla.limpiarSeleccion();
  const clickShift = (el) => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, shiftKey: true }));
  click($$('.dt-check')[2]);
  clickShift($$('.dt-check')[7]);
  ok(tabla.getSeleccion().length === 6, 'clic en fila 3 + Shift+clic en fila 8 → 6 seleccionadas');
  clickShift($$('.dt-check')[4]);
  ok(tabla.getSeleccion().length === 2, 'Shift+clic sobre un rango marcado desmarca ese tramo (6 → 2)');
  $$('.dt-check')[0].focus();
  doc.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  ok(tabla.getSeleccion().length === 0, 'Esc (con foco en la tabla) quita la selección');

  console.log('10. Copiar seleccionados (Ctrl+C) como texto para Excel');
  click($$('.dt-check')[0]); click($$('.dt-check')[1]);
  const tsv = tabla.textoSeleccion().split('\n');
  ok(tsv.length === 3 && tsv[0] === 'Folio\tDías\tFecha\tEstado', 'encabezados separados por tabulador + 2 filas');
  ok(/^F\d{3}|NUEVO/.test(tsv[1]) && tsv[1].split('\t').length === 4, 'cada fila con 4 columnas');
  ok(!$('.dt-btn-copiar').hidden, 'botón "📋 Copiar" visible con selección');
  tabla.limpiarSeleccion();

  console.log('11. Orden múltiple (Shift+clic en encabezado)');
  const tituloDe = (campo) => $(`.dt-th-titulo[data-campo="${campo}"]`);
  click(tituloDe('ESTADO'));
  clickShift(tituloDe('DIAS'));
  clickShift(tituloDe('DIAS'));   // DIAS desc
  ok(JSON.stringify(tabla.getVista().orden) === '[{"campo":"ESTADO","dir":"asc"},{"campo":"DIAS","dir":"desc"}]', 'orden: Estado asc, luego Días desc');
  ok(!!$('.dt-orden sub'), 'muestra el número de prioridad (▲1 ▼2)');
  const primeras = $$('tbody tr').slice(0, 3).map((tr) => tr.querySelector('td[data-campo="ESTADO"]').textContent + '|' + tr.querySelector('td[data-campo="DIAS"]').textContent);
  ok(primeras[0].startsWith('Vencida') && Number(primeras[0].split('|')[1].replace(/,/g, '')) > Number(primeras[1].split('|')[1].replace(/,/g, '')), 'filas ordenadas por Estado y dentro por Días desc');
  click(tituloDe('FOLIO'));
  ok(tabla.getVista().orden.length === 1, 'clic normal vuelve a orden por una sola columna');

  console.log('12. Búsqueda sin acentos + resaltado');
  tabla.setDatos(tabla.getDatos().concat([{ ID: 'acento', FOLIO: 'VEHÍCULO Ñandú', DIAS: 1, FECHA: '2026-01-01', ESTADO: 'Vigente' }]));
  const buscar = $('.dt-buscar');
  buscar.value = 'vehiculo nandu'; buscar.dispatchEvent(new window.Event('input', { bubbles: true }));
  ok($$('tbody tr[data-id]').length === 1, '"vehiculo nandu" encuentra "VEHÍCULO Ñandú"');
  ok(($('tbody mark') || {}).textContent === 'VEHÍCULO Ñandú', 'la coincidencia se resalta con <mark> conservando acentos');
  buscar.value = ''; buscar.dispatchEvent(new window.Event('input', { bubbles: true }));

  console.log('13. Atajos de fecha y "solo este valor"');
  click($('.dt-btn-filtro[data-campo="FECHA"]'));
  ok($$('.dt-popover [data-preset]').length === 6, 'filtro de fecha ofrece 6 atajos');
  click($('.dt-popover [data-preset="ult7"]'));
  ok($('.dt-filtros-activos').textContent.includes('Fecha entre'), 'atajo "Últimos 7 días" aplica un rango');
  tabla.limpiarFiltros();
  click($('.dt-btn-filtro[data-campo="ESTADO"]'));
  click($('.dt-popover [data-solo="Vencida"]'));
  ok($('.dt-filtros-activos').textContent.includes('Estado: Vencida') && !$('.dt-popover'), '"solo" filtra por ese valor y cierra el menú');
  tabla.limpiarFiltros();

  console.log('14. Vista: mover, fijar, ocultar, densidad, recordar y restablecer');
  let caja2 = null;
  const vista2 = () => window.DataTable.crear((caja2 = doc.body.appendChild(doc.createElement('div'))), {
    idCampo: 'ID', idTabla: 'prueba-vista', columnas: [
      { campo: 'A', titulo: 'A' }, { campo: 'B', titulo: 'B', tipo: 'numero', agregado: 'suma' }, { campo: 'C', titulo: 'C', fijada: true },
    ],
  });
  window.localStorage.clear();
  let t2 = vista2();
  t2.setDatos([{ ID: 1, A: 'x', B: 10, C: 'c1' }, { ID: 2, A: 'y', B: 5.5, C: 'c2' }]);
  const orden2 = () => Array.from(caja2.querySelectorAll('th[data-col]')).map((th) => th.dataset.col).join(',');
  ok(orden2() === 'C,A,B', 'columna con fijada:true aparece primero');
  t2.moverColumna('B', 'A');
  ok(orden2() === 'C,B,A', 'moverColumna(B, antes de A)');
  t2.fijarColumna('C', false);
  t2.ocultarColumna('A');
  t2.setDensidad('compacta');
  ok(orden2() === 'B,C' && caja2.querySelector('.dt').classList.contains('dt-densidad-compacta'), 'desfijar, ocultar y densidad aplicados');
  ok(caja2.querySelector('tfoot').textContent.includes('15.5'), 'fila de totales: Σ 15.5');
  t2.destruir();
  t2 = vista2();   // simula volver a entrar
  t2.setDatos([]);
  ok(JSON.stringify(t2.getVista().ordenColumnas) === '["B","A","C"]' && t2.getVista().ocultas.join() === 'A' && t2.getVista().densidad === 'compacta', 'la vista se RECUERDA al volver a crear la tabla');
  t2.restablecerVista();
  ok(t2.getVista().ocultas.length === 0 && t2.getVista().fijadas.join() === 'C' && t2.getVista().densidad === 'normal', '"Restablecer vista" regresa a lo original');
  t2.destruir();

  console.log('15. Ctrl+Z deshace la última edición');
  const celdaFecha = $$('tbody tr')[0].querySelector('td[data-campo="FECHA"]');
  const idZ = $$('tbody tr')[0].dataset.id;
  const antesZ = tabla.getDatos().find((f) => f.ID === idZ).FECHA;
  click(celdaFecha.querySelector('.dt-btn-editar-celda'));
  const ctl = $$('tbody tr')[0].querySelector('.dt-editor input');
  ctl.value = '2031-05-05';
  ctl.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await esperar(10);
  doc.body.focus();
  doc.body.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
  await esperar(10);
  ok(tabla.getDatos().find((f) => f.ID === idZ).FECHA === antesZ, 'Ctrl+Z restauró la fecha anterior');

  console.log('16. Paginación y carga al refrescar');
  click($('.dt-ultima'));
  ok($('.dt-pagina').textContent.startsWith($('.dt-pagina').textContent.split(' / ')[1]), '» lleva a la última página');
  click($('.dt-primera'));
  ok($('.dt-pagina').textContent.startsWith('1 /'), '« lleva a la primera página');
  tabla.setCargando(true);
  ok(!$('.dt-barra-carga').hidden && $$('.dt-skel').length === 0 && $$('tbody tr[data-id]').length > 0, 'refrescar con datos: barra de carga, SIN borrar las filas');
  tabla.setDatos(tabla.getDatos());
  ok($('.dt-barra-carga').hidden, 'la barra se quita al llegar los datos');

  // ======================= Acciones visibles y extensibilidad =======================
  const cerrarConfirmar = async (accion) => { click($(`[data-accion="${accion}"]`)); await esperar(10); };

  console.log('17. Eliminar desde la fila (sin tener que seleccionar)');
  tabla.limpiarFiltros(); tabla.limpiarSeleccion();
  const botonesFila = $$('tbody tr')[0].querySelectorAll('.dt-col-acciones button');
  ok(botonesFila.length === 2 && !!$$('tbody tr')[0].querySelector('.dt-btn-eliminar-fila'), 'cada fila muestra "Ver detalle" y "Eliminar" en la columna Acciones');
  ok($('thead .dt-col-acciones') && $('thead .dt-col-acciones').textContent === 'Acciones', 'la columna se llama "Acciones"');
  const idBorrar = $$('tbody tr')[0].dataset.id;
  const folioBorrar = tabla.getDatos().find((f) => f.ID === idBorrar).FOLIO;
  eliminados = null;
  click($$('tbody tr')[0].querySelector('.dt-btn-eliminar-fila'));
  await esperar();
  ok($('.confirmar-card h3').textContent === '¿Eliminar este registro?' && $('.confirmar-mensaje').textContent.includes(folioBorrar), 'pide confirmar nombrando el registro');
  await cerrarConfirmar('confirmar');
  ok(eliminados && eliminados.length === 1 && eliminados[0] === idBorrar, 'alEliminar recibió solo esa fila');
  ok(!tabla.getDatos().some((f) => f.ID === idBorrar), 'la fila desapareció');

  console.log('18. Eliminar desde el panel de detalle');
  const idPanel2 = $$('tbody tr')[0].dataset.id;
  click($$('tbody tr')[0].querySelector('.dt-btn-ver'));
  ok(!!$('.dt-panel .dt-btn-eliminar-detalle'), 'el panel tiene "Eliminar registro"');
  click($('.dt-panel .dt-btn-eliminar-detalle'));
  await esperar();
  await cerrarConfirmar('confirmar');
  ok(!$('.dt-panel') && eliminados[0] === idPanel2, 'elimina y cierra el panel');

  console.log('19. Sin permiso: casillas para copiar y el motivo a la vista');
  const caja3 = doc.body.appendChild(doc.createElement('div'));
  const t3 = window.DataTable.crear(caja3, {
    idCampo: 'ID', motivoSinEliminar: 'Eliminar es solo para administradores',
    columnas: [{ campo: 'A', titulo: 'A' }],
  });
  t3.setDatos([{ ID: 1, A: 'x' }, { ID: 2, A: 'y' }]);
  ok(!caja3.querySelector('.dt-btn-eliminar-fila') && !caja3.querySelector('.dt-btn-eliminar'), 'sin alEliminar no hay botones de eliminar');
  click(caja3.querySelectorAll('.dt-check')[0]);
  ok(caja3.querySelector('.dt-seleccion-info').textContent.includes('solo para administradores'), 'al seleccionar, la barra dice por qué no se puede eliminar');
  ok(!caja3.querySelector('.dt-btn-copiar').hidden, 'copiar sí está disponible');
  t3.destruir();

  console.log('20. Acciones propias del módulo (por fila y masivas)');
  const caja4 = doc.body.appendChild(doc.createElement('div'));
  let accionFila = null;
  let accionMasiva = null;
  let terminarMasiva;
  const t4 = window.DataTable.crear(caja4, {
    idCampo: 'ID', detalle: false,
    columnas: [{ campo: 'A', titulo: 'A' }],
    accionesFila: [{ icono: 'car', titulo: 'Ver vehículo', visible: (f) => f.A !== 'y', alHacer: (f) => { accionFila = f.ID; } }],
    accionesSeleccion: [{ icono: 'mail', texto: 'Avisar', alHacer: (filas) => new Promise((r) => { accionMasiva = filas.map((f) => f.ID); terminarMasiva = r; }) }],
  });
  t4.setDatos([{ ID: 1, A: 'x' }, { ID: 2, A: 'y' }]);
  const filas4 = caja4.querySelectorAll('tbody tr');
  ok(filas4[0].querySelectorAll('.dt-col-acciones button').length === 1 && filas4[1].querySelectorAll('.dt-col-acciones button').length === 0, 'visible(fila) decide en qué filas aparece');
  click(filas4[0].querySelector('.dt-col-acciones button'));
  ok(accionFila === '1' || accionFila === 1, 'la acción recibe su fila');
  const botonAvisar = Array.from(caja4.querySelectorAll('.dt-toolbar button')).find((b) => b.textContent.includes('Avisar'));
  ok(botonAvisar && botonAvisar.hidden, 'la acción masiva se esconde sin selección');
  cambiar(caja4.querySelector('.dt-check-pagina'), true);
  ok(!botonAvisar.hidden, 'aparece al seleccionar');
  click(botonAvisar);
  await esperar();
  ok(JSON.stringify(accionMasiva) === '[1,2]' && botonAvisar.disabled && botonAvisar.textContent === 'Procesando…', 'recibe las filas y el botón muestra "Procesando…"');
  terminarMasiva();
  await esperar(10);
  ok(!botonAvisar.disabled && botonAvisar.textContent.includes('Avisar'), 'al terminar, el botón vuelve a la normalidad');
  t4.destruir();

  console.log('21. Tipo de columna nuevo (registrarTipo)');
  window.DataTable.registrarTipo('moneda', {
    hereda: 'numero',
    formatear: (v) => (v === null || v === undefined || v === '' ? '' : '$' + Number(v).toLocaleString('es-MX', { minimumFractionDigits: 2 })),
  });
  ok(window.DataTable.tipos().join() === 'texto,numero,fecha,lista,moneda', 'queda registrado junto a los de fábrica');
  const caja5 = doc.body.appendChild(doc.createElement('div'));
  const t5 = window.DataTable.crear(caja5, {
    idCampo: 'ID', exportar: { nombreArchivo: 'Gastos' },
    columnas: [{ campo: 'M', titulo: 'Monto', tipo: 'moneda', agregado: 'suma' }],
  });
  t5.setDatos([{ ID: 1, M: 1500 }, { ID: 2, M: 20 }, { ID: 3, M: 300 }]);
  ok(caja5.querySelector('tbody td[data-campo="M"]').textContent === '$1,500.00', 'usa su propio formato');
  ok(caja5.querySelector('tbody td[data-campo="M"]').classList.contains('dt-num'), 'hereda la alineación a la derecha');
  t5.setFiltro('M', { op: '>', v1: '100' });
  ok(caja5.querySelectorAll('tbody tr').length === 2 && caja5.querySelector('.dt-filtros-activos').textContent.includes('Monto > 100'), 'hereda los filtros numéricos');
  click(caja5.querySelector('.dt-btn-excel'));
  await esperar(10);
  ok(exportado && exportado.columnas[0].tipo === 'numero' && exportado.filas.length === 2, 'se exporta a Excel como número');
  let error = null;
  try { window.DataTable.registrarTipo('x', { hereda: 'no-existe' }); } catch (e) { error = e; }
  ok(error && error.message.includes('no-existe'), 'heredar de un tipo inexistente avisa con un error claro');
  t5.destruir();

  console.log('22. Una columna editable Y fijada se queda fija (choque de estilos)');
  // .dt td.dt-editable pone position:relative para el lápiz y .dt .dt-fija pone sticky.
  // Si gana relative, la columna deja de fijarse y al hacer scroll horizontal se encima
  // sobre las de la izquierda (pasaba con SERIE SENSOR en Sensores).
  const estilos = fs.readFileSync(path.join(SRC, 'datatable.html'), 'utf8');
  const css = estilos.slice(estilos.indexOf('<style>') + 7, estilos.indexOf('</style>'));
  const hojaEstilos = doc.createElement('style');
  hojaEstilos.textContent = css;
  doc.head.appendChild(hojaEstilos);
  const celdaCon = (clases) => {
    const caja = doc.createElement('div');
    caja.className = 'dt';
    caja.innerHTML = `<table><tbody><tr><td class="${clases}">x</td></tr></tbody></table>`;
    doc.body.appendChild(caja);
    const td = caja.querySelector('td');
    const posicion = window.getComputedStyle(td).position;
    caja.remove();
    return posicion;
  };
  ok(celdaCon('dt-editable') === 'relative', 'celda editable sola: relative (ancla del botón ✏️)');
  ok(celdaCon('dt-fija') === 'sticky', 'celda fijada sola: sticky');
  ok(celdaCon('dt-editable dt-fija') === 'sticky', 'editable + fijada: sticky (si no, se encima al hacer scroll)');

  console.log('23. Íconos');
  ok(window.Iconos.svg('editar') !== '' && window.Iconos.svg('no-existe-este-icono') === '', 'Iconos.svg da algo para los conocidos y nada para los desconocidos');
  if (process.env.LUCIDE) {
    ok(window.Iconos.svg('editar').startsWith('<svg') && window.Iconos.svg('car').startsWith('<svg'), 'con Lucide cargado: SVG real (nombre propio o de lucide.dev)');
    ok(!!$('tbody .dt-btn-ver svg'), 'los botones de la tabla usan el SVG');
  } else {
    ok(window.Iconos.svg('editar').includes('✏️'), 'sin Lucide: emoji de respaldo');
  }

  console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
  process.exit(fallas ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e); process.exit(1); });
