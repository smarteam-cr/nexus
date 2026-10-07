/**
 * lib/ui/ancho-del-menu.test.ts — LOS RÓTULOS DEL MENÚ ENTRAN EN EL ANCHO QUE TIENE.
 *
 * Correr: `npx vitest run lib/ui/ancho-del-menu.test.ts --project unit`.
 *
 * El 2026-10-07 el menú pasó de `w-56` (224 px) a `w-48` (192 px): sobraban treinta y dos que el
 * centro necesita más, porque casi toda pantalla interna tiene además un panel a la derecha.
 *
 * El ancho se eligió MIDIENDO, con la tipografía real (la pila `ui-sans-serif` de Tailwind, que es
 * la que el shell usa — `--font-geist-sans` solo se aplica en la pantalla de ingreso):
 *
 *     caja del rótulo = 192 − 24 (padding del nav) − 24 (padding del ítem) − 16 (ícono) − 10 (gap)
 *                     = 118 px
 *     el rótulo más largo, «Documentación» ......................... 98 px
 *     con desplegable se van 22 px más (chevron + gap) ............. 96 px de caja
 *     el más largo de ésos, «Marketing» ............................ 63 px
 *
 * ⚠ **El modo de falla es silencioso.** Nadie mide un rótulo antes de escribirlo: se agrega
 * «Reportes de dirección» al menú, Tailwind lo trunca a «Reportes de direcci…», se ve prolijo, y
 * nada falla. Por eso esto es un CENSO y no un cálculo: no se puede medir texto sin un navegador,
 * así que lo que se congela es la LISTA que se midió. Al tocarla, el test falla y dice qué hacer.
 *
 * Si el rótulo nuevo es largo, las salidas son dos: acortarlo —casi siempre es lo correcto, un
 * menú no es el lugar de una frase— o subir el ancho acá y en `SidebarShell`, a sabiendas de lo
 * que le quitás al centro.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { APP_NAV } from "@/components/layout/nav-config";

const RAIZ = join(__dirname, "..", "..");
const leer = (p: string) => readFileSync(join(RAIZ, p), "utf8");

/** Los rótulos tal como se midieron en el navegador el 2026-10-07, con su ancho en píxeles. */
const MEDIDOS: Record<string, number> = {
  "Para ti": 38.46,
  Clientes: 48.71,
  Marketing: 63.16,
  "Éxito del cliente": 97.04,
  Ventas: 40.86,
  Finanzas: 52.6,
  Auditoría: 56.93,
  Sesiones: 53.49,
  Conocimientos: 92.44,
  "Documentación": 97.57,
  Escala: 37.15,
  Agentes: 50.54,
  Equipo: 43.08,
  Roles: 32.83,
  Feedback: 58.52,
  Integraciones: 83.21,
};

/** La caja que le toca a un rótulo del menú con `w-48`. Ver el cálculo del encabezado. */
const CAJA = 118;
/** Con desplegable, el chevron y su gap se llevan 22. */
const CAJA_CON_DESPLEGABLE = 96;

describe("el ancho del menú y sus rótulos no se mueven uno sin el otro", () => {
  it("`SidebarShell` sigue declarando el ancho que se midió", () => {
    /* Si alguien cambia el ancho sin pasar por acá, los números de este archivo pasan a mentir
       y el censo deja de proteger nada. */
    expect(
      leer("components/layout/SidebarShell.tsx"),
      'El menú ya no es `w-48`. Si lo achicaste, re-medí los rótulos; si lo agrandaste, ' +
        "actualizá CAJA y el encabezado de este archivo.",
    ).toContain('effectiveOpen ? "w-48" : "w-14"');
  });

  it("no hay un rótulo del menú que no se haya medido", () => {
    const sinMedir = APP_NAV.map((it) => it.label).filter((l) => !(l in MEDIDOS));
    expect(
      sinMedir,
      "Agregaste o renombraste un ítem del menú. Nadie mide un rótulo antes de escribirlo y " +
        `Tailwind lo trunca sin avisar: la caja son ${CAJA} px (${CAJA_CON_DESPLEGABLE} si tiene ` +
        "desplegable). Medilo y sumalo a MEDIDOS, o acortalo.",
    ).toEqual([]);
  });

  it("ninguno de los medidos se pasa de la caja", () => {
    const pasados = APP_NAV.filter((it) => {
      const ancho = MEDIDOS[it.label];
      if (ancho === undefined) return false;
      const caja = it.children || it.dynamicChildren ? CAJA_CON_DESPLEGABLE : CAJA;
      return ancho > caja;
    }).map((it) => `${it.label} (${MEDIDOS[it.label]} px)`);
    expect(pasados, "Se truncan en el menú.").toEqual([]);
  });

  it("queda aire para que el próximo rótulo no nazca truncado", () => {
    /* `w-44` (176) dejaría 4 px sobre «Documentación»: entraría hoy y truncaría el próximo. Lo
       que se compró con `w-48` son veinte, y esto lo sostiene. */
    const masLargo = Math.max(...APP_NAV.map((it) => MEDIDOS[it.label] ?? 0));
    expect(CAJA - masLargo).toBeGreaterThanOrEqual(15);
  });
});

describe("el rótulo del pie, que era el que tenía clavado el ancho", () => {
  const RUNS = leer("components/ai/RunsIndicator.tsx");

  it("en reposo dice «Corridas», no «Corridas de agentes»", () => {
    /* Pide 123 px y tenía 101 con el contador de corridas sin ver al lado — y eso ya con el menú
       en 224. Se venía cortando en «Corridas de agente…» justo cuando hay algo sin ver. Era el
       único rótulo de la columna que no entraba, y no estaba en el menú sino al pie. */
    expect(RUNS).toContain('const etiqueta = corriendo > 0 ? (fase ?? "Generando…") : "Corridas";');
  });

  it("el nombre completo sigue donde hay lugar", () => {
    // El tooltip del menú colapsado, el `aria-label` del panel y su título.
    expect(RUNS.match(/Corridas de agentes/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
