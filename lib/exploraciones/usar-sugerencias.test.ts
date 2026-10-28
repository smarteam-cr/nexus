/**
 * lib/exploraciones/usar-sugerencias.test.ts — K12: usar una sugerencia y deshacerla deja todo como estaba, de cada
 * tipo; deshacer no pisa lo que cambió después; y cada «Usar» dice lo que va a escribir.
 */
import { describe, expect, it } from "vitest";
import {
  aplicarOperaciones as aplicar,
  cambioLoConfirmado,
  contenidoVacio,
  idDelItem,
  MAX_USADAS,
  propuestaVacia,
  sePuedeDeshacer,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type ItemPropuesto,
  type Operacion,
  type QuienCambia,
  type Validez,
} from "./contenido";
import { CambiosSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { sePuedeReintentar } from "./reintento";
import { ESCALA_DE_PRUEBA } from "./escala-de-prueba.test-helpers";
import { avisoDelLote, etiquetaDelLote, loQueVaAPasar, queHaceUsar, usadasDeHoy } from "./usar-sugerencias";

const QUIEN = { por: "elias@smarteamcr.com", en: "2026-10-28T15:30:00.000Z" };
const aplicarOperaciones = (e: EstadoDeExploracion, ops: Operacion[], quien: QuienCambia = QUIEN) => aplicar(e, ops, VALIDEZ, VALIDADOR_ESTRICTO, quien);

const VALIDEZ: Validez = {
  dimensiones: new Set(["1.1", "1.2", "1.3", "1.7"]),
  criterios: new Set(["1.3.F1"]),
  areas: new Set(["1", "2", "3"]),
  ediciones: new Set(["banca", "ecommerce-retail"]),
  perfilesHabituales: { banca: { cierre: "con equipo", despues: "continua" }, "ecommerce-retail": { cierre: "transaccional", despues: "recompra" } },
  escalaVersion: "8.6.0",
};

function estado(parcial: Partial<EstadoDeExploracion> = {}): EstadoDeExploracion {
  return {
    contenido: contenidoVacio(),
    propuesta: propuestaVacia(),
    areas: ["1"],
    edicion: null,
    perfilCierre: "mixta",
    perfilDespues: "única",
    responsableEmail: null,
    archivada: false,
    ...parcial,
  };
}

function item(destino: DestinoDePropuesta, valor: unknown): ItemPropuesto {
  return { id: idDelItem(destino, valor), destino, valor, fuentes: [{ id: "S1", etiqueta: "Reunión del martes", cita: "lo dijo" }], corridaId: "run-1", en: "2026-10-01T00:00:00.000Z" };
}

const conItems = (e: EstadoDeExploracion, ...items: ItemPropuesto[]): EstadoDeExploracion => ({ ...e, propuesta: { ...e.propuesta, items } });

/**
 * Lo que importa comparar: lo confirmado sin el registro de las usadas, y lo pendiente. `escalaVersion` es la versión de la
 * escala con que se estimó el último nivel: un dato de cuándo, no algo que se vea ni que deshacer devuelva.
 */
const loQueSeVe = (e: EstadoDeExploracion) => ({ ...e, contenido: { ...e.contenido, usadas: undefined, escalaVersion: null } });

function usarYDeshacer(e: EstadoDeExploracion, it: ItemPropuesto) {
  const usado = aplicarOperaciones(e, [{ op: "usar", itemId: it.id }]);
  if (!usado.ok) throw new Error(usado.error);
  const deshecho = aplicarOperaciones(usado.estado, [{ op: "deshacerUso", ids: [it.id] }]);
  if (!deshecho.ok) throw new Error(deshecho.error);
  return { usado: usado.estado, deshecho: deshecho.estado };
}

describe("usar y deshacer, de cada tipo", () => {
  const casos: { nombre: string; e: EstadoDeExploracion; it: ItemPropuesto; cambio: (x: EstadoDeExploracion) => unknown }[] = [
    {
      nombre: "un nivel nuevo",
      e: estado(),
      it: item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion", evidencia: "usamos Excel" }),
      cambio: (x) => x.contenido.chequeo["1.3"]?.nivel,
    },
    {
      nombre: "un nivel que reemplaza otro",
      e: estado({ contenido: { ...contenidoVacio(), chequeo: { "1.3": { nivel: "D", fuente: "vendedor" } } } }),
      it: item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "F", fuente: "reunion" }),
      cambio: (x) => x.contenido.chequeo["1.3"],
    },
    {
      nombre: "lo que pide Funcional",
      e: estado(),
      it: item({ tipo: "falta", criterioId: "1.3.F1" }, { estado: "tiene", cita: "sí lo tenemos" }),
      cambio: (x) => x.contenido.falta["1.3.F1"],
    },
    {
      nombre: "explorar a fondo",
      e: estado(),
      it: item({ tipo: "aExplorar", dimensionId: "1.7" }, { motivo: "meta", razon: "Toca la meta de cierre" }),
      cambio: (x) => x.contenido.aExplorar["1.7"],
    },
    {
      nombre: "un área con su razón",
      e: estado(),
      it: item({ tipo: "area", areaId: "3" }, { razon: "Paga Service Hub sin usar" }),
      cambio: (x) => [x.areas, x.contenido.razonesDeAreas],
    },
    {
      nombre: "un caso de uso",
      e: estado(),
      it: item({ tipo: "casoDeUso", useCaseId: "ia-1" }, { titulo: "Tablero de ventas", areaId: "1" }),
      cambio: (x) => x.contenido.casosDeUso,
    },
    {
      nombre: "una casilla de lista",
      e: estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "Vender más" }] } } }),
      it: item({ tipo: "casilla", clave: "metas" }, { que: "Cerrar en 30 días" }),
      cambio: (x) => x.contenido.casillas.metas,
    },
    {
      nombre: "una casilla de un solo valor",
      e: estado({ contenido: { ...contenidoVacio(), casillas: { presupuesto: "Unos 20 mil" } } }),
      it: item({ tipo: "casilla", clave: "presupuesto" }, "Hasta 30 mil al año"),
      cambio: (x) => x.contenido.casillas.presupuesto,
    },
    {
      nombre: "el perfil",
      e: estado(),
      it: item({ tipo: "perfil" }, { cierre: "con equipo", despues: "continua" }),
      cambio: (x) => [x.perfilCierre, x.perfilDespues],
    },
  ];

  for (const c of casos) {
    it(`${c.nombre}: usar cambia, deshacer deja todo como estaba y la sugerencia vuelve`, () => {
      const e = conItems(c.e, c.it);
      const { usado, deshecho } = usarYDeshacer(e, c.it);
      expect(c.cambio(usado)).not.toEqual(c.cambio(e));
      expect(usado.propuesta.items).toHaveLength(0);
      expect(usado.contenido.usadas?.map((u) => u.id)).toEqual([c.it.id]);
      expect(loQueSeVe(deshecho)).toEqual(loQueSeVe(e));
      expect(deshecho.contenido.usadas ?? []).toHaveLength(0);
    });
  }

  it("la industria trae su perfil, y deshacerla devuelve también el perfil y quién la eligió", () => {
    const sugerida = { edicion: "banca", cierre: "con equipo" as const, despues: "continua" as const, por: "agente" as const };
    const e = conItems(
      estado({ edicion: "banca", perfilCierre: "con equipo", perfilDespues: "continua", contenido: { ...contenidoVacio(), edicionElegida: { por: "agente", sugerida } } }),
      item({ tipo: "edicion" }, { slug: "ecommerce-retail" }),
    );
    const it = e.propuesta.items[0];
    const { usado, deshecho } = usarYDeshacer(e, it);
    expect([usado.edicion, usado.perfilCierre, usado.perfilDespues, usado.contenido.edicionElegida?.por]).toEqual(["ecommerce-retail", "transaccional", "recompra", "vendedor"]);
    expect([deshecho.edicion, deshecho.perfilCierre, deshecho.perfilDespues]).toEqual(["banca", "con equipo", "continua"]);
    expect(deshecho.contenido.edicionElegida).toEqual({ por: "agente", sugerida });
    expect(loQueSeVe(deshecho)).toEqual(loQueSeVe(e));
  });

  it("queda quién la usó y cuándo", () => {
    const it = item({ tipo: "area", areaId: "2" }, {});
    const r = aplicarOperaciones(conItems(estado(), it), [{ op: "usar", itemId: it.id }]);
    expect(r.ok && r.estado.contenido.usadas?.[0]).toMatchObject({ id: it.id, por: QUIEN.por, en: QUIEN.en, antes: { enJuego: false, razon: null } });
  });

  it("un ítem que ya estaba en la lista no deja nada que deshacer", () => {
    const it = item({ tipo: "casilla", clave: "metas" }, { que: "Vender más" });
    const r = aplicarOperaciones(conItems(estado({ contenido: { ...contenidoVacio(), casillas: { metas: [{ que: "vender  más" }] } } }), it), [{ op: "usar", itemId: it.id }]);
    expect(r.ok && r.estado.contenido.usadas).toBeUndefined();
  });
});

