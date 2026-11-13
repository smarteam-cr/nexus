import { describe, expect, it } from "vitest";
import {
  elegiblesParaProduccion,
  puedeConfirmarProduccion,
  puedeEditarResponsables,
  puedeSerResponsable,
  puedeVerProduccion,
  type QuienMira,
} from "./produccion-acceso";

const q = (rol: string, p: Partial<QuienMira> = {}): QuienMira => ({ rol, email: `${rol.toLowerCase()}@smarteamcr.com`, veCobranza: false, editaCobranza: false, ...p });

describe("quién ve y toca el paso a producción (2026-11-13)", () => {
  it("la ven Finanzas, la CSL, Super Admin y Desarrollo; un CSE no", () => {
    expect(puedeVerProduccion(q("ADMIN", { veCobranza: true }))).toBe(true);
    expect(puedeVerProduccion(q("CSL"))).toBe(true);
    expect(puedeVerProduccion(q("DEV"))).toBe(true);
    expect(puedeVerProduccion(q("SUPER_ADMIN"))).toBe(true);
    expect(puedeVerProduccion(q("CSE"))).toBe(false);
    expect(puedeVerProduccion(q("VENTAS"))).toBe(false);
  });

  it("los responsables los cambia la CSL (Alexander Vanegas) o quien edita Cobranza; Desarrollo no", () => {
    expect(puedeEditarResponsables(q("CSL"))).toBe(true);
    expect(puedeEditarResponsables(q("ADMIN", { veCobranza: true, editaCobranza: true }))).toBe(true);
    expect(puedeEditarResponsables(q("DEV"))).toBe(false);
  });

  it("⭐ la producción la confirma quien la confirma en ese proyecto (o quien lidera), no cualquiera de Desarrollo", () => {
    expect(puedeConfirmarProduccion(q("DEV", { email: "asalas@smarteamcr.com" }), "asalas@smarteamcr.com")).toBe(true);
    expect(puedeConfirmarProduccion(q("DEV", { email: "bsalas@smarteamcr.com" }), "asalas@smarteamcr.com")).toBe(false);
    expect(puedeConfirmarProduccion(q("ADMIN", { veCobranza: true, editaCobranza: true }), "asalas@smarteamcr.com")).toBe(false);
    expect(puedeConfirmarProduccion(q("CSL"), "asalas@smarteamcr.com")).toBe(true);
  });

  it("⭐ los selectores ofrecen solo a quien puede: confirma quien ve la pantalla, cobra quien ve Cobranza (revisión del 2026-11-13)", () => {
    const equipo = [q("DEV"), q("CSE"), q("VENTAS"), q("CSL"), q("ADMIN", { veCobranza: true, editaCobranza: true }), q("MARKETING", { veCobranza: true })];
    const e = elegiblesParaProduccion(equipo);
    expect(e.confirma.map((p) => p.rol)).toEqual(["DEV", "CSL", "ADMIN", "MARKETING"]);
    expect(e.cobra.map((p) => p.rol)).toEqual(["ADMIN", "MARKETING"]);
    expect(puedeSerResponsable(q("CSE"), "confirma")).toBe(false);
    expect(puedeSerResponsable(q("DEV"), "cobra")).toBe(false);
  });
});
