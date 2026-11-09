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
import {
  TITLE_MATCH_STOPWORDS,
  computeAmbiguousNameTokens,
  isTestClient,
  normalize,
  palabrasQueNoDistinguenEnSuEmpresa,
  siglasQueValenEnElTitulo,
  unidadQueNombraElTitulo,
  unidadesDeLaEmpresa,
} from "./categorize";
import { palabrasSinSufijoLegal } from "@/lib/clients/gemelas";

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

/**
 * Se arma una vez por lectura (los tokens ambiguos se calculan sobre todo el conjunto). Con `comparteDominioConId`, las
 * unidades de una empresa siguen las reglas de categorize.ts (2026-11-07): la marca («cemaco») no es ambigua por ellas
 * ni nombra a una, y sus siglas valen solo junto a la marca.
 */
export function indiceDeClientes(clientes: readonly ClienteParaMatch[]): IndiceDeClientes {
  const ambiguos = computeAmbiguousNameTokens(clientes.map((c) => ({ id: c.id, name: c.name, company: c.company, comparteDominioConId: c.comparteDominioConId ?? null })));
  return { clientes: clientes.filter((c) => !isTestClient(c.name)), ambiguos };
}

export function clientesDeUnTexto(texto: string, indice: IndiceDeClientes, esLaCasa?: (c: ClienteParaMatch) => boolean): ClientesDeUnTexto {
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || indice.ambiguos.has(w);
  const r = clientePorTitulo(texto, siglasQueValenEnElTitulo(texto, indice.clientes), { modo: "mejor-fraccion", skip, normalize, esClienteDePrueba: isTestClient, esLaCasa });
  /* Si cae en una unidad, decide cuál como la cascada (por la sigla o por lo que la distingue); la marca sola no sugiere. */
  const empresa = r.cliente ? unidadesDeLaEmpresa(r.cliente.id, indice.clientes) : null;
  const sugerido = empresa ? unidadQueNombraElTitulo(texto, empresa, indice.ambiguos).clientId : (r.cliente?.id ?? null);
  const palabras = [...tokensDelTitulo(texto, skip, normalize)];
  const laxos = indice.clientes.filter((c) => {
    if (esLaCasa?.(c)) return false;
    const { delNombre } = tokensDelCliente(c, skip, normalize);
    return [...delNombre].some((t) => t.length >= 5 && palabras.some((w) => w.length >= 5 && (w.startsWith(t) || t.startsWith(w))));
  });
  const candidatos = [...new Set([...r.candidatos.map((c) => c.id), ...(empresa ?? []).map((c) => c.id), ...laxos.map((c) => c.id)])];
  return { sugerido, candidatos };
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
 *
 * Un nombre de varias palabras al que le queda UNA sola distintiva («El Éxito», «RC Inmobiliaria», «Librería
 * Internacional», «Cemaco Internacional») pide dos cosas más (2026-10-19, prueba 151, medido sobre las reuniones
 * internas de octubre de todo el equipo; `nombraElNombrePropio`):
 *  - esa palabra va con mayúscula, como un nombre propio: «el éxito del onboarding» o «Hablemos de librería» no
 *    nombran a nadie; «Alineación CEMACO» sí es Cemaco Internacional;
 *  - si el nombre tiene palabras cortas («El», «RC»), aparecen seguidas de la distintiva: «Sobre Casos de Éxito» no es
 *    El Éxito y «Custom Agent - Inmobiliaria» no es RC Inmobiliaria. Las palabras largas que no distinguen («Grupo»,
 *    «Internacional») pueden faltar, y los sufijos legales («S.A.», «SRL») no cuentan
 *    (lib/clients/gemelas.ts › palabrasSinSufijoLegal, la misma regla de las fichas gemelas).
 */
export function clientesNombradosEnteros(textoCrudo: string, indice: IndiceDeClientes): string[] {
  // Los signos que el corte de palabras del título no conoce («Automáticos:», «demo/ACCESOS») no pegan nada a la palabra.
  const texto = textoCrudo.replace(/[^\p{L}\p{M}\p{N}]+/gu, " ");
  const skip = (w: string) => TITLE_MATCH_STOPWORDS.has(w) || indice.ambiguos.has(w);
  const r = clientePorTitulo(texto, siglasQueValenEnElTitulo(texto, indice.clientes), { modo: "una-palabra", skip, normalize, esClienteDePrueba: isTestClient });
  const palabras = tokensDelTitulo(texto, skip, normalize);
  const porNombre = new Map<string, string>();
  for (const c of r.candidatos) {
    /* Una unidad no se nombra por la marca que comparte con las otras («Alineación CEMACO» no es Costa Rica). */
    const noDistingue = palabrasQueNoDistinguenEnSuEmpresa(c.id, indice.clientes);
    const skipDe = (w: string) => skip(w) || noDistingue.has(w);
    // Las palabras del nombre sin sufijo legal: «Plastimex S.A.» se nombra con «Plastimex» («s.a.» no distingue).
    const delNombre = new Set(palabrasSinSufijoLegal(c.name).split(" ").filter((w) => w.length >= 4 && !skipDe(w)));
    const entero =
      tituloNombraSigla(texto, c.siglas, normalize) ||
      (delNombre.size > 0 && [...delNombre].every((t) => palabras.has(t)) && (delNombre.size > 1 || nombraElNombrePropio(texto, c.name, skipDe)));
    if (!entero) continue;
    const k = normalize(c.name);
    if (!porNombre.has(k)) porNombre.set(k, c.id);
  }
  return [...porNombre.values()];
}

/**
 * Un nombre con UNA sola palabra distintiva, en el texto. Sin otras palabras («Plastimex S.A.»), alcanza con la
 * distintiva. Con otras: la distintiva con mayúscula y, si hay palabras cortas, el nombre seguido en el texto (las
 * largas que no distinguen pueden faltar).
 */
function nombraElNombrePropio(texto: string, nombre: string, skip: (w: string) => boolean): boolean {
  const delNombre = palabrasSinSufijoLegal(nombre).split(" ").filter(Boolean);
  const distintiva = delNombre.find((w) => w.length >= 4 && !skip(w));
  if (!distintiva || delNombre.length === 1) return true;
  const crudas = texto.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
  const del = crudas.map((w) => normalize(w));
  const conMayuscula = crudas.some((w, k) => del[k] === distintiva && w[0] !== w[0].toLowerCase());
  if (!conMayuscula) return false;
  if (!delNombre.some((w) => w.length < 4)) return true;
  const opcional = (w: string) => w.length >= 4 && w !== distintiva && skip(w);
  const desde = (i: number, k: number): boolean => {
    if (k === delNombre.length) return true;
    if (opcional(delNombre[k]) && desde(i, k + 1)) return true;
    return i < del.length && del[i] === delNombre[k] && desde(i + 1, k + 1);
  };
  for (let i = 0; i < del.length; i++) if (desde(i, 0)) return true;
  return false;
}