describe("el lote", () => {
  const nivel = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion" });
  const area = item({ tipo: "area", areaId: "2" }, { razon: "Marketing sin automatizar" });
  const edicion = item({ tipo: "edicion" }, { slug: "banca" });
  const perfil = item({ tipo: "perfil" }, { cierre: "transaccional", despues: "única" });
  const e = conItems(estado(), nivel, area, edicion, perfil);
  const ids = [nivel.id, area.id, edicion.id, perfil.id];

  it("«Pasar las N al mapa» y deshacer el lote entero deja todo como estaba (la industria y el perfil también)", () => {
    const usado = aplicarOperaciones(e, [{ op: "usarVarias", items: ids.map((itemId) => ({ itemId })) }]);
    expect(usado.ok).toBe(true);
    if (!usado.ok) return;
    expect(usado.estado.contenido.usadas?.map((u) => u.id)).toEqual(ids);
    expect(usado.estado.contenido.usadas?.every((u) => u.lote && u.en === QUIEN.en)).toBe(true);
    expect([usado.estado.edicion, usado.estado.perfilCierre]).toEqual(["banca", "transaccional"]);
    const deshecho = aplicarOperaciones(usado.estado, [{ op: "deshacerUso", ids }]);
    expect(deshecho.ok).toBe(true);
    if (!deshecho.ok) return;
    expect(loQueSeVe(deshecho.estado).contenido).toEqual(loQueSeVe(e).contenido);
    expect([deshecho.estado.areas, deshecho.estado.edicion, deshecho.estado.perfilCierre, deshecho.estado.perfilDespues]).toEqual([["1"], null, "mixta", "única"]);
    expect(deshecho.estado.propuesta.items.map((x) => x.id).sort()).toEqual([...ids].sort());
  });

  it("lo que cambió después de usarlo se queda; lo demás del lote se deshace", () => {
    const usado = aplicarOperaciones(e, [{ op: "usarVarias", items: ids.map((itemId) => ({ itemId })) }]);
    if (!usado.ok) throw new Error(usado.error);
    const tocado = aplicarOperaciones(usado.estado, [{ op: "nivel", dimensionId: "1.3", estimado: { nivel: "E", fuente: "vendedor" } }]);
    if (!tocado.ok) throw new Error(tocado.error);
    const uso = tocado.estado.contenido.usadas!.find((u) => u.id === nivel.id)!;
    expect(sePuedeDeshacer(tocado.estado, uso)).toBe(false);
    const deshecho = aplicarOperaciones(tocado.estado, [{ op: "deshacerUso", ids }]);
    expect(deshecho.ok).toBe(true);
    if (!deshecho.ok) return;
    expect(deshecho.estado.contenido.chequeo["1.3"]).toEqual({ nivel: "E", fuente: "vendedor" });
    expect(deshecho.estado.areas).toEqual(["1"]);
    expect(deshecho.estado.contenido.usadas?.map((u) => u.id)).toEqual([nivel.id]);
  });
});

