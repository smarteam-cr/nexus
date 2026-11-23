/**
 * lib/conector-claude/ruta.test.ts — el candado de producción EN LA RUTA (app/api/mcp/route.ts), no solo en la función
 * que revisa el token: si alguien le cambia lo que le pasa a `tokenDePruebaValido` o le quita el «obligatorio», esto se
 * pone en rojo. No toca la base: la lista de herramientas no lee nada.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { POST } from "@/app/api/mcp/route";

const TOKEN = "t".repeat(48);
const LOCAL = "postgresql://postgres:postgres@localhost:5433/nexus_local";
const PROD = "postgresql://postgres.abc:x@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

function pedirLasHerramientas(token?: string) {
  return POST(
    new Request("http://localhost:3005/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": "2025-06-18",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("⛔ /api/mcp solo abre con el token de prueba y la base local", () => {
  it("con la base de producción responde 401, aunque el token esté bien", async () => {
    vi.stubEnv("NEXUS_CONECTOR_TOKEN_DE_PRUEBA", TOKEN);
    vi.stubEnv("DATABASE_URL", PROD);
    expect((await pedirLasHerramientas(TOKEN)).status).toBe(401);
  });

  it("en un build de producción responde 401, aunque la base se vea local", async () => {
    vi.stubEnv("NEXUS_CONECTOR_TOKEN_DE_PRUEBA", TOKEN);
    vi.stubEnv("DATABASE_URL", LOCAL);
    vi.stubEnv("NODE_ENV", "production");
    expect((await pedirLasHerramientas(TOKEN)).status).toBe(401);
  });

  it("sin token, o con otro, responde 401", async () => {
    vi.stubEnv("NEXUS_CONECTOR_TOKEN_DE_PRUEBA", TOKEN);
    vi.stubEnv("DATABASE_URL", LOCAL);
    expect((await pedirLasHerramientas()).status).toBe(401);
    expect((await pedirLasHerramientas(`${TOKEN}x`)).status).toBe(401);
  });

  it("con el token y la base local, da las cuatro lecturas, todas de solo lectura", async () => {
    vi.stubEnv("NEXUS_CONECTOR_TOKEN_DE_PRUEBA", TOKEN);
    vi.stubEnv("DATABASE_URL", LOCAL);
    const r = await pedirLasHerramientas(TOKEN);
    expect(r.status).toBe(200);
    const texto = await r.text();
    const datos = texto.includes("data:") ? texto.slice(texto.indexOf("data:") + 5).trim().split("\n")[0] : texto;
    const herramientas = (JSON.parse(datos) as { result: { tools: { name: string; annotations?: { readOnlyHint?: boolean } }[] } }).result.tools;
    expect(herramientas.map((h) => h.name)).toEqual(["buscar_cuenta", "memoria_de_la_cuenta", "reuniones", "leer_reunion"]);
    expect(herramientas.every((h) => h.annotations?.readOnlyHint === true)).toBe(true);
  });
});
