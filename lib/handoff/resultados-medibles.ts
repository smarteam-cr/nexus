/**
 * lib/handoff/resultados-medibles.ts — los RESULTADOS MEDIBLES del handoff, con su forma. PURO.
 *
 * ── EL PROBLEMA (Elías, 2026-10-02) ──────────────────────────────────────────────────────────
 * «Los objetivos cuantitativos deben venir del resultado que captura el handoff, no capturarse dos
 * veces. Si no hay línea base, se marcan como por validar.» El handoff ya captura lo que el cliente
 * necesita alcanzar (`resultados_cliente`), pero como texto libre: nada en él dice cuál es la línea
 * base ni la meta, así que el diagnóstico los volvía a escribir — y la segunda copia era la que
 * cambiaba.
 *
 * ── LA SOLUCIÓN ──────────────────────────────────────────────────────────────────────────────
 * Esa sección del handoff se lee UNA vez y queda como lista (`Project.handoffResultados`): R1, R2…
 * con qué se quiere lograr, cómo se mide, la línea base, la meta y el plazo. La escribe
 * `lib/handoff/resultados.ts` después de cada handoff (como el resumen de tres frases). El
 * diagnóstico NO copia la línea base ni la meta: cada objetivo cuantitativo apunta a un R y las
 * muestra desde acá. Cuando alguien completa una línea base —en el handoff o desde el diagnóstico—
 * se escribe acá, una sola vez, y la ven los dos.
 *
 * Lo que una persona escribió a mano (`editadoAt`) manda: releer el handoff no lo pisa.
 */

export interface ResultadoMedible {
  /** «R1», «R2»… estable dentro del proyecto: los objetivos del diagnóstico lo citan. */
  id: string;
  /** Qué tiene que pasar en el negocio del cliente. */
  resultado: string;
  /** Cómo se va a saber: la señal o la métrica. */
  metrica: string;
  /** El punto de partida. Vacío = por validar. */
  lineaBase: string;
  /** A dónde se quiere llegar. Vacío = por validar. */
  meta: string;
  /** Para cuándo («antes del 16 de diciembre», «sostenido, cada mes»). */
  plazo: string;
  /** Una persona tocó línea base, meta o plazo: releer el handoff ya no los cambia. */
  editadoAt?: string;
  editadoPor?: string;
}

export interface ResultadosDelHandoff {
  version: 1;
  resultados: ResultadoMedible[];
  /** Cuándo se leyeron del handoff por última vez. */
  at: string;
  /** Qué los escribió la última vez. */
  origen: "handoff" | "manual" | "diagnostico" | "edicion";
}

/** Los campos que una persona puede completar (el resto sale del handoff). */
export const CAMPOS_EDITABLES = ["lineaBase", "meta", "plazo"] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

const texto = (v: unknown, max = 600) => (typeof v === "string" ? v.trim().slice(0, max) : "");

const POR_VALIDAR = /^(⚠️?\s*)?por (validar|definir|confirmar)\.?$/i;

/** Vacío o «Por validar» = no hay dato. */
export function sinDato(v: string | undefined | null): boolean {
  const t = (v ?? "").trim();
  return t === "" || POR_VALIDAR.test(t) || /^n\/?a$/i.test(t) || t === "—" || t === "-";
}

/** Sin línea base, el objetivo se marca «Por validar» (la regla de Elías). */
export function porValidar(r: Pick<ResultadoMedible, "lineaBase">): boolean {
  return sinDato(r.lineaBase);
}

/** Lee lo guardado, tolerante: la columna la puede tocar un script. `null` si no hay nada útil. */
export function leerResultadosDelHandoff(raw: unknown): ResultadosDelHandoff | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const lista = Array.isArray(o.resultados) ? o.resultados : [];
  const vistos = new Set<string>();
  const resultados: ResultadoMedible[] = [];
  for (const it of lista) {
    if (!it || typeof it !== "object") continue;
    const r = it as Record<string, unknown>;
    const id = texto(r.id, 12).toUpperCase();
    const resultado = texto(r.resultado);
    if (!/^R\d+$/.test(id) || !resultado || vistos.has(id)) continue;
    vistos.add(id);
    resultados.push({
      id,
      resultado,
      metrica: texto(r.metrica),
      lineaBase: texto(r.lineaBase),
      meta: texto(r.meta),
      plazo: texto(r.plazo),
      ...(texto(r.editadoAt, 40) ? { editadoAt: texto(r.editadoAt, 40) } : {}),
      ...(texto(r.editadoPor, 200) ? { editadoPor: texto(r.editadoPor, 200) } : {}),
    });
  }
  const origen = ["handoff", "manual", "diagnostico", "edicion"].includes(String(o.origen))
    ? (o.origen as ResultadosDelHandoff["origen"])
    : "handoff";
  return { version: 1, resultados, at: texto(o.at, 40), origen };
}

const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Cuánto se parecen dos redacciones: palabras de 3+ letras en común sobre el total (0 a 1). */
function parecido(a: string, b: string): number {
  const palabras = (s: string) => new Set(normal(s).split(" ").filter((w) => w.length >= 3));
  const A = palabras(a);
  const B = palabras(b);
  if (!A.size || !B.size) return 0;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return comunes / (A.size + B.size - comunes);
}