describe("la sugerencia vuelve donde estaba (Camosa, 28 oct)", () => {
  /* El panel de una reunión muestra las 6 primeras y esconde el resto en «Ver las 10 restantes»; y decide cuáles son de
     esa reunión por sus fuentes. Deshacer la devolvía al final de la lista y con 4 fuentes: no volvía a verse. */
  const fuentes = Array.from({ length: 7 }, (_, i) => ({ id: `S${i + 1}`, etiqueta: `Reunión ${i + 1}`, cita: `dijo ${i}` }));
  const lista = Array.from({ length: 8 }, (_, i) => ({ ...item({ tipo: "casilla", clave: "metas" }, { que: `Meta ${i}` }), fuentes }));
  const e = conItems(estado(), ...lista);
  const orden = (x: EstadoDeExploracion) => x.propuesta.items.map((it) => it.id);

  it("deshacer una la devuelve en su lugar, con todas sus fuentes", () => {
    const { deshecho } = usarYDeshacer(e, lista[0]);
    expect(orden(deshecho)).toEqual(orden(e));
    expect(deshecho.propuesta.items[0].fuentes).toEqual(fuentes);
  });

  it("deshacer un lote salteado deja la lista en el orden de antes", () => {
    const ids = [lista[1].id, lista[4].id, lista[6].id];
    const usado = aplicarOperaciones(e, [{ op: "usarVarias", items: ids.map((itemId) => ({ itemId })) }]);
    if (!usado.ok) throw new Error(usado.error);
    // Deshacer en otro orden que el del lote (como llegan desde «Usadas hoy»).
    const deshecho = aplicarOperaciones(usado.estado, [{ op: "deshacerUso", ids: [ids[2], ids[0], ids[1]] }]);
    if (!deshecho.ok) throw new Error(deshecho.error);
    expect(orden(deshecho.estado)).toEqual(orden(e));
  });

  it("usar tres pegadas y salteadas en cualquier orden y deshacerlas en cualquier orden deja la lista como era", () => {
    const permutaciones = <T,>(xs: T[]): T[][] => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutaciones([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p])));
    for (const elegidas of [[0, 1, 2], [3, 4, 7], [0, 5, 7]]) {
      for (const alUsar of permutaciones(elegidas)) {
        for (const alDeshacer of permutaciones(elegidas)) {
          let x = e;
          for (const i of alUsar) {
            const r = aplicarOperaciones(x, [{ op: "usar", itemId: lista[i].id }]);
            if (!r.ok) throw new Error(r.error);
            x = r.estado;
          }
          for (const i of alDeshacer) {
            const r = aplicarOperaciones(x, [{ op: "deshacerUso", ids: [lista[i].id] }]);
            if (!r.ok) throw new Error(r.error);
            x = r.estado;
          }
          expect(orden(x), `usar ${alUsar} · deshacer ${alDeshacer}`).toEqual(orden(e));
        }
      }
    }
  });

  const paso = (x: EstadoDeExploracion, op: Operacion) => {
    const r = aplicarOperaciones(x, [op]);
    if (!r.ok) throw new Error(r.error);
    return r.estado;
  };

  it("descartar una vecina no corta la cadena (usar A, descartar B, usar C)", () => {
    const [a, b, c2] = lista;
    for (const alDeshacer of [[a.id, c2.id], [c2.id, a.id]]) {
      let x = paso(e, { op: "usar", itemId: a.id });
      x = paso(x, { op: "descartar", itemIds: [b.id] });
      x = paso(x, { op: "usar", itemId: c2.id });
      for (const id of alDeshacer) x = paso(x, { op: "deshacerUso", ids: [id] });
      expect(orden(x)).toEqual(orden(e).filter((id) => id !== b.id));
    }
  });

  it("usar, descartar y deshacer mezclados al azar (400 veces) deja la lista como era, sin las descartadas", () => {
    let semilla = 7;
    const azar = (n: number) => {
      semilla = (semilla * 1103515245 + 12345) % 2147483648;
      return semilla % n;
    };
    for (let vuelta = 0; vuelta < 400; vuelta++) {
      let x = e;
      const usadas: string[] = [];
      const descartadas = new Set<string>();
      for (let paso_ = 0; paso_ < 6; paso_++) {
        const pendientes = x.propuesta.items.map((it) => it.id);
        const accion = azar(3);
        if (accion === 0 && pendientes.length) {
          const id = pendientes[azar(pendientes.length)];
          x = paso(x, { op: "usar", itemId: id });
          usadas.push(id);
        } else if (accion === 1 && pendientes.length) {
          const id = pendientes[azar(pendientes.length)];
          x = paso(x, { op: "descartar", itemIds: [id] });
          descartadas.add(id);
        } else if (usadas.length) {
          const [id] = usadas.splice(azar(usadas.length), 1);
          x = paso(x, { op: "deshacerUso", ids: [id] });
        }
      }
      while (usadas.length) x = paso(x, { op: "deshacerUso", ids: usadas.splice(azar(usadas.length), 1) });
      expect(orden(x), `vuelta ${vuelta}`).toEqual(orden(e).filter((id) => !descartadas.has(id)));
    }
  });

  it("el lugar sobrevive a guardar y volver a leer", () => {
    let x = paso(e, { op: "usar", itemId: lista[3].id });
    x = paso(x, { op: "usar", itemId: lista[2].id });
    x = { ...x, contenido: leerContenido(JSON.parse(JSON.stringify(x.contenido))) };
    x = paso(x, { op: "deshacerUso", ids: [lista[3].id] });
    x = paso(x, { op: "deshacerUso", ids: [lista[2].id] });
    expect(orden(x)).toEqual(orden(e));
  });

  it("un uso de antes de que se anotara el lugar vuelve al final, como antes", () => {
    const usado = paso(e, { op: "usar", itemId: lista[0].id });
    const viejo: EstadoDeExploracion = {
      ...usado,
      contenido: { ...usado.contenido, usadas: usado.contenido.usadas!.map(({ previo: _p, siguiente: _s, posicion: _i, ...u }) => (void [_p, _s, _i], u)) },
    };
    expect(orden(paso(viejo, { op: "deshacerUso", ids: [lista[0].id] }))).toEqual([...orden(e).slice(1), lista[0].id]);
  });

  it("con la lista llena, la devuelta no se recorta: se cae la más vieja de las demás", () => {
    const llena = Array.from({ length: 250 }, (_, i) => item({ tipo: "casilla", clave: "metas" }, { que: `Llena ${i}` }));
    let x = paso(conItems(estado(), ...llena), { op: "usar", itemId: llena[0].id });
    const nueva = item({ tipo: "casilla", clave: "metas" }, { que: "Llegó después" });
    x = { ...x, propuesta: { ...x.propuesta, items: [...x.propuesta.items, nueva] } };
    x = paso(x, { op: "deshacerUso", ids: [llena[0].id] });
    expect(x.propuesta.items).toHaveLength(250);
    expect(x.propuesta.items[0].id).toBe(llena[0].id);
    expect(x.propuesta.items.some((it) => it.id === llena[1].id)).toBe(false);
  });

  it("deshacer de a una, en cualquier orden, también", () => {
    const usado = aplicarOperaciones(e, [{ op: "usar", itemId: lista[2].id }, { op: "usar", itemId: lista[5].id }]);
    if (!usado.ok) throw new Error(usado.error);
    const una = aplicarOperaciones(usado.estado, [{ op: "deshacerUso", ids: [lista[2].id] }]);
    if (!una.ok) throw new Error(una.error);
    const otra = aplicarOperaciones(una.estado, [{ op: "deshacerUso", ids: [lista[5].id] }]);
    if (!otra.ok) throw new Error(otra.error);
    expect(orden(otra.estado)).toEqual(orden(e));
  });
});

