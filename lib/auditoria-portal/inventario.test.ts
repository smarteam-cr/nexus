import { describe, expect, it } from "vitest";
import {
  creadoresDePropiedades,
  dominioDe,
  dominiosConAcceso,
  leerEtapa,
  normalizarPipeline,
  propiedadesEnChoque,
  resumirWorkflow,
  sinCambiosHaceUnAnio,
} from "./inventario";
import type { PipelineLeido } from "./inventario";
import { HOY, inventarioDePrueba } from "./__fixtures__/foto";

/**
 * lib/auditoria-portal/inventario.test.ts — LA CONFIGURACIÓN DEL PORTAL, EN PALABRAS Y CRUZADA.
 */

describe("resumirWorkflow", () => {
  const crudo = {
    id: 42,
    name: "Asigna etapa",
    objectTypeId: "0-1",
    isEnabled: true,
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-02-01T00:00:00.000Z",
    enrollmentCriteria: { type: "EVENT_BASED" },
    actions: [
      { type: "SINGLE_CONNECTION", actionTypeId: "0-1" },
      { type: "SINGLE_CONNECTION", actionTypeId: "0-5", fields: { property_name: "lifecyclestage" } },
      { type: "SINGLE_CONNECTION", actionTypeId: "0-5", fields: { property_name: "lifecyclestage" } },
      { type: "LIST_BRANCH" },
      { type: "CUSTOM_CODE" },
      { type: "SINGLE_CONNECTION", actionTypeId: "1-999" },
    ],
  };

  it("dice qué hace, sin esperas ni repetidos, y qué propiedades escribe", () => {
    const w = resumirWorkflow(crudo, true);
    expect(w).toMatchObject({ id: "42", nombre: "Asigna etapa", objeto: "contactos", encendido: true });
    expect(w.detalle).toMatchObject({
      disparador: "evento",
      acciones: 6,
      ramas: 1,
      escribe: ["lifecyclestage"],
      cambiaEtapa: true,
      conCodigo: true,
      conWebhook: false,
    });
    expect(w.detalle!.queHace).toEqual(["Cambia propiedades", "Usa una app externa", "Corre código propio"]);
  });

  it("sin el detalle no inventa acciones", () => {
    expect(resumirWorkflow(crudo, false).detalle).toBeNull();
  });

  it("lo que llega de HubSpot no cae en el prototipo", () => {
    const w = resumirWorkflow({ ...crudo, objectTypeId: "constructor", enrollmentCriteria: { type: "toString" }, actions: [{ actionTypeId: "constructor" }] }, true);
    expect(w.objeto).toBe("otro");
    expect(w.detalle!.disparador).toBe("otro");
    expect(w.detalle!.queHace).toEqual(["Otra acción"]);
  });
});

describe("resumirWorkflow · qué lo dispara y a quién toca", () => {
  const w = resumirWorkflow(
    {
      id: "7",
      name: "Mueve el negocio",
      objectTypeId: "0-3",
      isEnabled: true,
      revisionId: "108",
      enrollmentCriteria: {
        type: "LIST_BASED",
        shouldReEnroll: true,
        listFilterBranch: {
          filterBranches: [{ filters: [{ property: "dealstage", operation: { values: ["st-1", "st-2"] } }, { property: "amount" }] }],
        },
        reEnrollmentTriggersFilterBranches: [{ filters: [{ property: "hs_priority" }] }],
        eventFilterBranches: [{ filters: [{ property: "hs_form_id" }] }, { filters: [{ property: "hs_page_url" }] }],
        listMembershipFilterBranches: [{}],
      },
      goalFilterBranch: { filters: [] },
      actions: [
        { actionTypeId: "0-5", fields: { property_name: "dealstage", value: { staticValue: "st-3" } } },
        { actionTypeId: "0-5", fields: { property_name: "lifecyclestage", value: { staticValue: "customer" } } },
        { actionTypeId: "0-25", fields: { source_property: "a", target_property: "copia" } },
        { actionTypeId: "0-11", fields: { user_ids: ["u1", "u2"] } },
        { actionTypeId: "0-9", fields: { user_ids: ["u3"] } },
        { actionTypeId: "0-15", fields: { flow_id: "99" } },
        { actionTypeId: "0-14", fields: { object_type_id: "0-5", properties: [{ targetProperty: "hs_pipeline_stage", value: { staticValue: "t-1" } }] } },
        { type: "WEBHOOK", webhookUrl: "https://hooks.ejemplo.test/ruta?token=secreto" },
      ],
    },
    true,
  );

  it("lee las versiones, los disparadores y si se reinscribe", () => {
    expect(w.versiones).toBe(108);
    expect(w.detalle!.disparadoPor).toEqual({ propiedades: ["dealstage", "amount", "hs_priority"], etapas: ["st-1", "st-2"], formularios: 1, eventos: 2, listas: 1 });
    expect(w.detalle!.reinscribe).toBe(true);
    expect(w.detalle!.conMeta).toBe(true);
  });

  it("lo que escribe, las etapas que pone, a quién avisa y a qué workflow pasa", () => {
    const d = w.detalle!;
    expect(d.escribe).toEqual(["dealstage", "lifecyclestage", "copia", "hubspot_owner_id"]);
    expect(d.poneEtapas).toEqual(["st-3", "t-1"]);
    expect(d.poneCicloDeVida).toEqual(["customer"]);
    expect(d.rotaEntre).toEqual(["u1", "u2"]);
    expect(d.avisaA).toEqual(["u3"]);
    expect(d.pasaA).toEqual(["99"]);
    expect(d.creaObjetos).toEqual(["tickets"]);
  });

  it("del webhook guarda solo el dominio, nunca la ruta ni el token", () => {
    expect(w.detalle!.webhookDominios).toEqual(["hooks.ejemplo.test"]);
    expect(JSON.stringify(w)).not.toContain("secreto");
  });
});

