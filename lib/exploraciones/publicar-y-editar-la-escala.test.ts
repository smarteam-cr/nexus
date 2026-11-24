/**
 * lib/exploraciones/publicar-y-editar-la-escala.test.ts — la escala que ve el cliente se PUBLICA y todo se edita (16 nov;
 * Elías: «valida que toda la info… se pueda editar… y hay que publicarlo actualizado»).
 *
 * Lo que se cuida:
 *   · la foto: se sirve solo si es del formato de hoy, y comparar con lo de hoy no da «cambiado» por el orden de las
 *     claves que devuelve Postgres;
 *   · la operación `textoDeLaPagina`: escribe, quita (texto vacío), vuelve al de siempre (null), rechaza otra clave y
 *     sobrevive a la lectura estricta del Json;
 *   · las páginas pintan el texto cambiado, y afuera no sale lo quitado (un caso, un riesgo);
 *   · un texto atado a la escala (`CLAVES.calculado`) deja de aplicarse si el de la escala cambia;
 *   · ⛔ la página pública no lee lo medido hoy: sirve la foto (escala-view.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ResultadoDelTestVista from "@/components/external/test/ResultadoDelTestVista";
import ResumenDeLaEscalaVista from "@/components/external/test/ResumenDeLaEscalaVista";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { aplicarOperaciones, contenidoVacio, propuestaVacia, type EstadoDeExploracion, type Validez } from "./contenido";
import type { EscalaParaElCliente } from "./escala-para-el-cliente-server";
import { resumenParaLaPagina } from "./resumen-de-la-escala";
import { FORMATO_DE_LA_FOTO, fotoDe, jsonEnOrden, mismaPagina, paginaDeLaFoto } from "./escala-publicada";
import { leerContenido, VALIDADOR_ESTRICTO } from "./esquemas";
import { CLAVES, huella, MAX_TEXTO_DE_LA_PAGINA, quitadaDeLaPagina, textoDeLaPagina } from "@/lib/external/textos-de-la-pagina";

const RAIZ = process.cwd();
const VALIDEZ: Validez = { dimensiones: new Set(["1.1"]), criterios: new Set(), areas: new Set(["1"]), ediciones: new Set(), escalaVersion: "9.0.0" };
const base = (): EstadoDeExploracion => ({
  contenido: contenidoVacio(),
  propuesta: propuestaVacia(),
  areas: ["1"],
  edicion: null,
  perfilCierre: "con equipo",
  perfilDespues: "continua",
  responsableEmail: null,
  archivada: false,
});
const aplicar = (e: EstadoDeExploracion, ops: Parameters<typeof aplicarOperaciones>[1]) => aplicarOperaciones(e, ops, VALIDEZ, VALIDADOR_ESTRICTO);

const pagina = (extra: Partial<EscalaParaElCliente> = {}): EscalaParaElCliente =>
  ({
    empresa: "Empresa",
    dominio: null,
    logo: null,
    fecha: "2026-11-16T10:00:00.000Z",
    areas: [{ id: "1", nombre: "Ventas" }],
    resultados: [],
    porExplorar: {},
    partesEnJuego: 8,
    detalles: {},
    dimensionDelRiesgo: {},
    resumen: { tarjetas: [], pendientes: [] },
    textos: {},
    ...extra,
  }) as unknown as EscalaParaElCliente;

describe("la foto publicada", () => {
  it("se sirve solo con el formato de hoy y la forma mínima", () => {
    const p = pagina();
    expect(paginaDeLaFoto(fotoDe(p))).toEqual(p);
    expect(paginaDeLaFoto({ formato: FORMATO_DE_LA_FOTO + 1, pagina: p })).toBeNull();
    expect(paginaDeLaFoto({ formato: FORMATO_DE_LA_FOTO, pagina: { empresa: "x" } })).toBeNull();
    expect(paginaDeLaFoto(null)).toBeNull();
    // Una foto sin `textos` (de antes de que existieran) se sirve con ninguno cambiado.
    const { textos: _t, ...sinTextos } = p;
    void _t;
    expect(paginaDeLaFoto({ formato: FORMATO_DE_LA_FOTO, pagina: sinTextos })?.textos).toEqual({});
  });

  it("lo de hoy es lo publicado aunque Postgres devuelva las claves en otro orden; un texto distinto no", () => {
    const hoy = pagina({ textos: { b: "2", a: "1" } });
    const deLaBase = JSON.parse(JSON.stringify({ ...hoy, textos: { a: "1", b: "2" } })) as EscalaParaElCliente;
    expect(mismaPagina(hoy, deLaBase)).toBe(true);
    expect(mismaPagina(hoy, pagina({ textos: { a: "1", b: "3" } }))).toBe(false);
    expect(jsonEnOrden({ b: 1, a: { d: undefined, c: 2 } })).toBe('{"a":{"c":2},"b":1}');
    // La fecha del pie no cuenta: sin niveles sale de la última vez que se guardó cualquier cosa.
    expect(mismaPagina(hoy, { ...deLaBase, fecha: "2026-11-17T09:00:00.000Z" })).toBe(true);
  });

  it("⛔ la forma de la portada (24 nov) no cuenta: el deploy no hace decir «Hay cambios que el cliente no ve»", () => {
    const hoy = pagina();
    const conLaForma = { ...hoy, resumen: { ...hoy.resumen, formaDeLaPortada: 2 } } as EscalaParaElCliente;
    const { formaDeLaPortada, ...resumenDeAntes } = conLaForma.resumen;
    void formaDeLaPortada;
    expect(mismaPagina(conLaForma, { ...conLaForma, resumen: resumenDeAntes } as EscalaParaElCliente)).toBe(true);
    // Lo demás sigue contando.
    expect(mismaPagina(conLaForma, { ...conLaForma, resumen: { ...resumenDeAntes, sinExplorar: ["9"] } } as EscalaParaElCliente)).toBe(false);
  });

  it("el vistazo de cada nivel (21 nov) no cuenta: una foto de antes no avisa cambios; un nivel con otro nombre sí", () => {
    const r = (niveles: unknown) => ({ areaId: "1", niveles }) as unknown as ResultadoDelTest;
    const antes = pagina({ resultados: [r([{ letra: "D", nombre: "Deficiente" }])] });
    const hoy = pagina({ resultados: [r([{ letra: "D", nombre: "Deficiente", vistazo: "Nadie sabe en qué va cada venta." }])] });
    expect(mismaPagina(antes, hoy)).toBe(true);
    expect(mismaPagina(antes, pagina({ resultados: [r([{ letra: "D", nombre: "Muy bajo" }])] }))).toBe(false);
  });
});

describe("la operación textoDeLaPagina", () => {
  const clave = CLAVES.delArea("1", "titulo.radar");
  it("escribe, quita con vacío, vuelve al de siempre con null y rechaza una clave con otra forma", () => {
    const r = aplicar(base(), [{ op: "textoDeLaPagina", clave, texto: "  Así está hoy  " }]);
    expect(r.ok && r.estado.contenido.textosDeLaPagina).toEqual({ [clave]: "Así está hoy" });
    const quitada = r.ok ? aplicar(r.estado, [{ op: "textoDeLaPagina", clave, texto: "" }]) : r;
    expect(quitada.ok && quitada.estado.contenido.textosDeLaPagina).toEqual({ [clave]: "" });
    const deSiempre = quitada.ok ? aplicar(quitada.estado, [{ op: "textoDeLaPagina", clave, texto: null }]) : quitada;
    expect(deSiempre.ok && deSiempre.estado.contenido.textosDeLaPagina).toBeUndefined();
    expect(aplicar(base(), [{ op: "textoDeLaPagina", clave: "con espacios", texto: "x" }]).ok).toBe(false);
    const largo = aplicar(base(), [{ op: "textoDeLaPagina", clave, texto: "x".repeat(MAX_TEXTO_DE_LA_PAGINA + 50) }]);
    expect(largo.ok && largo.estado.contenido.textosDeLaPagina?.[clave]).toHaveLength(MAX_TEXTO_DE_LA_PAGINA);
  });

  it("sobrevive a la lectura del Json (también lo quitado)", () => {
    const c = leerContenido({ textosDeLaPagina: { [clave]: "Nuevo", "fijo.pie": "", "no vale": "x" } });
    expect(c.textosDeLaPagina).toEqual({ [clave]: "Nuevo", "fijo.pie": "" });
  });
});

describe("los textos en la página", () => {
  it("el cambiado, el de siempre o quitado", () => {
    expect(textoDeLaPagina({ a: "Otro" }, "a", "Siempre")).toBe("Otro");
    expect(textoDeLaPagina({}, "a", "Siempre")).toBe("Siempre");
    expect(quitadaDeLaPagina({ a: "" }, "a")).toBe(true);
    expect(quitadaDeLaPagina({ a: "x" }, "a")).toBe(false);
  });

  it("lo atado a la escala deja de aplicarse si el texto de la escala cambia", () => {
    expect(CLAVES.calculado("1", "riesgo", "Riesgo A")).toBe(CLAVES.calculado("1", "riesgo", "Riesgo  A "));
    expect(CLAVES.calculado("1", "riesgo", "Riesgo A")).not.toBe(CLAVES.calculado("1", "riesgo", "Riesgo B"));
    expect(huella("x")).toMatch(/^[0-9a-z]+$/);
  });

  it("la página del área pinta lo cambiado y, afuera, no saca lo quitado", () => {
    const r = {
      areaId: "1",
      areaNombre: "Ventas",
      nivel: "I",
      nivelNombre: "Inicial",
      sintesis: "Descripción",
      preguntadas: 1,
      total: 1,
      puntaje: 30,
      capas: [],
      niveles: (["D", "I", "F", "E", "O"] as const).map((letra, i) => ({ letra, nombre: ["Deficiente", "Inicial", "Funcional", "Eficiente", "Óptimo"][i] })),
      dimensiones: [{ id: "1.1", nombre: "Procesos", capa: "base", preguntada: true, nivel: "I", nivelNombre: "Inicial", puntaje: 30, noLoSe: false }],
      recomendacion: null,
      casos: [
        { id: "caso-a", titulo: "Caso A", promesa: "Promesa A", razon: "" },
        { id: "caso-b", titulo: "Caso B", promesa: "Promesa B", razon: "" },
      ],
      riesgos: ["Riesgo uno", "Riesgo dos"],
    } as unknown as ResultadoDelTest;
    const textos = {
      [CLAVES.caso("1", "caso-a", "titulo")]: "CASO CAMBIADO",
      [CLAVES.caso("1", "caso-b")]: "",
      [CLAVES.calculado("1", "riesgo", "Riesgo dos")]: "",
      [CLAVES.delArea("1", "titulo.radar")]: "TITULO CAMBIADO",
    };
    const html = renderToStaticMarkup(
      createElement(ResultadoDelTestVista, {
        r,
        empresa: "Empresa",
        agenda: "",
        detalles: {},
        dimensionDelRiesgo: {},
        deLaEscala: { areas: [{ id: "1", nombre: "Ventas", href: "#" }], porExplorar: [], resumen: null, textos },
      }),
    );
    expect(html).toContain("CASO CAMBIADO");
    expect(html).toContain("TITULO CAMBIADO");
    expect(html).not.toContain("Caso B");
    expect(html).toContain("Riesgo uno");
    expect(html).not.toContain("Riesgo dos");
  });
});

describe("el Resumen con los textos cambiados", () => {
  const PENDIENTE = "Conversar con tu equipo de Servicio: todavía no tuvimos una sesión con él.";
  const resumen = {
    ...resumenParaLaPagina(null, [], {}, {}, { conCitas: false }),
    pendientes: [
      { id: "x3", tipo: "no-explorada" as const, texto: PENDIENTE, clave: null, areaNombre: "Servicio" },
      { id: "x2", tipo: "no-explorada" as const, texto: "Conversar con tu equipo de Marketing: todavía no tuvimos una sesión con él.", clave: null, areaNombre: "Marketing" },
    ],
  };
  const pintar = (textos: Record<string, string>) =>
    renderToStaticMarkup(createElement(ResumenDeLaEscalaVista, { resumen, empresa: "Empresa", pestanas: [{ id: "resumen", nombre: "Resumen", href: "#" }], textos }));

  it("afuera no sale un pendiente quitado; uno cambiado sale cambiado; el título del cierre también", () => {
    const html = pintar({
      [CLAVES.delResumen(`pendiente.x3.${huella(PENDIENTE)}`)]: "",
      [CLAVES.delResumen("titulo.cierre")]: "CIERRE CAMBIADO",
    });
    expect(html).not.toContain("equipo de Servicio");
    expect(html).toContain("equipo de Marketing");
    expect(html).toContain("CIERRE CAMBIADO");
  });

  it("⛔ lo quitado para un texto deja de aplicarse si el texto de la página cambia", () => {
    const html = pintar({ [CLAVES.delResumen(`pendiente.x3.${huella("Otro texto de antes")}`)]: "" });
    expect(html).toContain("equipo de Servicio");
  });

  it("sin ningún pendiente que salga, no hay banda de cierre", () => {
    const html = pintar({
      [CLAVES.delResumen(`pendiente.x3.${huella(PENDIENTE)}`)]: "",
      [CLAVES.delResumen(`pendiente.x2.${huella(resumen.pendientes[1].texto)}`)]: "",
    });
    expect(html).not.toContain("Tu mirada completa el diagnóstico");
  });
});

describe("⛔ la página pública sirve la foto", () => {
  it("escala-view no arma la página de hoy: lee la foto publicada", () => {
    const fuente = fs.readFileSync(path.join(RAIZ, "lib/external/escala-view.ts"), "utf8");
    expect(fuente).toContain("paginaDeLaFoto(acceso.publicada)");
    expect(fuente).not.toMatch(/escalaParaElCliente\(/);
  });
});
