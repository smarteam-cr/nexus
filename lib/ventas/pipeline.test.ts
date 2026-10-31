/**
 * Las reglas de Ventas › Pipeline, con los casos de verdad: negocio con tarea, con reunión, sin nada, y compromiso vencido
 * o que nunca se volvió tarea. La regla del siguiente paso es la de lib/ventas/negocios.ts: acá no se escribe otra.
 */
import { describe, expect, it } from "vitest";
import type { SiguientePasoVisto } from "@/lib/siguiente-paso/reglas";
import {
  compromisosDeLosNegocios,
  esReunionPorAgendar,
  estadoDelCompromiso,
  marcaDelPaso,
  negociosDelPipeline,
  ordenarCompromisos,
  ordenarNegocios,
  pasosParaLaRegla,
  primeraReunionDeCadaEmpresa,
  sinCumplirPorEmpresa,
  textoDelCompromiso,
  type TareaDelCompromiso,
} from "./pipeline";

const HOY = "2026-10-30";
const AHORA = new Date("2026-10-30T18:00:00Z");
const hace = (dias: number) => new Date(+AHORA - dias * 86_400_000);

const paso = (fecha: string | null, extra: Partial<SiguientePasoVisto> = {}): SiguientePasoVisto => ({
  id: `t-${fecha}`,
  objeto: "negocio",
  objetoId: "n1",
  equipo: "ventas",
  que: "Enviar la propuesta",
  fecha,
  responsableEmail: null,
  responsableNombre: null,
  escritoPor: "nexus",
  escritoPorNombre: null,
  fuente: "persona",
  creadoAt: AHORA.toISOString(),
  hubspotEstado: "pendiente",
  hubspotError: null,
  ...extra,
});

describe("sin siguiente paso", () => {
  const reunion = { inicio: "2026-11-02T15:00:00Z", titulo: "Demo con Wherex" };

  it("con tarea abierta con fecha, tiene", () => {
    expect(marcaDelPaso({ pasos: [paso("2026-11-03")], reunion: null }, HOY)).toBeNull();
  });
  it("con una reunión agendada, tiene", () => {
    expect(marcaDelPaso({ pasos: [], reunion }, HOY)).toBeNull();
  });
  it("sin nada, se marca", () => {
    expect(marcaDelPaso({ pasos: [], reunion: null }, HOY)).toBe("sin-siguiente-paso");
  });
  it("con la tarea vencida y sin reunión, se marca que venció", () => {
    expect(marcaDelPaso({ pasos: [paso("2026-10-20")], reunion: null }, HOY)).toBe("siguiente-paso-vencido");
  });
  it("con la tarea vencida y una reunión, tiene: la reunión es el siguiente paso", () => {
    expect(marcaDelPaso({ pasos: [paso("2026-10-20")], reunion }, HOY)).toBeNull();
  });
  it("el paso de otro equipo no cuenta como el de Ventas", () => {
    expect(marcaDelPaso({ pasos: [paso("2026-11-03", { equipo: "cs" })], reunion: null }, HOY)).toBe("sin-siguiente-paso");
  });
});

describe("la tarea de la cuenta cuenta para sus negocios", () => {
  const deLaCuenta = paso("2026-11-03", { id: "cuenta", objeto: "empresa" });

  it("sin tarea en el negocio, vale la de la empresa", () => {
    expect(marcaDelPaso({ pasos: pasosParaLaRegla([], [deLaCuenta], HOY) }, HOY)).toBeNull();
  });
  it("la del negocio manda si está vigente", () => {
    const propia = paso("2026-11-10", { id: "propia" });
    expect(pasosParaLaRegla([propia], [deLaCuenta], HOY)[0]!.id).toBe("propia");
  });
  it("con la del negocio vencida, vale la de la empresa", () => {
    expect(pasosParaLaRegla([paso("2026-10-20")], [deLaCuenta], HOY)[0]!.id).toBe("cuenta");
  });
  it("con las dos vencidas, queda la del negocio y se marca", () => {
    const pasos = pasosParaLaRegla([paso("2026-10-20", { id: "propia" })], [paso("2026-10-21", { objeto: "empresa" })], HOY);
    expect(pasos[0]!.id).toBe("propia");
    expect(marcaDelPaso({ pasos }, HOY)).toBe("siguiente-paso-vencido");
  });
  it("sin tarea en ningún lado no inventa una", () => {
    expect(pasosParaLaRegla([], [], HOY)).toEqual([]);
  });
});

