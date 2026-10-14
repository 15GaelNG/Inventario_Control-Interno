/**
 * HelpdeskFormularios.gs: GENERADO por tools/helpdesk/catalogo_formularios.py desde el Excel
 * "Catalogo_Maestro_HelpDesk_Control_Interno.xlsx". No se edita a mano: se vuelve a generar.
 * Los formularios del helpdesk de TI que atiende nuestro grupo, con sus campos y opciones.
 * Algunas listas (Departamento, Oficina) no traen opciones en el Excel: el helpdesk las da
 * por ticket (getNewTicketCatalogs, dataComponent4).
 */

const HELPDESK_FORMULARIOS = [
  {
    "id": 63,
    "nombre": "Solicitud - Análisis de Datos",
    "campos": [
      {
        "id": 1073,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1074,
        "etiqueta": "Oficina",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 114,
        "etiqueta": "Tipo de Revisión",
        "tipo": "select",
        "opciones": [
          "Creación de Plantilla en Excel",
          "Creación de Dashboard",
          "Creación de Base de Datos",
          "Revisión y Homologación de Registros",
          "Creación de Mini Sistema",
          "Otro"
        ]
      },
      {
        "id": 116,
        "etiqueta": "En caso de seleccionar Otro describe",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 115,
        "etiqueta": "Fecha Tentativa de Entrega",
        "tipo": "date",
        "opciones": []
      }
    ]
  },
  {
    "id": 101,
    "nombre": "Incremento de Caja Chica",
    "campos": [
      {
        "id": 234,
        "etiqueta": "Motivo de solicitud de incremento",
        "tipo": "text",
        "opciones": []
      }
    ]
  },
  {
    "id": 102,
    "nombre": "Reducción de Caja Chica",
    "campos": [
      {
        "id": 235,
        "etiqueta": "Motivo de reducción",
        "tipo": "text",
        "opciones": []
      }
    ]
  },
  {
    "id": 103,
    "nombre": "Apertura de Caja Chica",
    "campos": [
      {
        "id": 242,
        "etiqueta": "Nombre completo del responsable de la caja chica",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 244,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 241,
        "etiqueta": "Área",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 243,
        "etiqueta": "Empresa de la cual recibe nómina el Responsable de la Caja Chica",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 245,
        "etiqueta": "Puesto del Responsable de la caja chica",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 247,
        "etiqueta": "Nombre completo del Jefe inmediato",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 246,
        "etiqueta": "Puesto del Jefe inmediato",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 248,
        "etiqueta": "Justificación y motivo para la solicitud de Apertura",
        "tipo": "multiline",
        "opciones": []
      },
      {
        "id": 249,
        "etiqueta": "Monto Autorizado por DG",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 250,
        "etiqueta": "Método de reembolso",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 252,
        "etiqueta": "Correo electrónico del Responsable de la Caja Chica",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 251,
        "etiqueta": "Tipo de caja chica",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 108,
    "nombre": "Solicitud para Auditoría",
    "campos": []
  },
  {
    "id": 109,
    "nombre": "Cierre de Caja Chica",
    "campos": []
  },
  {
    "id": 133,
    "nombre": "Solicitud de Levantamiento/Actualización de Procesos",
    "campos": []
  },
  {
    "id": 137,
    "nombre": "Solicitud - Alta de Conceptos CXP",
    "campos": []
  },
  {
    "id": 138,
    "nombre": "Solicitud - Alta de Descuentos CH",
    "campos": [
      {
        "id": 1081,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1082,
        "etiqueta": "Oficina",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1062,
        "etiqueta": "Concepto a Agregar",
        "tipo": "text",
        "opciones": []
      }
    ]
  },
  {
    "id": 148,
    "nombre": "Incidencia | Solicitud - Sensores",
    "campos": [
      {
        "id": 1083,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1084,
        "etiqueta": "Oficina / Desarrollo",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 421,
        "etiqueta": "Tipo",
        "tipo": "select",
        "opciones": [
          "Reportar Incidenca",
          "Solicitud de Sensor"
        ]
      },
      {
        "id": 420,
        "etiqueta": "No. de Serie Vehículo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 424,
        "etiqueta": "Fecha de Incidencia | Solicitud",
        "tipo": "date",
        "opciones": []
      }
    ]
  },
  {
    "id": 149,
    "nombre": "SOLICITUD DE HOLOGRAMA / TAG / TARJETA",
    "campos": []
  },
  {
    "id": 241,
    "nombre": "SERVICIOS VEHICULARES",
    "campos": [
      {
        "id": 887,
        "etiqueta": "TIPO DE MANTENIMIENTO",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 889,
        "etiqueta": "TIPO DE UNIDAD",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 888,
        "etiqueta": "TELÉFONO DE CONTACTO",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1206,
        "etiqueta": "OFICINA / SEDE",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1207,
        "etiqueta": "DEPARTAMENTO",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1208,
        "etiqueta": "NUCO",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1385,
        "etiqueta": "KILOMETRAJE",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1384,
        "etiqueta": "DESCRIPCIÓN / UNIDAD",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1437,
        "etiqueta": "DATO",
        "tipo": "text",
        "opciones": []
      }
    ]
  },
  {
    "id": 269,
    "nombre": "BAJAS",
    "campos": [
      {
        "id": 1117,
        "etiqueta": "Tipo de Baja",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1558,
        "etiqueta": "Evento o motivo del gasto",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1123,
        "etiqueta": "Colaborador de Apoyo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1563,
        "etiqueta": "Fecha del gasto",
        "tipo": "date",
        "opciones": []
      },
      {
        "id": 1122,
        "etiqueta": "Oficina / Desarrollo",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 277,
    "nombre": "Actualización de Documentos - Información",
    "campos": [
      {
        "id": 1185,
        "etiqueta": "Motivo de Actualización",
        "tipo": "multiline",
        "opciones": []
      }
    ]
  },
  {
    "id": 281,
    "nombre": "Solicitud de Línea y Equipo",
    "campos": [
      {
        "id": 1237,
        "etiqueta": "Nombre del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1240,
        "etiqueta": "No. de Empleado del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1249,
        "etiqueta": "Puesto del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1244,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 282,
    "nombre": "Solicitud de Accesorios",
    "campos": [
      {
        "id": 1252,
        "etiqueta": "Nombre del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1254,
        "etiqueta": "No. de Empleado del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1251,
        "etiqueta": "Puesto del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1284,
        "etiqueta": "Correo del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1253,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 283,
    "nombre": "Solicitud de Reparación y Evaluación de Daños",
    "campos": []
  },
  {
    "id": 284,
    "nombre": "Solicitud de Reasignación",
    "campos": [
      {
        "id": 1292,
        "etiqueta": "Nombre del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1294,
        "etiqueta": "No. de Empleado Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1293,
        "etiqueta": "Puesto del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1297,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 285,
    "nombre": "REPARACIÓN POR SINIESTRO",
    "campos": []
  },
  {
    "id": 286,
    "nombre": "Solicitud de Cambio de Número Telefónico",
    "campos": [
      {
        "id": 1312,
        "etiqueta": "Nombre del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1314,
        "etiqueta": "No. de Empleado Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1313,
        "etiqueta": "Puesto del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1316,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1315,
        "etiqueta": "Oficina / Desarrollo",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1317,
        "etiqueta": "Número Telefónico del Solicitante",
        "tipo": "number",
        "opciones": []
      },
      {
        "id": 1318,
        "etiqueta": "Nombre del Jefe Directo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1322,
        "etiqueta": "NUCO del que se solicita el cambio de número",
        "tipo": "number",
        "opciones": []
      },
      {
        "id": 1320,
        "etiqueta": "Motivo del Cambio",
        "tipo": "select",
        "opciones": [
          "Cambio de plaza / lada",
          "Exposición pública del número",
          "Estrategia comercial",
          "Llamadas indebidas / acoso"
        ]
      },
      {
        "id": 1324,
        "etiqueta": "En caso de haber seleccionado \"Otro\" explica el motivo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1321,
        "etiqueta": "Aviso Importante...",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1323,
        "etiqueta": "Declaro que la información proporcionada es correcta y completa.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1326,
        "etiqueta": "Confirmo que el área asume el impacto operativo del cambio de número.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1325,
        "etiqueta": "Acepto los lineamientos internos aplicables.",
        "tipo": "check",
        "opciones": []
      }
    ]
  },
  {
    "id": 287,
    "nombre": "REPARACIÓN POR INSPECCIÓN VEHICULAR",
    "campos": [
      {
        "id": 1334,
        "etiqueta": "Se debe incluir la captura del resumen que el inspector vehicular mandó por correo.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1338,
        "etiqueta": "Familia o grupo a reportar",
        "tipo": "select",
        "opciones": [
          "Mecanico",
          "Hojalateria y pintura",
          "Accesorios",
          "Otros, (cerrajeria, cristaleria y tapiceria)"
        ]
      },
      {
        "id": 1335,
        "etiqueta": "Fecha de inspección",
        "tipo": "date",
        "opciones": []
      },
      {
        "id": 1339,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1340,
        "etiqueta": "Placa",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1341,
        "etiqueta": "Responsable de la unidad",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1452,
        "etiqueta": "KILOMETRAJE",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1453,
        "etiqueta": "TELÉFONO DE CONTACTO",
        "tipo": "text",
        "opciones": []
      }
    ]
  },
  {
    "id": 288,
    "nombre": "UBER",
    "campos": []
  },
  {
    "id": 289,
    "nombre": "Reporte de Incidentes",
    "campos": [
      {
        "id": 1361,
        "etiqueta": "Nombre del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1362,
        "etiqueta": "No. de Empleado del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1363,
        "etiqueta": "Puesto del Solicitante",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1365,
        "etiqueta": "Departamento Solicitante",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 290,
    "nombre": "INCREMENTO DE COMBUSTIBLE",
    "campos": [
      {
        "id": 1381,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1379,
        "etiqueta": "Tipo de incremento",
        "tipo": "select",
        "opciones": [
          "Temporal",
          "Permanente"
        ]
      },
      {
        "id": 1471,
        "etiqueta": "Placa (o VIN si no tiene placa)",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1378,
        "etiqueta": "Responsable de la unidad",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1376,
        "etiqueta": "Cantidad solicitada (Litros o pesos)",
        "tipo": "number",
        "opciones": []
      },
      {
        "id": 1472,
        "etiqueta": "Mi jefe inmediato y/o DA están enterados de esta solicitud.",
        "tipo": "select",
        "opciones": [
          "SI, confirmo.",
          "No."
        ]
      },
      {
        "id": 1375,
        "etiqueta": "Los litros solicitados son con fines laborales.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1382,
        "etiqueta": "Confirmo que he ingresado en descripción el detallo de mi solicitud.",
        "tipo": "check",
        "opciones": []
      }
    ]
  },
  {
    "id": 291,
    "nombre": "REEMBOLSO DE COMBUSTIBLE",
    "campos": [
      {
        "id": 1396,
        "etiqueta": "Departamento del solicitante.",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1399,
        "etiqueta": "Placa",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1397,
        "etiqueta": "Nombre del dueño del vehículo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1398,
        "etiqueta": "Solo aplica para vehículos personales que fueron utilizados por apoyo en las actividades de sus funciones.",
        "tipo": "check",
        "opciones": []
      }
    ]
  },
  {
    "id": 292,
    "nombre": "CONSULTA INFORMACIÓN GENERAL COMBUSTIBLE",
    "campos": [
      {
        "id": 1400,
        "etiqueta": "Se debe ingresar en descripción el detalle de la información solicitada.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1401,
        "etiqueta": "Placa. Nuco o VIN",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1429,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": []
      }
    ]
  },
  {
    "id": 293,
    "nombre": "NIP Y COMBUSTIBLE POR PRESTAMO",
    "campos": [
      {
        "id": 1406,
        "etiqueta": "Departamento del solicitante",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1404,
        "etiqueta": "Tipo de solicitud",
        "tipo": "select",
        "opciones": [
          "Baja de NIP",
          "Temporal por préstamo de unidad",
          "Alta por vehículo asignado"
        ]
      },
      {
        "id": 1402,
        "etiqueta": "Nombre del responsable del NIP",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1408,
        "etiqueta": "Mi jefe inmediato y/o DA están enterados de esta solicitud.",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1407,
        "etiqueta": "Los litros solicitados son con fines laborales.",
        "tipo": "check",
        "opciones": []
      }
    ]
  },
  {
    "id": 294,
    "nombre": "Reembolsos y solicitudes especiales",
    "campos": [
      {
        "id": 1438,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": []
      },
      {
        "id": 1439,
        "etiqueta": "Placa. Nuco o VIN",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1432,
        "etiqueta": "TRÁMITE",
        "tipo": "select",
        "opciones": [
          "ALTA DE PLACAS",
          "BAJA DE PLACAS",
          "MULTA VERIFICACIÓN",
          "MULTA MUNICIPAL / ESTATAL / FEDERAL",
          "TENENCIA",
          "CANJE DE LA TARJETA DE CIRCULACIÓN",
          "CANJE DE PLACAS",
          "REPOSICIÓN DE LA TARJETA DE CIRCULACIÓN",
          "REPOSICIÓN DE PLACAS",
          "REPOSICIÓN TALÓN DE VERIFICACIÓN",
          "SEGURO VEHICULAR"
        ]
      },
      {
        "id": 1431,
        "etiqueta": "MOTIVO DE LA SOLICITUD",
        "tipo": "multiline",
        "opciones": []
      },
      {
        "id": 1445,
        "etiqueta": "Mi jefe inmediato y/o DA están enterados de esta solicitud.",
        "tipo": "check",
        "opciones": []
      }
    ]
  },
  {
    "id": 306,
    "nombre": "Reembolsos y solicitudes especiales",
    "campos": [
      {
        "id": 1569,
        "etiqueta": "Evento o motivo del gasto",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1568,
        "etiqueta": "Fecha del gasto",
        "tipo": "date",
        "opciones": []
      },
      {
        "id": 1571,
        "etiqueta": "Monto del gasto $",
        "tipo": "decimal",
        "opciones": []
      },
      {
        "id": 1566,
        "etiqueta": "Sede",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1570,
        "etiqueta": "Oficina-Desarrollo",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1567,
        "etiqueta": "Responsable de la caja chica",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1557,
        "etiqueta": "Estoy enterado(a) de las restricciones de gasto de CCH",
        "tipo": "check",
        "opciones": []
      },
      {
        "id": 1572,
        "etiqueta": "Departamento",
        "tipo": "select",
        "opciones": [
          "Construcción",
          "Comunicación",
          "Capital Humano",
          "Cobranza GPH",
          "Administración",
          "OOAM Administrativo",
          "Administración de oficinas",
          "Control Interno",
          "Cobranza lotes",
          "Contabilidad",
          "Postventa",
          "Proyectos",
          "Arquitectura del Paisaje",
          "Mercadotecnia",
          "Comercialización",
          "DG",
          "TI",
          "Contratación y Titulación",
          "Fundación Ciudad Maderas"
        ]
      },
      {
        "id": 1573,
        "etiqueta": "Este gasto que ingreso es por única ocasión y esta sujeto a aprobación.",
        "tipo": "select",
        "opciones": [
          "Enterado(a)"
        ]
      }
    ]
  },
  {
    "id": 317,
    "nombre": "NIP PARA COMBUSTIBLES",
    "campos": [
      {
        "id": 1647,
        "etiqueta": "¿Qué servicio de combustible se requiere?",
        "tipo": "select",
        "opciones": [
          "EOX",
          "Edenred"
        ]
      },
      {
        "id": 1646,
        "etiqueta": "Placa. Nuco o VIN",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1648,
        "etiqueta": "Motivo de solicitud",
        "tipo": "select",
        "opciones": [
          "Cambio de sede u oficina",
          "Cambio porque compartio su NIP a otra persona",
          "Nuevo colaborador"
        ]
      },
      {
        "id": 1649,
        "etiqueta": "Nombre del colaborador",
        "tipo": "text",
        "opciones": []
      },
      {
        "id": 1650,
        "etiqueta": "# de empleado del colaborador a dar de alta",
        "tipo": "text",
        "opciones": []
      }
    ]
  }
];
