/**
 * scripts/ver-contexto-de-la-guia.ts — QUÉ LEEN EL ASISTENTE DE LA GUÍA Y EL AGENTE QUE LA ARMA, con los datos de una
 * exploración real (2026-10-20, el caso de CEMACO con Liliana Moreno). NO ESCRIBE y NO LLAMA A CLAUDE.
 *
 * Arma por el mismo camino que el código:
 *   1. el chat de Nexus abierto desde la guía (lib/nexus-chat/turno-server.ts): «TU CONTEXTO» (el `system` cacheado) y el
 *      bloque de la guía que va en el mensaje (`bloqueDelFoco`);
 *   2. el pedido del agente que arma la guía (`armarLaGuiaSinGuardar` › `pedidoDeLaGuia`): el mensaje que recibe.
 * Imprime los dos textos, su tamaño y una lista de qué entra y qué no: cada sesión de la exploración con lo que dejó,
 * el objetivo de la próxima, el handoff, el kickoff y las frases que se le pasen con --buscar.
 * ⚠ Imprime palabras de clientes: no sale de la PC.
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/ver-contexto-de-la-guia.ts --id <exploracionId> --por <correo>
 *   npx tsx scripts/ver-contexto-de-la-guia.ts --id … --por … --buscar "volumetr,leads" --completo
 *
 * Wherex queda fuera siempre.
 */
import "dotenv/config";
import "./lib/permitir-server-only";

process.env.DB_POOL_MAX ??= "2";

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(nombre);
  if (i > -1) return process.argv[i + 1] ?? null;
  const conIgual = process.argv.find((a) => a.startsWith(`${nombre}=`));
  return conIgual ? conIgual.slice(nombre.length + 1) : null;
}
const ID = arg("--id");
const POR = (arg("--por") ?? "").trim().toLowerCase();
const BUSCAR = (arg("--buscar") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const COMPLETO = process.argv.includes("--completo");

const tokens = (chars: number) => `${chars.toLocaleString("es-CR")} caracteres (~${Math.round(chars / 3.6).toLocaleString("es-CR")} tokens)`;

async function main() {
  if (!ID || !POR.includes("@")) {
    console.error("Uso: --id <exploracionId> --por <tu correo>");
    process.exit(1);
  }
  const { prisma } = await import("@/lib/db/prisma");
  const { loQueSeSabeDeLaCuenta } = await import("@/lib/nexus-chat/lecturas-server");
  const { contextoDeLaCuenta } = await import("@/lib/nexus-chat/prompt");
  const { contextoDelChat } = await import("@/lib/nexus-chat/herramientas-server");
  const { bloqueDelFoco } = await import("@/lib/nexus-chat/turno-server");
  const { contextoParaLaGuia } = await import("@/lib/exploraciones/agente");
  const { pedidoDeLaGuia } = await import("@/lib/exploraciones/guia-pedido");
  try {
    const exp = await prisma.exploracionDeVenta.findUnique({ where: { id: ID }, select: { clientId: true, projectId: true, marco: true, client: { select: { name: true } } } });
    const persona = await prisma.teamMember.findFirst({ where: { email: POR } });
    if (!exp || !persona) throw new Error("No encontré la exploración o a la persona.");
    if (/wherex/i.test(exp.client.name)) throw new Error("Wherex queda fuera.");
    const ahora = new Date();

    // 1. El chat.
    const saber = await loQueSeSabeDeLaCuenta(exp.clientId);
    if (!saber) throw new Error("La cuenta no existe.");
    const foco = await bloqueDelFoco({ tipo: "guia", exploracionId: ID }, exp.clientId, contextoDelChat(persona, true, ahora));
    const sistema = contextoDeLaCuenta({
      ahora,
      persona: { nombre: persona.name, email: persona.email, rol: String(persona.roleEnum), equipos: persona.area ? [persona.area] : [] },
      cuenta: saber.cuenta,
      proyectos: saber.proyectos,
      memoria: saber.memoria,
      exploracion: foco.contexto,
    });

    // 2. El agente de la guía.
    const base = await contextoParaLaGuia(ID);
    const pedido = pedidoDeLaGuia(base.ctx);
    const mensaje = String(pedido.messages[0].content);

    console.log(`\n${exp.client.name} · exploración ${ID} (${exp.marco})\n`);
    console.log(`CHAT · TU CONTEXTO (system, cacheado; con lo estable de la guía): ${tokens(sistema.length)}`);
    console.log(`CHAT · la guía en el mensaje (cada turno): ${tokens(foco.mensaje.length)}`);
    console.log(`AGENTE DE LA GUÍA · el mensaje: ${tokens(mensaje.length)}\n`);

    // Qué entra: cada sesión con lo que dejó.
    const lecturas = Object.values(base.estado.propuesta.lecturas ?? {}) as Array<{ etiqueta: string; resumen?: string; fecha?: string }>;
    const marcas = (t: string) => ({ chat: sistema.includes(t) || foco.mensaje.includes(t), agente: mensaje.includes(t) });
    const si = (b: boolean) => (b ? "sí" : "NO");
    console.log("¿Entra lo que dejó cada sesión? (se busca el comienzo de su resumen)");
    for (const l of lecturas.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))) {
      const muestra = (l.resumen ?? "").slice(0, 60);
      const m = muestra ? marcas(muestra) : { chat: false, agente: false };
      console.log(`  ${l.etiqueta.slice(0, 90)} · chat ${si(m.chat)} · agente ${si(m.agente)}`);
    }
    const proxima = base.estado.contenido.sesiones.find((s) => s.id === base.ctx.proxima.sesionId);
    if (proxima?.objetivo) {
      const m = marcas(proxima.objetivo.slice(0, 60));
      console.log(`  El objetivo de la próxima («${proxima.objetivo.slice(0, 80)}…») · chat ${si(m.chat)} · agente ${si(m.agente)}`);
    }
    for (const [rotulo, aguja] of [
      ["El handoff", "Handoff"],
      ["El kickoff", "ickoff"],
    ] as const) {
      const m = marcas(aguja);
      console.log(`  ${rotulo} (la palabra «${aguja}») · chat ${si(m.chat)} · agente ${si(m.agente)}`);
    }
    for (const b of BUSCAR) {
      const re = new RegExp(b, "i");
      console.log(`  «${b}» · chat ${si(re.test(sistema) || re.test(foco.mensaje))} · agente ${si(re.test(mensaje))}`);
    }

    const corte = (t: string) => (COMPLETO ? t : `${t.slice(0, 6_000)}${t.length > 6_000 ? "\n…(--completo para verlo entero)" : ""}`);
    console.log("\n════════ CHAT · TU CONTEXTO ════════\n" + corte(sistema));
    console.log("\n════════ CHAT · LA GUÍA EN EL MENSAJE ════════\n" + corte(foco.mensaje));
    console.log("\n════════ AGENTE DE LA GUÍA · EL MENSAJE ════════\n" + corte(mensaje));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
