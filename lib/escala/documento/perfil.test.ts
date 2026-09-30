/**
 * lib/escala/documento/perfil.test.ts — el filtro de perfil hace LO MISMO que `pruebas_escala.py`.
 *
 * No alcanza con que `aplica` «se parezca»: el pedido es la misma lógica. Por eso, además de fijar
 * cada rama con casos chicos, se corre la función `aplica` DEL PROPIO ARCHIVO de Python sobre la
 * escala real y se compara, perfil por perfil, qué criterios quedan. Si el Python cambia su regla
 * en una versión nueva, este test lo dice. Sin Python en la máquina, esa parte se salta.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala, rutaDelArchivo, RUTA_DE_LAS_PRUEBAS } from "./archivos";
import { parsearEscala, todosLosCriterios } from "./parsear";
import {
  aplica,
  describirPerfil,
  dimensionAplica,
  perfilDesdeUrl,
  perfilParaUrl,
  SIN_PERFIL,
  type Perfil,
} from "./perfil";
import { PERFILES_COMPLETOS } from "./validar";
import { MARCAS_DE_PERFIL, type Criterio } from "./tipos";

const criterio = (perfil: Criterio["perfil"], texto = "Algo."): Pick<Criterio, "perfil" | "texto"> => ({ perfil, texto });
const P = (cierre: Perfil["cierre"], despues: Perfil["despues"]): Perfil => ({ cierre, despues });

describe("aplica — cada rama", () => {
  it("«venta con equipo» no cuenta en la venta transaccional", () => {
    expect(aplica(criterio("venta con equipo"), P("transaccional", "única"))).toBe(false);
    expect(aplica(criterio("venta con equipo"), P("con equipo", "única"))).toBe(true);
    expect(aplica(criterio("venta con equipo"), P("mixta", "única"))).toBe(true);
  });

  it("«cliente recurrente» no cuenta en la relación única", () => {
    expect(aplica(criterio("cliente recurrente"), P("con equipo", "única"))).toBe(false);
    expect(aplica(criterio("cliente recurrente"), P("con equipo", "recompra"))).toBe(true);
    expect(aplica(criterio("cliente recurrente"), P("con equipo", "continua"))).toBe(true);
  });

  it("«relación continua» solo cuenta en la relación continua", () => {
    expect(aplica(criterio("relación continua"), P("mixta", "única"))).toBe(false);
    expect(aplica(criterio("relación continua"), P("mixta", "recompra"))).toBe(false);
    expect(aplica(criterio("relación continua"), P("mixta", "continua"))).toBe(true);
  });

  it("«venta sin vendedor» no cuenta en la venta con equipo", () => {
    expect(aplica(criterio("venta sin vendedor"), P("con equipo", "única"))).toBe(false);
    expect(aplica(criterio("venta sin vendedor"), P("transaccional", "única"))).toBe(true);
    expect(aplica(criterio("venta sin vendedor"), P("mixta", "única"))).toBe(true);
  });

  it("desde la 7.7.0 la regla es la MARCA: el texto «vende sin vendedor» ya no decide nada", () => {
    const c = criterio(null, "Si la empresa vende sin vendedor —en tienda—, esas ventas entran solas.");
    expect(aplica(c, P("con equipo", "única"))).toBe(true);
  });

  it("«recompra» solo cuenta cuando el cliente vuelve a comprar sin contrato", () => {
    expect(aplica(criterio("recompra"), P("transaccional", "única"))).toBe(false);
    expect(aplica(criterio("recompra"), P("transaccional", "recompra"))).toBe(true);
    expect(aplica(criterio("recompra"), P("transaccional", "continua"))).toBe(false);
  });

  it("sin perfil elegido todo aplica; con una sola pregunta, filtra solo esa", () => {
    for (const marca of [...MARCAS_DE_PERFIL, null]) {
      expect(aplica(criterio(marca), SIN_PERFIL)).toBe(true);
    }
    expect(aplica(criterio("relación continua"), P(null, "recompra"))).toBe(false);
    expect(aplica(criterio("recompra"), P(null, "continua"))).toBe(false);
    expect(aplica(criterio("recompra"), P("con equipo", null))).toBe(true);
    expect(aplica(criterio("venta con equipo"), P("transaccional", null))).toBe(false);
    expect(aplica(criterio("venta sin vendedor"), P(null, "única"))).toBe(true);
    expect(aplica(criterio("cliente recurrente"), P("transaccional", null))).toBe(true);
  });
});

describe("el perfil en la URL y en palabras", () => {
  it("ida y vuelta, sin tildes en la URL", () => {
    for (const p of [...PERFILES_COMPLETOS, SIN_PERFIL, P("mixta", null), P(null, "única")]) {
      const url = perfilParaUrl(p);
      expect(JSON.stringify(url)).not.toMatch(/[áéíóú ]/);
      expect(perfilDesdeUrl(url)).toEqual(p);
    }
  });

  it("lo que no reconoce, no filtra", () => {
    expect(perfilDesdeUrl({ cierre: "cualquiera", despues: "" })).toEqual(SIN_PERFIL);
  });

  it("se describe corto", () => {
    expect(describirPerfil(P("transaccional", "recompra"))).toBe("Transaccional · Recompra");
    expect(describirPerfil(SIN_PERFIL)).toBeNull();
  });
});

// ── La comparación con el Python ─────────────────────────────────────────────

const PYTHON = ["python3", "python"].find((p) => {
  try {
    return spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
});

/** Toma `PAT`, `PERFILES`, `leer` y `aplica` del archivo de Python y los corre sobre la escala. */
const PUENTE = `
import ast, json, re, sys
from itertools import product
src = open(sys.argv[1], encoding="utf-8").read()
arbol = ast.parse(src)
ns = {"re": re, "product": product}
partes = [n for n in arbol.body if (isinstance(n, ast.FunctionDef) and n.name in ("aplica", "leer")) or (isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id in ("PAT", "PERFILES") for t in n.targets))]
exec(compile(ast.Module(body=partes, type_ignores=[]), "pruebas_escala.py", "exec"), ns)
_, _, crit = ns["leer"](sys.argv[2])
salida = {}
for venta, rel in ns["PERFILES"]:
    salida[venta + "|" + rel] = [c["id"] for c in crit if ns["aplica"](c, venta, rel)]
print(json.dumps(salida))
`;

