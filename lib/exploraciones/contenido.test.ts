/**
 * lib/exploraciones/contenido.test.ts — lo confirmado y lo propuesto no se mezclan, y lo
 * descartado no vuelve.
 */
import { describe, expect, it } from "vitest";
import { CASILLAS, TIPO_DE_CASILLA } from "./casillas";
import {
  aplicarOperaciones as aplicar,
  cambioLoConfirmado,
  contenidoVacio,
  destinoValido,
  fusionarPropuestas,
  idDelItem,
  propuestaVacia,
  propuestaVigente,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type Operacion,
  type Validez,
} from "./contenido";
import { leerContenido, leerPropuesta, VALIDADOR_ESTRICTO } from "./esquemas";

/** Como en el servidor: con el validador estricto. */
const aplicarOperaciones = (e: EstadoDeExploracion, ops: Operacion[], v: Validez) => aplicar(e, ops, v, VALIDADOR_ESTRICTO);

const VALIDEZ: Validez = {
  dimensiones: new Set(["1.1", "1.2", "1.3", "1.4", "1.5", "1.6", "1.7", "1.8"]),
  criterios: new Set(["1.3.F1", "1.3.F2"]),
  areas: new Set(["1", "2", "3"]),
  ediciones: new Set(["banca", "ecommerce-retail"]),
  escalaVersion: "8.6.0",
};

