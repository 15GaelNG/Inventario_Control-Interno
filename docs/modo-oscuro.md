# Modo oscuro: contraste, brillo y carga (5-nov-2026)

El área reportó que en oscuro varios datos no se alcanzaban a leer. Se rehízo la paleta con números, se agregó un brillo
tenue a los KPIs y un componente de carga (esqueletos) para todo el sistema. El modo claro queda igual.

## Cómo se mide

`node tools/vista-previa/contraste.js` abre cada escena de la vista previa en oscuro (`--claro` para el claro) y mide
cada texto visible contra el fondo que tiene detrás (los fondos de sus contenedores encimados, con su transparencia).
Usa **APCA** (Lc, el método propuesto para WCAG 3), porque la razón de WCAG 2 sobreestima el contraste de los colores
oscuros y trata igual texto claro sobre oscuro que al revés. Mínimos:

| Texto | Lc mínimo |
|---|---|
| De lectura y datos (12–14 px, lo normal del sistema) | 60 |
| Grande (24 px+) o 16 px+ en negrita | 45 |
| Deshabilitado, placeholder, escondido a propósito | no cuenta |

Antes: 4,577 de 10,460 textos debajo del mínimo en 126 escenas. Después: 257 y se corrigieron casi todos los que quedaban.

## Lo que estaba mal

1. **El gris secundario** (`--color-text-muted`, 3,300 textos): 6.8:1 en WCAG 2 pero Lc 55 en APCA, poco para letra de
   12 px. Pasó de `#9db0b8` a `#b3c3cb` (Lc 62+).
2. **El azul usado como texto** (`--color-primary`, ~400 textos: enlaces, "Ver", "Volver", botones secundarios): el mismo
   azul medio de los botones, 3.3:1. Un color de relleno no sirve como texto en oscuro.
3. **Verde y bronce de estado** (`--color-success`, `--color-danger`) nunca tenían valor oscuro: 3:1.
4. Fondos claros fijos (`#e5f6ec`, `#F3ECD6`, `#fff`) en pastillas de estado y en el Sí/No.

## Papeles de color (lo que se usa de aquí en adelante)

| Para | Token | Claro | Oscuro |
|---|---|---|---|
| Texto, enlace o ícono azul | `--color-primary-texto` | = `--color-primary` | `#8fcdf3` |
| Relleno de botón azul | `--color-primary` | `#06263A` | `#2a72a3` (blanco encima 5.2:1) |
| Texto sobre un relleno | `--color-on-primary`, `-on-accent`, `-on-success`, `-on-danger` | blanco / navy | blanco / navy / oscuro |
| Fondo suave de estado | `--color-success-soft`, `--color-danger-soft` | | |
| Borde de lo que se toca (campos, botón secundario) | `--color-borde-control` | = `--color-border` | `#56737f` (3:1) |
| Divisor | `--color-border` | | `#2c4653` |

**Nunca `color: var(--color-primary)`**: siempre `--color-primary-texto` (se migraron 65 usos). Los 6 colores de
Apariencia traen su `--color-primary-texto` en oscuro y su relleno en un tono que deja el texto blanco a 4.5:1.

Fondos en escalones del mismo azul pizarra (sin negro puro: deslumbra el texto y "mancha" al desplazar): página
`#0a161d`, tarjeta `#15262f`. Texto `#f2f5f7`, no blanco puro. Colores de estado aclarados y menos saturados (un color
saturado vibra sobre oscuro). Los estatus de Help Desk vienen de TI con su color: en oscuro se mezclan con blanco
(`color-mix`).

## Brillo (solo en oscuro)

En oscuro la sombra no se ve: la profundidad la dan un filo de luz arriba (`--brillo-filo`, 7% de blanco) y un halo del
color del KPI, tenue y poco saturado (`--kpi-brillo`: azul, verde en `-ok`, bronce en alerta). Lo llevan `.stat-tile`,
`.kpi-chip` y las tarjetas del Panorama de Líneas; sube un poco al pasar el cursor. Las demás tarjetas solo el filo; los
botones principales un halo azul al pasar el cursor. Un KPI nuevo con esas clases ya lo trae.

## Carga (componentes/carga.html)

`Carga.html('bloque' | 'lista' | 'kpis' | 'ficha' | 'barras' | 'caja', { n, texto, tarjeta, columnas, alto })`, o
`<div data-carga="lista" data-carga-n="4">` en una vista. Aparece a los 150 ms (una carga rápida no parpadea), respeta
"reducir movimiento", anuncia "Cargando…" a un lector de pantalla y DataTable usa la misma pieza (`.carga-hueso`). Se
migraron ~45 "Cargando…" escritos a mano y los esqueletos propios de DataTable, Help Desk y Líneas. Contrato en
`source-contracts`; prueba en `tests/carga.test.js`.

## Fuentes

- Material Design, *Dark theme* (superficies, elevación por claridad, colores desaturados): https://m2.material.io/design/color/dark-theme
- APCA (Myndex), introducción y niveles Lc: https://github.com/Myndex/apca-introduction
- Radix Colors, *Understanding the scale* (papeles de cada escalón): https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale
- Brillo en oscuro, color tenue y no neón: https://www.react.doctor/docs/rules/react-doctor/no-dark-mode-glow
