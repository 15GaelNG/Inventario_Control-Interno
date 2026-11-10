"""Lo común de tools/pdf/html: los documentos que se replican en HTML, Drive y la carpeta de trabajo.

Todo lo que se baja (PDF reales, datos, firmas, la plantilla con su tipografía) queda en tools/pdf/.cache/<documento>/,
fuera de git: trae datos de personas y la tipografía es comercial. Se lee producción con el token de tools/migracion
(credenciales('lab'), la cuenta auxiliar6datos) y SOLO se lee: lo único que se escribe en Drive es la carpeta de prueba
"PRUEBA PDF HTML" de esa cuenta.
"""
import io
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(RAIZ / 'tools' / 'migracion'))
CACHE = RAIZ / 'tools' / 'pdf' / '.cache'
CARPETA_PRUEBA = 'PRUEBA PDF HTML'

# Libros de producción (src/config/Entornos.gs, bloque de prod)
LIBRO_VEHICULOS = '17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc'

# Un documento por entrada: de dónde salen sus registros, su PDF y su plantilla de Docs (la que se replica)
DOCUMENTOS = {
    'responsiva-vehicular': {
        'libro': LIBRO_VEHICULOS, 'hoja': 'RESPONSIVA VEHICULAR', 'pdf': 'PDF', 'fecha': 'FECHA',
        'plantilla': '1JCbmKTFkSQlY5mXG0RFi54K3d7rSyuO_lb4oVCHjmHc',
        'firmas': ['FIRMA RESPONSABLE', 'FIRMA JEFE', 'FIRMA CI'], 'pagina_firmas': 1,
        'fecha_en_pdf': True,   # DIA / MES / AÑO salen del día en que se firmó (el que dice el PDF)
    },
    'adherente-vehicular': {
        'libro': LIBRO_VEHICULOS, 'hoja': 'ADHERENTE VEHICULAR', 'pdf': 'PDF', 'fecha': 'FECHA',
        'plantilla': '1vwDs6mtcGHGVF1RdirqC6Um30QGRclmJXMDoDO0LhMQ',
        'firmas': ['FIRMA ADHERENTE', 'FIRMA JEFE', 'FIRMA CI'], 'pagina_firmas': -1,   # la última hoja
        'fecha_en_pdf': True,
    },
    'arqueo': {
        'libro': LIBRO_VEHICULOS, 'hoja': 'ARQUEOS', 'pdf': 'FORMATO ARQUEO', 'fecha': 'FECHA INICIO',
        'plantilla': '1ZIhyDvbG5WENKL73lyGPZWDehAPXRf9yu3-en5vhX-w',
        'firmas': ['FIRMA RESPONSABLE', 'FIRMA ESPECIALISTA', 'FIRMA ASISTENTE'], 'pagina_firmas': -1,
        'crudo': True,   # los montos como números (los formatea ArqueosService.datosHtml_, como en la app)
    },
    'responsiva-celular': {
        'libro': LIBRO_VEHICULOS, 'hoja': 'RESPONSIVAS LINEAS', 'pdf': 'FORMATO RESPONSIVA', 'fecha': 'FECHA RESPONSIVA',
        'plantilla': '1sbV_lv6-U8xxGU0Gbcsmtw4iKBfKfIfNdaQ_li4ioBQ',   # LineasPdf.PLANTILLAS.RESPONSIVA_CELULAR
        'firmas': [], 'pagina_firmas': 0,   # sus imágenes las saca bajar.py por posición (firmas_responsiva)
    },
}


def carpeta(documento):
    c = CACHE / documento
    c.mkdir(parents=True, exist_ok=True)
    return c


def servicios():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    cred = credenciales('lab')
    return (build('sheets', 'v4', credentials=cred, cache_discovery=False).spreadsheets(),
            build('drive', 'v3', credentials=cred, cache_discovery=False))


def bajar(dr, file_id, destino, exportar=None):
    from googleapiclient.http import MediaIoBaseDownload
    req = dr.files().export_media(fileId=file_id, mimeType=exportar) if exportar else \
        dr.files().get_media(fileId=file_id, supportsAllDrives=True)
    with open(destino, 'wb') as fh:
        d = MediaIoBaseDownload(fh, req)
        fin = False
        while not fin:
            _, fin = d.next_chunk()


def carpeta_prueba(dr, sub=None):
    """La carpeta de prueba en Mi unidad de la cuenta (y una subcarpeta), creándolas si faltan → id"""
    def una(nombre, padre):
        q = f"name='{nombre}' and mimeType='application/vnd.google-apps.folder' and '{padre}' in parents and trashed=false"
        r = dr.files().list(q=q, fields='files(id)').execute()['files']
        if r:
            return r[0]['id']
        return dr.files().create(body={'name': nombre, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [padre]},
                                 fields='id').execute()['id']
    c = una(CARPETA_PRUEBA, 'root')
    return una(sub, c) if sub else c


def subir(dr, carpeta_id, ruta, nombre=None, mime='application/octet-stream'):
    """Sube (o reemplaza) un archivo en la carpeta → id"""
    from googleapiclient.http import MediaFileUpload
    nombre = nombre or Path(ruta).name
    viejo = dr.files().list(q=f"name='{nombre}' and '{carpeta_id}' in parents and trashed=false", fields='files(id)').execute()['files']
    media = MediaFileUpload(str(ruta), mimetype=mime)
    if viejo:
        return dr.files().update(fileId=viejo[0]['id'], media_body=media).execute()['id']
    return dr.files().create(body={'name': nombre, 'parents': [carpeta_id]}, media_body=media, fields='id').execute()['id']


def salida_utf8():
    sys.stdout.reconfigure(encoding='utf-8')
