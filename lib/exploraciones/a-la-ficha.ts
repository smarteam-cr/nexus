/**
 * lib/exploraciones/a-la-ficha.ts — LO QUE SABE LA PREVENTA, A LA FICHA DEL CLIENTE, DESDE EL PRIMER DÍA. PURO.
 *
 * Hasta la memoria de la cuenta (etapa 3, 2026-10-10), lo aprendido en la venta llegaba a «Información del cliente»
 * solo desde una exploración de proyecto, y se perdía en el traspaso. Ahora la preventa lo propone (decisión de Elías,
 * DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»):
 *   · al PREPARAR, lo que la preparación propuso para estas casillas (la radiografía, su CRM, el porqué ahora…);
 *   · al CONFIRMAR una casilla en el lienzo, lo nuevo.
 * Sin IA: el mapa casilla → campo es fijo, y cada campo suma lo nuevo a lo que la ficha ya tenía (lo propuesto, o lo
 * confirmado), sin repetir lo que ya dice. Todo queda como PROPUESTA con origen «Preventa»: el CSE la confirma campo por
 * campo, y nada de esto llega a un documento del cliente hasta entonces.
 *
 * Lo interno queda marcado dos veces: en la fuente («interno de la preventa», `MARCA_DE_LO_INTERNO`) y en el campo
 * (`interno: true` → `PropuestaDeFicha.internoPorCampo`). La apertura, su porqué y el «por qué ahora» caen en campos
 * internos de la ficha; la radiografía y «quién decide», NO: van a «A qué se dedica» y a las personas, campos que ven
 * el cliente y el handoff. Por eso la marca va en el campo: mientras el CSE no lo confirme, ese campo propuesto no sale
 * del alcance interno de la memoria (lib/clients/ficha.ts › `fichaParaLaMemoria`). Confirmado, la postura igual se corta
 * en código para el cliente (`stakeholdersSinPostura`). Las metas van dentro de los retos: la ficha no acepta nada en
 * «Resultados que persigue»,
 * que sale de los resultados confirmados de cada proyecto. El presupuesto, las objeciones, la hipótesis de valor y la
 * escala no tienen campo: viven en la preventa y los lee la memoria interna (lib/exploraciones/para-la-memoria.ts).
 */
import { campoDeFicha, MARCA_DE_LO_INTERNO, OPCIONES_DE_APERTURA, valorVigente, type ClaveDeFicha, type FichaGuardada } from "@/lib/clients/ficha";
import {
  definicionDe,
  ETIQUETA_DEL_MODELO,
  ETIQUETA_DEL_ROL,
  type Apertura,
  type ClaveDeCasilla,
  type Meta,
  type Persona,
  type Radiografia,
  type Reto,
} from "./casillas";
import { sinFundamentoDelCliente, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";

/** El `origen` de esta puerta en la ficha (lib/clients/ficha.ts › ORIGENES_DE_LA_FICHA). */
export const ORIGEN_DE_LA_PREVENTA = "Preventa";

/** Casilla de la preventa → campo de la ficha. Las metas, a los retos (la ficha no las acepta en resultados). */
export const CASILLA_A_LA_FICHA = {
  radiografia: "aQueSeDedica",
  hubspotActual: "herramientasActuales",
  retos: "retosEstrategicos",
  metas: "retosEstrategicos",
  consecuencias: "dolorPrincipal",
  implicaciones: "dolorPrincipal",
  autoridad: "stakeholders",
  apertura: "aperturaAsesoria",
  detonante: "motivacionCompra",
} as const satisfies Partial<Record<ClaveDeCasilla, ClaveDeFicha>>;

export type CasillaParaLaFicha = keyof typeof CASILLA_A_LA_FICHA;

export const CASILLAS_PARA_LA_FICHA = Object.keys(CASILLA_A_LA_FICHA) as CasillaParaLaFicha[];

export function esCasillaParaLaFicha(clave: string): clave is CasillaParaLaFicha {
  return (CASILLAS_PARA_LA_FICHA as readonly string[]).includes(clave);
}

/** Un aporte a la ficha: el valor de una casilla (entero, o un ítem de una lista) y de dónde sale. */
export interface AporteALaFicha {
  casilla: CasillaParaLaFicha;
  valor: unknown;
  fuente: string;
}

/** La apertura de la preventa (sí / no / no sé) en la lista de la ficha. «No sé» no dice nada: no se propone. */
const APERTURA_EN_LA_FICHA: Record<string, string | null> = { si: "alta", no: "baja", no_se: null };

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const comoLista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : v && typeof v === "object" ? [v as T] : []);

