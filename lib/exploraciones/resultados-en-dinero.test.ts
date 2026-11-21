/**
 * lib/exploraciones/resultados-en-dinero.test.ts — las conclusiones EN DINERO de la escala que ve el cliente (20 nov,
 * Elías tras presentar diagnósticos reales con Ventas: «están perdiendo US$1.5M al mes en cuentas incobrables», no «las
 * ventas se gestionan por WhatsApp»). Cada departamento: el reto principal → lo que lo causa → cuánto cuesta; sin cifra en
 * dinero, «por validar» y nunca un monto inventado; los títulos salen del dinero o del dolor de quien decide; y la pérdida
 * que la empresa validó en la preventa entra por UNA función (perdida-de-la-escala.ts). Ver DECISIONS «Resultados en dinero».
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseObject } from "@/lib/ai/section-schema";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import { conclusionDelSubequipo, esCosto, esDinero, faltaDeLaPerdida, sinCosto, type ResumenDeLaPagina, type SubequipoDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { CLAVES } from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { calcularLaPerdida } from "./perdida";
import { perdidaDeLaEscala, perdidaParaElAgente } from "./perdida-de-la-escala";
import { areaParaLaDescripcion, pedidoDeLaDescripcion, reglasDeLaDescripcion } from "./descripcion-de-la-escala";
import {
  formaDelLugar,
  leerElResumen,
  loQueEncontroElResumen,
  nombresDeQuienesDeciden,
  pedidoDelResumen,
  quienesDecidenDe,
  resumenParaLaPagina,
  type ContextoDelResumen,
  type ResumenGuardado,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

// ── Una reunión de crédito y cobro (turnos inventados) ──────────────────────────────────────────────────────────

const COBRO: ReunionParaElResumen = {
  id: "gmeet_cobro",
  clave: "R1",
  fecha: "2026-11-05T16:00:00.000Z",
  equipo: "Ventas",
  areaId: "1",
  titulo: "EMPRESA | CRÉDITO Y COBRO",
  minutos: 70,
  delCliente: ["Andrea Mora", "Nora Castro"],
  deSmarteam: ["Marco Salas"],
  turnos: [
    { n: 10, hablante: "Andrea Mora", texto: "se nos quedan como 1,5 millones de dólares al mes sin cobrar en la cartera vencida" },
    { n: 20, hablante: "Nora Castro", texto: "la gerencia no puede ver cuánto cobra cada gestor, lo cruzamos a mano todos los meses" },
    { n: 30, hablante: "Andrea Mora", texto: "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte" },
  ],
};
const C = (turno: number, texto: string) => ({ reunion: "R1", turno, texto });
const CTX: ContextoDelResumen = {
  empresa: "Empresa de prueba",
  reuniones: [COBRO],
  instrucciones: "",
  areas: [{ id: "1", nombre: "Ventas", nivel: "Inicial", arriba: "Funcional", abajo: "Deficiente", loQueMasFrena: null, dimensiones: [{ id: "1.3", nombre: "Datos", capa: "Base operativa", nivel: "Inicial", porExplorar: false }], contexto: null }],
};
const REGLAS = { personas: ["Marco Salas", "Andrea Mora", "Nora Castro"], parse: parseObject, firmas: {} };
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });

describe("el agente: el dinero primero, el dolor de quien decide si no hay dinero", () => {
  it("las reglas piden el reto principal, lo que lo causa, cuánto cuesta y un titular que no describe cómo operan", () => {
    const sistema = String(pedidoDelResumen(CTX).system);
    for (const regla of [/EL RETO PRINCIPAL del subequipo/, /LOS PROBLEMAS QUE CAUSAN el reto principal/, /CUÁNTO CUESTA EN DINERO/, /LO QUE MÁS PESA ES EL DINERO/, /NUNCA un titular que solo describe cómo operan/, /qué falta para saber CUÁNTO LE CUESTA/, /quienes dirigen o deciden/])
      expect(sistema).toMatch(regla);
    // «frena» ya no va vacío: es el reto principal.
    expect(sistema).not.toMatch(/«frena»: vacío/);
    // Sigue prohibido inventar o calcular dinero.
    expect(sistema).toMatch(/Nunca inventes pérdidas en dinero/);
  });

  it("quienes deciden y la pérdida validada le llegan al agente; sus nombres van a la lista de los que no salen", () => {
    const casillas = {
      autoridad: [
        { nombre: "Laura Vega", cargo: "Gerente general", rol: "firma" },
        { nombre: "Andrés Mora", rol: "decide" },
        { nombre: "Equipo de ventas", rol: "afectado" },
        { nombre: "Gerencia", rol: "decide" },
      ],
    };
    expect(quienesDecidenDe(casillas)).toBe("- Laura Vega (Gerente general): aprueba\n- Andrés Mora: decide");
    // Un grupo o un cargo no es una persona: si entrara a los que no salen, se caería toda frase con «equipo» o «gerencia».
    expect(nombresDeQuienesDeciden(casillas)).toEqual(["Laura Vega", "Andrés Mora"]);
    expect(quienesDecidenDe({})).toBe("");
    const perdida = perdidaParaElAgente(perdidaDeLaEscala({ perdida: PERDIDA }));
    const texto = String((pedidoDelResumen({ ...CTX, deciden: quienesDecidenDe(casillas), perdida }).messages[0] as { content: string }).content);
    expect(texto).toContain("Quiénes dirigen o deciden en la empresa (sus dolores pesan más; nunca escribas sus nombres):\n- Laura Vega (Gerente general): aprueba");
    expect(texto).toContain("NO escribas su número");
    expect(texto).toContain("US$ 15.000");
  });

  it("el reto principal es UNA pieza con su cita; la cifra en dinero de la empresa pasa como cualquier cifra", () => {
    const e = leerElResumen(
      responde({
        areas: [
          {
            nombre: "Crédito y cobro",
            area: "1",
            organizacion: [],
            bien: [],
            frena: [
              { texto: "La gerencia no ve cuánto cobra cada gestor", citas: [C(20, "la gerencia no puede ver cuánto cobra cada gestor, lo cruzamos a mano todos los meses")] },
              { texto: "Otro reto principal de más", citas: [C(30, "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte")] },
            ],
            retos: [{ texto: "Asignar la cartera sin hacerlo a mano", dimension: "1.3", citas: [C(30, "la asignación de la cartera la hacemos a mano en Excel cada vez que cambia el corte")] }],
            cifras: [{ cifra: "US$ 1,5 millones", texto: "al mes sin cobrar", estado: "declarado", nota: null, dimension: null, citas: [C(10, "se nos quedan como 1,5 millones de dólares al mes sin cobrar en la cartera vencida")] }],
            falta: null,
          },
        ],
      }),
      CTX,
      REGLAS,
    );
    const op = e.operativas[0];
    expect(op.frena.map((p) => p.texto)).toEqual(["La gerencia no ve cuánto cobra cada gestor"]);
    expect(op.cifras.map((c) => [c.cifra, c.estado])).toEqual([["US$ 1,5 millones", "declarado"]]);
  });

  it("el reto principal que se manda a corregir se pide como título sin números", () => {
    expect(formaDelLugar({ lugar: "o1:frena", indice: 0, largo: 1 })).toMatch(/reto principal como título.*sin números/);
  });
});

// ── La página ──────────────────────────────────────────────────────────────────────────────────────────────────

const VENTAS = {
  v: 1,
  escalaVersion: "9.0.0",
  edicion: null,
  areaId: "1",
  areaNombre: "Ventas",
  version: "web",
  nivel: "I",
  nivelNombre: "Inicial",
  puntaje: 30,
  capas: [
    { clave: "base", nombre: "Base operativa", nivel: "I", nivelNombre: "Inicial", puntaje: 30 },
    { clave: "produccion", nombre: "Producción", nivel: "I", nivelNombre: "Inicial", puntaje: 30 },
  ],
  dimensiones: [{ id: "1.3", nombre: "Datos", capa: "base", preguntada: true, nivel: "I", nivelNombre: "Inicial", puntaje: 30, noLoSe: false }],
  niveles: [
    { letra: "D", nombre: "Deficiente" },
    { letra: "I", nombre: "Inicial" },
    { letra: "F", nombre: "Funcional" },
    { letra: "E", nombre: "Eficiente" },
    { letra: "O", nombre: "Óptimo" },
  ],
  recomendacion: null,
  riesgos: [],
  casos: [],
  sintesis: "Cada gestor lleva su cartera a su manera.",
  preguntadas: 1,
  total: 1,
} as unknown as ResultadoDelTest;

const CITA = (turno: number, texto: string) => ({ reunion: "gmeet_cobro", fecha: COBRO.fecha, turno, hablante: "Andrea Mora", texto });

function guardado(conDinero = true): ResumenGuardado {
  return {
    v: 2,
    at: "2026-11-20T18:00:00.000Z",
    por: null,
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: { sesiones: [{ fecha: COBRO.fecha, equipo: "Ventas", minutos: 70, areaId: "1", quienes: ["andrea mora"] }], personas: 1, texto: null },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    operativas: [
      {
        id: "o1",
        nombre: "Ventas",
        areaId: "1",
        organizacion: [],
        bien: [],
        frena: [{ id: "f1", texto: "La gerencia no ve cuánto cobra cada gestor", citas: [CITA(20, "la gerencia no puede ver cuánto cobra cada gestor")] }],
        retos: [{ id: "r1", texto: "Asignar la cartera sin hacerlo a mano", dimensionId: "1.3", citas: [CITA(30, "la asignación de la cartera la hacemos a mano en Excel")] }],
        cifras: [
          { id: "c1", cifra: "4800", texto: "clientes en la cartera", estado: "declarado", nota: null, dimensionId: null, citas: [CITA(5, "tenemos 4800 clientes en la cartera")] },
          ...(conDinero ? [{ id: "c2", cifra: "US$ 1,5 millones", texto: "al mes sin cobrar", estado: "declarado" as const, nota: null, dimensionId: null, citas: [CITA(10, "se nos quedan como 1,5 millones de dólares al mes sin cobrar")] }] : []),
        ],
        falta: conDinero ? null : "Falta medir cuánto deja de cobrar la cartera vencida al mes.",
      },
    ],
  };
}

/** La pérdida tal como la guarda la preventa (rama «Preventa: Negocio, Embudo…», lib/exploraciones/perdida.ts). */
const PERDIDA = {
  montoAlMes: 15_000,
  moneda: "US$",
  base: "conversion",
  cuenta: "200 leads al mes × (7 % − 4 %) de conversión × US$ 2.500 de ticket = US$ 15.000 al mes",
  texto: "Pierden ~US$ 15.000 al mes por no llegar a «subir la conversión»",
  meta: "subir la conversión",
  huella: "abc123",
  validadaEn: "2026-11-19T15:00:00.000Z",
  por: "marco@smarteam.cr",
};

