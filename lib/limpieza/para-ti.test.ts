import { describe, expect, it } from "vitest";
import { FUENTE_LIMPIEZA, FUENTE_SIN_DUENO, MAX_ENLACES, dejaSinDueno, lineasSinDuenoDeLaCartera, pendientesDeLimpieza } from "./para-ti";
import { RUTA_DE_LA_LIMPIEZA, type ArregloDeLimpieza, type MotivoDeLimpieza } from "./reglas";
import { armarParaTi } from "@/lib/para-ti/armar";
import { cosasDelCorreo } from "@/lib/mi-dia/correo";
import type { ResultadoDeFuente } from "@/lib/para-ti/tipos";

const ALEX = "alex@x.com";
const HEIVER = "heiver@x.com";

let n = 0;
function arreglo(motivo: MotivoDeLimpieza, o: Partial<ArregloDeLimpieza> = {}): ArregloDeLimpieza {
  n += 1;
  const conProyecto = motivo !== "servicio-sin-registrar";
  return {
    clave: `${motivo}:${n}`,
    motivo,
    texto: "",
    queHacer: "",
    clientId: `cliente${n}`,
    cliente: `Cliente ${n}`,
    proyectoId: conProyecto ? `p${n}` : null,
    proyecto: conProyecto ? `Proyecto ${n}` : null,
    hubspotUrl: conProyecto ? `https://app.hubspot.com/p${n}` : null,
    responsable: { email: ALEX, nombre: "Alexander Vanegas", porQue: "lider" },
    ...o,
  };
}

/** La lista del 2026-10-19 en chico: lo sin dueño de Alex, el excliente de Heiver y lo quieto de otros. */
function lista(): ArregloDeLimpieza[] {
  return [
    arreglo("sin-encargado"),
    arreglo("sin-encargado"),
    arreglo("encargado-de-baja"),
    arreglo("servicio-sin-registrar"),
    arreglo("excliente-activo", { responsable: { email: HEIVER, nombre: "Heiver Gomez", porQue: "encargado" } }),
    arreglo("etapa-quieta", { responsable: { email: HEIVER, nombre: "Heiver Gomez", porQue: "encargado" } }),
    arreglo("sin-actividad"),
  ];
}

describe("qué deja una cuenta sin dueño", () => {
  it("sin encargado, encargado que se fue, servicio sin proyecto y excliente con algo abierto; lo quieto no", () => {
    expect(dejaSinDueno("sin-encargado")).toBe(true);
    expect(dejaSinDueno("encargado-de-baja")).toBe(true);
    expect(dejaSinDueno("servicio-sin-registrar")).toBe(true);
    expect(dejaSinDueno("excliente-activo")).toBe(true);
    expect(dejaSinDueno("etapa-quieta")).toBe(false);
    expect(dejaSinDueno("sin-actividad")).toBe(false);
  });
});

describe("la CSL", () => {
  it("lo sin dueño de TODA la lista, una línea por lo que hay que hacer; lo suyo que es orden, en «Esta semana»", () => {
    const l = lista();
    const ps = pendientesDeLimpieza(l, { email: ALEX, rol: "CSL" });
    const hoy = ps.filter((p) => p.cuando === "hoy");
    expect(hoy.map((p) => p.titulo)).toEqual([
      "3 proyectos sin encargado en HubSpot",
      "1 cuenta cobra un servicio sin proyecto en HubSpot",
      "1 cosa abierta en una cuenta excliente",
    ]);
    expect(hoy.every((p) => p.fuente === FUENTE_SIN_DUENO && p.href === RUTA_DE_LA_LIMPIEZA)).toBe(true);
    // Cada cosa con su enlace, y lo de otra persona dice de quién es.
    expect(hoy[0].enlaces).toHaveLength(3);
    expect(hoy[0].detalle).toContain("1 encargado que ya no está · 2 sin encargado");
    expect(hoy[2].enlaces?.[0].texto).toContain("(le toca a Heiver Gomez)");
    expect(hoy[0].enlaces?.some((e) => e.texto.includes("le toca"))).toBe(false);
    // Los números cuadran con la lista: cada arreglo sin dueño en una sola línea.
    expect(hoy.reduce((s, p) => s + (p.cantidad ?? 0), 0)).toBe(l.filter((a) => dejaSinDueno(a.motivo)).length);
    const semana = ps.filter((p) => p.cuando === "semana");
    expect(semana.map((p) => p.fuente)).toEqual([FUENTE_LIMPIEZA]);
    expect(semana[0].cantidad).toBe(1);
  });

  it("un proyecto sin encargado y sin actividad sale UNA vez: en el bloque, con los dos motivos", () => {
    const sinNada = arreglo("sin-encargado");
    const quieto = { ...arreglo("sin-actividad"), proyectoId: sinNada.proyectoId, proyecto: sinNada.proyecto, clientId: sinNada.clientId };
    const ps = pendientesDeLimpieza([sinNada, quieto], { email: ALEX, rol: "CSL" });
    expect(ps.map((p) => p.clave)).toEqual([`${FUENTE_SIN_DUENO}:proyectos`]);
    expect(ps[0].enlaces?.[0].texto).toBe(`${sinNada.proyecto} · sin encargado, sin actividad`);
    // Igual para quien no es la CSL: una sola línea, la de hoy.
    const otro = pendientesDeLimpieza([sinNada, quieto], { email: ALEX, rol: "DEV" });
    expect(otro.map((p) => [p.fuente, p.cantidad])).toEqual([[FUENTE_SIN_DUENO, 1]]);
    expect(otro[0].enlaces?.[0].texto).toBe(`${sinNada.proyecto}: sin encargado, sin actividad`);
  });

  it("como mucho 12 enlaces por línea; el último lleva a la lista", () => {
    const muchos = Array.from({ length: 20 }, () => arreglo("sin-encargado"));
    const [l] = lineasSinDuenoDeLaCartera(muchos, ALEX);
    expect(l.cantidad).toBe(20);
    expect(l.enlaces).toHaveLength(MAX_ENLACES);
    expect(l.enlaces?.at(-1)).toEqual({ texto: "y 9 más en la lista", href: RUTA_DE_LA_LIMPIEZA });
  });

  it("una CSL sin el frente de liderar Customer Success no recibe la lista entera: solo lo suyo", () => {
    const ps = pendientesDeLimpieza(lista(), { email: ALEX, rol: "CSL", lideraCs: false });
    expect(ps.map((p) => [p.clave, p.cantidad])).toEqual([[FUENTE_SIN_DUENO, 4], [FUENTE_LIMPIEZA, 1]]);
  });

  it("sin nada sin dueño, no hay líneas de hoy", () => {
    expect(lineasSinDuenoDeLaCartera([arreglo("etapa-quieta")])).toEqual([]);
  });
});

