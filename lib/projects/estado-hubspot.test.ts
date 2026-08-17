/**
 * lib/projects/estado-hubspot.test.ts — QUÉ PUEDE PROPONER NEXUS SOBRE EL SEMÁFORO.
 *
 * Elías pidió que Nexus proponga el estado del proyecto y lo mande a HubSpot con un clic. Este
 * archivo fija las tres reglas que hacen que esa sugerencia sea segura de aceptar sin mirar:
 * `completed` nunca sale, un motivo desconocido no propone nada, y no se propone lo que ya está.
 */
import { describe, expect, it } from "vitest";
import {
  ESTADOS_PROPONIBLES,
  ESTADO_VETADO,
  esProponible,
  estadoSegunMotivo,
  proponerEstadoDesdeMotivo,
} from "./estado-hubspot";

describe("⛔ el estado que cierra el proyecto no se propone NUNCA", () => {
  it("`completed` está fuera de los proponibles", () => {
    /* No es un rótulo: el espejo lo lee como CIERRE, pasa el proyecto a inactivo, y reactivarlo
       no está resuelto hoy. Un cierre toca cobranza y cartera — no puede salir de un botón que
       alguien aprieta mirando una sugerencia. */
    expect(ESTADO_VETADO).toBe("completed");
    expect(ESTADOS_PROPONIBLES).not.toContain("completed");
    expect(esProponible("completed")).toBe(false);
  });

  it("los otros cinco sí", () => {
    for (const v of ["on_track", "delayed", "blocked", "on_hold", "at_risk"]) {
      expect(esProponible(v), `${v} debería ser proponible`).toBe(true);
    }
  });

  it("⛔ tampoco se propone NADA sobre un proyecto ya cerrado", () => {
    // Moverlo de `completed` es REABRIR, y tiene el mismo problema que cerrarlo.
    expect(proponerEstadoDesdeMotivo("completed", "Cliente no responde")).toBeNull();
  });
});

describe("el motivo se traduce por VALOR, no todo motivo es «bloqueado»", () => {
  /* Decisión de negocio (Elías, 2026-08-16). El campo se llama «motivo de bloqueo» pero el equipo
     lo usa como motivo de ATRASO: 29 proyectos con motivo cargado y solo 3 en estado Bloqueado. */
  it("los atrasos son atrasos", () => {
    expect(estadoSegunMotivo("Atraso por cliente")).toBe("delayed");
    expect(estadoSegunMotivo("Atraso por Smarteam")).toBe("delayed");
  });

  it("«no responde» sí bloquea", () => {
    expect(estadoSegunMotivo("Cliente no responde")).toBe("blocked");
  });

  it("una pausa pedida es una pausa, no un bloqueo", () => {
    expect(estadoSegunMotivo("Cliente pidió pausa")).toBe("on_hold");
  });

  it("tolera acentos, mayúsculas y espacios de más", () => {
    // Los labels vienen de HubSpot y se tipean a mano; una tilde no puede cambiar la conclusión.
    expect(estadoSegunMotivo("  CLIENTE PIDIO PAUSA ")).toBe("on_hold");
    expect(estadoSegunMotivo("atraso  por   cliente")).toBe("delayed");
  });

  it("⚠ un motivo que NO conocemos no propone nada", () => {
    /* La propiedad tiene SIETE valores y solo cuatro están en el código: los otros tres no
       aparecen en producción y su lista vive en HubSpot, no acá. Adivinar el estado de un valor
       que nunca vimos es exactamente el error que después alguien acepta sin mirar. */
    expect(estadoSegunMotivo("Reprogramado por vacaciones")).toBeNull();
    expect(estadoSegunMotivo("")).toBeNull();
    expect(estadoSegunMotivo(null)).toBeNull();
    expect(estadoSegunMotivo(undefined)).toBeNull();
  });
});

describe("cuándo hay algo que proponer", () => {
  it("propone cuando el estado no coincide con lo que dice el motivo", () => {
    const p = proponerEstadoDesdeMotivo("on_track", "Atraso por cliente");
    expect(p?.valor).toBe("delayed");
    expect(p?.motivo, "el aviso tiene que citar el motivo real").toContain("Atraso por cliente");
  });

  it("propone también cuando el estado está vacío", () => {
    // 24 de los 67 proyectos espejados no tienen estado. Son el caso más común.
    expect(proponerEstadoDesdeMotivo(null, "Cliente no responde")?.valor).toBe("blocked");
  });

  it("NO propone lo que ya está", () => {
    /* Un aviso que sugiere el valor actual es ruido, y el ruido enseña a apretar «descartar» sin
       leer — con lo cual la próxima sugerencia buena también se descarta. */
    expect(proponerEstadoDesdeMotivo("delayed", "Atraso por Smarteam")).toBeNull();
    expect(proponerEstadoDesdeMotivo("on_hold", "Cliente pidió pausa")).toBeNull();
  });

  it("sin motivo no hay propuesta", () => {
    expect(proponerEstadoDesdeMotivo("on_track", null)).toBeNull();
  });
});
