/**
 * Qué falta validar del Diagnóstico de rendimiento, quién lo validó y qué hace «Actualizar con Nexus» (26 nov).
 */
import { describe, expect, it } from "vitest";
import {
  aplicarOperaciones,
  contenidoVacio,
  fusionarPropuestas,
  idDelItem,
  propuestaVacia,
  type DestinoDePropuesta,
  type EstadoDeExploracion,
  type EstimadoGuardado,
  type ItemPropuesto,
  type Operacion,
  type Validez,
} from "./contenido";
import { CambiosSchema, leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { posicionesDelMapa } from "./mapa";
import {
  cuentaDeLaValidacion,
  estadoDeLaParte,
  fraseDeLaValidacion,
  lineaDeLaValidacion,
  marcaDelRiel,
  nombreDeQuienValido,
  paraValidar,
  partesQueCuentan,
  queHaceActualizar,
  validacionDelArea,
  validadoDespues,
} from "./validar-la-escala";

const VALIDEZ: Validez = {
  dimensiones: new Set(["1.1", "1.2", "1.3", "1.4", "2.1"]),
  criterios: new Set(),
  areas: new Set(["1", "2"]),
  ediciones: new Set(),
  escalaVersion: "8.6.0",
};
const MARCO = { por: "marco.perez@smarteam.test", en: "2026-11-26T15:00:00.000Z" };
const aplicar = (e: EstadoDeExploracion, ops: Operacion[], quien = MARCO) => aplicarOperaciones(e, ops, VALIDEZ, VALIDADOR_ESTRICTO, quien);

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

function item(destino: DestinoDePropuesta, valor: unknown): ItemPropuesto {
  return { id: idDelItem(destino, valor), destino, valor, fuentes: [{ id: "S1", etiqueta: "Reunión del martes", cita: "lo dijo" }], corridaId: "run-1", en: "2026-11-20T00:00:00.000Z" };
}
const nivel = (dimensionId: string, v: EstimadoGuardado) => item({ tipo: "nivel", dimensionId }, v);

/** Las áreas de la escala, en corto: dos áreas, la 1 con cuatro partes (la 1.4 no aplica) y la 2 con una. */
const AREAS = [
  { id: "1", dimensiones: [{ id: "1.1", aplica: true }, { id: "1.2", aplica: true }, { id: "1.3", aplica: true }, { id: "1.4", aplica: false }] },
  { id: "2", dimensiones: [{ id: "2.1", aplica: true }] },
];

/** Lo que ve la pantalla: el mapa, las partes que cuentan, lo que hay que validar y la cuenta. */
function pantalla(e: EstadoDeExploracion) {
  const pendientes = e.propuesta.items;
  const posiciones = posicionesDelMapa(e, pendientes);
  const partes = partesQueCuentan(AREAS, e.areas, posiciones);
  // Como el lienzo: lo pendiente que no es una hipótesis de nivel (las hipótesis salen del mapa).
  const revisables = pendientes.filter((it) => !(it.destino.tipo === "nivel" && ["test", "hipotesis"].includes((it.valor as EstimadoGuardado).fuente)));
  return {
    posiciones,
    partes,
    items: paraValidar({ partes, posiciones, revisablesDeLaEscala: revisables }),
    cuenta: cuentaDeLaValidacion({ partes, posiciones, confirmado: e.contenido.chequeo, pendientes: revisables }),
  };
}

describe("el estado de cada parte: propuesta (sin rótulo), validada o sin dato", () => {
  it("lo que propuso Nexus y nadie usó está por validar; lo confirmado, validado; sin nada, sin dato", () => {
    const e = estado({
      contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" } } },
      propuesta: fusionarPropuestas(estado(), [nivel("1.2", { nivel: "I", fuente: "hipotesis" })]),
    });
    const { posiciones } = pantalla(e);
    expect(estadoDeLaParte(posiciones["1.1"])).toBe("validada");
    expect(estadoDeLaParte(posiciones["1.2"])).toBe("propuesta");
    expect(estadoDeLaParte(posiciones["1.3"])).toBe("sinDato");
  });

  it("lo que dijo el cliente encima de una hipótesis ya usada vuelve a estar por validar", () => {
    const e = estado({
      contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "I", fuente: "hipotesis" } } },
      propuesta: fusionarPropuestas(estado(), [nivel("1.1", { nivel: "F", fuente: "reunion" })]),
    });
    expect(estadoDeLaParte(pantalla(e).posiciones["1.1"])).toBe("propuesta");
  });
});

