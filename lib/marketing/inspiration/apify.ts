/**
 * lib/marketing/inspiration/apify.ts
 *
 * Implementación Apify del InspirationProvider. Actors "no cookies" de pago por
 * resultado (~$1-2/1000 posts, sin cuenta de LinkedIn) vía el endpoint síncrono
 * `run-sync-get-dataset-items` (espera server-side hasta 300s). Si algún día no
 * alcanza, cambiar a run+poll ACÁ, sin tocar callers.
 *
 * Ruteo por tipo de fuente (verificado contra los input schemas reales):
 *   - Perfil  (linkedin.com/in/…)      → apimaestro~linkedin-profile-posts  { username, limit }
 *   - Company (linkedin.com/company/…) → apimaestro~linkedin-company-posts  { company_name, limit }
 *
 * Env vars:
 *   APIFY_TOKEN                         (obligatoria)
 *   APIFY_LINKEDIN_POSTS_ACTOR          (opcional; override del actor de perfiles)
 *   APIFY_LINKEDIN_COMPANY_POSTS_ACTOR  (opcional; override del actor de companies)
 *
 * El input va EXACTO al schema del actor (sin campos extra: la corrida con campos
 * desconocidos devolvía dataset vacío). `mapItem` es Zod laxo POR ÍTEM y refleja
 * el shape REAL del output (urn = objeto {activity_urn, ugcPost_urn}; posted_at =
 * objeto {date, timestamp}; stats.total_reactions; media {type, url}): un ítem
 * que no mapea se descarta con log (degrada, no explota).
 */
import { z } from "zod";
import {
  type InspirationProvider,
  type RawInspirationPost,
  InspirationProviderError,
} from "./provider";

const DEFAULT_PROFILE_ACTOR = "apimaestro~linkedin-profile-posts";
const DEFAULT_COMPANY_ACTOR = "apimaestro~linkedin-company-posts";
const TIMEOUT_MS = 240_000; // el endpoint sync espera hasta 300s server-side

function getToken(): string {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    throw new InspirationProviderError(
      "APIFY_TOKEN no configurada en .env — agregala para poder scrapear inspiración.",
    );
  }
  return token;
}

function isCompanyUrl(profileUrl: string): boolean {
  return /linkedin\.com\/company\//i.test(profileUrl);
}

function actorFor(profileUrl: string): string {
  return isCompanyUrl(profileUrl)
    ? process.env.APIFY_LINKEDIN_COMPANY_POSTS_ACTOR || DEFAULT_COMPANY_ACTOR
    : process.env.APIFY_LINKEDIN_POSTS_ACTOR || DEFAULT_PROFILE_ACTOR;
}

/** Input EXACTO del actor (ambos aceptan username/company_name como URL completa). */
function buildActorInput(profileUrl: string, limit: number): Record<string, unknown> {
  return isCompanyUrl(profileUrl)
    ? { company_name: profileUrl, limit }
    : { username: profileUrl, limit };
}

// ── Shape REAL del output (verificado con una corrida de apimaestro) ───────────

const urnObjectSchema = z
  .object({
    activity_urn: z.union([z.string(), z.number()]).nullish(),
    ugcPost_urn: z.union([z.string(), z.number()]).nullish(),
    share_urn: z.union([z.string(), z.number()]).nullish(),
  })
  .passthrough();

