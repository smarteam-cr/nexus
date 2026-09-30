/**
 * lib/escala/documento/validar.ts — las pruebas que una versión pasa ANTES de publicarse. PURO.
 *
 * Replica las pruebas de `docs/escala/pruebas_escala.py` que tocan lo que Nexus lee:
 *   1 · Ningún nivel vacío (con `aplica`, la misma regla de la pantalla)
 *   4 · Sin identificadores a la vista
 *   5 · Identificadores estables (contra la versión publicada, si hay)
 *   7 · Documentos alineados
 * más la ESTRUCTURA que la pantalla da por hecha (cada nivel con criterios, resultado desde
 * Funcional, cada riesgo con su mensaje…).
 *
 * Desde la 8.0.0 la escala trae EDICIONES por industria. Las pruebas 1, 4 y 5 corren sobre la
 * escala general y, además, sobre la escala vista por cada edición (`aplicarEdicion`), y la prueba
 * «8 · Ediciones coherentes» mira lo que es propio de una edición. Desde la 8.3.0 un criterio puede
 * decir cuáles otros requiere: «9 · Requeridos coherentes» revisa esos enlaces.
 *
 * Las pruebas 2 y 3 son del CÁLCULO: no se copian acá, las corre el mismo `pruebas_escala.py`
 * que llega con cada versión (`scripts/publicar-escala.ts` lo ejecuta). Así el cálculo tiene una
 * sola fuente, la que escribe el dueño de la escala.
 */
import { aplicarEdicion } from "./edicion";
import { criteriosPropios, FORMA_DE_EDICION, leerEncabezado, leerRetirados, PRIMER_NUMERO_DE_EDICION, todosLosCriterios } from "./parsear";
import { aplica, CIERRES, DESPUES, dimensionAplica, type Perfil } from "./perfil";
import { fallasDeRequeridos } from "./requeridos";
import { LETRAS_CON_RESULTADO, type Escala } from "./tipos";

export interface ResultadoDePrueba {
  nombre: string;
  ok: boolean;
  detalle: string[];
}

export interface OpcionesDeValidacion {
  /** La versión publicada antes: para la prueba 5 (nada desaparece). */
  anterior?: Escala | null;
  /** El texto de la especificación del cálculo: identificadores retirados y prueba 7. */
  especificacion?: string | null;
  /** El texto del manual de operación: prueba 7. */
  manual?: string | null;
}

/** Los nueve perfiles de la prueba (las dos preguntas contestadas). */
export const PERFILES_COMPLETOS: Perfil[] = CIERRES.flatMap((cierre) => DESPUES.map((despues) => ({ cierre, despues })));

function prueba(nombre: string, detalle: string[]): ResultadoDePrueba {
  return { nombre, ok: detalle.length === 0, detalle };
}

/**
 * La escala general y, después, la escala vista por cada edición: lo que se prueba sobre una, se
 * prueba sobre todas. `donde` va delante de cada falla de una edición («[Ecommerce y retail] …»).
 */
function vistas(escala: Escala): { escala: Escala; donde: string }[] {
  return [
    { escala, donde: "" },
    ...escala.ediciones.map((e) => ({ escala: aplicarEdicion(escala, e.slug), donde: `[${e.nombre}] ` })),
  ];
}

