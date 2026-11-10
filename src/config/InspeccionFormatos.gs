/**
 * InspeccionFormatos.gs — el formato de inspección vehicular de cada tipo de unidad (11-nov-2026).
 *
 * GENERADO por tools/pdf/html/desde-docs.py inspeccion-vehicular desde las 18 plantillas de Docs (hoja MODELOS
 * INSPECCION): no se edita a mano. Lo usa InspeccionHtml.gs para llenar src/html/pdf/inspeccion-vehicular.html,
 * la plantilla única. Por tipo:
 *   secciones   { SECCION: [[lo que dice el formato, columna de la hoja]] } en el orden del formato; «… 2» es lo
 *               que sigue de esa sección en la columna derecha
 *   llantas     [[lo que dice el formato, columna]]   semaforoVertical  con 4 o más llantas (si no, horizontal)
 *   diagramas   qué vista va en cada lugar del Vector (1 y 2 arriba, 3 y 4 abajo)
 *   icono       la imagen del vehículo (logo-<logo>.png de RECURSOS PDF) y su recorte en px; bateria: el de la barra
 */
const InspeccionFormatos = (function () {
  const TIPOS = {
   "AUTOS": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Limpiaparabrisas trasero",
       "LIMPIAPARABRISAS TRASERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "HONDA 150XR": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Protectores/embellecedores de barras",
       "PROTECTORES / EMBELLECEDORES DE BARRAS"
      ],
      [
       "Salpicadera trasera/guardafango",
       "SALPICADERA TRASERA / GUARDAFANGO"
      ],
      [
       "Protector/carcasa del faro",
       "PROTECTOR / CARCASA FARO"
      ],
      [
       "Protector/embellecedor lado derecho",
       "PROTECTOR / EMBELLECEDOR LADO DERECHO"
      ],
      [
       "Protector/embellecedor lado izquierdo",
       "PROTECTOR / EMBELLECEDOR LADO IZQUIERDO"
      ],
      [
       "Slider protector derecho",
       "SLIDER PROTECTOR DERECHO"
      ],
      [
       "Slider protector izquierdo",
       "SLIDER PROTECTOR IZQUIERDO"
      ],
      [
       "Tapa derecha",
       "TAPA DERECHA"
      ],
      [
       "Tapa izquierda",
       "TAPA IZQUIERDA"
      ],
      [
       "Escape",
       "ESCAPE"
      ],
      [
       "Posapies",
       "PASAPIES"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llave de cruz",
       "LLAVE CRUZ"
      ],
      [
       "Dado",
       "DADO"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión/cadena",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera",
      "LLANTA T"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 107.0,
     "h": 66.3,
     "iw": 1088.28,
     "ih": 623.5,
     "x": -539.55,
     "y": -133.08,
     "logo": "inspeccion-icono-a57213"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "ITALIKA AT125": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Protectores/embellecedores de barras",
       "PROTECTORES / EMBELLECEDORES DE BARRAS"
      ],
      [
       "Salpicadera trasera/guardafango",
       "SALPICADERA TRASERA / GUARDAFANGO"
      ],
      [
       "Protector/carcasa del faro",
       "PROTECTOR / CARCASA FARO"
      ],
      [
       "Protector/embellecedor lado derecho",
       "PROTECTOR / EMBELLECEDOR LADO DERECHO"
      ],
      [
       "Protector/embellecedor lado izquierdo",
       "PROTECTOR / EMBELLECEDOR LADO IZQUIERDO"
      ],
      [
       "Slider protector derecho",
       "SLIDER PROTECTOR DERECHO"
      ],
      [
       "Slider protector izquierdo",
       "SLIDER PROTECTOR IZQUIERDO"
      ],
      [
       "Tapa derecha",
       "TAPA DERECHA"
      ],
      [
       "Tapa izquierda",
       "TAPA IZQUIERDA"
      ],
      [
       "Escape",
       "ESCAPE"
      ],
      [
       "Posapies",
       "PASAPIES"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llave de cruz",
       "LLAVE CRUZ"
      ],
      [
       "Dado",
       "DADO"
      ],
      [
       "Kit de herramientas",
       "KIT HERRAMIENTAS"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión/cadena",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera",
      "LLANTA T"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 107.0,
     "h": 66.3,
     "iw": 1088.28,
     "ih": 623.5,
     "x": -539.55,
     "y": -133.08,
     "logo": "inspeccion-icono-a57213"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "ITALIKA DM250": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Protectores/embellecedores de barras",
       "PROTECTORES / EMBELLECEDORES DE BARRAS"
      ],
      [
       "Salpicadera trasera/guardafango",
       "SALPICADERA TRASERA / GUARDAFANGO"
      ],
      [
       "Protector/carcasa del faro",
       "PROTECTOR / CARCASA FARO"
      ],
      [
       "Protector/embellecedor lado derecho",
       "PROTECTOR / EMBELLECEDOR LADO DERECHO"
      ],
      [
       "Protector/embellecedor lado izquierdo",
       "PROTECTOR / EMBELLECEDOR LADO IZQUIERDO"
      ],
      [
       "Slider protector derecho",
       "SLIDER PROTECTOR DERECHO"
      ],
      [
       "Slider protector izquierdo",
       "SLIDER PROTECTOR IZQUIERDO"
      ],
      [
       "Tapa derecha",
       "TAPA DERECHA"
      ],
      [
       "Tapa izquierda",
       "TAPA IZQUIERDA"
      ],
      [
       "Escape",
       "ESCAPE"
      ],
      [
       "Posapies",
       "PASAPIES"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llave de cruz",
       "LLAVE CRUZ"
      ],
      [
       "Dado",
       "DADO"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión/cadena",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera",
      "LLANTA T"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 107.0,
     "h": 66.3,
     "iw": 1088.28,
     "ih": 623.5,
     "x": -539.55,
     "y": -133.08,
     "logo": "inspeccion-icono-a57213"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "KWID": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Limpiaparabrisas trasero",
       "LIMPIAPARABRISAS TRASERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "L200": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ],
      [
       "Redilas",
       "REDILAS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Botones volante",
       "BOTONES VOLANTE"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 151.53,
     "h": 83.86,
     "iw": 151.53,
     "ih": 83.86,
     "x": 0.0,
     "y": 0.0
    }
   },
   "MOTOCARRO": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Carcasa manubrio y faro",
       "CARCASA MANUBRIO Y FARO"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ],
      [
       "Tapa lateral derecha",
       "TAPA LATERAL DERECHA"
      ],
      [
       "Tapa lateral izquierda",
       "TAPA LATERAL IZQUIERDA"
      ],
      [
       "Posapie derecho",
       "POSAPIE DERECHO"
      ],
      [
       "Posapie izquierdo",
       "POSAPIE IZQUIERDO"
      ],
      [
       "Salpicadera derecha",
       "SALPICADERA DERECHA"
      ],
      [
       "Salpicadera izquierda",
       "SALPICADERA IZQUIERDA"
      ],
      [
       "Batea",
       "BATEA / BETLINER"
      ],
      [
       "Tapa de batea",
       "TAPA DE BATEA"
      ],
      [
       "Defensa trasera",
       "DEFENSA TRASERA"
      ],
      [
       "Chasis",
       "CHASIS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Refacción",
       "REFACCION"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Cardan",
       "CARDAN"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.61,
     "h": 52.56,
     "iw": 94.61,
     "ih": 52.56,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-21f134"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "MOTOCARRO KINGWAY": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Carcasa manubrio y faro",
       "CARCASA MANUBRIO Y FARO"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ],
      [
       "Tapa lateral derecha",
       "TAPA LATERAL DERECHA"
      ],
      [
       "Tapa lateral izquierda",
       "TAPA LATERAL IZQUIERDA"
      ],
      [
       "Posapie derecho",
       "POSAPIE DERECHO"
      ],
      [
       "Posapie izquierdo",
       "POSAPIE IZQUIERDO"
      ],
      [
       "Salpicadera derecha",
       "SALPICADERA DERECHA"
      ],
      [
       "Salpicadera izquierda",
       "SALPICADERA IZQUIERDA"
      ],
      [
       "Batea",
       "BATEA / BETLINER"
      ],
      [
       "Tapa de batea",
       "TAPA DE BATEA"
      ],
      [
       "Defensa trasera",
       "DEFENSA TRASERA"
      ],
      [
       "Chasis",
       "CHASIS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Refacción",
       "REFACCION"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Cardan",
       "CARDAN"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.61,
     "h": 52.56,
     "iw": 94.61,
     "ih": 52.56,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-21f134"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "MOTOCARRO MUEVETEC": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Faro delantero",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ],
      [
       "Direccionales",
       "DIRECCIONALES"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ]
     ],
     "LATONERIA": [
      [
       "Salpicadera delantera",
       "SALPICADERA DELANTERA"
      ],
      [
       "Carcasa manubrio y faro",
       "CARCASA MANUBRIO Y FARO"
      ],
      [
       "Manubrio",
       "MANUBRIO"
      ],
      [
       "Tapa lateral derecha",
       "TAPA LATERAL DERECHA"
      ],
      [
       "Tapa lateral izquierda",
       "TAPA LATERAL IZQUIERDA"
      ],
      [
       "Posapie derecho",
       "POSAPIE DERECHO"
      ],
      [
       "Posapie izquierdo",
       "POSAPIE IZQUIERDO"
      ],
      [
       "Salpicadera derecha",
       "SALPICADERA DERECHA"
      ],
      [
       "Salpicadera izquierda",
       "SALPICADERA IZQUIERDA"
      ],
      [
       "Batea",
       "BATEA / BETLINER"
      ],
      [
       "Tapa de batea",
       "TAPA DE BATEA"
      ],
      [
       "Defensa trasera",
       "DEFENSA TRASERA"
      ],
      [
       "Chasis",
       "CHASIS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Refacción",
       "REFACCION"
      ]
     ],
     "CERRADURAS": [
      [
       "Switch",
       "SWITCH"
      ],
      [
       "Cerradura tapon tanque de gasolina",
       "CERRADURA TAPON TANQUE GASOLINA"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asiento",
       "ASIENTO"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Amortiguadores delanteros",
       "AMORTIGUADORES DELANTEROS"
      ],
      [
       "Amortiguador trasero",
       "AMORTIGUADOR TRASERO"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "Puño acelerador",
       "PUÑO ACELERADOR"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Carburador",
       "CARBURADOR"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Cardan",
       "CARDAN"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera",
      "LLANTA D"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": false,
    "diagramas": [
     "INS FRONTAL",
     "INS TRASERA",
     "INS IZQUIERDA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.61,
     "h": 52.56,
     "iw": 94.61,
     "ih": 52.56,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-21f134"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "NP300 CABINA REDILAS": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ],
      [
       "Redilas",
       "REDILAS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Botones volante",
       "BOTONES VOLANTE"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 151.53,
     "h": 83.86,
     "iw": 151.53,
     "ih": 83.86,
     "x": 0.0,
     "y": 0.0
    }
   },
   "NP300 ESTACA": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ],
      [
       "Redilas",
       "REDILAS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Botones volante",
       "BOTONES VOLANTE"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "PIPA": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura tanque de combustible",
       "CERRADURA TANQUE COMBUSTIBLE"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Botones volante",
       "BOTONES VOLANTE"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera interior izquierda",
      "LLANTA TII"
     ],
     [
      "Trasera exterior izquierda",
      "LLANTA TEI"
     ],
     [
      "Trasera interior derecha",
      "LLANTA TID"
     ],
     [
      "Trasera exterior derecha",
      "LLANTA TED"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 98.83,
     "h": 48.5,
     "iw": 98.83,
     "ih": 48.5,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-1c71f3"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "RAM 4000": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ],
      [
       "Redilas",
       "REDILAS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "RAM 700": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ],
      [
       "Redilas",
       "REDILAS"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "RIFTER": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Limpiaparabrisas trasero",
       "LIMPIAPARABRISAS TRASERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 106.98,
     "h": 52.92,
     "iw": 1088.13,
     "ih": 618.77,
     "x": -423.48,
     "y": -341.33,
     "logo": "inspeccion-icono-a57213"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "SAVEIRO": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Batea/bedliner",
       "BATEA / BETLINER"
      ],
      [
       "Cabina",
       "CABINA"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Botones volante",
       "BOTONES VOLANTE"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 94.77,
     "h": 39.49,
     "iw": 94.77,
     "ih": 39.49,
     "x": 0.0,
     "y": 0.0,
     "logo": "inspeccion-icono-587f7c"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "URVAN": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Limpiaparabrisas trasero",
       "LIMPIAPARABRISAS TRASERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 90.23,
     "h": 44.28,
     "iw": 90.23,
     "ih": 45.34,
     "x": 0.0,
     "y": -0.53,
     "logo": "inspeccion-icono-059122"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   },
   "XPANDER": {
    "secciones": {
     "DOCUMENTACION": [
      [
       "Gafette",
       "GAFETTE"
      ],
      [
       "Tarjeta de circulación",
       "TARJETA CIRCULACION"
      ],
      [
       "Licencia",
       "LICENCIA"
      ],
      [
       "Póliza de seguro",
       "POLIZA SEGURO"
      ],
      [
       "Verificación",
       "VERIFICACION"
      ],
      [
       "Kardex",
       "KARDEX"
      ]
     ],
     "CRISTALERIA": [
      [
       "Parabrisas",
       "PARABRISAS"
      ],
      [
       "Medallón",
       "MEDALLON"
      ],
      [
       "Cristales puertas",
       "CRISTALES PUERTAS"
      ],
      [
       "Retrovisor izquierdo",
       "RETROVISOR IZQUIERDO"
      ],
      [
       "Retrovisor derecho",
       "RETROVISOR DERECHO"
      ],
      [
       "Faros delanteros",
       "FAROS DELANTEROS"
      ],
      [
       "Calaveras traseras",
       "CALAVERAS TRASERAS"
      ]
     ],
     "NEUMATICOS": [
      [
       "Rines",
       "RINES"
      ],
      [
       "Tapones",
       "TAPONES"
      ],
      [
       "Tuercas/birlos",
       "TUERCAS / BIRLOS"
      ],
      [
       "Alineación",
       "ALINEACION"
      ],
      [
       "Balanceo",
       "BALANCEO"
      ]
     ],
     "INTERIORES": [
      [
       "Asiento de conductor",
       "ASIENTO DE CONDUCTOR"
      ],
      [
       "Asiento de copiloto",
       "ASIENTO DE COPILOTO"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS"
      ],
      [
       "Alfombra",
       "ALFOMBRA"
      ],
      [
       "Cielo",
       "CIELO"
      ],
      [
       "Tablero",
       "TABLERO"
      ],
      [
       "Consola central",
       "CONSOLA CENTRAL"
      ],
      [
       "Guantera",
       "GUANTERA"
      ],
      [
       "Manijas internas",
       "MANIJAS INTERNAS"
      ],
      [
       "Tapa de puerta piloto",
       "TAPA PUERTA PILOTO"
      ],
      [
       "Tapa de puerta copiloto",
       "TAPA PUERTA COPILOTO"
      ],
      [
       "Tapa de puerta trasera derecha",
       "TAPA PUERTA TRASERA DERECHA"
      ],
      [
       "Tapa de puerta trasera izquierda",
       "TAPA PUERTA TRASERA IZQUIERDA"
      ]
     ],
     "LATONERIA": [
      [
       "Cofre",
       "COFRE"
      ],
      [
       "Fascia/parrilla/defensa delantera",
       "FASCIA / PARRILLA / DEFENSA DELANTERA"
      ],
      [
       "Fascia/defensa trasera",
       "FASCIA / DEFENSA TRASERA"
      ],
      [
       "Guardafango/salpicadera frontal izquierda",
       "GUARDAFANGO / SALPICADERA FRONTAL IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera frontal derecha",
       "GUARDAFANGO / SALPICADERA FRONTAL DERECHA"
      ],
      [
       "Guardafango/salpicadera posterior izquierda",
       "GUARDAFANGO / SALPICADERA POSTERIOR IZQUIERDA"
      ],
      [
       "Guardafango/salpicadera posterior derecha",
       "GUARDAFANGO / SALPICADERA POSTERIOR DERECHA"
      ],
      [
       "Puerta piloto",
       "PUERTA PILOTO"
      ],
      [
       "Puerta copiloto",
       "PUERTA COPILOTO"
      ],
      [
       "Puerta trasera izquierda",
       "PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Puerta trasera derecha",
       "PUERTA TRASERA DERECHA"
      ],
      [
       "Maletero",
       "MALETERO"
      ]
     ],
     "INVENTARIOS": [
      [
       "Llanta de refacción",
       "LLANTA DE REFACCION"
      ],
      [
       "Gato mecánico",
       "GATO MECANICO"
      ],
      [
       "Gato hidráulico",
       "GATO HIDRAULICO"
      ],
      [
       "Cruceta",
       "CRUCETA"
      ],
      [
       "Maneral",
       "MANERAL"
      ],
      [
       "Extintor",
       "EXTINTOR"
      ],
      [
       "Cable pasa corriente",
       "CABLE PASACORRIENTE"
      ],
      [
       "Triángulos de señalización",
       "TRIANGULOS DE SEÑALIZACION"
      ],
      [
       "Tapetes",
       "TAPETES"
      ],
      [
       "Cubreasientos",
       "CUBREASIENTOS"
      ],
      [
       "Cubrevolante",
       "CUBREVOLANTE"
      ],
      [
       "Bedliner",
       "BEDLINER"
      ],
      [
       "Cubrebatea",
       "CUBREBATEA"
      ],
      [
       "Parasol",
       "PARASOL"
      ]
     ],
     "CERRADURAS": [
      [
       "Cerradura puerta piloto",
       "CERRADURA PUERTA PILOTO"
      ],
      [
       "Cerradura puerta copiloto",
       "CERRADURA PUERTA COPILOTO"
      ],
      [
       "Cerradura puerta trasera derecha",
       "CERRADURA PUERTA TRASERA DERECHA"
      ],
      [
       "Cerradura puerta trasera izquierda",
       "CERRADURA PUERTA TRASERA IZQUIERDA"
      ],
      [
       "Cerradura tapa batea/maletero",
       "CERRADURA TAPA BATEA / MALETERO"
      ]
     ],
     "LIMPIEZA": [
      [
       "Asientos delanteros",
       "ASIENTOS DELANTEROS"
      ],
      [
       "Asientos traseros",
       "ASIENTOS TRASEROS 2"
      ],
      [
       "Cielo y alfombra",
       "CIELO Y ALFOMBRA"
      ],
      [
       "Exterior de unidad",
       "EXTERIOR DE UNIDAD"
      ],
      [
       "Otros",
       "OTROS"
      ]
     ],
     "SISTEMAS INTERIORES": [
      [
       "Mandos/botonera de vidrios y seguros",
       "MANDOS / BOTONERA VIDRIOS Y SEGUROS"
      ],
      [
       "Clúster/tablero",
       "CLUSTER / TABLERO"
      ],
      [
       "Luces altas",
       "LUCES ALTAS"
      ],
      [
       "Luces bajas",
       "LUCES BAJAS"
      ],
      [
       "Cuartos",
       "CUARTOS"
      ],
      [
       "Direccionales izquierdos",
       "DIRECCIONALES IZQUIERDAS"
      ],
      [
       "Direccionales derechos",
       "DIRECCIONALES DERECHAS"
      ],
      [
       "Intermitentes",
       "INTERMITENTES"
      ]
     ],
     "SISTEMA MECANICO": [
      [
       "Frenos delanteros",
       "FRENOS DELANTEROS"
      ],
      [
       "Frenos traseros",
       "FRENOS TRASEROS"
      ],
      [
       "Freno de mano",
       "FRENO DE MANO"
      ],
      [
       "Suspensión",
       "SUSPENSION"
      ],
      [
       "Amortiguadores",
       "AMORTIGUADORES"
      ],
      [
       "Soportes de motor",
       "SOPORTES DE MOTOR"
      ]
     ],
     "NIVELES": [
      [
       "Aceite de motor",
       "ACEITE MOTOR"
      ],
      [
       "Refrigerante",
       "REFRIGERANTE"
      ],
      [
       "Líquido de frenos",
       "LIQUIDO FRENOS"
      ],
      [
       "Líquido de dirección",
       "LIQUIDO DE DIRECCION"
      ],
      [
       "Liquido limpiaparabrisas",
       "LIQUIDO LIMPIAPARABRISAS"
      ]
     ],
     "SISTEMAS INTERIORES 2": [
      [
       "Niebleros/otros",
       "NIEBLEROS / OTROS"
      ],
      [
       "Stop",
       "STOP"
      ],
      [
       "Limpiaparabrisas delantero",
       "LIMPIAPARABRISAS DELANTERO"
      ],
      [
       "Limpiaparabrisas trasero",
       "LIMPIAPARABRISAS TRASERO"
      ],
      [
       "Sistema multimedia",
       "SISTEMA MULTIMEDIA"
      ],
      [
       "Claxon",
       "CLAXON"
      ],
      [
       "AC/perillas",
       "AC / PERILLAS"
      ],
      [
       "Luces interiores",
       "LUCES INTERIORES"
      ]
     ],
     "SISTEMA MECANICO 2": [
      [
       "Bandas",
       "BANDAS"
      ],
      [
       "Clutch",
       "CLUTCH"
      ],
      [
       "Transmisión",
       "TRANSMISION / CADENA"
      ]
     ],
     "BATERIA": [
      [
       "Terminales con sarro",
       "TERMINALES CON SARRO"
      ],
      [
       "Derrame de líquido, mal olor",
       "DERRAME LIQUIDO / MAL OLOR"
      ],
      [
       "Batería inflada",
       "BATERIA INFLADA"
      ]
     ]
    },
    "llantas": [
     [
      "Delantera derecha",
      "LLANTA DD"
     ],
     [
      "Delantera izquierda",
      "LLANTA DI"
     ],
     [
      "Trasera izquierda",
      "LLANTA TI"
     ],
     [
      "Trasera derecha",
      "LLANTA TD"
     ]
    ],
    "semaforoVertical": true,
    "diagramas": [
     "INS FRONTAL",
     "INS IZQUIERDA",
     "INS TRASERA",
     "INS DERECHA"
    ],
    "icono": {
     "w": 106.98,
     "h": 52.92,
     "iw": 1088.13,
     "ih": 618.77,
     "x": -423.48,
     "y": -341.33,
     "logo": "inspeccion-icono-a57213"
    },
    "bateria": {
     "w": 159.28,
     "h": 87.88,
     "iw": 159.28,
     "ih": 87.88,
     "x": 0.0,
     "y": 0.0
    }
   }
  };

  /** El formato de un tipo (sin distinguir mayúsculas ni espacios de más), o null */
  function de(tipo) {
    const b = String(tipo || '').toUpperCase().replace(/\s+/g, ' ').trim();
    return TIPOS[b] || null;
  }

  return { de, tipos: () => Object.keys(TIPOS) };
})();
