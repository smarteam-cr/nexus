/**
 * lib/timeline/phase-state.test.ts
 *
 * Lo que se fija: el módulo DERIVA y COMPARA, nunca decide. El `status` guardado sale intacto
 * en `persisted` — la pantalla muestra ese y la divergencia al lado, no un estado corregido en
 * silencio. Si el badge dijera lo derivado, el CSE no tendría forma de saber que el sistema y
 * el registro no coinciden.
 */
import { describe, test, expect } from "vitest";
import { derivePhaseState } from "./phase-state";

const ctx = (over: Partial<Parameters<typeof derivePhaseState>[1]> = {}) => ({
  phaseStart: 0,
  durationWeeks: 4,
  curWeek: 2,
  ...over,
});
const t = (status: string) => ({ status });

describe("el estado derivado sale de las tareas", () => {
  test("todas resueltas → DONE", () => {
    expect(derivePhaseState({ status: "PENDING", tasks: [t("DONE"), t("SUSPENDED")] }, ctx()).derived).toBe("DONE");
  });

  test("alguna hecha o empezada → IN_PROGRESS", () => {
    expect(derivePhaseState({ status: "PENDING", tasks: [t("DONE"), t("PENDING")] }, ctx()).derived).toBe("IN_PROGRESS");
    expect(derivePhaseState({ status: "PENDING", tasks: [t("IN_PROGRESS"), t("PENDING")] }, ctx()).derived).toBe("IN_PROGRESS");
  });

  test("nada tocado → PENDING", () => {
    expect(derivePhaseState({ status: "IN_PROGRESS", tasks: [t("PENDING")] }, ctx()).derived).toBe("PENDING");
  });

  test("una fecha real de arranque también cuenta como empezada", () => {
    const r = derivePhaseState({ status: "PENDING", actualStart: new Date(), tasks: [t("PENDING")] }, ctx());
    expect(r.derived).toBe("IN_PROGRESS");
  });
});

describe("sin tareas mandan las fechas reales, NO el calendario", () => {
  /* Que la ventana de calendario haya pasado no hace que el trabajo esté hecho. Derivar DONE
     por fecha sería el sistema declarando terminado algo que nadie terminó. */
  test("la ventana vencida no cierra una fase por sí sola", () => {
    const r = derivePhaseState({ status: "PENDING" }, ctx({ curWeek: 99 }));
    expect(r.derived).toBe("PENDING");
    expect(r.divergences).toContain("VENTANA_CERRADA_SIN_CERRAR");
  });

  test("actualEnd sí la cierra: alguien la cerró de verdad", () => {
    expect(derivePhaseState({ status: "PENDING", actualEnd: new Date() }, ctx()).derived).toBe("DONE");
  });

  test("actualStart sin actualEnd la deja en curso", () => {
    expect(derivePhaseState({ status: "PENDING", actualStart: new Date() }, ctx()).derived).toBe("IN_PROGRESS");
  });
});

describe("las divergencias con el estado guardado", () => {
  test("cerrada con tareas abiertas", () => {
    const r = derivePhaseState({ status: "DONE", tasks: [t("DONE"), t("PENDING")] }, ctx());
    expect(r.divergences).toContain("CERRADA_CON_ABIERTAS");
    expect(r.persisted).toBe("DONE"); // el registro humano sale intacto
  });

  test("abierta con todo hecho", () => {
    const r = derivePhaseState({ status: "IN_PROGRESS", tasks: [t("DONE"), t("SUSPENDED")] }, ctx());
    expect(r.divergences).toContain("ABIERTA_CON_TODO_HECHO");
  });

  test("arrancó según el calendario y nadie marcó nada", () => {
    const r = derivePhaseState({ status: "PENDING", tasks: [t("PENDING")] }, ctx({ curWeek: 1 }));
    expect(r.divergences).toContain("ARRANCO_SIN_MARCAR");
  });

  test("pero no si hay alguna señal de arranque", () => {
    const conTarea = derivePhaseState({ status: "PENDING", tasks: [t("IN_PROGRESS")] }, ctx({ curWeek: 1 }));
    expect(conTarea.divergences).not.toContain("ARRANCO_SIN_MARCAR");
    const conFecha = derivePhaseState({ status: "PENDING", actualStart: new Date(), tasks: [t("PENDING")] }, ctx({ curWeek: 1 }));
    expect(conFecha.divergences).not.toContain("ARRANCO_SIN_MARCAR");
  });

  test("una fase futura no diverge por nada del calendario", () => {
    const r = derivePhaseState({ status: "PENDING", tasks: [t("PENDING")] }, ctx({ phaseStart: 10, curWeek: 2 }));
    expect(r.divergences).toEqual([]);
  });

  /* 17 de 32 cronogramas no tienen fecha de arranque: sin ella no hay semana actual, y las
     divergencias de calendario no pueden evaluarse. Emitirlas igual sería inventar. */
  test("sin fecha de arranque no se emite ninguna divergencia de calendario", () => {
    const r = derivePhaseState({ status: "PENDING", tasks: [t("PENDING")] }, ctx({ curWeek: null }));
    expect(r.divergences).toEqual([]);
  });

  test("una fase sana no diverge", () => {
    const r = derivePhaseState({ status: "IN_PROGRESS", tasks: [t("DONE"), t("PENDING")] }, ctx({ curWeek: 1 }));
    expect(r.divergences).toEqual([]);
    expect(r.derived).toBe("IN_PROGRESS");
  });
});

test("el estado guardado NUNCA se pisa: sale tal cual en persisted", () => {
  for (const status of ["PENDING", "IN_PROGRESS", "DONE", "SUSPENDED"]) {
    expect(derivePhaseState({ status, tasks: [t("DONE")] }, ctx()).persisted).toBe(status);
  }
});
