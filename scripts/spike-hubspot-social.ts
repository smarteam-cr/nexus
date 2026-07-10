/**
 * scripts/spike-hubspot-social.ts  (SPIKE — investigación, NO producción)
 *
 * Prueba si el API (deprecado) de Social/Broadcast de HubSpot sirve para dejar un
 * post de red social como BORRADOR en el compositor de HubSpot, usando el token
 * OAuth del sistema (Smarteam) que Nexus ya guarda.
 *
 * FASE A (default, READ-ONLY):
 *   1. token-info → scopes del token (¿hay scope social?).
 *   2. GET /broadcast/v1/channels            → canales de publicación conectados.
 *   3. GET /broadcast/v1/channels/setting/publish/current (fallback/variante).
 *
 * FASE B (SOLO con --create-draft --channel=<channelKey|channelGuid>):
 *   4. POST /broadcast/v1/broadcasts { status: DRAFT } → intenta crear un borrador.
 *      Crea un borrador REAL en HubSpot (reversible: se borra desde el compositor).
 *
 * Uso:
 *   npx tsx scripts/spike-hubspot-social.ts                       # Fase A (segura)
 *   npx tsx scripts/spike-hubspot-social.ts --create-draft --channel=<key>
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import "dotenv/config";

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE = "https://api.hubapi.com";

async function systemToken(): Promise<string> {
  const acc = await prisma.hubspotAccount.findFirst({ where: { isSystem: true } });
  if (!acc) throw new Error("No hay cuenta HubSpot del sistema");
  if (new Date(acc.expiresAt) > new Date(Date.now() + 5 * 60 * 1000)) return acc.accessToken;
  const res = await fetch(`${BASE}/oauth/v1/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.HUBSPOT_CLIENT_ID!,
      client_secret: process.env.HUBSPOT_CLIENT_SECRET!,
      refresh_token: acc.refreshToken,
    }),
  });
  if (!res.ok) throw new Error("refresh falló: " + (await res.text()));
  const j = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number };
  await prisma.hubspotAccount.update({
    where: { id: acc.id },
    data: {
      accessToken: j.access_token,
      refreshToken: j.refresh_token,
      expiresAt: new Date(Date.now() + j.expires_in * 1000),
    },
  });
  return j.access_token;
}

/** GET/POST con Bearer; devuelve { status, body(texto), json(si aplica) } sin tirar. */
async function call(token: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* no-JSON */
  }
  return { status: res.status, ok: res.ok, text, json };
}

async function main() {
  const args = process.argv.slice(2);
  const createDraft = args.includes("--create-draft");
  const channelArg = args.find((a) => a.startsWith("--channel="))?.split("=")[1];

  const token = await systemToken();
  console.log("Token del sistema obtenido.\n");

  // ── 1. Scopes ──
  console.log("── 1. SCOPES DEL TOKEN ──");
  const info = await call(token, "GET", `/oauth/v1/access-tokens/${token}`);
  if (info.ok && info.json) {
    const j = info.json as { hub_id?: number; user?: string; scopes?: string[] };
    console.log(`  hub_id: ${j.hub_id} · user: ${j.user}`);
    const social = (j.scopes ?? []).filter((s) => /social|broadcast/i.test(s));
    console.log(`  scopes con "social/broadcast": ${social.length ? social.join(", ") : "❌ NINGUNO"}`);
    console.log(`  (total scopes: ${(j.scopes ?? []).length})`);
  } else {
    console.log(`  ⚠ token-info ${info.status}: ${info.text.slice(0, 200)}`);
  }

  // ── 2. Canales de publicación (variante A) ──
  console.log("\n── 2. GET /broadcast/v1/channels ──");
  const ch = await call(token, "GET", "/broadcast/v1/channels");
  console.log(`  status: ${ch.status}`);
  if (ch.ok && Array.isArray(ch.json)) {
    const channels = ch.json as Array<Record<string, unknown>>;
    console.log(`  ${channels.length} canal(es):`);
    for (const c of channels) {
      console.log(
        `    · type=${c.channel ?? c.type ?? "?"} name=${c.name ?? c.accountName ?? "?"} ` +
          `channelKey=${c.channelKey ?? "?"} channelGuid=${c.channelGuid ?? "?"}`,
      );
    }
  } else {
    console.log(`  respuesta: ${ch.text.slice(0, 400)}`);
  }

  // ── 3. Canales del usuario actual (variante B — la que funciona) ──
  console.log("\n── 3. GET /broadcast/v1/channels/setting/publish/current ──");
  const ch2 = await call(token, "GET", "/broadcast/v1/channels/setting/publish/current");
  console.log(`  status: ${ch2.status}`);
  if (ch2.ok && Array.isArray(ch2.json)) {
    const channels = ch2.json as Array<Record<string, unknown>>;
    console.log(`  ${channels.length} canal(es) conectado(s):`);
    for (const c of channels) {
      console.log(
        `    · type=${c.channelType} name=${c.name} channelId=${c.channelId} accountGuid=${c.accountGuid} channelGuid=${c.channelGuid ?? "—"} channelKey=${c.channelKey ?? "—"}`,
      );
    }
    const linkedin = channels.filter((c) => /linkedin/i.test(String(c.channelType)));
    console.log(`  LinkedIn conectado: ${linkedin.length ? "SÍ" : "❌ no (solo hay: " + channels.map((c) => c.channelType).join(", ") + ")"}`);
  } else {
    console.log(`  respuesta: ${ch2.text.slice(0, 800)}`);
  }

  // ── 4. (opcional) Crear un BORRADOR ──
  if (createDraft) {
    console.log("\n── 4. POST /broadcast/v1/broadcasts (status: DRAFT) ──");
    if (!channelArg) {
      console.log("  ⚠ Falta --channel=<channelKey|channelGuid>. Elegí uno de la lista de arriba.");
    } else {
      const isGuid = channelArg.includes("-"); // los GUID llevan guiones; los channelKey son "Red:1234"
      const body = {
        [isGuid ? "channelGuid" : "channelKey"]: channelArg,
        status: "DRAFT",
        content: {
          body: "[PRUEBA Nexus — borrar] Este es un borrador de prueba creado vía API para validar el flujo. No publicar.",
        },
      };
      console.log(`  body enviado: ${JSON.stringify(body)}`);
      const created = await call(token, "POST", "/broadcast/v1/broadcasts", body);
      console.log(`  status: ${created.status}`);
      console.log(`  respuesta: ${created.text.slice(0, 800)}`);
      if (created.ok) {
        const g = (created.json as { broadcastGuid?: string })?.broadcastGuid;
        console.log(`\n  ✅ Creado. broadcastGuid=${g} — revisá el compositor social de HubSpot y BORRALO.`);
      }
    }
  } else {
    console.log("\n(Para probar la creación del borrador: --create-draft --channel=<channelKey de arriba>)");
  }
}

main()
  .catch((e) => {
    console.error("ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
