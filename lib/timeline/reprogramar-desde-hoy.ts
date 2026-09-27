/**
 * lib/timeline/reprogramar-desde-hoy.ts — M4 (2026-09-27): LO ATRASADO SE REPROGRAMA DESDE HOY, CALCULADO POR EL CÓDIGO.
 *
 * Puro y client-safe. Lo llama un solo lugar: `marcarTareasEnCurso` (borrador-del-detalle.ts), al marcar el paso 2 de
 * «Regenerar todo», en sus dos ramas (el borrador del paso 1 y el vacío), ANTES de que el agente de tareas lea la
 * estructura: así el paso 2 ve las fases ya reprogramadas y sus tareas nuevas caen desde hoy (D4). Sus cambios no pasan
 * por el armador del paso 1 (propuesta-de-estructura.ts), que los rechazaría: los decide el SISTEMA, no la IA (D9).
 * Revierte la decisión del 23-09 («un atraso no alarga la fase») solo para el sistema; la IA sigue sin proponerlo.
 *
 * ── QUÉ HACE CON CADA FASE (D1, D5) ──────────────────────────────────────────
 *  · Semana 0, hechas, suspendidas y casi terminadas (≤ `casiTerminada.maxAbiertas` abiertas y ≥ `minHecho` hecho):
 *    quietas. Lo que quedó sin hacer se nombra (`sinHacer`), no se mueve.
 *  · Atrasada (su ventana cerró y sigue abierta), SIN EMPEZAR: se mueve entera, con su duración. En el orden del plan
 *    (lo que decidió Elías el 27-09) arranca cuando termina lo que le falta a sus antecesoras y nunca antes de hoy; con
 *    «todo-desde-hoy» (implementado, apagado en el interruptor) arranca hoy.
 *  · Atrasada y EMPEZADA: su inicio NO se mueve (se llevaría lo hecho al futuro). Se estira, y sus abiertas movibles se
 *    corren Δ = hoy − (inicio + p), con p = la primera semana abierta (acotada a `duración − 1`); la duración nueva es
 *    `(hoy − inicio) + max(1, duración − p)`. Lo empezado no espera a sus antecesoras: ya está en marcha.
 *  · Una contigua ya empezada que se correría de rebote queda FIJA donde está hoy (el pin, sin casilla).
 *  · En el orden del plan, una sin empezar y no atrasada cuya antecesora ahora termina después se corre detrás de ella.
 *  · Las contiguas sin avance se corren de rebote, sin casilla. Las fases nuevas de la IA no se tocan.
 *  · Una tarea con fecha fijada a mano, o que ya tiene un cambio en el borrador (el del chat), no se corre.
 *
 * ── LO QUE NUNCA HACE ─────────────────────────────────────────────────────────
 * Nada con avance cambia de estado ni de semana: una tarea hecha o suspendida nunca cambia de semana absoluta, con
 * cualquier combinación de casillas (lo prueba reprogramar-desde-hoy.test.ts, también sobre cronogramas al azar). No toca
 * el arranque del proyecto (lo lee cobranza) ni el cierre fijado a mano. No lee el interruptor: la política llega como
 * entrada y viaja guardada en `Borrador.hoy.politica` (D11).
 *
 * ── LA VUELTA ATRÁS ───────────────────────────────────────────────────────────
 * `conLaReprogramacion` la escribe sobre el JSON guardado y `sinReprogramacion` la quita (restaura lo de la IA que
 * reemplazó): un reintento del paso 2 en otra semana se recalcula desde lo vivo más lo de la IA, nunca encima de lo
 * reprogramado.
 */