describe("la tabla", () => {
  it("lo que no tiene siguiente paso va primero, y dentro el cierre más cercano", () => {
    const orden = ordenarNegocios([
      { id: "a", marca: null, fechaCierre: "2026-11-01", monto: 100 },
      { id: "b", marca: "sin-siguiente-paso" as const, fechaCierre: "2026-12-01", monto: 100 },
      { id: "c", marca: "siguiente-paso-vencido" as const, fechaCierre: null, monto: 100 },
      { id: "d", marca: "sin-siguiente-paso" as const, fechaCierre: "2026-11-15", monto: 100 },
    ]);
    expect(orden.map((n) => n.id)).toEqual(["d", "b", "c", "a"]);
  });
  it("un negocio pausado no entra y se cuenta", () => {
    const r = negociosDelPipeline([{ etapa: "Pausados" }, { etapa: "Propuesta enviada" }]);
    expect(r).toEqual({ activos: [{ etapa: "Propuesta enviada" }], pausados: 1 });
  });
});

describe("los compromisos", () => {
  const tarea = (extra: Partial<TareaDelCompromiso> = {}): TareaDelCompromiso => ({
    titulo: "Enviar la propuesta actualizada a Priscilla",
    estado: "pendiente",
    lado: "smarteam",
    origen: "reunion",
    origenId: "l:abc:seg-s-1234",
    responsableEmail: "andres@smarteam.cr",
    venceEl: "2026-11-05",
    creadaAt: hace(5),
    mismaQueId: null,
    ...extra,
  });
  const nada = { ultima: null, proxima: null };
  const estado = (t: TareaDelCompromiso, r = nada as { ultima: string | null; proxima: string | null }) => estadoDelCompromiso(t, r, HOY, AHORA);

  it("su tarea venció", () => {
    const e = estado(tarea({ venceEl: "2026-10-22" }));
    expect(e).toBe("vencido");
    expect(textoDelCompromiso(e!, "2026-10-22")).toBe("Su tarea venció el 22 oct");
  });
  it("con la tarea al día, no se marca", () => {
    expect(estado(tarea())).toBe("en-tareas");
  });
  it("una propuesta que nadie decidió en 48 horas nunca se volvió tarea", () => {
    expect(estado(tarea({ estado: "propuesta", responsableEmail: null, venceEl: null, creadaAt: hace(3) }))).toBe("sin-tomar");
  });
  it("una propuesta de hoy todavía se puede tomar", () => {
    expect(estado(tarea({ estado: "propuesta", creadaAt: hace(1) }))).toBe("reciente");
  });
  it("una propuesta que venció sola nunca se volvió tarea, aunque sea nueva (el tope por persona)", () => {
    expect(estado(tarea({ estado: "vencida", creadaAt: hace(1) }))).toBe("sin-tomar");
  });
  it("«Por asignar» abierta sin dueño tampoco la tomó nadie", () => {
    expect(estado(tarea({ responsableEmail: null, venceEl: null, creadaAt: hace(3) }))).toBe("sin-tomar");
  });
  it("después de 21 días sin tomar ya es limpieza", () => {
    expect(estado(tarea({ estado: "vencida", creadaAt: hace(22) }))).toBeNull();
  });
  it("si Nexus la juntó con otra tarea, la tarea existe", () => {
    expect(estado(tarea({ estado: "vencida", mismaQueId: "t2" }))).toBeNull();
  });
  it("una decisión de una persona no se persigue", () => {
    for (const e of ["hecha", "no_se_hara", "rechazada", "fusionada"]) expect(estado(tarea({ estado: e }))).toBeNull();
  });
  it("lo que prometió el cliente, un correo o una tarea cualquiera no son compromisos de esta lista", () => {
    expect(estado(tarea({ lado: "cliente" }))).toBeNull();
    expect(estado(tarea({ origen: "correo" }))).toBeNull();
    expect(estado(tarea({ origenId: "c:12:0" }))).toBeNull();
  });
  it("una reunión prometida que ya ocurrió o está agendada no queda sin cumplir", () => {
    const prometida = tarea({ titulo: "Agendar una reunión de seguimiento con Honda", estado: "vencida", venceEl: null });
    expect(estado(prometida)).toBe("sin-tomar");
    expect(estado(prometida, { ultima: hace(1).toISOString(), proxima: null })).toBeNull();
    expect(estado(prometida, { ultima: null, proxima: "2026-11-02T15:00:00Z" })).toBeNull();
    // La reunión de donde salió no la cumple.
    expect(estado(prometida, { ultima: hace(6).toISOString(), proxima: null })).toBe("sin-tomar");
  });
  it("una tarea con dueño que venció sale aunque nombre una reunión y la empresa tenga una agendada", () => {
    const t = tarea({ titulo: "Agendar la reunión con Priscilla", venceEl: "2026-10-22" });
    expect(estado(t, { ultima: null, proxima: "2026-11-02T15:00:00Z" })).toBe("vencido");
  });
  it("una entrega que nombra una reunión no se cumple porque haya reunión", () => {
    expect(esReunionPorAgendar("Enviar la presentación comercial a Priscilla")).toBe(false);
    expect(esReunionPorAgendar("Compartir la grabación de la demo con Ana")).toBe(false);
    expect(esReunionPorAgendar("Agendar la sesión de seguimiento con Honda")).toBe(true);
    const t = tarea({ titulo: "Enviar la presentación comercial a Priscilla", estado: "vencida", venceEl: null });
    expect(estado(t, { ultima: null, proxima: "2026-11-02T15:00:00Z" })).toBe("sin-tomar");
  });
  it("lo sin cumplir va primero y dentro, lo más nuevo", () => {
    const c = (id: string, e: "vencido" | "sin-tomar" | "reciente" | "en-tareas", creadaAt: string) => ({ id, estado: e, creadaAt });
    const orden = ordenarCompromisos([c("a", "en-tareas", "2026-10-29"), c("b", "sin-tomar", "2026-10-20"), c("c", "sin-tomar", "2026-10-25"), c("d", "vencido", "2026-10-01")]);
    expect(orden.map((x) => x.id)).toEqual(["d", "c", "b", "a"]);
  });
});

