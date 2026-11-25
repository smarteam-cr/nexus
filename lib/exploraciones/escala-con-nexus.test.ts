/**
 * lib/exploraciones/escala-con-nexus.test.ts — la página de La escala en piezas para «✨ Pedirle a Nexus» (23 nov): las
 * piezas son las de la página (con la clave que usa la edición a mano), y cada cambio se escribe con la MISMA operación.
 */
import { describe, expect, it } from "vitest";
import { claveAtadaDelResumen, type ResumenDeLaPagina, type TarjetaDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { CLAVES } from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { SECCIONES_DEL_AREA, SECCIONES_DEL_RESUMEN, seccionDelEquipo } from "@/lib/external/secciones-de-la-escala";
import {
  esDeLoQueHicimos,
  esLaCifraGrande,
  fuenteDeLaCifraGrande,
  guiaDeLaPieza,
  hablaDeLoQueHicimos,
  leerLaPiezaNueva,
  operacionDelCambio,
  piezasDeLaSeccion,
  piezasDelArea,
  piezasDelResumen,
  citaDeLaCifraGrande,
  operacionConSuCita,
  revisarLoDeLaPagina,
  yaEstaEnLaPagina,
  type PiezaDeLaEscala,
} from "./escala-con-nexus";

const CITA = { reunion: "gmeet_1", fecha: "2026-11-05T16:00:00.000Z", turno: 4, hablante: "Diego", texto: "registramos todo a mano" };
const hicimos = { sesiones: 3, minutos: 150, sinDuracion: 0, equipos: [], personas: 2, texto: "", mano: false, areas: [] };

const resumen = (o: Partial<ResumenDeLaPagina> = {}): ResumenDeLaPagina =>
  ({
    at: "2026-11-21T15:00:00.000Z",
    formato: 2,
    hicimos,
    negocio: [
      { tipo: "tesis", titulo: "La tesis", lista: { piezas: [{ id: "n1", texto: "Las ventas se anotan a mano.", clave: "negocio:tesis:n1", citas: [CITA] }], nueva: "negocio:tesis:nuevo" } },
      { tipo: "etiquetas", titulo: "Etiquetas", lista: { piezas: [], nueva: "negocio:etiquetas:nuevo" } },
    ],
    recorrido: [],
    etapaNueva: "etapa:nuevo",
    tamano: null,
    tituloDelRecorrido: null,
    claveDelTituloDelRecorrido: "recorrido",
    tarjetas: [],
    pendientes: [],
    pendienteNuevo: "pendiente:nuevo",
    entendimos: [],
    sinExplorar: [],
    areas: [],
    datosRojos: [],
    falta: [],
    puntos: [{ id: "k1", titulo: "Nadie ve el mes", texto: "El gerente arma el reporte a mano.", clave: "punto:k1", areaNombre: null, citas: [CITA], mano: true }],
    puntoNuevo: "punto:nuevo",
    ...o,
  }) as ResumenDeLaPagina;

describe("las piezas del Resumen", () => {
  it("el título es la misma pieza que edita la página: «Diagnóstico de rendimiento», y Nexus lo puede cambiar (24 nov)", () => {
    const piezas = piezasDelResumen(resumen(), {});
    const titular = piezas.find((p) => p.nombre.startsWith("El título"))!;
    expect(titular.clave).toBe(`t/${claveAtadaDelResumen("titular.diagnostico", "Diagnóstico de rendimiento")}`);
    expect(titular).toMatchObject({ valor: "Diagnóstico de rendimiento", aMano: false, seccion: SECCIONES_DEL_RESUMEN.arriba });
    // Cambiado para esta empresa: se ve lo escrito y cuenta como escrito por el equipo; se escribe con la operación de siempre.
    const clave = titular.clave.slice(2);
    const cambiado = piezasDelResumen(resumen(), { [clave]: "Diagnóstico comercial de tu equipo." }).find((p) => p.clave === titular.clave)!;
    expect(cambiado).toMatchObject({ valor: "Diagnóstico comercial de tu equipo.", aMano: true });
    expect(operacionDelCambio(titular, "Diagnóstico de tu operación")).toMatchObject({ op: "textoDeLaPagina", clave, texto: "Diagnóstico de tu operación" });
    // Sin Resumen armado no hay título que pedirle.
    expect(piezasDelResumen(resumen({ hicimos: null }), {}).some((p) => p.nombre.startsWith("El título"))).toBe(false);
  });

  it("el resumen debajo del título y quién es quién son piezas de su sección; sin resumen, la bajada (24 nov)", () => {
    const conPortada = resumen({
      tarjetas: [{ areaId: "1", nombre: "Ventas", porExplorar: false, subequipos: [] }] as unknown as TarjetaDeLaPagina[],
      negocio: [
        { tipo: "portada", titulo: "El resumen", lista: { piezas: [{ id: "n2", texto: "La empresa invierte en 3 tiendas.", clave: "negocio:portada:n2", citas: [CITA] }], nueva: "negocio:portada:nuevo" } },
        { tipo: "quienes", titulo: "Quién es quién", lista: { piezas: [{ id: "n3", texto: "Ventas: Diego y 4 asesores", clave: "negocio:quienes:n3", citas: [CITA] }], nueva: "negocio:quienes:nuevo" } },
      ],
    });
    const piezas = piezasDelResumen(conPortada, {});
    expect(piezas.find((p) => p.clave === "r/negocio:portada:n2")?.seccion).toBe(SECCIONES_DEL_RESUMEN.arriba);
    expect(piezas.find((p) => p.clave === "r/negocio:quienes:n3")?.seccion).toBe(SECCIONES_DEL_RESUMEN.equipos);
    expect(piezas.some((p) => p.nombre.startsWith("La bajada"))).toBe(false);
    // Sin resumen: la bajada de siempre, y el lugar para escribirlo.
    const sin = piezasDelResumen(resumen({ negocio: [{ tipo: "portada", titulo: "El resumen", lista: { piezas: [], nueva: "negocio:portada:nuevo" } }] }), {});
    expect(sin.some((p) => p.nombre.startsWith("La bajada"))).toBe(true);
    expect(sin.find((p) => p.clave === "r/negocio:portada:nuevo")?.agregar).toBe(true);
  });

  it("cada lista que acepta una pieza nueva tiene su lugar para agregar", () => {
    const piezas = piezasDelResumen(resumen(), {});
    const agregar = piezas.filter((p) => p.agregar).map((p) => p.clave);
    expect(agregar).toEqual(expect.arrayContaining(["r/punto:nuevo", "r/etapa:nuevo", "r/pendiente:nuevo", "r/negocio:etiquetas:nuevo"]));
    // La tesis ya está: no se agrega otra (y es obligatoria: no se quita).
    expect(agregar).not.toContain("r/negocio:tesis:nuevo");
    expect(piezas.find((p) => p.clave === "r/negocio:tesis:n1")).toMatchObject({ quitable: false, conCita: true });
  });

  it("lo que escribió el equipo llega marcado, y sin Resumen armado no hay nada que pedirle (ni versión a la que volver)", () => {
    expect(piezasDelResumen(resumen(), {}).find((p) => p.clave === "r/punto:k1:titulo")?.aMano).toBe(true);
    const sinResumen = piezasDelResumen(resumen({ at: null, hicimos: null }), {});
    expect(sinResumen).toEqual([]);
  });

  it("al modelo le llegan las piezas sin las citas ni las reuniones", () => {
    const piezas = piezasDelResumen(resumen(), {});
    const todo = JSON.stringify(piezas.map((p) => ({ texto: p.valor, guia: guiaDeLaPieza(p) })));
    expect(todo).toContain("Las ventas se anotan a mano.");
    expect(todo).not.toContain("registramos todo a mano");
    expect(todo).not.toContain("gmeet_1");
  });
});

describe("un ítem nuevo sale entero (25 nov, Elías: «agrega un ítem más» dejó un punto clave con solo su título)", () => {
  const conEquipos = resumen({ areas: [{ areaId: "1", nombre: "Admisiones" }, { areaId: "2", nombre: "Marketing" }] as unknown as ResumenDeLaPagina["areas"] });
  const piezas = piezasDelResumen(conEquipos, {});
  const punto = piezas.find((p) => p.clave === "r/punto:nuevo")!;
  const paso = piezas.find((p) => p.clave === "r/etapa:nuevo")!;

  it("los lugares para agregar un punto clave y un paso tienen sus partes; las listas de un solo texto, no", () => {
    expect(punto.campos?.map((c) => c.nombre)).toEqual(["Título", "Qué pasa", "Equipo"]);
    expect(punto.campos?.[2]).toMatchObject({ opcional: true, opciones: ["Admisiones", "Marketing"] });
    expect(paso.campos?.map((c) => [c.nombre, !!c.opcional])).toEqual([["Paso", false], ["Qué pasa", false], ["Lo que se traba", true]]);
    expect(piezas.find((p) => p.clave === "r/pendiente:nuevo")?.campos).toBeUndefined();
    // Al modelo se le dice que va entero, un renglón por parte, y de qué equipos elige.
    expect(guiaDeLaPieza(punto)).toContain("ENTERO");
    expect(guiaDeLaPieza(punto)).toContain("«Equipo: …»");
    expect(guiaDeLaPieza(punto)).toContain("Admisiones, Marketing");
    // Sin equipos en la página, el punto va sin «Equipo».
    expect(piezasDelResumen(resumen(), {}).find((p) => p.clave === "r/punto:nuevo")?.campos?.map((c) => c.nombre)).toEqual(["Título", "Qué pasa"]);
  });

  it("se lee renglón por renglón, con su nombre; lo que falta o no se entiende no pasa", () => {
    expect(leerLaPiezaNueva(punto.campos!, "Título: Seguimiento sin etapas\nQué pasa: Cada gestora sigue a su manera y se pierden aspirantes.\nEquipo: admisiones")).toEqual({
      ok: true,
      valores: ["Seguimiento sin etapas", "Cada gestora sigue a su manera y se pierden aspirantes.", "Admisiones"],
    });
    expect(leerLaPiezaNueva(punto.campos!, "- Titulo: Seguimiento sin etapas\n- Que pasa: Se pierden aspirantes.\n- Equipo: Toda la empresa")).toEqual({ ok: true, valores: ["Seguimiento sin etapas", "Se pierden aspirantes.", ""] });
    expect(leerLaPiezaNueva(punto.campos!, "Título: Seguimiento sin etapas")).toMatchObject({ ok: false, motivo: expect.stringContaining("Le falta «Qué pasa»") });
    expect(leerLaPiezaNueva(punto.campos!, "Seguimiento sin etapas definidas")).toMatchObject({ ok: false });
    expect(leerLaPiezaNueva(punto.campos!, "Título: X\nQué pasa: Y\nEquipo: Finanzas")).toMatchObject({ ok: false, motivo: expect.stringContaining("no es un equipo de esta página") });
    expect(leerLaPiezaNueva(punto.campos!, "Título: X\nQué pasa: Y\nDueño: Ana")).toMatchObject({ ok: false });
    expect(leerLaPiezaNueva(punto.campos!, `Título: ${"x".repeat(200)}\nQué pasa: Y`)).toMatchObject({ ok: false, motivo: expect.stringContaining("pasa de") });
  });

  it("tolera lo que el modelo escribe de más: negritas, «Qué pasa» en dos renglones y el equipo con parte del nombre (revisión del 25 nov)", () => {
    expect(leerLaPiezaNueva(punto.campos!, "**Título:** Seguimiento sin etapas\n**Qué pasa:** Cada gestora sigue a su manera.\nY se pierden aspirantes.\nEquipo: admision")).toEqual({
      ok: true,
      valores: ["Seguimiento sin etapas", "Cada gestora sigue a su manera. Y se pierden aspirantes.", "Admisiones"],
    });
    // Un nombre que calza con dos equipos no se adivina.
    const dos = { ...punto.campos![2], opciones: ["Ventas", "Ventas y Marketing"] };
    expect(leerLaPiezaNueva([punto.campos![0], punto.campos![1], dos], "Título: X\nQué pasa: Y\nEquipo: Vent")).toMatchObject({ ok: false });
  });

  it("⛔ la revisión de la página: saca el ítem a medias, el repetido y una cifra de «Lo que hicimos» nueva; marca la cifra grande", () => {
    const pagina = piezasDelResumen(conEquipos, {});
    const cambio = (clave: string, despues: string | null, antes: string | null = null) => ({ clave, nombre: clave, seccion: "x", antes, despues, aMano: false, agregar: antes === null });
    const r = {
      cambios: [
        cambio("r/punto:nuevo", "Título: Seguimiento\nQué pasa: Se pierden aspirantes."),
        cambio("r/etapa:nuevo", "Paso: Facturación"),
        cambio("r/negocio:tesis:n1", "Las ventas se anotan a mano. Este diagnóstico parte de 12 reuniones de trabajo conjunto.", "Las ventas se anotan a mano."),
      ],
      descartados: [] as { clave: string | null; nombre: string | null; texto: string; motivo: string }[],
    };
    revisarLoDeLaPagina(r, pagina);
    expect(r.cambios.map((c) => c.clave)).toEqual(["r/punto:nuevo"]);
    expect(r.descartados.map((d) => d.motivo)).toEqual([expect.stringContaining("Le falta «Qué pasa»"), expect.stringContaining("«Lo que hicimos»")]);
    // Repetido: un punto con el mismo título que uno de la página no se agrega dos veces.
    expect(yaEstaEnLaPagina(pagina, punto, "Título: nadie ve el mes\nQué pasa: X")).toBe(true);
    const repetido = { cambios: [cambio("r/punto:nuevo", "Título: Nadie ve el mes.\nQué pasa: Otra cosa.")], descartados: [] as typeof r.descartados };
    revisarLoDeLaPagina(repetido, pagina);
    expect(repetido.descartados[0]?.motivo).toBe("Ya hay uno igual en la página.");
    // Si la pieza ya decía una cifra de «Lo que hicimos», cambiarla por otra tampoco pasa (el 3 por un 12).
    const cambiada = { cambios: [cambio("r/negocio:tesis:n1", "Parte de 12 reuniones de trabajo juntos.", "Parte de 3 reuniones de trabajo juntos.")], descartados: [] as typeof r.descartados };
    revisarLoDeLaPagina(cambiada, pagina);
    expect(cambiada.cambios).toEqual([]);
    // La cifra grande: sin una cifra de un equipo con su cita, se marca «sin cita».
    const conLugarParaLaCifra = piezasDelResumen(
      resumen({ negocio: [...(conEquipos.negocio ?? []), { tipo: "tamano", titulo: "Tamaño", lista: { piezas: [], nueva: "negocio:tamano:nuevo" } }] as ResumenDeLaPagina["negocio"] }),
      {},
    );
    const grande = { cambios: [cambio("r/negocio:tamano:nuevo", "900 personas en la campaña")], descartados: [] as typeof r.descartados };
    revisarLoDeLaPagina(grande, conLugarParaLaCifra);
    expect(grande.cambios[0]).toMatchObject({ sinCita: true });
  });

  it("se escribe con UNA operación, con todas sus partes (el equipo, por su id)", () => {
    expect(operacionDelCambio(punto, "Título: Seguimiento sin etapas\nQué pasa: Se pierden aspirantes.\nEquipo: Marketing")).toEqual({
      op: "resumenDeLaEscala",
      clave: "punto:nuevo",
      texto: "Seguimiento sin etapas",
      campos: { texto: "Se pierden aspirantes.", areaId: "2" },
    });
    expect(operacionDelCambio(paso, "Paso: Matrícula\nQué pasa: La boleta se paga en el banco.")).toEqual({
      op: "resumenDeLaEscala",
      clave: "etapa:nuevo",
      texto: "Matrícula",
      campos: { texto: "La boleta se paga en el banco.", friccion: null },
    });
  });
});

describe("la cifra grande, al replantear el problema principal, sale de una cifra de un equipo con su cita (25 nov)", () => {
  const pieza = (clave: string, valor: string, o: Partial<PiezaDeLaEscala> = {}): PiezaDeLaEscala =>
    ({ clave, nombre: "Cifra 1 de Servicio: la cifra", seccion: "Equipos y hallazgos · Servicio", valor, tope: 40, agregar: false, quitable: false, aMano: false, conCita: true, escribe: { via: "resumen", clave: clave.slice(2) }, ...o }) as PiezaDeLaEscala;
  const CIFRA = pieza("r/op:o3:cifra:c1:cifra", "1.000", { citas: [{ texto: "atendemos unos 1.000 clientes al mes", hablante: "Lucía" }] });
  const OCULTA = pieza("r/op:o3:cifra:c2:cifra", "620", { citas: [{ texto: "son 620 en la campaña", hablante: "Ana" }], noLaVeElCliente: true });

  it("reconoce la cifra grande y su lugar para escribirla", () => {
    expect(esLaCifraGrande("r/negocio:tamano:n3")).toBe(true);
    expect(esLaCifraGrande("r/negocio:tamano:nuevo")).toBe(true);
    expect(esLaCifraGrande("r/negocio:tesis:n1")).toBe(false);
  });

  it("sale de la cifra que tiene EXACTAMENTE su número y cuya cita lo dice; si no, de ninguna", () => {
    expect(fuenteDeLaCifraGrande([CIFRA], "1.000 clientes al mes")).toEqual({ clave: "op:o3:cifra:c1", nombre: "Cifra 1 de Servicio", cita: "«atendemos unos 1.000 clientes al mes» — Lucía" });
    expect(fuenteDeLaCifraGrande([CIFRA], "1.000 clientes en 3 sedes")).toBeNull();
    expect(fuenteDeLaCifraGrande([CIFRA], "900 clientes al mes")).toBeNull();
    expect(fuenteDeLaCifraGrande([CIFRA], "Muchos clientes")).toBeNull();
    // «1,5» no es «15» (revisión del 25 nov): el decimal cuenta.
    const DECIMAL = pieza("r/op:o3:cifra:c3:cifra", "1,5 %", { citas: [{ texto: "perdemos 1,5 % al mes" }] });
    expect(fuenteDeLaCifraGrande([DECIMAL], "15 % al mes")).toBeNull();
    expect(fuenteDeLaCifraGrande([DECIMAL], "1,5 % al mes")).toMatchObject({ clave: "op:o3:cifra:c3" });
  });

  it("⛔ con qué cita queda: la SUYA si ya dice el número (no «sin cita»), la de un equipo, o ninguna; al aplicar, la de un equipo viaja", () => {
    const GRANDE = pieza("r/negocio:tamano:n3", "620 personas en la campaña activa", { nombre: "El tamaño del negocio (número y unidad)", citas: [{ texto: "son 620 personas en la campaña" }] });
    expect(citaDeLaCifraGrande(GRANDE, [CIFRA], "Unas 620 personas en la campaña activa")).toEqual({ tipo: "suya" });
    expect(citaDeLaCifraGrande(GRANDE, [CIFRA], "1.000 clientes al mes")).toMatchObject({ tipo: "de-un-equipo", fuente: { clave: "op:o3:cifra:c1" } });
    expect(citaDeLaCifraGrande(GRANDE, [CIFRA], "900 personas")).toEqual({ tipo: "ninguna" });
    expect(citaDeLaCifraGrande(GRANDE, [CIFRA], "Personas en la campaña")).toEqual({ tipo: "sin-numeros" });
    // Al aplicar: la de un equipo va como `citasDe`; la suya no hace falta (la edición la conserva); otra pieza, nunca.
    expect(operacionConSuCita(GRANDE, [CIFRA], "1.000 clientes al mes")).toEqual({ op: "resumenDeLaEscala", clave: "negocio:tamano:n3", texto: "1.000 clientes al mes", citasDe: "op:o3:cifra:c1" });
    expect(operacionConSuCita(GRANDE, [CIFRA], "Unas 620 personas en la campaña activa")).toEqual({ op: "resumenDeLaEscala", clave: "negocio:tamano:n3", texto: "Unas 620 personas en la campaña activa" });
    expect(operacionConSuCita(CIFRA, [CIFRA], "1.000")).not.toHaveProperty("citasDe");
    // Una cifra que el cliente no ve (su cita no la sostiene) no presta su cita.
    expect(fuenteDeLaCifraGrande([OCULTA], "620 personas en la campaña")).toBeNull();
    // Ni una pieza que no es el número de una cifra de un equipo.
    expect(fuenteDeLaCifraGrande([pieza("r/punto:k1:texto", "1.000", { citas: CIFRA.citas })], "1.000 clientes al mes")).toBeNull();
  });
});

describe("las cifras de «Lo que hicimos» las cambia solo una persona (25 nov)", () => {
  it("no son piezas para Nexus, y un texto que las escribe se reconoce", () => {
    const piezas = piezasDelResumen(resumen(), {});
    expect(piezas.some((p) => /reuniones|personas de tu equipo|conversación/.test(p.nombre))).toBe(false);
    expect(hablaDeLoQueHicimos("Este diagnóstico parte de 12 reuniones de trabajo conjunto.")).toBe(true);
    expect(hablaDeLoQueHicimos("Fueron 3 h de conversación.")).toBe(true);
    expect(hablaDeLoQueHicimos("Hablamos con 6 personas de tu equipo.")).toBe(true);
    expect(hablaDeLoQueHicimos("Hacen 3 reuniones semanales con ventas.")).toBe(false);
    // Un dato del cliente no es «Lo que hicimos» (revisión del 25 nov).
    expect(hablaDeLoQueHicimos("Ventas hace 3 reuniones de trabajo a la semana.")).toBe(false);
    expect(hablaDeLoQueHicimos("Hoy 4 personas de tu equipo capturan cada solicitud a mano.")).toBe(false);
    expect(hablaDeLoQueHicimos("Fueron 4 sesiones de diagnóstico.")).toBe(true);
    expect(hablaDeLoQueHicimos("620 personas en la campaña activa")).toBe(false);
  });

  it("su clave se reconoce para marcarla como escrita por el equipo en la página interna", () => {
    expect(esDeLoQueHicimos(CLAVES.delResumen("hicimos.trabajo.abc123"))).toBe(true);
    expect(esDeLoQueHicimos(CLAVES.delResumen("hicimos.tiempo.rotulo"))).toBe(true);
    expect(esDeLoQueHicimos(claveAtadaDelResumen("titular.diagnostico", "Diagnóstico de rendimiento"))).toBe(false);
  });
});

describe("cada cambio se escribe con la operación de la edición a mano", () => {
  const piezas = piezasDelResumen(resumen(), {});
  const de = (clave: string) => piezas.find((p) => p.clave === clave)!;

  it("una pieza del Resumen: `resumenDeLaEscala` con su clave (null la quita)", () => {
    expect(operacionDelCambio(de("r/punto:k1:titulo"), "Nadie ve las ventas del mes")).toEqual({ op: "resumenDeLaEscala", clave: "punto:k1:titulo", texto: "Nadie ve las ventas del mes" });
    // Un punto nuevo va entero (25 nov): un renglón por parte; solo el título no se agrega (la operación va sin texto y la
    // edición no agrega nada).
    expect(operacionDelCambio(de("r/punto:nuevo"), "Título: WhatsApp sin registro\nQué pasa: Los pedidos llegan por WhatsApp y nadie los anota.")).toEqual({
      op: "resumenDeLaEscala",
      clave: "punto:nuevo",
      texto: "WhatsApp sin registro",
      campos: { texto: "Los pedidos llegan por WhatsApp y nadie los anota.", areaId: null },
    });
    expect(operacionDelCambio(de("r/punto:nuevo"), "WhatsApp sin registro")).toEqual({ op: "resumenDeLaEscala", clave: "punto:nuevo", texto: null });
    expect(operacionDelCambio(de("r/punto:k1:titulo"), null)).toEqual({ op: "resumenDeLaEscala", clave: "punto:k1:titulo", texto: null });
  });

  it("un texto fijo: `textoDeLaPagina`; el de siempre vuelve a ser el de siempre", () => {
    const bajada = piezas.find((p) => p.nombre.startsWith("La bajada"))!;
    const clave = bajada.clave.slice(2);
    expect(operacionDelCambio(bajada, "Así entendimos tu operación.")).toEqual({ op: "textoDeLaPagina", clave, texto: "Así entendimos tu operación." });
    expect(operacionDelCambio(bajada, bajada.valor)).toEqual({ op: "textoDeLaPagina", clave, texto: null });
  });

  it("en un área: la tarjeta de una parte con su nivel, la descripción, y quitar un riesgo lo deja fuera para el cliente", () => {
    const r = {
      areaId: "1",
      areaNombre: "Ventas",
      nivel: "D",
      sintesis: "Ventas trabaja sin un registro único.",
      preguntadas: 2,
      dimensiones: [{ id: "1.3", nombre: "Registro", preguntada: true, nivel: "D" }],
      recomendacion: { tipo: "sostener", razon: "Ya tiene lo básico." },
      casos: [],
      riesgos: ["Se pierden oportunidades sin seguimiento."],
    } as unknown as ResultadoDelTest;
    const area = piezasDelArea(r, { textos: {}, textosDelRadar: {}, descripcion: { origen: "agente" }, detalle: () => ({ impacto: "Registran en Excel.", siguiente: { nombre: "Funcional", prioridad: "Un solo registro." } }), conLoQueCuesta: false, fecha: null });
    const radar = area.find((p) => p.clave === "radar/1.3")!;
    expect(radar).toMatchObject({ valor: "Registran en Excel.", aMano: false });
    expect(operacionDelCambio(radar, "Todo queda en hojas sueltas.")).toEqual({ op: "textoDelRadar", dimensionId: "1.3", valor: { texto: "Todo queda en hojas sueltas.", nivel: "D" } });
    expect(operacionDelCambio(area.find((p) => p.clave === "desc/1")!, "Nueva descripción.")).toEqual({ op: "descripcionDeLaEscala", areaId: "1", texto: "Nueva descripción." });
    const riesgo = area.find((p) => p.nombre === "Un riesgo")!;
    expect(riesgo.clave).toBe(`t/${CLAVES.calculado("1", "riesgo", "Se pierden oportunidades sin seguimiento.")}`);
    expect(operacionDelCambio(riesgo, null)).toEqual({ op: "textoDeLaPagina", clave: riesgo.clave.slice(2), texto: "" });
    // Todo lo que se edita a mano en la página del área (23 nov): también «Qué priorizar» de cada parte y el pie.
    const nombres = area.map((p) => p.nombre);
    expect(nombres).toEqual(expect.arrayContaining(["Qué priorizar en Registro", "El pie de la página", "Título de cada parte", "Por qué empezar por ahí"]));
    const priorizar = area.find((p) => p.nombre === "Qué priorizar en Registro")!;
    expect(priorizar).toMatchObject({ valor: "Un solo registro.", clave: `t/${CLAVES.detalle("1.3", "Un solo registro.")}` });
  });
});

describe("cada pieza está en una sección de la página, la misma que pide su botón (24 nov: «✨ Mejorar con IA» por sección)", () => {
  const lista = (piezas: { id: string; texto: string }[], nueva: string | null = null) => ({ piezas: piezas.map((p) => ({ ...p, clave: `x:${p.id}`, citas: [] })), nueva });
  const subequipo = (id: string, nombre: string) => ({
    id,
    nombre,
    claveDelNombre: `equipo:${id}:nombre`,
    organizacion: lista([]),
    bien: lista([{ id: `${id}-b`, texto: "Responden el mismo día." }]),
    frena: lista([{ id: `${id}-f`, texto: "No hay un registro único." }]),
    retos: lista([]),
    cifras: [],
    cifraNueva: null,
    falta: null,
    claveDeLaFalta: null,
  });
  const conEquipos = resumen({
    tarjetas: [{ id: "t1", areaId: "3", nombre: "Servicio", nivel: "I", nivelNombre: "Inicial", conPorque: false, porExplorar: false, subequipos: [subequipo("s1", "Soporte"), subequipo("s2", "Customer Success")] }],
    pendientes: [{ id: "p1", texto: "Cuántos casos entran al mes.", clave: "pendiente:p1", citas: [] }],
  } as unknown as Partial<ResumenDeLaPagina>);
  const piezas = piezasDelResumen(conEquipos, {});

  it("las del Resumen: sus secciones son las de los encabezados (y la de cada equipo, dentro de «Equipos y hallazgos»)", () => {
    const validas = new Set<string>([...Object.values(SECCIONES_DEL_RESUMEN), seccionDelEquipo("Soporte"), seccionDelEquipo("Customer Success")]);
    for (const p of piezas) expect(validas.has(p.seccion), `${p.nombre}: «${p.seccion}»`).toBe(true);
    expect(new Set(piezas.map((p) => p.seccion))).toEqual(
      new Set([SECCIONES_DEL_RESUMEN.arriba, SECCIONES_DEL_RESUMEN.problema, SECCIONES_DEL_RESUMEN.puntos, SECCIONES_DEL_RESUMEN.operacion, seccionDelEquipo("Soporte"), seccionDelEquipo("Customer Success"), SECCIONES_DEL_RESUMEN.falta]),
    );
  });

  it("pedir desde una sección da solo sus piezas; «Equipos y hallazgos» abarca a cada equipo", () => {
    const puntos = piezasDeLaSeccion(piezas, SECCIONES_DEL_RESUMEN.puntos);
    expect(puntos.length).toBeGreaterThan(0);
    expect(puntos.every((p) => p.seccion === "Puntos clave")).toBe(true);
    const soporte = piezasDeLaSeccion(piezas, seccionDelEquipo("Soporte"));
    expect(soporte.map((p) => p.seccion)).toEqual(soporte.map(() => "Equipos y hallazgos · Soporte"));
    expect(soporte.some((p) => p.valor === "No hay un registro único.")).toBe(true);
    const equipos = piezasDeLaSeccion(piezas, SECCIONES_DEL_RESUMEN.equipos);
    expect(new Set(equipos.map((p) => p.seccion))).toEqual(new Set([seccionDelEquipo("Soporte"), seccionDelEquipo("Customer Success")]));
    // «Puntos» no es «Puntos clave»: el nombre se compara entero.
    expect(piezasDeLaSeccion(piezas, "Puntos")).toEqual([]);
  });

  it("las de un área: sus secciones son las de sus encabezados", () => {
    const r = {
      areaId: "1",
      areaNombre: "Ventas",
      nivel: "D",
      sintesis: "Ventas trabaja sin un registro único.",
      preguntadas: 2,
      dimensiones: [{ id: "1.3", nombre: "Registro", preguntada: true, nivel: "D" }],
      recomendacion: { tipo: "trabajar", dimensionId: "1.3", dimensionNombre: "Registro", objetivoNombre: "Funcional", razon: "Sin registro no hay seguimiento.", costoDeQuedarse: "Se pierden ventas." },
      casos: [{ id: "c1", titulo: "Un solo registro", promesa: "Todo en el CRM.", razon: "Sube Registro." }],
      riesgos: ["Se pierden oportunidades sin seguimiento."],
    } as unknown as ResultadoDelTest;
    const area = piezasDelArea(r, { textos: {}, textosDelRadar: {}, descripcion: { origen: "agente" }, detalle: () => ({ impacto: "Registran en Excel.", siguiente: { nombre: "Funcional", prioridad: "Un solo registro." } }), conLoQueCuesta: true, fecha: null });
    const validas = new Set<string>(Object.values(SECCIONES_DEL_AREA));
    for (const p of area) expect(validas.has(p.seccion), `${p.nombre}: «${p.seccion}»`).toBe(true);
    for (const s of [SECCIONES_DEL_AREA.resultado, SECCIONES_DEL_AREA.radar, SECCIONES_DEL_AREA.cuesta, SECCIONES_DEL_AREA.empezar, SECCIONES_DEL_AREA.casos, SECCIONES_DEL_AREA.riesgos, SECCIONES_DEL_AREA.partes])
      expect(piezasDeLaSeccion(area, s).length, s).toBeGreaterThan(0);
  });
});
