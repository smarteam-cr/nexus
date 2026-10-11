/**
 * lib/exploraciones/migracion-de-sesiones.test.ts — qué reunión ya leída pasa a sesión en la migración (2026-10-10).
 * Correr: `npx vitest run lib/exploraciones/migracion-de-sesiones.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { MAX_SESIONES, type SesionPlaneada } from "./guia";
import { sesionesQueFaltan, type EntradaDeSesionesQueFaltan, type ReunionYaLeida } from "./migracion-de-sesiones";

const AHORA = new Date("2026-10-10T15:00:00.000Z");
const DIA = 86_400_000;
const iso = (diasAtras: number, horas = 0) => new Date(AHORA.getTime() - diasAtras * DIA + horas * 3_600_000).toISOString();
const leida = (id: string, diasAtras: number, extra: Partial<ReunionYaLeida> = {}): ReunionYaLeida => ({
  id,
  origen: "meet",
  fecha: iso(diasAtras),
  titulo: `Reunión ${id}`,
  deLaEmpresa: true,
  ...extra,
});

function entrada(o: Partial<EntradaDeSesionesQueFaltan>): EntradaDeSesionesQueFaltan {
  let n = 0;
  return { sesiones: [], fuera: [], leidas: [], esDeProyecto: true, esProspecto: false, desde: 0, ahora: AHORA, nuevoId: () => `s-n${++n}`, ...o };
}

describe("qué pasa a sesión", () => {
  it("las leídas que no son de ninguna sesión, unidas a su reunión, de la más vieja a la más nueva", () => {
    const r = sesionesQueFaltan(entrada({ leidas: [leida("m2", 3), leida("m1", 10)] }));
    expect(r.nuevas).toEqual([
      { id: "s-n1", reunion: { id: "m1", origen: "meet" }, fecha: "2026-09-30" },
      { id: "s-n2", reunion: { id: "m2", origen: "meet" }, fecha: "2026-10-07" },
    ]);
  });

  it("una de HubSpot de la preventa de un cliente guarda su hora, como al unirla a mano", () => {
    const r = sesionesQueFaltan(entrada({ esDeProyecto: false, leidas: [leida("h1", 4, { origen: "hubspot" })] }));
    expect(r.nuevas[0].reunion).toEqual({ id: "h1", origen: "hubspot", inicio: iso(4) });
  });
});

describe("qué NO pasa a sesión", () => {
  it("nada en un prospecto: ahí las sesiones entran solas", () => {
    const r = sesionesQueFaltan(entrada({ esDeProyecto: false, esProspecto: true, leidas: [leida("m1", 3)] }));
    expect(r.nuevas).toEqual([]);
    expect(r.saltadas[0].motivo).toBe("prospecto");
  });

  it("ni lo sumado a mano, ni HubSpot en un proyecto, ni sin fecha, ni futura, ni de antes del corte", () => {
    const r = sesionesQueFaltan(
      entrada({
        desde: AHORA.getTime() - 30 * DIA,
        leidas: [
          leida("d1", 2, { origen: "documento" }),
          leida("h1", 2, { origen: "hubspot" }),
          leida("sf", 2, { fecha: null }),
          leida("fut", -2),
          leida("vieja", 400),
        ],
      }),
    );
    expect(r.nuevas).toEqual([]);
    expect(r.saltadas.map((s) => s.motivo)).toEqual(["sumada a mano", "HubSpot en un proyecto", "sin fecha", "no ocurrió", "de antes del corte"]);
  });

  it("ni de otra empresa, ni de puertas adentro, ni la que alguien sacó", () => {
    const r = sesionesQueFaltan(
      entrada({ fuera: ["meet:sacada"], leidas: [leida("otra", 2, { deLaEmpresa: false }), leida("interna", 3, { puertasAdentro: true }), leida("sacada", 4)] }),
    );
    expect(r.nuevas).toEqual([]);
    expect(r.saltadas.map((s) => s.motivo)).toEqual(["no es de la empresa", "de puertas adentro", "la sacaron"]);
  });

  it("ni la que ya es de una sesión: unida a mano, por su evento o por la fecha", () => {
    const sesiones: SesionPlaneada[] = [
      { id: "s-a", reunion: { id: "m1", origen: "meet" } },
      { id: "s-b", evento: { id: "ev9", calendario: "eli@smarteamcr.com", inicio: iso(5) } },
      { id: "s-c", fecha: iso(8).slice(0, 10) },
    ];
    const r = sesionesQueFaltan(entrada({ sesiones, leidas: [leida("m1", 2), leida("m2", 5, { eventoId: "ev9" }), leida("m3", 8), leida("m4", 12)] }));
    expect(r.reuniones.map((x) => x.id)).toEqual(["m4"]);
  });

  it("ni una de HubSpot cuya gemela de Meet pasa a sesión", () => {
    const r = sesionesQueFaltan(entrada({ esDeProyecto: false, leidas: [leida("m1", 4), leida("h1", 4, { origen: "hubspot", fecha: iso(4, 1) })] }));
    expect(r.reuniones.map((x) => x.id)).toEqual(["m1"]);
    expect(r.saltadas).toEqual([{ clave: "hubspot:h1", titulo: "Reunión h1", motivo: "su gemela de Meet ya está" }]);
  });

  it("sin pasar el tope: entran las más recientes", () => {
    const sesiones: SesionPlaneada[] = Array.from({ length: MAX_SESIONES - 2 }, (_, i) => ({ id: `s-x${i}` }));
    const r = sesionesQueFaltan(entrada({ sesiones, leidas: [leida("vieja", 30), leida("media", 20), leida("nueva", 10)] }));
    expect(r.reuniones.map((x) => x.id)).toEqual(["media", "nueva"]);
    expect(r.saltadas).toEqual([{ clave: "meet:vieja", titulo: "Reunión vieja", motivo: "no entra (tope de sesiones)" }]);
  });

  it("ni una de HubSpot de la que no se sabe quién estuvo (podría ser la preparación del equipo)", () => {
    const r = sesionesQueFaltan(entrada({ esDeProyecto: false, leidas: [leida("h1", 4, { origen: "hubspot", salaDesconocida: true })] }));
    expect(r.nuevas).toEqual([]);
    expect(r.saltadas.map((s) => s.motivo)).toEqual(["no se sabe quién estuvo"]);
  });

  it("el corte no deja afuera la que una persona eligió a mano en el buscador; sí la que solo leyó el agente", () => {
    const r = sesionesQueFaltan(
      entrada({ esDeProyecto: false, desde: AHORA.getTime() - 30 * DIA, leidas: [leida("elegida", 200, { elegidaAMano: true }), leida("leida", 200)] }),
    );
    expect(r.reuniones.map((x) => x.id)).toEqual(["elegida"]);
    expect(r.saltadas.map((s) => s.motivo)).toEqual(["de antes del corte"]);
  });

  it("recalculada sobre la fila nueva, no vuelve a meter la que una persona sacó mientras tanto", () => {
    const leidas = [leida("m1", 3), leida("m2", 5)];
    expect(sesionesQueFaltan(entrada({ leidas })).nuevas).toHaveLength(2);
    const despues = sesionesQueFaltan(entrada({ fuera: ["meet:m1"], sesiones: [{ id: "s-a", fecha: iso(5).slice(0, 10) }], leidas }));
    expect(despues.nuevas).toEqual([]);
  });

  it("una reunión repetida (leída y elegida antes) pasa una sola vez", () => {
    const r = sesionesQueFaltan(entrada({ leidas: [leida("m1", 3), leida("m1", 3)] }));
    expect(r.nuevas).toHaveLength(1);
  });
});
