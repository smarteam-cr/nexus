/**
 * lib/conector-claude/herramientas-server.ts — lo que el Claude de una persona puede LEER de Nexus (fase 0 del conector,
 * docs/plan-conector-claude.md › 2.4). SERVER-ONLY.
 *
 * Cuatro lecturas: buscar una cuenta, lo que Nexus sabe de ella, sus reuniones y una reunión por partes. Cada una
 * recibe la persona (su contexto de operación) y nada más: la ruta (app/api/mcp/route.ts) solo traduce.
 *
 * ⛔ Invariante 1, y las reglas del plan (2.7):
 *  - Una cuenta por llamada, verificada en cada una con `exigirCliente` (la misma regla que `requireAccessToClient`). Las
 *    empresas de Smarteam no se leen por acá: son el trabajo interno de todos.
 *  - Las reuniones salen SOLO por la regla única de pertenencia (`whereBelongsToClient`, lib/sessions/project-sources.ts),
 *    con los mismos cortes que el chokepoint: solo las que ya ocurrieron y nunca la cancelada sin texto
 *    (`NO_ES_CANCELADA_SIN_TEXTO`, lib/sessions/canceladas.ts). Qué texto dejó, con la regla única (lib/sessions/tiene-texto.ts).
 *  - Una cuenta que la persona no ve, o una reunión o un proyecto de otra cuenta, responden lo mismo: «No existe.». No se
 *    distingue «no la ves» de «no está».
 *  - La memoria entra por el cargador único con el lector «conector» (lib/memoria/consumidores.ts): interna, nunca la
 *    lee el cliente. Nada de acá lee facturación, Partner, rentabilidad, comisiones ni salarios.
 *  - Ninguna lectura llama a la IA ni escribe.
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { memoriaDeLaCuenta, memoriaDelProyecto } from "@/lib/memoria";
import { whereBelongsToClient } from "@/lib/sessions/project-sources";
import { NO_ES_CANCELADA_SIN_TEXTO } from "@/lib/sessions/canceladas";
import { clasesDeTextoDeLasReuniones } from "@/lib/sessions/clase-de-texto-server";
import type { ClaseDeTexto } from "@/lib/sessions/tiene-texto";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { dominiosDeLaCasa } from "@/lib/sessions/reuniones-para-seguimiento";
import { resumenDeReunion } from "@/lib/contexto/material-cronograma";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { diaDeCostaRica } from "@/lib/notas/reglas";
import { ErrorDeOperacion, exigirCliente, type ContextoDeNexus } from "@/lib/operaciones/contexto-server";

/** Lo que responde una cuenta que no ve, o una reunión o un proyecto que no es de esa cuenta. */
export const NO_EXISTE = "No existe.";

export const TOPE_DE_CUENTAS = 20;
export const TOPE_DE_REUNIONES = 20;
/** Una parte de la transcripción: unos 5.000 tokens. */
export const TAMANO_DE_PARTE = 20_000;

export type Resultado = { ok: true; datos: Record<string, unknown> } | { ok: false; texto: string };

export interface Herramienta<S extends z.ZodType> {
  nombre: string;
  titulo: string;
  descripcion: string;
  entrada: S;
  leer(ctx: ContextoDeNexus, e: z.output<S>): Promise<Resultado>;
}

const definir = <S extends z.ZodType>(h: Herramienta<S>) => h;
const noExiste = (): Resultado => ({ ok: false, texto: NO_EXISTE });
/** El día de la reunión en Costa Rica: una de las 18:30 del lunes es del lunes, no del martes. */
const dia = (d: Date | null | undefined) => (d ? diaDeCostaRica(d) : null);
const TEXTO: Record<ClaseDeTexto, string> = { transcripcion: "transcripción", solo_notas: "solo notas", nada: "nada" };
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const TIPO: Record<string, string> = { CLIENTE: "cartera", PROSPECTO: "prospecto", ALIADO: "aliado" };
const idDeCuenta = z.string().trim().min(1).max(60).describe("El id de la cuenta, tal como lo da buscar_cuenta.");

interface Cuenta {
  id: string;
  nombre: string;
  tipo: string;
}

/** La cuenta, si la persona la ve y no es de Smarteam; si no, null (y la herramienta responde «No existe.»). */
async function laCuenta(ctx: ContextoDeNexus, clientId: string): Promise<Cuenta | null> {
  try {
    await exigirCliente(ctx, clientId);
  } catch (e) {
    if (e instanceof ErrorDeOperacion && e.status === 403) return null;
    throw e;
  }
  const e = (await ctx.extras.clientes()).porId.get(clientId);
  if (!e || e.kind === "INTERNO") return null;
  return { id: e.id, nombre: e.nombre, tipo: TIPO[e.kind] ?? e.kind.toLowerCase() };
}

