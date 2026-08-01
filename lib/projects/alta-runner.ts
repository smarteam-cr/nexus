import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { crearProjectRecord, hasProjectsWriteScope } from "@/lib/hubspot/project-record";
import { espejarProyectoRecienCreado } from "@/lib/hubspot/sync-projects";
import { createHandoffCanvas } from "@/lib/canvas/default-canvases";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { duenioDelHandoff } from "@/lib/handoff/duenio";
import { resolvePipeline } from "@/lib/projects/kind";
import { altaEnCurso, parseEstadoDeAlta, type EstadoDeAltaEnBase } from "@/lib/projects/alta";

/**
 * lib/projects/alta-runner.ts  (Tanda C — el motor del alta)
 *
 * Lleva un alta de `pendiente_crm` → `pendiente_espejo` → `listo`. Se puede llamar las veces que
 * haga falta: cada llamada avanza lo que pueda y deja escrito dónde quedó.
 *
 * ── IDEMPOTENTE Y RE-ENTRANTE, Y ESO ES TODO EL PUNTO ────────────────────────
 * Un alta cruza dos sistemas. Entre "HubSpot recibió el pedido" y "Nexus guardó el id" hay red,
 * y ahí se puede morir el proceso, caducar un timeout o entrar un deploy. Si el reintento
 * volviera a crear, tendríamos dos proyectos iguales en el CRM — el incidente que ya obligó a
 * escribir `scripts/cleanup-handoff-dup-projects.ts`.
 *
 * Por eso el orden es: ANTES de crear, buscar si un intento anterior ya dejó un record y
 * adoptarlo. No es una optimización: es lo único que hace que "Reintentar" sea seguro.
 *
 * ── SOLO TERMINA CUANDO HUBSPOT CONFIRMÓ ─────────────────────────────────────
 * Pasar a `listo` exige que el tipo materializado sea el que se eligió y —si se declaró
 * hermano— que la hermandad haya quedado resuelta. Un `listo` prematuro deja el proyecto en la
 * fila por defecto: facturable, con los documentos de otro tipo, y sin que nada avise.
 */

export interface ResultadoDelAlta {
  estado: EstadoDeAltaEnBase;
  /** ¿Quedó en `listo`? */
  termino: boolean;
  /** `null` si el paso salió bien. Si no, el motivo — y el alta sigue retomable. */
  error: string | null;
  hubspotServiceId: string | null;
  /** Reusó el record de un intento anterior en vez de crear uno nuevo. */
  adoptado: boolean;
}

/** El proyecto ya no está en un alta en curso: no hay nada que avanzar. */
function nadaQueHacer(estado: EstadoDeAltaEnBase, hubspotServiceId: string | null): ResultadoDelAlta {
  return { estado, termino: estado === "listo" || estado === null, error: null, hubspotServiceId, adoptado: false };
}

/** Error del paso: se escribe, el alta queda donde estaba y se puede reintentar. */
async function fallar(
  projectId: string,
  estado: EstadoDeAltaEnBase,
  hubspotServiceId: string | null,
  error: string,
): Promise<ResultadoDelAlta> {
  await prisma.project
    .update({ where: { id: projectId }, data: { altaError: error.slice(0, 1000) } })
    .catch(() => {});
  return { estado, termino: false, error, hubspotServiceId, adoptado: false };
}

