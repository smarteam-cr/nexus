/**
 * lib/exploraciones/para-el-handoff.ts — la exploración de venta como contexto del handoff. PURO.
 *
 * Le dice al CSE dónde mirar: el nivel ESTIMADO de cada área y dimensión con de dónde salió, las
 * metas en cifras, lo que falta para Funcional, lo que se vendió. Va rotulado como lo que es —un
 * chequeo de la venta: «sirve para saber dónde mirar, no es evidencia»— y su diagnóstico no
 * cambia: lo arma completo, desde ahí.
 *
 * Lo INTERNO (hipótesis, presupuesto, quién decide, lo que nadie exploró, el producto mostrado, la
 * apertura a la asesoría) va aparte, rotulado «SOLO INTERNO», con el destino escrito: «Riesgos y
 * banderas rojas» o «¿Por qué vendimos?». Esas secciones del handoff no las lee ningún documento del
 * cliente (lib/canvas/handoff-al-cliente.test.ts). Sin ids de la escala: nombres.
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
  const nombreDim = (id: string) => {
    for (const a of escala.areas) {
      const d = a.dimensiones.find((x) => x.id === id);
      if (d) return d.nombre;
    }
    return null;
  };

  const partes: string[] = [
    "=== EXPLORACIÓN DE VENTA (ESTIMADO: sirve para saber dónde mirar, no es evidencia) ===",
    "La armó el vendedor con el prospecto antes del cierre. Todo lo de acá es ESTIMADO —un chequeo de la Escala hecho en la venta, con lo que se dijo en las reuniones—: úsalo para saber dónde mirar y qué preguntar, nunca como evidencia ni como un nivel medido. El diagnóstico del proyecto se arma completo, desde ahí.",
    "Lo marcado «SOLO INTERNO» va a «Riesgos y banderas rojas» o a «¿Por qué vendimos?»: nunca a una sección que lea el cliente.",
  ];
  const perfil = estado.perfilCierre && estado.perfilDespues ? ` · Perfil: venta ${estado.perfilCierre}, relación ${estado.perfilDespues}` : "";
  partes.push("", `Industria (edición de la escala): ${escala.edicion?.nombre ?? "escala general"}${perfil}.`);

  // El nivel estimado de cada área y de cada dimensión, con de dónde salió.
  const medidas = chequeo.areas.filter((a) => a.dimensiones.some((d) => d.nivel));
  if (medidas.length) {
    partes.push("", "## Nivel estimado por área y dimensión (con de dónde salió)");
    for (const a of medidas) {
      partes.push(
        `- ${a.nombre}: base operativa ${nivel(a.capas.base.nivel)}, producción ${nivel(a.capas.produccion.nivel)}${a.objetivo ? `; objetivo de la primera venta: ${nivel(a.objetivo)}` : ""}.`,
      );
      for (const d of a.dimensiones) {
        if (!d.aplica || !d.nivel) continue;
        const e = c.chequeo[d.id];
        const fuente = e ? ETIQUETA_DE_LA_FUENTE[e.fuente] : null;
        partes.push(`  · ${d.nombre}: ${nivel(d.nivel)}${fuente ? ` (${fuente}${e?.evidencia ? `: «${e.evidencia.slice(0, 160)}»` : ""})` : ""}`);
      }
    }
    const r = chequeo.recomendacion;
    if (r?.tipo === "trabajar") {
      const area = chequeo.areas.find((x) => x.id === r.areaId);
      const dim = nombreDim(r.dimensionId);
      if (area && dim) partes.push(`Qué va primero según la exploración: ${dim}, en ${area.nombre}.`);
    }
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

  const internas: string[] = [];
  for (const def of CASILLAS) {
    const v = c.casillas[def.clave];
    if (v === undefined) continue;
    const lineas = valorComoTexto(def.clave, v, nombreDim);
    if (lineas.length === 0) continue;
    if (def.alHandoff === "interno") internas.push(`- ${def.etiqueta}: ${lineas.join(" | ")}`);
    else partes.push("", `## ${def.etiqueta}`, ...lineas.map((l) => `- ${l}`));
  }

  const casos = Object.values(c.casosDeUso);
  if (casos.length) {
    const nombreDeArea = (id: string | null) => (id ? (escala.areas.find((a) => a.id === id)?.nombre ?? null) : null);
    partes.push(
      "",
      "## Los casos de uso que se eligieron para la propuesta",
      ...casos.map((k) => `- ${k.titulo}${nombreDeArea(k.areaId) ? ` (${nombreDeArea(k.areaId)})` : ""}${k.razon ? `: ${k.razon}` : ""}`),
    );
  }

  if (internas.length) partes.push("", "## SOLO INTERNO (va a «Riesgos y banderas rojas» o a «¿Por qué vendimos?»)", ...internas);

  const texto = partes.join("\n");
  return texto.length > TOPE_DEL_BLOQUE_DEL_HANDOFF ? `${texto.slice(0, TOPE_DEL_BLOQUE_DEL_HANDOFF)}\n(…recortado)` : texto;
}
