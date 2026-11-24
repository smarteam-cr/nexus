/**
 * lib/exploraciones/con-lo-que-ya-sabemos-de-punta-a-punta.test.ts — la etapa 3 del plan de La escala de un cliente con lo
 * que ya sabemos (24 nov, docs/diagnostico-con-lo-que-sabemos-plan.md), de punta a punta y sin IA: una base de reuniones de
 * trabajo → publicar → una sesión de diagnóstico → ubicar de nuevo → rehacer el Resumen → publicar otra vez, sin perder lo
 * confirmado ni lo escrito a mano. Cada paso usa la pieza real que lo decide (la línea de arriba, la fusión de lo propuesto,
 * `juntarConLoEditado`, «Lo que hicimos» y la página del Resumen); lo que va a la base y a la IA lo cubren
 * con-lo-que-ya-sabemos.int.test.ts y el simulacro.
 */
import { describe, expect, it } from "vitest";
import { fusionarPropuestas } from "./contenido";
import { estadoDePrueba, propuestoDePrueba } from "./escala-de-prueba.test-helpers";
import { lineaDeLaEscala } from "./linea-de-la-escala";
import { juntarConLoEditado, loQueHicimos, resumenParaLaPagina, type ResumenGuardado, type SesionHecha } from "./resumen-de-la-escala";

const CITA = { reunion: "gmeet_trabajo1", fecha: "2026-10-22T15:00:00.000Z", turno: 4, hablante: "Ivannia Mora", texto: "los reportes los armamos a mano cada semana" };
const TESIS = { id: "n1", texto: "Los reportes se arman a mano. Nadie confía en el número.", citas: [CITA] };
const ESCRITA_A_MANO = { id: "n2", texto: "Ocho mil aspirantes por semestre con cuatro personas.", citas: [], mano: true };

function resumen(sesiones: SesionHecha[], negocio: ResumenGuardado["negocio"], at: string): ResumenGuardado {
  return {
    v: 2,
    at,
    por: null,
    modelo: "claude-sonnet-4-6",
    agentRunId: null,
    hicimos: { sesiones, personas: 2, texto: null },
    datosRojos: [],
    areas: {},
    entendimos: [],
    falta: [],
    negocio,
    operativas: [],
  };
}
// Sin equipo de la escala: la página cuenta solo las sesiones de los equipos que ve el cliente, y esta prueba no arma áreas.
const deTrabajo = (dia: string): SesionHecha => ({ fecha: `2026-${dia}T15:00:00.000Z`, equipo: null, minutos: 60, areaId: null, deTrabajo: true });
const deDiagnostico = (dia: string): SesionHecha => ({ fecha: `2026-${dia}T15:00:00.000Z`, equipo: null, minutos: 60, areaId: null });
const reunion = (dia: string, titulo: string, trabajo: boolean) => ({ fecha: `2026-${dia}T15:00:00.000Z`, titulo, origen: "meet", texto: "transcripcion", ...(trabajo ? { deTrabajo: true as const } : {}) });

