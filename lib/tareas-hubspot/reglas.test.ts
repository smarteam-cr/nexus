import { describe, expect, it } from "vitest";
import {
  comparar,
  datosDeHubspot,
  diaYMinutoCR,
  estadoDeHubspot,
  leerAcordado,
  propiedadesParaHubspot,
  rotuloDeHubspot,
  textoDelCuerpo,
  valoresDeHubspot,
  venceParaHubspot,
  type ValoresSincronizados,
} from "./reglas";

const ACORDADO: ValoresSincronizados = { titulo: "Ecoquintas - Seguimiento a Luis", estado: "pendiente", vence: "2026-10-14", prioridad: "media", responsable: "apinzon@smarteamcr.com" };
const ANTES = new Date("2026-10-14T10:00:00Z");
const DESPUES = new Date("2026-10-14T12:00:00Z");

describe("de HubSpot a Nexus", () => {
  it("lee una tarea como la escribe HubSpot", () => {
    const v = valoresDeHubspot(
      { hs_task_subject: " Ecoquintas - Seguimiento a Luis ", hs_task_status: "NOT_STARTED", hs_timestamp: "2026-10-14T13:00:00Z", hs_task_priority: "NONE", hubspot_owner_id: "84937900" },
      (o) => (o === "84937900" ? "apinzon@smarteamcr.com" : null),
    );
    expect(v).toEqual(ACORDADO);
  });
  it("los estados de HubSpot que Nexus no tiene son «pendiente»", () => {
    expect(estadoDeHubspot("WAITING")).toBe("pendiente");
    expect(estadoDeHubspot("DEFERRED")).toBe("pendiente");
    expect(estadoDeHubspot("IN_PROGRESS")).toBe("en_curso");
    expect(estadoDeHubspot("COMPLETED")).toBe("hecha");
  });
  it("el vencimiento es el día de Costa Rica, y se conserva su hora al cambiarlo", () => {
    // 03:00 UTC del 15 = 21:00 del 14 en Costa Rica.
    expect(diaYMinutoCR("2026-10-15T03:00:00Z")).toEqual({ dia: "2026-10-14", minuto: 21 * 60 });
    expect(venceParaHubspot("2026-10-20", 21 * 60)).toBe("2026-10-21T03:00:00.000Z");
    expect(venceParaHubspot("2026-10-20", null)).toBe("2026-10-20T13:00:00.000Z");
  });
  it("las notas en HTML pasan a texto", () => {
    expect(textoDelCuerpo("<p>Llamar a <b>Luis</b></p><ul><li>precio</li><li>fecha</li></ul>")).toBe("Llamar a Luis\n• precio\n• fecha");
    expect(textoDelCuerpo("<p></p>")).toBeNull();
  });
  it("dice si viene de una secuencia", () => {
    expect(rotuloDeHubspot(datosDeHubspot({}, null))).toBe("HubSpot");
    expect(rotuloDeHubspot(datosDeHubspot({ hs_task_sequence_id: "55", hs_task_sequence_step_number: "2" }, null))).toBe("HubSpot · secuencia (paso 2)");
  });
});

describe("la comparación de los tres", () => {
  it("cambió solo HubSpot: se aplica en Nexus", () => {
    const r = comparar(ACORDADO, ACORDADO, { ...ACORDADO, vence: "2026-10-16" }, ANTES, DESPUES);
    expect(r.aNexus).toEqual({ vence: "2026-10-16" });
    expect(r.aHubspot).toEqual({});
    expect(r.acordado.vence).toBe("2026-10-16");
  });
  it("cambió solo Nexus: se escribe en HubSpot", () => {
    const r = comparar(ACORDADO, { ...ACORDADO, estado: "hecha" }, ACORDADO, DESPUES, ANTES);
    expect(r.aHubspot).toEqual({ estado: "hecha" });
    expect(r.aNexus).toEqual({});
    expect(r.acordado.estado).toBe("hecha");
  });
  it("cambiaron los dos: gana el último y queda como conflicto", () => {
    const nexus = { ...ACORDADO, titulo: "Llamar a Luis" };
    const hubspot = { ...ACORDADO, titulo: "Escribirle a Luis" };
    const ganaNexus = comparar(ACORDADO, nexus, hubspot, DESPUES, ANTES);
    expect(ganaNexus.aHubspot).toEqual({ titulo: "Llamar a Luis" });
    expect(ganaNexus.conflictos).toEqual([{ campo: "titulo", gano: "nexus" }]);
    const ganaHubspot = comparar(ACORDADO, nexus, hubspot, ANTES, DESPUES);
    expect(ganaHubspot.aNexus).toEqual({ titulo: "Escribirle a Luis" });
    expect(ganaHubspot.conflictos).toEqual([{ campo: "titulo", gano: "hubspot" }]);
  });
  it("los dos llegaron a lo mismo: nada que hacer", () => {
    const igual = { ...ACORDADO, estado: "hecha" as const };
    const r = comparar(ACORDADO, igual, igual, ANTES, DESPUES);
    expect(r.aNexus).toEqual({});
    expect(r.aHubspot).toEqual({});
    expect(r.conflictos).toEqual([]);
  });
  it("«Ya no se hará» no se escribe en HubSpot, pero lo que cambie allá entra", () => {
    const nexus = { ...ACORDADO, estado: null };
    expect(comparar(ACORDADO, nexus, ACORDADO, DESPUES, ANTES).aHubspot).toEqual({});
    expect(comparar(ACORDADO, nexus, { ...ACORDADO, estado: "hecha" }, ANTES, DESPUES).aNexus).toEqual({ estado: "hecha" });
  });
  it("lo acordado se lee con tolerancia", () => {
    expect(leerAcordado(ACORDADO)).toEqual(ACORDADO);
    expect(leerAcordado(null)).toBeNull();
    expect(leerAcordado({ titulo: 1 })).toBeNull();
  });
});

describe("lo que se escribe en HubSpot", () => {
  it("cada campo con su propiedad; el responsable sin usuario de HubSpot no se escribe", () => {
    const datos = datosDeHubspot({ hs_timestamp: "2026-10-14T13:00:00Z" }, null);
    const r = propiedadesParaHubspot({ estado: "hecha", vence: "2026-10-20", prioridad: "alta", responsable: "nadie@smarteamcr.com" }, datos, () => null);
    expect(r.properties).toEqual({ hs_task_status: "COMPLETED", hs_timestamp: "2026-10-20T13:00:00.000Z", hs_task_priority: "HIGH" });
    expect(r.sinOwner).toBe(true);
  });
});