function estructura(escala: Escala): ResultadoDePrueba {
  const fallas: string[] = [];
  const porCapa = new Map<string, number[]>();
  for (const a of escala.areas) {
    const numeros = a.dimensiones.map((d) => Number(d.id.split(".")[1]));
    if (numeros.some((n, i) => n !== i + 1)) fallas.push(`el área ${a.id} no numera sus dimensiones 1, 2, 3…`);
    const clave = a.dimensiones.map((d) => d.capa).join(",");
    porCapa.set(a.id, [a.dimensiones.filter((d) => d.capa === "base").length, a.dimensiones.filter((d) => d.capa === "produccion").length]);
    if (!clave.includes("base") || !clave.includes("produccion")) fallas.push(`el área ${a.id} no tiene las dos capas.`);
    for (const d of a.dimensiones) {
      for (const n of d.niveles) {
        // Deficiente e Inicial pueden ser solo una descripción (se asignan por mejor ajuste; en la
        // 7.0.0, 1.5.D o 3.3.I no traen criterios). Desde Funcional, criterios y resultado siempre.
        if (!LETRAS_CON_RESULTADO.includes(n.letra)) continue;
        if (n.criterios.length === 0) fallas.push(`${n.id} no tiene criterios.`);
        if (!n.resultado) fallas.push(`${n.id} no tiene línea de resultado.`);
      }
    }
  }
  const formas = new Set([...porCapa.values()].map((v) => v.join("/")));
  if (formas.size > 1) fallas.push(`las áreas no tienen las mismas dimensiones por capa (${[...formas].join(" y ")}).`);

  // Los criterios de riesgo de la matriz y los propios de cualquier edición: todos con su mensaje.
  const criterios = [...todosLosCriterios(escala), ...criteriosPropios(escala).map((p) => p.criterio)];
  const deRiesgo = new Set(criterios.filter((c) => c.riesgo).map((c) => c.id));
  for (const id of deRiesgo) if (!escala.riesgos[id]) fallas.push(`el criterio de riesgo ${id} no tiene mensaje en la tabla «Riesgos».`);
  for (const id of Object.keys(escala.riesgos)) {
    if (!deRiesgo.has(id)) fallas.push(`la tabla «Riesgos» nombra ${id}, que no es un criterio de riesgo.`);
  }
  // Lo que el lector toleró en la prosa: se lee igual, pero no se publica sin mirarlo.
  fallas.push(...escala.avisosDeLectura);
  return prueba("Estructura", fallas);
}

function ningunNivelVacio(escala: Escala): ResultadoDePrueba {
  const vacios: string[] = [];
  for (const vista of vistas(escala)) {
    for (const perfil of PERFILES_COMPLETOS) {
      for (const d of vista.escala.areas.flatMap((a) => a.dimensiones)) {
        const decision = (letra: string) =>
          d.niveles.find((n) => n.letra === letra)?.criterios.filter((c) => !c.riesgo && aplica(c, perfil)) ?? [];
        if (decision("F").length === 0) continue; // la dimensión no aplica a ese perfil
        for (const letra of LETRAS_CON_RESULTADO) {
          if (decision(letra).length === 0) vacios.push(`${vista.donde}${d.id} ${letra} (${perfil.cierre}/${perfil.despues})`);
        }
      }
    }
  }
  return prueba("1 · Ningún nivel vacío", vacios);
}

function sinIdentificadoresALaVista(escala: Escala): ResultadoDePrueba {
  const areas = escala.areas.map((a) => a.id).join("|");
  const dims = [...new Set(escala.areas.flatMap((a) => a.dimensiones.map((d) => d.id.split(".")[1])))].join("|");
  const cita = new RegExp(`\\b(${areas})\\.(${dims})\\b`);
  const fugas = new Set<string>();
  for (const vista of vistas(escala)) {
    const revisar = (donde: string, texto: string | null) => {
      if (texto && cita.test(texto)) fugas.add(`${vista.donde}${donde}: ${texto.slice(0, 80)}`);
    };
    for (const a of vista.escala.areas) {
      revisar(`nombre del área ${a.id}`, a.nombre);
      revisar(`descripción del área ${a.id}`, a.descripcion);
      for (const [letra, texto] of Object.entries(a.panoramica)) revisar(`vistazo de ${letra} del área ${a.id}`, texto);
      for (const d of a.dimensiones) {
        revisar(`nombre de ${d.id}`, d.nombre);
        revisar(`pregunta de ${d.id}`, d.pregunta);
        revisar(`costo de ${d.id}`, d.costoDeQuedarse);
        revisar(`descripción de ${d.id}`, d.descripcion);
        for (const n of d.niveles) {
          revisar(n.id, n.descripcion);
          revisar(`resultado de ${n.id}`, n.resultado);
          for (const c of n.criterios) revisar(c.id, c.texto);
        }
      }
    }
    const ed = vista.escala.edicion;
    if (ed) {
      revisar("nombre de la edición", ed.nombre);
      revisar("para quién es", ed.descripcion);
      for (const p of ed.palabras) {
        revisar("tabla de palabras", p.general);
        revisar(`palabra «${p.general}»`, p.edicion);
      }
    }
  }
  for (const [id, mensaje] of Object.entries(escala.riesgos)) {
    if (cita.test(mensaje)) fugas.add(`mensaje de ${id}: ${mensaje.slice(0, 80)}`);
  }
  return prueba("4 · Sin identificadores a la vista", [...fugas]);
}

