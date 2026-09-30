"""Pruebas de cada versión de la Escala de Rendimiento.

Las pruebas están descritas en la especificación del cálculo, en «Pruebas de cada versión».

Uso:
    python3 pruebas_escala.py escala_rendimiento_smarteam.md especificacion_calculo_escala.md [escala_anterior.md]

La escala trae la matriz y las reglas; la especificación, el cálculo y sus ejemplos. Si se pasa la
versión anterior de la escala, la prueba 5 revisa que ningún identificador haya desaparecido. Si el
manual de operación está en la misma carpeta que la especificación, la prueba 7 revisa también su
encabezado.

Desde la 8.0.0 la escala trae ediciones por industria, al final del documento. Las pruebas 1, 2, 4
y 5 corren sobre la escala general y sobre la escala vista por cada edición, y la 8 mira lo que es
propio de una edición: su clave, su perfil habitual y su bloque; que lo que nombra exista; que si
toca los criterios de una dimensión diga algo de todos, en un solo lugar; que reescribir no repita
el texto ni cambie una palabra con valor fijo; que no renombre una dimensión de base ni saque una
dimensión; y que el título de la parte y el de cada edición estén bien escritos (uno con guion en
vez de raya se leería como prosa, y la edición desaparecería sin aviso). La prueba 3 —los ejemplos
de la especificación— es solo de la escala general.

Desde la 8.3.0 un criterio puede decir en su etiqueta cuáles otros requiere («· requiere 1.5.F1»).
No cambia el cálculo: la prueba 9 revisa que esos enlaces sean coherentes.
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
PAT = re.compile(r"(?m)^- (.*) `\[(\d\.\d\.[DIFEO]\d+) · (\w+)((?: · riesgo)?)((?: · hábito)?)((?: · venta con equipo| · venta sin vendedor| · cliente recurrente| · recompra| · relación continua)?)((?: · requiere \d\.\d\.[DIFEO]\d+(?:, \d\.\d\.[DIFEO]\d+)*)?)\]`$")

fallas = []
def prueba(nombre, ok, detalle=""):
    print(f"{'PASA ' if ok else 'FALLA'} {nombre}" + (f" — {detalle}" if detalle and not ok else ""))
    if not ok:
        fallas.append(nombre)

def limpiar(texto):
    """Sin espacios al final de las líneas: un espacio suelto después de la etiqueta de un criterio no
    puede hacer que ese criterio se salte."""
    return re.sub(r"[ \t]+(?=\n|$)", "", texto)

def abrir(ruta):
    return limpiar(open(ruta, encoding="utf-8").read())

def criterios(texto):
    """Los criterios con etiqueta completa que hay en un texto (la matriz, o una edición con sus propios)."""
    return [dict(txt=t, id=i, dim=i[:3], lv=i[4], riesgo=bool(rk), habito=bool(hb), perfil=pf.strip(" ·"),
                 requiere=re.findall(r"\d\.\d\.[DIFEO]\d+", rq))
            for t, i, tipo, rk, hb, pf, rq in PAT.findall(texto)]

def leer_texto(s):
    matriz = s[s.index("## Área 1 — Ventas"):s.index("# Parte 4")]
    return s, matriz, criterios(matriz)

def leer(ruta):
    return leer_texto(abrir(ruta))

REESCRITO = re.compile(r"(?m)^- (.*) `\[(\d\.\d\.[DIFEO]\d+)\]`$")
ID = re.compile(r"`(\d\.\d\.[DIFEO]\d+)`")
PARTE_DE_EDICIONES = re.compile(r"(?m)^# Parte \d+ — Ediciones")
LETRA = r"[^\W\d_]"  # una letra, con o sin tilde

def ids_de(marca, texto):
    """Los identificadores que nombran las líneas «*No aplican:*» o «*Se leen igual:*» de un texto."""
    return [i for linea in re.findall(rf"(?m)^\*{marca}:\* (.+)$", texto) for i in ID.findall(linea)]

def titulos_mal_escritos(s):
    """Un título que habla de ediciones y no tiene la forma exacta se leería como prosa: la edición
    entera —sus criterios propios, sus reescritos— desaparecería sin que nada más lo notara."""
    mal = []
    parte = PARTE_DE_EDICIONES.search(s)
    desde = s.count("\n", 0, parte.start()) + 1 if parte else None
    for n, l in enumerate(s.split("\n"), 1):
        if re.match(r"# .*Edici", l, re.I) and not re.match(r"# Parte \d+ — Ediciones", l):
            mal.append(f"línea {n}: el título de la parte de las ediciones va con raya («# Parte 5 — Ediciones por industria»)")
        elif re.match(rf"#{{1,6}} *Edici[oó]n(?!{LETRA})", l, re.I):
            if not re.match(r"## Edición — \S", l):
                mal.append(f"línea {n}: el título de una edición va como «## Edición — Nombre», con raya")
            elif desde is None or n < desde:
                mal.append(f"línea {n}: una edición fuera de la parte de las ediciones")
    return mal

def leer_ediciones(s):
    """Las ediciones por industria (desde la 8.0.0): la misma escala dicha para una industria.

    De cada una: sus criterios propios (etiqueta completa), los de la matriz que reescribe (etiqueta
    con solo el identificador) y los que dice que no aplican.
    """
    m = PARTE_DE_EDICIONES.search(s)
    if not m:
        return []
    resto = s[m.start():]
    fin = re.search(r"(?m)^# Parte ", resto[1:])
    parte = resto[:fin.start() + 1] if fin else resto
    ediciones = []
    for bloque in re.split(r"(?m)^## Edición — ", parte)[1:]:
        nombre = bloque.split("\n", 1)[0].strip()
        # Lo que va antes de su primera sección: para quién es, su clave, su perfil habitual y su bloque.
        cabecera = re.split(r"(?m)^### ", bloque)[0]
        clave = re.search(r"(?m)^\*Clave:\* *(.+?)\.?$", cabecera)
        perfil = re.search(r"(?m)^\*Perfil habitual:\* *(.+)$", cabecera)
        desde = re.search(r"(?m)^\*Criterios propios:\* \D*(\d+)", cabecera)
        # Cada dimensión que la edición nombra, con lo que dice de sus criterios.
        dimensiones = []
        for trozo in re.split(r"(?m)^#### ", bloque)[1:]:
            titulo, _, cuerpo = trozo.partition("\n")
            cuerpo = re.split(r"(?m)^### ", cuerpo)[0]  # hasta donde empieza otra área
            t = re.match(r"(\d\.\d) (.+)$", titulo.strip())
            if t:
                dimensiones.append(dict(id=t.group(1), nombre=t.group(2).strip(),
                                        reescritos={i: txt.strip() for txt, i in REESCRITO.findall(cuerpo)},
                                        propios=[c["id"] for c in criterios(cuerpo)],
                                        no_aplican=ids_de("No aplican", cuerpo), se_leen_igual=ids_de("Se leen igual", cuerpo)))
        ediciones.append(dict(nombre=nombre, clave=clave.group(1).strip() if clave else None,
                              perfil=perfil.group(1).strip() if perfil else None, desde=int(desde.group(1)) if desde else None,
                              dimensiones=dimensiones, propios=criterios(bloque),
                              reescritos=[i for _, i in REESCRITO.findall(bloque)], no_aplican=ids_de("No aplican", bloque), texto=bloque))
    return ediciones

def dimensiones_de_base(matriz):
    """Las dimensiones que la matriz pone bajo «### Base operativa» (en la escala, x.1 a x.4 de cada área)."""
    capa, de_base = None, set()
    for l in matriz.split("\n"):
        if l.startswith("### "):
            capa = l[4:].strip()
        m = re.match(r"#### (\d\.\d) ", l)
        if m and capa == "Base operativa":
            de_base.add(m.group(1))
    return de_base

