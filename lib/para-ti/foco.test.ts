import { describe, expect, it } from "vitest";
import { armarFoco, CARTERA_SIN_SIGUIENTE_PASO, cuantosSeVen, MAX_POR_BLOQUE, modoDelFoco, OTRAS_CUENTAS } from "./foco";
import { armarParaTi, cuentaDelMenu } from "./armar";
import { cosasDelCorreo } from "@/lib/mi-dia/correo";
import { SIN_CSE } from "@/lib/mi-dia/servicio";
import type { Pendiente, ResultadoDeFuente } from "./tipos";

const p = (o: Partial<Pendiente> & Pick<Pendiente, "clave" | "fuente">): Pendiente => ({
  cuando: "hoy",
  delAgente: false,
  titulo: o.clave,
  detalle: "",
  meta: "",
  accion: "Abrir",
  href: "/",
  ...o,
});

const reunion = (id: string, inicio: string, grupo?: string) => p({ clave: `reunion-con-la-cuenta:${id}`, fuente: "reunion-con-la-cuenta", clientId: id, desde: inicio, ...(grupo ? { grupo } : {}) });
const sinPaso = (id: string, grupo?: string) => p({ clave: `cuenta-sin-accion:${id}`, fuente: "cuenta-sin-accion", clientId: id, desde: null, ...(grupo ? { grupo } : {}) });
const vencidas = (id: string, desde: string) => p({ clave: `tareas-vencidas-de-la-cuenta:${id}`, fuente: "tareas-vencidas-de-la-cuenta", clientId: id, desde });
const compromiso = (id: string, desde: string) => p({ clave: `compromisos-sin-agendar:${id}`, fuente: "compromisos-sin-agendar", clientId: id, desde });

describe("quién ve los tres bloques", () => {
  it("el CSE y la CSL; los demás, «Lo que importa hoy» de siempre", () => {
    expect(modoDelFoco("CSE")).toBe("cse");
    expect(modoDelFoco("CSL")).toBe("csl");
    expect(modoDelFoco("VENTAS")).toBeNull();
    expect(modoDelFoco("SUPER_ADMIN")).toBeNull();
  });
});

describe("los tres bloques del CSE", () => {
  it("reuniones (hoy primero), cuentas sin siguiente paso y pendientes sin seguimiento; lo demás a «También»", () => {
    const riesgo = p({ clave: "cs-tus-cuentas:x", fuente: "cs-tus-cuentas", clientId: "x" });
    const encuesta = p({ clave: "tiempos:1", fuente: "tiempos" });
    const agente = p({ clave: "tareas:por-decidir:ia", fuente: "tareas", delAgente: true });
    const f = armarFoco(
      [riesgo, reunion("b", "2026-10-20T15:00:00Z"), reunion("a", "2026-10-19T20:00:00Z"), sinPaso("c"), vencidas("d", "2026-10-02"), compromiso("e", "2026-10-15T00:00:00Z"), encuesta, agente],
      "cse",
    );
    expect(f.foco.bloques.map((b) => b.clave)).toEqual(["reuniones", "sin-paso", "sin-seguimiento"]);
    expect(f.foco.bloques[0].items.map((x) => x.clientId)).toEqual(["a", "b"]);
    expect(f.foco.bloques[1].items.map((x) => x.clientId)).toEqual(["c"]);
    // Los compromisos antes que las tareas vencidas, aunque las tareas sean más viejas.
    expect(f.foco.bloques[2].items.map((x) => x.fuente)).toEqual(["compromisos-sin-agendar", "tareas-vencidas-de-la-cuenta"]);
    expect(f.resto.map((x) => x.clave).sort()).toEqual([agente.clave, riesgo.clave, encuesta.clave].sort());
    expect(f.enLosBloques).toHaveLength(5);
  });

  it("como mucho tres por bloque; las cuentas que sobran van a «También para hoy», con «Ver las N en la cartera»", () => {
    const muchas = Array.from({ length: 8 }, (_, i) => sinPaso(`c${i}`));
    const f = armarFoco(muchas, "cse");
    const b = f.foco.bloques[1];
    expect(b.items).toHaveLength(MAX_POR_BLOQUE);
    expect(b.total).toBe(8);
    expect(f.resto).toHaveLength(5);
    expect(b.verTodas).toEqual({ texto: "Ver las 8 en la cartera", href: CARTERA_SIN_SIGUIENTE_PASO });
    expect(cuantosSeVen(b)).toBe("3 de 8");
    expect(b.sobranEn).toBe("tambien");
  });

  it("las reuniones que sobran no se repiten en «También»: ya están en la agenda", () => {
    const f = armarFoco(
      Array.from({ length: 5 }, (_, i) => reunion(`r${i}`, `2026-10-2${i}T15:00:00Z`)),
      "cse",
    );
    expect(f.foco.bloques[0].items).toHaveLength(MAX_POR_BLOQUE);
    expect(f.foco.bloques[0].sobranEn).toBe("agenda");
    expect(f.resto).toHaveLength(0);
  });

  it("un bloque vacío lo dice", () => {
    const f = armarFoco([], "cse");
    expect(f.foco.bloques.every((b) => b.items.length === 0 && b.vacio.length > 0)).toBe(true);
  });
});

