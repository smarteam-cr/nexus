import { describe, expect, it } from "vitest";
import {
  conLaSesion,
  enlaceDeLaSesion,
  esDeEsteProyecto,
  modoDeEscritura,
  rutaDeLaSesion,
  sacarLaSesion,
  sesionDeLaDireccion,
  sesionPedida,
  sesionQuePideLaDireccion,
  sinLaSesion,
} from "./enlace-de-la-sesion";

describe("sesionQuePideLaDireccion (al abrir y con «Atrás»)", () => {
  const sesiones = [
    { clave: "s-1", reunion: null },
    { clave: "s-2", reunion: { origen: "meet", id: "7" } },
  ];
  const q = (s: string) => new URLSearchParams(s);
  const enLaPreventa = { sesiones, enProyecto: false, projectId: null };
  const enElProyecto = { sesiones, enProyecto: true, projectId: "p1" };

  it("abre la sesión del enlace, en su pestaña", () => {
    expect(sesionQuePideLaDireccion(q("pieza=exploracion&sesion=s-1&momento=analisis"), enLaPreventa)).toEqual({ sesion: "s-1", momento: "despues", perdida: false });
    expect(sesionQuePideLaDireccion(q("tab=p1&canvas=exploration&sesion=s-2"), enElProyecto)).toEqual({ sesion: "s-2", momento: null, perdida: false });
  });

  it("una sesión que ya no está (o de otra exploración) abre el inicio con aviso, sin la pestaña", () => {
    expect(sesionQuePideLaDireccion(q("sesion=s-borrada&momento=analisis"), enLaPreventa)).toEqual({ sesion: null, momento: null, perdida: true });
  });

  it("el enlace viejo de una reunión que entró sola abre la sesión en que se volvió", () => {
    expect(sesionQuePideLaDireccion(q("sesion=r-meet-7&momento=preparacion"), enLaPreventa)).toEqual({ sesion: "s-2", momento: "antes", perdida: false });
  });

  it("en la ficha, la dirección de OTRO proyecto no busca su sesión acá ni avisa nada", () => {
    expect(sesionQuePideLaDireccion(q("tab=p2&canvas=exploration&sesion=s-x"), enElProyecto)).toEqual({ sesion: null, momento: null, perdida: false });
    // Sin `?tab=` (la ficha con un solo proyecto), es la de este.
    expect(sesionQuePideLaDireccion(q("canvas=exploration&sesion=s-1"), enElProyecto).sesion).toBe("s-1");
  });

  it("con otra pieza abierta (o en la cuenta) no abre ninguna sesión", () => {
    expect(sesionQuePideLaDireccion(q("pieza=escala&sesion=s-1"), { ...enLaPreventa, enLaPieza: false })).toEqual({ sesion: null, momento: null, perdida: false });
    expect(sesionQuePideLaDireccion(q("pieza=escala&sesion=s-borrada"), { ...enLaPreventa, enLaPieza: false }).perdida).toBe(false);
  });

  it("sin sesión en la dirección, nada", () => {
    expect(sesionQuePideLaDireccion(q("pieza=exploracion"), enLaPreventa)).toEqual({ sesion: null, momento: null, perdida: false });
  });
});

describe("esDeEsteProyecto", () => {
  const q = (s: string) => new URLSearchParams(s);
  it("la preventa siempre; en la ficha, solo el proyecto de `?tab=` (o cualquiera si no lo dice)", () => {
    expect(esDeEsteProyecto(q("tab=p2"), false, null)).toBe(true);
    expect(esDeEsteProyecto(q("tab=p1"), true, "p1")).toBe(true);
    expect(esDeEsteProyecto(q("tab=p2"), true, "p1")).toBe(false);
    expect(esDeEsteProyecto(q(""), true, "p1")).toBe(true);
  });
});

describe("modoDeEscritura", () => {
  it("dentro de Exploración, cada cambio es un paso más del historial (también volver al inicio)", () => {
    expect(modoDeEscritura({ primera: false, enLaPieza: true })).toBe("agregar");
  });
  it("la primera escritura y salir de la pieza reemplazan: no inventan un paso", () => {
    expect(modoDeEscritura({ primera: true, enLaPieza: true })).toBe("reemplazar");
    expect(modoDeEscritura({ primera: false, enLaPieza: false })).toBe("reemplazar");
  });
});

describe("sacarLaSesion", () => {
  it("saca la sesión y la pestaña y deja lo demás", () => {
    const p = new URLSearchParams("tab=p1&canvas=exploration&sesion=s-1&momento=analisis");
    sacarLaSesion(p);
    expect(p.toString()).toBe("tab=p1&canvas=exploration");
  });
});

const leer = (q: string) => sesionDeLaDireccion(new URLSearchParams(q));

