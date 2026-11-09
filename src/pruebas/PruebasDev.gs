/**
 * PruebasDev.gs — las pruebas que se corren desde el EDITOR de un DEV contra el Drive y las hojas reales de ese proyecto
 * (6-nov). Las de `tests/` (npm test) usan un Apps Script de mentira; estas confirman lo mismo con Google de verdad sin
 * capturar nada a mano. En producción no corren.
 *
 * El editor solo corre funciones sueltas, así que cada prueba es una `prueba<Algo>()` y todas usan el mismo motor:
 *
 *   function pruebaAlgo() {
 *     soloEditor_();
 *     return PruebasDev.correr('Algo', (paso) => {
 *       paso('lo que se revisa', () => valor, /lo que debe decir/);   // ✔ si el valor coincide (o si no hay patrón)
 *     });
 *   }
 *
 * Cada paso dice ✔ o ✘, cuánto tardó y su valor; al final, cuántos fallaron. Una prueba deja todo como estaba: lo que
 * crea lo manda a la papelera. Una prueba nueva se agrega a la lista de `pruebasTodas()`.
 */
const PruebasDev = (function () {
  function correr(nombre, cuerpo) {
    if (Config.ENTORNO === 'PROD') throw new Error('Las pruebas del editor solo corren en un DEV: crean y borran cosas de prueba.');
    const lineas = [];
    let fallas = 0;
    const paso = (titulo, fn, esperado) => {
      const t = Date.now();
      try {
        const r = fn();
        const ok = !esperado || esperado.test(String(r));
        if (!ok) fallas++;
        lineas.push((ok ? '✔ ' : '✘ ') + titulo + ' · ' + (Date.now() - t) + ' ms' + (r !== undefined ? ' · ' + r : '') +
          (ok ? '' : ' (se esperaba ' + esperado + ')'));
      } catch (e) {
        fallas++;
        lineas.push('✘ ' + titulo + ' · ' + e.message);
      }
    };
    const t0 = Date.now();
    cuerpo(paso);
    const texto = '== ' + nombre + ': ' + (fallas ? fallas + ' con error' : 'todo bien') + ' (' + (Date.now() - t0) + ' ms)\n' +
      lineas.join('\n');
    console.log(texto);
    return texto;
  }

  /** Ruta legible de una carpeta de Drive, subiendo hasta 10 niveles */
  function ruta(carpeta) {
    const partes = [];
    for (let x = carpeta, n = 0; x && n < 10; n++) {
      partes.unshift(x.getName());
      const padres = x.getParents();
      x = padres.hasNext() ? padres.next() : null;
    }
    return partes.join('/');
  }

  return { correr, ruta };
})();

/** Todas las pruebas del editor, una tras otra */
function pruebasTodas() {
  soloEditor_();
  return [pruebaExpediente, pruebaSesiones].map((f) => f()).join('\n\n');
}

/**
 * Expediente.gs (carpetas de Drive de Vehículos y Líneas): con un NUCO 9999 y una línea de prueba crea lo que crean las
 * capturas (inspección y responsiva de un equipo, responsiva de una línea sin equipo, inspección de un vehículo y dos
 * responsivas vehiculares para ver que la vieja pase a RESPONSIVAS ANTERIORES), revisa las rutas, mide cada paso y al
 * final manda a la papelera lo que creó. No toca hojas ni genera PDF. Repite la captura con el NUCO ya existente, sin y
 * con la memoria del motor (fase 2): ese par de tiempos es el antes y el después.
 */
