/**
 * lib/jobs/requisitos.ts — POR QUÉ UN JOB NO CORRE EN ESTE SERVIDOR.
 *
 * Cinco de los once jobs dependen de una variable del `.env` del VPS, y sin ella su `shouldRun` da
 * falso para siempre: nunca reclaman un día, nunca anotan un resultado, y el semáforo de
 * Integraciones los pintaba en gris con «nunca corrió». Gris es lo mismo que muestra un job que
 * todavía no llegó a su hora. Así pasaron diez días con el espejo de Odoo muerto (2026-09-02 al 12)
 * sin que la pantalla dijera que al servidor le faltaba la contraseña — y la ausencia de fila no
 * distinguía «falta `ODOO_PASSWORD`» de «alguien puso `ODOO_SYNC_ENABLED=0` a propósito».
 *
 * La regla vive UNA vez, acá, y la usan los dos lados: `shouldRun` en `defs.ts` para decidir, e
 * Integraciones para decir el motivo. Si fueran dos copias, la pantalla podría decir «encendido»
 * sobre un job que la otra copia apaga.
 *
 * ⚠ PURO: recibe el entorno como argumento y no lee `process.env`. Así se prueba sin tocar el
 * entorno del proceso de tests.
 *
 * ⚠ Solo lo que se decide con el entorno. `cs-watchdog-daily` además mira `CsSettings.watchdogEnabled`
 * en la base: ese apagado no aparece acá, y su `run` devuelve `SIN_TURNO` (no anota nada).
 */

import { MOTIVO_APAGADO as MOTIVO_APAGADO_DEL_SEGUIMIENTO, seguimientoPrendido } from "@/lib/lecturas/reglas";
import { copiaPrendida, MOTIVO_COPIA_APAGADA } from "@/lib/comunicaciones/banderas";

export type Entorno = Readonly<Record<string, string | undefined>>;

const falta = (...variables: string[]) =>
  `Apagado: falta ${variables.join(" y ")} en el .env del servidor.`;

/* Cada variable se lee como propiedad del entorno y no como un string suelto: `lib/docs/doc-sync.test.ts` escanea así
   las banderas de los jobs para exigir que el .env.example las declare. */
const faltaGoogle = (env: Entorno): string | null => {
  const faltan = [
    env.GOOGLE_SERVICE_ACCOUNT_KEY ? null : "GOOGLE_SERVICE_ACCOUNT_KEY",
    env.GOOGLE_ADMIN_EMAIL ? null : "GOOGLE_ADMIN_EMAIL",
  ].filter((v): v is string => v !== null);
  return faltan.length ? falta(...faltan) : null;
};

const exitoDelCliente = (env: Entorno) =>
  env.CS_WATCHDOG_ENABLED === "1" ? null : falta("CS_WATCHDOG_ENABLED=1");

/**
 * ¿La copia diaria de HubSpot Partner crea clientes nuevos? Solo con su propia bandera,
 * `CS_PARTNER_CREA_CLIENTES=1`: crear clientes solo es lo que en julio rompió la atribución de reuniones
 * (decisión D-07, pendiente). Hasta el 2026-10-24 colgaba de CS_WATCHDOG_ENABLED, así que prender el vigilante
 * prendía también esto sin decirlo; se separó para poder prender el vigilante sin cambiar lo que hace Partner
 * (en producción no crea clientes desde julio). Prendida por CS_PARTNER_SYNC_ENABLED o por el vigilante, la copia
 * solo actualiza los que existen.
 */
export function partnerCreaClientes(env: Entorno): boolean {
  return env.CS_PARTNER_CREA_CLIENTES === "1";
}

