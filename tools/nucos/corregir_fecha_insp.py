"""Corrige la fecha de una inspección que el área nombró mal (y que la homologación del 11-oct copió): manda la fecha
IMPRESA en el PDF. Renombra el PDF y, si hace falta, su carpeta (POR <MOTIVO> <fecha>, o el periodo cuando la carpeta
solo tiene esa inspección). Nunca separa un PDF de sus fotos: se renombra la carpeta entera, no se mueven archivos sueltos.

    corregir_fecha_insp.py aplicar <correcciones.json>    EN LA REAL. Bitácora .cache/bitacoras/<fecha>-fecha-insp.jsonl
    expediente.py deshacer <bitácora>                      Regresa los nombres

<correcciones.json>: [{"nuco", "archivo": id, "de_nombre", "a_nombre", "carpeta": id|null, "carpeta_de", "carpeta_a",
"motivo"}]. Antes de tocar cada una revisa que el archivo y la carpeta sigan llamándose como dice, y que el nombre nuevo no
exista ya junto a ellos.
"""
import sys, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e


def aplicar(ruta):
    d = e.drive()
    cs = json.loads(Path(ruta).read_text(encoding="utf-8"))
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-fecha-insp.jsonl"))
    for c in cs:
        f = e.llamar(d.files().get(fileId=c["archivo"], fields="name,parents,trashed", supportsAllDrives=True))
        if f.get("trashed") or f["name"] != c["de_nombre"]:
            print("  %s: el PDF ya no se llama %r: se salta" % (c["nuco"], c["de_nombre"])); continue
        padre = f["parents"][0]
        if c.get("carpeta"):
            g = e.llamar(d.files().get(fileId=c["carpeta"], fields="name,parents,trashed", supportsAllDrives=True))
            if g.get("trashed") or g["name"] != c["carpeta_de"] or padre != c["carpeta"]:
                print("  %s: la carpeta ya no es %r o el PDF no está en ella: se salta" % (c["nuco"], c["carpeta_de"])); continue
            abuelo = g["parents"][0]
            ya = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (abuelo, c["carpeta_a"]),
                                         fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True))["files"]
            if ya:
                print("  %s: ya existe una carpeta %r: se salta" % (c["nuco"], c["carpeta_a"])); continue
        ya = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (padre, c["a_nombre"]),
                                     fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True))["files"]
        if ya:
            print("  %s: ya existe %r junto al PDF: se salta" % (c["nuco"], c["a_nombre"])); continue
        e.llamar(d.files().update(fileId=c["archivo"], body={"name": c["a_nombre"]}, fields="id", supportsAllDrives=True))
        bit.anotar(accion="mover", nuco=c["nuco"], id=c["archivo"], de_padre=padre, de_nombre=c["de_nombre"], a_padre=padre,
                   a_nombre=c["a_nombre"], motivo=c["motivo"])
        if c.get("carpeta"):
            e.llamar(d.files().update(fileId=c["carpeta"], body={"name": c["carpeta_a"]}, fields="id", supportsAllDrives=True))
            bit.anotar(accion="renombrar_carpeta", nuco=c["nuco"], id=c["carpeta"], de_nombre=c["carpeta_de"], a_nombre=c["carpeta_a"],
                       motivo=c["motivo"])
        print("  %s: %s → %s%s" % (c["nuco"], c["de_nombre"], c["a_nombre"],
                                   ("  (carpeta %s → %s)" % (c["carpeta_de"], c["carpeta_a"])) if c.get("carpeta") else ""))
    print("Bitácora:", bit.ruta)
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "aplicar":
        aplicar(sys.argv[2])
    else:
        print(__doc__)
