import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ID_DE_LA_UNIDAD_NUEVA,
  NO_SE_MUDAN_CON_EL_PROYECTO,
  SE_MUDAN_CON_EL_PROYECTO,
  ajusteDeLasFichas,
  leerFicha,
  planDeLaMudanza,
  puedeEditarUnidades,
  puedeJuntarUnidades,
  type FichaDeLaEmpresaConLlaves,
  type ReunionDeLaVista,
  type VinculoDeLaVista,
} from "./unidades";
import { PedidoDeUnidadSchema } from "./unidades-esquema";

describe("quién puede", () => {
  it("crear unidades y cambiar siglas o dominio: todo Customer Success y el Super Admin", () => {
    for (const r of ["CSE", "CSL", "SUPER_ADMIN"]) expect(puedeEditarUnidades(r)).toBe(true);
    for (const r of ["VENTAS", "ADMIN", "DEV", "MARKETING", null, undefined, ""]) expect(puedeEditarUnidades(r)).toBe(false);
  });

  it("juntar unidades: solo el Super Admin o la CSL", () => {
    expect(puedeJuntarUnidades("SUPER_ADMIN")).toBe(true);
    expect(puedeJuntarUnidades("CSL")).toBe(true);
    for (const r of ["CSE", "VENTAS", "ADMIN", "DEV", "MARKETING", null, undefined]) expect(puedeJuntarUnidades(r)).toBe(false);
  });
});

const TEC: FichaDeLaEmpresaConLlaves[] = [
  { id: "tae", nombre: "TEC · TAE", siglas: ["TAE"], dominios: ["itcr.ac.cr", "tec.ac.cr"], principal: true },
  { id: "ae", nombre: "TEC · AE", siglas: ["AE"], dominios: [], principal: false },
];
const nadieAfuera = () => null;

describe("leerFicha", () => {
  it("limpia las siglas y los dominios como los guarda la ficha", () => {
    const r = leerFicha({ nombre: "TEC · VIE", siglas: [" vie ", "VIE", ""], dominios: ["@Vie.ITCR.ac.cr "] }, { empresa: TEC, esta: null, dominioDeOtra: nadieAfuera });
    expect(r).toEqual({ ok: true, nombre: "TEC · VIE", siglas: ["VIE"], dominios: ["vie.itcr.ac.cr"] });
  });

  it("no deja repetir la sigla de otra unidad de la empresa", () => {
    const r = leerFicha({ nombre: "TEC · Otra", siglas: ["ae"], dominios: [] }, { empresa: TEC, esta: null, dominioDeOtra: nadieAfuera });
    expect(r).toEqual({ ok: false, error: "La sigla AE ya es de «TEC · AE»." });
  });

  it("una unidad no se queda con el dominio de la principal: ese lo comparte", () => {
    const r = leerFicha({ siglas: ["AE"], dominios: ["itcr.ac.cr"] }, { empresa: TEC, esta: "ae", dominioDeOtra: nadieAfuera });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/es el dominio de «TEC · TAE»/);
  });

  it("un dominio de una ficha de otra empresa no vale (INV37)", () => {
    const r = leerFicha({ siglas: ["AE"], dominios: ["wherex.com"] }, { empresa: TEC, esta: "ae", dominioDeOtra: (d) => (d === "wherex.com" ? "Wherex" : null) });
    expect(!r.ok && r.error).toBe("wherex.com ya es el dominio de «Wherex», que no es de esta empresa.");
  });

  it("una unidad sin siglas ni dominio propio no recibiría ninguna reunión", () => {
    const r = leerFicha({ siglas: [], dominios: [] }, { empresa: TEC, esta: "ae", dominioDeOtra: nadieAfuera });
    expect(!r.ok && r.error).toMatch(/al menos una sigla o un dominio propio/);
  });

  it("la principal con unidades se queda con al menos un dominio", () => {
    const r = leerFicha({ siglas: ["TAE"], dominios: [] }, { empresa: TEC, esta: "tae", dominioDeOtra: nadieAfuera });
    expect(!r.ok && r.error).toMatch(/al menos un dominio/);
    expect(leerFicha({ siglas: [], dominios: ["itcr.ac.cr"] }, { empresa: TEC, esta: "tae", dominioDeOtra: nadieAfuera }).ok).toBe(true);
  });

  it("la unidad nueva necesita un nombre que no tenga otra ficha", () => {
    expect(leerFicha({ nombre: " ", siglas: ["X1"], dominios: [] }, { empresa: TEC, esta: null, dominioDeOtra: nadieAfuera })).toEqual({
      ok: false,
      error: "Ponle un nombre a la unidad.",
    });
    expect(leerFicha({ nombre: "tec · ae", siglas: ["X1"], dominios: [] }, { empresa: TEC, esta: null, dominioDeOtra: nadieAfuera }).ok).toBe(false);
  });

  it("una sigla de una letra no vale: matchearía cualquier título", () => {
    const r = leerFicha({ siglas: ["A"], dominios: [] }, { empresa: TEC, esta: "ae", dominioDeOtra: nadieAfuera });
    expect(!r.ok && r.error).toMatch(/al menos 2 letras/);
  });

  it("una ficha que no es de la empresa no se edita", () => {
    expect(leerFicha({ siglas: ["AE"], dominios: [] }, { empresa: TEC, esta: "otra", dominioDeOtra: nadieAfuera }).ok).toBe(false);
  });
});