export async function avanzarAlta(projectId: string): Promise<ResultadoDelAlta> {
  /* PASO 0 — releer SIEMPRE. Es el candado más barato del motor: entre que alguien apretó
     "Reintentar" y que esta función corre, otra corrida pudo haber avanzado el alta. Leer el
     estado de la base (y no confiar en lo que trajo el llamador) evita crear dos veces. */
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, name: true, clientId: true, hubspotServiceId: true, hubspotDealId: true,
      hubspotPipelineId: true, hermanoCsProjectId: true,
      altaEstado: true, altaPipelineElegido: true, altaInternoDeclarado: true,
      altaHermanoHsId: true, altaIniciadaAt: true, altaReclasificadoAt: true,
      canvases: { where: canvasOf("handoff"), select: { id: true } },
      handoff: { select: { id: true } },
      client: { select: { hubspotCompanyId: true, ignoredHubspotServiceIds: true } },
    },
  });
  if (!p) return { estado: null, termino: false, error: "El proyecto no existe", hubspotServiceId: null, adoptado: false };

  let estado = parseEstadoDeAlta(p.altaEstado);
  if (!altaEnCurso(estado)) return nadaQueHacer(estado, p.hubspotServiceId);

  await prisma.project
    .update({
      where: { id: projectId },
      data: { altaIntentos: { increment: 1 }, altaUltimoIntentoAt: new Date(), altaError: null },
    })
    .catch(() => {});

  let serviceId = p.hubspotServiceId;
  let adoptado = false;

  /* Si YA tiene su id, el paso de HubSpot está hecho aunque el estado diga otra cosa — es
     exactamente el caso "el POST salió pero el proceso murió antes de sellar el estado". */
  /* Si YA tiene su id, el paso de HubSpot está hecho aunque el estado diga otra cosa.
     Abajo las dos escrituras van juntas, así que el motor no puede dejar ese desfasaje él mismo
     — pero el ESPEJO sí: al adoptar un proyecto por nombre le escribe el id sin tocar el estado.
     Sin este salto, esa fila entraría a crear un segundo record en HubSpot. */
  if (serviceId && estado === "pendiente_crm") estado = "pendiente_espejo";

  // ── pendiente_crm: dejar el proyecto creado en HubSpot ──────────────────────
  if (estado === "pendiente_crm") {
    if (!p.client.hubspotCompanyId) {
      return fallar(projectId, estado, null, "El cliente no tiene empresa en HubSpot: primero se crea la empresa allá.");
    }
    if (!(await hasProjectsWriteScope())) {
      return fallar(projectId, estado, null, "La app no tiene permiso para crear proyectos en HubSpot (crm.objects.projects.write).");
    }

    const pipeline = resolvePipeline(p.altaPipelineElegido);
    if (!pipeline) {
      return fallar(projectId, estado, null, `El tipo de proyecto elegido no está declarado: ${p.altaPipelineElegido ?? "(vacío)"}`);
    }

    const hs = await getSystemHubspotClient();

    // 1. ¿Un intento anterior ya lo creó? Adoptarlo antes de crear otro.
    const previo = await buscarRecordDeUnIntentoAnterior(hs, {
      nombre: p.name,
      companyId: p.client.hubspotCompanyId,
      desde: p.altaIniciadaAt,
      suprimidos: p.client.ignoredHubspotServiceIds,
    });

    if (previo === "suprimido") {
      return fallar(
        projectId,
        estado,
        null,
        "Ese proyecto se borró a propósito desde Nexus y está en la lista de supresión. " +
          "Para reactivarlo: scripts/unignore-hubspot-service.ts",
      );
    }

    if (previo) {
      serviceId = previo;
      adoptado = true;
    } else {
      try {
        serviceId = await crearProjectRecord(hs, {
          nombre: p.name,
          pipeline,
          interno: p.altaInternoDeclarado ?? false,
          empresaId: p.client.hubspotCompanyId,
          tratoId: p.hubspotDealId,
          hermanoHsId: p.altaHermanoHsId,
          /* El record nace con dueño asignado, igual que por el camino viejo. Es uno de los dos
             comportamientos que solo sabía hacer el asistente de handoff; sin replicarlo, los
             proyectos nuevos nacerían sin dueño en el CRM y nada lo avisaría. */
          ownerId: process.env.HUBSPOT_HANDOFF_OWNER_ID || null,
        });
      } catch (e) {
        return fallar(projectId, estado, null, e instanceof Error ? e.message : String(e));
      }
    }

    /* El id y el estado se sellan en UNA sola escritura. Separados dejaban una ventana —id
       guardado, estado todavía en `pendiente_crm`— y un proceso que muriera justo ahí volvería
       a entrar por la rama de creación. El PASO 0 la cubría, pero cubrir una ventana es peor
       que no tenerla. */
    await prisma.project.update({
      where: { id: projectId },
      data: { hubspotServiceId: serviceId, altaEstado: "pendiente_espejo" },
    });
    estado = "pendiente_espejo";
  }

  // ── pendiente_espejo: traerlo de vuelta y confirmar que quedó como se pidió ──
  if (estado === "pendiente_espejo") {
    if (!serviceId) return fallar(projectId, estado, null, "El alta perdió el id de HubSpot; reintentá.");

    const r = await espejarProyectoRecienCreado(p.clientId, serviceId);
    if (r.errors.length > 0) return fallar(projectId, estado, serviceId, r.errors.join(" · "));

    const post = await prisma.project.findUnique({
      where: { id: projectId },
      select: { hubspotPipelineId: true, hermanoCsProjectId: true },
    });

    /* ── LAS DOS CONFIRMACIONES QUE IMPIDEN UN «listo» MENTIROSO ──────────────
       (a) El tipo tiene que ser el que se eligió. Si no coincide, el proyecto quedaría en la
           fila por defecto —facturable, con los documentos de otro tipo— y nada avisaría.
       (b) Si se declaró hermano, la hermandad tiene que estar RESUELTA. Un desarrollo que
           cuelga de una implementación no se factura aparte; sin resolver, se factura. */
    if (post?.hubspotPipelineId !== p.altaPipelineElegido) {
      return fallar(
        projectId,
        estado,
        serviceId,
        `HubSpot devolvió un tipo distinto del elegido (${post?.hubspotPipelineId ?? "sin tipo"}). El alta espera.`,
      );
    }
    if (p.altaHermanoHsId && !post?.hermanoCsProjectId) {
      return fallar(
        projectId,
        estado,
        serviceId,
        "Todavía no se resolvió de qué proyecto cuelga. El alta espera para no facturarlo aparte.",
      );
    }

    await terminarElAlta(projectId, {
      clientId: p.clientId,
      hubspotDealId: p.hubspotDealId,
      hubspotPipelineId: post.hubspotPipelineId,
      hermanoCsProjectId: post.hermanoCsProjectId,
      yaTieneHandoff: !!p.handoff,
      yaTieneCanvasHandoff: p.canvases.length > 0,
      yaReclasificado: !!p.altaReclasificadoAt,
    });
    return { estado: "listo", termino: true, error: null, hubspotServiceId: serviceId, adoptado };
  }

  return { estado, termino: false, error: null, hubspotServiceId: serviceId, adoptado };
}

