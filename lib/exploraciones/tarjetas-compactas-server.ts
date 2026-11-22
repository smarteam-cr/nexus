/**
 * lib/exploraciones/tarjetas-compactas-server.ts — el agente que arma la versión compacta de las tarjetas del Resumen de la
 * preventa (22 nov). SERVIDOR. Las reglas y la comprobación viven en ./tarjetas-compactas.ts.
 *
 * - Lee SOLO las casillas de esta exploración y el nombre de su empresa: ni reuniones, ni la ficha, ni nada de otra cuenta
 *   (invariante 1). Lo único que sale de la fila es lo que ya se ve en sus tarjetas.
 * - Corre con Haiku, en una sola llamada con todas las tarjetas que faltan, y una vez más solo con las que no pasaron la
 *   comprobación (con el motivo). La que tampoco pasa no se guarda: la tarjeta sigue con lo de siempre recortado.
 * - Lo llama el PATCH de la preventa después de un cambio confirmado de una tarjeta, en segundo plano. Nunca al abrir la
 *   página. Si no hay nada que compactar (todas al día o cortas), no llama a nadie.
 * - Trazabilidad: `AgentRun` + el medidor de gasto (`conContextoDeIA`, agentSlug de la exploración y su `origen`). El tope
 *   del mes lo aplica `lib/anthropic.ts` antes de cada llamada.
 * - Guarda en `contenido.tarjetasCompactas` con la fila bloqueada y releída: solo las tarjetas cuyas líneas siguen siendo
 *   las que se compactaron. No sube la versión.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { getAnthropic } from "@/lib/anthropic";
import { humanizeAgentError } from "@/lib/agents/anthropic-error";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { parseObject } from "@/lib/ai/section-schema";
import { prisma } from "@/lib/db/prisma";
import { AGENTE_DE_LA_EXPLORACION } from "./agente";
import { leerContenido } from "./esquemas";
import { bloquearFila } from "./servidor";
import {
  compactarConUnReintento,
  huellaDeLasLineas,
  lineasDe,
  tarjetasPorCompactar,
  type ClaveDelResumen,
  type LlamarAlModelo,
  type TarjetaCompacta,
} from "./tarjetas-compactas";

export const ORIGEN_DE_LAS_TARJETAS_COMPACTAS = "exploraciones/agente:tarjetas-compactas";

/**
 * Las que se están compactando ahora (por exploración) y lo que llegó mientras tanto: las claves que cambiaron, o "todas"
 * (el script). Al terminar, se corre otra vez solo con eso: cambiar una tarjeta no rehace las demás.
 */
const enCurso = new Set<string>();
const otraVez = new Map<string, Set<ClaveDelResumen> | "todas">();

function anotarOtraVez(id: string, solo: readonly ClaveDelResumen[] | undefined) {
  const antes = otraVez.get(id);
  if (!solo || antes === "todas") return void otraVez.set(id, "todas");
  otraVez.set(id, new Set([...(antes ?? []), ...solo]));
}

/**
 * Compacta las tarjetas del Resumen de una exploración que no tienen versión de sus líneas de hoy. `solo`: las que cambió
 * el pedido (las demás se ven como antes hasta que cambien); sin `solo`, todas (el script). Nunca lanza: lo que falla
 * queda en su `AgentRun` y en la consola, y la tarjeta sigue con lo de siempre.
 */
export async function compactarTarjetasDelResumen(o: { exploracionId: string; email: string | null; solo?: readonly ClaveDelResumen[] }): Promise<void> {
  if (enCurso.has(o.exploracionId)) {
    anotarOtraVez(o.exploracionId, o.solo);
    return;
  }
  enCurso.add(o.exploracionId);
  try {
    await compactarUnaVez(o);
    // Lo que cambió mientras el agente escribía: solo esas tarjetas, con lo último guardado.
    for (let pendiente = otraVez.get(o.exploracionId); pendiente; pendiente = otraVez.get(o.exploracionId)) {
      otraVez.delete(o.exploracionId);
      await compactarUnaVez({ ...o, solo: pendiente === "todas" ? undefined : [...pendiente] });
    }
  } catch (e) {
    console.error("[exploraciones/tarjetas-compactas] falló", e);
  } finally {
    enCurso.delete(o.exploracionId);
    otraVez.delete(o.exploracionId);
  }
}

