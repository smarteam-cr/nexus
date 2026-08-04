/**
 * lib/projects/lista-de-empresa.ts — CÓMO SE ORDENA Y SE ROTULA la lista de proyectos de una
 * empresa. Puro, sin base de datos, sin async. CLIENT-SAFE.
 *
 * ── EL PROBLEMA QUE RESUELVE (encontrado en vivo, 2026-08-01) ────────────────
 * La lista sale de las asociaciones de la empresa en HubSpot, y **HubSpot no garantiza el orden
 * en que las devuelve**. Se confirmó midiendo: dos llamadas separadas por segundos devolvieron
 * los mismos dos proyectos en distinto orden.
 *
 * Eso no sería grave si la lista fuera solo informativa, pero es la que alimenta el desplegable
 * "¿de qué implementación cuelga este proyecto?". O sea: la persona elige "el segundo" mirando
 * la pantalla, y termina colgándolo de otro. **Y colgar de un hermano decide facturación** — un
 * desarrollo que cuelga no se factura aparte, cobra la implementación. Sin error, sin aviso, y
 * solo visible mirando HubSpot con atención semanas después.
 *
 * Por eso el orden se decide ACÁ y no se hereda: es una tabla que se puede escribir entera en un
 * test, en vez de una línea escondida adentro de una ruta.
 *
 * ── Y POR QUÉ TAMBIÉN LAS ETIQUETAS ──────────────────────────────────────────
 * Ordenar arregla la corrección pero no la legibilidad: dos proyectos con el mismo nombre siguen
 * siendo dos filas idénticas. La desambiguación vive en el mismo módulo porque es la otra mitad
 * del mismo problema — cuál es cuál — y porque comparte la fecha como dato.
 */

import { buscarEtapa, resolvePipeline } from "./kind";

/** Lo mínimo que necesita una fila para poder ordenarse y rotularse. */
export interface ProyectoListable {
  /** Id del record en HubSpot. Desempata el orden: es único y estable. */
  hubspotProjectId: string;
  name: string;
  /** `hs_createdate` en ISO. `null` en un record sin fecha legible. */
  createdAt: string | null;
}

/**
 * Orden ESTABLE: del más viejo al más nuevo, desempatando por id.
 *
 * El desempate por id no es decorativo. Dos proyectos creados en el mismo milisegundo —o los dos
 * sin fecha— volverían a quedar en el orden que trajo HubSpot, que es justo lo que este módulo
 * existe para no usar. Con el desempate, la función es determinista SIEMPRE, no casi siempre.
 *
 * Los que no tienen fecha van al final: es más honesto que fingir que son los más viejos.
 */
export function ordenarPorAntiguedad<T extends ProyectoListable>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : NaN;
    const tb = b.createdAt ? Date.parse(b.createdAt) : NaN;
    const va = Number.isNaN(ta);
    const vb = Number.isNaN(tb);
    // Sin fecha (o fecha ilegible) al final, pero ordenados entre sí por id.
    if (va && vb) return a.hubspotProjectId.localeCompare(b.hubspotProjectId);
    if (va) return 1;
    if (vb) return -1;
    if (ta !== tb) return ta - tb;
    return a.hubspotProjectId.localeCompare(b.hubspotProjectId);
  });
}

