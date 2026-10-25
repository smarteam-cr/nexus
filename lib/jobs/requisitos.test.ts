/**
 * lib/jobs/requisitos.test.ts — UN JOB APAGADO DICE POR QUÉ, CON LA MISMA REGLA CON LA QUE SE APAGA.
 *
 * El espejo de Odoo pasó diez días sin correr (2026-09-02 al 12) y el semáforo de Integraciones lo
 * mostraba en gris, igual que un job que todavía no llegó a su hora. Nadie podía leer en pantalla
 * que al servidor le faltaba `ODOO_PASSWORD`, ni distinguirlo de un `ODOO_SYNC_ENABLED=0` puesto a
 * propósito.
 *
 * Correr: `npx vitest run lib/jobs/requisitos.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { copiaDeMeetPorJob, JOBS_CON_REQUISITO, motivoApagado, motivoSchedulerApagado, partnerCreaClientes } from "./requisitos";

describe("motivoApagado", () => {
  it("odoo-espejo-daily distingue la contraseña que falta del apagado a propósito", () => {
    expect(motivoApagado("odoo-espejo-daily", { ODOO_PASSWORD: "x" })).toBeNull();
    const sinClave = motivoApagado("odoo-espejo-daily", {});
    expect(sinClave).toContain("falta ODOO_PASSWORD");
    expect(sinClave).not.toContain("a propósito");
    const aProposito = motivoApagado("odoo-espejo-daily", { ODOO_PASSWORD: "x", ODOO_SYNC_ENABLED: "0" });
    expect(aProposito).toContain("ODOO_SYNC_ENABLED=0");
    expect(aProposito).not.toContain("falta ODOO_PASSWORD");
    // Cualquier otro valor de la bandera no apaga: solo «0».
    expect(motivoApagado("odoo-espejo-daily", { ODOO_PASSWORD: "x", ODOO_SYNC_ENABLED: "1" })).toBeNull();
  });

  it("mercury-espejo-daily: sin token ni se intenta, y el apagado a propósito se dice aparte", () => {
    expect(motivoApagado("mercury-espejo-daily", { MERCURY_API_TOKEN: "secret-token:x" })).toBeNull();
    expect(motivoApagado("mercury-espejo-daily", {})).toContain("falta MERCURY_API_TOKEN");
    const aProposito = motivoApagado("mercury-espejo-daily", { MERCURY_API_TOKEN: "x", MERCURY_SYNC_ENABLED: "0" });
    expect(aProposito).toContain("MERCURY_SYNC_ENABLED=0");
    expect(aProposito).not.toContain("falta MERCURY_API_TOKEN");
  });

  it("⛔ prender el vigilante NO hace que Partner cree clientes: eso pide su propia bandera", () => {
    /* Hasta el 2026-10-24 crear clientes colgaba de CS_WATCHDOG_ENABLED (lo que en julio rompió la atribución de
       reuniones). La edición que lo pone en rojo: volver a atarlo al vigilante. */
    expect(partnerCreaClientes({ CS_WATCHDOG_ENABLED: "1" })).toBe(false);
    expect(partnerCreaClientes({ CS_WATCHDOG_ENABLED: "1", CS_PARTNER_SYNC_ENABLED: "1" })).toBe(false);
    expect(partnerCreaClientes({})).toBe(false);
    expect(partnerCreaClientes({ CS_PARTNER_CREA_CLIENTES: "true" })).toBe(false);
    expect(partnerCreaClientes({ CS_PARTNER_CREA_CLIENTES: "1" })).toBe(true);
  });

  it("los cuatro de Éxito del cliente y el corte quincenal exigen su bandera en «1» exacto", () => {
    for (const key of ["cs-signals-daily", "cs-partner-daily", "cs-watchdog-daily", "cs-watchdog-debounce"]) {
      expect(motivoApagado(key, {}), key).toContain("CS_WATCHDOG_ENABLED=1");
      expect(motivoApagado(key, { CS_WATCHDOG_ENABLED: "true" }), `${key} con «true»`).not.toBeNull();
      expect(motivoApagado(key, { CS_WATCHDOG_ENABLED: "1" }), key).toBeNull();
    }
    expect(motivoApagado("cobranza-quincenal", {})).toContain("COBRANZA_CRON_ENABLED=1");
    expect(motivoApagado("cobranza-quincenal", {}), "y dice que se puede hacer a mano").toContain("Corte quincenal");
    expect(motivoApagado("cobranza-quincenal", { COBRANZA_CRON_ENABLED: "1" })).toBeNull();
  });

  it("google-enrich-retry nombra solo las variables que faltan", () => {
    expect(motivoApagado("google-enrich-retry", { GOOGLE_ADMIN_EMAIL: "a@b" })).toBe(
      "Apagado: falta GOOGLE_SERVICE_ACCOUNT_KEY en el .env del servidor.",
    );
    expect(motivoApagado("google-enrich-retry", {})).toContain("GOOGLE_SERVICE_ACCOUNT_KEY y GOOGLE_ADMIN_EMAIL");
    expect(motivoApagado("google-enrich-retry", { GOOGLE_ADMIN_EMAIL: "a@b", GOOGLE_SERVICE_ACCOUNT_KEY: "{}" })).toBeNull();
  });

  it("google-meet-sync: prendido por defecto con las credenciales; «0» lo apaga y dice que vuelve el disparo al abrir la app", () => {
    const google = { GOOGLE_ADMIN_EMAIL: "a@b", GOOGLE_SERVICE_ACCOUNT_KEY: "{}" };
    expect(motivoApagado("google-meet-sync", google)).toBeNull();
    expect(motivoApagado("google-meet-sync", { ...google, GOOGLE_MEET_SYNC_ENABLED: "1" })).toBeNull();
    const aProposito = motivoApagado("google-meet-sync", { ...google, GOOGLE_MEET_SYNC_ENABLED: "0" });
    expect(aProposito).toContain("GOOGLE_MEET_SYNC_ENABLED=0");
    expect(aProposito).toContain("al abrir la app");
    expect(motivoApagado("google-meet-sync", {})).toContain("GOOGLE_SERVICE_ACCOUNT_KEY y GOOGLE_ADMIN_EMAIL");
  });

  it("copiaDeMeetPorJob: el job la hace solo con el scheduler arrancado y el job encendido; si no, la app", () => {
    const google = { GOOGLE_ADMIN_EMAIL: "a@b", GOOGLE_SERVICE_ACCOUNT_KEY: "{}" };
    expect(copiaDeMeetPorJob({ ...google, CRON_ENABLED: "1" })).toBe(true);
    // Una PC (sin scheduler) sigue con el disparo al abrir la app.
    expect(copiaDeMeetPorJob(google)).toBe(false);
    // La vuelta atrás en producción.
    expect(copiaDeMeetPorJob({ ...google, CRON_ENABLED: "1", GOOGLE_MEET_SYNC_ENABLED: "0" })).toBe(false);
  });

  it("seguimiento-reuniones está prendido sin la variable y solo «0» lo apaga, diciendo que vuelve el post-proceso viejo", () => {
    expect(motivoApagado("seguimiento-reuniones", {})).toBeNull();
    expect(motivoApagado("seguimiento-reuniones", { SEGUIMIENTO_REUNIONES_ENABLED: "1" })).toBeNull();
    expect(motivoApagado("seguimiento-reuniones", { SEGUIMIENTO_REUNIONES_ENABLED: "" })).toBeNull();
    const apagado = motivoApagado("seguimiento-reuniones", { SEGUIMIENTO_REUNIONES_ENABLED: "0" });
    expect(apagado).toContain("SEGUIMIENTO_REUNIONES_ENABLED=0");
    expect(apagado).toContain("post-proceso viejo");
  });

  it("un job sin requisito nunca está apagado por configuración", () => {
    for (const key of ["maintenance-daily", "ventas-ganadas-daily", "invariants-daily", "marketing-weekly", "no-existe"]) {
      expect(motivoApagado(key, {}), key).toBeNull();
    }
  });

  it("el scheduler entero se apaga sin CRON_ENABLED=1", () => {
    expect(motivoSchedulerApagado({})).toContain("CRON_ENABLED=1");
    expect(motivoSchedulerApagado({ CRON_ENABLED: "1" })).toBeNull();
  });
});

