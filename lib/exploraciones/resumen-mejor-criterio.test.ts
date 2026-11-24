/**
 * lib/exploraciones/resumen-mejor-criterio.test.ts — el Resumen de la escala con mejor criterio (24 nov, Marco con Centauro;
 * DECISIONS «El Resumen con mejor criterio»). Correr: `npx vitest run lib/exploraciones/resumen-mejor-criterio.test.ts --project unit`.
 *
 * El caso tiene la FORMA de Centauro sin sus datos (todo inventado): tres equipos, Marketing que se queja de Ventas, las
 * cifras 85, 180, 25 y 10, y un sistema sin integración que la empresa ya resolvió exportando a Excel. Cuida:
 *   1. que el problema principal pueda cruzar equipos y que «comercial» no salga;
 *   2. que Marketing no quede solo en medición (el piso por equipo) y que lo que un equipo dice de otro vaya en los dos;
 *   3. que la cuenta «calculado» la haga el CÓDIGO, que rechace un número sin cita, y que afuera salga solo confirmada;
 *   4. que lo resuelto quede fuera (lo pide el prompt);
 *   5. que no salga el texto genérico de la escala.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import RecorridoDelCliente, { conTraspasos, enLineas, traspasosDibujables } from "@/components/external/test/RecorridoDelCliente";
import { parseObject } from "@/lib/ai/section-schema";
import type { Escala } from "@/lib/escala/documento/tipos";
import type { EtapaDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { detallesDelResultado } from "@/lib/tests-diagnostico/detalle-de-la-dimension";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import type { EstadoDeExploracion } from "./contenido";
import { cuentaConTusCifras } from "./cuenta-con-tus-cifras";
import { areaParaLaDescripcion } from "./descripcion-de-la-escala";
import { partesConAlgoVisto } from "./escala-para-el-cliente";
import { leerContenido } from "./esquemas";
import { calcularLaPerdida } from "./perdida";
import { perdidaDeLaEscala } from "./perdida-de-la-escala";
import { reunionesParaUbicar } from "./posicionar";
import {
  avisosDelPiso,
  calculadaConSusCitas,
  editarElResumen,
  equiposBajoElPiso,
  loQueEncontroElResumen,
  partesConCitaDelResumen,
  escribirElResumen,
  leerElResumen,
  pedidoDelResumen,
  problemasDelCalculado,
  quitarLoQueNoPasa,
  resumenParaLaPagina,
  textoValido,
  type AreaOperativa,
  type ContextoDelResumen,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

// ── La empresa inventada: Hospedajes del Valle, con la forma de Centauro ─────────────────────────────────────────

const VENTAS_R: ReunionParaElResumen = {
  id: "fx_ventas",
  clave: "R1",
  fecha: "2026-11-06T20:00:00.000Z",
  equipo: "Ventas",
  areaId: "1",
  delCliente: ["Andrea Mora"],
  deSmarteam: ["Pablo Ruiz"],
  turnos: [
    { n: 10, hablante: "Andrea Mora", texto: "cerramos unos 25 clientes nuevos al mes, más o menos, con todo el equipo de ventas." },
    { n: 12, hablante: "Andrea Mora", texto: "cada cliente nos paga 85 dólares al mes por la suscripción de cada propiedad." },
    { n: 14, hablante: "Andrea Mora", texto: "los asesores no registran sus llamadas, cada uno anota en su libreta lo que quiere." },
  ],
};
const MARKETING_R: ReunionParaElResumen = {
  id: "fx_marketing",
  clave: "R2",
  fecha: "2026-11-11T16:00:00.000Z",
  equipo: "Marketing",
  areaId: "2",
  delCliente: ["Carla Vega"],
  deSmarteam: ["Pablo Ruiz"],
  turnos: [
    { n: 30, hablante: "Carla Vega", texto: "nos entran unos 180 leads al mes entre la pauta y el formulario de la web." },
    { n: 32, hablante: "Carla Vega", texto: "hay un montón de leads que desaparecen y no tengo información del equipo de ventas." },
    { n: 34, hablante: "Carla Vega", texto: "me suben y me bajan los leads, depende cómo se sienta el equipo de ventas, ellos no me dicen." },
    { n: 36, hablante: "Carla Vega", texto: "medimos todo con las campañas, tenemos el reporte de cada pauta cada semana." },
  ],
};
const SERVICIO_R: ReunionParaElResumen = {
  id: "fx_servicio",
  clave: "R3",
  fecha: "2026-11-09T15:00:00.000Z",
  equipo: "Servicio",
  areaId: "3",
  delCliente: ["Diego Soto"],
  deSmarteam: ["Pablo Ruiz"],
  turnos: [
    { n: 50, hablante: "Diego Soto", texto: "se nos van unos 10 clientes al mes porque nadie les da seguimiento después de la venta." },
    { n: 52, hablante: "Diego Soto", texto: "la extranet no tiene API, pero exportamos todo a Excel cada semana y con eso nos basta." },
    { n: 54, hablante: "Pablo Ruiz", texto: "o sea que se les van como 12 clientes cada mes, más o menos" },
    { n: 55, hablante: "Diego Soto", texto: "Mm." },
    { n: 56, hablante: "Diego Soto", texto: "cobramos 85 colones por cada reserva que pasa por la extranet." },
  ],
};

const DIMS = (area: string, ...xs: [string, string, boolean][]) => xs.map(([id, nombre, porExplorar]) => ({ id: `${area}.${id}`, nombre, capa: "Base operativa", nivel: "Inicial", porExplorar }));
const CTX: ContextoDelResumen = {
  empresa: "Hospedajes del Valle",
  reuniones: [VENTAS_R, SERVICIO_R, MARKETING_R],
  instrucciones: "",
  areas: [
    { id: "1", nombre: "Ventas", nivel: "Inicial", arriba: "Funcional", abajo: "Deficiente", loQueMasFrena: null, dimensiones: DIMS("1", ["7", "Actividad", false]), contexto: null },
    { id: "2", nombre: "Marketing", nivel: "Inicial", arriba: "Funcional", abajo: "Deficiente", loQueMasFrena: null, dimensiones: DIMS("2", ["1", "Procesos", true], ["5", "Medición", false]), contexto: null },
    { id: "3", nombre: "Servicio", nivel: "Inicial", arriba: "Funcional", abajo: "Deficiente", loQueMasFrena: null, dimensiones: DIMS("3", ["2", "Retención", false]), contexto: null },
  ],
};
const REGLAS = { personas: ["Andrea Mora", "Carla Vega", "Diego Soto", "Pablo Ruiz"], parse: parseObject, firmas: {} };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });
const C = (reunion: string, turno: number, texto: string) => ({ reunion, turno, texto });
const uso = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: null, service_tier: null };

/** Un Resumen del formato 2 vacío, con sus sesiones. */
const guardadoVacio = (reuniones: readonly ReunionParaElResumen[]): ResumenGuardado => ({
  v: 2,
  at: "2026-11-24T12:00:00.000Z",
  por: null,
  modelo: "x",
  agentRunId: null,
  hicimos: { sesiones: reuniones.map((r) => ({ fecha: r.fecha, equipo: r.equipo, minutos: 60, areaId: r.areaId ?? null, quienes: r.delCliente.map((x) => x.toLowerCase()) })), personas: reuniones.length, texto: null },
  datosRojos: [],
  areas: {},
  entendimos: [],
  falta: [],
});