const REQUISITOS: Readonly<Record<string, (env: Entorno) => string | null>> = {
  "cs-signals-daily": exitoDelCliente,
  /* La copia de HubSpot Partner (licencias, renovaciones, uso) se puede prender SOLA desde el
     2026-10-02, sin el vigilante con IA: las renovaciones de la información del cliente la necesitan y
     en producción estaba parada desde julio porque colgaba de CS_WATCHDOG_ENABLED. */
  "cs-partner-daily": (env) =>
    env.CS_WATCHDOG_ENABLED === "1" || env.CS_PARTNER_SYNC_ENABLED === "1"
      ? null
      : falta("CS_PARTNER_SYNC_ENABLED=1 (o CS_WATCHDOG_ENABLED=1)"),
  "cs-watchdog-daily": exitoDelCliente,
  "cs-watchdog-debounce": exitoDelCliente,
  "cobranza-quincenal": (env) =>
    env.COBRANZA_CRON_ENABLED === "1"
      ? null
      : `${falta("COBRANZA_CRON_ENABLED=1")} El corte se puede hacer a mano desde Cobranza › Corte quincenal.`,
  "google-enrich-retry": (env) => faltaGoogle(env),
  /* La copia de Google Meet cada 10 minutos (U1, 2026-10-25). Prendida por defecto: solo se apaga a propósito, y apagada
     la copia vuelve a correr al abrir la app (`copiaDeMeetPorJob`). Sin las credenciales no corre ninguna de las dos. */
  "google-meet-sync": (env) => {
    const motivos: string[] = [];
    if (env.GOOGLE_MEET_SYNC_ENABLED === "0") {
      motivos.push("Apagado a propósito: GOOGLE_MEET_SYNC_ENABLED=0 en el .env del servidor. La copia de Meet corre al abrir la app.");
    }
    const sinCredenciales = faltaGoogle(env);
    if (sinCredenciales) motivos.push(sinCredenciales);
    return motivos.length ? motivos.join(" ") : null;
  },
  "odoo-espejo-daily": (env) => {
    /* Los dos motivos se dicen por separado: uno es una credencial que falta, el otro una
       decisión de alguien. Y sin contraseña ni se intenta, porque cada intento en vano cuenta
       para el bloqueo del usuario en Odoo. */
    const motivos: string[] = [];
    if (env.ODOO_SYNC_ENABLED === "0") motivos.push("Apagado a propósito: ODOO_SYNC_ENABLED=0 en el .env del servidor.");
    if (!env.ODOO_PASSWORD) motivos.push(falta("ODOO_PASSWORD"));
    return motivos.length ? motivos.join(" ") : null;
  },
  "mercury-espejo-daily": (env) => {
    /* Igual que Odoo: la credencial que falta y el apagado a propósito se dicen por separado. */
    const motivos: string[] = [];
    if (env.MERCURY_SYNC_ENABLED === "0") motivos.push("Apagado a propósito: MERCURY_SYNC_ENABLED=0 en el .env del servidor.");
    if (!env.MERCURY_API_TOKEN) motivos.push(falta("MERCURY_API_TOKEN"));
    return motivos.length ? motivos.join(" ") : null;
  },
  "tipo-cambio-daily": (env) =>
    /* No necesita credencial: sin `BCCR_TOKEN` usa el API de Hacienda, que es abierto. Solo se apaga a propósito. */
    env.TIPO_CAMBIO_SYNC_ENABLED === "0" ? "Apagado a propósito: TIPO_CAMBIO_SYNC_ENABLED=0 en el .env del servidor." : null,
  /* La lectura de cada reunión (memoria de la cuenta, etapa 2). Prendida por defecto: solo se apaga a propósito, y
     apagada vuelve el post-proceso viejo. La regla es UNA (`seguimientoPrendido`, lib/lecturas/reglas.ts); la variable
     se nombra acá para que doc-sync exija que el .env.example la declare. */
  "seguimiento-reuniones": (env) => (seguimientoPrendido({ SEGUIMIENTO_REUNIONES_ENABLED: env.SEGUIMIENTO_REUNIONES_ENABLED }) ? null : MOTIVO_APAGADO_DEL_SEGUIMIENTO),
  /* Las tareas de HubSpot en Tareas internas (2026-10-15, etapa 3 de docs/mi-dia-plan.md). Prendida por defecto: solo se
     apaga a propósito (y apagada, lo que cambie en Nexus se sigue escribiendo en HubSpot al guardar cada tarea). */
  /* Los correos, las notas y las llamadas de HubSpot (iniciativa B, 2026-10-18). Prendida por defecto: solo se apaga a
     propósito. La lectura de sus compromisos se apaga aparte (COMPROMISOS_DE_CORREOS_ENABLED=0) y no apaga la copia. */
  "comunicaciones-hubspot": (env) => (copiaPrendida(env) ? null : MOTIVO_COPIA_APAGADA),
  "tareas-hubspot": (env) =>
    env.TAREAS_HUBSPOT_ENABLED === "0" ? "Apagado a propósito: TAREAS_HUBSPOT_ENABLED=0 en el .env del servidor." : null,
  /* Los leads, la sincronización diaria de los proyectos y el vigía de los jobs (2026-10-25: B3, U10 y U24). Prendidos
     por defecto: solo se apagan a propósito. */
  "hubspot-leads": (env) =>
    env.HUBSPOT_LEADS_ENABLED === "0" ? "Apagado a propósito: HUBSPOT_LEADS_ENABLED=0 en el .env del servidor." : null,
  "hubspot-proyectos": (env) =>
    env.HUBSPOT_PROYECTOS_JOB_ENABLED === "0"
      ? "Apagado a propósito: HUBSPOT_PROYECTOS_JOB_ENABLED=0 en el .env del servidor. Los proyectos se copian al abrir la ficha."
      : null,
  "jobs-vigia": (env) =>
    env.JOBS_VIGIA_ENABLED === "0" ? "Apagado a propósito: JOBS_VIGIA_ENABLED=0 en el .env del servidor. Sentry Crons sigue avisando." : null,
  /* El cobro solo de lo pagado y conciliado en Odoo y Mercury (2026-10-18, decisión de Elías). Prendido por defecto: se
     apaga a propósito, o porque este servidor no tiene ninguna de las dos copias (sin ellas no hay nada que cobrar). */
  "lo-pagado-daily": (env) => {
    if (env.COBRO_SOLO_ENABLED === "0") {
      return "Apagado a propósito: COBRO_SOLO_ENABLED=0 en el .env del servidor. Lo pagado se confirma a mano en Conciliación › «Lo pagado».";
    }
    if (!env.ODOO_PASSWORD && !env.MERCURY_API_TOKEN) return falta("ODOO_PASSWORD o MERCURY_API_TOKEN");
    return null;
  },
};

