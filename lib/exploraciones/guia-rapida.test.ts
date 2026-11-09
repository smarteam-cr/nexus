/**
 * lib/exploraciones/guia-rapida.test.ts — la guía en menos tiempo y los objetivos de la primera sesión (2026-11-08).
 *
 * Elías: «veo que Nexus tarda mucho haciendo la guía» (medido: unos 95 s por guía). La guía sale sin «Para profundizar»
 * (se pide al abrir cada bloque: profundizar-pedido.ts), los hallazgos van en su propia llamada en paralelo, y la fase dice
 * en qué bloque va. Y la primera sesión de una preventa trae sus tres objetivos sugeridos (objetivos-de-la-primera.ts).
 */
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { BloqueDeLaAgenda } from "./agenda";
import { faseDeLaGuiaParcial } from "./guia-pedido";
import type { GuiaDeLaSesion } from "./guia";
import {
  avisoDeProfundizar,
  bloquesPorPedir,
  conProfundizar,
  hayQueReintentar,
  laGuiaGuardada,
  propuestaConProfundizar,
  HERRAMIENTA_DE_PROFUNDIZAR,
  leerProfundizar,
  mejorDeLasDos,
  pedidoDeProfundizar,
  problemaDeProfundizar,
  type EntradaDeProfundizar,
} from "./profundizar-pedido";
import { esLaPrimeraSinAnterior, HERRAMIENTA_DE_LOS_OBJETIVOS, leerLosObjetivos, pedidoDeLosObjetivos, type EntradaDeLosObjetivos } from "./objetivos-de-la-primera";
import { leerPropuesta } from "./esquemas";

const bloque = (titulo: string, extra: Partial<BloqueDeLaAgenda> = {}): BloqueDeLaAgenda => ({
  desde: 0,
  hasta: 10,
  titulo,
  tipo: "cuerpo",
  abre: "¿Cómo dan seguimiento hoy a un prospecto?",
  guia: "Aquí exploramos el seguimiento.",
  averiguar: [{ id: "av:1", que: "Cómo se da seguimiento", preguntas: ["Cuéntame cómo das seguimiento"], sabido: "Una reunión" }],
  ...extra,
});

const entrada = (bloques: BloqueDeLaAgenda[] = [bloque("Dónde se traba el seguimiento")]): EntradaDeProfundizar => ({
  empresa: "Centauro Solutions",
  industria: "Servicios",
  marco: "venta",
  objetivo: "Entender cómo se pierde el seguimiento",
  claves: ["El resultado que buscan"],
  bloques: bloques.map((b, i) => ({ i, bloque: b })),
});

const respuesta = (name: string, input: unknown): Anthropic.Messages.Message =>
  ({ content: [{ type: "tool_use", id: "t1", name, input }] }) as unknown as Anthropic.Messages.Message;

describe("«Para profundizar» a pedido", () => {
  it("el pedido lleva el bloque como se ve (con lo que ya se sabe) y las reglas de tuteo y preguntas abiertas", () => {
    const p = pedidoDeProfundizar(entrada());
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("BLOQUE 0 · Dónde se traba el seguimiento");
    expect(cuerpo).toContain("Abre con: ¿Cómo dan seguimiento hoy a un prospecto?");
    expect(cuerpo).toContain("ya se sabe por Una reunión");
    const sistema = String(p.system);
    expect(sistema).toContain("TÚ (tuteo)");
    expect(sistema).toContain("Abiertas");
    expect(sistema).toContain("Una sola cosa por pregunta");
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_PROFUNDIZAR });
    // Una llamada chica: cuanto más bloques, un poco más de espacio.
    expect(p.max_tokens).toBeLessThan(1000);
  });

  it("solo deja las que cumplen: parte la doble, saca la que abre, la repetida, la cerrada y la de voseo", () => {
    const e = entrada();
    const l = leerProfundizar(
      respuesta(HERRAMIENTA_DE_PROFUNDIZAR, {
        bloques: [
          {
            bloque: 0,
            preguntas: [
              "¿Cómo dan seguimiento hoy a un prospecto?",
              "¿Qué pasó con el último prospecto que se enfrió, y qué hicieron después?",
              "¿Tienen un reporte de seguimiento?",
              "¿Qué querés lograr con eso?",
            ],
          },
          { bloque: 7, preguntas: ["¿De otro bloque?"] },
        ],
      }),
      e,
    );
    expect(l.porBloque).toEqual({ 0: ["¿Qué pasó con el último prospecto que se enfrió?", "¿Qué hicieron después?"] });
    expect(l.conProblema.map((c) => c.problema).sort()).toEqual(["cerrada", "voseo"]);
    expect(avisoDeProfundizar(l.conProblema)).toContain("está en voseo");
  });

  it("detecta cada problema", () => {
    expect(problemaDeProfundizar("¿Cuéntame qué pasó la última vez?")).toBeNull();
    expect(problemaDeProfundizar("¿Hay alguien a cargo?")).toBe("cerrada");
    expect(problemaDeProfundizar("¿Qué pasó? ¿Y después?")).toBe("doble");
    expect(problemaDeProfundizar("¿Cómo mides [el indicador]?")).toBe("hueco");
    expect(problemaDeProfundizar("¿Qué tenés que revisar?")).toBe("voseo");
    // El futuro tiene la forma del voseo y es tuteo.
    expect(problemaDeProfundizar("¿Qué revisarás primero?")).toBeNull();
  });

  it("del segundo intento se queda, por bloque, la lectura con más preguntas", () => {
    expect(mejorDeLasDos({ porBloque: { 0: ["a"], 1: ["b", "c"] }, conProblema: [] }, { porBloque: { 0: ["x", "y"], 1: [] }, conProblema: [] })).toEqual({ 0: ["x", "y"], 1: ["b", "c"] });
  });

  it("las guarda en los bloques que no tenían; un bloque con las suyas (aunque sean cero) no se toca", () => {
    const g = {
      en: "2026-11-08T10:00:00.000Z",
      agenda: { claves: ["x"], bloques: [bloque("A"), bloque("B", { profundizar: ["¿Ya tenía esta?"] }), bloque("C", { profundizar: [] })] },
    } as unknown as GuiaDeLaSesion;
    const nueva = conProfundizar(g, { 0: ["¿Qué pasó la última vez?", "a", "b", "c"], 1: ["¿Otra?"], 2: ["¿Otra?"] });
    expect(nueva.agenda!.bloques.map((b) => b.profundizar)).toEqual([["¿Qué pasó la última vez?", "a", "b"], ["¿Ya tenía esta?"], []]);
  });
});

