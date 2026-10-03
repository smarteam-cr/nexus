/**
 * lib/sessions/compromisos-y-alcance.test.ts — compromisos con fecha y pedidos fuera de alcance.
 *
 * Los casos salen de la validación del 2026-10-02 con 14 sesiones reales (Spectrum, RC, CAV, Judesur,
 * Almotec). Correr: `npx vitest run lib/sessions/compromisos-y-alcance.test.ts --project unit`.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  ADENDA_COMPROMISOS_Y_ALCANCE,
  fechaComprometida,
  fechaLocalDeLaReunion,
  leerCompromisos,
  leerPedidosFueraDeAlcance,
} from "./compromisos-y-alcance";

describe("los compromisos con fecha", () => {
  it("caso Spectrum: el compromiso del CLIENTE se lee con su responsable y su fecha", () => {
    const [c] = leerCompromisos([
      { quien: "CLIENTE", responsable: "Rodrigo", que: "Entregar la base de datos de clientes", fecha: "2026-10-07", tipo: "INSUMO", cita: "a más tardar el miércoles" },
    ]);
    expect(c).toMatchObject({ quien: "CLIENTE", responsable: "Rodrigo", fecha: "2026-10-07", tipo: "INSUMO" });
  });

  it("una fecha mal escrita queda null, no se inventa", () => {
    const [c] = leerCompromisos([{ quien: "SMARTEAM", que: "Mandar la propuesta", fecha: "el viernes" }]);
    expect(c.fecha).toBeNull();
    expect(c.tipo).toBe("ACCION");
  });

  it("sin qué, no hay compromiso", () => {
    expect(leerCompromisos([{ quien: "CLIENTE", fecha: "2026-10-07" }])).toEqual([]);
  });

  it("la fecha comprometida se guarda al mediodía UTC: ninguna zona horaria la corre de día", () => {
    expect(fechaComprometida("2026-10-07")?.toISOString()).toBe("2026-10-07T12:00:00.000Z");
    expect(fechaComprometida(null)).toBeNull();
  });

  it("la fecha de la reunión va en hora de Costa Rica: las 18:00 del jueves no es viernes", () => {
    // 2026-10-01 18:00 en Costa Rica = 2026-10-02 00:00 UTC.
    expect(fechaLocalDeLaReunion(new Date("2026-10-02T00:00:00.000Z"))).toBe("2026-10-01");
  });
});

describe("los pedidos fuera de alcance", () => {
  it("caso RC: DocuSign descartado por costo es un pedido DESCARTADO, con su huella estable", () => {
    const [p] = leerPedidosFueraDeAlcance([
      { huella: "Integración DocuSign", pedido: "Integrar DocuSign", estado: "DESCARTADO", monto: "USD 4.000", cita: "no estaba en el alcance" },
    ]);
    expect(p).toMatchObject({ huella: "integracion-docusign", estado: "DESCARTADO", monto: "USD 4.000" });
  });

  it("sin huella, se deriva del pedido; un estado desconocido queda PEDIDO", () => {
    const [p] = leerPedidosFueraDeAlcance([{ pedido: "Replicar los SMS desde Marketing Cloud", estado: "quizás" }]);
    expect(p.huella).toBe("replicar-los-sms-desde-marketing-cloud");
    expect(p.estado).toBe("PEDIDO");
  });

  it("la adenda pide las dos listas y deja claro que una decisión de alcance no es un atraso", () => {
    expect(ADENDA_COMPROMISOS_Y_ALCANCE).toContain('"compromisos"');
    expect(ADENDA_COMPROMISOS_Y_ALCANCE).toContain('"fueraDeAlcance"');
    expect(ADENDA_COMPROMISOS_Y_ALCANCE).toContain("nunca es un atraso");
  });
});

describe("el análisis post-sesión los detecta y los guarda", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "lib/sessions/post-process.ts"), "utf8");

  it("la adenda se suma al prompt (vive en código: no depende de re-sembrar)", () => {
    expect(src).toContain("ADENDA_COMPROMISOS_Y_ALCANCE");
  });

  it("los compromisos van a ActionItem con quién se comprometió", () => {
    expect(src).toContain("leerCompromisos(parsed.compromisos)");
    expect(src).toContain("ladoResponsable: c.quien");
  });

  it("los pedidos van a PedidoFueraDeAlcance y nunca pisan una decisión del CSE", () => {
    expect(src).toContain("leerPedidosFueraDeAlcance(parsed.fueraDeAlcance)");
    expect(src).toContain("} else if (!previo.decididoAt) {");
  });

  it("la reunión se fecha en hora de Costa Rica, no en UTC", () => {
    expect(src).toContain("fechaLocalDeLaReunion(session.date)");
    expect(src).not.toContain("session.date.toISOString().slice(0, 10)");
  });
});
