import { describe, expect, it } from "vitest";
import { describirCita } from "./brief-cita";

/**
 * lib/projects/brief-cita.test.ts — LA CITA A LA VISTA NO PUEDE DECIR MÁS DE LO QUE SABE.
 *
 * Hacer la procedencia explícita (nombre + fecha + hora + enlace) sube la confianza del CSE en lo
 * que el chip diga. Eso es bueno solo si cada pedazo significa lo que aparenta — y tres de las
 * cinco fuentes tenían una fecha que NO es la del hecho. El chip minúsculo lo tapaba; la cita
 * grande lo convertiría en una precisión falsa.
 */

const cita = (over: Partial<Parameters<typeof describirCita>[0]> = {}) =>
  describirCita({ kind: "sesion", id: "s1", label: "Semanal", date: null, ...over });

describe("⭐ la sala se separa del nombre, y solo si es una sala de verdad", () => {
  it("recorta el prefijo y lo devuelve aparte", () => {
    const c = cita({ label: "[CON EL CLIENTE] Revisión panel de reportes Wherex" });
    expect(c.sala).toBe("CON EL CLIENTE");
    expect(c.nombre).toBe("Revisión panel de reportes Wherex");
  });

  it("puertas adentro también", () => {
    expect(cita({ label: "[PUERTAS ADENTRO] Wherex - Reunión interna" })).toMatchObject({
      sala: "PUERTAS ADENTRO",
      nombre: "Wherex - Reunión interna",
    });
  });

  it("⚠ un título que EMPIEZA con corchetes no pierde su prefijo", () => {
    /* La salida ingenua es recortar «lo que haya entre corchetes». Con eso, una reunión llamada
       «[URGENTE] Migración» saldría con sala «URGENTE» —una sala que no existe— y sin su marca
       real. Solo se recortan los DOS valores que emite `etiqueta-de-sala.ts`. */
    const c = cita({ label: "[URGENTE] Migración Salesforce" });
    expect(c.sala).toBe(null);
    expect(c.nombre).toBe("[URGENTE] Migración Salesforce");
  });

  it("sin sala, el nombre queda intacto", () => {
    expect(cita({ label: "Kickoff" })).toMatchObject({ sala: null, nombre: "Kickoff" });
  });
});

describe("⭐ el enlace existe SOLO donde hay a dónde ir", () => {
  it("una reunión lleva a su pantalla", () => {
    expect(cita({ kind: "sesion", id: "cmabc123" }).href).toBe("/sessions/cmabc123");
  });

  it("las otras cuatro fuentes NO inventan destino", () => {
    /* «Estado en HubSpot» y «Etapa» ni siquiera guardan un id de registro (su id es la cadena
       "actual"): mandarlas al proyecto o a la empresa sería enlazar a un lugar del que la
       afirmación no salió. La asimetría es información, no una falla. */
    for (const kind of ["hubspot_ops", "etapa", "handoff", "desviacion", "cobertura"]) {
      expect(cita({ kind, id: "actual" }).href, `${kind} inventó un destino`).toBe(null);
    }
  });
});

describe("⭐ la fecha dice QUÉ fecha es", () => {
  it("una reunión muestra hora, y sin prefijo: ese instante ES el hecho", () => {
    const c = cita({ kind: "sesion", date: "2026-07-28T16:30:00.000Z" });
    expect(c.cuandoPrefijo).toBe(null);
    expect(c.cuando).toMatch(/2026/);
    expect(c.cuando, "una reunión sin hora pierde la mitad del dato").toMatch(/\d{2}:\d{2}/);
  });

  it("⛔ HubSpot dice «revisado», nunca «actualizado», y SIN hora", () => {
    /* `hubspotStageSyncedAt` se pisa con `new Date()` en cada espejo, y el espejo corre cada vez
       que alguien abre la ficha del cliente. Con hora, el chip diría «hoy 09:14» sobre un estado
       que puede tener meses — la precisión falsa que este archivo existe para impedir. */
    for (const kind of ["hubspot_ops", "etapa"]) {
      const c = cita({ kind, date: "2026-08-16T09:14:00.000Z" });
      expect(c.cuandoPrefijo, `${kind} presenta un sello de sync como si fuera el hecho`).toBe(
        "revisado",
      );
      expect(c.cuando, `${kind} muestra una hora que no significa nada`).not.toMatch(/\d{2}:\d{2}/);
    }
  });

  it("una desviación dice «detectada», que es lo que esa fecha significa", () => {
    const c = cita({ kind: "desviacion", date: "2026-08-11T00:00:00.000Z" });
    expect(c.cuandoPrefijo).toBe("detectada");
  });

  it("sin fecha no se inventa ninguna", () => {
    expect(cita({ kind: "cobertura", id: "material", date: null }).cuando).toBe(null);
  });
});

describe("el enum crudo no llega a la pantalla", () => {
  it("ATRASO se lee «Atraso», y el título sobrevive", () => {
    const c = cita({
      kind: "desviacion",
      id: "d1",
      label: "ATRASO · Se pausó la capacitación de Marketing",
    });
    expect(c.nombre).toBe("Atraso · Se pausó la capacitación de Marketing");
  });

  it("un kind desconocido pasa tal cual en vez de desaparecer", () => {
    expect(cita({ kind: "desviacion", id: "d1", label: "FUTURO · algo" }).nombre).toBe(
      "FUTURO · algo",
    );
  });

  it("un título con separador adentro no se corta", () => {
    expect(cita({ kind: "desviacion", id: "d1", label: "AVISO · Pausa · semana del 4" }).nombre).toBe(
      "Aviso · Pausa · semana del 4",
    );
  });
});
