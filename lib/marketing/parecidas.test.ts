/**
 * lib/marketing/parecidas.test.ts — qué publicaciones se juntan como «parecidas» (rediseño de Marketing, 2026-10-04).
 *
 * Los títulos son reales (las sugeridas del 2026-10-04). Si alguien afloja los umbrales y empiezan a juntarse
 * cosas distintas, o los aprieta y el «33 % / 67 %» se vuelve a partir, esto se pone rojo.
 */
import { describe, expect, it } from "vitest";
import { agruparParecidas, huellaDeTitulo, IGNORAR_EN_SEM, sonParecidos } from "./parecidas";

const t = (titulo: string) => ({ titulo });
const titulos = (g: Array<{ titulo: string }>) => g.map((x) => x.titulo);

describe("huellaDeTitulo", () => {
  it("se queda con las palabras con contenido, sin tildes ni números, cortadas a 4 letras", () => {
    expect(huellaDeTitulo("El 33% del tiempo de ventas se pierde en admin — y nadie lo ve")).toEqual([
      "tiem",
      "vent",
      "pier",
      "admi",
    ]);
    expect(huellaDeTitulo("Adopción de IA vs. resultados de IA")).toEqual(["adop", "resu"]);
  });

  it("en SEM ignora el canal y el público", () => {
    expect(huellaDeTitulo("Caos operativo en equipos comerciales LATAM — Google Search", IGNORAR_EN_SEM)).toEqual([
      "caos",
      "oper",
    ]);
  });
});

describe("sonParecidos", () => {
  it("dos o más palabras en común, que pesen en el corto y en el largo", () => {
    expect(sonParecidos(["pipe", "conf"], ["pipe", "conf"])).toBe(true);
    expect(sonParecidos(["tiem", "vent", "vend"], ["tiem", "vent", "pier", "admi"])).toBe(true);
  });

  it("compartir una sola palabra no alcanza", () => {
    expect(sonParecidos(["tiem", "vend", "usa"], ["tiem", "vent", "pier", "admi"])).toBe(false);
  });

  it("dos palabras sueltas en un título largo no alcanzan («contexto» y «datos»)", () => {
    const largo = huellaDeTitulo("Los sistemas de registro no son bases de datos tontas — son contexto en tiempo real");
    const corto = huellaDeTitulo("Por qué el contexto es más valioso que los datos");
    expect(sonParecidos(largo, corto)).toBe(false);
  });
});

describe("agruparParecidas", () => {
  const sugeridas = [
    t("El 33% del tiempo de ventas se pierde en admin — y nadie lo ve"),
    t("El 67% del tiempo de ventas no se vende — y tu CRM lo sabe"),
    t("La IA no arregla datos sucios — los hereda"),
    t("El 33% del tiempo de ventas se pierde en admin — y tu CRM lo sabe"),
    t("Datos aislados: el costo invisible del desorden"),
    t("El 67% del tiempo de ventas no se vende"),
    t("Datos aislados: el costo invisible que nadie calcula"),
    t("Implementar el CRM es fácil. Que lo usen es el trabajo real."),
    t("El pipeline que nadie confía"),
    t("El pipeline que nadie confía"),
  ];

  it("junta las versiones del mismo ángulo y deja sola la que no se parece a nadie", () => {
    const g = agruparParecidas(sugeridas, (x) => x.titulo).map(titulos);
    expect(g).toEqual([
      [
        "El 33% del tiempo de ventas se pierde en admin — y nadie lo ve",
        "El 33% del tiempo de ventas se pierde en admin — y tu CRM lo sabe",
        "El 67% del tiempo de ventas no se vende",
      ],
      /* Comparte solo «tiempo» y «ventas» con el primero (2 de 4): no llega al 60 % del corto y abre su grupo.
         Es el costo de no encadenar: con las 75 reales, 12 de las 15 versiones quedan juntas igual. */
      ["El 67% del tiempo de ventas no se vende — y tu CRM lo sabe"],
      ["La IA no arregla datos sucios — los hereda"],
      ["Datos aislados: el costo invisible del desorden", "Datos aislados: el costo invisible que nadie calcula"],
      ["Implementar el CRM es fácil. Que lo usen es el trabajo real."],
      ["El pipeline que nadie confía", "El pipeline que nadie confía"],
    ]);
  });

  it("no pierde ni repite elementos, y respeta el orden de entrada", () => {
    const g = agruparParecidas(sugeridas, (x) => x.titulo);
    expect(g.flat()).toHaveLength(sugeridas.length);
    expect(new Set(g.flat()).size).toBe(sugeridas.length);
    expect(g[0][0]).toBe(sugeridas[0]);
  });

  it("en SEM, el canal no junta ideas distintas", () => {
    const sem = [
      t("Caos operativo en equipos comerciales LATAM"),
      t("Búsqueda: Equipos comerciales con CRM subutilizado"),
      t("Caos operativo en equipos comerciales LATAM — Google Search"),
      t("Tiempo perdido en admin — Paid Social LinkedIn"),
      t("Tiempo perdido en admin: Google Search para directores comerciales"),
    ];
    const g = agruparParecidas(sem, (x) => x.titulo, IGNORAR_EN_SEM).map((x) => x.length);
    expect(g).toEqual([2, 1, 2]);
  });
});
