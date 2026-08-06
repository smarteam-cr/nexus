import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { listarEmpresasTraibles } from "@/lib/hubspot/empresas-con-proyecto";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { avanzarAlta } from "@/lib/projects/alta-runner";
import { revalidateClientsSidebar } from "@/lib/cache/clients";
import { resolveAllSessions } from "@/lib/sessions/resolve-client";

/**
 * /api/clients/traer-de-hubspot — TRAER UNA EMPRESA QUE HUBSPOT YA TIENE.
 *
 * Trae a Nexus una empresa que en HubSpot ya tiene un proyecto que acá todavía no está. No crea
 * nada en HubSpot: solo copia para este lado.
 *
 * ── EL PERMISO ES LA FORMA DEL ENDPOINT, NO UNA CELDA ───────────────────────
 * Lo puede apretar **cualquier miembro activo del equipo**, y eso es una decisión del usuario.
 * Lo que lo hace seguro no es un permiso: es que el `companyId` **no es una entrada libre**. El
 * POST vuelve a derivar el universo en el servidor y rechaza cualquier id que no esté en esa
 * lista — o sea que el parámetro es un índice dentro de un conjunto que armó el servidor, no un
 * puntero a cualquier empresa del portal.
 *
 * Por eso este endpoint NO necesita el candado `seeAllClients` que sí tiene
 * `POST /api/projects`: aquél recibe un `companyId` libre y sigue siendo apuntable.
 *
 * ⚠ Si alguien "simplifica" la re-derivación y confía en el body, el endpoint se vuelve
 * apuntable y la decisión «todos pueden apretarlo» pasa de segura a peligrosa. Hay guarda.
 *
 * ── LO QUE NO PROTEGE ───────────────────────────────────────────────────────
 * El aviso de ficha gemela (`lib/clients/gemelas.ts`) es un AVISO: hay casos legítimos de dos
 * fichas distintas, así que no puede bloquear. Lo que sí hace es obligar a decir «es otra».
 *
 * ── ⚠ EL PROYECTO NACE CON SU PIPELINE SELLADO, Y NO ES DECORACIÓN ──────────
 * Los dos `project.create` de este archivo escriben `altaPipelineElegido: proyecto.pipelineId`.
 * Sin eso, el motor del alta queda en un estado que NO SE PUEDE SALIR:
 *
 *   alta-runner: `if (post.hubspotPipelineId !== p.altaPipelineElegido) → el alta espera`
 *   por acá:      <el pipeline real> !== null  →  siempre verdadero  →  para siempre
 *
 * El proyecto queda en cuarentena permanente —no cobra, no suma a la cartera, no nace su
 * handoff, no se le publica nada— con un botón «Reintentar» que no puede ganar. Pasó: dos
 * proyectos en producción (2026-08-05/06), y el reporte que lo destapó fue de la persona
 * mirando el cartel, no de un test.
 *
 * ⚠ El arreglo NO es relajar la comparación del motor. Esa comparación existe para atrapar que
 * el record se mueva de pipeline entre que se listó y que se espejó, y es la única confirmación
 * que impide que un proyecto termine en la fila por defecto —que COBRA—. El pipeline lo derivó
 * el servidor al listar; guardarlo conserva la confirmación exacta en vez de apagarla.
 *
 * Por el mismo motivo `createDefaultCanvases` recibe el pipeline y no `null`: con `null` cae a
 * las piezas por defecto —las de una implementación de CS— y un Desarrollo nacía con Kickoff y
 * Exploración y SIN «Requerimientos técnicos», que es su pieza central. Los canvases solo se
 * crean al nacer: nadie los revisa después.
 */

/**
 * Tope diario. Es `MAX_PROJECTS_PER_SWEEP` del vigilante: pasado ese número, los proyectos
 * nuevos se comen el barrido diario entero y el resto de la cartera «entra en el próximo»,
 * reportado en un log que nadie mira. Se cuenta en la BASE y no en memoria para que sobreviva
 * a un reinicio del proceso.
 */
