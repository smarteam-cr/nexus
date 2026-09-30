"""Pruebas de cada versión de la Escala de Rendimiento.

Las pruebas están descritas en la especificación del cálculo, en «Pruebas de cada versión».

Uso:
    python3 pruebas_escala.py escala_rendimiento_smarteam.md especificacion_calculo_escala.md [escala_anterior.md]

La escala trae la matriz y las reglas; la especificación, el cálculo y sus ejemplos. Si se pasa la
versión anterior de la escala, la prueba 5 revisa que ningún identificador haya desaparecido. Si el
manual de operación está en la misma carpeta que la especificación, la prueba 7 revisa también su
encabezado.
"""
import math
import os
from fractions import Fraction
import re
import sys
from itertools import product

if len(sys.argv) < 3:
    sys.exit(__doc__)
ESCALA, ESPEC = sys.argv[1], sys.argv[2]
ANTERIOR = sys.argv[3] if len(sys.argv) > 3 else None
MANUAL = os.path.join(os.path.dirname(os.path.abspath(ESPEC)), "manual_operacion_escala.md")

PERFILES = list(product(["con equipo", "transaccional", "mixta"], ["única", "recompra", "continua"]))
PAT = re.compile(r"(?m)^- (.*) `\[(\d\.\d\.[DIFEO]\d+) · (\w+)((?: · riesgo)?)((?: · hábito)?)((?: · venta con equipo| · cliente recurrente| · relación continua)?)\]`$")

fallas = []
def prueba(nombre, ok, detalle=""):
    print(f"{'PASA ' if ok else 'FALLA'} {nombre}" + (f" — {detalle}" if detalle and not ok else ""))
    if not ok:
        fallas.append(nombre)

def leer(ruta):
    s = open(ruta, encoding="utf-8").read()
    matriz = s[s.index("## Área 1 — Ventas"):s.index("# Parte 4")]
    crit = []
    for t, i, tipo, rk, hb, pf in PAT.findall(matriz):
        crit.append(dict(txt=t, id=i, dim=i[:3], lv=i[4], riesgo=bool(rk), habito=bool(hb), perfil=pf.strip(" ·")))
    return s, matriz, crit

def encabezado(texto, campo):
    m = re.search(rf"(?m)^{campo}: *(\S+)", texto.split("\n---", 1)[0])
    return m.group(1) if m else None

def aplica(c, venta, rel):
    if c["perfil"] == "venta con equipo" and venta == "transaccional":
        return False
    if c["perfil"] == "cliente recurrente" and rel == "única":
        return False
    if c["perfil"] == "relación continua" and rel != "continua":
        return False
    if "vende sin vendedor" in c["txt"] and venta == "con equipo":
        return False
    return True

def nivel(crit, dim, venta, rel, estado, regla_iniciado):
    """Devuelve (nivel alcanzado desde Funcional o None, por_confirmar).

    Aplica la regla de «por confirmar» que tiene escrita la versión probada:
    desde la 6.12.0, solo cuentan los hábitos iniciados; antes, cualquier hábito.
    """
    alcanzado, por_confirmar, riesgos_previos = None, False, []
    for lv in "FEO":
        dec = [c for c in crit if c["dim"] == dim and c["lv"] == lv and not c["riesgo"] and aplica(c, venta, rel)]
        if not dec:
            if regla_iniciado:
                break
            alcanzado = lv  # antes de la 6.12.0, un nivel vacío no frenaba nada
            continue
        faltan = [c for c in dec + riesgos_previos if estado(c) != "cumplido"]
        if not faltan:
            alcanzado = lv
        elif all(c["habito"] and (estado(c) == "iniciado" or not regla_iniciado) for c in faltan):
            alcanzado, por_confirmar = lv, True
        else:
            break
        riesgos_previos += [c for c in crit if c["dim"] == dim and c["lv"] == lv and c["riesgo"] and aplica(c, venta, rel)]
    return alcanzado, por_confirmar

def puntaje(nivel_base, avance):
    """Tramo del nivel más la posición dentro del tramo: hacia abajo y sin pasar de 19 (especificación, paso 7)."""
    return {"D": 0, "I": 20, "F": 40, "E": 60}[nivel_base] + min(math.floor(Fraction(avance) * 20), 19)

s, matriz, crit = leer(ESCALA)
espec = open(ESPEC, encoding="utf-8").read()
# Los identificadores retirados se leen de la especificación («Identificadores retirados…»): una sola lista.
_linea_retirados = next((l for l in espec.split("\n") if "Identificadores retirados" in l), "")
RETIRADOS = set(re.findall(r"`(\d\.\d\.[DIFEO]\d+)`", _linea_retirados))
dims = sorted({c["dim"] for c in crit})
REGLA_INICIADO = "solo le faltan hábitos iniciados" in s
print(f"{ESCALA} {encabezado(s, 'version')}: {len(crit)} criterios, {len(dims)} dimensiones")
print(f"{ESPEC} {encabezado(espec, 'version')}, para la escala {encabezado(espec, 'escala')}")
print(f"Regla de «por confirmar» escrita en esta versión: {'solo hábitos iniciados' if REGLA_INICIADO else 'cualquier hábito que falte'}\n")

