/**
 * lib/timeline/tareas-del-detalle.test.ts — el paso 2 de «Regenerar todo» convertido en cambios del
 * borrador (E2a, P1). Puro: sin base, sin modelo.
 *
 * Correr: `npx vitest run lib/timeline/tareas-del-detalle.test.ts --project unit`.
 *
 * Lo que cuida (las reglas R1-R11 de lib/timeline/tareas-del-detalle.ts): qué se va y qué es nuevo,
 * que nada con avance ni escrito a mano se vaya, que las tareas se armen sobre la estructura que VIO
 * el agente (no la de ahora), las fijas de la Semana 0 sin vaivén, los pares idénticos, el tipo de
 * actividad solo-si-null, la salida cortada, y la fusión en el borrador. Desde E2b: el `desde` es lo
 * que VIO el agente (D10) y el alcance de «Regenerar» de una fase (`soloFases`).
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import {
  estructuraHipotetica,
  FORMATO_BORRADOR,
  fotoDeTarea,
  planDeAplicacion,
  type Borrador,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaCambia,
  type CambioTareaNueva,
  type CambioTareaSeVa,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  activityTypePropuesto,
  cambiosDeTareasDelDetalle,
  DETAIL_ACTIVITY_TYPES,
  fusionarDetalle,
  fusionarRecalculo,
  mezclarTareasDeFases,
  tareasPropuestasDelDetalle,
} from "./tareas-del-detalle";

const tarea = (id: string, title: string, weekIndex: number, extra: Partial<TareaDelVivo> = {}): TareaDelVivo => ({
  id,
  title,
  weekIndex,
  notes: null,
  party: "SMARTEAM",
  type: "TASK",
  status: "PENDING",
  source: "AGENT",
  inicioFijado: null,
  finFijado: null,
  ...extra,
});
const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[], extra: Partial<FaseViva> = {}): FaseViva => ({
  id,
  name,
  durationWeeks,
  startWeek: null,
  sessionCount: null,
  notes: null,
  activityType: null,
  tareas,
  ...extra,
});

/** Kick-off (Semana 0) con una reunión escrita a mano y una hecha; Diseño con dos reemplazables;
 *  Pruebas con una reemplazable y una MODIFIED pendiente. */
const A1 = tarea("a1", "Reunión de arranque", 0, { type: "SESSION", source: "HUMAN" });
const A2 = tarea("a2", "Firmar el acta", 0, { status: "DONE" });
const B1 = tarea("b1", "Mapear procesos", 0);
const B2 = tarea("b2", "Definir pipeline", 1);
const C1 = tarea("c1", "Probar flujos", 2);
const C2 = tarea("c2", "Probar reportes", 1, { source: "MODIFIED" });
const VIVO: Vivo = {
  ancla: null,
  fases: [
    fase("a", "Kick-off", 1, [A1, A2], { activityType: "EXPLORACION" }),
    fase("b", "Diseño", 2, [B1, B2]),
    fase("c", "Pruebas", 3, [C1, C2]),
  ],
};
const DUR_C: CambioFaseCambia = {
  tipo: "fase-cambia",
  clave: "fase:c:durationWeeks",
  faseId: "c",
  fase: "Pruebas",
  campo: "durationWeeks",
  desde: 3,
  a: 4,
};
const PILOTO: CambioFaseNueva = {
  tipo: "fase-nueva",
  clave: "n:0000abcd",
  fase: { name: "Piloto", durationWeeks: 2, startWeek: null, sessionCount: null, notes: null, activityType: null },
  despuesDe: "c",
};
/** El borrador del paso 1 (fases) esperando las tareas del paso 2. */
const BASE: Borrador = {
  formato: FORMATO_BORRADOR,
  version: 1,
  origen: "contexto",
  observaciones: ["En el kick-off se habló de un piloto."],
  cambios: [DUR_C, PILOTO],
  pedido: "regenerar",
  tareas: { corrida: "run-2", listas: false },
  tareasArmadasPara: {},
};
const ESTRUCTURA = estructuraHipotetica(VIVO, BASE);

type TareaCruda = { title: string; weekIndex?: number; party?: string; type?: string; notes?: string; porValidar?: boolean };
const salida = (fases: Array<{ id: string; tasks: TareaCruda[]; activityType?: string }>) => ({ timelineDetail: { phases: fases } });

let contador = 0;
const nuevaClave = () => `id-${++contador}`;

/**
 * El recorrido entero: lo que devolvió el agente → los cambios de tareas. `visto`: el cronograma que
 * LEYÓ el agente (por defecto VIVO); `vivo`: el de AL FUSIONAR (por defecto, el mismo). Desde E2b
 * (D10) no son lo mismo: el `desde` sale de lo visto y el vivo dice qué sigue en la fase.
 */
