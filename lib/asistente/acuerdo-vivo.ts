/**
 * lib/asistente/acuerdo-vivo.ts — EL LIBRO DE LO ACORDADO Y NO APLICADO.
 *
 * PURO. Sin Prisma, sin red, sin React.
 *
 * ── EL BUG QUE LO ORIGINÓ (Elías, 2026-08-21) ────────────────────────────────────────────────
 *   18:21  el asistente pregunta UNA cosa y propone otra   → acuerdo de 2 operaciones
 *   18:22  el CSE contesta la pregunta
 *   18:22  el asistente propone                            → acuerdo de 1 operación
 *   18:24  se aplica esa 1. Las 2 primeras se perdieron, en silencio.
 *
 * Contestar una pregunta le costó la otra mitad de su pedido. Y no fue un bug de software: el
 * prompt decía, textual, «cada propuesta reemplaza a la anterior». El modelo obedeció.
 *
 * ── EL INVARIANTE QUE ESTE MÓDULO SOSTIENE ───────────────────────────────────────────────────
 *
 *   ⭐ EL ÚLTIMO ACUERDO DEL HILO CONTIENE SIEMPRE TODO LO ACORDADO Y NO APLICADO.
 *
 * `ChatDelAsistente` ya daba el botón «Aplicar» solo al último turno, y el comentario que lo
 * justifica suponía que lo único que corre un acuerdo del último lugar es su propio desenlace.
 * Eso era falso —`correrTurno` agrega DOS turnos por mensaje— así que la regla no hay que
 * cambiarla: hay que **volverla verdadera**. Con el libro, «último acuerdo» ≡ «todo lo pendiente»,
 * y entonces un solo botón vivo alcanza y sobra.
 *
 * ⛔ Nunca dos botones. Las operaciones NO son idempotentes: `tarea.crear` duplica la tarea y
 * `fase.crear` duplica la fase. Dos lotes que se solapan aplicados en cualquier orden es una
 * escritura doble sobre un cronograma que el cliente ve.
 *
 * ── QUIÉN COMPONE: LA APP, NO EL MODELO ──────────────────────────────────────────────────────
 * La asimetría entre los dos errores posibles decide, y está medida contra los dos que ocurren:
 *
 *   · si el MODELO deja caer algo pendiente → invisible. Lo que no está no se pinta. Es el bug.
 *   · si la APP conserva algo que se canceló → un renglón numerado más, con su casilla. Un clic.
 *
 * El error de la app cae exactamente sobre la superficie de revisión que ya existe. El del modelo
 * es invisible por construcción. Por eso el modelo emite SOLO lo nuevo y declara lo que suelta.
 */
import { arrastreAlDesmarcar } from "@/lib/timeline/dependencias-de-operaciones";
import { resolverHandle } from "@/lib/timeline/handle-de-tarea";
import type { Operacion } from "@/lib/timeline/operaciones";
import type { FaseActual } from "@/lib/timeline/assist-items";
import { leerAcuerdo, leerDesenlace } from "./acuerdo";

/** Lo mínimo que el libro necesita de un turno guardado. */
export interface TurnoDelLibro {
  rol: string;
  contenido: string;
  shaDeContexto: string | null;
}

/**
 * ⭐ UN DESENLACE ES EL ÚNICO TURNO DEL ASISTENTE SIN HUELLA DE CONTEXTO, y ese dato ya está
 * escrito en cada fila de producción desde el primer día.
 *
 * `agregarTurno` es el ÚNICO escritor de `MensajeDeChat` (hay una guarda que lo exige) y escribe
 * `shaDeContexto: turno.shaDeContexto ?? null`. `correrTurno` siempre le pasa la huella —
 * `huellaDeContexto` nunca devuelve vacío— y la rama del desenlace nunca se la pasa. O sea que el
 * discriminador es RETROACTIVO: funciona sobre los hilos que ya existen, cosa que un marcador
 * nuevo no podría.
 *
 * ⚠ El chequeo de `rol` no es adorno: los turnos del CSE TAMBIÉN llevan huella, y el turno
 * optimista que pinta la pantalla mientras el modelo piensa se construye sin el campo. Sin mirar
 * el rol, ese turno se leería como un desenlace y apagaría el botón de la nada.
 */
export function esTurnoDeDesenlace(t: TurnoDelLibro): boolean {
  return t.rol === "ASISTENTE" && t.shaDeContexto === null;
}

