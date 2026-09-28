import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import {
  cuerpoDeLaNota,
  propiedadesParaHubspot,
  type ClaveDeFicha,
  type EstadoEnHubspot,
  type ValoresDeFicha,
} from "./ficha";

/**
 * lib/clients/ficha-hubspot.ts — escribe la ficha CONFIRMADA en la empresa del HubSpot de
 * Smarteam (cuenta del sistema): las propiedades que cambiaron y una nota con la evidencia.
 *
 * Nunca lanza: devuelve el estado para que la ruta lo guarde y la pantalla lo muestre. La ficha
 * ya quedó guardada en Nexus antes de llamar acá, así que un HubSpot caído no pierde nada — se
 * reintenta confirmando otra vez.
 *
 * Si las propiedades todavía no existen en HubSpot (antes de correr
 * `scripts/hubspot-crear-propiedades-ficha.ts`), el PATCH falla con 400 y el estado lo dice.
 */

/** note → company, asociación nativa de HubSpot. */
const NOTA_A_EMPRESA = 190;

export interface ResultadoEnHubspot {
  estado: EstadoEnHubspot;
  error?: string;
  notaId?: string;
}

async function textoDeError(res: Response): Promise<string> {
  const cuerpo = await res.text().catch(() => "");
  try {
    const j = JSON.parse(cuerpo) as { message?: string };
    if (j.message) return `${res.status}: ${j.message}`.slice(0, 400);
  } catch {
    /* no era JSON */
  }
  return `${res.status}: ${cuerpo}`.slice(0, 400);
}

export async function sincronizarFichaConHubspot(opts: {
  hubspotCompanyId: string | null;
  valores: ValoresDeFicha;
  /** Los campos a escribir como propiedad (los que cambiaron, o todos si hay que reintentar). */
  aEscribir: readonly ClaveDeFicha[];
  /** Si hay que dejar nota (hubo cambios de verdad). */
  conNota: boolean;
  cambios: readonly ClaveDeFicha[];
  primeraVez: boolean;
  autor: string;
  fuentes: readonly string[];
  /** Inyectable para tests. */
  hubspot?: HsClient;
}): Promise<ResultadoEnHubspot> {
  if (!opts.hubspotCompanyId) return { estado: "sin_empresa" };

  let hs: HsClient;
  try {
    hs = opts.hubspot ?? (await getSystemHubspotClient());
  } catch (e) {
    return { estado: "fallo", error: e instanceof Error ? e.message : String(e) };
  }

  const properties = propiedadesParaHubspot(opts.valores, opts.aEscribir);
  if (Object.keys(properties).length) {
    try {
      const res = await hs.apiRequest({
        method: "PATCH",
        path: `/crm/v3/objects/companies/${opts.hubspotCompanyId}`,
        body: { properties },
      });
      if (!res.ok) {
        const detalle = await textoDeError(res as unknown as Response);
        const faltan = /does not exist|PROPERTY_DOESNT_EXIST/i.test(detalle);
        return {
          estado: "fallo",
          error: faltan
            ? "Las propiedades de la ficha todavía no existen en HubSpot."
            : `HubSpot no aceptó la ficha (${detalle}).`,
        };
      }
    } catch (e) {
      return { estado: "fallo", error: `HubSpot no respondió: ${e instanceof Error ? e.message : String(e)}` };
    }
  }

  if (!opts.conNota) return { estado: "sincronizada" };

  try {
    const res = await hs.apiRequest({
      method: "POST",
      path: "/crm/v3/objects/notes",
      body: {
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: cuerpoDeLaNota({
            autor: opts.autor,
            cambios: opts.cambios,
            primeraVez: opts.primeraVez,
            valores: opts.valores,
            fuentes: opts.fuentes,
          }),
        },
        associations: [
          {
            to: { id: opts.hubspotCompanyId },
            types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: NOTA_A_EMPRESA }],
          },
        ],
      },
    });
    if (!res.ok) {
      return { estado: "parcial", error: `Se guardaron las propiedades, pero no la nota (${await textoDeError(res as unknown as Response)}).` };
    }
    const nota = (await res.json()) as { id?: string };
    return { estado: "sincronizada", notaId: nota.id };
  } catch (e) {
    return { estado: "parcial", error: `Se guardaron las propiedades, pero no la nota: ${e instanceof Error ? e.message : String(e)}` };
  }
}
