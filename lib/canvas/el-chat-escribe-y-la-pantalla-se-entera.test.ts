/**
 * lib/canvas/el-chat-escribe-y-la-pantalla-se-entera.test.ts
 *
 * ── EL FALLO ─────────────────────────────────────────────────────────────────────────────────
 * Elías, sobre el kickoff (2026-08-23): «agregá a Elías y quitá a Lidia» → el chat dijo «Aplicado»,
 * Lidia siguió en pantalla y Elías quedó sin seleccionar. Lo mismo con las franjas horarias. Las
 * dos veces se corrigió al refrescar.
 *
 * ⭐ El camino de escritura funcionaba ENTERO. Se cortaba en el último metro: tres editores del
 * kickoff sembraban su borrador con `useState(() => …)` y no volvían a mirar la prop. Eran los
 * ÚNICOS 3 del motor así — los otros 49 componentes nunca dieron el problema.
 *
 * ⛔ Y LA MITAD INVISIBLE ERA PEOR: esos editores comitean el borrador ENTERO, así que la próxima
 * tecla del CSE persistía el borrador viejo y REVERTÍA EN LA BASE lo que había escrito el chat.
 *
 * ── POR QUÉ ESTE ARCHIVO TIENE DOS MITADES ───────────────────────────────────────────────────
 * La decisión es PURA y se prueba de verdad. Pero lo que falló no fue la decisión —no existía—:
 * fue que tres componentes tomaron la misma decisión local sin que nada los mirara. Por eso la
 * segunda mitad es un CENSO: no prueba que el mecanismo ande, prueba que nadie lo esquive.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { RAIZ } from "@/lib/ui/scan-source";
import { claveDeContenido, debeResembrar } from "@/lib/ui/borrador-sincronizado";

const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), "utf8");

const CURADOS = [
  "components/canvas/kickoff-sections/EquipoSection.tsx",
  "components/canvas/kickoff-sections/HorariosSection.tsx",
  "components/canvas/kickoff-sections/CanalesSection.tsx",
];

describe("⭐ el borrador se re-siembra cuando el documento cambia por afuera", () => {
  it("mismo CONTENIDO no re-siembra, aunque sea otro objeto", () => {
    /* ⛔ Éste es el corazón. El memo del workspace se recalcula en cada escritura optimista y en
       cada refetch, así que la identidad cambia sin que cambie el contenido. Comparar por `!==`
       re-sembraría a cada rato — y cada re-siembra espuria es un candidato a matar el foco
       mientras el CSE escribe, que es exactamente el miedo que frenó este arreglo. */
    const a = { members: [{ teamMemberId: "x", name: "Lidia" }] };
    const b = { members: [{ teamMemberId: "x", name: "Lidia" }] };
    expect(a).not.toBe(b);
    expect(debeResembrar(claveDeContenido(a), claveDeContenido(b))).toBe(false);
  });

  it("contenido distinto SÍ re-siembra — el caso de Elías", () => {
    const antes = [{ teamMemberId: "1", name: "Lidia" }];
    const despues = [{ teamMemberId: "2", name: "Elías" }];
    expect(debeResembrar(claveDeContenido(antes), claveDeContenido(despues))).toBe(true);
  });

  it("un cambio de ORDEN también cuenta: reordenar es un cambio", () => {
    const a = ["Martes 11:00", "Jueves 11:00"];
    const b = ["Jueves 11:00", "Martes 11:00"];
    expect(debeResembrar(claveDeContenido(a), claveDeContenido(b))).toBe(true);
  });

  it("⚠ lo que no se puede serializar degrada a «cambió», no a «no cambió»", () => {
    /* Re-sembrar de más se ve; no re-sembrar pierde trabajo. El lado seguro es el ruidoso. */
    const ciclo: Record<string, unknown> = {};
    ciclo.yo = ciclo;
    expect(debeResembrar("lo-que-sea", claveDeContenido(ciclo))).toBe(true);
  });

  it("undefined y null son claves distintas y estables", () => {
    expect(claveDeContenido(undefined)).toBe(claveDeContenido(undefined));
    expect(debeResembrar(claveDeContenido(undefined), claveDeContenido(null))).toBe(true);
  });
});

describe("⛔ el censo: nadie vuelve a espejar contenido sin re-sincronizar", () => {
  it("los tres editores curados usan el borrador sincronizado", () => {
    /* La edición que la pone en rojo: volver cualquiera a `useState(() => …)`. */
    for (const f of CURADOS) {
      const src = leer(f);
      expect(src, `${f} dejó de re-sembrar su borrador`).toContain("useBorrador");
      expect(src, `${f} volvió a sembrar el borrador una sola vez`).not.toMatch(
        /useState<[^>]*>\(\(\) =>/,
      );
    }
  });

  it("⭐ y un CUARTO componente que lo repita se caza antes de llegar a pantalla", () => {
    /* Lo que falló no fue el mecanismo —no existía—: fue que tres componentes tomaron la misma
       decisión local sin que nada los mirara. Esto mira.

       ESPEJO = un `useState` cuya semilla sale de la prop de datos. Si además el componente
       comitea el objeto entero (`onChange?.(`), su borrador viejo es AUTORITATIVO y puede revertir
       en la base lo que escribió el chat — que es el daño real. */
    const dir = path.join(RAIZ, "components");
    const tsx: string[] = [];
    const caminar = (d: string) => {
      for (const n of fs.readdirSync(d)) {
        const full = path.join(d, n);
        if (fs.statSync(full).isDirectory()) caminar(full);
        else if (n.endsWith(".tsx")) tsx.push(full);
      }
    };
    caminar(dir);
    expect(tsx.length, "el censo no está mirando nada").toBeGreaterThan(100);

    /** Un `useState` sembrado de `data`/`view` — el patrón que rompió. */
    const SEMILLA = /useState\s*(<[^>]*>)?\s*\(\s*\(\)\s*=>[^;]*\b(data|view)\b/;

    const sospechosos = tsx.filter((f) => {
      const src = fs
        .readFileSync(f, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/^\s*\/\/.*$/gm, "");
      if (!SEMILLA.test(src)) return false;
      if (!/onChange\?\.\(/.test(src)) return false; // sin commit del objeto entero no hay daño
      return !src.includes("useBorrador");
    });

    expect(
      sospechosos.map((f) => path.relative(RAIZ, f)),
      "un componente espeja contenido en estado local sin re-sincronizar: el chat va a escribir, " +
        "la pantalla no se va a enterar, y la próxima tecla va a revertirlo en la base. " +
        "Usá `useBorrador` (components/canvas/kickoff-sections/useBorrador.ts).",
    ).toEqual([]);
  });

  it("⛔ la re-siembra va durante el RENDER, nunca en un efecto", () => {
    /* Un `useEffect` dispara `set-state-in-effect` y pinta un frame con el valor viejo. Es el
       idioma que el repo ya eligió dos veces (`PopInput`, `MdTextarea`). */
    /* ⚠ Sin comentarios: el docblock del hook NOMBRA `useEffect` para prohibirlo, y contarlo sería
       un falso positivo que enseña a ignorar la guarda. */
    const hook = leer("components/canvas/kickoff-sections/useBorrador.ts")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(hook).toContain("debeResembrar(");
    expect(hook, "la re-siembra se mudó a un efecto").not.toContain("useEffect");
  });
});
