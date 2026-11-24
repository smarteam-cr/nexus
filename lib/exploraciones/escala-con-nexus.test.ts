/**
 * lib/exploraciones/escala-con-nexus.test.ts — la página de La escala en piezas para «✨ Pedirle a Nexus» (23 nov): las
 * piezas son las de la página (con la clave que usa la edición a mano), y cada cambio se escribe con la MISMA operación.
 */
import { describe, expect, it } from "vitest";
import { claveAtadaDelResumen, tituloDeLoQueHicimos, type ResumenDeLaPagina } from "@/lib/external/pagina-del-resumen";
import { CLAVES } from "@/lib/external/textos-de-la-pagina";
import type { ResultadoDelTest } from "@/lib/tests-diagnostico/resultado";
import { guiaDeLaPieza, operacionDelCambio, piezasDelArea, piezasDelResumen } from "./escala-con-nexus";

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
  it("el titular es la misma pieza que edita la página: su clave atada a los números del sistema", () => {
    const piezas = piezasDelResumen(resumen(), {});
    const titular = piezas.find((p) => p.nombre.startsWith("El titular"))!;
    expect(titular.clave).toBe(`t/${claveAtadaDelResumen("titular.hicimos", tituloDeLoQueHicimos(hicimos)!)}`);
    expect(titular.valor).toBe("3 sesiones y 2 h 30 min de conversación con 2 personas de tu equipo.");
    expect(titular.aMano).toBe(false);
    // Cambiado para esta empresa: se ve lo escrito y cuenta como escrito por el equipo.
    const clave = titular.clave.slice(2);
    const cambiado = piezasDelResumen(resumen(), { [clave]: "Escuchamos a tu equipo de ventas." }).find((p) => p.clave === titular.clave)!;
    expect(cambiado).toMatchObject({ valor: "Escuchamos a tu equipo de ventas.", aMano: true });
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
