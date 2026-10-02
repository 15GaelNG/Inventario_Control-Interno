"""Las pruebas importan los módulos de tools/migracion como planos (igual que migrar.py)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
