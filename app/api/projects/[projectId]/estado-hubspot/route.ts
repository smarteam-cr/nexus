import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardPermission } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import {
  actualizarEstadoProyecto,
  actualizarEtapaProyecto,
  leerEstadoYEtapa,
} from "@/lib/hubspot/project-record";
import { espejarProyectoRecienCreado } from "@/lib/hubspot/sync-projects";
import { ESTADO_VETADO, esProponible } from "@/lib/projects/estado-hubspot";
import { etapasProponibles } from "@/lib/projects/etapa-hubspot";
import { resolvePipeline } from "@/lib/projects/kind";

/**
 * PATCH /api/projects/[projectId]/estado-hubspot — aceptar una sugerencia de ESTADO y/o ETAPA.
 *
 * ── ESCRIBE EN HUBSPOT, NO EN NEXUS ──────────────────────────────────────────
 * Mismo circuito que `interno/route.ts`, y por el mismo motivo: las cinco columnas CS360 y la
 * etapa las escribe SOLO el espejo (guarda en `scope-coverage.test.ts`). Si esta ruta escribiera
 * `hubspotStatus`, el sync la revertiría en diez minutos y el síntoma sería un botón que "no
 * guarda" sin ningún error. Así que se manda el cambio allá, se trae el espejo de ESE proyecto, y
 * se devuelve **lo que volvió** — no lo que se pidió.
 *
 * ── POR QUÉ ESTADO Y ETAPA COMPARTEN RUTA ────────────────────────────────────
 * Son la misma pregunta —qué dice HubSpot de este proyecto— y el aviso las presenta juntas. En
 * dos requests separados existiría una ventana donde una salió y la otra no, sin nada que lo
 * cuente; acá el espejo corre UNA vez al final y la respuesta describe el estado real de las dos.
 *
 * ── ⚠ SE RELEE EL VALOR EN VIVO ANTES DE ESCRIBIR ────────────────────────────
 * El espejo de un cliente corre cuando alguien abre su ficha, así que la copia de Nexus puede
 * tener días. Si el CSE cambió el valor a mano en HubSpot después de que se armó la sugerencia,
 * aceptarla PISARÍA su decisión sin ninguna señal. Por eso la comparación se hace contra lo que
 * dice el CRM ahora, y si el cliente manda lo que tenía en pantalla (`visto`) y ya no coincide,
 * se devuelve 409 con los dos valores para que la persona decida de nuevo.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;

  const permiso = await guardPermission("proyectos", "cambiarEstadoHubspot");
  if (permiso instanceof NextResponse) return permiso;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: {
    estado?: unknown;
    etapaStageId?: unknown;
    visto?: { estado?: unknown; etapaStageId?: unknown };
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const estado = typeof body.estado === "string" ? body.estado : null;
  const etapaStageId = typeof body.etapaStageId === "string" ? body.etapaStageId : null;
  if (!estado && !etapaStageId) {
    return NextResponse.json(
      { error: "No se pidió ningún cambio: falta `estado` o `etapaStageId`." },
      { status: 400 },
    );
  }
  /* Se valida acá ADEMÁS de en `project-record.ts`. No es redundante: allá el error es una
     excepción que sale como 500, y un valor rechazado por regla de negocio no es una falla del
     servidor — es un pedido inválido, y quien lo mandó tiene que poder distinguirlos. */
  if (estado && !esProponible(estado)) {
    return NextResponse.json(
      { error: `"${estado}" no es un estado que Nexus pueda escribir en HubSpot.` },
      { status: 400 },
    );
  }

  const proyecto = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotServiceId: true, hubspotPipelineId: true },
  });
  if (!proyecto) return NextResponse.json({ error: "Proyecto no existe" }, { status: 404 });

  /* Sin registro en HubSpot no hay dónde escribir. Pasa con un alta a medio hacer: el proyecto
     existe en Nexus pero el CRM todavía no lo conoce. */
  if (!proyecto.hubspotServiceId) {
    return NextResponse.json(
      {
        error:
          "Este proyecto todavía no existe en HubSpot, así que no se le puede cambiar el estado. " +
          "Terminá el alta primero.",
      },
      { status: 409 },
    );
  }

  const def = resolvePipeline(proyecto.hubspotPipelineId);
  if (etapaStageId) {
    /* Sin pipeline resuelto no se puede saber a qué tablero pertenece ese id, y escribirlo a
       ciegas mandaría el registro a una columna que en el suyo no existe. */
    if (!def) {
      return NextResponse.json(
        {
          error:
            "Nexus no reconoce el pipeline de este proyecto, así que no puede mover su etapa " +
            "sin arriesgarse a mandarlo a una columna que no existe en su tablero.",
        },
        { status: 409 },
      );
    }
    if (!etapasProponibles(def).some((e) => e.id === etapaStageId)) {
      return NextResponse.json(
        { error: "Esa etapa no es una etapa movible del tablero de este proyecto." },
        { status: 400 },
      );
    }
  }

  const hs = await getSystemHubspotClient();
  const vivo = await leerEstadoYEtapa(hs, proyecto.hubspotServiceId);

  /* ⚠ «NO MANDÓ `visto`» Y «VIO VACÍO» SON COSAS DISTINTAS, y confundirlas apagaba la guarda
     justo donde más hace falta. Antes esto era `typeof … === "string" ? … : null`, así que un
     `visto: { estado: null }` legítimo —lo que manda el chip sobre los 24 de 67 proyectos SIN
     estado cargado, que son la población que esta función viene a arreglar— quedaba
     indistinguible de «no mandó nada» y el 409 no podía dispararse nunca.
     Se mira la PRESENCIA de la clave, y el valor se normaliza a `null`. */
  const vioEstado = !!body.visto && "estado" in body.visto;
  const vioEtapa = !!body.visto && "etapaStageId" in body.visto;
  const vistoEstado = typeof body.visto?.estado === "string" ? body.visto.estado : null;
  const vistoEtapa = typeof body.visto?.etapaStageId === "string" ? body.visto.etapaStageId : null;
  if (
    (estado && vioEstado && vivo.hs_status !== vistoEstado) ||
    (etapaStageId && vioEtapa && vivo.hs_pipeline_stage !== vistoEtapa)
  ) {
    return NextResponse.json(
      {
        error:
          "Alguien cambió esto en HubSpot desde que se armó la sugerencia. " +
          "Revisá el valor nuevo antes de decidir: aceptar ahora pisaría esa decisión.",
        enHubspot: { estado: vivo.hs_status, etapaStageId: vivo.hs_pipeline_stage },
      },
      { status: 409 },
    );
  }

  /* ⛔ EL VETO SE REVALIDA CONTRA LO VIVO, no contra la copia espejada. `proponerEstadoDesdeMotivo`
     ya se niega a proponer sobre un proyecto `completed`, pero decide con `Project.hubspotStatus`,
     que puede tener días. Si el CSE cerró el proyecto en HubSpot y el espejo todavía dice `null`,
     la sugerencia se arma igual y aceptarla REABRIRÍA un proyecto cerrado — exactamente lo que
     los dos módulos declaran que nunca puede pasar («reactivarlo no está resuelto hoy»).
     Lo mismo para la etapa: si YA está en una terminal, moverla de ahí es reabrir. */
  if (vivo.hs_status === ESTADO_VETADO) {
    return NextResponse.json(
      {
        error:
          "En HubSpot este proyecto figura como CERRADO. Reabrirlo no sale de un botón: si de " +
          "verdad sigue vivo, cambiale el estado allá y volvé a intentar.",
        enHubspot: { estado: vivo.hs_status, etapaStageId: vivo.hs_pipeline_stage },
      },
      { status: 409 },
    );
  }
  if (def && vivo.hs_pipeline_stage && def.closedStageIds.includes(vivo.hs_pipeline_stage)) {
    return NextResponse.json(
      {
        error:
          "En HubSpot este proyecto ya está en una etapa de cierre. Sacarlo de ahí lo reabre, y " +
          "eso se decide en HubSpot, no acá.",
        enHubspot: { estado: vivo.hs_status, etapaStageId: vivo.hs_pipeline_stage },
      },
      { status: 409 },
    );
  }

  const escribirEstado = estado && vivo.hs_status !== estado ? estado : null;
  const escribirEtapa =
    etapaStageId && vivo.hs_pipeline_stage !== etapaStageId ? etapaStageId : null;

  if (!escribirEstado && !escribirEtapa) {
    /* Ya estaba en ese valor. Se espeja igual: la copia de Nexus era la desactualizada, y
       dejarla vieja haría que el mismo aviso vuelva a aparecer mañana. */
    await espejarProyectoRecienCreado(guard.clientId, proyecto.hubspotServiceId).catch(() => null);
    return NextResponse.json({ sinCambios: true, ...(await leerDeNexus(projectId)) });
  }

  if (escribirEstado) await actualizarEstadoProyecto(hs, proyecto.hubspotServiceId, escribirEstado);
  if (escribirEtapa && def) {
    await actualizarEtapaProyecto(hs, proyecto.hubspotServiceId, def, escribirEtapa);
  }

  /* ⚠ HAY QUE MIRAR SI EL ESPEJO FALLÓ. `espejarProyectoRecienCreado` no tira ante un 429 o un
     5xx: acumula el motivo en `errors` y vuelve normal. Sin este chequeo el cambio quedaba
     escrito ALLÁ y no acá, y la respuesta era un 200 con el valor viejo que la pantalla
     celebraba en verde. La divergencia no la cierra nadie: el sync de ese cliente solo corre
     cuando alguien abre su ficha. */
  const espejo = await espejarProyectoRecienCreado(guard.clientId, proyecto.hubspotServiceId);
  if (espejo.errors.length > 0) {
    return NextResponse.json(
      {
        error:
          `Se guardó en HubSpot, pero Nexus no pudo confirmarlo (${espejo.errors[0]}). ` +
          `Volvé a intentar en un minuto: el cambio allá ya está hecho y repetirlo no duplica nada.`,
      },
      { status: 502 },
    );
  }

  return NextResponse.json(await leerDeNexus(projectId));
}

/** Lo que quedó espejado. Se devuelve esto y no lo que se pidió: la pantalla pinta la verdad. */
async function leerDeNexus(projectId: string) {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      hubspotStatus: true,
      hubspotPipelineStageId: true,
      hubspotPipelineStageLabel: true,
    },
  });
  return {
    estado: p?.hubspotStatus ?? null,
    etapaStageId: p?.hubspotPipelineStageId ?? null,
    etapaLabel: p?.hubspotPipelineStageLabel ?? null,
  };
}
