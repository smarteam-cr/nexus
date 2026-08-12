import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { guardPermission, guardAccessToClient, guardCapability } from "@/lib/auth/api-guards";
import { createDefaultCanvases } from "@/lib/canvas/default-canvases";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import {
  anotarReapunte,
  reapuntarEnTx,
  resolverClienteDeLaEmpresa,
  type Reapunte,
} from "@/lib/hubspot/cliente-de-la-empresa";
import { hasProjectsWriteScope } from "@/lib/hubspot/project-record";
import { avanzarAlta } from "@/lib/projects/alta-runner";
import { exigeTratoGanado, parseProjectPipeline, resolvePipeline } from "@/lib/projects/kind";
import { sanitizeTags } from "@/lib/tags/catalog";

/**
 * POST /api/projects — EL ALTA ÚNICA (Tanda C).
 *
 * Deja el proyecto creado en Nexus **y** en HubSpot, del tipo elegido. Si HubSpot falla en el
 * medio, el proyecto queda con el alta a medio hacer: se ve, se puede retomar, y mientras tanto
 * no cobra, no suma a la cartera de nadie y no se le publica nada al cliente.
 *
 * ── LO QUE ESTE ENDPOINT NO HACE ─────────────────────────────────────────────
 * NO crea la entidad Handoff. Nace en la transición a «listo» (ver `alta-runner.ts`), cuando el
 * tipo y el hermano ya están materializados: acá todavía valen null y la regla que decide
 * «handoff propio o el del hermano» diría siempre «propio».
 *
 * NO escribe la clase del proyecto en Nexus. El tipo elegido viaja a HubSpot y vuelve por el
 * espejo — si Nexus lo guardara, el sync lo revertiría en diez minutos sobre un campo que
 * decide facturación (ver la guarda de escritor único en `scope-coverage.test.ts`).
 *
 * NO pide fecha estimada de arranque. `anchorStartDate` y `fechaInicioFacturacion` son plata.
 */

interface Body {
  /** Cliente existente. Alternativa: `companyId` + `companyName` para uno nuevo. */
  clientId?: string;
  companyId?: string;
  companyName?: string;
  domain?: string;
  /** Nombre del proyecto. Sin default: un «Onboarding» genérico hace que dos altas se mezclen. */
  nombre?: string;
  /** Clave del pipeline: "customer-success" | "development" | "web". */
  pipeline?: string;
  interno?: boolean;
  /** Id de HubSpot de la implementación de la que cuelga, si es un hermano. */
  hermanoHsId?: string;
  dealId?: string;
  /** Por qué se acepta sin trato ganado. Obligatorio cuando el proyecto cobra. */
  sinTratoMotivo?: string;
  /** ADJUNTAR: el record ya existe en HubSpot y se elige del picker. */
  hubspotServiceId?: string;
}

