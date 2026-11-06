/**
 * lib/exploraciones/resultado.ts — el resultado que busca el cliente como eje de la exploración (2026-11-06, segunda
 * tanda de Elías tras el roleplay: Ventas nunca preguntó por el objetivo del cliente; la gente compra la solución a un
 * problema o el camino a una meta). PURO.
 *
 *   · Toda agenda trae un bloque FIJO «El resultado que buscan», con su apertura y seis cosas por averiguar de ids
 *     estables (`av:res1`…`av:res6`): el agente escribe las preguntas, el código pone las cosas (`conBloqueDelResultado`).
 *   · Lo primero que hay que tener claro al terminar es ese resultado: de dónde a dónde, con qué número y para cuándo.
 *   · En «En vivo», pasada la mitad de la sesión sin marcar `av:res1`, aviso (`faltaElResultadoEnVivo`).
 *   · En preventa no se arma la propuesta sin el resultado confirmado: al menos una meta en «Metas» del resumen
 *     (`resultadoConfirmado`), mirado en el servidor.
 */
import { estaAveriguada, type AgendaDeLaGuia, type BloqueDeLaAgenda, type CosaPorAveriguar } from "./agenda";

export const ID_DEL_RESULTADO = "av:res1";
export const TITULO_DEL_BLOQUE_DEL_RESULTADO = "El resultado que buscan";
export const APERTURA_DEL_RESULTADO = "¿Qué tendría que pasar en 6 a 12 meses para que digas que esto valió la pena?";
export const CLAVE_DEL_RESULTADO = "El resultado que buscan: de dónde a dónde, con qué número y para cuándo.";

/** Las seis cosas del bloque, en orden, con su pregunta de respaldo (abierta y de una sola cosa). */
export const COSAS_DEL_RESULTADO: readonly { id: string; que: string; pregunta: string }[] = [
  { id: "av:res1", que: "El resultado que buscan, en sus palabras", pregunta: APERTURA_DEL_RESULTADO },
  { id: "av:res2", que: "Cómo lo medirían", pregunta: "¿Con qué número sabrías que lo lograron?" },
  { id: "av:res3", que: "Para cuándo lo necesitan", pregunta: "¿Qué fecha marca cuándo necesitas verlo?" },
  { id: "av:res4", que: "Quién lo pide", pregunta: "¿Quién en la empresa está pidiendo este resultado?" },
  { id: "av:res5", que: "Por qué ahora", pregunta: "¿Qué pasó para que esto se volviera importante ahora?" },
  { id: "av:res6", que: "Qué pasa si no se logra", pregunta: "¿Qué pasa en la empresa si dentro de seis meses esto sigue igual?" },
];

/** Cuántos minutos toma el bloque cuando el código tiene que sumarlo. */
const MINUTOS_DEL_BLOQUE = 8;

/** Las cosas del bloque del resultado, con las preguntas que escribió el agente (por posición) o las de respaldo. */
function cosasDelResultado(delAgente: readonly CosaPorAveriguar[]): CosaPorAveriguar[] {
  return COSAS_DEL_RESULTADO.map((c, i) => {
    const a = delAgente[i];
    return { id: c.id, que: c.que, preguntas: a?.preguntas.length ? a.preguntas.slice(0, 2) : [c.pregunta], ...(a?.sabido ? { sabido: a.sabido } : {}) };
  });
}

/**
 * La agenda con su bloque del resultado: el que marcó el agente (o el que se titula «resultado»), con las seis cosas en
 * su lugar; si no hay ninguno, el código lo suma después de la apertura y se lo descuenta al bloque más largo del
 * cuerpo, así la sesión dura lo mismo. Y el resultado va primero en lo que hay que tener claro.
 */