export const BUSCAR_CUENTA = definir({
  nombre: "buscar_cuenta",
  titulo: "Buscar una cuenta",
  descripcion:
    "Busca entre las cuentas (clientes, prospectos y aliados) que esta persona ve en Nexus, por parte del nombre. Devuelve hasta 20, ordenadas por nombre: su id, el nombre, el tipo (cartera, prospecto o aliado) y sus proyectos. Las demás herramientas piden ese id.",
  entrada: z.object({
    texto: z.string().trim().max(80).optional().describe("Parte del nombre, por ejemplo «cemaco». Sin texto, todas, de a 20."),
    saltar: z.number().int().min(0).max(5000).optional().describe("Cuántas saltar, para ver las siguientes (0, 20, 40…)."),
  }),
  async leer(ctx, e) {
    const todas = [...(await ctx.extras.clientes()).porId.values()]
      .filter((c) => c.kind !== "INTERNO")
      .sort((a, b) => sinTildes(a.nombre).localeCompare(sinTildes(b.nombre), "es"));
    const q = sinTildes(e.texto ?? "");
    const halladas = q ? todas.filter((c) => sinTildes(c.nombre).includes(q)) : todas;
    const saltar = e.saltar ?? 0;
    const primeras = halladas.slice(saltar, saltar + TOPE_DE_CUENTAS);
    const proyectos = primeras.length
      ? await prisma.project.findMany({
          where: proyectoNavegableWhere({ clientId: { in: primeras.map((c) => c.id) } }),
          select: { clientId: true, name: true },
          orderBy: { createdAt: "desc" },
        })
      : [];
    return {
      ok: true,
      datos: {
        cuentas: primeras.map((c) => ({
          id: c.id,
          nombre: c.nombre,
          tipo: TIPO[c.kind] ?? c.kind.toLowerCase(),
          proyectos: proyectos.filter((p) => p.clientId === c.id).map((p) => p.name),
        })),
        total: halladas.length,
        ...(halladas.length > saltar + TOPE_DE_CUENTAS ? { hayMas: true, siguienteSaltar: saltar + TOPE_DE_CUENTAS } : { hayMas: false }),
      },
    };
  },
});