describe("el lote grande", () => {
  it("un lote de 130 queda anotado entero y se deshace entero", () => {
    const casos = Array.from({ length: 130 }, (_, i) => item({ tipo: "casoDeUso", useCaseId: `ia-${i}` }, { titulo: `Caso ${i}`, areaId: null }));
    const e = conItems(estado(), ...casos);
    const usado = aplicarOperaciones(e, [{ op: "usarVarias", items: casos.map((c) => ({ itemId: c.id })) }]);
    if (!usado.ok) throw new Error(usado.error);
    expect(usado.estado.contenido.usadas).toHaveLength(130);
    const deshecho = aplicarOperaciones(usado.estado, [{ op: "deshacerUso", ids: casos.map((c) => c.id) }]);
    if (!deshecho.ok) throw new Error(deshecho.error);
    expect(deshecho.estado.contenido.casosDeUso).toEqual({});
    expect(deshecho.estado.propuesta.items).toHaveLength(130);
  });
});

describe("lo de antes que no se puede volver a poner", () => {
  const edicion = item({ tipo: "edicion" }, { slug: "banca" });
  const usado = aplicarOperaciones(conItems(estado(), edicion), [{ op: "usar", itemId: edicion.id }]);
  if (!usado.ok) throw new Error(usado.error);
  const conAntes = (antes: unknown): EstadoDeExploracion => ({
    ...usado.estado,
    contenido: { ...usado.estado.contenido, usadas: usado.estado.contenido.usadas!.map((u) => ({ ...u, antes })) },
  });

  for (const [nombre, antes, error] of [
    ["un perfil que no existe", { edicion: null, perfilCierre: "DROP TABLE", perfilDespues: "única", edicionElegida: null }, "No se sabe qué perfil había antes."],
    ["una industria que ya no está en la escala", { edicion: "mineria", perfilCierre: "mixta", perfilDespues: "única", edicionElegida: null }, "La industria de antes ya no tiene edición en la escala."],
    ["un «antes» sin forma", "cualquier cosa", "No se sabe qué industria había antes."],
  ] as const) {
    it(`${nombre}: no toca nada y dice por qué`, () => {
      const e = conAntes(antes);
      const r = aplicarOperaciones(e, [{ op: "deshacerUso", ids: [edicion.id] }]);
      expect(r).toEqual({ ok: false, error });
    });
  }
});

