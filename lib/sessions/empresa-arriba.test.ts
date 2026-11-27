/**
 * lib/sessions/empresa-arriba.test.ts — LA EMPRESA ARRIBA DE SUS UNIDADES NUNCA ES DUEÑA, Y NADA CAMBIA PARA LAS REUNIONES.
 *
 * Correr: `npx vitest run lib/sessions/empresa-arriba.test.ts --project unit`.
 *
 * Elías, 26 nov (DECISIONS «La empresa arriba de sus unidades»): la empresa es una ficha de tipo EMPRESA, dueña del dominio
 * y de la empresa de HubSpot que comparten sus unidades; las unidades son todas iguales. La prueba central compara, reunión
 * por reunión, el dueño con la estructura de antes (TAE principal, con los dominios) y con la de ahora (la ficha «TEC»
 * arriba): tiene que ser el mismo. Y lo de HubSpot se reparte con la misma regla.
 */
import { describe, expect, it } from "vitest";
import {
  categorizeSession,
  computeAmbiguousNameTokens,
  unidadDeLoDeHubspot,
  unidadPorLasSiglas,
  type CategorizableSession,
  type CategorizeContext,
} from "./categorize";
import type { HubspotCompanyLite } from "@/lib/hubspot/companies";

const INTERNA = { id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null };
const OTRO = { id: "otro", name: "Wherex", company: null, emailDomains: ["wherex.com"] };
const CREDIX = { id: "credix", name: "Credix", company: null, emailDomains: ["credix.com"] };

