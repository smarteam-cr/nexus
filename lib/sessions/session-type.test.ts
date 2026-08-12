/**
 * lib/sessions/session-type.test.ts
 *
 * Tres de estos tests son CANDADOS, no ejercicios: congelan que unificar las listas de
 * títulos duplicadas NO cambió el comportamiento del handoff ni el del motor de etapas.
 * Sin ellos, agregar una palabra al vocabulario podría cambiar en silencio qué material
 * alimenta los handoffs de los 103 proyectos, o mover la etapa inferida de la cartera.
 * Están marcados con 🔒 y hay que leerlos antes de tocar TITLE_RULES.
 */
import { describe, expect, it } from "vitest";
import {
  SESSION_TYPES,
  SESSION_TYPE_LABEL,
  CONFIDENCE_BY_SOURCE,
  TITLE_RULES,
  HANDOFF_EXCLUDE_TITLE_KEYWORDS,
  HANDOFF_INCLUDE_TITLE_KEYWORDS,
  kickoffTitleFilters,
  titleMentionsKickoff,
  resolveSessionType,
  type SessionType,
  type SessionTypeSignals,
} from "@/lib/sessions/session-type";

// ── Ayudas ───────────────────────────────────────────────────────────────────

const INTERNOS = new Set(["ana@smarteamcr.com", "beto@smarteamcr.com", "caro@smarteamcr.com"]);
const VENTAS = new Set(["ana@smarteamcr.com"]);
const ENTREGA = new Set(["beto@smarteamcr.com", "caro@smarteamcr.com"]);

function señales(over: Partial<SessionTypeSignals> = {}): SessionTypeSignals {
  return {
    title: "",
    participants: [],
    organizerEmail: null,
    internalEmails: INTERNOS,
    salesEmails: VENTAS,
    deliveryEmails: ENTREGA,
    ...over,
  };
}

// ── Vocabulario ──────────────────────────────────────────────────────────────

describe("el vocabulario está congelado", () => {
  it("son estos ocho tipos y en este orden", () => {
    expect(SESSION_TYPES).toEqual([
      "kickoff",
      "handoff",
      "descubrimiento",
      "avance",
      "capacitacion",
      "entrega",
      "interna",
      "otra",
    ]);
  });

  it("todo tipo tiene rótulo en español", () => {
    for (const t of SESSION_TYPES) {
      expect(SESSION_TYPE_LABEL[t], `falta el rótulo de "${t}"`).toBeTruthy();
    }
  });

  it("toda fuente tiene su confianza en la tabla (la confianza NO viene del modelo)", () => {
    for (const s of ["manual", "titulo", "participantes", "minuta", "ia"] as const) {
      expect(CONFIDENCE_BY_SOURCE[s], `falta la confianza de "${s}"`).toBeTruthy();
    }
    // La IA nunca llega a "alta": es la única fuente sin un hecho verificable detrás.
    expect(CONFIDENCE_BY_SOURCE.ia).not.toBe("alta");
    expect(CONFIDENCE_BY_SOURCE.manual).toBe("confirmada");
  });
});

// ── 🔒 Los tres candados ─────────────────────────────────────────────────────