/**
 * Une lo que se acaba de leer del handoff con lo guardado.
 *
 *  · Los ids se conservan: un resultado que sigue estando —mismo texto, o el mismo dicho casi igual
 *    (comparten al menos el 60% de sus palabras)— mantiene su R, porque los objetivos lo citan.
 *    ⛔ Nunca por POSICIÓN: dos resultados distintos en el mismo lugar de la lista le pasarían la
 *    línea base de uno al otro.
 *  · Lo que una persona completó (`editadoAt`) manda sobre lo que trae el handoff.
 *  · Un resultado que el handoff ya no trae pero que alguien editó se conserva: tiene datos que no
 *    están en ningún otro lado. Uno que nadie tocó, se va.
 *  · Los nuevos toman el siguiente R libre.
 */
export function fusionarResultados(
  previos: readonly ResultadoMedible[],
  leidos: ReadonlyArray<Omit<ResultadoMedible, "id" | "editadoAt" | "editadoPor">>,
): ResultadoMedible[] {
  const usados = new Set<string>();
  let siguiente = previos.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0);
  const salida: ResultadoMedible[] = [];

  /* Primero los iguales, después los parecidos: así un parecido no le quita el R a un igual que
     viene más abajo en la lista. */
  const elegido = new Map<number, ResultadoMedible>();
  leidos.forEach((nuevo, i) => {
    const igual = previos.find((p) => !usados.has(p.id) && normal(p.resultado) === normal(nuevo.resultado));
    if (igual) {
      usados.add(igual.id);
      elegido.set(i, igual);
    }
  });
  leidos.forEach((nuevo, i) => {
    if (elegido.has(i)) return;
    let mejor: ResultadoMedible | undefined;
    let mejorParecido = 0.6;
    for (const p of previos) {
      if (usados.has(p.id)) continue;
      const s = parecido(p.resultado, nuevo.resultado);
      if (s >= mejorParecido) {
        mejor = p;
        mejorParecido = s;
      }
    }
    if (mejor) {
      usados.add(mejor.id);
      elegido.set(i, mejor);
    }
  });

  leidos.forEach((nuevo, i) => {
    const previo = elegido.get(i);
    if (previo) {
      const manda = (campo: CampoEditable) => (previo.editadoAt && !sinDato(previo[campo]) ? previo[campo] : nuevo[campo] || previo[campo]);
      salida.push({
        ...nuevo,
        id: previo.id,
        lineaBase: manda("lineaBase"),
        meta: manda("meta"),
        plazo: manda("plazo"),
        ...(previo.editadoAt ? { editadoAt: previo.editadoAt } : {}),
        ...(previo.editadoPor ? { editadoPor: previo.editadoPor } : {}),
      });
    } else {
      siguiente += 1;
      salida.push({ ...nuevo, id: `R${siguiente}` });
    }
  });
  // Lo editado a mano que el handoff ya no trae, se conserva al final.
  for (const p of previos) if (!usados.has(p.id) && p.editadoAt) salida.push(p);
  return salida;
}

/** Lo que devolvió el modelo, validado. Puro: lo que el modelo diga de más, se descarta. */
export function leerRespuestaDeResultados(texto: string): Array<Omit<ResultadoMedible, "id">> | null {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  const lista = (json as { resultados?: unknown })?.resultados;
  if (!Array.isArray(lista)) return null;
  const s = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 600) : "");
  return lista
    .map((r) => (r && typeof r === "object" ? (r as Record<string, unknown>) : {}))
    .map((r) => ({ resultado: s(r.resultado), metrica: s(r.metrica), lineaBase: s(r.lineaBase), meta: s(r.meta), plazo: s(r.plazo) }))
    .filter((r) => r.resultado !== "")
    .slice(0, 20);
}

/** Aplica la edición de una persona a un resultado. `null` si el id no existe. */
export function editarResultado(
  lista: readonly ResultadoMedible[],
  id: string,
  cambios: Partial<Record<CampoEditable, string>>,
  por: string | null,
  ahora: Date,
): ResultadoMedible[] | null {
  const i = lista.findIndex((r) => r.id === id.toUpperCase());
  if (i < 0) return null;
  const limpio = Object.fromEntries(
    Object.entries(cambios)
      .filter(([k, v]) => (CAMPOS_EDITABLES as readonly string[]).includes(k) && typeof v === "string")
      .map(([k, v]) => [k, (v as string).trim().slice(0, 600)]),
  );
  const copia = [...lista];
  copia[i] = { ...copia[i], ...limpio, editadoAt: ahora.toISOString(), ...(por ? { editadoPor: por } : {}) };
  return copia;
}

/** Los resultados como texto para un agente. Los vacíos dicen «por validar», nunca se inventan. */
export function resultadosParaPrompt(lista: readonly ResultadoMedible[]): string {
  if (!lista.length) return "";
  const dato = (v: string) => (sinDato(v) ? "por validar" : v);
  return lista
    .map(
      (r) =>
        `- ${r.id} · ${r.resultado}` +
        `${r.metrica ? ` — se mide con: ${r.metrica}` : ""}` +
        ` — línea base: ${dato(r.lineaBase)} — meta: ${dato(r.meta)}` +
        `${r.plazo ? ` — plazo: ${r.plazo}` : ""}`,
    )
    .join("\n");
}