function estado(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "con equipo",
    perfilDespues: "continua",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

function item(destino: DestinoDePropuesta, valor: unknown, fuentes = [{ id: "S1", etiqueta: "Reunión del martes" }]): ItemPropuesto {
  return { id: idDelItem(destino, valor), destino, valor, fuentes, corridaId: "run-1", en: "2026-10-01T00:00:00.000Z" };
}

describe("las casillas", () => {
  it("el tipo de cada casilla dice lo mismo en los dos lugares", () => {
    for (const c of CASILLAS) expect(TIPO_DE_CASILLA[c.clave], c.clave).toBe(c.tipo);
    expect(Object.keys(TIPO_DE_CASILLA).sort()).toEqual(CASILLAS.map((c) => c.clave).sort());
  });

  it("lo interno no llega al cliente", () => {
    const internas = CASILLAS.filter((c) => !c.alCliente).map((c) => c.clave);
    for (const k of ["hipotesis", "presupuesto", "autoridad", "noExplorado", "apertura"]) expect(internas).toContain(k);
  });
});

describe("leer con tolerancia", () => {
  it("lo que no tiene la forma queda afuera, nunca tira", () => {
    const c = leerContenido({
      casillas: { metas: [{ que: "Subir el cierre", objetivo: "7 de cada 10" }], presupuesto: 42, nada: "x" },
      chequeo: { "1.3": { nivel: "I", fuente: "reunion" }, "no-es-id": { nivel: "F", fuente: "test" }, "1.4": { nivel: "Z" } },
      notas: { "r1-test": "dijo que no le pareció real" },
      descartadas: ["a", 3, "b"],
    });
    expect(c.casillas.metas).toHaveLength(1);
    expect(c.casillas.presupuesto).toBeUndefined();
    expect(Object.keys(c.chequeo)).toEqual(["1.3"]);
    expect(c.notas["r1-test"]).toMatch(/real/);
    expect(c.descartadas).toEqual(["a", "b"]);
    expect(leerContenido(null)).toEqual(contenidoVacio());
  });

  it("una propuesta con un destino desconocido o un valor sin forma se cae al leerla", () => {
    const p = leerPropuesta({
      items: [
        { id: "x", destino: { tipo: "casilla", clave: "metas" }, valor: { que: "Más leads" }, fuentes: [] },
        { id: "y", destino: { tipo: "casilla", clave: "inventada" }, valor: "x", fuentes: [] },
        { id: "z", destino: { tipo: "nivel", dimensionId: "1.3" }, valor: { nivel: "Q", fuente: "reunion" }, fuentes: [] },
      ],
    });
    expect(p.items.map((i) => i.id)).toEqual(["x"]);
  });
});

describe("lo que propone el agente", () => {
  it("el id es estable: el mismo destino con el mismo valor da el mismo id, sin importar mayúsculas ni tildes", () => {
    const d: DestinoDePropuesta = { tipo: "casilla", clave: "hipotesis" };
    expect(idDelItem(d, "Creemos que no miden la conversión")).toBe(idDelItem(d, "creemos que  NO miden la conversión"));
    expect(idDelItem(d, "Creemos que no miden la conversión")).not.toBe(idDelItem(d, "Otra cosa"));
  });

  it("para un nivel cuenta solo el nivel: otra cita con lo mismo es lo mismo", () => {
    const d: DestinoDePropuesta = { tipo: "nivel", dimensionId: "1.3" };
    expect(idDelItem(d, { nivel: "I", fuente: "reunion", evidencia: "a" })).toBe(
      idDelItem(d, { nivel: "I", fuente: "reunion", evidencia: "b" }),
    );
  });

  it("lo descartado no vuelve, aunque otra corrida lo proponga igual", () => {
    const h = item({ tipo: "casilla", clave: "hipotesis" }, "Creemos que el CRM no lo usa nadie");
    let e = estado({ propuesta: fusionarPropuestas(estado(), [h]) });
    const r = aplicarOperaciones(e, [{ op: "descartar", itemIds: [h.id] }], VALIDEZ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    e = r.estado;
    expect(e.propuesta.items).toHaveLength(0);
    expect(e.contenido.descartadas).toContain(h.id);
    expect(fusionarPropuestas(e, [{ ...h, corridaId: "run-2" }]).items).toHaveLength(0);
  });

  it("lo que ya está confirmado igual no se propone", () => {
    const e = estado({
      contenido: { ...contenidoVacio(), casillas: { retos: [{ texto: "No saben qué etapa pierde negocios" }] } },
    });
    const igual = item({ tipo: "casilla", clave: "retos" }, { texto: "no saben qué etapa pierde negocios" });
    expect(fusionarPropuestas(e, [igual]).items).toHaveLength(0);
  });

  it("un destino escalar queda con UNA propuesta: la más nueva", () => {
    const d: DestinoDePropuesta = { tipo: "nivel", dimensionId: "1.3" };
    const a = item(d, { nivel: "I", fuente: "reunion" });
    const b = item(d, { nivel: "D", fuente: "reunion" });
    const p = fusionarPropuestas(estado({ propuesta: fusionarPropuestas(estado(), [a]) }), [b]);
    expect(p.items.map((i) => (i.valor as { nivel: string }).nivel)).toEqual(["D"]);
  });

  it("en una lista se acumulan, y lo repetido junta sus fuentes", () => {
    const d: DestinoDePropuesta = { tipo: "casilla", clave: "consecuencias" };
    const a = item(d, "Pierden 3 de cada 10 negocios", [{ id: "S1", etiqueta: "Reunión 1" }]);
    const b = item(d, "Se va el que configuró todo", [{ id: "H2", etiqueta: "Nota" }]);
    const a2 = item(d, "pierden 3 de cada 10 negocios", [{ id: "S2", etiqueta: "Reunión 2" }]);
    const p = fusionarPropuestas(estado(), [a, b, a2]);
    expect(p.items).toHaveLength(2);
    expect(p.items.find((i) => i.id === a.id)!.fuentes.map((f) => f.id)).toEqual(["S1", "S2"]);
  });

  it("usar lo propuesto lo confirma y lo saca de lo pendiente; se puede usar con un cambio", () => {
    const meta = item({ tipo: "casilla", clave: "metas" }, { que: "Cerrar más", objetivo: "7 de 10" });
    const e = estado({ propuesta: fusionarPropuestas(estado(), [meta]) });
    const r = aplicarOperaciones(e, [{ op: "usar", itemId: meta.id, valor: { que: "Cerrar más", objetivo: "8 de 10" } }], VALIDEZ);
    expect(r.ok && r.estado.contenido.casillas.metas).toEqual([{ que: "Cerrar más", objetivo: "8 de 10" }]);
    expect(r.ok && r.estado.propuesta.items).toEqual([]);
  });

  it("lo pendiente se limpia solo si el vendedor lo escribió a mano", () => {
    const n = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion" });
    const e = estado({ propuesta: fusionarPropuestas(estado(), [n]) });
    const r = aplicarOperaciones(e, [{ op: "nivel", dimensionId: "1.3", estimado: { nivel: "I", fuente: "vendedor" } }], VALIDEZ);
    expect(r.ok && propuestaVigente(r.estado)).toEqual([]);
  });
});

describe("las operaciones", () => {
  it("un nivel queda con la versión de la escala con que se estimó", () => {
    const r = aplicarOperaciones(estado(), [{ op: "nivel", dimensionId: "1.3", estimado: { nivel: "I", fuente: "reunion" } }], VALIDEZ);
    expect(r.ok && r.estado.contenido.escalaVersion).toBe("8.6.0");
  });

  it("si una no corresponde, no se aplica ninguna", () => {
    const r = aplicarOperaciones(
      estado(),
      [
        { op: "nota", paso: "r1-test", texto: "algo" },
        { op: "nivel", dimensionId: "2.3", estimado: { nivel: "I", fuente: "reunion" } },
      ],
      VALIDEZ,
    );
    expect(r).toEqual({ ok: false, error: "La dimensión 2.3 no está en juego." });
  });

  it("una casilla con un valor sin forma se rechaza", () => {
    const r = aplicarOperaciones(estado(), [{ op: "casilla", clave: "siguientePaso", valor: { que: "Reunión", fecha: "mañana" } }], VALIDEZ);
    expect(r.ok).toBe(false);
  });

  it("vaciar una casilla la borra", () => {
    const con = aplicarOperaciones(estado(), [{ op: "casilla", clave: "planes", valor: ["Pasar todo a otra plataforma"] }], VALIDEZ);
    expect(con.ok && con.estado.contenido.casillas.planes).toHaveLength(1);
    if (!con.ok) return;
    const sin = aplicarOperaciones(con.estado, [{ op: "casilla", clave: "planes", valor: [] }], VALIDEZ);
    expect(sin.ok && "planes" in sin.estado.contenido.casillas).toBe(false);
  });

  it("las áreas guardan el orden en que se eligieron y sus razones", () => {
    const r = aplicarOperaciones(estado({ areas: [] }), [{ op: "areas", areas: ["3", "1"], razones: { "3": "Paga Service Hub sin usar" } }], VALIDEZ);
    expect(r.ok && r.estado.areas).toEqual(["3", "1"]);
    expect(r.ok && r.estado.contenido.razonesDeAreas).toEqual({ "3": "Paga Service Hub sin usar" });
  });

  it("una edición que la escala no trae se rechaza", () => {
    expect(aplicarOperaciones(estado(), [{ op: "edicion", edicion: "salud" }], VALIDEZ).ok).toBe(false);
    expect(aplicarOperaciones(estado(), [{ op: "edicion", edicion: "banca" }], VALIDEZ).ok).toBe(true);
  });

  it("descartar no cambia lo confirmado (no sube la versión); usar sí", () => {
    const h = item({ tipo: "casilla", clave: "hipotesis" }, "Algo");
    const e = estado({ propuesta: fusionarPropuestas(estado(), [h]) });
    const descartado = aplicarOperaciones(e, [{ op: "descartar", itemIds: [h.id] }], VALIDEZ);
    expect(descartado.ok && cambioLoConfirmado(e, descartado.estado)).toBe(false);
    const usado = aplicarOperaciones(e, [{ op: "usar", itemId: h.id }], VALIDEZ);
    expect(usado.ok && cambioLoConfirmado(e, usado.estado)).toBe(true);
  });

  it("un caso de uso sugerido se usa, queda elegido con su área y ya no se vuelve a proponer; quitarlo lo saca", () => {
    const caso = item({ tipo: "casoDeUso", useCaseId: "uc-1" }, { titulo: "Pipeline de ventas", areaId: "1", razon: "Define las etapas" }, []);
    const e = estado({ propuesta: fusionarPropuestas(estado(), [caso]) });
    const usado = aplicarOperaciones(e, [{ op: "usar", itemId: caso.id }], VALIDEZ);
    expect(usado.ok).toBe(true);
    if (!usado.ok) return;
    expect(usado.estado.contenido.casosDeUso["uc-1"]).toEqual({ titulo: "Pipeline de ventas", areaId: "1", razon: "Define las etapas" });
    expect(fusionarPropuestas(usado.estado, [caso]).items).toEqual([]);
    const quitado = aplicarOperaciones(usado.estado, [{ op: "casoDeUso", useCaseId: "uc-1", valor: null }], VALIDEZ);
    expect(quitado.ok && quitado.estado.contenido.casosDeUso).toEqual({});
  });

  it("«Usar» no pasa el tope de una lista: avisa en vez de dejar una lista que la lectura borraría entera", () => {
    const metas = Array.from({ length: 20 }, (_, i) => ({ que: `Meta ${i}` }));
    const nueva = item({ tipo: "casilla", clave: "metas" }, { que: "Meta 21" });
    const e = estado({ contenido: { ...contenidoVacio(), casillas: { metas } }, propuesta: fusionarPropuestas(estado(), [nueva]) });
    const r = aplicarOperaciones(e, [{ op: "usar", itemId: nueva.id }], VALIDEZ);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/ya tiene 20/);
  });

  it("la lectura conserva los ítems buenos de una lista, hasta su tope, en vez de tirarla entera", () => {
    const metas = [...Array.from({ length: 22 }, (_, i) => ({ que: `Meta ${i}` })), { que: "" }];
    expect(leerContenido({ casillas: { metas } }).casillas.metas).toHaveLength(20);
  });

  it("el mismo nivel desde el test no pisa al pendiente de una reunión: queda su frase y su riesgo", () => {
    const deLaReunion = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion", evidencia: "Cada uno en su Excel", riesgo: true });
    const delTest = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "test", evidencia: "Algunos pasos escritos" }, [{ id: "T1", etiqueta: "Test" }]);
    expect(delTest.id).toBe(deLaReunion.id);
    const p = fusionarPropuestas(estado({ propuesta: fusionarPropuestas(estado(), [deLaReunion]) }), [delTest]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].valor).toMatchObject({ fuente: "reunion", riesgo: true, evidencia: "Cada uno en su Excel" });
    expect(p.items[0].fuentes.map((f) => f.id)).toEqual(["S1", "T1"]);
  });

  it("una tilde también es un cambio de lo confirmado: sube la versión", () => {
    const antes = estado({ contenido: { ...contenidoVacio(), casillas: { presupuesto: "esta definido" } } });
    const r = aplicarOperaciones(antes, [{ op: "casilla", clave: "presupuesto", valor: "está definido" }], VALIDEZ);
    expect(r.ok && cambioLoConfirmado(antes, r.estado)).toBe(true);
  });

  it("«Usar todas» usa cada una por su cuenta: la que ya no corresponde se salta y no frena a las demás", () => {
    const buena = item({ tipo: "casilla", clave: "hipotesis" }, "Creemos que sí");
    const deOtraEdicion = item({ tipo: "falta", criterioId: "9.9.F1" }, { estado: "no_tiene" });
    const e = estado({ propuesta: { ...propuestaVacia(), items: [buena, deOtraEdicion] } });
    const r = aplicarOperaciones(e, [{ op: "usarVarias", items: [{ itemId: deOtraEdicion.id }, { itemId: buena.id }, { itemId: "ya-no-esta" }] }], VALIDEZ);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.contenido.casillas.hipotesis).toEqual(["Creemos que sí"]);
    expect(destinoValido(deOtraEdicion.destino, VALIDEZ)).toBe(false);
  });

  it("un caso de uso en un área que no existe, o sin título, se rechaza", () => {
    expect(aplicarOperaciones(estado(), [{ op: "casoDeUso", useCaseId: "uc-1", valor: { titulo: "X", areaId: "9" } }], VALIDEZ).ok).toBe(false);
    expect(aplicarOperaciones(estado(), [{ op: "casoDeUso", useCaseId: "uc-1", valor: { titulo: "", areaId: "1" } }], VALIDEZ).ok).toBe(false);
  });
});
