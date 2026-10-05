import { describe, expect, it } from "vitest";
import type { LifecycleSnapshot, PropietariosLeidos } from "@/lib/hubspot/portal-analyzer";
import { leerEstadoDeLaAuditoria } from "./estado";
import type { LecturaFallida } from "./lecturas";

/**
 * lib/auditoria-portal/estado.test.ts — COMPLETA O NADA.
 *
 * Una sección con una lectura fallida no se muestra con lo que sí salió: el gráfico de etapas
 * sumaría lo que falta a «sin etapa» y la asignación de propietarios inventaría un total.
 */

const etapas = (lead: number | null) => [
  { value: "lead", label: "Lead", count: lead },
  { value: "customer", label: "Cliente", count: 4 },
];

const propietarios = (cambios: Partial<PropietariosLeidos> = {}): PropietariosLeidos => ({
  owners: [{ ownerId: "1", ownerName: "Ana", contactCount: 6 }],
  unassigned: 3,
  totalAssigned: 6,
  monthlyAssignments: [{ month: "2026-09", label: "Sep 26", count: 2 }],
  monthlyCreated: [{ month: "2026-09", label: "Sep 26", count: 5 }],
  ...cambios,
});

function foto(cambios: Partial<LifecycleSnapshot> = {}, fallidas: LecturaFallida[] = []): LifecycleSnapshot {
  return {
    lifecycleStats: {
      contacts: etapas(5),
      companies: etapas(1),
      totalContacts: 10,
      totalCompanies: 6,
      totalDeals: 3,
      totalTickets: 0,
      lifecycleWorkflows: ["WF ciclo"],
    },
    ownerStats: propietarios(),
    capturedAt: "2026-10-03T00:00:00.000Z",
    lecturas: { version: 1, intentos: 40, fallidas },
    ...cambios,
  };
}

const falla = (bloque: LecturaFallida["bloque"], que = "x"): LecturaFallida => ({ bloque, que, motivo: "sin_permiso", status: 403 });

describe("leerEstadoDeLaAuditoria", () => {
  it("una corrida limpia muestra todo, incluidos los ceros que sí vinieron de HubSpot", () => {
    const e = leerEstadoDeLaAuditoria(foto());
    expect(e.conRegistroDeLecturas).toBe(true);
    expect(e.totales.tickets).toBe(0);
    expect(e.contactosPorEtapa).toHaveLength(2);
    expect(e.propietarios.estado).toBe("completo");
    expect(e.workflowsDelCicloDeVida).toEqual(["WF ciclo"]);
  });

  it("una etapa sin leer deja el gráfico de contactos fuera, no el de empresas", () => {
    const f = foto();
    f.lifecycleStats.contacts = etapas(null);
    const e = leerEstadoDeLaAuditoria(f);
    expect(e.contactosPorEtapa).toBeNull();
    expect(e.empresasPorEtapa).toHaveLength(2);
  });

  it("sin el total no hay gráfico: «sin etapa» se calcula contra el total", () => {
    const f = foto();
    f.lifecycleStats.totalContacts = null;
    expect(leerEstadoDeLaAuditoria(f).contactosPorEtapa).toBeNull();
  });

  it("si no se leyeron las etapas del portal, ningún gráfico de etapas se muestra", () => {
    const e = leerEstadoDeLaAuditoria(foto({}, [falla("etapas_del_portal")]));
    expect(e.contactosPorEtapa).toBeNull();
    expect(e.empresasPorEtapa).toBeNull();
  });

  it("workflows: «no se pudo leer» (null) no es lo mismo que «no hay» ([])", () => {
    const sinLeer = foto();
    sinLeer.lifecycleStats.lifecycleWorkflows = null;
    expect(leerEstadoDeLaAuditoria(sinLeer).workflowsDelCicloDeVida).toBeNull();
    const vacio = foto();
    vacio.lifecycleStats.lifecycleWorkflows = [];
    expect(leerEstadoDeLaAuditoria(vacio).workflowsDelCicloDeVida).toEqual([]);
  });

  it("un propietario, un mes o los sin propietario sin leer dejan la sección sin leer", () => {
    for (const p of [
      propietarios({ owners: [{ ownerId: "1", ownerName: "Ana", contactCount: null }] }),
      propietarios({ unassigned: null }),
      propietarios({ monthlyCreated: [{ month: "2026-09", label: "Sep 26", count: null }] }),
    ]) {
      expect(leerEstadoDeLaAuditoria(foto({ ownerStats: p })).propietarios.estado).toBe("sin_leer");
    }
  });

  it("la lista de propietarios que falla deja `owners: []`, y aun así es «sin leer»", () => {
    const f = foto({ ownerStats: propietarios({ owners: [], totalAssigned: 0 }) }, [falla("propietarios", "La lista")]);
    expect(leerEstadoDeLaAuditoria(f).propietarios.estado).toBe("sin_leer");
  });

  it("una auditoría vieja (sin registro) se muestra como siempre, marcada", () => {
    const f = foto();
    delete f.lecturas;
    delete f.ownerStats;
    const e = leerEstadoDeLaAuditoria(f);
    expect(e.conRegistroDeLecturas).toBe(false);
    expect(e.contactosPorEtapa).toHaveLength(2);
    expect(e.propietarios.estado).toBe("no_capturado");
  });
});