const pagina = (g: ResumenGuardado, o: { conCitas?: boolean; perdida?: boolean } = {}) =>
  resumenParaLaPagina(g, [VENTAS], {}, { escalaVersion: "9.0.0" }, { conCitas: !!o.conCitas, perdida: o.perdida ? perdidaDeLaEscala({ perdida: PERDIDA }) : null });
const primera = (p: ResumenDeLaPagina): SubequipoDeLaPagina => p.tarjetas[0].subequipos[0];

describe("cuánto cuesta: la primera cifra en dinero", () => {
  it("una cifra es de dinero si trae su moneda, en la cifra o en su rótulo", () => {
    expect(esDinero({ cifra: "US$ 1,5 millones", texto: "al mes" })).toBe(true);
    expect(esDinero({ cifra: "₡ 12 M", texto: "al mes" })).toBe(true);
    expect(esDinero({ cifra: "40 mil", texto: "dólares que no se cobran" })).toBe(true);
    expect(esDinero({ cifra: "4800", texto: "clientes en la cartera" })).toBe(false);
    // «Quincena» o «Queso» no son quetzales.
    expect(esDinero({ cifra: "15", texto: "días por quincena" })).toBe(false);
  });

  it("lo que cuesta es dinero que se PIERDE: una inversión o lo que se vende no va de titular (Cemaco, simulacro del 20 nov)", () => {
    expect(esCosto({ cifra: "US$ 1,5 millones", texto: "al mes sin cobrar" })).toBe(true);
    expect(esCosto({ cifra: "US$ 40 mil", texto: "al mes en cuentas que no se cobran" })).toBe(true);
    expect(esCosto({ cifra: "$95.000", texto: "inversión de marketing en septiembre" })).toBe(false);
    expect(esCosto({ cifra: "US$ 4,6 M", texto: "vendidos en el mes" })).toBe(false);
    // Lo que encontró la revisión del 20 nov: un trimestre no es quetzales, y un costo unitario o lo por cobrar no es pérdida.
    expect(esCosto({ cifra: "120", texto: "clientes que se van en el Q3" })).toBe(false);
    expect(esCosto({ cifra: "US$ 35", texto: "costo por lead" })).toBe(false);
    expect(esCosto({ cifra: "US$ 2 M", texto: "en cuentas por cobrar" })).toBe(false);
    expect(esCosto({ cifra: "Q 15.000", texto: "al mes que se pierden en mora" })).toBe(true);
    expect(esDinero({ cifra: "40 mil", texto: "EUR al mes" })).toBe(true);
    const g = guardado(false);
    g.operativas![0].cifras.push({ id: "c3", cifra: "$95.000", texto: "inversión de marketing en septiembre", estado: "declarado", nota: null, dimensionId: null, citas: [CITA(40, "se invirtió $95,000 en el mes")] });
    const x = primera(pagina(g));
    expect(x.costo).toBeNull();
    expect(x.cifras.map((c) => c.cifra)).toEqual(["4800", "$95.000"]);
  });

  it("sale de las cifras y va de costo; las otras siguen a la derecha", () => {
    const x = primera(pagina(guardado()));
    expect(x.costo?.cifra).toBe("US$ 1,5 millones");
    expect(x.cifras.map((c) => c.cifra)).toEqual(["4800"]);
  });

  it("sin cifra en dinero el costo es null (la página dice «por validar») y queda lo que falta saber", () => {
    const x = primera(pagina(guardado(false)));
    expect(x.costo).toBeNull();
    expect(x.falta).toBe("Falta medir cuánto deja de cobrar la cartera vencida al mes.");
  });
});