function cambios(
  analysisJson: unknown,
  opciones: {
    vivo?: Vivo;
    visto?: Vivo;
    tags?: string[];
    cortado?: boolean;
    borrador?: Borrador;
    huellas?: ReturnType<typeof huellasDeFrontera> | null;
    soloFases?: ReadonlySet<string> | null;
  } = {},
) {
  const estructura = opciones.visto ? estructuraHipotetica(opciones.visto, opciones.borrador ?? BASE) : ESTRUCTURA;
  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura,
    analysisJson,
    huellas: opciones.huellas ?? null,
    cortado: opciones.cortado ?? false,
  });
  return cambiosDeTareasDelDetalle({
    estructura,
    vivo: opciones.vivo ?? VIVO,
    propuestas,
    borrador: opciones.borrador ?? BASE,
    tags: opciones.tags ?? [],
    nuevaClave,
    idsDesconocidos,
    soloFases: opciones.soloFases,
  });
}
const resumen = (r: ReturnType<typeof cambios>, faseId?: string) =>
  r.tareas
    .filter((c) => faseId === undefined || (c.tipo === "tarea-nueva" ? c.fase : c.faseId) === faseId)
    .map((c) => (c.tipo === "tarea-nueva" ? `+${c.tarea.title}@${c.tarea.weekIndex}` : `-${c.tareaId}`));

describe("1 · qué se va y qué es nuevo", () => {
  it("⭐ una fase con solo tareas hechas o escritas a mano y propuesta del agente → 0 se van, N nuevas", () => {
    /* La edición que la pone en rojo: quitar las vivas sin mirar `isKept` (se iría trabajo hecho). */
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }, { title: "Acordar la agenda", weekIndex: 0 }] }]));
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0", "+Acordar la agenda@0"]);
  });

  it("⭐ una fase sin propuesta del agente, con reemplazables → 0 cambios (sin propuesta no es «borra todo»)", () => {
    /* La edición que la pone en rojo: sacar R1 — el agente que deja en paz una fase resuelta la vaciaba. */
    const r = cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]));
    expect(resumen(r, "b")).toEqual([]);
    expect(r.tareas.every((c) => (c.tipo === "tarea-nueva" ? c.fase : c.faseId) !== "b")).toBe(true);
  });

  it("una MODIFIED pendiente se va (no tiene avance ni la escribió una persona); las que se van primero, por semana", () => {
    const r = cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]));
    expect(resumen(r, "c")).toEqual(["-c2", "-c1", "+Pruebas de aceptación@3"]);
    const seVaC1 = r.tareas.find((c) => c.tipo === "tarea-se-va" && c.tareaId === "c1")!;
    expect(seVaC1).toMatchObject({ clave: "tarea:c1:se-va", faseId: "c", desde: { title: "Probar flujos", weekIndex: 2 } });
    expect(r.tareas.find((c) => c.tipo === "tarea-nueva")!.clave).toMatch(/^t:id-\d+$/);
  });

  it("⭐ el título «⚠ [por validar]:» sale saneado y marcado; la semana se acota a la duración que VIO el agente", () => {
    /* La edición que la pone en rojo: calcular con la duración VIVA (3) en vez de la hipotética (4):
       la tarea de la semana 4 de una fase que la propuesta alarga caía en la 3. */
    const r = cambios(
      salida([{ id: "c", tasks: [{ title: "⚠ [por validar]: Validar el flujo de bajas", weekIndex: 9, porValidar: true }] }]),
    );
    const n = r.tareas.find((c): c is CambioTareaNueva => c.tipo === "tarea-nueva")!;
    expect(n.tarea).toMatchObject({ title: "Validar el flujo de bajas", needsValidation: true, motivoPorValidar: null, weekIndex: 3 });
  });

  it("DEV en una fase que no es técnica cae al tipo de la fase; las fugas salen marcadas", () => {
    const r = cambios(
      salida([
        {
          id: "c",
          activityType: "CONFIGURACION",
          tasks: [
            { title: "Conectar la API", party: "DEV" },
            { title: "Cobrar $5.000 del piloto", notes: "Cierre el 15 de octubre" },
          ],
        },
      ]),
      { huellas: huellasDeFrontera(["Reunión con el cliente sobre el piloto"]) },
    );
    const [dev, conFuga] = r.tareas.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva").map((c) => c.tarea);
    expect(dev.party).toBe("SMARTEAM");
    expect(dev.fuga).toBeNull();
    expect(conFuga.fuga).toEqual({ campo: "titulo", motivo: "trae un monto", motivoDeLaNota: "trae una fecha" });
  });

  it("una fase nueva (`n:…`) recibe sus tareas; un id que no está en la estructura se ignora y se avisa", () => {
    const r = cambios(
      salida([
        { id: PILOTO.clave, tasks: [{ title: "Piloto con un equipo" }, { title: "Medir el piloto", weekIndex: 1 }] },
        { id: "fase-que-no-existe", tasks: [{ title: "Algo" }] },
        { id: "nueva:3", tasks: [{ title: "Algo más" }] },
      ]),
    );
    expect(resumen(r, PILOTO.clave)).toEqual(["+Piloto con un equipo@0", "+Medir el piloto@1"]);
    expect(r.observaciones).toContain("La IA devolvió tareas para 2 fases que no reconoció: se ignoraron.");
    expect(resumen(r).some((x) => x.includes("Algo"))).toBe(false);
  });

  it("una fase nueva sin tareas del agente se avisa; `tareasArmadasPara` va para TODAS las fases de la estructura", () => {
    const r = cambios(salida([]));
    expect(r.tareas).toEqual([]);
    expect(r.observaciones).toEqual(["La IA no armó tareas para la fase nueva «Piloto»."]);
    /* ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan. Para saber
       cuándo una fase quedó desfasada, R8 guarda la forma COMPLETA con que se armaron sus tareas: también
       las sesiones y si es la primera (la de la Semana 0). La edición que la pone en rojo: volver a
       guardar solo nombre y semanas (quitar una fase nueva que iba primera dejaría a la que pasa a ser
       primera sin sus tareas del arranque, y un cambio de sesiones quitado no se notaría). */
    expect(r.tareasArmadasPara).toEqual({
      a: { nombre: "Kick-off", semanas: 1, sesiones: null, semanaCero: true },
      b: { nombre: "Diseño", semanas: 2, sesiones: null, semanaCero: false },
      c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false },
      [PILOTO.clave]: { nombre: "Piloto", semanas: 2, sesiones: null, semanaCero: false },
    });
    // Las sesiones salen de la estructura que vio el agente.
    const conSesiones: Vivo = { ...VIVO, fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, sessionCount: 3 } : f)) };
    expect(cambios(salida([]), { visto: conSesiones, vivo: conSesiones }).tareasArmadasPara.b).toEqual({
      nombre: "Diseño",
      semanas: 2,
      sesiones: 3,
      semanaCero: false,
    });
  });
});