const TOPE_DIARIO = 10;
const FUENTE = "hubspot:traer";

/** Un solo barrido a la vez, para todo el portal. */
let enVuelo: { promesa: Promise<Awaited<ReturnType<typeof listarEmpresasTraibles>>>; actor: string; desde: number } | null = null;
/** Techo de vida: `lib/hubspot/client.ts` no tiene timeout, y una llamada colgada trabaría el botón para siempre. */
const MUTEX_MAX_MS = 5 * 60_000;

function universoCompartido(actor: string) {
  if (enVuelo && Date.now() - enVuelo.desde < MUTEX_MAX_MS) {
    return { promesa: enVuelo.promesa, loCorre: enVuelo.actor, hace: Math.round((Date.now() - enVuelo.desde) / 1000) };
  }
  const promesa = listarEmpresasTraibles().finally(() => {
    enVuelo = null;
  });
  enVuelo = { promesa, actor, desde: Date.now() };
  return { promesa, loCorre: actor, hace: 0 };
}

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { promesa, loCorre, hace } = universoCompartido(guard.teamMember.name);
  const universo = await promesa;
  if (!universo) {
    return NextResponse.json(
      { error: "No se pudo consultar HubSpot. Probá de nuevo en un minuto." },
      { status: 502 },
    );
  }
  return NextResponse.json({
    ...universo,
    // Se dice quién lo está corriendo solo cuando NO es quien preguntó: si no, es ruido.
    enganchadaDe: loCorre !== guard.teamMember.name ? { actor: loCorre, hace } : null,
  });
}

