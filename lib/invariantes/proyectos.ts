/**
 * lib/invariantes/proyectos.ts — los invariantes de proyectos: hermanos, clase, etapa y alta
 * (extraídos de scripts/check-invariants.ts en B-07, 2026-09-04; el texto viene de ahí).
 */
import { PROJECT_PIPELINES, buscarEtapa, resolvePipeline } from "@/lib/projects/kind";
import { ESTADOS_DE_ALTA, altaEnCurso } from "@/lib/projects/alta";
import { cumple, viola, type Invariante } from "./contrato";

/** El pipeline de Customer Success: el único que puede ser hermano MAYOR. Sale de la tabla, nunca a mano (creador-unico.test.ts). */
const PIPELINE_CUSTOMER_SUCCESS = PROJECT_PIPELINES.find((p) => p.key === "customer-success")?.hubspotPipelineId ?? "";

const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
const UN_DIA = 24 * 60 * 60 * 1000;

/**
 * INV8 · El HERMANO de un proyecto está sano: no cruza cliente y no es él mismo. Un hermano
 * decide FACTURACIÓN (un desarrollo colgado de una implementación no se cobra aparte), así que un
 * vínculo mal resuelto es plata mal contada.
 */
export const INV8: Invariante = {
  id: "8",
  nombre: "ningún hermano cruza cliente ni es hermano de sí mismo",
  async correr(db) {
    const conVinculo = await db.project.findMany({
      where: { hermanoCsProjectId: { not: null } },
      select: { id: true, name: true, clientId: true, hermanoCsProjectId: true, client: { select: { name: true } } },
    });
    const porId = new Map(conVinculo.map((p) => [p.id, p]));
    // 8a. Cruzar cliente. El resolvedor solo mira dentro del mismo cliente, así que esto solo
    // puede aparecer por un dato viejo o escrito a mano.
    const hermanosCruzados: string[] = [];
    // 8b. Hermano de sí mismo.
    const hermanosDeSiMismo: string[] = [];
    for (const p of conVinculo) {
      if (!p.hermanoCsProjectId) continue;
      if (p.hermanoCsProjectId === p.id) {
        hermanosDeSiMismo.push(`${p.client.name} · "${p.name}"`);
        continue;
      }
      const otro = porId.get(p.hermanoCsProjectId);
      // Si el hermano no está en este conjunto hay que traerlo aparte para saber su cliente.
      const clienteDelOtro =
        otro?.clientId ??
        (await db.project.findUnique({ where: { id: p.hermanoCsProjectId }, select: { clientId: true } }))?.clientId ??
        null;
      if (clienteDelOtro === null) {
        /* ⚠ Apunta a un proyecto que ya no existe. Acá decía que eso "degrada a aparte (se
           factura), que es el lado seguro" — y es FALSO, corregido el 2026-08-05: el criterio de
           cobranza `NO_ES_HERMANO_DE_CS` exige `hermanoCsProjectId === null`, y un puntero muerto
           NO es null. O sea que el proyecto **deja de facturar en silencio** hasta que el próximo
           sync recalcule los hermanos. Es lo contrario del lado seguro, y el operador que leía
           este mensaje se quedaba tranquilo. */
        hermanosCruzados.push(`${p.client.name} · "${p.name}" → apunta a un proyecto BORRADO`);
      } else if (clienteDelOtro !== p.clientId) {
        hermanosCruzados.push(`${p.client.name} · "${p.name}" → hermano de OTRO cliente`);
      }
    }
    if (hermanosCruzados.length > 0 || hermanosDeSiMismo.length > 0) {
      return viola(
        `✗ INV8: ${hermanosCruzados.length + hermanosDeSiMismo.length} hermano(s) mal resuelto(s):`,
        ...[...hermanosCruzados, ...hermanosDeSiMismo].map((s) => `    - ${s}`),
        "  Un hermano decide si el proyecto se factura. Revisar la asociación en HubSpot.",
      );
    }
    return cumple("✓ INV8a/b: ningún hermano cruza cliente ni es hermano de sí mismo.");
  },
};

/**
 * INV8c · Vínculos declarados que siguen sin resolver aunque el proyecto apuntado YA existe en
 * Nexus. Uno pendiente es normal (el hermano todavía no entró); uno pendiente con el objetivo
 * presente significa que `resolverHermanos` no corrió o falló.
 */