def palabras_con_valor_fijo(s):
    """«Cómo se leen los criterios»: las palabras entre «» de la oración que les da su valor.

    Devuelve (las que tienen valor, las que están entre comillas y no lo dicen de una forma que se entienda)."""
    m = re.search(r"(?ms)^## Cómo se leen los criterios[ \t]*\n(.*?)(?=^#{1,2} |\Z)", s)
    parrafo = next((p for p in re.split(r"\n\s*\n", m.group(1)) if "«" in p), None) if m else None
    con_valor, sin_valor = [], []
    for oracion in re.split(r"(?<=\.)\s+", " ".join(parrafo.split()) if parrafo else ""):
        terminos = [t.strip() for t in re.findall(r"«([^»]+)»", oracion)]
        if terminos:
            (con_valor if re.search(r"\bquieren? decir .+", oracion) or "», " in oracion else sin_valor).extend(terminos)
    return con_valor, sin_valor

def forma_de_la_palabra(termino):
    """Cómo se reconoce en un texto una palabra con valor fijo: igual, o con el verbo en plural («no se deja
    envejecer» también es «no se dejan envejecer»). Es de forma: a cada palabra que termina en vocal se le admite una «n»."""
    partes = [re.escape(p) + ("n?" if re.search(r"[aeiouáéíóú]$", p) else "") for p in termino.strip().lower().split()]
    return re.compile(rf"(?<!{LETRA})" + r"\s+".join(partes) + rf"(?!{LETRA})", re.I)