/**
 * Lo que se acordó y todavía NO se escribió en el cronograma.
 *
 * Camina el hilo desde el final:
 *   · un desenlace OK  → no queda nada pendiente (se aplicó todo lo que había)
 *   · un desenlace que FALLÓ → nada entró, así que se sigue buscando hacia atrás
 *   · un acuerdo con operaciones → ése es el libro
 *
 * ⚠ NO acumula hacia atrás más allá del último acuerdo, y es deliberado. Los hilos anteriores a
 * este cambio no acumulaban, así que sus acuerdos viejos pueden estar aplicados sin que nada lo
 * diga. Resucitarlos duplicaría tareas. Tomar solo el último es la única lectura segura para la
 * historia — y para los hilos nuevos es equivalente, porque el último YA los contiene a todos.
 *
 * ⚠ Un desenlace SIN marcador se lee como OK (ver `leerDesenlace`): vacía el libro en vez de
 * resucitar. Errar hacia «no ofrecer» es barato; errar hacia «ofrecer de nuevo» escribe dos veces.
 */
export function pendientesDelHilo(turnos: readonly TurnoDelLibro[]): Operacion[] {
  for (let i = turnos.length - 1; i >= 0; i--) {
    const t = turnos[i];
    if (esTurnoDeDesenlace(t)) {
      const { desenlace } = leerDesenlace(t.contenido);
      if (desenlace?.ok ?? true) return [];
      continue;
    }
    const { acuerdo } = leerAcuerdo(t.contenido);
    const ops = acuerdo?.operaciones;
    if (Array.isArray(ops) && ops.length > 0) return ops as Operacion[];
  }
  return [];
}

/* ── EL ESTADO DE CADA CAJA ────────────────────────────────────────────────────────────────── */

/**
 * En qué quedó cada acuerdo del hilo. Se DERIVA de los turnos, no se guarda.
 *
 * ⚠ Es una proyección de lectura, de la misma clase que el `acuerdo` que `leerAcuerdo` saca del
 * texto: no puede quedar desincronizada porque se recalcula del mismo contenido. NO es la tabla de
 * estados que el diseño descarta — esa sería una segunda fuente de verdad.
 */
export type EstadoDeAcuerdo = "vivo" | "en-espera" | "aplicado" | "retomado";

/**
 * ⭐ EL BOTÓN SIGUE AL ESTADO, NO A LA POSICIÓN.
 *
 * `ChatDelAsistente` daba el botón al último turno del array, y eso era correcto solo mientras lo
 * único que corriera un acuerdo del último lugar fuera su propio desenlace. Falso: `correrTurno`
 * agrega DOS turnos por mensaje. Acá la regla se dice como lo que es.
 *
 * Para cada turno con acuerdo, se mira lo que vino después:
 *   · un desenlace OK      → "aplicado"  (ya está escrito en el cronograma)
 *   · un desenlace FALLIDO → se sigue mirando: no entró nada, así que todavía puede estar vivo
 *   · otro acuerdo         → "retomado"  (sus operaciones viajan adentro de ese, más nuevo)
 *   · nada                 → "vivo"      (el único que lleva casillas y botón)
 *
 * ⛔ COMO MUCHO UNO PUEDE ESTAR "vivo", y eso no es una convención: dos botones vivos son dos
 * lotes que se solapan aplicados en el orden en que la persona clickee, sobre un vocabulario que
 * no es idempotente. Un `tarea.crear` aplicado dos veces son dos tareas.
 */
export function estadosDeAcuerdo(
  turnos: readonly TurnoDelLibro[],
): (EstadoDeAcuerdo | null)[] {
  const acuerdos = turnos.map((t) => leerAcuerdo(t.contenido).acuerdo);
  const tieneAcuerdo = acuerdos.map((a) => a !== null);

  return turnos.map((t, i) => {
    if (!tieneAcuerdo[i]) return null;
    for (let j = i + 1; j < turnos.length; j++) {
      if (esTurnoDeDesenlace(turnos[j])) {
        const { desenlace } = leerDesenlace(turnos[j].contenido);
        if (desenlace?.ok ?? true) return "aplicado";
        /* Falló: no se escribió nada, así que este acuerdo puede seguir vivo. Se sigue mirando —
           si más adelante hay otro acuerdo, es ése el que lo lleva. */
        continue;
      }
      if (tieneAcuerdo[j]) return "retomado";
    }
    /**
     * ⭐ CON UNA PREGUNTA ABIERTA NO SE APLICA, y es la corrección de Elías (2026-08-21).
     *
     * Acumular Y dejar aplicar parte el pedido en dos escrituras: la persona aplica media cosa,
     * contesta, y aplica la otra media. Los cambios siguen registrados y el libro los arrastra —
     * no se pierde nada— pero el botón espera a que no quede nada por resolver.
     */
    if (acuerdos[i]?.enEspera) return "en-espera";
    return "vivo";
  });
}