describe("de punta a punta: base de trabajo → publicar → sesión de diagnóstico → ubicar → rehacer → publicar", () => {
  it("nada de lo confirmado ni de lo escrito a mano se pierde, y «Lo que hicimos» suma las dos", () => {
    // 1 · La base: dos reuniones de trabajo. El botón ubica con lo que ya sabemos.
    const base = [reunion("10-22", "AE | Reportes de Ventas", true), reunion("10-21", "AE | Limpieza BBDD", true)];
    expect(lineaDeLaEscala({ reuniones: base, ubicadaEn: null, resumenEn: null, ubicando: false, conLoQueYaSabemos: true }).boton.etiqueta).toBe("Ubicar con lo que ya sabemos");

    // 2 · Ubicar propone 1.1 y 1.2; la persona confirma 1.1 (lo confirmado es lo único que ve el cliente).
    let estado = estadoDePrueba();
    estado.propuesta = fusionarPropuestas(estado, [
      propuestoDePrueba("1.1", { nivel: "I", fuente: "reunion", evidencia: "los reportes los armamos a mano" }),
      propuestoDePrueba("1.2", { nivel: "I", fuente: "hipotesis" }),
    ]);
    expect(estado.propuesta.items).toHaveLength(2);
    estado = estadoDePrueba({ "1.1": { nivel: "I", fuente: "reunion", evidencia: "los reportes los armamos a mano" } }, { propuesta: estado.propuesta });

    // 3 · El Resumen de la base, con una pieza escrita a mano, y se publica.
    const antes = resumen([deTrabajo("10-21"), deTrabajo("10-22")], { tesis: [TESIS], tamano: [ESCRITA_A_MANO] }, "2026-11-24T18:00:00.000Z");
    const publicada1 = resumenParaLaPagina(antes, [], estado.contenido.chequeo, {}, { conCitas: false });
    expect(publicada1.hicimos?.texto).toContain("2 reuniones de trabajo juntos");
    expect(publicada1.hicimos?.texto).not.toMatch(/sesi(ón|ones) de (exploración|diagnóstico)/);

    // 4 · Llega una sesión de diagnóstico: la línea la cuenta como nueva sobre la base.
    const conDiagnostico = [...base, reunion("11-28", "Diagnóstico de Ventas", false)];
    const linea = lineaDeLaEscala({
      reuniones: conDiagnostico,
      ubicadaEn: "2026-11-24T18:00:00.000Z",
      leyo: ["Reunión del 22 oct 2026: AE | Reportes de Ventas", "Reunión del 21 oct 2026: AE | Limpieza BBDD"],
      resumenEn: antes.at,
      ubicando: false,
      conLoQueYaSabemos: true,
    });
    expect(linea).toMatchObject({ estado: "nuevas", boton: { etiqueta: "Actualizar" } });
    expect(linea.texto).toContain("1 sesión de diagnóstico nueva");

    // 5 · Ubicar de nuevo ve otro nivel para 1.1: lo propone, no pisa lo confirmado. Lo mismo que ya está, no vuelve.
    const propuesta2 = fusionarPropuestas(estado, [
      propuestoDePrueba("1.1", { nivel: "F", fuente: "reunion", evidencia: "ahora el pipeline se revisa cada lunes" }),
      propuestoDePrueba("1.1", { nivel: "I", fuente: "reunion", evidencia: "los reportes los armamos a mano" }),
    ]);
    expect(estado.contenido.chequeo["1.1"]).toMatchObject({ nivel: "I" });
    const de11 = propuesta2.items.filter((it) => it.destino.tipo === "nivel" && it.destino.dimensionId === "1.1");
    expect(de11.map((it) => (it.valor as { nivel: string }).nivel)).toEqual(["F"]);

    // 6 · Rehacer con IA: el agente no trae la pieza escrita a mano; se queda igual, y «Lo que hicimos» suma las dos.
    const nuevo = resumen([deTrabajo("10-21"), deTrabajo("10-22"), deDiagnostico("11-28")], { tesis: [{ ...TESIS, id: "n9" }] }, "2026-11-29T10:00:00.000Z");
    const rehecho = juntarConLoEditado(nuevo, antes);
    expect(rehecho.negocio?.tamano).toEqual([ESCRITA_A_MANO]);
    expect(loQueHicimos(rehecho.hicimos)).toMatchObject({ sesiones: 3, deTrabajo: 2 });

    // 7 · Publicar otra vez: la página trae lo escrito a mano y nombra las dos cosas.
    const publicada2 = resumenParaLaPagina(rehecho, [], estado.contenido.chequeo, {}, { conCitas: false });
    expect(publicada2.hicimos?.texto).toContain("2 reuniones de trabajo juntos y 1 sesión de diagnóstico");
    expect(JSON.stringify(publicada2)).toContain(ESCRITA_A_MANO.texto);
  });
});