def criterios_de(crit, edicion):
    """Los criterios que valen en una edición: los de la matriz que no sacó, más los propios."""
    if edicion is None:
        return crit
    fuera = set(edicion["no_aplican"])
    return [c for c in crit if c["id"] not in fuera] + edicion["propios"]

def encabezado(texto, campo):
    m = re.search(rf"(?m)^{campo}: *(\S+)", texto.split("\n---", 1)[0])
    return m.group(1) if m else None

def aplica(c, venta, rel):
    if c["perfil"] == "venta con equipo" and venta == "transaccional":
        return False
    if c["perfil"] == "venta sin vendedor" and venta == "con equipo":
        return False
    if c["perfil"] == "cliente recurrente" and rel == "única":
        return False
    if c["perfil"] == "recompra" and rel != "recompra":
        return False
    if c["perfil"] == "relación continua" and rel != "continua":
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

def incoherencias_de_ediciones(s, matriz, crit, ediciones):
    """La prueba 8: lo que es propio de una edición. Devuelve la lista de lo que no cuadra (vacía si todo está bien).

    Un título de la parte o de una edición mal escrito se dice aunque no se haya leído ninguna edición:
    es justo el caso en que la edición desapareció."""
    incoherencias = titulos_mal_escritos(s)
    if not ediciones:
        return incoherencias
    dims = sorted({c["dim"] for c in crit})
    de_la_matriz = {c["id"]: c["txt"] for c in crit}
    nombres = dict(re.findall(r"(?m)^#### (\d\.\d) (.+)$", matriz))
    de_base = dimensiones_de_base(matriz)
    numero = lambda i: int(i[5:])
    incoherencias += [f"{i} está en la matriz con un número de edición" for i in sorted(de_la_matriz) if numero(i) >= 100]
    # Reescribir es decir lo mismo: las palabras con valor fijo del texto de la matriz son las del reescrito.
    fijas, sin_valor = palabras_con_valor_fijo(s)
    incoherencias += [f"«{t}» está entre comillas en «Cómo se leen los criterios» y no dice su valor («quiere decir …»)" for t in sin_valor]
    formas = [(t.lower(), forma_de_la_palabra(t)) for t in fijas]
    con_valor_fijo = lambda texto: sorted(t for t, forma in formas if forma.search(texto))
    aplica_en = lambda cs, d, venta, rel: any(c["dim"] == d and c["lv"] == "F" and not c["riesgo"] and aplica(c, venta, rel) for c in cs)
    bloques, propios_vistos = {}, {}
    for e in ediciones:
        n = e["nombre"]
        if not e["clave"] or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", e["clave"]):
            incoherencias.append(f"[{n}] no tiene una «Clave» válida (minúsculas, números y guiones)")
        if not e["perfil"]:
            incoherencias.append(f"[{n}] no dice su «Perfil habitual»")
        if e["desde"] is None:
            if e["propios"]:
                incoherencias.append(f"[{n}] trae criterios propios sin decir desde qué número van («Criterios propios»)")
        elif e["desde"] in bloques:
            incoherencias.append(f"[{n}] numera sus criterios propios desde el {e['desde']}, igual que «{bloques[e['desde']]}»")
        else:
            bloques[e["desde"]] = n
        incoherencias += [f"[{n}] {i} no está en la matriz" for i in e["reescritos"] + e["no_aplican"] if i not in de_la_matriz]
        for c in e["propios"]:
            i = c["id"]
            if i in de_la_matriz:
                incoherencias.append(f"[{n}] {i} ya está en la matriz")
            elif numero(i) <= 100:
                incoherencias.append(f"[{n}] {i} no está en el bloque de una edición (desde el 101)")
            elif e["desde"] is not None and not e["desde"] <= numero(i) <= e["desde"] + 98:
                incoherencias.append(f"[{n}] {i} no está en el bloque de su edición (del {e['desde']} al {e['desde'] + 98})")
            if i in propios_vistos:
                incoherencias.append(f"[{n}] {i} ya es un criterio propio de «{propios_vistos[i]}»")
            propios_vistos[i] = n
        for d in e["dimensiones"]:
            if d["id"] not in nombres:
                incoherencias.append(f"[{n}] la escala no tiene una dimensión {d['id']}")
                continue
            # Las dimensiones de base operativa se llaman igual en toda la escala.
            if d["id"] in de_base and d["nombre"] != nombres[d["id"]]:
                incoherencias.append(f"[{n}] {d['id']} es de base operativa y se llama «{nombres[d['id']]}»; la edición la llama «{d['nombre']}»")
            for i, texto in d["reescritos"].items():
                if i not in de_la_matriz:
                    continue
                if texto == de_la_matriz[i].strip():
                    incoherencias.append(f"[{n}] {i} está reescrito con el mismo texto de la matriz: sobra")
                if con_valor_fijo(texto) != con_valor_fijo(de_la_matriz[i]):
                    incoherencias.append(f"[{n}] {i} cambia las palabras con valor fijo al reescribirlo")
            # Cobertura: si la edición toca los criterios de una dimensión, dice algo de TODOS, en un solo lugar.
            if d["reescritos"] or d["propios"] or d["no_aplican"] or d["se_leen_igual"]:
                for i in (c["id"] for c in crit if c["dim"] == d["id"]):
                    donde = [x for x, esta in (("reescrito", i in d["reescritos"]), ("en «No aplican»", i in d["no_aplican"]),
                                               ("en «Se leen igual»", i in d["se_leen_igual"])) if esta]
                    if not donde:
                        incoherencias.append(f"[{n}] {i} es de la matriz y la edición no dice nada de él")
                    elif len(donde) > 1:
                        incoherencias.append(f"[{n}] {i} está {' y '.join(donde)}: va en un solo lugar")
        # Una edición puede hacer que una dimensión aplique donde en la general no aplica; al revés, no.
        vista = criterios_de(crit, e)
        for venta, rel in PERFILES:
            incoherencias += [f"[{n}] {d} deja de aplicar a {venta}/{rel}: una edición no saca una dimensión"
                              for d in dims if aplica_en(crit, d, venta, rel) and not aplica_en(vista, d, venta, rel)]
    return incoherencias

