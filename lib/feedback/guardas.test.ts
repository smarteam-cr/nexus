/**
 * lib/feedback/guardas.test.ts — lo que no puede romperse en silencio en el feedback (escaneo estructural).
 *
 * · Toda ruta de /api/feedback pide usuario interno; las de decidir, temas y pedidos, además, ser quien revisa.
 * · La captura va al almacén PRIVADO (una pantalla puede mostrar datos de un cliente o de Finanzas).
 * · Las cuatro tablas nacen con RLS y la policy RESTRICTIVE (el `anon` de Supabase no las lee).
 * · El festejo no nombra a nadie (decisión de Elías, 2026-10-04).
 * · La dirección guardada de un reporte solo es enlace si es una pantalla de Nexus (2026-10-05): los
 *   reportes de ANTES de la regla (lib/navegacion/ruta-interna.ts) pueden traer `//otro.com`.
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

const SOLO_QUIEN_REVISA = [
  "app/api/feedback/[id]/decision/route.ts",
  "app/api/feedback/temas/route.ts",
  "app/api/feedback/temas/[id]/route.ts",
  "app/api/feedback/pedidos/route.ts",
  // Los cambios de la escala en la hoja de ruta, con las columnas del manual (2026-10-05).
  "app/api/feedback/cambios-de-la-escala/route.ts",
];

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

describe("la dirección guardada de un reporte", () => {
  /** Los .tsx de components/feedback, con sus subcarpetas. */
  function componentes(dir: string): string[] {
    const salida: string[] = [];
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) salida.push(...componentes(rel));
      else if (e.name.endsWith(".tsx")) salida.push(rel);
    }
    return salida;
  }
  const PIEZAS = "components/feedback/piezas.tsx";

  it("⭐ ningún componente del feedback pinta `href={…ruta}` sin pasar por EnlaceDeRuta", () => {
    const todos = componentes("components/feedback");
    expect(todos).toContain("components/feedback/admin/BandejaDeFeedback.tsx");
    expect(todos).toContain("components/feedback/PanelDeFeedback.tsx");
    const crudos = todos.filter((f) => f !== PIEZAS && /href=\{[^}]*\bruta\b[^}]*\}/.test(leer(f)));
    expect(crudos, "un reporte viejo puede traer una dirección de afuera: usa <EnlaceDeRuta> de components/feedback/piezas.tsx").toEqual([]);
  });

  it("⭐ EnlaceDeRuta revisa esRutaInterna ANTES de pintar el enlace", () => {
    const src = leer(PIEZAS);
    expect(src).toMatch(/import \{ esRutaInterna \} from ["']@\/lib\/navegacion\/ruta-interna["']/);
    const cuerpo = src.slice(src.indexOf("export function EnlaceDeRuta"));
    expect(cuerpo, "EnlaceDeRuta no existe en piezas.tsx").toMatch(/^export function EnlaceDeRuta/);
    const chequeo = cuerpo.search(/if \(!esRutaInterna\(ruta\)\) \{?\s*return/);
    expect(chequeo, "EnlaceDeRuta pinta el enlace sin revisar esRutaInterna(ruta)").toBeGreaterThan(-1);
    expect(chequeo).toBeLessThan(cuerpo.indexOf("href={ruta}"));
  });

  it("la bandeja y el panel lo usan", () => {
    // El reporte que ven la Bandeja y el panel de un tema se pinta con las piezas de DetalleDelReporte.tsx (2026-10-06).
    for (const f of ["components/feedback/admin/DetalleDelReporte.tsx", "components/feedback/PanelDeFeedback.tsx"]) {
      expect(leer(f), f).toContain("<EnlaceDeRuta ruta=");
    }
  });
});