describe("2 · R4b: lo idéntico no se borra y se recrea", () => {
  it("⭐ un par idéntico no emite nada; el mismo título en otra semana se va y es nueva", () => {
    /* La edición que la pone en rojo: emparejar solo por título (se perdía el cambio de semana) o no
       emparejar (cada regeneración borraba y recreaba la misma tarea con otro id). */
    const r = cambios(
      salida([
        {
          id: "b",
          tasks: [
            { title: "  mapear PROCESOS ", weekIndex: 0, party: "SMARTEAM", type: "TASK" },
            { title: "Definir pipeline", weekIndex: 0, party: "SMARTEAM", type: "TASK" },
          ],
        },
      ]),
    );
    expect(resumen(r, "b")).toEqual(["-b2", "+Definir pipeline@0"]);
  });

  it("con otras notas, otro dueño o «por validar», no son la misma tarea", () => {
    for (const cruda of [
      { title: "Mapear procesos", weekIndex: 0, notes: "con ventas" },
      { title: "Mapear procesos", weekIndex: 0, party: "CLIENTE" },
      { title: "Mapear procesos", weekIndex: 0, porValidar: true },
    ]) {
      const r = cambios(salida([{ id: "b", tasks: [cruda] }]));
      expect(resumen(r, "b"), JSON.stringify(cruda)).toEqual(["-b1", "-b2", "+Mapear procesos@0"]);
    }
  });
});

