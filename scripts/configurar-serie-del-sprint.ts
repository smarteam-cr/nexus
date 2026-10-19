/**
 * scripts/configurar-serie-del-sprint.ts — deja configurada la reunión de un sprint (Tareas › Semana del equipo › «La
 * reunión del sprint») cuando quien lidera el sprint no puede hacerlo desde la pantalla (2026-10-18).
 *
 * La pantalla solo ofrece reuniones en las que estuvo quien lidera, porque Nexus lee la serie A NOMBRE de quien la
 * configuró (lib/tareas/fuentes-server.ts). Si quien lidera no está invitado (Alex Vanegas no está en el planning de
 * Desarrollo, que organiza Alejandro Salas), la serie queda a nombre de alguien del equipo que sí está: `--dueno`.
 *
 * Valida lo mismo que la pantalla: que la reunión sea de una serie, de puertas adentro, que el dueño esté invitado y
 * siga en el equipo, y el tope de series del sprint. Escribe por el único escritor (`escribirFuente`).
 *
 * ── QUÉ ESCRIBE ──────────────────────────────────────────────────────────────────────────────
 *   · Con --apply, una fila de `FuenteDeTareas`. Sin --apply, nada (simulacro).
 *
 * ── CÓMO SE CORRE ────────────────────────────────────────────────────────────────────────────
 *   npx tsx scripts/configurar-serie-del-sprint.ts --equipo marketing --reunion <sessionId> --dueno aortega@smarteamcr.com
 *   ALLOW_PROD_WRITE=1 npx tsx scripts/configurar-serie-del-sprint.ts … --apply
 *   Opcional: --rol planning|cierre|ambos (por defecto, el que sugiere el día y el título).
 */
import "dotenv/config";
import "./lib/permitir-server-only";
import { resolverApply } from "./lib/guard";
import { prisma } from "@/lib/db/prisma";
import { serieDe } from "@/lib/sessions/reuniones-para-tareas";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { EQUIPOS } from "@/lib/tareas/equipos";
import { MAX_SERIES_POR_SPRINT, cuandoEsLaSerie, diaYFinDeLaReunion, esDeUnaSerie } from "@/lib/tareas/fuentes";
import { rolPorDefecto, type RolDeReunion } from "@/lib/tareas/semana";
import { escribirFuente } from "@/lib/tareas/mutaciones";

const APPLY = resolverApply({ tablas: ["FuenteDeTareas"] });

function arg(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function main() {
  const equipo = arg("equipo");
  const reunionId = arg("reunion");
  const dueno = (arg("dueno") ?? "").trim().toLowerCase();
  const rolPedido = arg("rol") as RolDeReunion | null;
  if (!equipo || !reunionId || !dueno) throw new Error("Usa --equipo <clave> --reunion <sessionId> --dueno <correo> [--rol planning|cierre|ambos] [--apply]");
  if (!EQUIPOS.some((e) => e.clave === equipo)) throw new Error(`El equipo «${equipo}» no tiene sprint.`);
  if (rolPedido && !["planning", "cierre", "ambos"].includes(rolPedido)) throw new Error("--rol es planning, cierre o ambos.");

  const s = await prisma.firefliesSession.findUnique({
    where: { id: reunionId },
    select: { id: true, title: true, date: true, duration: true, googleEventId: true, participants: true, organizerEmail: true },
  });
  if (!s) throw new Error(`No existe la reunión ${reunionId}.`);
  const serie = serieDe(s.googleEventId);
  if (!esDeUnaSerie({ id: s.id, serie })) throw new Error("Esa reunión no se repite: elige una instancia de una reunión recurrente.");

  const categorias = await prisma.sessionCategory.findMany({ select: { id: true, name: true, slug: true, domains: true, kind: true, color: true } });
  if (!esReunionDePuertasAdentro({ participants: s.participants, organizerEmail: s.organizerEmail } as never, buildInternalDomainsSet(categorias))) {
    throw new Error("Esa reunión tiene invitados de afuera: la del sprint es una reunión del equipo.");
  }
  const invitados = [...s.participants, s.organizerEmail ?? ""].map((p) => p.toLowerCase());
  if (!invitados.includes(dueno)) throw new Error(`${dueno} no está invitado a esa reunión: Nexus la lee a su nombre.`);
  const tm = await prisma.teamMember.findFirst({ where: { email: { equals: dueno, mode: "insensitive" }, deactivatedAt: null }, select: { name: true } });
  if (!tm) throw new Error(`${dueno} no está activo en el equipo.`);

  const [activas, misma] = await Promise.all([
    prisma.fuenteDeTareas.count({ where: { equipo, activa: true } }),
    prisma.fuenteDeTareas.findFirst({ where: { serie: serie!, activa: true }, select: { equipo: true } }),
  ]);
  if (misma) throw new Error(`Esa serie ya la lee el sprint «${misma.equipo}».`);
  if (activas >= MAX_SERIES_POR_SPRINT) throw new Error(`El sprint «${equipo}» ya lee ${MAX_SERIES_POR_SPRINT} reuniones.`);

  const fin = new Date(+s.date + Math.max(15, s.duration || 30) * 60_000);
  const { diaSemana, finHora } = diaYFinDeLaReunion(s.date, fin);
  const fila = {
    equipo,
    duenoEmail: dueno,
    serie: serie!,
    titulo: s.title.slice(0, 200),
    rol: rolPedido ?? rolPorDefecto(s.date, s.title),
    diaSemana,
    finHora,
    personas: [] as string[],
  };
  console.log(`Sprint «${equipo}»: «${s.title}» · ${cuandoEsLaSerie({ diaSemana, finHora })} · ${fila.rol} · a nombre de ${tm.name} (${dueno}) · serie ${serie}`);
  console.log(`Quiénes están: los del área y quienes lideran el sprint. Series activas hoy en el sprint: ${activas}.`);
  if (!APPLY) {
    console.log("Simulacro: no se escribió nada. Con --apply (y ALLOW_PROD_WRITE=1) queda configurada.");
    return;
  }
  const { id } = await escribirFuente(fila);
  console.log(`✓ Configurada (${id}). La próxima reunión de la serie se lee sola entre 15 minutos y 24 horas después de terminar.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