// ── 1 · El problema principal cruza equipos ───────────────────────────────────────────────────────────────────

describe("1 · el problema principal cruza equipos y los equipos se nombran como en la escala", () => {
  it("el prompt busca primero el dolor que cruza equipos y prohíbe «comercial»", () => {
    const { system } = pedidoDelResumen(CTX);
    expect(system).toMatch(/PRIMERO busca el dolor que CRUZA EQUIPOS/);
    expect(system).toMatch(/citas de reuniones DISTINTAS/);
    expect(system).toMatch(/Nunca «comercial»/);
  });

  it("«el equipo comercial» no sale y se pide corregido (es de forma); «la propuesta comercial» no es un equipo", () => {
    const r = textoValido("El equipo comercial no registra sus actividades.", 280, REGLAS);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motivo).toMatch(/comercial/);
    expect(textoValido("Enviar la propuesta comercial el mismo día", 280, REGLAS).ok).toBe(true);
    // Si un equipo de la escala se llama así (otra edición), vale.
    expect(textoValido("El área comercial no registra sus llamadas.", 280, { ...REGLAS, equipos: ["Comercial"] }).ok).toBe(true);
    const e = leerElResumen(
      responde({ negocio: { tesis: [{ texto: "El equipo comercial no registra. Los leads desaparecen.", citas: [C("R1", 14, "los asesores no registran sus llamadas, cada uno anota en su libreta"), C("R2", 32, "hay un montón de leads que desaparecen y no tengo información")] }] }, areas: [] }),
      CTX,
      REGLAS,
    );
    expect(e.negocio.tesis).toBeUndefined();
    expect(e.piezasPorArreglar.map((p) => p.lugar)).toContain("negocio:tesis");
  });

  it("una tesis que cruza equipos, con citas de dos reuniones distintas, pasa la verificación", () => {
    const e = leerElResumen(
      responde({
        negocio: { tesis: [{ texto: "Los leads se pierden entre Marketing y Ventas. Nadie avisa qué pasó.", citas: [C("R2", 32, "hay un montón de leads que desaparecen y no tengo información del equipo de ventas"), C("R2", 34, "depende cómo se sienta el equipo de ventas, ellos no me dicen")] }] },
        areas: [],
      }),
      CTX,
      REGLAS,
    );
    expect(e.negocio.tesis?.[0].texto).toMatch(/Marketing y Ventas/);
    expect(e.negocio.tesis?.[0].texto).not.toMatch(/comercial/i);
  });
});

// ── 2 · Cada equipo con su peso ───────────────────────────────────────────────────────────────────────────────

const operativa = (x: Partial<AreaOperativa> & Pick<AreaOperativa, "id" | "nombre" | "areaId">): AreaOperativa => ({ organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null, ...x });

