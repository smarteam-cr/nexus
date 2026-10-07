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
 *
 * ── UNIDA CON LA RONDA DEL 2026-10-02 (decisión de Elías: «unir las dos») ────────────────────
 * La misma lista lleva además QUIÉN necesita cada resultado y los RETOS que hoy lo frenan, y el CSE
 * del proyecto la CONFIRMA (`confirmadoAt`): la IA propone, una persona confirma. Lo que nadie
 * confirmó todavía sale «Por validar» en el diagnóstico, igual que lo que no tiene línea base. Si el
 * handoff no escribió la sección (los prompts viejos), la lista la PROPONE la IA desde las reuniones
 * del proyecto (lib/handoff/proponer-resultados.ts) — una sola lista, venga de donde venga.
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
  /** Quién necesita el resultado: persona y rol en el cliente («Ana Pérez, gerente comercial»). */
  quienLoNecesita?: string;
  /** Lo que hoy le impide llegar (datos dispersos, un proceso manual, una decisión pendiente). */
  retos?: string[];
  /** De dónde salió cuando lo propuso la IA desde las reuniones (H1, S2, F1…). */
  fuentes?: string[];
  /** Una persona tocó línea base, meta o plazo: releer el handoff ya no los cambia. */
  editadoAt?: string;
  editadoPor?: string;
  /** El CSE del proyecto lo confirmó. Sin esto, el diagnóstico lo muestra «Por validar». */
  confirmadoAt?: string;
  confirmadoPor?: string;
}

export interface ResultadosDelHandoff {
  version: 1;
  resultados: ResultadoMedible[];
  /** Cuándo se leyeron del handoff por última vez. */
  at: string;
  /** Qué los escribió la última vez. «propuesta» = la IA desde las reuniones (sin sección escrita). */
  origen: "handoff" | "manual" | "diagnostico" | "edicion" | "propuesta" | "confirmacion";
}

/** Los campos que una persona puede completar (el resto sale del handoff). */
export const CAMPOS_EDITABLES = ["lineaBase", "meta", "plazo", "quienLoNecesita", "retos"] as const;
export type CampoEditable = (typeof CAMPOS_EDITABLES)[number];

/** Los campos de texto donde lo que escribió una persona manda sobre lo que trae el handoff. */
const CAMPOS_QUE_MANDAN = ["lineaBase", "meta", "plazo", "quienLoNecesita"] as const;

const ORIGENES: ReadonlyArray<ResultadosDelHandoff["origen"]> = ["handoff", "manual", "diagnostico", "edicion", "propuesta", "confirmacion"];

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

/** La IA lo propuso y el CSE todavía no lo confirmó: también sale «Por validar». */
export function sinConfirmar(r: Pick<ResultadoMedible, "confirmadoAt">): boolean {
  return !r.confirmadoAt;
}

const listaDeTexto = (v: unknown, max = 6): string[] =>
  Array.isArray(v) ? v.map((x) => texto(x, 300)).filter(Boolean).slice(0, max) : [];

/** Quién lo necesita, los retos y las fuentes, solo si traen algo (lo vacío no se guarda). */
function camposDeLaRonda(r: Record<string, unknown>): Pick<ResultadoMedible, "quienLoNecesita" | "retos" | "fuentes"> {
  const quien = texto(r.quienLoNecesita, 300);
  const retos = listaDeTexto(r.retos);
  const fuentes = listaDeTexto(r.fuentes, 8).map((f) => f.slice(0, 12));
  return {
    ...(quien ? { quienLoNecesita: quien } : {}),
    ...(retos.length ? { retos } : {}),
    ...(fuentes.length ? { fuentes } : {}),
  };
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
      ...camposDeLaRonda(r),
      ...(texto(r.editadoAt, 40) ? { editadoAt: texto(r.editadoAt, 40) } : {}),
      ...(texto(r.editadoPor, 200) ? { editadoPor: texto(r.editadoPor, 200) } : {}),
      ...(texto(r.confirmadoAt, 40) ? { confirmadoAt: texto(r.confirmadoAt, 40) } : {}),
      ...(texto(r.confirmadoPor, 200) ? { confirmadoPor: texto(r.confirmadoPor, 200) } : {}),
    });
  }
  const origen = (ORIGENES as readonly string[]).includes(String(o.origen))
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
 *  · La CONFIRMACIÓN del CSE se conserva solo si el resultado sigue diciendo lo MISMO: si releer el
 *    handoff le cambió la redacción, vuelve a «sin confirmar» — el CSE confirmó otra frase.
 */
