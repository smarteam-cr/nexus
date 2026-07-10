/**
 * lib/hubspot/social-broadcast.ts
 *
 * Borradores de posts sociales vía el API LEGACY de broadcast de HubSpot
 * (`/broadcast/v1`). ⚠️ DEPRECADO por HubSpot (scope `social`, marcado OPCIONAL en
 * la app pública) — funciona hoy pero sin SLA oficial; puede cortarse. Ver
 * docs/RUNBOOK.md. Degrada con 403 igual que tickets.ts: sin el scope `social`,
 * `{ supported: false }`.
 *
 * Validado contra el portal real de Smarteam (scripts/spike-hubspot-social.ts):
 * el GET lista los canales conectados; el POST con `status:"DRAFT"` deja el post
 * como BORRADOR en el compositor social de HubSpot (confirmado en el LinkedIn de
 * Smarteam) — no publica nada.
 *
 * Retry-401 con forceRefreshSystemToken: la cuenta del sistema es compartida
 * (PROD/local/scripts) y el refresh token ROTA (lección de company-timeline.ts).
 */
import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemHubspotClient, forceRefreshSystemToken } from "./client";

export interface SocialChannel {
  channelKey: string; // "LinkedInCompanyPage:52169371" — identificador durable para publicar
  type: string; // FacebookPage | Instagram | LinkedInCompanyPage | …
  name: string;
}

export interface ChannelsResult {
  /** false = el scope `social` no está autorizado (403) — degradar sin ruido. */
  supported: boolean;
  channels: SocialChannel[];
}

export interface DraftResult {
  channelKey: string;
  ok: boolean;
  broadcastGuid?: string;
  error?: string;
}

const CHANNELS_PATH = "/broadcast/v1/channels/setting/publish/current";
const BROADCASTS_PATH = "/broadcast/v1/broadcasts";

/** Corre fn con el client del sistema; si da 401, refresca el token y reintenta 1 vez. */
async function withRetry<T>(
  fn: (client: HsClient) => Promise<{ status: number; value: T }>,
): Promise<T> {
  let client = await getSystemHubspotClient();
  let r = await fn(client);
  if (r.status === 401) {
    await forceRefreshSystemToken();
    client = await getSystemHubspotClient();
    r = await fn(client);
  }
  return r.value;
}

/** Canales sociales conectados en HubSpot (LinkedIn/FB/IG…). 403 → supported:false. */
export async function getPublishingChannels(): Promise<ChannelsResult> {
  return withRetry<ChannelsResult>(async (client) => {
    const res = await client.apiRequest({ method: "GET", path: CHANNELS_PATH });
    if (res.status === 403) return { status: 403, value: { supported: false, channels: [] } };
    if (res.status !== 200) return { status: res.status, value: { supported: true, channels: [] } };
    const data = (await res.json()) as Array<{ channelKey?: string; channelType?: string; name?: string }>;
    const channels: SocialChannel[] = (data ?? [])
      .filter((c) => c.channelKey)
      .map((c) => ({ channelKey: c.channelKey!, type: c.channelType ?? "?", name: c.name ?? c.channelType ?? "?" }));
    return { status: 200, value: { supported: true, channels } };
  });
}

/**
 * Crea UN borrador (status DRAFT) en un canal. NO tira: cualquier excepción
 * (refresh de token fallido, red caída) se atrapa y vuelve como {ok:false, error}
 * — el caller (loop de varios canales) nunca pierde los resultados ya obtenidos.
 */
export async function createDraftBroadcast(channelKey: string, body: string): Promise<DraftResult> {
  try {
    return await withRetry<DraftResult>(async (client) => {
      const res = await client.apiRequest({
        method: "POST",
        path: BROADCASTS_PATH,
        body: { channelKey, status: "DRAFT", content: { body } },
      });
      if (res.status === 401) return { status: 401, value: { channelKey, ok: false, error: "401" } }; // → retry
      if (res.status === 200 || res.status === 201) {
        const j = (await res.json()) as { broadcastGuid?: string };
        // ok:true aunque falte broadcastGuid — HubSpot ya creó el borrador (efecto
        // externo real); no perder ese resultado solo porque no vino el guid.
        return { status: res.status, value: { channelKey, ok: true, broadcastGuid: j.broadcastGuid } };
      }
      if (res.status === 403) {
        return { status: 403, value: { channelKey, ok: false, error: "Sin permiso social en HubSpot." } };
      }
      const text = await res.text().catch(() => "");
      return { status: res.status, value: { channelKey, ok: false, error: `HubSpot ${res.status}: ${text.slice(0, 160)}` } };
    });
  } catch (e) {
    return { channelKey, ok: false, error: e instanceof Error ? e.message : "Error de conexión con HubSpot." };
  }
}
