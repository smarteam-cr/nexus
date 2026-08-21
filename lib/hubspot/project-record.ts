import type { Client as HsClient } from "@hubspot/api-client";
import { getSystemAccessToken, getPortalInfo } from "@/lib/hubspot/client";
import type { PipelineDef } from "@/lib/projects/kind";
import { ESTADOS_PROPONIBLES, esProponible } from "@/lib/projects/estado-hubspot";
import { etapasProponibles } from "@/lib/projects/etapa-hubspot";
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

/**
 * Marca o desmarca "interno" en un proyecto que YA existe en HubSpot.
 *
 * ── POR QUÉ ESCRIBE ALLÁ Y NO ACÁ ────────────────────────────────────────────
 * `Project.proyectoInterno` tiene UN solo escritor —el espejo (`sync-projects.ts`)— y una guarda
 * que lo hace cumplir (`scope-coverage.test.ts`). Si Nexus escribiera esa columna, el sync la
 * revertiría en diez minutos sobre un campo que decide FACTURACIÓN, y el síntoma sería un
 * interruptor que "no guarda" sin ningún error. Por eso el interruptor manda el cambio a HubSpot
 * y espera a que vuelva por el espejo: la fuente de verdad no se mueve de lugar.
 *
 * ── POR QUÉ SÍ SE ESCRIBE "false" ACÁ, Y AL CREAR NO ─────────────────────────
 * Al crear, un checkbox sin marcar llega vacío y el espejo ya lo trata como "no interno", así que
 * mandar "false" sería una distinción que no distingue. Acá es al revés: DESMARCAR es justamente
 * la operación, y para eso hay que escribir el valor explícito — omitirlo dejaría el "true" viejo.
 */
export async function actualizarProyectoInterno(
  hs: HsClient,
  recordId: string,
  interno: boolean,
): Promise<void> {
  const res = await hs.apiRequest({
    method: "PATCH",
    path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${recordId}`,
    body: { properties: { [PROP_INTERNO]: interno ? "true" : "false" } },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `marcar el proyecto como ${interno ? "interno" : "no interno"} en HubSpot falló ` +
        `(${res.status}): ${cuerpo.slice(0, 300)}`,
    );
  }
}

/**
 * Cambia el CSE ENCARGADO (`csl_encargado`) de un proyecto que ya existe en HubSpot.
 *
 * ── POR QUÉ ESCRIBE ALLÁ Y NO ACÁ ────────────────────────────────────────────
 * Mismo motivo que sus dos vecinas: `Project.hubspotOwnerId/Name/Email` los escribe SOLO el
 * espejo (`sync-projects.ts`), que los resuelve desde esta propiedad. Si Nexus escribiera esas
 * columnas, el sync las revertiría en diez minutos — y sobre el campo que decide QUIÉN VE EL
 * CLIENTE (`lib/auth/access.ts`), así que el síntoma sería alguien perdiendo acceso solo.
 *
 * ⚠ Es un campo OWNER: guarda un owner id de HubSpot, no un email. Ver
 * `resolverOwnerIdPorEmail`, que es lo único que traduce el email de un `TeamMember` a ese id.
 *
 * ⭐ Y ES LA CONTRACARA DEL COMENTARIO DE `crearProjectRecord`: al CREAR se deja vacío a
 * propósito («la asignación del encargado es una decisión de la persona, no un efecto secundario
 * del alta»). Esta función es esa decisión, tomada explícitamente.
 */
export async function actualizarCslEncargado(
  hs: HsClient,
  recordId: string,
  ownerId: string,
): Promise<void> {
  const id = ownerId.trim();
  if (!id) throw new Error("Falta el owner de HubSpot al que reasignar el proyecto");
  const res = await hs.apiRequest({
    method: "PATCH",
    path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${recordId}`,
    body: { properties: { csl_encargado: id } },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `reasignar el encargado del proyecto en HubSpot falló (${res.status}): ${cuerpo.slice(0, 300)}`,
    );
  }
}

/**
 * El owner id de HubSpot de una persona, por su email. `null` si HubSpot no la conoce.
 *
 * ── POR QUÉ HACE FALTA ───────────────────────────────────────────────────────
 * `TeamMember` NO guarda el owner id de HubSpot, y `csl_encargado` no acepta un email. El único
 * traductor que existía iba al revés (`resolveOwner`: id → nombre/email, en `sync-projects.ts`),
 * y los scripts de reasignación resolvían esto **a mano**, con los ids hardcodeados en el
 * archivo. Esto lo hace en caliente para que el select del listado ofrezca a cualquiera del
 * equipo, incluida gente que todavía no lleva ningún proyecto.
 *
 * ⚠ Se pide la lista COMPLETA de owners y se busca ahí, en vez de `?email=`: ese filtro es
 * sensible a mayúsculas y a alias, y un fallo silencioso acá se leería como «esa persona no
 * existe en HubSpot» sobre alguien que sí está. Son pocos owners y la respuesta se cachea.
 */
