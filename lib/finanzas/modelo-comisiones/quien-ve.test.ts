import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { soloCodigo } from "@/lib/db/escritura-sql-cruda";
import { alcanceDeComisiones } from "./quien-ve";

describe("quién entra a Comisiones", () => {
  it("Super Admin ve todo; Ventas, CSE y CSL ven lo suyo; el resto no entra", () => {
    expect(alcanceDeComisiones("SUPER_ADMIN", "sa", true)).toEqual({ tipo: "todo" });
    expect(alcanceDeComisiones("VENTAS", "liz", false)).toEqual({ tipo: "persona", teamMemberId: "liz", rol: "VENTAS" });
    expect(alcanceDeComisiones("CSE", "caro", false)?.tipo).toBe("persona");
    expect(alcanceDeComisiones("CSL", "alex", false)?.tipo).toBe("persona");
    for (const rol of ["DEV", "MARKETING", "ADMIN", null]) expect(alcanceDeComisiones(rol, "x", false)).toBeNull();
  });

  it("la página decide el alcance ANTES de cargar, y la carga lo recibe (el filtro es del servidor)", () => {
    const src = soloCodigo(fs.readFileSync(path.join(process.cwd(), "app", "(shell)", "finanzas", "modelo-de-comisiones", "page.tsx"), "utf8"));
    const alcance = src.indexOf("alcanceDeComisiones(");
    const carga = src.indexOf("cargarSimulacionDeComisiones(alcance)");
    expect(alcance, "la página no calcula el alcance").toBeGreaterThan(-1);
    expect(carga, "la carga no recibe el alcance").toBeGreaterThan(alcance);
    expect(src.indexOf("redirect("), "quien no entra se va antes de cargar").toBeLessThan(carga);
  });
});
