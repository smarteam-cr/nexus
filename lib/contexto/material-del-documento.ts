/**
 * lib/contexto/material-del-documento.ts — lo que el «Contexto» de un DOCUMENTO le da a su agente:
 * las reuniones que lo alimentan (las mismas que muestra el panel) y las notas del CSE.
 *
 * Hoy lo lee el runner del diagnóstico (lib/canvas/diagnostico-generate.ts). Es más simple que el
 * material del cronograma a propósito: el diagnóstico no ubica reuniones en un plan ni arma un
 * calendario, solo necesita LEERLAS.
 *
 * ── LAS REGLAS QUE NO SE NEGOCIAN ────────────────────────────────────────────
 *  · Las reuniones salen del chokepoint (`getProjectDiagnosisSessions` → `getProjectMemberSessions`):
 *    lo que el panel dice que alimenta es EXACTAMENTE lo que se lee. Pertenencia al cliente y
 *    tombstone no se re-implementan.
 *  · Solo las que YA ocurrieron (`soloOcurridas`): la agenda vive en la misma tabla y una reunión
 *    agendada leída como si hubiera pasado es un compromiso inventado.
 *  · Cada reunión va con su sala («CON EL CLIENTE» / «PUERTAS ADENTRO»): el diagnóstico lo lee el
 *    cliente, y lo dicho entre nosotros no puede aparecer como si lo hubiera dicho él.
 *  · El espacio se reparte (lib/contexto/documento.ts): con muchas reuniones cada una entra más corta,
 *    nunca se corta el bloque entero a la mitad.
 */
import { prisma } from "@/lib/db/prisma";
import { getProjectDiagnosisSessions } from "@/lib/sessions/project-sources";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { etiquetaDeSala, prefijoDeSala } from "@/lib/sessions/etiqueta-de-sala";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { getSessionCategories } from "@/lib/cache/session-categories";
import { modeloDisponible } from "@/lib/db/esquema";
import {
  MAX_REUNIONES_DEL_DOCUMENTO,
  TOPE_NOTAS_DEL_DOCUMENTO,
  espacioPorReunion,
  type DocumentoConContexto,
} from "./documento";

export interface MaterialDelDocumento {
  /** El bloque de reuniones para el prompt ("" si no hay ninguna que leer). */
  reuniones: string;
  /** El bloque de notas del CSE ("" si no hay). */
  notas: string;
  /** Para el encuadre del informe («4 sesiones entre el 2 y el 16 de septiembre»). */
  resumen: { leidas: number; futuras: number; sinContenido: number; desde: number | null; hasta: number | null };
}

function fecha(ms: number): string {
  return new Date(ms).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}

export async function cargarMaterialDelDocumento(
  projectId: string,
  doc: DocumentoConContexto,
): Promise<MaterialDelDocumento> {
  const [{ sessions }, categorias, notas] = await Promise.all([
    getProjectDiagnosisSessions(projectId),
    getSessionCategories(),
    leerNotas(projectId, doc.pieza),
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const ahora = Date.now();

  const ocurridas = soloOcurridas(sessions, ahora);
  // Las más recientes, si no caben todas; y después en orden de fecha, que es como se cuenta una historia.
  const aLeer = [...ocurridas]
    .sort((a, b) => b.date - a.date || a.id.localeCompare(b.id))
    .slice(0, MAX_REUNIONES_DEL_DOCUMENTO)
    .sort((a, b) => a.date - b.date || a.id.localeCompare(b.id));
  const espacio = espacioPorReunion(aLeer.length);

  let sinContenido = 0;
  const bloques: string[] = [];
  for (const s of aLeer) {
    const texto = (await fetchTranscriptContent(s.id, s.title, { maxChars: espacio }))?.trim() ?? "";
    if (!texto) {
      sinContenido++;
      continue;
    }
    const sala = prefijoDeSala(etiquetaDeSala({ participants: s.participants }, dominiosPropios));
    bloques.push(`### ${sala}${s.title} — ${fecha(s.date)}\n${texto}`);
  }

  return {
    reuniones: bloques.join("\n\n"),
    notas: bloqueDeNotas(notas),
    resumen: {
      leidas: bloques.length,
      futuras: sessions.length - ocurridas.length,
      sinContenido,
      desde: aLeer.length ? aLeer[0].date : null,
      hasta: aLeer.length ? aLeer[aLeer.length - 1].date : null,
    },
  };
}

async function leerNotas(projectId: string, pieza: string) {
  // Tolera la tabla ausente solo en la ventana SQL→deploy; el orden obligatorio sigue siendo SQL primero.
  if (!modeloDisponible(prisma.notaDeContexto)) return [];
  return prisma.notaDeContexto.findMany({
    where: { projectId, pieza, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { title: true, content: true, createdAt: true },
  });
}

/** Las notas, las más nuevas primero hasta el tope: si no entran todas, lo que queda afuera es lo viejo. */
function bloqueDeNotas(notas: ReadonlyArray<{ title: string | null; content: string; createdAt: Date }>): string {
  const partes: string[] = [];
  let usado = 0;
  for (const n of [...notas].reverse()) {
    const bloque = `### ${n.title?.trim() || "Nota"} — cargada el ${fecha(n.createdAt.getTime())}\n${n.content.trim()}`;
    if (usado + bloque.length > TOPE_NOTAS_DEL_DOCUMENTO) break;
    partes.unshift(bloque);
    usado += bloque.length;
  }
  return partes.join("\n\n");
}
