/**
 * lib/delivery/readiness.test.ts — el CSE se entera ANTES de generar.
 *
 * El caso que originó este módulo es real y está medido: la primera corrida de la Entrega
 * sobre Wherex salió diciendo «1 de 10 fases cerradas» y «33 de 94 tareas completadas». Los dos
 * números son CIERTOS y los dos se leen fatal en un papel titulado «Entrega del proyecto».
 *
 * La distinción que fija este archivo: un número FALSO lo tiene que impedir el código; uno
 * INCÓMODO lo tiene que ver el CSE antes de apretar Generar. Por eso casi todo avisa, y lo
 * único que frena publicar es el caso donde el documento no puede distinguir «no se hizo nada»
 * de «nadie lo anotó».
 */
import { describe, expect, it } from "vitest";
import { deliveryReadiness, type ReadinessInput } from "./readiness";
import type { DeliveryClaims } from "./claims";

const claims = (o: Partial<DeliveryClaims> = {}): DeliveryClaims => ({
  tareas: { hechas: 40, denominador: 50, suspendidas: 0 },
  fases: { cerradas: 8, total: 10 },
  semanas: 16,
  cierre: { label: "8 sep 2026", acordado: false },
  corrimientoDelPlan: 0,
  corrimiento: null,
  reuniones: 65,
  hubs: ["Sales Hub"],
  ...o,
});

const input = (o: Partial<ReadinessInput> = {}): ReadinessInput => ({
  claims: claims(),
  cobertura: { conContenido: 40, total: 65 },
  sinMarcar: false,
  ...o,
});

const keys = (i: ReadinessInput) => deliveryReadiness(i).avisos.map((a) => a.key);

describe("generar NUNCA se traba", () => {
  it("ni siquiera en el peor proyecto posible", () => {
    /* 17 de 32 cronogramas no tienen ancla y 6 no tienen ni una tarea marcada. Una compuerta
       dura dejaría a media cartera sin poder entregar, y el CSE aprendería a ignorarla. */
    const peor = deliveryReadiness(
      input({
        sinMarcar: true,
        claims: claims({ tareas: null, fases: null, semanas: null, cierre: null, corrimientoDelPlan: null, reuniones: null, hubs: [] }),
        cobertura: { conContenido: 0, total: 0 },
      }),
    );
    expect(peor.puedeGenerar).toBe(true);
    expect(peor.puedePublicar).toBe(false);
  });
});

describe("lo único que frena PUBLICAR", () => {
  it("el cronograma entero sin marcar", () => {
    const r = deliveryReadiness(input({ sinMarcar: true }));
    expect(r.puedePublicar).toBe(false);
    expect(r.avisos.find((a) => a.key === "SIN_MARCAR")?.efecto).toBe("FRENA_PUBLICAR");
  });

  it("un proyecto sano publica sin avisos", () => {
    const r = deliveryReadiness(input());
    expect(r.puedePublicar).toBe(true);
    expect(r.avisos).toEqual([]);
  });
});

describe("el caso Wherex: cierto pero incómodo", () => {
  it("«1 de 10 fases» AVISA con el texto exacto que va a salir, y deja generar", () => {
    const r = deliveryReadiness(input({ claims: claims({ fases: { cerradas: 1, total: 10 } }) }));
    const aviso = r.avisos.find((a) => a.key === "POCAS_FASES_CERRADAS");
    expect(aviso?.efecto).toBe("AVISA");
    // El aviso muestra la frase LITERAL del documento: sin eso el CSE no sabe qué está evitando.
    expect(aviso?.texto).toContain("1 de 10 fases cerradas");
    expect(r.puedePublicar).toBe(true);
  });

  it("con las fases cerradas de verdad, no molesta", () => {
    expect(keys(input({ claims: claims({ fases: { cerradas: 9, total: 10 } }) }))).toEqual([]);
  });

  it("sin marcar NO duplica el aviso de pocas fases", () => {
    // Son el mismo problema visto dos veces; dos avisos para una causa entrenan a ignorarlos.
    const k = keys(input({ sinMarcar: true, claims: claims({ fases: { cerradas: 0, total: 10 } }) }));
    expect(k).toContain("SIN_MARCAR");
    expect(k).not.toContain("POCAS_FASES_CERRADAS");
  });
});

describe("lo que el documento va a omitir se anuncia", () => {
  it("sin ancla: no va a haber fecha de cierre", () => {
    expect(keys(input({ claims: claims({ cierre: null }) }))).toContain("SIN_ANCLA");
  });

  it("sin baseline: no se puede comparar contra lo prometido", () => {
    expect(keys(input({ claims: claims({ corrimientoDelPlan: null }) }))).toContain("SIN_BASELINE");
  });

  it("⚠ sin ancla NO reclama además el baseline", () => {
    /* Sin fecha de cierre la comparación contra lo prometido no existe: avisar de las dos es
       decirle al CSE que arregle algo que se arregla solo con lo otro. */
    const k = keys(input({ claims: claims({ cierre: null, corrimientoDelPlan: null }) }));
    expect(k).toContain("SIN_ANCLA");
    expect(k).not.toContain("SIN_BASELINE");
  });

  it("cobertura baja de reuniones: el relato sale de poco material", () => {
    // Wherex real: 4 de 65 con transcripción.
    const r = deliveryReadiness(input({ cobertura: { conContenido: 4, total: 65 } }));
    const aviso = r.avisos.find((a) => a.key === "COBERTURA_BAJA");
    expect(aviso?.texto).toContain("4 de 65");
  });

  it("sin reuniones NO se queja además de la cobertura", () => {
    const k = keys(input({ claims: claims({ reuniones: null }), cobertura: { conContenido: 0, total: 0 } }));
    expect(k).toContain("SIN_REUNIONES");
    expect(k).not.toContain("COBERTURA_BAJA");
  });

  it("sin tags de producto, la sección de alcance sale pobre", () => {
    expect(keys(input({ claims: claims({ hubs: [] }) }))).toContain("SIN_HUBS");
  });
});