describe("defs.ts decide con esta regla y no con una copia", () => {
  const defs = fs
    .readFileSync(path.join(process.cwd(), "lib/jobs/defs.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("no lee a mano ninguna de las banderas que requisitos.ts conoce", () => {
    /* La edición que lo pone en rojo: `shouldRun: () => !!process.env.ODOO_PASSWORD && …` — la
       pantalla diría «encendido» sobre un job que la copia apaga, o al revés. */
    expect(defs).not.toMatch(
      /process\.env\.(CS_WATCHDOG_ENABLED|COBRANZA_CRON_ENABLED|ODOO_PASSWORD|ODOO_SYNC_ENABLED|MERCURY_API_TOKEN|MERCURY_SYNC_ENABLED|GOOGLE_SERVICE_ACCOUNT_KEY|GOOGLE_ADMIN_EMAIL)/,
    );
  });

  it("cada job con requisito consulta la regla en su shouldRun", () => {
    /* 9 desde el 2026-10-05: el tipo de cambio del BCCR. 10 desde el 2026-10-10: la lectura de cada reunión. 11 desde el
       2026-10-15: las tareas de HubSpot. 12 desde el 2026-10-18: las comunicaciones de HubSpot. 13 desde el 2026-10-18:
       el cobro solo de lo pagado. 14 desde el 2026-10-25: la copia de Google Meet cada 10 minutos (U1). 15 desde el
       2026-10-25: la comisión estimada de HubSpot, con el mismo requisito que la copia de Partner (U25). 16 desde el
       2026-10-25: la copia de los datos de la empresa desde HubSpot (R2). 17 desde el
       2026-10-25: la transcripción del audio de las reuniones presenciales (T5). 18 y 19 desde el 2026-10-25: la revisión
       de las conferencias de Meet (U3) y sus avisos y suscripciones (U4). 20 a 22 desde el 2026-10-25: los leads,
       la sincronización diaria de los proyectos y el vigía de los jobs (B3, U10, U24). */
    expect(JOBS_CON_REQUISITO.length).toBe(19);
    for (const key of JOBS_CON_REQUISITO) expect(defs, key).toContain(`encendido("${key}")`);
    expect(defs).toContain("motivoApagado(jobKey, process.env) === null");
  });

  it("Integraciones muestra el motivo con la misma función", () => {
    const pagina = fs.readFileSync(path.join(process.cwd(), "app/(shell)/integrations/page.tsx"), "utf8");
    expect(pagina).toContain('from "@/lib/jobs/requisitos"');
    expect(pagina).toContain("motivoApagado(estado.key, process.env)");
    expect(pagina).toContain('motivoApagado("odoo-espejo-daily", process.env)');
    expect(pagina, "la tarjeta de Odoo ya no decide por su cuenta").not.toContain("process.env.ODOO_PASSWORD");
  });
});
