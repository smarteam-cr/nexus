/**
 * lib/timeline/tareas-del-detalle.test.ts — el paso 2 de «Regenerar todo» convertido en cambios del
 * borrador (E2a, P1). Puro: sin base, sin modelo.
 *
 * Correr: `npx vitest run lib/timeline/tareas-del-detalle.test.ts --project unit`.
 *
 * Lo que cuida (las reglas R1-R11 de lib/timeline/tareas-del-detalle.ts): qué se va y qué es nuevo,
 * que nada con avance ni escrito a mano se vaya, que las tareas se armen sobre la estructura que VIO
 * el agente (no la de ahora), las fijas de la Semana 0 sin vaivén, los pares idénticos, el tipo de
 * actividad solo-si-null, la salida cortada, y la fusión en el borrador.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { huellasDeFrontera } from "@/lib/contexto/frontera-del-cronograma";
import {
  estructuraHipotetica,
  FORMATO_BORRADOR,
  planDeAplicacion,
  type Borrador,
  type CambioFaseCambia,
  type CambioFaseNueva,
  type CambioTareaNueva,
  type FaseViva,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  activityTypePropuesto,
  cambiosDeTareasDelDetalle,
  DETAIL_ACTIVITY_TYPES,
  fusionarDetalle,
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

/** El recorrido entero: lo que devolvió el agente → los cambios de tareas. */
function cambios(
  analysisJson: unknown,
  opciones: { vivo?: Vivo; tags?: string[]; cortado?: boolean; borrador?: Borrador; huellas?: ReturnType<typeof huellasDeFrontera> | null } = {},
) {
  const { propuestas, idsDesconocidos } = tareasPropuestasDelDetalle({
    estructura: ESTRUCTURA,
    analysisJson,
    huellas: opciones.huellas ?? null,
    cortado: opciones.cortado ?? false,
  });
  return cambiosDeTareasDelDetalle({
    estructura: ESTRUCTURA,
    vivo: opciones.vivo ?? VIVO,
    propuestas,
    borrador: opciones.borrador ?? BASE,
    tags: opciones.tags ?? [],
    nuevaClave,
    idsDesconocidos,
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
    expect(r.tareasArmadasPara).toEqual({
      a: { nombre: "Kick-off", semanas: 1 },
      b: { nombre: "Diseño", semanas: 2 },
      c: { nombre: "Pruebas", semanas: 4 },
      [PILOTO.clave]: { nombre: "Piloto", semanas: 2 },
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
       volvían en cada regeneración (con otro id), y el CSE revisaba 5 tareas que no cambiaron. */
    const conFijas: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), ...FIJAS.map((t, i) => tarea(`f${i}`, t, 0, { party: "CLIENTE" }))] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { vivo: conFijas, tags: ["implementacion"] });
    expect(resumen(r, "a")).toEqual(["+Presentar el equipo@0"]);
  });

  it("la gemela: una viva «desde cero» en un proyecto que pasó a re-implementación no se va ni se duplica", () => {
    const conGemela: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) =>
        f.id === "a" ? { ...f, tareas: [...(f.tareas ?? []), tarea("g", "Proporcionar bases de datos a importar", 0)] } : f,
      ),
    };
    const r = cambios(salida([{ id: "a", tasks: [{ title: "Presentar el equipo" }] }]), { vivo: conGemela, tags: ["reimplementacion"] });
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

  it("⭐ las tareas se arman sobre la estructura que VIO el agente; el `desde` es la foto AL FUSIONAR", () => {
    /* Mientras la IA armaba (1-4 min), el CSE editó una tarea: el `desde` se toma de lo vivo al
       fusionar, así esa edición no choca con algo que el CSE no hizo después de ver la propuesta. */
    const editado: Vivo = {
      ...VIVO,
      fases: VIVO.fases.map((f) => (f.id === "b" ? { ...f, tareas: [{ ...B1, notes: "nota nueva" }, B2] } : f)),
    };
    const r = cambios(salida([{ id: "b", tasks: [{ title: "Mapear procesos de venta" }] }]), { vivo: editado });
    const seVaB1 = r.tareas.find((c) => c.tipo === "tarea-se-va" && c.tareaId === "b1")!;
    expect(seVaB1.tipo === "tarea-se-va" && seVaB1.desde.notes).toBe("nota nueva");
  });

  it("⛔ el vocabulario del tipo de actividad vive en UN lugar: analyze lo importa, no lo redeclara", () => {
    /* La edición que la pone en rojo: volver a declarar la lista en la ruta (dos vocabularios que
       divergen en silencio entre el preview viejo y el borrador). */
    const analyze = fs.readFileSync(path.join(process.cwd(), "app/api/clients/[id]/analyze/route.ts"), "utf8");
    expect(analyze.length, "la guarda no está mirando la ruta").toBeGreaterThan(50_000);
    expect(analyze).toContain('import { activityTypePropuesto } from "@/lib/timeline/tareas-del-detalle";');
    expect(analyze).not.toMatch(/const DETAIL_ACTIVITY_TYPES\s*=/);
    expect(analyze).not.toMatch(/function activityTypePropuesto\(/);
  });
});
