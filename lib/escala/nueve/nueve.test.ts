/**
 * lib/escala/nueve/nueve.test.ts — el borrador 9.0.0 de la escala, armado sobre la 8.9.1 real del repo
 * (docs/escala/escala_rendimiento_smarteam.md, que es su exportación). Mira lo que importa: que se lea, que pase las
 * pruebas de publicar (salvo la 3, hasta rehacer el ejemplo de la especificación), que cada cambio diga de qué punto
 * sale, que lo dudoso no entre y que no se pueda publicar con «Lo que falta decidir».
 *
 * Correr: `npx vitest run lib/escala/nueve --project unit`.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { importarEscala } from "@/lib/escala/datos/importar";
import { escalaDeLosDatos, generarMarkdown } from "@/lib/escala/datos/generar";
import { leerRetirados } from "@/lib/escala/documento/parsear";
import { validarEscala } from "@/lib/escala/documento/validar";
import { conVersion } from "@/lib/escala/datos/versiones";
import { datosConLoQueFaltaDecidir, tieneLoQueFaltaDecidir } from "@/lib/escala/datos/reglas";
import { revisarParaPublicar } from "@/lib/escala/datos/publicar";
import { aplicarEntrada, comprobarQueSeLee, estadoInicial, ErrorDelCatalogo } from "./aplicar";
import { CATALOGO, UMBRAL_DE_TRAFICO } from "./catalogo";
import { aplicarConDetalle, conLoQueFaltaDecidir, notaDeLaBitacora, parteLoQueFaltaDecidir } from "./informe";

const RAIZ = path.resolve(__dirname, "../../..");
const BASE = importarEscala(fs.readFileSync(path.join(RAIZ, "docs/escala/escala_rendimiento_smarteam.md"), "utf8"));
const ESPEC = fs.readFileSync(path.join(RAIZ, "docs/escala/especificacion_calculo_escala.md"), "utf8");
const RETIRADOS = leerRetirados(ESPEC);

const armado = (() => {
  const { estado, detalle } = aplicarConDetalle(conVersion(BASE, "9.0.0"), RETIRADOS, CATALOGO);
  const final = conLoQueFaltaDecidir(estado.datos, parteLoQueFaltaDecidir("9.0.0", estado, CATALOGO));
  return { estado, detalle, final, md: generarMarkdown(final) };
})();

const idsDeLaMatriz = (d: typeof BASE) =>
  d.partes.flatMap((p) => (p.tipo === "matriz" ? p.areas.flatMap((a) => a.capas.flatMap((c) => c.dimensiones.flatMap((x) => x.niveles.flatMap((n) => n.criterios)))) : []));

describe("el borrador 9.0.0 sobre la 8.9.1", { timeout: 120_000 }, () => {
  it("parte de la 8.9.1 publicada y no la toca", () => {
    expect(BASE.encabezado.find((c) => c.clave === "version")?.valor).toBe("8.9.1");
    const otra = importarEscala(fs.readFileSync(path.join(RAIZ, "docs/escala/escala_rendimiento_smarteam.md"), "utf8"));
    expect(generarMarkdown(BASE)).toBe(generarMarkdown(otra));
  });

  it("se lee y vuelve igual, y pasa las pruebas de publicar salvo la 3 (el ejemplo de Priorización de Leads de la especificación)", () => {
    comprobarQueSeLee(armado.final);
    const espec = ESPEC.replace(/(Identificadores retirados, que no se vuelven a usar: )/, `$1${armado.estado.retirados.map((x) => "`" + x + "`").join(", ")}, `);
    const pruebas = validarEscala(escalaDeLosDatos(armado.final), { anterior: escalaDeLosDatos(BASE), especificacion: espec, calculo: { texto: armado.md } });
    const fallan = pruebas.filter((p) => !p.ok).map((p) => p.nombre);
    expect(fallan).toEqual(["3 · Los ejemplos cuadran"]);
  });

  it("ningún número nuevo reusa un retirado, y todo lo retirado queda fuera de la escala", () => {
    const enUso = new Set(idsDeLaMatriz(armado.final).map((c) => c.id));
    for (const id of Object.values(armado.estado.alias)) expect(RETIRADOS, id).not.toContain(id);
    for (const id of armado.estado.retirados) expect(enUso.has(id), id).toBe(false);
    expect(new Set(armado.estado.retirados).size).toBe(armado.estado.retirados.length);
  });

  it("cada entrada dice de qué punto sale; lo dudoso no cambia nada y deja su pregunta", () => {
    for (const e of CATALOGO) {
      expect(e.punto, e.resumen).toMatch(/^(§\d+|Insider)/);
      if (e.estado === "pregunta" || e.estado === "despues-de-la-prueba" || e.estado === "texto-pendiente") expect(e.ops, e.punto).toEqual([]);
      if (e.estado === "aplicada" || e.estado === "aplicada-con-redaccion") expect(e.ops.length, e.punto).toBeGreaterThan(0);
      if (e.estado === "pregunta" || e.estado === "parcial" || e.estado === "despues-de-la-prueba" || e.estado === "texto-pendiente") expect(e.pregunta, e.punto).toBeTruthy();
      expect(notaDeLaBitacora(e)).toContain(e.punto);
    }
    expect(new Set(CATALOGO.map((e) => e.punto)).size, "un punto, una entrada").toBe(CATALOGO.length);
  });

  it("los 16 cambios de Insider están, y la condición «tráfico suficiente» va con su umbral marcado «por validar»", () => {
    const insider = CATALOGO.filter((e) => /Insider \d+/.test(e.punto)).flatMap((e) => [...e.punto.matchAll(/Insider (\d+)/g)].map((m) => Number(m[1])));
    expect([...new Set(insider)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    // Los criterios (con su etiqueta), no la lectura de preparación de la Parte 2, que también lo nombra.
    const conTrafico = armado.md.split("\n").filter((l) => l.includes(UMBRAL_DE_TRAFICO) && l.startsWith("- ") && l.includes("`["));
    expect(conTrafico.length, "Ecommerce y Turismo (el de Marketing quedó como pregunta: así redactado no tenía IA)").toBe(2);
    for (const l of conTrafico) expect(l).toContain("por validar");
    for (const e of CATALOGO.filter((x) => x.fuente === "insider" || /Insider/.test(x.punto))) expect(e.habilita ?? "", e.punto).not.toBe("");
  });

  it("«Lo que falta decidir» está en el borrador y frena la publicación", () => {
    expect(tieneLoQueFaltaDecidir(armado.md)).toBe(true);
    expect(datosConLoQueFaltaDecidir(armado.final)).toBe(true);
    expect(datosConLoQueFaltaDecidir(BASE)).toBe(false);
    const r = revisarParaPublicar({
      escala: escalaDeLosDatos(armado.final),
      texto: armado.md,
      anterior: escalaDeLosDatos(BASE),
      especificacion: ESPEC,
      manual: null,
      mapa: null,
      publicadas: ["8.9.1"],
      edicionesRevisadas: true,
    });
    expect(r.bloqueos.join(" ")).toContain("Lo que falta decidir");
    // La escala general no nombra herramientas: ni Insider ni HubSpot en los criterios de la matriz.
    for (const c of idsDeLaMatriz(armado.final)) expect(c.texto, c.id).not.toMatch(/insider|hubspot/i);
  });

  it("un criterio que se va deja de requerirse, y quien lo requería pasa al que lo reemplaza", () => {
    const todos = idsDeLaMatriz(armado.final);
    const retirados = new Set(armado.estado.retirados);
    for (const c of todos) for (const r of c.requiere) expect(retirados.has(r), `${c.id} requiere ${r}`).toBe(false);
    const contexto = armado.estado.alias["@1.3.F.contexto"];
    expect(todos.find((c) => c.id === "1.2.E5")?.requiere).toEqual([contexto]);
  });

  it("lo que una edición decía con sus palabras de un criterio que cambió no se pierde en silencio: queda como consecuencia", () => {
    const c = armado.estado.consecuencias;
    // Educación reescribía el reporte de tareas, que se mueve de Equipo y Gobierno a Procesos.
    expect(c.some((x) => x.edicion === "educacion" && x.texto.startsWith("1.4.F5"))).toBe(true);
    // Banca reescribía la definición de lead calificado, que se acota: se suelta y queda anotada.
    expect(c.some((x) => x.edicion === "banca" && x.texto.startsWith("1.6.F2") && x.texto.includes("la edición lo decía"))).toBe(true);
    // Y la parte «Lo que falta decidir» lo nombra.
    expect(armado.md).toContain("Banca y servicios financieros.**");
  });

  it("un criterio que pide más que antes entra con número nuevo, aunque el plan de Insider lo llamara «Ajuste»", () => {
    for (const viejo of ["2.3.F7", "2.3.E4", "2.6.E4", "2.7.E1", "2.8.E1", "2.2.O2", "3.6.E2", "3.7.E5"]) expect(armado.estado.retirados, viejo).toContain(viejo);
    expect(CATALOGO.find((e) => e.punto === "Insider · los «Ajuste» que suben la vara")?.estado).toBe("pregunta");
  });

  it("un alias que no existe, o un criterio que no está, frenan con el punto", () => {
    const s = estadoInicial(conVersion(BASE, "9.0.0"), RETIRADOS);
    expect(() => aplicarEntrada(s, { punto: "§X", fuente: "pendiente-9-0", tema: "x", resumen: "x", estado: "aplicada", ops: [{ op: "editar", id: "@nada", cambios: {} }] })).toThrow(ErrorDelCatalogo);
    expect(() => aplicarEntrada(s, { punto: "§X", fuente: "pendiente-9-0", tema: "x", resumen: "x", estado: "aplicada", ops: [{ op: "retirar", id: "9.9.F9" }] })).toThrow(/§X/);
  });
});