describe("la pérdida validada en la preventa, por una sola función", () => {
  it("se lee del Json crudo, solo si está validada y trae su cuenta", () => {
    expect(perdidaDeLaEscala({ perdida: PERDIDA }).validada).toEqual({
      cifra: "US$ 15.000",
      rotulo: "al mes por no llegar a «subir la conversión»",
      cuenta: PERDIDA.cuenta,
      meta: "subir la conversión",
      huella: "abc123",
      validadaEn: PERDIDA.validadaEn,
    });
    for (const malo of [{ ...PERDIDA, validadaEn: "" }, { ...PERDIDA, montoAlMes: 0 }, { ...PERDIDA, cuenta: "" }, { ...PERDIDA, montoAlMes: "15000" }, null, "x"])
      expect(perdidaDeLaEscala({ perdida: malo }).validada).toBeNull();
    expect(perdidaDeLaEscala(null)).toEqual({ validada: null, porValidar: null });
    expect(perdidaDeLaEscala({})).toEqual({ validada: null, porValidar: null });
  });

  it("el monto se escribe como en la preventa: tres cifras significativas y punto de miles", () => {
    expect(perdidaDeLaEscala({ perdida: { ...PERDIDA, montoAlMes: 15_432 } }).validada?.cifra).toBe("US$ 15.400");
    expect(perdidaDeLaEscala({ perdida: { ...PERDIDA, montoAlMes: 1_500_000, moneda: "₡" } }).validada?.cifra).toBe("₡ 1.500.000");
  });

  it("va de costo en la primera fila de Ventas, VALIDADA (no «estimada») y con su cuenta como nota; si ya hay un costo dicho, va primera entre sus cifras", () => {
    const sin = primera(pagina(guardado(false), { perdida: true }));
    expect(sin.costo).toMatchObject({ cifra: "US$ 15.000", estado: "declarado", nota: `Con tus cifras: ${PERDIDA.cuenta}.`, dePerdida: { nombreFijo: "perdida.abc123" } });
    const con = primera(pagina(guardado(true), { perdida: true }));
    expect(con.costo?.cifra).toBe("US$ 1,5 millones");
    expect(con.cifras.map((c) => c.cifra)).toEqual(["US$ 15.000", "4800"]);
  });

  it("va en el área 1 aunque su edición la llame de otra forma («Admisiones» en Educación)", () => {
    const admisiones = { ...VENTAS, areaNombre: "Admisiones" } as ResultadoDelTest;
    const g = guardado(false);
    const p = resumenParaLaPagina(g, [admisiones], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: perdidaDeLaEscala({ perdida: PERDIDA }) });
    expect(primera(p).costo?.cifra).toBe("US$ 15.000");
  });

  it("no va en un equipo que no es Ventas, ni sin Resumen", () => {
    const servicio = { ...VENTAS, areaId: "3", areaNombre: "Servicio" } as ResultadoDelTest;
    const g = guardado(false);
    g.operativas![0].areaId = "3";
    g.hicimos.sesiones[0].areaId = "3";
    const p = resumenParaLaPagina(g, [servicio], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: perdidaDeLaEscala({ perdida: PERDIDA }) });
    expect(primera(p).costo).toBeNull();
    expect(resumenParaLaPagina(null, [VENTAS], {}, {}, { conCitas: false, perdida: perdidaDeLaEscala({ perdida: PERDIDA }) }).tarjetas[0].subequipos).toEqual([]);
  });
});

