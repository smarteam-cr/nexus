/**
 * lib/sessions/clientes-por-texto.ts — ¿qué cliente nombra una LÍNEA de una reunión? PURO.
 *
 * Tareas internas sugiere el cliente de cada línea de los «Próximos pasos» de una reunión INTERNA («Reporte Colby: …»
 * → Colby). Usa la MISMA función del cascade (`clientePorTitulo`, en modo «mejor-fraccion») con las mismas stopwords y
 * los mismos tokens ambiguos que `categorize.ts`: no es otro emparejado (invariante #2).
 *
 * ⛔ NO decide de quién es la reunión: eso sigue siendo `resolvedClientId`. Esto SUGIERE el cliente de una línea, en
 * azul y hasta que una persona lo confirma.
 *
 * `candidatos` es más laxo (un token que empieza igual: «Ecoquinta» → «Ecoquintas»): sirve para darle opciones a la IA
 * o a la persona, nunca para elegir solo.
 */
import { clientePorTitulo, tituloNombraSigla, tokensDelCliente, tokensDelTitulo, type ClienteParaMatch } from "./match-por-titulo";
import { TITLE_MATCH_STOPWORDS, computeAmbiguousNameTokens, isTestClient, normalize } from "./categorize";

export interface ClientesDeUnTexto {
  /** El cliente que el cascade elegiría para este texto, o null. */
  sugerido: string | null;
  /** Los que el texto podría nombrar (laxo), para mostrarlos como opciones. */
  candidatos: string[];
}

export interface IndiceDeClientes {
  clientes: readonly ClienteParaMatch[];
  ambiguos: ReadonlySet<string>;
}

/** Se arma una vez por lectura (los tokens ambiguos se calculan sobre todo el conjunto). */
export function indiceDeClientes(clientes: readonly ClienteParaMatch[]): IndiceDeClientes {
  return { clientes: clientes.filter((c) => !isTestClient(c.name)), ambiguos: computeAmbiguousNameTokens(clientes.map((c) => ({ name: c.name, company: c.company }))) };
}

export function clientesDeUnTexto(texto: string, indice: IndiceDeClientes, esLaCasa?: (c: ClienteParaMatch) => boolean): ClientesDeUnTexto {
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || indice.ambiguos.has(w);
  const r = clientePorTitulo(texto, indice.clientes, { modo: "mejor-fraccion", skip, normalize, esClienteDePrueba: isTestClient, esLaCasa });
  const palabras = [...tokensDelTitulo(texto, skip, normalize)];
  const laxos = indice.clientes.filter((c) => {
    if (esLaCasa?.(c)) return false;
    const { delNombre } = tokensDelCliente(c, skip, normalize);
    return [...delNombre].some((t) => t.length >= 5 && palabras.some((w) => w.length >= 5 && (w.startsWith(t) || t.startsWith(w))));
  });
  const candidatos = [...new Set([...r.candidatos.map((c) => c.id), ...laxos.map((c) => c.id)])];
  return { sugerido: r.cliente?.id ?? null, candidatos };
}

/**
 * Los clientes cuyo nombre ENTERO aparece en un texto (2026-10-19, la agenda de «Para ti»: «Preparar demo para Accesos
 * Automáticos» → Accesos Automáticos). Más estricto que `clientesDeUnTexto`, a propósito: un evento propio de una
 * persona («Cita Médica», «Tenis») no es de nadie, y adjudicarlo a medias le mostraría la cuenta de otro cliente.
 *
 * Parte de los candidatos del MISMO match del cascade (`clientePorTitulo`, mismas stopwords y tokens ambiguos) y se
 * queda con los que nombran todas las palabras distintivas de su nombre, o una sigla declarada. Dos registros con el
 * mismo nombre (un duplicado) cuentan una vez: el primero. Más de uno distinto = el texto no dice cuál (lo decide quien
 * llama con `cuentaDelEvento`, que con dos no elige).
 */
export function clientesNombradosEnteros(textoCrudo: string, indice: IndiceDeClientes): string[] {
  // Los signos que el corte de palabras del título no conoce («Automáticos:», «demo/ACCESOS») no pegan nada a la palabra.
  const texto = textoCrudo.replace(/[^\p{L}\p{M}\p{N}]+/gu, " ");
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || indice.ambiguos.has(w);
  const r = clientePorTitulo(texto, indice.clientes, { modo: "una-palabra", skip, normalize, esClienteDePrueba: isTestClient });
  const palabras = tokensDelTitulo(texto, skip, normalize);
  const porNombre = new Map<string, string>();
  for (const c of r.candidatos) {
    const { delNombre } = tokensDelCliente(c, skip, normalize);
    const entero = tituloNombraSigla(texto, c.siglas, normalize) || (delNombre.size > 0 && [...delNombre].every((t) => palabras.has(t)));
    if (!entero) continue;
    const k = normalize(c.name);
    if (!porNombre.has(k)) porNombre.set(k, c.id);
  }
  return [...porNombre.values()];
}
