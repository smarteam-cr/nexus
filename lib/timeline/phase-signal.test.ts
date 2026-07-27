/**
 * lib/timeline/phase-signal.test.ts
 *
 * Lo que se fija: qué merece rojo y qué no. El criterio viejo ("alguna tarea suya venció")
 * pintaba 7 de las 10 fases de Wherex — y algo que marca casi todo deja de marcar.
 */
import { describe, test, expect } from "vitest";
import { buildPhaseSignal } from "./phase-signal";

const t = (status: string) => ({ status });
/** Fase de 4 semanas que arranca en la 0. `curWeek` decide si su ventana cerró. */
const ctx = (curWeek: number | null) => ({ phaseStart: 0, durationWeeks: 4, curWeek });

describe("solo la fase que se pasó de fecha va en rojo", () => {
  test("ventana cerrada y sigue abierta → Atrasada", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING"), t("PENDING")], vencidas: 2 }, ctx(9));
    expect(s.atrasada).toBe(true);
    expect(s.tono).toBe("riesgo");
    expect(s.texto).toBe("Atrasada · 2 sin hacer");
  });

  /* El caso que hacía que el punto rojo dejara de servir: la fase va en tiempo, una tarea
     suelta se pasó. Es un problema de TAREA, y ya lo grita su propia fila al expandir. */
  test("fase en curso con una tarea vencida → NO es roja", () => {
    const s = buildPhaseSignal({ status: "IN_PROGRESS", tasks: [t("DONE"), t("PENDING")], vencidas: 1 }, ctx(2));
    expect(s.atrasada).toBe(false);
    expect(s.tono).toBe("curso");
    expect(s.texto).toBe("En curso · 1 vencida");
  });

  test("ventana cerrada pero la fase está completada → no es atraso", () => {
    const s = buildPhaseSignal({ status: "DONE", tasks: [t("DONE")], vencidas: 0 }, ctx(9));
    expect(s.atrasada).toBe(false);
    expect(s.tono).toBe("ok");
    expect(s.texto).toBe("Completada");
  });

  /* 17 de 32 cronogramas no tienen fecha de arranque: sin ella no hay semana actual y el
     calendario no puede opinar. Marcar rojo igual sería inventar. */
  test("sin fecha de arranque no hay atraso posible", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 0 }, ctx(null));
    expect(s.atrasada).toBe(false);
  });

  /**
   * LA COMPUERTA QUE LA MEDICIÓN OBLIGÓ A PONER. Sin ella, el criterio nuevo marcaba 55
   * fases de la cartera contra las 45 del viejo — o sea que empeoraba. De esas 55, **19 no
   * tenían una sola tarea**, todas dentro de los 17 cronogramas que nunca se detallaron.
   * Una fase vacía cuya ventana cerró no dice "nadie la hizo": dice "nadie la escribió".
   */
  test("una fase SIN TAREAS nunca se marca atrasada, por vieja que sea su ventana", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [], vencidas: 0 }, ctx(99));
    expect(s.atrasada).toBe(false);
    expect(s.texto).toBe("");
  });

  test("con una sola tarea, ya se puede juzgar", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 1 }, ctx(99));
    expect(s.atrasada).toBe(true);
  });
});

describe("PENDING no se dice: es el estado de casi todas las filas", () => {
  test("una fase futura y limpia no declara nada", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 0 }, ctx(0));
    expect(s.texto).toBe("");
    expect(s.tono).toBe("neutro");
  });

  test("pero si tiene vencidas, sí", () => {
    const s = buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 3 }, ctx(2));
    expect(s.texto).toBe("3 vencidas");
  });
});

describe("los cuatro chips caben en un texto", () => {
  test("estado + vencidas + estimada, en ese orden", () => {
    const s = buildPhaseSignal(
      { status: "IN_PROGRESS", tasks: [t("PENDING")], vencidas: 2, needsValidation: true },
      ctx(2),
    );
    expect(s.texto).toBe("En curso · 2 vencidas · estimada");
  });

  test("la fase atrasada también dice si es estimada", () => {
    const s = buildPhaseSignal(
      { status: "PENDING", tasks: [t("PENDING")], vencidas: 1, needsValidation: true },
      ctx(9),
    );
    expect(s.texto).toBe("Atrasada · 1 sin hacer · estimada");
  });
});

/* Nada de lo que se comprime se pierde: el tooltip lo dice entero, y el tipo de actividad
   —que en la fila pasa a ser solo el color— vive acá con su nombre. */
describe("el tooltip trae la lectura completa", () => {
  test("nombra el tipo, el estado, el atraso y la estimación", () => {
    const s = buildPhaseSignal(
      { status: "PENDING", tasks: [t("PENDING")], vencidas: 3, needsValidation: true, tipoLabel: "Configuración" },
      ctx(9),
    );
    expect(s.detalle).toBe(
      "Configuración · sin empezar · su ventana de calendario ya terminó y sigue abierta · " +
        "3 tareas vencidas · duración estimada por la IA, sin datos de tiempos en ventas: confirmala",
    );
  });

  test("una fase sin tipo lo declara en vez de callarlo", () => {
    const s = buildPhaseSignal({ status: "DONE", tasks: [t("DONE")], vencidas: 0 }, ctx(9));
    expect(s.detalle).toBe("Sin tipo de actividad · completada");
  });
});

test("singular y plural", () => {
  expect(buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 1 }, ctx(2)).texto).toBe("1 vencida");
  expect(buildPhaseSignal({ status: "PENDING", tasks: [t("PENDING")], vencidas: 2 }, ctx(2)).texto).toBe("2 vencidas");
});
