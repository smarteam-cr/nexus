/**
 * lib/clients/interlocutores.test.ts — «Unidades e interlocutores» (2026-11-25): la vista por persona, el cambio que se
 * acepta y lo que la copia de cada hora no deshace.
 *
 * Correr: `npx vitest run lib/clients/interlocutores.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { armarInterlocutores, esDelGrupo, fichasQuePideAbrir, huellaDeMovidas, planDelCambio, resumirMovidas, type FilaDePersona } from "./interlocutores";
import { leerCambio } from "./interlocutores-esquema";
import { cambiosDePersona, laSostieneElEquipo, ROLES_DE_PERSONA } from "./personas-de-la-empresa";

const FICHAS = [
  { id: "tae", nombre: "TEC · TAE", principal: true },
  { id: "ae", nombre: "TEC · AE", principal: false },
];

const fila = (over: Partial<FilaDePersona> & Pick<FilaDePersona, "clientId" | "correo">): FilaDePersona => ({
  nombre: null,
  cargo: null,
  rol: null,
  origenes: ["reunion"],
  reuniones: 0,
  ultimaReunionAt: null,
  vigente: true,
  confirmadaAt: null,
  confirmadaPorEmail: null,
  ...over,
});

describe("armarInterlocutores", () => {
  const ayer = new Date("2026-11-24T12:00:00Z");
  const vista = armarInterlocutores({
    fichas: FICHAS,
    filas: [
      // La copia trae a Cindy en TAE (por el dominio); el equipo la confirma en AE.
      fila({ clientId: "tae", correo: "champion@itcr.ac.cr", nombre: "Cindy", reuniones: 40 }),
      fila({ clientId: "ae", correo: "champion@itcr.ac.cr", origenes: ["equipo"], rol: "champion", confirmadaAt: ayer, confirmadaPorEmail: "elias@x" }),
      // Sugerida por el equipo, sin confirmar.
      fila({ clientId: "ae", correo: "sugerida@itcr.ac.cr", origenes: ["equipo"] }),
      // Solo de la copia, con más reuniones que nadie: igual va al final.
      fila({ clientId: "tae", correo: "pedro@itcr.ac.cr", reuniones: 90 }),
      // Dada de baja por la copia y sin nada del equipo: no se ve.
      fila({ clientId: "tae", correo: "vieja@itcr.ac.cr", vigente: false }),
      // De otra empresa: no se ve.
      fila({ clientId: "otra", correo: "x@otra.com" }),
      fila({ clientId: "tae", correo: "jefe@itcr.ac.cr", confirmadaAt: ayer, rol: "decide" }),
    ],
    deOtras: [{ correo: "jefe@itcr.ac.cr", clientId: "fundatec", nombre: "Fundatec" }],
  });

  it("una persona por correo, con en qué ficha está confirmada, y el rol de la fila confirmada", () => {
    const cindy = vista.find((p) => p.correo === "champion@itcr.ac.cr")!;
    expect(cindy).toMatchObject({ nombre: "Cindy", rol: "champion", confirmadaEn: ["ae"], vistaEn: ["tae"], reuniones: 40, confirmadaPor: "elias@x" });
  });

  it("primero las confirmadas, después las sugeridas y al final las de la copia; sin las de baja ni las de otra empresa", () => {
    expect(vista.map((p) => p.correo)).toEqual(["champion@itcr.ac.cr", "jefe@itcr.ac.cr", "sugerida@itcr.ac.cr", "pedro@itcr.ac.cr"]);
  });

  it("confirmada también en una ficha de otra empresa = del grupo", () => {
    const marco = vista.find((p) => p.correo === "jefe@itcr.ac.cr")!;
    expect(marco.tambienEn).toEqual([{ id: "fundatec", nombre: "Fundatec" }]);
    expect(esDelGrupo(marco)).toBe(true);
    expect(esDelGrupo(vista[0]!)).toBe(false);
  });

  it("confirmada en dos unidades de la misma empresa también es del grupo", () => {
    const [p] = armarInterlocutores({
      fichas: FICHAS,
      filas: [fila({ clientId: "tae", correo: "a@itcr.ac.cr", confirmadaAt: ayer }), fila({ clientId: "ae", correo: "a@itcr.ac.cr", confirmadaAt: ayer })],
      deOtras: [],
    });
    expect(p!.confirmadaEn).toEqual(["tae", "ae"]);
    expect(esDelGrupo(p!)).toBe(true);
  });
});

describe("leerCambio", () => {
  it("acepta un cambio válido y limpia el correo", () => {
    const r = leerCambio({ correo: " Champion@ITCR.ac.cr ", rol: "champion", confirmadaEn: ["ae", "ae"], simular: true });
    expect(r).toEqual({ ok: true, simular: true, pedido: { correo: "champion@itcr.ac.cr", rol: "champion", confirmadaEn: ["ae"] } });
    expect(leerCambio({ correo: "a@b.co", otras: { sumar: ["x"] } })).toMatchObject({ ok: true, pedido: { otras: { sumar: ["x"] } } });
  });
  it("los cuatro roles, y ninguno más (los de antes ya no valen)", () => {
    expect(ROLES_DE_PERSONA).toEqual(["decide", "champion", "participa", "no-involucrado"]);
    for (const rol of ROLES_DE_PERSONA) expect(leerCambio({ correo: "a@b.co", rol }).ok).toBe(true);
    expect(leerCambio({ correo: "a@b.co", rol: "influye" }).ok).toBe(false);
    expect(leerCambio({ correo: "a@b.co", rol: null })).toMatchObject({ ok: true, pedido: { rol: null } });
  });
  it("rechaza un correo malo o fichas que no son una lista", () => {
    expect(leerCambio({ correo: "no-es-correo" })).toMatchObject({ ok: false, error: "Ese correo no es válido." });
    expect(leerCambio({ correo: "a@b.co", confirmadaEn: "ae" }).ok).toBe(false);
    expect(leerCambio(null).ok).toBe(false);
  });
});

describe("planDelCambio (qué toca un pedido y cómo queda la persona)", () => {
  const todas = () => true;
  const TEAMNET_EMPRESA = ["teamnet"];

  it("una persona del grupo entre dos empresas: quitarla aquí deja intacta la otra, sin tocarla", () => {
    const r = planDelCambio({ pedido: { correo: "laura@x.mx", confirmadaEn: [] }, empresa: TEAMNET_EMPRESA, abre: todas, antes: ["teamnet", "strato"] });
    expect(r).toMatchObject({ ok: true, tocables: ["teamnet"], despues: ["strato"], cambiaLaConfirmacion: true, cambio: { confirmadaEn: [] } });
  });

  it("agregar a alguien confirmado en otra empresa SUMA: queda del grupo, no se le quita la otra", () => {
    const r = planDelCambio({ pedido: { correo: "laura@x.mx", confirmadaEn: ["strato"] }, empresa: ["strato"], abre: (id) => id === "strato", antes: ["teamnet"] });
    expect(r).toMatchObject({ ok: true, tocables: ["strato"], despues: ["teamnet", "strato"], cambio: { confirmadaEn: ["strato"] } });
  });

  it("sumar o quitar una ficha de otra empresa pide acceso a esa ficha", () => {
    const abre = (id: string) => id !== "ajena";
    expect(planDelCambio({ pedido: { correo: "a@b.co", otras: { quitar: ["ajena"] } }, empresa: ["teamnet"], abre, antes: ["teamnet", "ajena"] })).toMatchObject({
      ok: false,
      status: 403,
    });
    const ok = planDelCambio({ pedido: { correo: "a@b.co", otras: { sumar: ["strato"] } }, empresa: ["teamnet"], abre, antes: ["teamnet", "ajena"] });
    expect(ok).toMatchObject({ ok: true, tocables: ["teamnet", "strato"], despues: ["teamnet", "ajena", "strato"], cambio: { confirmadaEn: ["teamnet", "strato"] } });
  });

  it("una unidad que quien pide no abre no se toca: lo suyo queda, y pedirla responde 403", () => {
    const abre = (id: string) => id !== "ecuador";
    const r = planDelCambio({ pedido: { correo: "a@b.co", confirmadaEn: ["cr"] }, empresa: ["cr", "ecuador"], abre, antes: ["ecuador"] });
    expect(r).toMatchObject({ ok: true, tocables: ["cr"], despues: ["ecuador", "cr"] });
    expect(planDelCambio({ pedido: { correo: "a@b.co", confirmadaEn: ["ecuador"] }, empresa: ["cr", "ecuador"], abre, antes: [] })).toMatchObject({ ok: false, status: 403 });
  });

  it("solo el rol no toca la confirmación", () => {
    const r = planDelCambio({ pedido: { correo: "a@b.co", rol: "decide" }, empresa: ["tae", "ae"], abre: todas, antes: ["ae"] });
    expect(r).toMatchObject({ ok: true, cambiaLaConfirmacion: false, cambio: { correo: "a@b.co", rol: "decide" } });
    expect(r.ok && "confirmadaEn" in r.cambio).toBe(false);
  });

  it("una ficha de otra empresa no entra por `confirmadaEn`, y una de esta no entra por `otras`", () => {
    expect(planDelCambio({ pedido: { correo: "a@b.co", confirmadaEn: ["otra"] }, empresa: ["tae"], abre: todas, antes: [] })).toMatchObject({ ok: false, status: 400 });
    expect(planDelCambio({ pedido: { correo: "a@b.co", otras: { sumar: ["tae"] } }, empresa: ["tae"], abre: todas, antes: [] })).toMatchObject({ ok: false, status: 400 });
  });
});

describe("resumirMovidas", () => {
  it("cuenta por de dónde a dónde: sin dueña hoy es «Sin ficha» (puede ser una categoría); después, «Por decidir»", () => {
    const n = (id: string) => ({ teamnet: "Teamnet", strato: "Stratosphere" })[id] ?? id;
    expect(
      resumirMovidas([{ de: "teamnet", a: "strato" }, { de: "teamnet", a: "strato" }, { de: "teamnet", a: null }, { de: null, a: "strato" }], n),
    ).toEqual([
      { de: "Teamnet", a: "Stratosphere", reuniones: 2 },
      { de: "Sin ficha", a: "Stratosphere", reuniones: 1 },
      { de: "Teamnet", a: "Por decidir", reuniones: 1 },
    ]);
  });
});

describe("fichasQuePideAbrir (a qué fichas tiene que tener acceso quien confirma)", () => {
  const sinCasa = () => false;
  const base = { movidas: [] as { de: string | null; a: string | null }[], antes: [] as string[], despues: [] as string[], delDominio: [] as string[], esLaCasa: sinCasa };
  it("cada ficha que pierde o gana una reunión de hoy", () => {
    expect(fichasQuePideAbrir({ ...base, movidas: [{ de: "teamnet", a: "strato" }, { de: null, a: "strato" }], cambiaLaConfirmacion: true })).toEqual(["teamnet", "strato"]);
  });
  it("confirmar a alguien de bravo.com sin reuniones todavía pide Bravo (sus reuniones FUTURAS)", () => {
    expect(fichasQuePideAbrir({ ...base, despues: ["alfa"], delDominio: ["bravo"], cambiaLaConfirmacion: true })).toEqual(["alfa", "bravo"]);
  });
  it("quitar a alguien «del grupo» de una ficha pide también la que queda: ahí pasa a decidir sola", () => {
    expect(fichasQuePideAbrir({ ...base, antes: ["alfa", "equis"], despues: ["alfa"], delDominio: ["bravo"], cambiaLaConfirmacion: true })).toEqual([
      "alfa",
      "equis",
      "bravo",
    ]);
  });
  it("sumarle una ficha a alguien que hoy decide por otra pide la otra, aunque su dominio no dé ninguna", () => {
    expect(fichasQuePideAbrir({ ...base, antes: ["bravo"], despues: ["bravo", "alfa"], cambiaLaConfirmacion: true })).toEqual(["bravo", "alfa"]);
  });
  it("si la confirmación no cambia (solo el rol), no pide nada", () => {
    expect(fichasQuePideAbrir({ ...base, antes: ["bravo"], despues: ["bravo"], delDominio: ["bravo"], cambiaLaConfirmacion: false })).toEqual([]);
  });
  it("nunca la casa: nadie la lleva", () => {
    expect(fichasQuePideAbrir({ ...base, movidas: [{ de: "casa", a: "alfa" }], cambiaLaConfirmacion: true, esLaCasa: (id) => id === "casa" })).toEqual(["alfa"]);
  });
});

describe("huellaDeMovidas (lo que vio la persona en el aviso)", () => {
  it("no depende del orden, sí de cada reunión, de dónde sale y adónde va", () => {
    const a = huellaDeMovidas([{ sessionId: "s1", de: "b", a: "x" }, { sessionId: "s2", de: null, a: null }]);
    expect(huellaDeMovidas([{ sessionId: "s2", de: null, a: null }, { sessionId: "s1", de: "b", a: "x" }])).toBe(a);
    expect(huellaDeMovidas([{ sessionId: "s1", de: "b", a: "x" }, { sessionId: "s2", de: null, a: "y" }])).not.toBe(a);
    expect(huellaDeMovidas([{ sessionId: "s1", de: "c", a: "x" }, { sessionId: "s2", de: null, a: null }])).not.toBe(a);
    expect(huellaDeMovidas([{ sessionId: "s1", de: "b", a: "x" }])).not.toBe(a);
    expect(huellaDeMovidas([])).toBe(huellaDeMovidas([]));
  });
});

describe("la copia de cada hora no deshace lo que dijo el equipo", () => {
  const unida = { correo: "a@b.co", nombre: null, cargo: null, contactoDeHubspotId: null, origenes: ["reunion" as const], reuniones: 3, ultimaReunionAt: null, lado: "empresa" as const };
  it("conserva el origen «equipo»", () => {
    const c = cambiosDePersona({ nombre: null, cargo: null, contactoDeHubspotId: null, origenes: ["equipo"], reuniones: 0, ultimaReunionAt: null, lado: "empresa", vigente: true }, unida);
    expect(c?.origenes).toEqual(["reunion", "equipo"]);
  });
  it("no da de baja a una confirmada ni a una sumada por el equipo", () => {
    expect(laSostieneElEquipo({ confirmadaAt: new Date(), origenes: ["reunion"] })).toBe(true);
    expect(laSostieneElEquipo({ confirmadaAt: null, origenes: ["equipo"] })).toBe(true);
    expect(laSostieneElEquipo({ confirmadaAt: null, origenes: ["hubspot"] })).toBe(false);
  });
});