describe("los demás", () => {
  it("un CSE ve lo suyo: lo sin dueño en una línea de hoy y lo quieto en «Esta semana»", () => {
    const ps = pendientesDeLimpieza(lista(), { email: HEIVER, rol: "CSE" });
    expect(ps.map((p) => [p.fuente, p.cuando, p.cantidad])).toEqual([
      [FUENTE_SIN_DUENO, "hoy", 1],
      [FUENTE_LIMPIEZA, "semana", 1],
    ]);
    expect(ps[0].detalle).toContain("ninguna cartera");
    // Un CSE no abre la lista: va al proyecto en HubSpot.
    expect(ps[0].href).toMatch(/^https:\/\/app\.hubspot\.com/);
  });

  it("quien no tiene nada, nada", () => {
    expect(pendientesDeLimpieza(lista(), { email: "otro@x.com", rol: "CSE" })).toEqual([]);
  });
});

describe("en «Para ti»", () => {
  const medir = (email: string, rol: string): ResultadoDeFuente[] => [
    { fuente: "hubspot-limpieza", alDia: "Lo tuyo en HubSpot", ok: true, items: pendientesDeLimpieza(lista(), { email, rol }) },
  ];

  it("a la CSL, su bloque «Cuentas sin dueño en HubSpot» va primero, con el total de la lista y su enlace", () => {
    const m = armarParaTi(medir(ALEX, "CSL"), { foco: "csl" });
    const b = m.foco!.bloques[0];
    expect(b.clave).toBe("sin-dueno");
    expect(b.titulo).toBe("Cuentas sin dueño en HubSpot");
    expect(b.items).toHaveLength(3);
    expect(b.total).toBe(5);
    expect(b.verTodas).toEqual({ texto: "Ver la lista de limpieza", href: RUTA_DE_LA_LIMPIEZA });
    // No se reagrupa por CSE ni se repite abajo.
    expect(b.items.every((x) => x.grupo === undefined)).toBe(true);
    expect(m.tambien.some((x) => x.fuente === FUENTE_SIN_DUENO)).toBe(false);
    expect(m.semana.map((x) => x.fuente)).toEqual([FUENTE_LIMPIEZA]);
    expect(m.importa.slice(0, 3).map((x) => x.fuente)).toEqual([FUENTE_SIN_DUENO, FUENTE_SIN_DUENO, FUENTE_SIN_DUENO]);
    // En el orden de lo que hay que hacer, aunque «Para ti» haya ordenado lo de hoy por título.
    expect(b.items.map((x) => x.clave)).toEqual([`${FUENTE_SIN_DUENO}:proyectos`, `${FUENTE_SIN_DUENO}:servicios`, `${FUENTE_SIN_DUENO}:exclientes`]);
  });

  it("el correo de la mañana de la CSL no lleva la limpieza (es de semanas, no del día)", () => {
    const m = armarParaTi(medir(ALEX, "CSL"), { foco: "csl" });
    const c = cosasDelCorreo(m);
    expect(c.cosas.some((x) => x.fuente === FUENTE_SIN_DUENO)).toBe(false);
    expect(c.mas).toBe(0);
  });

  it("sin nada sin dueño, la CSL no ve el bloque", () => {
    const m = armarParaTi([], { foco: "csl" });
    expect(m.foco!.bloques.map((b) => b.clave)).toEqual(["reuniones", "sin-paso", "sin-seguimiento"]);
  });

  it("al CSE no le desplaza sus tres bloques: lo suyo sin dueño va a «También para hoy»", () => {
    const m = armarParaTi(medir(HEIVER, "CSE"), { foco: "cse" });
    expect(m.foco!.bloques.map((b) => b.clave)).toEqual(["reuniones", "sin-paso", "sin-seguimiento"]);
    expect(m.tambien.map((x) => x.fuente)).toEqual([FUENTE_SIN_DUENO]);
    expect(m.semana.map((x) => x.fuente)).toEqual([FUENTE_LIMPIEZA]);
  });
});
