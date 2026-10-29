/**
 * lib/tests-diagnostico/hubspot-server.ts — UNA TANDA del job `tests-hubspot` (área O, O4, 2026-10-26). SERVIDOR.
 *
 *   1. Los intentos en curso que llevan `MINUTOS_PARA_ABANDONO` sin moverse pasan a «abandonado» (la medición y la nota
 *      «SIN TERMINAR» salen de ahí).
 *   2. A cada intento que le falta algo en HubSpot: primero el formulario (el lead; solo con el correo si ya es contacto,
 *      lib/hubspot/test-del-diagnostico.ts › `EnvioDelFormulario`), después la nota y la dirección.
 *      Cada falla queda anotada en el intento (la pantalla interna la muestra y deja reintentar) y suma un intento; a los
 *      `MAX_INTENTOS_HUBSPOT` se deja de reintentar solo. Nunca se pierde un lead: el intento queda guardado en Nexus
 *      aunque HubSpot falle, e INV58 avisa del que no llegó.
 */
import "server-only";
import { configDelFormulario, dejarNotaYResultado, enviarFormulario } from "@/lib/hubspot/test-del-diagnostico";
import { anotarHubspot, marcarAbandonados, pendientesDeHubspot } from "./repositorio-server";

export const MINUTOS_PARA_ABANDONO = 60;
export const MAX_INTENTOS_HUBSPOT = 8;

export interface TandaDeHubspot {
  abandonados: number;
  formularios: number;
  /** De esos formularios, los que salieron solo con el correo (ya era contacto, o no se pudo saber). */
  soloCorreo: number;
  notas: number;
  errores: string[];
}

export async function mandarPendientesAHubspot(now: Date, env: Readonly<Record<string, string | undefined>> = process.env): Promise<TandaDeHubspot> {
  const abandonados = await marcarAbandonados(new Date(now.getTime() - MINUTOS_PARA_ABANDONO * 60_000));
  const cfg = configDelFormulario(env);
  const out: TandaDeHubspot = { abandonados, formularios: 0, soloCorreo: 0, notas: 0, errores: [] };
  if (!cfg) {
    out.errores.push("Falta TESTS_HUBSPOT_PORTAL_ID o TESTS_HUBSPOT_FORM_GUID en el .env del servidor.");
    return out;
  }
  for (const i of await pendientesDeHubspot(MAX_INTENTOS_HUBSPOT)) {
    try {
      if (!i.hubspotFormAt) {
        const envio = await enviarFormulario(i, cfg, { ultimoIntento: i.hubspotIntentos + 1 >= MAX_INTENTOS_HUBSPOT });
        await anotarHubspot(i.id, { formulario: true });
        out.formularios++;
        if (envio === "solo-correo") out.soloCorreo++;
        // La nota espera la próxima tanda: el formulario tarda en crear el contacto.
        continue;
      }
      if (i.estado === "terminado" || i.estado === "abandonado") {
        await dejarNotaYResultado(i);
        await anotarHubspot(i.id, { nota: true });
        out.notas++;
      }
    } catch (e) {
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 300);
      out.errores.push(`${i.email}: ${msg}`);
      await anotarHubspot(i.id, { error: msg }).catch(() => undefined);
    }
  }
  return out;
}
