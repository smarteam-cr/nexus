/**
 * lib/sessions/unidades-con-dominio-propio.test.ts — UNA EMPRESA CON VARIAS UNIDADES: lo que el TEC no tenía.
 *
 * Correr: `npx vitest run lib/sessions/unidades-con-dominio-propio.test.ts --project unit`.
 *
 * El caso es CEMACO (2026-11-07, decisión 6 del plan de unidades): «Cemaco · Costa Rica» es la principal
 * (`cemaco.co.cr`) y «Cemaco · Ecuador» tiene dominios propios (`sukasa.com`, `comohogar.com`). Tres reglas nuevas del
 * resolver (lib/sessions/categorize.ts), además de las del TEC (dominio-compartido.test.ts):
 *  · una unidad con dominio propio vive en el suyo: el dominio decide solo, y el de la principal no la incluye;
 *  · cuando el título cae en una unidad, se reparte entre las unidades («Alineación CEMACO» queda por decidir);
 *  · en una empresa con marca («Cemaco»), la sigla de una unidad vale solo junto a la marca: «CR» suelto está en 27
 *    títulos de otros clientes («Ride CR», «Claro CR»).
 */
import { describe, expect, it } from "vitest";
import {
  categorizeSession,
  computeAmbiguousNameTokens,
  decidirEntreEntidades,
  viveEnElDominioDeLaPrincipal,
  type CategorizableSession,
  type CategorizeContext,
} from "./categorize";
import { clientesDeUnTexto, clientesNombradosEnteros, indiceDeClientes } from "./clientes-por-texto";

const CR = { id: "cr", name: "Cemaco · Costa Rica", company: "Cemaco Internacional", emailDomains: ["cemaco.co.cr"], siglas: ["CR"] };
const EC = { id: "ec", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], comparteDominioConId: "cr" };
const HONDA = { id: "honda", name: "Honda Costa Rica", company: null, emailDomains: ["hondafaco.com"] };
const LIBRERIA = { id: "libreria", name: "Librería Internacional", company: null, emailDomains: ["libreriainternacional.com"] };
const TAE = { id: "tae", name: "TEC · TAE", company: "tec.ac.cr", emailDomains: ["itcr.ac.cr"], siglas: ["TAE"] };
const AE = { id: "ae", name: "TEC · AE", company: "TEC- AE", emailDomains: [], siglas: ["AE"], comparteDominioConId: "tae" };

function ctx(over: Partial<CategorizeContext> = {}): CategorizeContext {
  const clients = over.clients ?? [HONDA, LIBRERIA, TAE, CR, AE, EC];
  return {
    clients,
    categories: [{ id: "int", name: "Interna", slug: "interna", domains: ["smarteamcr.com"], kind: "internal", color: null }],
    hubspotCompaniesByDomain: new Map(),
    internalDomains: new Set(["smarteamcr.com"]),
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
    ...over,
  };
}

const reunion = (title: string, participants: string[]): CategorizableSession => ({
  title,
  participants: ["aortega@smarteamcr.com", ...participants],
  manualClientId: null,
});

const duenoDe = (s: CategorizableSession, c = ctx()) => {
  const g = categorizeSession(s, c);
  return g.kind === "client" ? g.id : `(${g.kind}: ${g.label})`;
};
const POR_DECIDIR = "(orphan: Por decidir: Cemaco · Costa Rica o Cemaco · Ecuador)";

describe("una unidad con dominio propio vive en el suyo", () => {
  it("Ecuador no vive en el dominio de Costa Rica; AE (sin dominio) sí vive en el del TEC", () => {
    expect(viveEnElDominioDeLaPrincipal(EC)).toBe(false);
    expect(viveEnElDominioDeLaPrincipal(AE)).toBe(true);
    expect(viveEnElDominioDeLaPrincipal(CR)).toBe(false);
  });

  it("«SUKASA + CEMACO + COMOHOGAR | MARKETING», con gente de Ecuador, es de Ecuador por el dominio", () => {
    const s = reunion("SUKASA + CEMACO + COMOHOGAR | MARKETING", ["ana@sukasa.com", "luis@comohogar.com", "x@hubspot.com"]);
    expect(duenoDe(s)).toBe("ec");
    expect(decidirEntreEntidades(s, [CR, EC], ctx())).toEqual({ clientId: "ec", por: "dominio" });
  });

  it("«Cemaco | Sales Hub», con gente de cemaco.co.cr, es de Costa Rica por el dominio (no queda por decidir)", () => {
    const s = reunion("Cemaco | Sales Hub", ["jose@cemaco.co.cr", "consultor@delphostec.com"]);
    expect(duenoDe(s)).toBe("cr");
    expect(decidirEntreEntidades(s, [CR, EC], ctx())).toEqual({ clientId: "cr", por: "dominio" });
  });

  it("con gente de los dos países (la del 30 oct): por decidir, nunca la más vieja", () => {
    const s = reunion("Platiquemos sobre HubSpot | SUKASA + CEMACO + COMOHOGAR", ["ana@sukasa.com", "jose@cemaco.co.cr"]);
    expect(duenoDe(s)).toBe(POR_DECIDIR);
    expect(decidirEntreEntidades(s, [CR, EC], ctx()).por).toBe("gente-de-varias");
  });

  it("el título manda sobre el dominio: «Cemaco EC | Marketing» con gente de Costa Rica es de Ecuador", () => {
    expect(duenoDe(reunion("Cemaco EC | Marketing", ["jose@cemaco.co.cr"]))).toBe("ec");
  });
});

