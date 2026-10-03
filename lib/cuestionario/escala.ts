import "server-only";

/**
 * lib/cuestionario/escala.ts — el cuestionario de la ESCALA DE RENDIMIENTO (pedido de Elías, 2026-10-02).
 *
 * Ubica al cliente en un nivel por dimensión, para cada área contratada. Reglas que lo sostienen:
 *
 *   · Se ARMA leyendo la escala publicada en Nexus (`leerEscalaVigente`), nunca con nombres fijos en el
 *     código: la escala se sigue optimizando. La versión con la que se armó queda CONGELADA en la fila
 *     (`escalaVersion` + huella): lo que la persona contestó se lee contra esa vara.
 *   · Solo las áreas de los hubs contratados (`lib/escala/areas-por-hub.ts`), con la edición de la
 *     industria y el perfil de negocio de la exploración de venta si la hay; si no hay perfil, sus dos
 *     preguntas van primero (en una sección «Tu negocio»).
 *   · Por dimensión: la pregunta de la dimensión, con una opción por nivel (la descripción del nivel) y
 *     «No lo sé» (= el nivel más bajo, como dice la especificación del cálculo). Más una pregunta
 *     opcional para un ejemplo. El nivel de cada opción vive SOLO del lado nuestro.
 *   · El nivel lo CALCULA Nexus con `calcularChequeo` (lib/escala/chequeo.ts), no la IA.
 *   · Prellenado sin IA: si el diagnóstico preliminar ya ubicó una dimensión, la opción de ese nivel
 *     llega marcada como «esto es lo que entendimos» y la persona la confirma o la cambia.
 *
 * ⛔ El cliente nunca ve ids de la escala, letras ni nombres de nivel: los ids de pregunta y de opción
 * son opacos, y `preguntaParaElCliente` quita la dimensión y el nivel antes de mandarle la pregunta.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { areasContratadas } from "@/lib/escala/areas-por-hub";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { nombreDeNivel } from "@/lib/escala/documento/parsear";
import { leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { sanitizeTags } from "@/lib/tags/catalog";
import type { ResultadoDeEscalaDeCuestionario } from "./comparar";
import { ubicacionPreviaDelProyecto } from "@/lib/exploraciones/para-el-cuestionario";
import { armarSecciones, leerPerfil, resultadoDeLaEscala } from "./escala-armado";
import { ErrorDeCuestionario } from "./servicio";

export async function crearEscala(projectId: string, personaId: string, creadoPor: string | null): Promise<string> {
  const persona = await prisma.cuestionarioResponsable.findFirst({ where: { id: personaId, projectId } });
  if (!persona) throw new ErrorDeCuestionario("Esa persona no es de este proyecto.", 404);
  if (persona.revokedAt) throw new ErrorDeCuestionario("Esa persona ya no tiene un enlace activo.", 409);
  const ya = await prisma.cuestionario.findFirst({ where: { projectId, personaId, tipo: "escala" }, select: { id: true } });
  if (ya) return ya.id;

  const vigente = await leerEscalaVigente();
  // Con `in` y no leyendo el campo de estado: el censo de lectores de la exploración de venta lo prohíbe acá.
  if (!("escala" in vigente)) {
    throw new ErrorDeCuestionario("La escala de rendimiento todavía no está publicada en Nexus.", 409);
  }
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { tags: true } });
  if (!project) throw new ErrorDeCuestionario("Proyecto no existe", 404);
  const areas = areasContratadas(sanitizeTags(project.tags));
  if (areas.length === 0) {
    throw new ErrorDeCuestionario("El proyecto no tiene contratado ningún hub de ventas, marketing o servicio.", 409);
  }

  const previo = await ubicacionPreviaDelProyecto(projectId).catch(() => null);
  const escala = aplicarEdicion(vigente.escala, previo?.edicion ?? null);
  const perfil = previo?.perfil ?? null;
  const secciones = armarSecciones(escala, areas, perfil, previo?.porDimension ?? {}, new Date().toISOString());
  if (secciones.length === 0) throw new ErrorDeCuestionario("La escala publicada no tiene esas áreas.", 409);

  const c = await prisma.cuestionario.create({
    data: {
      projectId,
      tipo: "escala",
      personaId,
      createdById: creadoPor,
      escalaVersion: escala.version,
      escalaHuella: vigente.huella,
      edicion: previo?.edicion ?? null,
      perfil: perfil ? (perfil as unknown as Prisma.InputJsonValue) : undefined,
      pestanas: {
        create: secciones.map((s, i) => ({
          key: s.key,
          titulo: s.titulo,
          descripcion: s.descripcion,
          tipo: s.tipo,
          orden: i,
          preguntas: s.preguntas as unknown as Prisma.InputJsonValue,
          respuestas: s.respuestas as unknown as Prisma.InputJsonValue,
        })),
      },
    },
    select: { id: true },
  });
  return c.id;
}

/**
 * El resultado de cada cuestionario de escala PUBLICADO del proyecto, para la vista comparada.
 * Se calcula contra la escala vigente (la estructura de áreas y capas no depende de la versión de
 * las descripciones); los niveles salen de lo que eligió cada persona.
 */
export async function resultadosDeEscala(projectId: string): Promise<ResultadoDeEscalaDeCuestionario[]> {
  const cs = await prisma.cuestionario.findMany({
    where: { projectId, tipo: "escala", publicadoAt: { not: null } },
    include: { pestanas: { orderBy: { orden: "asc" }, select: { key: true, preguntas: true, respuestas: true } } },
  });
  if (cs.length === 0) return [];
  const vigente = await leerEscalaVigente();
  if (!("escala" in vigente)) return [];
  return cs.map((c) => {
    const { resultado } = resultadoDeLaEscala(vigente.escala, c.edicion, c.pestanas, leerPerfil(c.perfil));
    return {
      cuestionarioId: c.id,
      areas: resultado.areas.map((a) => ({
        nombre: a.nombre,
        nivel: a.nivel ? nombreDeNivel(vigente.escala, a.nivel) : null,
      })),
      completo: resultado.completo,
    };
  });
}
