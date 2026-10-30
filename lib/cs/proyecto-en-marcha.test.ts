import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { alertaApagadaPorMarcha, alertasQueSeApagan, cuentaParaElRiesgo, frenoNuestro, marchaDelProyecto, type ProyectoParaMarcha } from "./proyecto-en-marcha";

const HOY = "2026-10-29";
const p = (o: Partial<ProyectoParaMarcha> = {}): ProyectoParaMarcha => ({
  etapaHubspot: "Diagnóstico",
  estadoHubspot: "on_track",
  motivoBloqueo: null,
  kickoffPublicado: false,
  arranqueConfirmado: null,
  ...o,
});

describe("marchaDelProyecto", () => {
  it("Kaizen: etapa «Bloqueado», sin kickoff ni fecha → sin arrancar", () => {
    const m = marchaDelProyecto(p({ etapaHubspot: "Bloqueado", estadoHubspot: null }), HOY);
    expect(m.estado).toBe("sin-arrancar");
    expect(m.porque).toMatch(/no ha arrancado/);
  });

  it("Kamalio: bloqueado porque el cliente no responde, nunca arrancó → sin arrancar (lo primero que se mira)", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Bloqueado", estadoHubspot: "blocked", motivoBloqueo: "Cliente no responde" }), HOY).estado).toBe(
      "sin-arrancar",
    );
  });

  it("en «Handoff», todavía no arrancó", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Handoff", estadoHubspot: null }), HOY).estado).toBe("sin-arrancar");
  });

  it("una etapa de trabajo dice que arrancó, aunque no haya kickoff ni fecha (kölbi en Diagnóstico)", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Diagnóstico" }), HOY).estado).toBe("en-marcha");
    expect(marchaDelProyecto(p({ etapaHubspot: "Desarrollo" }), HOY).estado).toBe("en-marcha");
  });

  it("el kickoff publicado o una fecha confirmada que ya llegó dicen que arrancó", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Handoff", kickoffPublicado: true }), HOY).estado).toBe("en-marcha");
    expect(marchaDelProyecto(p({ etapaHubspot: "Handoff", arranqueConfirmado: "2026-10-29" }), HOY).estado).toBe("en-marcha");
  });

  it("una fecha confirmada que todavía no llega no lo arranca, y lo dice", () => {
    const m = marchaDelProyecto(p({ etapaHubspot: "Handoff", arranqueConfirmado: "2026-11-05" }), HOY);
    expect(m.estado).toBe("sin-arrancar");
    expect(m.porque).toContain("arranca el 5 nov");
  });

  it("arrancó y está bloqueado por el cliente o sin motivo → detenido", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Bloqueado", kickoffPublicado: true, motivoBloqueo: "Cliente pidió pausa" }), HOY)).toEqual({
      estado: "detenido",
      porque: "está bloqueado en HubSpot (cliente pidió pausa)",
    });
    expect(marchaDelProyecto(p({ estadoHubspot: "blocked" }), HOY).estado).toBe("detenido");
  });

  it("bloqueado con el freno nuestro sigue contando: el riesgo es de Smarteam (Wherex)", () => {
    expect(
      marchaDelProyecto(p({ etapaHubspot: "Bloqueado", estadoHubspot: "delayed", kickoffPublicado: true, motivoBloqueo: "Atraso por Smarteam" }), HOY)
        .estado,
    ).toBe("en-marcha");
    expect(frenoNuestro("Proveedor")).toBe(true);
    expect(frenoNuestro("Atraso por cliente")).toBe(false);
  });

  it("⭐ el freno nuestro cuenta aunque parezca sin arrancar: la etapa «Bloqueado» borra la anterior (Hotel Alta)", () => {
    expect(marchaDelProyecto(p({ etapaHubspot: "Bloqueado", estadoHubspot: "at_risk", motivoBloqueo: "Atraso por Smarteam" }), HOY).estado).toBe("en-marcha");
    expect(marchaDelProyecto(p({ etapaHubspot: "Handoff", motivoBloqueo: "Proveedor" }), HOY).estado).toBe("en-marcha");
  });

  it("en pausa («on_hold») no es bloqueado: sigue contando", () => {
    expect(cuentaParaElRiesgo(p({ estadoHubspot: "on_hold", motivoBloqueo: "Atraso por cliente" }), HOY)).toBe(true);
  });

  it("sin etapa de HubSpot no se sabe: cuenta, salvo que el estado diga bloqueado", () => {
    expect(cuentaParaElRiesgo(p({ etapaHubspot: null, estadoHubspot: null }), HOY)).toBe(true);
    expect(cuentaParaElRiesgo(p({ etapaHubspot: null, estadoHubspot: "blocked" }), HOY)).toBe(false);
  });
});

