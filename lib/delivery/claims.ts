/**
 * lib/delivery/claims.ts — QUÉ PUEDE AFIRMAR el documento de entrega. PURO.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────
 * La Entrega es el primer documento de Nexus de cara al cliente cuyo contenido son NÚMEROS
 * sobre su propio proyecto. Un número falso acá no es un bug: es el papel que el cliente
 * archiva y cita. Así que las cifras no las escribe el agente — las calcula este módulo desde
 * el cronograma y las escribe el runner. El agente ni ve esas secciones.
 *
 * ── EL `null` ES LOAD-BEARING ────────────────────────────────────────────────
 * Cada afirmación es `T | null`, y el `null` significa «no lo sabemos», nunca «cero». La
 * diferencia no es filosófica: 17 de 32 cronogramas de la cartera no tienen fecha de arranque
 * (`lib/timeline/progress-model.ts:30-32`), así que un `0` en la fecha de cierre se leería
 * como «cerró el día que arrancó». Sin dato, `metricas()` devuelve una métrica MENOS y la
 * sección se apaga sola vía `isBlank` — en pantalla y en PDF.
 *
 * ── LAS CUATRO PROHIBICIONES, CON SU MOTIVO MEDIDO ───────────────────────────
 * ⛔ `totalWeeks` para el plazo. Es ESFUERZO; con fases en paralelo le regala semanas al
 *    documento. El plazo es CALENDARIO = `timelineSpan`. El reparto está en `weeks.ts:129-135`
 *    y el repo usa las dos a propósito.
 * ⛔ Sumar `actualSessionCount` por fase. Con fases en paralelo una reunión cae en dos
 *    ventanas: en Wherex da 110 sobre 65 reales (`lib/timeline/delivery-sessions.ts:16-25`).
 *    El número de reuniones sale del chokepoint de membresía y de ningún otro lado.
 * ⛔ Llamar «atraso» a `driftDays`. Son dos frases distintas: «el plan se movió N días desde
 *    lo que te prometimos» (corrimiento del PLAN) y «llegamos tarde» (ejecución). Un proyecto
 *    puede tener corrimiento 0 y estar tres semanas tarde.
 * ⛔ Derivar «N meses de proyecto» de `timelineSpan / 4.34`. Cruza la frontera
 *    cronograma↔cobranza por la puerta de atrás: un número contractual sacado de una
 *    suposición de cronograma. La única fuente legítima es `ServicioContratado.duracionMeses`.
 */
import { projectedEnd, displayedEnd, type PhaseSpanLike } from "@/lib/timeline/weeks";
import { resolvedTaskCounts } from "@/lib/timeline/progress-model";

/** Lo mínimo que hace falta de una fase para afirmar algo sobre ella. */
export interface FaseParaEntrega extends PhaseSpanLike {
  name: string;
  status: string;
  tasks: Array<{ title: string; status: string; party?: string | null }>;
}

export interface ClaimsInput {
  fases: FaseParaEntrega[];
  anchorStartDate: string | null;
  /** El cierre que el CSE fijó a mano (Tanda K). Gana sobre el proyectado. */
  closeDateOverride: string | null;
  /** `summary.closing` — la promesa congelada del baseline y su corrimiento. */
  closing: { projectedISO: string | null; promisedISO: string | null; driftDays: number | null };
  /** Reuniones del proyecto. ⚠ De `getProjectMemberSessions().sessions.length`, nunca de las fases. */
  reuniones: number;
  /** Semanas de corrimiento ya curadas y atribuidas, o null si no hay ninguna visible. */
  corrimiento: { totalWeeks: number; byParty: Record<string, number> } | null;
  /** Hubs vendidos, ya resueltos a etiqueta legible. */
  hubs: string[];
  /**
   * `summary.scope` — el diff del plan VIVO contra la foto congelada al aprobar (D-09). `null`
   * cuando el summary no se pudo cargar. ⚠ `measurable: false` (sin foto) y `attenuated: true`
   * (foto débil: lo agregado es probablemente detalle, no extra real) NO afirman nada.
   */
  alcance: AlcanceParaEntrega | null;
}