describe("qué falta validar", () => {
  const e = estado({
    areas: ["1"],
    contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion", validada: MARCO } } },
    propuesta: fusionarPropuestas(estado(), [
      nivel("1.3", { nivel: "D", fuente: "reunion" }),
      nivel("1.2", { nivel: "I", fuente: "hipotesis" }),
      item({ tipo: "area", areaId: "2" }, { enJuego: true, razon: "Paga Service Hub" }),
    ]),
  });

  it("cuentan las partes que aplican de las áreas en juego o con algo; la que no aplica, no", () => {
    expect(pantalla(e).partes).toEqual(["1.1", "1.2", "1.3"]);
  });

  it("se recorre en el orden de la escala, y después lo demás de la pieza, sin repetir", () => {
    const ids = pantalla(e).items.map((it) => (it.destino.tipo === "nivel" ? it.destino.dimensionId : it.destino.tipo));
    expect(ids).toEqual(["1.2", "1.3", "area"]);
  });

  it("«Faltan 2 de 3 por validar · 1 cambio más», y el riel dice 3 con su porqué", () => {
    const { cuenta } = pantalla(e);
    expect(cuenta).toMatchObject({ porValidar: 2, validadas: 1, sinDato: 0, conAlgo: 3, otras: 1 });
    expect(lineaDeLaValidacion(cuenta)).toEqual({ texto: "Faltan 2 de 3 por validar · 1 cambio más", completa: false });
    expect(marcaDelRiel(cuenta)).toEqual({ corto: "3", largo: "2 partes y 1 cambio por validar", estado: "pendiente" });
  });

  it("con todas las partes validadas y solo otro cambio, «Falta validar 1 cambio» (sin un «más» que sobra)", () => {
    const solo = estado({
      contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" }, "1.2": { nivel: "F", fuente: "reunion" }, "1.3": { nivel: "F", fuente: "reunion" } } },
      propuesta: fusionarPropuestas(estado(), [item({ tipo: "area", areaId: "2" }, { enJuego: true, razon: "Paga Service Hub" })]),
    });
    expect(lineaDeLaValidacion(pantalla(solo).cuenta)?.texto).toBe("Falta validar 1 cambio");
  });

  it("sin nada propuesto ni validado no hay línea, y el riel queda vacío", () => {
    const c = pantalla(estado()).cuenta;
    expect(lineaDeLaValidacion(c)).toBeNull();
    expect(marcaDelRiel(c)).toMatchObject({ corto: "", estado: "vacia" });
  });
});

