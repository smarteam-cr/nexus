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
import fs from "node:fs";
import path from "node:path";
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
  alcance: null,
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

describe("D-09 · la Entrega mide LO PROMETIDO: alcance agregado y atraso atribuido", () => {
  /* Antes el documento decía cuántas tareas se hicieron y cuánto se movió la fecha, pero no
     cuánto creció el alcance respecto de la foto del plan ni de quién fue el atraso. Las dos
     tarjetas se calculan acá — el agente sigue sin escribir un número — y se omiten sin dato. */
  const labels = (c: ClaimsInput) => metricasDeCumplimiento(buildDeliveryClaims(c)).map((m) => `${m.value} · ${m.label}`);

  it("con foto medible y firme, lo agregado se afirma; y el 0 también («cerró como se prometió»)", () => {
    const foto = { measurable: true, addedPhases: 0, addedTasks: 3, attenuated: false };
    expect(labels({ ...base, alcance: foto })).toContain("+3 · Tareas sumadas al alcance prometido");
    expect(labels({ ...base, alcance: { ...foto, addedPhases: 1 } })).toContain("+3 · Tareas sumadas al alcance prometido (en 1 fase nueva)");
    expect(labels({ ...base, alcance: { ...foto, addedTasks: 0, addedPhases: 2 } })).toContain("+2 · Fases sumadas al alcance prometido");
    expect(labels({ ...base, alcance: { ...foto, addedTasks: 0 } })).toContain("Sin extras · El alcance cerró como se prometió");
  });

  it("sin foto, o con foto DÉBIL, no se afirma nada del alcance", () => {
    /* La edición que lo pone en rojo: dejar pasar `attenuated` «porque igual es un número». Con
       una foto débil lo agregado suele ser el detalle que la foto no tenía: afirmarlo como extra
       es cobrarle al cliente una imprecisión nuestra. Sin foto (118 de 132 proyectos) no hay
       promesa contra la cual medir. */
    const sinFoto = { measurable: false, addedPhases: 0, addedTasks: 0, attenuated: false };
    const debil = { measurable: true, addedPhases: 1, addedTasks: 9, attenuated: true };
    expect(buildDeliveryClaims({ ...base, alcance: sinFoto }).alcance).toBeNull();
    expect(buildDeliveryClaims({ ...base, alcance: debil }).alcance, "una foto débil no afirma extras").toBeNull();
    expect(labels({ ...base, alcance: debil }).join("\n")).not.toMatch(/alcance/);
    expect(buildDeliveryClaims({ ...base, alcance: null }).alcance).toBeNull();
  });

  it("⛔ el atraso se dice, el CULPABLE no: ningún rótulo de la Entrega reparte responsables", () => {
    /* ── INVERTIDO el 2026-09-05, y el motivo importa más que el assert ──────────────────────
       Hasta hoy este test EXIGÍA lo contrario: que el rótulo dijera «De atraso registrado: 3 del
       cliente y 1 de Smarteam». Estaba mal, y la revisión previa al push lo cazó: la Entrega es un
       documento que el CLIENTE abre y archiva, y el repo ya tenía tomada la decisión opuesta para
       esa audiencia — `attributionSentence(..., { audience: "cliente" })` da «qué pasó y cuándo
       terminamos» SIN reparto, porque «el marcador de faltas no le sirve y pone la relación a la
       defensiva» (lib/timeline/particularidades-summary.ts). D-09 metió el desglose interno en el
       documento externo sin que nadie revocara esa decisión.

       Lo que se conserva de D-09: el TOTAL sí se dice (decisión de Elías, 2026-08-12: el plazo y
       el corrimiento se comunican). Lo que se revirtió: quién lo causó.

       La edición que lo pone en rojo: volver a interpolar `attributionBreakdown` —o cualquier
       reparto escrito a mano— en el rótulo. El assert no mira UNA tarjeta sino TODAS, así que
       tampoco alcanza con meterlo por otra métrica. */
    const c = buildDeliveryClaims({ ...base, corrimiento: { totalWeeks: 4, byParty: { CLIENTE: 3, SMARTEAM: 1 } } });
    const tarjeta = metricasDeCumplimiento(c).find((m) => m.value === "4 semanas");
    expect(tarjeta?.label, "el total se dice; el reparto no").toBe("De atraso registrado");

    const NOMBRA_CULPABLE = /del cliente|de Smarteam|de desarrollo|compartidas|sin atribuir/i;
    const CASOS: Array<Record<string, number>> = [
      { CLIENTE: 3, SMARTEAM: 1 },
      { AMBOS: 1 },
      { DEV: 2, SIN_ATRIBUIR: 1 },
    ];
    for (const caso of CASOS) {
      const total = Object.values(caso).reduce((a, b) => a + b, 0);
      const metricas = metricasDeCumplimiento(
        buildDeliveryClaims({ ...base, corrimiento: { totalWeeks: total, byParty: caso } }),
      );
      for (const m of metricas) {
        expect(
          `${m.value} ${m.label}`,
          "una métrica de la Entrega nombró a un responsable: eso lo lee el cliente",
        ).not.toMatch(NOMBRA_CULPABLE);
      }
    }

    expect(labels({ ...base, corrimiento: { totalWeeks: 0, byParty: {} } }).join("\n"), "sin atraso no hay tarjeta").not.toMatch(/atraso/);
  });

  it("LA guarda: el generador manda la foto y las desviaciones con el MISMO gate que la vista del cliente", () => {
    /* La edición que lo pone en rojo: pedir las particularidades sin `needsValidation: false` (una
       sugerencia del agente sin confirmar sumaría al atraso que el cliente lee), o sin
       `visibleExternal: true` (una desviación interna cruzaría al documento); o dejar `alcance`
       fuera de la llamada «porque casi nunca hay foto». */
    const gen = fs.readFileSync(path.join(process.cwd(), "lib/canvas/entrega-generate.ts"), "utf8");
    const seleccion = gen.slice(gen.indexOf("particularidades: {"), gen.indexOf("loadProjectSummary(projectId)"));
    expect(seleccion.length, "la guarda no mira nada").toBeGreaterThan(80);
    expect(seleccion, "mismo gate por registro que lib/external/timeline-view.ts").toContain("where: { visibleExternal: true, needsValidation: false }");
    expect(seleccion, "solo lo que suma el atraso").toContain("select: { kind: true, party: true, weeksImpact: true, estado: true }");
    expect(gen, "el sumador único, no una suma a mano").toContain("corrimiento: summarizeParticularidades(project?.timeline?.particularidades ?? [])");
    expect(gen, "la foto del plan llega a las afirmaciones").toContain("alcance: summary?.scope ?? null");
  });
});