describe.skipIf(!PYTHON)("aplica es la misma regla que pruebas_escala.py (sobre la escala real)", () => {
  const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
  const r = spawnSync(PYTHON!, ["-c", PUENTE, RUTA_DE_LAS_PRUEBAS, rutaDelArchivo("escala")], { encoding: "utf8" });
  const python = JSON.parse(r.stdout || "{}") as Record<string, string[]>;

  it("el Python corrió", () => {
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(python)).toHaveLength(PERFILES_COMPLETOS.length);
  });

  it.each(PERFILES_COMPLETOS.map((p) => [`${p.cierre} / ${p.despues}`, p] as const))(
    "%s: los mismos criterios, uno por uno",
    (_, perfil) => {
      const nuestro = todosLosCriterios(escala)
        .filter((c) => aplica(c, perfil))
        .map((c) => c.id);
      expect(nuestro).toEqual(python[`${perfil.cierre}|${perfil.despues}`]);
    },
  );

  it("una dimensión no aplica cuando se queda sin criterios de decisión en Funcional (como la prueba 1)", () => {
    for (const perfil of PERFILES_COMPLETOS) {
      const ids = new Set(python[`${perfil.cierre}|${perfil.despues}`]);
      for (const d of escala.areas.flatMap((a) => a.dimensiones)) {
        const f = d.niveles.find((n) => n.letra === "F")!;
        const esperado = f.criterios.some((c) => !c.riesgo && ids.has(c.id));
        expect(dimensionAplica(d, perfil), `${d.id} ${perfil.cierre}/${perfil.despues}`).toBe(esperado);
      }
    }
  });
});