/* ── LA PODA ───────────────────────────────────────────────────────────────────────────────── */

export interface OperacionCaida {
  operacion: Operacion;
  motivo: string;
}

/**
 * ⭐ LO QUE SE ARRASTRA SE REVALIDA CONTRA EL CRONOGRAMA DE HOY, y sin esto el arreglo se vuelve
 * en contra.
 *
 * Una operación pendiente puede nombrar una fase que alguien borró a mano en el Gantt mientras la
 * conversación seguía. El ejecutor la rechazaría — y **un rechazo tumba el lote ENTERO**, así que
 * un solo pendiente inválido dejaría fallando todos los applies siguientes, sin que se entienda
 * por qué.
 *
 * Lo que no resuelve se cae CON SU MOTIVO ESCRITO, para decirlo en la cajita. Nunca en silencio:
 * un arrastre que desaparece callado es el mismo defecto que este módulo vino a matar, del otro
 * lado.
 *
 * ⛔ NO se usa el ejecutor en seco para esto. `ctx.fases` no trae `source` para todas las tareas,
 * así que `tarea.borrar` daría falsos «está protegida» y tiraría pendientes legítimos.
 */
export function podarIrresolubles(
  operaciones: readonly Operacion[],
  fases: readonly FaseActual[],
): { vivas: Operacion[]; caidas: OperacionCaida[] } {
  const idsDeFase = new Set(fases.map((f) => f.id));
  /* Las fases que se crean en este mismo lote todavía no existen: se nombran por su `ref`. */
  const refsDelLote = new Set(
    operaciones
      .filter((o): o is Extract<Operacion, { op: "fase.crear" }> => o.op === "fase.crear")
      .map((o) => o.ref?.trim())
      .filter((r): r is string => !!r),
  );
  const idsDeTarea = fases.flatMap((f) => f.tasks.map((t) => t.id));

  const vivas: Operacion[] = [];
  const caidas: OperacionCaida[] = [];

  for (const o of operaciones) {
    let motivo: string | null = null;

    const phaseId = "phaseId" in o ? o.phaseId?.trim() : null;
    if (phaseId && !idsDeFase.has(phaseId) && !refsDelLote.has(phaseId)) {
      motivo = "esa fase ya no está en el cronograma";
    }

    const taskId = !motivo && "taskId" in o ? o.taskId?.trim() : null;
    if (taskId) {
      const r = resolverHandle(taskId, idsDeTarea);
      if (r.tipo === "ninguna") motivo = "esa tarea ya no está en el cronograma";
      else if (r.tipo === "ambigua") motivo = "ahora hay varias tareas que coinciden con ese identificador";
    }

    if (motivo) caidas.push({ operacion: o, motivo });
    else vivas.push(o);
  }

  return { vivas, caidas };
}

/* ── LA FUSIÓN ─────────────────────────────────────────────────────────────────────────────── */

export interface Fusion {
  /** El conjunto COMPLETO que se va a ejecutar: lo que sobrevivió de antes, más lo nuevo. */
  operaciones: Operacion[];
  /** Los índices (dentro de `operaciones`) que vienen de turnos anteriores. */
  arrastradas: number[];
  /** Los índices DENTRO DE `pendientes` que se soltaron, para poder decirlo. */
  descartadas: number[];
}

/** Huella estable de una operación: las claves ordenadas, para que el orden del JSON no importe. */
function huella(o: Operacion): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(o as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))),
  );
}

/** «P2» / «p2» / «2» → 1. Cualquier otra cosa, `null`. */
function indiceDeEtiqueta(raw: unknown): number | null {
  const m = /^\s*[pP]?\s*(\d+)\s*$/.exec(String(raw ?? ""));
  if (!m) return null;
  const i = Number(m[1]) - 1;
  return Number.isInteger(i) && i >= 0 ? i : null;
}

/**
 * Si una `fase.crear` que se arrastra usa el mismo `ref` que una nueva, el ejecutor rechaza el
 * duplicado y **muere el lote entero**. Se renombra la vieja y se reapunta a sus dependientes.
 */
