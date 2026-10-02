"""El motor de los pipelines: port de correrPasos_ (src/MigracionFamilia.gs).

Las reglas que se conservan:
  - un paso de solo lectura nunca escribe (y si lo intentara, truena);
  - escribiendo, la primera marca mala (PROBLEMAS / FALLAS) o el primer error DETIENE todo;
  - cada paso ve lo que dejó el anterior: corren todos sobre el MISMO modelo del libro, que
    refleja cada escritura en cuanto se manda.

Lo que cambia por estar fuera de Apps Script:
  - no hay freno de tiempo;
  - el reporte guarda el texto COMPLETO de cada paso, no solo el resumen;
  - el ENSAYO es una SIMULACIÓN: corre los pasos escribiendo sobre una copia en memoria,
    así cada paso ve lo que hizo el anterior y no queda nada «no ensayable».
"""
import time

from pasos import PASOS, SOLO_LEEN


def correr_pipeline(titulo, pasos, familia, escribir, abrir, ids, avisar=print):
    """
    pasos   [(nombre, marca_mala | None)]
    abrir   función sin argumentos que da el libro sobre el que corre cada paso: siempre el
            mismo modelo (en memoria en la simulación; leído de Google una vez, escribiendo)
    escribir  True = los cambios se mandan a Google; False = simulación en memoria
    Devuelve (texto, detenido_en | None).
    """
    partes = [titulo + "  —  " + ("ESCRIBIENDO" if escribir else "SIMULACIÓN en memoria, no toca el libro"), ""]
    detenido = None
    corridos = 0
    for i, (nombre, marca) in enumerate(pasos):
        etiqueta = "━━━ paso %d/%d: %s%s ━━━" % (i + 1, len(pasos), nombre, "  (solo lee)" if nombre in SOLO_LEEN else "")
        avisar("  " + titulo.split("—")[0].strip() + " · " + nombre + "…")
        arranque = time.time()
        libro = abrir()
        cfg = {"escribir": nombre not in SOLO_LEEN, "familia": familia, "ids": ids}
        try:
            salida = PASOS[nombre](libro, cfg)
            if nombre in SOLO_LEEN and libro.ops:
                raise RuntimeError("un paso de solo lectura quiso escribir; no se mandó nada")
            mandadas = libro.confirmar()
        except Exception as e:  # noqa: BLE001 — se reporta y se detiene, igual que el original
            partes += [etiqueta, "  TRONÓ: %s" % e, ""]
            detenido = nombre
            break
        corridos += 1
        pie = "  (%.1f s%s)" % (time.time() - arranque,
                                ", %d operaciones mandadas a Google" % mandadas if escribir and mandadas else "")
        partes += [etiqueta, salida, pie, ""]
        if marca and marca in salida:
            detenido = nombre
            break

    partes.append("━━━ resumen ━━━")
    partes.append("  pasos corridos: %d de %d" % (corridos, len(pasos)))
    if detenido:
        partes.append('  SE DETUVO en "%s". No se corrieron los pasos siguientes, a propósito.' % detenido)
        partes.append("  Revisa ese paso arriba, arregla lo que diga, y vuelve a correr.")
    else:
        partes.append("  LISTO: corrieron los %d pasos." % len(pasos))
    return "\n".join(partes), detenido
