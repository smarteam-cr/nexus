/**
 * lib/timeline/mensaje-de-la-propuesta.test.ts — EL MENSAJE DE ARRIBA, con los números del código (L4, spec §5.3 y §5.5).
 *
 * Correr: `npx vitest run lib/timeline/mensaje-de-la-propuesta.test.ts --project unit`.
 *
 * Sobre la propuesta grande anonimizada (__fixtures__/propuesta-grande.json, leída con `leerFixtureGrande`, nunca
 * importada), con sus referencias sintéticas (lo prometido: cierre 11 ago, subido el 3 ago, 12 semanas; el handoff: 13
 * semanas; 6 atrasos antes y después de la promesa) y el `hoy` fijo CON zona. Los números esperados son los medidos con
 * el código real (spec §0.5): 57 de 66 pendientes, 73 nuevas (no 74: una «ya está»), 46 hechas, 13 oct → 10 nov,
 * 9 → 13 semanas contra lo prometido, +8 → +12 contra el handoff y atrasadas 59 → 67 (58 nacen).
 * Cada `it` nombra la edición de producción que lo pone en rojo.
 */
import { describe, expect, it } from "vitest";
import { borradorDelFixture, FASE_QUE_SE_ALARGA, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { claveDeCampo, resumir, type Borrador, type CambioFaseCambia, type Vivo } from "./borrador";
import {
  atrasadas,
  cortarNombre,
  etiquetaLargaDelCambio,
  fuenteDelMotivo,
  LINEA_SIN_MATERIAL,
  mensajeDeLaPropuesta,
  nivelDeLaPropuesta,
  TITULOS_DEL_MENSAJE,
  TOPE_DE_LA_LINEA,
  type EntradaDelMensaje,
  type MensajeDeLaPropuesta,
} from "./mensaje-de-la-propuesta";
import type { FuentesDeLaPropuesta, ReferenciasDeLaPropuesta } from "./referencias-de-la-propuesta";
import { vistaDeLaPropuesta } from "./vista-de-la-propuesta";

const FIXTURE = leerFixtureGrande();
const VIVO = vivoDelFixture(FIXTURE);
const BORRADOR = borradorDelFixture(FIXTURE);
const HOY = new Date(FIXTURE.hoy);
const LISTAS = { tareas: "listas" as const };
const R = resumir(VIVO, BORRADOR, [], LISTAS);
const SIN_MATERIAL: FuentesDeLaPropuesta = { instrucciones: true, reuniones: [], notas: [] };
const REFERENCIAS: ReferenciasDeLaPropuesta = { prometido: FIXTURE.prometido, handoff: FIXTURE.handoff, fuentes: SIN_MATERIAL };

function entrada(o: Partial<EntradaDelMensaje> = {}): EntradaDelMensaje {
  return {
    vivo: VIVO,
    borrador: BORRADOR,
    r: R,
    entera: R,
    referencias: REFERENCIAS,
    atrasos: FIXTURE.particularidades,
    cierreFijado: null,
    hoy: HOY,
    ...o,
  };
}
/** El mensaje de un borrador cualquiera sobre un vivo, con lo marcado (`sin`) y la propuesta entera. */
function mensajeDe(vivo: Vivo, b: Borrador, o: Partial<EntradaDelMensaje> & { sin?: string[] } = {}): MensajeDeLaPropuesta {
  const { sin = [], ...resto } = o;
  return mensajeDeLaPropuesta(
    entrada({ vivo, borrador: b, r: resumir(vivo, b, sin, LISTAS), entera: resumir(vivo, b, [], LISTAS), ...resto }),
  );
}
const M = mensajeDeLaPropuesta(entrada());
const todo = (m: MensajeDeLaPropuesta) => [...m.lineas, ...m.detalle];
const VOSEO = /\b(podés|querés|tenés|decime|decímelo|fijate|mirá|revisá|sabés|elegí|aplicá)\b/i;

describe("L4 · el mensaje con la propuesta grande", () => {
  it("⭐ título por el nivel y las 5 líneas en su orden: el cierre con su causa, la promesa, las tareas, el material, las atrasadas", () => {
    /* Las ediciones que la ponen en rojo: decir un solo número en la de atrasadas («59 quedan atrasadas» se leía como que
       la propuesta los crea), o el +4 sin su causa. */
    expect(M.nivel).toBe("casi-todo");
    expect(M.tono).toBe("warn");
    expect(M.titulo).toBe("Rehace casi todas las pendientes");
    expect(M.lineas).toHaveLength(5);
    const [cierre, promesa, tareas, material, atraso] = M.lineas;
    for (const x of ["13 oct", "10 nov", "+4 semanas", "Fase K", "Fase L"]) expect(cierre, `la línea del cierre sin «${x}»`).toContain(x);
    expect(cierre.indexOf("Fase K"), "la causa va DESPUÉS del corrimiento").toBeGreaterThan(cierre.indexOf("+4 semanas"));
    expect(promesa).toContain("9 semanas tarde → 13");
    expect(promesa).toContain("+8 → +12");
    expect(promesa).toContain("aprox.");
    expect(tareas).toContain("57 de las 66");
    expect(tareas).toContain("73 nuevas");
    expect(tareas).toContain("46 hechas");
    expect(material).toBe(LINEA_SIN_MATERIAL);
    expect(atraso).toContain("hoy 59 → con la propuesta 67");
    expect(atraso).toContain("58");
  });

  it("⭐ con una reunión o una nota, la línea del material no va; sin saber las fuentes, tampoco", () => {
    /* La edición que la pone en rojo: afirmar «no elegiste reuniones ni notas» sin mirar las fuentes de la corrida. */
    const conReunion = mensajeDeLaPropuesta(
      entrada({ referencias: { ...REFERENCIAS, fuentes: { ...SIN_MATERIAL, reuniones: [{ titulo: "Seguimiento", fecha: "2026-09-12T15:00:00.000Z" }] } } }),
    );
    expect(conReunion.lineas).not.toContain(LINEA_SIN_MATERIAL);
    const conNota = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, fuentes: { ...SIN_MATERIAL, notas: ["Acta"] } } }));
    expect(conNota.lineas).not.toContain(LINEA_SIN_MATERIAL);
    const sinSaber = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, fuentes: null } }));
    expect(sinSaber.lineas).not.toContain(LINEA_SIN_MATERIAL);
    // Con instrucciones o sin ellas, la misma frase.
    const sinInstrucciones = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, fuentes: { ...SIN_MATERIAL, instrucciones: false } } }));
    expect(sinInstrucciones.lineas).toContain(LINEA_SIN_MATERIAL);
  });

  it("⭐ las cuentas son las de `r` (73, no 74): la línea de tareas más los cambios de fases da lo que se aplica", () => {
    /* La edición que la pone en rojo: contar `borrador.cambios` (74 tareas nuevas crudas: una ya está). */
    expect(BORRADOR.cambios.filter((c) => c.tipo === "tarea-nueva")).toHaveLength(74);
    const m = /Quita (\d+) de las (\d+) pendientes y suma (\d+) nuevas/.exec(M.lineas[2]);
    expect(m, M.lineas[2]).not.toBeNull();
    const [quita, pendientes, suma] = [Number(m![1]), Number(m![2]), Number(m![3])];
    expect([quita, pendientes, suma]).toEqual([57, 66, 73]);
    const deFases = R.items.filter((it) => it.estado === "aplica" || it.estado === "excluido").length;
    expect(quita + suma + deFases).toBe(R.aplicables);
    expect(R.aplicables).toBe(132);
  });

  it("⭐ con lo marcado distinto de todo, la línea de tareas lo dice y cuenta lo marcado", () => {
    /* La edición que la pone en rojo: contar la propuesta entera en la línea de tareas. */
    const grupoA = R.grupos.find((g) => g.fase === "f02")!;
    const m = mensajeDeLaPropuesta(entrada({ r: resumir(VIVO, BORRADOR, grupoA.tareas.map((t) => t.clave), LISTAS) }));
    expect(m.lineas[2]).toMatch(/^Con lo marcado, quita 49 de las 66 pendientes y suma 64 nuevas/);
  });

  it("⭐ los atrasos cargados van APARTE: solo los posteriores a lo prometido, en «Más», y «suman más» si pasan lo corrido", () => {
    /* Las ediciones que la ponen en rojo: sumar los atrasos anteriores a la promesa (daría 14: cliente 9), pegarlos a
       las líneas o ponerlos en la misma oración que «la propuesta» (se leen como la causa). */
    const frase = M.detalle.find((d) => d.includes("atrasos cargados"));
    expect(frase).toBe("Desde lo prometido (3 ago) hay 11 semanas de atrasos cargados: cliente 7 · ambos 2 · Smarteam 2.");
    expect(M.lineas.join(" ")).not.toMatch(/atrasos cargados|Suman más/);
    for (const d of M.detalle) {
      for (const oracion of d.split(/(?<=\.)\s+/)) {
        if (/atrasos cargados|Suman más/.test(oracion)) expect(oracion).not.toContain("propuesta");
      }
    }
    expect(M.detalle).toContain(
      "Suman más que lo que se corrió el plan desde entonces (9 semanas): revísalos antes de explicárselo al cliente.",
    );
    // Todo antes de la promesa: sin frase. Sin la fecha de lo prometido: tampoco.
    const despues = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, prometido: { ...FIXTURE.prometido, fecha: "2026-09-20" } } }));
    expect(despues.detalle.join(" ")).not.toContain("atrasos cargados");
    const sinFecha = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, prometido: { ...FIXTURE.prometido, fecha: null } } }));
    expect(sinFecha.detalle.join(" ")).not.toContain("atrasos cargados");
    // Menos de lo corrido: la frase va, «suman más» no.
    const pocos = mensajeDeLaPropuesta(entrada({ atrasos: [{ kind: "ATRASO", party: "CLIENTE", weeksImpact: 2, occurredAt: "2026-09-01" }] }));
    expect(pocos.detalle.join(" ")).toContain("hay 2 semanas de atrasos cargados: cliente 2.");
    expect(pocos.detalle.join(" ")).not.toContain("Suman más");
  });

  it("«Más»: dónde se concentran los cambios y la fase terminada que recibe tareas", () => {
    /* La edición que la pone en rojo: no decir que una fase TERMINADA recibe tareas nuevas. */
    expect(M.detalle).toContain("Los cambios se concentran en «Fase A» (17), «Fase K» (17) y «Fase D» (16).");
    expect(M.detalle).toContain("⚠ «Fase B» está terminada y la propuesta le suma 8 tareas.");
  });

  it("atrasadas: hoy 59 → 67 con la propuesta entera, 58 nacen, con el predicado de la vista", () => {
    /* La edición que la pone en rojo: contar como «nacen» todas las atrasadas de la proyección (67). */
    expect(atrasadas(VIVO, R, HOY)).toEqual({ hoy: 59, despues: 67, nacen: 58 });
    const sinAncla = { ...VIVO, ancla: null };
    expect(atrasadas(sinAncla, resumir(sinAncla, BORRADOR, [], LISTAS), HOY)).toEqual({ hoy: 0, despues: 0, nacen: 0 });
  });

  it("antes de hidratar (sin `hoy`) no hay línea de atrasadas", () => {
    const m = mensajeDeLaPropuesta(entrada({ hoy: null }));
    expect(m.lineas.join(" ")).not.toContain("Atrasadas");
    expect(m.lineas).toHaveLength(4);
  });
});

