/**
 * lib/exploraciones/validar-la-escala.ts — QUÉ FALTA VALIDAR del Diagnóstico de rendimiento, y quién lo validó. PURO y
 * client-safe.
 *
 * 26 nov (Elías): la pantalla interna no se explica. Quien la abre sabe que Nexus la precargó y que le toca validarla, así
 * que la pantalla dice qué falta validar. Un solo vocabulario para cada parte (dimensión) de la escala:
 *   · lo que propuso Nexus y nadie usó todavía va SIN rótulo (`propuesta`);
 *   · «✓ validado» cuando alguien lo usó (`validada`: está en lo confirmado, `contenido.chequeo`);
 *   · «sin dato» cuando nadie lo dijo (`sinDato`).
 * El trazo del radar (aro lleno = lo dijo el cliente, punteado = lo dedujo Nexus) sigue diciendo de dónde sale: eso es la
 * clase (`evidencia` / `hipotesis`) y no cambia acá.
 *
 * Una parte confirmada con algo nuevo encima (lo que dijo el cliente sobre una hipótesis ya usada: `porRevisar`) vuelve a
 * estar por validar. Lo mismo que «Validar (N)» recorre una por una y lo que «Usar todas» usa: `paraValidar`.
 *
 * Quién validó (26 nov, sin SQL): lo confirmado guarda `validada: { por, en }` cuando una persona lo usa o marca el nivel
 * (contenido.ts › `conQuienLaValido`). Lo confirmado antes de eso no lo tiene: cuenta como validado, sin nombre.
 */
import type { EstimadoGuardado, ItemPropuesto } from "./contenido";
import { diaCorto } from "./fechas";
import type { PosicionEnElMapa } from "./mapa";

export type EstadoDeLaParte = "propuesta" | "validada" | "sinDato";

/** El estado de una parte con lo que dibuja el mapa. */
export function estadoDeLaParte(p: Pick<PosicionEnElMapa, "origen" | "porRevisar"> | undefined | null): EstadoDeLaParte {
  if (!p) return "sinDato";
  return p.origen === "propuesto" || p.porRevisar ? "propuesta" : "validada";
}

/** El rótulo de una parte, en el vocabulario de la pantalla: lo propuesto va sin rótulo. */
export function rotuloDeLaParte(e: EstadoDeLaParte): string | null {
  return e === "validada" ? "✓ validado" : e === "sinDato" ? "sin dato" : null;
}

interface AreaParaValidar {
  id: string;
  dimensiones: readonly { id: string; aplica: boolean }[];
}

/**
 * Las partes que cuentan: las que aplican de las áreas en juego y de las que tienen algo (las mismas que se resumen debajo
 * de la página: `areasDelResumen`), en el orden de la escala.
 */
export function partesQueCuentan(areas: readonly AreaParaValidar[], enJuego: readonly string[], posiciones: Readonly<Record<string, PosicionEnElMapa>>): string[] {
  return areas
    .filter((a) => enJuego.includes(a.id) || a.dimensiones.some((d) => d.aplica && posiciones[d.id]))
    .flatMap((a) => a.dimensiones.filter((d) => d.aplica).map((d) => d.id));
}

/**
 * Lo que hay que validar, en orden: cada parte con algo propuesto (por la escala, área por área) y después lo demás que
 * Nexus propuso en esta pieza (áreas, qué explorar a fondo, con qué se mide). `revisablesDeLaEscala`: lo pendiente de la
 * pieza que no es una hipótesis de nivel (las hipótesis salen del mapa, como en el radar).
 */
export function paraValidar(o: {
  partes: readonly string[];
  posiciones: Readonly<Record<string, PosicionEnElMapa>>;
  revisablesDeLaEscala: readonly ItemPropuesto[];
}): ItemPropuesto[] {
  const vistos = new Set<string>();
  const out: ItemPropuesto[] = [];
  const sumar = (it: ItemPropuesto | null | undefined) => {
    if (!it || vistos.has(it.id)) return;
    vistos.add(it.id);
    out.push(it);
  };
  // Las partes, en el orden de la escala: la hipótesis que se dibuja (nadie la usó) o lo nuevo con evidencia encima.
  for (const id of o.partes) {
    const p = o.posiciones[id];
    if (estadoDeLaParte(p) === "propuesta") sumar(p?.pendiente);
  }
  // Lo demás de la pieza (y un nivel de una parte que no cuenta, si lo hubiera), sin repetir.
  for (const it of o.revisablesDeLaEscala) sumar(it);
  return out;
}

export interface QuienValido {
  /** El correo de quien validó (null: no quedó registrado, o lo hizo un script). */
  por: string | null;
  en: string;
}

export interface CuentaDeLaValidacion {
  /** Partes con algo propuesto por Nexus que nadie validó. */
  porValidar: number;
  validadas: number;
  sinDato: number;
  /** Las partes que tienen algo: validadas + por validar («Faltan 4 de 12»). */
  conAlgo: number;
  /** Lo demás que propuso Nexus en esta pieza y no es el nivel de una parte. */
  otras: number;
  /** Quiénes validaron (sin repetir, el más reciente primero) y la última vez. Sin registro, vacío. */
  quienes: string[];
  ultima: string | null;
}