function pruebaExpediente() {
  soloEditor_();
  const NUCO = '9999';
  const LINEA = 'LIN-PRUEBA-EXPEDIENTE';
  const NUMERO = '0000000000';
  return PruebasDev.correr('Expediente (carpetas de Drive)', (paso) => {
    // Lo que ya existía no se borra al final
    const habia = {
      equipo: Expediente.idActivo('equipo', NUCO),
      vehiculo: Expediente.idActivo('vehiculo', NUCO),
      linea: Expediente.idActivo('linea', LINEA),
    };
    paso('equipo: inspección del día', () => LineasArchivos.carpetaEvidenciaNuco('INSPECCION', NUCO, new Date()).ruta,
      /^0?9999\/INSPECCIONES\/\d{4}\/\S+ CUATRIMESTRE\/[A-Z]+\/INSP \d\d \d\d/);
    paso('equipo: responsiva del día', () => {
      const c = LineasArchivos.carpetaEvidenciaNuco('RESPONSIVA', NUCO, new Date());
      return c.ruta + (LineasArchivos.enNucos(c.carpetaId) ? ' · en NUCOS' : ' · ¡FUERA DE NUCOS!');
    }, /CARTA RESPONSIVA\/\d{4}\/RESP \d\d \d\d.* · en NUCOS$/);
    paso('línea sin equipo: responsiva del día', () => {
      const c = LineasArchivos.carpetaEvidenciaLinea(LINEA, NUMERO, new Date());
      return c.ruta + (LineasArchivos.enLineas(c.carpetaId) ? ' · en LINEAS' : ' · ¡FUERA DE LINEAS!');
    }, /^LINEAS\/0000000000\/CARTA RESPONSIVA\/\d{4}\/RESP \d\d \d\d.* · en LINEAS$/);
    paso('vehículo: carpeta de la inspección', () => PruebasDev.ruta(ExpedienteNuco.carpetaInspeccion(NUCO, new Date())),
      /\/9999\/4\.-INSPECCIONES\/\d{4}\/\S+ TRIMESTRE$/);
    paso('vehículo: dos responsivas, la vieja pasa a ANTERIORES', () => {
      const tmp = Expediente.carpetaActivo('vehiculo', NUCO);
      [1, 2].forEach((n) => ExpedienteNuco.archivar(
        DriveUtils.crearArchivo(tmp, Utilities.newBlob('prueba ' + n, 'text/plain', 'r' + n + '.txt')), NUCO, 'RESPONSIVA'));
      const r = ExpedienteNuco.listar(NUCO).documentos.filter((d) => d.clave === 'RESPONSIVA')[0];
      return 'vigentes ' + r.vigentes.length + ', anteriores ' + r.anteriores.reduce((k, g) => k + g.archivos.length, 0);
    }, /^vigentes 1, anteriores 1$/);
    // La captura de todos los días: el NUCO, su año y su rama ya existen. Primero sin memoria (como antes de la fase 2)
    // y luego con ella; «y su raíz» es lo que pregunta el PDF de Líneas antes de guardar (enLineas / enNucos).
    [false, true].forEach((conMemoria) => {
      const como = conMemoria ? 'con memoria' : 'sin memoria';
      Expediente.memoria(conMemoria);
      try {
        paso('otra vez, ' + como + ': responsiva de equipo y su raíz', () => {
          const c = LineasArchivos.carpetaEvidenciaNuco('RESPONSIVA', NUCO, new Date());
          return (LineasArchivos.enLineas(c.carpetaId) ? 'LINEAS' : LineasArchivos.enNucos(c.carpetaId) ? 'NUCOS' : '¿?') + ' · ' + c.ruta;
        }, /^NUCOS · /);
        paso('otra vez, ' + como + ': responsiva de línea y su raíz', () => {
          const c = LineasArchivos.carpetaEvidenciaLinea(LINEA, NUMERO, new Date());
          return (LineasArchivos.enLineas(c.carpetaId) ? 'LINEAS' : '¿?') + ' · ' + c.ruta;
        }, /^LINEAS · /);
        paso('otra vez, ' + como + ': carpeta de la inspección del vehículo', () =>
          PruebasDev.ruta(ExpedienteNuco.carpetaInspeccion(NUCO, new Date())), /\/9999\/4\.-INSPECCIONES\//);
      } finally {
        Expediente.memoria(true);
      }
    });
    paso('mapa: los tres activos se encuentran', () => ['equipo', 'vehiculo'].map((t) => t + ' ' + (Expediente.idActivo(t, NUCO) ? 'sí' : 'NO'))
      .concat('linea ' + (Expediente.idActivo('linea', LINEA) ? 'sí' : 'NO')).join(', '), /^equipo sí, vehiculo sí, linea sí$/);
    // Limpieza: a la papelera solo lo que creó la prueba
    paso('limpieza', () => Object.keys(habia).filter((t) => !habia[t]).map((t) => {
      const id = Expediente.idActivo(t, t === 'linea' ? LINEA : NUCO);
      if (id) DriveUtils.aPapelera(DriveApp.getFolderById(id));
      Expediente.olvidarActivos(t);
      return t;
    }).join(', ') || 'nada (ya existían)');
    ExpedienteNuco.olvidar(NUCO);
    LineasArchivos.olvidarNuco(NUCO);
  });
}

/**
 * La copia de respaldo de las sesiones (Auth.gs, 9-nov): crea una sesión de prueba, le borra su entrada de la caché (lo
 * que hace Google cuando la pierde) y revisa que se rescate y que cerrar sesión la quite. No toca hojas ni a ninguna persona.
 */
function pruebaSesiones() {
  soloEditor_();
  return PruebasDev.correr('Sesiones (copia de respaldo)', (paso) => {
    const cache = CacheService.getScriptCache();
    let s = null;
    paso('una sesión nueva sirve', () => {
      s = Auth.construirSesion_({ CORREO: 'prueba.sesion@ciudadmaderas.com', NOMBRE: 'PRUEBA SESION', ROL: 'USER' });
      return Auth.validarSesion(s.token).correo;
    }, /^prueba.sesion@/);
    if (!s) return;
    paso('la caché la pierde: se rescata de la copia', () => {
      cache.remove('sesion_' + s.token);
      return Auth.validarSesion(s.token).correo;
    }, /^prueba.sesion@/);
    paso('y volvió a la caché', () => (cache.get('sesion_' + s.token) ? 'sí' : 'no'), /^sí$/);
    paso('cerrar sesión también borra la copia', () => {
      Auth.logout(s.token);
      try { Auth.validarSesion(s.token); return 'siguió sirviendo'; } catch (e) { return e.message; }
    }, /Sesión expirada/);
    paso('copias y espacio', () => JSON.stringify(Auth.estadoCopias()));
  });
}