describe("L4 · el nivel mira la propuesta ENTERA", () => {
  const conTareas = (filtro: (c: Borrador["cambios"][number]) => boolean): Borrador => ({ ...BORRADOR, cambios: BORRADOR.cambios.filter(filtro) });

  it("⭐ el título no cambia al desmarcar lo que se quita (usa `entera`, no lo marcado)", () => {
    /* La edición que la pone en rojo: calcular el nivel con `r` (con lo marcado): desmarcar las 57 que se quitan
       bajaba el título a «Cambia parte del cronograma» mientras la propuesta seguía siendo la misma. */
    const seVan = BORRADOR.cambios.filter((c) => c.tipo === "tarea-se-va").map((c) => c.clave);
    const r = resumir(VIVO, BORRADOR, seVan, LISTAS);
    const sinQuitar = mensajeDeLaPropuesta(entrada({ r }));
    expect(sinQuitar.titulo).toBe(M.titulo);
    expect(sinQuitar.nivel).toBe("casi-todo");
    // Con lo marcado no se quita nada (y las nuevas iguales a una que se queda ya están: las cuenta `r`).
    expect(r.tareas.seVan).toBe(0);
    expect(sinQuitar.lineas[2]).toBe(`Con lo marcado, suma ${r.tareas.nuevas} tareas nuevas; las 46 hechas conservan su estado.`);
  });

  it("⭐ primera, casi igual, mediano y casi todo (por magnitud y por proporción)", () => {
    /* La edición que la pone en rojo: otra regla de nivel (o umbrales) sin tocar esta tabla. */
    const primera = mensajeDe(VIVO, { ...BORRADOR, pedido: "primera" });
    expect(primera.nivel).toBe("primera");
    expect(primera.titulo).toBe(TITULOS_DEL_MENSAJE.primera);
    expect(primera.tono).toBe("info");
    expect(primera.lineas[0]).toMatch(/^Primer cronograma: 13 fases, 25 semanas, cierre 10 nov\.$/);

    // Dos nuevas de fases que existen y que, solas, no «ya están» (sin la que se quita, su gemela sigue en su semana).
    const dos = BORRADOR.cambios
      .filter((c) => c.tipo === "tarea-nueva" && c.fase.startsWith("f"))
      .filter((c) => resumir(VIVO, { ...BORRADOR, cambios: [c] }, [], LISTAS).tareas.nuevas === 1)
      .slice(0, 2);
    expect(dos).toHaveLength(2);
    const chico = mensajeDe(VIVO, { ...BORRADOR, cambios: dos });
    expect(chico.nivel).toBe("casi-igual");
    expect(chico.titulo).toBe("Ajuste chico");
    expect(chico.lineas[0]).toBe("Ninguna fase cambia y el cierre sigue el 13 oct.");
    expect(chico.lineas[2]).toMatch(/^Cambian 2 tareas pendientes, en «/);

    const mediano = mensajeDe(VIVO, conTareas((c) => c.tipo === "fase-cambia" || (c.tipo === "tarea-nueva" && c.fase === "f02")));
    expect(mediano.nivel).toBe("mediano");
    expect(mediano.titulo).toBe("Cambia parte del cronograma");
    expect(mediano.tono).toBe("info");

    expect(nivelDeLaPropuesta(R, VIVO, BORRADOR.pedido)).toEqual({ nivel: "casi-todo", porMagnitud: false });

    // Renombrar 8 de las 12 fases es, sin discusión, otra lista (la regla de `evaluarMagnitud`).
    const renombres: CambioFaseCambia[] = VIVO.fases.slice(0, 8).map((f) => ({
      tipo: "fase-cambia",
      clave: claveDeCampo(f.id, "name"),
      faseId: f.id,
      fase: f.name,
      campo: "name",
      desde: f.name,
      a: `${f.name} (nueva)`,
    }));
    const otro = mensajeDe(VIVO, { ...BORRADOR, cambios: renombres });
    expect(otro.nivel).toBe("casi-todo");
    expect(otro.titulo).toBe(TITULOS_DEL_MENSAJE.casiNuevo);
    expect(otro.tono).toBe("warn");
    expect(otro.detalle.some((d) => d.startsWith("Es prácticamente otro cronograma."))).toBe(true);
    expect(M.detalle.some((d) => d.startsWith("Es prácticamente otro cronograma."))).toBe(false);
  });
});

