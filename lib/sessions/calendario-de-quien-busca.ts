/**
 * lib/sessions/calendario-de-quien-busca.ts — «De tu calendario»: las reuniones de quien busca. SERVIDOR.
 *
 * Nació en la ruta del cronograma (timeline/calendario, 2026-09-23: «el usuario debe poder buscar
 * cualquier sesión de su calendario»). El 2026-10-07 Elías pidió lo mismo para todos los «Contexto
 * adicional» («siempre se debe poder buscar y agregar cualquier sesión de Meet del usuario o del
 * cliente»): el handoff, el diagnóstico, la planificación, la ejecución y la preventa. Una sola
 * consulta para todos, así la regla de qué se ofrece no se separa entre documentos.
 *
 *   · sin `q` (o con menos de MIN_BUSQUEDA_CALENDARIO letras) → sus TOPE_RECIENTES más recientes QUE
 *     YA TIENEN CLIENTE: ⛔ las sin dueño no van en esta lista (revisión adversarial, 2026-09-24). La
 *     decisión de MIN_BUSQUEDA_SIN_DUENIO (2026-09-22) es que las huérfanas se ofrecen ÚNICAMENTE por
 *     búsqueda, nunca como lista: «Agregar y asignar» es una escritura durable de pertenencia, y la
 *     «Daily Smarteam» de ayer quedaba arriba de todo, a un clic de volverse del cliente para siempre.
 *     Buscándola por su nombre, sigue apareciendo;
 *   · con `q` → todo su historial (título, organizador o participantes), hasta TOPE_BUSQUEDA.
 * `hayMas` dice si quedó algo afuera: una lista cortada no puede leerse como completa.
 *
 * Una reunión de OTRO cliente se devuelve igual, marcada con su motivo y sin botón: esconderla sería
 * que alguien la busque en su calendario y crea que no existe. La puerta de cada documento la rechaza
 * por su cuenta. Las futuras quedan afuera: no dejaron nada que leer. Solo lectura.
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  MIN_BUSQUEDA_CALENDARIO,
  esReunionDePuertasAdentro,
  motivoParaNoAdoptar,
  motivoParaNoElegirDelCalendario,
} from "./candidatas-internas";
import { buildInternalDomainsSet } from "./categorize";
import { belongsToClient } from "./project-sources";

/** Sin escribir nada: las más recientes. Es lo que se ve al abrir el buscador. */
const TOPE_RECIENTES = 30;
/** Buscando: en todo el historial, hasta este tope. */
const TOPE_BUSQUEDA = 50;

export interface ReunionDelCalendario {
  sessionId: string;
  title: string;
  date: Date;
  participants: string[];
  organizerEmail: string | null;
  duration: number | null;
  applies: true;
  reason: "";
  linkedElsewhere: boolean;
  excluidaAca: false;
  /** No tiene transcripción, ni resumen, ni minuta: no hay nada que leer. */
  sinContenido: boolean;
  /** No tiene transcripción (puede tener un resumen). La preventa solo lee transcripciones. */
  sinTranscripcion: boolean;
  sinDuenio: boolean;
  soloEquipo?: boolean;
  /** Por qué no se puede elegir (es de otro cliente, o estuvo gente de afuera). null = se puede. */
  motivoNoAdoptable: string | null;
}