describe("los tres bloques de la CSL, por CSE", () => {
  it("una línea por CSE en cada bloque, en orden alfabético, «Sin CSE» y «Otras cuentas» al final, con cada cuenta enlazada", () => {
    const deAna = Array.from({ length: 4 }, (_, i) => sinPaso(`a${i}`, "Ana"));
    const f = armarFoco([sinPaso("s", SIN_CSE), ...deAna, sinPaso("z", "Zoe"), compromiso("p", "2026-10-15T00:00:00Z")], "csl");
    const b = f.foco.bloques[1];
    expect(b.items.map((x) => x.titulo)).toEqual(["Ana: 4 cuentas sin siguiente paso", "Zoe: 1 cuenta sin siguiente paso", `${SIN_CSE}: 1 cuenta sin siguiente paso`]);
    expect(b.items[0].enlaces).toHaveLength(4);
    expect(b.total).toBe(6);
    expect(f.resto).toHaveLength(0);
    // Lo que no trae CSE (un compromiso de un prospecto) va a «Otras cuentas».
    expect(f.foco.bloques[2].items[0].titulo).toBe(`${OTRAS_CUENTAS}: 1 pendiente sin seguimiento`);
  });

  it("no repite un compromiso suyo que ya está en lo prometido de la cartera", () => {
    const deLaCartera = p({ clave: "compromisos-sin-agendar-cs:k", fuente: "compromisos-sin-agendar-cs", clientId: "k", grupo: "Ana" });
    const f = armarFoco([deLaCartera, compromiso("k", "2026-10-15T00:00:00Z")], "csl");
    expect(f.foco.bloques[2].items).toHaveLength(1);
    expect(f.foco.bloques[2].items[0].enlaces).toHaveLength(1);
    expect(f.resto).toHaveLength(0);
  });
});

describe("armarParaTi con el foco", () => {
  const resultados: ResultadoDeFuente[] = [
    { fuente: "cuenta-sin-accion", alDia: "x", ok: true, items: [reunion("a", "2026-10-19T20:00:00Z"), sinPaso("c")] },
    { fuente: "cs-tus-cuentas", alDia: "y", ok: true, items: [p({ clave: "cs-tus-cuentas:x", fuente: "cs-tus-cuentas", clientId: "x" })] },
    { fuente: "hubspot-limpieza", alDia: "z", ok: true, items: [p({ clave: "hubspot-limpieza:1", fuente: "hubspot-limpieza", cuando: "semana" })] },
  ];

  it("arriba solo lo de los bloques; el riesgo a «También para hoy»; la limpieza sigue en «Esta semana»", () => {
    const m = armarParaTi(resultados, { foco: "cse" });
    expect(m.foco?.modo).toBe("cse");
    expect(m.importa.map((x) => x.clave)).toEqual(["reunion-con-la-cuenta:a", "cuenta-sin-accion:c"]);
    expect(m.tambien.map((x) => x.clave)).toEqual(["cs-tus-cuentas:x"]);
    expect(m.semana.map((x) => x.clave)).toEqual(["hubspot-limpieza:1"]);
    expect(cuentaDelMenu(m, 1)).toBe(3);
  });

  it("sin foco, como siempre (no hay `foco`)", () => {
    expect(armarParaTi(resultados).foco).toBeUndefined();
  });

  it("el correo de la mañana lleva lo de los bloques de cuentas y de seguimiento (las reuniones ya van arriba)", () => {
    const m = armarParaTi(resultados, { foco: "cse" });
    const c = cosasDelCorreo(m);
    expect(c.cosas.map((x) => x.clave)).toEqual(["cuenta-sin-accion:c"]);
    expect(c.mas).toBe(0);
  });
});
