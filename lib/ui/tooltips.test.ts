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
 * Esta guarda afirma el ARMADO que tiene que estar para que el texto llegue con el tema
 * puesto: que el shell la monte, que la capa saque el `title` nativo (o el sistema operativo
 * pinta la suya ENCIMA de la nuestra), que lo DEVUELVA al salir —sin eso rompe la hidratación
 * de la pantalla que toca— y que no deje mudo a un botón de solo ícono.
 *
 * El comportamiento del préstamo se prueba de verdad, contra un nodo, en
 * `lib/ui/prestamo-de-title.test.ts`. Acá solo se sostiene el cableado, que ningún test de
 * tipos protege: la capa puede dejar de usar el préstamo y todo seguiría compilando.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

const CAPA = leer("components/ui/Tooltip.tsx");
const PRESTAMO = leer("lib/ui/prestamo-de-title.ts");
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
    expect(PRESTAMO).toContain('el.removeAttribute("title")');
    // Y lo guarda, o el texto se pierde para siempre en el primer hover.
    expect(PRESTAMO).toContain("prestados.set(el,");
  });

  it("y lo DEVUELVE — sin eso, la capa rompe la hidratación de la pantalla que toca", () => {
    /* No es cosmético. La capa vive en el shell, que hidrata primero, y escucha el documento
       entero: en una pantalla grande puede sacarle el `title` a un nodo que React todavía no
       hidrató. Si no vuelve, React encuentra un DOM que no coincide con lo que renderiza.
       El comportamiento se prueba de verdad en `prestamo-de-title.test.ts`; esto sostiene el
       ARMADO, que ningún test de tipos protege. */
    expect(PRESTAMO).toContain('el.setAttribute("title", p.texto)');
    expect(CAPA, "la capa dejó de usar el préstamo").toMatch(
      /import \{[^}]*crearPrestamoDeTitle[^}]*\} from "@\/lib\/ui\/prestamo-de-title"/,
    );
    expect(CAPA, "el préstamo tiene que saldarse al desmontar la capa").toContain(
      "fijarPrestado(null)",
    );
    /* Y la otra mitad: mientras el documento sigue llegando la capa no toca nada. Sin esta
       línea el error vuelve para quien deja el mouse quieto sobre una tabla que carga. */
    expect(CAPA, "la capa dejó de abstenerse durante la carga").toContain(
      "sePuedePrestar(document.readyState)",
    );
  });

  it("no guarda el texto en el DOM: un atributo que React no renderiza ES la diferencia", () => {
    /* La versión vieja lo guardaba en un `data-nexus-tip` sobre el mismo nodo, y ese atributo
       —que ningún componente de la app escribe— era la mitad visible del error. El texto vive
       ahora en un WeakMap. La capa no escribe atributos: TODO pasa por el préstamo. */
    expect(CAPA).not.toMatch(/setAttribute\(/);
    expect(CAPA).not.toMatch(/data-nexus-tip"/);
  });

  it("no deja mudo a un elemento cuyo único nombre accesible era el `title`", () => {
    /* Un botón que es solo un ícono se lee EXCLUSIVAMENTE por su `title`. Sacarlo sin dejar
       nada lo convierte en "botón" a secas para un lector de pantalla — un regalo silencioso
       al que borre estas cuatro líneas por parecer redundantes. */
    expect(PRESTAMO).toContain('el.setAttribute("aria-label", nativo)');
    expect(PRESTAMO).toMatch(/aria-labelledby/);
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
