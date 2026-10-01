/**
 * DashboardService.gs
 * Resumen para el panel de "Inicio": KPIs generales, alertas de pendientes,
 * actividad reciente y datos de apoyo para los accesos rápidos.
 *
 * Cada sección se calcula por separado y se protege con try/catch: si el
 * usuario no tiene permiso de leer un módulo (o algo falla), esa sección
 * llega como null al cliente en vez de tumbar todo el panel.
 */

const DashboardService = (function () {
  const DIA_MS = 24 * 60 * 60 * 1000;

  // Cada lista se lee UNA vez por carga del Inicio: varias secciones usan la misma (vehículos, incidencias,
  // tickets, inspecciones) y antes se leía dos veces cada una. Se reinicia en cada resumen().
  let listas_ = {};
  function lista_(clave, fn) {
    if (!(clave in listas_)) listas_[clave] = fn();
    return listas_[clave];
  }

  function seccion_(fn) {
    try {
      return fn();
    } catch (e) {
      return null;
    }
  }

  function fechaISO_(valor) {
    if (!valor) return '';
    const f = valor instanceof Date ? valor : new Date(valor);
    return isNaN(f.getTime()) ? '' : f.toISOString();
  }

  // ---------------- KPIs ----------------

  function kpiVehiculos_(token) {
    const filas = lista_('vehiculos', () => VehiculosService.listarResumen(token));
    const baja = filas.filter((v) => String(v.ESTATUS || '').toUpperCase() === 'BAJA VEHICULAR').length;
    return { activos: filas.length - baja, baja: baja, total: filas.length };
  }

  function kpiTicketsIncidencias_(token) {
    const incidencias = lista_('incidencias', () => IncidenciasService.listar(token));
    const abiertas = incidencias.filter((i) => i.ESTADO === 'ABIERTA').length;

    const tickets = lista_('tickets', () => TicketsService.listarResumen(token));
    const hace30 = new Date(Date.now() - 30 * DIA_MS);
    const recientes = tickets.filter((t) => {
      const f = new Date(t['FECHA DE REGISTRO']);
      return !isNaN(f.getTime()) && f >= hace30;
    }).length;

    // ticketsRecientes es una ventana de 30 días, no una parte de un todo --
    // no lleva "total" (el cliente lo deja como anillo lleno, decorativo).
    return { incidenciasAbiertas: abiertas, incidenciasTotal: incidencias.length, ticketsRecientes: recientes };
  }

  function kpiCajasChicas_(token) {
    const filas = CajasChicasService.listarResumen(token);
    const contar = (valor) => filas.filter((f) => String(f.ESTATUS || '').toUpperCase() === valor).length;
    return {
      vigentes: contar('VIGENTE'),
      enProcesoCierre: contar('EN PROCESO DE CIERRE'),
      cerradas: contar('CERRADA'),
      total: filas.length,
    };
  }

  // Líneas no va en Inicio (1-oct, acordado con Jorge): sus cifras viven en el Panorama de Líneas.

  // ---------------- Alertas ----------------

  /**
   * Mismo criterio que el módulo de Verificaciones (app-verificaciones.html):
   * solo la verificación más reciente de cada folio cuenta, y son 30 días
   * antes de FECHA_PROXIMA para "por vencer".
   */
  function alertaVerificaciones_(token) {
    const filas = VerificacionesService.listar(token);
    const ultimaPorFolio = {};
    filas.forEach((v) => {
      const actual = ultimaPorFolio[v.FOLIO];
      if (!actual || (v.FECHA_VERIFICACION || '') > (actual.FECHA_VERIFICACION || '')) ultimaPorFolio[v.FOLIO] = v;
    });
    let vencidas = 0;
    let porVencer = 0;
    Object.keys(ultimaPorFolio).forEach((folio) => {
      const v = ultimaPorFolio[folio];
      if (!v.FECHA_PROXIMA) return;
      const dias = Math.floor((new Date(v.FECHA_PROXIMA) - new Date()) / DIA_MS);
      if (dias < 0) vencidas++;
      else if (dias <= 30) porVencer++;
    });
    return { vencidas: vencidas, porVencer: porVencer, total: Object.keys(ultimaPorFolio).length };
  }

  /**
   * "Atrasada" = vehículo activo sin ninguna inspección registrada, o cuya
   * inspección más reciente tiene más de UMBRAL_DIAS. No hay una política
   * formal de periodicidad en el sistema; 90 días es un valor razonable y
   * fácil de ajustar aquí si se necesita otro criterio.
   */
  function alertaInspecciones_(token) {
    const UMBRAL_DIAS = 90;
    const activos = lista_('vehiculos', () => VehiculosService.listarResumen(token))
      .filter((v) => String(v.ESTATUS || '').toUpperCase() !== 'BAJA VEHICULAR');

    const ultimaPorFolio = {};
    lista_('inspecciones', () => InspeccionesService.listar(token)).forEach((i) => {
      const actual = ultimaPorFolio[i.FOLIO];
      if (!actual || (i.FECHA || '') > actual) ultimaPorFolio[i.FOLIO] = i.FECHA || '';
    });

    const limite = new Date(Date.now() - UMBRAL_DIAS * DIA_MS);
    const atrasados = activos.filter((v) => {
      const ultima = ultimaPorFolio[v.FOLIO];
      if (!ultima) return true;
      const f = new Date(ultima);
      return isNaN(f.getTime()) || f < limite;
    });
    return { atrasadas: atrasados.length, total: activos.length };
  }

  // ---------------- Actividad reciente ----------------

  function actividadReciente_(token) {
    const eventos = [];

    seccion_(() => {
      lista_('incidencias', () => IncidenciasService.listar(token)).slice(0, 8).forEach((i) => {
        eventos.push({ tipo: 'Incidencia', icono: 'wrench', texto: 'Folio ' + (i.FOLIO || '—'), fecha: i.FECHA_REGISTRO });
      });
    });
    seccion_(() => {
      lista_('tickets', () => TicketsService.listarResumen(token)).slice()
        .sort((a, b) => new Date(b['FECHA DE REGISTRO']) - new Date(a['FECHA DE REGISTRO']))
        .slice(0, 8)
        .forEach((t) => {
          eventos.push({
            tipo: 'Ticket', icono: 'ticket',
            texto: (t['SOLICITANTE'] || t['DEPARTAMENTO'] || '—'),
            fecha: fechaISO_(t['FECHA DE REGISTRO']),
          });
        });
    });
    seccion_(() => {
      ArqueosService.listarResumen(token).slice(0, 8).forEach((a) => {
        eventos.push({ tipo: 'Arqueo', icono: 'wallet', texto: (a.RESPONSABLE || '—'), fecha: a.FECHA_INICIO });
      });
    });
    seccion_(() => {
      lista_('inspecciones', () => InspeccionesService.listar(token)).slice(0, 8).forEach((i) => {
        eventos.push({ tipo: 'Inspección', icono: 'clipboard-check', texto: 'Folio ' + (i.FOLIO || '—'), fecha: i.FECHA });
      });
    });

    return eventos
      .filter((e) => e.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
      .slice(0, 10);
  }

  // ---------------- Resumen completo ----------------

  function resumen(token) {
    Auth.validarSesion(token);
    listas_ = {};
    return {
      vehiculos: seccion_(() => kpiVehiculos_(token)),
      ticketsIncidencias: seccion_(() => kpiTicketsIncidencias_(token)),
      cajasChicas: seccion_(() => kpiCajasChicas_(token)),
      alertas: {
        verificaciones: seccion_(() => alertaVerificaciones_(token)),
        inspecciones: seccion_(() => alertaInspecciones_(token)),
      },
      actividad: seccion_(() => actividadReciente_(token)) || [],
    };
  }

  return { resumen: resumen };
})();