export function cuentaDeLaValidacion(o: {
  partes: readonly string[];
  posiciones: Readonly<Record<string, PosicionEnElMapa>>;
  /** Lo confirmado (`contenido.chequeo`): de ahí sale quién validó cada parte. */
  confirmado: Readonly<Record<string, Pick<EstimadoGuardado, "validada">>>;
  pendientes: readonly ItemPropuesto[];
}): CuentaDeLaValidacion {
  let porValidar = 0;
  let validadas = 0;
  let sinDato = 0;
  const marcas: QuienValido[] = [];
  for (const id of o.partes) {
    const e = estadoDeLaParte(o.posiciones[id]);
    if (e === "propuesta") porValidar++;
    else if (e === "sinDato") sinDato++;
    else {
      validadas++;
      const v = o.confirmado[id]?.validada;
      if (v?.en && !Number.isNaN(Date.parse(v.en))) marcas.push(v);
    }
  }
  const partes = new Set(o.partes);
  const otras = o.pendientes.filter((it) => !(it.destino.tipo === "nivel" && partes.has(it.destino.dimensionId))).length;
  marcas.sort((a, b) => Date.parse(b.en) - Date.parse(a.en));
  const quienes = [...new Set(marcas.map((m) => m.por).filter((x): x is string => !!x))];
  return { porValidar, validadas, sinDato, conAlgo: porValidar + validadas, otras, quienes, ultima: marcas[0]?.en ?? null };
}

/** «marco.perez@smarteam…» → «Marco»; el tuyo, «ti». */
export function nombreDeQuienValido(correo: string, miCorreo?: string | null): string {
  if (miCorreo && correo.toLowerCase() === miCorreo.toLowerCase()) return "ti";
  const local = correo.split("@")[0] ?? correo;
  const primero = local.split(/[._-]+/).find(Boolean) ?? local;
  return primero.charAt(0).toUpperCase() + primero.slice(1);
}

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * La línea de arriba del diagnóstico: «Faltan 4 de 12 por validar», o «Validado por Marco · 26 nov» cuando no falta nada.
 * null: todavía no hay nada (ni propuesto ni validado).
 */
export function lineaDeLaValidacion(c: CuentaDeLaValidacion, miCorreo?: string | null): { texto: string; completa: boolean } | null {
  const pendientes = c.porValidar + c.otras;
  if (!c.conAlgo && !c.otras) return null;
  if (pendientes > 0) {
    const otras = c.otras ? `${c.otras} ${c.otras === 1 ? "cambio más" : "cambios más"}` : "";
    if (!c.porValidar) return { texto: `Falta validar ${c.otras} ${c.otras === 1 ? "cambio" : "cambios"}`, completa: false };
    return {
      texto: `Faltan ${c.porValidar} de ${c.conAlgo} por validar${otras ? ` · ${otras}` : ""}`,
      completa: false,
    };
  }
  const sinDato = c.sinDato ? ` · ${c.sinDato} sin dato` : "";
  if (!c.quienes.length) return { texto: `Validado${c.ultima ? ` · ${diaCorto(c.ultima)}` : ""}${sinDato}`, completa: true };
  const nombres = [...new Set(c.quienes.slice(0, 3).map((q) => nombreDeQuienValido(q, miCorreo)))];
  const mas = c.quienes.length > 3 ? ` y ${c.quienes.length - 3} más` : "";
  return { texto: `Validado por ${enLista(nombres)}${mas}${c.ultima ? ` · ${diaCorto(c.ultima)}` : ""}${sinDato}`, completa: true };
}

/** Lo que dice la fila del diagnóstico en el menú de la izquierda: cuántas faltan, o ✓ cuando no falta ninguna. */
export function marcaDelRiel(c: CuentaDeLaValidacion): { corto: string; largo: string; estado: "pendiente" | "generada" | "vacia" } {
  const n = c.porValidar + c.otras;
  if (n > 0) {
    const partes = c.porValidar ? `${c.porValidar} ${c.porValidar === 1 ? "parte" : "partes"}` : "";
    const otras = c.otras ? `${c.otras} ${c.otras === 1 ? "cambio" : "cambios"}` : "";
    return { corto: String(n), largo: `${[partes, otras].filter(Boolean).join(" y ")} por validar`, estado: "pendiente" };
  }
  if (c.validadas > 0) return { corto: "✓", largo: c.sinDato ? `Todo validado · ${c.sinDato} sin dato` : "Todo validado", estado: "generada" };
  return { corto: "", largo: "Todavía sin nada", estado: "vacia" };
}

// ── «Actualizar con Nexus»: un solo botón de la IA, que hace cumplir el orden ─────────────────────────────────────────

export type AccionDeNexus = "ubicar" | "resumen" | "esperar";

