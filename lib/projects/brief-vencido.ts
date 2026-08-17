/**
 * lib/projects/brief-vencido.ts — CUÁNDO EL RESUMEN DE UN PROYECTO DEJÓ DE SER CIERTO.
 *
 * ── EL PROBLEMA ──────────────────────────────────────────────────────────────
 * Un resumen que se ve fresco contando algo de hace tres semanas es peor que no tener resumen:
 * el que no existe se nota, el viejo se cita en una llamada. Así que hace falta poder decir «esto
 * quedó atrás» y por qué.
 *
 * ── POR QUÉ SE DERIVA Y NO SE MARCA ──────────────────────────────────────────
 * El brief de CUENTA usa un marcador: `partner-sync` escribe `staleAt` cuando cambia algo
 * material. Funciona porque ahí hay UN escritor que sabe qué es «material».
 *
 * Acá los inputs son cinco y cada uno lo escribe otro camino —una sesión que se procesa, un
 * handoff que se regenera, una etapa que se mueve en HubSpot, una desviación nueva—. Con el
 * modelo de marcador, cada uno de esos caminos tendría que acordarse de marcar, y el que se
 * olvide produce exactamente el fallo que esto viene a evitar: el resumen se ve fresco y no lo
 * está. Peor: el olvido no rompe nada, así que nadie se entera.
 *
 * Derivar mueve el conocimiento de N escritores a UN lector. Sigue habiendo un modo de falla
 * —agregar un input y no sumarlo acá— pero es UN lugar, está a la vista, y este archivo es donde
 * alguien lo va a buscar.
 *
 * ── `staleAt` NO DESAPARECE, PERO NO ES EL CAMINO AUTOMÁTICO ─────────────────
 * Queda como la marca EXPLÍCITA: algo (o alguien) que sabe más que los timestamps puede decir
 * «esto quedó viejo» aunque las fechas no lo muestren. Las dos entradas se resuelven en UNA sola
 * respuesta, con su motivo — dos veredictos que se contradigan en pantalla sería peor que
 * cualquiera de los dos.
 */

/** Lo que puede haber cambiado desde que se generó el resumen. `null` = ese input no existe. */
export interface SenalesDeFrescura {
  /** La reunión más reciente del proyecto que dejó contenido. */
  ultimaSesionConContenido: Date | null;
  /** Cuándo se regeneró el handoff por última vez. */
  handoffActualizadoEn: Date | null;
  /** Cuándo se espejó por última vez la etapa desde HubSpot. */
  etapaSincronizadaEn: Date | null;
  /** La desviación del cronograma detectada más recientemente. */
  ultimaDesviacionEn: Date | null;
  /** La marca EXPLÍCITA de la fila (`ProjectBrief.staleAt`). */
  marcadoVencidoEn: Date | null;
}

export interface VeredictoDeFrescura {
  vencido: boolean;
  /** Qué lo dejó atrás, en una frase para la pantalla. `null` cuando está al día. */
  motivo: string | null;
}

/**
 * Los inputs derivables, con la frase que se le muestra a la persona.
 *
 * ⚠ AGREGAR UN INPUT AL BRIEF SIN AGREGARLO ACÁ deja el resumen viéndose fresco sobre algo que
 * cambió. Es el único modo de falla de este diseño, y por eso la lista está acá y no repartida.
 */
const DERIVADOS: ReadonlyArray<{
  campo: keyof Omit<SenalesDeFrescura, "marcadoVencidoEn">;
  frase: string;
}> = [
  { campo: "ultimaSesionConContenido", frase: "hubo una reunión nueva" },
  { campo: "handoffActualizadoEn", frase: "se regeneró el handoff" },
  { campo: "etapaSincronizadaEn", frase: "cambió la etapa en HubSpot" },
  { campo: "ultimaDesviacionEn", frase: "se detectó una desviación nueva" },
];

/**
 * ¿El resumen quedó atrás?
 *
 * Un input POSTERIOR a la generación lo vence. Se listan TODOS los que cambiaron, no solo el
 * primero: «hubo una reunión nueva» y «hubo una reunión nueva y cambió la etapa» piden atención
 * distinta, y quedarse con el primero escondería la mitad del motivo.
 */
export function evaluarFrescura(
  generadoEn: Date | null,
  s: SenalesDeFrescura,
): VeredictoDeFrescura {
  // Sin resumen no hay nada que vencer — es un estado distinto, y la pantalla lo dice distinto.
  if (!generadoEn) return { vencido: false, motivo: null };

  const razones = DERIVADOS.filter((d) => {
    const cuando = s[d.campo];
    return cuando !== null && cuando.getTime() > generadoEn.getTime();
  }).map((d) => d.frase);

  /* La marca explícita se suma a las derivadas en vez de reemplazarlas: si además de la marca
     hubo una reunión nueva, la persona quiere saber las dos cosas. */
  if (s.marcadoVencidoEn && s.marcadoVencidoEn.getTime() > generadoEn.getTime()) {
    razones.push("se marcó como desactualizado");
  }

  if (razones.length === 0) return { vencido: false, motivo: null };
  return {
    vencido: true,
    motivo: `Desde que se generó, ${unirEnEspanol(razones)}.`,
  };
}

/** «a», «a y b», «a, b y c» — el «y» final es lo que hace que se lea como una frase. */
function unirEnEspanol(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}
