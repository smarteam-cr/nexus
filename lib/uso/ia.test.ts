import { describe, expect, it } from "vitest";
import { esDeUnaPersona, lunesEnCostaRica, numero, parteUsada, procesoDeLaLlamada, procesoDeLaPropuesta, resumirIa, usd, type LlamadaDeIA } from "./ia";

const llamada = (x: Partial<LlamadaDeIA>): LlamadaDeIA => ({
  at: new Date("2026-10-14T15:00:00Z"),
  costUsd: 0.1,
  ok: true,
  agentSlug: null,
  agentRunId: null,
  origen: null,
  triggeredByEmail: null,
  clientId: null,
  ubicada: null,
  ...x,
});

describe("procesoDeLaLlamada", () => {
  it("reconoce cada familia por su slug", () => {
    expect(procesoDeLaLlamada({ agentSlug: "agent-post-session", origen: null })).toBe("lectura");
    // La investigación de la empresa (R5, 2026-10-24) llena los datos de la ficha: va con la ficha, no a «Otros».
    expect(procesoDeLaLlamada({ agentSlug: "investigacion-de-empresa", origen: null })).toBe("ficha");
    expect(procesoDeLaLlamada({ agentSlug: "agent-timeline-progress", origen: null })).toBe("avance");
    expect(procesoDeLaLlamada({ agentSlug: "agent-timeline-detail--web", origen: null })).toBe("cronograma");
    expect(procesoDeLaLlamada({ agentSlug: "cs-watchdog", origen: null })).toBe("vigia");
    expect(procesoDeLaLlamada({ agentSlug: "agent-cs-account-brief", origen: null })).toBe("vigia");
    expect(procesoDeLaLlamada({ agentSlug: "nexus-chat", origen: null })).toBe("chat");
    expect(procesoDeLaLlamada({ agentSlug: "agent-handoff-web", origen: null })).toBe("handoff");
    expect(procesoDeLaLlamada({ agentSlug: "agent-kickoff-canvas", origen: null })).toBe("documentos");
    expect(procesoDeLaLlamada({ agentSlug: "seguimiento-hechos", origen: null })).toBe("hechos");
    expect(procesoDeLaLlamada({ agentSlug: "tareas-conversacion", origen: null })).toBe("tareas");
    expect(procesoDeLaLlamada({ agentSlug: "exploracion-de-venta", origen: null })).toBe("venta");
    expect(procesoDeLaLlamada({ agentSlug: "procesos-mapeo", origen: null })).toBe("procesos");
  });

  it("un slug desconocido va a «Otros» y sin slug no se adivina", () => {
    expect(procesoDeLaLlamada({ agentSlug: "algo-nuevo", origen: null })).toBe("otros");
    expect(procesoDeLaLlamada({ agentSlug: null, origen: null })).toBe("sin-identificar");
    expect(procesoDeLaLlamada({ agentSlug: null, origen: "reunion:abc › sessions/post-process › avance" })).toBe("avance");
  });
});

describe("esDeUnaPersona", () => {
  it("el avance que sigue a una reunión no es uso de nadie, aunque herede el correo", () => {
    expect(esDeUnaPersona({ triggeredByEmail: "a@x.com", origen: "reunion:1 › sessions/post-process › avance" })).toBe(false);
    expect(esDeUnaPersona({ triggeredByEmail: "a@x.com", origen: "timeline/progress" })).toBe(true);
    expect(esDeUnaPersona({ triggeredByEmail: null, origen: null })).toBe(false);
  });
});

describe("procesoDeLaPropuesta", () => {
  it("una tarea propuesta es de las reuniones o del chat según su origen", () => {
    expect(procesoDeLaPropuesta("tarea-propuesta", "reunion")).toBe("tareas");
    expect(procesoDeLaPropuesta("tarea-propuesta", "chat")).toBe("chat");
    expect(procesoDeLaPropuesta("alerta-del-vigia")).toBe("vigia");
    expect(procesoDeLaPropuesta("alerta-de-regla")).toBeNull();
  });
});

describe("resumirIa", () => {
  it("suma por proceso, por cliente y por semana, y no suma como cero lo que no tiene tarifa", () => {
    const r = resumirIa([
      llamada({ agentSlug: "cs-watchdog", clientId: "c1", agentRunId: "r1", costUsd: 1, ubicada: "llamada" }),
      llamada({ agentSlug: "cs-watchdog", clientId: "c1", agentRunId: "r1", costUsd: 0.5, ubicada: "corrida", ok: false }),
      llamada({ agentSlug: "nexus-chat", clientId: "c2", costUsd: 2, triggeredByEmail: "a@x.com", ubicada: "llamada" }),
      llamada({ agentSlug: null, costUsd: null }),
    ]);
    expect(r.total.costo).toBeCloseTo(3.5);
    expect(r.total.sinTarifa).toBe(1);
    expect(r.total.conError).toBe(1);
    expect(r.total.costoDePersonas).toBeCloseTo(2);
    expect(r.sinCliente.llamadas).toBe(1);
    expect(r.porProceso[0].clave).toBe("chat");
    const vigia = r.porProceso.find((p) => p.clave === "vigia")!;
    expect(vigia.corridas).toBe(1);
    expect(vigia.clientes).toBe(1);
    const c1 = r.porCliente.find((c) => c.clientId === "c1")!;
    expect(c1.porAproximacion).toBe(1);
    expect(r.semanas).toHaveLength(1);
    expect(r.semanas[0].lunes).toBe("2026-10-12");
  });
});

describe("formato y partes", () => {
  it("escribe igual en el servidor y en el navegador", () => {
    expect(numero(1100)).toBe("1.100");
    expect(usd(69)).toBe("US$69,00");
    expect(usd(0.001)).toBe("menos de US$0,01");
  });

  it("sin nada cerrado no hay porcentaje", () => {
    expect(parteUsada({ nacieron: 3, usados: 0, desestimados: 0, vencidos: 0, pendientes: 3 })).toBeNull();
    expect(parteUsada({ nacieron: 4, usados: 1, desestimados: 1, vencidos: 2, pendientes: 0 })).toBe(0.25);
  });

  it("el lunes es el de Costa Rica", () => {
    // Domingo 18 oct a las 23:00 en Costa Rica = lunes 19 a las 05:00 UTC: sigue siendo la semana del 12.
    expect(lunesEnCostaRica(new Date("2026-10-19T05:00:00Z"))).toBe("2026-10-12");
  });
});
