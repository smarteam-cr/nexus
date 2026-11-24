/**
 * lib/exploraciones/escala-con-nexus.test.ts — la página de La escala en piezas para «✨ Pedirle a Nexus» (23 nov): las
 * piezas son las de la página (con la clave que usa la edición a mano), y cada cambio se escribe con la MISMA operación.
 */
import { describe, expect, it } from "vitest";
import { claveAtadaDelResumen, type ResumenDeLaPagina, type TarjetaDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { CLAVES } from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { SECCIONES_DEL_AREA, SECCIONES_DEL_RESUMEN, seccionDelEquipo } from "@/lib/external/secciones-de-la-escala";
import { guiaDeLaPieza, operacionDelCambio, piezasDeLaSeccion, piezasDelArea, piezasDelResumen } from "./escala-con-nexus";

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

describe("cada cambio se escribe con la operación de la edición a mano", () => {
  const piezas = piezasDelResumen(resumen(), {});
  const de = (clave: string) => piezas.find((p) => p.clave === clave)!;

  it("una pieza del Resumen: `resumenDeLaEscala` con su clave (null la quita)", () => {
    expect(operacionDelCambio(de("r/punto:k1:titulo"), "Nadie ve las ventas del mes")).toEqual({ op: "resumenDeLaEscala", clave: "punto:k1:titulo", texto: "Nadie ve las ventas del mes" });
    expect(operacionDelCambio(de("r/punto:nuevo"), "WhatsApp sin registro")).toEqual({ op: "resumenDeLaEscala", clave: "punto:nuevo", texto: "WhatsApp sin registro" });
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