describe("deshacer no pisa", () => {
  it("si el lugar cambió después, no se deshace y lo dice", () => {
    const it = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion" });
    const usado = aplicarOperaciones(conItems(estado(), it), [{ op: "usar", itemId: it.id }]);
    if (!usado.ok) throw new Error(usado.error);
    const tocado = aplicarOperaciones(usado.estado, [{ op: "nivel", dimensionId: "1.3", estimado: null }]);
    if (!tocado.ok) throw new Error(tocado.error);
    const r = aplicarOperaciones(tocado.estado, [{ op: "deshacerUso", ids: [it.id] }]);
    expect(r).toEqual({ ok: false, error: expect.stringContaining("cambió después") });
  });

  it("lo que ya se deshizo no se deshace dos veces", () => {
    const it = item({ tipo: "area", areaId: "2" }, {});
    const { deshecho } = usarYDeshacer(conItems(estado(), it), it);
    const r = aplicarOperaciones(deshecho, [{ op: "deshacerUso", ids: [it.id] }]);
    expect(r).toEqual({ ok: false, error: "Eso ya se deshizo." });
  });

  it("la sugerencia no vuelve si se descartó, ni si el agente propuso otra para el mismo lugar", () => {
    const it = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "I", fuente: "reunion" });
    const otra = item({ tipo: "nivel", dimensionId: "1.3" }, { nivel: "F", fuente: "reunion" });
    const usado = aplicarOperaciones(conItems(estado(), it), [{ op: "usar", itemId: it.id }]);
    if (!usado.ok) throw new Error(usado.error);
    const r = aplicarOperaciones(conItems(usado.estado, otra), [{ op: "deshacerUso", ids: [it.id] }]);
    expect(r.ok && r.estado.propuesta.items.map((x) => x.id)).toEqual([otra.id]);
    expect(r.ok && r.estado.contenido.chequeo["1.3"]).toBeUndefined();
  });

  it("el registro de las usadas no sube la versión; deshacer sí (cambia lo confirmado)", () => {
    const it = item({ tipo: "area", areaId: "2" }, {});
    const e = conItems(estado(), it);
    const { usado, deshecho } = usarYDeshacer(e, it);
    expect(cambioLoConfirmado(e, usado)).toBe(true);
    expect(cambioLoConfirmado(usado, deshecho)).toBe(true);
    expect(cambioLoConfirmado(deshecho, { ...deshecho, contenido: { ...deshecho.contenido, usadas: usado.contenido.usadas } })).toBe(false);
  });

  it("deshacer se reintenta solo tras un 409: la regla que no pisa la aplica contenido.ts", () => {
    expect(sePuedeReintentar([{ op: "deshacerUso", ids: ["x"] }], estado(), estado({ areas: ["1", "2"] }))).toBe(true);
  });
});

