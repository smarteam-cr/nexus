import { describe, expect, it } from "vitest";
import { aTramo, metasDelAnio, type TramoParaSumar } from "./metas-reglas";
import { aDueno } from "@/lib/hubspot/duenos";

describe("aTramo — un tramo de meta de HubSpot", () => {
  it("lee monto, avance, fechas en ISO o milisegundos, y la moneda en mayúscula", () => {
    const t = aTramo("123", {
      hs_goal_name: "OFICIAL | META 2026 - SMARTEAM",
      hs_target_amount: "83750",
      hs_kpi_value: "40120.5",
      hs_start_datetime: "2026-01-01T06:00:00Z",
      hs_end_datetime: String(Date.parse("2026-03-31T23:59:59Z")),
      hs_goal_target_currency_code: "usd",
      hubspot_owner_id: "77",
      hs_group_correlation_uuid: "g-1",
      hs_status: "in_progress",
    });
    expect(t).toMatchObject({ hubspotGoalTargetId: "123", monto: 83750, avance: 40120.5, moneda: "USD", hubspotOwnerId: "77", hubspotGoalId: "g-1" });
    expect(t?.hasta.toISOString()).toBe("2026-03-31T23:59:59.000Z");
  });

  it("sin monto o sin fechas no es un tramo; sin avance queda en null, no en cero", () => {
    expect(aTramo("1", { hs_start_datetime: "2026-01-01", hs_end_datetime: "2026-03-31" })).toBeNull();
    expect(aTramo("2", { hs_target_amount: "10", hs_end_datetime: "2026-03-31" })).toBeNull();
    expect(aTramo("3", { hs_target_amount: "10", hs_start_datetime: "2026-01-01", hs_end_datetime: "2026-03-31", hs_kpi_value: "" })?.avance).toBeNull();
  });
});

describe("metasDelAnio — el total del año de cada persona", () => {
  const tramo = (o: Partial<TramoParaSumar>): TramoParaSumar => ({
    teamMemberId: "andres", tipo: "sales_quota", hubspotGoalId: "g", nombre: "Meta 2026", desde: new Date("2026-01-01T06:00:00Z"), monto: 83750, avance: 46000, moneda: "USD", ...o,
  });

  it("suma los cuatro trimestres y calcula el cumplimiento con el avance de HubSpot", () => {
    const r = metasDelAnio([
      tramo({}), tramo({ desde: new Date("2026-04-01T06:00:00Z"), avance: 50000 }),
      tramo({ desde: new Date("2026-07-01T06:00:00Z"), avance: 88370 }), tramo({ desde: new Date("2026-10-01T06:00:00Z"), avance: 0 }),
    ], 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ teamMemberId: "andres", monto: 335000, avance: 184370, tramos: 4 });
    expect(r[0].cumplimiento).toBeCloseTo(0.55, 2);
  });

  it("solo suma la meta de ventas: las de llamadas o leads no son dinero", () => {
    const r = metasDelAnio([tramo({}), tramo({ tipo: "calls_made", monto: 25, avance: 48 }), tramo({ tipo: "campaign_number_of_contact_lifecycle", monto: 20 })], 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ monto: 83750, avance: 46000, tramos: 1 });
  });

  it("deja fuera otros años, metas sin persona, y no mezcla monedas", () => {
    const r = metasDelAnio([
      tramo({ desde: new Date("2025-10-01T06:00:00Z") }),
      tramo({ teamMemberId: null }),
      tramo({ moneda: "CRC", monto: 1000, avance: null }),
      tramo({}),
    ], 2026);
    expect(r.map((m) => `${m.moneda}:${m.monto}`).sort()).toEqual(["CRC:1000", "USD:83750"]);
    expect(r.find((m) => m.moneda === "CRC")?.cumplimiento).toBeNull();
  });
});

describe("aDueno — un dueño de HubSpot", () => {
  it("normaliza el correo y toma el id de usuario aunque esté inactivo", () => {
    expect(aDueno({ id: 9, userIdIncludingInactive: 55, email: " Andres@SmarteamCR.com ", firstName: "Andrés", lastName: "Pinzón" }, true))
      .toEqual({ ownerId: "9", userId: "55", email: "andres@smarteamcr.com", nombre: "Andrés Pinzón", archivado: true });
  });
});