describe("2 · cada equipo con su peso: el piso, el traspaso y el cupo de reuniones", () => {
  it("Marketing con solo una cifra de medición queda bajo el piso; Ventas con su reto principal y dos retos, no", () => {
    const cita = { reunion: VENTAS_R.id, fecha: VENTAS_R.fecha, turno: 14, hablante: "Andrea Mora", texto: "los asesores no registran sus llamadas" };
    const ops = [
      operativa({ id: "o1", nombre: "Ventas", areaId: "1", frena: [{ id: "f1", texto: "Ventas no registra sus llamadas", citas: [cita] }], retos: [1, 2].map((k) => ({ id: `t${k}`, texto: `Reto ${k} de ventas`, citas: [cita], dimensionId: null })) }),
      operativa({ id: "o2", nombre: "Marketing", areaId: "2" }),
    ];
    // Servicio tuvo reunión y no tiene nada; Marketing tampoco. Ventas llega al piso.
    expect(equiposBajoElPiso(ops, CTX)).toEqual(["3", "2"]);
  });

  it("el agente deja a Marketing solo en medición: el piso lo pide leyendo su reunión y el traspaso va también a Ventas", async () => {
    const principal = {
      negocio: { tesis: [{ texto: "Los leads se pierden entre Marketing y Ventas. Nadie avisa qué pasó.", citas: [C("R2", 32, "hay un montón de leads que desaparecen y no tengo información del equipo de ventas"), C("R2", 34, "depende cómo se sienta el equipo de ventas, ellos no me dicen")] }] },
      areas: [
        {
          nombre: "Ventas",
          area: "1",
          frena: [{ texto: "Las llamadas de ventas no quedan registradas", citas: [C("R1", 14, "los asesores no registran sus llamadas, cada uno anota en su libreta lo que quiere")] }],
          retos: [
            { texto: "Registrar cada llamada de los asesores", dimension: "1.7", citas: [C("R1", 14, "los asesores no registran sus llamadas, cada uno anota en su libreta")] },
            { texto: "Dejar de anotar en libretas personales", dimension: "1.7", citas: [C("R1", 14, "cada uno anota en su libreta lo que quiere")] },
          ],
        },
        { nombre: "Marketing", area: "2", cifras: [{ cifra: "180", texto: "leads al mes", estado: "declarado", citas: [C("R2", 30, "nos entran unos 180 leads al mes entre la pauta")] }] },
        { nombre: "Servicio", area: "3", frena: [{ texto: "Clientes que se van sin seguimiento", citas: [C("R3", 50, "se nos van unos 10 clientes al mes porque nadie les da seguimiento")] }], retos: [{ texto: "Dar seguimiento a cada cliente después de la venta", citas: [C("R3", 50, "nadie les da seguimiento después de la venta")] }, { texto: "Retener a los clientes de cada mes", citas: [C("R3", 50, "se nos van unos 10 clientes al mes porque nadie")] }] },
      ],
    };
    const piso = {
      frena: [{ texto: "Los leads desaparecen sin noticias de Ventas", citas: [C("R2", 32, "hay un montón de leads que desaparecen y no tengo información del equipo de ventas")] }],
      retos: [
        { texto: "Saber qué pasa con cada lead que entrega", dimension: "2.1", traspaso: "1", citas: [C("R2", 34, "me suben y me bajan los leads, depende cómo se sienta el equipo de ventas, ellos no me dicen")] },
        { texto: "Conocer el resultado de cada lead entregado", traspaso: "1", citas: [C("R2", 32, "hay un montón de leads que desaparecen y no tengo información")] },
      ],
    };
    const pedidos: string[] = [];
    const e = await escribirElResumen({ ctx: CTX, personas: REGLAS.personas, firmas: {} }, async (p) => {
      const system = String(p.system);
      pedidos.push(system.slice(0, 40));
      const cuerpo = system.startsWith("Completas, para una página") ? piso : system.startsWith("Completas el recorrido") ? { etapas: [] } : principal;
      return { ...responde(cuerpo), stop_reason: "end_turn", usage: uso } as never;
    });
    // Se pidió el piso de Marketing (una llamada chica, con su reunión).
    expect(pedidos.some((x) => x.startsWith("Completas, para una página"))).toBe(true);
    const marketing = e.operativas.filter((x) => x.areaId === "2");
    expect(marketing.flatMap((x) => x.frena)).toHaveLength(1);
    expect(marketing.flatMap((x) => x.retos).length).toBeGreaterThanOrEqual(2);
    // Marketing no quedó solo en medición: tiene su cifra Y lo que le duele.
    expect(marketing.flatMap((x) => x.cifras).map((c) => c.cifra)).toEqual(["180"]);
    // Lo que Marketing dijo de Ventas queda UNA vez, en Marketing, marcado como del traspaso a Ventas.
    const delTraspaso = marketing.flatMap((x) => x.retos).filter((r) => r.traspaso === "1");
    expect(delTraspaso.length).toBeGreaterThanOrEqual(1);
    expect(e.operativas.find((x) => x.areaId === "1")!.retos.some((r) => r.traspaso)).toBe(false);
    expect(e.avisos.filter((a) => /reto principal/.test(a))).toEqual([]);
  });

  it("el reto del traspaso se guarda una vez y sale en los dos equipos con la misma clave; quitarlo lo quita de los dos", () => {
    const cita = { reunion: MARKETING_R.id, fecha: MARKETING_R.fecha, turno: 34, hablante: "Carla Vega", texto: "ellos no me dicen" };
    const g: ResumenGuardado = {
      ...guardadoVacio([MARKETING_R, VENTAS_R]),
      operativas: [
        operativa({ id: "o1", nombre: "Ventas", areaId: "1", frena: [{ id: "f1", texto: "Las llamadas no se registran", citas: [cita] }] }),
        operativa({ id: "o2", nombre: "Marketing", areaId: "2", retos: [{ id: "t1", texto: "Saber qué pasa con cada lead entregado", citas: [cita], dimensionId: null, traspaso: "1" }] }),
      ],
    };
    const pagina = (x: ResumenGuardado) => resumenParaLaPagina(x, [resultadoMinimo("1", "Ventas"), resultadoMinimo("2", "Marketing")], {}, { escalaVersion: "9.0.0" }, { conCitas: false });
    const retosDe = (p: ReturnType<typeof pagina>, area: string) => p.tarjetas.find((t) => t.areaId === area)!.subequipos[0].retos.piezas;
    expect(retosDe(pagina(g), "1").map((x) => x.clave)).toEqual(["op:o2:reto:t1"]);
    expect(retosDe(pagina(g), "2").map((x) => x.clave)).toEqual(["op:o2:reto:t1"]);
    // Lo encuentra también la descripción de Ventas (lo que otro equipo dijo de ella).
    expect(loQueEncontroElResumen(g, "1")).toContain("Lo que lo causa: Saber qué pasa con cada lead entregado");
    // Cuenta para el piso de Ventas: su reto principal y este (más uno propio) ya no la dejan abajo.
    const r = editarElResumen(g, "op:o2:reto:t1", null, { firmaDe: () => "", areas: new Set(["1", "2"]), en: "2026-11-24T12:00:00.000Z" });
    if (!r.ok) throw new Error(r.error);
    expect(retosDe(pagina(r.resumen), "1")).toEqual([]);
    expect(retosDe(pagina(r.resumen), "2")).toEqual([]);
  });

  it("el piso cuenta lo que otro equipo dijo de este (un reto del traspaso se ve en su fila)", () => {
    const cita = { reunion: VENTAS_R.id, fecha: VENTAS_R.fecha, turno: 14, hablante: "Andrea Mora", texto: "los asesores no registran sus llamadas" };
    const reto = (id: string, traspaso?: string) => ({ id, texto: `Reto ${id}`, citas: [cita], dimensionId: null, ...(traspaso ? { traspaso } : {}) });
    const ventas = operativa({ id: "o1", nombre: "Ventas", areaId: "1", frena: [{ id: "f1", texto: "x", citas: [cita] }], retos: [reto("t1")] });
    const ctx = { areas: CTX.areas, reuniones: [VENTAS_R] };
    expect(equiposBajoElPiso([ventas, operativa({ id: "o2", nombre: "Marketing", areaId: "2" })], ctx)).toEqual(["1"]);
    expect(equiposBajoElPiso([ventas, operativa({ id: "o2", nombre: "Marketing", areaId: "2", retos: [reto("t9", "1")] })], ctx)).toEqual([]);
  });

  it("el aviso del piso: un equipo con reunión que quedó sin reto principal se avisa adentro", () => {
    expect(avisosDelPiso([operativa({ id: "o1", nombre: "Marketing", areaId: "2" })], { areas: CTX.areas, reuniones: [MARKETING_R] })).toEqual([
      "Marketing tuvo su reunión y quedó sin su reto principal o con menos de 2 retos: revísalo o rehaz el Resumen.",
    ]);
  });

  it("el cupo: cada equipo se lleva sus reuniones aunque Ventas tenga las más nuevas", () => {
    const r = (id: string, dia: number) => ({ id, origen: "meet", fecha: `2026-11-${String(dia).padStart(2, "0")}T15:00:00.000Z` });
    const todas = [r("v1", 20), r("v2", 19), r("v3", 18), r("v4", 17), r("m1", 5), r("s1", 4)];
    const equipo: Record<string, string> = { v1: "ventas", v2: "ventas", v3: "ventas", v4: "ventas", m1: "marketing", s1: "servicio" };
    const deSesiones = new Set(todas.map((x) => `meet:${x.id}`));
    expect(reunionesParaUbicar(todas, deSesiones, 4)).toEqual(["v1", "v2", "v3", "v4"]);
    expect(reunionesParaUbicar(todas, deSesiones, 4, { porEquipo: 2, equipoDe: (id) => equipo[id] })).toEqual(["v1", "v2", "m1", "s1"]);
    // Un equipo que el cliente no ve no ocupa lugar (antes se leía y se descartaba después).
    expect(reunionesParaUbicar(todas, deSesiones, 4, { porEquipo: 2, equipoDe: (id) => equipo[id], sinLugar: new Set(["marketing"]) })).toEqual(["v1", "v2", "v3", "s1"]);
  });
});

