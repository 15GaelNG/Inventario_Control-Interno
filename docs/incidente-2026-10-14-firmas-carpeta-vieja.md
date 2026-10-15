# Incidente 14-oct-2026: firmas de Responsiva y Adherente a la carpeta vieja

**Estado:** se corrigió solo con el despliegue de la mañana; quedan 5 firmas por mover (corrida 4 de la Fase 3).

## Qué pasó

Desde el 12-oct (`fa275ce`), el respaldo de firmas de Responsiva y Adherente se guarda en el expediente del vehículo:
`NUCOS VEHICULOS/<NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA/FIRMAS/FIRMA <CAMPO>-NNNN aaaa-mm-dd.png`
(`ExpedienteNuco.guardar`). La mañana del 14-oct, producción guardó las firmas **con el nombre del formato anterior y
en la carpeta vieja** `ControlVehicular/RESPONSIVAS VEHICULARES_Images`. Los PDF sí llegaron al NUCO.

| Hora (CDMX) | Registro | PDF | Firmas |
|---|---|---|---|
| 08:13 | Adherente de Aarón Moreno Cortez, 18TYR7 (NUCO 402) | `ADHERENTE-0402 2026-10-14.pdf` en el NUCO ✅ | `FIRMA ADHERENTE/JEFE/CI AARON MORENO CORTEZ 18TYR7 2026-10-14` en la carpeta vieja ❌ |
| 08:55 | Responsiva de David Leandro Díaz, SV5915C (NUCO 78) | `RESPONSIVA-0078.pdf` en el NUCO ✅ | `FIRMA JEFE/CI DAVID LEANDRO DIAZ SV5915C 2026-10-14` en la carpeta vieja ❌ |
| 12:54 | Responsiva del NUCO 656 | en el NUCO ✅ | `FIRMA RESPONSABLE/JEFE/CI-0656 2026-10-14` en `FIRMAS` ✅ |

Entre las 9 y las 12 hubo un despliegue y el error desapareció. Ninguna otra carpeta vieja recibió archivos nuevos
desde el 12-oct (INSPECCION VEHICULAR_Images, VERIFICACIONES_Images, REPORTES, INSTALACION DE SENSORES_Files_,
RESPONSIVAS_VEHICULARES, ADHERENTES VEHICULAR).

## Causa probable

Producción estuvo esa mañana en una versión que no tenía el cambio del 12-oct para las firmas (el nombre de los
archivos es el del formato anterior, no el de `ExpedienteNuco`). Coincide con el commit de Emmanuel de ese día en
master (`fdac078`): *"Líneas: Proveedor apagado en producción (la primera versión del 7-oct volvió con la v116…)"*:
la v116 regresó código viejo, y no solo en Líneas. El despliegue que lo corrigió volvió a poner el código actual.

No se confirmó en el historial de despliegues (`clasp list-deployments` no corre aquí); la conclusión sale de los datos
y del código. Otra explicación posible era que la fila llegara sin NUCCO: el código actual, sin NUCCO, guarda justo así
(nombre viejo, carpeta vieja; `ResponsivaVehicularService.gs:294`, `AdherenteVehicularService.gs:268`). Pero el PDF de
esa misma llamada se guarda con el mismo `fila['NUCCO']` (`:315` / `:288`) y sí llegó al NUCO, así que la fila traía su
NUCCO. Lo que no tenía era el cambio de las firmas.

## Qué falta

- **Mover las 5 firmas** a `5.-RESPONSIVA/FIRMAS` del NUCO 402 y del 78, con bitácora (corrida 4).
- **Avisar a Emmanuel** que la v116 también regresó el guardado de firmas, y revisar qué otra cosa pudo regresar
  esa versión.
- **Para que no se repita:** desplegar solo con la GitHub Action desde `master` (docs/subir-automatico.md), que sube
  lo que está en master y no una versión anterior.

## Cómo se detectó

Durante la exploración de la corrida 4: una consulta a Drive de los archivos de firma y responsiva creados desde el
13-oct, con su carpeta.
