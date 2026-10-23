/**
 * Accesos.gs — la bitácora de inicios de sesión y la alerta de muchos fallos (23-oct).
 *
 * Hoja ACCESOS del libro de USUARIOS (se crea sola): FECHA, CORREO, MÉTODO (contrasena/google), RESULTADO, DISPOSITIVO,
 * DETALLE. Nunca contraseñas ni códigos. Resultados: entro, contrasena-mala, correo-desconocido, bloqueado, inactivo,
 * codigo-enviado, codigo-reenviado, codigo-bueno, codigo-malo.
 *
 * Password spraying (una contraseña común probada en muchas cuentas: el límite por correo no lo ve): si en VENTANA_SEG
 * fallan UMBRAL correos distintos, se prende la alerta por SEG_ALERTA, se avisa por correo a los ADMIN (una vez) y,
 * mientras dure, Verificacion pide el código a todos aunque el dispositivo sea conocido.
 *
 *   Accesos.anotar(correo, metodo, resultado, dispositivo, detalle)   nunca truena: la bitácora no impide entrar
 *   Accesos.enAlerta()
 */
const Accesos = (function () {
  const HOJA = 'ACCESOS';
  const COLUMNAS = ['FECHA', 'CORREO', 'METODO', 'RESULTADO', 'DISPOSITIVO', 'DETALLE'];
  const FALLOS = ['contrasena-mala', 'correo-desconocido', 'bloqueado', 'codigo-malo'];
  const VENTANA_SEG = 10 * 60;
  const UMBRAL = 15;
  const SEG_ALERTA = 60 * 60;

  const cache_ = () => CacheService.getScriptCache();
  const clave_ = (correo) => String(correo == null ? '' : correo).trim().toLowerCase();

  function hoja_() {
    const libro = SpreadsheetApp.openById(Config.SPREADSHEET_IDS.USUARIOS());
    let h = libro.getSheetByName(HOJA);
    if (!h) {
      h = libro.insertSheet(HOJA);
      h.getRange(1, 1, 1, COLUMNAS.length).setValues([COLUMNAS]);
      h.setFrozenRows(1);
    }
    return h;
  }

  function anotar(correo, metodo, resultado, dispositivo, detalle) {
    try {
      hoja_().appendRow([new Date(), clave_(correo).slice(0, 120), metodo || '', resultado, String(dispositivo || '').slice(0, 60), String(detalle || '').slice(0, 200)]);
    } catch (e) {
      console.warn('Accesos.anotar: ' + e.message);
    }
    if (FALLOS.indexOf(resultado) !== -1) {
      try { contarFallo_(correo); } catch (e) { console.warn('Accesos, alerta: ' + e.message); }
    }
  }

  /** Los correos que fallaron en la ventana; con UMBRAL distintos, la alerta */
  function contarFallo_(correo) {
    const ahora = Date.now();
    const recientes = JSON.parse(cache_().get('accesos_fallos') || '{}');
    recientes[clave_(correo)] = ahora;
    Object.keys(recientes).forEach((c) => { if (ahora - recientes[c] > VENTANA_SEG * 1000) delete recientes[c]; });
    cache_().put('accesos_fallos', JSON.stringify(recientes), VENTANA_SEG);
    if (Object.keys(recientes).length >= UMBRAL && !enAlerta()) {
      cache_().put('accesos_alerta', '1', SEG_ALERTA);
      avisarAdmins_(Object.keys(recientes).length);
    }
  }

  function enAlerta() {
    return cache_().get('accesos_alerta') === '1';
  }

  function avisarAdmins_(n) {
    const admins = SheetUtils.getAll(Config.SPREADSHEET_IDS.USUARIOS(), 'USUARIOS')
      .filter((u) => String(u.ROL).trim().toUpperCase() === 'ADMIN' && String(u.ACTIVO).toUpperCase() === 'TRUE' && u.CORREO)
      .map((u) => String(u.CORREO).trim());
    if (!admins.length) return;
    MailApp.sendEmail(Correos.mensaje(admins.join(','), 'Control Interno: muchos inicios de sesión fallidos', {
      preencabezado: n + ' correos distintos fallaron en ' + (VENTANA_SEG / 60) + ' minutos.',
      etiqueta: 'Alerta de seguridad',
      titulo: 'Muchos inicios de sesión fallidos',
      parrafos: ['En los últimos ' + (VENTANA_SEG / 60) + ' minutos fallaron <b>' + n + ' correos distintos</b> al iniciar sesión. ' +
        'Puede ser alguien probando contraseñas comunes en muchas cuentas.',
        'Durante la siguiente hora se le pide el código por correo a todos, aunque entren desde un dispositivo conocido.'],
      detalle: [['Correos distintos', String(n)], ['Ventana', (VENTANA_SEG / 60) + ' minutos'],
        ['Fecha', Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm')]],
      aviso: 'El detalle de cada intento está en la hoja <b>ACCESOS</b> del libro de usuarios.',
    }));
  }

  return { anotar, enAlerta, HOJA };
})();