describe("3 · R7: las fijas de la Semana 0 no van y vuelven", () => {
  const FIJAS = [
    "Entregar documentación de procesos involucrados",
    "Proporcionar bases de datos a importar",
    "Entregar listado de usuarios a ingresar al CRM",
    "Asignar la lista de reproducción de HubSpot Academy al cliente",
    "Proporcionar acceso al portal de HubSpot a Smarteam",
  ];

  it("⭐ una Semana 0 quieta (sin propuesta del agente) con fijas faltantes → solo nuevas", () => {
    const r = cambios(salida([]), { tags: ["implementacion"] });
    expect(resumen(r, "a")).toEqual(FIJAS.map((t) => `+${t}@0`));
    // Sin HubSpot, ninguna.
    expect(resumen(cambios(salida([])), "a")).toEqual([]);
  });

  it("⭐ con propuesta y fijas ya cargadas (de la IA): las fijas vivas no se van ni se vuelven a proponer", () => {
    /* La edición que la pone en rojo: tratar las fijas vivas como cualquier reemplazable: se iban y
       volvían en cada regeneración (con otro id), y el CSE revisaba 5 tareas que no cambiaron.
       ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: desde D10 solo se va lo que el agente VIO.
       Las fijas estaban en el vivo pero no en la estructura, así que ya no eran reemplazables y la guarda
       dejaba de probar R7. Ahora el agente las ve (`visto`), como pasa de verdad. */
    const conFijas: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), ...FIJAS.map((t, i) => tarea(`f${i}`, t, 0, { party: "CLIENTE" }))] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), {
      vivo: conFijas,
      visto: conFijas,
      tags: ["implementacion"],
    });
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0"]);
  });

  it("⛔ una fija creada mientras la IA armaba (el agente no la vio) no se vuelve a proponer", () => {
    /* E2b P3. La edición que la pone en rojo: contar para R7 solo lo que vio el agente (se proponía
       crear otra vez lo que alguien acababa de crear). */
    const conUnaFijaNueva: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), tarea("nueva", FIJAS[0], 0, { source: "HUMAN" })] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { vivo: conUnaFijaNueva, tags: ["implementacion"] });
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0", ...FIJAS.slice(1).map((t) => `+${t}@0`)]);
  });

  it("la gemela: una viva «desde cero» en un proyecto que pasó a re-implementación no se va ni se duplica", () => {
    /* ⚠ ACTUALIZADA en E2b P3 (2026-09-25), con esta razón: la misma de arriba (D10); el agente ve la
       gemela (`visto`), así sigue siendo una reemplazable que R7 conserva. */
    const conGemela: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), tarea("g", "Proporcionar bases de datos a importar", 0)] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), {
      vivo: conGemela,
      visto: conGemela,
      tags: ["reimplementacion"],
    });
    const a = resumen(r, "a");
    expect(a).not.toContain("-g");
    expect(a.some((x) => x.includes("Revisar y limpiar la base de datos existente"))).toBe(false);
    expect(a).toEqual([
      "+Presentar el equipo@0",
      ...FIJAS.filter((t) => t !== "Proporcionar bases de datos a importar").map((t) => `+${t}@0`),
    ]);
  });

  it("la fija por validar (tipo sin definir) lleva su motivo; las fijas van al final de su fase", () => {
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { tags: ["sales_hub"] });
    const deA = r.tareas.filter((c): c is CambioTareaNueva => c.tipo === "tarea-nueva" && c.fase === "a");
    expect(deA[0].tarea.title).toBe("Presentar el equipo");
    const bd = deA.find((c) => c.tarea.title === "Proporcionar bases de datos a importar")!;
    expect(bd.tarea).toMatchObject({ needsValidation: true, party: "CLIENTE", type: "TASK", weekIndex: 0 });
    expect(bd.tarea.motivoPorValidar).toContain("no dice si es implementación");
  });
});