describe("etapas de pipeline", () => {
  it("leerEtapa: probabilidad en porcentaje y si cierra (negocio o ticket)", () => {
    expect(leerEtapa({ id: "a", label: "Propuesta", metadata: { probability: "0.6", isClosed: "false" } })).toEqual({ id: "a", nombre: "Propuesta", probabilidad: 60, cerrada: false, registros: null });
    expect(leerEtapa({ id: "b", label: "Ganado", metadata: { probability: "1.0", isClosed: "true" } }).cerrada).toBe(true);
    expect(leerEtapa({ id: "c", label: "Cerrado", metadata: { ticketState: "CLOSED" } })).toMatchObject({ probabilidad: null, cerrada: true });
  });

  it("una foto de antes guardaba las etapas como nombres: se leen sin inventar nada", () => {
    const viejo = { objeto: "negocios", id: "p", nombre: "Ventas", etapas: ["Nuevo", "Ganado"], registros: 3 } as unknown as PipelineLeido;
    expect(normalizarPipeline(viejo).etapas).toEqual([
      { id: "", nombre: "Nuevo", probabilidad: null, cerrada: false, registros: null },
      { id: "", nombre: "Ganado", probabilidad: null, cerrada: false, registros: null },
    ]);
  });
});

describe("cruces", () => {
  const inv = inventarioDePrueba();

  it("una propiedad que escriben dos workflows encendidos está en choque; uno apagado no cuenta", () => {
    expect(propiedadesEnChoque(inv.workflows!)).toEqual([{ propiedad: "hs_lead_status", workflows: ["w1", "w2"] }]);
    const apagado = inv.workflows!.map((w) => (w.id === "w2" ? { ...w, encendido: false } : w));
    expect(propiedadesEnChoque(apagado)).toEqual([]);
  });

  it("quién creó las propiedades: activo, ya no está o sin registro", () => {
    const c = creadoresDePropiedades(inv.propiedades!.propias, inv.personas);
    expect(c).toMatchObject({ conCreador: 3, sinCreador: 1, deQuienesYaNoEstan: 2 });
    expect(c.porPersona[0]).toMatchObject({ nombre: "Persona que se fue", activo: false, propiedades: 2 });
  });

  it("un creador que no está en la lista de usuarios cuenta como que ya no está", () => {
    const c = creadoresDePropiedades([{ ...inv.propiedades!.propias[0]!, creadorId: "u-borrado" }], inv.personas);
    expect(c.deQuienesYaNoEstan).toBe(1);
    expect(c.porPersona[0]!.nombre).toMatch(/u-borrado/);
  });

  it("dominios con acceso: activos, Super Admin y los que ya no están", () => {
    expect(dominiosConAcceso(inv.personas!)).toEqual([
      { dominio: "agencia.test", activos: 1, superAdmins: 0, inactivos: 1 },
      { dominio: "cliente.test", activos: 1, superAdmins: 1, inactivos: 0 },
    ]);
  });

  it("guarda el dominio del correo, nunca el correo", () => {
    expect(dominioDe("alguien@Cliente.Test")).toBe("cliente.test");
    expect(dominioDe("sin-arroba")).toBeNull();
    expect(dominioDe(undefined)).toBeNull();
  });

  it("sin cambios hace un año, contado desde hoy", () => {
    const [w1, w2, w3] = inv.workflows!;
    expect(sinCambiosHaceUnAnio(w1!, HOY)).toBe(true);
    expect(sinCambiosHaceUnAnio(w2!, HOY)).toBe(false);
    expect(sinCambiosHaceUnAnio(w3!, HOY)).toBe(true);
    expect(sinCambiosHaceUnAnio({ ...w1!, cambiadoEn: null }, HOY)).toBe(false);
  });
});