describe("el titular de cada departamento: el reto principal → lo que lo causa → cuánto cuesta", () => {
  it("con costo, el titular es lo que cuesta y debajo el reto principal; las causas son los retos", () => {
    const c = conclusionDelSubequipo(primera(pagina(guardado())));
    expect(c.costo?.cifra).toBe("US$ 1,5 millones");
    expect(c.reto?.texto).toBe("La gerencia no ve cuánto cobra cada gestor");
    expect(c.causas.map((p) => p.texto)).toEqual(["Asignar la cartera sin hacerlo a mano"]);
  });

  it("un Resumen de antes, sin reto principal, usa su primer reto de titular (nunca uno genérico)", () => {
    const g = guardado(false);
    g.operativas![0].frena = [];
    g.operativas![0].retos.push({ id: "r2", texto: "Medir lo que cobra cada gestor", dimensionId: null, citas: [CITA(20, "no puede ver cuánto cobra cada gestor")] });
    const c = conclusionDelSubequipo(primera(pagina(g)));
    expect(c.costo).toBeNull();
    expect(c.reto?.texto).toBe("Asignar la cartera sin hacerlo a mano");
    expect(c.causas.map((p) => p.texto)).toEqual(["Medir lo que cobra cada gestor"]);
  });

  it("la pérdida que quien presenta quitó no sale afuera: queda «por validar»", () => {
    const x = primera(pagina(guardado(false), { perdida: true }));
    expect(conclusionDelSubequipo(x, true).costo).toBeNull();
    expect(conclusionDelSubequipo(x, false).costo?.cifra).toBe("US$ 15.000");
  });
});

