/**
 * lib/invariantes/hechos.ts — el invariante de los HECHOS de las reuniones (memoria de la cuenta, etapa 6; DECISIONS
 * «Hechos, enrutador y novedades»). La invariante medular #1 llevada a los hechos: lo que dijo una reunión de Wherex no
 * puede quedar como hecho de Honda.
 */
import type { PrismaClient } from "@prisma/client";
import { NOTA_CAMBIO_DE_DUENO, SQL_DE_LOS_HECHOS } from "@/lib/seguimiento/hechos/reglas";
import { cumple, viola, type Invariante } from "./contrato";

/**
 * Una base sin la tabla (producción antes de aplicar el SQL) no puede violar nada: no hay filas. Copia de la guarda de
 * Tareas (lib/invariantes/tareas.ts), con su propio mensaje. Una columna que falta (P2022) no es esto: sube.
 */
export function faltaLaTablaDeLosHechos(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  if (code === "P2021" || code === "42P01") return true;
  return /table .* does not exist in the current database|no existe la relación/i.test(e instanceof Error ? e.message : "");
}

const lista = (xs: string[], max = 8) => xs.slice(0, max).map((x) => `    · ${x}`).join("\n") + (xs.length > max ? `\n    · y ${xs.length - max} más` : "");
const corto = (s: string, n = 70) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Por qué un hecho vivo no es del cliente de su reunión. */
export type MotivoFueraDeSuCliente = "otro_cliente" | "interno" | "aliado" | "proyecto_de_otro_cliente";

/** La nota con que se retira (lib/seguimiento/hechos-server.ts › `retirarHechos`): la ve quien abre el hecho. */
export const NOTA_POR_MOTIVO: Record<MotivoFueraDeSuCliente, string> = {
  otro_cliente: NOTA_CAMBIO_DE_DUENO,
  interno: "La empresa es de Smarteam: sus reuniones no dejan hechos",
  aliado: "La empresa es un aliado: sus reuniones no dejan hechos",
  proyecto_de_otro_cliente: "El proyecto es de otro cliente",
};

export interface HechoFueraDeSuCliente {
  id: string;
  sessionId: string | null;
  motivo: MotivoFueraDeSuCliente;
  /** Una línea para el reporte: la frase, el id y por qué. */
  linea: string;
}

/**
 * Los hechos VIVOS (`estado = pendiente`: esperan a una persona o siguen delegados en su módulo) que no son del cliente
 * de su reunión. Lo usado no entra: ya cumplió su destino (lo decidió una persona) y no se puede deshacer desde acá. Una
 * reunión que alguien desvinculó del proyecto tampoco: es del mismo cliente, y los lectores de un proyecto (las
 * novedades, la memoria, el vigía) solo ven las reuniones que siguen vinculadas (`whereVinculadaAlProyecto`). Lo leen
 * INV45 y su remedio (`scripts/hechos-fuera-de-su-cliente.ts`). Lanza si la tabla no está.
 */
export async function hechosFueraDeSuCliente(db: PrismaClient): Promise<{ vivos: number; fuera: HechoFueraDeSuCliente[] }> {
  const hechos = await db.hechoDeReunion.findMany({
    where: { estado: "pendiente" },
    select: {
      id: true,
      clientId: true,
      projectId: true,
      sessionId: true,
      estado: true,
      frase: true,
      client: { select: { kind: true } },
      project: { select: { clientId: true } },
      session: { select: { title: true, resolvedClientId: true, manualClientId: true } },
    },
  });
  const vivos = hechos.filter((h) => h.estado === "pendiente");
  const fuera: HechoFueraDeSuCliente[] = [];
  for (const h of vivos) {
    const titulo = h.session?.title ?? "una reunión";
    const dueno = h.session ? (h.session.resolvedClientId ?? h.session.manualClientId ?? null) : null;
    const de = (motivo: MotivoFueraDeSuCliente, porque: string) => fuera.push({ id: h.id, sessionId: h.sessionId, motivo, linea: `«${corto(h.frase)}» (${h.id}): ${porque}` });
    if (h.session && dueno !== h.clientId) de("otro_cliente", `de «${titulo}», que es de otro cliente`);
    else if (h.client?.kind === "INTERNO") de("interno", "de una empresa de Smarteam");
    else if (h.client?.kind === "ALIADO") de("aliado", "de una empresa aliada");
    else if (h.projectId && h.project && h.project.clientId !== h.clientId) de("proyecto_de_otro_cliente", "de un proyecto de otro cliente");
  }
  return { vivos: vivos.length, fuera };
}

/** Qué hacer cuando INV45 se pone en rojo (lo dicen el invariante y el RUNBOOK). */
export const REMEDIO_DE_INV45 =
  "Remedio: revisar el dueño de la reunión en /sessions y corregirlo si está mal (al cambiar de dueño, los hechos se retiran solos). Si está bien: `npx tsx scripts/hechos-fuera-de-su-cliente.ts` (simulacro) y, revisado, con `--apply` y ALLOW_PROD_WRITE=1: retira esos hechos de su módulo (la alerta, la propuesta de la ficha, la etapa) y los desestima con la nota.";

/**
 * INV45 · Todo hecho VIVO (pendiente o delegado) es del cliente de su reunión:
 *   (a) `HechoDeReunion.clientId` es el dueño de la reunión (`resolvedClientId`, el manual solo si no hay: la precedencia
 *       del chokepoint, la misma de INV42);
 *   (b) ese dueño no es una empresa de Smarteam (INTERNO) ni un aliado (ALIADO): sus reuniones no dejan hechos;
 *   (c) si el hecho es de un proyecto, el proyecto es del mismo cliente.
 * Una reunión que cambia de dueño retira sus hechos vivos (lib/seguimiento/hechos-server.ts › `alCambiarDeDueno`): lo que
 * queda acá es lo que no se pudo retirar, o un cambio que no pasó por ahí (la empresa pasó a aliado, por ejemplo).
 */
export const INV45: Invariante = {
  id: "45",
  nombre: "todo hecho es del cliente de su reunión",
  async correr(db) {
    try {
      const { vivos, fuera } = await hechosFueraDeSuCliente(db);
      if (fuera.length) {
        return viola(`✗ INV45 VIOLADO: ${fuera.length} hecho(s) vivos que no son del cliente de su reunión.\n${lista(fuera.map((f) => f.linea))}\n    ${REMEDIO_DE_INV45}`);
      }
      return cumple(`✓ INV45: todo hecho vivo es del cliente de su reunión (${vivos} vivos).`);
    } catch (e) {
      if (!faltaLaTablaDeLosHechos(e)) throw e;
      return cumple(`✓ INV45: no aplica todavía — esta base no tiene la tabla de los hechos (falta ${SQL_DE_LOS_HECHOS}).`);
    }
  },
};