s, matriz, crit = leer(ESCALA)
espec = abrir(ESPEC)
# Los identificadores retirados se leen de la especificación («Identificadores retirados…»): una sola lista.
_linea_retirados = next((l for l in espec.split("\n") if "Identificadores retirados" in l), "")
RETIRADOS = set(re.findall(r"`(\d\.\d\.[DIFEO]\d+)`", _linea_retirados))
dims = sorted({c["dim"] for c in crit})
ediciones = leer_ediciones(s)
# La escala general y, después, la escala vista por cada edición: las pruebas 1 y 2 corren sobre todas.
VISTAS = [("", crit)] + [(f"[{e['nombre']}] ", criterios_de(crit, e)) for e in ediciones]
REGLA_INICIADO = "solo le faltan hábitos iniciados" in s
print(f"{ESCALA} {encabezado(s, 'version')}: {len(crit)} criterios, {len(dims)} dimensiones")
CON_REQUERIDOS = [c for c in crit + [p for e in ediciones for p in e["propios"]] if c["requiere"]]
if CON_REQUERIDOS:
    print(f"  Requeridos: {len(CON_REQUERIDOS)} criterios requieren otro")
for e in ediciones:
    print(f"  Edición «{e['nombre']}»: {len(e['propios'])} criterios propios, {len(e['reescritos'])} reescritos, {len(e['no_aplican'])} que no aplican")