/** Todos los identificadores: dimensiones, niveles y criterios, de la matriz y propios de una edición. */
function identificadores(escala: Escala): string[] {
  return [
    ...escala.areas.flatMap((a) =>
      a.dimensiones.flatMap((d) => [d.id, ...d.niveles.flatMap((n) => [n.id, ...n.criterios.map((c) => c.id)])]),
    ),
    ...criteriosPropios(escala).map((p) => p.criterio.id),
  ];
}

function identificadoresEstables(escala: Escala, opts: OpcionesDeValidacion): ResultadoDePrueba {
  const fallas: string[] = [];
  const ids = [...todosLosCriterios(escala), ...criteriosPropios(escala).map((p) => p.criterio)].map((c) => c.id);
  const vistos = new Set<string>();
  for (const id of ids) {
    if (vistos.has(id)) fallas.push(`${id} está repetido.`);
    vistos.add(id);
  }
  const retirados = opts.especificacion ? leerRetirados(opts.especificacion) : [];
  for (const id of retirados) if (vistos.has(id)) fallas.push(`${id} está retirado y se volvió a usar.`);
  if (opts.anterior) {
    const ahora = new Set(identificadores(escala));
    // Un retirado puede desaparecer: se retiró o cambió de dimensión (y entró con un número nuevo).
    const retiradosAhora = new Set(retirados);
    for (const id of identificadores(opts.anterior)) {
      if (!ahora.has(id) && !retiradosAhora.has(id)) fallas.push(`${id} estaba en la ${opts.anterior.version} y desapareció.`);
    }
  }
  return prueba("5 · Identificadores estables", fallas);
}

function documentosAlineados(escala: Escala, opts: OpcionesDeValidacion): ResultadoDePrueba {
  const fallas: string[] = [];
  for (const [nombre, texto] of [
    ["la especificación", opts.especificacion],
    ["el manual", opts.manual],
  ] as const) {
    if (texto == null) continue;
    const dice = leerEncabezado(texto).escala;
    if (dice !== escala.version) fallas.push(`${nombre} dice que va con la escala ${dice ?? "(no lo dice)"}; la escala es la ${escala.version}.`);
  }
  return prueba("7 · Documentos alineados", fallas);
}

/**
 * Cómo se reconoce en un texto una palabra con valor fijo: igual, o con el verbo en plural («no se
 * deja envejecer» también es «no se dejan envejecer»; «se sostiene», «se sostienen»). Es la misma
 * palabra y el mismo umbral: sin esto, una edición que habla de varios documentos no podría decirlo
 * sin que la prueba lo leyera como un cambio. La regla es de forma, no una lista de palabras: a
 * cada palabra que termina en vocal se le admite una «n».
 */
export function formaDeLaPalabra(termino: string): RegExp {
  const palabras = termino
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + (/[aeiouáéíóú]$/.test(p) ? "n?" : ""));
  return new RegExp(`(?<![\\p{L}])${palabras.join("\\s+")}(?![\\p{L}])`, "iu");
}

