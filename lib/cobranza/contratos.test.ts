import { describe, expect, it } from "vitest";
import { DIAS_AVISO_FIN_CONTRATO, avisoDeFin, cuandoVence, finDelContrato, queHacerConElFin, sumarMeses, type ServicioParaContrato } from "./contratos";

const contrato = (p: Partial<ServicioParaContrato> = {}): ServicioParaContrato => ({
  modalidad: "RECURRENTE",
  estado: "ACTIVO",
  fechaInicioFacturacion: "2026-01-15",
  duracionMeses: 12,
  contratoFin: null,
  contratoRenovacion: null,
  ...p,
});

describe("los contratos recurrentes (punto 16, 2026-11-13)", () => {
  it("sumar meses cae en el último día si el mes es más corto", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-01-15", 12)).toBe("2027-01-15");
    expect(sumarMeses("2026-11-30", 3)).toBe("2027-02-28");
  });

  it("el fin: el escrito manda; si no, inicio + duración; sin duración no tiene fin", () => {
    expect(finDelContrato(contrato({ contratoFin: "2026-12-31" }))).toBe("2026-12-31");
    expect(finDelContrato(contrato())).toBe("2027-01-15");
    expect(finDelContrato(contrato({ duracionMeses: null }))).toBeNull();
  });

  it("⭐ avisa desde 30 días antes del fin, y si venció y sigue activo", () => {
    const k = contrato({ contratoFin: "2026-12-13" });
    expect(DIAS_AVISO_FIN_CONTRATO).toBe(30);
    expect(avisoDeFin(k, "2026-11-12")).toBeNull();
    expect(avisoDeFin(k, "2026-11-13")).toMatchObject({ clave: "por-vencer", dias: 30 });
    expect(avisoDeFin(k, "2026-12-15")).toMatchObject({ clave: "vencido", dias: 2 });
  });

  it("solo recurrentes activos", () => {
    expect(avisoDeFin(contrato({ modalidad: "PROYECTO", contratoFin: "2026-11-20" }), "2026-11-13")).toBeNull();
    expect(avisoDeFin(contrato({ estado: "FINALIZADO", contratoFin: "2026-11-20" }), "2026-11-13")).toBeNull();
  });

  it("qué hacer depende de la renovación; nadie la dijo también se dice", () => {
    const a = avisoDeFin(contrato({ contratoFin: "2026-11-20", contratoRenovacion: "manual" }), "2026-11-13")!;
    expect(queHacerConElFin(a)).toMatch(/renovarlo/);
    expect(cuandoVence(a)).toBe("vence en 7 días");
    const sinDecir = avisoDeFin(contrato({ contratoFin: "2026-11-14" }), "2026-11-13")!;
    expect(queHacerConElFin(sinDecir)).toMatch(/Nadie dijo/);
    expect(cuandoVence(sinDecir)).toBe("vence mañana");
    expect(avisoDeFin(contrato({ contratoFin: "2026-11-20", contratoRenovacion: "cualquiera" }), "2026-11-13")?.renovacion).toBeNull();
  });
});
