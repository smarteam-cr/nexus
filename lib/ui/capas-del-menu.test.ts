/**
 * lib/ui/capas-del-menu.test.ts — TODO DESPLEGABLE DE LA BARRA LATERAL SE ABRE ENCIMA DEL CONTENIDO.
 *
 * Correr: `npx vitest run lib/ui/capas-del-menu.test.ts --project unit`.
 *
 * El 2026-10-20 Elías vio en la pantalla de Liliana (CSE, tema oscuro) el menú del avatar
 * —Configuración, Modo oscuro, Cerrar sesión— abierto POR DETRÁS del contenido de Clientes y de
 * Para ti. En Tareas y con los flyouts (Marketing, Finanzas…) se veía bien. La causa: los
 * flyouts iban en un portal a `document.body`, pero el panel de `Menu` era `fixed z-50` en su
 * lugar, colgado del contenedor `sticky` del rail (SidebarShell). `sticky` crea un contexto de
 * apilamiento: adentro el z-index se resuelve contra ESE contexto, que en la página pinta en el
 * orden del DOM. Todo elemento posicionado de la columna principal viene después y lo tapa —
 * las celdas `relative` de la tabla de Clientes, la agenda de Para ti con `z-[1]`—. Tareas no
 * tiene nada posicionado en esa zona, por eso ahí no se notaba.
 *
 * ⚠ **El modo de falla es silencioso y depende de la PÁGINA**: el menú se ve bien en la pantalla
 * donde se prueba y mal en otra que suma un `relative`. Por eso la guarda no mira las páginas
 * sino la barra: recorre lo que importa el sidebar (los archivos de `components/`, siguiendo los
 * imports) y exige que toda capa `fixed` vaya en un portal a `document.body`. Y los desplegables
 * anclados a un botón del sidebar, además, en la capa `POPOVER` de `lib/ui/z.ts` — nunca un
 * número suelto, que vuelve a la adivinanza de "cuál gana".
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8").replace(/\r\n/g, "\n");

/** Por donde entra la barra lateral al shell. */
const ENTRADAS = ["components/layout/SidebarShell.tsx", "components/layout/Sidebar.tsx"];

/**
 * Los desplegables ANCLADOS a un botón del sidebar: se abren al lado del botón y flotan sobre el
 * contenido. Van en la capa POPOVER. Uno nuevo se agrega acá (el censo de abajo lo exige).
 */
const DESPLEGABLES = [
  "components/layout/NavFlyout.tsx", // Tareas, Marketing, Ventas, Finanzas, Roles…
  "components/ui/Menu.tsx", // el menú del avatar
  "components/ai/RunsIndicator.tsx", // «Corridas»
];

/**
 * Capas `fixed` del grafo del sidebar que NO son desplegables anclados: diálogos con capa propia.
 * Igual tienen que ir en portal; solo no les toca POPOVER.
 */
const DIALOGOS = ["components/ui/Modal.tsx"];

function resolver(desde: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? spec.slice(2) : spec.startsWith(".") ? join(dirname(desde), spec) : null;
  if (!base) return null;
  for (const c of [`${base}.tsx`, `${base}.ts`, `${base}/index.ts`, `${base}/index.tsx`]) {
    if (existsSync(join(RAIZ, c))) return relative(RAIZ, join(RAIZ, c)).replace(/\\/g, "/");
  }
  return null;
}

/**
 * Los componentes que el sidebar PINTA: se sigue un import solo si el nombre importado aparece como
 * etiqueta (`<Menu`, `<RunsIndicator`). Un hook (`useFeedback`) no se sigue: el panel de Feedback lo
 * monta el shell, no la barra. Un barril (`index.ts`) tampoco se sigue entero: solo hasta el
 * archivo de cada nombre que se pinta (de `@/components/ui` el sidebar usa `Menu`, no las cuarenta
 * primitivas).
 */
function grafo(): Set<string> {
  const visto = new Set<string>();
  const pendientes = [...ENTRADAS];
  while (pendientes.length) {
    const archivo = pendientes.pop()!;
    if (visto.has(archivo)) continue;
    visto.add(archivo);
    const src = leer(archivo);
    for (const m of src.matchAll(/^import\s+(?!type\b)([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
      const destino = resolver(archivo, m[2]);
      if (!destino || !destino.startsWith("components/")) continue;
      const pintados = [...m[1].matchAll(/\b([A-Z]\w*)\b/g)]
        .map((n) => n[1])
        .filter((n) => new RegExp(`<${n}[\\s/>]`).test(src));
      if (pintados.length === 0) continue;
      if (/\/index\.tsx?$/.test(destino)) {
        const barril = leer(destino);
        for (const n of pintados) {
          const exp = barril.match(new RegExp(`export \\{[^}]*\\b${n}\\b[^}]*\\} from "([^"]+)"`));
          const real = exp && resolver(destino, exp[1]);
          if (real) pendientes.push(real);
        }
        continue;
      }
      pendientes.push(destino);
    }
  }
  return visto;
}

/** ¿El archivo pinta una capa `fixed`? (clase de Tailwind o estilo en línea; no cuenta comentarios). */
function pintaFixed(src: string): boolean {
  const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
  return /["'`\s]fixed[\s"'`]/.test(sinComentarios) || /position:\s*["']fixed["']/.test(sinComentarios);
}

const GRAFO = grafo();

describe("los desplegables de la barra lateral se abren encima del contenido", () => {
  it("el recorrido del grafo encuentra la barra (si no, el resto de la guarda no prueba nada)", () => {
    for (const f of [...ENTRADAS, ...DESPLEGABLES]) {
      expect(GRAFO.has(f), `${f} ya no cuelga del sidebar: actualizá DESPLEGABLES o ENTRADAS`).toBe(true);
    }
  });

  it("toda capa `fixed` que cuelga del sidebar está declarada (desplegable o diálogo)", () => {
    const sinDeclarar = [...GRAFO].filter(
      (f) => pintaFixed(leer(f)) && !DESPLEGABLES.includes(f) && !DIALOGOS.includes(f),
    );
    expect(
      sinDeclarar,
      "Una capa nueva cuelga del sidebar. Si es un desplegable anclado a un botón (menú, flyout, " +
        "panel), va en portal a document.body con zClass(\"POPOVER\") y se suma a DESPLEGABLES; si es " +
        "un diálogo con capa propia, a DIALOGOS. `fixed` en el lugar NO alcanza: el contenedor del " +
        "rail es `sticky` y lo tapa el contenido de la página.",
    ).toEqual([]);
  });

  it.each([...DESPLEGABLES, ...DIALOGOS])("%s va en un portal a document.body", (f) => {
    const src = leer(f);
    expect(src).toMatch(/createPortal\(/);
    expect(src).toMatch(/document\.body,?\s*\)/);
  });

  it.each(DESPLEGABLES)("%s usa la capa POPOVER y ningún z-index suelto", (f) => {
    const src = leer(f);
    expect(src).toContain('zClass("POPOVER")');
    const sinComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(sinComentarios.match(/\bz-(\d+|\[\d+\])/g) ?? [], "número suelto: usá zClass(\"POPOVER\")").toEqual([]);
  });

  it("el click-afuera del panel flotante cuenta el panel en portal como adentro", () => {
    /* Con el panel fuera del árbol del trigger, un `mousedown` sobre un ítem lo cerraba antes
       del clic: el menú se abría y ningún ítem respondía. */
    const hook = leer("components/ui/usePanelFlotante.ts");
    expect(hook).toMatch(/panelRef\.current\?\.contains\(n\)/);
    expect(hook).toMatch(/!dentro\(e\.target as Node\)/);
  });
});
