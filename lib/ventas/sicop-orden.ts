/**
 * lib/ventas/sicop-orden.ts — QUÉ SE VE Y EN QUÉ ORDEN, en el tablero de licitaciones.
 *
 * PURO y CLIENT-SAFE: sin Prisma, sin HubSpot, sin el SDK de Claude. Existe separado del
 * lector (`sicop.ts`, que sí toca la red y la base) porque la pantalla lo necesita como
 * VALOR: los filtros y el orden se resuelven en el navegador, sin ir al servidor por cada
 * clic. Y porque así se puede probar entero — que es donde vive el riesgo real de este
 * módulo: una licitación que el filtro esconde por error no se ve, y no verse es
 * exactamente lo mismo que no existir.
 *
 * ⛔ El orden NO está decidido en el código: los cinco criterios son opciones de pantalla
 * (decisión de Elías, 2026-08-23). Acá vive el CÓMO ordena cada uno, no cuál gana.
 */

// ── Vocabulario cerrado ────────────────────────────────────────────────────────

/** ¿Esto es para nosotros? El veredicto de la lectura de IA. */
export type EncajeSicop = "DENTRO" | "DUDOSO" | "FUERA";

/**
 * Las categorías de servicio, transcritas de lo que el CRM ya declara (`tipo_de_proyecto` y
 * `tipo_de_servicio_activo` de HubSpot) más lo que aparece de verdad en el pipeline de
 * Gobiernos (hosting y licencias, que el CRM no tiene como tipo pero se licita seguido).
 * Vocabulario CERRADO: si la IA pudiera inventar categorías, el filtro se llenaría de
 * sinónimos ("web", "sitio", "página") y dejaría de agrupar nada.
 */
export const CATEGORIAS_SICOP = [
  { key: "sitio-web", label: "Sitio web" },
  { key: "hosting", label: "Hosting y mantenimiento" },
  { key: "crm", label: "CRM" },
  { key: "integracion", label: "Integración / API" },
  { key: "marketing", label: "Marketing y pauta" },
  { key: "estrategia", label: "Estrategia y consultoría" },
  { key: "soporte", label: "Soporte y mesa de ayuda" },
  { key: "licencias", label: "Licencias" },
  { key: "otro", label: "Otro" },
] as const;

export type CategoriaSicop = (typeof CATEGORIAS_SICOP)[number]["key"];

export const CATEGORIAS_VALIDAS: readonly string[] = CATEGORIAS_SICOP.map((c) => c.key);

export function labelDeCategoria(key: string): string {
  return CATEGORIAS_SICOP.find((c) => c.key === key)?.label ?? key;
}

// ── La lectura de IA ───────────────────────────────────────────────────────────

/** Algo del cartel que nos deja afuera (BLOQUEA) o nos complica (RIESGO). */
export interface BloqueanteSicop {
  titulo: string;
  detalle: string | null;
  severidad: "BLOQUEA" | "RIESGO";
}

/** Una fecha del proceso: aclaraciones, apertura, plazo de ejecución. */
export interface PlazoSicop {
  etiqueta: string;
  /** ISO `YYYY-MM-DD`, o null cuando el cartel da un plazo relativo ("30 días hábiles"). */
  fecha: string | null;
  nota: string | null;
}

