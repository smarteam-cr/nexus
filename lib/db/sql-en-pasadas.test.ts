/**
 * lib/db/sql-en-pasadas.test.ts — los `.sql` se aplican aunque su orden de nombre no respete sus dependencias, y un
 * error de verdad no se esconde.
 */
import { describe, expect, it } from "vitest";
import { aplicarEnPasadas, ErrorDeSqlEnPasadas } from "./sql-en-pasadas";

/** Una base de mentira: cada archivo crea una tabla y puede necesitar otra. */
function base(archivos: Record<string, { crea: string; necesita?: string }>) {
  const tablas = new Set<string>();
  const intentos: string[] = [];
  const aplicar = async (archivo: string) => {
    intentos.push(archivo);
    const a = archivos[archivo];
    if (a.necesita && !tablas.has(a.necesita)) throw new Error(`relation "${a.necesita}" does not exist`);
    tablas.add(a.crea);
  };
  return { aplicar, tablas, intentos };
}

describe("aplicarEnPasadas", () => {
  it("en orden, una sola pasada", async () => {
    const b = base({ a: { crea: "A" }, b: { crea: "B", necesita: "A" } });
    const r = await aplicarEnPasadas(["a", "b"], b.aplicar);
    expect(r).toEqual({ aplicados: ["a", "b"], pasadas: 1 });
  });

  it("si un archivo usa una tabla que crea uno posterior, lo reintenta en la pasada siguiente (el caso real del 16 ago)", async () => {
    const b = base({
      "2026-08-16-partner-comercial.sql": { crea: "columna", necesita: "ComisionPartner" },
      "2026-08-16-planilla-tarjetas-comisiones.sql": { crea: "ComisionPartner" },
    });
    const r = await aplicarEnPasadas(["2026-08-16-partner-comercial.sql", "2026-08-16-planilla-tarjetas-comisiones.sql"], b.aplicar);
    expect(r.aplicados).toEqual(["2026-08-16-planilla-tarjetas-comisiones.sql", "2026-08-16-partner-comercial.sql"]);
    expect(r.pasadas).toBe(2);
    expect(b.tablas.has("columna")).toBe(true);
  });

  it("un archivo que falla siempre aborta con su error y dice qué quedó sin aplicar, sin girar para siempre", async () => {
    const b = base({ a: { crea: "A" }, roto: { crea: "X", necesita: "NoExiste" } });
    const error = await aplicarEnPasadas(["roto", "a"], b.aplicar).catch((e) => e);
    expect(error).toBeInstanceOf(ErrorDeSqlEnPasadas);
    expect(error.archivo).toBe("roto");
    expect(error.detalle).toContain("NoExiste");
    expect(error.sinAplicar).toEqual(["roto"]);
    expect(b.intentos.filter((x) => x === "roto")).toHaveLength(2);
  });

  it("sin archivos no hace nada", async () => {
    expect(await aplicarEnPasadas([], async () => {})).toEqual({ aplicados: [], pasadas: 0 });
  });
});