function reetiquetarRefs(pendientes: readonly Operacion[], nuevas: readonly Operacion[]): Operacion[] {
  const refDe = (o: Operacion) => (o.op === "fase.crear" ? o.ref?.trim() : undefined);
  const refsNuevas = new Set(nuevas.map(refDe).filter((r): r is string => !!r));
  const usados = new Set([...refsNuevas, ...pendientes.map(refDe).filter((r): r is string => !!r)]);

  const renombres = new Map<string, string>();
  for (const o of pendientes) {
    const r = refDe(o);
    if (!r || !refsNuevas.has(r)) continue;
    let candidato = `${r}_previo`;
    let n = 2;
    while (usados.has(candidato)) candidato = `${r}_previo${n++}`;
    usados.add(candidato);
    renombres.set(r, candidato);
  }
  if (renombres.size === 0) return [...pendientes];

  return pendientes.map((o) => {
    const copia = { ...o } as Operacion & { ref?: string; phaseId?: string };
    if (copia.ref && renombres.has(copia.ref.trim())) copia.ref = renombres.get(copia.ref.trim());
    if (copia.phaseId && renombres.has(copia.phaseId.trim())) {
      copia.phaseId = renombres.get(copia.phaseId.trim());
    }
    return copia as Operacion;
  });
}

/**
 * El conjunto que se va a ejecutar: lo pendiente que sigue en pie, más lo que se acaba de acordar.
 *
 * ⚠ ORDEN: pendientes primero, en su orden original; lo nuevo después. Ante cualquier conflicto
 * residual manda la propuesta nueva —se ejecutan en orden y gana la última— y `describirOperaciones`
 * traduce en ese mismo orden, así que las líneas dicen dónde caen las cosas de verdad.
 *
 * ⚠ EL DESCARTE SE PIDE POR ETIQUETA, no por contenido: el modelo lee un bloque numerado «P1, P2…»
 * y devuelve las que ya no corresponden. Una etiqueta que no se entiende **se ignora y la
 * operación SIGUE pendiente** — la misma asimetría de todo el módulo: fallar en descartar es
 * visible y recuperable; fallar en conservar, no.
 */
export function fusionarPendientes(
  pendientes: readonly Operacion[],
  nuevas: readonly Operacion[],
  descartar: readonly unknown[] = [],
): Fusion {
  const pedidos = new Set<number>();
  for (const raw of descartar) {
    const i = indiceDeEtiqueta(raw);
    if (i !== null && i < pendientes.length) pedidos.add(i);
  }

  /* ⛔ LA UNIDAD ES EL GRUPO, NO LA OPERACIÓN SUELTA. Soltar una `fase.crear` y dejar sus
     `tarea.crear` produce operaciones que apuntan a una fase inexistente: el ejecutor las rechaza
     y el rechazo tumba el lote entero. Se reusa la misma cascada que usan las casillas. */
  const fuera = pedidos.size > 0 ? arrastreAlDesmarcar(pendientes, pedidos) : new Set<number>();

  const sobreviven = reetiquetarRefs(
    pendientes.filter((_, i) => !fuera.has(i)),
    nuevas,
  );

  /* Dedup exacto: si el modelo re-emitió algo idéntico a un pendiente —contra lo que dice el
     prompt— se colapsa en vez de ejecutarse dos veces. Es lo que hace que acumular converja. */
  const huellas = new Set(sobreviven.map(huella));
  const nuevasSinRepetir = nuevas.filter((o) => !huellas.has(huella(o)));

  return {
    operaciones: [...sobreviven, ...nuevasSinRepetir],
    arrastradas: sobreviven.map((_, i) => i),
    descartadas: [...fuera].sort((a, b) => a - b),
  };
}

/* ── EL BLOQUE QUE LEE EL MODELO ───────────────────────────────────────────────────────────── */

/**
 * Lo pendiente, contado al modelo con LAS MISMAS LÍNEAS que lee la persona en la cajita azul.
 *
 * ⭐ Un solo traductor para los dos lectores: si el modelo razonara sobre una descripción distinta
 * de la que aprueba el CSE, se podrían contradecir sin que nada avise.
 *
 * ⛔ ESTE BLOQUE VA EN `messages`, NUNCA EN `system`. El breakpoint de caché está al final del
 * bloque de contexto; meter acá algo que cambia en cada turno invalidaría la caché entera **sin
 * error y sin log**, y se vería solo en la factura.
 */
export function bloqueDePendientes(lineas: readonly string[]): string {
  if (lineas.length === 0) return "";
  return [
    "[LO QUE SIGUE PENDIENTE — lo escribe la app, no la persona]",
    "Estos cambios se acordaron y NO se aplicaron. La app los incluye sola en el acuerdo que",
    'emitas: NO los repitas en "operaciones".',
    ...lineas.map((l, i) => `  P${i + 1}. ${l}`),
    "Si alguno ya no corresponde —la persona lo canceló, o tu propuesta nueva lo reemplaza— ponlo",
    'en "descartar": ["P1"]. Lo que no listes ahí sigue pendiente.',
    "",
  ].join("\n");
}
