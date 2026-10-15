// La pantalla de permisos (app-permisos.html) calcula lo que tiene cada quien para pintarlo al instante; el que manda
// es el servidor (Permisos.resolver_). Con el catálogo en árbol (14-oct) los dos resuelven herencia, tope del módulo,
// excepciones por correo y VIEWER/CLIENT: aquí se corren los dos con los mismos casos y deben decir lo mismo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const leer = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8').replace(/\r/g, '');

/** El servidor: Modulos + PermisosService reales */
function servidor() {
  const ctx = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    CacheService: { getScriptCache: () => ({ get: () => null, put() {}, remove() {} }) },
    SheetUtils: {}, Auth: {}, Config: { SPREADSHEET_IDS: { USUARIOS: () => 'x' } },
  });
  vm.runInContext(leer('src/config/Modulos.gs') + '\n' + leer('src/config/PermisosSemilla.gs') + '\n' +
    leer('src/services/PermisosService.gs') + '\nthis.P = Permisos; this.M = Modulos;', ctx);
  return ctx;
}

/** La pantalla: el bloque de reglas de app-permisos.html (de "reglas" a "piezas de HTML"), con el panel cargado */
function pantalla(panel) {
  const js = leer('src/html/js/app-permisos.html');
  const ini = js.indexOf('    // ---------------------------------------------------------------- reglas');
  const fin = js.indexOf('    // ---------------------------------------------------------------- piezas de HTML');
  assert.ok(ini > 0 && fin > ini, 'bloque de reglas en app-permisos.html');
  const f = new Function('panel', 'PERM_ROLES_TOTALES', require('./formato-fuente') + 'let datos = null; let originales = {};\n' + js.slice(ini, fin) +
    '\ncargar(panel); return { efectivo, deArea };');
  return f(panel, ['ADMIN', 'SUPER']);
}

test('el servidor y la pantalla resuelven igual cada nodo, con herencia y excepciones', () => {
  const { P, M } = servidor();
  const nodos = M.ids();
  // El panel como lo arma Permisos.panel: módulos con sus secciones
  const grupos = M.GRUPOS.map((g) => ({ id: g.id, etiqueta: g.etiqueta, icono: g.icono,
    modulos: g.modulos.map((m) => ({ id: m.id, etiqueta: m.etiqueta, alcance: M.respetaAlcance(m.id),
      secciones: M.secciones(m.id).map((n) => ({ id: n.id, etiqueta: n.etiqueta, icono: n.icono || '', hereda: n.hereda, alcance: M.respetaAlcance(n.id) })) })) }));
  const AREAS = ['CI', 'LINEAS', 'POST VENTA'];
  const CORREOS = ['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com'];
  const NIVELES = ['NINGUNO', 'LECTURA', 'EDICION'];
  let semilla = 7;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  const uno = (lista) => lista[azar(lista.length)];

  for (let caso = 0; caso < 60; caso++) {
    // Reglas al azar: más en módulos, algunas en secciones (incluido Sin acceso que corta la herencia)
    const reglas = [];
    for (let i = 0; i < 40; i++) {
      const quien = azar(3) ? uno(AREAS) : uno(CORREOS);
      reglas.push([quien, uno(nodos), uno(NIVELES), '']);
    }
    // Como la hoja después de guardar (aplicarCambios_ descarta lo que no cuenta) y como lo manda el panel
    // Perfiles (fase 2): dos o tres paquetes al azar, asignados a algunas áreas (las asignaciones primero, para que
    // un "Sin acceso" de un área con perfiles se guarde como en la hoja de verdad)
    const PERFILES = ['Flotilla', 'Consulta', 'Lineas'];
    const asignaciones = [];
    AREAS.forEach((a) => PERFILES.forEach((pf) => { if (!azar(3)) asignaciones.push({ quien: a, modulo: 'perfil:' + pf, permiso: 'ASIGNADO' }); }));
    for (let i = 0; i < 20; i++) reglas.push(['perfil:' + uno(PERFILES), uno(nodos), uno(NIVELES), '']);
    // Fase 3: a veces un perfil limita a "solo lo de su área"
    PERFILES.forEach((pf) => { if (!azar(3)) reglas.push(['perfil:' + pf, '@alcance', 'AREA', '']); });
    const hoja = P.aplicarCambios_(P.aplicarCambios_([], asignaciones, ''), reglas.map((r) => ({ quien: r[0], modulo: r[1], permiso: r[2] })), '');
    // Como lo arma Permisos.panel: las reglas de áreas y personas, y los perfiles aparte
    const panel = { grupos: grupos,
      reglas: hoja.filter((r) => !/^perfil:/i.test(r[0]) && !/^perfil:/i.test(r[1])).map((r) => ({ quien: r[0], modulo: r[1], permiso: r[2], nota: '' })),
      perfiles: JSON.parse(JSON.stringify(P.perfilesDelPanel_(hoja))), personas: [], areas: [], historial: [] };
    const ui = pantalla(panel);
    CORREOS.forEach((correo, i) => {
      const rol = ['USER', 'USER', 'VIEWER', 'CLIENT'][i];
      const u = { CORREO: correo, AREA: AREAS[i % AREAS.length], ROL: rol, ACTIVO: 'TRUE' };
      const srv = P.resolver_(u, hoja, nodos);
      const p = { correo: correo, area: u.AREA, rol: rol };
      const difs = nodos.filter((n) => (srv[n] || 'NINGUNO') !== ui.efectivo(p, n))
        .map((n) => n + ': servidor ' + (srv[n] || 'NINGUNO') + ', pantalla ' + ui.efectivo(p, n));
      assert.equal(difs.length, 0, 'caso ' + caso + ' · ' + correo + ' (' + rol + ', ' + u.AREA + '): ' + difs.join(' | '));
    });
    // Lo de un área sola (sin correo): la ficha de área y la matriz
    AREAS.forEach((area) => {
      const srv = P.resolver_({ CORREO: 'nadie@x.com', AREA: area, ROL: 'USER', ACTIVO: 'TRUE' }, hoja.filter((r) => r[0].indexOf('@') === -1), nodos);
      nodos.forEach((n) => assert.equal(ui.deArea(area, n), srv[n] || 'NINGUNO', 'caso ' + caso + ' · área ' + area + ' · ' + n));
    });
  }
});
