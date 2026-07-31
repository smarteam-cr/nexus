import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemAccessToken, getPortalInfo } from "@/lib/hubspot/client";
import type { PipelineDef } from "@/lib/projects/kind";
import {
  OBJETO_PROYECTOS,
  bloqueDeAsociaciones,
  type AsociacionParaCrear,
} from "@/lib/hubspot/asociaciones-proyecto";

/**
 * lib/hubspot/project-record.ts  (Tanda C — el alta única)
 *
 * EL ÚNICO MÓDULO QUE CREA UN PROYECTO EN HUBSPOT. Un fs-scan lo hace cumplir
 * (`creador-unico.test.ts`): ningún otro archivo de producción puede hacer POST al objeto
 * `0-970`.
 *
 * ── POR QUÉ UNO SOLO ─────────────────────────────────────────────────────────
 * Ya hubo un incidente de proyectos duplicados en el CRM que obligó a escribir
 * `scripts/cleanup-handoff-dup-projects.ts`. Con dos lugares capaces de crear el record vuelve
 * a pasar: uno se arregla, el otro no, y el síntoma —dos proyectos con el mismo nombre— aparece
 * semanas después.
 *
 * ── LAS ASOCIACIONES VAN ADENTRO DEL MISMO POST, Y ESO ES LO IMPORTANTE ──────
 * El camino viejo creaba el record y RECIÉN DESPUÉS lo asociaba a la empresa (tres llamadas
 * más). Si el proceso moría en el medio quedaba un record HUÉRFANO — y un proyecto sin empresa
 * es irrecuperable desde Nexus, porque el espejo descubre proyectos justamente recorriendo las
 * asociaciones de la company. No aparece en ningún lado y nadie sabe que existe.
 *
 * Mandarlas dentro del `POST` las vuelve atómicas: o nace con su empresa, o no nace.
 */

/** El objeto "projects" de HubSpot. Reexportado para que quien cree no importe dos módulos. */
export { OBJETO_PROYECTOS };

/** `hs_name` — el nombre del proyecto (confirmado por inspección del portal). */
const PROP_NOMBRE = "hs_name";
/** `proyecto_interno` — booleancheckbox. Ver `lib/projects/kind.ts` (OVERLAY_INTERNO). */
const PROP_INTERNO = "proyecto_interno";

const SCOPE_DE_ESCRITURA = "crm.objects.projects.write";

/**
 * ¿El token del sistema puede CREAR proyectos?
 *
 * Vive acá y no en `handoff-sync.ts` porque es una pregunta sobre ESCRITURA de proyectos, y
 * este módulo es el dueño de esa operación. Devuelve `false` ante cualquier problema —incluido
 * "no pude preguntar"—: quien llama tiene que distinguir los dos casos si le importa, y el
 * default seguro es no escribir.
 */
export async function hasProjectsWriteScope(): Promise<boolean> {
  try {
    const token = await getSystemAccessToken();
    const info = await getPortalInfo(token);
    return info.scopes?.includes(SCOPE_DE_ESCRITURA) ?? false;
  } catch {
    return false;
  }
}

export interface RecordACrear {
  /** El nombre que verá el equipo en el CRM. */
  nombre: string;
  /**
   * La FILA de `PROJECT_PIPELINES`, no un id suelto. De ahí salen el pipeline y la etapa
   * inicial: pedirlos por separado permitiría combinarlos mal —una etapa de Development en el
   * pipeline de Customer Success— y HubSpot acepta esa combinación sin chistar.
   */
  pipeline: PipelineDef;
  /** Proyecto de Smarteam para Smarteam. Apaga cobranza, cartera, publicación y watchdog. */
  interno?: boolean;
  /** Owner del record en HubSpot. `null` = HubSpot decide (queda sin asignar). */
  ownerId?: string | null;
  /** La company. NO es opcional en la práctica: sin ella el record es irrecuperable. */
  empresaId?: string | null;
  /** El trato ganado, si lo hay (un proyecto interno puede no tenerlo). */
  tratoId?: string | null;
  /** El proyecto de Customer Success del que cuelga, si es un hermano. */
  hermanoHsId?: string | null;
}

/**
 * Crea el record y devuelve su id. Tira si HubSpot lo rechaza — quien llama decide si
 * reintenta; este módulo no traga errores.
 *
 * ── `csl_encargado` SE DEJA VACÍO A PROPÓSITO ────────────────────────────────
 * Es la propiedad con la que el espejo resuelve QUÉ CSE ve el proyecto, y la prioriza por
 * encima del owner. Escribir ahí a quien apretó el botón le secuestraría el acceso al CSE que
 * de verdad va a llevar el proyecto — y lo haría en silencio, porque el creador SÍ lo vería.
 * La asignación del encargado es una decisión de la persona, no un efecto secundario del alta.
 */
export async function crearProjectRecord(hs: HsClient, datos: RecordACrear): Promise<string> {
  const nombre = datos.nombre.trim();
  if (!nombre) throw new Error("El proyecto necesita un nombre para crearse en HubSpot");

  const asociaciones: AsociacionParaCrear[] = bloqueDeAsociaciones({
    empresa: datos.empresaId,
    trato: datos.tratoId,
    hermano: datos.hermanoHsId,
  });

  const res = await hs.apiRequest({
    method: "POST",
    path: `/crm/v3/objects/${OBJETO_PROYECTOS}`,
    body: {
      properties: {
        [PROP_NOMBRE]: nombre,
        hs_pipeline: datos.pipeline.hubspotPipelineId,
        hs_pipeline_stage: datos.pipeline.initialStageId,
        /* Solo se escribe cuando ES interno. Un checkbox sin marcar llega VACÍO desde HubSpot,
           no "false" (ver el .sql de la migración de multi-pipeline), y el espejo ya trata el
           vacío como "no interno". Escribir "false" en cada alta agregaría una distinción que
           no distingue nada. */
        ...(datos.interno ? { [PROP_INTERNO]: "true" } : {}),
        ...(datos.ownerId ? { hubspot_owner_id: datos.ownerId } : {}),
      },
      ...(asociaciones.length ? { associations: asociaciones } : {}),
    },
  });

  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`crear proyecto en HubSpot falló (${res.status}): ${cuerpo.slice(0, 300)}`);
  }
  const creado = (await res.json()) as { id?: string };
  if (!creado?.id) {
    /* Sin id no se puede escribir `Project.hubspotServiceId`, y sin eso el record queda
       huérfano en el CRM y el proyecto invisible en Nexus. Es peor que un error: hay que
       gritarlo para que el motor lo marque como fallido y lo reintente. */
    throw new Error("HubSpot creó el proyecto pero no devolvió su id");
  }
  return creado.id;
}
