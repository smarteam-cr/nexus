/**
 * lib/invariantes/reuniones.ts — los invariantes de la SALUD DE LAS REUNIONES (T1, 2026-10-24;
 * docs/reuniones-pieza-angular-plan.md).
 *
 * Una reunión con alguien de fuera tiene que terminar en un estado a la vista: leída con su empresa, sin texto con su
 * motivo, o sin empresa esperando que alguien decida. INV47 vigila la peor: una reunión CON texto que no llega a ninguna
 * empresa, en silencio. Medido el 2026-10-23: 67 en 90 días (Nexus no tenía esas empresas, eran aliados o correos
 * personales). Las de antes de la ventana las resuelve T3; la ventana es la de INV44 (14 días).
 */
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import { esRecursoDeCalendario } from "@/lib/sessions/dominio-propio";
import { DONDE_NO_TIENE_TRANSCRIPCION, DONDE_PUEDE_TENER_TEXTO, claseDeTexto } from "@/lib/sessions/tiene-texto";
import { DIAS_DE_FRESCURA } from "@/lib/lecturas/reglas";
import { HORAS_SIN_EMPRESA, vencioSinEmpresa } from "@/lib/sessions/salud-de-las-reuniones";
import { cumple, viola, type Invariante } from "./contrato";
import type { PrismaClient } from "@prisma/client";

const DIA_MS = 86_400_000;
/** Cuánto puede esperar una reunión con texto a que alguien le ponga empresa: la regla del tablero de salud (T1). */
export { HORAS_SIN_EMPRESA };

/**
 * ⚠ INV47 nació «no bloquea» (2026-10-24): el día que se escribió contaba reuniones de FACO (facocr.com, de Honda Costa
 * Rica), entrevistas con correos personales y aliados sin ficha. Avisa sin poner el semáforo en rojo hasta su primer
 * verde; ese día se cambia esta línea a `true` (el patrón de INV4, INV6 e INV13).
 */
export const INV47_BLOQUEA = false;

const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");
const dia = (d: Date) => new Date(d).toISOString().slice(0, 10);

export interface ReunionSinEmpresa {
  id: string;
  title: string;
  date: Date;
  organizerEmail: string | null;
  /** Los dominios de fuera que estuvieron. */
  dominios: string[];
  clase: "transcripcion" | "solo_notas";
}

/**
 * Las reuniones de los últimos 14 días con texto (lib/sessions/tiene-texto.ts) y con alguien de fuera, sin empresa
 * (ni la resuelta ni la manual), cuyo texto llegó hace más de 48 horas. Sin blobs en la primera consulta: el texto se
 * trae solo de las que quedan, de a 50.
 */
export async function reunionesConTextoSinEmpresa(db: PrismaClient, ahora: Date): Promise<ReunionSinEmpresa[]> {
  const desde = new Date(+ahora - DIAS_DE_FRESCURA * DIA_MS);
  const llegoAntesDe = new Date(+ahora - HORAS_SIN_EMPRESA * 3_600_000);
  const candidatas = (
    await db.firefliesSession.findMany({
      where: {
        date: { gte: desde, lte: ahora },
        enrichedAt: { not: null, lte: llegoAntesDe },
        resolvedClientId: null,
        manualClientId: null,
        AND: [DONDE_PUEDE_TENER_TEXTO],
      },
      select: { id: true, title: true, date: true, enrichedAt: true, participants: true, organizerEmail: true },
      orderBy: { date: "desc" },
    })
  ).filter((s) => +s.date >= +desde && +s.date <= +ahora && vencioSinEmpresa(s, ahora));
  if (!candidatas.length) return [];

  const propios = buildInternalDomainsSet(await db.sessionCategory.findMany({ select: { domains: true, kind: true } }));
  const deFuera = candidatas
    .map((s) => {
      const gente = [...(s.participants ?? []), s.organizerEmail ?? ""].map((e) => e.trim().toLowerCase()).filter((e) => e.includes("@") && !esRecursoDeCalendario(e));
      const dominios = [...new Set(gente.map((e) => e.split("@")[1]).filter((d) => !!d && !propios.has(d)))];
      return { s, dominios };
    })
    .filter(({ s, dominios }) => dominios.length > 0 && !esReunionDePuertasAdentro({ participants: s.participants ?? [], organizerEmail: s.organizerEmail ?? null }, propios));

  const salida: ReunionSinEmpresa[] = [];
  for (let i = 0; i < deFuera.length; i += 50) {
    const tanda = deFuera.slice(i, i + 50);
    const textos = new Map(
      (await db.firefliesSession.findMany({ where: { id: { in: tanda.map((x) => x.s.id) } }, select: { id: true, transcript: true, summary: true } })).map((f) => [f.id, f]),
    );
    for (const { s, dominios } of tanda) {
      const t = textos.get(s.id);
      const clase = t ? claseDeTexto(t) : "nada";
      if (clase === "nada") continue;
      salida.push({ id: s.id, title: s.title, date: s.date, organizerEmail: s.organizerEmail ?? null, dominios, clase });
    }
  }
  return salida;
}