describe("L4 · sin referencias, con el cierre fijado, antes de lo prometido, sin ancla", () => {
  it("sin lo prometido no se nombra; sin handoff, o con una propuesta del handoff, tampoco el handoff", () => {
    const sinProm = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, prometido: null } }));
    expect(todo(sinProm).join(" ")).not.toContain("prometido");
    expect(sinProm.lineas[1]).toContain("handoff");
    const sinHandoff = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, handoff: null } }));
    expect(sinHandoff.lineas.join(" ")).not.toContain("handoff");
    const delHandoff = mensajeDeLaPropuesta(entrada({ borrador: { ...BORRADOR, origen: "handoff" } }));
    expect(delHandoff.lineas.join(" ")).not.toContain("handoff");
    const ninguna = mensajeDeLaPropuesta(entrada({ referencias: null }));
    expect(ninguna.lineas.join(" ")).not.toMatch(/prometido|handoff/);
    expect(ninguna.lineas).toHaveLength(3);
  });

  it("⭐ con el cierre fijado a mano, lo dice y compara «el plan calculado»", () => {
    /* La edición que la pone en rojo: comparar el cierre fijado como si fuera el del plan. */
    const m = mensajeDeLaPropuesta(entrada({ cierreFijado: "2026-12-15" }));
    expect(m.lineas[0]).toContain("fijado a mano el 15 dic");
    expect(m.lineas[0]).toContain("el plan calculado pasa del 13 oct al 10 nov");
    expect(m.lineas[1]).toMatch(/^El plan calculado contra lo prometido/);
  });

  it("⭐ contra lo prometido: antes → tarde, a tiempo, y siempre los dos números", () => {
    /* La edición que la pone en rojo: un solo número, o «tarde» con la propuesta antes de lo prometido. */
    const con = (cierreISO: string) => mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, prometido: { ...FIXTURE.prometido, cierreISO } } })).lineas[1];
    expect(con("2026-10-27")).toContain("hoy 2 semanas antes → 2 tarde");
    expect(con("2026-10-13")).toContain("hoy a tiempo → 4 semanas tarde");
    expect(con("2026-11-24")).toContain("hoy 6 semanas antes → 2");
  });

  it("⭐ sin fecha de arranque: sin fechas ni atrasadas, solo semanas", () => {
    /* La edición que la pone en rojo: inventar fechas (o atrasadas) sin ancla. */
    const vivo = { ...VIVO, ancla: null };
    const m = mensajeDe(vivo, BORRADOR);
    expect(m.lineas[0]).toMatch(/^El plan pasa de 21 a 25 semanas \(\+4 semanas\): /);
    expect(m.lineas.join(" ")).not.toMatch(/\b\d{1,2} (ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/);
    expect(m.lineas.join(" ")).not.toContain("Atrasadas");
    expect(m.lineas[1]).toContain("Contra lo prometido (12 semanas): hoy 9 semanas tarde → 13");
  });

  it("el cierre que no se mueve lo dice sin causa (y, sin ningún cambio de fases marcado, que ninguna fase cambia)", () => {
    const sinLaEstructura = mensajeDe(VIVO, BORRADOR, { sin: ["fase:f12:durationWeeks", "n:p01"] });
    expect(sinLaEstructura.lineas[0]).toBe("Ninguna fase cambia y el cierre sigue el 13 oct.");
    const f05 = VIVO.fases.find((f) => f.id === "f05")!;
    const sesiones: CambioFaseCambia = {
      tipo: "fase-cambia",
      clave: claveDeCampo("f05", "sessionCount"),
      faseId: "f05",
      fase: f05.name,
      campo: "sessionCount",
      desde: f05.sessionCount,
      a: (f05.sessionCount ?? 0) + 2,
    };
    expect(mensajeDe(VIVO, { ...BORRADOR, cambios: [sesiones] }).lineas[0]).toBe("El cierre sigue el 13 oct.");
  });
});