/** Las líneas que un valor de casilla le suma a su campo, en el formato de la ficha («- » para las listas). */
export function lineasDeLaCasilla(casilla: CasillaParaLaFicha, valor: unknown): string[] {
  switch (casilla) {
    case "radiografia": {
      const r = (valor && typeof valor === "object" ? valor : {}) as Radiografia;
      const modelos = (r.modelos ?? []).map((m) => ETIQUETA_DEL_MODELO[m] ?? m).filter(Boolean);
      return [texto(r.resumen), texto(r.sector) && `Sector: ${texto(r.sector)}`, modelos.length ? `Modelo de negocio: ${modelos.join(", ")}` : ""].filter(Boolean);
    }
    case "hubspotActual":
    case "detonante":
      return texto(valor) ? [texto(valor)] : [];
    case "retos":
      return comoLista<Reto>(valor)
        .map((r) => texto(r?.texto))
        .filter(Boolean)
        .map((t) => `- ${t}`);
    case "metas":
      return comoLista<Meta>(valor)
        .map((m) => [texto(m?.que), texto(m?.actual) && `hoy: ${texto(m.actual)}`, texto(m?.objetivo) && `meta: ${texto(m.objetivo)}`, texto(m?.para) && `para: ${texto(m.para)}`].filter(Boolean).join(" · "))
        .filter(Boolean)
        .map((t) => `- Meta: ${t}`);
    case "consecuencias":
    case "implicaciones": {
      const prefijo = casilla === "consecuencias" ? "Si no actúa" : "Si lo logra";
      const lista = typeof valor === "string" ? [valor] : Array.isArray(valor) ? valor : [];
      return lista
        .map(texto)
        .filter(Boolean)
        .map((t) => `- ${prefijo}: ${t}`);
    }
    case "autoridad":
      // Las cuatro partes siempre: nombre — cargo — papel — postura («sin dato» en la que falta). Con menos, el recorte
      // para el cliente deja solo el nombre (no sabe qué parte falta); con las cuatro, nombre, cargo y papel.
      return comoLista<Persona>(valor)
        .filter((p) => texto(p?.nombre))
        .map((p) => {
          const papel = ETIQUETA_DEL_ROL[p.rol] ?? "papel sin confirmar";
          const partes = [texto(p.nombre), texto(p.cargo) || "cargo sin confirmar", papel, texto(p.nota) || "sin dato"];
          return `- ${partes.join(" — ")}`;
        });
    case "apertura": {
      const a = (valor && typeof valor === "object" ? valor : {}) as Apertura;
      const v = APERTURA_EN_LA_FICHA[a.valor];
      return v ? [v] : [];
    }
  }
}