// ── 3 · La cuenta con tus cifras ──────────────────────────────────────────────────────────────────────────────

describe("3 · la cuenta «calculado» la hace el código con las cifras de la empresa", () => {
  const cifraDelAgente = (x: Record<string, unknown> = {}) => ({
    estado: "calculado",
    cifra: "US$ 900",
    texto: "al mes en clientes que se van",
    cuenta: [
      { valor: "10", rotulo: "clientes que se van al mes", cita: C("R3", 50, "se nos van unos 10 clientes al mes porque nadie les da seguimiento") },
      { valor: "US$ 85", rotulo: "de suscripción", cita: C("R1", 12, "cada cliente nos paga 85 dólares al mes por la suscripción") },
    ],
    ...x,
  });

  it("la cuenta: multiplica, dice la cuenta a la vista y rechaza dos montos o dos períodos", () => {
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "clientes que se van al mes" }, { valor: "US$ 85", rotulo: "de suscripción" }])).toMatchObject({
      ok: true,
      cifra: "US$ 850",
      texto: "10 clientes que se van × US$ 85 de suscripción = US$ 850 al mes",
    });
    expect(cuentaConTusCifras([{ valor: "180", rotulo: "leads al mes" }, { valor: "14 %", rotulo: "de conversión" }])).toMatchObject({ ok: true, cifra: "25,2" });
    expect(cuentaConTusCifras([{ valor: "US$ 85", rotulo: "" }, { valor: "US$ 10", rotulo: "" }]).ok).toBe(false);
    // El mismo período en dos factores vale; dos distintos, no.
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "clientes que se van al mes" }, { valor: "US$ 85", rotulo: "de cuota al mes" }])).toMatchObject({ ok: true, texto: "10 clientes que se van × US$ 85 de cuota = US$ 850 al mes" });
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "al mes" }, { valor: "85", rotulo: "por semana" }]).ok).toBe(false);
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "clientes" }]).ok).toBe(false);
    // Un rango o una proporción no son UN número: la cuenta saldría del primero.
    expect(cuentaConTusCifras([{ valor: "120 a 150", rotulo: "leads" }, { valor: "US$ 85", rotulo: "" }])).toMatchObject({ ok: false, motivo: expect.stringMatching(/rango/) });
    expect(cuentaConTusCifras([{ valor: "9 de 30", rotulo: "" }, { valor: "US$ 85", rotulo: "" }]).ok).toBe(false);
    // El «=» dice el resultado exacto: el cliente puede rehacer la multiplicación.
    expect(cuentaConTusCifras([{ valor: "47", rotulo: "clientes" }, { valor: "US$ 1.250", rotulo: "" }])).toMatchObject({ cifra: "US$ 58.750" });
    // Con centavos, exacto: 9 × US$ 12,50 = US$ 112,50 (no «113»).
    expect(cuentaConTusCifras([{ valor: "9", rotulo: "reservas" }, { valor: "US$ 12,50", rotulo: "" }])).toMatchObject({ cifra: "US$ 112,50" });
    // «anual» y «al mes» son dos períodos; «mensual» y «al mes», el mismo.
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "clientes al mes" }, { valor: "US$ 85", rotulo: "de cuota anual" }]).ok).toBe(false);
    expect(cuentaConTusCifras([{ valor: "10", rotulo: "clientes al mes" }, { valor: "US$ 85", rotulo: "de cuota mensual" }])).toMatchObject({ ok: true, texto: "10 clientes × US$ 85 de cuota = US$ 850 al mes" });
  });

  it("el número lo pone el código, no el modelo (el agente dijo 900; con sus cifras es 850)", () => {
    const k = calculadaConSusCitas(cifraDelAgente(), CTX, REGLAS);
    expect(k.ok).toBe(true);
    if (!k.ok) return;
    expect(k.cifra.cifra).toBe("US$ 850");
    expect(k.cifra.estado).toBe("calculado");
    expect(k.cifra.cuenta?.texto).toBe("10 clientes que se van × US$ 85 de suscripción = US$ 850 al mes");
    expect(k.cifra.citas.map((c) => c.reunion)).toEqual([SERVICIO_R.id, VENTAS_R.id]);
  });

  it("rechaza un número sin cita, uno que su cita no dice, y lo que dijo Smarteam", () => {
    const sinCita = cifraDelAgente({ cuenta: [{ valor: "10", rotulo: "clientes al mes", cita: C("R3", 50, "se nos van unos 10 clientes al mes porque nadie") }, { valor: "US$ 85", rotulo: "de suscripción" }] });
    expect(calculadaConSusCitas(sinCita, CTX, REGLAS)).toMatchObject({ ok: false, motivo: expect.stringMatching(/no trae una cita/) });
    const otroNumero = cifraDelAgente({ cuenta: [{ valor: "12", rotulo: "clientes al mes", cita: C("R3", 50, "se nos van unos 10 clientes al mes porque nadie") }, { valor: "US$ 85", rotulo: "de suscripción", cita: C("R1", 12, "cada cliente nos paga 85 dólares al mes") }] });
    expect(calculadaConSusCitas(otroNumero, CTX, REGLAS)).toMatchObject({ ok: false, motivo: expect.stringMatching(/no está en su cita/) });
    // Lo que dijo Smarteam y nadie confirmó («Mm.» no confirma) no entra en una cuenta.
    const deSmarteam = cifraDelAgente({ cuenta: [{ valor: "12", rotulo: "clientes al mes", cita: C("R3", 54, "o sea que se les van como 12 clientes cada mes") }, { valor: "US$ 85", rotulo: "de suscripción", cita: C("R1", 12, "cada cliente nos paga 85 dólares al mes") }] });
    expect(calculadaConSusCitas(deSmarteam, CTX, REGLAS)).toMatchObject({ ok: false, motivo: expect.stringMatching(/no trae una cita de la empresa/) });
    // La moneda también tiene que estar en la cita: «85 colones» no es «US$ 85».
    const otraMoneda = cifraDelAgente({ cuenta: [{ valor: "10", rotulo: "clientes al mes", cita: C("R3", 50, "se nos van unos 10 clientes al mes porque nadie") }, { valor: "US$ 85", rotulo: "por reserva", cita: C("R3", 56, "cobramos 85 colones por cada reserva que pasa") }] });
    expect(calculadaConSusCitas(otraMoneda, CTX, REGLAS)).toMatchObject({ ok: false, motivo: expect.stringMatching(/moneda/) });
    // También si la moneda va en el rótulo y no en el número («85» y «dólares por reserva»).
    const enElRotulo = cifraDelAgente({ cuenta: [{ valor: "10", rotulo: "clientes al mes", cita: C("R3", 50, "se nos van unos 10 clientes al mes porque nadie") }, { valor: "85", rotulo: "dólares por reserva", cita: C("R3", 56, "cobramos 85 colones por cada reserva que pasa") }] });
    expect(calculadaConSusCitas(enElRotulo, CTX, REGLAS)).toMatchObject({ ok: false, motivo: expect.stringMatching(/moneda/) });
    expect(problemasDelCalculado({ cifra: "US$ 850", texto: "x", cuenta: { texto: "", factores: [{ valor: "10", rotulo: "clientes", cita: { reunion: SERVICIO_R.id, fecha: SERVICIO_R.fecha, turno: 50, hablante: "Diego Soto", texto: "se nos van unos 10 clientes al mes" } }, { valor: "85", rotulo: "dólares por reserva", cita: { reunion: SERVICIO_R.id, fecha: SERVICIO_R.fecha, turno: 56, hablante: "Diego Soto", texto: "cobramos 85 colones por cada reserva" } }] } })).toContain("la moneda de «85» no es la que dijo la empresa");
    // Lo leído entra a la lista de cifras con su estado; lo que no pasa se descarta entero, nunca a medias.
    const e = leerElResumen(responde({ areas: [{ nombre: "Servicio", area: "3", cifras: [cifraDelAgente(), otroNumero] }] }), CTX, REGLAS);
    expect(e.operativas[0].cifras.map((c) => [c.cifra, c.estado])).toEqual([["US$ 850", "calculado"]]);
    expect(e.descartados.some((d) => /una cifra calculada/.test(d))).toBe(true);
  });

  it("afuera sale solo confirmada, de titular (es lo que cuesta) y con la cuenta a la vista; adentro lleva «Confirmar»", () => {
    const k = calculadaConSusCitas(cifraDelAgente(), CTX, REGLAS);
    if (!k.ok) throw new Error(k.motivo);
    const g: ResumenGuardado = {
      v: 2,
      at: "2026-11-24T12:00:00.000Z",
      por: null,
      modelo: "x",
      agentRunId: null,
      hicimos: { sesiones: [{ fecha: SERVICIO_R.fecha, equipo: "Servicio", minutos: 60, areaId: "3", quienes: ["diego soto"] }], personas: 1, texto: null },
      datosRojos: [],
      areas: {},
      entendimos: [],
      falta: [],
      operativas: [operativa({ id: "o1", nombre: "Servicio", areaId: "3", cifras: [{ id: "c1", ...k.cifra, dimensionId: null }] })],
    };
    const servicio = resultadoMinimo("3", "Servicio");
    const pagina = (x: ResumenGuardado, conCitas: boolean) => resumenParaLaPagina(x, [servicio], {}, { escalaVersion: "9.0.0" }, { conCitas });
    // Sin confirmar: afuera no sale; adentro sí, con «Confirmar» y el porqué.
    expect(pagina(g, false).tarjetas[0].subequipos[0].costo).toBeNull();
    const adentro = pagina(g, true).tarjetas[0].subequipos[0];
    expect(adentro.costo ?? adentro.cifras[0]).toMatchObject({ cifra: "US$ 850", estado: "calculado", porConfirmar: true, conNota: false });
    // Sin confirmar no es evidencia de su parte (no cambia lo que ve el cliente de esa parte).
    const conParte = { ...g, operativas: [operativa({ id: "o1", nombre: "Servicio", areaId: "3", cifras: [{ id: "c1", ...k.cifra, dimensionId: "3.2" }] })] };
    expect(partesConCitaDelResumen(conParte).has("3.2")).toBe(false);
    // Lo que solo dijo Smarteam y nadie corrigió tampoco sube una parte a evidencia.
    const deSmarteam = { ...g, operativas: [operativa({ id: "o1", nombre: "Servicio", areaId: "3", cifras: [{ id: "c9", cifra: "12", texto: "clientes al mes", estado: "pendiente", nota: null, dimensionId: "3.2", citas: [{ reunion: SERVICIO_R.id, fecha: SERVICIO_R.fecha, turno: 54, hablante: "Pablo Ruiz", texto: "se les van como 12 clientes cada mes", sinCorregir: true }] }] })] };
    expect(partesConCitaDelResumen(deSmarteam).has("3.2")).toBe(false);
    // Confirmada: afuera, de titular, con la cuenta como nota.
    const r = editarElResumen(g, "op:o1:cifra:c1:confirmar", null, { firmaDe: () => "", areas: new Set(["3"]), en: "2026-11-24T12:00:00.000Z" });
    if (!r.ok) throw new Error(r.error);
    const costo = pagina(r.resumen, false).tarjetas[0].subequipos[0].costo;
    expect(costo).toMatchObject({ cifra: "US$ 850", estado: "calculado", nota: "10 clientes que se van × US$ 85 de suscripción = US$ 850 al mes" });
    // La auditoría de antes de guardar no la quita (su cifra no está en ninguna cita: la dio la cuenta).
    expect(quitarLoQueNoPasa({ operativas: g.operativas }, CTX.reuniones).quitados).toEqual([]);
    // Si alguien cambia la cifra a mano, deja de ser una cuenta.
    const c = editarElResumen(g, "op:o1:cifra:c1:cifra", "US$ 999", { firmaDe: () => "", areas: new Set(["3"]), en: "2026-11-24T12:00:00.000Z" });
    if (!c.ok) throw new Error(c.error);
    expect(c.resumen.operativas![0].cifras[0]).toMatchObject({ estado: "pendiente" });
    expect(c.resumen.operativas![0].cifras[0].cuenta).toBeUndefined();
    expect(problemasDelCalculado({ cifra: "US$ 999", texto: "x", cuenta: k.cifra.cuenta })).toEqual(["la cuenta da US$ 850, no US$ 999"]);
  });

  it("se guarda y se vuelve a leer con su cuenta (el Json no la pierde)", () => {
    const k = calculadaConSusCitas(cifraDelAgente(), CTX, REGLAS);
    if (!k.ok) throw new Error(k.motivo);
    const c = leerContenido({ resumenDeLaEscala: { v: 2, at: "x", por: null, modelo: "x", agentRunId: null, hicimos: { sesiones: [], personas: 0, texto: null }, datosRojos: [], areas: {}, entendimos: [], falta: [], operativas: [{ id: "o1", nombre: "Servicio", areaId: "3", falta: null, cifras: [{ id: "c1", ...k.cifra, dimensionId: null }] }] } });
    expect(c.resumenDeLaEscala?.operativas?.[0].cifras[0].cuenta?.factores).toHaveLength(2);
  });

  it("la pérdida de la preventa suma los clientes que se van y va al equipo de su meta", () => {
    const negocio = { ticket: "US$ 85 al mes por propiedad" };
    const meta = { que: "Que se vayan menos clientes", actual: "10 clientes al mes", objetivo: "4 al mes", equipo: "servicio" as const };
    const c = calcularLaPerdida({ negocio, metas: [meta] });
    expect(c).toMatchObject({ base: "clientes", montoAlMes: 510, equipo: "servicio" });
    expect(c?.cuenta).toBe("(10 − 4) clientes que se van al mes × US$ 85 de ticket = US$ 510 al mes");
    // «Perder menos horas» no es una pérdida de clientes.
    expect(calcularLaPerdida({ negocio, metas: [{ que: "Perder menos horas en reportes", actual: "10 horas", objetivo: "4 horas" }] })).toBeNull();
    expect(perdidaDeLaEscala({ casillas: { negocio, metas: [meta] } }).areaId).toBe("3");
    // Si otra meta ya daba una cuenta (y quizás se validó), la forma nueva no se la quita aunque vaya antes.
    const conversion = { que: "Subir la conversión de leads", actual: "4 %", objetivo: "7 %" };
    expect(calcularLaPerdida({ negocio, embudo: { leads: "180 al mes" }, metas: [meta, conversion] })?.base).toBe("conversion");
  });

  it("la pérdida validada va a la fila de su equipo; si ese equipo no tiene fila, a Ventas (no se pierde)", () => {
    const validada = { cifra: "US$ 510", rotulo: "al mes", cuenta: "(10 − 4) clientes que se van al mes × US$ 85 de ticket = US$ 510 al mes", meta: "x", huella: "h", validadaEn: "2026-11-20T00:00:00.000Z" };
    const cita = { reunion: VENTAS_R.id, fecha: VENTAS_R.fecha, turno: 14, hablante: "Andrea Mora", texto: "los asesores no registran sus llamadas" };
    const g: ResumenGuardado = { ...guardadoVacio([VENTAS_R]), operativas: [operativa({ id: "o1", nombre: "Ventas", areaId: "1", frena: [{ id: "f1", texto: "Las llamadas no se registran", citas: [cita] }] })] };
    const p = resumenParaLaPagina(g, [resultadoMinimo("1", "Ventas"), resultadoMinimo("3", "Servicio")], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: { validada, porValidar: null, areaId: "3" } });
    expect(p.tarjetas.find((t) => t.areaId === "1")!.subequipos[0].costo?.cifra).toBe("US$ 510");
    // Con fila de Servicio, va a Servicio (no a Ventas).
    const conServicio: ResumenGuardado = { ...guardadoVacio([VENTAS_R, SERVICIO_R]), operativas: [...g.operativas!, operativa({ id: "o2", nombre: "Servicio", areaId: "3", frena: [{ id: "f1", texto: "Clientes que se van", citas: [{ ...cita, reunion: SERVICIO_R.id, fecha: SERVICIO_R.fecha }] }] })] };
    const q = resumenParaLaPagina(conServicio, [resultadoMinimo("1", "Ventas"), resultadoMinimo("3", "Servicio")], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: { validada, porValidar: null, areaId: "3" } });
    expect(q.tarjetas.find((t) => t.areaId === "3")!.subequipos[0].costo?.cifra).toBe("US$ 510");
    expect(q.tarjetas.find((t) => t.areaId === "1")!.subequipos[0].costo).toBeNull();
  });
});