async function compactarUnaVez(o: { exploracionId: string; email: string | null; solo?: readonly ClaveDelResumen[] }): Promise<void> {
  const fila = await prisma.exploracionDeVenta.findUnique({
    where: { id: o.exploracionId },
    select: { id: true, clientId: true, projectId: true, contenido: true, archivadaEn: true, client: { select: { name: true } } },
  });
  if (!fila || fila.archivadaEn) return;
  const c = leerContenido(fila.contenido);
  const { pedir, quitar } = tarjetasPorCompactar(c.casillas, c.tarjetasCompactas, o.solo);
  if (!pedir.length) {
    if (quitar.length) await guardar(o.exploracionId, {}, quitar);
    return;
  }

  const run = await prisma.agentRun.create({
    data: {
      agentSlug: AGENTE_DE_LA_EXPLORACION,
      clientId: fila.clientId,
      projectId: fila.projectId,
      status: "RUNNING",
      stepLabel: "Resumen: las tarjetas compactas",
      currentPhase: "Compactando las tarjetas…",
      triggeredByEmail: o.email,
      filters: { exploracion: o.exploracionId, modo: "tarjetas-compactas", tarjetas: pedir.map((t) => t.clave) } as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  const ia = { agentSlug: AGENTE_DE_LA_EXPLORACION, agentRunId: run.id, clientId: fila.clientId, projectId: fila.projectId, triggeredByEmail: o.email, origen: ORIGEN_DE_LAS_TARJETAS_COMPACTAS };
  try {
    const llamar: LlamarAlModelo = (pedido) => conContextoDeIA(ia, () => getAnthropic().messages.create(pedido));
    const r = await compactarConUnReintento(fila.client.name, pedir, llamar, parseObject);
    const ahora = new Date().toISOString();
    const nuevas: Partial<Record<ClaveDelResumen, TarjetaCompacta>> = {};
    for (const t of pedir) {
      const lineas = r.validas[t.clave];
      if (lineas) nuevas[t.clave] = { huella: t.huella, lineas, en: ahora };
    }
    const guardadas = await guardar(o.exploracionId, nuevas, quitar);
    await prisma.agentRun.update({
      where: { id: run.id },
      data: { status: "DONE", currentPhase: null, output: JSON.stringify({ guardadas, descartadas: r.descartadas }) },
    });
  } catch (e) {
    const mensaje = humanizeAgentError(e);
    await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", currentPhase: null, output: JSON.stringify({ error: mensaje }) } }).catch(() => {});
    console.error("[exploraciones/tarjetas-compactas] falló", e);
  }
}

/**
 * Guarda con la fila bloqueada y releída. Una tarjeta entra solo si sus líneas de AHORA son las que se compactaron (si
 * alguien la cambió mientras el agente escribía, no se guarda: la próxima corrida la toma). Conserva las claves del Json
 * que esta versión no conoce. Devuelve las claves que quedaron guardadas.
 */
async function guardar(exploracionId: string, nuevas: Partial<Record<ClaveDelResumen, TarjetaCompacta>>, quitar: readonly ClaveDelResumen[]): Promise<ClaveDelResumen[]> {
  return prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const f = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { contenido: true, archivadaEn: true, updatedAt: true } });
    if (!f || f.archivadaEn) return [];
    const c = leerContenido(f.contenido);
    const tarjetas = { ...(c.tarjetasCompactas ?? {}) };
    const entran: ClaveDelResumen[] = [];
    for (const [clave, t] of Object.entries(nuevas) as [ClaveDelResumen, TarjetaCompacta][]) {
      if (huellaDeLasLineas(lineasDe(clave, c.casillas[clave])) !== t.huella) continue;
      tarjetas[clave] = t;
      entran.push(clave);
    }
    const aQuitar = quitar.filter((k) => k in tarjetas);
    for (const clave of aQuitar) delete tarjetas[clave];
    if (!entran.length && !aQuitar.length) return [];
    const crudo = f.contenido && typeof f.contenido === "object" && !Array.isArray(f.contenido) ? (f.contenido as Record<string, unknown>) : {};
    const siguiente = { ...crudo, ...c } as Record<string, unknown>;
    if (Object.keys(tarjetas).length) siguiente.tarjetasCompactas = tarjetas;
    else delete siguiente.tarjetasCompactas;
    /* `updatedAt` se queda como estaba: la versión compacta es de pantalla, no actividad. Sin esto, el script dejaría todas
       las preventas «tocadas hoy» y volverían a entrar a las ventanas que miran la actividad (asociar reuniones solas, la
       relación con un proyecto nuevo, la última preventa de la memoria). */
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { contenido: siguiente as unknown as Prisma.InputJsonValue, updatedAt: f.updatedAt },
    });
    return entran;
  });
}