/** Lo que la IA entendió leyendo el título, la descripción y TODAS las notas del ticket. */
export interface LecturaSicop {
  objeto: string | null;
  institucion: string | null;
  categorias: string[];
  encaje: EncajeSicop;
  encajeRazon: string | null;
  /** 0-100. Cuánto se parece a lo que Smarteam vende. */
  puntajeEncaje: number | null;
  /** 0-100. Cuánto se parece a algo que PODEMOS ganar (requisitos + criterio de evaluación). */
  probabilidad: number | null;
  probabilidadRazon: string | null;
  bloqueantes: BloqueanteSicop[];
  evaluacion: string | null;
  /** % del puntaje que se lleva el precio. 100 = subasta pura. null = el cartel no lo dice. */
  pesoPrecio: number | null;
  entregables: string | null;
  plazos: PlazoSicop[];
  monto: number | null;
  moneda: "CRC" | "USD" | null;
  /** 0-100. Cuánta información REAL había para leer — no cuán segura suena la conclusión. */
  confianza: number | null;
  /** Notas CON TEXTO que se leyeron. 0 = la ficha salió del título pelado. */
  notasLeidas: number;
  /**
   * Archivos del ticket que nadie leyó: el cartel en PDF. Es la explicación honesta de por
   * qué una ficha salió pobre — «no había información» y «la información está en un PDF que
   * el modelo no vio» se ven igual en pantalla si no se dice cuál de las dos es.
   */
  adjuntosSinLeer: number;
  /** La fuente se recortó por tamaño: hay texto que el modelo no vio. */
  fuenteTruncada: boolean;
  analizadoEl: string | null;
  modelo: string | null;
  /** El análisis falló; se guarda el motivo para que la pantalla no mienta con "sin analizar". */
  error: string | null;
}

// ── La fila del tablero ────────────────────────────────────────────────────────

export interface EtapaDeLaFila {
  id: string;
  label: string;
  orden: number;
  cerrada: boolean;
}

/**
 * Una licitación lista para pintar: el ticket + su etapa + la lectura de IA. Autosuficiente
 * a propósito (no extiende el tipo del lector): así este módulo no importa nada y la
 * pantalla lo puede consumir sin arrastrar Prisma al bundle del navegador.
 */
export interface FilaSicop {
  id: string;
  asunto: string;
  detalle: string | null;
  procedimiento: string | null;
  tipoContratacion: string | null;
  formatoEvaluacion: string | null;
  fechaAclaraciones: string | null;
  motivoPerdida: string | null;
  responsable: string | null;
  creadaEl: string | null;
  actualizadaEl: string | null;
  /** El número crudo de `presupuesto__sicop_`. Sucio: conviven monedas y magnitudes. */
  presupuestoCrm: number | null;
  etapa: EtapaDeLaFila;
  lectura: LecturaSicop | null;
  /**
   * El ticket se tocó DESPUÉS de leerlo. Es una señal barata y honesta, no un veredicto:
   * mover la tarjeta de etapa también la enciende, y eso no cambia una coma de lo que hay
   * para interpretar. Quien decide de verdad si hay que releer es la corrida, comparando la
   * huella del texto (`fuenteSha`) — así que apretar «Analizar» con esto encendido no gasta
   * nada si las notas no cambiaron. Por eso la pantalla dice "se movió", no "está vencido".
   */
  movidoDespues: boolean;
}

// ── Orden ──────────────────────────────────────────────────────────────────────

export type OrdenSicop = "etapa" | "encaje" | "probabilidad" | "monto" | "cierre";

export const ORDENES_SICOP: readonly { key: OrdenSicop; label: string; ayuda: string }[] = [
  { key: "etapa", label: "Etapa", ayuda: "El proceso tal como va en HubSpot, agrupado por etapa." },
  { key: "encaje", label: "Encaje", ayuda: "Primero lo que más se parece a lo que vendemos." },
  { key: "probabilidad", label: "Probabilidad", ayuda: "Primero donde cumplimos los requisitos y la evaluación no es solo precio." },
  { key: "monto", label: "Monto", ayuda: "Primero la plata más grande. Los colones se pasan a dólares SOLO para comparar." },
  { key: "cierre", label: "Cierre", ayuda: "Primero lo que vence antes." },
] as const;