const malo = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const guard = await guardPermission("proyectos", "create");
  if (guard instanceof NextResponse) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return malo("Cuerpo inválido");
  }

  // ── Precondiciones: TODAS antes de escribir nada ────────────────────────────
  const nombre = body.nombre?.trim();
  if (!nombre) return malo("El proyecto necesita un nombre.");

  const pipeline = parseProjectPipeline(body.pipeline);
  if (!pipeline) return malo("Elegí de qué tipo es el proyecto.");

  const interno = body.interno === true;
  const hermanoHsId = body.hermanoHsId?.trim() || null;
  const dealId = body.dealId?.trim() || null;
  let sinTratoMotivo = body.sinTratoMotivo?.trim() || null;

  /**
   * ADJUNTAR = traer a Nexus un proyecto que YA existe en HubSpot. Se lee acá arriba, antes de
   * las validaciones, porque cambia cuáles aplican.
   */
  const adjuntar = body.hubspotServiceId?.trim() || null;

  /* La regla del trato se DERIVA de si el proyecto cobra, no se declara. Así la excepción del
     interno y la del hermano caen solas de la tabla de decisiones: el día que una fila cambie de
     `cobranza`, esta regla la sigue sin que nadie se acuerde de tocarla acá.

     ⚠ NO aplica al ADJUNTAR, y ésa es la diferencia que faltaba. La regla protege al proyecto
     que se CREA facturable sin ancla comercial; traer uno que ya existe en HubSpot no crea nada
     que cobre allá. Peor: la pantalla ya apaga el bloque del trato cuando se adjunta, así que
     con 0 o con 2+ tratos ganados —el cliente recurrente, justo el que uno viene a buscar— el
     servidor devolvía «elegí el trato ganado» y NO HABÍA NINGÚN CAMPO en pantalla para
     contestarlo. Callejón sin salida, y el síntoma no se parece a una validación del servidor. */
  if (!adjuntar && exigeTratoGanado({ pipeline, interno, tieneHermano: !!hermanoHsId })) {
    if (!dealId && !sinTratoMotivo) {
      return malo("Este proyecto se le cobra al cliente: elegí el trato ganado o explicá por qué va sin trato.");
    }
  }

  /* La excepción deja rastro. Sin esto, un proyecto facturable sin trato es indistinguible de
     uno al que alguien decidió no ponerle: Cobranza le va a auto-asignar el trato ganado más
     reciente de la empresa, que para un cliente recurrente puede ser el equivocado. Al menos el
     caso queda auditable con una query. */
  if (adjuntar && !dealId && !sinTratoMotivo) {
    sinTratoMotivo = "Traído de HubSpot sin trato elegido";
  }

  // ── El cliente ──────────────────────────────────────────────────────────────
  let clientId: string;
  /** Se llenan solo cuando el alta cae en un cliente que YA existía. Viajan a la respuesta. */
  let reusado: { nombre: string; reapuntado: boolean } | null = null;
  let reapunte: Reapunte | null = null;
  if (body.clientId) {
    const g = await guardAccessToClient(body.clientId);
    if (g instanceof NextResponse) return g;
    clientId = body.clientId;
  } else if (body.companyId && body.companyName?.trim()) {
    /* Crear un cliente NUEVO desde una empresa de HubSpot es dar de alta una cuenta que nadie
       tenía, así que pide ver la cartera completa. Los tres roles con `proyectos.create` ya la
       tienen; el candado es para el día que alguien prenda la celda a un CSE desde /team: sin
       esto podría fabricar clientes con empresas que no le tocan. Elegir un cliente EXISTENTE
       (la rama de arriba) sigue pasando por su propio acceso. */
    const verTodo = await guardCapability("seeAllClients");
    if (verTodo instanceof NextResponse) return verTodo;

    /* NO es un `findFirst` por el id: si la empresa se fusionó, el cliente está guardado bajo la
       ficha vieja y el id que llega acá es el de la nueva, así que no matchearía y nacería un
       cliente duplicado. Ver lib/hubspot/cliente-de-la-empresa.ts. */
    const resolucion = await resolverClienteDeLaEmpresa(await getSystemHubspotClient(), body.companyId);
    if (resolucion.estado === "ambiguo") return malo(resolucion.mensaje, 409);

    if (resolucion.estado === "ninguno") {
      clientId = (
        await prisma.client.create({
          data: {
            name: body.companyName.trim(),
            company: body.companyName.trim(),
            hubspotCompanyId: body.companyId,
            emailDomains: body.domain ? [body.domain.trim().toLowerCase()] : [],
          },
          select: { id: true },
        })
      ).id;
    } else {
      clientId = resolucion.clientId;
      reusado = { nombre: resolucion.nombre, reapuntado: resolucion.estado === "encontrado-fusionado" };
      /* El reapunte NO se aplica acá: se guarda y se escribe recién en la transacción que crea el
         proyecto, más abajo. Entre este punto y esa transacción hay seis salidas que rechazan el
         alta (hermano inválido, record en la denylist, record ya tomado, sin scope de escritura),
         y cualquiera de ellas dejaría un cliente movido por un alta que nunca existió. */
      if (resolucion.estado === "encontrado-fusionado") reapunte = resolucion.reapunte;
    }
  } else {
    return malo("Falta el cliente (o la empresa de HubSpot para crearlo).");
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { hubspotCompanyId: true, ignoredHubspotServiceIds: true },
  });
  if (!client?.hubspotCompanyId) {
    return malo("Ese cliente no tiene empresa en HubSpot. Primero se crea la empresa allá.");
  }

  // ── El hermano: solo una implementación de Customer Success del MISMO cliente ─
  if (hermanoHsId) {
    const hermano = await prisma.project.findUnique({
      where: { hubspotServiceId: hermanoHsId },
      select: { clientId: true, hubspotPipelineId: true },
    });
    if (!hermano || hermano.clientId !== clientId) {
      return malo("El proyecto del que cuelga no es de este cliente.");
    }
    if (resolvePipeline(hermano.hubspotPipelineId)?.key !== "customer-success") {
      return malo("Solo se puede colgar de una implementación de Customer Success.");
    }
    if (!pipeline.canBeSiblingOf.includes("customer-success")) {
      return malo(`Un proyecto de ${pipeline.label} no puede colgar de una implementación.`);
    }
  }

  // ── ADJUNTAR: el record elegido no puede estar borrado a propósito ni tomado ──
  // (`adjuntar` se calcula arriba, junto a las precondiciones: decide si la regla del trato aplica)
  if (adjuntar) {
    if (client.ignoredHubspotServiceIds.includes(adjuntar)) {
      return NextResponse.json(
        {
          error:
            "Ese proyecto se borró a propósito desde Nexus y no se re-agrega solo. " +
            "Para reactivarlo: scripts/unignore-hubspot-service.ts",
        },
        { status: 409 },
      );
    }
    const tomado = await prisma.project.findUnique({
      where: { hubspotServiceId: adjuntar },
      select: { id: true, name: true, clientId: true },
    });
    if (tomado) {
      /* Van los DOS ids. La pantalla ofrece "abrir el que ya existe" solo si tiene los dos
         (la URL del proyecto los necesita), así que mandando uno solo esa rama era código
         muerto y la persona veía un error crudo en vez de un lugar adonde ir. Invisible para
         `tsc` y para el build: los dos extremos compilan, la cadena está cortada en el medio. */
      return NextResponse.json(
        {
          error: `Ese proyecto ya existe en Nexus como «${tomado.name}».`,
          projectId: tomado.id,
          clientId: tomado.clientId,
        },
        { status: 409 },
      );
    }
  }

  /* El scope se comprueba ANTES de crear la fila: sin él, el alta nacería condenada a quedar en
     `pendiente_crm` para siempre y el usuario vería un proyecto trabado sin saber por qué. */
  if (!adjuntar && !(await hasProjectsWriteScope())) {
    return NextResponse.json(
      { error: "La app no tiene permiso para crear proyectos en HubSpot. Hay que re-autorizarla." },
      { status: 409 },
    );
  }

  // ── La escritura ────────────────────────────────────────────────────────────
  const projectId = await prisma.$transaction(async (tx) => {
    /* Acá, y no antes: ya pasaron TODAS las precondiciones, así que el cliente se mueve a la
       empresa viva solo si el proyecto nace de verdad. Y tiene que ser antes de `avanzarAlta`,
       que lee `client.hubspotCompanyId` de la base para colgar el registro nuevo de HubSpot: si
       la lápida siguiera ahí, el proyecto nacería asociado a una ficha muerta y el sync volvería
       a encontrar cero — el síntoma exacto que todo esto vino a matar. */
    if (reapunte) {
      const { businessCases } = await reapuntarEnTx(tx, reapunte);
      console.warn(anotarReapunte(reapunte, reusado?.nombre ?? "", businessCases));
    }

    const proyecto = await tx.project.create({
      data: {
        clientId,
        name: nombre,
        status: "active",
        hubspotDealId: dealId,
        /* ADJUNTAR arranca un paso más adelante: el record ya existe, solo falta traerlo.
           El resto arranca en `pendiente_crm`, que es lo que pone al proyecto en cuarentena
           —no cobra, no suma a la cartera, no se publica— hasta que HubSpot confirme. */
        hubspotServiceId: adjuntar,
        altaEstado: adjuntar ? "pendiente_espejo" : "pendiente_crm",
        altaPipelineElegido: pipeline.hubspotPipelineId,
        altaInternoDeclarado: interno,
        altaHermanoHsId: hermanoHsId,
        altaSinTratoMotivo: sinTratoMotivo,
        altaIniciadaAt: new Date(),
        altaActorEmail: guard.user.email,
      },
      select: { id: true },
    });

    /* Propagación BC→Project: si hay un business case del mismo trato, su clasificación nace en
       el proyecto. Es el segundo comportamiento que solo sabía hacer el camino viejo; sin
       replicarlo los proyectos nacerían grises y nadie se enteraría. Escopado por `clientId`:
       `hubspotDealId` no es único en BusinessCase, así que sin eso podría leer el de otro. */
    if (dealId) {
      const bc = await tx.businessCase.findFirst({
        where: { hubspotDealId: dealId, clientId },
        select: { tags: true },
        orderBy: { createdAt: "desc" },
      });
      if (bc && bc.tags.length > 0) {
        await tx.project.update({ where: { id: proyecto.id }, data: { tags: sanitizeTags(bc.tags) } });
      }
    }

    // Las piezas del TIPO elegido, no las de Customer Success por descarte.
    await createDefaultCanvases(proyecto.id, pipeline.hubspotPipelineId, tx);
    return proyecto.id;
  });

  /* El motor corre EN LÍNEA: la persona está esperando y lo que pidió es un proyecto creado, no
     una promesa. Si falla, el alta queda pendiente con su motivo escrito y el cartel ofrece
     "Reintentar" — por eso este `await` no se envuelve en un try: `avanzarAlta` no tira, deja
     el error en la fila y lo devuelve. */
  const alta = await avanzarAlta(projectId);

  return NextResponse.json(
    {
      projectId,
      clientId,
      estado: alta.estado,
      termino: alta.termino,
      error: alta.error,
      hubspotServiceId: alta.hubspotServiceId,
      /* Que la persona se entere de que el proyecto NO nació en un cliente nuevo. Sin esto el
         alta dice "empresa nueva" en el paso 1 y termina en un cliente que ya existía, sin que
         nada lo explique. */
      clienteReusado: reusado,
    },
    { status: 201 },
  );
}