// ── 4 · Lo resuelto queda fuera ───────────────────────────────────────────────────────────────────────────────

describe("4 · lo que la empresa ya resolvió no entra", () => {
  it("el prompt excluye lo resuelto y lo que no cambia el plan, y «falta» deja de ser obligatorio", () => {
    const { system } = pedidoDelResumen(CTX);
    expect(system).toMatch(/LO QUE NO VA: lo que la empresa ya resolvió o acordó cómo manejar/);
    expect(system).toMatch(/lo que no cambia el plan/);
    expect(system).not.toMatch(/USA TODO:/);
    // Que la empresa no tenga un dato es un hallazgo, no un «por validar».
    expect(system).toMatch(/eso es un HALLAZGO/);
    expect(system).toMatch(/«sin-dato»: se preguntó, el dato existe/);
  });
});

// ── 5 · Fuera el texto genérico ───────────────────────────────────────────────────────────────────────────────

function resultadoMinimo(areaId: string, nombre: string, dims: [string, string][] = []): ResultadoDelTest {
  return {
    v: 1,
    escalaVersion: "9.0.0",
    edicion: null,
    areaId,
    areaNombre: nombre,
    version: "marketing",
    nivel: "I",
    nivelNombre: "Inicial",
    puntaje: null,
    capas: [],
    dimensiones: dims.map(([id, n]) => ({ id, nombre: n, capa: "base", preguntada: true, nivel: "D", nivelNombre: "Deficiente", puntaje: null, noLoSe: false })),
    niveles: [],
    recomendacion: dims.length ? { tipo: "trabajar", dimensionId: dims[0][0], dimensionNombre: dims[0][1], objetivo: "F", objetivoNombre: "Funcional", razon: "", costoDeQuedarse: "" } : null,
    riesgos: [],
    casos: [],
    sintesis: "",
    preguntadas: dims.length,
    total: dims.length,
  };
}

