/**
 * lib/servicios/rutinas.test.ts — las rutinas de un servicio recurrente (iniciativa 4, paso 3) y «Pasar a recurrente»
 * (paso 5): cuándo cae cada rutina, que crear la ventana siguiente no duplique, el enlace de Calendar como serie, qué
 * toca ahora y lo que propone Nexus al pasar.
 */
import { describe, expect, it } from "vitest";
import { servicioDelCatalogo } from "./catalogo";
import {
  caeEnLaSemana,
  claveDeLaTarea,
  enlaceDeLaReunion,
  leerRutinas,
  primeraInstancia,
  queTocaAhora,
  RUTINAS_VACIAS,
  SEMANAS_DE_TAREAS,
  semanasDeLaTarea,
  tareasDeLaVentana,
} from "./rutinas";
import { propuestaDePaso, type ProyectoParaPasar } from "./pasar-a-recurrente";

const smartloop = servicioDelCatalogo("smartloop")!;
const soporte = servicioDelCatalogo("soporte-hubspot")!;

describe("Cuándo cae una rutina", () => {
  it("semanal, cada semana desde el arranque; nada antes del arranque", () => {
    expect(caeEnLaSemana("semana", "2026-10-19", "2026-10-15")).toBe(true);
    expect(caeEnLaSemana("semana", "2026-10-05", "2026-10-15")).toBe(false);
  });

  it("quincenal, una semana sí y una no, contando desde el lunes del arranque", () => {
    expect(["2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02"].map((l) => caeEnLaSemana("quincena", l, "2026-10-14"))).toEqual([true, false, true, false]);
  });

  it("mensual, el primer lunes del mes; trimestral, el primer lunes cada tres meses desde el mes del arranque", () => {
    expect(caeEnLaSemana("mes", "2026-11-02", "2026-10-01")).toBe(true);
    expect(caeEnLaSemana("mes", "2026-11-09", "2026-10-01")).toBe(false);
    expect(caeEnLaSemana("trimestre", "2027-01-04", "2026-10-07")).toBe(true);
    expect(caeEnLaSemana("trimestre", "2026-11-02", "2026-10-07")).toBe(false);
  });

  it("las semanas de una tarea en un rango", () => {
    expect(semanasDeLaTarea({ cada: "mes" }, "2026-10-19", "2026-12-14", "2026-10-01")).toEqual(["2026-11-02", "2026-12-07"]);
  });
});

