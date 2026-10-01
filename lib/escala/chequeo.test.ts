/**
 * lib/escala/chequeo.test.ts — el chequeo calcula lo que dice la especificación.
 *
 * Tres capas de prueba: el puntaje es el MISMO `puntaje()` de docs/escala/pruebas_escala.py (se
 * corre el Python sobre una grilla, como hace perfil.test.ts con `aplica`); el ejemplo de la
 * especificación (35) es un caso fijo; y cada regla del paso 3 al 6 tiene su caso chico. Al final,
 * el orden de dependencias se resuelve contra la escala REAL, general y por edición.
 */
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  areaParaChequeo,
  calcularChequeo,
  nivelSiguiente,
  puntajeDelTramo,
  puntajeEstimado,
  type AreaParaChequeo,
  type Estimado,
} from "./chequeo";
import { leerArchivoDeLaEscala, RUTA_DE_LAS_PRUEBAS } from "./documento/archivos";
import { aplicarEdicion } from "./documento/edicion";
import { parsearEscala } from "./documento/parsear";
import type { Letra } from "./documento/tipos";

/** Un área de juguete: 4 de base (x.1–x.4) y 4 de producción (x.5–x.8), todas aplican. */
function area(id = "1", opciones: { noAplican?: string[]; orden?: AreaParaChequeo["orden"] } = {}): AreaParaChequeo {
  const dims = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    id: `${id}.${n}`,
    nombre: `Dimensión ${id}.${n}`,
    capa: n <= 4 ? ("base" as const) : ("produccion" as const),
    aplica: !(opciones.noAplican ?? []).includes(`${id}.${n}`),
  }));
  return {
    id,
    nombre: `Área ${id}`,
    dimensiones: dims,
    orden: opciones.orden ?? {
      base: [`${id}.1`, `${id}.2`, `${id}.3`, `${id}.4`],
      produccion: [`${id}.5`, `${id}.6`, `${id}.7`, `${id}.8`],
    },
  };
}

/** `"FFII" + "EEEE"` → estimados de x.1…x.8 de un área. */
function niveles(id: string, letras: string, riesgos: string[] = []): Record<string, Estimado> {
  return Object.fromEntries(
    [...letras].map((l, i) => [`${id}.${i + 1}`, { nivel: l as Letra, riesgoALaVista: riesgos.includes(`${id}.${i + 1}`) }]),
  );
}

describe("el puntaje", () => {
  it("una dimensión va a mitad de su tramo, y Óptimo vale 100", () => {
    expect((["D", "I", "F", "E", "O"] as Letra[]).map(puntajeEstimado)).toEqual([10, 30, 50, 70, 100]);
  });

  it("el ejemplo de la especificación: dos en Funcional y dos en Inicial — la base está en Inicial y saca 35", () => {
    const r = calcularChequeo([area()], niveles("1", "FFIIFFFF"));
    expect(r.areas[0].capas.base.nivel).toBe("I");
    expect(r.areas[0].capas.base.puntaje).toBe(35);
  });

  it("nunca pasa de 19 dentro del tramo mientras no se alcance el siguiente", () => {
    expect(puntajeDelTramo("I", 7, 4)).toBe(37); // 87,5% → 17
    expect(puntajeDelTramo("I", 8, 4)).toBe(39); // 100% sin alcanzar: el tope es 19
  });

  it("el nivel siguiente: debajo de Funcional es Funcional, y Óptimo no tiene", () => {
    expect(["D", "I", "F", "E", "O"].map((l) => nivelSiguiente(l as Letra))).toEqual(["F", "F", "E", "O", null]);
  });
});

const PYTHON = ["python3", "python"].find((p) => {
  try {
    return spawnSync(p, ["--version"], { encoding: "utf8" }).status === 0;
  } catch {
    return false;
  }
});

/** Toma `puntaje` del archivo de Python y lo corre sobre una grilla de avances en mitades. */
const PUENTE = `
import ast, json, math, sys
from fractions import Fraction
src = open(sys.argv[1], encoding="utf-8").read()
arbol = ast.parse(src)
ns = {"math": math, "Fraction": Fraction}
partes = [n for n in arbol.body if isinstance(n, ast.FunctionDef) and n.name == "puntaje"]
exec(compile(ast.Module(body=partes, type_ignores=[]), "pruebas_escala.py", "exec"), ns)
salida = {}
for nivel in "DIFE":
    for n in range(1, 9):
        for mitades in range(0, 2 * n + 1):
            salida[f"{nivel}|{mitades}|{n}"] = ns["puntaje"](nivel, Fraction(mitades, 2 * n))
print(json.dumps(salida))
`;