describe("L4 · la fuente del motivo (D9) y lo que nunca se copia", () => {
  const F: FuentesDeLaPropuesta = {
    instrucciones: true,
    reuniones: [
      { titulo: "Revisión de Integración", fecha: "2026-09-12T15:00:00.000Z" },
      { titulo: "CS", fecha: "2026-09-10T15:00:00.000Z" },
    ],
    notas: ["Acta del piloto"],
  };

  it("⭐ «Instrucciones del CSE» solo con instrucciones; una reunión o una nota solo si el motivo las nombra enteras", () => {
    /* Las ediciones que la ponen en rojo: dar el chip de las instrucciones sin instrucciones, dar el de una reunión que
       no estaba en la corrida, o calzar «CS» dentro de «CSE» (sin límites de palabra). */
    const inst = "Instrucciones del CSE: «Fase K dura 5 semanas (no 3)».";
    expect(fuenteDelMotivo(inst, F)).toEqual({ tipo: "instrucciones", texto: "Instrucciones adicionales" });
    expect(fuenteDelMotivo(inst, { ...F, instrucciones: false })).toBeNull();
    expect(fuenteDelMotivo(inst, null)).toBeNull();
    expect(fuenteDelMotivo("Lo pidió el cliente en la revision de integracion.", F)).toEqual({
      tipo: "reunion",
      texto: "Reunión «Revisión de Integración» · 12 sep",
    });
    expect(fuenteDelMotivo("Lo pidió el cliente en la revisión de integración.", { ...F, reuniones: [] })).toBeNull();
    expect(fuenteDelMotivo("Sale del acta del piloto.", F)).toEqual({ tipo: "nota", texto: "Nota «Acta del piloto»" });
    expect(fuenteDelMotivo("Las actas del piloto lo piden.", F), "«actas» no es «acta»").toBeNull();
  });

  it("⭐ el motivo nunca entra al mensaje: un «99 semanas» de la IA no aparece en ninguna línea", () => {
    /* La edición que la pone en rojo: copiar el motivo (o sus números) a las líneas o a «Más». */
    const cambios = BORRADOR.cambios.map((c) =>
      c.tipo === "fase-cambia" ? { ...c, motivo: "Instrucciones del CSE: «Fase K dura 99 semanas»." } : c,
    );
    const m = mensajeDe(VIVO, { ...BORRADOR, cambios });
    expect(todo(m).join(" ")).not.toContain("99");
    expect(m.fuentes).toEqual([{ tipo: "instrucciones", texto: "Instrucciones adicionales" }]);
    const sinInstrucciones = mensajeDe(VIVO, { ...BORRADOR, cambios }, { referencias: { ...REFERENCIAS, fuentes: { ...SIN_MATERIAL, instrucciones: false } } });
    expect(sinInstrucciones.fuentes).toEqual([]);
  });
});

