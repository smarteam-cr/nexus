/**
 * lib/escala/documento/requeridos.test.ts — lo que un criterio requiere, en los dos sentidos.
 *
 * Un criterio dice en su etiqueta cuáles otros necesita. Acá se fija que el enlace se lea entero,
 * que se arme también al revés (quién lo necesita), que el perfil y la edición lo recorten como dice
 * la escala, y que cada regla frene lo que dice frenar.
 */
import { describe, expect, it } from "vitest";
import { leerArchivoDeLaEscala } from "./archivos";
import { aplicarEdicion } from "./edicion";
import { MINI_EDICION, MINI_ESCALA } from "./mini-escala.fixture";
import { parsearEscala, todosLosCriterios } from "./parsear";
import { enlacesQueAplican, fallasDeRequeridos, requeridosDe } from "./requeridos";
import { PERFILES_COMPLETOS } from "./validar";

/** La escala de juguete con tres enlaces: a otra dimensión, a dos criterios, y a un nivel anterior de la suya. */
const conRequeridos = (texto = MINI_ESCALA) =>
  texto
    .replace("`[1.2.F2 · evaluado · venta con equipo]`", "`[1.2.F2 · evaluado · venta con equipo · requiere 1.1.F1]`")
    .replace("`[1.2.E1 · comprobable]`", "`[1.2.E1 · comprobable · requiere 1.1.F1, 1.1.E2]`")
    .replace("`[1.1.E2 · declarado · hábito]`", "`[1.1.E2 · declarado · hábito · requiere 1.1.F1]`");

const ids = (m: Map<string, { id: string }[]>) => Object.fromEntries([...m].map(([k, v]) => [k, v.map((e) => e.id)]));

describe("lo que un criterio requiere", () => {
  const e = parsearEscala(conRequeridos());
  const criterio = (id: string) => todosLosCriterios(e).find((c) => c.id === id)!;

  it("se lee de la etiqueta, en el orden en que está escrito; sin requeridos, el campo no está", () => {
    expect(criterio("1.2.F2").requiere).toEqual(["1.1.F1"]);
    expect(criterio("1.2.E1").requiere).toEqual(["1.1.F1", "1.1.E2"]);
    expect(criterio("1.1.E2")).toMatchObject({ habito: true, perfil: null, requiere: ["1.1.F1"] });
    expect("requiere" in criterio("1.1.F1")).toBe(false);
  });

  it("no cambia nada más de la escala: los mismos criterios, con su texto y sus marcas", () => {
    const sin = parsearEscala(MINI_ESCALA);
    const sinRequeridos = todosLosCriterios(e).map((c) => {
      const copia = { ...c };
      delete copia.requiere;
      return copia;
    });
    expect(sinRequeridos).toEqual(todosLosCriterios(sin));
  });

  it("la relación se arma en los dos sentidos: lo que necesita y quiénes lo necesitan", () => {
    const r = requeridosDe(e);
    expect(ids(r.necesita)).toEqual({ "1.1.E2": ["1.1.F1"], "1.2.F2": ["1.1.F1"], "1.2.E1": ["1.1.F1", "1.1.E2"] });
    // Quiénes lo necesitan, en el orden de la matriz.
    expect(ids(r.loNecesitan)).toEqual({ "1.1.F1": ["1.1.E2", "1.2.F2", "1.2.E1"], "1.1.E2": ["1.2.E1"] });
  });

  it("cada lado del enlace dice dónde está y cómo se llama", () => {
    expect(requeridosDe(e).necesita.get("1.2.F2")).toEqual([
      {
        id: "1.1.F1",
        texto: "Hay un pipeline configurado.",
        dimension: "1.1",
        dimensionNombre: "Procesos y Rutinas",
        letra: "F",
        area: "1",
        areaNombre: "Ventas",
        areaSlug: "ventas",
        perfil: null,
      },
    ]);
  });

  it("con un perfil, solo se ven los enlaces hacia criterios que a ese perfil le aplican", () => {
    const quienes = requeridosDe(e).loNecesitan.get("1.1.F1");
    // 1.2.F2 es de venta con equipo: en la venta transaccional no está.
    expect(enlacesQueAplican(quienes, { cierre: "transaccional", despues: null }).map((x) => x.id)).toEqual(["1.1.E2", "1.2.E1"]);
    expect(enlacesQueAplican(quienes, { cierre: "con equipo", despues: null }).map((x) => x.id)).toEqual(["1.1.E2", "1.2.F2", "1.2.E1"]);
    expect(enlacesQueAplican(undefined, { cierre: null, despues: null })).toEqual([]);
  });

  it("una escala sin requeridos no tiene ninguno", () => {
    const r = requeridosDe(parsearEscala(MINI_ESCALA));
    expect(r.necesita.size + r.loNecesitan.size).toBe(0);
  });

  it("la etiqueta no admite un «requiere» mal escrito (ni un id que no es de criterio)", () => {
    for (const mala of ["requiere 1.1", "requiere 1.1.F1 y 1.1.E2", "requiere", "requiere 1.1.F1,1.1.E2"]) {
      expect(() => parsearEscala(MINI_ESCALA.replace("`[1.2.E1 · comprobable]`", `\`[1.2.E1 · comprobable · ${mala}]\``)), mala).toThrow(/la etiqueta de este criterio/);
    }
  });

  it("la explicación sale de la escala («Criterios requeridos»), si la trae", () => {
    expect(e.explicaciones.requeridos).toBeNull();
    const conSeccion = MINI_ESCALA.replace("## El perfil de negocio", "## Criterios requeridos\n\nAlgunos no se cumplen sin otro.\n\nNo cambia el cálculo.\n\n## El perfil de negocio");
    expect(parsearEscala(conSeccion).explicaciones.requeridos).toBe("Algunos no se cumplen sin otro.\n\nNo cambia el cálculo.");
  });
});