import {
  acotarSemana,
  claveDeCampo,
  claveDeTareaQueCambia,
  estructuraHipotetica,
  fotoDeTarea,
  type Borrador,
  type CambioDeLaIAReemplazado,
  type CambioFaseCambia,
  type CambioTareaCambia,
  type CampoDeFase,
  type FaseViva,
  type RelojDeLaPropuesta,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import { esFaseDeCierre } from "./hitos";
import type { PoliticaDeAtrasos } from "./politica-de-atrasos";
import { faseDeSemanaCero } from "./propuesta-de-estructura";
import { semanaDeHoy } from "./vista-de-la-propuesta";
import { computePhaseRanges } from "./weeks";

/** Por qué una fase queda quieta con trabajo sin hacer. «atrasada»: solo con la política «avisar» (no se reprograma). */
export type MotivoDeLoSinHacer = "semana-0" | "en-curso" | "casi-terminada" | "atrasada";

export interface ReprogramacionDesdeHoy {
  /** La semana de hoy del proyecto, desde 0 (D2): la primera que no vence según `semanaVencida`. */
  semana: number;
  /** El reloj que se guarda con la reprogramación (`Borrador.hoy`): el instante, la semana y la foto de la política. */
  reloj: RelojDeLaPropuesta;
  /** Los cambios de fase del sistema (`desdeHoy`): `startWeek` o `durationWeeks`; el pin con `fijaInicio`; `deLaIA` si
   *  reemplaza uno de la IA. En el orden de las fases. */
  cambios: CambioFaseCambia[];
  /** Las arrastradas (`desdeHoy`, `a.weekIndex`, `conCambio` = la clave de la duración de su fase). */
  tareas: CambioTareaCambia[];
  /** Las claves de la IA (misma fase y campo) que se reemplazan. */
  reemplazadas: string[];
  /** Solo con «todo-desde-hoy»: las casillas de las fases de cierre, que nacen desmarcadas (D5). */
  nacenDesmarcadas: string[];
  /** Las fases que quedan quietas con trabajo sin hacer, y por qué. */
  sinHacer: Array<{ faseId: string; motivo: MotivoDeLoSinHacer }>;
  /** Las fases sin empezar que se mueven y no tienen ninguna tarea marcada (si ya se hicieron, conviene marcarlas). */
  sinNadaMarcado: string[];
  observaciones: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// ── LAS OBSERVACIONES (van a «La IA también notó…» y dicen que es el sistema) ─
// ─────────────────────────────────────────────────────────────────────────────

/* Cada texto sale de una plantilla con el nombre de la fase. `sinReprogramacion` las reconoce por la plantilla (no por
   un registro aparte): el chat y las casillas reescriben el borrador con `{ ...guardado }` y un campo aparte se podía
   perder; el texto no. */
const PLANTILLAS = {
  fechaFijada: (fase: string) => `«${fase}» está atrasada y lo que le falta tiene fecha fijada: no se mueve.`,
  tocadaPorElChat: (fase: string) => `«${fase}» está atrasada y lo que le falta ya lo cambió el chat: no se mueve.`,
  semanasDelChat: (fase: string) => `«${fase}» está atrasada, pero el chat ya le cambió las semanas: no se reprograma.`,
  duracionDeLaIA: (fase: string) => `La duración que la IA proponía para «${fase}» se cuenta desde hoy.`,
  inicioDeLaIA: (fase: string) => `El inicio que la IA proponía para «${fase}» lo decide el sistema desde hoy.`,
  duracionDesmarcada: (fase: string) =>
    `Desmarcaste la duración que proponía la IA para «${fase}»: ahora la decide el sistema desde hoy.`,
  inicioDesmarcado: (fase: string) =>
    `Desmarcaste el inicio que proponía la IA para «${fase}»: ahora lo decide el sistema desde hoy.`,
} as const;
export const OBSERVACIONES_DE_LA_REPROGRAMACION = PLANTILLAS;

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RECONOCEDORES: readonly RegExp[] = Object.values(PLANTILLAS).map((p) => {
  const [antes, despues] = p("\u0000").split("\u0000");
  return new RegExp(`^${escapar(antes)}.+${escapar(despues)}$`, "s");
});

/** ¿Esta observación la escribió la reprogramación? (`sinReprogramacion` la quita con ella.) */
export function esObservacionDeLaReprogramacion(texto: string): boolean {
  return RECONOCEDORES.some((r) => r.test(texto));
}

// ─────────────────────────────────────────────────────────────────────────────
// ── EL CÁLCULO ───────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────

const abierta = (t: TareaDelVivo) => t.status === "PENDING" || t.status === "IN_PROGRESS";
const quieta = (status: string | undefined) => status === "DONE" || status === "SUSPENDED";

/**
 * La reprogramación de lo atrasado, o null sin fecha de arranque (no hay semana de hoy). Con «avisar», sin cambios ni
 * tareas: solo lo que quedó sin hacer. `borrador` llega SIN cambios del sistema de una marca anterior (`sinReprogramacion`)
 * y sus cambios de estructura son la estructura supuesta (`estructuraHipotetica`, la que después ve el paso 2).
 * `conSemanaCero`: el pipeline tiene Semana 0 (`!tieneVozDeHandoffPropia`); en Desarrollo y Web la primera fase es trabajo
 * real y se reprograma como cualquiera.
 */
export function reprogramarDesdeHoy(i: {
  vivo: Vivo;
  borrador: Borrador;
  hoy: Date;
  politica: PoliticaDeAtrasos;
  conSemanaCero: boolean;
}): ReprogramacionDesdeHoy | null {
  const H = semanaDeHoy(i.vivo.ancla, i.hoy);
  if (H === null) return null;
  const politica: PoliticaDeAtrasos = { ...i.politica, casiTerminada: { ...i.politica.casiTerminada } };
  const reloj: RelojDeLaPropuesta = { instante: i.hoy.toISOString(), semana: H, politica };

  const E = estructuraHipotetica(i.vivo, i.borrador);
  const R0 = computePhaseRanges(E.fases);
  const rangosVivos = computePhaseRanges(i.vivo.fases);
  const inicioVivo = new Map(i.vivo.fases.map((f, k) => [f.id, rangosVivos[k].start]));
  const vivaPorId = new Map<string, FaseViva>(i.vivo.fases.map((f) => [f.id, f]));
  const cero = faseDeSemanaCero(E.fases, i.conSemanaCero)?.id ?? null;

  /* Lo que ya tiene un cambio en el borrador no se corre: lo del chat (D6) y, por las dudas, cualquier otro cambio de
     esa tarea (dos cambios con la misma clave no pueden convivir). */
  const tocadas = new Set(
    i.borrador.cambios.flatMap((c) => (c.tipo === "tarea-cambia" || c.tipo === "tarea-se-va" ? [c.tareaId] : [])),
  );
  /** Los cambios de fase de la IA y del chat, por clave (fase y campo). */
  const deFase = new Map(
    i.borrador.cambios.flatMap((c) => (c.tipo === "fase-cambia" && !c.desdeHoy ? [[c.clave, c] as const] : [])),
  );
  const delChat = (faseId: string, campo: CampoDeFase) => !!deFase.get(claveDeCampo(faseId, campo))?.porChat;

  const cambios: Array<{ cambio: CambioFaseCambia; reemplaza: string | null; casilla: boolean }> = [];
  const tareas: CambioTareaCambia[] = [];
  const sinHacer: ReprogramacionDesdeHoy["sinHacer"] = [];
  const sinNadaMarcado: string[] = [];
  const observaciones: string[] = [];

  /** El cambio del sistema de un campo, y el de la IA que reemplaza si lo hay (se guarda adentro, para restaurarlo). Lo
   *  que cambió el chat no se reemplaza (quien llama ya lo miró: acá solo se evita una clave repetida). */
  const cambiar = (viva: FaseViva, campo: "startWeek" | "durationWeeks", a: number, extra: { fijaInicio?: true } = {}) => {
    const clave = claveDeCampo(viva.id, campo);
    const desde = campo === "startWeek" ? viva.startWeek : viva.durationWeeks;
    const ia = deFase.get(clave);
    if (ia?.porChat) return;
    const reemplaza = ia ?? null;
    const deLaIA: CambioDeLaIAReemplazado | null = reemplaza
      ? {
          a: typeof reemplaza.a === "number" ? reemplaza.a : null,
          ...(reemplaza.motivo ? { motivo: reemplaza.motivo } : {}),
          ...(reemplaza.desde !== desde ? { desde: typeof reemplaza.desde === "number" ? reemplaza.desde : null } : {}),
        }
      : null;
    cambios.push({
      cambio: {
        tipo: "fase-cambia",
        clave,
        faseId: viva.id,
        fase: viva.name,
        campo,
        desde,
        a,
        desdeHoy: true,
        ...extra,
        ...(deLaIA ? { deLaIA } : {}),
      },
      reemplaza: reemplaza ? clave : null,
      casilla: !extra.fijaInicio,
    });
    if (reemplaza && !extra.fijaInicio) {
      observaciones.push(campo === "durationWeeks" ? PLANTILLAS.duracionDeLaIA(viva.name) : PLANTILLAS.inicioDeLaIA(viva.name));
    }
  };

  let cursor = 0;
  const finNuevo: number[] = [];
  E.fases.forEach((f, k) => {
    const viva = f.existente ? vivaPorId.get(f.id) : undefined;
    let dur = f.durationWeeks || 1; // como computePhaseRanges
    let inicio = f.startWeek ?? cursor;
    if (!viva) {
      // Una fase nueva de la IA: no se toca (el armador ya impide que caiga en el pasado); contigua, se corre de rebote.
      cursor = inicio + dur;
      finNuevo[k] = cursor;
      return;
    }
    const tareasDeLaFase = viva.tareas ?? [];
    const abiertas = tareasDeLaFase.filter(abierta);
    const movibles = abiertas.filter((t) => !t.inicioFijado && !t.finFijado && !tocadas.has(t.id));
    const hechas = tareasDeLaFase.filter((t) => t.status === "DONE").length;
    const status = viva.status ?? "PENDING";
    const empezo = status !== "PENDING" || tareasDeLaFase.some((t) => t.status !== "PENDING");
    const esCero = f.id === cero;

    // EL PIN: una contigua ya empezada que la reprogramación (o lo de la IA) correría queda fija donde está HOY.
    const dondeEsta = inicioVivo.get(f.id) ?? inicio;
    if (f.startWeek === null && viva.startWeek === null && empezo && inicio !== dondeEsta) {
      cambiar(viva, "startWeek", dondeEsta, { fijaInicio: true });
      inicio = dondeEsta;
    }

    let atrasada = !esCero && inicio + dur <= H && !quieta(status) && (abiertas.length > 0 || tareasDeLaFase.length === 0);
    if (
      atrasada &&
      empezo &&
      tareasDeLaFase.length > 0 &&
      abiertas.length <= politica.casiTerminada.maxAbiertas &&
      hechas / tareasDeLaFase.length >= politica.casiTerminada.minHecho
    ) {
      atrasada = false;
      sinHacer.push({ faseId: f.id, motivo: "casi-terminada" });
    }

    const enElOrdenDelPlan = politica.fasesVencidas === "en-el-orden-del-plan";
    /* Lo que no empezó espera a lo que le falta a sus antecesoras: las anteriores en el orden, sin la Semana 0, que en el
       plan terminaban antes o justo cuando ésta empezaba. */
    let espera = -Infinity;
    if (enElOrdenDelPlan && !empezo && !esCero) {
      for (let j = 0; j < k; j++) {
        if (E.fases[j].id === cero || R0[j].end > R0[k].start) continue;
        espera = Math.max(espera, finNuevo[j]);
      }
    }
    const desde = Math.max(H, espera);

    if (atrasada && politica.fasesVencidas === "avisar") {
      sinHacer.push({ faseId: f.id, motivo: "atrasada" });
    } else if (atrasada && !empezo) {
      if (delChat(f.id, "startWeek")) observaciones.push(PLANTILLAS.semanasDelChat(viva.name));
      else {
        // Se mueve entera, con su duración: sus tareas la acompañan solas (su semana se cuenta desde el inicio de la fase).
        cambiar(viva, "startWeek", desde);
        inicio = desde;
        if (!tareasDeLaFase.some((t) => t.status !== "PENDING")) sinNadaMarcado.push(f.id);
      }
    } else if (atrasada) {
      if (delChat(f.id, "durationWeeks")) observaciones.push(PLANTILLAS.semanasDelChat(viva.name));
      else if (movibles.length > 0) {
        const p = Math.min(Math.min(...movibles.map((t) => t.weekIndex)), dur - 1);
        const resto = Math.max(1, dur - p);
        const nueva = H - inicio + resto;
        const delta = H - (inicio + p);
        cambiar(viva, "durationWeeks", nueva);
        const conCambio = claveDeCampo(f.id, "durationWeeks");
        for (const t of movibles) {
          tareas.push({
            tipo: "tarea-cambia",
            clave: claveDeTareaQueCambia(t.id),
            tareaId: t.id,
            faseId: f.id,
            desde: fotoDeTarea(t),
            a: { weekIndex: t.weekIndex + delta },
            conCambio,
            desdeHoy: true,
          });
        }
        dur = nueva;
      } else if (abiertas.length > 0) {
        const conFecha = abiertas.some((t) => t.inicioFijado || t.finFijado);
        observaciones.push(conFecha ? PLANTILLAS.fechaFijada(viva.name) : PLANTILLAS.tocadaPorElChat(viva.name));
      }
      // Empezada y sin ninguna tarea: no hay nada que correr.
    } else if (!empezo && !esCero && espera > inicio && !delChat(f.id, "startWeek")) {
      // Solo en el orden del plan: va después de lo que la precedía, que ahora termina más tarde.
      cambiar(viva, "startWeek", espera);
      inicio = espera;
    }

    // Lo que quedó sin hacer en semanas que ya pasaron, en una fase que no se reprogramó (se nombra, no se mueve).
    const movidas = new Set(tareas.filter((t) => t.faseId === f.id).map((t) => t.tareaId));
    const vencidaSinHacer = abiertas.some((t) => !movidas.has(t.id) && inicio + acotarSemana(t.weekIndex, dur) < H);
    const yaNombrada = sinHacer.some((s) => s.faseId === f.id);
    if (!yaNombrada && vencidaSinHacer && !quieta(status)) {
      if (esCero) sinHacer.push({ faseId: f.id, motivo: "semana-0" });
      else if (inicio <= H && H < inicio + dur) sinHacer.push({ faseId: f.id, motivo: "en-curso" });
    }

    cursor = inicio + dur;
    finNuevo[k] = cursor;
  });

  // Sin ninguna casilla no hay reprogramación: el pin solo existe para que lo reprogramado no corra lo empezado.
  const conCasilla = cambios.some((c) => c.casilla);
  const quedan = conCasilla ? cambios : [];
  const cierres = new Set(E.fases.filter((f) => f.existente && esFaseDeCierre(vivaPorId.get(f.id)?.name ?? f.name)).map((f) => f.id));
  return {
    semana: H,
    reloj,
    cambios: quedan.map((c) => c.cambio),
    tareas: conCasilla ? tareas : [],
    reemplazadas: quedan.flatMap((c) => (c.reemplaza ? [c.reemplaza] : [])),
    // D5: con todo desde hoy, el cierre quedaría antes del trabajo que lo precedía: su casilla nace desmarcada.
    nacenDesmarcadas:
      politica.fasesVencidas === "todo-desde-hoy"
        ? quedan.filter((c) => c.casilla && cierres.has(c.cambio.faseId)).map((c) => c.cambio.clave)
        : [],
    sinHacer,
    sinNadaMarcado: conCasilla ? sinNadaMarcado : [],
    observaciones,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// ── SOBRE EL JSON GUARDADO: poner y quitar la reprogramación ─────────────────
// ─────────────────────────────────────────────────────────────────────────────

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const esCambioDeTareaCrudo = (c: unknown) => esObjeto(c) && typeof c.tipo === "string" && c.tipo.startsWith("tarea-");
const claveDe = (c: unknown): string | null => (esObjeto(c) && typeof c.clave === "string" ? c.clave : null);
const textos = (v: unknown): string[] => (Array.isArray(v) ? v.filter((o): o is string => typeof o === "string") : []);

/**
 * El JSON guardado CON la reprogramación. Puro. Los cambios del sistema van detrás de los de estructura (el que reemplaza
 * uno de la IA, en su lugar) y las arrastradas detrás de todo. Lo reemplazado sale de `cambios` y de `excluidos`: si el
 * CSE había desmarcado lo de la IA, el del sistema nace MARCADO y se dice (la casilla era de la IA, no de esto). Las de
 * `nacenDesmarcadas` entran a `excluidos`. Suma las observaciones (sin repetir) y pone el reloj (`hoy`).
 * ⚠ No toca la versión: la sube quien escribe, una sola vez, en la misma escritura (`marcarTareasEnCurso`).
 */
export function conLaReprogramacion(guardado: Record<string, unknown>, r: ReprogramacionDesdeHoy): Record<string, unknown> {
  const reemplazadas = new Set(r.reemplazadas);
  const excluidosAntes = Array.isArray(guardado.excluidos) ? textos(guardado.excluidos) : null;
  const desmarcadasAntes = new Set((excluidosAntes ?? []).filter((k) => reemplazadas.has(k)));
  const observacionesNuevas: string[] = [];
  const delSistema = r.cambios.map((c): CambioFaseCambia => {
    if (!c.deLaIA || !desmarcadasAntes.has(c.clave)) return c;
    observacionesNuevas.push(
      c.campo === "durationWeeks" ? PLANTILLAS.duracionDesmarcada(c.fase) : PLANTILLAS.inicioDesmarcado(c.fase),
    );
    return { ...c, deLaIA: { ...c.deLaIA, desmarcada: true } };
  });
  const porClave = new Map(delSistema.map((c) => [c.clave, c]));

  const estructura: unknown[] = [];
  const deTareas: unknown[] = [];
  const puestos = new Set<string>();
  for (const c of Array.isArray(guardado.cambios) ? guardado.cambios : []) {
    const clave = claveDe(c);
    if (clave !== null && reemplazadas.has(clave)) {
      const propio = porClave.get(clave);
      if (propio) {
        estructura.push(propio);
        puestos.add(clave);
      }
      continue;
    }
    (esCambioDeTareaCrudo(c) ? deTareas : estructura).push(c);
  }
  const cambios = [...estructura, ...delSistema.filter((c) => !puestos.has(c.clave)), ...deTareas, ...r.tareas];

  const excluidos = [
    ...(excluidosAntes ?? []).filter((k) => !reemplazadas.has(k)),
    ...r.nacenDesmarcadas.filter((k) => !(excluidosAntes ?? []).includes(k)),
  ];
  const antes = textos(guardado.observaciones);
  const observaciones = [...antes];
  for (const o of [...r.observaciones, ...observacionesNuevas]) if (!observaciones.includes(o)) observaciones.push(o);
  return {
    ...guardado,
    cambios,
    observaciones,
    ...(excluidosAntes !== null || excluidos.length > 0 ? { excluidos } : {}),
    hoy: r.reloj,
  };
}

/**
 * El JSON guardado SIN la reprogramación (ni su reloj). Puro. Quita los cambios del sistema y sus arrastradas, restaura
 * cada cambio de la IA que se había reemplazado (en su lugar, desmarcado si lo estaba), quita las observaciones de la
 * reprogramación y saca de `excluidos` las claves que ya no existen. Sobre uno sin reprogramación, solo quita el reloj.
 */
export function sinReprogramacion(guardado: Record<string, unknown>): Record<string, unknown> {
  const { hoy: _reloj, ...resto } = guardado;
  void _reloj;
  if (!Array.isArray(resto.cambios)) return resto;
  const cambios: unknown[] = [];
  const desmarcadas: string[] = [];
  let quitados = 0;
  for (const c of resto.cambios) {
    if (!esObjeto(c) || c.desdeHoy !== true) {
      cambios.push(c);
      continue;
    }
    quitados++;
    if (c.tipo !== "fase-cambia" || !esObjeto(c.deLaIA)) continue;
    const ia = c.deLaIA;
    const { desdeHoy: _d, fijaInicio: _f, deLaIA: _i, motivo: _m, ...base } = c;
    void _d;
    void _f;
    void _i;
    void _m;
    cambios.push({
      ...base,
      ...(ia.desde !== undefined ? { desde: ia.desde } : {}),
      a: ia.a ?? null,
      ...(typeof ia.motivo === "string" && ia.motivo.length > 0 ? { motivo: ia.motivo } : {}),
    });
    if (ia.desmarcada === true && typeof c.clave === "string") desmarcadas.push(c.clave);
  }
  const observaciones = Array.isArray(resto.observaciones)
    ? resto.observaciones.filter((o) => !(typeof o === "string" && esObservacionDeLaReprogramacion(o)))
    : resto.observaciones;
  if (quitados === 0) return { ...resto, ...(observaciones !== undefined ? { observaciones } : {}) };

  const quedan = new Set(cambios.map(claveDe).filter((k): k is string => k !== null));
  const salida: Record<string, unknown> = { ...resto, cambios, ...(observaciones !== undefined ? { observaciones } : {}) };
  if (Array.isArray(resto.excluidos)) {
    /* La lista queda aunque quede vacía: guardada y vacía es «nadie desmarcó nada» (la pantalla solo migra sus casillas
       cuando falta). Por eso, sobre un guardado sin `excluidos` al que la reprogramación le hizo nacer una desmarcada, la
       vuelta deja `[]`, no la ausencia: es lo único que no vuelve exacto, y dice lo mismo. */
    const excluidos = textos(resto.excluidos).filter((k) => quedan.has(k));
    for (const k of desmarcadas) if (!excluidos.includes(k)) excluidos.push(k);
    salida.excluidos = excluidos;
  } else if (desmarcadas.length > 0) {
    salida.excluidos = desmarcadas;
  }
  return salida;
}
