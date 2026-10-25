/**
 * lib/leads/reglas.test.ts — la copia de los leads de HubSpot (B3 etapa 1): de quién es cada uno y el plan.
 */
import { describe, expect, it } from "vitest";
import { clienteDelLead, datosDelLead, huellaDelLead, planDeLeads, type LeadParaCopiar } from "./reglas";

const etapas = new Map([["qualified-stage-id", "Qualified"]]);
const datos = datosDelLead(
  { hs_lead_name: "Pablo", hs_lead_name_calculated: "Pablo Sagastume 2026-07", hs_pipeline: "lead-pipeline-id", hs_pipeline_stage: "qualified-stage-id", hs_pipeline_stage_category: "QUALIFIED", hs_lead_source: "DIRECT_TRAFFIC", hubspot_owner_id: "39744839", hs_createdate: "2026-07-29T02:07:14.262Z" },
  { etapas, correoDelDueno: (id) => (id === "39744839" ? "ventas@smarteamcr.com" : null), contactoPrincipal: "230889356592" },
);

describe("datosDelLead", () => {
  it("el nombre calculado, la etapa por su nombre, el dueño por su correo", () => {
    expect(datos).toMatchObject({
      nombre: "Pablo Sagastume 2026-07",
      etapa: "Qualified",
      etapaCategoria: "qualified",
      origen: "DIRECT_TRAFFIC",
      duenoEmail: "ventas@smarteamcr.com",
      contactoHubspotId: "230889356592",
    });
    expect(datos.creadoEnHubspot?.toISOString()).toBe("2026-07-29T02:07:14.262Z");
  });
  it("sin nombre, «Lead sin nombre»", () => {
    expect(datosDelLead({}, { etapas, correoDelDueno: () => null, contactoPrincipal: null }).nombre).toBe("Lead sin nombre");
  });
});

describe("de quién es un lead (la regla de las comunicaciones, invariante 1)", () => {
  const empresas = new Map([["e1", ["c1"]], ["e2", ["c2"]]]);
  const contactos = new Map([["k1", ["c1"]]]);
  it("por su empresa, si no por su contacto; de dos clientes, de ninguno", () => {
    expect(clienteDelLead({ empresas: ["e1"], contactos: [] }, empresas, contactos)).toMatchObject({ tipo: "uno", clientId: "c1" });
    expect(clienteDelLead({ empresas: [], contactos: ["k1"] }, empresas, contactos)).toMatchObject({ tipo: "uno", clientId: "c1", por: "contacto" });
    expect(clienteDelLead({ empresas: ["e1", "e2"], contactos: [] }, empresas, contactos).tipo).toBe("ambigua");
  });
});

describe("planDeLeads", () => {
  const l = (hubspotId: string, clientId: string): LeadParaCopiar => ({ hubspotId, clientId, datos, huella: huellaDelLead(datos) });
  it("crea, deja igual, y MUEVE la fila del lead que pasó a otro cliente (no crea otra)", () => {
    const p = planDeLeads(
      [
        { hubspotId: "1", clientId: "c1", huella: huellaDelLead(datos), vigente: true },
        { hubspotId: "2", clientId: "c1", huella: huellaDelLead(datos), vigente: true },
      ],
      [l("1", "c1"), l("2", "c2"), l("3", "c1")],
      { decididos: new Set(["1", "2", "3"]), enLaLista: new Set(["1", "2", "3"]), listaCompleta: true },
    );
    expect(p.sinCambio).toBe(1);
    expect(p.actualizar.map((a) => [a.hubspotId, a.cambioDeCliente])).toEqual([["2", true]]);
    expect(p.crear.map((c) => c.hubspotId)).toEqual(["3"]);
  });
  it("⭐ da de baja al que ya no es de un cliente o no vino en una lista completa; al ilegible no lo toca", () => {
    const existentes = ["1", "2", "3"].map((id) => ({ hubspotId: id, clientId: "c1", huella: "x", vigente: true }));
    // 1: se decidió y ya es de nadie · 2: no vino en la lista (se borró) · 3: vino, pero sus asociaciones no se leyeron.
    const p = planDeLeads(existentes, [], { decididos: new Set(["1"]), enLaLista: new Set(["1", "3"]), listaCompleta: true });
    expect(p.bajas.sort()).toEqual(["1", "2"]);
    const incompleta = planDeLeads(existentes, [], { decididos: new Set(["1"]), enLaLista: new Set(["1", "3"]), listaCompleta: false });
    expect(incompleta.bajas).toEqual(["1"]);
  });
});