describe("lo que se guarda", () => {
  it("la operación pasa por zod, y el registro se lee de vuelta tal cual", () => {
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "deshacerUso", ids: ["nivel:1.3:abc"] }] }).success).toBe(true);
    expect(CambiosSchema.safeParse({ version: 1, operaciones: [{ op: "deshacerUso", ids: [] }] }).success).toBe(false);
    const it = item({ tipo: "edicion" }, { slug: "banca" });
    const usado = aplicarOperaciones(conItems(estado(), it), [{ op: "usar", itemId: it.id }]);
    if (!usado.ok) throw new Error(usado.error);
    const leido = leerContenido(JSON.parse(JSON.stringify(usado.estado.contenido)));
    expect(leido.usadas).toEqual(usado.estado.contenido.usadas);
  });

  it("lo que no tiene la forma queda afuera; las viejas y las de más se caen", () => {
    expect(leerContenido({ usadas: [{ id: "x" }, 3, { id: "y", en: "hoy", item: { id: "otro" } }] }).usadas).toBeUndefined();
    let e = estado();
    for (let i = 0; i < MAX_USADAS + 5; i++) {
      const it = item({ tipo: "casilla", clave: "metas" }, { que: `Meta ${i}` });
      const r = aplicarOperaciones({ ...conItems(e, it), contenido: { ...e.contenido, casillas: {} } }, [{ op: "usar", itemId: it.id }]);
      if (!r.ok) throw new Error(r.error);
      e = r.estado;
    }
    expect(e.contenido.usadas).toHaveLength(MAX_USADAS);
    const it = item({ tipo: "area", areaId: "2" }, {});
    const tresDiasDespues = aplicarOperaciones(conItems(e, it), [{ op: "usar", itemId: it.id }], { por: null, en: "2026-10-31T15:30:00.000Z" });
    expect(tresDiasDespues.ok && tresDiasDespues.estado.contenido.usadas?.map((u) => u.id)).toEqual([it.id]);
  });
});