describe("ajusteDeLasFichas", () => {
  const clientes = [
    { id: "tae", name: "TEC · TAE", siglas: ["TAE"], emailDomains: ["itcr.ac.cr"], comparteDominioConId: null },
    { id: "ae", name: "TEC · AE", siglas: ["AE"], emailDomains: [], comparteDominioConId: "tae" },
  ];

  it("cambia solo las siglas y los dominios de la ficha editada", () => {
    const r = ajusteDeLasFichas({ id: "ae", nombre: "TEC · AE", siglas: ["AE", "ACE"], dominios: [], principalId: "tae" })(clientes);
    expect(r).toEqual([clientes[0], { ...clientes[1], siglas: ["AE", "ACE"], emailDomains: [] }]);
  });

  it("la unidad nueva entra al final (es la más nueva) y cuelga de la principal", () => {
    const r = ajusteDeLasFichas({ nombre: "TEC · VIE", siglas: ["VIE"], dominios: [], principalId: "tae" })(clientes);
    expect(r).toHaveLength(3);
    expect(r[2]).toMatchObject({ id: ID_DE_LA_UNIDAD_NUEVA, name: "TEC · VIE", siglas: ["VIE"], comparteDominioConId: "tae", hubspotCompanyId: null });
  });
});

describe("planDeLaMudanza", () => {
  const r = (sessionId: string, de: string | null, a: string | null): ReunionDeLaVista => ({ sessionId, title: `Reunión ${sessionId}`, date: "2026-11-10", de, a });
  const v = (sessionId: string, projectId: string, o: Partial<VinculoDeLaVista> = {}): VinculoDeLaVista => ({
    sessionId,
    projectId,
    isPrimary: false,
    conCandado: false,
    elegidaPara: [],
    ...o,
  });
  const fichaDelProyecto = new Map([
    ["p-cr", "cr"],
    ["p-crm", "cr"],
    ["p-ec", "ec"],
  ]);
  const base = {
    vinculos: [] as VinculoDeLaVista[],
    fichaDelProyecto,
    pasan: new Set<string>(),
    unidad: null as string | null,
    actual: new Map<string, { title: string; resolvedClientId: string | null }>(),
    asignar: new Map<string, string>(),
    moverIgual: new Set<string>(),
  };

  it("lo que dice el resolver se mueve, y solo eso va a `aprobadas`", () => {
    const p = planDeLaMudanza({ ...base, cambian: [r("s1", "cr", "ec"), r("s2", "cr", null)] });
    expect(p.filas.map((f) => [f.sessionId, f.como, f.final])).toEqual([
      ["s1", "se-mueve", "ec"],
      ["s2", "se-mueve", null],
    ]);
    expect([...p.aprobadas]).toEqual([
      ["s1", { de: "cr", a: "ec" }],
      ["s2", { de: "cr", a: null }],
    ]);
    expect(p.listo).toBe(true);
  });

  it("una reunión elegida para un documento de su ficha se queda donde está, asignada a mano", () => {
    const vinculos = [v("s1", "p-cr", { conCandado: true, elegidaPara: ["Diagnóstico de Cemaco · Costa Rica"] })];
    const p = planDeLaMudanza({ ...base, vinculos, cambian: [r("s1", "cr", "ec")] });
    expect(p.filas[0]).toMatchObject({ como: "se-queda", final: "cr", conVinculoDeUnaPersona: true, elegidaPara: ["Diagnóstico de Cemaco · Costa Rica"] });
    expect([...p.fijar]).toEqual([["s1", "cr"]]);
    expect(p.aprobadas.size).toBe(0);
  });

  it("la persona puede dejarla ir igual, o elegirle otra ficha", () => {
    const vinculos = [v("s1", "p-cr", { conCandado: true })];
    const igual = planDeLaMudanza({ ...base, vinculos, cambian: [r("s1", "cr", "ec")], moverIgual: new Set(["s1"]) });
    expect(igual.filas[0]).toMatchObject({ como: "se-mueve", final: "ec" });
    expect(igual.fijar.size).toBe(0);
    const elegida = planDeLaMudanza({ ...base, vinculos, cambian: [r("s1", "cr", "ec")], asignar: new Map([["s1", "ec"]]) });
    expect(elegida.filas[0]).toMatchObject({ como: "asignada", final: "ec" });
    expect([...elegida.fijar]).toEqual([["s1", "ec"]]);
  });

  it("un vínculo de una persona con un proyecto de la ficha adonde va no la frena", () => {
    const p = planDeLaMudanza({ ...base, vinculos: [v("s1", "p-ec", { conCandado: true })], cambian: [r("s1", "cr", "ec")] });
    expect(p.filas[0]!.como).toBe("se-mueve");
  });

  it("quedaría por decidir con un vínculo de una persona: hay que elegir su ficha para guardar («Sales & Service Handoff | CEMACO»)", () => {
    const vinculos = [v("s1", "p-crm", { conCandado: true, isPrimary: true })];
    const sin = planDeLaMudanza({ ...base, vinculos, cambian: [r("s1", "cr", null)] });
    expect(sin.filas[0]!.como).toBe("falta-elegir");
    expect(sin.faltaElegir).toEqual(["s1"]);
    expect(sin.listo).toBe(false);
    const con = planDeLaMudanza({ ...base, vinculos, cambian: [r("s1", "cr", null)], asignar: new Map([["s1", "cr"]]) });
    expect(con.listo).toBe(true);
    expect([...con.fijar]).toEqual([["s1", "cr"]]);
  });

  describe("pasar proyectos a la unidad nueva", () => {
    const nueva = ID_DE_LA_UNIDAD_NUEVA;
    const conPase = { ...base, pasan: new Set(["p-crm"]), unidad: nueva };

    it("sin marcar no pasa ninguno: no hay nada que revisar", () => {
      const p = planDeLaMudanza({ ...base, unidad: nueva, cambian: [], vinculos: [v("s9", "p-crm", { isPrimary: true })] });
      expect(p.proyectos).toEqual([]);
      expect(p.listo).toBe(true);
    });

    it("pasa si sus reuniones van con él a la unidad", () => {
      const p = planDeLaMudanza({ ...conPase, cambian: [r("s1", "cr", nueva)], vinculos: [v("s1", "p-crm", { isPrimary: true, conCandado: true })] });
      expect(p.filas[0]!.como).toBe("se-mueve");
      expect(p.proyectos).toEqual([{ projectId: "p-crm", frenadoPor: [] }]);
      expect(p.listo).toBe(true);
    });

    it("una reunión suya, como principal, que se queda en la principal frena el pase", () => {
      const p = planDeLaMudanza({
        ...conPase,
        cambian: [],
        vinculos: [v("s2", "p-crm", { isPrimary: true })],
        actual: new Map([["s2", { title: "Kickoff CRM", resolvedClientId: "cr" }]]),
      });
      expect(p.proyectos).toEqual([{ projectId: "p-crm", frenadoPor: [{ sessionId: "s2", title: "Kickoff CRM" }] }]);
      expect(p.listo).toBe(false);
    });

    it("elegirle la unidad a esa reunión lo destraba", () => {
      const p = planDeLaMudanza({
        ...conPase,
        cambian: [r("s2", "cr", null)],
        vinculos: [v("s2", "p-crm", { isPrimary: true, conCandado: true })],
        asignar: new Map([["s2", nueva]]),
      });
      expect(p.proyectos[0]!.frenadoPor).toEqual([]);
      expect(p.listo).toBe(true);
    });

    it("un vínculo secundario que puso Nexus con una reunión que se queda se suelta, no frena", () => {
      const p = planDeLaMudanza({
        ...conPase,
        cambian: [],
        vinculos: [v("s3", "p-crm")],
        actual: new Map([["s3", { title: "Seguimiento", resolvedClientId: "cr" }]]),
      });
      expect(p.sueltan).toEqual([{ sessionId: "s3", projectId: "p-crm" }]);
      expect(p.listo).toBe(true);
    });

    it("el vínculo de una persona con el proyecto que pasa no protege a la reunión que va a la unidad", () => {
      const p = planDeLaMudanza({ ...conPase, cambian: [r("s1", "cr", nueva)], vinculos: [v("s1", "p-crm", { conCandado: true })] });
      expect(p.filas[0]!.conVinculoDeUnaPersona).toBe(false);
    });

    it("y sí protege a la que va a la unidad con un vínculo de una persona a un proyecto que se queda", () => {
      const p = planDeLaMudanza({ ...conPase, cambian: [r("s1", "cr", nueva)], vinculos: [v("s1", "p-cr", { conCandado: true })] });
      expect(p.filas[0]).toMatchObject({ como: "se-queda", final: "cr" });
    });
  });
});