interface Cuerpo {
  companyId?: string;
  hubspotServiceId?: string;
  /** La persona vio la ficha parecida y dijo que es otra empresa. */
  confirmoGemela?: boolean;
  /**
   * «Es la misma»: en vez de crear una ficha, el proyecto se cuelga del cliente que YA existe.
   * Tiene que ser una de las gemelas que calculó el servidor — mismo candado que `companyId`.
   */
  adoptarEnClientId?: string;
}

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  let cuerpo: Cuerpo;
  try {
    cuerpo = (await req.json()) as Cuerpo;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  const companyId = cuerpo.companyId?.trim();
  const hubspotServiceId = cuerpo.hubspotServiceId?.trim();
  if (!companyId || !hubspotServiceId) {
    return NextResponse.json({ error: "Falta la empresa o el proyecto." }, { status: 400 });
  }

  // ── EL PERMISO: el id tiene que estar en la lista que arma el SERVIDOR ──────
  const universo = await listarEmpresasTraibles();
  if (!universo) {
    return NextResponse.json(
      { error: "No se pudo consultar HubSpot. Probá de nuevo en un minuto." },
      { status: 502 },
    );
  }
  const empresa = universo.traibles.find((e) => e.companyId === companyId);
  const proyecto = empresa?.proyectos.find((p) => p.hubspotServiceId === hubspotServiceId);
  if (!empresa || !proyecto) {
    return NextResponse.json(
      { error: "Esa empresa ya está en Nexus, o su proyecto ya se trajo." },
      { status: 409 },
    );
  }

  /**
   * ── «ES LA MISMA»: adoptar el proyecto en la ficha que ya existe ────────────
   *
   * Antes este camino solo NAVEGABA a la ficha, y por eso la fila volvía siempre: la
   * condición que la produce —HubSpot tiene un proyecto que Nexus no tiene— seguía siendo
   * cierta. Un botón en una lista de pendientes que no resuelve el pendiente es peor que no
   * tenerlo: enseña que la lista no se puede vaciar.
   *
   * Ahora el proyecto se cuelga del cliente existente. No se crea ficha, no se toca el
   * `hubspotCompanyId` del cliente (que puede apuntar a la OTRA ficha de HubSpot — el caso
   * real: la misma empresa duplicada allá), y la fila desaparece sola porque el proyecto ya
   * no le falta a Nexus.
   *
   * ⚠ Que el proyecto venga de una empresa distinta a la que el cliente tiene enganchada NO
   * lo pone en riesgo: la reconciliación del espejo verifica cada proyecto directamente en
   * HubSpot y solo desactiva los que están confirmados gone/closed (sync-projects.ts:1409).
   * Uno vivo bajo otra empresa se conserva.
   */
  const adoptarEn = cuerpo.adoptarEnClientId?.trim();
  if (adoptarEn) {
    // Mismo candado que el `companyId`: tiene que ser una de las gemelas que armó el servidor.
    if (!empresa.gemelas.some((g) => g.clientId === adoptarEn)) {
      return NextResponse.json(
        { error: "Esa ficha no es una de las parecidas a esta empresa." },
        { status: 409 },
      );
    }
    /* `hubspotServiceId` es único en toda la tabla: dos clics simultáneos —o uno acá y otro por
       el camino de crear— dan un P2002, no dos proyectos del mismo record. El segundo se queda
       con el que ganó. */
    let p: { id: string };
    try {
      p = await prisma.project.create({
        data: {
          clientId: adoptarEn,
          name: proyecto.nombre,
          status: "active",
          hubspotServiceId: proyecto.hubspotServiceId,
          altaEstado: "pendiente_espejo",
          altaPipelineElegido: proyecto.pipelineId,
          altaIniciadaAt: new Date(),
          altaActorEmail: guard.user.email,
        },
        select: { id: true },
      });
    } catch (e) {
      const yaEsta = await prisma.project.findFirst({
        where: { hubspotServiceId: proyecto.hubspotServiceId },
        select: { id: true, clientId: true },
      });
      if (yaEsta) {
        return NextResponse.json({
          clientId: yaEsta.clientId,
          projectId: yaEsta.id,
          adoptado: true,
          yaEstaba: true,
        });
      }
      console.error("[traer-de-hubspot] no se pudo adoptar", { companyId, adoptarEn }, e);
      return NextResponse.json({ error: "No se pudo traer el proyecto." }, { status: 500 });
    }
    await createDefaultCanvases(p.id, proyecto.pipelineId, undefined);
    const alta = await avanzarAlta(p.id);
    console.info(
      `[traer-de-hubspot] ${guard.user.email} adoptó «${empresa.rotulo}» (${companyId}) en el ` +
        `cliente ${adoptarEn} → proyecto ${p.id}`,
    );
    revalidateClientsSidebar();
    return NextResponse.json({
      clientId: adoptarEn,
      projectId: p.id,
      adoptado: true,
      termino: alta.termino,
    });
  }

  /* Las gemelas se recalculan ACÁ. Leerlas del body sería dejar que el navegador decida si hay
     que avisar — y el navegador es justo quien quiere que no haya aviso. */
  if (empresa.gemelas.length > 0 && !cuerpo.confirmoGemela) {
    return NextResponse.json(
      {
        error: "Esa empresa se parece a una que ya está en Nexus.",
        gemelas: empresa.gemelas,
      },
      { status: 409 },
    );
  }

  const desdeHoy = new Date();
  desdeHoy.setHours(0, 0, 0, 0);
  const traidasHoy = await prisma.client.count({
    where: { source: FUENTE, createdAt: { gte: desdeHoy } },
  });
  if (traidasHoy >= TOPE_DIARIO) {
    return NextResponse.json(
      {
        error:
          `Hoy ya se trajeron ${TOPE_DIARIO} empresas. Mañana se pueden traer más. ` +
          "El vigilante de Éxito del cliente revisa 10 proyectos por día: traer más de golpe " +
          "hace que los proyectos en riesgo dejen de revisarse en silencio.",
      },
      { status: 429 },
    );
  }

  /* Cliente y proyecto en UNA transacción. Si nacieran por separado, cualquier fallo del
     segundo dejaría un Client huérfano: sin proyectos es invisible en el índice, en cobranza y
     en la cartera, pero está plenamente vivo en el clasificador de sesiones como señal fuerte
     por `hubspotCompanyId` — y se lleva en silencio las sesiones del cliente de verdad. */
  let clientId: string;
  let projectId: string;
  try {
    const creado = await prisma.$transaction(async (tx) => {
      const cliente = await tx.client.create({
        data: {
          name: empresa.rotulo,
          company: empresa.rotulo,
          hubspotCompanyId: empresa.companyId,
          emailDomains: empresa.dominio ? [empresa.dominio.toLowerCase()] : [],
          // El par `source`+`sourceExternalId` es único: dos clics simultáneos dan un P2002, no
          // dos clientes. Y es la telemetría — `Client` no tiene `createdBy`.
          source: FUENTE,
          sourceExternalId: empresa.companyId,
        },
        select: { id: true },
      });
      const p = await tx.project.create({
        data: {
          clientId: cliente.id,
          name: proyecto.nombre,
          status: "active",
          hubspotServiceId: proyecto.hubspotServiceId,
          // El record ya existe allá: arranca un paso más adelante, en cuarentena hasta que el
          // espejo confirme (no cobra, no suma a la cartera, no se publica).
          altaEstado: "pendiente_espejo",
          altaPipelineElegido: proyecto.pipelineId,
          altaIniciadaAt: new Date(),
          altaActorEmail: guard.user.email,
        },
        select: { id: true },
      });
      await createDefaultCanvases(p.id, proyecto.pipelineId, tx);
      return { clientId: cliente.id, projectId: p.id };
    });
    clientId = creado.clientId;
    projectId = creado.projectId;
  } catch (e) {
    // Alguien ganó la carrera con el mismo `companyId`: no es un error, es el resultado.
    const yaEsta = await prisma.client.findFirst({
      where: { source: FUENTE, sourceExternalId: companyId },
      select: { id: true },
    });
    if (yaEsta) {
      return NextResponse.json({ clientId: yaEsta.id, projectId: null, yaEstaba: true });
    }
    console.error("[traer-de-hubspot] no se pudo crear", { companyId, hubspotServiceId }, e);
    return NextResponse.json({ error: "No se pudo traer la empresa." }, { status: 500 });
  }

  /* El espejo corre EN LÍNEA. Sin esto hay una ventana en que el cliente es invisible para
     TODOS los CSE —incluido el que lo trajo— porque la visibilidad cuelga de los proyectos, y
     el panel diría «listo» sobre algo que no aparece en ninguna lista. */
  const alta = await avanzarAlta(projectId);

  const proyectoEspejado = await prisma.project.findUnique({
    where: { id: projectId },
    select: { hubspotOwnerEmail: true, hubspotOwnerName: true },
  });
  const encargadoEmail = proyectoEspejado?.hubspotOwnerEmail ?? proyecto.encargadoEmail;
  const encargadoNombre = proyectoEspejado?.hubspotOwnerName ?? proyecto.encargadoNombre;

  console.info(
    `[traer-de-hubspot] ${guard.user.email} trajo «${empresa.rotulo}» (${companyId})` +
      `${empresa.gemelas.length > 0 ? ` PESE A ${empresa.gemelas.length} gemela(s)` : ""}` +
      ` → cliente ${clientId}, proyecto ${projectId}, encargado ${encargadoEmail ?? "ninguno"}`,
  );

  revalidateClientsSidebar();
  // La cola cara: re-atribuir sesiones puede correr el clasificador. No se espera.
  void resolveAllSessions().catch((e) => console.error("[traer-de-hubspot] resolve falló", e));

  return NextResponse.json({
    clientId,
    projectId,
    termino: alta.termino,
    encargadoEmail,
    encargadoNombre,
    /* Los TRES desenlaces, no dos. Sin «no es de nadie», quien trae un proyecto sin encargado
       lee «es de otro», culpa a la regla de visibilidad y se va creyendo que funcionó. */
    loVasAVer: !!encargadoEmail && encargadoEmail.toLowerCase() === guard.user.email.toLowerCase(),
    sinEncargado: !encargadoEmail,
  });
}