describe.skipIf(!PYTHON)("el puntaje es el mismo que el de pruebas_escala.py", () => {
  const r = spawnSync(PYTHON!, ["-c", PUENTE, RUTA_DE_LAS_PRUEBAS], { encoding: "utf8" });
  const python = JSON.parse(r.stdout || "{}") as Record<string, number>;

  it("el Python corrió", () => {
    expect(r.status, r.stderr).toBe(0);
    expect(Object.keys(python).length).toBeGreaterThan(100);
  });

  it("en toda la grilla: cuatro tramos, de 1 a 8 dimensiones, cualquier avance en mitades", () => {
    for (const [clave, esperado] of Object.entries(python)) {
      const [nivel, mitades, n] = clave.split("|");
      expect(puntajeDelTramo(nivel as Letra, Number(mitades), Number(n)), clave).toBe(esperado);
    }
  });
});

describe("la capa y el departamento", () => {
  it("la capa está en su dimensión más débil y el departamento en su capa más baja", () => {
    const r = calcularChequeo([area()], niveles("1", "FFFIEEEE"));
    const a = r.areas[0];
    expect(a.capas.base.nivel).toBe("I");
    expect(a.capas.produccion.nivel).toBe("E");
    expect(a.nivel).toBe("I");
    // Departamento en Inicial: hacia Funcional, siete ya llegaron y una va a mitad → 15/16 → 18.
    expect(a.puntaje).toBe(38);
  });

  it("todo en Óptimo vale 100", () => {
    const r = calcularChequeo([area()], niveles("1", "OOOOOOOO"));
    expect(r.areas[0].puntaje).toBe(100);
    expect(r.areas[0].objetivo).toBeNull();
  });

  it("una dimensión con un riesgo a la vista no se estima por encima de Funcional", () => {
    const r = calcularChequeo([area()], niveles("1", "EEEEEEEE", ["1.3"]));
    const d = r.areas[0].dimensiones.find((x) => x.id === "1.3")!;
    expect(d.nivel).toBe("F");
    expect(d.topadaPorRiesgo).toBe(true);
    expect(r.areas[0].capas.base.nivel).toBe("F");
  });

  it("una dimensión que no aplica al perfil no entra en la cuenta", () => {
    const r = calcularChequeo([area("1", { noAplican: ["1.6"] })], niveles("1", "FFFFFDFF"));
    const a = r.areas[0];
    expect(a.dimensiones.find((d) => d.id === "1.6")!.nivel).toBeNull();
    expect(a.capas.produccion.nivel).toBe("F");
    expect(a.capas.produccion.cuentan).toBe(3);
    expect(a.faltan).toEqual([]);
  });

  it("si falta estimar una dimensión, no hay nivel de su capa ni del departamento: no se sabe cuál es la más débil", () => {
    const est = niveles("1", "FFFFFFFF");
    delete est["1.2"];
    const r = calcularChequeo([area()], est);
    expect(r.areas[0].faltan).toEqual(["1.2"]);
    expect(r.areas[0].capas.base.nivel).toBeNull();
    expect(r.areas[0].capas.produccion.nivel).toBe("F");
    expect(r.areas[0].nivel).toBeNull();
    expect(r.completo).toBe(false);
    expect(r.recomendacion).toBeNull();
  });
});

