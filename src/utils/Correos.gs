/**
 * Correos.gs — la plantilla de los correos que manda el sistema (23-oct). Una sola, para que todos se vean igual que la
 * app: la barra azul marino con el logo del login, la tarjeta blanca, Poppins y el dorado de acento.
 *
 *   MailApp.sendEmail(Correos.mensaje(para, asunto, {
 *     preencabezado: 'Lo que se ve junto al asunto en la bandeja',
 *     etiqueta: 'Verificación',              // la línea dorada sobre el título
 *     titulo: 'Tu código para entrar',
 *     parrafos: ['Texto con <b>HTML ya escapado</b>…'],   // HTML: lo que venga de una persona, con Correos.esc
 *     codigo: '123456',                      // opcional: 6 casillas + el código en una línea para copiarlo
 *     detalle: [['Dispositivo', 'Chrome en Windows'], ['Fecha', '23/10/2026 10:42']],   // opcional, escapado aquí
 *     boton: { texto: 'Abrir Control Interno', url: 'https:…' },   // opcional
 *     aviso: 'Si no fuiste tú, …',           // opcional: la nota de seguridad, en gris
 *   }));
 *
 * Cómo está hecho (lo que piden Gmail y Outlook): tablas anidadas con estilos en línea (Gmail quita los del <head>,
 * Outlook de escritorio dibuja con el motor de Word), 600 px de ancho con un envoltorio condicional para Outlook, el
 * modo oscuro como mejora (Apple Mail; Gmail lo invierte solo), sin imágenes en base64 (Gmail corta a los 102 KB), y
 * siempre con su versión en texto (body) para quien no ve HTML. Vista previa: node tools/correos/vista.js
 */
