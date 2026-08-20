/**
 * lib/ui/funciones-de-cliente.test.ts
 *
 * Un Server Component NO puede LLAMAR una función que vive en un módulo "use client".
 * Puede renderizarlo como componente y puede pasarle props — pero invocar una función
 * exportada desde ahí revienta la petición entera:
 *
 *   Attempted to call buttonVariants() from the server but buttonVariants is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * ── POR QUÉ EXISTE ESTE ARCHIVO ─────────────────────────────────────────────────
 * Rompió `/finanzas/costos/planillas` de verdad. La página le daba estilo de botón
 * secundario a un <Link> hacia el Historial con `className={buttonVariants(...)}`, y
 * la sección entera caía al boundary de error mostrando un `ref:` opaco.
 *
 * Costó una mañana encontrarlo, y NADA lo delataba: `tsc` compila, `next build`
 * compila, la suite pasaba, los cargadores de datos daban bien, y hasta renderizar el
 * componente en Node funciona — porque en Node no existe la frontera cliente/servidor.
 * Solo falla en el navegador, con sesión iniciada, en la pantalla real.
 *
 * Este archivo es el único lugar donde ese error se caza barato.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();

function archivos(dir: string, ext: readonly string[], out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e.startsWith(".next") || e === ".git") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, ext, out);
    else if (ext.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

const esCliente = (src: string) => /^\s*(["'])use client\1/.test(src);

describe("las variantes del botón no pueden volver al lado del cliente", () => {
  it("button-variants.ts NO es un módulo de cliente", () => {
    const src = readFileSync(join(RAIZ, "components", "ui", "button-variants.ts"), "utf8");
    expect(esCliente(src)).toBe(false);
  });

  it("el barril las re-exporta desde el módulo neutral, no desde Button", () => {
    // Pasar por "./Button" —que sí es de cliente— vuelve a marcar la referencia y el
    // defecto regresa intacto, aunque el archivo neutral siga existiendo.
    const barril = readFileSync(join(RAIZ, "components", "ui", "index.ts"), "utf8");
    expect(barril).toMatch(/export \{ buttonVariants \} from "\.\/button-variants"/);
    expect(barril).not.toMatch(/buttonVariants[^;]*from "\.\/Button"/);
  });

  it("Button.tsx no vuelve a definirlas ni a re-exportarlas", () => {
    const src = readFileSync(join(RAIZ, "components", "ui", "Button.tsx"), "utf8");
    expect(src).not.toContain("cva(");
    expect(src).not.toMatch(/export[^;\n]*buttonVariants/);
  });
});

/**
 * El guard GENERAL, que es el que importa: no vigila un símbolo, vigila el patrón.
 * Resuelve los imports de cada componente de servidor, mira si lo que importan viene
 * de un archivo "use client" —siguiendo el barril, que es justamente por donde se
 * coló el defecto— y falla si alguno de esos nombres se INVOCA.
 */
describe("ningún Server Component invoca una función del lado del cliente", () => {
  function resolverModulo(desde: string, spec: string): string | null {
    const base = spec.startsWith("@/")
      ? join(RAIZ, spec.slice(2))
      : spec.startsWith(".")
        ? join(desde, "..", spec)
        : null;
    if (!base) return null; // paquete de node_modules: no es asunto nuestro
    for (const cand of [`${base}.tsx`, `${base}.ts`, join(base, "index.tsx"), join(base, "index.ts")]) {
      try {
        if (statSync(cand).isFile()) return cand;
      } catch {
        /* no existe: seguir probando */
      }
    }
    return null;
  }

  /** Los nombres que un módulo entrega y que nacen en un archivo "use client". */
  function exportsDeCliente(archivo: string, profundidad = 0): Set<string> {
    const out = new Set<string>();
    if (profundidad > 2) return out;
    let src: string;
    try {
      src = readFileSync(archivo, "utf8");
    } catch {
      return out;
    }

    if (esCliente(src)) {
      for (const m of src.matchAll(/export\s+(?:const|function|async function)\s+(\w+)/g)) {
        out.add(m[1]!);
      }
      for (const m of src.matchAll(/export\s*\{([^}]+)\}/g)) {
        for (const n of m[1]!.split(",")) {
          const nombre = n.trim().split(/\s+as\s+/).pop()!.trim();
          if (nombre && !nombre.startsWith("type ")) out.add(nombre);
        }
      }
      return out;
    }

    // Barril: lo que re-exporta desde un módulo de cliente hereda la marca.
    for (const m of src.matchAll(/export\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
      const destino = resolverModulo(archivo, m[2]!);
      if (!destino) continue;
      const heredados = exportsDeCliente(destino, profundidad + 1);
      for (const n of m[1]!.split(",")) {
        const partes = n.trim().split(/\s+as\s+/);
        const origen = partes[0]!.trim();
        const alias = partes[partes.length - 1]!.trim();
        if (heredados.has(origen)) out.add(alias);
      }
    }
    return out;
  }

  it("EL DEFECTO QUE MOTIVA ESTE ARCHIVO no puede volver por ninguna puerta", () => {
    const servidores = [
      ...archivos(join(RAIZ, "app"), [".tsx"]),
      ...archivos(join(RAIZ, "components"), [".tsx"]),
    ].filter((f) => !esCliente(readFileSync(f, "utf8")));

    const culpables: string[] = [];

    for (const f of servidores) {
      const src = readFileSync(f, "utf8");
      for (const imp of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*"([^"]+)"/g)) {
        const destino = resolverModulo(f, imp[2]!);
        if (!destino) continue;
        const deCliente = exportsDeCliente(destino);
        if (deCliente.size === 0) continue;

        for (const n of imp[1]!.split(",")) {
          const crudo = n.trim();
          if (crudo.startsWith("type ")) continue;
          const partes = crudo.split(/\s+as\s+/);
          const origen = partes[0]!.trim();
          const local = partes[partes.length - 1]!.trim();
          if (!deCliente.has(origen)) continue;
          // La LLAMADA, no la mención: `<Componente />` está perfecto, `fn()` no.
          if (new RegExp(`\\b${local}\\s*\\(`).test(src)) {
            culpables.push(`${relative(RAIZ, f).split("\\").join("/")} invoca ${local}() de ${imp[2]}`);
          }
        }
      }
    }

    expect(culpables).toEqual([]);
  });
});