export const INV8c: Invariante = {
  id: "8c",
  nombre: "no hay hermanos resolubles sin resolver",
  async correr(db, ahora) {
    const conVinculo = await db.project.findMany({
      where: { hermanoCsProjectId: null, hubspotRelatedProjectIds: { isEmpty: false } },
      select: { id: true, name: true, clientId: true, hubspotRelatedProjectIds: true, updatedAt: true, client: { select: { name: true } } },
    });
    const idsHsPresentes = new Set(
      (
        await db.project.findMany({
          where: { hubspotServiceId: { not: null } },
          select: { hubspotServiceId: true, clientId: true, hubspotPipelineId: true },
        })
      )
        .filter((p) => p.hubspotPipelineId === PIPELINE_CUSTOMER_SUCCESS)
        .map((p) => `${p.clientId}:${p.hubspotServiceId}`),
    );
    const pendientesResolubles = conVinculo.filter(
      (p) =>
        p.hubspotRelatedProjectIds.some((r) => idsHsPresentes.has(`${p.clientId}:${r}`)) &&
        ahora.getTime() - p.updatedAt.getTime() > SIETE_DIAS,
    );
    if (pendientesResolubles.length > 0) {
      return viola(
        `✗ INV8c: ${pendientesResolubles.length} proyecto(s) con un vínculo declarado hace más de 7 días cuyo hermano SÍ existe en Nexus:`,
        ...pendientesResolubles.map((p) => `    - ${p.client.name} · "${p.name}"`),
        "  resolverHermanos() (lib/hubspot/sync-projects.ts) no está corriendo o falla.",
      );
    }
    return cumple("✓ INV8c: no hay hermanos resolubles sin resolver.");
  },
};

/**
 * INV10 · Ningún proyecto sincronizado ACTIVO se quedó sin clase. Un proyecto con hubspotServiceId
 * y sin hubspotPipelineId es uno que el sync escribió sin decirle de qué pipeline viene. Mientras
 * dura, se comporta como Customer Success.
 *
 * Se mira SOLO los activos, y no es para que el invariante pase: los cuatro criterios de alcance
 * (lib/projects/scope.ts) exigen `status: "active"`, así que un proyecto inactivo no entra a
 * cartera, ni a cobranza, ni al vigilante. La justificación de este invariante no le aplica. Hoy
 * eso deja afuera a 18 fantasmas de un portal de cliente al que ya no tenemos acceso, que van a
 * quedar en NULL para siempre y no molestan a nadie.
 *
 * El día de gracia cubre la ventana normal entre aplicar el SQL y correr el backfill.
 */
export const INV10: Invariante = {
  id: "10",
  nombre: "todo proyecto sincronizado tiene su pipeline resuelto",
  async correr(db, ahora) {
    const sinClase = await db.project.findMany({
      where: {
        status: "active",
        hubspotServiceId: { not: null },
        hubspotPipelineId: null,
        updatedAt: { lt: new Date(ahora.getTime() - UN_DIA) },
      },
      select: { name: true, status: true, client: { select: { name: true } } },
    });
    if (sinClase.length > 0) {
      return viola(
        `✗ INV10 VIOLADO: ${sinClase.length} proyecto(s) sincronizado(s) sin pipeline resuelto ` +
          `(se comportan como Customer Success: cartera, vigilante y cobranza).`,
        ...sinClase.slice(0, 10).map((p) => `    - ${p.client.name} · "${p.name}" (${p.status})`),
        ...(sinClase.length > 10 ? [`    … y ${sinClase.length - 10} más`] : []),
        "  Corré: npx tsx scripts/backfill-project-pipeline.ts --apply",
        "  Si el backfill los reporta como «no está en ese portal», el objeto de HubSpot ya no\n" +
          "  existe: el proyecto está de más en Nexus y va por la Zona de peligro de la ficha,\n" +
          "  no por el backfill.",
      );
    }
    return cumple("✓ INV10: todo proyecto sincronizado tiene su pipeline resuelto.");
  },
};

