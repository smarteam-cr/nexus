/**
 * lib/exploraciones/lo-que-sabe-la-ia.ts — «LO QUE LA IA YA SABE, SIN QUE ELIJAS NADA», EN PALABRAS. PURO.
 *
 * La página de inicio de la exploración (diseño v13) muestra, en tarjetas, lo que la memoria ya le da a la IA sin que
 * nadie elija una reunión (lib/memoria › `queSabeLaIA`, mapeado en lib/exploraciones/pantalla.ts). Son CONTEOS, nunca
 * el contenido: el contenido lo ve cada documento con su alcance.
 *   · En un proyecto: la ficha del cliente, el handoff (y si está congelado) y las reuniones con minuta.
 *   · En una preventa: la ficha y el test de diagnóstico.
 */
import { fechaCorta, FRASE_DE_LA_VIA } from "@/lib/handoff/congelado";
import type { LoQueSabeLaIA } from "./servidor";

export interface TarjetaDeLoQueSabe {
  clave: "ficha" | "handoff" | "reuniones" | "test";
  titulo: string;
  valor: string;
  detalle: string | null;
}

/** Quién propuso cada dato de la ficha, como lo lee una persona. */
const DE_DONDE: Record<string, string> = {
  Preventa: "de la preventa",
  Handoff: "del handoff",
  Sesiones: "de las reuniones",
  Exploración: "de la exploración",
  "Actualizar con IA": "de «Actualizar con IA»",
  HubSpot: "de HubSpot",
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const conMayuscula = (t: string) => (t ? `${t[0].toUpperCase()}${t.slice(1)}` : t);

function tarjetaDeLaFicha(s: LoQueSabeLaIA): TarjetaDeLoQueSabe {
  const confirmados = s.ficha?.confirmados ?? 0;
  const propuestos = s.ficha?.propuestos ?? 0;
  const origenes = Object.entries(s.propuestosPorOrigen ?? {})
    .filter(([o, n]) => n > 0 && DE_DONDE[o])
    .sort((a, b) => b[1] - a[1])
    .map(([o, n]) => `${n} ${DE_DONDE[o]}`);
  const partes = [
    propuestos
      ? `${plural(propuestos, "propuesto sin revisar", "propuestos sin revisar")}${origenes.length ? ` (${origenes.join(", ")})` : ""}.`
      : "Nada propuesto sin revisar.",
    s.preventa ? `Suma lo aprendido en la preventa${s.preventa.archivada ? " (archivada)" : ""}.` : "",
  ].filter(Boolean);
  return {
    clave: "ficha",
    titulo: "Información del cliente",
    valor: confirmados ? plural(confirmados, "dato confirmado", "datos confirmados") : "Nada confirmado todavía",
    detalle: partes.join(" "),
  };
}

function tarjetaDelHandoff(s: LoQueSabeLaIA): TarjetaDeLoQueSabe {
  if (!s.handoff) return { clave: "handoff", titulo: "Handoff", valor: "Sin handoff todavía", detalle: null };
  if (s.handoffCongeladoAt) {
    const fecha = fechaCorta(s.handoffCongeladoAt);
    return {
      clave: "handoff",
      titulo: "Handoff",
      valor: fecha ? `Congelado el ${fecha}` : "Congelado",
      detalle: s.handoffVia ? `${conMayuscula(FRASE_DE_LA_VIA[s.handoffVia])}. Lo nuevo llega como sugerencias.` : "Lo nuevo llega como sugerencias.",
    };
  }
  return { clave: "handoff", titulo: "Handoff", valor: "Generado, sin congelar", detalle: "La IA lo puede volver a generar hasta que se congele." };
}

function tarjetaDeLasReuniones(s: LoQueSabeLaIA): TarjetaDeLoQueSabe {
  const n = s.reunionesConMinuta ?? 0;
  return {
    clave: "reuniones",
    titulo: "Reuniones del proyecto",
    valor: n ? `${n} con minuta` : "Ninguna con minuta todavía",
    detalle: n ? "Lo que dejaron ya lo lee la IA: no hace falta elegirlas." : null,
  };
}

function tarjetaDelTest(s: LoQueSabeLaIA): TarjetaDeLoQueSabe {
  return {
    clave: "test",
    titulo: "Test de diagnóstico",
    valor: s.test ? "Lo hizo" : "No lo hizo",
    detalle: s.test ? "La IA lo lee como una hipótesis, no como algo que confirmó el cliente." : null,
  };
}

/** Las tarjetas, en el orden en que se muestran. */
export function tarjetasDeLoQueSabeLaIA(s: LoQueSabeLaIA, opts: { enUnProyecto: boolean }): TarjetaDeLoQueSabe[] {
  return opts.enUnProyecto
    ? [tarjetaDeLaFicha(s), tarjetaDelHandoff(s), tarjetaDeLasReuniones(s)]
    : [tarjetaDeLaFicha(s), tarjetaDelTest(s)];
}