const Correos = (function () {
  const C = {
    marino: '#06263A', dorado: '#B4A169', doradoSuave: '#EBE5D1', fondo: '#F5F6F5', tarjeta: '#FFFFFF',
    texto: '#1C2B33', tenue: '#5C6B72', borde: '#E7E7E7',
  };
  const LETRA = "'Poppins','Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const LOGO = 'https://raw.githubusercontent.com/15GaelNG/Inventario_Control-Interno/master/assets/logo.png';

  /** Texto seguro dentro del HTML */
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** 6 casillas (como Google o Microsoft) y, abajo, el código en una línea: las casillas se copian con tabuladores */
  function codigo_(codigo) {
    const digitos = String(codigo).split('');
    const casillas = digitos.map((d) =>
      '<td style="padding:0 4px"><div style="width:44px;height:54px;line-height:54px;border:1px solid ' + C.borde + ';border-radius:10px;' +
      'background:' + C.fondo + ';font-family:' + LETRA + ';font-size:28px;font-weight:700;color:' + C.marino + ';text-align:center" class="ci-casilla">' +
      esc(d) + '</div></td>').join('');
    return '<table role="presentation" aria-label="Código: ' + esc(digitos.join(' ')) + '" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:8px auto 10px">' +
      '<tr>' + casillas + '</tr></table>' +
      '<p style="margin:0 0 4px;text-align:center;font-family:' + LETRA + ';font-size:13px;color:' + C.tenue + '" class="ci-tenue">' +
        'Para copiarlo: <span style="font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:3px;color:' + C.texto + '" class="ci-texto">' +
        esc(codigo) + '</span></p>';
  }

  function detalle_(filas) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 4px;border-top:1px solid ' + C.borde + '" class="ci-linea">' +
      filas.map(([k, v]) => '<tr>' +
        '<td style="padding:10px 0;border-bottom:1px solid ' + C.borde + ';font-family:' + LETRA + ';font-size:13px;color:' + C.tenue + ';width:38%" class="ci-tenue ci-linea">' + esc(k) + '</td>' +
        '<td style="padding:10px 0;border-bottom:1px solid ' + C.borde + ';font-family:' + LETRA + ';font-size:14px;font-weight:600;color:' + C.texto + '" class="ci-texto ci-linea">' + esc(v) + '</td>' +
      '</tr>').join('') + '</table>';
  }

  /** Botón que se ve igual en Outlook (la celda lleva el color, no solo el enlace) */
  function boton_(b) {
    return '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px"><tr>' +
      '<td bgcolor="' + C.marino + '" style="border-radius:10px">' +
      '<a href="' + esc(b.url) + '" style="display:inline-block;padding:12px 26px;font-family:' + LETRA + ';font-size:14px;font-weight:600;' +
      'color:#FFFFFF;text-decoration:none;border-radius:10px">' + esc(b.texto) + '</a></td></tr></table>';
  }

  /** El HTML completo */
  function html(o) {
    const p = (t) => '<p style="margin:0 0 14px;font-family:' + LETRA + ';font-size:15px;line-height:1.6;color:' + C.texto + '" class="ci-texto">' + t + '</p>';
    return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark">' +
      '<meta name="supported-color-schemes" content="light dark"><title>' + esc(o.titulo) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
        '@media (max-width:620px){.ci-tarjeta{padding:26px 20px!important}.ci-casilla{width:38px!important;height:48px!important;line-height:48px!important;font-size:24px!important}}' +
        '@media (prefers-color-scheme:dark){.ci-fondo{background:#0B1A23!important}.ci-tarjeta{background:#142732!important}' +
        '.ci-texto{color:#EDF1F3!important}.ci-tenue{color:#A9B6BD!important}.ci-casilla{background:#0B1A23!important;color:#EDF1F3!important;border-color:#2A3D49!important}' +
        '.ci-linea{border-color:#2A3D49!important}.ci-tarjeta{border-color:#2A3D49!important}.ci-aviso{background:#2A2718!important;color:#EDF1F3!important}}' +
      '</style></head>' +
      '<body style="margin:0;padding:0;background:' + C.fondo + '" class="ci-fondo">' +
      // Lo que se ve junto al asunto en la bandeja; oculto en el correo
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + esc(o.preencabezado || '') + '&#8203;&#847;&#8203;&#847;&#8203;&#847;</div>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.fondo + '" class="ci-fondo"><tr><td align="center" style="padding:28px 12px">' +
      '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px">' +
        // Barra: el logo y el nombre, como en el login
        '<tr><td bgcolor="' + C.marino + '" style="padding:18px 28px;border-radius:12px 12px 0 0">' +
          '<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>' +
          '<td style="padding-right:12px"><img src="' + LOGO + '" width="34" height="34" alt="CI" style="display:block;border:0;border-radius:8px;background:#FFFFFF"></td>' +
          '<td style="font-family:' + LETRA + ';font-size:14px;font-weight:700;letter-spacing:2px;color:#FFFFFF">CONTROL INTERNO' +
            '<div style="font-size:10px;font-weight:600;letter-spacing:3px;color:' + C.dorado + '">CIUDAD MADERAS</div></td>' +
          '</tr></table></td></tr>' +
        // La tarjeta
        '<tr><td bgcolor="' + C.tarjeta + '" class="ci-tarjeta" style="padding:34px 36px 30px;border:1px solid ' + C.borde + ';border-top:0;border-radius:0 0 12px 12px">' +
          (o.etiqueta ? '<p style="margin:0 0 6px;font-family:' + LETRA + ';font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:' + C.dorado + '">' + esc(o.etiqueta) + '</p>' : '') +
          '<h1 style="margin:0 0 6px;font-family:' + LETRA + ';font-size:22px;line-height:1.3;font-weight:700;color:' + C.marino + '" class="ci-texto">' + esc(o.titulo) + '</h1>' +
          '<div style="width:40px;height:3px;background:' + C.dorado + ';border-radius:2px;margin:0 0 20px"></div>' +
          (o.parrafos || []).map(p).join('') +
          (o.codigo ? codigo_(o.codigo) : '') +
          (o.detalle && o.detalle.length ? detalle_(o.detalle) : '') +
          (o.boton ? boton_(o.boton) : '') +
          (o.aviso ? '<p style="margin:22px 0 0;padding:12px 14px;border-radius:10px;background:' + C.doradoSuave + ';font-family:' + LETRA + ';font-size:13px;line-height:1.5;color:' + C.texto + '" class="ci-aviso">' + o.aviso + '</p>' : '') +
        '</td></tr>' +
        // Pie
        '<tr><td style="padding:18px 8px 0;text-align:center;font-family:' + LETRA + ';font-size:12px;line-height:1.6;color:' + C.tenue + '" class="ci-tenue">' +
          'Este correo lo mandó Control Interno automáticamente; no lo respondas.<br>Ciudad Maderas · Control Interno</td></tr>' +
      '</table>' +
      '<!--[if mso]></td></tr></table><![endif]-->' +
      '</td></tr></table></body></html>';
  }

  /** La versión en texto (para quien no ve HTML y para los filtros de spam) */
  function texto(o) {
    const sinHtml = (t) => String(t || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    return [o.titulo, '']
      .concat((o.parrafos || []).map(sinHtml))
      .concat(o.codigo ? ['', 'Código: ' + o.codigo, ''] : [])
      .concat((o.detalle || []).map(([k, v]) => k + ': ' + v))
      .concat(o.boton ? ['', o.boton.texto + ': ' + o.boton.url] : [])
      .concat(o.aviso ? ['', sinHtml(o.aviso)] : [])
      .concat(['', '— Control Interno · Ciudad Maderas (correo automático, no lo respondas)'])
      .join('\n');
  }

  /** Lo que recibe MailApp.sendEmail */
  function mensaje(para, asunto, o) {
    return { to: para, subject: asunto, name: 'Control Interno', htmlBody: html(o), body: texto(o) };
  }

  return { mensaje, html, texto, esc };
})();