/** Los jobs que tienen requisito. La guarda de `requisitos.test.ts` exige que `defs.ts` los consulte a todos. */
export const JOBS_CON_REQUISITO: readonly string[] = Object.keys(REQUISITOS);

/** El motivo por el que la configuración no deja correr `jobKey`, o null si lo deja. */
export function motivoApagado(jobKey: string, env: Entorno): string | null {
  const requisito = REQUISITOS[jobKey];
  return requisito ? requisito(env) : null;
}

/**
 * ¿La copia de Google Meet la hace el job `google-meet-sync` en ESTE servidor? Solo con el scheduler arrancado y el job
 * encendido. Si no (las PCs, o GOOGLE_MEET_SYNC_ENABLED=0 en producción), la vuelta atrás: la copia corre al abrir la
 * app (POST /api/integrations/google/auto-sync). Los dos caminos comparten el turno de `CronJobState`: nunca a la vez.
 */
export function copiaDeMeetPorJob(env: Entorno): boolean {
  return motivoSchedulerApagado(env) === null && motivoApagado("google-meet-sync", env) === null;
}

/**
 * El scheduler entero. Sin `CRON_ENABLED=1` (`instrumentation.ts`) no arranca ningún job: es lo
 * normal en las PCs, y en producción lo pone `docker-compose.yml`.
 */
export function motivoSchedulerApagado(env: Entorno): string | null {
  return env.CRON_ENABLED === "1"
    ? null
    : "El scheduler no arranca en este servidor (falta CRON_ENABLED=1): ningún job corre solo. En producción lo pone docker-compose.yml.";
}
