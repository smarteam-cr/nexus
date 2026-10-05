import { describe, expect, it } from "vitest";
import { fotoDePrueba, HOY } from "./__fixtures__/foto";
import { filasDelListado, type AuditoriaParaListar } from "./listado";

/**
 * lib/auditoria-portal/listado.test.ts — CADA FILA DICE CÓMO QUEDÓ LA AUDITORÍA Y CUÁNTO CAMBIÓ EL
 * PORTAL DESDE LA ANTERIOR DEL MISMO PORTAL.
 */

const fila = (id: string, fecha: string, data: unknown, accountId = "cuenta-1"): AuditoriaParaListar => ({
  id,
  name: id,
  createdAt: new Date(fecha),
  accountId,
  clientId: null,
  clienteNombre: null,
  esDelSistema: true,
  data,
});

const conContactos = (n: number) => fotoDePrueba({ lifecycleStats: { ...fotoDePrueba().lifecycleStats!, totalContacts: n } });

describe("filasDelListado", () => {
  it("la diferencia de contactos es contra la anterior del MISMO portal", () => {
    const filas = filasDelListado(
      [fila("vieja", "2026-09-01", conContactos(800)), fila("otra", "2026-09-20", conContactos(5), "cuenta-2"), fila("nueva", "2026-10-04", fotoDePrueba())],
      HOY,
    );
    expect(filas.map((f) => f.id)).toEqual(["nueva", "otra", "vieja"]);
    expect(filas[0]!.delta).toEqual({ contactos: 200, desde: new Date("2026-09-01").toISOString() });
    expect(filas[2]!.delta).toBeNull();
  });

  it("una foto de antes del rediseño se marca vieja, sin inventar números", () => {
    const [f] = filasDelListado([fila("v1", "2026-04-22", { lifecycleStats: { totalContacts: 0 } })], HOY);
    expect(f).toMatchObject({ estado: "vieja", contactos: null, lecturas: null, pendientes: null });
  });

  it("lecturas, análisis y pendientes de una foto lista", () => {
    const [f] = filasDelListado([fila("a", "2026-10-04", fotoDePrueba())], HOY);
    expect(f!.estado).toBe("lista");
    expect(f!.lecturas).toEqual({ intentos: 67, fallidas: 0 });
    expect(f!.analisis).toEqual({ estado: "sin" });
    expect(f!.pendientes).toBeGreaterThan(0);
    expect(f!.creadaPor).toBe("Persona del equipo");
  });
});
