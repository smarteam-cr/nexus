import "server-only";

/**
 * lib/exploraciones/fuentes-del-proyecto.ts — lo que lee el agente de la exploración de un PROYECTO,
 * además de las reuniones, lo sumado a mano y las notas (que lee fuentes.ts igual que en la preventa).
 * SERVIDOR.
 *
 * En la preventa el agente lee HubSpot: la empresa, sus contactos, su actividad, el test. En un proyecto
 * eso ya se vendió y quedó escrito en el handoff, así que lee lo del proyecto (2026-10-07):
 *   · V0 — el handoff: lo que se vendió y los resultados que el cliente necesita alcanzar. Cuenta como
 *     algo que dijo el cliente (se escribió con sus reuniones de venta).
 *   · Q0 — los cuestionarios: lo que contestó cada persona del cliente. Cuenta como algo que dijo.
 *   · K0 — el kickoff: lo que se le presentó. NO cuenta como algo que dijo el cliente.
 *   · F0 — Lo que Nexus ya sabe de la cuenta (lib/memoria, etapa 3, alcance interno): la ficha —lo confirmado y lo
 *     propuesto con su fuente, sin lo que propuso esta misma exploración—, los procesos, la historia, lo fuera de
 *     alcance, la auditoría del portal y lo aprendido en la preventa. NO cuenta (es lo que escribe Smarteam).
 *   · P0 — dónde lo estimó la preventa: hipótesis, nunca evidencia.
 * Qué cuenta como «lo dijo el cliente» lo decide `esFuenteDelCliente` (contenido.ts).
 *
 * Las reuniones salen por el chokepoint de sesiones (invariante #1), y desde la etapa A (2026-10-09)
 * SOLO las de sus sesiones: la exploración ya no arranca sugerida (`explorationOverride` quedó
 * DEPRECATED). Qué ids son los de las sesiones lo calcula fuentes.ts (`idsLigados`); acá se leen con
 * `getClientSessions` con `ids`, así una reunión de otro cliente no sale.
 */
import { loadCanvasContext, loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions, type ProjectSourceSession } from "@/lib/sessions/project-sources";
import { memoriaDeLaCuenta } from "@/lib/memoria";
import { EXPLORACION_TAG_LENSES } from "@/components/landing/configs/exploracion-lenses";
import { resultadosDelProyecto } from "@/lib/handoff/resultados";
import { resultadosParaPrompt } from "@/lib/handoff/resultados-medibles";
import { labelForTag, sanitizeTags } from "@/lib/tags/catalog";
import type { Fuente } from "./fuentes-tipos";
import { ubicacionPreviaDelProyecto } from "./para-el-cuestionario";

const NIVEL: Record<string, string> = { D: "Deficiente", I: "Inicial", F: "Funcional", E: "Eficiente", O: "Óptimo" };

/**
 * Lo del proyecto que lee el agente, cada cosa con su id. Lo que falla se omite: el agente lee lo demás.
 *
 * `conMemoria: false` deja afuera F0 (lo que Nexus ya sabe de la cuenta, alcance INTERNO, con los hechos de otras
 * reuniones todavía sin revisar). Lo pide la LECTURA de una reunión: su resumen es lo que el correo de seguimiento usa
 * como «lo que se leyó de la reunión» y lo lee el cliente (lib/exploraciones/correo-de-seguimiento.ts).
 */
export async function fuentesDelProyecto(projectId: string, clientId: string, opts: { conMemoria?: boolean } = {}): Promise<Fuente[]> {
  const conMemoria = opts.conMemoria !== false;
  const [handoff, kickoff, cuestionarios, memoria, previo] = await Promise.all([
    loadHandoffContext(projectId, { onlyConfirmed: false }).catch(() => ""),
    loadCanvasContext(projectId, "kickoff", { onlyConfirmed: false }).catch(() => ""),
    loadCuestionarioContext(projectId).catch(() => ""),
    /* F0 (memoria de la cuenta, etapa 3): lo que Nexus ya sabe de la cuenta, con el alcance interno y sin lo que esta
       misma exploración propuso a la ficha (lib/memoria/consumidores.ts › exploracion-del-proyecto). */
    conMemoria
      ? memoriaDeLaCuenta(clientId, { lector: "exploracion-del-proyecto", projectId })
          .then((m) => m.texto)
          .catch(() => "")
      : Promise.resolve(""),
    ubicacionPreviaDelProyecto(projectId).catch(() => null),
  ]);
  const out: Fuente[] = [];
  if (handoff.trim()) out.push({ id: "V0", etiqueta: "El handoff: lo que se vendió y los resultados que persigue el cliente", texto: handoff.slice(0, 14_000) });
  if (cuestionarios.trim()) out.push({ id: "Q0", etiqueta: "Lo que contestó el cliente en los cuestionarios", texto: cuestionarios.slice(0, 10_000) });
  if (kickoff.trim()) out.push({ id: "K0", etiqueta: "El kickoff (lo que se le presentó; no lo dijo el cliente)", texto: kickoff.slice(0, 6_000) });
  if (memoria.trim()) {
    out.push({ id: "F0", etiqueta: "Lo que Nexus ya sabe de la cuenta (lo escribió Smarteam; no lo dijo el cliente)", texto: memoria.slice(0, 8_000) });
  }
  if (previo && Object.keys(previo.porDimension).length) {
    out.push({
      id: "P0",
      etiqueta: "Dónde lo estimó la preventa (hipótesis, no evidencia)",
      texto: Object.entries(previo.porDimension)
        .map(([d, v]) => `- ${d}: ${NIVEL[v.nivel] ?? v.nivel} (${v.fuente === "test" ? "el test en línea" : "la preventa"})`)
        .join("\n"),
    });
  }
  return out;
}

/**
 * Lo vendido, más allá del texto del handoff, para la guía de la próxima sesión (2026-10-07): las etiquetas
 * del proyecto con lo que suele esconder cada una (las lentes de la exploración) y los resultados medibles
 * del handoff. "" si no hay nada: la guía saca las piezas del alcance del handoff.
 */
export async function loVendidoDelProyecto(projectId: string): Promise<string> {
  const [proyecto, resultados] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } }).catch(() => null),
    resultadosDelProyecto(projectId).catch(() => null),
  ]);
  const lineas: string[] = [];
  const tags = sanitizeTags(proyecto?.tags ?? []);
  if (tags.length) {
    lineas.push("Etiquetas del proyecto (qué se vendió):");
    for (const t of tags) lineas.push(`• ${labelForTag(t)}${EXPLORACION_TAG_LENSES[t] ? ` — lo que suele esconder: ${EXPLORACION_TAG_LENSES[t]}` : ""}`);
  }
  const bloque = resultadosParaPrompt(resultados?.resultados ?? []);
  if (bloque) lineas.push("", "Los resultados medibles del handoff (lo que el cliente necesita lograr con lo vendido):", bloque);
  return lineas.join("\n").slice(0, 6_000);
}

/**
 * Las reuniones de las sesiones de la exploración de un proyecto, la más nueva primero: solo las de esos
 * ids (los calcula fuentes.ts › `idsLigados`) y solo las que son del cliente y ya ocurrieron (el
 * chokepoint). La exploración del proyecto no lee las reuniones que no son sesiones.
 */
export async function sesionesDelProyecto(_projectId: string, clientId: string, ids: readonly string[]): Promise<ProjectSourceSession[]> {
  if (!ids.length) return [];
  return (await getClientSessions(clientId, { ids })).sort((a, b) => b.date - a.date);
}
