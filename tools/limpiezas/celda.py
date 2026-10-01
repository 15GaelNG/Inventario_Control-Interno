"""Una celda con estilo para datos.py. Lo que no lleve estilo se escribe como valor suelto."""


class Celda:
    def __init__(self, valor, negrita=False, relleno=None):
        self.valor = valor
        self.negrita = negrita
        self.relleno = relleno