describe("«Para profundizar» se guarda en ESA guía (revisión del 8 nov)", () => {
  const guia = (en: string, extra: Partial<BloqueDeLaAgenda> = {}) =>
    ({ en, agenda: { claves: ["x"], bloques: [bloque("Apertura", { tipo: "apertura" }), bloque("A", extra), bloque("Cierre", { tipo: "cierre" })] } }) as unknown as GuiaDeLaSesion;

  it("pide solo los bloques que existen y no tienen las suyas, sin repetidos", () => {
    const g = guia("e1", { profundizar: ["¿Ya está?"] });
    expect(bloquesPorPedir(g.agenda!, [0, 0, 1, 2, 9, -1, 1.5])).toEqual([0, 2]);
  });

  it("la apertura y el cierre sin preguntas no piden un segundo intento; un bloque del cuerpo sin nada, sí", () => {
    const g = guia("e1");
    const e = { bloques: g.agenda!.bloques.map((b, i) => ({ i, bloque: b })) };
    expect(hayQueReintentar({ porBloque: { 1: ["¿Qué pasó?"] }, conProblema: [] }, e)).toBe(false);
    expect(hayQueReintentar({ porBloque: { 0: ["¿Qué pasó?"] }, conProblema: [] }, e)).toBe(true);
    expect(hayQueReintentar({ porBloque: { 1: ["¿Qué pasó?"] }, conProblema: [{ pregunta: "¿Hay?", problema: "cerrada" }] }, e)).toBe(true);
  });

  it("escribe en las dos copias de la guía (la de la sesión y la general) y en ninguna otra", () => {
    const p = { guia: guia("e1"), guias: { "s-1": guia("e1"), "s-2": guia("e2") }, otra: 1 };
    const nueva = propuestaConProfundizar(p, "s-1", "e1", { 1: ["¿Qué pasó la última vez?"] })!;
    expect(nueva.guias["s-1"].agenda!.bloques[1].profundizar).toEqual(["¿Qué pasó la última vez?"]);
    expect(nueva.guia!.agenda!.bloques[1].profundizar).toEqual(["¿Qué pasó la última vez?"]);
    expect(nueva.guias["s-2"].agenda!.bloques[1].profundizar).toBeUndefined();
    expect(nueva.otra).toBe(1);
  });

  it("si esa guía ya no está (se armó otra), no escribe nada", () => {
    const p = { guia: guia("e2"), guias: { "s-1": guia("e2") } };
    expect(propuestaConProfundizar(p, "s-1", "e1", { 1: ["¿Qué pasó?"] })).toBeNull();
    expect(laGuiaGuardada(p, "s-1", "e2")?.en).toBe("e2");
    // Sin sesión, la general.
    expect(laGuiaGuardada(p, null, "e2")?.en).toBe("e2");
  });
});

