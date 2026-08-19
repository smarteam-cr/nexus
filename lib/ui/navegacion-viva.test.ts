/**
 * lib/ui/navegacion-viva.test.ts — NINGÚN ENLACE LLEVA A UNA PANTALLA QUE NO EXISTE.
 *
 * Correr: `npx vitest run lib/ui/navegacion-viva.test.ts --project unit`.
 *
 * ── EL ACCIDENTE QUE ESTE ARCHIVO CUIDA ──────────────────────────────────────────────────────
 * `components/cs/AlertsFeed.tsx` enlazaba a `/projects/{id}` — una ruta que NUNCA existió. Meses
 * en producción, un 404 a un clic de distancia del panel de alertas, y nadie lo vio: no rompe el
 * build, no rompe `tsc`, no rompe ningún test. Un enlace muerto no falla, decepciona.
 *
 * El caso gemelo es el que originó el retiro del subsistema de etapas: una fila de «Proyectos
 * internos» llevaba a `/clients/{c}/projects/{p}`, que SÍ existía pero renderizaba el canvas
 * suelto —sin pestañas, sin contexto—. Veinte minutos de diagnóstico para descubrir que no había
 * nada que diagnosticar. Al borrar esa ruta, cualquier enlace olvidado se habría vuelto un 404
 * silencioso más. Esta guarda es lo que hace que ese borrado sea seguro.
 *
 * ── QUÉ HACE ─────────────────────────────────────────────────────────────────────────────────
 * Junta TODO destino de navegación interna escrito literalmente en `app/` y `components/`
 * —`router.push`, `router.replace`, `<Link href>`, `redirect()`, `NextResponse.redirect()`— y
 * verifica que cada uno resuelva contra el árbol real de `app/`.
 *
 * ⚠ Solo ve destinos LITERALES. Una dirección armada en una variable se le escapa, y está bien:
 * el modo de falla que cuesta plata es el string escrito a mano en el JSX, que es el que nadie
 * vuelve a mirar. Por eso el piso de conteo de más abajo: sin él, romper las expresiones de
 * búsqueda dejaría el escaneo en cero y el test pasaría por vacío — la forma clásica en que una
 * guarda fs-scan se vuelve decorativa.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { RAIZ, listarTsx } from "./scan-source";

/**
 * Destinos que NO se pueden resolver contra el árbol de `app/` y son legítimos.
 * Cada entrada lleva su motivo: levantar una es un diff en castellano, no un número.
 */
const EXENTOS: { destino: string; porque: string }[] = [
  // (vacío a propósito — si hace falta la primera, escribí el porqué)
];

/** Un destino de navegación encontrado en el fuente. */
interface Destino {
  ruta: string;
  archivos: Set<string>;
}