/** Lo mínimo de `ProjectSummary["scope"]` que la Entrega necesita (estructural, sin importar el summary). */
export interface AlcanceParaEntrega {
  measurable: boolean;
  addedPhases: number;
  addedTasks: number;
  attenuated: boolean;
}

/** Una tarjeta de la sección «El plan, cumplido». Mismo shape que `RoiData.metrics`. */
export interface MetricaDeEntrega {
  value: string;
  label: string;
}

/** Un pendiente, con su dueño. Mismo shape que la prosa del kickoff. */
export interface PendienteDeEntrega {
  title: string;
  detail: string;
}

export interface DeliveryClaims {
  /** `null` = el cronograma no tiene tareas, o ninguna se marcó nunca. */
  tareas: { hechas: number; denominador: number; suspendidas: number } | null;
  fases: { cerradas: number; total: number } | null;
  /** Semanas de CALENDARIO. `null` si no hay fases con duración. */
  semanas: number | null;
  /** La fecha que el documento afirma, y de dónde salió. `null` = no la afirmamos. */
  cierre: { label: string; acordado: boolean } | null;
  /** Cuánto se movió el PLAN respecto de lo prometido. `null` sin baseline o sin ancla. */
  corrimientoDelPlan: number | null;
  /** Semanas de atraso atribuidas. `null` si el CSE no curó ninguna visible. */
  corrimiento: { totalWeeks: number; byParty: Record<string, number> } | null;
  reuniones: number | null;
  hubs: string[];
  /**
   * Lo que se sumó al alcance PROMETIDO (la foto del plan). `null` = no hay foto medible o es
   * débil: no se afirma. Un 0 SÍ se afirma: «cerró como se vendió» es una noticia del documento.
   */
  alcance: { tareasAgregadas: number; fasesAgregadas: number } | null;
}

/**
 * ⚠ El umbral del que dependen los seis proyectos con el cronograma sin marcar.
 *
 * Con menos de esto no se afirma que «nadie marcó nada»: un cronograma de 3 tareas sin marcar
 * puede ser un proyecto que recién arranca, no uno mal llevado.
 */
export const MIN_TAREAS_PARA_AFIRMAR = 5;

/** ¿El cronograma tiene tareas pero NADIE marcó ninguna? Es el único caso que frena publicar. */
export function cronogramaSinMarcar(fases: FaseParaEntrega[]): boolean {
  const tareas = fases.flatMap((f) => f.tasks);
  if (tareas.length < MIN_TAREAS_PARA_AFIRMAR) return false;
  return tareas.every((t) => t.status === "PENDING");
}

export function buildDeliveryClaims(input: ClaimsInput): DeliveryClaims {
  const tareasCrudas = input.fases.flatMap((f) => f.tasks);
  const c = resolvedTaskCounts(tareasCrudas);

  /* Sin tareas O con el cronograma entero sin marcar, no se afirma avance. El segundo caso es
     el que importa: son seis proyectos reales con 0 sobre 42, 61, 85, 35, 40 y 46. Decir
     «0 de 61 tareas completadas» en el documento de cierre de un proyecto que se entregó bien
     es una calumnia contra el equipo, y omitirlo es la única salida honesta — el número no
     está mal calculado, está mal MANTENIDO, y este documento no puede distinguirlo. */
  const tareas =
    c.denominator > 0 && !cronogramaSinMarcar(input.fases)
      ? { hechas: c.done, denominador: c.denominator, suspendidas: c.suspended }
      : null;

  const fases =
    input.fases.length > 0
      ? { cerradas: input.fases.filter((f) => f.status === "DONE").length, total: input.fases.length }
      : null;

  // CALENDARIO, no esfuerzo. Ver la prohibición del docblock.
  const proyectado = projectedEnd(input.anchorStartDate, input.fases);
  const semanas = proyectado.spanWeeks > 0 ? proyectado.spanWeeks : null;

  /* La fecha que se afirma es UNA, y se dice de dónde salió: si el CSE la fijó a mano es un
     acuerdo («Fecha de cierre acordada»); si no, es una derivación del plan («Cierre del
     plan»). Mezclarlas haría que el cliente lea como acordado algo que Nexus dedujo. */
  const mostrado = displayedEnd(input.closeDateOverride, proyectado);
  const cierre = mostrado.label ? { label: mostrado.label, acordado: mostrado.isOverride } : null;

  return {
    tareas,
    fases,
    semanas,
    cierre,
    corrimientoDelPlan: input.closing.driftDays,
    corrimiento: input.corrimiento && input.corrimiento.totalWeeks > 0 ? input.corrimiento : null,
    reuniones: input.reuniones > 0 ? input.reuniones : null,
    hubs: input.hubs,
    /* Sin foto no hay promesa contra la cual medir; con foto DÉBIL, lo «agregado» suele ser el
       detalle que la foto no tenía, y afirmarlo como extra sería cobrarle al cliente una
       imprecisión nuestra. Las dos caen a null: la tarjeta no se pinta. */
    alcance:
      input.alcance && input.alcance.measurable && !input.alcance.attenuated
        ? { tareasAgregadas: input.alcance.addedTasks, fasesAgregadas: input.alcance.addedPhases }
        : null,
  };
}