// ── Antes: TAE es la principal ────────────────────────────────────────────────────────────────────────────────────────
const TAE_ANTES = { id: "tae", name: "TEC · TAE", company: "tec.ac.cr", emailDomains: ["itcr.ac.cr", "tec.ac.cr"], siglas: ["TAE"] };
const AE_ANTES = { id: "ae", name: "TEC · AE", company: "TEC- AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: "tae" };

// ── Ahora: la ficha «TEC» arriba, TAE y AE iguales ───────────────────────────────────────────────────────────────────
const TEC = { id: "tec", name: "TEC", company: "tec.ac.cr", emailDomains: ["itcr.ac.cr", "tec.ac.cr"], kind: "EMPRESA" };
const TAE = { id: "tae", name: "TEC · TAE", company: null, emailDomains: [], siglas: ["TAE"], comparteDominioConId: "tec", kind: "CLIENTE" };
const AE = { id: "ae", name: "TEC · AE", company: "TEC- AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: "tec", kind: "CLIENTE" };

const ITCR: HubspotCompanyLite = { id: "59180429929", name: "INSTITUTO TECNOLOGICO DE COSTA RICA", domain: "itcr.ac.cr" } as HubspotCompanyLite;

function ctxDe(clients: CategorizeContext["clients"], over: Partial<CategorizeContext> = {}): CategorizeContext {
  return {
    clients,
    categories: [INTERNA],
    hubspotCompaniesByDomain: new Map(),
    internalDomains: new Set(["smarteamcr.com"]),
    ambiguousNameTokens: computeAmbiguousNameTokens(clients.map((c) => ({ ...c, comparteDominioConId: c.comparteDominioConId ?? null }))),
    ...over,
  };
}

const reunion = (title: string, participants: string[], manualClientId: string | null = null): CategorizableSession => ({
  title,
  participants: ["hgomez@smarteamcr.com", ...participants],
  manualClientId,
});

const duenoDe = (s: CategorizableSession, c: CategorizeContext) => {
  const g = categorizeSession(s, c);
  return g.kind === "client" ? g.id : g.kind === "orphan" && g.label.startsWith("Por decidir") ? "(por decidir)" : `(${g.kind})`;
};

const gente = new Map([
  ["ibrenes@itcr.ac.cr", "ae"],
  ["mmartinez@itcr.ac.cr", "tae"],
]);

/* Las reuniones de siempre del TEC, con cada camino de la cascada: título, gente aprendida, gente confirmada, las dos,
   interna con siglas, por HubSpot, a mano, otra empresa. */
const CASOS: CategorizableSession[] = [
  reunion("AE | Reportes de Ventas", ["ibrenes@itcr.ac.cr"]),
  reunion("TEC TAE | RE-IMPLEMENTACIÓN CRM", ["mmartinez@itcr.ac.cr"]),
  reunion("Alineación TEC-TAE & Smarteam", ["gcerdas@itcr.ac.cr"]),
  reunion("Kick Off | TEC & Smarteam", ["ibrenes@itcr.ac.cr", "nuevo@itcr.ac.cr"]),
  reunion("Cena | Marco Martinez + Smarteam", ["mmartinez@itcr.ac.cr"]),
  reunion("Visita FUNDATEC", ["ibrenes@itcr.ac.cr", "mmartinez@itcr.ac.cr"]),
  reunion("Revisión semanal", ["nadie@itcr.ac.cr"]),
  reunion("Hand Off | AE", []),
  reunion("TAE - interno", []),
  reunion("Dominio HubSpot / AE & TAE", ["x@itcr.ac.cr"]),
  reunion("Llamada", ["confirmada@itcr.ac.cr"]),
  reunion("Revisión semanal", ["delgrupo@itcr.ac.cr", "alguien@credix.com"]),
  reunion("Soporte", ["alguien@tec.ac.cr"], "tae"),
  reunion("Wherex | Sprint", ["a@wherex.com"]),
  reunion("Reunión", ["sin-registrar@estudiantes.tec.ac.cr"]),
  reunion("Conversemos", ["x@itcr-hubspot.cr"]),
];

const confirmadas = new Map<string, string[]>([
  ["confirmada@itcr.ac.cr", ["ae"]],
  ["delgrupo@itcr.ac.cr", ["ae", "tae"]],
]);

describe("la empresa arriba: las reuniones no cambian de dueño", () => {
  const hubspot = new Map([["itcr-hubspot.cr", ITCR]]);
  const antes = ctxDe([TAE_ANTES, OTRO, CREDIX, AE_ANTES], {
    personasDeEntidades: gente,
    interlocutoresConfirmados: confirmadas,
    hubspotCompaniesByDomain: hubspot,
    clientsByHubspotCompanyId: new Map([[ITCR.id, TAE_ANTES]]),
  });
  const ahora = ctxDe([TAE, OTRO, CREDIX, AE, TEC], {
    personasDeEntidades: gente,
    interlocutoresConfirmados: confirmadas,
    hubspotCompaniesByDomain: hubspot,
    clientsByHubspotCompanyId: new Map([[ITCR.id, TEC]]),
  });

  it.each(CASOS.map((s) => [s.title, s] as const))("«%s»: el mismo dueño antes y ahora", (_t, s) => {
    expect(duenoDe(s, ahora)).toBe(duenoDe(s, antes));
  });

  it("la empresa nunca es dueña, por ningún camino", () => {
    for (const s of CASOS) expect(duenoDe(s, ahora)).not.toBe("tec");
    expect(duenoDe(reunion("TEC | Revisión", ["nadie@itcr.ac.cr"]), ahora)).not.toBe("tec");
    expect(duenoDe(reunion("Reunión", ["x@tec.ac.cr"], "tec"), ahora)).toBe("(por decidir)");
  });

  it("una empresa sin unidades no se queda con nada", () => {
    const sola = ctxDe([TEC, OTRO]);
    expect(duenoDe(reunion("Reunión", ["x@tec.ac.cr"]), sola)).toBe("(por decidir)");
  });

  it("el nombre de la empresa no vuelve ambigua ninguna palabra", () => {
    const conGrupo = ctxDe([
      { id: "g", name: "Grupo Teamnet", company: null, emailDomains: [], kind: "EMPRESA" },
      { id: "t", name: "Teamnet", company: null, emailDomains: ["teamnet.com.mx"], comparteDominioConId: "g", kind: "CLIENTE" },
      { id: "s", name: "Stratosphere", company: null, emailDomains: ["stratospherecorp.com"], comparteDominioConId: "g", kind: "CLIENTE" },
    ]);
    expect(conGrupo.ambiguousNameTokens?.has("teamnet")).toBe(false);
    expect(duenoDe(reunion("Sprint semanal | Teamnet", []), conGrupo)).toBe("t");
  });
});

describe("Cemaco: la empresa arriba solo con la empresa de HubSpot", () => {
  const CEMACO = { id: "cemaco", name: "Cemaco", company: null, emailDomains: [], kind: "EMPRESA" };
  const CR = { id: "cr", name: "Cemaco · Costa Rica", company: "Cemaco Internacional", emailDomains: ["cemaco.co.cr"], siglas: ["CR"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const c = ctxDe([CR, CEMACO, EC]);

  it("las pistas de título de las unidades salen con su grupo aunque la empresa no esté en la lista: «cr» y «ec» no van solas", async () => {
    const { pistasDeTitulo } = await import("./categorize");
    const conLaEmpresa = pistasDeTitulo([CR, EC], undefined, [CR, CEMACO, EC]);
    expect(conLaEmpresa).toContain("cemaco");
    expect(conLaEmpresa).not.toContain("cr");
    expect(conLaEmpresa).not.toContain("ec");
    expect(pistasDeTitulo([CR, CEMACO, EC]).sort()).toEqual(conLaEmpresa.sort());
  });

  it("cada dominio sigue siendo de su unidad, y la marca sola queda por decidir", () => {
    expect(duenoDe(reunion("Sales Hub", ["a@cemaco.co.cr"]), c)).toBe("cr");
    expect(duenoDe(reunion("Marketing", ["a@sukasa.com"]), c)).toBe("ec");
    expect(duenoDe(reunion("Alineación CEMACO", ["a@cemaco.co.cr", "b@sukasa.com"]), c)).toBe("(por decidir)");
    expect(duenoDe(reunion("Cemaco EC | Kickoff", ["a@cemaco.co.cr"]), c)).toBe("ec");
  });
});

describe("lo de HubSpot de la empresa, a su unidad", () => {
  const c = ctxDe([TAE, OTRO, AE, TEC], { personasDeEntidades: gente, interlocutoresConfirmados: confirmadas });

  it("un contacto confirmado o aprendido va a su unidad; uno sin pista se queda en la empresa", () => {
    expect(unidadDeLoDeHubspot("tec", { titulo: null, correos: ["confirmada@itcr.ac.cr"] }, c)).toBe("ae");
    expect(unidadDeLoDeHubspot("tec", { titulo: null, correos: ["MMartinez@itcr.ac.cr"] }, c)).toBe("tae");
    expect(unidadDeLoDeHubspot("tec", { titulo: null, correos: ["nadie@itcr.ac.cr"] }, c)).toBeNull();
    expect(unidadDeLoDeHubspot("tec", { titulo: null, correos: ["delgrupo@itcr.ac.cr"] }, c)).toBeNull();
  });

  it("un negocio o un correo por su asunto: «IA AGENT | WA - TEC AE» es de AE", () => {
    expect(unidadDeLoDeHubspot("tec", { titulo: "IA AGENT | WA - TEC AE", correos: [] }, c)).toBe("ae");
    expect(unidadDeLoDeHubspot("tec", { titulo: "Re: propuesta", correos: ["ibrenes@itcr.ac.cr", "mmartinez@itcr.ac.cr"] }, c)).toBeNull();
  });

  it("solo para una empresa con unidades", () => {
    expect(unidadDeLoDeHubspot("tae", { titulo: "AE | x", correos: [] }, c)).toBeNull();
    expect(unidadDeLoDeHubspot("otro", { titulo: null, correos: ["a@wherex.com"] }, c)).toBeNull();
  });

  it("un proyecto nuevo va a la unidad que abre su nombre; sin «|», a la empresa", () => {
    expect(unidadPorLasSiglas("AE | RE-IMPLEMENTACION HUBSPOT", "tec", c.clients)).toBe("ae");
    expect(unidadPorLasSiglas("TEC TAE | RE-IMPLEMENTACIÓN CRM", "tec", c.clients)).toBe("tae");
    expect(unidadPorLasSiglas("Proyecto Y", "tec", c.clients)).toBeNull();
    expect(unidadPorLasSiglas("Soporte | AE y TAE", "tec", c.clients)).toBeNull();
    expect(unidadPorLasSiglas("AE | x", "tae", c.clients)).toBeNull();
  });
});

describe("el reconocimiento de clientes en un texto (Tareas, «Mi día») nunca sugiere la empresa", () => {
  it("«TEC» solo no sugiere la empresa; las siglas, la unidad", async () => {
    const { indiceDeClientes, clientesDeUnTexto, clientesNombradosEnteros } = await import("./clientes-por-texto");
    const indice = indiceDeClientes([TEC, TAE, AE, OTRO]);
    expect(clientesDeUnTexto("Reporte para TEC", indice).sugerido).not.toBe("tec");
    expect(clientesDeUnTexto("Reporte para TEC", indice).candidatos).not.toContain("tec");
    expect(clientesDeUnTexto("Revisar AE | reportes", indice).sugerido).toBe("ae");
    expect(clientesNombradosEnteros("Preparar demo para TEC", indice)).not.toContain("tec");
  });
});

/* Revisión del 26 nov: los filtros de la empresa se probaban con «TEC», de tres letras, que el match por título ignora
   igual. Estos usan nombres de cuatro letras o más: sin los filtros, se ponen en rojo. */
describe("la empresa no se nombra por título, con un nombre que sí se podría nombrar", () => {
  const CEMACO = { id: "cemaco", name: "Cemaco", company: null, emailDomains: [], kind: "EMPRESA" };
  const CR = { id: "cr", name: "Cemaco · Costa Rica", company: null, emailDomains: ["cemaco.co.cr"], siglas: ["CR"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com"], siglas: ["EC"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const GRUPO = { id: "g", name: "Grupo Teamnet", company: null, emailDomains: [], kind: "EMPRESA" };
  const TEAMNET = { id: "t", name: "Teamnet", company: null, emailDomains: ["teamnet.com.mx"], comparteDominioConId: "g", kind: "CLIENTE" };
  const STRATO = { id: "s", name: "Stratosphere", company: null, emailDomains: ["stratospherecorp.com"], comparteDominioConId: "g", kind: "CLIENTE" };

  it("una reunión interna «Cemaco y Wherex» nunca es de la empresa Cemaco", () => {
    const c = ctxDe([CR, CEMACO, EC, OTRO]);
    expect(duenoDe(reunion("Cemaco y Wherex | Revisión", []), c)).not.toBe("cemaco");
    expect(duenoDe(reunion("Cemaco | Revisión", []), c)).not.toBe("cemaco");
  });

  it("en Tareas y «Mi día», «Grupo Teamnet» sugiere la unidad, nunca la empresa", async () => {
    const { indiceDeClientes, clientesDeUnTexto, clientesNombradosEnteros } = await import("./clientes-por-texto");
    const indice = indiceDeClientes([GRUPO, TEAMNET, STRATO, OTRO]);
    expect(clientesDeUnTexto("Llamar a Grupo Teamnet", indice).sugerido).not.toBe("g");
    expect(clientesDeUnTexto("Llamar a Grupo Teamnet", indice).candidatos).not.toContain("g");
    expect(clientesNombradosEnteros("Preparar la demo de Grupo Teamnet", indice)).not.toContain("g");
    expect(computeAmbiguousNameTokens([GRUPO, TEAMNET, STRATO, OTRO].map((x) => ({ ...x, comparteDominioConId: (x as { comparteDominioConId?: string | null }).comparteDominioConId ?? null }))).has("teamnet")).toBe(false);
  });
});

describe("el dominio de la empresa es de las unidades que viven en él", () => {
  /* La empresa con dominio propio, una unidad que vive en él y otra con el suyo. */
  const ALFA = { id: "alfa", name: "Alfa Holding", company: null, emailDomains: ["alfa.com"], kind: "EMPRESA" };
  const UNO = { id: "uno", name: "Alfa · Norte", company: null, emailDomains: [], siglas: ["NOR"], comparteDominioConId: "alfa", kind: "CLIENTE" };
  const DOS = { id: "dos", name: "Alfa · Sur", company: null, emailDomains: ["alfasur.com"], siglas: ["SUR"], comparteDominioConId: "alfa", kind: "CLIENTE" };
  const c = ctxDe([ALFA, UNO, DOS]);

  it("la gente del dominio de la empresa es de la única unidad que vive en él", () => {
    expect(duenoDe(reunion("Seguimiento", ["ana@alfa.com"]), c)).toBe("uno");
    expect(duenoDe(reunion("Seguimiento", ["ana@alfasur.com"]), c)).toBe("dos");
    expect(duenoDe(reunion("Seguimiento", ["ana@alfa.com", "beto@alfasur.com"]), c)).toBe("(por decidir)");
  });

  it("fichasQueDaElDominio nunca devuelve la empresa", async () => {
    const { fichasQueDaElDominio } = await import("./categorize");
    expect(fichasQueDaElDominio("ana@alfa.com", c)).toEqual(["uno"]);
  });
});

describe("las defensas del resolver con la gente confirmada", () => {
  it("una persona confirmada en la empresa (dato viejo) no la vuelve dueña", () => {
    const c = ctxDe([TAE, OTRO, AE, TEC], { interlocutoresConfirmados: new Map([["vieja@itcr.ac.cr", ["tec"]]]) });
    expect(duenoDe(reunion("Revisión", ["vieja@itcr.ac.cr"]), c)).not.toBe("tec");
  });

  it("la regla del grupo («la dueña del proyecto más antiguo») nunca elige la empresa, aunque tenga un proyecto esperando", () => {
    const c = ctxDe([TAE, CREDIX, AE, TEC], {
      interlocutoresConfirmados: new Map([["laura@itcr.ac.cr", ["tec", "credix"]]]),
      primerProyecto: new Map([
        ["tec", new Date("2025-01-01")],
        ["credix", new Date("2026-01-01")],
      ]),
    });
    expect(duenoDe(reunion("Sprint semanal", ["laura@itcr.ac.cr"]), c)).not.toBe("tec");
  });
});

describe("el nombre de la empresa no vuelve ambigua una palabra de OTRO cliente", () => {
  it("«Holding Alfa» (la empresa) no le quita «holding» a «Holding Beta»", () => {
    const fichas = [
      { id: "ha", name: "Holding Alfa", company: null, comparteDominioConId: null, kind: "EMPRESA" },
      { id: "n", name: "Alfa · Norte", company: null, comparteDominioConId: "ha", kind: "CLIENTE" },
      { id: "s", name: "Alfa · Sur", company: null, comparteDominioConId: "ha", kind: "CLIENTE" },
      { id: "hb", name: "Holding Beta", company: null, comparteDominioConId: null, kind: "CLIENTE" },
    ];
    expect(computeAmbiguousNameTokens(fichas).has("holding")).toBe(false);
  });
});

describe("Grupo Teamnet: dentro de una empresa que solo agrupa vale la regla del grupo (Elías, 27 nov)", () => {
  const T_ANTES = { id: "t", name: "Teamnet", company: null, emailDomains: ["teamnet.com.mx"], hubspotCompanyId: "hs-t" };
  const S_ANTES = { id: "s", name: "Stratosphere", company: null, emailDomains: ["stratospherecorp.com"], siglas: ["SAS"], hubspotCompanyId: "hs-s" };
  const GRUPO = { id: "g", name: "Grupo Teamnet", company: null, emailDomains: [], hubspotCompanyId: null, kind: "EMPRESA" };
  const T = { ...T_ANTES, comparteDominioConId: "g", kind: "CLIENTE" };
  const S = { ...S_ANTES, comparteDominioConId: "g", kind: "CLIENTE" };
  const comun = {
    interlocutoresConfirmados: new Map([["laura@teamnet.com.mx", ["t", "s"]]]),
    primerProyecto: new Map([
      ["t", new Date("2025-03-01")],
      ["s", new Date("2026-02-01")],
    ]),
  };
  const antes = ctxDe([T_ANTES, OTRO, S_ANTES], comun);
  const ahora = ctxDe([T, OTRO, S, GRUPO], comun);
  const CASOS_TEAMNET = [
    reunion("Sprint semanal | Teamnet y Sas", ["laura@teamnet.com.mx"]),
    reunion("Health Score Team", ["laura@teamnet.com.mx"]),
    reunion("Kick off - Teamnet y Sas", []),
    reunion("Capacitación", ["a@teamnet.com.mx", "b@stratospherecorp.com"]),
    reunion("Stratosphere | Kickoff", ["b@stratospherecorp.com"]),
    reunion("Revisión", ["b@stratospherecorp.com"]),
    reunion("Teamnet | Web", ["laura@teamnet.com.mx"]),
    reunion("Wherex | QBR", ["x@wherex.com"]),
  ];

  it("cada reunión tiene el mismo dueño que antes de la empresa", () => {
    for (const s of CASOS_TEAMNET) expect([s.title, duenoDe(s, ahora)]).toEqual([s.title, duenoDe(s, antes)]);
    expect(duenoDe(CASOS_TEAMNET[0]!, ahora)).toBe("t");
    expect(duenoDe(CASOS_TEAMNET[3]!, ahora)).toBe("t");
  });

  it("sin la regla (la empresa con dominio o con empresa de HubSpot, o sin saberlo) lo dudoso queda por decidir", () => {
    const capacitacion = CASOS_TEAMNET[3]!;
    for (const grupo of [
      { ...GRUPO, hubspotCompanyId: "hs-g" },
      { ...GRUPO, emailDomains: ["grupoteamnet.com"] },
      { ...GRUPO, hubspotCompanyId: undefined },
    ]) {
      expect(duenoDe(capacitacion, ctxDe([T, OTRO, S, grupo], comun))).toBe("(por decidir)");
    }
  });

  it("el TEC y Cemaco no cambian: con proyectos, lo dudoso entre sus unidades sigue por decidir", () => {
    const conProyectos = { primerProyecto: new Map([["tae", new Date("2024-01-01")], ["ae", new Date("2025-01-01")], ["cr", new Date("2024-01-01")], ["ec", new Date("2025-01-01")]]) };
    const tec = ctxDe([TAE, OTRO, AE, { ...TEC, hubspotCompanyId: "59180429929" }], conProyectos);
    expect(duenoDe(reunion("Revisión semanal", ["x@itcr.ac.cr"]), tec)).toBe("(por decidir)");
    const CEMACO = { id: "cemaco", name: "Cemaco", company: null, emailDomains: [], hubspotCompanyId: "59033632123", kind: "EMPRESA" };
    const CR = { id: "cr", name: "Cemaco · Costa Rica", company: null, emailDomains: ["cemaco.co.cr"], siglas: ["CR"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
    const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com"], siglas: ["EC"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
    expect(duenoDe(reunion("Alineación CEMACO", ["a@cemaco.co.cr", "b@sukasa.com"]), ctxDe([CR, CEMACO, EC], conProyectos))).toBe("(por decidir)");
  });
});

/* Elías, 27 nov: Sukasa es una unidad de Cemaco y las reuniones «SUKASA…» siguen siendo de Cemaco · Ecuador. sukasa.com
   es de Ecuador: la palabra de un dominio propio de una unidad no nombra a otra sola, y decide el dominio. */
describe("Cemaco con Sukasa: el dominio propio de una unidad es una palabra suya", () => {
  const CEMACO = { id: "cemaco", name: "Cemaco", company: null, emailDomains: [], kind: "EMPRESA", hubspotCompanyId: "59033632123" };
  const CR = { id: "cr", name: "Cemaco · Costa Rica", company: "Cemaco Internacional", emailDomains: ["cemaco.co.cr"], siglas: ["CR"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], comparteDominioConId: "cemaco", kind: "CLIENTE" };
  const SUKASA = { id: "suk", name: "Cemaco · Sukasa", company: "Sukasa", emailDomains: [], comparteDominioConId: "cemaco", kind: "PROSPECTO", hubspotCompanyId: "60198830904" };
  const c = ctxDe([CR, CEMACO, EC, SUKASA]);

  it("«SUKASA + CEMACO + COMOHOGAR» con gente de sukasa.com sigue en Ecuador", () => {
    expect(duenoDe(reunion("SUKASA + CEMACO + COMOHOGAR | ECOMMERCE", ["a@sukasa.com"]), c)).toBe("ec");
    expect(duenoDe(reunion("SUKASA ECUADOR |  SMARTEAM", ["a@sukasa.com"]), c)).toBe("ec");
    expect(duenoDe(reunion("CEMACO", ["a@sukasa.com", "b@sukasa.com"]), c)).toBe("ec");
  });

  it("el resto de Cemaco no cambia", () => {
    expect(duenoDe(reunion("Sales Hub", ["a@cemaco.co.cr"]), c)).toBe("cr");
    expect(duenoDe(reunion("Cemaco EC | Kickoff", ["a@cemaco.co.cr"]), c)).toBe("ec");
    expect(duenoDe(reunion("Alineación CEMACO", ["a@cemaco.co.cr", "b@sukasa.com"]), c)).toBe("(por decidir)");
  });

  it("sin el dominio de Ecuador, «Sukasa» sí nombra a la unidad Sukasa", () => {
    const sinDominio = ctxDe([CR, CEMACO, { ...EC, emailDomains: ["comohogar.com"] }, SUKASA]);
    expect(duenoDe(reunion("SUKASA + CEMACO + COMOHOGAR | ECOMMERCE", ["a@comohogar.com"]), sinDominio)).toBe("suk");
  });

  it("Tareas y «Mi día» no sugieren Sukasa por la palabra «Sukasa»", async () => {
    const { indiceDeClientes, clientesDeUnTexto } = await import("./clientes-por-texto");
    const indice = indiceDeClientes([CR, CEMACO, EC, SUKASA]);
    expect(clientesDeUnTexto("Propuesta Cemaco Sukasa", indice).sugerido).not.toBe("suk");
  });
});
