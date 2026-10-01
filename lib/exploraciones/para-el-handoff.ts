/**
 * lib/exploraciones/para-el-handoff.ts — la exploración de venta como contexto del handoff. PURO.
 *
 * Le dice al CSE dónde mirar: el nivel ESTIMADO de cada área y dimensión con de dónde salió, las
 * metas en cifras, lo que falta para Funcional, lo que se vendió. Va rotulado como lo que es —un
 * chequeo de la venta: «sirve para saber dónde mirar, no es evidencia»— y su diagnóstico no
 * cambia: lo arma completo, desde ahí.
 *
 * ⛔ Lo INTERNO (hipótesis, presupuesto, quién decide, lo que nadie exploró, el producto mostrado, la
 * apertura a la asesoría, el contexto y el siguiente paso) NO entra al bloque. El agente del handoff
 * escribe en una sola llamada también las secciones que leen los documentos del cliente (el kickoff,
 * el diagnóstico, la entrega, el cuestionario previo), y rotularlo «solo interno» era pedirle al modelo
 * que no se equivoque: la regla del repo es filtrar datos, no rogarle al modelo. Lo interno lo ve el
 * CSE en la columna «Exploración de venta» del contexto del proyecto (`internoParaElCse`), que es
 * pantalla interna. Sin ids de la escala: nombres.
 */
import type { ResultadoDelChequeo } from "@/lib/escala/chequeo";
import type { Letra } from "@/lib/escala/documento/tipos";
import {
  CASILLAS,
  ETIQUETA_DEL_ROL,
  type Apertura,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Reto,
  type SiguientePaso,
} from "./casillas";
import { ETIQUETA_DE_LA_FUENTE, type EstadoDeExploracion } from "./contenido";
import type { EscalaDelLienzo } from "./escala-del-lienzo";

/** Tope del bloque: es contexto, no la fuente principal del handoff (esa son las reuniones). */
export const TOPE_DEL_BLOQUE_DEL_HANDOFF = 7000;

const APERTURA: Record<Apertura["valor"], string> = { si: "sí", no: "no", no_se: "no se sabe" };

function valorComoTexto(clave: ClaveDeCasilla, v: unknown, nombreDim: (id: string) => string | null): string[] {
  switch (clave) {
    case "metas":
      return (v as Meta[]).map((m) => {
        const tramo = [m.actual && `de ${m.actual}`, m.objetivo && `a ${m.objetivo}`].filter(Boolean).join(" ");
        return `${m.que}${tramo ? `: ${tramo}` : ""}${m.para ? `, para ${m.para}` : ""}`;
      });
    case "retos":
      return (v as Reto[]).map((r) => `${r.texto}${r.dimensionId && nombreDim(r.dimensionId) ? ` (${nombreDim(r.dimensionId)})` : ""}`);
    case "autoridad":
      return (v as Persona[]).map((p) => `${p.nombre}${p.cargo ? `, ${p.cargo}` : ""} (${ETIQUETA_DEL_ROL[p.rol]})${p.nota ? ` — ${p.nota}` : ""}`);
    case "siguientePaso": {
      const s = v as SiguientePaso;
      return [`${s.que}${s.fecha ? ` (${s.fecha})` : ""}${s.conQuien ? `, con ${s.conQuien}` : ""}`];
    }
    case "apertura": {
      const a = v as Apertura;
      return [`${APERTURA[a.valor]}${a.porQue ? ` — ${a.porQue}` : ""}`];
    }
    default:
      return Array.isArray(v) ? (v as string[]) : [String(v)];
  }
}

