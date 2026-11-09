/**
 * lib/sessions/separar-en-unidades.test.ts — QUÉ VA A CADA UNIDAD Y POR QUÉ (etapa U1, 2026-11-07).
 *
 * Correr: `npx vitest run lib/sessions/separar-en-unidades.test.ts --project unit`.
 *
 * La lógica pura de scripts/separar-en-unidades.ts: las fichas como quedarán, los proyectos, propuestas y preventas, y
 * cada fila que cuelga con `clientId`. Lo que se prueba es lo que Elías teme: que Nexus mueva algo adivinando. Un proyecto
 * se mueve solo si lo dice su título o una persona; lo que propone la gente de sus reuniones espera confirmación.
 */
import { describe, expect, it } from "vitest";
import { computeAmbiguousNameTokens, entidadesDelDominio, type CategorizeContext } from "./categorize";
import {
  bloquea,
  clientesDespues,
  conLasUnidadesYaCreadas,
  destinoEfectivo,
  porDecidirConVinculoDeUnaPersona,
  seMueve,
  destinosDeFilas,
  destinosDePreventas,
  destinosDePropuestas,
  destinosDeProyectos,
  fichaCambia,
  fichasDespues,
  idDeUnidadNueva,
  type FichaActual,
  type SeparacionEnUnidades,
} from "./separar-en-unidades";

const TEC: FichaActual = { id: "tec", name: "TEC", company: "tec.ac.cr", emailDomains: ["tec.ac.cr", "itcr.ac.cr"], siglas: [], hubspotCompanyId: "59180429929", comparteDominioConId: null };
const TEC_AE: FichaActual = { id: "ae", name: "TEC- AE", company: "TEC- AE", emailDomains: [], siglas: [], hubspotCompanyId: "56463266574", comparteDominioConId: null };
const OTRA: FichaActual = { id: "otra", name: "Wherex", company: null, emailDomains: ["wherex.com"], siglas: [], hubspotCompanyId: null, comparteDominioConId: null };
const CEMACO: FichaActual = { id: "cem", name: "Cemaco Internacional", company: "Cemaco Internacional", emailDomains: ["cemaco.co.cr"], siglas: [], hubspotCompanyId: "59033632123", comparteDominioConId: null };

const SEP_TEC: SeparacionEnUnidades = {
  empresa: "TEC",
  principal: { clave: "TAE", id: "tec", nombre: "TEC · TAE", siglas: ["TAE"], esperaDominio: "itcr.ac.cr" },
  unidades: [{ clave: "AE", id: "ae", nombre: "TEC · AE", siglas: ["AE"], soltarEmpresaDeHubspot: "fusionada" }],
};
const SEP_CEMACO: SeparacionEnUnidades = {
  empresa: "CEMACO",
  principal: { clave: "CR", id: "cem", nombre: "Cemaco · Costa Rica", siglas: ["CR"], esperaDominio: "cemaco.co.cr" },
  unidades: [{ clave: "EC", nombre: "Cemaco · Ecuador", siglas: ["EC"], dominios: ["sukasa.com", "comohogar.com"] }],
};

const mapa = (...fs: FichaActual[]) => new Map(fs.map((f) => [f.id, f]));
const sinOtra = () => null;

function ctxDespues(sep: SeparacionEnUnidades, actuales: FichaActual[]): { ctx: CategorizeContext; grupo: CategorizeContext["clients"] } {
  const { fichas } = fichasDespues(sep, mapa(...actuales), new Map(), sinOtra);
  const clients = clientesDespues(actuales, fichas);
  const ctx: CategorizeContext = {
    clients,
    categories: [],
    hubspotCompaniesByDomain: new Map(),
    internalDomains: new Set(["smarteamcr.com"]),
    ambiguousNameTokens: computeAmbiguousNameTokens(clients),
  };
  return { ctx, grupo: entidadesDelDominio(sep.principal.id, ctx)! };
}

