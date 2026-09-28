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
 * M3 (2026-09-27): con el reloj de la propuesta (`borrador.hoy`), la línea 5 dice lo que quedó sin hacer y «Más» lo
 * nombra. Los casos de arriba no traen reloj (el borrador del fixture es de antes): siguen diciendo «Atrasadas», sin
 * reescribirse.
 * M4 P4f (2026-09-27): lo que reprogramó el sistema desde hoy, en la línea 1 (una causa), en «Más» y en el aviso de la
 * semana; ni la línea 3 ni la magnitud lo cuentan.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { borradorDelFixture, FASE_QUE_SE_ALARGA, leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import {
  borradorVacio,
  claveDeCampo,
  estructuraHipotetica,
  leerBorrador,
  pideConfirmacion,
  resumir,
  type Borrador,
  type CambioFaseCambia,
  type CambioTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  atrasadas,
  cortarNombre,
  etiquetaLargaDelCambio,
  fuenteDelMotivo,
  LINEA_SIN_MATERIAL,
  mensajeDeLaPropuesta,
  nivelDeLaPropuesta,
  TITULOS_DEL_MENSAJE,
  TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER,
  TOPE_DE_LA_LINEA,
  type EntradaDelMensaje,
  type MensajeDeLaPropuesta,
} from "./mensaje-de-la-propuesta";
import type { FuentesDeLaPropuesta, ReferenciasDeLaPropuesta } from "./referencias-de-la-propuesta";
import { POLITICA_DE_ATRASOS, type PoliticaDeFasesVencidas } from "./politica-de-atrasos";
import { conLaReprogramacion, reprogramarDesdeHoy } from "./reprogramar-desde-hoy";
import { cambiosDeTareasDelDetalle, fusionarDetalle, tareasPropuestasDelDetalle } from "./tareas-del-detalle";
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

  it("⭐ revisión de L1–L7 (#8): con una reunión ELEGIDA que no le llegó a la IA (futura), la línea habla de la IA, no del CSE", () => {
    /* La edición que la pone en rojo: volver a «No elegiste reuniones ni notas». Las fuentes son lo que le LLEGÓ a la IA
       (`sourceSessionIds` = `sesionesUsadas`): la reunión de la semana que viene que el CSE eligió no está, y el texto le
       decía que no había elegido nada. */
    const elegidaFutura: FuentesDeLaPropuesta = { instrucciones: false, reuniones: [], notas: [] };
    const m = mensajeDeLaPropuesta(entrada({ referencias: { ...REFERENCIAS, fuentes: elegidaFutura } }));
    const linea = m.lineas.find((l) => l === LINEA_SIN_MATERIAL);
    expect(linea, "la línea del material no va").toBeDefined();
    expect(linea).toMatch(/^La IA no tuvo reuniones ni notas/);
    expect(linea, "culpa al CSE de no elegir").not.toMatch(/elegiste/i);
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

/**
 * M3 (2026-09-27, decisión (a) de Elías: lo que ya pasó no se reescribe). Con el reloj de la propuesta (`borrador.hoy`,
 * solo «Regenerar todo»), la línea 5 dice lo que QUEDÓ SIN HACER y que la propuesta no lo mueve, y «Más» lo nombra con la
 * acción. Sin reloj («Regenerar» de una fase, «primera», un borrador de antes), la línea de siempre: ahí R13 no corrió y
 * «no las mueve» sería falso. Los textos se eligen por `hoy.politica` (D11), nunca por la constante del interruptor.
 */
describe("M3 · lo que quedó sin hacer", () => {
  const RELOJ = { instante: HOY.toISOString(), semana: 18, politica: POLITICA_DE_ATRASOS };
  const CON_RELOJ: Borrador = { ...BORRADOR, hoy: RELOJ };
  const ACCION = "Si ya se hicieron, márcalas hechas; si faltan, muévelas a esta semana.";
  const sinHacer = (m: MensajeDeLaPropuesta) => m.lineas.find((l) => /Quedar?on sin hacer|Quedó sin hacer|caen? en semanas que ya pasaron/.test(l));

  it("⭐ la propuesta grande con reloj: N = después − las que nacen, las que nacen van aparte, y cabe en 140", () => {
    /* Las ediciones que la ponen en rojo: contar como «sin hacer» también las que nacen en el pasado (diría 67, no 9), o
       callar las que nacen (58 nuevas caen en semanas vencidas: con el reloj, eso solo pasa si alguien las movió). */
    const m = mensajeDeLaPropuesta(entrada({ borrador: CON_RELOJ }));
    const a = atrasadas(VIVO, R, HOY);
    expect(a.despues - a.nacen).toBe(9);
    const linea = sinHacer(m)!;
    expect(linea, "la línea 5 no dice lo que quedó sin hacer").toMatch(/^⚠ Quedaron sin hacer 9 tareas de semanas que ya pasaron/);
    expect(linea).toContain("58 tareas nuevas caen en semanas que ya pasaron.");
    expect(linea.length).toBeLessThanOrEqual(TOPE_DE_LA_LINEA);
    expect(m.lineas.join(" ")).not.toContain("Atrasadas");
    // Son más de 5: «Más» nombra las fases y cuántas tiene cada una, con la acción, primero.
    expect(m.detalle[0]).toBe(`Sin hacer: «Fase C» (1) · «Fase E» (2) · «Fase I» (5) · «Fase J» (1). ${ACCION}`);
  });

  it("⭐ con la fusión real (R13): nada nace en el pasado y la línea 5 dice solo lo que quedó sin hacer, con dónde", () => {
    /* La edición que la pone en rojo: mostrar «Atrasadas: hoy 59 → con la propuesta 59» con el reloj (se leía como si la
       propuesta no hiciera nada con lo atrasado, cuando lo que hace es no reescribirlo). */
    const estructura = estructuraHipotetica(VIVO, BORRADOR);
    const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({ estructura, analysisJson: FIXTURE.paso2, huellas: null, cortado: false });
    let k = 0;
    const cambios = cambiosDeTareasDelDetalle({
      estructura,
      vivo: VIVO,
      propuestas,
      borrador: BORRADOR,
      tags: [],
      nuevaClave: () => `m3-${++k}`,
      idsDesconocidos,
      respetarTerminadas: true,
      hitos: { recurrente: false, conSemanaCero: true },
      pasado: { ancla: FIXTURE.ancla, hoy: HOY },
    });
    const b = fusionarDetalle(CON_RELOJ, cambios, "run-m3");
    expect(b.hoy, "la fusión perdió el reloj").toEqual(RELOJ);
    const m = mensajeDe(VIVO, b);
    expect(atrasadas(VIVO, resumir(VIVO, b, [], LISTAS), HOY)).toEqual({ hoy: 59, despues: 59, nacen: 0 });
    expect(sinHacer(m)).toBe(
      "⚠ Quedaron sin hacer 59 tareas de semanas que ya pasaron, en «Semana 0», «Fase A» y 8 fases más: la propuesta no las mueve (están en «Más»).",
    );
  });

  /* Wherex con M4 (spec §4.1): lo único vencido que queda son 4 tareas de la «Semana 0». Un cronograma chico con los
     títulos reales: la «Semana 0» (S0–S1, ya pasó) y «Sales Hub», que arranca esta semana (S18). */
  const TITULOS = [
    "Recolección de accesos y credenciales",
    "Confirmación de sponsor y punto de contacto único",
    "Validación del alcance y redimensionamiento formal",
    "Entrega del plan de trabajo detallado",
  ];
  const t = (id: string, title: string, weekIndex: number, status = "PENDING") => ({
    id,
    title,
    weekIndex,
    notes: null,
    party: "AMBOS" as const,
    type: "TASK" as const,
    status,
    source: "AGENT",
    inicioFijado: null,
    finFijado: null,
  });
  const chico = (pendientes: string[]): Vivo => ({
    ancla: FIXTURE.ancla,
    fases: [
      {
        id: "s0",
        name: "Semana 0",
        durationWeeks: 2,
        startWeek: null,
        sessionCount: null,
        notes: null,
        activityType: null,
        status: "IN_PROGRESS",
        tareas: [t("k1", "Sesión de kickoff: equipo, roles y accesos", 0, "DONE"), ...pendientes.map((x, i) => t(`p${i}`, x, i % 2))],
      },
      { id: "sh", name: "Sales Hub", durationWeeks: 4, startWeek: 18, sessionCount: null, notes: null, activityType: null, status: "PENDING", tareas: [t("h1", "Configurar el pipeline", 0)] },
    ],
  });
  const nueva = (fase: string, title: string, weekIndex: number): CambioTareaNueva => ({
    tipo: "tarea-nueva",
    clave: `t:${fase}-${weekIndex}`,
    fase,
    tarea: { title, weekIndex, notes: null, party: "AMBOS", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
  });
  /** Un borrador con UNA tarea nueva (en el futuro), armada para las dos fases como están. */
  const conNueva = (o: Partial<Borrador> = {}): Borrador => ({
    ...BORRADOR,
    cambios: [nueva("sh", "Documentar el proceso", 2)],
    tareasArmadasPara: { s0: { nombre: "Semana 0", semanas: 2 }, sh: { nombre: "Sales Hub", semanas: 4 } },
    ...o,
  });

  it("⭐ con 5 o menos, «Más» las nombra con su fase y la acción (Wherex: 4 de la Semana 0); con 1, en singular", () => {
    /* Las ediciones que la ponen en rojo: no nombrarlas (el CSE no sabe cuáles revisar) o decir «están en «Más»» sin
       que estén. */
    const m = mensajeDe(chico(TITULOS), conNueva({ hoy: RELOJ }));
    expect(sinHacer(m)).toBe("⚠ Quedaron sin hacer 4 tareas de semanas que ya pasaron, en «Semana 0»: la propuesta no las mueve (están en «Más»).");
    expect(m.detalle[0]).toBe(`Sin hacer en «Semana 0»: ${TITULOS.map((x) => `«${x}»`).join(" · ")}. ${ACCION}`);
    const una = mensajeDe(chico(TITULOS.slice(0, 1)), conNueva({ hoy: RELOJ }));
    expect(sinHacer(una)).toBe("⚠ Quedó sin hacer 1 tarea de una semana que ya pasó, en «Semana 0»: la propuesta no la mueve.");
    expect(una.detalle[0]).toBe(`Sin hacer en «Semana 0»: «${TITULOS[0]}». Si ya se hizo, márcala hecha; si falta, muévela a esta semana.`);
    // Nada vencido: sin línea ni «Más».
    const alDia = mensajeDe(chico([]), conNueva({ hoy: RELOJ }));
    expect(sinHacer(alDia)).toBeUndefined();
    expect(alDia.detalle.join(" ")).not.toContain("Sin hacer");
  });

  it("⛔ sin el reloj («Regenerar» de una fase, «primera», un borrador de antes): «Atrasadas: hoy X → Y: N tareas nuevas caen…»", () => {
    /* La edición que la pone en rojo: mostrar la línea nueva sin `hoy` (ahí R13 no corrió: «la propuesta no las mueve»
       sería falso, porque las que nacen en el pasado sí están). */
    const deUnaFase = conNueva({ soloFase: "s0", cambios: [nueva("s0", "Relevar el proceso", 0)] });
    const m = mensajeDe(chico(TITULOS), deUnaFase);
    expect(sinHacer(m)).toBe("⚠ Atrasadas: hoy 4 → con la propuesta 5: 1 tarea nueva cae en semanas que ya pasaron.");
    expect(m.detalle.join(" ")).not.toContain("Sin hacer");
    expect(M.lineas[4], "la propuesta grande sin reloj cambió de línea").toContain("Atrasadas: hoy 59 → con la propuesta 67");
  });

  it("⛔ los textos salen de la política guardada en la propuesta, nunca del interruptor", () => {
    /* D11. La edición que la pone en rojo: importar `POLITICA_DE_ATRASOS` en el mensaje (si se voltea el valor, una
       propuesta abierta diría lo que no calculó). */
    const src = fs.readFileSync(path.join(process.cwd(), "lib/timeline/mensaje-de-la-propuesta.ts"), "utf8").replace(/\r\n/g, "\n");
    const codigo = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
    expect(codigo, "el mensaje lee el interruptor").not.toMatch(/\bPOLITICA_DE_ATRASOS\b/);
    expect(codigo).toContain("TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER[i.borrador.hoy.politica.pendientesDelPasado]");
    expect(Object.keys(TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER)).toEqual(["avisar"]);
    for (const x of Object.values(TEXTOS_DE_LO_QUE_QUEDO_SIN_HACER)) {
      for (const texto of [x.una("en «A»"), x.varias(3, "en «A»", true), x.accionUna, x.accionVarias]) expect(texto).not.toMatch(VOSEO);
    }
  });
});

/**
 * M4 P4f (2026-09-27, spec del replanteo §5.1, §5.7 y §5.11): LO QUE REPROGRAMÓ EL SISTEMA, EN EL MENSAJE. La propuesta
 * grande reprogramada desde hoy (S18) en el orden del plan (lo que decidió Elías): 8 casillas, el pin de «Fase I» y 25
 * arrastradas; sin la IA y con los cambios de fases de la IA de ayer («Fase K» de 3 a 5 y una fase nueva). Los textos
 * salen de `borrador.hoy.politica`, nunca del interruptor.
 */
describe("M4 P4f · lo que reprogramó el sistema, en el mensaje", () => {
  const vacio = () => JSON.parse(JSON.stringify(borradorVacio({ pedido: "regenerar", corrida: "run-2" }))) as Record<string, unknown>;
  /** El borrador del paso 1 del fixture (solo los cambios de fases de la IA), con sus tareas listas. */
  const delPaso1 = (): Record<string, unknown> => {
    const crudo = JSON.parse(JSON.stringify(FIXTURE.borrador)) as { cambios: Array<{ tipo: string }> } & Record<string, unknown>;
    return { ...crudo, cambios: crudo.cambios.filter((c) => !c.tipo.startsWith("tarea")), tareas: { corrida: "run-2", listas: true }, tareasArmadasPara: {} };
  };
  const reprogramar = (vivo: Vivo, guardado: Record<string, unknown>, fasesVencidas: PoliticaDeFasesVencidas = "en-el-orden-del-plan", conSemanaCero = true) => {
    const r = reprogramarDesdeHoy({ vivo, borrador: leerBorrador(guardado)!, hoy: HOY, politica: { ...POLITICA_DE_ATRASOS, fasesVencidas }, conSemanaCero })!;
    return leerBorrador(JSON.parse(JSON.stringify(conLaReprogramacion(guardado, r))))!;
  };
  const SIN_LA_IA = reprogramar(VIVO, vacio());
  const CON_LA_IA = reprogramar(VIVO, delPaso1());
  const casillasDelSistema = (b: Borrador) => b.cambios.filter((c): c is CambioFaseCambia => c.tipo === "fase-cambia" && !!c.desdeHoy && !c.fijaInicio).map((c) => c.clave);

  it("⭐ la línea 1: lo del sistema es UNA causa, la primera, con cuánto corre el cierre por sí sola si hay otras", () => {
    /* La edición que la pone en rojo: contar cada casilla del sistema como su propia causa («El cierre pasa del 13 oct
       al 5 ene (+12 semanas): «Fase A» pasa de 4 a 20 semanas, «Fase C» pasa de 2 a 18 semanas y 6 cambios más.»: el
       CSE leía 8 decisiones sueltas de la IA). */
    const sinIa = mensajeDe(VIVO, SIN_LA_IA);
    expect(sinIa.lineas[0]).toBe("El cierre pasa del 13 oct al 5 ene (+12 semanas): 8 fases se reprograman desde hoy, en el orden del plan.");
    const conIa = mensajeDe(VIVO, CON_LA_IA);
    expect(conIa.lineas[0]).toBe("El cierre pasa del 13 oct al 2 feb (+16 semanas): 8 fases se reprograman desde hoy (+12 semanas) y 2 cambios más.");
    for (const l of [sinIa.lineas[0], conIa.lineas[0]]) expect(l.length).toBeLessThanOrEqual(TOPE_DE_LA_LINEA);
    // Una sola fase marcada: por su nombre. El pin nunca es una causa.
    const soloA = mensajeDe(VIVO, SIN_LA_IA, { sin: casillasDelSistema(SIN_LA_IA).filter((k) => k !== claveDeCampo("f02", "durationWeeks")) });
    expect(soloA.lineas[0]).toMatch(/: «Fase A» se reprograma desde hoy\.$/);
    expect(sinIa.lineas[0]).not.toContain("Fase I");
  });

  it("⭐ la línea 3 no cuenta las 25 arrastradas; y con solo lo de hoy, el título no es «Cronograma casi nuevo»", () => {
    /* Las ediciones que la ponen en rojo: contar las arrastradas en `cambian` («Ajusta 25 tareas; las 46 hechas…»: nadie
       las decidió una por una), o medir lo de hoy en la magnitud (un proyecto con la mitad de las fases estiradas se
       leía «Cronograma casi nuevo» y pedía confirmación, como si la IA hubiera rehecho el plan). */
    const m = mensajeDe(VIVO, SIN_LA_IA);
    expect(m.lineas.filter((l) => /\bajusta\b|\bcambian\b/i.test(l)), "la línea 3 contó las arrastradas").toEqual([]);
    expect(nivelDeLaPropuesta(resumir(VIVO, SIN_LA_IA, [], LISTAS), VIVO, "regenerar").nivel).toBe("mediano");
    // Un proyecto chico con la mitad de sus fases empezadas y atrasadas: se estiran dos de cuatro y el plan pasa de 7 a 22.
    const t = (id: string, weekIndex: number, status = "PENDING"): TareaDelVivo => ({
      id,
      title: `Tarea ${id}`,
      weekIndex,
      notes: null,
      party: "SMARTEAM",
      type: "TASK",
      status,
      source: "AGENT",
      inicioFijado: null,
      finFijado: null,
    });
    const fase = (id: string, name: string, durationWeeks: number, status: string, tareas: TareaDelVivo[], startWeek: number | null = null): FaseViva => ({
      id,
      name,
      durationWeeks,
      startWeek,
      sessionCount: null,
      notes: null,
      activityType: null,
      status,
      tareas,
    });
    const chico: Vivo = {
      ancla: FIXTURE.ancla,
      fases: [
        fase("a", "Diseño", 2, "IN_PROGRESS", [t("a1", 0, "DONE"), t("a2", 0, "DONE"), t("a3", 1), t("a4", 1)], 0),
        fase("b", "Construcción", 2, "IN_PROGRESS", [t("b1", 0, "DONE"), t("b2", 1), t("b3", 1)]),
        fase("c", "Pruebas", 2, "PENDING", [t("c1", 0)]),
        fase("d", "Salida", 1, "PENDING", [t("d1", 0)]),
      ],
    };
    // Un Desarrollo (sin Semana 0): la primera fase es trabajo real y se reprograma.
    const b = reprogramar(chico, vacio(), "en-el-orden-del-plan", false);
    expect(casillasDelSistema(b), "el escenario").toEqual([claveDeCampo("a", "durationWeeks"), claveDeCampo("b", "durationWeeks")]);
    const r = resumir(chico, b, [], LISTAS);
    expect([r.cierreAntes.spanWeeks, r.cierreDespues.spanWeeks]).toEqual([7, 22]);
    expect(r.magnitud.esCronogramaNuevo, "lo de hoy contó en la magnitud").toBe(false);
    expect(r.magnitudDeLoMarcado.motivos).toEqual([]);
    expect(pideConfirmacion(r), "una reprogramación sola pidió confirmación").toBe(false);
    expect(mensajeDe(chico, b).titulo).not.toBe(TITULOS_DEL_MENSAJE.casiNuevo);
  });

  it("⭐ «Más» nombra las que vuelven a arrancar sin ninguna tarea marcada, primero", () => {
    /* Las ediciones que la ponen en rojo: no decirlo (Service Hub, «prácticamente finalizado» según el CSE, volvía a
       arrancar sin aviso), o nombrar también las que el CSE ya desmarcó. */
    expect(mensajeDe(VIVO, SIN_LA_IA).detalle[0]).toBe(
      "3 de las fases que se reprograman no tienen ninguna tarea marcada: «Fase D», «Fase E» y «Fase G». Si ya se hicieron, márcalas hechas y desmarca su casilla.",
    );
    const sinDyE = mensajeDe(VIVO, SIN_LA_IA, { sin: [claveDeCampo("f05", "startWeek"), claveDeCampo("f06", "startWeek")] });
    expect(sinDyE.detalle[0]).toBe("«Fase G» se reprograma y no tiene ninguna tarea marcada: si ya se hizo, márcala hecha y desmarca su casilla.");
    // Sin nada del sistema, nada de esto.
    expect(M.detalle.join(" ")).not.toContain("ninguna tarea marcada");
  });

  it("⭐ el aviso de la semana: el 26-09 (S18) no hay; el 29-09 (S19), sí", () => {
    /* La edición que la pone en rojo: no calcularlo contra la semana de hoy (salía siempre, o nunca). */
    expect(mensajeDe(VIVO, SIN_LA_IA).avisoDeLaSemana).toBeNull();
    expect(mensajeDe(VIVO, SIN_LA_IA, { hoy: new Date("2026-09-29T12:00:00-06:00") }).avisoDeLaSemana).toBe(
      "⚠ Se reprogramó desde la S18 y hoy es la S19: vuelve a generarla para que lo atrasado arranque esta semana.",
    );
    expect(M.avisoDeLaSemana, "un borrador sin reloj").toBeNull();
  });

  it("⭐ §5.10: con el cierre fijado a mano, la reprogramación no lo toca y la línea 1 dice cómo queda el plan calculado", () => {
    /* Caso borde de la spec (§5.10, 2026-09-27; Tanda K). Las ediciones que la ponen en rojo: que la variante corta cuente
       causas y no casillas (decía «: 1 cambio de fases.» por las 8 fases que reprograma el sistema: la encontró esta
       guarda), que lo del sistema salte la rama del cierre fijado (diría «El cierre pasa del 13 oct al 5 ene» como si
       aplicar moviera el 15 dic), o que la reprogramación toque otro campo que las semanas (el cierre no está en sus
       cambios ni en lo que escribe aplicar). */
    const m = mensajeDe(VIVO, SIN_LA_IA, { cierreFijado: "2026-12-15" });
    // Con la causa entera no entra en 140: la variante corta cuenta las 8 casillas del sistema, no «1 cambio» (su causa).
    expect(m.lineas[0]).toBe(
      "El cierre está fijado a mano el 15 dic y aplicar no lo cambia; el plan calculado pasa del 13 oct al 5 ene (+12 semanas): 8 cambios de fases.",
    );
    expect(m.lineas[0].length).toBeLessThanOrEqual(TOPE_DE_LA_LINEA);
    expect(SIN_LA_IA.cambios.some((c) => c.tipo === "fase-cambia" && !["durationWeeks", "startWeek"].includes(c.campo)), "lo del sistema toca otra cosa").toBe(false);
  });

  it("⭐ los textos salen de la política con que se calculó (`hoy.politica`), no del interruptor", () => {
    /* La edición que la pone en rojo: elegir los textos por una política fija (o por la constante): una propuesta
       calculada con «todo desde hoy» decía «en el orden del plan». */
    const todoDesdeHoy = reprogramar(VIVO, vacio(), "todo-desde-hoy");
    expect(mensajeDe(VIVO, todoDesdeHoy).lineas[0]).toMatch(/: 7 fases atrasadas arrancan desde hoy\.$/);
    // La misma reprogramación, leída con otra política guardada: el texto sigue a lo guardado.
    const releida: Borrador = { ...SIN_LA_IA, hoy: { ...SIN_LA_IA.hoy!, politica: { ...SIN_LA_IA.hoy!.politica, fasesVencidas: "todo-desde-hoy" } } };
    expect(mensajeDe(VIVO, releida).lineas[0]).toMatch(/: 8 fases atrasadas arrancan desde hoy\.$/);
  });
});