/**
 * Las tarjetas de «El plan, cumplido». Una afirmación sin dato **no produce tarjeta**.
 *
 * Con el array vacío, `isBlank` apaga la sección entera en lectura y en PDF: preferimos no
 * decir nada antes que decir «0%». Eso es lo que hace que el documento no necesite ni un `if`
 * en la vista.
 */
export function metricasDeCumplimiento(claims: DeliveryClaims): MetricaDeEntrega[] {
  const out: MetricaDeEntrega[] = [];

  if (claims.fases) {
    out.push({
      value: `${claims.fases.cerradas} de ${claims.fases.total}`,
      label: claims.fases.cerradas === claims.fases.total ? "Fases del plan, todas cerradas" : "Fases del plan cerradas",
    });
  }

  if (claims.tareas) {
    out.push({ value: `${claims.tareas.hechas} de ${claims.tareas.denominador}`, label: "Tareas completadas" });
    /* Obligatorio cuando hay suspendidas: `resolvedTaskCounts` las saca del denominador a
       propósito, así que «42 de 42» puede ser cierto habiendo descartado 6 del plan.
       Cierto-y-engañoso sigue siendo mentir. */
    if (claims.tareas.suspendidas > 0) {
      out.push({
        value: String(claims.tareas.suspendidas),
        label: claims.tareas.suspendidas === 1 ? "Tarea dada de baja del plan" : "Tareas dadas de baja del plan",
      });
    }
  }

  if (claims.semanas) {
    out.push({ value: `${claims.semanas}`, label: claims.semanas === 1 ? "Semana de plan" : "Semanas de plan" });
  }

  if (claims.reuniones) {
    out.push({ value: String(claims.reuniones), label: "Reuniones de trabajo" });
  }

  if (claims.cierre) {
    out.push({ value: claims.cierre.label, label: claims.cierre.acordado ? "Fecha de cierre acordada" : "Cierre del plan" });
  }

  /* El corrimiento del plan va CON SU NOMBRE, nunca como «atraso»: mide cuánto se movió la
     fecha desde que se prometió, no si se llegó tarde. Un 0 sí se afirma —«se cerró en la
     fecha prometida» es la mejor noticia del documento— y por eso acá el `null` y el `0`
     tienen que distinguirse. */
  if (claims.corrimientoDelPlan !== null) {
    const d = claims.corrimientoDelPlan;
    out.push(
      d === 0
        ? { value: "En fecha", label: "El cierre no se movió de lo prometido" }
        : {
            value: `${Math.abs(d)} ${Math.abs(d) === 1 ? "día" : "días"}`,
            label: d > 0 ? "Se corrió el cierre respecto de lo prometido" : "Se adelantó el cierre respecto de lo prometido",
          },
    );
  }

  /* D-09 (2026-09-04) · LO PROMETIDO. Dos tarjetas que antes no existían: cuánto se sumó al
     alcance de la foto del plan, y cuánto se corrió el calendario con su causa. Las dos se
     calculan acá, nunca las escribe el agente; las dos se omiten sin dato (`null`). */
  if (claims.alcance) {
    const { tareasAgregadas: t, fasesAgregadas: f } = claims.alcance;
    if (t > 0) {
      const fases = f > 0 ? ` (en ${f} ${f === 1 ? "fase nueva" : "fases nuevas"})` : "";
      out.push({
        value: `+${t}`,
        label: `${t === 1 ? "Tarea sumada" : "Tareas sumadas"} al alcance prometido${fases}`,
      });
    } else if (f > 0) {
      out.push({ value: `+${f}`, label: f === 1 ? "Fase sumada al alcance prometido" : "Fases sumadas al alcance prometido" });
    } else {
      out.push({ value: "Sin extras", label: "El alcance cerró como se prometió" });
    }
  }

  /* El atraso se dice; QUIÉN lo causó, NO. Decisión de Elías (2026-08-12): el plazo y el
     corrimiento se le comunican al cliente. Pero el REPARTO por responsable es otra cosa, y el
     repo ya lo tenía decidido en sentido contrario para esta audiencia:
     `attributionSentence(..., { audience: "cliente" })` dice «qué pasó y cuándo terminamos» SIN
     reparto, porque «el marcador de faltas no le sirve y pone la relación a la defensiva»
     (lib/timeline/particularidades-summary.ts). D-09 metió acá el desglose interno —«3 del
     cliente y 1 de Smarteam»— en el documento que el cliente archiva, contradiciendo esa
     decisión sin que nadie la revocara. Se revirtió el 2026-09-05: el total sí, el culpable no.
     ⛔ Si algún día se quiere el reparto acá, es una decisión de negocio explícita, no un
     detalle de redacción: cambia lo que el cliente lee sobre su propio proyecto. */
  if (claims.corrimiento) {
    const w = claims.corrimiento.totalWeeks;
    out.push({
      value: `${w} ${w === 1 ? "semana" : "semanas"}`,
      label: "De atraso registrado",
    });
  }

  return out;
}