/**
 * La transición a LISTO. Acá nace el documento de handoff — no antes.
 *
 * ── POR QUÉ EL HANDOFF NACE ACÁ Y NO EN EL ALTA ──────────────────────────────
 * `duenioDelHandoff` decide con el tipo del proyecto y con su hermano. En el instante del alta
 * las dos cosas valen `null` —Nexus tiene prohibido escribirlas y el espejo todavía no corrió—,
 * así que la regla devolvería SIEMPRE "propio". O sea: todo desarrollo que cuelga de una
 * implementación nacería con un documento propio que contradice al de su hermana, y nadie se
 * enteraría hasta leerlos juntos.
 *
 * Acá los dos datos ya están materializados, así que la regla decide con la verdad.
 */
async function terminarElAlta(
  projectId: string,
  ctx: {
    clientId: string;
    hubspotDealId: string | null;
    hubspotPipelineId: string | null;
    hermanoCsProjectId: string | null;
    yaTieneHandoff: boolean;
    yaTieneCanvasHandoff: boolean;
    yaReclasificado: boolean;
  },
): Promise<void> {
  const duenio = duenioDelHandoff({
    projectId,
    hubspotPipelineId: ctx.hubspotPipelineId,
    hermanoCsProjectId: ctx.hermanoCsProjectId,
    tieneHandoffPropioConContenido: ctx.yaTieneHandoff,
  });

  await prisma.$transaction(async (tx) => {
    if (!duenio.redirigido && !ctx.yaTieneHandoff) {
      if (!ctx.yaTieneCanvasHandoff) await createHandoffCanvas(projectId, tx);
      await tx.handoff.create({
        data: {
          clientId: ctx.clientId,
          projectId,
          hubspotDealId: ctx.hubspotDealId,
          /* El record de HubSpot YA existe y el proyecto ya lo tiene apuntado, así que cuando
             este handoff sincronice va a LINKEARSE a ese (caso A de `syncHandoffToHubspot`), no
             a crear un segundo. */
          hubspotSyncStatus: "pending",
        },
      });
    }

    await tx.project.update({
      where: { id: projectId },
      data: {
        altaEstado: "listo",
        altaError: null,
        // El sello va en la MISMA escritura que marca listo: si se sellara aparte, un fallo en
        // el medio dejaría el alta terminada y la reclasificación impaga, o al revés.
        ...(ctx.yaReclasificado ? {} : { altaReclasificadoAt: new Date() }),
      },
    });
  });

  /* La reclasificación de sesiones cuesta ~US$1 de modelo por corrida. Se dispara UNA vez —el
     sello de arriba lo garantiza aunque se reintente diez— y va fuera de la transacción porque
     es larga y no puede hacer fallar el alta que ya terminó. */
  if (!ctx.yaReclasificado) {
    void import("@/lib/sessions/reclassify")
      .then((m) => m.reclassifyClientSessions(ctx.clientId))
      .catch(() => {});
  }
}