/**
 * INV47 · Ninguna reunión de los últimos 14 días con texto e invitados de fuera queda sin empresa por más de 48 horas.
 * Remedio: ponerle su empresa en /sessions (o, si la empresa no existe en Nexus, traerla de HubSpot); si es de puertas
 * adentro con un invitado personal, asignarla a Smarteam.
 */
export const INV47: Invariante = {
  id: "47",
  nombre: "ninguna reunión reciente con texto queda sin empresa",
  async correr(db, ahora) {
    const sinEmpresa = await reunionesConTextoSinEmpresa(db, ahora);
    if (!sinEmpresa.length) return cumple(`✓ INV47: ninguna reunión de los últimos ${DIAS_DE_FRESCURA} días con texto y gente de fuera lleva más de ${HORAS_SIN_EMPRESA} h sin empresa.`);
    const detalle = lista(sinEmpresa.map((s) => `«${s.title}» (${s.id}), ${dia(s.date)}, ${s.dominios.join(", ")}${s.clase === "solo_notas" ? ", solo notas" : ""}`));
    const remedio = "    Remedio: ponerle su empresa en /sessions (si la empresa no está en Nexus, traerla de HubSpot); si es interna con un invitado personal, asignarla a Smarteam.";
    const titular = `${sinEmpresa.length} reunión(es) de los últimos ${DIAS_DE_FRESCURA} días con texto y gente de fuera llevan más de ${HORAS_SIN_EMPRESA} h sin empresa`;
    if (!INV47_BLOQUEA) return cumple(`⚠ INV47 (no bloquea hasta su primer verde): ${titular}.`, detalle, remedio);
    return viola(`✗ INV47 VIOLADO: ${titular}.\n${detalle}\n${remedio}`);
  },
};

/**
 * ⚠ INV52 nació «no bloquea» (2026-10-25, T4): el día que se escribió ninguna reunión tenía su motivo guardado (lo
 * escribe el job `reuniones-motivos`, que nace con el deploy). El día de su primer verde se cambia esta línea a `true`.
 */
export const INV52_BLOQUEA = false;
/** Cuánto puede tardar el motivo en guardarse después de que la reunión terminó: lo que se espera la transcripción. */
export const HORAS_PARA_EL_MOTIVO = 48;

export interface ReunionSinMotivo {
  id: string;
  title: string;
  date: Date;
  empresa: string | null;
}

/** ¿El error es «a la base le falta la columna» (P2022)? El SQL de T4 todavía no se aplicó. */
function faltaLaColumna(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  return code === "P2022" || code === "42703" || /column .* does not exist/i.test(e instanceof Error ? e.message : "");
}

