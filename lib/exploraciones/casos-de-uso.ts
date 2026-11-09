/**
 * lib/exploraciones/casos-de-uso.ts — lo que lee el agente para proponer casos de uso. PURO.
 *
 * El modo «casos» propone casos de uso del catálogo de Smarteam (o propios) a partir de dónde parece
 * estar cada equipo en la escala (lo confirmado y, donde no hay, las hipótesis), lo que le falta para
 * Funcional y lo que contó el cliente. Desde el 2026-11-08 cada caso se arma con la biblioteca de
 * actividades (lib/casos-de-uso/armado.ts) y lleva un argumento de valor para el vendedor, que lee
 * además `loQueSeSabeParaElValor` (interno: nunca llega a la propuesta).
 *
 * ⛔ Solo entra lo que PUEDE ver el cliente (las casillas `alCliente`): lo que el agente propone acá
 * termina en la propuesta. Las hipótesis sobre personas, el presupuesto, quién decide, lo no
 * explorado y la apertura a la asesoría se quedan afuera.
 */
import type { Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS, type Meta, type Reto } from "./casillas";
import type { CasoDeUsoElegido, EstadoDeExploracion, ItemPropuesto } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import { casosParaElArea, type AreaParaElCamino, type CasoEnElCamino } from "@/lib/casos-de-uso/camino";
import { MAX_CASOS_EN_EL_ORDEN, type CandidatoAlOrden } from "@/lib/casos-de-uso/orden";
import { capaDelCaso, casosQueNoCalzanConSuCrm, conexionesEnLaLista, laCasa, loQueTieneDeHubspot, type CasaDelArea, type SuHubspot } from "@/lib/casos-de-uso/capas";
import { chequeoDelMapa, loQueLaFrena, posicionesDelMapa, type PosicionEnElMapa } from "./mapa";
import { PREFIJO_DE_LO_QUE_SABES } from "./lo-que-sabes";

// ── La casa (2026-11-09, lib/casos-de-uso/capas.ts) ─────────────────────────────────────────────────

/** Lo que se sabe de su HubSpot: «Su CRM actualmente» y, si no dice, «Lo que ya sabemos». */
export function suHubspotDe(estado: EstadoDeExploracion): SuHubspot {
  const c = estado.contenido;
  const crm = c.casillas.hubspotActual;
  const otros = [c.contexto?.sabemos ?? "", ...Object.entries(c.notas).flatMap(([k, v]) => (k.startsWith(PREFIJO_DE_LO_QUE_SABES) ? [v] : []))];
  return loQueTieneDeHubspot({ crmActual: typeof crm === "string" ? crm : null, otros });
}

/** La casa de cada área en juego: su nivel en el mapa de la escala (el mismo que ve la pantalla) y su HubSpot. */
export function casaDeLaExploracion(
  estado: EstadoDeExploracion,
  escala: Pick<EscalaDelLienzo, "areas">,
  chequeo: Pick<ResultadoDelChequeo, "areas">,
): { hubspot: SuHubspot; casa: CasaDelArea[] } {
  const hubspot = suHubspotDe(estado);
  const areas = escala.areas
    .filter((a) => estado.areas.includes(a.id))
    .map((a) => ({ id: a.id, nombre: a.nombre, nivel: chequeo.areas.find((x) => x.id === a.id)?.nivel ?? null }));
  return { hubspot, casa: laCasa(areas, hubspot) };
}

/**
 * Qué hace la empresa, para que el título se arme con su negocio (Marco, 2026-11-09: «… de tus servicios SaaS»): lo de la
 * empresa misma en la radiografía (qué hace, su sector y su modelo), sin la conexión ni los hitos. Va aparte de
 * `exploracionParaLosCasos` para no cambiar la huella de lo que lee el agente (novedades-de-los-casos.ts).
 */
export function negocioParaLosCasos(estado: EstadoDeExploracion): string {
  const r = estado.contenido.casillas.radiografia;
  return [r?.resumen, r?.sector ? `Sector: ${r.sector}.` : "", r?.modelos?.length ? `Modelo: ${r.modelos.join(", ")}.` : ""].filter(Boolean).join(" ");
}