describe("quién validó", () => {
  it("usar lo que propuso Nexus guarda quién y cuándo, y la línea lo dice cuando no falta nada", () => {
    const h = nivel("1.2", { nivel: "I", fuente: "hipotesis" });
    const r = aplicar(estado({ propuesta: fusionarPropuestas(estado(), [h]) }), [{ op: "usar", itemId: h.id }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.estado.contenido.chequeo["1.2"]).toEqual({ nivel: "I", fuente: "hipotesis", validada: MARCO });
    const { cuenta } = pantalla(r.estado);
    expect(cuenta).toMatchObject({ porValidar: 0, validadas: 1, sinDato: 2, quienes: [MARCO.por], ultima: MARCO.en });
    expect(lineaDeLaValidacion(cuenta)).toEqual({ texto: "Validado por Marco · 26 nov · 2 sin dato", completa: true });
    expect(marcaDelRiel(cuenta)).toEqual({ corto: "✓", largo: "Todo validado · 2 sin dato", estado: "generada" });
  });

  it("marcar el nivel a mano también lo guarda; la persona que manda el cambio no lo puede inventar", () => {
    const r = aplicar(estado(), [{ op: "nivel", dimensionId: "1.1", estimado: { nivel: "E", fuente: "vendedor", validada: { por: "otra@x.test", en: "2020-01-01T00:00:00.000Z" } } }]);
    expect(r.ok && r.estado.contenido.chequeo["1.1"].validada).toEqual(MARCO);
  });

  it("deshacer un uso devuelve lo de antes, sin la marca de quien lo usó", () => {
    const h = nivel("1.2", { nivel: "I", fuente: "hipotesis" });
    const usado = aplicar(estado({ propuesta: fusionarPropuestas(estado(), [h]) }), [{ op: "usar", itemId: h.id }]);
    if (!usado.ok) throw new Error(usado.error);
    const deshecho = aplicar(usado.estado, [{ op: "deshacerUso", ids: [h.id] }]);
    expect(deshecho.ok).toBe(true);
    if (!deshecho.ok) return;
    expect(deshecho.estado.contenido.chequeo["1.2"]).toBeUndefined();
    expect(deshecho.estado.propuesta.items.map((it) => it.id)).toContain(h.id);
  });

  it("«copia» (lo medido que se copia de la preventa) no pasa el esquema de la pantalla: nadie se salta la marca", () => {
    const r = CambiosSchema.parse({ version: 1, operaciones: [{ op: "nivel", dimensionId: "1.1", estimado: { nivel: "F", fuente: "vendedor" }, copia: true }] });
    expect(r.operaciones[0]).not.toHaveProperty("copia");
    // Lo que sí entra por el servidor, tal cual: con la marca de allá (o sin ninguna).
    const allá = { por: "ana.rojas@smarteam.test", en: "2026-11-01T00:00:00.000Z" };
    const copiado = aplicar(estado(), [{ op: "nivel", dimensionId: "1.1", estimado: { nivel: "F", fuente: "reunion", validada: allá }, copia: true }]);
    expect(copiado.ok && copiado.estado.contenido.chequeo["1.1"].validada).toEqual(allá);
  });

  it("validar después de armar el Resumen lo deja atrás", () => {
    const c = { "1.1": { validada: MARCO } };
    expect(validadoDespues(c, "2026-11-25T00:00:00.000Z")).toBe(true);
    expect(validadoDespues(c, "2026-11-27T00:00:00.000Z")).toBe(false);
    expect(validadoDespues(c, null)).toBe(false);
    expect(validadoDespues({ "1.1": {} }, "2026-11-25T00:00:00.000Z")).toBe(false);
  });

  it("la marca sobrevive a leer lo guardado", () => {
    const c = leerContenido({ chequeo: { "1.1": { nivel: "F", fuente: "reunion", validada: MARCO } } });
    expect(c.chequeo["1.1"].validada).toEqual(MARCO);
  });

  it("con varias personas, las nombra (la más reciente primero); lo de antes de la marca valida sin nombre", () => {
    const base = { partes: ["1.1", "1.2", "1.3"], pendientes: [] };
    const posiciones = posicionesDelMapa(
      estado({ contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" }, "1.2": { nivel: "F", fuente: "reunion" }, "1.3": { nivel: "F", fuente: "reunion" } } } }),
      [],
    );
    const varias = cuentaDeLaValidacion({
      ...base,
      posiciones,
      confirmado: { "1.1": { validada: MARCO }, "1.2": { validada: { por: "ana.rojas@smarteam.test", en: "2026-11-27T10:00:00.000Z" } }, "1.3": {} },
    });
    expect(lineaDeLaValidacion(varias)?.texto).toBe("Validado por Ana y Marco · 27 nov");
    expect(lineaDeLaValidacion(varias, "ana.rojas@smarteam.test")?.texto).toBe("Validado por ti y Marco · 27 nov");
    const sinMarca = cuentaDeLaValidacion({ ...base, posiciones, confirmado: {} });
    expect(lineaDeLaValidacion(sinMarca)?.texto).toBe("Validado");
  });

  it("el nombre sale del correo", () => {
    expect(nombreDeQuienValido("marco.perez@smarteam.test")).toBe("Marco");
    expect(nombreDeQuienValido("lucia_v@x.test")).toBe("Lucia");
    expect(nombreDeQuienValido("Yo@x.test", "yo@x.test")).toBe("ti");
  });
});

describe("la cuenta de cada área", () => {
  it("«1 validada · 1 por validar · 1 sin dato»; con `de`, «1 de 3 validadas»", () => {
    const e = estado({
      contenido: { ...contenidoVacio(), chequeo: { "1.1": { nivel: "F", fuente: "reunion" } } },
      propuesta: fusionarPropuestas(estado(), [nivel("1.2", { nivel: "I", fuente: "hipotesis" })]),
    });
    const c = validacionDelArea(AREAS[0].dimensiones, pantalla(e).posiciones);
    expect(c).toEqual({ validadas: 1, porValidar: 1, sinDato: 1 });
    expect(fraseDeLaValidacion(c)).toBe("1 validada · 1 por validar · 1 sin dato");
    expect(fraseDeLaValidacion(c, 3)).toBe("1 de 3 validadas · 1 por validar · 1 sin dato");
  });
});

describe("«Actualizar con Nexus» hace cumplir el orden: ubicar → validar → rehacer el Resumen", () => {
  const alDia = { estado: "alDia" as const, boton: { fuerte: false } };
  const resumen = { hay: true, corriendo: false, detenida: false, atrasado: false };

  it("una cuenta con niveles copiados de la preventa, nunca ubicada y sin Resumen: ubica primero, no arma el Resumen", () => {
    expect(queHaceActualizar({ linea: { estado: "sinUbicar", boton: { fuerte: true } }, porValidar: 0, validadas: 8, resumen: { ...resumen, hay: false } })).toMatchObject({
      accion: "ubicar",
      fuerte: true,
    });
  });

  it("con Nexus trabajando, espera", () => {
    expect(queHaceActualizar({ linea: { estado: "ubicando", boton: { fuerte: false } }, porValidar: 0, validadas: 3, resumen }).accion).toBe("esperar");
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 3, resumen: { ...resumen, corriendo: true } }).accion).toBe("esperar");
  });

  it("con algo que la escala no leyó, ubica primero (aunque el Resumen esté atrasado)", () => {
    const que = queHaceActualizar({ linea: { estado: "nuevas", boton: { fuerte: true } }, porValidar: 0, validadas: 3, resumen: { ...resumen, atrasado: true } });
    expect(que).toMatchObject({ accion: "ubicar", fuerte: true });
    // Una reunión que cambió de clase también se vuelve a ubicar antes del Resumen.
    expect(queHaceActualizar({ linea: { estado: "resumenAtrasado", boton: { fuerte: true } }, porValidar: 0, validadas: 3, resumen }).accion).toBe("ubicar");
  });

  it("con algo por validar no rehace el Resumen, y no se destaca (lo que sigue es «Validar»)", () => {
    expect(queHaceActualizar({ linea: alDia, porValidar: 2, validadas: 3, resumen: { ...resumen, atrasado: true } })).toMatchObject({ accion: "ubicar", fuerte: false });
    expect(queHaceActualizar({ linea: { estado: "nuevas", boton: { fuerte: true } }, porValidar: 2, validadas: 3, resumen }).fuerte).toBe(false);
  });

  it("sin nada por validar: arma el Resumen que falta, o rehace el que quedó atrás", () => {
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 3, resumen: { ...resumen, hay: false } })).toMatchObject({ accion: "resumen", fuerte: true, queHace: "Arma el Resumen" });
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 3, resumen: { ...resumen, atrasado: true } })).toMatchObject({ accion: "resumen", queHace: "Rehace el Resumen" });
    expect(queHaceActualizar({ linea: { estado: "resumenAtrasado", boton: { fuerte: false } }, porValidar: 0, validadas: 3, resumen }).accion).toBe("resumen");
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 3, resumen: { ...resumen, detenida: true } }).accion).toBe("resumen");
  });

  it("sin nada validado no arma un Resumen vacío; al día, vuelve a ubicar sin destacarse", () => {
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 0, resumen: { ...resumen, hay: false } }).accion).toBe("ubicar");
    expect(queHaceActualizar({ linea: alDia, porValidar: 0, validadas: 3, resumen })).toMatchObject({ accion: "ubicar", fuerte: false });
  });
});