const rawItemSchema = z
  .object({
    urn: z.union([z.string(), z.number(), urnObjectSchema]).optional(),
    full_urn: z.string().optional(),
    id: z.union([z.string(), z.number()]).optional(),
    url: z.string().optional(),
    post_url: z.string().optional(),
    text: z.string().optional(),
    post_text: z.string().optional(),
    commentary: z.string().optional(),
    author: z
      .object({
        name: z.string().optional(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        username: z.string().optional(),
      })
      .passthrough()
      .optional(),
    company: z.object({ name: z.string().optional() }).passthrough().optional(),
    author_name: z.string().optional(),
    stats: z
      .object({
        total_reactions: z.number().optional(),
        like: z.number().optional(),
        likes: z.number().optional(),
        comments: z.number().optional(),
        reposts: z.number().optional(),
        shares: z.number().optional(),
      })
      .passthrough()
      .optional(),
    posted_at: z
      .union([
        z.string(),
        z
          .object({ date: z.string().optional(), timestamp: z.number().optional() })
          .passthrough(),
      ])
      .optional(),
    date: z.string().optional(),
    media: z.unknown().optional(),
    images: z.unknown().optional(),
    image_url: z.string().optional(),
    post_type: z.string().optional(),
  })
  .passthrough();

function toDate(raw: unknown): Date | null {
  if (typeof raw === "string") {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }
  if (raw && typeof raw === "object") {
    const o = raw as { date?: string; timestamp?: number };
    if (typeof o.timestamp === "number") return new Date(o.timestamp);
    if (typeof o.date === "string") {
      const d = new Date(o.date);
      return isNaN(d.getTime()) ? null : d;
    }
  }
  return null;
}

function extractExternalId(item: z.infer<typeof rawItemSchema>): string {
  if (item.full_urn) return String(item.full_urn);
  const urn = item.urn;
  if (urn && typeof urn === "object") {
    const o = urn as z.infer<typeof urnObjectSchema>;
    const v = o.activity_urn ?? o.ugcPost_urn ?? o.share_urn;
    if (v != null && String(v).trim()) return String(v).trim();
  } else if (urn != null && String(urn).trim()) {
    return String(urn).trim();
  }
  return item.id != null ? String(item.id).trim() : "";
}

function hasImage(item: z.infer<typeof rawItemSchema>): boolean {
  if (typeof item.image_url === "string" && item.image_url) return true;
  const media = item.media ?? item.images;
  if (Array.isArray(media)) return media.length > 0;
  if (media && typeof media === "object") {
    const m = media as { type?: string; images?: unknown };
    if (typeof m.type === "string" && /image|photo/i.test(m.type)) return true;
    if (Array.isArray(m.images)) return m.images.length > 0;
  }
  return false;
}

/** Mapea un ítem crudo del dataset a RawInspirationPost, o null si no alcanza. */
export function mapItem(raw: unknown): RawInspirationPost | null {
  const parsed = rawItemSchema.safeParse(raw);
  if (!parsed.success) return null;
  const item = parsed.data;

  const externalId = extractExternalId(item);
  const text = (item.text ?? item.post_text ?? item.commentary ?? "").trim();
  const postedAt = toDate(item.posted_at ?? item.date);
  if (!externalId || !text || !postedAt) return null;

  const authorName =
    item.author_name ??
    item.author?.name ??
    [item.author?.first_name, item.author?.last_name].filter(Boolean).join(" ").trim() ??
    item.company?.name ??
    undefined;

  return {
    externalId,
    url: item.url ?? item.post_url,
    authorName: authorName || undefined,
    text,
    likeCount:
      item.stats?.total_reactions ?? item.stats?.like ?? item.stats?.likes ?? 0,
    commentCount: item.stats?.comments ?? 0,
    repostCount: item.stats?.reposts ?? item.stats?.shares ?? 0,
    hasImage: hasImage(item),
    postedAt,
  };
}

async function fetchRecentPosts(profileUrl: string, limit: number): Promise<RawInspirationPost[]> {
  const token = getToken();
  const actor = actorFor(profileUrl);
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}&format=json`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildActorInput(profileUrl, limit)),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new InspirationProviderError(
        `Timeout (${TIMEOUT_MS / 1000}s) scrapeando ${profileUrl}. Probá de nuevo o revisá el actor.`,
        { profileUrl },
      );
    }
    throw new InspirationProviderError(
      `No se pudo conectar con Apify: ${e instanceof Error ? e.message : "error de red"}`,
      { profileUrl },
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401 || res.status === 403) {
      throw new InspirationProviderError("APIFY_TOKEN inválido o sin permisos para el actor.", {
        profileUrl,
        status: res.status,
      });
    }
    if (res.status === 402) {
      throw new InspirationProviderError("La cuenta de Apify no tiene créditos.", {
        profileUrl,
        status: res.status,
      });
    }
    if (res.status === 404) {
      throw new InspirationProviderError(
        `El actor "${actor}" no existe en Apify (revisá las env APIFY_*_ACTOR).`,
        { profileUrl, status: res.status },
      );
    }
    throw new InspirationProviderError(`Apify devolvió ${res.status}: ${body}`, {
      profileUrl,
      status: res.status,
    });
  }

  const data: unknown = await res.json().catch(() => null);
  if (!Array.isArray(data)) {
    throw new InspirationProviderError(
      `Apify no devolvió un dataset (¿el actor "${actor}" cambió su output?).`,
      { profileUrl },
    );
  }

  const mapped = data.map(mapItem).filter((p): p is RawInspirationPost => p !== null);
  const dropped = data.length - mapped.length;
  if (dropped > 0) {
    console.warn(
      `[inspiration/apify] ${dropped}/${data.length} ítems descartados por shape desconocido (${profileUrl})`,
    );
  }
  if (data.length === 0) {
    console.warn(`[inspiration/apify] dataset vacío para ${profileUrl} (actor ${actor})`);
  }
  return mapped.slice(0, limit);
}

export const apifyProvider: InspirationProvider = {
  name: "apify",
  fetchRecentPosts,
};