describe("lo que dice cada «Usar»", () => {
  const nombre = (l: string) => `N${l}`;
  const e = estado({ areas: ["1"] });

  it("dice qué escribe y dónde", () => {
    expect(queHaceUsar({ destino: { tipo: "nivel", dimensionId: "1.3" }, valor: { nivel: "I", fuente: "reunion" } }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Poner Ventas · Dimensión 1.3 en NI");
    const conNivel = estado({ contenido: { ...contenidoVacio(), chequeo: { "1.3": { nivel: "D", fuente: "vendedor" } } } });
    expect(queHaceUsar({ destino: { tipo: "nivel", dimensionId: "1.3" }, valor: { nivel: "F", fuente: "hipotesis" } }, conNivel, ESCALA_DE_PRUEBA, nombre).texto).toBe(
      "Cambiar Ventas · Dimensión 1.3 de ND a NF (como hipótesis)",
    );
    expect(queHaceUsar({ destino: { tipo: "area", areaId: "1" }, valor: {} }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Sumar Ventas a las áreas en juego");
    expect(queHaceUsar({ destino: { tipo: "casilla", clave: "presupuesto" }, valor: "30 mil" }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Escribirlo en «Presupuesto»");
    expect(queHaceUsar({ destino: { tipo: "casilla", clave: "metas" }, valor: { que: "Más" } }, e, ESCALA_DE_PRUEBA, nombre).texto).toMatch(/^Sumar a «/);
    expect(queHaceUsar({ destino: { tipo: "aExplorar", dimensionId: "1.7" }, valor: { motivo: "meta" } }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Marcar Ventas · Dimensión 1.7 para explorar a fondo");
    expect(queHaceUsar({ destino: { tipo: "falta", criterioId: "1.3.F1" }, valor: { estado: "tiene" } }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Marcar «Lo que pide 1.3»: lo tiene");
    expect(queHaceUsar({ destino: { tipo: "casoDeUso", useCaseId: "ia-1" }, valor: { titulo: "Tablero", areaId: null } }, e, ESCALA_DE_PRUEBA, nombre).texto).toBe("Sumar «Tablero» a los casos de uso");
  });

  it("al usar una industria avisa que también cambia el perfil, solo si cambia", () => {
    const escala = {
      ...ESCALA_DE_PRUEBA,
      ediciones: [
        { slug: "banca", nombre: "Banca", descripcion: null, perfilHabitual: { cierre: "con equipo" as const, despues: "continua" as const } },
        { slug: "retail", nombre: "Retail", descripcion: null, perfilHabitual: { cierre: "mixta" as const, despues: "única" as const } },
      ],
    };
    const r = queHaceUsar({ destino: { tipo: "edicion" }, valor: { slug: "banca" } }, e, escala, nombre);
    expect(r.texto).toBe("Medir con la escala de Banca");
    expect(r.aviso).toBe("También cambia el perfil de cierre y de después a Con equipo · Relación continua (hoy: Mixta · Relación única).");
    expect(queHaceUsar({ destino: { tipo: "edicion" }, valor: { slug: "retail" } }, e, escala, nombre).aviso).toBeUndefined();
  });

  it("el lote se llama «Pasar las N al mapa» en La escala y la confirmación es corta", () => {
    expect(etiquetaDelLote("escala", 21)).toBe("Pasar las 21 al mapa");
    expect(etiquetaDelLote("escala", 1)).toBe("Usar la sugerida");
    expect(avisoDelLote("escala", 21)).toBe("Pasaste 21 sugerencias al mapa");
    const r = loQueVaAPasar(
      Array.from({ length: 9 }, (_, i) => ({ texto: `Cosa ${i}`, ...(i === 7 ? { aviso: "También cambia el perfil." } : {}) })),
      6,
    );
    expect(r).toEqual({ lineas: ["Cosa 0", "Cosa 1", "Cosa 2", "Cosa 3", "Cosa 4", "Cosa 5"], mas: 3, avisos: ["También cambia el perfil."] });
  });

  it("«Usadas hoy» son las de hoy en Costa Rica, la más nueva primero", () => {
    const uso = (id: string, en: string) => ({ id, item: item({ tipo: "area", areaId: "2" }, {}), antes: null, despues: null, en, por: null });
    const ahora = new Date("2026-10-28T20:00:00.000Z"); // 2 p. m. en Costa Rica
    // 05:30 UTC del 28 = 23:30 del 27 en Costa Rica: es de ayer.
    expect(usadasDeHoy([uso("a", "2026-10-28T05:30:00.000Z"), uso("b", "2026-10-28T07:00:00.000Z"), uso("c", "2026-10-28T19:00:00.000Z")], ahora).map((u) => u.id)).toEqual(["c", "b"]);
  });
});