describe("el título que cae en una unidad se reparte", () => {
  it("«Alineación CEMACO» (solo Smarteam) nombra a la empresa, no a una unidad: por decidir, a la vista", () => {
    expect(duenoDe(reunion("Alineación CEMACO", []))).toBe(POR_DECIDIR);
    expect(duenoDe(reunion("Sales & Service Handoff | CEMACO", []))).toBe(POR_DECIDIR);
  });

  it("«Cemaco CR | Handoff» y «Cemaco Ecuador | Kickoff» (solo Smarteam) sí dicen la unidad", () => {
    expect(duenoDe(reunion("Cemaco CR | Handoff", []))).toBe("cr");
    expect(duenoDe(reunion("Cemaco Ecuador | Kickoff", []))).toBe("ec");
  });

  it("«Cemaco CR + EC | Kickoff» nombra a las dos: por decidir", () => {
    expect(duenoDe(reunion("Cemaco CR + EC | Kickoff", []))).toBe(POR_DECIDIR);
  });

  it("la palabra que comparten las unidades no las vuelve ambiguas para el resto de la base", () => {
    const ambiguas = computeAmbiguousNameTokens([HONDA, LIBRERIA, CR, EC]);
    expect(ambiguas.has("cemaco")).toBe(false);
    expect(ambiguas.has("costa")).toBe(true); // Honda Costa Rica y Cemaco · Costa Rica son empresas distintas
    expect(ambiguas.has("internacional")).toBe(true);
  });
});

describe("la sigla de una unidad, en una empresa con marca, vale solo junto a la marca", () => {
  it("«Ride CR: Landing Pages» y «Pago de Nómina en CR y NIC» (solo Smarteam) no se van a Costa Rica", () => {
    expect(duenoDe(reunion("Ride CR: Landing Pages", []))).toBe("(category: Interna)");
    expect(duenoDe(reunion("Pago de Nómina en CR y NIC", []))).toBe("(category: Interna)");
  });

  it("una reunión de Honda que dice «CR» sigue siendo de Honda", () => {
    expect(duenoDe(reunion("Honda CR | Seguimiento", []))).toBe("honda");
  });

  it("sin marca (el TEC), la sigla sola sigue valiendo, como se decidió el 29 oct", () => {
    expect(duenoDe(reunion("Hand Off | AE", []))).toBe("ae");
    expect(duenoDe(reunion("TAE - interno", []))).toBe("tae");
  });

  it("antes de separar (sin la marca de unidades) nada cambia: «CEMACO» es de la única ficha", () => {
    const antes = { ...CR, name: "Cemaco Internacional", siglas: [] };
    const c = ctx({ clients: [HONDA, LIBRERIA, TAE, antes, AE] });
    expect(duenoDe(reunion("Alineación CEMACO", []), c)).toBe("cr");
    expect(duenoDe(reunion("SUKASA + CEMACO + COMOHOGAR | TI", ["ana@sukasa.com"]), c)).toBe("cr");
  });
});

describe("entre las unidades, la sigla sin la marca tampoco le gana al dominio (revisión del 7 nov)", () => {
  it("«Ride CR | Landing» con gente de Ecuador es de Ecuador; «Pagos EC pendientes» con gente de Costa Rica, de Costa Rica", () => {
    expect(duenoDe(reunion("Ride CR | Landing", ["ana@sukasa.com"]))).toBe("ec");
    expect(duenoDe(reunion("Revisión CR #3", ["ana@sukasa.com"]))).toBe("ec");
    expect(duenoDe(reunion("Pagos EC pendientes", ["jose@cemaco.co.cr"]))).toBe("cr");
  });

  it("con la marca, la sigla sí decide entre las unidades", () => {
    expect(decidirEntreEntidades(reunion("Cemaco EC | Pagos", ["jose@cemaco.co.cr"]), [CR, EC], ctx())).toEqual({ clientId: "ec", por: "nombre" });
  });
});

describe("Tareas y «Mi día» reconocen las unidades con la misma regla (lib/sessions/clientes-por-texto.ts)", () => {
  const indice = indiceDeClientes([HONDA, LIBRERIA, TAE, CR, AE, EC]);

  it("«CR» suelto no sugiere Costa Rica, y la marca sola no elige una unidad", () => {
    expect(clientesDeUnTexto("Pago de Nómina en CR y NIC", indice).sugerido).toBeNull();
    const marca = clientesDeUnTexto("Alineación CEMACO", indice);
    expect(marca.sugerido).toBeNull();
    expect(marca.candidatos).toEqual(expect.arrayContaining(["cr", "ec"]));
    expect(clientesDeUnTexto("Cemaco CR | revisar el pipeline", indice).sugerido).toBe("cr");
    expect(clientesDeUnTexto("Hand Off | AE", indice).sugerido).toBe("ae");
  });

  it("el nombre entero de una unidad es lo que la distingue, no la marca", () => {
    expect(clientesNombradosEnteros("Alineación CEMACO", indice)).toEqual([]);
    expect(clientesNombradosEnteros("Kickoff Cemaco Ecuador", indice)).toEqual(["ec"]);
    expect(clientesNombradosEnteros("Ride CR: Landing Pages", indice)).toEqual([]);
  });

  it("la marca no queda ambigua en el índice por sus unidades", () => {
    expect(indice.ambiguos.has("cemaco")).toBe(false);
  });
});