describe("L4 · tuteo y largo", () => {
  const LARGO = (letra: string) => `Fase ${letra} con un nombre bien largo`.padEnd(40, "x");

  it("⭐ ninguna línea en voseo y cada una ≤ 140 caracteres, con el fixture y con nombres de fase de 40 caracteres", () => {
    /* La edición que la pone en rojo: un texto en voseo, o una línea que no entra (los nombres sin cortar). */
    const vivo: Vivo = { ...VIVO, fases: VIVO.fases.map((f, i) => ({ ...f, name: LARGO(String(i + 1)) })) };
    const b: Borrador = {
      ...BORRADOR,
      cambios: BORRADOR.cambios.map((c) =>
        c.tipo === "fase-nueva" ? { ...c, fase: { ...c.fase, name: LARGO("nueva") } } : c.tipo === "fase-cambia" ? { ...c, fase: LARGO("12") } : c,
      ),
    };
    expect(LARGO("12")).toHaveLength(40);
    const casos = [
      M,
      mensajeDe(vivo, b),
      mensajeDe(vivo, b, { cierreFijado: "2026-12-15" }),
      mensajeDe(vivo, { ...b, pedido: "primera" }),
      mensajeDeLaPropuesta(entrada({ cierreFijado: "2026-12-15", referencias: { ...REFERENCIAS, prometido: { ...FIXTURE.prometido, cierreISO: "2026-11-24" } } })),
    ];
    for (const m of casos) {
      expect(m.lineas.length).toBeLessThanOrEqual(5);
      for (const l of m.lineas) expect(l.length, `«${l}»`).toBeLessThanOrEqual(TOPE_DE_LA_LINEA);
      for (const l of [m.titulo, ...todo(m)]) expect(l, `voseo en «${l}»`).not.toMatch(VOSEO);
    }
    // Con nombres largos, la causa sigue en la línea del cierre (cortada), no se pierde.
    const largo = mensajeDe(vivo, b).lineas[0];
    expect(largo).toMatch(/^El cierre pasa del 13 oct al 10 nov \(\+4 semanas\): /);
    expect(largo).toContain(`«${cortarNombre(LARGO("12"))}»`);
    expect(cortarNombre(LARGO("12")).length).toBeLessThanOrEqual(28);
    expect(cortarNombre(LARGO("12"))).toMatch(/…$/);
  });

  it("la causa del cierre en palabras", () => {
    const k = BORRADOR.cambios.find((c) => c.clave === claveDeCampo(FASE_QUE_SE_ALARGA, "durationWeeks"))!;
    expect(etiquetaLargaDelCambio(k as CambioFaseCambia, VIVO)).toBe("«Fase K» pasa de 3 a 5 semanas");
    expect(etiquetaLargaDelCambio({ tipo: "ancla", clave: "ancla", desde: "2026-05-19", a: "2026-06-02" }, VIVO)).toBe(
      "el arranque pasa al 2 jun",
    );
  });

  it("humo: `resumir` marcado + entero + la vista + el mensaje, mediana de 5 bajo 250 ms", () => {
    const tiempos: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t0 = performance.now();
      const r = resumir(VIVO, BORRADOR, [], LISTAS);
      const entera = resumir(VIVO, BORRADOR, [], LISTAS);
      vistaDeLaPropuesta(VIVO, BORRADOR, r, HOY);
      mensajeDeLaPropuesta(entrada({ r, entera }));
      tiempos.push(performance.now() - t0);
    }
    tiempos.sort((a, b) => a - b);
    expect(tiempos[2]).toBeLessThan(250);
  });
});