print(f"{ESPEC} {encabezado(espec, 'version')}, para la escala {encabezado(espec, 'escala')}")
print(f"Regla de «por confirmar» escrita en esta versión: {'solo hábitos iniciados' if REGLA_INICIADO else 'cualquier hábito que falte'}\n")

# 1 · Ningún nivel vacío
vacios = []
for donde, cs in VISTAS:
    for venta, rel in PERFILES:
        for d in dims:
            if not [c for c in cs if c["dim"] == d and c["lv"] == "F" and not c["riesgo"] and aplica(c, venta, rel)]:
                continue  # la dimensión no aplica a ese perfil
            for lv in "FEO":
                if not [c for c in cs if c["dim"] == d and c["lv"] == lv and not c["riesgo"] and aplica(c, venta, rel)]:
                    vacios.append(f"{donde}{d} {lv} ({venta}/{rel})")
prueba("1 · Ningún nivel vacío", not vacios, ", ".join(vacios))

# 2 · Nada se regala
regalos = []
for donde, cs in VISTAS:
    for venta, rel in PERFILES:
        for d in dims:
            if not [c for c in cs if c["dim"] == d and c["lv"] == "F" and not c["riesgo"] and aplica(c, venta, rel)]:
                continue
            lv, _ = nivel(cs, d, venta, rel, lambda c: "no", REGLA_INICIADO)
            if lv:
                regalos.append(f"{donde}{d} llega a {lv} sin cumplir nada ({venta}/{rel})")
            lv, pc = nivel(cs, d, venta, rel, lambda c: "no" if c["habito"] else "cumplido", REGLA_INICIADO)
            if pc:
                regalos.append(f"{donde}{d} queda por confirmar con hábitos que no se hacen ({venta}/{rel})")
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

# 4 · Sin identificadores a la vista (criterios, resultados, costos y mensajes de riesgo; también en las ediciones)
VISIBLE = ("- ", "*Resultado", "*Costo", "*Descripción", "**")
TITULO = re.compile(r"(?:#### \d\.\d |#{2,3} Área \d+ — |## Edición — )(.+)$")
def nombres_de(texto):
    """De los títulos de un texto, lo que lee el cliente: el nombre del área, de la dimensión o de la edición, sin su número."""
    return [m.group(1) for m in map(TITULO.match, texto.split("\n")) if m]
visibles = [l for l in matriz.split("\n") if l.startswith(VISIBLE)] + nombres_de(matriz)
# «Los cinco niveles de un vistazo»: cómo se ve cada área entera en cada nivel.
_vistazo = re.search(r"(?ms)^## Los cinco niveles de un vistazo[ \t]*\n(.*?)(?=^#{1,2} |\Z)", s)
visibles += [l for l in (_vistazo.group(1).split("\n") if _vistazo else []) if l.startswith("**")]
for e in ediciones:
    # En una edición también se ven las preguntas y las descripciones, que son texto corrido. Las líneas
    # «No aplican» y «Se leen igual» nombran identificadores a propósito, y no las ve el cliente.
    visibles += [l for l in e["texto"].split("\n") if l.startswith(VISIBLE) or (l.strip() and not l.startswith(("#", "*", "|", "-")))]
    # Y sus nombres, y su tabla de palabras (se ve al pasar el cursor por cada palabra).
    visibles += [e["nombre"]] + nombres_de(e["texto"])
    visibles += [celda for l in e["texto"].split("\n") if l.startswith("|") and not re.fullmatch(r"[|:\- ]+", l) for celda in l.strip("|").split("|")]
fugas = [re.sub(r" `\[[^]]*\]`$", "", l)[:80] for l in visibles if re.search(r"\b[123]\.[1-8]\b", re.sub(r" `\[[^]]*\]`$", "", l))]
ini = s.index("## Riesgos")
riesgos = s[ini:s.index("\n## ", ini + 1)]
fugas += [l[:80] for l in riesgos.split("\n") if l.startswith("| `") and re.search(r"\b[123]\.[1-8]\b", l.split("|")[3])]
prueba("4 · Sin identificadores a la vista", not fugas, "; ".join(fugas))

