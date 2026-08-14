/**
 * lib/delivery/readiness.ts — qué va a decir la Entrega ANTES de generarla. PURO.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * `claims.ts` decide qué se puede afirmar. Pero un documento honesto puede seguir siendo
 * **vergonzoso**: en Wherex la primera corrida real salió diciendo «1 de 10 fases cerradas» y
 * «33 de 94 tareas completadas». Los dos números son CIERTOS —el cronograma dice eso— y los
 * dos se leen fatal en un papel que se titula «Entrega del proyecto».
 *
 * La diferencia entre un número falso y un número incómodo es de quién es la decisión. Un
 * número falso lo tiene que impedir el código; uno incómodo lo tiene que VER el CSE antes de
 * apretar Generar, y decidir si marca el cronograma, si oculta la sección o si lo entrega así.
 *
 * Por eso esto no bloquea casi nada: **avisa**. Es la doctrina del repo
 * (`lib/flow/piece-readiness.ts:14-18`, `lib/clients/gemelas.ts`) y acá tiene una razón extra:
 * 17 de 32 cronogramas de la cartera no tienen ancla y 6 no tienen ni una tarea marcada. Una
 * compuerta dura dejaría a media cartera sin poder entregar, y el CSE aprendería a ignorarla.
 *
 * Lo ÚNICO que frena es publicar con el cronograma entero sin marcar: ahí el documento no
 * puede distinguir «no se hizo nada» de «nadie lo anotó», y esa distinción es justamente la
 * que el cliente va a dar por respondida.
 */
import type { DeliveryClaims } from "./claims";

export type AvisoDeEntregaKey =
  | "SIN_MARCAR"
  | "POCAS_FASES_CERRADAS"
  | "SIN_ANCLA"
  | "SIN_BASELINE"
  | "SIN_REUNIONES"
  | "COBERTURA_BAJA"
  | "SIN_HUBS";

export interface AvisoDeEntrega {
  key: AvisoDeEntregaKey;
  /** FRENA = no se puede publicar. AVISA = se genera igual, con el dato a la vista. */
  efecto: "FRENA_PUBLICAR" | "AVISA";
  /** Lo que el CSE lee. En segunda persona, y diciendo qué VA A PASAR — no qué falta. */
  texto: string;
}

export interface DeliveryReadiness {
  /** SIEMPRE true: generar el borrador nunca se traba. */
  puedeGenerar: true;
  puedePublicar: boolean;
  avisos: AvisoDeEntrega[];
}

export interface ReadinessInput {
  claims: DeliveryClaims;
  /** Reuniones con transcripción / total del proyecto — la cobertura real del material. */
  cobertura: { conContenido: number; total: number };
  /** `true` cuando hay tareas suficientes y ninguna marcada (lo devuelve `cronogramaSinMarcar`). */
  sinMarcar: boolean;
}

/** Umbral de «esto se va a leer mal»: menos de un tercio de las fases cerradas. */
export const FASES_CERRADAS_MINIMO = 1 / 3;
/** Debajo de esto el agente escribe casi a ciegas y conviene decirlo. */
export const COBERTURA_MINIMA = 1 / 3;

export function deliveryReadiness(input: ReadinessInput): DeliveryReadiness {
  const { claims, cobertura, sinMarcar } = input;
  const avisos: AvisoDeEntrega[] = [];

  if (sinMarcar) {
    avisos.push({
      key: "SIN_MARCAR",
      efecto: "FRENA_PUBLICAR",
      texto:
        "El cronograma no tiene ni una tarea marcada, así que el documento no puede afirmar avance " +
        "y omite esa sección. Marcá el avance antes de publicar: si lo entregás así, el cliente lee " +
        "un cierre que no dice qué se hizo.",
    });
  } else if (claims.fases && claims.fases.cerradas / claims.fases.total < FASES_CERRADAS_MINIMO) {
    /* CIERTO pero incómodo, así que avisa y deja seguir: la causa habitual es que las fases se
       cierran poco, no que el proyecto esté a medias. El CSE es quien sabe cuál de las dos es. */
    avisos.push({
      key: "POCAS_FASES_CERRADAS",
      efecto: "AVISA",
      texto:
        `El documento va a decir «${claims.fases.cerradas} de ${claims.fases.total} fases cerradas». ` +
        "Si el proyecto terminó de verdad, cerrá las fases en el cronograma antes de generar.",
    });
  }

  if (!claims.cierre) {
    avisos.push({
      key: "SIN_ANCLA",
      efecto: "AVISA",
      texto:
        "Este proyecto no tiene fecha de arranque en el cronograma, así que el documento no va a " +
        "afirmar ninguna fecha de cierre. Podés fijarla a mano desde el cronograma.",
    });
  }
  if (claims.corrimientoDelPlan === null && claims.cierre) {
    avisos.push({
      key: "SIN_BASELINE",
      efecto: "AVISA",
      texto:
        "No hay un cronograma publicado con el que comparar, así que no se puede decir si el cierre " +
        "se movió respecto de lo prometido. Esa línea no va a aparecer.",
    });
  }

  if (!claims.reuniones) {
    avisos.push({
      key: "SIN_REUNIONES",
      efecto: "AVISA",
      texto: "No hay reuniones asociadas al proyecto: el documento se va a escribir solo con los documentos.",
    });
  } else if (cobertura.total > 0 && cobertura.conContenido / cobertura.total < COBERTURA_MINIMA) {
    avisos.push({
      key: "COBERTURA_BAJA",
      efecto: "AVISA",
      texto:
        `Solo ${cobertura.conContenido} de ${cobertura.total} reuniones tienen transcripción o minuta ` +
        "guardada. El relato va a salir de ese material, no de todo lo que pasó.",
    });
  }

  if (claims.hubs.length === 0) {
    avisos.push({
      key: "SIN_HUBS",
      efecto: "AVISA",
      texto: "El proyecto no tiene tags de producto, así que la sección «Qué quedó implementado» va a salir pobre.",
    });
  }

  return {
    puedeGenerar: true,
    puedePublicar: !avisos.some((a) => a.efecto === "FRENA_PUBLICAR"),
    avisos,
  };
}
