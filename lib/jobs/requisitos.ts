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

export type Entorno = Readonly<Record<string, string | undefined>>;

const falta = (...variables: string[]) =>
  `Apagado: falta ${variables.join(" y ")} en el .env del servidor.`;

const exitoDelCliente = (env: Entorno) =>
  env.CS_WATCHDOG_ENABLED === "1" ? null : falta("CS_WATCHDOG_ENABLED=1");

const REQUISITOS: Readonly<Record<string, (env: Entorno) => string | null>> = {
  "cs-signals-daily": exitoDelCliente,
  "cs-partner-daily": exitoDelCliente,
  "cs-watchdog-daily": exitoDelCliente,
  "cs-watchdog-debounce": exitoDelCliente,
  "cobranza-quincenal": (env) =>
    env.COBRANZA_CRON_ENABLED === "1"
      ? null
      : `${falta("COBRANZA_CRON_ENABLED=1")} El corte se puede hacer a mano desde Cobranza › Corte quincenal.`,
  "google-enrich-retry": (env) => {
    /* Cada variable se lee como propiedad del entorno y no como un string suelto:
       `lib/docs/doc-sync.test.ts` escanea así las banderas de los jobs para exigir que el
       .env.example las declare. */
    const faltan = [
      env.GOOGLE_SERVICE_ACCOUNT_KEY ? null : "GOOGLE_SERVICE_ACCOUNT_KEY",
      env.GOOGLE_ADMIN_EMAIL ? null : "GOOGLE_ADMIN_EMAIL",
    ].filter((v): v is string => v !== null);
    return faltan.length ? falta(...faltan) : null;
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
};

/** Los jobs que tienen requisito. La guarda de `requisitos.test.ts` exige que `defs.ts` los consulte a todos. */
export const JOBS_CON_REQUISITO: readonly string[] = Object.keys(REQUISITOS);

/** El motivo por el que la configuración no deja correr `jobKey`, o null si lo deja. */
export function motivoApagado(jobKey: string, env: Entorno): string | null {
  const requisito = REQUISITOS[jobKey];
  return requisito ? requisito(env) : null;
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