/**
 * INV11 · Ninguna etapa materializada ACTIVA quedó fuera de la tabla.
 *
 * `PROJECT_PIPELINES[].stages` está TRANSCRITO a mano del portal. HubSpot deja agregar y renombrar
 * etapas desde la UI, y eso pasó: el 2026-07-30 aparecieron 4 etapas nuevas en el pipeline de
 * Customer Success y la tabla siguió verde todo el día con la versión vieja — ningún test la
 * miraba contra la realidad.
 *
 * Esta invariante cierra el lazo por el único lado que puede: si alguien MUEVE un proyecto a una
 * etapa que la tabla no declara, se ve. No detecta una etapa nueva que nadie usó todavía (para eso
 * está `scripts/inspect-project-pipelines.ts`), pero sí el momento en que empieza a importar.
 *
 * Solo ACTIVOS: un proyecto inactivo no entra a ninguno de los cuatro alcances. Un
 * `hubspotPipelineId` nulo es la fila legacy (la cubre INV10).
 *
 * D-05 (2026-09-04): un pipeline NO nulo que la tabla no declara TAMBIÉN viola. Antes se lo
 * saltaba («no es asunto de esta invariante»), y así un proyecto activo de un pipeline que
 * Nexus no conoce clasificaba A CIEGAS —cae a legacy: cartera, vigilante y cobranza como si
 * fuera Customer Success— sin que ningún invariante lo dijera. El remedio NO es inventar la
 * fila: qué es ese pipeline y si entra a la tabla lo decide Elías con el panel de HubSpot.
 */
export const INV11: Invariante = {
  id: "11",
  nombre: "toda etapa materializada activa está declarada en la tabla",
  async correr(db) {
    // D-05: sin exigir etapa — un pipeline desconocido viola aunque la etapa venga vacía.
    const conPipeline = await db.project.findMany({
      where: { status: "active", hubspotPipelineId: { not: null } },
      select: {
        name: true,
        hubspotPipelineId: true,
        hubspotPipelineStageId: true,
        hubspotPipelineStageLabel: true,
        client: { select: { name: true } },
      },
    });
    const pipelinesDesconocidos = conPipeline.filter((p) => !resolvePipeline(p.hubspotPipelineId));
    const etapasHuerfanas = conPipeline.filter((p) => {
      const def = resolvePipeline(p.hubspotPipelineId);
      return !!def && p.hubspotPipelineStageId !== null && !buscarEtapa(def, p.hubspotPipelineStageId);
    });
    if (pipelinesDesconocidos.length === 0 && etapasHuerfanas.length === 0) {
      return cumple("✓ INV11: toda etapa materializada activa está declarada en la tabla, y ningún activo está en un pipeline desconocido.");
    }
    const lineas: string[] = [];
    if (pipelinesDesconocidos.length > 0) {
      lineas.push(
        `✗ INV11 VIOLADO: ${pipelinesDesconocidos.length} proyecto(s) activo(s) están en un pipeline que ` +
          `lib/projects/kind.ts no declara — clasifican A CIEGAS (caen a legacy: cartera, vigilante y ` +
          `cobranza como si fueran Customer Success).`,
        ...pipelinesDesconocidos
          .slice(0, 10)
          .map((p) => `    - ${p.client.name} · "${p.name}" → pipeline ${p.hubspotPipelineId}`),
        ...(pipelinesDesconocidos.length > 10 ? [`    … y ${pipelinesDesconocidos.length - 10} más`] : []),
        "  ⛔ NO inventar la fila. Abrí el panel de HubSpot (Objetos → Proyectos → Pipelines), mirá qué\n" +
          "  es ese pipeline y decidí con Elías si entra a `PROJECT_PIPELINES` (con sus etapas transcritas\n" +
          "  por `npx tsx scripts/inspect-project-pipelines.ts`) o si esos proyectos se mueven a uno de\n" +
          "  los tres. Hasta entonces este rojo es a propósito.",
      );
    }
    if (etapasHuerfanas.length > 0) {
      lineas.push(
        `✗ INV11 VIOLADO: ${etapasHuerfanas.length} proyecto(s) activo(s) están en una etapa que ` +
          `lib/projects/kind.ts no declara.`,
        ...etapasHuerfanas
          .slice(0, 10)
          .map(
            (p) =>
              `    - ${p.client.name} · "${p.name}" → etapa ${p.hubspotPipelineStageId} ` +
              `("${p.hubspotPipelineStageLabel ?? "sin rótulo"}") del pipeline ${p.hubspotPipelineId}`,
          ),
        ...(etapasHuerfanas.length > 10 ? [`    … y ${etapasHuerfanas.length - 10} más`] : []),
        "  Alguien agregó o renombró etapas en HubSpot. Corré\n" +
          "  `npx tsx scripts/inspect-project-pipelines.ts` y transcribí las etapas nuevas a\n" +
          "  `PROJECT_PIPELINES[].stages`. ⚠ Revisá también `closedStageIds`: si una etapa de\n" +
          "  cierre cambió de id, hay proyectos que se cierran o se abren mal.",
      );
    }
    return viola(lineas[0], ...lineas.slice(1));
  },
};