/** Una escala mínima: Marketing con «Procesos» y «Medición», con su texto genérico por nivel y un riesgo. */
const ESCALA = {
  version: "9.0.0",
  niveles: [
    { letra: "D", nombre: "Deficiente" },
    { letra: "I", nombre: "Inicial" },
    { letra: "F", nombre: "Funcional" },
  ],
  capas: [{ clave: "base", nombre: "Base operativa" }],
  riesgos: { "2.1.F.1": "Sin calendario, las campañas salen tarde." },
  areas: [
    {
      id: "2",
      nombre: "Marketing",
      panoramica: {},
      dimensiones: [
        {
          id: "2.1",
          nombre: "Procesos",
          capa: "base",
          costoDeQuedarse: "No hay calendario ni reuniones del equipo.",
          niveles: [
            { letra: "D", descripcion: "No hay calendario ni reuniones del equipo.", criterios: [] },
            { letra: "F", descripcion: "Hay más reuniones y un calendario compartido.", criterios: [{ id: "2.1.F.1", riesgo: true }] },
          ],
        },
        { id: "2.5", nombre: "Medición", capa: "base", costoDeQuedarse: "No se sabe qué rinde.", niveles: [{ letra: "D", descripcion: "No se mide.", criterios: [] }, { letra: "F", descripcion: "Se mide cada campaña.", criterios: [] }] },
      ],
    },
  ],
} as unknown as Escala;