describe("🔒 unificar las listas NO cambió el handoff", () => {
  // Las dos listas literales que vivían en lib/handoff/session-relevance.ts antes de
  // unificar. Son la referencia contra la que se congela el comportamiento.
  // "revision" salió de acá en la Tanda L (2026-08-09) — pasó a `handoff: null` en
  // TITLE_RULES (sigue tipificando "avance", deja de excluir del handoff).
  const EXCLUDE_ORIGINAL = [
    "implementacion", "implementation",
    "adopcion", "adoption",
    "capacitacion", "training",
    "review",
    "retro", "retrospectiva",
    "sesion semanal", "weekly",
    "stand up", "standup",
    "qbr", "business review",
  ];
  const INCLUDE_ORIGINAL = [
    "hand off", "handoff", "hand-off",
    "traspaso",
    "kickoff", "kick-off", "kick off",
  ];

  // Se compara el CONJUNTO, no el orden, y el motivo es preciso: dentro de cada lista
  // el orden solo elige cuál palabra se cita en el motivo que se le muestra al CSE
  // ("título de entrega/CS (…)") — la decisión incluir/excluir es la misma con
  // cualquier orden, porque alcanza con que UNA palabra matchee. El orden de
  // TITLE_RULES sí importa, pero para otra cosa: decidir el TIPO de la reunión
  // ("Capacitación de implementación" es una capacitación, no un avance).
  it("la lista de exclusión tiene exactamente las mismas palabras", () => {
    expect([...HANDOFF_EXCLUDE_TITLE_KEYWORDS].sort()).toEqual([...EXCLUDE_ORIGINAL].sort());
  });

  it("la lista de inclusión tiene exactamente las mismas palabras", () => {
    expect([...HANDOFF_INCLUDE_TITLE_KEYWORDS].sort()).toEqual([...INCLUDE_ORIGINAL].sort());
  });

  it("ninguna palabra cambió de lista (excluir no se volvió incluir ni al revés)", () => {
    for (const kw of EXCLUDE_ORIGINAL) {
      expect(HANDOFF_EXCLUDE_TITLE_KEYWORDS, `«${kw}» dejó de excluir`).toContain(kw);
      expect(HANDOFF_INCLUDE_TITLE_KEYWORDS, `«${kw}» pasó a incluir`).not.toContain(kw);
    }
    for (const kw of INCLUDE_ORIGINAL) {
      expect(HANDOFF_INCLUDE_TITLE_KEYWORDS, `«${kw}» dejó de incluir`).toContain(kw);
      expect(HANDOFF_EXCLUDE_TITLE_KEYWORDS, `«${kw}» pasó a excluir`).not.toContain(kw);
    }
  });

  it("las palabras NUEVAS no se filtraron a ninguna de las dos listas", () => {
    const nuevas = TITLE_RULES.filter((r) => r.handoff === null).map((r) => r.kw);
    expect(nuevas.length, "el vocabulario nuevo existe").toBeGreaterThan(0);
    for (const kw of nuevas) {
      expect(HANDOFF_EXCLUDE_TITLE_KEYWORDS, `«${kw}» se coló en exclusión`).not.toContain(kw);
      expect(HANDOFF_INCLUDE_TITLE_KEYWORDS, `«${kw}» se coló en inclusión`).not.toContain(kw);
    }
  });
});

describe("🔒 la búsqueda de kickoff en base sigue igual", () => {
  it("son los tres filtros de siempre", () => {
    expect(kickoffTitleFilters()).toEqual([
      { title: { contains: "kickoff", mode: "insensitive" } },
      { title: { contains: "kick-off", mode: "insensitive" } },
      { title: { contains: "kick off", mode: "insensitive" } },
    ]);
  });

  it("toda palabra que va a la base es ASCII pura", () => {
    // El `contains` de Postgres ignora mayúsculas pero NO acentos: una palabra
    // acentuada devolvería cero filas y nadie se enteraría.
    for (const r of TITLE_RULES.filter((x) => x.dbFilter)) {
      expect(/^[\x20-\x7E]+$/.test(r.kw), `«${r.kw}» tiene caracteres no ASCII`).toBe(true);
    }
  });

  it("el pre-filtro barato sigue siendo amplio a propósito", () => {
    // Angostarlo dejaría de re-anclar el cronograma en títulos mixtos, que es
    // justo cuando hace falta.
    expect(titleMentionsKickoff("Review de kickoff con ACME")).toBe(true);
    expect(titleMentionsKickoff("Kick-Off | ACME")).toBe(true);
    expect(titleMentionsKickoff("Sesión semanal")).toBe(false);
  });
});

// ── La cascada ───────────────────────────────────────────────────────────────

describe("el título manda, y entrega gana sobre arranque", () => {
  it("«Review de kickoff» es un avance, no el arranque", () => {
    const r = resolveSessionType(señales({ title: "Review de kickoff con ACME" }));
    expect(r.type).toBe("avance");
    expect(r.source).toBe("titulo");
  });

  it("«Kick Off | ACME» sí es el arranque", () => {
    const r = resolveSessionType(señales({ title: "Kick Off | ACME" }));
    expect(r.type).toBe("kickoff");
    expect(r.confidence).toBe("alta");
  });

  it("los acentos no importan", () => {
    expect(resolveSessionType(señales({ title: "Capacitación Sales Hub" })).type).toBe(
      "capacitacion",
    );
  });

  it("un hit de título no lo pisa ningún escalón posterior", () => {
    const r = resolveSessionType(
      señales({
        title: "Kick Off | ACME",
        // Participantes que dirían "interna", minuta que diría "entrega", IA que
        // diría "avance": ninguno debe ganarle al título.
        participants: ["ana@smarteamcr.com", "beto@smarteamcr.com"],
        minuteSummary: "Se entregó el proyecto y se cerró.",
        aiProposal: { type: "avance", quote: "hablamos del avance" },
      }),
    );
    expect(r.type).toBe("kickoff");
    expect(r.source).toBe("titulo");
  });
});