/**
 * INV14 · Ningún alta lleva días a medio hacer.
 *
 * Un alta a medio hacer pone al proyecto en cuarentena: existe, se abre, se ve normal — y no
 * cobra, no suma a la cartera de nadie, no le nace el handoff y no se le publica nada al cliente.
 * Es el estado más caro del sistema y el más silencioso.
 *
 * La cuarentena está bien: un alta a mitad de camino NO tiene que facturar. Lo que estaba mal es
 * que nadie mide CUÁNTO HACE que está así. El 2026-08-05/06 dos proyectos entraron en cuarentena
 * permanente por una comparación insatisfacible, y los trece invariantes anteriores dieron verde.
 * Ninguno pregunta lo único que importa acá: hace cuánto.
 *
 * ⚠ El umbral es de HORAS y no de días a propósito: el camino feliz termina el alta EN LÍNEA,
 * dentro del mismo request. Un alta que sigue viva a la mañana siguiente no está tardando: está
 * trabada.
 *
 * ⚠ `altaEstado != null` NO es «el alta está en curso»: `listo` es un estado y se PERSISTE. Los
 * estados «a medio hacer» se derivan de la tabla, que es la que sabe cuáles significan eso.
 */
export const HORAS_DE_GRACIA_DEL_ALTA = 12;

export const INV14: Invariante = {
  id: "14",
  nombre: `ningún alta lleva más de ${HORAS_DE_GRACIA_DEL_ALTA} h a medio hacer`,
  async correr(db, ahora) {
    const limiteAlta = new Date(ahora.getTime() - HORAS_DE_GRACIA_DEL_ALTA * 3600_000);
    const EN_CURSO = ESTADOS_DE_ALTA.filter(altaEnCurso);
    const altasViejas = await db.project.findMany({
      where: { altaEstado: { in: [...EN_CURSO] }, altaIniciadaAt: { lt: limiteAlta } },
      select: {
        id: true, name: true, altaEstado: true, altaError: true, altaIntentos: true,
        altaIniciadaAt: true, altaPipelineElegido: true, hubspotPipelineId: true,
        client: { select: { name: true } },
      },
      orderBy: { altaIniciadaAt: "asc" },
    });
    if (altasViejas.length > 0) {
      const lineas: string[] = [
        `✗ INV14 VIOLADO: ${altasViejas.length} alta(s) llevan más de ${HORAS_DE_GRACIA_DEL_ALTA} h sin terminar ` +
          `(esos proyectos NO cobran, no suman a la cartera y no se pueden publicar).`,
      ];
      for (const a of altasViejas.slice(0, 10)) {
        const dias = Math.floor((ahora.getTime() - (a.altaIniciadaAt?.getTime() ?? ahora.getTime())) / 86_400_000);
        lineas.push(`    - ${a.client.name} / ${a.name}: ${a.altaEstado} hace ${dias} d, ${a.altaIntentos} intento(s)`);
        lineas.push(`      ${a.altaError ?? "(sin motivo escrito)"}`);
        /* El caso concreto que originó el invariante lleva su propio remedio: sin el pipeline
           sellado la comparación del motor es insatisfacible y «Reintentar» no puede ganar. */
        if (!a.altaPipelineElegido && a.hubspotPipelineId) {
          lineas.push(
            `      ⚠ sin pipeline elegido y HubSpot dice ${a.hubspotPipelineId}: ` +
              `corré npx tsx scripts/sellar-pipeline-del-alta.ts --apply`,
          );
        }
      }
      if (altasViejas.length > 10) lineas.push(`    … y ${altasViejas.length - 10} más`);
      return viola(...lineas);
    }
    return cumple(`✓ INV14: ningún alta lleva más de ${HORAS_DE_GRACIA_DEL_ALTA} h a medio hacer.`);
  },
};
