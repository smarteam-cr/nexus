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
  esFuenteDelCliente,
  industriaDelVendedor,
  laEscalaTieneBase,
  MAX_REUNIONES_ELEGIDAS,
  MAX_FUERA,
  sinFundamentoDelCliente,
  idDelItem,
  operacionesDeLaPantalla,
  propuestaVacia,
  propuestaVigente,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type Operacion,
  type Validez,
} from "./contenido";
import { CambiosSchema, leerContenido, leerPropuesta, VALIDADOR_ESTRICTO } from "./esquemas";
import { MAX_SESIONES, type SesionPlaneada } from "./guia";

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

  it("el nivel del test no pisa al pendiente de una reunión: queda su frase y su riesgo", () => {
    const deLaReunion = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion", evidencia: "Cada uno en su Excel", riesgo: true });
    const delTest = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "test", evidencia: "Algunos pasos escritos" }, [{ id: "T1", etiqueta: "Test" }]);
    const p = fusionarPropuestas(estado({ propuesta: fusionarPropuestas(estado(), [deLaReunion]) }), [delTest]);
    expect(p.items).toHaveLength(1);
    expect(p.items[0].valor).toMatchObject({ fuente: "reunion", riesgo: true, evidencia: "Cada uno en su Excel" });
  });

  it("la hipótesis del agente le gana a lo que marcó en el test, y una hipótesis nueva no pisa lo que dijo el cliente", () => {
    const delTest = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "F", fuente: "test" }, [{ id: "T1", etiqueta: "Test" }]);
    const hipotesis = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "hipotesis", porQue: "Usan Excel" }, [{ id: "H1", etiqueta: "Nota" }]);
    const conLasDos = fusionarPropuestas(estado({ propuesta: fusionarPropuestas(estado(), [delTest]) }), [hipotesis]);
    expect(conLasDos.items.map((i) => (i.valor as { fuente: string }).fuente)).toEqual(["hipotesis"]);
    // Al volver a preparar, el test (más débil) no vuelve sobre la hipótesis.
    expect(fusionarPropuestas(estado({ propuesta: conLasDos }), [delTest]).items.map((i) => (i.valor as { fuente: string }).fuente)).toEqual(["hipotesis"]);
    // Lo que dijo el cliente reemplaza a la hipótesis; una hipótesis nueva no lo pisa.
    const deLaReunion = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "D", fuente: "reunion", evidencia: "No tenemos nada" });
    const conLaReunion = fusionarPropuestas(estado({ propuesta: conLasDos }), [deLaReunion]);
    expect(conLaReunion.items.map((i) => (i.valor as { fuente: string }).fuente)).toEqual(["reunion"]);
    expect(fusionarPropuestas(estado({ propuesta: conLaReunion }), [hipotesis]).items.map((i) => (i.valor as { fuente: string }).fuente)).toEqual(["reunion"]);
  });

  it("lo que dijo el cliente confirma una hipótesis aunque sea el mismo nivel; una hipótesis sobra si ya hay evidencia", () => {
    const conHipotesis = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.3": { nivel: "I", fuente: "test" } } } });
    const evidencia = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion", evidencia: "Cada uno en su Excel" });
    expect(fusionarPropuestas(conHipotesis, [evidencia]).items).toHaveLength(1);
    const conEvidencia = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.3": { nivel: "F", fuente: "reunion" } } } });
    const hipotesis = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "hipotesis", porQue: "x" });
    expect(fusionarPropuestas(conEvidencia, [hipotesis]).items).toHaveLength(0);
  });

  it("elegir la industria trae su perfil habitual y la deja como elegida por el vendedor; tocar el perfil, también", () => {
    const v: Validez = { ...VALIDEZ, perfilesHabituales: { banca: { cierre: "mixta", despues: "continua" }, "ecommerce-retail": null } };
    const r = aplicarOperaciones(estado({ contenido: { ...contenidoVacio(), edicionElegida: { por: "agente", razon: "x" } } }), [{ op: "edicion", edicion: "banca" }], v);
    expect(r.ok && [r.estado.edicion, r.estado.perfilCierre, r.estado.perfilDespues, r.estado.contenido.edicionElegida]).toEqual(["banca", "mixta", "continua", { por: "vendedor" }]);
    // Una edición sin perfil habitual deja el perfil como estaba.
    const sin = aplicarOperaciones(estado(), [{ op: "edicion", edicion: "ecommerce-retail" }], v);
    expect(sin.ok && [sin.estado.perfilCierre, sin.estado.perfilDespues]).toEqual(["con equipo", "continua"]);
    const perfil = aplicarOperaciones(estado(), [{ op: "perfil", cierre: "transaccional", despues: "recompra" }], v);
    expect(perfil.ok && perfil.estado.contenido.edicionElegida).toEqual({ por: "vendedor" });
  });

  it("elegir otra escala guarda la sugerida, y «Restablecer» vuelve a ella y se la devuelve al agente", () => {
    const sugerida = { edicion: "banca", cierre: "mixta" as const, despues: "continua" as const, por: "agente" as const, razon: "Es una financiera." };
    const inicial = estado({ edicion: "banca", contenido: { ...contenidoVacio(), edicionElegida: { por: "agente", razon: "Es una financiera.", sugerida } } });
    const cambiada = aplicarOperaciones(inicial, [{ op: "edicion", edicion: "ecommerce-retail" }], VALIDEZ);
    if (!cambiada.ok) throw new Error("no cambió");
    expect(cambiada.estado.contenido.edicionElegida).toEqual({ por: "vendedor", sugerida });
    expect(industriaDelVendedor(cambiada.estado)).toBe(true);
    const vuelta = aplicarOperaciones(cambiada.estado, [{ op: "restablecerEscala", sugerida }], VALIDEZ);
    expect(vuelta.ok && [vuelta.estado.edicion, vuelta.estado.perfilCierre, vuelta.estado.perfilDespues]).toEqual(["banca", "mixta", "continua"]);
    expect(vuelta.ok && industriaDelVendedor(vuelta.estado)).toBe(false);
    expect(aplicarOperaciones(inicial, [{ op: "restablecerEscala", sugerida: { ...sugerida, edicion: "salud" } }], VALIDEZ).ok).toBe(false);
  });

  it("la industria es del vendedor si la eligió él, o si ya estaba puesta antes de que se anotara quién", () => {
    expect(industriaDelVendedor(estado({ edicion: "banca", contenido: { ...contenidoVacio(), edicionElegida: { por: "agente" } } }))).toBe(false);
    expect(industriaDelVendedor(estado({ edicion: "banca", contenido: { ...contenidoVacio(), edicionElegida: { por: "vendedor" } } }))).toBe(true);
    expect(industriaDelVendedor(estado({ edicion: "banca" }))).toBe(true);
    expect(industriaDelVendedor(estado({ edicion: null, perfilCierre: null, perfilDespues: null }))).toBe(false);
  });

  it("descartar un caso de uso anota su título para la próxima tanda, sin subir la versión", () => {
    const caso = item({ tipo: "casoDeUso", useCaseId: "ia-1" }, { titulo: "Tablero de ventas", areaId: "1" }, []);
    const antes = estado({ propuesta: { ...propuestaVacia(), items: [caso] } });
    const r = aplicarOperaciones(antes, [{ op: "descartar", itemIds: [caso.id] }], VALIDEZ);
    expect(r.ok && r.estado.contenido.casosDescartados).toEqual(["Tablero de ventas"]);
    expect(r.ok && cambioLoConfirmado(antes, r.estado)).toBe(false);
    // La lectura lo conserva, igual que quién eligió la industria.
    const leido = leerContenido({ casosDescartados: ["Tablero de ventas"], edicionElegida: { por: "agente", razon: "Coloca créditos" } });
    expect([leido.casosDescartados, leido.edicionElegida]).toEqual([["Tablero de ventas"], { por: "agente", razon: "Coloca créditos" }]);
    expect(leerContenido({ edicionElegida: { por: "otro" } }).edicionElegida).toBeNull();
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

describe("la alerta de conversación técnica (2026-10-06)", () => {
  const alerta = { reunion: "Reunión del 1 oct", temas: ["API"], cita: "la API de SAP", en: "2026-10-01T15:00:00.000Z", corridaId: "run_1" };

  it("se lee de la propuesta guardada; sin ella, o mal formada, no hay alerta", () => {
    expect(leerPropuesta({ alertaTecnica: alerta }).alertaTecnica).toEqual(alerta);
    expect(leerPropuesta({}).alertaTecnica).toBeNull();
    expect(leerPropuesta({ alertaTecnica: { reunion: 3 } }).alertaTecnica).toBeNull();
  });

  it("«Entendido» la marca vista sin borrarla; sin alerta no hace nada", () => {
    const e = estado({ propuesta: { ...estado().propuesta, alertaTecnica: alerta } });
    const r = aplicarOperaciones(e, [{ op: "alertaTecnicaVista" }], VALIDEZ);
    expect(r.ok && r.estado.propuesta.alertaTecnica).toEqual({ ...alerta, vista: true });
    const sin = aplicarOperaciones(estado(), [{ op: "alertaTecnicaVista" }], VALIDEZ);
    expect(sin.ok && sin.estado.propuesta.alertaTecnica).toBeNull();
  });
});

describe("⭐ las reuniones elegidas en el buscador (2026-10-07, DEPRECATED desde la etapa A)", () => {
  it("⛔ ya no se escriben: la operación no existe y el PATCH la rechaza (2026-10-10)", () => {
    /* La edición que la pone en rojo: devolver `reunionElegida` al esquema de las operaciones. Una reunión se agrega
       como sesión (`agregarSesion`), que antes de adoptar una reunión sin dueño mira lo que haría fallar el agregado. */
    const r = CambiosSchema.safeParse({ version: 0, operaciones: [{ op: "reunionElegida", sessionId: "m1", elegida: true }] });
    expect(r.success).toBe(false);
  });

  it("lo guardado se sigue leyendo (con su tope); lo viejo sin la lista se lee vacío", () => {
    expect(leerContenido({ ...contenidoVacio(), reunionesElegidas: ["m1", 4, "m2"] }).reunionesElegidas).toEqual(["m1", "m2"]);
    expect(leerContenido({ version: 1 }).reunionesElegidas).toEqual([]);
    const muchas = Array.from({ length: MAX_REUNIONES_ELEGIDAS + 5 }, (_, i) => `x${i}`);
    expect(leerContenido({ ...contenidoVacio(), reunionesElegidas: muchas }).reunionesElegidas).toHaveLength(MAX_REUNIONES_ELEGIDAS);
  });
});

describe("⭐ lo que no dijo ni hizo el cliente no se muestra (2026-10-07)", () => {
  const item = (destino: DestinoDePropuesta, ids: string[], valor: unknown = { texto: "x" }): ItemPropuesto => ({
    id: idDelItem(destino, valor),
    destino,
    valor,
    fuentes: ids.map((id) => ({ id, etiqueta: id })),
    corridaId: "r",
    en: "2026-10-07T00:00:00.000Z",
  });

  it("el test, HubSpot, las reuniones, lo sumado a mano y las notas son del cliente; la ficha, el sitio e internet no", () => {
    expect(["T1", "H3", "S1", "M2", "N0"].every(esFuenteDelCliente)).toBe(true);
    expect(["E0", "C0", "D0", "W0", "W1", "W2"].some(esFuenteDelCliente)).toBe(false);
  });

  it("un nivel o una casilla del marco solo con la ficha, el sitio o internet queda fuera; lo demás no", () => {
    expect(sinFundamentoDelCliente(item({ tipo: "nivel", dimensionId: "1.3" }, ["E0", "W0"]))).toBe(true);
    expect(sinFundamentoDelCliente(item({ tipo: "nivel", dimensionId: "1.3" }, ["T1"]))).toBe(false);
    expect(sinFundamentoDelCliente(item({ tipo: "casilla", clave: "retos" }, ["W2"]))).toBe(true);
    expect(sinFundamentoDelCliente(item({ tipo: "casilla", clave: "retos" }, ["W2", "S1"]))).toBe(false);
    // La radiografía y su industria SÍ salen de internet: no son del marco.
    expect(sinFundamentoDelCliente(item({ tipo: "casilla", clave: "radiografia" }, ["W1"]))).toBe(false);
    expect(sinFundamentoDelCliente(item({ tipo: "casilla", clave: "autoridad" }, ["C0"]))).toBe(false);
  });

  it("lo propuesto antes, sin fundamento, deja de verse como pendiente", () => {
    const e = estado();
    const reto = item({ tipo: "casilla", clave: "retos" }, ["W2"], { texto: "Captar socios" });
    const conCita = item({ tipo: "casilla", clave: "retos" }, ["S1"], { texto: "No priorizan leads" });
    e.propuesta.items = [reto, conCita];
    expect(propuestaVigente(e).map((i) => i.id)).toEqual([conCita.id]);
  });
});

describe("⭐ los casos de uso esperan a que la escala tenga base (2026-10-07)", () => {
  const caso = (titulo: string): ItemPropuesto => {
    const destino: DestinoDePropuesta = { tipo: "casoDeUso", useCaseId: `ia-${titulo}` };
    const valor = { titulo, areaId: "1", razon: "x" };
    return { id: idDelItem(destino, valor), destino, valor, fuentes: [], corridaId: "r", en: "2026-10-07T00:00:00.000Z" };
  };
  const nivel = (ids: string[]): ItemPropuesto => {
    const destino: DestinoDePropuesta = { tipo: "nivel", dimensionId: "1.3" };
    const valor = { nivel: "I", fuente: "hipotesis", porQue: "x" };
    return { id: idDelItem(destino, valor), destino, valor, fuentes: ids.map((id) => ({ id, etiqueta: id })), corridaId: "r", en: "2026-10-07T00:00:00.000Z" };
  };

  it("sin un nivel con base, los casos sugeridos no se ven", () => {
    const e = estado();
    e.propuesta.items = [caso("pipeline"), nivel(["E0", "W0"])];
    expect(laEscalaTieneBase(e)).toBe(false);
    expect(propuestaVigente(e).filter((i) => i.destino.tipo === "casoDeUso")).toEqual([]);
  });

  it("con un nivel con fundamento del cliente, o uno confirmado, sí", () => {
    const e = estado();
    e.propuesta.items = [caso("pipeline"), nivel(["S1"])];
    expect(laEscalaTieneBase(e)).toBe(true);
    expect(propuestaVigente(e).some((i) => i.destino.tipo === "casoDeUso")).toBe(true);
    const confirmado = estado();
    confirmado.contenido.chequeo = { "1.3": { nivel: "I", fuente: "reunion" } };
    confirmado.propuesta.items = [caso("pipeline")];
    expect(laEscalaTieneBase(confirmado)).toBe(true);
  });
});

// ── La exploración son sus sesiones (etapa A, 2026-10-09) ─────────────────────

describe("⭐ agregar, quitar y sacar sesiones (etapa A)", () => {
  const evento = { id: "e1", calendario: "eli@smarteamcr.com", inicio: "2026-10-15T15:00:00.000Z" };

  it("agregar una sesión no repite la misma reunión ni el mismo evento, y saca su reunión de «Fuera»", () => {
    const e = estado();
    e.contenido.fuera = ["meet:m1", "hubspot:h1"];
    let r = aplicarOperaciones(e, [{ op: "agregarSesion", sesion: { id: "s-a", reunion: { id: "m1", origen: "meet" }, fecha: "2026-10-01" } }], VALIDEZ);
    expect(r.ok && r.estado.contenido.fuera).toEqual(["hubspot:h1"]);
    if (!r.ok) return;
    r = aplicarOperaciones(r.estado, [{ op: "agregarSesion", sesion: { id: "s-b", reunion: { id: "m1", origen: "meet" } } }], VALIDEZ);
    expect(r.ok && r.estado.contenido.sesiones.map((s) => s.id)).toEqual(["s-a"]);
    if (!r.ok) return;
    r = aplicarOperaciones(r.estado, [{ op: "agregarSesion", sesion: { id: "s-c", evento } }, { op: "agregarSesion", sesion: { id: "s-d", evento } }], VALIDEZ);
    expect(r.ok && r.estado.contenido.sesiones.map((s) => s.id)).toEqual(["s-a", "s-c"]);
    // Con evento y sin fecha, la fecha es el día de su inicio en Costa Rica.
    expect(r.ok && r.estado.contenido.sesiones[1].fecha).toBe("2026-10-15");
  });

  it("respeta el tope de sesiones (20)", () => {
    const lleno = estado();
    lleno.contenido.sesiones = Array.from({ length: MAX_SESIONES }, (_, i) => ({ id: `s-${i}` }));
    expect(MAX_SESIONES).toBe(20);
    expect(aplicarOperaciones(lleno, [{ op: "agregarSesion", sesion: { id: "s-nueva" } }], VALIDEZ).ok).toBe(false);
  });

  it("quitar sesiones por su id; sacar y devolver reuniones a la exploración", () => {
    const e = estado();
    e.contenido.sesiones = [{ id: "s-a" }, { id: "s-b" }, { id: "s-c" }];
    let r = aplicarOperaciones(e, [{ op: "quitarSesiones", ids: ["s-a", "s-c"] }, { op: "fuera", claves: ["meet:m1", "meet:m2"], fuera: true }], VALIDEZ);
    expect(r.ok && r.estado.contenido.sesiones.map((s) => s.id)).toEqual(["s-b"]);
    expect(r.ok && r.estado.contenido.fuera).toEqual(["meet:m1", "meet:m2"]);
    if (!r.ok) return;
    r = aplicarOperaciones(r.estado, [{ op: "fuera", claves: ["meet:m1"], fuera: false }, { op: "fuera", claves: ["meet:m2"], fuera: true }], VALIDEZ);
    expect(r.ok && r.estado.contenido.fuera).toEqual(["meet:m2"]);
    const lleno = estado();
    lleno.contenido.fuera = Array.from({ length: MAX_FUERA }, (_, i) => `meet:x${i}`);
    const r2 = aplicarOperaciones(lleno, [{ op: "fuera", claves: ["meet:nueva"], fuera: true }], VALIDEZ);
    expect(r2.ok && r2.estado.contenido.fuera.length).toBe(MAX_FUERA);
    expect(r2.ok && r2.estado.contenido.fuera.at(-1)).toBe("meet:nueva");
  });

  it("la op evento cambia la fecha y la hora, o la marca cancelada, sin tocar el objetivo ni lo que se llevó", () => {
    const e = estado();
    const s: SesionPlaneada = { id: "s-a", fecha: "2026-10-15", objetivo: "Entender el embudo", explorar: ["algo"], hechas: ["metas"], evento };
    e.contenido.sesiones = [s];
    let r = aplicarOperaciones(e, [{ op: "evento", sesionId: "s-a", inicio: "2026-10-17T02:00:00.000Z", fin: "2026-10-17T03:00:00.000Z" }], VALIDEZ);
    if (!r.ok) throw new Error(r.error);
    const movida = r.estado.contenido.sesiones[0];
    // Las 8 de la noche del 16 en Costa Rica: es del 16, no del 17.
    expect(movida).toMatchObject({
      fecha: "2026-10-16",
      objetivo: "Entender el embudo",
      explorar: ["algo"],
      hechas: ["metas"],
      evento: { id: "e1", inicio: "2026-10-17T02:00:00.000Z", fin: "2026-10-17T03:00:00.000Z" },
    });
    r = aplicarOperaciones(r.estado, [{ op: "evento", sesionId: "s-a", cancelada: true }], VALIDEZ);
    expect(r.ok && r.estado.contenido.sesiones[0].evento?.cancelada).toBe(true);
    if (!r.ok) return;
    r = aplicarOperaciones(r.estado, [{ op: "evento", sesionId: "s-a", cancelada: false }], VALIDEZ);
    expect(r.ok && r.estado.contenido.sesiones[0].evento?.cancelada).toBeUndefined();
    expect(aplicarOperaciones(estado(), [{ op: "evento", sesionId: "s-x", cancelada: true }], VALIDEZ).ok).toBe(false);
  });

  it("⛔ la pantalla no fija el evento del calendario: lo guardado se conserva y uno ajeno no entra", () => {
    const e = estado();
    e.responsableEmail = "ana@smarteamcr.com";
    e.contenido.sesiones = [{ id: "s-a", fecha: "2026-10-15", evento }];
    const ajeno = { id: "privado", calendario: "gerente@smarteamcr.com", inicio: "2026-10-16T15:00:00.000Z" };
    // La lista entera: cada sesión conserva su evento guardado (no el que manda la pantalla); una nueva con uno ajeno entra sin él.
    const lista = operacionesDeLaPantalla(e, [{ op: "sesiones", sesiones: [{ id: "s-a", fecha: "2026-10-15", evento: ajeno }, { id: "s-b", evento: ajeno }] }], { quienPide: "eli@smarteamcr.com" });
    expect(lista.ok && lista.ops[0]).toEqual({ op: "sesiones", sesiones: [{ id: "s-a", fecha: "2026-10-15", evento }, { id: "s-b" }] });
    // Agregar (el «Deshacer» de sacar): entra el evento del calendario de quien pide o de quien la lleva; otro, no.
    const propio = operacionesDeLaPantalla(e, [{ op: "agregarSesion", sesion: { id: "s-c", evento } }], { quienPide: "Eli@smarteamcr.com" });
    expect(propio.ok && propio.ops[0]).toEqual({ op: "agregarSesion", sesion: { id: "s-c", evento } });
    const delResponsable = { ...ajeno, calendario: "ana@smarteamcr.com" };
    const r2 = operacionesDeLaPantalla(e, [{ op: "agregarSesion", sesion: { id: "s-c", evento: delResponsable } }], { quienPide: "eli@smarteamcr.com" });
    expect(r2.ok && r2.ops[0]).toEqual({ op: "agregarSesion", sesion: { id: "s-c", evento: delResponsable } });
    const r3 = operacionesDeLaPantalla(e, [{ op: "agregarSesion", sesion: { id: "s-c", evento: ajeno } }], { quienPide: "eli@smarteamcr.com" });
    expect(r3.ok && r3.ops[0]).toEqual({ op: "agregarSesion", sesion: { id: "s-c" } });
    // La operación `evento` es solo del servidor.
    expect(operacionesDeLaPantalla(e, [{ op: "evento", sesionId: "s-a", cancelada: true }]).ok).toBe(false);
    // Lo demás pasa igual.
    const nota: Operacion = { op: "nota", paso: "sesion:s-a", texto: "x" };
    expect(operacionesDeLaPantalla(e, [nota])).toEqual({ ok: true, ops: [nota] });
  });

  it("las operaciones nuevas pasan el esquema estricto", () => {
    const r = CambiosSchema.safeParse({
      version: 0,
      operaciones: [
        { op: "agregarSesion", sesion: { id: "s-a", evento } },
        { op: "quitarSesiones", ids: ["s-a"] },
        { op: "fuera", claves: ["meet:m1", "hubspot:123"], fuera: true },
        { op: "evento", sesionId: "s-a", inicio: "2026-10-15T09:00:00-06:00", cancelada: false },
      ],
    });
    expect(r.success).toBe(true);
    expect(CambiosSchema.safeParse({ version: 0, operaciones: [{ op: "fuera", claves: ["otro:m1"], fuera: true }] }).success).toBe(false);
  });
});

describe("⭐ el tope de id de una reunión es 200 (etapa A)", () => {
  // Una instancia de una serie de Meet: gmeet_ + el evento + _AAAAMMDDTHHMMSSZ (llegan a ~190).
  const largo = `gmeet_${"a".repeat(164)}_20261019T150000Z`;
  const demasiado = "b".repeat(201);

  it("un id de 187 sobrevive en la sesión, en las elegidas, en las lecturas y en los correos; uno de 201 no", () => {
    expect(largo.length).toBe(187);
    const c = leerContenido({
      ...contenidoVacio(),
      sesiones: [
        { id: "s-a", reunion: { id: largo, origen: "meet" } },
        { id: "s-b", reunion: { id: demasiado, origen: "meet" } },
      ],
      reunionesElegidas: [largo, demasiado],
    });
    expect(c.sesiones.map((s) => s.id)).toEqual(["s-a"]);
    expect(c.reunionesElegidas).toEqual([largo]);
    const lectura = { etiqueta: "Reunión", resumen: "Se habló", cobertura: [], en: "2026-10-09T00:00:00.000Z", corridaId: "r1" };
    const correo = { asunto: "Hola", cuerpo: "…", para: [], en: "2026-10-09T00:00:00.000Z", corridaId: "r1" };
    const p = leerPropuesta({
      lecturas: { [`meet:${largo}`]: lectura, [`meet:${demasiado}`]: lectura },
      correos: { [`meet:${largo}`]: correo },
    });
    expect(Object.keys(p.lecturas)).toEqual([`meet:${largo}`]);
    expect(Object.keys(p.correos)).toEqual([`meet:${largo}`]);
  });

  it("una sesión con su evento mal formado pierde solo el evento (antes desaparecía entera)", () => {
    const c = leerContenido({
      ...contenidoVacio(),
      sesiones: [{ id: "s-a", objetivo: "Entender el embudo", evento: { id: "e con espacios", calendario: "no-es-correo", inicio: "ayer" } }],
    });
    expect(c.sesiones).toEqual([{ id: "s-a", objetivo: "Entender el embudo" }]);
  });

  it("«Fuera» y lo leído con solo notas se guardan y se vuelven a leer; lo viejo sin ellos se lee vacío", () => {
    expect(leerContenido({ ...contenidoVacio(), fuera: ["meet:m1", "x", 3, "hubspot:9"] }).fuera).toEqual(["meet:m1", "hubspot:9"]);
    expect(leerContenido({ version: 1 }).fuera).toEqual([]);
    expect(leerPropuesta({ leidas: { sesiones: ["m1"], hubspot: [], documentos: [], soloNotas: ["m2"] } }).leidas.soloNotas).toEqual(["m2"]);
    expect(leerPropuesta({ leidas: { sesiones: [], hubspot: [], documentos: [] } }).leidas.soloNotas).toEqual([]);
  });
});
