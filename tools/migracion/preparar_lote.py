import sys
import os
import json
import glob
import openpyxl
import pymupdf

sys.path.insert(0, os.path.dirname(__file__))
from extraer_responsivas_digitales import extraer

CARPETA = r"C:\Users\CIUDAD MADERAS\Downloads\Responsivas por NUCO"
INDICE = os.path.join(CARPETA, "Indice de responsivas.xlsx")
SCRATCH = sys.argv[1]
PAGINAS = os.path.join(SCRATCH, "paginas")


def cargar_indice():
    wb = openpyxl.load_workbook(INDICE, data_only=True)
    ws = wb["Responsivas"]
    filas = list(ws.iter_rows(min_row=2, values_only=True))
    por_archivo = {}
    for r in filas:
        nuco, folio, placa, estatus, origen, archivo = r[0], r[1], r[2], r[3], r[4], r[5]
        if archivo:
            por_archivo[archivo] = {"nuco": nuco, "folio": folio, "placa": placa,
                                     "estatus": estatus, "origen": origen}
    return por_archivo


def clasificar_pdf(ruta):
    doc = pymupdf.open(ruta)
    page = doc[0]
    r = extraer(ruta)
    annots = list(page.annots() or [])
    if r["plantilla"] in ("VIEJA_4", "NUEVA_13") and not annots:
        return "DIGITAL_LIMPIO", r["datos"]
    return "NECESITA_VISUAL", None


def renderizar_pagina1(ruta_pdf, destino_png):
    doc = pymupdf.open(ruta_pdf)
    page = doc[0]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(2, 2))
    pix.save(destino_png)


def main():
    os.makedirs(PAGINAS, exist_ok=True)
    indice = cargar_indice()
    manifest = []
    for ruta in sorted(glob.glob(os.path.join(CARPETA, "*"))):
        nombre = os.path.basename(ruta)
        if nombre.startswith("~$") or nombre == "Indice de responsivas.xlsx":
            continue
        ext = os.path.splitext(nombre)[1].lower()
        info = indice.get(nombre, {})
        entrada = {"archivo": nombre, "nuco": info.get("nuco"), "folio": info.get("folio"),
                   "placa": info.get("placa"), "origen": info.get("origen")}
        if ext == ".xlsx":
            entrada["tipo"] = "EXCLUIDO_XLSX"
        elif ext == ".png":
            entrada["tipo"] = "NECESITA_VISUAL"
            entrada["imagen"] = ruta
        elif ext == ".pdf":
            tipo, datos = clasificar_pdf(ruta)
            entrada["tipo"] = tipo
            if datos is not None:
                entrada["datos"] = datos
            if tipo == "NECESITA_VISUAL":
                destino = os.path.join(PAGINAS, os.path.splitext(nombre)[0] + ".png")
                try:
                    renderizar_pagina1(ruta, destino)
                    entrada["imagen"] = destino
                except Exception as e:
                    entrada["error_render"] = str(e)
        else:
            entrada["tipo"] = "DESCONOCIDO"
        manifest.append(entrada)

    out_path = os.path.join(SCRATCH, "manifest.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    from collections import Counter
    print(Counter(e["tipo"] for e in manifest))
    print("manifest:", out_path)


if __name__ == "__main__":
    main()
