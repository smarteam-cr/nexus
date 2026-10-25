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
import { DONDE_PUEDE_TENER_TEXTO, claseDeTexto } from "@/lib/sessions/tiene-texto";
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