describe("las fichas como quedarán", () => {
  it("el TEC: la principal cambia de nombre y suma su sigla; AE comparte el dominio y suelta su empresa", () => {
    const { fichas, errores } = fichasDespues(SEP_TEC, mapa(TEC, TEC_AE, OTRA), new Map(), sinOtra);
    expect(errores).toEqual([]);
    expect(fichas.map((f) => [f.clave, f.despues.name, f.despues.siglas, f.despues.comparteDominioConId, f.despues.hubspotCompanyId])).toEqual([
      ["TAE", "TEC · TAE", ["TAE"], null, "59180429929"],
      ["AE", "TEC · AE", ["AE"], "tec", null],
    ]);
    expect(fichas.every(fichaCambia)).toBe(true);
  });

  it("CEMACO: Ecuador nace con sus dominios propios y un id provisional", () => {
    const { fichas, errores } = fichasDespues(SEP_CEMACO, mapa(CEMACO, OTRA), new Map(), sinOtra);
    expect(errores).toEqual([]);
    const ec = fichas[1]!;
    expect(ec.id).toBe(idDeUnidadNueva("EC"));
    expect(ec.antes).toBeNull();
    expect(ec.despues).toMatchObject({ name: "Cemaco · Ecuador", emailDomains: ["sukasa.com", "comohogar.com"], comparteDominioConId: "cem", hubspotCompanyId: null });
    const clients = clientesDespues([CEMACO, OTRA], fichas);
    expect(clients.map((c) => c.id)).toEqual(["cem", "otra", idDeUnidadNueva("EC")]); // la nueva, al final: es la más nueva
  });

  it("no sigue si la base no es la que la separación espera", () => {
    const sinDominio = { ...TEC, emailDomains: ["tec.ac.cr"] };
    expect(fichasDespues(SEP_TEC, mapa(sinDominio, TEC_AE), new Map(), sinOtra).errores[0]).toMatch(/ya no tiene el dominio itcr\.ac\.cr/);
    const ocupado = fichasDespues(SEP_CEMACO, mapa(CEMACO), new Map(), (d) => (d === "sukasa.com" ? "Sukasa vieja" : null));
    expect(ocupado.errores).toEqual(["El dominio sukasa.com de «Cemaco · Ecuador» ya es de «Sukasa vieja» (INV37)."]);
    const yaColgada = fichasDespues(SEP_TEC, mapa(TEC, TEC_AE), new Map([["tec", ["otra-unidad"]]]), sinOtra);
    expect(yaColgada.errores[0]).toMatch(/ya tiene unidades que no están en esta separación/);
  });

  it("correr dos veces no cambia nada: la ficha ya separada no se reescribe", () => {
    const { fichas } = fichasDespues(SEP_TEC, mapa(TEC, TEC_AE), new Map(), sinOtra);
    const yaSeparadas = mapa(...fichas.map((f) => ({ id: f.id, ...f.despues })));
    const otraVez = fichasDespues(SEP_TEC, yaSeparadas, new Map([["tec", ["ae"]]]), sinOtra);
    expect(otraVez.errores).toEqual([]);
    expect(otraVez.fichas.some(fichaCambia)).toBe(false);
  });
});

describe("proyectos: el título o una persona; lo demás espera confirmación", () => {
  const { ctx, grupo } = ctxDespues(SEP_TEC, [TEC, TEC_AE, OTRA]);
  const P = (id: string, name: string, clientId = "tec", esDeLaCuenta = false) => ({ id, name, clientId, esDeLaCuenta });

  it("«AE | RE-IMPLEMENTACION HUBSPOT» va a AE por el título; «TEC TAE | …» se queda; la de la cuenta, también", () => {
    const ds = destinosDeProyectos(
      [P("p-ae", "AE | RE-IMPLEMENTACION HUBSPOT"), P("p-tae", "TEC TAE | RE-IMPLEMENTACIÓN CRM"), P("p-info", "Información del cliente", "tec", true)],
      grupo,
      ctx,
      new Map(),
      new Map(),
    );
    expect(ds.map((d) => [d.id, d.a, d.por, d.confirmar])).toEqual([
      ["p-ae", "ae", "nombre", false],
      ["p-tae", "tec", "nombre", false],
      ["p-info", "tec", "de-la-cuenta", false],
    ]);
    expect(ds.some(bloquea)).toBe(false);
  });

  it("por la gente de sus reuniones: se propone, pero NO se mueve sin que una persona lo confirme", () => {
    const [d] = destinosDeProyectos([P("p-x", "RE-IMPLEMENTACIÓN")], grupo, ctx, new Map(), new Map([["p-x", ["ae", "ae", null]]]));
    expect(d).toMatchObject({ a: "ae", por: "reuniones", confirmar: true, reuniones: { ae: 2, "": 1 } });
    expect(bloquea(d!)).toBe(true);
    const [confirmado] = destinosDeProyectos([P("p-x", "RE-IMPLEMENTACIÓN")], grupo, ctx, new Map([["p-x", "ae"]]), new Map());
    expect(confirmado).toMatchObject({ a: "ae", por: "a-mano", confirmar: false });
  });

  it("con reuniones de las dos, o sin ninguna, se queda donde está (y lo dice)", () => {
    const ds = destinosDeProyectos([P("a", "Soporte"), P("b", "Otra cosa")], grupo, ctx, new Map(), new Map([["a", ["ae", "tec"]]]));
    expect(ds.map((d) => [d.a, d.por, bloquea(d)])).toEqual([
      ["tec", "reuniones-de-varias", false],
      ["tec", "sin-pista", false],
    ]);
  });
});

