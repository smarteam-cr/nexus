/**
 * app/api/mcp/route.ts — Nexus como conector de Claude: el servidor MCP (fase 0, prototipo local;
 * docs/plan-conector-claude.md).
 *
 * Transporte Streamable HTTP sin sesiones (spec 2026-07-28) con `mcp-handler` sobre el SDK oficial. Las lecturas viven en
 * lib/conector-claude/herramientas-server.ts; acá solo se verifica quién llama y se traduce.
 *
 * ⛔ En la fase 0 la ÚNICA entrada es el token de prueba (lib/conector-claude/token-de-prueba.ts), que solo vale con la
 * base local: contra producción esta ruta responde 401 a todo. La puerta OAuth por persona es la fase 1. El middleware
 * deja pasar `/api/mcp` sin la cookie de Supabase porque la autenticación es el token, acá.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { contextoDeOperacion } from "@/lib/operaciones/contexto-server";
import { personaDelConector } from "@/lib/conector-claude/persona-server";
import { tokenDePruebaValido } from "@/lib/conector-claude/token-de-prueba";
import { HERRAMIENTAS_DEL_CONECTOR, comoRespuestaDeMcp, type Herramienta } from "@/lib/conector-claude/herramientas-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const error = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });

/** Cada herramienta, con su esquema de entrada (zod) y su lectura. El SDK valida la entrada antes de llamar. */
function registrar(server: McpServer, h: Herramienta<z.ZodObject>) {
  server.registerTool(
    h.nombre,
    {
      title: h.titulo,
      description: h.descripcion,
      inputSchema: h.entrada,
      // Solo lee y solo dentro de Nexus: en claude.ai corre sin pedir aprobación cada vez.
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (args, ctx) => {
      if (!ctx.http?.authInfo) return error("Falta la autorización.");
      const t0 = Date.now();
      try {
        // Dentro del try: si la base falla al buscar a la persona, a Claude no le llega el error técnico.
        const persona = await personaDelConector({ email: process.env.NEXUS_CONECTOR_PERSONA_DE_PRUEBA ?? "" });
        if (!persona) return error("Tu usuario de Nexus no puede usar el conector.");
        const r = comoRespuestaDeMcp(await h.leer(contextoDeOperacion(persona), args));
        // El registro por llamada (fase 0: a la consola). Sin el correo ni el contenido: quién, qué herramienta y cuánto.
        console.info(`[conector] ${h.nombre} persona=${persona.id} ${Date.now() - t0}ms ${r.content[0]?.text.length ?? 0}c${r.isError ? " error" : ""}`);
        return r;
      } catch (e) {
        console.error(`[conector] ${h.nombre} falló:`, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
        return error("No pude leer Nexus ahora. Vuelve a intentarlo en un rato.");
      }
    },
  );
}

const servidor = createMcpHandler(
  (server) => {
    for (const h of HERRAMIENTAS_DEL_CONECTOR) registrar(server, h);
  },
  { serverInfo: { name: "nexus", version: "0.1.0" } },
);

/** Fase 0: solo el token de prueba, y solo con la base local. */
function verificar(_req: Request, bearer?: string) {
  const entorno = { token: process.env.NEXUS_CONECTOR_TOKEN_DE_PRUEBA, databaseUrl: process.env.DATABASE_URL, nodeEnv: process.env.NODE_ENV };
  if (!tokenDePruebaValido(bearer, entorno)) return undefined;
  return { token: "prueba-local", clientId: "prueba-local", scopes: ["nexus.leer"] };
}

const handler = withMcpAuth(servidor, verificar, { required: true });

export { handler as GET, handler as POST, handler as DELETE };
