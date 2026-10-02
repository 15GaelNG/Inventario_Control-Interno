"""La base que todo lo demás supone: que Python ve las celdas y el azar IGUAL que JS."""
import json

from ids import Ids, Mulberry32, a_base32, prefijo, tiene_forma
from jsnode import node_json
from valores import clave, limpio, redondear_js, texto_js

CASOS = [45, 0, -3, 1.5, 0.1, 1e21, 123456789012, 2.5e-7, 1092110, 3.0, True, False, None, "",
         "  CTA0100 ", "\ufeffE5818DE5", "a\u00a0", "ß", "VEH-00000000KEVN5G"]


def test_texto_como_js():
    js = node_json("console.log(JSON.stringify(%s.map(v => [String(v == null ? '' : v), "
                   "String(v == null ? '' : v).trim(), String(v == null ? '' : v).trim().toUpperCase()])))"
                   % json.dumps(CASOS, ensure_ascii=False))
    for v, (t, l, k) in zip(CASOS, js):
        assert texto_js(v) == t, v
        assert limpio(v) == l, v
        assert clave(v) == k, v


def test_redondeo_como_js():
    xs = [0.5, 1.5, 2.5, -0.5, 99.45, 72.5, 0.0]
    js = node_json("console.log(JSON.stringify(%s.map(Math.round)))" % json.dumps(xs))
    assert [redondear_js(x) for x in xs] == js


def test_mulberry32_como_js():
    js = node_json("const {mulberry32}=require('./tests/fakes/libro-en-memoria');"
                   "const r=mulberry32(42);console.log(JSON.stringify(Array.from({length:50},()=>r())))")
    g = Mulberry32(42)
    assert [g.random() for _ in range(50)] == js


def test_ids_de_legado_como_js():
    js = node_json(
        "const fs=require('fs'),vm=require('vm');const {mulberry32}=require('./tests/fakes/libro-en-memoria');"
        "const c=vm.createContext({__azar:mulberry32(7)});vm.runInContext('Math.random=__azar;',c);"
        "vm.runInContext(fs.readFileSync('src/utils/Ids.gs','utf8')+';this.Ids=Ids;',c);"
        "console.log(JSON.stringify([0,1,31,32,1000,35666].map(i=>c.Ids.deLegado('CLI',i))))")
    g = Ids(Mulberry32(7))
    assert [g.de_legado("CLI", i) for i in [0, 1, 31, 32, 1000, 35666]] == js


def test_forma():
    assert tiene_forma("VEH-00000000KEVN5G") and tiene_forma(" veh-00000000kevn5g ")
    assert not tiene_forma("VEH-00000000KEVN5") and not tiene_forma("E5818DE5")
    assert prefijo("LIN-00000000KEVN5G") == "LIN" and prefijo("x") is None
    assert a_base32(35666, 8) == "000012TJ"