/**
 * «Qué queda abierto» — las tareas que no se resolvieron, con su dueño.
 *
 * Decisión de Elías (2026-08-12): un proyecto se entrega con pendientes y se listan. Es lo que
 * hace útil el documento en la reunión de cierre; esconderlos lo convierte en folleto.
 *
 * Las SUSPENDIDAS no entran: están resueltas (aparcadas a propósito), no abiertas. Meterlas
 * acá le devolvería al cliente una lista de cosas que alguien ya decidió no hacer.
 */
export function pendientesAbiertos(fases: FaseParaEntrega[], tope = 12): PendienteDeEntrega[] {
  /* Quién lo tiene, en presente y sin ambigüedad. Antes decía «lo cerramos juntos», que en un
     documento de CIERRE se lee como una promesa vaga: el lector no sabe si tiene que hacer algo
     ni cuándo. Un pendiente sin dueño legible es un pendiente que nadie levanta. */
  const DUENIO: Record<string, string> = {
    CLIENTE: "Lo tienen ustedes",
    SMARTEAM: "Lo tenemos nosotros",
    DEV: "Lo tiene el equipo de desarrollo",
    AMBOS: "Lo vemos en conjunto",
  };
  const out: PendienteDeEntrega[] = [];
  for (const f of fases) {
    for (const t of f.tasks) {
      if (t.status === "DONE" || t.status === "SUSPENDED") continue;
      /* El DUEÑO primero —es lo accionable— y la fase después, como contexto. Al revés el
         renglón arrancaba con jerga interna («Semana 0 —…») y el dato útil quedaba al final. */
      const duenio = t.party ? DUENIO[t.party] : null;
      out.push({ title: t.title, detail: duenio ? `${duenio} · ${f.name}` : f.name });
      if (out.length >= tope) return out;
    }
  }
  return out;
}
