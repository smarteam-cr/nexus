/**
 * Lo que calculan las pantallas del catálogo: el salto de nivel por área, los filtros y quién sube cada dimensión.
 * También lo que llega a la preventa y a la bandeja de Feedback.
 */
import { describe, expect, it } from "vitest";
import { CATALOGO_DE_CASOS, casoPorId, type CasoDelCatalogo } from "./catalogo";
import { casoDeLaPreventa, casosParaLasAreas, catalogoParaElAgente, dimensionesEnElArea, idEnLaPreventa } from "./en-la-preventa";
import { cuerpoDeLaPropuesta, cuerpoDeLaSugerencia, propuestaIncompleta } from "./feedback";
import { casosQueSuben, criteriosPorDimension, pasaLosFiltros, saltosPorArea, SIN_FILTROS, usaLaHerramienta } from "./vista";

const caso = (id: string): CasoDelCatalogo => casoPorId(id)!;

describe("el salto de nivel de cada área", () => {
  it("va del nivel más bajo de partida al más alto de llegada, por área", () => {
    expect(saltosPorArea(caso("prospeccion-ia"))).toEqual([{ area: "1", desde: "F", hasta: "O", dimensiones: 3 }]);
    expect(saltosPorArea(caso("cobranza"))).toEqual([
      { area: "1", desde: "F", hasta: "E", dimensiones: 1 },
      { area: "3", desde: "I", hasta: "E", dimensiones: 2 },
    ]);
  });

  it("un caso complementario no tiene salto", () => {
    expect(saltosPorArea(caso("equipo-tecnico"))).toEqual([]);
  });
});

describe("los filtros", () => {
  it("sin filtros, pasan todos", () => {
    expect(CATALOGO_DE_CASOS.every((c) => pasaLosFiltros(c, SIN_FILTROS))).toBe(true);
  });

  it("el buscador mira lo que dice el cliente, sin tildes ni mayúsculas", () => {
    const r = CATALOGO_DE_CASOS.filter((c) => pasaLosFiltros(c, { ...SIN_FILTROS, texto: "CARRITOS abandonados" })).map((c) => c.id);
    expect(r).toContain("carritos-abandonados");
    expect(CATALOGO_DE_CASOS.filter((c) => pasaLosFiltros(c, { ...SIN_FILTROS, texto: "prospeccion" })).map((c) => c.id)).toContain("prospeccion-ia");
  });

  it("«Solo Smarteam» deja los que no piden una licencia de HubSpot ni de Insider", () => {
    expect(usaLaHerramienta(caso("equipo-tecnico"), "solo-smarteam")).toBe(true);
    expect(usaLaHerramienta(caso("sistematiza-ventas"), "solo-smarteam")).toBe(false);
    expect(usaLaHerramienta(caso("recompra"), "insider")).toBe(true);
  });

  it("el nivel de partida: sin sistema (D o I), o ya en Funcional o Eficiente", () => {
    expect(pasaLosFiltros(caso("sistematiza-ventas"), { ...SIN_FILTROS, nivel: "sin" })).toBe(true);
    expect(pasaLosFiltros(caso("sistematiza-ventas"), { ...SIN_FILTROS, nivel: "F" })).toBe(false);
    expect(pasaLosFiltros(caso("prospeccion-ia"), { ...SIN_FILTROS, nivel: "F" })).toBe(true);
    expect(pasaLosFiltros(caso("data-lake"), { ...SIN_FILTROS, nivel: "E" })).toBe(true);
  });
});