/**
 * Lo que es propio de una edición. Que lo que nombra exista, que tenga su clave y que un criterio
 * propio caiga en su bloque y no pise un identificador ya lo exige el lector (`leerEdiciones`). Acá
 * van las reglas de la escala, que son las que impiden que una edición se vuelva otra escala:
 *
 *   · No renombra una dimensión de base operativa, dice su perfil habitual y su bloque es suyo.
 *   · COBERTURA. Si toca los criterios de una dimensión, dice algo de TODOS los de la matriz: lo
 *     reescribe, lo saca («No aplican») o lo deja como está («Se leen igual»), y una sola de las
 *     tres. Así un criterio nuevo de la matriz no aparece en la edición sin que nadie lo decida.
 *   · REESCRIBIR ES DECIR LO MISMO. Un texto igual al general sobra, y las palabras con valor fijo
 *     («la mayoría», «a tiempo»…) son las mismas en los dos: si no, el umbral cambió.
 *   · No saca una dimensión: si aplica a un perfil en la escala general, aplica en la edición.
 */
function edicionesCoherentes(escala: Escala): ResultadoDePrueba {
  const fallas: string[] = [];
  const generales = new Map(escala.areas.flatMap((a) => a.dimensiones.map((d) => [d.id, d] as const)));
  const fijas = escala.palabrasConValorFijo.map((p) => ({ termino: p.termino.toLowerCase(), forma: formaDeLaPalabra(p.termino) }));
  const conValorFijo = (texto: string) =>
    fijas
      .filter((f) => f.forma.test(texto))
      .map((f) => f.termino)
      .sort()
      .join(" · ");

  for (const c of todosLosCriterios(escala)) {
    const numero = Number(/\d+$/.exec(c.id)?.[0]);
    if (numero >= PRIMER_NUMERO_DE_EDICION) fallas.push(`${c.id} está en la matriz con un número de edición: la matriz numera por debajo de ${PRIMER_NUMERO_DE_EDICION}.`);
  }
  const bloques = new Map<number, string>();

  for (const ed of escala.ediciones) {
    const en = (s: string) => `[${ed.nombre}] ${s}`;
    if (!FORMA_DE_EDICION.test(ed.slug)) fallas.push(en(`su clave no es válida («${ed.slug}»).`));
    if (!ed.perfilHabitual) fallas.push(en("no dice su «Perfil habitual»."));
    if (ed.areas.length === 0) fallas.push(en("no cambia nada: no trae ninguna área."));
    if (ed.bloque !== null) {
      const otra = bloques.get(ed.bloque);
      if (otra) fallas.push(en(`numera sus criterios propios desde el ${ed.bloque}, igual que «${otra}»: cada edición tiene su bloque.`));
      bloques.set(ed.bloque, ed.nombre);
    }

    for (const a of ed.areas) {
      for (const d of a.dimensiones) {
        const general = generales.get(d.id)!;
        if (general.capa === "base" && d.nombre !== general.nombre) {
          fallas.push(en(`${d.id} es de base operativa y se llama «${general.nombre}» en toda la escala; la edición la llama «${d.nombre}».`));
        }
        const deLaMatriz = new Map(general.niveles.flatMap((n) => n.criterios.map((c) => [c.id, c.texto] as const)));

        for (const [id, texto] of Object.entries(d.textos)) {
          const original = deLaMatriz.get(id)!;
          if (texto === original) fallas.push(en(`${id} está reescrito con el mismo texto de la escala general: sobra.`));
          if (conValorFijo(texto) !== conValorFijo(original)) {
            fallas.push(
              en(
                `${id} cambia las palabras con valor fijo al reescribirlo (la matriz: «${conValorFijo(original) || "ninguna"}»; la edición: «${conValorFijo(texto) || "ninguna"}»). Si cambia lo que se pide, es un criterio propio.`,
              ),
            );
          }
        }

        const tocaCriterios = Object.keys(d.textos).length + d.propios.length + d.noAplican.length + d.seLeenIgual.length > 0;
        if (tocaCriterios) {
          for (const id of deLaMatriz.keys()) {
            const donde = [id in d.textos ? "reescrito" : null, d.noAplican.includes(id) ? "«No aplican»" : null, d.seLeenIgual.includes(id) ? "«Se leen igual»" : null].filter(
              (x): x is string => !!x,
            );
            if (donde.length === 0) {
              fallas.push(en(`${id} es de la matriz y la edición no dice nada de él: se reescribe, va en «No aplican» o va en «Se leen igual».`));
            } else if (donde.length > 1) {
              fallas.push(en(`${id} está ${donde.join(" y ")}: va en un solo lugar.`));
            }
          }
        }
      }
    }

    // Una edición puede hacer que una dimensión aplique donde en la general no aplica; al revés, no.
    const derivada = aplicarEdicion(escala, ed.slug);
    for (const perfil of PERFILES_COMPLETOS) {
      for (const a of derivada.areas) {
        for (const d of a.dimensiones) {
          if (dimensionAplica(generales.get(d.id)!, perfil) && !dimensionAplica(d, perfil)) {
            fallas.push(en(`${d.id} deja de aplicar a ${perfil.cierre}/${perfil.despues}: una edición no saca una dimensión.`));
          }
        }
      }
    }
  }
  return prueba("8 · Ediciones coherentes", fallas);
}