describe("5 · fuera el texto genérico de la escala", () => {
  it("«Conversar con tu equipo de…» ya no sale, y «Confirmar cómo trabaja hoy…» no sale si el Resumen tiene la cita", () => {
    const cita = { reunion: MARKETING_R.id, fecha: MARKETING_R.fecha, turno: 34, hablante: "Carla Vega", texto: "ellos no me dicen" };
    const g: ResumenGuardado = {
      v: 2,
      at: "x",
      por: null,
      modelo: "x",
      agentRunId: null,
      hicimos: { sesiones: [{ fecha: MARKETING_R.fecha, equipo: "Marketing", minutos: 60, areaId: "2", quienes: ["carla vega"] }], personas: 1, texto: null },
      datosRojos: [],
      areas: {},
      entendimos: [],
      falta: [],
      operativas: [operativa({ id: "o1", nombre: "Marketing", areaId: "2", retos: [{ id: "t1", texto: "Saber qué pasa con cada lead entregado", citas: [cita], dimensionId: "2.1" }] })],
    };
    // Procesos (por explorar) es la que determina el nivel: Medición está más arriba.
    const base = resultadoMinimo("2", "Marketing", [["2.1", "Procesos"], ["2.5", "Medición"]]);
    const marketing: ResultadoDelTest = { ...base, nivel: "D", dimensiones: base.dimensiones.map((d) => (d.id === "2.5" ? { ...d, nivel: "I" as const } : d)) };
    const servicio = resultadoMinimo("3", "Servicio");
    const p = resumenParaLaPagina(g, [marketing, servicio], {}, { escalaVersion: "9.0.0" }, { conCitas: false, porExplorar: { "2": ["2.1"] } });
    expect(p.sinExplorar).toEqual(["3"]);
    expect(p.pendientes.map((x) => x.texto).join(" ")).not.toMatch(/Conversar con tu equipo|Confirmar cómo trabaja hoy/);
    // Sin la cita del Resumen, la parte por explorar sí pide confirmarse.
    const sinCita = resumenParaLaPagina({ ...g, operativas: [] }, [marketing], {}, { escalaVersion: "9.0.0" }, { conCitas: false, porExplorar: { "2": ["2.1"] } });
    expect(sinCita.pendientes.map((x) => x.texto).join(" ")).toMatch(/Confirmar cómo trabaja hoy/);
  });

  it("la descripción del área no recibe la oración del nivel de una parte sin nada visto, y usa primero el reto del Resumen", () => {
    const marketing = resultadoMinimo("2", "Marketing", [["2.1", "Procesos"], ["2.5", "Medición"]]);
    const chequeo = { "2.1": { nivel: "D", fuente: "hipotesis" }, "2.5": { nivel: "D", fuente: "reunion", porQue: "Miden cada pauta cada semana." } } as unknown as EstadoDeExploracion["contenido"]["chequeo"];
    const a = areaParaLaDescripcion(ESCALA, marketing, chequeo, ["2.1"], null, "Marketing:\n- El reto principal: Los leads desaparecen sin noticias de Ventas");
    expect(a.dimensiones.find((d) => d.nombre === "Procesos")).toMatchObject({ comoEs: null, loQueSeVio: null });
    expect(a.dimensiones.find((d) => d.nombre === "Medición")?.comoEs).toBe("No se mide.");
    expect(a.loQueMasFrena).toBeNull();
    expect(areaParaLaDescripcion(ESCALA, marketing, chequeo, ["2.1"], null, null).loQueMasFrena).toMatchObject({ dimension: "Procesos" });
  });

  it("«Ver detalles» y la tarjeta del radar no traen la oración genérica de una parte sin nada visto; el test público no cambia", () => {
    const marketing = resultadoMinimo("2", "Marketing", [["2.1", "Procesos"], ["2.5", "Medición"]]);
    const delTest = detallesDelResultado(ESCALA, marketing);
    expect(delTest["2.1"].impacto).toMatch(/reuniones/);
    const chequeo = { "2.1": { nivel: "D", fuente: "hipotesis" }, "2.5": { nivel: "D", fuente: "reunion" } } as unknown as EstadoDeExploracion["contenido"]["chequeo"];
    const visto = partesConAlgoVisto({ contenido: { chequeo } as EstadoDeExploracion["contenido"] });
    const deLaEmpresa = detallesDelResultado(ESCALA, marketing, { conAlgoVisto: visto });
    // Sin detalle: con `siguiente` vacío la página diría «Ya está en el nivel más alto», y no es cierto.
    expect(deLaEmpresa["2.1"]).toBeUndefined();
    expect(deLaEmpresa["2.5"].impacto).toBe("No se sabe qué rinde.");
    // Una hipótesis de la que el Resumen dice algo con su cita sube a evidencia.
    const conReto = partesConAlgoVisto({
      contenido: { chequeo, resumenDeLaEscala: { v: 2, operativas: [operativa({ id: "o1", nombre: "Marketing", areaId: "2", retos: [{ id: "t1", texto: "x", citas: [{ reunion: "r", fecha: "f", turno: 1, hablante: "h", texto: "y" }], dimensionId: "2.1" }] })] } } as unknown as EstadoDeExploracion["contenido"],
    });
    expect(conReto.has("2.1")).toBe(true);
  });

  it("una hipótesis que subió a evidencia no le pasa a la descripción lo que se escribió de ella como sospecha", () => {
    const marketing = resultadoMinimo("2", "Marketing", [["2.1", "Procesos"], ["2.5", "Medición"]]);
    const chequeo = { "2.1": { nivel: "D", fuente: "hipotesis", porQue: "Creemos que tienen unos 150 leads sin dueño." } } as unknown as EstadoDeExploracion["contenido"]["chequeo"];
    // Ya no está «por explorar» (el Resumen la cita), pero lo escrito era la sospecha: no llega como visto.
    expect(areaParaLaDescripcion(ESCALA, marketing, chequeo, [], null, null).dimensiones.find((d) => d.nombre === "Procesos")?.loQueSeVio).toBeNull();
  });
});