describe("lo que une las piezas", () => {
  it("la primera reunión de cada empresa, entre todos los calendarios", () => {
    const r = primeraReunionDeCadaEmpresa([
      new Map([["a", { inicio: "2026-11-03T15:00:00Z", titulo: "tarde" }]]),
      new Map([
        ["a", { inicio: "2026-11-02T15:00:00Z", titulo: "antes" }],
        ["b", { inicio: "2026-11-04T15:00:00Z", titulo: "otra empresa" }],
      ]),
    ]);
    expect(r.get("a")!.titulo).toBe("antes");
    expect(r.get("b")!.titulo).toBe("otra empresa");
  });
  it("cuenta lo sin cumplir por empresa, sin juntarlas", () => {
    const r = sinCumplirPorEmpresa([
      { clientId: "a", estado: "vencido" },
      { clientId: "a", estado: "sin-tomar" },
      { clientId: "a", estado: "en-tareas" },
      { clientId: "b", estado: "reciente" },
    ]);
    expect(r.get("a")).toBe(2);
    expect(r.has("b")).toBe(false);
  });
  it("«Mis negocios» deja solo lo prometido a las empresas de esos negocios", () => {
    const compromisos = [{ clientId: "a" }, { clientId: "b" }];
    expect(compromisosDeLosNegocios(compromisos, [{ clientId: "a" }, { clientId: null }])).toEqual([{ clientId: "a" }]);
  });
});
