/**
 * lib/delivery/claims.test.ts — el documento de entrega no puede afirmar lo que no sabe.
 *
 * Los casos NO son inventados: son las dos cohortes malas medidas en la cartera real antes de
 * escribir una línea de este módulo.
 *   · SEIS proyectos con 0 tareas marcadas sobre 42, 61, 85, 35, 40 y 46
 *     (`lib/timeline/progress-freshness.ts:5-8`).
 *   · 17 de 32 cronogramas SIN fecha de arranque (`lib/timeline/progress-model.ts:30-32`).
 * Si el documento de cierre de uno de ésos dijera «0 de 61 tareas completadas» o «cerró el
 * 1 de enero de 1970», el problema no sería el bug: sería que el cliente lo archivó.
 */
import { describe, expect, it } from "vitest";
import {
  buildDeliveryClaims,
  metricasDeCumplimiento,
  pendientesAbiertos,
  cronogramaSinMarcar,
  type ClaimsInput,
  type FaseParaEntrega,
} from "./claims";

const tareas = (n: number, status = "PENDING") =>
  Array.from({ length: n }, (_, i) => ({ title: `T${i}`, status }));

const fase = (o: Partial<FaseParaEntrega> = {}): FaseParaEntrega => ({
  name: "Fase",
  status: "DONE",
  durationWeeks: 2,
  tasks: [],
  ...o,
});

const base: ClaimsInput = {
  fases: [],
  anchorStartDate: "2026-01-05",
  closeDateOverride: null,
  closing: { projectedISO: null, promisedISO: null, driftDays: null },
  reuniones: 0,
  corrimiento: null,
  hubs: [],
};

describe("la cohorte con el cronograma sin marcar", () => {
  it("0 de 61 NO se afirma — se omite", () => {
    /* El caso real. El número no está mal calculado: está mal MANTENIDO, y este documento no
       puede distinguir «no hicieron nada» de «nadie marcó el cronograma». Decir «0 de 61» en
       el cierre de un proyecto que salió bien es una calumnia contra el equipo. */
    const c = buildDeliveryClaims({ ...base, fases: [fase({ tasks: tareas(61) })] });
    expect(c.tareas).toBeNull();
    expect(metricasDeCumplimiento(c).map((m) => m.label)).not.toContain("Tareas completadas");
  });

  it("con UNA sola marcada, ya se afirma", () => {
    // El predicado es «nadie marcó NADA», no «marcaron poco»: 1 de 61 es un dato real.
    const t = [...tareas(60), { title: "hecha", status: "DONE" }];
    const c = buildDeliveryClaims({ ...base, fases: [fase({ tasks: t })] });
    expect(c.tareas).toEqual({ hechas: 1, denominador: 61, suspendidas: 0 });
  });

  it("un cronograma chico sin marcar NO cuenta como abandonado", () => {
    // 3 tareas sin marcar puede ser un proyecto que recién arranca. El umbral existe por eso.
    expect(cronogramaSinMarcar([fase({ tasks: tareas(3) })])).toBe(false);
    expect(cronogramaSinMarcar([fase({ tasks: tareas(5) })])).toBe(true);
  });
});

describe("la cohorte sin fecha de arranque (17 de 32)", () => {
  it("sin ancla no se afirma ninguna fecha de cierre", () => {
    const c = buildDeliveryClaims({
      ...base,
      anchorStartDate: null,
      fases: [fase({ tasks: [{ title: "x", status: "DONE" }, ...tareas(5)] })],
    });
    expect(c.cierre).toBeNull();
    expect(metricasDeCumplimiento(c).map((m) => m.label)).not.toContain("Cierre del plan");
  });

  it("…pero el cierre FIJADO A MANO sí se afirma, y se dice que es un acuerdo", () => {
    /* El CSE puede fijar la fecha aunque no haya ancla (Tanda K). Que el documento distinga
       «acordada» de «del plan» no es un matiz: una es una promesa humana y la otra una
       derivación nuestra, y el cliente tiene derecho a saber cuál está leyendo. */
    const c = buildDeliveryClaims({ ...base, anchorStartDate: null, closeDateOverride: "2026-09-30T00:00:00.000Z" });
    expect(c.cierre?.acordado).toBe(true);
    expect(metricasDeCumplimiento(c).map((m) => m.label)).toContain("Fecha de cierre acordada");
  });
});

describe("el plazo es CALENDARIO, nunca esfuerzo", () => {
  it("dos fases en paralelo dan el span, no la suma", () => {
    /* `totalWeeks` (esfuerzo) daría 5 y le regalaría 2 semanas al documento. El plazo es
       `timelineSpan` (calendario) = 3. El reparto está escrito en weeks.ts:129-135. */
    const c = buildDeliveryClaims({
      ...base,
      fases: [fase({ durationWeeks: 2 }), fase({ durationWeeks: 3, startWeek: 0 })],
    });
    expect(c.semanas).toBe(3);
  });
});

