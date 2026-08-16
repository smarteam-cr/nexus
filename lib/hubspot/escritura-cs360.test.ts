/**
 * lib/hubspot/escritura-cs360.test.ts — LO QUE SALE HACIA EL CRM NO SE ACEPTA A CIEGAS.
 *
 * ── POR QUÉ ESTE ARCHIVO EXISTE APARTE DEL VETO DE `estado-hubspot.ts` ───────
 * Aquél decide qué se PROPONE; éste es el único lugar por donde el valor SALE del sistema. La
 * distinción importa porque entre los dos hay un endpoint HTTP: un body armado a mano —o un
 * consumidor futuro que se saltee el módulo de propuestas— no puede pasar por el primero, pero
 * sí por éste. Si la validación viviera solo del lado de la propuesta, la puerta quedaría
 * abierta y el síntoma sería un proyecto CERRADO que nadie pidió cerrar.
 *
 * Las dos escrituras que cubre son irreversibles en la práctica: `completed` pasa el proyecto a
 * inactivo (y reactivarlo no está resuelto), y una etapa de otro pipeline manda el registro a
 * una columna que en su tablero no existe — sin error de HubSpot y sin forma de verlo salvo
 * abriendo el tablero.
 */
import { describe, expect, it, vi } from "vitest";
import type { Client as HsClient } from "@hubspot/api-client";
import { actualizarEstadoProyecto, actualizarEtapaProyecto } from "./project-record";
import { PROJECT_PIPELINES, type PipelineDef } from "@/lib/projects/kind";
import { etapasProponibles } from "@/lib/projects/etapa-hubspot";

/** Un HubSpot que anota lo que le piden en vez de hacerlo. */
interface Pedido {
  method: string;
  path: string;
  body?: { properties?: Record<string, string> };
}
function hsEspia() {
  const apiRequest = vi.fn(async (_p: Pedido) => ({ ok: true, text: async () => "" }));
  return { hs: { apiRequest } as unknown as HsClient, apiRequest };
}

const CS: PipelineDef = PROJECT_PIPELINES.find((d) => d.key === "customer-success")!;
const DEV: PipelineDef = PROJECT_PIPELINES.find((d) => d.key === "development")!;

describe("⛔ el estado que CIERRA el proyecto no sale hacia HubSpot", () => {
  it("`completed` no se escribe, y NO se hace ninguna llamada", async () => {
    /* Lo que importa no es solo que tire: es que la llamada no ocurra. Un throw después del
       PATCH dejaría el proyecto cerrado igual y encima con cara de error. */
    const { hs, apiRequest } = hsEspia();
    await expect(actualizarEstadoProyecto(hs, "123", "completed")).rejects.toThrow(/completed/);
    expect(apiRequest, "se llamó a HubSpot con un estado vetado").not.toHaveBeenCalled();
  });

  it("un valor inventado tampoco", async () => {
    const { hs, apiRequest } = hsEspia();
    await expect(actualizarEstadoProyecto(hs, "123", "en_pausa")).rejects.toThrow();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("los cinco proponibles sí, y escriben `hs_status`", async () => {
    for (const v of ["on_track", "delayed", "blocked", "on_hold", "at_risk"]) {
      const { hs, apiRequest } = hsEspia();
      await actualizarEstadoProyecto(hs, "123", v);
      const arg = apiRequest.mock.calls[0][0];
      expect(arg.method, `${v}: no fue un PATCH`).toBe("PATCH");
      expect(arg.body?.properties?.hs_status).toBe(v);
    }
  });
});

describe("⛔ el id de etapa sale de la tabla del pipeline, o no sale", () => {
  it("una etapa de OTRO pipeline no se escribe", async () => {
    /* El error caro: «Handoff» existe en los tres tableros con ids distintos. */
    const { hs, apiRequest } = hsEspia();
    await expect(actualizarEtapaProyecto(hs, "123", CS, DEV.initialStageId)).rejects.toThrow();
    expect(apiRequest, "se mandó a HubSpot un id de otro tablero").not.toHaveBeenCalled();
  });

  it("una etapa TERMINAL tampoco: cerrar es otra operación", async () => {
    for (const cerrada of CS.closedStageIds) {
      const { hs, apiRequest } = hsEspia();
      await expect(actualizarEtapaProyecto(hs, "123", CS, cerrada)).rejects.toThrow();
      expect(apiRequest, `se mandó la terminal ${cerrada}`).not.toHaveBeenCalled();
    }
  });

  it("una etapa movible sí, y escribe `hs_pipeline_stage`", async () => {
    const destino = etapasProponibles(CS)[1];
    const { hs, apiRequest } = hsEspia();
    await actualizarEtapaProyecto(hs, "123", CS, destino.id);
    expect(apiRequest.mock.calls[0][0].body?.properties?.hs_pipeline_stage).toBe(destino.id);
  });
});
