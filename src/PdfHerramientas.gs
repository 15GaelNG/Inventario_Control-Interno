/**
 * PdfHerramientas.gs
 * Herramientas del motor único de PDF (docs/pdf-motor.md, fase 1). Solo LEEN: abren cada plantilla y nunca la guardan.
 *
 * ?revisar=plantillas (Code.gs) → los marcadores << >> de cada plantilla en uso (las mismas que revisa
 * revisionPlantillas_: Responsiva, Adherente, Arqueo, las de Líneas y las de MODELOS INSPECCION), con cuántas veces
 * aparece cada uno y qué bloques If cruzan párrafos. Lo pide `node tools/pdf/inventario.js` y lo guarda en
 * tests/fixtures/plantillas-marcadores.json: con eso se prueba que el motor único llena cada marcador real igual que el
 * motor que hoy llena esa plantilla. Solo nombres de columnas y fórmulas: ningún dato de nadie.
 */

/** @return {{ entorno, fecha, plantillas: Array<{ nombre, id, titulo, marcadores: Object<string, number>, ifEntreParrafos: number, parrafos: number, tablas: number }> }} */
function pdfInventarioMarcadores_() {
  // Como revisionEntorno_: con correo y el mismo que corre (el editor o el /dev de quien sube); nadie de fuera
  const activo = String(Session.getActiveUser().getEmail() || '').toLowerCase();
  const efectivo = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!activo || activo !== efectivo) return { error: 'Solo para quien desplegó la app.' };

  const vistas = {};
  const plantillas = revisionPlantillas_().map((p) => {
    if (p.error || !p.id) return { nombre: p.nombre, error: p.error || 'sin ID' };
    if (vistas[p.id]) return { nombre: p.nombre, id: p.id, igualA: vistas[p.id] };   // la misma plantilla en dos tipos
    vistas[p.id] = p.nombre;
    try {
      const doc = DocumentApp.openById(p.id);
      const body = doc.getBody();
      const marcadores = {};
      [body, doc.getHeader(), doc.getFooter()].filter(Boolean).forEach((seccion) => {
        (seccion.getText().match(/<<[\s\S]*?>>/g) || []).forEach((m) => { marcadores[m] = (marcadores[m] || 0) + 1; });
      });
      // Un <<If:…>> cuyo <<EndIf>> no está en el mismo párrafo: el motor de Vehículos hoy no los entiende
      let ifEntreParrafos = 0;
      const parrafos = body.getParagraphs();
      parrafos.forEach((par) => {
        const t = par.getText();
        const abre = (t.match(/<<If:/gi) || []).length;
        const cierra = (t.match(/<<EndIf>>/gi) || []).length;
        if (abre > cierra) ifEntreParrafos += abre - cierra;
      });
      return { nombre: p.nombre, id: p.id, titulo: doc.getName(), marcadores: marcadores, ifEntreParrafos: ifEntreParrafos,
        parrafos: parrafos.length, tablas: body.getTables().length };
    } catch (e) {
      return { nombre: p.nombre, id: p.id, error: e.message };
    }
  });
  return { entorno: (leerConfig_('ENTORNO') || '').trim().toUpperCase(), fecha: new Date().toISOString(), plantillas: plantillas };
}
