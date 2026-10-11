import { describe, expect, it } from "vitest";
import { fichaVacia, origenDeLaFuente, valoresVacios, type FichaGuardada } from "@/lib/clients/ficha";
import {
  IDS_DE_ESTRATEGIA,
  ORIGEN_DEL_CUESTIONARIO,
  TOPE_DE_PREGUNTAS_DE_ESTRATEGIA,
  bloqueDeEstrategia,
  esRespuestaDelCliente,
  fuenteDelCuestionario,
  pestanasDeEstrategia,
  porQueNoEntraEnEstrategia,
  propuestaDeEstrategiaParaLaFicha,
} from "./estrategia";
import { TITULO_DEL_TIPO, esTipoDeCuestionario, preguntaParaElCliente, type Respuesta, type Respuestas } from "./tipos";

const R = (valor: string, origen: Respuesta["origen"], extra: Partial<Respuesta> = {}): Respuesta => ({
  valor,
  origen,
  actualizadoAt: "2026-10-11T12:00:00.000Z",
  ...extra,
});

describe("la plantilla de estrategia", () => {
  const [pestana] = pestanasDeEstrategia();

  it("es un tipo de cuestionario con su título", () => {
    expect(esTipoDeCuestionario("estrategia")).toBe(true);
    expect(TITULO_DEL_TIPO.estrategia).toBe("Estrategia");
  });

  it("una sola pestaña, normal, con como mucho 8 preguntas", () => {
    expect(pestanasDeEstrategia()).toHaveLength(1);
    expect(pestana.tipo).toBe("normal");
    expect(pestana.preguntas.length).toBeLessThanOrEqual(TOPE_DE_PREGUNTAS_DE_ESTRATEGIA);
    expect(pestana.preguntas.length).toBeGreaterThanOrEqual(6);
  });

  it("⛔ los ids son ESTABLES: cambiar uno deja huérfanas las respuestas y la ficha lee por id", () => {
    expect([...IDS_DE_ESTRATEGIA]).toEqual([
      "est-desafio",
      "est-resultados",
      "est-obstaculos",
      "est-intentos",
      "est-si-no",
      "est-medicion",
      "est-prioridades",
    ]);
  });

  it("pregunta por el desafío central, los resultados, los obstáculos, qué está en juego, la medición y las prioridades", () => {
    const refs = new Set(pestana.preguntas.map((p) => p.ref));
    for (const r of ["retos", "metas", "obstaculos", "consecuencias", "medicion", "prioridades"]) expect(refs.has(r)).toBe(true);
  });

  it("el cliente no ve a qué tarjeta apunta cada pregunta", () => {
    for (const q of pestana.preguntas) expect(preguntaParaElCliente(q).ref).toBeUndefined();
  });

  it("cada llamada devuelve una copia: editar una no toca la plantilla", () => {
    pestanasDeEstrategia()[0].preguntas[0].texto = "cambiada";
    expect(pestanasDeEstrategia()[0].preguntas[0].texto).not.toBe("cambiada");
  });
});

describe("⛔ lo prellenado sin confirmar no es un dato del cliente", () => {
  it("cuenta lo que escribió la persona y lo que confirmó; no lo prellenado ni lo del CSE", () => {
    expect(esRespuestaDelCliente(R("Crecer sin contratar", "cliente"))).toBe(true);
    expect(esRespuestaDelCliente(R("Crecer sin contratar", "prellenado", { confirmada: true }))).toBe(true);
    expect(esRespuestaDelCliente(R("Crecer sin contratar", "prellenado"))).toBe(false);
    expect(esRespuestaDelCliente(R("Crecer sin contratar", "cse"))).toBe(false);
    expect(esRespuestaDelCliente(R("   ", "cliente"))).toBe(false);
    expect(esRespuestaDelCliente(undefined)).toBe(false);
  });

  it("en el bloque que leen los agentes, lo prellenado sin confirmar va a lo pendiente, no como respuesta", () => {
    const [p] = pestanasDeEstrategia();
    const respuestas: Respuestas = {
      "est-desafio": R("Crecer en ventas sin sumar vendedores", "cliente"),
      "est-resultados": R("SUPOSICION-DE-NEXUS", "prellenado"),
      "est-obstaculos": R("Nadie da seguimiento a tiempo", "prellenado", { confirmada: true }),
      "est-medicion": R("Ventas por mes", "cse"),
    };
    const { bloques, pendientes } = bloqueDeEstrategia([{ quien: "Ana (gerente)", enviada: true, preguntas: p.preguntas, respuestas }]);
    const texto = bloques.join("\n");
    expect(texto).toContain("[Retos]");
    expect(texto).toContain("Crecer en ventas sin sumar vendedores");
    expect(texto).toContain("[Obstáculos]");
    expect(texto).toContain("CONFIRMÓ");
    expect(texto).toContain("cargado por el CSE");
    expect(texto).not.toContain("SUPOSICION-DE-NEXUS");
    expect(pendientes.some((x) => x.includes("no la confirmó"))).toBe(true);
    // La opcional («qué intentaron») no queda como pendiente.
    expect(pendientes.some((x) => x.includes("han intentado"))).toBe(false);
  });

  it("sin nada contestado no hay bloque, solo pendientes", () => {
    const [p] = pestanasDeEstrategia();
    const r = bloqueDeEstrategia([{ quien: "Luis", enviada: false, preguntas: p.preguntas, respuestas: {} }]);
    expect(r.bloques).toEqual([]);
    expect(r.pendientes.length).toBe(p.preguntas.filter((q) => !q.opcional).length);
  });
});