describe("sesionDeLaDireccion", () => {
  it("lee la sesión por su id y la pestaña en palabras", () => {
    expect(leer("pieza=exploracion&sesion=s-mh2k9x1ab&momento=analisis")).toEqual({ sesion: "s-mh2k9x1ab", momento: "despues" });
    expect(leer("sesion=s-1&momento=preparacion")).toEqual({ sesion: "s-1", momento: "antes" });
    expect(leer("sesion=s-1&momento=en-vivo")).toEqual({ sesion: "s-1", momento: "durante" });
  });

  it("entiende las claves de adentro y no le importan las mayúsculas de la pestaña", () => {
    expect(leer("sesion=s-1&momento=despues").momento).toBe("despues");
    expect(leer("sesion=s-1&momento=Analisis").momento).toBe("despues");
  });

  it("acepta la clave de una reunión que entró sola y la de la próxima sin planear", () => {
    expect(leer("sesion=r-meet-cmabc123").sesion).toBe("r-meet-cmabc123");
    expect(leer("sesion=nueva").sesion).toBe("nueva");
  });

  it("sin pestaña (o con una que no existe), la sesión abre en la que le toca", () => {
    expect(leer("sesion=s-1")).toEqual({ sesion: "s-1", momento: null });
    expect(leer("sesion=s-1&momento=resumen")).toEqual({ sesion: "s-1", momento: null });
    expect(leer("sesion=s-1&momento=toString")).toEqual({ sesion: "s-1", momento: null });
  });

  it("una pestaña sin sesión no significa nada", () => {
    expect(leer("momento=analisis")).toEqual({ sesion: null, momento: null });
    expect(leer("")).toEqual({ sesion: null, momento: null });
  });

  it("rechaza un id que no es una clave de sesión", () => {
    for (const malo of ["", "   ", "<script>", "s 1", "-s1", "a".repeat(200), "s-1/../x"]) {
      expect(leer(`sesion=${encodeURIComponent(malo)}&momento=analisis`)).toEqual({ sesion: null, momento: null });
    }
  });
});

describe("conLaSesion", () => {
  const url = new URL("https://nexus.test/clients/c1?tab=p1&canvas=exploration");

  it("pone la sesión y la pestaña sin tocar los demás parámetros", () => {
    const u = conLaSesion(url, "s-1", "despues");
    expect(u.searchParams.get("tab")).toBe("p1");
    expect(u.searchParams.get("canvas")).toBe("exploration");
    expect(u.searchParams.get("sesion")).toBe("s-1");
    expect(u.searchParams.get("momento")).toBe("analisis");
    // No muta la de entrada.
    expect(url.searchParams.has("sesion")).toBe(false);
  });

  it("sin pestaña, saca la que había", () => {
    const u = conLaSesion(conLaSesion(url, "s-1", "durante"), "s-2");
    expect(u.searchParams.get("sesion")).toBe("s-2");
    expect(u.searchParams.has("momento")).toBe(false);
  });

  it("sin sesión (o con una inválida), saca las dos", () => {
    const con = conLaSesion(url, "s-1", "antes");
    expect(sinLaSesion(con).search).toBe("?tab=p1&canvas=exploration");
    expect(conLaSesion(con, "no válida", "antes").searchParams.has("sesion")).toBe(false);
  });

  it("lo que escribe se vuelve a leer igual", () => {
    for (const m of ["antes", "durante", "despues"] as const) {
      expect(sesionDeLaDireccion(conLaSesion(url, "s-abc", m).searchParams)).toEqual({ sesion: "s-abc", momento: m });
    }
  });
});

describe("sesionPedida", () => {
  const sesiones = [
    { clave: "s-1", reunion: null },
    { clave: "r-meet-9", reunion: { origen: "meet", id: "9" } },
    { clave: "s-2", reunion: { origen: "meet", id: "7" } },
  ];
  it("distingue sin pedido, la que está y la que ya no", () => {
    expect(sesionPedida(null, sesiones)).toEqual({ estado: "sin-pedido" });
    expect(sesionPedida("s-1", sesiones)).toEqual({ estado: "esta", clave: "s-1" });
    expect(sesionPedida("r-meet-9", sesiones)).toEqual({ estado: "esta", clave: "r-meet-9" });
    expect(sesionPedida("s-borrada", sesiones)).toEqual({ estado: "no-esta" });
    expect(sesionPedida("s-1", [])).toEqual({ estado: "no-esta" });
  });

  it("la próxima sin planear siempre se puede abrir", () => {
    expect(sesionPedida("nueva", [])).toEqual({ estado: "esta", clave: "nueva" });
  });

  it("una reunión que entró sola y ya es sesión se encuentra por su reunión", () => {
    expect(sesionPedida("r-meet-7", sesiones)).toEqual({ estado: "esta", clave: "s-2" });
    expect(sesionPedida("r-hubspot-7", sesiones)).toEqual({ estado: "no-esta" });
  });
});

describe("enlaceDeLaSesion", () => {
  it("en la preventa abre la pieza Exploración en esa sesión", () => {
    expect(enlaceDeLaSesion("https://nexus.test", { lugar: "preventa", exploracionId: "e1" }, "s-1", "despues")).toBe(
      "https://nexus.test/sales/exploraciones/e1?pieza=exploracion&sesion=s-1&momento=analisis",
    );
  });

  it("en un proyecto nombra el proyecto, aunque la empresa tenga otros", () => {
    expect(enlaceDeLaSesion("https://nexus.test", { lugar: "proyecto", clientId: "c1", projectId: "p 2" }, "s-1", null)).toBe(
      "https://nexus.test/clients/c1?tab=p+2&canvas=exploration&sesion=s-1",
    );
  });
});

describe("rutaDeLaSesion", () => {
  it("sin sesión es la ruta de la exploración; con una, la nombra", () => {
    const donde = { lugar: "proyecto" as const, clientId: "c1", projectId: "p1" };
    expect(rutaDeLaSesion(donde, null)).toBe("/clients/c1?tab=p1&canvas=exploration");
    expect(rutaDeLaSesion(donde, "s-1", "despues")).toBe("/clients/c1?tab=p1&canvas=exploration&sesion=s-1&momento=analisis");
    expect(rutaDeLaSesion({ lugar: "preventa", exploracionId: "e1" }, "<malo>", "antes")).toBe("/sales/exploraciones/e1?pieza=exploracion");
  });
});
