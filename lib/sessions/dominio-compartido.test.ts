/**
 * lib/sessions/dominio-compartido.test.ts — DOS FICHAS QUE COMPARTEN DOMINIO SE REPARTEN LAS REUNIONES.
 *
 * Correr: `npx vitest run lib/sessions/dominio-compartido.test.ts --project unit`.
 *
 * El caso es el TEC (2026-10-29): «TEC · AE» y «TEC · TAE» son dos entidades del mismo instituto, con el mismo dominio
 * (itcr.ac.cr) y la misma empresa de HubSpot. Antes, el paso del dominio se quedaba con la ficha más vieja y AE nunca
 * recibía una reunión. La regla (lib/sessions/categorize.ts › decidirEntreEntidades): el nombre de la reunión, después
 * la gente de cada entidad, y si no hay pista, POR DECIDIR — nunca la ficha más vieja.
 */
import { describe, expect, it } from "vitest";
import {
  aprenderPersonasDeEntidades,
  pistasDeTitulo,
  categorizeSession,
  decidirEntreEntidades,
  entidadesDelDominio,
  type CategorizableSession,
  type CategorizeContext,
} from "./categorize";
import type { HubspotCompanyLite } from "@/lib/hubspot/companies";

const TAE = { id: "tae", name: "TEC · TAE", company: "tec.ac.cr", emailDomains: ["itcr.ac.cr", "tec.ac.cr"], siglas: ["TAE"] };
const AE = { id: "ae", name: "TEC · AE", company: "TEC- AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: "tae" };
const OTRO = { id: "otro", name: "Wherex", company: null, emailDomains: ["wherex.com"] };

function ctx(over: Partial<CategorizeContext> = {}): CategorizeContext {
  return {
    clients: [TAE, OTRO, AE],
    categories: [{ id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null }],
    hubspotCompaniesByDomain: new Map(),
    internalDomains: new Set(["smarteamcr.com"]),
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
  return g.kind === "client" ? g.id : `(${g.kind}: ${g.label})`;
};

describe("el nombre de la reunión decide", () => {
  it("«AE |» es de AE y «TEC TAE |» es de TAE, aunque las dos tengan gente del mismo dominio", () => {
    expect(duenoDe(reunion("AE | Reportes de Ventas", ["ibrenes@itcr.ac.cr"]), ctx())).toBe("ae");
    expect(duenoDe(reunion("TEC TAE | RE-IMPLEMENTACIÓN CRM", ["mmartinez@itcr.ac.cr"]), ctx())).toBe("tae");
    expect(duenoDe(reunion("Alineación TEC-TAE & Smarteam", ["gcerdas@itcr.ac.cr"]), ctx())).toBe("tae");
    expect(duenoDe(reunion("Revisión conexión Fundatec - Hubspot | AE", ["x@fundatec.ac.cr", "a@itcr.ac.cr"]), ctx())).toBe("ae");
  });

  it("«TAE» no se lee como «AE»: la sigla es la palabra entera", () => {
    const d = decidirEntreEntidades(reunion("Soporte | TAE - SMARTEAM", []), [TAE, AE], ctx());
    expect(d).toEqual({ clientId: "tae", por: "nombre" });
  });

  it("un nombre que dice las dos queda por decidir, aunque la gente apunte a una", () => {
    const c = ctx({ personasDeEntidades: new Map([["ibrenes@itcr.ac.cr", "ae"]]) });
    expect(decidirEntreEntidades(reunion("AE y TAE | Planificación", ["ibrenes@itcr.ac.cr"]), [TAE, AE], c)).toEqual({
      clientId: null,
      por: "dos-nombres",
    });
  });
});

describe("después, la gente de cada entidad", () => {
  const c = ctx({ personasDeEntidades: new Map([["ibrenes@itcr.ac.cr", "ae"], ["mmartinez@itcr.ac.cr", "tae"]]) });

  it("sin nombre, con gente de una sola entidad: es de esa", () => {
    expect(duenoDe(reunion("Kick Off | TEC & Smarteam", ["ibrenes@itcr.ac.cr", "nuevo@itcr.ac.cr"]), c)).toBe("ae");
    expect(duenoDe(reunion("Cena | Marco Martinez + Smarteam", ["MMartinez@itcr.ac.cr"]), c)).toBe("tae");
  });

  it("con gente de las dos: por decidir", () => {
    const g = categorizeSession(reunion("Visita FUNDATEC", ["ibrenes@itcr.ac.cr", "mmartinez@itcr.ac.cr"]), c);
    expect(g).toEqual({ kind: "orphan", label: "Por decidir: TEC · TAE o TEC · AE", domain: "itcr.ac.cr" });
  });

  it("sin nombre y sin nadie conocido: por decidir, NUNCA la ficha más vieja", () => {
    expect(duenoDe(reunion("Charlas I Unbound 2026", ["alguien@itcr.ac.cr"]), c)).toBe("(orphan: Por decidir: TEC · TAE o TEC · AE)");
    expect(duenoDe(reunion("Charlas I Unbound 2026", ["alguien@itcr.ac.cr"]), ctx())).toBe("(orphan: Por decidir: TEC · TAE o TEC · AE)");
  });

  it("la gente de Smarteam no cuenta (lleva las dos)", () => {
    const conHeiver = ctx({ personasDeEntidades: new Map([["hgomez@smarteamcr.com", "ae"]]) });
    expect(duenoDe(reunion("Seguimiento", ["alguien@itcr.ac.cr"]), conHeiver)).toBe("(orphan: Por decidir: TEC · TAE o TEC · AE)");
  });
});

describe("lo que decidió una persona y lo que no cambia", () => {
  it("la asignación a mano gana siempre", () => {
    expect(duenoDe(reunion("TEC TAE | algo", ["ibrenes@itcr.ac.cr"], "ae"), ctx())).toBe("ae");
  });

  it("una ficha que no comparte dominio sigue como siempre", () => {
    expect(duenoDe(reunion("Reunión", ["x@wherex.com"]), ctx())).toBe("otro");
    const sinGrupo = ctx({ clients: [TAE, OTRO, { ...AE, comparteDominioConId: null }] });
    expect(duenoDe(reunion("Charlas", ["alguien@itcr.ac.cr"]), sinGrupo)).toBe("tae");
    expect(entidadesDelDominio("tae", sinGrupo)).toBeNull();
  });

  it("también reparte cuando la dueña llega por la empresa de HubSpot (paso 5)", () => {
    const empresa: HubspotCompanyLite = { id: "59180429929", name: "ITCR", domain: "itc.ac.cr" } as HubspotCompanyLite;
    const c = ctx({
      hubspotCompaniesByDomain: new Map([["itc.ac.cr", empresa]]),
      clientsByHubspotCompanyId: new Map([["59180429929", { id: "tae", name: "TEC · TAE", company: "tec.ac.cr" }]]),
    });
    expect(duenoDe(reunion("AE | Reportes", ["x@itc.ac.cr"]), c)).toBe("ae");
    expect(duenoDe(reunion("Reportes", ["x@itc.ac.cr"]), c)).toBe("(orphan: Por decidir: TEC · TAE o TEC · AE)");
  });

  it("sin cadenas: una dueña que es entidad de otra no arma grupo", () => {
    const c = ctx({ clients: [{ ...TAE, comparteDominioConId: "otro" }, OTRO, AE] });
    expect(entidadesDelDominio("tae", c)?.map((x) => x.id)).toEqual(["tae", "otro"]);
    expect(entidadesDelDominio("ae", c)).toBeNull();
  });
});

describe("cómo se aprende la gente", () => {
  it("de las reuniones que decidió el nombre o una persona; quien estuvo en las dos no se aprende", () => {
    const personas = aprenderPersonasDeEntidades(
      [
        reunion("AE | Limpieza BBDD", ["ibrenes@itcr.ac.cr", "doble@itcr.ac.cr"]),
        reunion("TEC TAE | Workflows", ["mmartinez@itcr.ac.cr", "doble@itcr.ac.cr"]),
        reunion("Sin nombre", ["mano@itcr.ac.cr"], "ae"),
        reunion("Otra", ["x@wherex.com"]),
      ],
      ctx(),
    );
    expect(Object.fromEntries(personas)).toEqual({
      "ibrenes@itcr.ac.cr": "ae",
      "mmartinez@itcr.ac.cr": "tae",
      "mano@itcr.ac.cr": "ae",
    });
  });

  it("NUNCA de una reunión que decidió la gente: un error no se alimenta a sí mismo", () => {
    const sesiones = [
      reunion("AE | Reportes", ["ibrenes@itcr.ac.cr"]),
      // Sin nombre: la decide Ivania (AE). Pedro NO se aprende de acá.
      reunion("Seguimiento", ["ibrenes@itcr.ac.cr", "pedro@itcr.ac.cr"]),
    ];
    const c = ctx();
    c.personasDeEntidades = aprenderPersonasDeEntidades(sesiones, c);
    expect(duenoDe(sesiones[1]!, c)).toBe("ae");
    expect(c.personasDeEntidades.has("pedro@itcr.ac.cr")).toBe(false);
    expect(duenoDe(reunion("Seguimiento 2", ["pedro@itcr.ac.cr"]), c)).toBe("(orphan: Por decidir: TEC · TAE o TEC · AE)");
  });

  it("no depende de lo materializado: una reunión nombrada enseña aunque hoy no tenga dueña", () => {
    /* `reunion` no trae `resolvedClientId`: lo aprendido sale del título y de lo asignado a mano. Si dependiera de lo
       materializado, re-resolver cambiaría lo aprendido y la corrida siguiente daría otro resultado (INV2). */
    const personas = aprenderPersonasDeEntidades([reunion("Revisión Fundatec AE", ["gaby@atomchat.io"])], ctx());
    expect(personas.get("gaby@atomchat.io")).toBe("ae");
  });

  it("las pistas de un título son las siglas y las palabras del nombre, y una ficha sin siglas no pierde su nombre", () => {
    expect(pistasDeTitulo([TAE, AE]).sort()).toEqual(["ae", "tae"]);
    const conNombre = { id: "x", name: "AnalisaLab", company: null, emailDomains: [], siglas: ["ANL"] };
    expect(pistasDeTitulo([conNombre]).sort()).toEqual(["analisalab", "anl"]);
  });

  it("sin grupos no aprende nada", () => {
    const c = ctx({ clients: [TAE, OTRO] });
    expect(aprenderPersonasDeEntidades([reunion("AE | x", ["i@itcr.ac.cr"])], c).size).toBe(0);
  });
});