export const MEMORIA_DE_LA_CUENTA = definir({
  nombre: "memoria_de_la_cuenta",
  titulo: "Lo que Nexus sabe de una cuenta",
  descripcion:
    "Lo que Nexus ya sabe de una cuenta: la ficha (lo confirmado y lo propuesto), las personas, los procesos, la historia de sus proyectos, lo fuera de alcance, lo aprendido en la preventa y lo que dejaron las reuniones. Con un proyecto, lo de ese proyecto: lo que dejó cada reunión, los compromisos abiertos, las desviaciones del cronograma y los resultados. También lista los proyectos con su id.",
  entrada: z.object({
    cuenta: idDeCuenta,
    proyecto: z.string().trim().min(1).max(60).optional().describe("El id de un proyecto de esa cuenta (sale de la lista de proyectos de esta misma herramienta)."),
  }),
  async leer(ctx, e) {
    const c = await laCuenta(ctx, e.cuenta);
    if (!c) return noExiste();
    const proyectos = await prisma.project.findMany({
      where: proyectoNavegableWhere({ clientId: c.id }),
      select: { id: true, name: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    let proyecto: { id: string; nombre: string } | null = null;
    let texto: string;
    if (e.proyecto) {
      // Un proyecto de otra cuenta no existe para esta.
      const p = await prisma.project.findFirst({ where: { id: e.proyecto, clientId: c.id }, select: { id: true, name: true } });
      if (!p) return noExiste();
      proyecto = { id: p.id, nombre: p.name };
      texto = (await memoriaDelProyecto(p.id, { lector: "conector" })).texto;
    } else {
      texto = (await memoriaDeLaCuenta(c.id, { lector: "conector" })).texto;
    }
    return {
      ok: true,
      datos: {
        cuenta: c,
        ...(proyecto ? { proyecto } : {}),
        proyectos: proyectos.map((p) => ({ id: p.id, nombre: p.name, estado: p.status ? String(p.status) : null })),
        memoria: texto || "Nexus todavía no sabe nada de esto más allá del nombre.",
      },
    };
  },
});

export const REUNIONES = definir({
  nombre: "reuniones",
  titulo: "Las reuniones de una cuenta",
  descripcion:
    "Las reuniones con una cuenta que ya ocurrieron, de la más nueva a la más vieja, de a 20: su id, título, día (en Costa Rica), si fue con el cliente o puertas adentro, quiénes estaban, qué texto dejó (transcripción, solo notas o nada) y si tiene minuta. Con el id se lee una con leer_reunion.",
  entrada: z.object({
    cuenta: idDeCuenta,
    saltar: z.number().int().min(0).max(1000).optional().describe("Cuántas reuniones saltar desde la más nueva, para ver las anteriores (0, 20, 40…)."),
  }),
  async leer(ctx, e) {
    const c = await laCuenta(ctx, e.cuenta);
    if (!c) return noExiste();
    const saltar = e.saltar ?? 0;
    const ahora = ctx.ahora;
    // ⛔ Por la regla única de pertenencia: solo las reuniones de esta cuenta, que ya ocurrieron y no son una cancelada sin
    // texto (los mismos cortes que el chokepoint, getClientSessions).
    const filas = await prisma.firefliesSession.findMany({
      where: { ...whereBelongsToClient(c.id), date: { lte: ahora }, AND: [NO_ES_CANCELADA_SIN_TEXTO] },
      // El id desempata: dos reuniones a la misma hora no se repiten ni se pierden al pasar de página.
      orderBy: [{ date: "desc" }, { id: "desc" }],
      skip: saltar,
      take: TOPE_DE_REUNIONES + 1,
      select: { id: true, title: true, date: true, participants: true, organizerEmail: true, minute: { select: { status: true } } },
    });
    const pagina = filas.slice(0, TOPE_DE_REUNIONES);
    // Qué texto dejó cada una, con la regla única y sin traer los textos (los ids ya salieron de la pertenencia).
    const clases = await clasesDeTextoDeLasReuniones(pagina.map((f) => f.id));
    const dominios = await dominiosDeLaCasa();
    return {
      ok: true,
      datos: {
        cuenta: c,
        reuniones: pagina.map((f) => ({
          id: f.id,
          titulo: f.title,
          dia: dia(f.date),
          sala: esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios) ? "puertas adentro" : "con el cliente",
          quienes: f.participants.slice(0, 12),
          texto: TEXTO[clases.get(f.id) ?? "nada"],
          minuta: f.minute ? (f.minute.status === "DRAFT" ? "en borrador" : "revisada") : "sin minuta",
        })),
        ...(filas.length > TOPE_DE_REUNIONES ? { hayMas: true, siguienteSaltar: saltar + TOPE_DE_REUNIONES } : { hayMas: false }),
      },
    };
  },
});

export const LEER_REUNION = definir({
  nombre: "leer_reunion",
  titulo: "Leer una reunión",
  descripcion:
    "Lee una reunión de una cuenta por su id: en la parte 1, sus notas o su minuta y el comienzo de la transcripción; en las siguientes, el resto de la transcripción, de a unos 20.000 caracteres. Dice cuántas partes tiene.",
  entrada: z.object({
    cuenta: idDeCuenta,
    reunion: z.string().trim().min(1).max(200).describe("El id de la reunión, tal como lo da la herramienta reuniones."),
    parte: z.number().int().min(1).max(100).optional().describe("Qué parte de la transcripción leer (1 si no se dice)."),
  }),
  async leer(ctx, e) {
    const c = await laCuenta(ctx, e.cuenta);
    if (!c) return noExiste();
    const ahora = ctx.ahora;
    // ⛔ Por la regla única: una reunión de otra cuenta, futura o cancelada sin texto no existe para esta.
    const f = await prisma.firefliesSession.findFirst({
      where: { id: e.reunion, ...whereBelongsToClient(c.id), date: { lte: ahora }, AND: [NO_ES_CANCELADA_SIN_TEXTO] },
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        summary: true,
        transcript: true,
        minute: { select: { summary: true, decisions: true, agreements: true, risks: true, status: true } },
      },
    });
    if (!f) return noExiste();
    const texto = (f.transcript ?? "").trim();
    const partes = Math.max(1, Math.ceil(texto.length / TAMANO_DE_PARTE));
    const parte = e.parte ?? 1;
    if (parte > partes) return { ok: false, texto: `Esa reunión tiene ${partes} ${partes === 1 ? "parte" : "partes"}.` };
    const dominios = await dominiosDeLaCasa();
    return {
      ok: true,
      datos: {
        cuenta: c,
        reunion: {
          id: f.id,
          titulo: f.title,
          dia: dia(f.date),
          sala: esReunionDePuertasAdentro({ participants: f.participants, organizerEmail: f.organizerEmail }, dominios) ? "puertas adentro" : "con el cliente",
          quienes: f.participants,
        },
        ...(parte === 1 ? { notas: resumenDeReunion({ title: f.title, summary: f.summary, minuta: f.minute }).texto || null } : {}),
        transcripcion: texto.slice((parte - 1) * TAMANO_DE_PARTE, parte * TAMANO_DE_PARTE) || null,
        parte,
        de: partes,
      },
    };
  },
});

/** Las lecturas del conector, en el orden en que se ofrecen. */
export const HERRAMIENTAS_DEL_CONECTOR = [BUSCAR_CUENTA, MEMORIA_DE_LA_CUENTA, REUNIONES, LEER_REUNION] as const;

/** El resultado como respuesta de una herramienta de MCP: JSON en texto, o el error. */
export function comoRespuestaDeMcp(r: Resultado): { content: { type: "text"; text: string }[]; isError?: boolean } {
  if (!r.ok) return { content: [{ type: "text", text: r.texto }], isError: true };
  return { content: [{ type: "text", text: JSON.stringify(r.datos) }] };
}