describe("cómo se pinta", () => {
  const pestanas = [
    { id: "resumen", nombre: "Resumen", href: "#" },
    { id: "1", nombre: "Ventas", href: "#v" },
  ];
  const resumen = (p: ResumenDeLaPagina, textos: Record<string, string> = {}) => renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen: p, empresa: "Empresa de prueba", pestanas, textos }));
  const sinEtiquetas = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, " ");

  it("en el Resumen: el costo de titular, el reto principal, «Lo que lo causa» y las otras cifras a la derecha", () => {
    const t = sinEtiquetas(resumen(pagina(guardado())));
    expect(t).toContain("US$ 1,5 millones al mes sin cobrar");
    expect(t).toContain("La gerencia no ve cuánto cobra cada gestor");
    expect(t).toContain("Lo que lo causa");
    expect(t).toContain("Asignar la cartera sin hacerlo a mano");
    expect(t).toContain("4800");
    expect(t).not.toContain("Por validar");
  });

  it("sin dinero: el reto principal de titular y «Cuánto cuesta · Por validar» con lo que falta saber, sin un monto", () => {
    const html = resumen(pagina(guardado(false)));
    expect(html).toContain('<h4 class="re-titular-fila">La gerencia no ve cuánto cobra cada gestor</h4>');
    const t = sinEtiquetas(html);
    expect(t).toContain("Cuánto cuesta Por validar Falta medir cuánto deja de cobrar la cartera vencida al mes.");
    // Sin lo que falta saber, la frase de siempre (nunca un monto).
    const sinFalta = guardado(false);
    sinFalta.operativas![0].falta = null;
    expect(sinEtiquetas(resumen(pagina(sinFalta)))).toContain(sinCosto("Ventas"));
  });

  it("la pérdida de la preventa sale con su estado y su cuenta; quitada por quien presenta, no sale afuera", () => {
    const p = pagina(guardado(false), { perdida: true });
    expect(sinEtiquetas(resumen(p))).toContain("US$ 15.000 al mes por no llegar a «subir la conversión»");
    expect(sinEtiquetas(resumen(p))).toContain(`Lo validaste con nosotros · Con tus cifras: ${PERDIDA.cuenta}.`);
    expect(sinEtiquetas(resumen(p))).not.toContain("Estimado");
    const quitada = resumen(p, { [CLAVES.delResumen("perdida.abc123")]: "" });
    expect(quitada).not.toContain("US$ 15.000");
    expect(sinEtiquetas(quitada)).toContain("Por validar");
  });

  it("una foto publicada antes del 20 nov (sin `costo`) se pinta como antes, en el Resumen y en la página del área", () => {
    // Como era la foto: la cifra en dinero entre las cifras y sin la clave `costo`.
    const p = pagina(guardado());
    const deAntes = { ...p, tarjetas: p.tarjetas.map((t) => ({ ...t, subequipos: t.subequipos.map(({ costo, ...x }) => ({ ...x, cifras: [...(costo ? [costo] : []), ...x.cifras] })) })) };
    const html = resumen(deAntes);
    expect(html).not.toContain("re-equipo-dinero");
    expect(html).toContain("Retos");
    // Lo de antes sigue: la cifra en dinero a la derecha y «lo que la frena» con los retos.
    expect(html).toMatch(/class="re-cifra"[^>]*>(?:(?!<\/div>).)*US\$ 1,5 millones/);
    expect(sinEtiquetas(html)).toContain("La gerencia no ve cuánto cobra cada gestor");
    expect(html).not.toContain("Por validar");
    const area = renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "E", agenda: "", deLaEscala: { areas: pestanas.slice(1), porExplorar: [], tarjeta: deAntes.tarjetas[0] } }));
    expect(area).not.toContain("ed-cuesta");
  });

  it("⛔ la pérdida que quien presenta quitó no sale afuera: ni de titular, ni entre las cifras, ni en la página del área", () => {
    const quitada = { [CLAVES.delResumen("perdida.abc123")]: "" };
    // Entre las cifras (la fila ya tenía un costo dicho en las reuniones).
    const conCosto = pagina(guardado(true), { perdida: true });
    expect(resumen(conCosto)).toContain("US$ 15.000");
    expect(resumen(conCosto, quitada)).not.toContain("US$ 15.000");
    // De titular, en la página del área.
    const sinCosto = pagina(guardado(false), { perdida: true });
    const area = (textos: Record<string, string>) =>
      renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "E", agenda: "", deLaEscala: { areas: pestanas.slice(1), porExplorar: [], tarjeta: sinCosto.tarjetas[0], textos } }));
    expect(area({})).toContain("US$ 15.000");
    expect(area(quitada)).not.toContain("US$ 15.000");
    expect(sinEtiquetas(area(quitada))).toContain("Cuánto cuesta: por validar.");
  });

  it("⛔ un monto que su cita no sostiene nunca va de titular, ni adentro", () => {
    const g = guardado(false);
    g.operativas![0].cifras.push({ id: "c9", cifra: "US$ 40 mil", texto: "al mes sin cobrar", estado: "declarado", nota: null, dimensionId: null, citas: [CITA(10, "se nos quedan como 1,5 millones de dólares al mes sin cobrar")] });
    expect(primera(pagina(g)).costo).toBeNull();
    expect(primera(pagina(g)).cifras.some((c) => c.cifra === "US$ 40 mil")).toBe(false);
    const adentro = primera(pagina(g, { conCitas: true }));
    expect(adentro.costo).toBeNull();
    expect(adentro.cifras.find((c) => c.cifra === "US$ 40 mil")?.noSale).toBeTruthy();
  });

  it("la página de Ventas lleva «Lo que más le cuesta» con lo mismo del Resumen; el test público, no", () => {
    const p = pagina(guardado());
    const area = (tarjeta: ResumenDeLaPagina["tarjetas"][number] | null) =>
      renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "Empresa de prueba", agenda: "", deLaEscala: { areas: pestanas.slice(1), porExplorar: [], tarjeta } }));
    const t = sinEtiquetas(area(p.tarjetas[0]));
    expect(t).toContain("Lo que más le cuesta a Ventas");
    expect(t).toContain("US$ 1,5 millones al mes sin cobrar");
    expect(t).toContain("La gerencia no ve cuánto cobra cada gestor");
    expect(t).toContain("Asignar la cartera sin hacerlo a mano");
    // Va después de la escalera y del radar, antes de «Por dónde empezar».
    const html = area(p.tarjetas[0]);
    expect(html.indexOf("ed-cuesta")).toBeGreaterThan(html.indexOf("ed-radar-seccion"));
    // Sin dinero, «por validar».
    expect(sinEtiquetas(area(pagina(guardado(false)).tarjetas[0]))).toContain("Cuánto cuesta: por validar. Falta medir cuánto deja de cobrar la cartera vencida al mes.");
    // Sin tarjeta (sin Resumen) no sale; el test público tampoco la lleva.
    expect(area(null)).not.toContain("ed-cuesta");
    expect(renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "E", agenda: "" }))).not.toContain("ed-cuesta");
  });

  it("la escalera de la página del área: la meta que eligió quien presenta, si está por encima de hoy", () => {
    const area = (textos: Record<string, string>) =>
      renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: VENTAS, empresa: "E", agenda: "", deLaEscala: { areas: pestanas.slice(1), porExplorar: [], textos } }));
    expect(area({})).toContain('class="esc-nivel esc-meta" data-nivel="F"');
    expect(area({ [CLAVES.delArea("1", "meta")]: "E" })).toContain('class="esc-nivel esc-meta" data-nivel="E"');
    // Una meta guardada que ya no está arriba de hoy no vale: vuelve Funcional.
    expect(area({ [CLAVES.delArea("1", "meta")]: "D" })).toContain('class="esc-nivel esc-meta" data-nivel="F"');
    // La escalera va arriba y el radar justo debajo.
    const html = area({});
    expect(html.indexOf("ed-escalera")).toBeLessThan(html.indexOf("ed-radar-seccion"));
    // Un área «En medición» no lleva escalera: no hay nada que marcar (tampoco en el test público).
    const sinNivel = { ...VENTAS, nivel: null, nivelNombre: null } as ResultadoDelTest;
    expect(renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: sinNivel, empresa: "E", agenda: "", deLaEscala: { areas: pestanas.slice(1), porExplorar: [] } }))).not.toContain("esc-svg");
    expect(renderToStaticMarkup(createElement(ResultadoDelTestVista, { r: sinNivel, empresa: "E", agenda: "" }))).not.toContain("esc-svg");
  });
});