describe("el pedido de la ruta", () => {
  it("los proyectos pasan al agregar, o a una unidad que ya existe (desde la empresa: lo comprueba el servidor)", () => {
    expect(PedidoDeUnidadSchema.safeParse({ accion: "simular", siglas: ["AE"], dominios: [], proyectos: ["p1"] }).success).toBe(true);
    expect(PedidoDeUnidadSchema.safeParse({ accion: "simular", fichaId: "ae", siglas: ["AE"], dominios: [], proyectos: ["p1"] }).success).toBe(true);
    expect(PedidoDeUnidadSchema.safeParse({ accion: "borrar", siglas: [], dominios: [] }).success).toBe(false);
  });
});

describe("lo que pasa con un proyecto cubre el esquema", () => {
  /* Toda tabla con `clientId` y `projectId` está en una de las dos listas: si se suma una y nadie decide, un proyecto que
     pasa a una unidad dejaría sus filas en la principal, cruzando fichas. */
  const texto = readFileSync(join(process.cwd(), "prisma", "schema.prisma"), "utf8").replace(/\r/g, "");
  const conLasDos: string[] = [];
  const modelos = new Set<string>();
  for (const m of texto.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
    modelos.add(m[1]!);
    const lineas = m[2]!.split("\n").map((l) => l.trim());
    const tiene = (c: string) => lineas.some((l) => new RegExp(`^${c}\\s+String\\b`).test(l));
    if (tiene("clientId") && tiene("projectId")) conLasDos.push(m[1]!);
  }

  it("cada tabla con las dos columnas está decidida", () => {
    const decididas = new Set<string>([...SE_MUDAN_CON_EL_PROYECTO, ...Object.keys(NO_SE_MUDAN_CON_EL_PROYECTO)]);
    expect(conLasDos.filter((t) => !decididas.has(t))).toEqual([]);
  });

  it("ninguna de la lista dejó de existir o de tener las dos columnas", () => {
    expect(SE_MUDAN_CON_EL_PROYECTO.filter((t) => !conLasDos.includes(t))).toEqual([]);
    expect(Object.keys(NO_SE_MUDAN_CON_EL_PROYECTO).filter((t) => !modelos.has(t))).toEqual([]);
  });
});

