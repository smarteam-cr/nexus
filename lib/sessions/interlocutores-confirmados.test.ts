/**
 * lib/sessions/interlocutores-confirmados.test.ts — LA GENTE QUE CONFIRMÓ EL EQUIPO DECIDE DE QUIÉN ES LA REUNIÓN.
 *
 * Correr: `npx vitest run lib/sessions/interlocutores-confirmados.test.ts --project unit`.
 *
 * «Unidades e interlocutores» (2026-11-25): una persona del equipo dice con qué ficha trabaja cada persona del cliente, y el
 * resolver (lib/sessions/categorize.ts › paso 3·0) usa eso por encima del dominio y de lo aprendido de los títulos. Dos
 * casos reales: el TEC (AE y TAE comparten itcr.ac.cr) y Teamnet / Stratosphere (dominios distintos, pero Laura, Marco y
 * Mariana, de teamnet.com.mx, trabajan para las dos; y stratospherecorp.com está registrado en Teamnet).
 */
import { describe, expect, it } from "vitest";
import {
  aprenderPersonasDeEntidades,
  categorizeSession,
  fichasQueDaElDominio,
  interlocutoresDesdeFilas,
  type CategorizableSession,
  type CategorizeContext,
} from "./categorize";

const TAE = { id: "tae", name: "TEC · TAE", company: "tec.ac.cr", emailDomains: ["itcr.ac.cr", "tec.ac.cr"], siglas: ["TAE"] };
const AE = { id: "ae", name: "TEC · AE", company: "TEC- AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: "tae" };
const TEAMNET = { id: "teamnet", name: "Teamnet", company: "teamnet.com.mx", emailDomains: ["stratospherecorp.com"] };
const STRATO = { id: "strato", name: "Stratosphere", company: null, emailDomains: ["stratosphere.com.mx"] };
const CREDIX = { id: "credix", name: "Credix", company: null, emailDomains: ["credix.com"] };
const CUATRO_AM = { id: "4am", name: "4am Saatchi & Saatchi", company: null, emailDomains: ["4amsaatchi.com"] };

function ctx(confirmadas: Record<string, string[]> = {}, over: Partial<CategorizeContext> = {}): CategorizeContext {
  return {
    clients: [TAE, TEAMNET, CUATRO_AM, CREDIX, STRATO, AE],
    categories: [{ id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null }],
    hubspotCompaniesByDomain: new Map(),
    internalDomains: new Set(["smarteamcr.com"]),
    interlocutoresConfirmados: new Map(Object.entries(confirmadas)),
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
  return g.kind === "client" ? g.id : `(${g.kind})`;
};

const LAURA = "laura@teamnet.com.mx";
const SHAULA = "shaula@stratospherecorp.com";
const CINDY = "champion@itcr.ac.cr";
const DEL_GRUPO = { [LAURA]: ["teamnet", "strato"] };

describe("sin nadie confirmado, nada cambia", () => {
  const casos = [
    reunion("Revisión semanal", [CINDY]),
    reunion("AE | Reportes", ["ibrenes@itcr.ac.cr"]),
    reunion("Stratosphere Marketing", [LAURA, SHAULA]),
    reunion("Credix | Campaña", ["agencia@4amsaatchi.com", "ana@credix.com"]),
    reunion("Café", ["cesar@yahoo.es"]),
  ];
  it("con el mapa vacío, o con gente confirmada que no está en la reunión, da lo mismo que sin el mapa", () => {
    for (const s of casos) {
      const sinMapa = categorizeSession(s, ctx({}, { interlocutoresConfirmados: undefined }));
      expect(categorizeSession(s, ctx())).toEqual(sinMapa);
      expect(categorizeSession(s, ctx({ "otra@persona.com": ["ae"] }))).toEqual(sinMapa);
    }
  });
  it("hoy el dominio manda las reuniones de Stratosphere a Teamnet (el caso que esto arregla)", () => {
    expect(duenoDe(reunion("Stratosphere Marketing", [LAURA, SHAULA]), ctx())).toBe("teamnet");
    expect(duenoDe(reunion("Sales semana 4 | SAS & Smarteam", [SHAULA]), ctx())).toBe("teamnet");
  });
});

describe("la gente confirmada en UNA ficha decide por ella", () => {
  it("Cindy confirmada en AE: una reunión sin sigla deja de quedar por decidir", () => {
    const s = reunion("Revisión semanal de leads", [CINDY, "pedro@itcr.ac.cr"]);
    expect(duenoDe(s, ctx())).toBe("(orphan)");
    expect(duenoDe(s, ctx({ [CINDY]: ["ae"] }))).toBe("ae");
  });

  it("vale más que lo aprendido de los títulos", () => {
    const aprendioMal = { personasDeEntidades: new Map([[CINDY, "tae"]]) };
    const s = reunion("Revisión semanal de leads", [CINDY]);
    expect(duenoDe(s, ctx({}, aprendioMal))).toBe("tae");
    expect(duenoDe(s, ctx({ [CINDY]: ["ae"] }, aprendioMal))).toBe("ae");
  });

  it("vale más que su propio dominio: Shaula es de Stratosphere aunque stratospherecorp.com esté en Teamnet", () => {
    expect(duenoDe(reunion("Marketing semana 3", [SHAULA]), ctx({ [SHAULA]: ["strato"] }))).toBe("strato");
  });

  it("con un correo genérico (yahoo) también: César es de AE", () => {
    const s = reunion("Café de seguimiento", ["cesar@yahoo.es"]);
    expect(duenoDe(s, ctx())).toBe("(orphan)");
    expect(duenoDe(s, ctx({ "cesar@yahoo.es": ["ae"] }))).toBe("ae");
  });

  it("el correo se compara sin mayúsculas", () => {
    expect(duenoDe(reunion("Revisión semanal", ["Champion@ITCR.ac.cr"]), ctx({ [CINDY]: ["ae"] }))).toBe("ae");
  });
});

describe("el título sigue mandando, y lo asignado a mano gana siempre", () => {
  it("«TAE | Soporte» con Cindy (confirmada en AE) es de TAE: la gente no desempata un título", () => {
    expect(duenoDe(reunion("TAE | Soporte", [CINDY]), ctx({ [CINDY]: ["ae"] }))).toBe("tae");
  });
  it("a mano gana sobre la gente confirmada", () => {
    expect(duenoDe(reunion("Marketing semana 3", [SHAULA], "teamnet"), ctx({ [SHAULA]: ["strato"] }))).toBe("teamnet");
  });
});

describe("una persona «del grupo» no decide sola por su dominio", () => {
  it("con el título decide el título", () => {
    expect(duenoDe(reunion("Stratosphere Marketing", [LAURA]), ctx(DEL_GRUPO))).toBe("strato");
    expect(duenoDe(reunion("Revisión página web Teamnet", [LAURA]), ctx(DEL_GRUPO))).toBe("teamnet");
    // El título con dos puntos pegados al nombre también nombra (en el paso de la gente confirmada).
    expect(duenoDe(reunion("Teamnet: Propuesta Web", [LAURA]), ctx(DEL_GRUPO))).toBe("teamnet");
    expect(duenoDe(reunion("Stratosphere/Marketing", [LAURA]), ctx(DEL_GRUPO))).toBe("strato");
  });
  it("sin título, la reunión queda por decidir (antes: Teamnet por el dominio)", () => {
    const s = reunion("Sprint semanal", [LAURA]);
    expect(duenoDe(s, ctx())).toBe("teamnet");
    const g = categorizeSession(s, ctx(DEL_GRUPO));
    expect(g).toMatchObject({ kind: "orphan", label: "Por decidir: Teamnet o Stratosphere" });
  });
  it("si hay alguien confirmado en una sola ficha, decide esa persona: Laura no cuenta", () => {
    expect(duenoDe(reunion("Marketing semana 3 | SAS & Smarteam", [LAURA, SHAULA]), ctx({ ...DEL_GRUPO, [SHAULA]: ["strato"] }))).toBe("strato");
  });
});

describe("si la gente apunta a dos fichas, por decidir (nunca la más vieja)", () => {
  it("Shaula (Stratosphere) con alguien de teamnet.com.mx sin confirmar y sin título", () => {
    expect(duenoDe(reunion("Marketing semana 3", [SHAULA, "alan@teamnet.com.mx"]), ctx({ [SHAULA]: ["strato"] }))).toBe("(orphan)");
  });
  it("una agencia confirmada en su ficha no se lleva la reunión de su cliente si el título la nombra", () => {
    const c = ctx({ "agencia@4amsaatchi.com": ["4am"] });
    expect(duenoDe(reunion("Credix | Campaña de diciembre", ["agencia@4amsaatchi.com", "ana@credix.com"]), c)).toBe("credix");
    expect(duenoDe(reunion("Campaña de diciembre", ["agencia@4amsaatchi.com", "ana@credix.com"]), c)).toBe("(orphan)");
  });
  it("una unidad solo vive en el dominio de SU principal: la gente de Teamnet no se vuelve de AE", () => {
    // Cindy confirmada en AE trae al TEC entero; alguien de teamnet.com.mx sigue siendo de Teamnet, así que choca.
    expect(duenoDe(reunion("Revisión", [CINDY, "alan@teamnet.com.mx"]), ctx({ [CINDY]: ["ae"] }))).toBe("(orphan)");
  });
});

describe("la gente confirmada nunca se lleva la reunión de otro cliente (revisión del 25 nov)", () => {
  const BRAVO = { id: "bravo", name: "Bravo Logistica", company: null, emailDomains: [] };
  const SMARTEAM = { id: "casa", name: "Smarteam", company: "smarteamcr.com", emailDomains: ["smarteamcr.com"] };
  const conBravo = (confirmadas: Record<string, string[]>) =>
    ctx(confirmadas, { clients: [TAE, TEAMNET, CUATRO_AM, CREDIX, STRATO, AE, BRAVO, SMARTEAM] });
  it("si el título nombra a una ficha que no es candidata, decide la cascada de siempre (el título)", () => {
    const s = reunion("Bravo Logistica | Kickoff", ["consultor@gmail.com", "jefe@bravo-log.com"]);
    expect(duenoDe(s, conBravo({}))).toBe("bravo");
    expect(duenoDe(s, conBravo({ "consultor@gmail.com": ["credix"] }))).toBe("bravo");
  });
  it("la casa nunca es candidata: confirmar a alguien en Smarteam no le da «X & Smarteam»", () => {
    const s = reunion("Credix & Smarteam | Weekly", ["libre@gmail.com"]);
    expect(duenoDe(s, conBravo({}))).toBe("credix");
    expect(duenoDe(s, conBravo({ "libre@gmail.com": ["casa"] }))).toBe("credix");
    // Sin título: alguien confirmado en la casa no le disputa la reunión al dominio del cliente.
    const sinTitulo = reunion("Weekly", ["libre@gmail.com", "ana@credix.com"]);
    expect(duenoDe(sinTitulo, conBravo({ "libre@gmail.com": ["casa"] }))).toBe("credix");
  });
});

describe("la empresa de HubSpot ligada también es candidata (revisión del 25 nov)", () => {
  const BRAVO = { id: "bravo", name: "Bravo Logistica", company: null, emailDomains: [] };
  const conHubspot = (confirmadas: Record<string, string[]>) =>
    ctx(confirmadas, {
      clients: [TAE, TEAMNET, CUATRO_AM, CREDIX, STRATO, AE, BRAVO],
      hubspotCompaniesByDomain: new Map([["bravo-log.com", { id: "hs-bravo", name: "Bravo", domain: "bravo-log.com" } as never]]),
      clientsByHubspotCompanyId: new Map([["hs-bravo", { id: "bravo", name: "Bravo Logistica", company: null }]]),
    });
  it("alguien confirmado en Credix y gente del dominio ligado a Bravo, sin título: por decidir (nunca de Credix por descarte)", () => {
    const s = reunion("Weekly", ["consultor@gmail.com", "jefe@bravo-log.com"]);
    expect(duenoDe(s, conHubspot({}))).toBe("bravo");
    expect(duenoDe(s, conHubspot({ "consultor@gmail.com": ["credix"] }))).toBe("(orphan)");
  });
  it("con el título de Bravo, Bravo", () => {
    expect(duenoDe(reunion("Bravo | Weekly", ["consultor@gmail.com", "jefe@bravo-log.com"]), conHubspot({ "consultor@gmail.com": ["credix"] }))).toBe("bravo");
  });
  it("fichasQueDaElDominio: lo registrado (con su empresa entera) o la empresa de HubSpot ligada; nunca la casa ni un genérico", () => {
    const c = conHubspot({});
    expect(fichasQueDaElDominio("x@itcr.ac.cr", c).sort()).toEqual(["ae", "tae"]);
    expect(fichasQueDaElDominio("jefe@bravo-log.com", c)).toEqual(["bravo"]);
    expect(fichasQueDaElDominio("alguien@gmail.com", c)).toEqual([]);
    expect(fichasQueDaElDominio("heiver@smarteamcr.com", c)).toEqual([]);
  });
  it("el dominio propio de una unidad da solo esa unidad (no se le pide la principal a quien lleva la unidad)", () => {
    const CR = { id: "cr", name: "Cemaco · Costa Rica", company: null, emailDomains: ["cemaco.co.cr"] };
    const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com"], comparteDominioConId: "cr" };
    const c = ctx({}, { clients: [CR, EC] });
    expect(fichasQueDaElDominio("ana@sukasa.com", c)).toEqual(["ec"]);
    expect(fichasQueDaElDominio("luis@cemaco.co.cr", c)).toEqual(["cr"]);
  });
});

describe("alguien de un dominio de categoría (HubSpot, partners) no decide aunque esté confirmado", () => {
  it("sus reuniones siguen yendo a la categoría", () => {
    const conPartner = ctx(
      { "rep@hubspot.test": ["credix"] },
      { categories: [
        { id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null },
        { id: "hs", name: "HubSpot", slug: "hubspot", domains: ["hubspot.test"], kind: "partner", color: null },
      ] },
    );
    const g = categorizeSession(reunion("Partner sync", ["rep@hubspot.test"]), conPartner);
    expect(g).toMatchObject({ kind: "category", id: "hs" });
  });
});

describe("quien es de VARIAS unidades de una empresa también cuenta (revisión del 25 nov)", () => {
  it("una reunión del TEC con alguien confirmado en Credix no se va a Credix: queda por decidir", () => {
    const s = reunion("Revisión semanal", ["pedro@itcr.ac.cr", "ana@credix.com"]);
    expect(duenoDe(s, ctx())).toBe("(orphan)");
    expect(duenoDe(s, ctx({ "ana@credix.com": ["credix"] }))).toBe("(orphan)");
    // Un consultor de gmail confirmado en Credix, tampoco.
    expect(duenoDe(reunion("Revisión semanal", ["pedro@itcr.ac.cr", "consultor@gmail.com"]), ctx({ "consultor@gmail.com": ["credix"] }))).toBe("(orphan)");
  });
  it("alguien «del grupo» no elige, pero veta una ficha que no es de las suyas", () => {
    // Cindy del grupo (TAE y AE) con alguien de 4am, sin título: por decidir, nunca 4am.
    expect(duenoDe(reunion("Revisión semanal", [CINDY, "agencia@4amsaatchi.com"]), ctx({ [CINDY]: ["tae", "ae"] }))).toBe("(orphan)");
    // Laura (Teamnet y Stratosphere) con alguien de Credix: por decidir, nunca Credix.
    expect(duenoDe(reunion("Revisión semanal", [LAURA, "ana@credix.com"]), ctx(DEL_GRUPO))).toBe("(orphan)");
    // Con alguien de una de sus fichas, sí: Laura y Shaula (Stratosphere) dan Stratosphere.
    expect(duenoDe(reunion("Marketing semana 3", [LAURA, SHAULA]), ctx({ ...DEL_GRUPO, [SHAULA]: ["strato"] }))).toBe("strato");
  });
  it("dentro de la empresa sí decide: Cindy confirmada en AE con gente del TEC sin saber de qué unidad", () => {
    expect(duenoDe(reunion("Revisión semanal", [CINDY, "pedro@itcr.ac.cr"]), ctx({ [CINDY]: ["ae"] }))).toBe("ae");
  });
  it("y la gente de una categoría confirmada en una unidad no decide ni en el paso de las unidades", () => {
    const conPartner = ctx(
      { "rep@partner.test": ["ae"] },
      {
        categories: [
          { id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null },
          { id: "pt", name: "Partner", slug: "partner", domains: ["partner.test"], kind: "partner", color: null },
        ],
      },
    );
    expect(duenoDe(reunion("Revisión semanal", ["rep@partner.test", "pedro@itcr.ac.cr"]), conPartner)).toBe("(orphan)");
  });
});

describe("lo confirmado no se aprende ni enseña", () => {
  it("aprender la gente de las unidades da lo mismo con y sin confirmados", () => {
    const sesiones = [reunion("AE | Reportes", [CINDY, "x@itcr.ac.cr"]), reunion("TAE | CRM", ["jefe@itcr.ac.cr"]), reunion("Revisión", [CINDY])];
    expect(aprenderPersonasDeEntidades(sesiones, ctx({ [CINDY]: ["tae"], "x@itcr.ac.cr": ["tae"] }))).toEqual(aprenderPersonasDeEntidades(sesiones, ctx()));
  });
});

describe("interlocutoresDesdeFilas", () => {
  it("correo en minúsculas, fichas sin repetir y por antigüedad de la ficha", () => {
    const m = interlocutoresDesdeFilas([
      { correo: "Laura@teamnet.com.mx", clientId: "strato", desde: new Date("2026-07-10") },
      { correo: "laura@teamnet.com.mx", clientId: "teamnet", desde: new Date("2026-04-28") },
      { correo: "laura@teamnet.com.mx", clientId: "teamnet", desde: new Date("2026-04-28") },
    ]);
    expect(m.get("laura@teamnet.com.mx")).toEqual(["teamnet", "strato"]);
  });
});
