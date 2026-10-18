import { describe, expect, it } from "vitest";
import { proximasDeLaCuenta } from "./proximas";
import type { ReunionDeHoy } from "./agenda";

const AHORA = new Date("2026-10-16T17:00:00Z");
const internos = new Set(["smarteamcr.com"]);
const reunion = (o: Partial<ReunionDeHoy> = {}): ReunionDeHoy => ({
  id: "e1",
  titulo: "Seguimiento",
  inicio: "2026-10-20T15:00:00Z",
  fin: "2026-10-20T16:00:00Z",
  conMeet: true,
  meetUrl: null,
  calendarUrl: null,
  empresas: ["c1"],
  externos: 2,
  internos: 1,
  deSmarteam: ["ana@smarteamcr.com"],
  ...o,
});

describe("las próximas reuniones de una cuenta", () => {
  it("el mismo evento en dos calendarios cuenta una vez y suma a quienes van", () => {
    const r = proximasDeLaCuenta(
      "c1",
      [
        { email: "ana@smarteamcr.com", reuniones: [reunion()] },
        { email: "luis@smarteamcr.com", reuniones: [reunion({ deSmarteam: ["luis@smarteamcr.com"] })] },
      ],
      [],
      { ahora: AHORA, internos },
    );
    expect(r.reuniones).toHaveLength(1);
    expect(r.reuniones[0].deSmarteam).toEqual(["ana@smarteamcr.com", "luis@smarteamcr.com"]);
  });

  it("solo cuenta un evento de UNA empresa (invariante 1), y de los próximos 8 días", () => {
    const r = proximasDeLaCuenta(
      "c1",
      [
        {
          email: "ana@smarteamcr.com",
          reuniones: [reunion({ id: "varias", empresas: ["c1", "c2"] }), reunion({ id: "otra", empresas: ["c2"] }), reunion({ id: "lejos", inicio: "2026-10-30T15:00:00Z", fin: null }), reunion({ id: "ok" })],
        },
      ],
      [],
      { ahora: AHORA, internos },
    );
    expect(r.reuniones.map((x) => x.id)).toEqual(["ok"]);
  });

  it("una planeada en Tareas que ya está en el calendario no se repite; si no, se ve con su T-", () => {
    const planeada = { id: "t1", numero: 12, titulo: "Seguimiento", inicio: "2026-10-20T15:00:00Z", responsableEmail: "marta@smarteamcr.com", invitados: ["x@acme.com"] };
    const otra = { ...planeada, id: "t2", numero: 13, inicio: "2026-10-22T15:00:00Z" };
    const r = proximasDeLaCuenta("c1", [{ email: "ana@smarteamcr.com", reuniones: [reunion()] }], [planeada, otra], { ahora: AHORA, internos });
    expect(r.reuniones).toHaveLength(2);
    expect(r.reuniones[0].deSmarteam).toContain("marta@smarteamcr.com");
    expect(r.reuniones[1]).toMatchObject({ fuente: "tarea", numero: 13, externos: 1, deSmarteam: ["marta@smarteamcr.com"] });
  });

  it("un calendario que no se pudo leer se nombra", () => {
    expect(proximasDeLaCuenta("c1", [{ email: "ana@smarteamcr.com", reuniones: null }], [], { ahora: AHORA, internos }).sinLeer).toEqual(["ana@smarteamcr.com"]);
  });
});