/** Con las posiciones de hoy (para el agente, que no tiene el mapa armado). */
export function casaConLoPendiente(estado: EstadoDeExploracion, escala: EscalaDelLienzo, pendientes: readonly ItemPropuesto[]) {
  return casaDeLaExploracion(estado, escala, chequeoDelMapa(escala, estado.areas, posicionesDelMapa(estado, pendientes)));
}

export function exploracionParaLosCasos(estado: EstadoDeExploracion, escala: EscalaDelLienzo, pendientes: readonly ItemPropuesto[]): string {
  const c = estado.contenido;
  const nivel = (l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  const posiciones = posicionesDelMapa(estado, pendientes);
  const chequeo = chequeoDelMapa(escala, estado.areas, posiciones);
  const partes: string[] = ["## Dónde parece estar cada equipo (estimado; lo marcado «hipótesis» todavía no lo confirmó el cliente)"];

  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    const calculo = chequeo.areas.find((x) => x.id === a.id);
    partes.push("", `### ${a.nombre}${calculo?.nivel ? `: parece estar en ${nivel(calculo.nivel)}` : ""}`);
    for (const d of a.dimensiones) {
      if (!d.aplica) continue;
      const p = posiciones[d.id];
      partes.push(
        p
          ? `- ${d.nombre}: ${nivel(p.nivel)} (${p.clase === "evidencia" ? "con evidencia" : "hipótesis"})${p.porQue ? ` — ${p.porQue}` : ""}`
          : `- ${d.nombre}: sin dato`,
      );
    }
    const frena = calculo ? loQueLaFrena(calculo) : null;
    if (frena) {
      const nombres = frena.dimensiones.map((id) => a.dimensiones.find((d) => d.id === id)?.nombre).filter(Boolean);
      partes.push(`Lo que lo deja en ${nivel(frena.nivel)}: ${nombres.join(", ")}.`);
    }
    if (calculo?.objetivo) partes.push(`Objetivo de la primera venta: ${nivel(calculo.objetivo)}.`);
  }
  const r = chequeo.recomendacion;
  if (r?.tipo === "trabajar") {
    const area = escala.areas.find((a) => a.id === r.areaId);
    const dim = area?.dimensiones.find((d) => d.id === r.dimensionId);
    if (area && dim) partes.push("", `Qué va primero: ${dim.nombre}, en ${area.nombre}.`);
  }

  // Lo que le falta para Funcional: los criterios que NO tiene, por su texto.
  const faltas: string[] = [];
  for (const a of escala.areas) {
    if (!estado.areas.includes(a.id)) continue;
    for (const d of a.dimensiones) {
      const no = d.funcional.filter((cr) => c.falta[cr.id]?.estado === "no_tiene").map((cr) => cr.texto);
      if (no.length) faltas.push(`- ${d.nombre} (${a.nombre}): ${no.join("; ")}`);
    }
  }
  if (faltas.length) partes.push("", "## Lo que le falta para Funcional (según lo que se habló)", ...faltas);

  // Solo lo que puede ver el cliente.
  for (const def of CASILLAS) {
    if (!def.alCliente) continue;
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    const lineas =
      def.tipo === "metas"
        ? (v as Meta[]).map((m) => `- ${m.que}${[m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`, m.para && `para ${m.para}`].filter(Boolean).map((x) => ` ${x}`).join("")}`)
        : def.tipo === "retos"
          ? (v as Reto[]).map((x) => `- ${x.texto}`)
          : Array.isArray(v)
            ? (v as string[]).map((x) => `- ${x}`)
            : typeof v === "string"
              ? [v]
              : [];
    if (lineas.length) partes.push("", `## ${def.etiqueta}`, ...lineas);
  }
  return partes.join("\n");
}