export function conBloqueDelResultado(agenda: AgendaDeLaGuia, marcado: number | null): AgendaDeLaGuia {
  const bloques = agenda.bloques.map((b) => ({ ...b }));
  let i = marcado !== null && bloques[marcado]?.tipo === "cuerpo" ? marcado : bloques.findIndex((b) => b.tipo === "cuerpo" && /resultado/i.test(b.titulo));
  if (i >= 0) {
    const b = bloques[i];
    bloques[i] = { ...b, resultado: true, abre: b.abre || APERTURA_DEL_RESULTADO, averiguar: cosasDelResultado(b.averiguar) };
  } else {
    const despues = bloques[0]?.tipo === "apertura" ? 1 : 0;
    const desde = bloques[despues - 1]?.hasta ?? 0;
    const nuevo: BloqueDeLaAgenda = {
      desde,
      hasta: desde + MINUTOS_DEL_BLOQUE,
      titulo: TITULO_DEL_BLOQUE_DEL_RESULTADO,
      tipo: "cuerpo",
      abre: APERTURA_DEL_RESULTADO,
      resultado: true,
      averiguar: cosasDelResultado([]),
      impacto: "Pon en números la distancia entre hoy y el resultado: cuánto vale llegar y cuánto cuesta cada mes que no llegan.",
    };
    // Lo descuenta el bloque más largo del cuerpo; los de en medio se corren.
    const largo = bloques.reduce((m, b, k) => (b.tipo === "cuerpo" && b.hasta - b.desde > (m < 0 ? -1 : bloques[m].hasta - bloques[m].desde) ? k : m), -1);
    if (largo >= despues && bloques[largo].hasta - bloques[largo].desde >= MINUTOS_DEL_BLOQUE + 5) {
      for (let k = despues; k <= largo; k++) {
        bloques[k] = { ...bloques[k], desde: bloques[k].desde + MINUTOS_DEL_BLOQUE, hasta: k === largo ? bloques[k].hasta : bloques[k].hasta + MINUTOS_DEL_BLOQUE };
      }
    }
    bloques.splice(despues, 0, nuevo);
    i = despues;
  }
  const claves = /resultado/i.test(agenda.claves[0] ?? "") ? agenda.claves : [CLAVE_DEL_RESULTADO, ...agenda.claves.filter((c) => !/resultado/i.test(c))].slice(0, 4);
  return { ...agenda, claves, bloques };
}

/** El bloque del resultado de una agenda, si lo tiene (las de la primera tanda no lo tienen). */
export function bloqueDelResultado(agenda: AgendaDeLaGuia | undefined): BloqueDeLaAgenda | null {
  return agenda?.bloques.find((b) => b.resultado) ?? null;
}

/** ¿Ya se sabe qué resultado busca? (la primera cosa del bloque, marcada). Sin bloque, null: no se sabe preguntar. */
export function resultadoAveriguado(agenda: AgendaDeLaGuia | undefined, hechas: readonly string[] | undefined): boolean | null {
  const b = bloqueDelResultado(agenda);
  const c = b?.averiguar.find((x) => x.id === ID_DEL_RESULTADO);
  return c ? estaAveriguada(c, hechas) : null;
}

/**
 * En «En vivo»: pasada la mitad de la sesión y sin saber el resultado, avisa. `inicio` es cuándo empezó (la hora de la
 * reunión o, sin ella, cuándo se abrió «En vivo»); `minutos`, cuánto dura.
 */
export function faltaElResultadoEnVivo(o: { agenda: AgendaDeLaGuia | undefined; hechas: readonly string[] | undefined; inicio: number; ahora: number; minutos: number }): boolean {
  if (resultadoAveriguado(o.agenda, o.hechas) !== false) return false;
  const pasados = (o.ahora - o.inicio) / 60_000;
  return pasados > o.minutos / 2 && pasados < o.minutos * 3;
}

/** Preventa: ¿el resultado está confirmado para proponer? Al menos una meta confirmada en «Metas» del resumen. */
export function resultadoConfirmado(casillas: { metas?: readonly unknown[] | null | undefined }): boolean {
  return (casillas.metas ?? []).length > 0;
}

export const FALTA_EL_RESULTADO_PARA_PROPONER =
  "Para armar la propuesta falta el resultado que busca el cliente, confirmado: anótalo en «Metas» del resumen (de dónde a dónde, con qué número y para cuándo). Sin eso, la propuesta no tiene contra qué medirse.";