describe("propuestas y preventas", () => {
  const { ctx, grupo } = ctxDespues(SEP_TEC, [TEC, TEC_AE]);

  it("«AE - Smartloop» va a AE por el título y su preventa va con ella", () => {
    const bcs = destinosDePropuestas([{ id: "bc", name: "AE - Smartloop", clientId: "tec", proyectoDeLaPreventa: null, reuniones: [] }], grupo, ctx, new Map(), new Map());
    expect(bcs[0]).toMatchObject({ a: "ae", por: "nombre", confirmar: false });
    const es = destinosDePreventas(
      [{ id: "e", nombre: "preventa", clientId: "tec", projectId: null, propuestaId: "bc" }],
      new Map(),
      new Map(bcs.map((d) => [d.id, d])),
      new Map(),
    );
    expect(es[0]).toMatchObject({ a: "ae", por: "propuesta", confirmar: false });
  });

  it("una propuesta sin título que decida va con el proyecto de su preventa, y hereda si hay que confirmarlo", () => {
    const proyecto = destinosDeProyectos([{ id: "p", name: "Algo", clientId: "tec", esDeLaCuenta: false }], grupo, ctx, new Map(), new Map([["p", ["ae"]]]))[0]!;
    const [bc] = destinosDePropuestas(
      [{ id: "bc", name: "CRM + ERP", clientId: "tec", proyectoDeLaPreventa: "p", reuniones: [] }],
      grupo,
      ctx,
      new Map(),
      new Map([["p", proyecto]]),
    );
    expect(bc).toMatchObject({ a: "ae", por: "proyecto", confirmar: true });
  });
});

describe("lo que cuelga con clientId: la reunión manda", () => {
  const proyectos = [
    { id: "p-tae", clientId: "tec", esDeLaCuenta: false, esDeTrabajoActivo: true },
    { id: "p-ae", clientId: "ae", esDeLaCuenta: false, esDeTrabajoActivo: true },
  ];
  const base = {
    fichasDelGrupo: new Set(["tec", "ae"]),
    proyectoA: new Map([["p-tae", "tec"], ["p-ae", "ae"]]),
    preventaA: new Map([["e", "ae"]]),
    propuestaA: new Map<string, string>(),
    dueno: new Map<string, string | null>([["s-ae", "ae"], ["s-duda", null]]),
    proyectos,
    projectIdObligatorio: false,
  };

  it("un hecho de una reunión de AE que estaba en el proyecto de TAE va a AE y a su proyecto", () => {
    expect(destinosDeFilas([{ id: "h", clientId: "tec", projectId: "p-tae", sessionId: "s-ae" }], base)).toEqual([
      { id: "h", accion: "mover", clientId: "ae", projectId: "p-ae", por: "reunion" },
    ]);
  });

  it("sin reunión, va con su proyecto o su preventa", () => {
    expect(destinosDeFilas([{ id: "a", clientId: "tec", projectId: "p-ae" }, { id: "b", clientId: "tec", exploracionId: "e" }], base)).toEqual([
      { id: "a", accion: "mover", clientId: "ae", projectId: "p-ae", por: "proyecto" },
      { id: "b", accion: "mover", clientId: "ae", projectId: null, por: "preventa" },
    ]);
  });

  it("de una reunión por decidir: se queda (y se lista), salvo que su proyecto se mude", () => {
    expect(destinosDeFilas([{ id: "q", clientId: "tec", projectId: "p-tae", sessionId: "s-duda" }], base)).toEqual([
      { id: "q", accion: "queda", motivo: "por-decidir" },
    ]);
    expect(destinosDeFilas([{ id: "m", clientId: "tec", projectId: "p-ae", sessionId: "s-duda" }], base)).toEqual([
      { id: "m", accion: "mover", clientId: "ae", projectId: "p-ae", por: "proyecto" },
    ]);
  });

  it("una fila de afuera del grupo no se toca nunca", () => {
    expect(destinosDeFilas([{ id: "x", clientId: "otra", projectId: "p-ae", sessionId: "s-ae" }], base)).toEqual([]);
  });

  it("lo que ya está bien no aparece", () => {
    expect(destinosDeFilas([{ id: "ok", clientId: "ae", projectId: "p-ae", sessionId: "s-ae" }, { id: "cuenta", clientId: "tec" }], base)).toEqual([]);
  });
});