describe("la fase mientras se escribe la guía", () => {
  it("dice en qué bloque va con su título, desde el JSON a medias", () => {
    expect(faseDeLaGuiaParcial(undefined)).toBeNull();
    expect(faseDeLaGuiaParcial({})).toBeNull();
    expect(faseDeLaGuiaParcial({ objetivo: "Entender" })).toBe("Escribiendo el objetivo y lo que hay que tener claro…");
    expect(faseDeLaGuiaParcial({ objetivo: "x", bloques: [{ titulo: "Apertura" }, {}] })).toBe("Escribiendo el bloque 2 de la agenda…");
    expect(faseDeLaGuiaParcial({ bloques: [{ titulo: "Apertura" }, { titulo: "Cuánto cuesta el desorden" }] })).toBe("Escribiendo el bloque 2 de la agenda: «Cuánto cuesta el desorden»…");
    const largo = faseDeLaGuiaParcial({ bloques: [{ titulo: "x".repeat(120) }] })!;
    expect(largo.length).toBeLessThan(130);
  });
});

describe("los objetivos de la primera sesión", () => {
  const e: EntradaDeLosObjetivos = {
    empresa: "Centauro Solutions",
    industria: "Servicios",
    marco: "venta",
    objetivoDeLaExploracion: "Entender el negocio",
    ficha: { desafio: "Pierden prospectos por falta de seguimiento", resultado: null },
    suIndustria: "Mucha competencia en precio",
    piezas: [{ de: "Cómo llegó", texto: "Llenó el formulario de contacto" }],
    porAveriguar: ["Presupuesto"],
  };

  it("el pedido usa lo que hay de la empresa, marca la industria como hipótesis y pide enfoques distintos en tuteo", () => {
    const p = pedidoDeLosObjetivos(e);
    const cuerpo = String(p.messages[0].content);
    expect(cuerpo).toContain("SU DESAFÍO PRINCIPAL (la ficha de la empresa)");
    expect(cuerpo).toContain("=== CÓMO LLEGÓ ===\nLlenó el formulario de contacto");
    expect(cuerpo).toContain("NO lo dijo el cliente");
    expect(cuerpo).toContain("- Presupuesto");
    expect(String(p.system)).toContain("ENFOQUE DISTINTO");
    expect(String(p.system)).toContain("tuteo");
    expect(String(p.system)).toContain("PRIMERA sesión");
    expect(p.tool_choice).toEqual({ type: "tool", name: HERRAMIENTA_DE_LOS_OBJETIVOS });
  });

  it("en un proyecto no pide saber quién decide", () => {
    expect(String(pedidoDeLosObjetivos({ ...e, marco: "cs" }).system)).not.toContain("quién decide");
  });

  it("lee tres distintos, sin comillas, sin los de voseo y sin repetidos", () => {
    const r = respuesta(HERRAMIENTA_DE_LOS_OBJETIVOS, {
      objetivos: ["«Entender el negocio y a dónde quiere llegar»", "entender el negocio y a dónde quiere llegar", "Saber qué querés lograr", "Poner en números el dolor", "Recorrer su proceso", "Uno de más"],
    });
    expect(leerLosObjetivos(r)).toEqual(["Entender el negocio y a dónde quiere llegar", "Poner en números el dolor", "Recorrer su proceso"]);
    expect(leerLosObjetivos(respuesta("otra", {}))).toEqual([]);
  });

  it("la primera es la que no tiene ninguna sesión hecha antes y todavía no pasó", () => {
    const todas = [
      { clave: "s-1", hecha: true },
      { clave: "s-2", hecha: false },
    ];
    expect(esLaPrimeraSinAnterior(todas, "s-1", true)).toBe(false);
    expect(esLaPrimeraSinAnterior(todas, "s-2", false)).toBe(false);
    expect(esLaPrimeraSinAnterior([{ clave: "s-1" }], "s-1", false)).toBe(true);
    // Una que no se hizo no cuenta como anterior.
    expect(esLaPrimeraSinAnterior([{ clave: "s-1", hecha: true, noSeHizo: true }, { clave: "s-2" }], "s-2", false)).toBe(true);
    // Sin sesiones todavía: la pestaña «nueva» es la primera.
    expect(esLaPrimeraSinAnterior([], "nueva", false)).toBe(true);
  });

  it("se guardan en la propuesta y se vuelven a leer (sin ellos, la propuesta queda como estaba)", () => {
    const p = leerPropuesta({ objetivosDeLaPrimera: { en: "2026-11-08T10:00:00.000Z", objetivos: ["Entender el negocio"] } });
    expect(p.objetivosDeLaPrimera).toEqual({ en: "2026-11-08T10:00:00.000Z", objetivos: ["Entender el negocio"] });
    expect(leerPropuesta({}).objetivosDeLaPrimera).toBeUndefined();
    expect(leerPropuesta({ objetivosDeLaPrimera: { en: "x", objetivos: "no" } }).objetivosDeLaPrimera).toBeUndefined();
  });
});
