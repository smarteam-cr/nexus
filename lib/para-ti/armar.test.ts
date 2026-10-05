import { describe, expect, it } from "vitest";
import { armarParaTi, cuentaDelMenu, debeNotificar, elMasNuevo, haceCuanto, loQueMasEspera } from "./armar";
import type { Pendiente, ResultadoDeFuente } from "./tipos";

const p = (clave: string, extra: Partial<Pendiente> = {}): Pendiente => ({
  clave,
  fuente: clave.split(":")[0],
  cuando: "hoy",
  delAgente: false,
  titulo: clave,
  detalle: "",
  meta: "",
  accion: "Ir",
  href: "/",
  ...extra,
});

const r = (fuente: string, items: Pendiente[], ok = true): ResultadoDeFuente => ({ fuente, alDia: `Al día: ${fuente}`, ok, items });

describe("armarParaTi", () => {
  it("lo del agente va aparte y arriba; lo demás por cuándo", () => {
    const m = armarParaTi([
      r("a", [p("a:1", { delAgente: true }), p("a:2", { cuando: "semana" })]),
      r("b", [p("b:1"), p("b:2", { cuando: "luego" })]),
    ]);
    expect(m.agente.map((x) => x.clave)).toEqual(["a:1"]);
    expect(m.hoy.map((x) => x.clave)).toEqual(["b:1"]);
    expect(m.semana.map((x) => x.clave)).toEqual(["a:2"]);
    expect(m.luego.map((x) => x.clave)).toEqual(["b:2"]);
  });

  it("lo que falló va primero; después, lo que más espera", () => {
    const m = armarParaTi([
      r("x", [
        p("x:nuevo", { desde: "2026-10-03T12:00:00Z" }),
        p("x:viejo", { desde: "2026-09-20T12:00:00Z" }),
        p("x:sin-fecha"),
        p("x:fallo", { error: true, desde: "2026-10-04T12:00:00Z" }),
      ]),
    ]);
    expect(m.hoy.map((x) => x.clave)).toEqual(["x:fallo", "x:viejo", "x:nuevo", "x:sin-fecha"]);
  });

  it("una fuente sin nada va a «al día»; una que no se pudo medir, a «no se pudo revisar»", () => {
    const m = armarParaTi([r("vacia", []), r("rota", [], false), r("con", [p("con:1")])]);
    expect(m.alDia).toEqual(["Al día: vacia"]);
    expect(m.sinMedir).toEqual(["Al día: rota"]);
  });

  it("la misma clave no se repite aunque dos fuentes la midan", () => {
    const m = armarParaTi([r("a", [p("a:1")]), r("b", [p("a:1")])]);
    expect(m.hoy).toHaveLength(1);
  });
});

describe("el número del menú", () => {
  it("cuenta lo del agente, lo de hoy y los avisos sin leer — no lo de la semana", () => {
    const m = armarParaTi([r("a", [p("a:1", { delAgente: true }), p("a:2"), p("a:3", { cuando: "semana" })])]);
    expect(cuentaDelMenu(m, 2)).toBe(4);
  });
});

describe("lo que más espera", () => {
  it("lo más viejo de hoy o del agente; si no hay, lo de la semana; si no, nada", () => {
    const viejo = p("a:viejo", { delAgente: true, desde: "2026-09-01T00:00:00Z" });
    expect(loQueMasEspera(armarParaTi([r("a", [p("a:1", { desde: "2026-10-01T00:00:00Z" }), viejo])]))?.clave).toBe("a:viejo");
    expect(loQueMasEspera(armarParaTi([r("a", [p("a:s", { cuando: "semana" })])]))?.clave).toBe("a:s");
    expect(loQueMasEspera(armarParaTi([r("a", [])]))).toBeNull();
  });

  it("haceCuanto", () => {
    const ahora = new Date("2026-10-04T15:00:00Z");
    expect(haceCuanto("2026-10-04T10:00:00Z", ahora)).toBe("hoy");
    expect(haceCuanto("2026-10-03T10:00:00Z", ahora)).toBe("ayer");
    expect(haceCuanto("2026-09-29T10:00:00Z", ahora)).toBe("hace 5 días");
    expect(haceCuanto(null, ahora)).toBeNull();
  });
});

describe("la notificación del menú: solo un aviso POSTERIOR al último que la pestaña ya vio", () => {
  const VIEJO = { id: "av-viejo", creadoAt: "2026-10-05T09:00:00.000Z" };
  const MEDIO = { id: "av-medio", creadoAt: "2026-10-05T10:00:00.000Z" };
  const NUEVO = { id: "av-nuevo", creadoAt: "2026-10-05T11:00:00.000Z" };

  it("la primera lectura solo toma la foto", () => {
    expect(debeNotificar(undefined, NUEVO)).toBe(false);
  });

  it("uno nuevo después del que ya vio → notifica", () => {
    expect(debeNotificar(MEDIO, NUEVO)).toBe(true);
    expect(debeNotificar(null, NUEVO), "no había ninguno sin leer: el que aparece es nuevo").toBe(true);
  });

  it("⛔ con dos pestañas: marcar leído el más nuevo deja como «último» uno VIEJO, y no se notifica", () => {
    /* El bug: la pestaña B vio NUEVO; en la pestaña A se marca leído; el «sin leer más nuevo» pasa a ser MEDIO, con
       otro id. Comparando solo el id, B lo notificaba como si acabara de llegar. */
    expect(debeNotificar(NUEVO, MEDIO), "notificó un aviso viejo solo porque cambió el id").toBe(false);
    expect(debeNotificar(NUEVO, VIEJO)).toBe(false);
  });

  it("el mismo aviso no se notifica dos veces, ni nada cuando no queda ninguno", () => {
    expect(debeNotificar(NUEVO, NUEVO)).toBe(false);
    expect(debeNotificar(NUEVO, null)).toBe(false);
  });

  it("lo visto nunca retrocede: ni a uno más viejo ni a «nada» por quedar todo leído", () => {
    expect(elMasNuevo(undefined, NUEVO)).toEqual(NUEVO);
    expect(elMasNuevo(undefined, null)).toBeNull();
    expect(elMasNuevo(NUEVO, MEDIO)).toEqual(NUEVO);
    expect(elMasNuevo(NUEVO, null)).toEqual(NUEVO);
    expect(elMasNuevo(MEDIO, NUEVO)).toEqual(NUEVO);
  });

  it("recorrido completo de una pestaña: solo notifica lo que llega después", () => {
    let visto: Parameters<typeof debeNotificar>[0] = undefined;
    const notificados: string[] = [];
    for (const llega of [MEDIO, NUEVO, MEDIO, null, VIEJO]) {
      if (llega && debeNotificar(visto, llega)) notificados.push(llega.id);
      visto = elMasNuevo(visto, llega);
    }
    expect(notificados).toEqual(["av-nuevo"]);
  });
});