describe("lo que el --apply escribe de verdad (revisión del 7 nov)", () => {
  const { ctx, grupo } = ctxDespues(SEP_TEC, [TEC, TEC_AE]);

  it("lo que espera confirmación se queda donde está, con todo lo que cuelga; lo seguro se mueve", () => {
    const [porGente] = destinosDeProyectos([{ id: "p", name: "Algo", clientId: "tec", esDeLaCuenta: false }], grupo, ctx, new Map(), new Map([["p", ["ae"]]]));
    expect(destinoEfectivo(porGente!)).toBe("tec");
    expect(seMueve(porGente!)).toBe(false);
    const [porNombre] = destinosDeProyectos([{ id: "q", name: "AE | Algo", clientId: "tec", esDeLaCuenta: false }], grupo, ctx, new Map(), new Map());
    expect(destinoEfectivo(porNombre!)).toBe("ae");
    expect(seMueve(porNombre!)).toBe(true);
  });

  it("correr CEMACO dos veces no crea otra Ecuador: reconoce la que ya cuelga de la principal", () => {
    const ecuador: FichaActual = { id: "ec-real", name: "Cemaco · Ecuador", company: null, emailDomains: ["sukasa.com", "comohogar.com"], siglas: ["EC"], hubspotCompanyId: null, comparteDominioConId: "cem" };
    const cr = { ...CEMACO, name: "Cemaco · Costa Rica", siglas: ["CR"] };
    const { sep, encontradas } = conLasUnidadesYaCreadas(SEP_CEMACO, mapa(cr, ecuador), new Map([["cem", ["ec-real"]]]));
    expect(encontradas).toEqual([{ clave: "EC", id: "ec-real" }]);
    const { fichas, errores } = fichasDespues(sep, mapa(cr, ecuador), new Map([["cem", ["ec-real"]]]), sinOtra);
    expect(errores).toEqual([]);
    expect(fichas.some(fichaCambia)).toBe(false);
  });

  it("una unidad con su dominio escrito en `company` tiene dominio propio, y hay que declararlo", () => {
    const conCompany: FichaActual = { ...TEC_AE, company: "ae.tec.ac.cr" };
    const { errores } = fichasDespues(SEP_TEC, mapa(TEC, conCompany), new Map(), sinOtra);
    expect(errores[0]).toMatch(/tiene dominios propios \(ae\.tec\.ac\.cr\)/);
  });

  it("una reunión por decidir con un vínculo de una persona frena el --apply, con la unidad de su proyecto como sugerencia", () => {
    const proyectos = [
      { id: "p-cr", clientId: "cem" },
      { id: "p-ec", clientId: "ec" },
    ];
    const dueno = new Map<string, string | null>([["handoff", null], ["duda-ia", null], ["decidida", "cem"], ["excluida", null]]);
    const esperan = porDecidirConVinculoDeUnaPersona(
      dueno,
      [
        { sessionId: "handoff", projectId: "p-cr", conCandado: true, excluido: false },
        { sessionId: "duda-ia", projectId: "p-cr", conCandado: false, excluido: false },
        { sessionId: "decidida", projectId: "p-cr", conCandado: true, excluido: false },
        { sessionId: "excluida", projectId: "p-ec", conCandado: true, excluido: true },
      ],
      proyectos,
    );
    expect(esperan).toEqual([
      { sessionId: "handoff", sugerida: "cem", proyectos: ["p-cr"] },
      { sessionId: "excluida", sugerida: null, proyectos: ["p-ec"] },
    ]);
  });
});