/**
 * Lo que se sabe de la empresa para el argumento de valor de cada caso (2026-11-08, lib/casos-de-uso/armado.ts): lo que
 * dijo cada reunión leída, los hallazgos, «Lo que ya sabemos» (retos, resultado, qué pasa si no hacen nada) y lo que
 * respondió el vendedor. Es INTERNO: el agente lo usa solo en el argumento de valor, que nunca llega a la propuesta.
 * Una cifra del argumento vale solo si aparece aquí o en la exploración (`validarValorDelAgente`).
 */
export function loQueSeSabeParaElValor(estado: EstadoDeExploracion): string {
  const p = estado.propuesta;
  const c = estado.contenido;
  const partes: string[] = [];
  const lecturas = Object.values(p.lecturas)
    .filter((l) => l.resumen)
    .sort((a, b) => (a.fecha ?? a.en).localeCompare(b.fecha ?? b.en))
    .slice(-8);
  if (lecturas.length) partes.push("## Lo que dijo cada reunión", ...lecturas.map((l) => `- ${l.etiqueta}: ${l.resumen}`));
  if (p.hallazgos?.lista.length) partes.push("", "## Lo más importante que se sabe", ...p.hallazgos.lista.map((h) => `- ${h}`));
  const tarjetas = c.contexto?.tarjetas ?? {};
  const deLoQueSabemos = (["retos", "resultado", "siNada", "plazos"] as const).flatMap((k) => (tarjetas[k]?.texto ? [`- ${k === "siNada" ? "Si no hacen nada" : k === "resultado" ? "Resultado que buscan" : k === "retos" ? "Retos" : "Plazos"}: ${tarjetas[k]!.texto} (${tarjetas[k]!.fuente})`] : []));
  if (c.contexto?.sabemos) deLoQueSabemos.push(`- ${c.contexto.sabemos}`);
  if (deLoQueSabemos.length) partes.push("", "## Lo que ya sabemos", ...deLoQueSabemos);
  const respuestas = (c.respuestasParaLaGuia ?? []).slice(-6);
  if (respuestas.length) partes.push("", "## Lo que respondió el vendedor", ...respuestas.map((r) => `- ${r.pregunta} → ${r.respuesta}`));
  return partes.join("\n").slice(0, 12000);
}

// ── La lista entera del paso (décima vuelta, 2026-11-08) ────────────────────────────────────────────

/** Un caso de la biblioteca que sugiere la escala para un área (sin IA: sale del mapa y del catálogo). */
export interface CasoPorLaEscala extends CasoEnElCamino {
  area: { id: string; nombre: string };
}

/**
 * Ficha B (2026-10-17): los casos de la biblioteca que mueven a cada área en juego desde donde parece estar hoy, los que
 * destraban lo que la frena primero (lib/casos-de-uso/camino.ts). Antes vivía en la pantalla; desde la décima vuelta la
 * usa también el agente que ordena la lista, así que los dos ven los mismos.
 */
export function casosPorLaEscala(o: {
  escala: Pick<EscalaDelLienzo, "areas">;
  areas: readonly string[];
  mapa: { posiciones: Readonly<Record<string, PosicionEnElMapa>>; chequeo: ResultadoDelChequeo };
  /** Los ids del catálogo (sin `cat-`) que ya están en la lista: elegidos o sugeridos por el agente. */
  excluir: ReadonlySet<string>;
  nombreDeNivel?: (l: Letra) => string;
}): CasoPorLaEscala[] {
  return o.escala.areas
    .filter((a) => o.areas.includes(a.id))
    .flatMap((a) => {
      const calculo = o.mapa.chequeo.areas.find((x) => x.id === a.id);
      if (!calculo?.nivel) return [];
      const paraElCamino: AreaParaElCamino = {
        id: a.id,
        nombre: a.nombre,
        nivel: calculo.nivel,
        objetivo: calculo.objetivo,
        frena: loQueLaFrena(calculo),
        capas: {
          base: { nombre: "", nivel: calculo.capas.base.nivel },
          produccion: { nombre: "", nivel: calculo.capas.produccion.nivel },
        },
        dimensiones: calculo.dimensiones.map((d) => ({ id: d.id, nombre: d.nombre, aplica: d.aplica, nivel: d.nivel, clase: o.mapa.posiciones[d.id]?.clase ?? null })),
      };
      return casosParaElArea(paraElCamino, { excluir: o.excluir, nombreDeNivel: o.nombreDeNivel }).map((c) => ({ ...c, area: { id: a.id, nombre: a.nombre } }));
    });
}