/** Para comparar si una línea ya está dicha: sin tildes, sin viñetas, en minúscula y con un espacio. */
function normal(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * LO QUE VA A LA PROPUESTA DE LA FICHA: por campo, lo que la ficha ya tiene (lo propuesto si hay, si no lo confirmado)
 * más las líneas nuevas que todavía no dice, con sus fuentes. Lo listo para `fusionarPropuesta` (que además descarta lo
 * que quedaría igual). La apertura reemplaza (es una lista), y su porqué va a «Por qué esa apertura».
 */
export function propuestaParaLaFicha(
  ficha: FichaGuardada,
  aportes: readonly AporteALaFicha[],
): { clave: ClaveDeFicha; valor: string; fuentes: string[]; interno: boolean }[] {
  const porCampo = new Map<ClaveDeFicha, { lineas: string[]; fuentes: Set<string>; interno: boolean }>();
  const sumar = (clave: ClaveDeFicha, lineas: readonly string[], fuente: string, interno: boolean) => {
    if (!lineas.length) return;
    const actual = porCampo.get(clave) ?? { lineas: [], fuentes: new Set<string>(), interno: false };
    actual.lineas.push(...lineas);
    actual.fuentes.add(fuente);
    // Una casilla interna marca el campo entero: sus líneas quedan mezcladas con las demás.
    if (interno) actual.interno = true;
    porCampo.set(clave, actual);
  };
  for (const a of aportes) {
    if (!esCasillaParaLaFicha(a.casilla)) continue;
    const interno = !definicionDe(a.casilla).alCliente;
    sumar(CASILLA_A_LA_FICHA[a.casilla], lineasDeLaCasilla(a.casilla, a.valor), a.fuente, interno);
    if (a.casilla === "apertura") {
      const porQue = texto((a.valor as Apertura | null)?.porQue);
      if (porQue) sumar("porQueApertura", [porQue], a.fuente, interno);
    }
  }

  const out: { clave: ClaveDeFicha; valor: string; fuentes: string[]; interno: boolean }[] = [];
  for (const [clave, { lineas, fuentes, interno }] of porCampo) {
    const vigente = valorVigente(ficha, clave).trim();
    if (campoDeFicha(clave).destino.tipo === "lista") {
      const valor = lineas[lineas.length - 1];
      if (OPCIONES_DE_APERTURA.some((o) => o.valor === valor) && valor !== vigente) out.push({ clave, valor, fuentes: [...fuentes], interno });
      continue;
    }
    const dicho = normal(vigente);
    const nuevas: string[] = [];
    for (const l of lineas) {
      const n = normal(l);
      if (!n || dicho.includes(n) || nuevas.some((x) => normal(x) === n)) continue;
      nuevas.push(l);
    }
    if (!nuevas.length) continue;
    out.push({ clave, valor: [vigente, ...nuevas].filter(Boolean).join("\n"), fuentes: [...fuentes], interno });
  }
  return out;
}

/** La fuente de un aporte, como la ve el CSE debajo de la propuesta. Empieza con «Preventa ·»: así la reconoce la ficha. */
export function fuenteDeLaPreventa(casilla: CasillaParaLaFicha, momento: "preparacion" | "confirmado"): string {
  const d = definicionDe(casilla);
  const de = momento === "preparacion" ? `Preventa · Preparación · ${d.etiqueta}` : `Preventa · Lo que se confirmó · ${d.etiqueta}`;
  const marcas = [casilla === "radiografia" ? "investigación en internet" : "", d.alCliente ? "" : MARCA_DE_LO_INTERNO].filter(Boolean);
  return marcas.length ? `${de} (${marcas.join("; ")})` : de;
}

/**
 * Lo que la PREPARACIÓN propuso para estas casillas: lo de esta corrida, sin lo que el vendedor ya descartó y sin lo que
 * la regla «sin una pista del cliente no hay casilla del marco» deja afuera.
 */
export function aportesDeLaPreparacion(items: readonly ItemPropuesto[], descartadas: readonly string[]): AporteALaFicha[] {
  const lapidas = new Set(descartadas);
  const out: AporteALaFicha[] = [];
  for (const it of items) {
    if (it.destino.tipo !== "casilla" || !esCasillaParaLaFicha(it.destino.clave)) continue;
    if (lapidas.has(it.id) || sinFundamentoDelCliente(it)) continue;
    out.push({ casilla: it.destino.clave, valor: it.valor, fuente: fuenteDeLaPreventa(it.destino.clave, "preparacion") });
  }
  return out;
}

/** Lo que se acaba de CONFIRMAR en el lienzo para estas casillas: lo que está ahora y no estaba antes. */
export function loNuevoParaLaFicha(antes: EstadoDeExploracion, despues: EstadoDeExploracion): AporteALaFicha[] {
  const out: AporteALaFicha[] = [];
  for (const casilla of CASILLAS_PARA_LA_FICHA) {
    const a = antes.contenido.casillas[casilla] as unknown;
    const d = despues.contenido.casillas[casilla] as unknown;
    if (d === undefined || d === null) continue;
    const fuente = fuenteDeLaPreventa(casilla, "confirmado");
    if (Array.isArray(d)) {
      const ya = new Set((Array.isArray(a) ? a : []).map((x) => JSON.stringify(x)));
      for (const item of d) if (!ya.has(JSON.stringify(item))) out.push({ casilla, valor: item, fuente });
    } else if (JSON.stringify(a ?? null) !== JSON.stringify(d)) {
      out.push({ casilla, valor: d, fuente });
    }
  }
  return out;
}