export function bloqueParaElHandoff(o: { estado: EstadoDeExploracion; escala: EscalaDelLienzo; chequeo: ResultadoDelChequeo }): string {
  const { estado, escala, chequeo } = o;
  const c = estado.contenido;
  const nivel = (l: Letra | null) => (l ? (escala.niveles.find((n) => n.letra === l)?.nombre ?? l) : "sin estimar");
  const nombreDim = nombreDeDimension(escala);

  const partes: string[] = [
    "=== EXPLORACIÓN DE VENTA (ESTIMADO: sirve para saber dónde mirar, no es evidencia) ===",
    "La armó el vendedor con el prospecto antes del cierre. Todo lo de acá es ESTIMADO —un chequeo de la Escala hecho en la venta, con lo que se dijo en las reuniones—: úsalo para saber dónde mirar y qué preguntar, nunca como evidencia ni como un nivel medido. El diagnóstico del proyecto se arma completo, desde ahí.",
  ];
  const perfil = estado.perfilCierre && estado.perfilDespues ? ` · Perfil: venta ${estado.perfilCierre}, relación ${estado.perfilDespues}` : "";
  partes.push("", `Industria (edición de la escala): ${escala.edicion?.nombre ?? "escala general"}${perfil}.`);

  /* En orden de valor, porque el tope corta por el final: el nivel de cada área (una línea), las
     metas y lo demás, lo que falta y lo que se eligió; el detalle de cada dimensión, al último. */
  const medidas = chequeo.areas.filter((a) => a.dimensiones.some((d) => d.nivel));
  if (medidas.length) {
    partes.push(
      "",
      "## Nivel estimado de cada área",
      ...medidas.map(
        (a) =>
          `- ${a.nombre}: base operativa ${nivel(a.capas.base.nivel)}, producción ${nivel(a.capas.produccion.nivel)}${a.objetivo ? `; objetivo de la primera venta: ${nivel(a.objetivo)}` : ""}.`,
      ),
    );
    const r = chequeo.recomendacion;
    if (r?.tipo === "trabajar") {
      const area = chequeo.areas.find((x) => x.id === r.areaId);
      const dim = nombreDim(r.dimensionId);
      if (area && dim) partes.push(`Qué va primero según la exploración: ${dim}, en ${area.nombre}.`);
    }
  }

  // Solo lo que también podría ver el cliente: lo interno va a la columna del contexto, no al modelo.
  for (const def of CASILLAS) {
    if (!def.alCliente) continue;
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    const lineas = valorComoTexto(def.clave, v, nombreDim);
    if (lineas.length) partes.push("", `## ${def.etiqueta}`, ...lineas.map((l) => `- ${l}`));
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

  const casos = Object.values(c.casosDeUso);
  if (casos.length) {
    const nombreDeArea = (id: string | null) => (id ? (escala.areas.find((a) => a.id === id)?.nombre ?? null) : null);
    partes.push(
      "",
      "## Los casos de uso que se eligieron para la propuesta",
      ...casos.map(
        (k) => `- ${k.titulo}${nombreDeArea(k.areaId) ? ` (${nombreDeArea(k.areaId)})` : ""}${k.razon ? `: ${k.razon}` : ""}${k.descripcion ? ` Qué es: ${k.descripcion}` : ""}`,
      ),
    );
  }

  if (medidas.length) {
    partes.push("", "## El nivel de cada dimensión, y de dónde salió");
    for (const a of medidas) {
      for (const d of a.dimensiones) {
        if (!d.aplica || !d.nivel) continue;
        const e = c.chequeo[d.id];
        const fuente = e ? ETIQUETA_DE_LA_FUENTE[e.fuente] : null;
        partes.push(`- ${d.nombre} (${a.nombre}): ${nivel(d.nivel)}${fuente ? ` (${fuente}${e?.evidencia ? `: «${e.evidencia.slice(0, 160)}»` : ""})` : ""}`);
      }
    }
  }

  const texto = partes.join("\n");
  return texto.length > TOPE_DEL_BLOQUE_DEL_HANDOFF ? `${texto.slice(0, TOPE_DEL_BLOQUE_DEL_HANDOFF)}\n(…recortado)` : texto;
}

/**
 * Lo interno de la exploración, para el CSE en la columna del contexto del proyecto (pantalla
 * interna, nunca un documento ni un prompt): cada casilla que el cliente no ve, con lo que tiene.
 */
export function internoParaElCse(estado: EstadoDeExploracion, escala: EscalaDelLienzo): { etiqueta: string; lineas: string[] }[] {
  const nombreDim = nombreDeDimension(escala);
  return CASILLAS.filter((def) => !def.alCliente && estado.contenido.casillas[def.clave] !== undefined)
    .map((def) => ({ etiqueta: def.etiqueta, lineas: valorComoTexto(def.clave, estado.contenido.casillas[def.clave], nombreDim) }))
    .filter((x) => x.lineas.length > 0);
}

function nombreDeDimension(escala: EscalaDelLienzo): (id: string) => string | null {
  return (id) => {
    for (const a of escala.areas) {
      const d = a.dimensiones.find((x) => x.id === id);
      if (d) return d.nombre;
    }
    return null;
  };
}
