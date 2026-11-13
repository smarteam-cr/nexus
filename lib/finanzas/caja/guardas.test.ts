/**
 * lib/finanzas/caja/guardas.test.ts — lo que NO puede romperse en la caja (2026-11-13). Leen el fuente sin comentarios.
 *
 *   1. Cada handler bajo app/api/finanzas/caja arranca con la guarda de «Caja y pagos»: leer pide `read`, escribir
 *      pide `write`. Nunca otra celda: la caja no se abre con la planilla ni con gastos.
 *   2. La lectura de costos recurrentes no pide el nombre de ninguno: los salarios salen sumados.
 *   3. Nada del módulo escribe en un cobro ni en un costo: un pago comprometido solo apunta a un cobro.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const raiz = process.cwd();
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function rutasBajo(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "route.ts") out.push(p);
    }
  };
  walk(path.join(raiz, dir));
  return out;
}

describe("las rutas de la caja", () => {
  const rutas = rutasBajo("app/api/finanzas/caja");

  it("el escaneo las encuentra (guarda del propio test)", () => {
    expect(rutas.length).toBeGreaterThanOrEqual(6);
  });

  for (const ruta of rutas) {
    const rel = path.relative(raiz, ruta);
    it(`${rel}: lo primero de cada handler es la guarda de «Caja y pagos» con la acción que corresponde`, () => {
      const src = sinComentarios(fs.readFileSync(ruta, "utf8"));
      const handlers = [...src.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\b/g)];
      expect(handlers.length).toBeGreaterThan(0);
      for (let i = 0; i < handlers.length; i++) {
        const cuerpo = src.slice(handlers[i].index!, i + 1 < handlers.length ? handlers[i + 1].index! : src.length);
        const primerAwait = cuerpo.indexOf("await ");
        const accion = handlers[i][1] === "GET" ? "read" : "write";
        expect(
          cuerpo.slice(primerAwait).startsWith(`await guardCostosAccess({ porPersona: { section: "tesoreria", action: "${accion}" } })`),
          `${rel} ${handlers[i][1]}`,
        ).toBe(true);
      }
    });
  }
});

describe("la planilla sale sumada", () => {
  it("caja-server.ts no pide el nombre de ningún costo recurrente", () => {
    const src = sinComentarios(fs.readFileSync(path.join(raiz, "lib/finanzas/caja/caja-server.ts"), "utf8"));
    const lectura = src.slice(src.indexOf("prisma.costoRecurrente.findMany("));
    const select = lectura.slice(0, lectura.indexOf("}),"));
    expect(select).toMatch(/select:/);
    expect(select).not.toMatch(/\bnombre\b/);
    expect(select).not.toMatch(/include:/);
  });
});

describe("la caja no escribe cobros ni costos", () => {
  it("ningún archivo del módulo escribe en Cobro, CostoRecurrente ni GastoPuntual", () => {
    const dir = path.join(raiz, "lib/finanzas/caja");
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const src = sinComentarios(fs.readFileSync(path.join(dir, f), "utf8"));
      expect(src, f).not.toMatch(/prisma\.(cobro|costoRecurrente|gastoPuntual)\.(create|update|upsert|delete)/);
    }
  });
});
