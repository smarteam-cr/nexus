import { describe, expect, it } from "vitest";
import {
  decidirTrasCambioDeTexto,
  hechoUsado,
  huellaDeTexto,
  pedidoDeLaCorrida,
  planDeLimpieza,
  propuestaSinDecidir,
  tareaDecidida,
  textoCambio,
  type AnalisisGuardado,
  type HechoGuardado,
  type PedidoGuardado,
  type TareaGuardada,
} from "./analisis-ajeno";

const T0 = new Date("2026-09-30T21:04:51Z");
const despues = (ms: number) => new Date(T0.getTime() + ms);

const tarea = (p: Partial<TareaGuardada> = {}): TareaGuardada => ({
  id: "t1",
  estado: "propuesta",
  origenId: "l:lec1:linea-1",
  responsableEmail: "cse@smarteamcr.com",
  decididaAt: null,
  ...p,
});

const pedido = (p: Partial<PedidoGuardado> = {}): PedidoGuardado => ({
  id: "p1",
  estado: "PEDIDO",
  decididoAt: null,
  createdAt: despues(3_000),
  ...p,
});

const hecho = (p: Partial<HechoGuardado> = {}): HechoGuardado => ({ id: "h1", estado: "pendiente", decididoPorEmail: null, ...p });

const analisis = (p: Partial<AnalisisGuardado> = {}): AnalisisGuardado => ({
  minuta: { id: "m1", status: "DRAFT", reviewedAt: null, reviewedByEmail: null, createdAt: despues(1_000) },
  corridaAt: T0,
  tareas: [tarea()],
  pedidos: [],
  hechos: [],
  ...p,
});

describe("las tareas que dejó la lectura", () => {
  it("una propuesta de la lectura que nadie decidió", () => {
    expect(propuestaSinDecidir(tarea())).toBe(true);
    expect(tareaDecidida(tarea())).toBe(false);
  });
  it.each([
    ["usada", { estado: "pendiente", decididaAt: despues(60_000) }],
    ["descartada", { estado: "rechazada", decididaAt: despues(60_000) }],
    ["empezada", { estado: "en_curso", decididaAt: despues(60_000) }],
  ])("%s: una persona la decidió", (_, p) => expect(tareaDecidida(tarea(p))).toBe(true));
  it("vencida sola: no la decidió nadie", () => {
    expect(tareaDecidida(tarea({ estado: "vencida", decididaAt: despues(14 * 86_400_000) }))).toBe(false);
  });
  it("una tarea que creó una persona o el chat no es de la lectura", () => {
    expect(propuestaSinDecidir(tarea({ origenId: null }))).toBe(false);
    expect(tareaDecidida(tarea({ origenId: "c:turno:1", decididaAt: despues(1) }))).toBe(false);
  });
});

describe("pedidoDeLaCorrida", () => {
  it("nació segundos después de la corrida y nadie lo decidió: es de esa corrida", () => {
    expect(pedidoDeLaCorrida(pedido(), T0)).toBe(true);
  });
  it("lo creó otra reunión antes (y esta solo lo apuntó a sí misma): no", () => {
    expect(pedidoDeLaCorrida(pedido({ createdAt: new Date("2026-09-10T10:00:00Z") }), T0)).toBe(false);
  });
  it("decidido por el CSE: no se toca", () => {
    expect(pedidoDeLaCorrida(pedido({ decididoAt: despues(86_400_000), estado: "COTIZADO" }), T0)).toBe(false);
  });
});

describe("hechoUsado", () => {
  it("lo usó una persona", () => expect(hechoUsado(hecho({ estado: "usado", decididoPorEmail: "cse@smarteamcr.com" }))).toBe(true));
  it("pendiente, o lo cerró el sistema: no", () => {
    expect(hechoUsado(hecho())).toBe(false);
    expect(hechoUsado(hecho({ estado: "usado", decididoPorEmail: "sistema" }))).toBe(false);
  });
});