describe("4 · R6 el tipo de actividad, R10 la salida cortada", () => {
  it("⭐ el tipo propuesto solo entra si la fase no tiene uno (el elegido a mano manda)", () => {
    /* La edición que la pone en rojo: proponer el tipo aunque la fase ya tenga uno: le pisaba al CSE
       el tipo que eligió. */
    const r = cambios(
      salida([
        { id: "a", activityType: "ADOPCION", tasks: [{ title: "X" }] },
        { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Y" }] },
        { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [{ title: "Z" }] },
        { id: "c", activityType: "INVENTADO", tasks: [{ title: "W" }] },
      ]),
    );
    expect(r.tipos).toEqual([
      { tipo: "fase-cambia", clave: "fase:b:activityType", faseId: "b", fase: "Diseño", campo: "activityType", desde: null, a: "PLANIFICACION" },
    ]);
    expect(r.tiposDeNuevas).toEqual({ [PILOTO.clave]: "SEGUIMIENTO" });
    // Si el borrador ya trae un cambio de tipo de esa fase, no se suma otro.
    const conTipo: Borrador = {
      ...BASE,
      cambios: [...BASE.cambios, { ...DUR_C, clave: "fase:b:activityType", faseId: "b", fase: "Diseño", campo: "activityType", desde: null, a: "ADOPCION" }],
    };
    expect(cambios(salida([{ id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Y" }] }]), { borrador: conTipo }).tipos).toEqual([]);
    expect(DETAIL_ACTIVITY_TYPES).toContain("PLANIFICACION");
    expect(activityTypePropuesto({ activityType: "INVENTADO" })).toBeNull();
    expect(activityTypePropuesto(undefined)).toBeNull();
  });

  it("⭐ con la salida cortada, la ÚLTIMA fase no genera nada y se avisa", () => {
    /* La edición que la pone en rojo: usar la última fase de un JSON reparado: sus tareas llegan a
       medias y las que faltan se irían como si el agente las hubiera sacado. */
    const json = salida([
      { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de acep" }] },
    ]);
    const r = cambios(json, { cortado: true });
    expect(resumen(r, "c")).toEqual([]);
    expect(resumen(r, "b")).toEqual(["-b1", "-b2", "+Mapear procesos de venta@0"]);
    expect(r.observaciones).toContain(
      "La IA se cortó antes de terminar: las tareas de «Pruebas» y de las fases que no alcanzó a armar quedan como están.",
    );
    expect(resumen(cambios(json, { cortado: false }), "c")).toEqual(["-c2", "-c1", "+Pruebas de acep@0"]);
  });
});

describe("5 · la fusión en el borrador", () => {
  it("⭐ estructura + tipos + tareas, las tareas LISTAS con su corrida, la versión sube, y el plan aplica todo", () => {
    const json = salida([
      { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
      { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [{ title: "Piloto con un equipo" }] },
    ]);
    // Un borrador que ya traía tareas de una fusión anterior: se reemplazan, no se suman.
    const conViejas: Borrador = {
      ...BASE,
      cambios: [...BASE.cambios, { tipo: "tarea-se-va", clave: "tarea:a1:se-va", tareaId: "a1", faseId: "a", desde: { title: "x", weekIndex: 0, notes: null, party: null, type: null, inicioFijado: null, finFijado: null } }],
    };
    const r = cambios(json);
    const b = fusionarDetalle(conViejas, r, "run-2");
    expect(b.version).toBe(2);
    expect(b.tareas).toEqual({ corrida: "run-2", listas: true });
    expect(b.pedido).toBe("regenerar");
    expect(b.cambios.slice(0, 3).map((c) => c.clave)).toEqual(["fase:c:durationWeeks", PILOTO.clave, "fase:b:activityType"]);
    expect(b.cambios.some((c) => c.clave === "tarea:a1:se-va")).toBe(false);
    expect((b.cambios[1] as CambioFaseNueva).fase.activityType, "el tipo va en la fase nueva").toBe("SEGUIMIENTO");
    expect(b.tareasArmadasPara).toEqual(r.tareasArmadasPara);
    expect(b.observaciones[0]).toBe("En el kick-off se habló de un piloto.");
    expect(b.desconocidos).toBeUndefined();

    // Sobre lo vivo de ahora, todo lo que se armó se puede aplicar tal cual.
    const plan = planDeAplicacion(VIVO, b, [], { tareas: "listas" });
    expect(plan.choques).toBe(0);
    expect(plan.items.every((it) => it.estado === "aplica")).toBe(true);
    expect(plan.escrituras.tareas.seVan).toEqual(["b1", "b2", "c1", "c2"]);
    expect(plan.escrituras.tareas.nuevas.map((n) => [n.fase, n.tarea.title])).toEqual([
      [{ tipo: "existente", id: "b" }, "Mapear procesos de venta"],
      [{ tipo: "existente", id: "c" }, "Pruebas de aceptación"],
      [{ tipo: "nueva", clave: PILOTO.clave }, "Piloto con un equipo"],
    ]);
  });

  it("⭐ D10 · el `desde` es lo que VIO el agente: una tarea editada mientras la IA armaba choca y queda fuera", () => {
    /* ⚠ REESCRITA en E2b P3 (2026-09-25), con esta razón: pedía que el `desde` fuera la foto AL FUSIONAR.
       El plan (§1.1) pide fijarlo «contra la misma foto que leyó quien lo produjo»: con la foto de al
       fusionar, una edición hecha mientras la IA armaba (1-4 min) no chocaba y «Aplicar todo» la
       borraba. E2b saca el bloqueo de la espera, así que editar en ese rato es lo normal.
       La edición que la pone en rojo: volver a tomar el `desde` (o lo que se va) de `viva?.tareas`. */
    const editado: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, tareas: [{ ...B1, notes: "nota nueva" }, B2] } : f)),
    };
    const r = cambios(salida([{ id: "b", tasks: [{ title: "Mapear procesos de venta" }] }]), { vivo: editado });
    const seVaB1 = r.tareas.find((c) => c.tipo === "tarea-se-va" && c.tareaId === "b1")!;
    expect(seVaB1.tipo === "tarea-se-va" && seVaB1.desde.notes, "el `desde` salió de lo vivo al fusionar").toBeNull();
    // Contra lo vivo, esa tarea choca (queda como la dejó el CSE); la otra se va.
    const plan = planDeAplicacion(editado, fusionarDetalle(BASE, r, "run-2"), [], { tareas: "listas" });
    const item = plan.items.find((it) => it.cambio.clave === "tarea:b1:se-va")!;
    expect(item.estado).toBe("choque");
    /* ⚠ ACTUALIZADA en la revisión de E2b (2026-09-25), con esta razón: decía «La editaste a mano
       después de la propuesta», y en este caso se editó mientras la IA armaba, cuando todavía no había
       propuesta en pantalla. El ⚠ cuenta lo que pasó en los dos casos. La edición que la pone en rojo:
       volver a un texto que ubique la edición «después de la propuesta». */
    expect(item.choque).toBe("Se editó a mano después de que la IA la leyó: queda como está.");
    expect(item.choque, "el ⚠ ubica la edición después de una propuesta que todavía no existía").not.toMatch(/después de la propuesta/);
    expect(plan.escrituras.tareas.seVan).toEqual(["b2"]);
  });

  it("⛔ D10 · iniciada, creada o mudada mientras la IA armaba: no se va", () => {
    /* E2b P3. Las ediciones que la ponen en rojo: mirar `isKept` en lo visto (una tarea iniciada en ese
       rato se iría), tomar lo que se va de lo vivo (se iría una recién creada) o de lo visto sin mirar
       si sigue en la fase (se iría una mudada). */
    const json = salida([
      { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
      { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
    ]);
    const B3 = tarea("b3", "Creada mientras la IA armaba", 1);
    const conCambios: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "b"
          ? { ...f, tareas: [{ ...B2, status: "IN_PROGRESS" }, B3] } // B2 iniciada, B3 creada, B1 se mudó a «Pruebas»
          : f.id === "c"
            ? { ...f, tareas: [C1, C2, B1] }
            : f,
      ),
    };
    const r = cambios(json, { vivo: conCambios });
    expect(resumen(r, "b")).toEqual(["+Mapear procesos de venta@0"]);
    expect(resumen(r, "c"), "la mudada se va desde su fase nueva (el agente no la vio ahí)").toEqual([
      "-c2",
      "-c1",
      "+Pruebas de aceptación@3",
    ]);
  });

  it("⛔ el vocabulario del tipo de actividad vive en UN lugar: analyze no lo redeclara", () => {
    /* La edición que la pone en rojo: volver a declarar la lista en la ruta (dos vocabularios que
       divergen en silencio entre la ruta y el borrador).
       ⚠ ACTUALIZADA en E2b P5a (2026-09-25), con esta razón: pedía también que analyze IMPORTARA
       `activityTypePropuesto`. Lo usaban solo las vistas previas, que se borraron: el tipo lo propone
       el borrador (R6), acá mismo. Lo que sigue valiendo es que la ruta no tenga un vocabulario propio. */
    const analyze = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"), "utf8");
    expect(analyze.length, "la guarda no está mirando la ruta").toBeGreaterThan(50_000);
    expect(analyze).not.toMatch(/const DETAIL_ACTIVITY_TYPES\s*=/);
    expect(analyze).not.toMatch(/function activityTypePropuesto\(/);
  });
});

describe("6 · el alcance de «Regenerar» de una fase (E2b, `soloFases`)", () => {
  /* El modelo recibe el ALCANCE en el prompt, pero puede no respetarlo: lo que devuelva para otras
     fases no entra. La edición que pone en rojo a todo el bloque: sacar el `continue` del alcance (o
     ponerlo después de R8, R6 o R7). */
  const TODO = salida([
    { id: "a", activityType: "ADOPCION", tasks: [{ title: "Presentar el equipo" }] },
    { id: "b", activityType: "PLANIFICACION", tasks: [{ title: "Mapear procesos de venta" }] },
    { id: "c", activityType: "CONFIGURACION", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
    { id: PILOTO.clave, activityType: "SEGUIMIENTO", tasks: [] },
  ]);

  it("⭐ otra fase no emite nada: ni tareas, ni tipo, ni avisos", () => {
    const r = cambios(TODO, { soloFases: new Set(["c"]) });
    expect(resumen(r)).toEqual(["-c2", "-c1", "+Pruebas de aceptación@3"]);
    expect(r.observaciones, "avisó de una fase fuera del alcance").toEqual([]);
    expect(r.tiposDeNuevas).toEqual({});
  });

  it("⭐ R6: el tipo solo en la fase pedida", () => {
    expect(cambios(TODO, { soloFases: new Set(["c"]) }).tipos.map((t) => t.faseId)).toEqual(["c"]);
    expect(cambios(TODO, { soloFases: new Set(["b"]) }).tipos.map((t) => t.faseId)).toEqual(["b"]);
    // Sin alcance, las dos (control: el mismo JSON).
    expect(cambios(TODO).tipos.map((t) => t.faseId)).toEqual(["b", "c"]);
  });

  it("⭐ R7: las fijas de la Semana 0 solo si la pedida ES la del arranque", () => {
    const deOtra = cambios(TODO, { soloFases: new Set(["b"]), tags: ["implementacion"] });
    expect(resumen(deOtra, "a"), "sembró la Semana 0 al regenerar otra fase").toEqual([]);
    const delArranque = cambios(TODO, { soloFases: new Set(["a"]), tags: ["implementacion"] });
    expect(resumen(delArranque, "a")).toHaveLength(6);
    expect(resumen(delArranque).every((x) => resumen(delArranque, "a").includes(x))).toBe(true);
  });

  it("R8: `tareasArmadasPara` trae solo la fase pedida", () => {
    // ⚠ ACTUALIZADA en E2c P3 (2026-09-25), con esta razón: quitar un cambio de fase ya no deja sus tareas fuera: se recalculan (R8 guarda la forma completa).
    expect(cambios(TODO, { soloFases: new Set(["c"]) }).tareasArmadasPara).toEqual({
      c: { nombre: "Pruebas", semanas: 4, sesiones: null, semanaCero: false },
    });
    // null o ausente = todo el cronograma, como siempre.
    expect(Object.keys(cambios(TODO, { soloFases: null }).tareasArmadasPara)).toEqual(["a", "b", "c", PILOTO.clave]);
  });

  it("la fusión conserva `soloFase`; sin él, no aparece", () => {
    const r = cambios(TODO, { soloFases: new Set(["c"]) });
    expect(fusionarDetalle({ ...BASE, soloFase: "c" }, r, "run-2").soloFase).toBe("c");
    expect("soloFase" in fusionarDetalle(BASE, r, "run-2")).toBe(false);
  });
});

describe("7 · E3: lo que dictó el chat sobrevive a las fusiones de la IA", () => {
  const DEL_CHAT_SE_VA: CambioTareaSeVa = {
    tipo: "tarea-se-va",
    clave: "tarea:b1:se-va",
    tareaId: "b1",
    faseId: "b",
    desde: fotoDeTarea(B1),
    porChat: true,
  };
  const DEL_CHAT_CAMBIA: CambioTareaCambia = {
    tipo: "tarea-cambia",
    clave: "tarea:c1:cambia",
    tareaId: "c1",
    faseId: "c",
    desde: fotoDeTarea(C1),
    a: { title: "Probar los flujos de venta" },
    porChat: true,
  };
  const DEL_CHAT_NUEVA: CambioTareaNueva = {
    tipo: "tarea-nueva",
    clave: "t:del-chat",
    fase: "c",
    tarea: { title: "Revisión conjunta", weekIndex: 1, notes: null, party: null, type: null, needsValidation: false, motivoPorValidar: null, fuga: null },
    porChat: true,
  };
  const DE_LA_IA_ANTES: CambioTareaNueva = { ...DEL_CHAT_NUEVA, clave: "t:ia-vieja", porChat: undefined };
  const CON_CHAT: Borrador = {
    ...BASE,
    cambios: [...BASE.cambios, DE_LA_IA_ANTES, DEL_CHAT_SE_VA, DEL_CHAT_CAMBIA, DEL_CHAT_NUEVA],
    excluidos: ["tarea:b2:se-va"],
    ajustadasPorElChat: { c: { nombre: "Pruebas", semanas: 5 }, otra: { nombre: "Otra", semanas: 1 } },
  };

  it("⭐ la fusión conserva lo del chat, no reemplaza las tareas que tocó y borra la forma ajustada de lo que rearma", () => {
    /* La edición que la pone en rojo: volver al `filter(!esCambioDeTarea)` (lo que dictó el chat se
       perdería con cada fusión), reemplazar una tarea que el chat quita o cambia (dos cambios de la misma
       tarea, con la misma clave), o dejar la forma ajustada de una fase que se volvió a armar (D9). */
    const r = cambios(
      salida([
        { id: "b", tasks: [{ title: "Mapear procesos de venta" }] },
        { id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] },
      ]),
      { borrador: CON_CHAT },
    );
    // R2: la IA no propone quitar lo que el chat quita (b1) o cambia (c1); sí lo que no tocó.
    expect(r.tareas.filter((c) => c.tipo === "tarea-se-va").map((c) => (c as CambioTareaSeVa).tareaId)).toEqual(["b2", "c2"]);
    const b = fusionarDetalle(CON_CHAT, r, "run-2");
    const claves = b.cambios.map((c) => c.clave);
    expect(claves.slice(0, 5), "lo del chat no quedó detrás de la estructura").toEqual([
      "fase:c:durationWeeks",
      PILOTO.clave,
      "tarea:b1:se-va",
      "tarea:c1:cambia",
      "t:del-chat",
    ]);
    expect(claves, "sobrevivió una tarea de la IA de antes").not.toContain("t:ia-vieja");
    expect(new Set(claves).size, "dos cambios con la misma clave").toBe(claves.length);
    expect(b.excluidos).toEqual(["tarea:b2:se-va"]);
    expect(b.ajustadasPorElChat, "la fase rearmada conservó la forma del chat").toEqual({ otra: { nombre: "Otra", semanas: 1 } });
  });

  it("el recálculo reemplaza solo las tareas de la IA de sus fases, y la fase recalculada pierde su forma ajustada", () => {
    /* La edición que la pone en rojo: mezclar sin mirar `porChat` (el recálculo de «Pruebas» se llevaría
       lo que el chat dictó en ella). */
    const recalculadas: CambioTareaNueva[] = [{ ...DEL_CHAT_NUEVA, clave: "t:ia-nueva", porChat: undefined, tarea: { ...DEL_CHAT_NUEVA.tarea, title: "Pruebas guiadas" } }];
    const mezcla = mezclarTareasDeFases(CON_CHAT.cambios, recalculadas, new Set(["c"]));
    expect(mezcla.map((c) => c.clave)).toEqual([...BASE.cambios.map((c) => c.clave), "t:ia-nueva", "tarea:b1:se-va", "tarea:c1:cambia", "t:del-chat"]);
    const b = fusionarRecalculo(CON_CHAT, {
      tareas: recalculadas,
      armadas: { c: { nombre: "Pruebas", semanas: 3 } },
      escritas: ["c"],
      fallidas: [],
      motivo: null,
      observaciones: [],
    });
    expect(b.ajustadasPorElChat).toEqual({ otra: { nombre: "Otra", semanas: 1 } });
    expect(b.excluidos).toEqual(["tarea:b2:se-va"]);
  });

  it("⛔ lo que el chat retocó en una tarea nueva de la IA sobrevive a las dos fusiones, como lo del chat", () => {
    /* Revisión de E3 (#2). El chat le cambió el título (quedó `retocada`, no `porChat`) y dijo «quedó en la
       propuesta». La edición que la pone en rojo: conservar solo lo `porChat` (el recálculo de su fase, o
       una vuelta del paso 2, la reemplazaría por una nueva de la IA y el cambio se perdería sin aviso). */
    const RETOCADA: CambioTareaNueva = {
      ...DE_LA_IA_ANTES,
      clave: "t:ia-retocada",
      tarea: { ...DE_LA_IA_ANTES.tarea, title: "Revisión conjunta con el cliente" },
      retocada: true,
    };
    const conRetocada: Borrador = { ...CON_CHAT, cambios: [...BASE.cambios, DE_LA_IA_ANTES, RETOCADA, DEL_CHAT_NUEVA] };
    const recalculadas: CambioTareaNueva[] = [{ ...DE_LA_IA_ANTES, clave: "t:ia-nueva", tarea: { ...DE_LA_IA_ANTES.tarea, title: "Pruebas guiadas" } }];
    const mezcla = mezclarTareasDeFases(conRetocada.cambios, recalculadas, new Set(["c"]));
    expect(mezcla.map((c) => c.clave), "el recálculo se llevó la retocada").toEqual([
      ...BASE.cambios.map((c) => c.clave),
      "t:ia-nueva",
      "t:ia-retocada",
      "t:del-chat",
    ]);
    expect(mezcla.find((c) => c.clave === RETOCADA.clave)).toEqual(RETOCADA);

    const b = fusionarDetalle(conRetocada, cambios(salida([{ id: "c", tasks: [{ title: "Pruebas de aceptación", weekIndex: 3 }] }]), { borrador: conRetocada }), "run-2");
    const claves = b.cambios.map((c) => c.clave);
    expect(claves.slice(0, 4), "el paso 2 se llevó la retocada").toEqual(["fase:c:durationWeeks", PILOTO.clave, "t:ia-retocada", "t:del-chat"]);
    expect(claves, "sobrevivió una tarea de la IA de antes").not.toContain("t:ia-vieja");
  });
});