/**
 * ⚠ SOLO PARA ORDENAR, nunca para reportar. Comparar un monto en colones con uno en dólares
 * exige una tasa, y la tasa buena vive en `TipoCambioMes` (mensual, la que usa Cobranza).
 * Traerla acá obligaría a que este módulo tocara la base y dejaría de ser client-safe, para
 * mover una licitación uno o dos puestos en una lista. Se declara la aproximación en vez de
 * esconderla: si algún día este número se suma o se factura, esto está mal y hay que ir a
 * la tabla.
 */
export const COLONES_POR_DOLAR_APROX = 505;

/** El monto en una sola unidad comparable (USD). `null` = la IA no pudo leer un monto. */
export function montoComparable(fila: FilaSicop): number | null {
  const m = fila.lectura?.monto ?? null;
  if (m == null) return null;
  if (fila.lectura?.moneda === "CRC") return m / COLONES_POR_DOLAR_APROX;
  // Sin moneda declarada se asume dólares: es la unidad de la casa y no inventa magnitud.
  return m;
}

/**
 * La fecha que de verdad aprieta: el plazo FUTURO más cercano de los que leyó la IA, y si no
 * hay ninguno, la fecha de recepción de aclaraciones del CRM.
 *
 * ⚠ Los plazos ya vencidos NO cuentan. Un cartel de 2022 con "apertura 2022-03-01" ordenado
 * como "lo que vence antes" pondría la licitación más muerta del pipeline en el primer
 * puesto — que es exactamente lo contrario de para qué se ordena por cierre.
 */
export function fechaLimiteDe(fila: FilaSicop, hoy: Date): string | null {
  const corte = hoy.getTime();
  const candidatas: string[] = [];
  for (const p of fila.lectura?.plazos ?? []) if (p.fecha) candidatas.push(p.fecha);
  if (fila.fechaAclaraciones) candidatas.push(fila.fechaAclaraciones.slice(0, 10));

  const futuras = candidatas
    .map((f) => ({ f, t: new Date(`${f}T12:00:00Z`).getTime() }))
    .filter((x) => Number.isFinite(x.t) && x.t >= corte)
    .sort((a, b) => a.t - b.t);
  return futuras[0]?.f ?? null;
}

const RANGO_ENCAJE: Record<EncajeSicop, number> = { DENTRO: 2, DUDOSO: 1, FUERA: 0 };

/**
 * Ordena una lista PLANA por el criterio elegido.
 *
 * Regla común a los cuatro criterios planos: **lo que no tiene el dato va al final**, nunca
 * al principio. Un `null` que ordena como 0 se ve idéntico a "lo peor de la lista", y un
 * `null` que ordena como infinito tapa lo que sí se midió. Al final se lee por lo que es:
 * "de esto todavía no sabemos".
 */
export function ordenarLicitaciones(
  filas: readonly FilaSicop[],
  orden: OrdenSicop,
  hoy: Date,
): FilaSicop[] {
  const out = [...filas];
  const desempate = (a: FilaSicop, b: FilaSicop) =>
    (b.actualizadaEl ?? "").localeCompare(a.actualizadaEl ?? "");

  if (orden === "etapa") {
    return out.sort((a, b) => a.etapa.orden - b.etapa.orden || desempate(a, b));
  }

  if (orden === "encaje") {
    return out.sort((a, b) => {
      const ra = a.lectura ? RANGO_ENCAJE[a.lectura.encaje] : -1;
      const rb = b.lectura ? RANGO_ENCAJE[b.lectura.encaje] : -1;
      if (ra !== rb) return rb - ra;
      const pa = a.lectura?.puntajeEncaje ?? -1;
      const pb = b.lectura?.puntajeEncaje ?? -1;
      return pb - pa || desempate(a, b);
    });
  }

  if (orden === "probabilidad") {
    return out.sort((a, b) => {
      const pa = a.lectura?.probabilidad ?? -1;
      const pb = b.lectura?.probabilidad ?? -1;
      return pb - pa || desempate(a, b);
    });
  }

  if (orden === "monto") {
    return out.sort((a, b) => {
      const ma = montoComparable(a);
      const mb = montoComparable(b);
      if (ma == null && mb == null) return desempate(a, b);
      if (ma == null) return 1;
      if (mb == null) return -1;
      return mb - ma || desempate(a, b);
    });
  }

  // cierre
  return out.sort((a, b) => {
    const fa = fechaLimiteDe(a, hoy);
    const fb = fechaLimiteDe(b, hoy);
    if (!fa && !fb) return desempate(a, b);
    if (!fa) return 1;
    if (!fb) return -1;
    return fa.localeCompare(fb) || desempate(a, b);
  });
}