export async function resolverOwnerIdPorEmail(
  hs: HsClient,
  email: string,
): Promise<string | null> {
  const buscado = email.trim().toLowerCase();
  if (!buscado) return null;
  const res = await hs.apiRequest({ method: "GET", path: `/crm/v3/owners?limit=500` });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(`no se pudo leer la lista de owners de HubSpot (${res.status}): ${cuerpo.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: Array<{ id?: string; email?: string }> };
  const hit = (data.results ?? []).find((o) => (o.email ?? "").trim().toLowerCase() === buscado);
  return hit?.id ?? null;
}

/**
 * Cambia el ESTADO (`hs_status`) de un proyecto que ya existe en HubSpot.
 *
 * ── POR QUÉ ESCRIBE ALLÁ Y NO ACÁ ────────────────────────────────────────────
 * Mismo motivo que `actualizarProyectoInterno`: las cinco columnas CS360 de `Project` las escribe
 * SOLO el espejo. Si Nexus escribiera `hubspotStatus`, el sync la revertiría en diez minutos y el
 * síntoma sería un botón que "no guarda" sin ningún error. La escritura va HACIA HubSpot y el
 * valor vuelve por el espejo — la fuente de verdad no se mueve de lugar.
 *
 * ⛔ **`completed` no se puede escribir por acá, ni a mano.** Ese valor CIERRA el proyecto: el
 * espejo lo lee como cierre, lo pasa a inactivo, y reactivarlo no está resuelto hoy. El veto vive
 * también en `lib/projects/estado-hubspot.ts`, pero repetirlo acá no es redundante: aquél decide
 * qué se PROPONE y éste es el único lugar por donde el valor sale del sistema. Un body armado a
 * mano no puede saltarse el de abajo.
 */
export async function actualizarEstadoProyecto(
  hs: HsClient,
  recordId: string,
  estado: string,
): Promise<void> {
  if (!esProponible(estado)) {
    throw new Error(
      `Nexus no escribe el estado "${estado}" en HubSpot: ` +
        `los únicos válidos son ${ESTADOS_PROPONIBLES.join(", ")}.`,
    );
  }
  const res = await hs.apiRequest({
    method: "PATCH",
    path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${recordId}`,
    body: { properties: { hs_status: estado } },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `cambiar el estado del proyecto a "${estado}" en HubSpot falló ` +
        `(${res.status}): ${cuerpo.slice(0, 300)}`,
    );
  }
}

/**
 * Mueve un proyecto de ETAPA (`hs_pipeline_stage`) en su tablero de HubSpot.
 *
 * ⛔ **El id de etapa NO se acepta a ciegas: tiene que estar en la tabla de ESE pipeline.** Los
 * tres pipelines tienen ids distintos para etapas que se llaman igual, y un id del tablero vecino
 * manda el registro a una columna que en el suyo no existe — sin error de HubSpot y sin forma de
 * verlo salvo abriendo el tablero.
 *
 * ⛔ **Tampoco una etapa TERMINAL**: mover un proyecto a "Finalizado" lo cierra, lo saca de la
 * cartera y toca cobranza. `etapasProponibles` ya las excluye; acá se vuelve a exigir porque éste
 * es el único lugar por donde el id sale hacia el CRM.
 *
 * ⚠ Esto NO contradice «HubSpot manda la etapa» (O1…O6): manda para LEER. El cambio se escribe
 * hacia allá y vuelve por el espejo.
 */
export async function actualizarEtapaProyecto(
  hs: HsClient,
  recordId: string,
  def: PipelineDef,
  stageId: string,
): Promise<void> {
  if (!etapasProponibles(def).some((e) => e.id === stageId)) {
    throw new Error(
      `Nexus no escribe la etapa "${stageId}" en HubSpot: ` +
        `no es una etapa movible del pipeline "${def.key}".`,
    );
  }
  const res = await hs.apiRequest({
    method: "PATCH",
    path: `/crm/v3/objects/${OBJETO_PROYECTOS}/${recordId}`,
    body: { properties: { hs_pipeline_stage: stageId } },
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `mover el proyecto a la etapa "${stageId}" en HubSpot falló ` +
        `(${res.status}): ${cuerpo.slice(0, 300)}`,
    );
  }
}

/** Lo que HubSpot dice AHORA sobre un proyecto, no lo que Nexus copió la última vez. */
export interface EstadoVivo {
  hs_status: string | null;
  hs_pipeline_stage: string | null;
}

/**
 * Lee estado y etapa DIRECTO del CRM, sin pasar por el espejo.
 *
 * ── POR QUÉ NO ALCANZA LA COPIA DE NEXUS ─────────────────────────────────────
 * El espejo de un cliente corre cuando alguien abre su ficha, así que `Project.hubspotStatus`
 * puede tener días. Si la propuesta se construyó sobre esa copia y mientras tanto el CSE cambió
 * el valor a mano en HubSpot, aceptar la sugerencia PISARÍA su decisión — y del lado de quien
 * aprieta el botón no habría ninguna señal de que acaba de deshacer algo.
 *
 * Se paga una llamada extra por cada aceptación. Es barato al lado de una decisión ajena
 * revertida en silencio, y estas aceptaciones son de a una, disparadas por una persona.
 */
export async function leerEstadoYEtapa(hs: HsClient, recordId: string): Promise<EstadoVivo> {
  const res = await hs.apiRequest({
    method: "GET",
    path:
      `/crm/v3/objects/${OBJETO_PROYECTOS}/${recordId}` +
      `?properties=hs_status&properties=hs_pipeline_stage`,
  });
  if (!res.ok) {
    const cuerpo = await res.text().catch(() => "");
    throw new Error(
      `leer el proyecto ${recordId} en HubSpot falló (${res.status}): ${cuerpo.slice(0, 300)}`,
    );
  }
  const json = (await res.json()) as { properties?: Record<string, string | null> };
  const props = json.properties ?? {};
  /* El vacío de HubSpot llega como "" o como ausente según la propiedad; los dos significan
     "sin cargar" y tienen que colapsar a `null`, o el no-op de más arriba compararía "" contra
     null y escribiría de gusto. */
  const limpiar = (v: string | null | undefined) => (v ? v : null);
  return {
    hs_status: limpiar(props.hs_status),
    hs_pipeline_stage: limpiar(props.hs_pipeline_stage),
  };
}