describe("el objetivo y la única recomendación", () => {
  it("debajo de Funcional el objetivo es Funcional; ya en Funcional, el nivel siguiente", () => {
    expect(calcularChequeo([area()], niveles("1", "IIIIIIII")).areas[0].objetivo).toBe("F");
    expect(calcularChequeo([area()], niveles("1", "FFFFFFFF")).areas[0].objetivo).toBe("E");
    expect(calcularChequeo([area()], niveles("1", "EEEEEEEE")).areas[0].objetivo).toBe("O");
  });

  it("va la capa más baja y, dentro de ella, la dimensión más baja", () => {
    const r = calcularChequeo([area()], niveles("1", "FFFFIDFF"));
    expect(r.recomendacion).toMatchObject({
      tipo: "trabajar",
      capa: "produccion",
      dimensionId: "1.6",
      objetivo: "F",
      razon: { area: "unica", capa: "unica-con-pendientes", dimension: "la-mas-baja" },
    });
  });

  it("capas parejas debajo de Funcional: va la base", () => {
    const r = calcularChequeo([area()], niveles("1", "FIFFFIFF"));
    expect(r.recomendacion).toMatchObject({ capa: "base", dimensionId: "1.2", razon: { capa: "empate-base" } });
  });

  it("capas parejas de Funcional para arriba: va la producción", () => {
    const r = calcularChequeo([area()], niveles("1", "EFEEEFEE"));
    expect(r.recomendacion).toMatchObject({ capa: "produccion", dimensionId: "1.6", objetivo: "E", razon: { capa: "empate-produccion" } });
  });

  it("la capa más baja manda aunque la otra tenga una dimensión más baja que el objetivo", () => {
    const r = calcularChequeo([area()], niveles("1", "IIIIFIFF"));
    // Base en Inicial, producción en Inicial: empate debajo de Funcional → base.
    expect(r.recomendacion).toMatchObject({ capa: "base", razon: { capa: "empate-base" } });
    const r2 = calcularChequeo([area()], niveles("1", "DIIIFIFF"));
    expect(r2.recomendacion).toMatchObject({ capa: "base", dimensionId: "1.1", razon: { capa: "la-mas-baja" } });
  });

  it("entre dimensiones del mismo nivel decide el orden de dependencias, no el identificador", () => {
    const orden = { base: ["1.2", "1.3", "1.1", "1.4"], produccion: ["1.5", "1.6", "1.7", "1.8"] };
    const r = calcularChequeo([area("1", { orden })], niveles("1", "IIIIFFFF"));
    expect(r.recomendacion).toMatchObject({ dimensionId: "1.2", razon: { dimension: "empate-por-orden" } });
  });

  it("sin orden de dependencias (falta el cierre), desempata el identificador y lo dice", () => {
    const r = calcularChequeo([area("1", { orden: { base: null, produccion: null } })], niveles("1", "IIIIFFFF"));
    expect(r.recomendacion).toMatchObject({ dimensionId: "1.1", razon: { dimension: "empate-sin-orden" } });
  });

  it("con varias áreas sale UNA sola, de la más baja; a igual nivel, de la que se eligió primero", () => {
    const est = { ...niveles("1", "FFFFFFFF"), ...niveles("3", "IFFFFFFF") };
    expect(calcularChequeo([area("1"), area("3")], est).recomendacion).toMatchObject({
      areaId: "3",
      dimensionId: "3.1",
      razon: { area: "la-mas-baja" },
    });
    const empate = { ...niveles("1", "IFFFFFFF"), ...niveles("3", "IFFFFFFF") };
    expect(calcularChequeo([area("3"), area("1")], empate).recomendacion).toMatchObject({
      areaId: "3",
      razon: { area: "empate-la-primera" },
    });
  });

  it("un área sumada y todavía sin estimar no está medida: la recomendación sale de las que sí, y lo dice", () => {
    const est = { ...niveles("1", "FIFFFFFF") }; // el área 3 está en juego, sin estimar
    const r = calcularChequeo([area("1"), area("3")], est);
    expect(r.completo).toBe(false);
    expect(r.parcial).toBe(true);
    expect(r.recomendacion).toMatchObject({ areaId: "1", dimensionId: "1.2", razon: { area: "unica" } });
  });

  it("todo en Óptimo: sostener", () => {
    expect(calcularChequeo([area()], niveles("1", "OOOOOOOO")).recomendacion).toEqual({ tipo: "sostener", areaId: "1" });
  });
});

describe("contra la escala real", () => {
  const escala = parsearEscala(leerArchivoDeLaEscala("escala"));
  const conEquipo = { cierre: "con equipo" as const, despues: "continua" as const };
  const transaccional = { cierre: "transaccional" as const, despues: "recompra" as const };

  it("Ventas con equipo: la base va Procesos → Tecnología → Datos → Equipo, y la producción en su hilo", () => {
    const a = areaParaChequeo(escala, "1", conEquipo)!;
    expect(a.orden.base).toEqual(["1.1", "1.2", "1.3", "1.4"]);
    expect(a.orden.produccion).toEqual(["1.5", "1.6", "1.7", "1.8"]);
  });

  it("Ventas transaccional: la tecnología va primero, y Priorización de Leads no aplica", () => {
    const a = areaParaChequeo(escala, "1", transaccional)!;
    expect(a.orden.base).toEqual(["1.2", "1.3", "1.1", "1.4"]);
    expect(a.dimensiones.find((d) => d.id === "1.6")!.aplica).toBe(false);
  });

  it("sin el cierre, la base de Ventas no tiene un solo orden: queda en null", () => {
    expect(areaParaChequeo(escala, "1", { cierre: null, despues: null })!.orden.base).toBeNull();
  });

  it.each(escala.ediciones.map((e) => [e.slug] as const))("con la edición %s el orden se sigue encontrando", (slug) => {
    const vista = aplicarEdicion(escala, slug);
    for (const areaId of ["1", "2", "3"]) {
      const a = areaParaChequeo(vista, areaId, conEquipo)!;
      expect(a.orden.base, `${slug} · área ${areaId}`).not.toBeNull();
      expect(a.orden.produccion, `${slug} · área ${areaId}`).not.toBeNull();
    }
  });
});
