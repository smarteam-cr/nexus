/**
 * lib/auth/client-safe.test.ts — ningún componente de cliente arrastra Prisma al navegador.
 *
 * ── LA FALLA QUE ATACA ───────────────────────────────────────────────────────
 * Un `"use client"` que importa un VALOR de un módulo que importa Prisma mete el driver de
 * Postgres en el bundle del navegador. Se cae el build con `Can't resolve 'dns'`, y el
 * mensaje señala a `node_modules/pg`, no a la línea que lo causó — hay que reconstruir la
 * cadena a mano.
 *
 * Lo peor es lo que NO lo detecta: `tsc` está feliz (los tipos existen), los 1.381 tests
 * están felices (Vitest corre en Node), y `npm run dev` también, porque Turbopack en
 * desarrollo es más permisivo. Solo aparece en el build de producción.
 *
 * Pasó escribiendo O5: `ActiveProjectsSection` (cliente) pasó de `import type { PortfolioRow }`
 * a importar también una función del mismo archivo. Un `import type` se borra en compilación;
 * una función, no.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const out: string[] = [];
  const rec = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p);
      else if (/\.tsx?$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
    }
  };
  rec(path.join(RAIZ, dir));
  return out;
}

/** `@/lib/foo/bar` → ruta absoluta del archivo, probando .ts / .tsx / index. */
function resolverAlias(spec: string): string | null {
  if (!spec.startsWith("@/")) return null;
  const base = path.join(RAIZ, spec.slice(2));
  for (const cand of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

/** Los módulos de `lib/` que tocan Prisma DIRECTAMENTE: los que no pueden ir al navegador. */
const modulosDeServidor = new Set(
  archivos("lib")
    .filter((f) => /from\s+["']@\/lib\/db\/prisma["']/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.resolve(f)),
);

/**
 * C-24 (2026-09-04): los módulos de `lib/` que importan zod DIRECTAMENTE. Zod pesa 266 KB en
 * el navegador y ninguna pantalla lo necesita para pintar: valida en la frontera HTTP, del
 * lado del servidor. Un `"use client"` que importa un VALOR de uno de estos módulos se lo
 * lleva entero al bundle — y no falla en ningún lado: solo se ve en el peso.
 */
const modulosConZod = new Set(
  archivos("lib")
    .filter((f) => /from\s+["']zod["']/.test(fs.readFileSync(f, "utf8")))
    .map((f) => path.resolve(f)),
);

/**
 * DEUDA CONOCIDA (C-24, 2026-09-04): los componentes de cliente que YA importaban un valor de un
 * módulo con zod cuando se escribió la regla. Solo ENCOGE: se saca una entrada cuando el
 * módulo se parte en «esquemas» + «constantes puras» (molde: lib/roles/roles-ui.ts, que es lo
 * que hizo este ítem con los 2 de Roles). Una entrada nueva es un rojo.
 * ⛔ `lib/cobranza/schema.ts` es de la otra sesión: sus 19 consumidores se destraban partiéndolo
 * ahí, no tocando esta lista.
 */
const DEUDA_ZOD: ReadonlySet<string> = new Set([
  "components/cobranza/AlertasCobranza.tsx → @/lib/cobranza/schema",
  "components/cobranza/BuscarPagoModal.tsx → @/lib/cobranza/schema",
  "components/cobranza/ColaCobros.tsx → @/lib/cobranza/schema",
  "components/cobranza/CostoForm.tsx → @/lib/cobranza/schema",
  "components/cobranza/CostosPanel.tsx → @/lib/cobranza/schema",
  "components/cobranza/CronogramaCobros.tsx → @/lib/cobranza/schema",
  "components/cobranza/CuentaDrawer.tsx → @/lib/cobranza/schema",
  "components/cobranza/ImportWizard.tsx → @/lib/cobranza/schema",
  "components/cobranza/MovimientosSection.tsx → @/lib/cobranza/schema",
  "components/cobranza/NuevaEmpresaModal.tsx → @/lib/cobranza/schema",
  "components/cobranza/PanelCartera.tsx → @/lib/cobranza/schema",
  "components/cobranza/RegistrarPagoManualDialog.tsx → @/lib/cobranza/schema",
  "components/cobranza/ServicioForm.tsx → @/lib/cobranza/schema",
  "components/cobranza/TagsInput.tsx → @/lib/cobranza/schema",
  "components/finanzas/ComisionesPartnerPanel.tsx → @/lib/cobranza/schema",
  "components/finanzas/TarjetasPanel.tsx → @/lib/cobranza/schema",
  "components/finanzas/equilibrio/CurvaEquilibrio.tsx → @/lib/cobranza/schema",
  "components/finanzas/equilibrio/DesgloseIngresos.tsx → @/lib/cobranza/schema",
  "components/finanzas/equilibrio/EquilibrioClient.tsx → @/lib/cobranza/schema",
  "app/(shell)/marketing/contenido/ContentClient.tsx → @/lib/marketing/schema",
  "app/(shell)/marketing/generacion/EngineClient.tsx → @/lib/marketing/schema",
]);

/**
 * Imports de VALOR (los `import type` se borran en compilación y son seguros).
 * Se saltea `import type { … }` y también los specifiers marcados `type` uno por uno.
 */
function importsDeValor(src: string): string[] {
  const out: string[] = [];
  const re = /^import\s+(?!type\s)([\s\S]*?)\s+from\s+["']([^"']+)["']/gm;
  for (const m of [...src.matchAll(re)]) {
    const clausula = m[1].trim();
    // `import { type A, type B } from "x"` — todo marcado type → no queda valor.
    const soloTipos =
      clausula.startsWith("{") &&
      clausula
        .replace(/[{}]/g, "")
        .split(",")
        .filter((s) => s.trim())
        .every((s) => s.trim().startsWith("type "));
    if (!soloTipos) out.push(m[2]);
  }
  return out;
}

describe("los componentes de cliente no importan módulos de servidor", () => {
  it("hay módulos de servidor que detectar (el escaneo no corre en vacío)", () => {
    expect(modulosDeServidor.size).toBeGreaterThan(20);
  });

  /** `componente → spec` por cada import de VALOR desde un «use client» a un módulo del conjunto. */
  function culpablesContra(modulos: ReadonlySet<string>): string[] {
    const culpables: string[] = [];
    for (const f of [...archivos("components"), ...archivos("app")]) {
      const src = fs.readFileSync(f, "utf8");
      // El "use client" tiene que estar arriba de todo para contar.
      if (!/^\s*(["'])use client\1/.test(src)) continue;
      for (const spec of importsDeValor(src)) {
        const destino = resolverAlias(spec);
        if (destino && modulos.has(path.resolve(destino))) {
          culpables.push(`${path.relative(RAIZ, f).split(path.sep).join("/")} → ${spec}`);
        }
      }
    }
    return culpables;
  }

  it("ningún «use client» importa un VALOR de un módulo que toca Prisma", () => {
    const culpables = culpablesContra(modulosDeServidor);
    expect(
      culpables,
      "Un componente de cliente está importando un VALOR de un módulo que importa Prisma: eso " +
        "mete el driver de Postgres en el bundle del navegador y rompe `npm run build` con un " +
        "error que apunta a node_modules/pg, no a la línea culpable. Si solo necesitás el TIPO, " +
        "usá `import type` (se borra en compilación). Si necesitás la función, movela a un " +
        "módulo PURO — el molde es lib/lifecycle/etapa-ui.ts.",
    ).toEqual([]);
  });

  it("C-24: ningún «use client» NUEVO importa un VALOR de un módulo con zod — la deuda solo encoge", () => {
    /* La edición que la pone en rojo: `import { ROLE_DOC_TYPE_LABEL } from "@/lib/roles/schema"`
       de vuelta en un componente de Roles (zod al navegador otra vez), o un `import { z }` en
       lib/roles/roles-ui.ts «para validar ahí también». */
    expect(modulosConZod.size, "el escaneo de zod no corre en vacío").toBeGreaterThan(5);
    expect(
      modulosConZod.has(path.resolve(path.join(RAIZ, "lib/roles/roles-ui.ts"))),
      "lib/roles/roles-ui.ts es el módulo PURO de Roles: no puede importar zod",
    ).toBe(false);
    const culpables = culpablesContra(modulosConZod);
    const nuevos = culpables.filter((c) => !DEUDA_ZOD.has(c));
    expect(
      nuevos,
      "Un componente de cliente importa un VALOR de un módulo que importa zod: 266 KB al bundle " +
        "del navegador para pintar. Mové las constantes puras a un módulo sin zod (molde: " +
        "lib/roles/roles-ui.ts) e importá de ahí.",
    ).toEqual([]);
    const pagados = [...DEUDA_ZOD].filter((d) => !culpables.includes(d));
    expect(pagados, "estas entradas de DEUDA_ZOD ya no importan zod: borralas (la deuda solo encoge)").toEqual([]);
  });
});