# 5 · Identificadores estables (los de la matriz y los propios de cada edición son una sola lista)
propios = [c for e in ediciones for c in e["propios"]]
ids = [c["id"] for c in crit + propios]
repetidos = sorted({i for i in ids if ids.count(i) > 1})
reusados = sorted(RETIRADOS & set(ids))
perdidos = []
if ANTERIOR:
    s_anterior, _, viejos = leer(ANTERIOR)
    viejos = viejos + [c for e in leer_ediciones(s_anterior) for c in e["propios"]]
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
    man = encabezado(abrir(MANUAL), "escala")
    if man != vigente:
        desalineados.append(f"manual para {man}")
prueba("7 · Documentos alineados", not desalineados, f"escala {vigente}; " + ", ".join(desalineados))

# 8 · Ediciones coherentes (solo si la versión trae ediciones, o algo que parece una y no se lee)
incoherencias = incoherencias_de_ediciones(s, matriz, crit, ediciones)
if ediciones or incoherencias:
    prueba("8 · Ediciones coherentes", not incoherencias, "; ".join(incoherencias[:8]))

# 9 · Requeridos coherentes (solo si la versión trae criterios que requieren otro)
def fallas_de_requeridos(cs):
    """Las reglas de un enlace: solo de Funcional para arriba, a un criterio que existe, de un nivel igual o
    anterior (anterior, si es de su misma dimensión), que aplique en algún perfil junto con él, y sin ciclos."""
    por_id = {c["id"]: c for c in cs}
    out = []
    for c in cs:
        if not c["requiere"]:
            continue
        if c["lv"] not in "FEO":
            out.append(f"{c['id']} no es de Funcional para arriba y requiere algo")
            continue
        vistos = set()
        for r in c["requiere"]:
            if r in vistos:
                out.append(f"{c['id']} requiere {r} dos veces")
                continue
            vistos.add(r)
            if r == c["id"]:
                out.append(f"{c['id']} se requiere a sí mismo")
                continue
            o = por_id.get(r)
            if o is None:
                out.append(f"{c['id']} requiere {r}, que no existe")
                continue
            if o["lv"] not in "FEO":
                out.append(f"{c['id']} requiere {r}, que no es de Funcional para arriba")
                continue
            if "DIFEO".index(o["lv"]) > "DIFEO".index(c["lv"]):
                out.append(f"{c['id']} requiere {r}, que es de un nivel posterior")
            elif o["dim"] == c["dim"] and o["lv"] == c["lv"]:
                out.append(f"{c['id']} requiere {r}, que es de su misma dimensión y nivel")
            if not any(aplica(c, venta, rel) and aplica(o, venta, rel) for venta, rel in PERFILES):
                out.append(f"{c['id']} requiere {r}, y no hay perfil en que los dos apliquen")
    estado = {}
    def visitar(i, camino):
        if estado.get(i) == "listo":
            return
        if estado.get(i) == "en curso":
            out.append("ciclo: " + " → ".join(camino[camino.index(i):] + [i]))
            return
        estado[i] = "en curso"
        for sig in por_id[i]["requiere"]:
            if sig in por_id and sig != i:
                visitar(sig, camino + [i])
        estado[i] = "listo"
    for i in por_id:
        visitar(i, [])
    return out

if CON_REQUERIDOS:
    generales = fallas_de_requeridos(crit)
    incoherentes = list(generales)
    for e in ediciones:
        cs = criterios_de(crit, e)
        estan = {c["id"] for c in cs}
        # Un criterio PROPIO que requiere algo que la edición no tiene es una falla; el enlace de uno de la
        # matriz hacia un criterio que la edición sacó, no: se cae solo.
        incoherentes += [f"[{e['nombre']}] {c['id']} requiere {r}, que en esta edición no existe"
                         for c in e["propios"] for r in c["requiere"] if r not in estan]
        vista = [dict(c, requiere=[r for r in c["requiere"] if r in estan]) for c in cs]
        incoherentes += [f"[{e['nombre']}] {f}" for f in fallas_de_requeridos(vista) if f not in generales]
    prueba("9 · Requeridos coherentes", not incoherentes, "; ".join(incoherentes[:8]))

print("\nRESULTADO:", "todas pasan" if not fallas else f"fallan {len(fallas)}: {fallas}")
sys.exit(1 if fallas else 0)