export async function buscarEnTuCalendario(o: {
  /** El correo de quien busca. */
  email: string;
  /** El cliente del documento: lo suyo se ofrece, lo de otro cliente se marca. */
  clientId: string;
  /** El proyecto del documento: lo que ya es de él no se repite. null = la preventa (no hay proyecto). */
  projectId: string | null;
  q: string;
  /** Para el motivo de una reunión de otro cliente: «el cronograma», «el handoff», «la preventa». */
  documento: string;
}): Promise<{ sesiones: ReunionDelCalendario[]; hayMas: boolean }> {
  const email = o.email.trim().toLowerCase();
  if (!email) return { sesiones: [], hayMas: false };

  const q = o.q.trim().slice(0, 100);
  const buscando = q.length >= MIN_BUSQUEDA_CALENDARIO;
  const tope = buscando ? TOPE_BUSQUEDA : TOPE_RECIENTES;
  /* ILIKE con el patrón escapado: un «%» o un «_» que la persona escriba se busca literal. */
  const patron = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const filtroTexto = buscando
    ? Prisma.sql`AND (
        s."title" ILIKE ${patron}
        OR s."organizerEmail" ILIKE ${patron}
        OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE p ILIKE ${patron})
      )`
    : Prisma.empty;
  /* Sin buscar, solo las que ya son de algún cliente (ver arriba: las sin dueño, solo por búsqueda). */
  const filtroDuenio = buscando
    ? Prisma.empty
    : Prisma.sql`AND (s."resolvedClientId" IS NOT NULL OR s."manualClientId" IS NOT NULL)`;
  /* Las que ya son del proyecto (vínculo vivo) no van: están arriba, en la lista del proyecto. */
  const filtroProyecto = o.projectId
    ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM "SessionProject" sp
        WHERE sp."sessionId" = s."id" AND sp."projectId" = ${o.projectId} AND sp."included" = true
      )`
    : Prisma.empty;

  /* Se pide uno más que el tope para saber si hay más sin contarlas todas. */
  const ahora = new Date();
  const encontradas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT s."id"
    FROM "FirefliesSession" s
    WHERE s."date" <= ${ahora}
      AND (
        lower(s."organizerEmail") = ${email}
        OR EXISTS (SELECT 1 FROM unnest(s."participants") p WHERE lower(p) = ${email})
      )
      ${filtroProyecto}
      ${filtroTexto}
      ${filtroDuenio}
    ORDER BY s."date" DESC
    LIMIT ${tope + 1}`;
  const hayMas = encontradas.length > tope;
  const ids = encontradas.slice(0, tope).map((r) => r.id);
  if (ids.length === 0) return { sesiones: [], hayMas: false };

  const [filas, categorias, contenidoRows] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { id: { in: ids } },
      orderBy: { date: "desc" },
      select: {
        id: true,
        title: true,
        date: true,
        participants: true,
        organizerEmail: true,
        duration: true,
        resolvedClientId: true,
        manualClientId: true,
        projects: { select: { projectId: true, project: { select: { clientId: true } } } },
      },
    }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    /* «Hay ALGO que leer» = transcript, resumen o minuta — el mismo criterio que el resto del
       buscador. En SQL para no traer los blobs al servidor. */
    prisma.$queryRaw<{ id: string; transcripcion: boolean; algo: boolean }[]>`
      SELECT s."id",
        coalesce(length(s."transcript"), 0) > 0 AS "transcripcion",
        (
          coalesce(length(s."transcript"), 0) > 0
          OR s."summary" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "SessionMinute" m WHERE m."sessionId" = s."id")
        ) AS "algo"
      FROM "FirefliesSession" s
      WHERE s."id" IN (${Prisma.join(ids)})`,
  ]);
  const dominiosPropios = buildInternalDomainsSet(categorias);
  const contenido = new Map(contenidoRows.map((r) => [r.id, r]));

  // El nombre del dueño, para decir DE QUIÉN es la reunión que no se puede elegir.
  const duenios = [
    ...new Set(
      filas
        .filter((s) => !belongsToClient(s, o.clientId))
        .map((s) => s.manualClientId ?? s.resolvedClientId)
        .filter((id): id is string => id !== null),
    ),
  ];
  const nombres = new Map(
    (duenios.length ? await prisma.client.findMany({ where: { id: { in: duenios } }, select: { id: true, name: true } }) : []).map((c) => [c.id, c.name]),
  );

  const sesiones = filas.map((s): ReunionDelCalendario => {
    const sinDuenio = s.resolvedClientId === null && s.manualClientId === null;
    const motivoNoAdoptable = sinDuenio
      ? motivoParaNoAdoptar(
          {
            participants: s.participants,
            organizerEmail: s.organizerEmail,
            clientesDeSusProyectos: s.projects.map((p) => p.project.clientId),
          },
          o.clientId,
          dominiosPropios,
        )
      : null;
    const duenio = s.manualClientId ?? s.resolvedClientId;
    const c = contenido.get(s.id);
    return {
      sessionId: s.id,
      title: s.title,
      date: s.date,
      participants: s.participants,
      organizerEmail: s.organizerEmail,
      duration: s.duration,
      // El calendario no tiene regla de relevancia: nada se destaca ni se atenúa por el título.
      applies: true,
      reason: "",
      linkedElsewhere: s.projects.some((p) => p.projectId !== o.projectId),
      excluidaAca: false,
      sinContenido: !c?.algo,
      sinTranscripcion: !c?.transcripcion,
      sinDuenio,
      soloEquipo: sinDuenio ? esReunionDePuertasAdentro(s, dominiosPropios) : undefined,
      /* Mismo campo que usa la búsqueda de sin dueño: con motivo, la fila no ofrece «Agregar» sino
         ir a Sesiones. */
      motivoNoAdoptable: motivoParaNoElegirDelCalendario({
        perteneceAlCliente: belongsToClient(s, o.clientId),
        sinDuenio,
        motivoNoAdoptable,
        nombreDelDuenio: duenio ? (nombres.get(duenio) ?? null) : null,
        documento: o.documento,
      }),
    };
  });
  return { sesiones, hayMas };
}
