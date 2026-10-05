/**
 * lib/para-ti/armar.ts — junta lo que midió cada fuente en la lista de «Para ti». PURO.
 *
 * Reglas de la lista (las mismas del diseño aprobado, 2026-10-04):
 * · Lo que dejó un agente va ARRIBA, una sola vez, aparte de los hechos (memoria: «IA arriba, una vez»).
 * · Lo demás se reparte por cuándo: «Para hoy», «Esta semana» y «Cuando puedas» (plegado).
 * · Dentro de cada bloque: lo que falló primero (rojo), después lo que más espera.
 * · Una fuente que no se pudo medir se nombra en `sinMedir`: callarla haría creer que está al día.
 */
import type { ParaTi, Pendiente, ResultadoDeFuente } from "./tipos";

function ordenar(items: readonly Pendiente[]): Pendiente[] {
  return [...items].sort((a, b) => {
    const e = Number(Boolean(b.error)) - Number(Boolean(a.error));
    if (e !== 0) return e;
    const da = a.desde ? Date.parse(a.desde) : Number.POSITIVE_INFINITY;
    const db = b.desde ? Date.parse(b.desde) : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.titulo.localeCompare(b.titulo, "es");
  });
}

export function armarParaTi(resultados: readonly ResultadoDeFuente[]): ParaTi {
  const vistos = new Set<string>();
  const todos: Pendiente[] = [];
  const alDia: string[] = [];
  const sinMedir: string[] = [];
  for (const r of resultados) {
    if (!r.ok) {
      sinMedir.push(r.alDia);
      continue;
    }
    if (r.items.length === 0) {
      alDia.push(r.alDia);
      continue;
    }
    for (const it of r.items) {
      if (vistos.has(it.clave)) continue;
      vistos.add(it.clave);
      todos.push(it);
    }
  }
  return {
    agente: ordenar(todos.filter((p) => p.delAgente)),
    hoy: ordenar(todos.filter((p) => !p.delAgente && p.cuando === "hoy")),
    semana: ordenar(todos.filter((p) => !p.delAgente && p.cuando === "semana")),
    luego: ordenar(todos.filter((p) => !p.delAgente && p.cuando === "luego")),
    alDia,
    sinMedir,
  };
}

/**
 * El número del menú: lo que pide atención HOY. Lo de esta semana y lo de «cuando puedas» no suman: un número que
 * nunca baja de 20 se deja de mirar.
 */
export function cuentaDelMenu(p: Pick<ParaTi, "agente" | "hoy">, avisosNuevos: number): number {
  return p.agente.length + p.hoy.length + avisosNuevos;
}

/** Lo que el latido del menú necesita de un aviso para decidir si notificarlo. */
export interface AvisoParaNotificar {
  id: string;
  /** ISO de cuándo se escribió el aviso. */
  creadoAt: string;
}

/**
 * ¿El latido del menú (components/para-ti/cuenta.ts) tiene que notificar `nuevo` por el sistema operativo?
 *
 * `previo` es el aviso MÁS NUEVO que esta pestaña ya vio (`undefined`: todavía no leyó nada, y la primera lectura solo
 * toma la foto; `null`: no había ninguno sin leer). Notifica solo un aviso escrito DESPUÉS de ése.
 *
 * ⚠ Hasta el 2026-10-05 se comparaba solo el id: si marcabas leído el más nuevo (en esta pestaña o en otra), el «sin
 * leer más nuevo» pasaba a ser uno VIEJO con otro id, y se notificaba como si acabara de llegar.
 */
export function debeNotificar(
  previo: AvisoParaNotificar | null | undefined,
  nuevo: AvisoParaNotificar | null,
): boolean {
  if (previo === undefined || !nuevo) return false;
  if (!previo) return true;
  if (nuevo.id === previo.id) return false;
  return Date.parse(nuevo.creadoAt) > Date.parse(previo.creadoAt);
}

/**
 * Lo que la pestaña recuerda después de una lectura: el más nuevo entre lo que ya vio y lo que llegó. Nunca retrocede
 * a uno más viejo (marcar leído no «des-ve» nada) ni se olvida porque ya no quede ninguno sin leer.
 */
export function elMasNuevo(
  previo: AvisoParaNotificar | null | undefined,
  nuevo: AvisoParaNotificar | null,
): AvisoParaNotificar | null {
  if (!previo) return nuevo ?? null;
  if (!nuevo) return previo;
  return Date.parse(nuevo.creadoAt) > Date.parse(previo.creadoAt) ? nuevo : previo;
}

/** Todo lo pendiente, en una lista (para contar en «Del equipo»). */
export function todosLosPendientes(p: ParaTi): Pendiente[] {
  return [...p.agente, ...p.hoy, ...p.semana, ...p.luego];
}

/** «Lo que más espera» de una persona: lo más viejo que tiene para hoy (o lo del agente), o null si está al día. */
export function loQueMasEspera(p: ParaTi): Pendiente | null {
  const urgentes = ordenar([...p.hoy, ...p.agente]);
  if (urgentes.length) return urgentes[0];
  return ordenar(p.semana)[0] ?? null;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);

/** «hace 5 días», «hoy», «ayer». Para el detalle de lo que espera. */
export function haceCuanto(desdeISO: string | null | undefined, ahora: Date): string | null {
  if (!desdeISO) return null;
  const ms = ahora.getTime() - Date.parse(desdeISO);
  if (Number.isNaN(ms)) return null;
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${plural(dias, "día", "días")}`;
}

export { plural };