describe("las reglas de un requerido", () => {
  const fallas = (cambio: (s: string) => string) => fallasDeRequeridos(parsearEscala(cambio(MINI_ESCALA)), PERFILES_COMPLETOS);
  const poner = (etiqueta: string, requiere: string) => (s: string) => {
    expect(s).toContain(`\`[${etiqueta}]\``);
    return s.replace(`\`[${etiqueta}]\``, `\`[${etiqueta} · requiere ${requiere}]\``);
  };

  it("los tres enlaces de ejemplo pasan", () => {
    expect(fallasDeRequeridos(parsearEscala(conRequeridos()), PERFILES_COMPLETOS)).toEqual([]);
  });

  it("Deficiente e Inicial no requieren nada, ni se requieren", () => {
    expect(fallas(poner("1.1.I1 · evaluado", "1.1.F1"))).toEqual(["1.1.I1 no es de Funcional para arriba: ahí no hay criterios de logro, así que no puede requerir nada."]);
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.1.D1"))).toEqual(["1.2.F2 requiere 1.1.D1, que no es de Funcional para arriba."]);
  });

  it("lo requerido existe, no es el mismo criterio y no se repite", () => {
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.1.F9"))).toEqual(["1.2.F2 requiere 1.1.F9, que no existe."]);
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.2.F2"))).toEqual(["1.2.F2 se requiere a sí mismo."]);
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.1.F1, 1.1.F1"))).toEqual(["1.2.F2 requiere 1.1.F1 dos veces."]);
  });

  it("es de un nivel igual o anterior; y, en su misma dimensión, de uno anterior", () => {
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.1.E2"))).toEqual(["1.2.F2 requiere 1.1.E2, que es de un nivel posterior al suyo."]);
    expect(fallas(poner("1.2.F2 · evaluado · venta con equipo", "1.2.F1"))).toEqual([
      "1.2.F2 requiere 1.2.F1, que es de su misma dimensión y nivel: sobra, el nivel ya pide los dos.",
    ]);
    // Del mismo nivel pero de OTRA dimensión, sí; y de su dimensión, si es de un nivel anterior, también.
    expect(fallas(poner("1.2.E1 · comprobable", "1.1.E2"))).toEqual([]);
    expect(fallas(poner("1.2.E1 · comprobable", "1.2.F1"))).toEqual([]);
  });

  it("hay algún perfil de negocio en que los dos aplican", () => {
    // 1.1.O1 es de relación continua y 1.2.E2 de recompra: nunca aplican juntos.
    expect(fallas(poner("1.1.O1 · comprobable · relación continua", "1.2.E2"))).toEqual([
      "1.1.O1 requiere 1.2.E2, y no hay ningún perfil de negocio en que los dos apliquen.",
    ]);
  });

  it("no hay ciclos", () => {
    const ciclo = fallas((s) => poner("1.2.F2 · evaluado · venta con equipo", "1.1.F1")(poner("1.1.F1 · comprobable", "1.2.F2")(s)));
    expect(ciclo).toHaveLength(1);
    expect(ciclo[0]).toMatch(/^los requeridos forman un ciclo: 1\.1\.F1 → 1\.2\.F2 → 1\.1\.F1\.$/);
  });
});

