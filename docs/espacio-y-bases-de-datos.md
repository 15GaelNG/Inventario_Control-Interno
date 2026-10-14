# Espacio del libro de producción y bases de datos gratuitas

Revisión del 13-oct-2026 (solo lectura del libro productivo `17YrtuMY…`).

## ¿Nos acabamos el espacio?

Google Sheets permite **10 millones de celdas por archivo**, contando toda la cuadrícula (también las celdas vacías).

- El libro: 50 pestañas, **5.73 millones de celdas = 57 %** del límite.
- Con datos de verdad: ~2.8 millones. Casi la mitad es cuadrícula vacía.

| Pestaña | Cuadrícula | Con datos | Celdas vacías |
|---|---|---|---|
| VEHICULOS | 50,495 × 47 | 650 renglones | **2.34 millones** |
| COLABORADORES (vieja) | 15,264 × 26 | 3,628 renglones, 9 columnas | ~300 mil (se va a borrar) |
| INSPECCION VEHICULAR | 994 × 197 | 313 | 134 mil |
| ARQUEOS / RESPONSIVA | ~990 × 82 / 63 | 146 / 3 | ~130 mil |
| CAMBIOS LINEAS TELEFONICAS | 35,703 × 27 | todos, pero 11 columnas | ~570 mil en columnas sin usar |

- Quitar los renglones vacíos de VEHICULOS deja el libro en **~34 %**. Antes, averiguar por qué creció a 50 mil
  renglones (¿AppSheet, un pegado?) para que no se repita.
- Lo que crece de verdad son las bitácoras (CAMBIOS LINEAS TELEFONICAS, CAMBIOS VEHICULOS). Si un día hace falta, lo
  viejo se manda a un libro de archivo.
- Retirar PERSONAS y la COLABORADORES vieja libera ~470 mil celdas más.
- Pendiente opcional: que `revisarEntorno` avise si el libro pasa de 70 %.

Conclusión: faltan años para el límite al ritmo actual. Ninguna limpieza se ha hecho; se hace con bitácora y aprobación.

## ¿Una base de datos gratuita?

Lo que la app pediría: poco volumen (50–150 MB), pero **muchas lecturas** (listas completas, la de CH son 15 mil
renglones, y el Calentador las rehace cada 10 min: cientos de miles o millones de lecturas al día). Apps Script se conecta
a Postgres directo (JDBC) o a cualquier base con API web (`UrlFetchApp`).

| Opción | Gratis | ¿Sirve? |
|---|---|---|
| Firebase / Firestore | 1 GB, 50 mil lecturas y 20 mil escrituras al día | **No**: una carga de la lista de CH son 15 mil lecturas |
| Neon (Postgres) | 1 GB (desde 1-oct-2026), 100 horas de cómputo al mes | **No**: se apaga tras 5 min sin uso y el Calentador la despertaría cada 10 min (~180 h/mes); al acabarse, apagada hasta el mes siguiente |
| Cloudflare D1 (SQLite) | 5 GB, 5 M renglones leídos/día, 100 mil escritos | Más o menos: desde 1-sep-2026 corta en seco al límite y necesita un Worker intermedio |
| Turso (SQLite en la nube, libSQL) | 5 GB, 500 M lecturas/mes, 10 M escrituras | Sí técnicamente, por API web; empresa chica, respaldo de 1 día |
| Supabase (Postgres) | 500 MB, sin límite de lecturas, pausa tras 7 días sin uso | La mejor opción, pero **sin respaldos automáticos** en el plan gratuito |

## Recomendación: no migrar ahora

1. Sheets tiene margen (57 % → ~34 % con la limpieza).
2. Los planes gratuitos no traen respaldos ni soporte; hoy está el historial de versiones de Sheets y la cuenta de
   Workspace de la empresa.
3. COLABORADORES ACTUALIZADO tiene datos de empleados: sacarlos a un proveedor externo pide autorización.
4. No ganaría velocidad: la espera viene de Apps Script (1–2.5 s por llamada); Postgres suma ~250 ms por conexión.
5. Migrar es reescribir `HojaServicio` y todos los servicios, caché, Salud, Datos conectados, y se pierde corregir a mano.

Si un día hace falta: primero bitácoras a otro libro; si de verdad se necesita una base, Supabase con respaldo diario
propio a Drive (o el plan Pro, US$25/mes, que trae respaldos).

Fuentes: [Firestore](https://agentdeals.dev/vendor/firebase) · [Neon](https://neon.com/faqs/free-plan-limits-and-quotas) ·
[Neon 1 GB](https://github.com/robhunter/agentdeals/issues/2235) · [D1](https://developers.cloudflare.com/d1/platform/pricing/) ·
[D1 2026](https://agentdeals.dev/vendor/cloudflare-d1) · [Turso](https://turso.tech/pricing.md) ·
[Supabase](https://supabase.com/pricing) · [JDBC en Apps Script](https://developers.google.com/apps-script/guides/jdbc) ·
[Postgres desde Apps Script](https://justin.poehnelt.com/posts/apps-script-postgresql/)