describe("quién sube una dimensión", () => {
  it("ordena por el nivel de partida y después por el de llegada", () => {
    const r = casosQueSuben(CATALOGO_DE_CASOS, "1.7");
    expect(r.length).toBeGreaterThan(1);
    const orden = "DIFEO";
    for (let i = 1; i < r.length; i++) {
      const a = r[i - 1].movimiento;
      const b = r[i].movimiento;
      expect(orden.indexOf(a.desde) * 10 + orden.indexOf(a.hasta)).toBeLessThanOrEqual(orden.indexOf(b.desde) * 10 + orden.indexOf(b.hasta));
    }
  });

  it("con una herramienta, solo los casos que la usan", () => {
    expect(casosQueSuben(CATALOGO_DE_CASOS, "1.7", "insider").every(({ caso: c }) => c.herramientas.includes("insider"))).toBe(true);
  });

  it("agrupa los criterios por la dimensión que mueven, de nivel más bajo a más alto", () => {
    const g = criteriosPorDimension(caso("prospeccion-ia"));
    expect(g.map((x) => x.movimiento.dimension)).toEqual(caso("prospeccion-ia").mueve.map((m) => m.dimension));
    expect(g.flatMap((x) => x.criterios).sort()).toEqual([...caso("prospeccion-ia").criterios].sort());
    for (const x of g) for (const id of x.criterios) expect(id.startsWith(`${x.movimiento.dimension}.`)).toBe(true);
  });
});

describe("en la preventa", () => {
  it("el id del catálogo va con `cat-` y vuelve al caso", () => {
    expect(idEnLaPreventa("cobranza")).toBe("cat-cobranza");
    expect(casoDeLaPreventa("cat-cobranza")?.id).toBe("cobranza");
    expect(casoDeLaPreventa("ia-123")).toBeUndefined();
    expect(casoDeLaPreventa("cat-no-existe")).toBeUndefined();
    // Cabe en el id de un caso de uso de la exploración (60 caracteres).
    for (const c of CATALOGO_DE_CASOS) expect(idEnLaPreventa(c.id).length).toBeLessThanOrEqual(60);
  });

  it("los casos de las áreas en juego, y las dimensiones del área elegida", () => {
    expect(casosParaLasAreas(["2"]).every((c) => c.areas.includes("2"))).toBe(true);
    expect(dimensionesEnElArea(caso("cobranza"), "3")).toEqual(["3.3", "3.7"]);
    expect(dimensionesEnElArea(caso("cobranza"), null)).toHaveLength(3);
  });

  it("el agente lee el catálogo sin la nota interna ni los servicios", () => {
    const texto = catalogoParaElAgente(CATALOGO_DE_CASOS);
    for (const c of CATALOGO_DE_CASOS) {
      expect(texto).toContain(`[${c.id}] ${c.titulo}`);
      if (c.aviso) expect(texto).not.toContain(c.aviso);
    }
    expect(texto).not.toContain("Implementación de CRM");
  });
});

describe("lo que llega a la bandeja de Feedback", () => {
  it("una sugerencia empieza diciendo de qué caso y de qué parte", () => {
    expect(cuerpoDeLaSugerencia({ casoId: "cobranza", titulo: "Acelera y controla tu cobranza con HubSpot" }, "Lo que obtiene", "  Falta X. ")).toBe(
      "[Catálogo de casos de uso · «Acelera y controla tu cobranza con HubSpot» (cobranza) · Lo que obtiene]\n\nFalta X.",
    );
  });

  it("un caso nuevo pide lo que consigue el cliente y arma el resto en líneas", () => {
    const vacio = { resultado: " ", frases: "", areas: [], herramientas: [], cliente: "" };
    expect(propuestaIncompleta(vacio)).toBe(true);
    const texto = cuerpoDeLaPropuesta({
      resultado: "Cobra a tiempo",
      frases: "Perseguimos a mano\n\nNo sabemos quién debe",
      areas: ["1", "3"],
      herramientas: ["hubspot"],
      cliente: "Acme",
    });
    expect(texto).toBe(
      [
        "[Catálogo de casos de uso · Un caso nuevo]",
        "",
        "Qué consigue el cliente: Cobra a tiempo",
        "Qué dice el cliente cuando lo necesita:",
        "- Perseguimos a mano",
        "- No sabemos quién debe",
        "Qué área mejora: Ventas, Servicio",
        "Con qué herramienta: HubSpot",
        "Con qué cliente salió: Acme",
      ].join("\n"),
    );
  });
});