/** "31 jul 2026" — corto, porque va adentro de la opción de un desplegable. */
function fechaCorta(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

/** "31 jul 2026, 22:19" — el escalón siguiente, para dos creados el mismo día. */
function fechaConHora(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${fechaCorta(iso)}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Agrega `etiqueta` a cada fila: el nombre a secas, y la fecha entre paréntesis SOLO cuando ese
 * nombre se repite en la lista.
 *
 * ── POR QUÉ SOLO CUANDO SE REPITE ────────────────────────────────────────────
 * Poner la fecha siempre sería más simple de escribir y peor de leer: en el 99% de los clientes
 * los nombres ya son únicos, y la fecha ahí no informa nada — solo alarga cada opción y empuja
 * el nombre, que es lo único que la persona está buscando. La desambiguación tiene que aparecer
 * exactamente donde hay ambigüedad.
 *
 * Compara sin distinguir mayúsculas ni espacios de sobra: "Smarteam" y "smarteam " son el mismo
 * nombre para quien mira la pantalla, que es de quien se trata.
 */
export function etiquetarAmbiguos<T extends ProyectoListable>(
  items: readonly T[],
): Array<T & { etiqueta: string }> {
  const clave = (n: string) => n.trim().toLowerCase();
  const cuantos = new Map<string, number>();
  for (const it of items) {
    const k = clave(it.name);
    cuantos.set(k, (cuantos.get(k) ?? 0) + 1);
  }

  /* ── POR QUÉ ESCALA EN TRES NIVELES ────────────────────────────────────────
     La fecha sola parecía suficiente hasta que se probó en vivo: dos proyectos creados EL MISMO
     DÍA quedaron con la etiqueta idéntica —"Smarteam (creado 31 jul 2026)" dos veces— o sea que
     la desambiguación no desambiguaba nada justo en el caso más probable (alguien dando de alta
     dos cosas en la misma sesión de trabajo).

     Se resuelve escalando SOLO donde hace falta: primero la fecha; si dos etiquetas siguen
     chocando, esas suben a fecha con hora; si aún así chocan (mismo minuto), el id, que es único
     por definición. Cada escalón es más feo y menos legible que el anterior, así que se paga
     únicamente en las filas que lo necesitan. */
  /* Cada nivel devuelve el paréntesis COMPLETO, no un fragmento: el último no habla de fechas
     y un "(creado #575988)" pegado a un id sería una frase sin sentido. */
  const NIVELES: Array<(it: ProyectoListable) => string | null> = [
    (it) => {
      const f = fechaCorta(it.createdAt);
      return f && `(creado ${f})`;
    },
    (it) => {
      const f = fechaConHora(it.createdAt);
      return f && `(creado ${f})`;
    },
    (it) => `(#${it.hubspotProjectId.slice(-6)})`,
  ];

  const pendientes = new Set(items.filter((it) => (cuantos.get(clave(it.name)) ?? 0) > 1));
  const etiquetas = new Map<string, string>(
    /* Los de nombre único no entran nunca al escalado: su etiqueta es el nombre pelado. Poner la
       fecha siempre sería más fácil de escribir y peor de leer — en el 99% de los clientes los
       nombres ya son distintos y ahí la fecha solo empuja al nombre, que es lo que se busca. */
    items.filter((it) => !pendientes.has(it)).map((it) => [it.hubspotProjectId, it.name]),
  );

  for (const nivel of NIVELES) {
    if (pendientes.size === 0) break;
    const porEtiqueta = new Map<string, ProyectoListable[]>();
    for (const it of pendientes) {
      const extra = nivel(it);
      // Sin dato para este nivel (fecha ilegible) se salta: el siguiente nivel lo resuelve.
      const etiqueta = extra ? `${it.name} ${extra}` : it.name;
      const grupo = porEtiqueta.get(etiqueta);
      if (grupo) grupo.push(it);
      else porEtiqueta.set(etiqueta, [it]);
    }
    for (const [etiqueta, grupo] of porEtiqueta) {
      // Solo se resuelven los que quedaron SOLOS con esta etiqueta; el resto sube de nivel.
      if (grupo.length === 1) {
        etiquetas.set(grupo[0].hubspotProjectId, etiqueta);
        pendientes.delete(grupo[0] as T);
      }
    }
  }
  // Lo que sobreviva a los tres niveles (sin fecha y con el mismo nombre) se queda pelado.
  for (const it of pendientes) etiquetas.set(it.hubspotProjectId, it.name);

  return items.map((it) => ({ ...it, etiqueta: etiquetas.get(it.hubspotProjectId) ?? it.name }));
}

/**
 * ¿El nombre que se está escribiendo ya lo tiene otro proyecto de este cliente?
 *
 * Devuelve el nombre tal como está guardado (no el que se tipeó), para que el aviso pueda
 * mostrarlo con sus mayúsculas reales. `null` = no choca con nada.
 *
 * Es un AVISO, nunca un bloqueo: dos proyectos del mismo cliente pueden llamarse igual con toda
 * legitimidad. Lo que no puede pasar es que se cree un homónimo *sin querer* — que es lo que
 * ocurrió en la prueba, porque el campo viene con el nombre de la empresa por defecto.
 */
export function nombreYaUsado(
  nombre: string,
  existentes: readonly { name: string }[],
): string | null {
  const buscado = nombre.trim().toLowerCase();
  if (!buscado) return null;
  return existentes.find((p) => p.name.trim().toLowerCase() === buscado)?.name ?? null;
}

/**
 * De qué TIPO y en qué ETAPA está, en HubSpot, un proyecto que todavía no está en Nexus.
 *
 * ── POR QUÉ ES UNA FUNCIÓN Y NO DOS LÍNEAS EN EL JSX ─────────────────────────
 * La lista del alta pide elegir entre proyectos que solo se muestran por su nombre, y la mayoría
 * de los adjuntables reales del portal está en «Finalizado» o «Bloqueado»: sin la etapa a la
 * vista, la elección natural es traer un proyecto muerto. Y la degradación tiene tres casos
 * distintos que conviene poder escribir en un test en vez de anidar ternarios en la pantalla.
 *
 * ⚠ Cuando el pipeline no resuelve NO se inventa etapa. Ese caso además **bloquea el alta**
 * (el motor no puede cerrarla si el tipo del espejo no coincide con el elegido), así que el
 * renglón tiene que anticiparlo, no disimularlo.
 */
export function rotuloDeHubspot(p: {
  hubspotPipelineId?: string | null;
  stage?: string | null;
}): { texto: string; desconocido: boolean } {
  const def = resolvePipeline(p.hubspotPipelineId);
  if (!def) {
    /* Ni el tipo se sabe. Decirlo entero acá evita que la persona llene el formulario y recién al
       final se entere de que ese proyecto no se puede traer. */
    return { texto: "Pipeline que Nexus no conoce — no se puede traer", desconocido: true };
  }
  const etapa = buscarEtapa(def, p.stage);
  /* Sin etapa legible se muestra el tipo solo. Es honesto y sigue sirviendo: el tipo es la mitad
     de la decisión, y no hay por qué esconderlo porque falte la otra mitad. */
  return { texto: etapa ? `${def.label} · ${etapa.label}` : def.label, desconocido: false };
}
