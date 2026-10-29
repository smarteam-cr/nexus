/**
 * lib/escala/nueve/nueve.test.ts — el borrador 9.0.0 de la escala, armado sobre la 8.9.1 real (su exportación,
 * guardada en `__fixtures__/escala-8.9.1.md` desde que el repo pasó a la 9.0.0, con los retirados de la
 * especificación 1.3.8, que son los que tenía el catálogo al numerar). Mira lo que importa: que se lea, que pase las
 * pruebas de publicar, que cada cambio diga de qué punto sale, que lo dudoso no entre, que no se pueda publicar con
 * «Lo que falta decidir» y que el cierre (cierre.ts) decida cada pendiente y deje lo mismo que está en el repo.
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
import { aplicarConDetalle, conLoQueFaltaDecidir, notaDeLaBitacora, parteLoQueFaltaDecidir, sinLoQueFaltaDecidir } from "./informe";
import { CIERRE, CORRECCIONES, entradasDelCierre, FECHA_DE_LA_9_0, MARCA_PROVISIONAL, NOTA_DE_LA_SALIDA, notaDelCierre } from "./cierre";
import { aplicarEdicion } from "@/lib/escala/documento/edicion";
import { parsearMapaDeHerramientas } from "@/lib/escala/herramientas/parsear";
import { problemasDelMapa } from "@/lib/escala/herramientas/validar";
import { leerPreparacion, preparacionDeLaVista } from "@/lib/escala/preparacion";

const RAIZ = path.resolve(__dirname, "../../..");
const FIXTURES = path.join(RAIZ, "lib/escala/nueve/__fixtures__");
const BASE = importarEscala(fs.readFileSync(path.join(FIXTURES, "escala-8.9.1.md"), "utf8"));
/** La especificación de hoy (1.4.0, con los retirados de la 9.0 y el ejemplo de Priorización de Leads rehecho). */
const ESPEC = fs.readFileSync(path.join(RAIZ, "docs/escala/especificacion_calculo_escala.md"), "utf8");
/** Los retirados con que el catálogo numeró: los de la 1.3.8, la publicada cuando se armó el borrador. */
const RETIRADOS = leerRetirados(fs.readFileSync(path.join(FIXTURES, "especificacion-1.3.8.md"), "utf8"));

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
    const otra = importarEscala(fs.readFileSync(path.join(FIXTURES, "escala-8.9.1.md"), "utf8"));
    expect(generarMarkdown(BASE)).toBe(generarMarkdown(otra));
  });

  it("se lee y vuelve igual, y pasa las pruebas de publicar con la especificación 1.4.0", () => {
    comprobarQueSeLee(armado.final);
    const pruebas = validarEscala(escalaDeLosDatos(armado.final), { anterior: escalaDeLosDatos(BASE), especificacion: ESPEC, calculo: { texto: armado.md } });
    expect(pruebas.filter((p) => !p.ok).map((p) => `${p.nombre}: ${p.detalle.join("; ")}`)).toEqual([]);
    // La especificación 1.4.0 anota como retirados los mismos que sacó el borrador.
    for (const id of armado.estado.retirados) expect(leerRetirados(ESPEC), id).toContain(id);
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

  it("los 16 cambios de Insider están, y «tráfico suficiente» es una marca de perfil con su pregunta (N4), no un «Si…» en el texto", () => {
    const insider = CATALOGO.filter((e) => /Insider \d+/.test(e.punto)).flatMap((e) => [...e.punto.matchAll(/Insider (\d+)/g)].map((m) => Number(m[1])));
    expect([...new Set(insider)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    // Los criterios (con su etiqueta): ninguno lleva ya la condición en el texto…
    const criterios = armado.md.split("\n").filter((l) => l.startsWith("- ") && l.includes("`["));
    expect(criterios.filter((l) => l.includes(UMBRAL_DE_TRAFICO))).toEqual([]);
    // …y los dos de las ediciones (Ecommerce y Turismo; el de Marketing quedó como pregunta) llevan la marca, sola.
    const conMarca = criterios.filter((l) => l.includes("· tráfico suficiente"));
    expect(conMarca.map((l) => /`\[(\d+\.\d+\.O\d+) ·/.exec(l)?.[1])).toEqual([armado.estado.alias["@ecommerce.1.6.O.anonimo"], armado.estado.alias["@turismo.1.6.O.motor"]]);
    for (const l of conMarca) expect(l, "una sola marca: ninguno queda con dos condiciones").not.toMatch(/venta sin vendedor|venta con equipo|recurrente|recompra|relación continua/);
    // La tercera pregunta del perfil, con el umbral provisional que leen la marca y la lectura de preparación.
    const escala = escalaDeLosDatos(armado.final);
    expect(escala.perfilDeNegocio.trafico?.opciones.map((o) => o.nombre)).toEqual(["Suficiente", "insuficiente"]);
    expect(escala.preparacion?.umbralDeTrafico).toBe(50_000);
    for (const e of CATALOGO.filter((x) => x.fuente === "insider" || /Insider/.test(x.punto))) expect(e.habilita ?? "", e.punto).not.toBe("");
  });

  it("la lectura de preparación (N6) se lee del texto: sus umbrales, sus cimientos por número y sin avisos", () => {
    const escala = escalaDeLosDatos(armado.final);
    expect(escala.avisosDeLectura).toEqual([]);
    expect(escala.preparacion).toMatchObject({ umbralDeTrafico: 50_000, umbralDeBase: 5_000 });
    expect(escala.preparacion?.cimientos).toEqual([armado.estado.alias["@2.3.F.permiso"], armado.estado.alias["@2.3.E.comportamiento"], "1.2.F102", "1.2.F501"]);
    expect(escala.preparacion?.estados.lista).toContain("tráfico suficiente");
    // No nombra herramientas.
    expect(JSON.stringify(escala.preparacion)).not.toMatch(/insider|hubspot/i);
  });

  it("la lectura de preparación, vista por cada edición: el catálogo de Ecommerce cuenta en Ecommerce y no en Turismo", () => {
    const general = escalaDeLosDatos(armado.final);
    const permiso = armado.estado.alias["@2.3.F.permiso"];
    const comportamiento = armado.estado.alias["@2.3.E.comportamiento"];
    const ids = (ed: string | null) => preparacionDeLaVista(aplicarEdicion(general, ed), { cierre: null, despues: "recompra" })!.cimientos.map((c) => c.id);
    expect(ids(null)).toEqual([permiso, comportamiento]);
    expect(ids("ecommerce-retail")).toEqual([permiso, comportamiento, "1.2.F102"]);
    expect(ids("turismo")).toEqual([permiso, comportamiento, "1.2.F501"]);
    // Una tienda con todo, menos el permiso por canal: «Casi lista», y dice cuál falta.
    const vista = preparacionDeLaVista(aplicarEdicion(general, "ecommerce-retail"), { cierre: null, despues: "recompra" })!;
    const r = leerPreparacion(vista, {
      aQuienVende: "personas",
      despues: "recompra",
      trafico: "200k_1m",
      base: "50k_200k",
      nivelDeMarketing: "F",
      cimientos: { [permiso]: false, [comportamiento]: true, "1.2.F102": true },
    });
    expect(r.estado).toBe("casi-lista");
    expect(r.cimientos.filter((c) => c.cumple === false).map((c) => c.id)).toEqual([permiso]);
  });

  it("el mapa de herramientas 2.0.0 nombra solo criterios del borrador y trae los 16 cambios con quién los habilita (N7)", () => {
    const mapa = parsearMapaDeHerramientas(fs.readFileSync(path.join(RAIZ, "docs/escala/mapa_de_herramientas.md"), "utf8"));
    const escala = escalaDeLosDatos(armado.final);
    expect(mapa.version).toBe("2.0.0");
    expect(mapa.escala).toBe("9.0.0");
    expect(mapa.historial.map((h) => h.version)).toContain("2.0.0");
    expect(problemasDelMapa(mapa, escala)).toEqual([]);
    const de = (clave: string) => mapa.herramientas.find((h) => h.clave === clave)!;
    const a = (alias: string) => armado.estado.alias[alias];
    // Lo que el plan dice que habilita cada una (docs/escala-engagement-avanzado-plan.md, columna «Lo habilita»).
    const ambos = ["@2.3.F.permiso", "@2.3.E.comportamiento", "@2.6.E.comportamiento", "@2.7.E.recorrido", "@2.8.E.pruebas", "@2.2.O.ficha", "@2.2.O.palabras", "@1.6.E.siguiente", "@3.7.E.eventos", "@turismo.1.7.F.medias", "@turismo.3.7.E.vuelo"];
    const soloInsider = ["@ecommerce.1.6.O.anonimo", "@ecommerce.1.7.E.aviso", "@turismo.1.6.O.motor"];
    for (const x of [...ambos, ...soloInsider]) expect(de("insider").aportes[a(x)], `Insider · ${x}`).toBeTruthy();
    for (const x of ambos) expect(de("hubspot").aportes[a(x)], `HubSpot · ${x}`).toBeTruthy();
    for (const x of soloInsider) expect(de("hubspot").aportes[a(x)], `HubSpot no personaliza al anónimo · ${x}`).toBeUndefined();
    expect(de("insider").aportes[a("@3.6.E.momento")]).toBeTruthy();
    expect(de("hubspot").aportes[a("@3.6.E.momento")]).toBeTruthy();
    // Las fichas: Insider con el umbral de tráfico; HubSpot con lo que no hace.
    expect(de("insider").cuandoConviene).toContain("50.000 visitas al mes");
    expect(de("hubspot").cuandoConviene).toMatch(/No personaliza al visitante anónimo/);
  });

  it("el borrador de producción recibe lo de la noche 3 sin rehacer lo anterior: las entradas nuevas van al final", () => {
    const desde = CATALOGO.findIndex((e) => e.punto.startsWith("Insider · N4"));
    expect(desde).toBeGreaterThan(0);
    expect(CATALOGO.slice(desde).every((e) => / · N[467] · /.test(e.punto))).toBe(true);
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

  it("las operaciones del cierre frenan con el punto si no encuentran lo que buscan", () => {
    const s = estadoInicial(conVersion(BASE, "9.0.0"), RETIRADOS);
    const con = (op: Parameters<typeof aplicarEntrada>[1]["ops"][number]) => () => aplicarEntrada(s, { punto: "§X", fuente: "pendiente-9-0", tema: "x", resumen: "x", estado: "aplicada", ops: [op] });
    expect(con({ op: "prosa-punto", parte: "Parte 2", empieza: "No existe este punto", texto: "x" })).toThrow(/§X.*No existe este punto/);
    expect(con({ op: "prosa-punto-despues", parte: "Parte 2", despuesDe: "Tampoco este", texto: "x" })).toThrow(/Tampoco este/);
    expect(con({ op: "prosa-punto", parte: "Parte 9", empieza: "x", texto: "x" })).toThrow(/Parte 9/);
    expect(con({ op: "prosa-celda", parte: "Parte 4", fila: "x.9", columna: 1, texto: "x" })).toThrow(/x\.9/);
    expect(con({ op: "prosa-celda", parte: "Parte 4", fila: "x.6", columna: 9, texto: "x" })).toThrow(/columna 9/);
    expect(con({ op: "encabezado", clave: "no-existe", valor: "x" })).toThrow(/no-existe/);
    // Y lo que sí encuentran, lo cambian donde está.
    const r = aplicarEntrada(s, { punto: "§X", fuente: "pendiente-9-0", tema: "x", resumen: "x", estado: "aplicada", ops: [{ op: "prosa-celda", parte: "Parte 4", fila: "x.6", columna: 1, texto: "Otra" }, { op: "encabezado", clave: "fecha", valor: "2030-01-01" }] });
    expect(generarMarkdown(r.datos)).toContain("| x.6 | Otra |");
    expect(r.datos.encabezado.find((c) => c.clave === "fecha")?.valor).toBe("2030-01-01");
  });
});

describe("el cierre del borrador (27 oct): una decisión por cada pendiente", { timeout: 120_000 }, () => {
  const pendientes = CATALOGO.filter((e) => e.estado === "despues-de-la-prueba" || e.pregunta || e.estado === "texto-pendiente");
  const cerrado = (() => {
    const { estado, pasos } = aplicarConDetalle(conVersion(BASE, "9.0.0"), RETIRADOS, [...CATALOGO, ...entradasDelCierre()]);
    const final = sinLoQueFaltaDecidir(estado.datos, parteLoQueFaltaDecidir("9.0.0", estado, CATALOGO));
    return { estado, pasos, final, md: generarMarkdown(final) };
  })();

  it("cada pregunta, cada texto por escribir y cada cosa que esperaba la prueba tiene una decisión, y solo una", () => {
    expect(pendientes.length).toBe(52);
    expect(CIERRE.map((d) => d.punto).sort()).toEqual(pendientes.map((e) => e.punto).sort());
    expect(new Set(CIERRE.map((d) => d.punto)).size).toBe(CIERRE.length);
  });

  it("cada nota de la bitácora empieza como las del catálogo y dice que es provisional", () => {
    for (const d of [...CIERRE, ...CORRECCIONES]) {
      const nota = notaDelCierre(d);
      expect(nota.startsWith("9.0 · cierre · "), d.punto).toBe(true);
      expect(nota.toLowerCase()).toContain(MARCA_PROVISIONAL.toLowerCase());
    }
    expect(NOTA_DE_LA_SALIDA.startsWith("9.0 · ")).toBe(true);
  });

  it("el cierre no saca ni suma criterios: lo que decide sin texto no cambia nada", () => {
    expect(cerrado.estado.retirados).toEqual(armado.estado.retirados);
    expect(Object.keys(cerrado.estado.alias)).toEqual(Object.keys(armado.estado.alias));
    const antes = idsDeLaMatriz(armado.final).map((c) => c.id);
    expect(idsDeLaMatriz(cerrado.final).map((c) => c.id)).toEqual(antes);
    for (const [i, d] of CIERRE.entries()) {
      if (d.ops.length) continue;
      const k = CATALOGO.length + i;
      expect(generarMarkdown(cerrado.pasos[k]), d.punto).toBe(generarMarkdown(cerrado.pasos[k - 1]));
    }
  });

  it("queda sin «Lo que falta decidir», con su fecha y su historial, y pasa todo lo de publicar", () => {
    comprobarQueSeLee(cerrado.final);
    expect(tieneLoQueFaltaDecidir(cerrado.md)).toBe(false);
    expect(cerrado.final.encabezado.find((c) => c.clave === "fecha")?.valor).toBe(FECHA_DE_LA_9_0);
    expect(cerrado.md).toContain(`**9.0.0 (${FECHA_DE_LA_9_0}).**`);
    expect(cerrado.md).toContain("| x.6 | Priorización |");
    expect(cerrado.md).toContain("El **puntaje de leads por reglas** se asigna a **Segmentación (2.6)**");
    expect(cerrado.md).not.toContain("promociones de fidelización");
    // La regla de los acuerdos entre dos áreas no se contradice con el criterio de Servicio que mide la señal a Ventas.
    expect(cerrado.md).not.toContain("del área que recibe");
    expect(cerrado.md).toContain("y la señal de Servicio a Ventas de los clientes listos para el siguiente producto, en **3.4**");
    const r = revisarParaPublicar({
      escala: escalaDeLosDatos(cerrado.final),
      texto: cerrado.md,
      anterior: escalaDeLosDatos(BASE),
      especificacion: ESPEC,
      manual: fs.readFileSync(path.join(RAIZ, "docs/escala/manual_operacion_escala.md"), "utf8"),
      mapa: parsearMapaDeHerramientas(fs.readFileSync(path.join(RAIZ, "docs/escala/mapa_de_herramientas.md"), "utf8")),
      publicadas: ["8.9.1"],
      edicionesRevisadas: false,
    });
    expect(r.bloqueos).toEqual([]);
  });

  // Mientras el repo diga 9.0.0, es la cerrada, byte por byte. La 9.1 (28 oct) solo suma la edición de Maquinaria y la
  // 9.2 (28 oct), la de Telecomunicaciones: su matriz y las seis ediciones de la 9.0 tienen que seguir iguales a la
  // cerrada. Desde la 9.3 el repo puede cambiarlas (la 9.0.0 queda congelada en la base, `EscalaVersion`), y lo único
  // que se exige es que no vuelva atrás.
  it("la escala del repo es la 9.0.0 cerrada, la misma que se publica, o una versión posterior que parte de ella", () => {
    const repo = fs.readFileSync(path.join(RAIZ, "docs/escala/escala_rendimiento_smarteam.md"), "utf8").replace(/\r\n?/g, "\n");
    const [mayor, menor, parche] = (/^version: (\d+)\.(\d+)\.(\d+)$/m.exec(repo) ?? []).slice(1).map(Number);
    if (mayor === 9 && menor === 0 && parche === 0) return expect(repo).toBe(cerrado.md);
    expect(mayor > 9 || (mayor === 9 && menor > 0), `la versión del repo (${mayor}.${menor}.${parche})`).toBe(true);
    if (mayor === 9 && (menor === 1 || menor === 2)) {
      const matriz = (md: string) => md.slice(md.indexOf("\n# Parte 3"), md.indexOf("\n# Parte 4"));
      expect(matriz(repo)).toBe(matriz(cerrado.md));
      const ediciones = cerrado.md.slice(cerrado.md.indexOf("\n# Parte 5")).split("\n## Edición — ").slice(1);
      expect(ediciones).toHaveLength(6);
      for (const e of ediciones) expect(repo.includes(`\n## Edición — ${e}`), e.slice(0, 40)).toBe(true);
    }
  });

  it("el manual 1.4.0 lista cada decisión provisional", () => {
    const manual = fs.readFileSync(path.join(RAIZ, "docs/escala/manual_operacion_escala.md"), "utf8").replace(/\r\n?/g, "\n");
    for (const d of [...CIERRE, ...CORRECCIONES]) expect(manual, d.punto).toContain(d.decision);
  });
});
