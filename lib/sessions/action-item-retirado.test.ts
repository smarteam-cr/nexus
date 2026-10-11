/**
 * lib/sessions/action-item-retirado.test.ts — `ActionItem` se retiró (memoria de la cuenta, etapa 2; DECISIONS «La
 * lectura de cada reunión es durable…»). Los compromisos de una reunión son propuestas de Tarea y los pendientes del
 * proyecto se leen de Tareas. Lo histórico se queda (sin DROP ni borrado), pero nada nuevo se crea.
 *
 * Escaneo del TEXTO del código: si una guarda desaparece, la suite se pone roja. Se arregla restituyendo la guarda,
 * nunca relajando el regex ni sumando un escritor a la lista.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");
const soloCodigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__fixtures__" && !e.name.startsWith(".")) out.push(...fuentes(rel));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const TODO = [...fuentes("lib"), ...fuentes("app"), ...fuentes("components")];
/**
 * Para «nadie crea uno nuevo» también cuentan los scripts (2026-10-10): `scripts/migrate-pending-items-to-action-items.ts`
 * todavía creaba ActionItem con `--apply` y se retiró. Leer desde un script sí se puede (comparar, auditar).
 */
const CON_SCRIPTS = [...TODO, ...fuentes("scripts")];

/**
 * La copia congelada del post-proceso de antes (el retroceso de emergencia de SEGUIMIENTO_REUNIONES_ENABLED=0) es la
 * única que todavía crea `ActionItem`, y ninguna pantalla los muestra. Se borra con ella, a los 30 días de un INV44 verde.
 */
const RETROCESO = "lib/sessions/post-process-viejo.ts";

/** Quién puede todavía LEER `ActionItem`: lo histórico, sin pantallas que lo pinten como trabajo de hoy. La lista solo encoge. */
const LECTORES_DE_LO_HISTORICO: Record<string, string> = {
  "app/api/action-items/[id]/route.ts": "PATCH y DELETE de lo histórico, sin llamadores",
  "lib/lo-propuesto/registro-server.ts": "«Uso de Nexus»: cuenta los compromisos viejos",
  [RETROCESO]: "la copia congelada (dedupe de lo que crea)",
};

describe("⛔ ActionItem está retirado", () => {
  it("la guarda mira algo", () => {
    expect(TODO.length).toBeGreaterThan(500);
  });

  it("ningún archivo de lib/, app/, components/ ni scripts/ crea un ActionItem (salvo la copia congelada del retroceso)", () => {
    const malos = CON_SCRIPTS.filter((rel) => rel !== RETROCESO && /\.actionItem\.(?:create|createMany|upsert)\(/.test(soloCodigo(leer(rel))));
    expect(malos, `Estos archivos crean ActionItem, que se retiró (los próximos pasos son tareas):\n${malos.join("\n")}`).toEqual([]);
    expect(leer(RETROCESO), "la copia congelada tiene que seguir marcada DEPRECATED").toContain("DEPRECATED");
  });

  it("nadie más lee ActionItem: los pendientes, «Para ti», la página de la reunión y el vigía leen Tareas", () => {
    const lectores = TODO.filter((rel) => /\.actionItem\./.test(soloCodigo(leer(rel))));
    const sinDeclarar = lectores.filter((rel) => !LECTORES_DE_LO_HISTORICO[rel]);
    expect(sinDeclarar, `Lector nuevo de ActionItem. Los pendientes son tareas (lib/tareas):\n${sinDeclarar.join("\n")}`).toEqual([]);
    const sobran = Object.keys(LECTORES_DE_LO_HISTORICO).filter((rel) => !lectores.includes(rel));
    expect(sobran, `Ya no leen ActionItem: sácalos de la lista:\n${sobran.join("\n")}`).toEqual([]);
  });

  it("la ruta que los creaba responde 410 y /analyze ya no los copia", () => {
    const ruta = soloCodigo(leer("app/api/action-items/route.ts"));
    expect(ruta).toContain("status: 410");
    expect(ruta).not.toMatch(/prisma/);
    const merge = soloCodigo(leer("lib/canvas/merge-pending-items.ts"));
    expect(merge).not.toMatch(/prisma|actionItem/);
    expect(leer("lib/canvas/agent-output-schema.ts"), "el formato común ya no pide pendingItems").not.toMatch(/"pendingItems"\s*:/);
  });

  it("el modelo y su enum quedan DEPRECATED en el schema, sin DROP", () => {
    const schema = leer("prisma/schema.prisma");
    expect(schema).toMatch(/\/\/ DEPRECATED[^\n]*\n(?:\/\/[^\n]*\n)*model ActionItem \{/);
    expect(schema).toMatch(/\/\/ DEPRECATED[^\n]*\n(?:\/\/[^\n]*\n)*enum ActionStatus \{/);
  });
});
