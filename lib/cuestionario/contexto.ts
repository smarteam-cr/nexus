import "server-only";

/**
 * lib/cuestionario/contexto.ts — lo que el cliente contestó, como bloque de contexto para los
 * agentes (Exploración y Planificación).
 *
 * Qué entra y por qué:
 *   · Las respuestas, con su ORIGEN a la vista: una respuesta prellenada que el cliente no
 *     confirmó sigue siendo una suposición de Nexus, no un dato del cliente.
 *   · Las etapas de cada proceso con sus 7 respuestas (la base de la definición de procesos).
 *   · El contexto adicional de cada pestaña y los cambios que el cliente pidió después de enviar:
 *     un «en realidad son 3 vendedores, no 5» corrige lo contestado y el agente tiene que verlo.
 *   · Los documentos con su «qué es» y un extracto del texto.
 *   · Lo pendiente o marcado «en sesión»: son las preguntas que el plan de sesiones tiene que cubrir.
 *
 * Una pestaña sin nada contestado no entra: no hay nada que decir de ella, salvo que está pendiente.
 * Un cuestionario que todavía no se envió al cliente no entra en absoluto.
 */
import { prisma } from "@/lib/db/prisma";
import { PREGUNTAS_DE_ETAPA } from "./plantilla";
import { estaContestada, leerEtapas, leerPreguntas, leerRespuestas, type Respuesta } from "./tipos";

const EXTRACTO_DOC = 1500;
const TOPE_TOTAL = 40_000;

function linea(texto: string, r: Respuesta | undefined): string | null {
  if (!r || !estaContestada(r)) return null;
  if (r.enSesion && !r.valor.trim()) return null; // va a la lista de pendientes
  const origen =
    r.origen === "prellenado"
      ? r.confirmada
        ? " (prellenado por Nexus, CONFIRMADO por el cliente)"
        : " (prellenado por Nexus, SIN confirmar por el cliente)"
      : r.origen === "cse"
        ? " (cargado por el CSE)"
        : "";
  return `- ${texto}\n  → ${r.valor.trim()}${origen}${r.enSesion ? " [quiere ampliarlo en sesión]" : ""}`;
}

export async function loadCuestionarioContext(projectId: string): Promise<string> {
  const c = await prisma.cuestionario.findUnique({
    where: { projectId },
    include: {
      pestanas: {
        orderBy: { orden: "asc" },
        include: {
          responsable: { select: { nombre: true, cargo: true } },
          adjuntos: { select: { title: true, descripcion: true, content: true } },
          cambios: { where: { tipo: "SOLICITUD" }, orderBy: { createdAt: "asc" }, select: { mensaje: true, createdAt: true } },
        },
      },
    },
  });
  // En borrador es el trabajo del CSE, no algo que el cliente vio: ni sus preguntas son
  // «pendientes» ni lo prellenado es un dato. Entra recién cuando se envió al cliente.
  if (!c || !c.publicadoAt) return "";

  const bloques: string[] = [];
  const pendientes: string[] = [];

  for (const p of c.pestanas) {
    const preguntas = leerPreguntas(p.preguntas);
    const respuestas = leerRespuestas(p.respuestas);
    const etapas = p.tipo === "etapas" ? leerEtapas(p.etapas) : [];
    const lineas: string[] = [];

    for (const q of preguntas) {
      const l = linea(q.texto, respuestas[q.id]);
      if (l) lineas.push(l);
      else pendientes.push(`[${p.titulo}] ${q.texto}${respuestas[q.id]?.enSesion ? " (el cliente pidió verlo en sesión)" : ""}`);
    }

    etapas.forEach((e, i) => {
      const detalle = PREGUNTAS_DE_ETAPA.map((q) => linea(q.texto, e.respuestas[q.id])).filter(Boolean);
      lineas.push(`\nEtapa ${i + 1}: ${e.nombre || "(sin nombre)"}`);
      lineas.push(...(detalle.length ? (detalle as string[]) : ["  (sin detalle todavía)"]));
    });
    if (p.tipo === "etapas" && etapas.length === 0) {
      pendientes.push(`[${p.titulo}] Todavía no describió ninguna etapa del proceso.`);
    }

    if (p.contextoAdicional?.trim()) lineas.push(`\nContexto adicional del cliente:\n${p.contextoAdicional.trim()}`);
    for (const cambio of p.cambios) {
      if (cambio.mensaje) {
        lineas.push(`\n⚠ Corrección pedida por el cliente después de enviar (${cambio.createdAt.toISOString().slice(0, 10)}): ${cambio.mensaje}`);
      }
    }
    for (const d of p.adjuntos) {
      const extracto = d.content?.trim() ? `\n  Extracto: ${d.content.trim().slice(0, EXTRACTO_DOC)}` : "";
      lineas.push(`\nDocumento adjunto «${d.title}» — qué es, según el cliente: ${d.descripcion ?? "(sin descripción)"}${extracto}`);
    }

    if (lineas.length === 0) continue;
    const quien = p.responsable ? ` — contestó ${p.responsable.nombre}${p.responsable.cargo ? ` (${p.responsable.cargo})` : ""}` : "";
    const estado = p.enviadaAt ? "ENVIADA" : "en borrador";
    bloques.push(`## ${p.titulo}${quien} · ${estado}\n${lineas.join("\n")}`);
  }

  if (bloques.length === 0 && pendientes.length === 0) return "";

  let out =
    "=== CUESTIONARIO PREVIO — lo que el cliente contestó por escrito antes de las sesiones ===\n" +
    (bloques.length ? bloques.join("\n\n") : "(El cliente todavía no contestó nada.)");
  if (pendientes.length) {
    out += `\n\n=== PREGUNTAS DEL CUESTIONARIO SIN RESPUESTA ESCRITA — cubrirlas en las sesiones ===\n${pendientes.map((x) => `- ${x}`).join("\n")}`;
  }
  return out.length > TOPE_TOTAL ? `${out.slice(0, TOPE_TOTAL)}\n[… recortado]` : out;
}