/**
 * Las reuniones de los últimos 14 días con empresa y sin texto (ni lo que contó una persona), que terminaron hace más de
 * 48 horas y no tienen su motivo guardado (`motivoSinTexto`). null = a la base le falta el SQL de T4. Sin la
 * transcripción en la consulta: las que tienen una (no vacía) quedan afuera ahí mismo; las notas se miden acá.
 */
export async function reunionesSinTextoNiMotivo(db: PrismaClient, ahora: Date): Promise<ReunionSinMotivo[] | null> {
  const desde = new Date(+ahora - DIAS_DE_FRESCURA * DIA_MS);
  const terminoAntesDe = +ahora - HORAS_PARA_EL_MOTIVO * 3_600_000;
  let filas: { id: string; title: string; date: Date; duration: number | null; summary: unknown; resolvedClient: { name: string } | null; manualClient: { name: string } | null }[];
  try {
    filas = await db.firefliesSession.findMany({
      where: {
        date: { gte: desde, lte: new Date(terminoAntesDe) },
        motivoSinTexto: null,
        OR: [{ resolvedClientId: { not: null } }, { manualClientId: { not: null } }],
        AND: [DONDE_NO_TIENE_TRANSCRIPCION],
      },
      select: { id: true, title: true, date: true, duration: true, summary: true, resolvedClient: { select: { name: true } }, manualClient: { select: { name: true } } },
      orderBy: { date: "desc" },
    });
  } catch (e) {
    if (faltaLaColumna(e)) return null;
    throw e;
  }
  return filas
    .filter((s) => +s.date + Math.max(0, s.duration ?? 0) * 60_000 <= terminoAntesDe)
    .filter((s) => claseDeTexto({ transcript: null, summary: s.summary }) === "nada" && !tieneMarcaAMano(s.summary))
    .map((s) => ({ id: s.id, title: s.title, date: s.date, empresa: s.resolvedClient?.name ?? s.manualClient?.name ?? null }));
}

/** ¿Lo agregó una persona (la marca `aMano`)? Eso es texto aunque sea corto. */
function tieneMarcaAMano(summary: unknown): boolean {
  return !!summary && typeof summary === "object" && !Array.isArray(summary) && "aMano" in summary;
}

/**
 * INV52 · Cada reunión de los últimos 14 días con empresa que terminó sin texto hace más de 48 horas tiene su motivo
 * guardado (T4): la reunión le dice a quien la organizó por qué no dejó texto y cómo evitarlo. Remedio: que corra el job
 * `reuniones-motivos` (cada 10 minutos).
 */
export const INV52: Invariante = {
  id: "52",
  nombre: "cada reunión sin texto dice por qué",
  async correr(db, ahora) {
    const sinMotivo = await reunionesSinTextoNiMotivo(db, ahora);
    if (sinMotivo === null) return cumple("⚠ INV52 no aplica todavía: a la base le falta scripts/sql/2026-10-25-reuniones-parte-2.sql.");
    if (!sinMotivo.length) return cumple(`✓ INV52: toda reunión de los últimos ${DIAS_DE_FRESCURA} días con empresa que terminó sin texto tiene su motivo guardado.`);
    const detalle = lista(sinMotivo.map((s) => `«${s.title}» (${s.id}), ${dia(s.date)}, ${s.empresa ?? "sin nombre"}`));
    const remedio = "    Remedio: que corra el job reuniones-motivos (Integraciones › semáforo de jobs; corre cada 10 minutos). Para mirar sin escribir: npx tsx scripts/medir-motivos-sin-texto.ts.";
    const titular = `${sinMotivo.length} reunión(es) de los últimos ${DIAS_DE_FRESCURA} días terminaron sin texto hace más de ${HORAS_PARA_EL_MOTIVO} h y no tienen su motivo guardado`;
    if (!INV52_BLOQUEA) return cumple(`⚠ INV52 (no bloquea hasta su primer verde): ${titular}.`, detalle, remedio);
    return viola(`✗ INV52 VIOLADO: ${titular}.
${detalle}
${remedio}`);
  },
};
