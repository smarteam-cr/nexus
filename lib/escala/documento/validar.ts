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
 * Las pruebas 2 y 3 son del CÁLCULO: no se copian acá, las corre el mismo `pruebas_escala.py`
 * que llega con cada versión (`scripts/publicar-escala.ts` lo ejecuta). Así el cálculo tiene una
 * sola fuente, la que escribe el dueño de la escala.
 */
import { leerEncabezado, leerRetirados, todosLosCriterios } from "./parsear";
import { aplica, CIERRES, DESPUES, type Perfil } from "./perfil";
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

  const criterios = todosLosCriterios(escala);
  const deRiesgo = new Set(criterios.filter((c) => c.riesgo).map((c) => c.id));
  for (const id of deRiesgo) if (!escala.riesgos[id]) fallas.push(`el criterio de riesgo ${id} no tiene mensaje en la tabla «Riesgos».`);
  for (const id of Object.keys(escala.riesgos)) {
    if (!deRiesgo.has(id)) fallas.push(`la tabla «Riesgos» nombra ${id}, que no es un criterio de riesgo.`);
  }
  return prueba("Estructura", fallas);
}

function ningunNivelVacio(escala: Escala): ResultadoDePrueba {
  const vacios: string[] = [];
  for (const perfil of PERFILES_COMPLETOS) {
    for (const d of escala.areas.flatMap((a) => a.dimensiones)) {
      const decision = (letra: string) =>
        d.niveles.find((n) => n.letra === letra)?.criterios.filter((c) => !c.riesgo && aplica(c, perfil)) ?? [];
      if (decision("F").length === 0) continue; // la dimensión no aplica a ese perfil
      for (const letra of LETRAS_CON_RESULTADO) {
        if (decision(letra).length === 0) vacios.push(`${d.id} ${letra} (${perfil.cierre}/${perfil.despues})`);
      }
    }
  }
  return prueba("1 · Ningún nivel vacío", vacios);
}

function sinIdentificadoresALaVista(escala: Escala): ResultadoDePrueba {
  const areas = escala.areas.map((a) => a.id).join("|");
  const dims = [...new Set(escala.areas.flatMap((a) => a.dimensiones.map((d) => d.id.split(".")[1])))].join("|");
  const cita = new RegExp(`\\b(${areas})\\.(${dims})\\b`);
  const fugas: string[] = [];
  const revisar = (donde: string, texto: string | null) => {
    if (texto && cita.test(texto)) fugas.push(`${donde}: ${texto.slice(0, 80)}`);
  };
  for (const a of escala.areas) {
    for (const d of a.dimensiones) {
      revisar(`costo de ${d.id}`, d.costoDeQuedarse);
      revisar(`descripción de ${d.id}`, d.descripcion);
      for (const n of d.niveles) {
        revisar(n.id, n.descripcion);
        revisar(`resultado de ${n.id}`, n.resultado);
        for (const c of n.criterios) revisar(c.id, c.texto);
      }
    }
  }
  for (const [id, mensaje] of Object.entries(escala.riesgos)) revisar(`mensaje de ${id}`, mensaje);
  return prueba("4 · Sin identificadores a la vista", fugas);
}

/** Todos los identificadores: dimensiones, niveles y criterios. */
function identificadores(escala: Escala): string[] {
  return escala.areas.flatMap((a) =>
    a.dimensiones.flatMap((d) => [d.id, ...d.niveles.flatMap((n) => [n.id, ...n.criterios.map((c) => c.id)])]),
  );
}

function identificadoresEstables(escala: Escala, opts: OpcionesDeValidacion): ResultadoDePrueba {
  const fallas: string[] = [];
  const ids = todosLosCriterios(escala).map((c) => c.id);
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

/** Corre todas. La versión se puede publicar si todas dan `ok`. */
export function validarEscala(escala: Escala, opts: OpcionesDeValidacion = {}): ResultadoDePrueba[] {
  return [
    estructura(escala),
    ningunNivelVacio(escala),
    sinIdentificadoresALaVista(escala),
    identificadoresEstables(escala, opts),
    documentosAlineados(escala, opts),
  ];
}