// ── Filtros ────────────────────────────────────────────────────────────────────

export interface FiltroSicop {
  /** Busca en asunto, procedimiento, objeto e institución. */
  texto: string;
  categorias: readonly string[];
  encajes: readonly EncajeSicop[];
  etapas: readonly string[];
  /** Esconde las que están en una etapa que CIERRA (Perdido, Inicio de proyecto). */
  soloEnJuego: boolean;
  /** Muestra también las que la IA marcó FUERA de alcance. */
  verDescartadas: boolean;
}

export const FILTRO_VACIO: FiltroSicop = {
  texto: "",
  categorias: [],
  encajes: [],
  etapas: [],
  // Las dos por default: 41 de las 45 licitaciones de hoy están cerradas o fuera de
  // alcance. Sin estos dos cortes, cualquier orden que no sea "etapa" arranca mostrando
  // el cementerio.
  soloEnJuego: true,
  verDescartadas: false,
};

/** Misma receta que `lib/utils/matching.ts`: sin tildes y en minúsculas. */
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filtrarLicitaciones(
  filas: readonly FilaSicop[],
  filtro: FiltroSicop,
): FilaSicop[] {
  const texto = normalizar(filtro.texto.trim());
  return filas.filter((f) => {
    if (filtro.soloEnJuego && f.etapa.cerrada) return false;

    /* ⚠ El descarte solo aplica a lo que la IA LEYÓ. Una licitación sin análisis no está
       descartada: está sin mirar, y esconderla sería el peor error posible de esta pantalla
       —perder una oportunidad real por un trabajo que todavía no se hizo—. */
    if (!filtro.verDescartadas && f.lectura?.encaje === "FUERA") return false;

    if (filtro.encajes.length > 0) {
      if (!f.lectura || !filtro.encajes.includes(f.lectura.encaje)) return false;
    }

    if (filtro.etapas.length > 0 && !filtro.etapas.includes(f.etapa.id)) return false;

    if (filtro.categorias.length > 0) {
      const suyas = f.lectura?.categorias ?? [];
      if (!suyas.some((c) => filtro.categorias.includes(c))) return false;
    }

    if (texto) {
      const heno = normalizar(
        [f.asunto, f.procedimiento, f.lectura?.objeto, f.lectura?.institucion, f.detalle]
          .filter(Boolean)
          .join(" · "),
      );
      if (!heno.includes(texto)) return false;
    }

    return true;
  });
}

/** Cuántas quedaron fuera por cada corte — la pantalla lo dice en vez de esconderlo. */
export interface ConteoOculto {
  porCerrada: number;
  porDescartada: number;
}

/**
 * Lo que los dos cortes "silenciosos" están escondiendo AHORA MISMO.
 *
 * Existe porque un filtro encendido por default que no se anuncia es una mentira cómoda:
 * la lista se ve corta y limpia, y nadie se pregunta qué falta.
 */
export function contarOcultas(
  filas: readonly FilaSicop[],
  filtro: FiltroSicop,
): ConteoOculto {
  let porCerrada = 0;
  let porDescartada = 0;
  for (const f of filas) {
    if (filtro.soloEnJuego && f.etapa.cerrada) {
      porCerrada++;
      continue;
    }
    if (!filtro.verDescartadas && f.lectura?.encaje === "FUERA") porDescartada++;
  }
  return { porCerrada, porDescartada };
}
