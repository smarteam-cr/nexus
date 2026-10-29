/**
 * lib/smarteam/perfil.test.ts — el perfil de la empresa que usa Nexus (R13): lo que acepta, cómo se lee y cómo se le
 * cuenta a un agente; y que nadie más lea el cliente ideal ni las buyer personas por su cuenta.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { leerReferencias, leerServicios, PerfilEdicionSchema, PERFIL_VACIO, sinReferenciasRepetidas, textoParaElAgente, type ContextoDeLaEmpresaQueUsaNexus } from "./perfil";

describe("lo que acepta al guardar", () => {
  it("recorta los textos y deja null lo vacío; un servicio sin nombre no pasa", () => {
    const ok = PerfilEdicionSchema.parse({
      propuestaDeValor: "  Hacemos que HubSpot rinda.  ",
      tono: null,
      servicios: [{ nombre: "SmartLoop", descripcion: " ", tarifa: "US$ 1.800 al mes" }],
      clientesDeReferencia: [],
    });
    expect(ok.propuestaDeValor).toBe("Hacemos que HubSpot rinda.");
    // El position statement se edita en Marketing › Audiencia (lib/smarteam/posicionamiento.ts): la ficha ya no lo manda.
    expect(PerfilEdicionSchema.safeParse({ ...ok, positionStatement: "x" }).success).toBe(false);
    expect(ok.servicios[0]).toEqual({ nombre: "SmartLoop", descripcion: null, tarifa: "US$ 1.800 al mes" });
    expect(PerfilEdicionSchema.safeParse({ ...ok, servicios: [{ nombre: " ", descripcion: null, tarifa: null }] }).success).toBe(false);
    expect(PerfilEdicionSchema.safeParse({ ...ok, otro: 1 }).success).toBe(false);
  });

  it("una referencia repetida (misma empresa e industria) sobra", () => {
    expect(
      sinReferenciasRepetidas([
        { clientId: "a", industria: "Turismo", porque: null },
        { clientId: "a", industria: "turismo", porque: "x" },
        { clientId: "a", industria: "Educación", porque: null },
      ]),
    ).toHaveLength(2);
  });
});

describe("la lectura del Json guardado", () => {
  it("salta lo que no tiene forma", () => {
    expect(leerServicios([{ nombre: "A" }, { nombre: "" }, 3, null, { tarifa: "x" }])).toEqual([{ nombre: "A", descripcion: null, tarifa: null }]);
    expect(leerReferencias([{ clientId: "c1", industria: "Turismo" }, { clientId: 2 }])).toEqual([{ clientId: "c1", industria: "Turismo", porque: null }]);
    expect(leerServicios(null)).toEqual([]);
  });
});

describe("lo que lee un agente", () => {
  const ctx: ContextoDeLaEmpresaQueUsaNexus = {
    empresa: { id: "s", nombre: "Smarteam" },
    perfil: { ...PERFIL_VACIO, propuestaDeValor: "Que HubSpot rinda.", clientesDeReferencia: [{ clientId: "w", nombre: "Wherex", industria: "Software", porque: "RevOps" }] },
    tono: "Cercano y directo.",
    clienteIdeal: [{ seccion: "SIGNAL_FUERTE", etiqueta: "Señales fuertes", items: ["Paga HubSpot y no lo usa"] }],
    buyerPersonas: [{ nombre: "Gerente comercial", cargo: "Ventas", descripcion: "Decide la compra.", dolores: null, objetivos: null }],
  };

  it("nombra solo lo que hay, con la empresa por su nombre", () => {
    const t = textoParaElAgente(ctx);
    expect(t).toContain("Propuesta de valor de Smarteam:");
    expect(t).toContain("Tono de la marca:");
    expect(t).toContain("- Paga HubSpot y no lo usa");
    expect(t).toContain("- Gerente comercial (Ventas): Decide la compra.");
    expect(t).toContain("- Software: Wherex (RevOps)");
    expect(t).not.toContain("Position statement");
    expect(t).not.toContain("Servicios");
  });

  it("se puede pedir solo una parte", () => {
    expect(textoParaElAgente(ctx, { con: ["clienteIdeal"] })).toBe("Cliente ideal:\nSeñales fuertes:\n- Paga HubSpot y no lo usa");
  });
});

describe("un solo lector", () => {
  const RAIZ = join(__dirname, "..", "..");
  function archivos(dir: string): string[] {
    const out: string[] = [];
    for (const n of readdirSync(dir)) {
      if (n === "node_modules" || n.startsWith(".")) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) out.push(...archivos(p));
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
    }
    return out;
  }
  /** Los que tocan las tablas: el lector, el editor de Marketing (sus pantallas y sus rutas) y la carga. */
  const PERMITIDOS: Readonly<Record<string, string>> = {
    "lib/smarteam/contexto.ts": "el único lector",
    "lib/marketing/queries.ts": "las pantallas de Marketing › Audiencia, donde se edita",
    "lib/marketing/mutations.ts": "el editor de Marketing › Audiencia",
    "scripts/cargar-perfil-de-smarteam.ts": "la carga: cuelga las filas de la ficha",
    "scripts/seed-buyer-personas.ts": "el seed histórico",
    "scripts/seed-marketing-module.ts": "el seed histórico",
    "lib/clients/fusion-de-empresas.ts": "la fusión de dos fichas muda las filas",
    "scripts/merge-duplicate-clients.ts": "la fusión de dos fichas muda las filas",
  };

  it("nadie más lee el cliente ideal ni las buyer personas: un agente nuevo lee lib/smarteam/contexto.ts", () => {
    const ofensores = ["lib", "app", "components", "scripts"]
      .flatMap((d) => archivos(join(RAIZ, d)))
      .map((f) => relative(RAIZ, f).replace(/\\/g, "/"))
      .filter((f) => !PERMITIDOS[f] && !f.startsWith("scripts/archive/"))
      .filter((f) => /\b(icpItem|buyerPersona)\.(findMany|findFirst|findUnique|count|groupBy|aggregate)\(/.test(readFileSync(join(RAIZ, f), "utf8")));
    expect(ofensores).toEqual([]);
  });
});