describe("las suspendidas se declaran", () => {
  it("«42 de 42» con 6 dadas de baja lo dice", () => {
    /* `resolvedTaskCounts` las saca del denominador a propósito, así que el 100% es cierto —
       y engañoso si no se dice que 6 salieron del plan. Cierto-y-engañoso sigue siendo mentir. */
    const t = [...tareas(42, "DONE"), ...tareas(6, "SUSPENDED")];
    const c = buildDeliveryClaims({ ...base, fases: [fase({ tasks: t })] });
    expect(c.tareas).toEqual({ hechas: 42, denominador: 42, suspendidas: 6 });
    expect(metricasDeCumplimiento(c).map((m) => m.label)).toContain("Tareas dadas de baja del plan");
  });
});

describe("el corrimiento del plan NO se llama atraso", () => {
  it("0 se afirma como «en fecha» — y es distinto de no saber", () => {
    const enFecha = buildDeliveryClaims({ ...base, closing: { projectedISO: "x", promisedISO: "y", driftDays: 0 } });
    expect(metricasDeCumplimiento(enFecha).some((m) => m.value === "En fecha")).toBe(true);

    const sinSaber = buildDeliveryClaims(base);
    expect(metricasDeCumplimiento(sinSaber).some((m) => m.value === "En fecha")).toBe(false);
  });

  it("ninguna etiqueta dice «atraso»: mide el PLAN, no la ejecución", () => {
    /* Un proyecto puede tener corrimiento 0 y estar tres semanas tarde. Son campos distintos
       (`overdueTasks`, `worstDaysLate`) y este documento no los pinta. */
    const c = buildDeliveryClaims({ ...base, closing: { projectedISO: "x", promisedISO: "y", driftDays: 21 } });
    const labels = metricasDeCumplimiento(c).map((m) => m.label.toLowerCase());
    expect(labels.some((l) => l.includes("atras"))).toBe(false);
    expect(labels.some((l) => l.includes("prometido"))).toBe(true);
  });
});

describe("sin dato, sin tarjeta", () => {
  it("un proyecto vacío no produce ni una métrica", () => {
    /* Con `metrics: []` la sección se apaga sola en lectura y en PDF vía `isBlank`. Es lo que
       permite que la vista no tenga ni un `if`: la honestidad vive en el dato, no en el JSX. */
    expect(metricasDeCumplimiento(buildDeliveryClaims({ ...base, anchorStartDate: null }))).toEqual([]);
  });

  it("cero reuniones no se afirma como «0 reuniones»", () => {
    const c = buildDeliveryClaims({ ...base, reuniones: 0 });
    expect(c.reuniones).toBeNull();
    expect(metricasDeCumplimiento(c).map((m) => m.label)).not.toContain("Reuniones de trabajo");
  });
});

describe("los pendientes", () => {
  it("lista lo abierto con su dueño, y NO las suspendidas", () => {
    const f = fase({
      name: "Puesta en marcha",
      tasks: [
        { title: "Cargar la base", status: "PENDING", party: "CLIENTE" },
        { title: "Capacitar al equipo", status: "IN_PROGRESS", party: "SMARTEAM" },
        { title: "Ya está", status: "DONE", party: "SMARTEAM" },
        { title: "Se descartó", status: "SUSPENDED", party: "CLIENTE" },
      ],
    });
    const p = pendientesAbiertos([f]);
    expect(p.map((x) => x.title)).toEqual(["Cargar la base", "Capacitar al equipo"]);
    /* El DUEÑO primero, la fase después. En un documento de cierre el lector necesita saber en
       tres palabras si le toca a él; arrancar por el nombre de la fase («Semana 0 — …») pone
       jerga interna adelante y esconde lo accionable al final del renglón. */
    expect(p[0].detail).toBe("Lo tienen ustedes · Puesta en marcha");
    expect(p[1].detail).toBe("Lo tenemos nosotros · Puesta en marcha");

    /* ⚠ «Lo cerramos juntos» quedó prohibido a propósito: en un cierre se lee como una promesa
       vaga y nadie levanta el pendiente. AMBOS ahora dice quién mira, no un gesto. */
    const conjunto = pendientesAbiertos([
      fase({ name: "Integraciones", tasks: [{ title: "Validar Aircall", status: "PENDING", party: "AMBOS" }] }),
    ]);
    expect(conjunto[0].detail).toBe("Lo vemos en conjunto · Integraciones");
  });

  it("respeta el tope: una lista de 40 pendientes no es una lista", () => {
    const f = fase({ tasks: tareas(40) });
    expect(pendientesAbiertos([f])).toHaveLength(12);
  });
});
