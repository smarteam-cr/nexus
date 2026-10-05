/**
 * lib/feedback/guardas.test.ts — lo que no puede romperse en silencio en el feedback (escaneo estructural).
 *
 * · Toda ruta de /api/feedback pide usuario interno; las de decidir, temas y pedidos, además, ser quien revisa.
 * · La captura va al almacén PRIVADO (una pantalla puede mostrar datos de un cliente o de Finanzas).
 * · Las cuatro tablas nacen con RLS y la policy RESTRICTIVE (el `anon` de Supabase no las lee).
 * · El festejo no nombra a nadie (decisión de Elías, 2026-10-04).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = path.resolve(__dirname, "../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

function rutas(dir: string): string[] {
  const salida: string[] = [];
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) salida.push(...rutas(rel));
    else if (e.name === "route.ts") salida.push(rel);
  }
  return salida;
}

const SOLO_QUIEN_REVISA = ["app/api/feedback/[id]/decision/route.ts", "app/api/feedback/temas/route.ts", "app/api/feedback/temas/[id]/route.ts", "app/api/feedback/pedidos/route.ts"];

describe("las rutas de /api/feedback", () => {
  const todas = rutas("app/api/feedback");

  it("existen las que el panel y la bandeja usan", () => {
    expect(todas.length).toBeGreaterThanOrEqual(9);
  });

  it("cada handler pide usuario interno (o quien revisa) en su primera línea de guarda", () => {
    for (const r of todas) {
      const src = leer(r);
      const handlers = src.match(/export async function (GET|POST|PATCH|PUT|DELETE)/g) ?? [];
      const guardas = src.match(/await (guardInternalUser|guardRevisorDeFeedback)\(\)/g) ?? [];
      expect(guardas.length, r).toBeGreaterThanOrEqual(handlers.length);
    }
  });

  it("decidir, crear o mover temas y pedir opiniones es solo de quien revisa", () => {
    for (const r of SOLO_QUIEN_REVISA) expect(leer(r), r).toContain("guardRevisorDeFeedback()");
  });

  it("la captura va al almacén privado, nunca al público", () => {
    const src = leer("app/api/feedback/captura/route.ts");
    expect(src).toContain('pedirPermisoDeSubida("documentos"');
    expect(src).not.toContain('"publico"');
  });
});

describe("el SQL", () => {
  const sql = leer("scripts/sql/2026-10-04-feedback.sql");
  for (const tabla of ["FeedbackReporte", "FeedbackMensaje", "FeedbackTema", "FeedbackPedido"]) {
    it(`${tabla} nace con RLS y la policy RESTRICTIVE`, () => {
      expect(sql).toContain(`ALTER TABLE "${tabla}" ENABLE ROW LEVEL SECURITY;`);
      expect(sql).toContain(`CREATE POLICY deny_all_non_superuser ON "${tabla}" AS RESTRICTIVE FOR ALL TO PUBLIC USING (false);`);
    });
  }

  it("es aditivo: no dropea ni renombra nada", () => {
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
    expect(sql).not.toMatch(/\bRENAME\b/i);
  });
});

describe("el festejo", () => {
  it("no nombra a nadie", () => {
    const src = leer("components/feedback/Festejo.tsx");
    expect(src).toContain("¡Gracias por la idea!");
    expect(src).not.toMatch(/Gracias por la idea, /);
  });

  it("respeta «reducir movimiento»", () => {
    expect(leer("components/feedback/Festejo.tsx")).toContain("prefers-reduced-motion: reduce");
  });
});