const PATRONES: RegExp[] = [
  /router\.(?:push|replace)\(\s*[`"']([^`"'\n]+)[`"']/g,
  /href=\{?\s*[`"'](\/[^`"'\n]*)[`"']/g,
  /\bredirect\(\s*[`"'](\/[^`"'\n]*)[`"']/g,
  /NextResponse\.redirect\(\s*[`"']([^`"'\n]+)[`"']/g,
];

/** El árbol real de `app/`: cada carpeta con `page.tsx` o `route.ts` es una pantalla. */
function rutasQueExisten(): string[] {
  const rutas: string[] = [];
  for (const f of listarTsx("app")) {
    const base = path.basename(f);
    if (base !== "page.tsx" && base !== "route.ts") continue;
    // Los grupos `(shell)` organizan carpetas y NO aparecen en la dirección.
    const segs = path
      .dirname(f)
      .split(path.sep)
      .slice(1)
      .filter((s) => !/^\(.*\)$/.test(s));
    rutas.push("/" + segs.join("/"));
  }
  return rutas;
}

/** Normaliza un destino: fuera la query, el hash y las interpolaciones. */
function normalizar(crudo: string): string | null {
  const sinInterp = crudo.replace(/\$\{[^}]*\}/g, "*");
  const soloRuta = sinInterp.split("?")[0].split("#")[0];
  if (!soloRuta.startsWith("/")) return null; // externo, relativo o una env var al frente
  const limpio = soloRuta.replace(/\/+$/, "");
  return limpio === "" ? "/" : limpio;
}

function resuelve(destino: string, rutas: string[]): boolean {
  const ds = destino.split("/");
  return rutas.some((r) => {
    const rs = r.split("/");
    const iCatch = rs.findIndex((s) => s.startsWith("[..."));
    if (iCatch >= 0) {
      return ds.length >= iCatch && rs.slice(0, iCatch).every((s, k) => s.startsWith("[") || s === ds[k]);
    }
    if (rs.length !== ds.length) return false;
    return rs.every((s, k) => s.startsWith("[") || ds[k] === "*" || s === ds[k]);
  });
}

function recolectar(): Map<string, Destino> {
  const encontrados = new Map<string, Destino>();
  for (const f of [...listarTsx("app"), ...listarTsx("components")]) {
    const src = fs.readFileSync(path.join(RAIZ, f), "utf8");
    for (const re of PATRONES) {
      for (const m of src.matchAll(new RegExp(re))) {
        const ruta = normalizar(m[1]);
        if (!ruta) continue;
        const yaEsta = encontrados.get(ruta);
        if (yaEsta) yaEsta.archivos.add(f);
        else encontrados.set(ruta, { ruta, archivos: new Set([f]) });
      }
    }
  }
  return encontrados;
}

describe("ningún enlace lleva a una pantalla que no existe", () => {
  const rutas = rutasQueExisten();
  const destinos = recolectar();

  it("el escaneo encuentra algo (si no, pasa por vacío)", () => {
    /* El piso NO es cosmético. Si alguien rompe las expresiones de búsqueda —o Next cambia la
       forma de declarar rutas— este archivo seguiría en verde sin mirar absolutamente nada. Los
       números son del 2026-08-18; suben solos con el repo y solo hay que tocarlos si BAJAN, y
       ahí conviene preguntarse por qué. */
    expect(rutas.length, "el árbol de app/ dejó de leerse").toBeGreaterThan(250);
    expect(destinos.size, "las expresiones de búsqueda dejaron de encontrar destinos").toBeGreaterThan(35);
  });

  it("⛔ todos los destinos resuelven contra el árbol real de app/", () => {
    /* La edición que la pone en rojo: apuntar cualquier `router.push` o `<Link href>` a una ruta
       que no existe — por ejemplo `/clients/[id]/stage/1` después de que el Tramo 3 la borre. */
    const exentos = new Set(EXENTOS.map((e) => e.destino));
    const rotos = [...destinos.values()]
      .filter((d) => !exentos.has(d.ruta) && !resuelve(d.ruta, rutas))
      .sort((a, b) => a.ruta.localeCompare(b.ruta));

    expect(
      rotos.map((d) => `${d.ruta}   ←  ${[...d.archivos].join(", ")}`),
      "Estos enlaces llevan a una pantalla que NO existe. Un 404 a un clic no rompe el build " +
        "ni los tests: solo decepciona a quien lo aprieta. Arreglá el destino, o si es legítimo " +
        "sumalo a EXENTOS con el porqué escrito.",
    ).toEqual([]);
  });

  it("la dirección de un proyecto sale del constructor único, no se escribe a mano", () => {
    /* Un proyecto no tiene pantalla propia: vive como pestaña de la ficha de su cliente. La ruta
       profunda `/clients/{c}/projects/{p}` existió, renderizaba el canvas suelto y se leía como
       que el proyecto había perdido todo. Escribir la dirección a mano en la próxima fila
       clickeable es exactamente cómo volvería.

       ⚠ El patrón exige que la ruta arranque una cadena (comilla o backtick antes de `/clients`):
       sin eso matchea también `/api/clients/{id}/projects/{id}`, que es una LLAMADA a la API y no
       una navegación. Ese falso positivo mandaba a "arreglar" un fetch perfectamente sano. */
    const conRutaProfunda = [...listarTsx("app"), ...listarTsx("components")].filter((f) =>
      /[`"']\/clients\/\$\{[^}]*\}\/projects\//.test(fs.readFileSync(path.join(RAIZ, f), "utf8")),
    );
    expect(
      conRutaProfunda,
      "volvió la ruta profunda del proyecto escrita a mano — usá urlDeProyecto() de lib/agents/run-url.ts",
    ).toEqual([]);
  });

  it("cada exento declara su motivo", () => {
    for (const e of EXENTOS) {
      expect(e.porque.length, `el exento "${e.destino}" no dice por qué`).toBeGreaterThan(20);
    }
  });
});