/**
 * Todos los casos del paso para el agente que ordena: los elegidos, los sugeridos por el agente (los de antes y los de
 * esta vuelta) y los de la biblioteca que sugiere la escala. Un caso de la escala que ya está elegido o sugerido no se
 * repite (la pantalla tampoco lo muestra dos veces).
 */
export function candidatosAlOrden(estado: EstadoDeExploracion, escala: EscalaDelLienzo, pendientes: readonly ItemPropuesto[], nuevos: readonly ItemPropuesto[]): CandidatoAlOrden[] {
  const areaDe = (id: string | null | undefined) => escala.areas.find((a) => a.id === id)?.nombre ?? null;
  const fuera: CandidatoAlOrden[] = [];
  const vistos = new Set<string>();
  const sumar = (c: CandidatoAlOrden) => {
    if (vistos.has(c.id)) return;
    vistos.add(c.id);
    fuera.push(c);
  };
  for (const [id, c] of Object.entries(estado.contenido.casosDeUso)) {
    sumar({ id, titulo: c.titulo, origen: "elegido", area: areaDe(c.areaId), queResuelve: c.paraVentas?.porQue || c.razon || "" });
  }
  for (const it of [...pendientes, ...nuevos]) {
    if (it.destino.tipo !== "casoDeUso") continue;
    const c = it.valor as CasoDeUsoElegido;
    sumar({ id: it.destino.useCaseId, titulo: c.titulo, origen: "agente", area: areaDe(c.areaId), queResuelve: c.paraVentas?.porQue || c.razon || it.razon || "" });
  }
  // 2026-11-09 (capas.ts): tampoco lo que no calza con su CRM de hoy (reactivar un HubSpot que no tiene).
  const excluir = new Set([...[...vistos].filter((id) => id.startsWith("cat-")).map((id) => id.slice(4)), ...casosQueNoCalzanConSuCrm(suHubspotDe(estado))]);
  const posiciones = posicionesDelMapa(estado, pendientes);
  const mapa = { posiciones, chequeo: chequeoDelMapa(escala, estado.areas, posiciones) };
  const nombreDeNivel = (l: Letra) => escala.niveles.find((n) => n.letra === l)?.nombre ?? l;
  for (const c of casosPorLaEscala({ escala, areas: estado.areas, mapa, excluir, nombreDeNivel })) {
    sumar({ id: `cat-${c.caso.id}`, titulo: c.caso.titulo, origen: "escala", area: c.area.nombre, queResuelve: `${c.caso.promesa} ${c.razon}`.trim() });
  }
  // 2026-11-09 (capas.ts): la capa de cada uno y en cuáles de la lista se apoya o a cuáles alimenta.
  const lista = fuera.slice(0, MAX_CASOS_EN_EL_ORDEN);
  const ids = new Set(lista.map((c) => c.id));
  const delCaso = (id: string): CasoDeUsoElegido | undefined =>
    (estado.contenido.casosDeUso[id] ??
      [...pendientes, ...nuevos].find((it) => it.destino.tipo === "casoDeUso" && it.destino.useCaseId === id)?.valor) as CasoDeUsoElegido | undefined;
  return lista.map((c) => {
    const caso = delCaso(c.id);
    const conexiones = conexionesEnLaLista(c.id, caso?.conexiones, ids).map(({ con, tipo }) => ({ con, tipo }));
    return { ...c, capa: capaDelCaso(c.id, caso?.capa), ...(conexiones.length ? { conexiones } : {}) };
  });
}
