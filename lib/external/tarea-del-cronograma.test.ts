/**
 * lib/external/tarea-del-cronograma.test.ts — una tarea «por validar» no le llega al cliente.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * El cronograma externo escondía la marca «por validar» pero dejaba pasar la tarea, con su título
 * y su semana: el cliente veía como plan algo que el agente inventó y el CSE no revisó. El filtro
 * vive en `cruzaAlCliente`. Que se aplique sobre filas reales lo vigilan las pruebas de integración
 * del cronograma externo (`timeline-view.int.test.ts`) y de la ruta del servicio
 * (`lib/servicios/ruta-del-servicio.int.test.ts`); la Entrega, `fasesDeLaEntrega` en lib/delivery.
 */
import { describe, expect, it } from "vitest";
import { cruzaAlCliente } from "./tarea-del-cronograma";

describe("cruzaAlCliente", () => {
  it("una tarea confirmada cruza", () => {
    expect(cruzaAlCliente({ status: "PENDING", needsValidation: false })).toBe(true);
    expect(cruzaAlCliente({ status: "DONE", needsValidation: false })).toBe(true);
  });

  it("una tarea por validar no cruza, en ningún estado", () => {
    expect(cruzaAlCliente({ status: "PENDING", needsValidation: true })).toBe(false);
    expect(cruzaAlCliente({ status: "IN_PROGRESS", needsValidation: true })).toBe(false);
  });

  it("una tarea suspendida no cruza", () => {
    expect(cruzaAlCliente({ status: "SUSPENDED", needsValidation: false })).toBe(false);
  });

});