describe("Las tareas que se repiten", () => {
  it("la primera ventana arranca esta semana y dura dos meses; cada tarea con su clave por semana", () => {
    const v = tareasDeLaVentana({ projectId: "p1", servicio: soporte, arranque: "2026-10-15", hoy: "2026-10-18", estado: RUTINAS_VACIAS });
    expect(v.desde).toBe("2026-10-12");
    const semanales = v.tareas.filter((t) => t.rutina === "pedidos");
    expect(semanales).toHaveLength(SEMANAS_DE_TAREAS);
    expect(semanales[0].clave).toBe(claveDeLaTarea("p1", "pedidos", "2026-10-12"));
    // La ventana llega hasta el 30 nov: el primer lunes de diciembre queda para la siguiente.
    expect(v.tareas.filter((t) => t.rutina === "datos").map((t) => t.lunes)).toEqual(["2026-11-02"]);
    const claves = v.tareas.map((t) => t.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("la ventana siguiente empieza después de la última creada: nunca repite una semana", () => {
    const primera = tareasDeLaVentana({ projectId: "p1", servicio: soporte, arranque: "2026-10-15", hoy: "2026-10-18", estado: RUTINAS_VACIAS });
    const estado = { ...RUTINAS_VACIAS, tareas: { hasta: primera.hasta, por: "a@b.c", en: "x" } };
    const segunda = tareasDeLaVentana({ projectId: "p1", servicio: soporte, arranque: "2026-10-15", hoy: "2026-10-18", estado });
    const enLasDos = segunda.tareas.filter((t) => primera.tareas.some((p) => p.clave === t.clave));
    expect(enLasDos).toEqual([]);
    expect(segunda.desde > primera.hasta).toBe(true);
  });

  it("una rutina que cae menos seguido que la ventana va en su próxima semana, aunque quede afuera", () => {
    const servicio = { tareas: [{ clave: "trim", titulo: "Revisión trimestral", cada: "trimestre" as const }] };
    const v = tareasDeLaVentana({ projectId: "p", servicio, arranque: "2026-09-01", hoy: "2026-10-18", estado: RUTINAS_VACIAS });
    expect(v.tareas.map((t) => t.lunes)).toEqual(["2026-12-07"]);
  });

  it("lee el Json guardado con tolerancia", () => {
    expect(leerRutinas(null)).toEqual(RUTINAS_VACIAS);
    expect(leerRutinas({ reuniones: { a: { agendadaAt: "2026-10-18T00:00:00Z", por: "x" }, b: 3 }, tareas: { hasta: "mal" } })).toEqual({
      version: 1,
      reuniones: { a: { agendadaAt: "2026-10-18T00:00:00Z", por: "x" } },
      tareas: null,
    });
  });
});

describe("Las reuniones fijas, por enlace", () => {
  it("la primera instancia es un martes a las 10:00 de Costa Rica; la mensual, el primer martes del mes siguiente", () => {
    expect(primeraInstancia("semana", "2026-10-18").inicio).toBe("2026-10-20T16:00:00.000Z");
    expect(primeraInstancia("mes", "2026-10-18").inicio).toBe("2026-11-03T16:00:00.000Z");
  });

  it("el enlace abre Google Calendar ya armado como serie, con invitados; Nexus no guarda nada", () => {
    const u = new URL(
      enlaceDeLaReunion({ reunion: smartloop.reuniones[0], servicio: smartloop, empresa: "FACO", hoy: "2026-10-18", invitados: ["ana@faco.com", "no-correo"], correo: "cse@smarteamcr.com" }),
    );
    expect(u.host).toBe("calendar.google.com");
    expect(u.searchParams.get("text")).toBe("FACO · Seguimiento semanal del ciclo");
    expect(u.searchParams.get("recur")).toBe("RRULE:FREQ=WEEKLY");
    expect(u.searchParams.get("add")).toBe("ana@faco.com");
    expect(u.searchParams.get("dates")).toBe("20261020T160000Z/20261020T164500Z");
  });
});

describe("Qué toca ahora", () => {
  const hoy = "2026-10-18";
  it("primero lo que falta del ciclo, después una reunión sin agendar, después las tareas", () => {
    expect(queTocaAhora({ servicio: smartloop, estado: RUTINAS_VACIAS, hoy, faltaDelCiclo: "La meta del ciclo" }).tipo).toBe("ciclo");
    expect(queTocaAhora({ servicio: smartloop, estado: RUTINAS_VACIAS, hoy })).toMatchObject({ tipo: "reunion", clave: "seguimiento" });
    const agendadas = { ...RUTINAS_VACIAS, reuniones: Object.fromEntries(smartloop.reuniones.map((r) => [r.clave, { agendadaAt: "x", por: "y" }])) };
    expect(queTocaAhora({ servicio: smartloop, estado: agendadas, hoy }).tipo).toBe("tareas");
  });

  it("con la ventana de tareas por terminarse pide las siguientes; si no, al día", () => {
    const base = { ...RUTINAS_VACIAS, reuniones: Object.fromEntries(soporte.reuniones.map((r) => [r.clave, { agendadaAt: "x", por: "y" }])) };
    expect(queTocaAhora({ servicio: soporte, estado: { ...base, tareas: { hasta: "2026-10-26", por: "", en: "" } }, hoy }).tipo).toBe("tareas");
    expect(queTocaAhora({ servicio: soporte, estado: { ...base, tareas: { hasta: "2026-12-07", por: "", en: "" } }, hoy }).tipo).toBe("al-dia");
  });
});

describe("Pasar a recurrente: lo que propone Nexus", () => {
  const base: ProyectoParaPasar = {
    nombre: "FACO · Implementación",
    servicioActual: null,
    pipeline: "customer-success",
    etapa: "Continuidad",
    cerrado: false,
    cicloAbierto: null,
    fases: [{ name: "Adopción", status: "IN_PROGRESS" }],
    documentos: new Set(),
    tieneHandoff: true,
  };

  it("a SmartLoop: la etapa del ciclo con su porqué y la tarea de mover el pipeline en HubSpot", () => {
    const p = propuestaDePaso(base, smartloop);
    expect(p.bloqueo).toBeNull();
    expect(p.etapaDelCiclo).toMatchObject({ etapa: "adopcion", confianza: "baja" });
    expect(p.tareaDeHubspot?.titulo).toBe("Mover «FACO · Implementación» en HubSpot a SmartLoop · Adopción");
    // La etapa que elige la persona manda en la tarea.
    expect(propuestaDePaso(base, smartloop, "diagnostico").tareaDeHubspot?.titulo).toMatch(/· Diagnóstico$/);
  });

  it("a un servicio sin ciclos que ya está en Continuidad: sin etapa del ciclo ni tarea de HubSpot", () => {
    const p = propuestaDePaso(base, soporte);
    expect(p.etapaDelCiclo).toBeNull();
    expect(p.tareaDeHubspot).toBeNull();
    expect(propuestaDePaso({ ...base, etapa: "Adopción" }, soporte).tareaDeHubspot).not.toBeNull();
  });

  it("no se pasa al mismo servicio ni un proyecto cerrado", () => {
    expect(propuestaDePaso({ ...base, servicioActual: "smartloop" }, smartloop).bloqueo).toMatch(/ya es SmartLoop/);
    expect(propuestaDePaso({ ...base, cerrado: true }, soporte).bloqueo).toMatch(/cerrado/);
  });
});
