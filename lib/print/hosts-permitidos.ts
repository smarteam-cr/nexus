/**
 * lib/print/hosts-permitidos.ts — A DÓNDE PUEDE SALIR EL NAVEGADOR QUE IMPRIME LOS PDF.
 *
 * Auditoría 2026-09-03 (A-17): `renderPathToPdf` abre un Chromium headless contra una ruta
 * interna (127.0.0.1) y lo deja pedir lo que la página quiera. Un documento con una imagen o un
 * `<link>` apuntando afuera —un `html_embed` pegado por alguien, un logo remoto— convierte al
 * servidor en un cliente HTTP que sale a cualquier host con el `pdfToken` en el Referer de la
 * navegación. La lista de destinos legítimos es corta y se puede escribir: la propia app y el
 * Storage de Supabase (los logos de los clientes). Todo lo demás se aborta, y se anota.
 *
 * Puro: se prueba en `lib/` sin levantar Chromium.
 */

/** Hosts que siempre valen: la app misma (el runner navega contra 127.0.0.1). */
const HOSTS_PROPIOS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** El host del proyecto de Supabase (logos en Storage), sacado de la env que ya existe. */
export function hostDeSupabase(env: Record<string, string | undefined> = process.env): string | null {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  try {
    return url ? new URL(url).hostname : null;
  } catch {
    return null;
  }
}

/**
 * ¿Este request del navegador headless puede salir? `data:` y `blob:` no salen a la red
 * (son el contenido mismo: diagramas rasterizados, fuentes embebidas); `about:` tampoco.
 */
export function esUrlPermitidaParaElPdf(url: string, hostsExtra: ReadonlyArray<string | null>): boolean {
  if (/^(data|blob|about):/i.test(url)) return true;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  if (HOSTS_PROPIOS.has(host)) return true;
  return hostsExtra.some((h) => !!h && h.toLowerCase() === host.toLowerCase());
}