describe("qué alertas apaga un proyecto que no está en marcha", () => {
  const apaga = (category: string, cuentaConMarcha: boolean, proyectoFuera = true) => alertaApagadaPorMarcha({ category, proyectoFuera, cuentaConMarcha });

  it("una alerta de proyecto se apaga con su proyecto", () => {
    expect(apaga("PROJECT_BLOCKED", true)).toBe(true);
    expect(apaga("STAGE_STALLED", false)).toBe(true);
  });

  it("⭐ una de la cuenta se queda si a la cuenta le queda otro proyecto en marcha", () => {
    expect(apaga("ENGAGEMENT_COLD", true)).toBe(false);
    expect(apaga("ENGAGEMENT_COLD", false)).toBe(true);
  });

  it("⭐ una queja, un aviso, el riesgo de renovación o cancelación y una oportunidad no se apagan nunca", () => {
    for (const c of ["QUEJA", "AVISO_DEL_EQUIPO", "RENEWAL_RISK", "CHURN_RISK", "EXPANSION_OPPORTUNITY"]) expect(apaga(c, false)).toBe(false);
  });

  it("⭐ el armado completo: mira TODOS los proyectos de la cuenta, no solo el de la alerta", () => {
    const estados: Record<string, "en-marcha" | "detenido"> = { detenido: "detenido", solo: "detenido", vivo: "en-marcha" };
    const proyectos = [
      { id: "detenido", clientId: "con-otro" },
      { id: "vivo", clientId: "con-otro" },
      { id: "solo", clientId: "sin-otro" },
    ];
    const alerta = (id: string, clientId: string, projectId: string, category: string) => ({ id, clientId, projectId, category });
    const r = alertasQueSeApagan(
      [
        alerta("a", "con-otro", "detenido", "ENGAGEMENT_COLD"),
        alerta("b", "sin-otro", "solo", "ENGAGEMENT_COLD"),
        alerta("c", "con-otro", "detenido", "PROJECT_BLOCKED"),
        alerta("d", "con-otro", "vivo", "PROJECT_BLOCKED"),
        alerta("e", "x", "fuera-de-cartera", "PROJECT_BLOCKED"),
      ],
      proyectos,
      (id) => estados[id],
    );
    expect(r.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("con el proyecto en marcha o sin proyecto, nada se apaga", () => {
    expect(apaga("PROJECT_BLOCKED", true, false)).toBe(false);
  });
});

describe("⛔ la regla sigue conectada donde importa", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el vigía la mira donde convergen las cuatro vías, y en el barrido y el debounce para no gastar lugares", () => {
    const src = leer("lib/cs/watchdog.ts");
    const prep = src.slice(src.indexOf("async function prepararElTriaje"), src.indexOf("export function pedidoDelVigia"));
    expect(prep).toContain("marchaDeLosProyectos([projectId]");
    const debounce = src.slice(src.indexOf("export async function runWatchdogDebounceTick"), src.indexOf("export async function runWatchdogSweep"));
    expect(debounce).toContain("marchaDeLosProyectos(");
    expect(src).toContain("if (estadoDeMarcha && estadoDeMarcha !== \"en-marcha\") continue;");
    expect(src).toContain(".then(cerrarAlertasApagadas)");
  });

  it("la cartera no muestra lo que apaga la regla, y cada proyecto lleva su lectura", () => {
    const src = leer("lib/cs/cartera.ts");
    expect(src).toContain("!alertaApagadaPorMarcha({");
    expect(src).toContain("marcha: marchaPorProyecto.get(r.projectId)");
  });
});
