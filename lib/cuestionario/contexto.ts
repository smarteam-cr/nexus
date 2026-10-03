import "server-only";

/**
 * lib/cuestionario/contexto.ts — lo que el cliente contestó, como bloque de contexto para los
 * agentes (Exploración, Planificación, Diagnóstico, la ficha).
 *
 * Desde el 2026-10-02 hay VARIOS cuestionarios por proyecto, cada uno de UNA persona: el bloque dice
 * quién contestó qué, para que el agente vea cuándo dos personas dicen cosas distintas.
 *
 * Qué entra y por qué:
 *   · Las respuestas, con su ORIGEN a la vista: una respuesta prellenada que la persona no
 *     confirmó sigue siendo una suposición de Nexus, no un dato del cliente.
 *   · En la escala: la opción elegida con su nivel (esto es interno: el cliente nunca ve niveles).
 *   · Las etapas de cada proceso con sus 7 respuestas (la base de la definición de procesos).
 *   · El contexto adicional y los cambios pedidos después de enviar: un «en realidad son 3
 *     vendedores, no 5» corrige lo contestado y el agente tiene que verlo.
 *   · Los documentos con su «qué es» y un extracto del texto.
 *   · Lo pendiente o marcado «en sesión»: son las preguntas que el plan de sesiones tiene que cubrir.
 *
 * Un cuestionario sin publicar no entra en absoluto: es el trabajo del CSE, no algo que el cliente vio.
 */
import { prisma } from "@/lib/db/prisma";
import { PREGUNTAS_DE_ETAPA } from "./plantilla";
import {
  OPCION_NO_SE,
  TITULO_DEL_TIPO,
  esTipoDeCuestionario,
  estaContestada,
  leerEtapas,
  leerPreguntas,
  leerRespuestas,
  type Pregunta,
  type Respuesta,
} from "./tipos";

const EXTRACTO_DOC = 1500;
const TOPE_TOTAL = 40_000;

/** El valor legible de una respuesta: en opción múltiple, el texto de la opción (y su nivel). */
export function valorLegible(q: Pick<Pregunta, "opciones">, r: Respuesta): string {
  if (!q.opciones) return r.valor.trim();
  if (r.valor === OPCION_NO_SE) return "No sabe";
  const o = q.opciones.find((x) => x.id === r.valor);
  return o ? `${o.texto}${o.nivel ? ` [nivel ${o.nivel}]` : ""}` : r.valor.trim();
}

function linea(q: Pick<Pregunta, "texto" | "opciones">, r: Respuesta | undefined): string | null {
  if (!r || !estaContestada(r)) return null;
  if (r.enSesion && !r.valor.trim()) return null; // va a la lista de pendientes
  const origen =
    r.origen === "prellenado"
      ? r.confirmada
        ? " (prellenado por Nexus, CONFIRMADO por la persona)"
        : " (prellenado por Nexus, SIN confirmar por la persona)"
      : r.origen === "cse"
        ? " (cargado por el CSE)"
        : "";
  return `- ${q.texto}\n  → ${valorLegible(q, r)}${origen}${r.enSesion ? " [quiere ampliarlo en sesión]" : ""}`;
}

export async function loadCuestionarioContext(projectId: string): Promise<string> {
  const cuestionarios = await prisma.cuestionario.findMany({
    where: { projectId, publicadoAt: { not: null } },
    orderBy: { createdAt: "asc" },
    include: {
      persona: { select: { nombre: true, cargo: true } },
      pestanas: {
        orderBy: { orden: "asc" },
        include: {
          adjuntos: { select: { title: true, descripcion: true, content: true } },
          cambios: { where: { tipo: "SOLICITUD" }, orderBy: { createdAt: "asc" }, select: { mensaje: true, createdAt: true } },
        },
      },
    },
  });
  if (cuestionarios.length === 0) return "";

  const bloques: string[] = [];
  const pendientes: string[] = [];

  for (const c of cuestionarios) {
    const tipo = esTipoDeCuestionario(c.tipo) ? c.tipo : "tactico";
    const quien = c.persona ? `${c.persona.nombre}${c.persona.cargo ? ` (${c.persona.cargo})` : ""}` : "sin persona asignada";

    for (const p of c.pestanas) {
      const preguntas = leerPreguntas(p.preguntas);
      const respuestas = leerRespuestas(p.respuestas);
      const etapas = p.tipo === "etapas" ? leerEtapas(p.etapas) : [];
      const lineas: string[] = [];

      for (const q of preguntas) {
        const l = linea(q, respuestas[q.id]);
        if (l) lineas.push(l);
        else if (!q.opcional) {
          pendientes.push(`[${quien} · ${p.titulo}] ${q.texto}${respuestas[q.id]?.enSesion ? " (pidió verlo en sesión)" : ""}`);
        }
      }

      etapas.forEach((e, i) => {
        const detalle = PREGUNTAS_DE_ETAPA.map((q) => linea(q, e.respuestas[q.id])).filter(Boolean);
        lineas.push(`\nEtapa ${i + 1}: ${e.nombre || "(sin nombre)"}`);
        lineas.push(...(detalle.length ? (detalle as string[]) : ["  (sin detalle todavía)"]));
      });
      if (p.tipo === "etapas" && etapas.length === 0) {
        pendientes.push(`[${quien} · ${p.titulo}] Todavía no describió ninguna etapa del proceso.`);
      }

      if (p.contextoAdicional?.trim()) lineas.push(`\nContexto adicional:\n${p.contextoAdicional.trim()}`);
      for (const cambio of p.cambios) {
        if (cambio.mensaje) {
          lineas.push(`\n⚠ Corrección pedida después de enviar (${cambio.createdAt.toISOString().slice(0, 10)}): ${cambio.mensaje}`);
        }
      }
      for (const d of p.adjuntos) {
        const extracto = d.content?.trim() ? `\n  Extracto: ${d.content.trim().slice(0, EXTRACTO_DOC)}` : "";
        lineas.push(`\nDocumento adjunto «${d.title}» — qué es, según la persona: ${d.descripcion ?? "(sin descripción)"}${extracto}`);
      }

      if (lineas.length === 0) continue;
      const estado = p.enviadaAt ? "ENVIADA" : "en borrador";
      bloques.push(`## ${TITULO_DEL_TIPO[tipo]} · ${p.titulo} — contestó ${quien} · ${estado}\n${lineas.join("\n")}`);
    }
  }

  if (bloques.length === 0 && pendientes.length === 0) return "";

  let out =
    "=== CUESTIONARIOS PREVIOS — lo que cada persona del cliente contestó por escrito antes de las sesiones ===\n" +
    (bloques.length ? bloques.join("\n\n") : "(Todavía nadie contestó nada.)");
  if (pendientes.length) {
    out += `\n\n=== PREGUNTAS SIN RESPUESTA ESCRITA — cubrirlas en las sesiones ===\n${pendientes.map((x) => `- ${x}`).join("\n")}`;
  }
  return out.length > TOPE_TOTAL ? `${out.slice(0, TOPE_TOTAL)}\n[… recortado]` : out;
}
