/**
 * La preferencia de la columna derecha (`PanelLateral`), legible en el SERVIDOR.
 *
 * ⚠ Vive acá y NO en PanelLateral.tsx: ese módulo es "use client", y un Server Component
 * (`AppShell`) no puede LLAMAR una función exportada desde ahí — revienta la página con
 * «Attempted to call panelAbiertoDesdeCookie() from the server». Mismo caso que
 * `button-variants.ts` (lo vigila lib/ui/funciones-de-cliente.test.ts).
 */
export const COOKIE_PANEL_LATERAL = "nexus-panel";

/** Lee la preferencia en el SERVIDOR. Default: abierto (la columna es útil; esconderla se elige). */
export function panelAbiertoDesdeCookie(valor: string | undefined): boolean {
  return valor !== "collapsed";
}