/**
 * Qué hace «Actualizar con Nexus» (26 nov; reemplaza a «Ubicar con las reuniones», «Volver a ubicar», «Actualizar»,
 * «Armar el Resumen con IA» y «Rehacer con IA» del Resumen). El orden que antes se le pedía a la persona por escrito
 * (ubicar → validar lo propuesto → rehacer el Resumen) lo hace cumplir la pantalla:
 *   1. Nexus ya está ubicando o escribiendo el Resumen: espera.
 *   2. Hay algo que la escala no leyó (reuniones, notas del equipo, una reunión que cambió de clase): ubica.
 *   3. Queda algo por validar: el Resumen no se ofrece (contaría los niveles de antes); el botón vuelve a ubicar, sin
 *      destacarse («Validar (N)» es lo que sigue).
 *   4. No queda nada por validar y el Resumen falta, quedó atrás de la escala o de lo que se contó, o su corrida se
 *      detuvo: lo arma o lo rehace.
 *   5. Todo al día: vuelve a ubicar, sin destacarse.
 * Nada se confirma ni se publica solo: ubicar propone, y el Resumen no sale al cliente hasta «Publicar».
 */
export function queHaceActualizar(o: {
  /** La línea de la ubicación (`lineaDeLaEscala`): su estado y si su botón era el destacado. */
  linea: { estado: "ubicando" | "sinReuniones" | "sinUbicar" | "nuevas" | "resumenAtrasado" | "alDia"; boton: { fuerte: boolean } };
  /** Lo que falta validar: partes y otros cambios (`porValidar + otras`). */
  porValidar: number;
  validadas: number;
  resumen: {
    hay: boolean;
    corriendo: boolean;
    /** Se detuvo sin terminar (no late): se puede volver a pedir. */
    detenida: boolean;
    /** La escala o lo contado cambió después de armarlo, o está en un formato viejo. */
    atrasado: boolean;
  };
}): { accion: AccionDeNexus; fuerte: boolean; queHace: string } {
  if (o.linea.estado === "ubicando") return { accion: "esperar", fuerte: false, queHace: "Nexus está ubicando la escala" };
  if (o.resumen.corriendo) return { accion: "esperar", fuerte: false, queHace: o.resumen.hay ? "Nexus está rehaciendo el Resumen" : "Nexus está armando el Resumen" };
  const hayQueLeer = o.linea.estado === "sinUbicar" || o.linea.estado === "nuevas" || (o.linea.estado === "resumenAtrasado" && o.linea.boton.fuerte);
  if (hayQueLeer) return { accion: "ubicar", fuerte: o.porValidar === 0, queHace: "Ubica la escala con lo nuevo" };
  if (o.porValidar > 0) return { accion: "ubicar", fuerte: false, queHace: "Vuelve a ubicar la escala" };
  if (o.resumen.detenida) return { accion: "resumen", fuerte: true, queHace: o.resumen.hay ? "Rehace el Resumen" : "Arma el Resumen" };
  if (!o.resumen.hay && o.validadas > 0) return { accion: "resumen", fuerte: true, queHace: "Arma el Resumen" };
  if (o.resumen.hay && (o.resumen.atrasado || o.linea.estado === "resumenAtrasado")) return { accion: "resumen", fuerte: true, queHace: "Rehace el Resumen" };
  return { accion: "ubicar", fuerte: false, queHace: "Vuelve a ubicar la escala" };
}

/**
 * ¿Alguien validó una parte después de armar el Resumen? Entonces el Resumen cuenta los niveles de antes. Lo usa
 * «Actualizar con Nexus» cuando la página (que trae la firma del servidor) no está a la vista.
 */
export function validadoDespues(confirmado: Readonly<Record<string, Pick<EstimadoGuardado, "validada">>>, resumenEn: string | null): boolean {
  if (!resumenEn) return false;
  const desde = Date.parse(resumenEn);
  return Object.values(confirmado).some((e) => !!e.validada?.en && Date.parse(e.validada.en) > desde);
}

/** Cuántas partes de un área (las que aplican) están validadas, por validar o sin dato. */
export function validacionDelArea(
  dimensiones: readonly { id: string; aplica: boolean }[],
  posiciones: Readonly<Record<string, PosicionEnElMapa>>,
): { validadas: number; porValidar: number; sinDato: number } {
  const c = { validadas: 0, porValidar: 0, sinDato: 0 };
  for (const d of dimensiones) {
    if (!d.aplica) continue;
    const e = estadoDeLaParte(posiciones[d.id]);
    if (e === "validada") c.validadas++;
    else if (e === "propuesta") c.porValidar++;
    else c.sinDato++;
  }
  return c;
}

/** «8 validadas · 2 por validar · 1 sin dato» (con `de`, «8 de 11 validadas…»): una sola redacción para lo interno. */
export function fraseDeLaValidacion(c: { validadas: number; porValidar: number; sinDato: number }, de?: number): string {
  const validadas = `${c.validadas}${de !== undefined ? ` de ${de}` : ""} ${c.validadas === 1 && de === undefined ? "validada" : "validadas"}`;
  return [validadas, c.porValidar ? `${c.porValidar} por validar` : null, c.sinDato ? `${c.sinDato} sin dato` : null].filter(Boolean).join(" · ");
}