describe("la página del área también lee lo que dijo la empresa en sus reuniones", () => {
  it("lo que el Resumen verificó contra las transcripciones le llega al agente de la descripción, sin cifras", () => {
    const encontrado = loQueEncontroElResumen(guardado(), "1");
    expect(encontrado).toBe(["Ventas:", "- El reto principal: La gerencia no ve cuánto cobra cada gestor", "- Lo que lo causa: Asignar la cartera sin hacerlo a mano"].join("\n"));
    expect(encontrado).not.toContain("1,5");
    expect(loQueEncontroElResumen(guardado(), "3")).toBe("");
    // Lo que nombra un equipo que el cliente no ve no le llega al agente.
    expect(loQueEncontroElResumen(guardado(), "1", ["Ventas"])).toBe("");
    expect(loQueEncontroElResumen(null, "1")).toBe("");
    const escala = { areas: [], niveles: [] } as unknown as Parameters<typeof areaParaLaDescripcion>[0];
    const a = areaParaLaDescripcion(escala, VENTAS, {}, [], null, encontrado);
    expect(a.delResumen).toBe(encontrado);
    const ctx = { empresa: "E", areas: [a], reuniones: "", instrucciones: "" };
    expect(String((pedidoDeLaDescripcion(ctx).messages[0] as { content: string }).content)).toContain("La gerencia no ve cuánto cobra cada gestor");
    expect(String(pedidoDeLaDescripcion(ctx).system)).toContain("«delResumen»");
    // Lo del Resumen cuenta como dicho por la empresa para la vara de las cifras de la descripción.
    expect(reglasDeLaDescripcion(ctx, []).deLaEmpresa).toContain("La gerencia no ve cuánto cobra cada gestor");
    // Sin Resumen, el campo no aparece (el prompt de siempre).
    expect("delResumen" in areaParaLaDescripcion(escala, VENTAS, {}, [])).toBe(false);
  });
});