describe("planDeLimpieza", () => {
  it("borra la minuta en borrador y los pedidos de esa corrida, retira los hechos pendientes y cuenta las propuestas", () => {
    const plan = planDeLimpieza(
      analisis({
        tareas: [tarea({ id: "t1" }), tarea({ id: "t2", origenId: null })],
        pedidos: [pedido({ id: "p1" }), pedido({ id: "p2", createdAt: new Date("2026-09-01T00:00:00Z") })],
        hechos: [hecho({ id: "h1" }), hecho({ id: "h2", estado: "desestimado" })],
      }),
    );
    expect(plan).toMatchObject({ minutaABorrar: "m1", minutaRevisada: false, pedidosABorrar: ["p1"], hechosARetirar: ["h1"] });
    expect(plan.propuestasSinDecidir.map((t) => t.id)).toEqual(["t1"]);
  });

  it("una minuta revisada no se borra", () => {
    const plan = planDeLimpieza(analisis({ minuta: { id: "m1", status: "REVIEWED", reviewedAt: despues(1), reviewedByEmail: "x@smarteamcr.com", createdAt: T0 } }));
    expect(plan.minutaABorrar).toBeNull();
    expect(plan.minutaRevisada).toBe(true);
  });

  it("sin corrida conocida, los pedidos se miden contra la minuta", () => {
    const plan = planDeLimpieza(analisis({ corridaAt: null, pedidos: [pedido({ createdAt: despues(2_000) })] }));
    expect(plan.pedidosABorrar).toEqual(["p1"]);
  });
});

describe("decidirTrasCambioDeTexto", () => {
  it("la lectura no había dejado nada: se lee como siempre", () => {
    expect(decidirTrasCambioDeTexto(analisis({ minuta: null, tareas: [] }), { reciente: true }).accion).toBe("leer");
  });
  it("nadie tocó nada y es reciente: se rehace (el caso de «Recurrente - CAV»)", () => {
    expect(decidirTrasCambioDeTexto(analisis(), { reciente: true }).accion).toBe("rehacer");
  });
  it("minuta revisada: se avisa, no se pisa", () => {
    const a = analisis({ minuta: { id: "m1", status: "EDITED", reviewedAt: despues(1), reviewedByEmail: "x@smarteamcr.com", createdAt: T0 } });
    expect(decidirTrasCambioDeTexto(a, { reciente: true }).accion).toBe("avisar");
  });
  it("una tarea propuesta que alguien usó: se avisa", () => {
    expect(decidirTrasCambioDeTexto(analisis({ tareas: [tarea({ estado: "pendiente", decididaAt: despues(1) })] }), { reciente: true }).accion).toBe("avisar");
  });
  it("un pedido decidido o un hecho usado: se avisa", () => {
    expect(decidirTrasCambioDeTexto(analisis({ pedidos: [pedido({ estado: "CONFIRMADO", decididoAt: despues(1) })] }), { reciente: true }).accion).toBe("avisar");
    expect(decidirTrasCambioDeTexto(analisis({ hechos: [hecho({ estado: "usado", decididoPorEmail: "cse@smarteamcr.com" })] }), { reciente: true }).accion).toBe("avisar");
  });
  it("reunión vieja e intacta: nada (se rehace a mano)", () => {
    expect(decidirTrasCambioDeTexto(analisis(), { reciente: false }).accion).toBe("nada");
  });
  it("solo hechos (una reunión con notas) y nada trabajado: se rehace", () => {
    expect(decidirTrasCambioDeTexto(analisis({ minuta: null, tareas: [], hechos: [hecho()] }), { reciente: true }).accion).toBe("rehacer");
  });
});

describe("huella y cambio de texto", () => {
  it("md5 de los bytes UTF-8: lo mismo que md5(transcript) en Postgres", () => {
    // Comparado contra la base el 2026-10-05: `SELECT md5('año — Transcripción')` da exactamente esto.
    expect(huellaDeTexto("año — Transcripción")).toBe("98cb43f3d800fe87571e5685591f0a9c");
    expect(huellaDeTexto("")).toBe("d41d8cd98f00b204e9800998ecf8427e");
  });
  it("volver a leer el mismo texto no es un cambio; otro texto sí; sin texto guardado no hay con qué comparar", () => {
    const h = huellaDeTexto("Recurrente - CAV - Transcripción\n…");
    expect(textoCambio(h, "Recurrente - CAV - Transcripción\n…")).toBe(false);
    expect(textoCambio(huellaDeTexto("FACO Recurrente - Transcripción\n…"), "Recurrente - CAV - Transcripción\n…")).toBe(true);
    expect(textoCambio(null, "lo que sea")).toBe(false);
    expect(textoCambio(h, null)).toBe(false);
  });
});
