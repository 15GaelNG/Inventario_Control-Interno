"""Correr un pedacito de JS con node y regresar lo que imprime como JSON."""
import json
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]


def node_json(codigo):
    r = subprocess.run(["node", "-e", codigo], cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    if r.returncode != 0:
        raise RuntimeError("node falló:\n" + r.stderr)
    return json.loads(r.stdout)