describe("con una edición", () => {
  // La edición saca 1.2.F2 (la matriz lo deja en «Se leen igual»): pasa de una lista a la otra.
  const edicionQueSaca = MINI_EDICION.replace("*No aplican:* `1.2.I1`.", "*No aplican:* `1.2.I1`, `1.2.F2`.").replace("*Se leen igual:* `1.2.F2`, ", "*Se leen igual:* ");

  it("el enlace hacia un criterio que la edición sacó se cae; lo demás queda igual, y la general no se toca", () => {
    const general = parsearEscala(MINI_ESCALA.replace("`[1.1.E2 · declarado · hábito]`", "`[1.1.E2 · declarado · hábito · requiere 1.2.F2]`") + edicionQueSaca);
    const e = aplicarEdicion(general, "tiendas");
    const criterio = (x: typeof general, id: string) => todosLosCriterios(x).find((c) => c.id === id)!;
    expect(criterio(general, "1.1.E2").requiere).toEqual(["1.2.F2"]);
    expect("requiere" in criterio(e, "1.1.E2")).toBe(false);
    expect(requeridosDe(e).necesita.size).toBe(0);
    // Lo que no cambió es el mismo objeto de la escala general (no se copia de más).
    expect(criterio(e, "1.1.F1")).toBe(criterio(general, "1.1.F1"));
    expect(e.areas[0].dimensiones[0].niveles[2]).toBe(general.areas[0].dimensiones[0].niveles[2]);
  });

  it("si de varios requeridos la edición saca uno, quedan los otros", () => {
    const general = parsearEscala(MINI_ESCALA.replace("`[1.1.O2 · comprobable]`", "`[1.1.O2 · comprobable · requiere 1.2.F2, 1.2.E1]`") + edicionQueSaca);
    const e = aplicarEdicion(general, "tiendas");
    expect(todosLosCriterios(e).find((c) => c.id === "1.1.O2")!.requiere).toEqual(["1.2.E1"]);
  });

  it("un criterio propio también puede requerir: a uno de la matriz o a otro propio", () => {
    const general = parsearEscala(
      MINI_ESCALA + MINI_EDICION.replace("`[1.2.E101 · comprobable · recompra]`", "`[1.2.E101 · comprobable · recompra · requiere 1.2.F101, 1.1.F1]`"),
    );
    const e = aplicarEdicion(general, "tiendas");
    expect(requeridosDe(e).necesita.get("1.2.E101")?.map((x) => x.id)).toEqual(["1.2.F101", "1.1.F1"]);
    expect(requeridosDe(e).loNecesitan.get("1.2.F101")?.map((x) => x.id)).toEqual(["1.2.E101"]);
    expect(fallasDeRequeridos(e, PERFILES_COMPLETOS)).toEqual([]);
    // En la escala general ese criterio no existe: no hay enlace.
    expect(requeridosDe(general).necesita.size).toBe(0);
  });
});

describe("el archivo real (docs/escala/escala_rendimiento_smarteam.md)", () => {
  const entero = leerArchivoDeLaEscala("escala").replace(/\r\n?/g, "\n");
  const real = parsearEscala(entero);
  const general = entero.split(/^# Parte \d+ — Ediciones/m)[0];

  it("no lee de menos: tantos criterios con requeridos como etiquetas que dicen «requiere»", () => {
    const etiquetas = general.match(/ · requiere [^\]]+\]`$/gm) ?? [];
    expect(todosLosCriterios(real).filter((c) => c.requiere?.length)).toHaveLength(etiquetas.length);
  });

  it("todo lo requerido existe, y las reglas pasan en la general y en cada edición", () => {
    expect(fallasDeRequeridos(real, PERFILES_COMPLETOS)).toEqual([]);
    for (const ed of real.ediciones) expect(fallasDeRequeridos(aplicarEdicion(real, ed.slug), PERFILES_COMPLETOS), ed.nombre).toEqual([]);
  });

  it("en un área que ya dice sus requeridos, ningún criterio nombra entre paréntesis de dónde depende: lo dice el requerido", () => {
    // Un área que todavía no pasó por la revisión de sus requeridos puede conservar esos paréntesis.
    const revisadas = real.areas.filter((a) => a.dimensiones.some((d) => d.niveles.some((n) => n.criterios.some((c) => c.requiere?.length))));
    expect(revisadas.length).toBeGreaterThan(0);
    for (const a of revisadas) {
      for (const c of a.dimensiones.flatMap((d) => d.niveles.flatMap((n) => n.criterios))) {
        expect(c.texto, c.id).not.toMatch(/\((definid[oa]s? en|l[ao]s? mism[ao]s? )/i);
      }
    }
  });
});