describe("a la ficha: solo los retos estratégicos, solo lo confirmado", () => {
  const ficha = (retos = ""): FichaGuardada => ({ ...fichaVacia(), valores: { ...valoresVacios(), retosEstrategicos: retos } });

  it("propone «Retos estratégicos» con el desafío, el obstáculo y las prioridades, con su fuente", () => {
    const r = propuestaDeEstrategiaParaLaFicha(
      ficha(),
      {
        "est-desafio": R("Crecer en ventas", "cliente"),
        "est-resultados": R("De 40 a 60 ventas al mes para junio", "prellenado", { confirmada: true }),
        "est-obstaculos": R("SUPOSICION", "prellenado"),
        "est-prioridades": R("Abrir Guatemala", "cliente"),
        "est-si-no": R("Perdemos la temporada", "cliente"),
      },
      "Ana",
    );
    expect(r).toHaveLength(1);
    expect(r[0].clave).toBe("retosEstrategicos");
    expect(r[0].valor).toContain("- Crecer en ventas");
    expect(r[0].valor).not.toContain("De 40 a 60 ventas al mes para junio");
    expect(r[0].valor).toContain("- Prioridad del año: Abrir Guatemala");
    expect(r[0].valor).not.toContain("SUPOSICION");
    expect(r[0].valor).not.toContain("Perdemos la temporada");
    expect(r[0].fuentes).toEqual([fuenteDelCuestionario("Ana")]);
    expect(origenDeLaFuente(r[0].fuentes[0])).toBe(ORIGEN_DEL_CUESTIONARIO);
  });

  it("nunca lleva los resultados a la ficha: ni como campo propio ni escondidos en los retos", () => {
    expect(propuestaDeEstrategiaParaLaFicha(ficha(), { "est-resultados": R("Duplicar ventas", "cliente") }, "Ana")).toEqual([]);
    expect(
      propuestaDeEstrategiaParaLaFicha(
        ficha(),
        { "est-resultados": R("De 40 a 60 ventas al mes para junio", "prellenado", { confirmada: true }) },
        "Ana",
      ),
    ).toEqual([]);
    const r = propuestaDeEstrategiaParaLaFicha(
      ficha(),
      { "est-desafio": R("Crecer en ventas", "cliente"), "est-resultados": R("Duplicar ventas", "cliente") },
      "Ana",
    );
    expect(r.map((x) => x.clave)).toEqual(["retosEstrategicos"]);
    expect(r[0].valor).not.toContain("Duplicar ventas");
    expect(r[0].valor).not.toContain("Meta:");
  });

  it("suma a lo que ya dice la ficha sin repetir", () => {
    const r = propuestaDeEstrategiaParaLaFicha(
      ficha("- Crecer en ventas"),
      { "est-desafio": R("Crecer en ventas", "cliente"), "est-obstaculos": R("Falta seguimiento", "cliente") },
      "Ana",
    );
    expect(r[0].valor).toBe("- Crecer en ventas\n- Obstáculo: Falta seguimiento");
  });

  it("si no hay nada nuevo (o solo lo prellenado sin confirmar), no propone nada", () => {
    expect(propuestaDeEstrategiaParaLaFicha(ficha("- Crecer en ventas"), { "est-desafio": R("Crecer en ventas", "cliente") }, "Ana")).toEqual([]);
    expect(propuestaDeEstrategiaParaLaFicha(ficha(), { "est-desafio": R("Crecer", "prellenado") }, "Ana")).toEqual([]);
  });
});

describe("la estructura: se editan sus preguntas, no se le agregan pestañas", () => {
  it("rechaza agregar una pestaña (de la plantilla, de etapas o en blanco) y deja pasar lo demás", () => {
    expect(porQueNoEntraEnEstrategia([{ op: "agregar_pestana" }])).toMatch(/no agregarle pestañas/);
    expect(porQueNoEntraEnEstrategia([{ op: "editar_pregunta" }, { op: "agregar_pestana" }])).not.toBeNull();
    expect(porQueNoEntraEnEstrategia([{ op: "editar_pregunta" }, { op: "agregar_pregunta" }, { op: "quitar_pregunta" }])).toBeNull();
  });
});
