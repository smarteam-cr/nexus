import { describe, expect, it } from "vitest";
import { CONFIRMA_PRODUCCION, RESPONSABLE_DE_COBRO, nombreDe, paraGuardar, responsableDeLaVenta, responsablesDelProyecto } from "./responsables";

describe("los responsables de Cobranza (2026-11-13)", () => {
  it("por defecto cobra María José Zamora y confirma la producción Alejandro Salas", () => {
    expect(RESPONSABLE_DE_COBRO.email).toBe("mzamora@smarteamcr.com");
    expect(CONFIRMA_PRODUCCION.email).toBe("asalas@smarteamcr.com");
    expect(responsableDeLaVenta({ responsableCobroEmail: null })).toBe(RESPONSABLE_DE_COBRO.email);
    expect(responsablesDelProyecto(null)).toEqual({ confirma: CONFIRMA_PRODUCCION.email, cobra: RESPONSABLE_DE_COBRO.email });
  });

  it("lo reasignado manda, normalizado; lo que no es un correo cae al por defecto", () => {
    expect(responsableDeLaVenta({ responsableCobroEmail: " AVanegas@SmarteamCR.com " })).toBe("avanegas@smarteamcr.com");
    expect(responsableDeLaVenta({ responsableCobroEmail: "   " })).toBe(RESPONSABLE_DE_COBRO.email);
    expect(responsablesDelProyecto({ confirmaProduccionEmail: "bsalas@smarteamcr.com", cobraEmail: null })).toEqual({
      confirma: "bsalas@smarteamcr.com",
      cobra: RESPONSABLE_DE_COBRO.email,
    });
  });

  it("⭐ el por defecto se guarda como null: cambiar a quien cobra no deja filas pegadas al anterior", () => {
    expect(paraGuardar("mzamora@smarteamcr.com", RESPONSABLE_DE_COBRO.email)).toBeNull();
    expect(paraGuardar("MZAMORA@smarteamcr.com", RESPONSABLE_DE_COBRO.email)).toBeNull();
    expect(paraGuardar(null, RESPONSABLE_DE_COBRO.email)).toBeNull();
    expect(paraGuardar("avanegas@smarteamcr.com", RESPONSABLE_DE_COBRO.email)).toBe("avanegas@smarteamcr.com");
  });

  it("el nombre: el del equipo, el conocido del por defecto, o el correo", () => {
    const nombres = new Map([["avanegas@smarteamcr.com", "Alexander Vanegas"]]);
    expect(nombreDe("avanegas@smarteamcr.com", nombres)).toBe("Alexander Vanegas");
    expect(nombreDe(RESPONSABLE_DE_COBRO.email, new Map())).toBe("María José Zamora");
    expect(nombreDe("nadie@x.com", nombres)).toBe("nadie@x.com");
  });
});