/** ¿La escala dice de algún criterio qué otros requiere? (de la matriz o propio de una edición). */
export function tieneRequeridos(escala: Escala): boolean {
  return [...todosLosCriterios(escala), ...criteriosPropios(escala).map((p) => p.criterio)].some((c) => (c.requiere?.length ?? 0) > 0);
}

/**
 * Los requeridos (desde la 8.3.0): un criterio dice cuáles otros necesita. Las reglas están en
 * `fallasDeRequeridos`; acá se corren sobre la escala general y sobre la vista por cada edición.
 *
 * En una edición, el enlace de un criterio de la matriz hacia uno que la edición sacó se cae solo
 * (no es una falla: la edición decidió que ahí no aplica). Lo que sí es una falla es que un criterio
 * PROPIO de la edición requiera algo que en ella no existe: eso lo escribió la edición.
 */
function requeridosCoherentes(escala: Escala): ResultadoDePrueba {
  const generales = fallasDeRequeridos(escala, PERFILES_COMPLETOS);
  const fallas = [...generales];
  for (const ed of escala.ediciones) {
    const derivada = aplicarEdicion(escala, ed.slug);
    const estan = new Set(todosLosCriterios(derivada).map((c) => c.id));
    for (const c of ed.areas.flatMap((a) => a.dimensiones.flatMap((d) => d.propios))) {
      for (const id of c.requiere ?? []) {
        if (!estan.has(id)) fallas.push(`[${ed.nombre}] ${c.id} requiere ${id}, que en esta edición no existe.`);
      }
    }
    // Lo que ya falla en la escala general no se repite por cada edición.
    fallas.push(
      ...fallasDeRequeridos(derivada, PERFILES_COMPLETOS)
        .filter((f) => !generales.includes(f))
        .map((f) => `[${ed.nombre}] ${f}`),
    );
  }
  return prueba("9 · Requeridos coherentes", fallas);
}

/** Corre todas. La versión se puede publicar si todas dan `ok`. */
export function validarEscala(escala: Escala, opts: OpcionesDeValidacion = {}): ResultadoDePrueba[] {
  return [
    estructura(escala),
    ningunNivelVacio(escala),
    sinIdentificadoresALaVista(escala),
    identificadoresEstables(escala, opts),
    documentosAlineados(escala, opts),
    ...(escala.ediciones.length ? [edicionesCoherentes(escala)] : []),
    ...(tieneRequeridos(escala) ? [requeridosCoherentes(escala)] : []),
  ];
}
