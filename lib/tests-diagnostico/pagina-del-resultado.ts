/**
 * lib/tests-diagnostico/pagina-del-resultado.ts — LO PURO DE LA PÁGINA DE RESULTADO del test público y de su PDF (28 oct).
 * Lo usan components/external/test/ResultadoDelTestVista.tsx, RadarDelResultado.tsx, CalendarioDeHubspot.tsx y las rutas
 * del PDF.
 *
 * El PDF lo arma el motor de siempre (lib/print/pdf-runner.ts: Chromium abre una página de la propia app y la imprime).
 * La página que abre es `/external/test/resultado/imprimir?t=<token>`: el token va en la CONSULTA y no en la ruta porque el
 * motor, si falla, escribe en el log la ruta sin la consulta, y el token es la llave del resultado. Las pruebas: pagina-del-resultado.test.ts.
 */

/** El token público del resultado (256 bits en base64url). */
export const TOKEN_DEL_RESULTADO = /^[A-Za-z0-9_-]{43}$/;

/** La página que imprime el motor (pública como el resultado: la llave es el token). */
export const rutaDeImpresion = (token: string) => `/external/test/resultado/imprimir?t=${encodeURIComponent(token)}`;

/** Lo que pide el botón de la página para bajar el PDF. */
export const rutaDelPdf = (token: string) => `/api/external/test/${encodeURIComponent(token)}/pdf`;

/**
 * El mensaje de un error del motor, para el log, con el token tapado: un error de navegación de Chromium trae la
 * dirección entera (`…/imprimir?t=<token>`), y el token es la llave del resultado.
 */
export function sinElToken(mensaje: string): string {
  return mensaje.replace(/([?&]t=)[^&\s"']+/g, "$1…").replace(/[A-Za-z0-9_-]{43}/g, "…");
}

// ── La vista ──────────────────────────────────────────────────────────────────

const LETRAS = ["D", "I", "F", "E", "O"] as const;

/** El puntaje sobre 100 de una dimensión: el del cálculo o, sin él, la mitad del tramo de su nivel. */
export function puntajeDeLaDimension(letra: string | null, puntaje: number | null): number {
  if (puntaje != null) return Math.max(0, Math.min(100, Math.round(puntaje)));
  const i = letra ? LETRAS.indexOf(letra as (typeof LETRAS)[number]) : -1;
  return i < 0 ? 0 : Math.round(((i + 0.5) / LETRAS.length) * 100);
}

/** Dónde cae el punto de un nivel en el radar: sobre su anillo (Deficiente el primero, Óptimo el borde). Sin nivel, 0. */
export function radioDelNivel(letra: string | null): number {
  const i = letra ? LETRAS.indexOf(letra as (typeof LETRAS)[number]) : -1;
  return i < 0 ? 0 : (i + 1) / LETRAS.length;
}

/** Parte el nombre de una dimensión en hasta dos líneas de ~`max` letras, por palabras (los rótulos del radar). */
export function lineasDelNombre(nombre: string, max = 16): string[] {
  const lineas: string[] = [];
  for (const p of nombre.split(/\s+/).filter(Boolean)) {
    const ultima = lineas[lineas.length - 1];
    if (ultima && `${ultima} ${p}`.length <= max) lineas[lineas.length - 1] = `${ultima} ${p}`;
    else lineas.push(p);
  }
  return lineas.length <= 2 ? lineas : [lineas[0], lineas.slice(1).join(" ")];
}

/** De dónde puede hablar la agenda de HubSpot incrustada (los de su script oficial, sin los de prueba). */
export const ORIGENES_DE_LA_AGENDA = ["https://meetings.hubspot.com", "https://meetings-eu1.hubspot.com", "https://app.hubspot.com", "https://app-eu1.hubspot.com"];

/**
 * La dirección del iframe de la agenda: la misma que armaba el script de HubSpot (`embed=true`, la cookie del visitante y
 * la página de origen), pero con la página SIN el token del resultado (components/external/test/CalendarioDeHubspot.tsx).
 */
export function srcDeLaAgenda(agenda: string, o: { origen: string; utk: string | null }): string {
  try {
    const u = new URL(agenda);
    u.searchParams.set("embed", "true");
    if (o.utk && /^[A-Za-z0-9-]{8,64}$/.test(o.utk)) u.searchParams.set("parentHubspotUtk", o.utk);
    u.searchParams.set("parentPageUrl", `${o.origen}/external/test/resultado`);
    return u.toString();
  } catch {
    return agenda;
  }
}