/** El objeto "projects" tal como lo nombran las rutas de lectura del portal. */
const SLUG_PROYECTOS = "projects";

/**
 * ¿Un intento anterior de ESTA alta ya dejó un record en HubSpot?
 *
 * Busca por nombre exacto dentro de la empresa, creado DESPUÉS de que arrancó el alta. Las tres
 * condiciones importan:
 *  · el nombre y la empresa lo identifican;
 *  · `desde` evita adoptar un proyecto viejo y homónimo de la misma empresa — sin eso, un alta
 *    llamada como un proyecto de hace dos años se lo apropiaría;
 *  · un record ya reclamado por otro proyecto de Nexus (`hubspotServiceId` es único) no se toca.
 *
 * Devuelve `"suprimido"` si el candidato está en la lista de borrados a propósito: ahí hay que
 * decirlo con palabras, porque si no el alta reintentaría para siempre sin explicar por qué.
 */
async function buscarRecordDeUnIntentoAnterior(
  hs: Awaited<ReturnType<typeof getSystemHubspotClient>>,
  opts: { nombre: string; companyId: string; desde: Date | null; suprimidos: string[] },
): Promise<string | "suprimido" | null> {
  const desdeMs = (opts.desde ?? new Date(Date.now() - 24 * 3600 * 1000)).getTime();
  let candidatos: string[] = [];
  try {
    const res = await hs.apiRequest({
      method: "POST",
      path: `/crm/v3/objects/${SLUG_PROYECTOS}/search`,
      body: {
        filterGroups: [
          {
            filters: [
              { propertyName: "hs_name", operator: "EQ", value: opts.nombre },
              { propertyName: "hs_createdate", operator: "GTE", value: String(desdeMs) },
            ],
          },
        ],
        properties: ["hs_name"],
        limit: 20,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: Array<{ id: string }> };
    candidatos = (data.results ?? []).map((r) => r.id);
  } catch {
    /* No poder preguntar NO es "no existe". Devolver null hace que se cree uno nuevo, que es el
       riesgo que este paso vino a evitar — pero la alternativa (fallar el alta) la traba por un
       hipo de la API. Se elige avanzar: el duplicado es recuperable a mano; el alta trabada para
       siempre, no. Queda anotado como el borde conocido de este diseño. */
    return null;
  }
  if (candidatos.length === 0) return null;

  const suprimidos = new Set(opts.suprimidos);
  const suprimido = candidatos.find((id) => suprimidos.has(id));
  if (suprimido && candidatos.every((id) => suprimidos.has(id))) return "suprimido";

  const libres = candidatos.filter((id) => !suprimidos.has(id));
  const yaReclamados = await prisma.project.findMany({
    where: { hubspotServiceId: { in: libres } },
    select: { hubspotServiceId: true },
  });
  const reclamados = new Set(yaReclamados.map((r) => r.hubspotServiceId));
  return libres.find((id) => !reclamados.has(id)) ?? null;
}