# 1 · Ningún nivel vacío
vacios = []
for venta, rel in PERFILES:
    for d in dims:
        if not [c for c in crit if c["dim"] == d and c["lv"] == "F" and not c["riesgo"] and aplica(c, venta, rel)]:
            continue  # la dimensión no aplica a ese perfil
        for lv in "FEO":
            if not [c for c in crit if c["dim"] == d and c["lv"] == lv and not c["riesgo"] and aplica(c, venta, rel)]:
                vacios.append(f"{d} {lv} ({venta}/{rel})")
prueba("1 · Ningún nivel vacío", not vacios, ", ".join(vacios))

# 2 · Nada se regala
regalos = []
for venta, rel in PERFILES:
    for d in dims:
        if not [c for c in crit if c["dim"] == d and c["lv"] == "F" and not c["riesgo"] and aplica(c, venta, rel)]:
            continue
        lv, _ = nivel(crit, d, venta, rel, lambda c: "no", REGLA_INICIADO)
        if lv:
            regalos.append(f"{d} llega a {lv} sin cumplir nada ({venta}/{rel})")
        lv, pc = nivel(crit, d, venta, rel, lambda c: "no" if c["habito"] else "cumplido", REGLA_INICIADO)
        if pc:
            regalos.append(f"{d} queda por confirmar con hábitos que no se hacen ({venta}/{rel})")
prueba("2 · Nada se regala", not regalos, "; ".join(regalos[:6]))

# 3 · Los ejemplos cuadran (los ejemplos viven en la especificación)
capa = puntaje("I", (1 + 1 + 1 + Fraction(3, 5)) / 4)          # diagnóstico: tres en Funcional y una en Inicial con 3 de 5
chequeo = puntaje("I", (1 + 1 + Fraction(1, 2) + Fraction(1, 2)) / 4)       # chequeo: dos en Funcional y dos en Inicial, a mitad de tramo
optimo_16 = [c for c in crit if c["dim"] == "1.6" and c["lv"] == "O" and not c["riesgo"] and aplica(c, "con equipo", "continua")]
dim_65 = puntaje("E", Fraction(1, len(optimo_16)))
textos = ["Saca 38.", "saca 35.", "Eficiente, 65, cumple 1 de 4 para Óptimo"]
prueba("3 · Los ejemplos cuadran",
       capa == 38 and chequeo == 35 and dim_65 == 65 and all(t in espec for t in textos),
       f"capa={capa}, chequeo={chequeo}, dimensión={dim_65}, criterios de Óptimo={len(optimo_16)}, "
       f"textos que faltan en la especificación={[t for t in textos if t not in espec]}")

# 4 · Sin identificadores a la vista (criterios, resultados, costos y mensajes de riesgo)
visibles = [l for l in matriz.split("\n") if l.startswith(("- ", "*Resultado", "*Costo", "*Descripción", "**"))]
fugas = [re.sub(r" `\[[^]]*\]`$", "", l)[:80] for l in visibles if re.search(r"\b[123]\.[1-8]\b", re.sub(r" `\[[^]]*\]`$", "", l))]
ini = s.index("## Riesgos")
riesgos = s[ini:s.index("\n## ", ini + 1)]
fugas += [l[:80] for l in riesgos.split("\n") if l.startswith("| `") and re.search(r"\b[123]\.[1-8]\b", l.split("|")[3])]
prueba("4 · Sin identificadores a la vista", not fugas, "; ".join(fugas))

# 5 · Identificadores estables
ids = [c["id"] for c in crit]
repetidos = sorted({i for i in ids if ids.count(i) > 1})
reusados = sorted(RETIRADOS & set(ids))
perdidos = []
if ANTERIOR:
    _, _, viejos = leer(ANTERIOR)
    # Un identificador retirado puede desaparecer (se retiró o cambió de dimensión); cualquier otro, no.
    perdidos = sorted({c["id"] for c in viejos} - set(ids) - RETIRADOS)
prueba("5 · Identificadores estables", not (repetidos or reusados or perdidos),
       f"repetidos={repetidos} reusados={reusados} desaparecidos={perdidos}")

print("\n6 · Casos de referencia: en espera, como la calibración (manual de operación).\n")

# 7 · Documentos alineados
vigente = encabezado(s, "version")
desalineados = []
if encabezado(espec, "escala") != vigente:
    desalineados.append(f"especificación para {encabezado(espec, 'escala')}")
if os.path.exists(MANUAL):
    man = encabezado(open(MANUAL, encoding="utf-8").read(), "escala")
    if man != vigente:
        desalineados.append(f"manual para {man}")
prueba("7 · Documentos alineados", not desalineados, f"escala {vigente}; " + ", ".join(desalineados))

print("\nRESULTADO:", "todas pasan" if not fallas else f"fallan {len(fallas)}: {fallas}")
sys.exit(1 if fallas else 0)
