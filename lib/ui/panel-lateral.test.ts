/**
 * lib/ui/panel-lateral.test.ts — LA COLUMNA DERECHA SE OCULTA CON UNA SOLA PREFERENCIA.
 *
 * `PanelLateral` (components/ui/PanelLateral.tsx) es la columna de contexto de las pantallas
 * internas, con su flechita para ocultarla. La preferencia es UNA para toda la app y vive en la
 * cookie `nexus-panel`, que lee el servidor: así la primera pintada ya sale como la persona la dejó.
 *
 * ── DE DÓNDE SALE ─────────────────────────────────────────────────────────────────────────────
 * La ficha del cliente tenía su propio «Ocultar panel», guardado en el navegador con otra clave y
 * leído en un efecto: cada carga pintaba el panel abierto y lo cerraba de un salto, y ocultarlo ahí
 * no tenía nada que ver con ocultarlo en el resto. El skeleton de /clients, además, pintaba siempre
 * la columna de 340 px aunque la página la mostrara cerrada.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const ESTE = path.join("lib", "ui", "panel-lateral.test.ts");

function archivos(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) archivos(rel, out);
    else if (/\.(ts|tsx)$/.test(e.name) && rel !== ESTE) out.push(rel);
  }
  return out;
}

describe("la columna derecha: una sola preferencia, la de `PanelLateral`", () => {
  it("⭐ nadie guarda su propia preferencia del panel en el navegador", () => {
    // La clave vieja se arma acá para que este archivo no se encuentre a sí mismo.
    const claveVieja = ["nexus", "ficha", "panel"].join("-");
    const conClavePropia = ["app", "components", "lib"]
      .flatMap((d) => archivos(d))
      .filter((rel) => {
        const src = fs.readFileSync(path.join(RAIZ, rel), "utf8");
        return src.includes(claveVieja) || /localStorage\.(get|set)Item\([^)]*panel/i.test(src);
      });
    expect(
      conClavePropia,
      "Estos archivos guardan en el navegador si el panel está abierto: usa `PanelLateral` / " +
        "`usePanelLateral` (cookie `nexus-panel`, leída en el servidor)",
    ).toEqual([]);
  });

  it("la ficha del cliente oculta su panel con `PanelLateral`, no con un estado propio", () => {
    const ficha = leer("app/(shell)/clients/[id]/WorkspaceClient.tsx");
    expect(ficha).toContain("<PanelLateral");
    expect(ficha).toContain("usePanelLateral()");
    expect(ficha, "volvió un estado propio para el panel").not.toMatch(/useState[^;]*\bpanelVisible|setPanelVisible/);
  });

  it("los skeletons de /clients y de la ficha pintan la MISMA columna que su página", () => {
    for (const rel of ["app/(shell)/clients/loading.tsx", "app/(shell)/clients/[id]/loading.tsx"]) {
      expect(leer(rel), `${rel} pinta una columna fija en vez de la de la página`).toContain("<PanelLateral");
    }
  });
});