describe("cuando el título no dice nada, habla la sala", () => {
  it("sin nadie del cliente es interna", () => {
    const r = resolveSessionType(
      señales({ title: "Sync", participants: ["ana@smarteamcr.com", "beto@smarteamcr.com"] }),
    );
    expect(r.type).toBe("interna");
    expect(r.source).toBe("participantes");
  });

  it("un solo externo ya la saca de interna", () => {
    const r = resolveSessionType(
      señales({ title: "Sync", participants: ["ana@smarteamcr.com", "cliente@acme.com"] }),
    );
    expect(r.type).not.toBe("interna");
  });

  it("Ventas sin entrega es descubrimiento", () => {
    const r = resolveSessionType(
      señales({ title: "Conversación", participants: ["ana@smarteamcr.com", "cliente@acme.com"] }),
    );
    expect(r.type).toBe("descubrimiento");
  });

  it("entrega con el cliente y sin Ventas es avance", () => {
    const r = resolveSessionType(
      señales({ title: "Conversación", participants: ["beto@smarteamcr.com", "cliente@acme.com"] }),
    );
    expect(r.type).toBe("avance");
  });

  it("🔒 Ventas + entrega + cliente con título neutro NO se decide acá", () => {
    // Esa combinación es literalmente la forma de un handoff o un kickoff. Adivinar
    // acá cambiaría qué alimenta el handoff, así que tiene que pasar de largo.
    const r = resolveSessionType(
      señales({
        title: "Conversación",
        participants: ["ana@smarteamcr.com", "beto@smarteamcr.com", "cliente@acme.com"],
      }),
    );
    expect(r.source).not.toBe("participantes");
    expect(r.trace.find((x) => x.rung === "participantes")?.type).toBeNull();
  });
});

describe("la minuta desempata, la IA es el último recurso", () => {
  it("una frase precisa de la minuta decide", () => {
    const r = resolveSessionType(
      señales({
        title: "Conversación",
        participants: ["ana@smarteamcr.com", "beto@smarteamcr.com", "cliente@acme.com"],
        minuteSummary: "Se capacitó al equipo de ventas en el uso de secuencias.",
      }),
    );
    expect(r.type).toBe("capacitacion");
    expect(r.source).toBe("minuta");
  });

  it("la propuesta de la IA entra solo si nadie más supo", () => {
    const r = resolveSessionType(
      señales({
        title: "Conversación",
        participants: ["ana@smarteamcr.com", "beto@smarteamcr.com", "cliente@acme.com"],
        aiProposal: { type: "handoff", quote: "les presento al equipo de implementación" },
      }),
    );
    expect(r.type).toBe("handoff");
    expect(r.source).toBe("ia");
    expect(r.evidence).toContain("implementación");
  });

  it("una propuesta de IA con un tipo inventado se descarta", () => {
    const r = resolveSessionType(
      señales({
        title: "Conversación",
        participants: ["ana@smarteamcr.com", "beto@smarteamcr.com", "cliente@acme.com"],
        aiProposal: { type: "reunion_magica", quote: "algo" },
      }),
    );
    expect(r.type).toBe("otra");
    expect(r.source).toBeNull();
  });
});

describe("el bloqueo humano y el caso sin señal", () => {
  it("lo que corrigió una persona gana sobre todo, incluida la IA", () => {
    const r = resolveSessionType(
      señales({
        title: "Kick Off | ACME",
        reviewedType: "interna" as SessionType,
        aiProposal: { type: "avance" },
      }),
    );
    expect(r.type).toBe("interna");
    expect(r.source).toBe("manual");
    expect(r.confidence).toBe("confirmada");
  });

  it("sin ninguna señal devuelve «otra» con fuente nula, nunca revienta", () => {
    const r = resolveSessionType(señales({ title: "" }));
    expect(r.type).toBe("otra");
    expect(r.source).toBeNull();
    expect(r.confidence).toBe("baja");
  });

  it("es determinista: las mismas señales dan el mismo resultado", () => {
    const s = señales({ title: "Capacitación Sales Hub", participants: ["cliente@acme.com"] });
    expect(resolveSessionType(s)).toEqual(resolveSessionType(s));
  });
});
