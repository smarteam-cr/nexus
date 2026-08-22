/**
 * lib/ui/tooltips.test.ts
 *
 * Correr: `npx vitest run lib/ui/tooltips.test.ts --project unit`.
 *
 * LA capa de ayuda de Nexus es global y silenciosa: `TooltipLayer` se monta UNA vez en el
 * shell y adopta los ~500 `title="…"` que ya están escritos por toda la app. Esa virtud es
 * también su modo de falla — **si el montaje desaparece, no se rompe nada**: cada tooltip
 * vuelve solo a la caja negra del sistema operativo, ningún test de tipos protesta y ninguna
 * pantalla se ve rota. Se ve *peor*, en 500 lugares, y nadie lo relaciona con el commit.
 *
 * Esta guarda afirma las tres piezas que tienen que estar para que el texto llegue con el
 * tema puesto: que el shell la monte, que la capa saque el `title` nativo (o el sistema
 * operativo pinta la suya ENCIMA de la nuestra) y que no deje mudo a un botón de solo ícono.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const CAPA = leer("components/ui/Tooltip.tsx");
const SHELL = leer("components/layout/AppShell.tsx");

describe("la capa de ayuda está montada", () => {
  it("el shell interno monta <TooltipLayer /> — si no, los 500 title vuelven a la caja negra", () => {
    expect(SHELL).toContain("<TooltipLayer />");
    expect(SHELL, "el import se fue con el montaje").toMatch(
      /import \{ TooltipLayer \} from "@\/components\/ui\/Tooltip"/,
    );
  });

  it("se exporta desde la barrica de primitivas, como el resto", () => {
    expect(leer("components/ui/index.ts")).toMatch(
      /export \{ TooltipLayer, InfoHint \} from ".\/Tooltip"/,
    );
  });
});

describe("la capa hace lo único que no puede dejar de hacer", () => {
  it("saca el `title` nativo — dejarlo pinta la caja negra ENCIMA de la nuestra", () => {
    expect(CAPA).toContain('removeAttribute("title")');
    // Y lo guarda, o el texto se pierde para siempre en el primer hover.
    expect(CAPA).toContain('el.setAttribute(ATTR, nativo)');
  });

  it("no deja mudo a un elemento cuyo único nombre accesible era el `title`", () => {
    /* Un botón que es solo un ícono se lee EXCLUSIVAMENTE por su `title`. Sacarlo sin dejar
       nada lo convierte en "botón" a secas para un lector de pantalla — un regalo silencioso
       al que borre estas cuatro líneas por parecer redundantes. */
    expect(CAPA).toContain('el.setAttribute("aria-label", nativo)');
    expect(CAPA).toMatch(/aria-labelledby/);
  });

  it("vive en un portal a `body` y no roba el hover", () => {
    /* `position: fixed` dentro del árbol lo recorta cualquier ancestro con overflow-hidden
       —la tabla con scroll horizontal, el rail sticky—: es el mismo aprendizaje que
       `usePanelFlotante`. Y sin `pointer-events-none` el globo se tapa a sí mismo el trigger
       y parpadea. */
    expect(CAPA).toContain("createPortal(");
    expect(CAPA).toContain("document.body");
    expect(CAPA).toContain("pointer-events-none");
  });

  it("usa tokens del tema y no colores crudos: se ve en claro y en oscuro", () => {
    expect(CAPA).toContain("bg-surface");
    expect(CAPA).toContain("border-line");
    expect(CAPA).not.toMatch(/bg-(black|gray-\d+)\b/);
  });
});