describe("planDeLaMudanza › lo que sigue donde está", () => {
  it("una reunión que el resolver no mueve sale como «sigue», sin proteger ni aprobar nada", () => {
    const p = planDeLaMudanza({
      cambian: [{ sessionId: "s1", title: "Seguimiento CRM", date: "2026-11-10", de: "cr", a: "cr" }],
      vinculos: [{ sessionId: "s1", projectId: "p-crm", isPrimary: true, conCandado: true, elegidaPara: [] }],
      fichaDelProyecto: new Map([["p-crm", "cr"]]),
      pasan: new Set(["p-crm"]),
      unidad: ID_DE_LA_UNIDAD_NUEVA,
      actual: new Map(),
      asignar: new Map(),
      moverIgual: new Set(),
    });
    expect(p.filas[0]).toMatchObject({ como: "sigue", final: "cr", conVinculoDeUnaPersona: false });
    expect(p.aprobadas.size).toBe(0);
    expect(p.fijar.size).toBe(0);
    expect(p.proyectos[0]!.frenadoPor).toEqual([{ sessionId: "s1", title: "Seguimiento CRM" }]);
  });
});

describe("planDeLaMudanza › elegirle otra ficha avisa lo que pierde", () => {
  const vinculos: VinculoDeLaVista[] = [{ sessionId: "s1", projectId: "p-cr", isPrimary: false, conCandado: true, elegidaPara: ["Handoff de CRM"] }];
  const base = {
    vinculos,
    fichaDelProyecto: new Map([["p-cr", "cr"]]),
    pasan: new Set<string>(),
    unidad: null,
    actual: new Map(),
    moverIgual: new Set<string>(),
  };

  it("una «sigue» que la persona manda a la unidad dice qué documento pierde", () => {
    const p = planDeLaMudanza({
      ...base,
      cambian: [{ sessionId: "s1", title: "Seguimiento", date: "2026-11-10", de: "cr", a: "cr" }],
      asignar: new Map([["s1", "ec"]]),
    });
    expect(p.filas[0]).toMatchObject({ como: "asignada", final: "ec", pierde: ["Handoff de CRM"] });
  });

  it("dejarla en su ficha de hoy no pierde nada", () => {
    const p = planDeLaMudanza({
      ...base,
      cambian: [{ sessionId: "s1", title: "Seguimiento", date: "2026-11-10", de: "cr", a: "ec" }],
      asignar: new Map([["s1", "cr"]]),
    });
    expect(p.filas[0]!.pierde).toEqual([]);
  });

  it("una protegida que hoy no tiene ficha no se puede «dejar donde está»: hay que elegir", () => {
    const p = planDeLaMudanza({
      ...base,
      cambian: [{ sessionId: "s1", title: "Seguimiento", date: "2026-11-10", de: null, a: "ec" }],
      asignar: new Map(),
    });
    expect(p.filas[0]!.como).toBe("falta-elegir");
    expect(p.listo).toBe(false);
  });
});
