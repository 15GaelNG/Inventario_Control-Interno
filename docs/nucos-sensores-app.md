# Responsivas de sensores de la app → expediente del NUCO (corrida 3, 14-oct-2026)

Las responsivas de la hoja INSTALACION DE SENSORES (columna RESPONSIVA SENSOR) vivían en
`ControlVehicular/INSTALACION DE SENSORES_Files_`. Hoy **esa carpeta está vacía**: todo está en
`NUCOS VEHICULOS/<NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA/SENSORES`, y la hoja guarda la liga. Es donde la app guarda las
nuevas desde el 12-oct (`SensoresService` + `ExpedienteNuco`). Plan de la Fase 3: `nucos-fase3-pendiente.md`.

## Reglas

- **El vehículo es el del registro:** su ID VEHICULO, cuya serie debe ser la del registro; sin ID, por la serie. Nunca por
  folio. En los 207 registros con ID, ID y serie coinciden.
- El texto del PDF solo sirve para confirmar: si trae la placa o la serie del sensor de otro vehículo, no se mueve.
  67 PDF confirman su NUCO, 0 lo contradicen y 138 son escaneos sin texto.
- **Nada se queda donde estaba antes:**
  - la que abre el registro → `SENSORES/RESPONSIVA SENSOR-NNNN <FECHA INSTALACION>.pdf` (`(2)` si existe), la celda guarda
    la liga;
  - versiones anteriores (AppSheet regeneró el PDF del mismo registro; su prefijo es el ID ANTERIOR) →
    `SENSORES/ANTERIORES` con su nombre original; si fuera idéntica (mismo md5) a la vigente → `SENSORES/DUPLICADOS`
    (no hubo ninguna);
  - sin vehículo o sin registro → `NUCOS VEHICULOS/_POR REVISAR/SENSORES SIN NUCO` (o `_POR REVISAR` de su NUCO si el PDF lo
    dice).
- Mover conserva el ID del archivo. Bitácora en `.cache/bitacoras/` y en Drive (PRUEBA DE NUCOS VEHICULARES/BITACORAS).

## Corrida

Herramienta: `tools/nucos/sensores_app.py` (`plan` → `.cache/sensores/plan.json` y `plan.xlsx`; `aplicar [--nucos]`;
`verificar`; `deshacer`).

| Paso | Resultado | Bitácora |
|---|---|---|
| Piloto: NUCO 27, 58, 188, 88 y 308 | 13 archivos, 5 celdas, 10 carpetas | `20261014-145741-sensores-app` |
| Resto | 353 archivos, 201 celdas, 322 carpetas; 13 saltados (los del piloto, ya movidos) | `20261014-150157-sensores-app` |

En total: 205 responsivas en su NUCO, 158 versiones anteriores en `ANTERIORES` (126 NUCO) y 3 en `_POR REVISAR`.

**Revisión final, en vivo, de los 208 registros:** 205 abren `RESPONSIVA SENSOR-NNNN <fecha>` dentro de
`<su NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA/SENSORES` con la fecha de instalación correcta; 1 abre `_POR REVISAR`; 2 nunca
tuvieron responsiva. `INSTALACION DE SENSORES_Files_`: 0 archivos.

## Pendiente (para el usuario o el área)

- **SEN-0000006EX25STF:** Mazda 2018, serie JM1BN1V39J1192551, sin folio ni placa, responsable Ricardo Iván Sánchez Lara,
  instalado 29-ene-2025. La serie no está en VEHICULOS (ni parecida). Su responsiva está en
  `_POR REVISAR/SENSORES SIN NUCO`; si se sabe qué vehículo es, ligarlo y moverla.
- **`jnjdc114` y `jnjdc124`:** responsivas escaneadas sin registro (probablemente de registros borrados en AppSheet), en
  `_POR REVISAR/SENSORES SIN NUCO`.
- **Sin responsiva:** SEN-0000005PJ4XAZG (NUCO 445) y SEN-0000006FHJS2A9 (NUCO 427).

## Deshacer

`sensores_app.py deshacer <bitácora>`: primero la del resto y luego la del piloto. Regresa solo las celdas que siguen con
la liga que puso y luego los archivos.