export function fusionarResultados(
  previos: readonly ResultadoMedible[],
  leidos: ReadonlyArray<Omit<ResultadoMedible, "id" | "editadoAt" | "editadoPor" | "confirmadoAt" | "confirmadoPor">>,
): ResultadoMedible[] {
  const usados = new Set<string>();
  let siguiente = previos.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0);
  const salida: ResultadoMedible[] = [];

  /* Primero los iguales, después los parecidos: así un parecido no le quita el R a un igual que
     viene más abajo en la lista. */
  const elegido = new Map<number, ResultadoMedible>();
  const iguales = new Set<number>();
  leidos.forEach((nuevo, i) => {
    const igual = previos.find((p) => !usados.has(p.id) && normal(p.resultado) === normal(nuevo.resultado));
    if (igual) {
      usados.add(igual.id);
      elegido.set(i, igual);
      iguales.add(i);
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
      const manda = (campo: (typeof CAMPOS_QUE_MANDAN)[number]) =>
        (previo.editadoAt && !sinDato(previo[campo]) ? previo[campo] : nuevo[campo] || previo[campo]) ?? "";
      const quien = manda("quienLoNecesita");
      const retos = previo.editadoAt && previo.retos?.length ? previo.retos : nuevo.retos?.length ? nuevo.retos : previo.retos;
      const confirmado = iguales.has(i) && previo.confirmadoAt;
      salida.push({
        ...nuevo,
        id: previo.id,
        lineaBase: manda("lineaBase"),
        meta: manda("meta"),
        plazo: manda("plazo"),
        ...(quien ? { quienLoNecesita: quien } : {}),
        ...(retos?.length ? { retos } : {}),
        ...(previo.editadoAt ? { editadoAt: previo.editadoAt } : {}),
        ...(previo.editadoPor ? { editadoPor: previo.editadoPor } : {}),
        ...(confirmado ? { confirmadoAt: previo.confirmadoAt } : {}),
        ...(confirmado && previo.confirmadoPor ? { confirmadoPor: previo.confirmadoPor } : {}),
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
    .map((r) => ({
      resultado: s(r.resultado),
      metrica: s(r.metrica),
      lineaBase: s(r.lineaBase),
      meta: s(r.meta),
      plazo: s(r.plazo),
      ...camposDeLaRonda(r),
    }))
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
  const limpio: Record<string, unknown> = Object.fromEntries(
    Object.entries(cambios)
      .filter(([k, v]) => (CAMPOS_EDITABLES as readonly string[]).includes(k) && typeof v === "string")
      .map(([k, v]) =>
        // Los retos se escriben uno por línea y se guardan como lista.
        k === "retos" ? [k, listaDeTexto((v as string).split(/\r?\n/))] : [k, (v as string).trim().slice(0, 600)],
      ),
  );
  const copia = [...lista];
  copia[i] = { ...copia[i], ...limpio, editadoAt: ahora.toISOString(), ...(por ? { editadoPor: por } : {}) };
  return copia;
}

/**
 * El CSE confirma resultados (todos, o los ids que nombra). Es lo que vuelve «oficial» un resultado
 * que propuso la IA: sin confirmación, el diagnóstico lo muestra «Por validar». Ids que no existen
 * se ignoran; confirmar dos veces no cambia la fecha de la primera.
 */
export function confirmarResultados(
  lista: readonly ResultadoMedible[],
  ids: readonly string[] | null,
  por: string | null,
  ahora: Date,
): ResultadoMedible[] {
  const cuales = ids ? new Set(ids.map((x) => x.toUpperCase())) : null;
  return lista.map((r) =>
    (cuales && !cuales.has(r.id)) || r.confirmadoAt
      ? r
      : { ...r, confirmadoAt: ahora.toISOString(), ...(por ? { confirmadoPor: por } : {}) },
  );
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
        `${r.plazo ? ` — plazo: ${r.plazo}` : ""}` +
        `${r.quienLoNecesita ? ` — lo necesita: ${r.quienLoNecesita}` : ""}` +
        `${r.retos?.length ? ` — lo que lo frena: ${r.retos.join("; ")}` : ""}` +
        `${sinConfirmar(r) ? " — (sin confirmar por el CSE: tratarlo como por validar)" : ""}`,
    )
    .join("\n");
}

/**
 * Los resultados CONFIRMADOS como el texto del campo «Resultados que persigue» de Información del
 * cliente (lib/clients/ficha.ts): una viñeta por resultado, con el nombre del proyecto arriba si
 * hay más de uno. Es lo que va a la propiedad de la empresa en HubSpot y lo que leen los agentes
 * desde la ficha. Lo sin confirmar no entra: la ficha es lo que el CSE ya confirmó. Vacío si no
 * hay ninguno confirmado (quien llama decide qué hacer: no se pisa un texto con nada).
 */
export function resultadosParaLaFicha(listas: ReadonlyArray<{ proyecto: string; resultados: readonly ResultadoMedible[] }>): string {
  const conDatos = listas
    .map((l) => ({ proyecto: l.proyecto, resultados: l.resultados.filter((r) => !sinConfirmar(r) && r.resultado.trim()) }))
    .filter((l) => l.resultados.length);
  const linea = (r: ResultadoMedible) =>
    `- **${r.id}** · ${r.resultado.trim()}` +
    `${r.metrica.trim() ? ` — se mide con: ${r.metrica.trim()}` : ""}` +
    `${sinDato(r.lineaBase) ? "" : ` — línea base: ${r.lineaBase.trim()}`}` +
    `${sinDato(r.meta) ? "" : ` — meta: ${r.meta.trim()}`}` +
    `${r.plazo.trim() ? ` — plazo: ${r.plazo.trim()}` : ""}`;
  return conDatos
    .map((l) => (conDatos.length > 1 ? [`**${l.proyecto}**`, ...l.resultados.map(linea)] : l.resultados.map(linea)).join("\n"))
    .join("\n\n");
}
