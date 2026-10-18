import { describe, expect, it } from "vitest";
import { horasDeTareas, leerBloques, type TareaParaMargen } from "./horas-de-tareas";

const octubre = { desde: new Date("2026-10-01T06:00:00Z"), hasta: new Date("2026-11-01T06:00:00Z") };
const tarea = (o: Partial<TareaParaMargen> = {}): TareaParaMargen => ({
  id: "t1",
  clienteId: "c-acme",
  responsableEmail: "lucia@smarteamcr.com",
  clase: "accion",
  estado: "hecha",
  completadaAt: "2026-10-10T20:00:00Z",
  minutosEstimados: null,
  bloques: [],
  ...o,
});

describe("horasDeTareas: las tareas internas hechas de una cuenta", () => {
  it("con bloques en la agenda: lo que duraron, a la dueña del bloque, en el mes del bloque", () => {
    const r = horasDeTareas(
      [
        tarea({
          bloques: [
            { calendario: "lucia@smarteamcr.com", inicio: "2026-10-08T15:00:00Z", fin: "2026-10-08T17:00:00Z" },
            { calendario: "pedro@smarteamcr.com", inicio: "2026-10-09T15:00:00Z", fin: "2026-10-09T15:30:00Z" },
            { calendario: "lucia@smarteamcr.com", inicio: "2026-09-29T15:00:00Z", fin: "2026-09-29T16:00:00Z" },
          ],
        }),
      ],
      octubre,
    );
    const acme = r.porCuenta.get("c-acme")!;
    expect(acme.get("lucia@smarteamcr.com")).toEqual({ agenda: 2, estimadas: 0 });
    expect(acme.get("pedro@smarteamcr.com")).toEqual({ agenda: 0.5, estimadas: 0 });
    expect(r.cuenta).toMatchObject({ hechas: 1, conBloque: 1 });
  });

  it("sin bloque: su estimado, a quien la tiene, como estimado", () => {
    const r = horasDeTareas([tarea({ minutosEstimados: 90 })], octubre);
    expect(r.porCuenta.get("c-acme")!.get("lucia@smarteamcr.com")).toEqual({ agenda: 0, estimadas: 1.5 });
    expect(r.cuenta.conEstimado).toBe(1);
  });

  it("sin bloque ni estimado no suma: se cuenta", () => {
    const r = horasDeTareas([tarea()], octubre);
    expect(r.porCuenta.size).toBe(0);
    expect(r.cuenta.sinTiempo).toBe(1);
  });

  it("⛔ una tarea de reunión nunca suma: cuenta su reunión", () => {
    const r = horasDeTareas([tarea({ clase: "reunion", minutosEstimados: 60, bloques: [{ calendario: "lucia@smarteamcr.com", inicio: "2026-10-08T15:00:00Z", fin: "2026-10-08T16:00:00Z" }] })], octubre);
    expect(r.porCuenta.size).toBe(0);
    expect(r.cuenta.reuniones).toBe(1);
  });

  it("solo las hechas; un bloque de 8 h o más no cuenta y los demás se topan en 4 h", () => {
    const r = horasDeTareas(
      [
        tarea({ id: "a", estado: "pendiente", minutosEstimados: 60, completadaAt: null }),
        tarea({ id: "b", bloques: [{ calendario: "lucia@smarteamcr.com", inicio: "2026-10-08T12:00:00Z", fin: "2026-10-08T22:00:00Z" }], minutosEstimados: 30 }),
        tarea({ id: "c", bloques: [{ calendario: "lucia@smarteamcr.com", inicio: "2026-10-08T12:00:00Z", fin: "2026-10-08T18:00:00Z" }] }),
      ],
      octubre,
    );
    // «b»: su bloque de 10 h no cuenta, así que va su estimado; «c»: 6 h topadas en 4.
    expect(r.porCuenta.get("c-acme")!.get("lucia@smarteamcr.com")).toEqual({ agenda: 4, estimadas: 0.5 });
  });

  it("leerBloques tolera lo que no tiene forma", () => {
    expect(leerBloques(null)).toEqual([]);
    expect(leerBloques([{ calendario: "X@Y.com", inicio: "2026-10-08T12:00:00Z", fin: "2026-10-08T13:00:00Z" }, { calendario: 1 }, "x"])).toEqual([
      { calendario: "x@y.com", inicio: "2026-10-08T12:00:00Z", fin: "2026-10-08T13:00:00Z" },
    ]);
  });
});