// ── 6 · El dibujo del recorrido ───────────────────────────────────────────────────────────────────────────────

describe("6 · el recorrido con sus traspasos: SVG estático, con flechas y el volumen", () => {
  const paso = (id: string, nombre: string, quien: string | null, traspaso?: EtapaDeLaPagina["traspaso"]): EtapaDeLaPagina => ({ id, nombre, quien, texto: "", friccion: null, icono: "opera", continuo: false, clave: `etapa:${id}`, ...(traspaso ? { traspaso } : {}) });
  const pasos = [
    paso("s1", "Captación", "Marketing", { de: "Marketing", a: "Ventas", texto: "Los leads llegan y nadie avisa qué pasó con ellos.", cifra: "180", rotulo: "leads al mes" }),
    paso("s2", "Cierre", "Ventas", { de: "Ventas", a: "Servicio", texto: "El cliente pasa a Servicio sin su historia.", cifra: "25", rotulo: "cierres al mes" }),
    paso("s3", "Puesta en marcha", "Servicio"),
    paso("s4", "Hospedaje operando", null),
  ];

  it("dibuja las flechas, el volumen de cada traspaso y el de punta a punta, sin JS y con hex literal", () => {
    const html = renderToStaticMarkup(createElement(RecorridoDelCliente, { pasos }));
    expect(html).toMatch(/^<figure[^>]*><svg/);
    expect(html).toContain("180 leads al mes → 25 cierres al mes");
    expect(html).toContain("marker-end=\"url(#re-punta)\"");
    expect(html).not.toMatch(/<script|onclick|var\(--/i);
    expect(html).toMatch(/#1f3fbf/);
  });

  it("sin traspasos no dibuja nada (sale la lista de siempre) y el texto largo se corta por palabras", () => {
    expect(conTraspasos(pasos.map((p) => ({ ...p, traspaso: undefined })))).toBe(false);
    expect(renderToStaticMarkup(createElement(RecorridoDelCliente, { pasos: pasos.map((p) => ({ ...p, traspaso: undefined })) }))).toBe("");
    expect(enLineas("uno dos tres cuatro cinco seis", 9, 2)).toEqual(["uno dos", "tres…"]);
  });

  it("usa el nombre que ve el cliente (lo que corrigió quien presenta) y no dibuja un traspaso que ya no va al paso siguiente", () => {
    expect(traspasosDibujables(pasos, { s1: "Mercadeo" })[0]).toMatchObject({ de: "Mercadeo", a: "Ventas", volumen: "180 leads al mes" });
    // Se quitó el paso de Ventas: el traspaso de Marketing ya no apunta al paso que le sigue.
    expect(traspasosDibujables([pasos[0], pasos[2]])).toEqual([]);
    // Por palabras enteras: un traspaso «a TI» no apunta a «Logística».
    const aTi = { ...pasos[0], traspaso: { ...pasos[0].traspaso!, a: "TI" } };
    expect(traspasosDibujables([aTi, { ...pasos[1], quien: "Logística" }])).toEqual([]);
  });

  it("adentro el traspaso se corrige o se quita en su paso, sin tocar la etapa", () => {
    const cita = { reunion: MARKETING_R.id, fecha: MARKETING_R.fecha, turno: 32, hablante: "Carla Vega", texto: "hay un montón de leads que desaparecen" };
    const g: ResumenGuardado = {
      ...guardadoVacio([MARKETING_R]),
      recorrido: [{ id: "s1", nombre: "Captación", quien: "Marketing", texto: "", friccion: null, citas: [cita], traspaso: { de: "Marketing", a: "Ventas", texto: "Los leads desaparecen", cifra: null, rotulo: null, citas: [cita] } }],
    };
    const otro = { firmaDe: () => "", areas: new Set(["2"]), en: "2026-11-24T12:00:00.000Z" };
    const cambiado = editarElResumen(g, "etapa:s1:traspaso", "Los leads llegan sin aviso", otro);
    if (!cambiado.ok) throw new Error(cambiado.error);
    expect(cambiado.resumen.recorrido![0].traspaso?.texto).toBe("Los leads llegan sin aviso");
    const quitado = editarElResumen(g, "etapa:s1:traspaso", null, otro);
    if (!quitado.ok) throw new Error(quitado.error);
    expect(quitado.resumen.recorrido![0]).toMatchObject({ nombre: "Captación" });
    expect(quitado.resumen.recorrido![0].traspaso).toBeUndefined();
  });

  it("el traspaso del agente se verifica con su cita; uno sin cita se cae solo, no la etapa", () => {
    const e = leerElResumen(
      responde({
        recorrido: [
          { etapa: "Captación", quien: "Marketing", texto: "La pauta y la web", citas: [C("R2", 30, "nos entran unos 180 leads al mes entre la pauta y el formulario")], traspaso: { a: "Ventas", texto: "Los leads desaparecen sin noticias", cifra: "180", rotulo: "leads al mes", citas: [C("R2", 30, "nos entran unos 180 leads al mes entre la pauta"), C("R2", 32, "hay un montón de leads que desaparecen")] } },
          { etapa: "Cierre", quien: "Ventas", texto: "Llamadas de los asesores", citas: [C("R1", 10, "cerramos unos 25 clientes nuevos al mes")], traspaso: { a: "Servicio", texto: "Pasan sin seguimiento", cifra: "40", citas: [] } },
        ],
        areas: [],
      }),
      CTX,
      REGLAS,
    );
    expect(e.recorrido[0].traspaso).toMatchObject({ de: "Marketing", a: "Ventas", cifra: "180", rotulo: "leads al mes" });
    expect(e.recorrido[1].nombre).toBe("Cierre");
    expect(e.recorrido[1].traspaso).toBeUndefined();
  });
});