describe("una pérdida calculada que nadie validó con el cliente", () => {
  const CASILLAS = {
    negocio: { ticket: "US$ 2.500" },
    embudo: { leads: "200 al mes", conversion: "4 %" },
    metas: [{ que: "Subir la conversión de los leads", actual: "4 %", objetivo: "7 %" }],
  };
  const HUELLA_DE_HOY = calcularLaPerdida(CASILLAS)!.huella;

  it("una validada cuya cuenta ya no es la de las cifras de hoy no sale con su monto: va por validar", () => {
    const l = perdidaDeLaEscala({ casillas: CASILLAS, perdida: PERDIDA });
    expect(l.validada).toBeNull();
    expect(l.porValidar).toEqual({ meta: "Subir la conversión de los leads" });
  });

  it("lo que falta que quitó una persona no vuelve con la cuenta sin validar", () => {
    const g = guardado(false);
    g.operativas![0].falta = null;
    g.operativas![0].faltaMano = true;
    const x = primera(resumenParaLaPagina(g, [VENTAS], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: perdidaDeLaEscala({ casillas: CASILLAS }) }));
    expect(x.falta).toBeNull();
  });

  it("se sabe que hay una cuenta, sin su monto", () => {
    const l = perdidaDeLaEscala({ casillas: CASILLAS });
    expect(l.validada).toBeNull();
    expect(l.porValidar).toEqual({ meta: "Subir la conversión de los leads" });
    // Validada con la cuenta de hoy, ya no está por validar.
    expect(perdidaDeLaEscala({ casillas: CASILLAS, perdida: { ...PERDIDA, huella: HUELLA_DE_HOY } }).porValidar).toBeNull();
  });

  it("va como «por validar» en la primera fila de Ventas, sin el monto; no pisa lo que falta que ya dijo el Resumen", () => {
    const l = perdidaDeLaEscala({ casillas: CASILLAS });
    const g = guardado(false);
    g.operativas![0].falta = null;
    const x = primera(resumenParaLaPagina(g, [VENTAS], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: l }));
    expect(x.costo).toBeNull();
    expect(x.falta).toBe(faltaDeLaPerdida({ meta: "Subir la conversión de los leads" }));
    expect(x.falta).not.toMatch(/\d/);
    const conFalta = primera(resumenParaLaPagina(guardado(false), [VENTAS], {}, { escalaVersion: "9.0.0" }, { conCitas: false, perdida: l }));
    expect(conFalta.falta).toBe("Falta medir cuánto deja de cobrar la cartera vencida al mes.");
  });
});
