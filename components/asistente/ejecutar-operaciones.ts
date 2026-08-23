"use client";

/**
 * components/asistente/ejecutar-operaciones.ts — EL EDITOR EJECUTA LO QUE EL CHAT ACORDÓ.
 *
 * ── ⛔ POR QUÉ ESTO NO ESCRIBE POR SU CUENTA ─────────────────────────────────
 * Traduce el plan a llamadas a los verbos que `useCanvasSections` YA tiene: `upsertCardData`,
 * `setHidden`, `reorderSections`, `renameSection`, `addSection`, `removeSection`. Cada uno trae su
 * optimismo, su deshacer y su cola de escrituras pendientes.
 *
 * Abrir un camino propio —un fetch, un `prisma.*`— sería un SEGUNDO camino de escritura para lo
 * mismo. Y eso no es interfaz duplicada: es lógica de pérdida de datos duplicada. Este repo ya lo
 * pagó una vez con dos puertas a las que les faltaba el mismo guardia.
 *
 * ── POR QUÉ SE REGISTRA DESDE CADA WORKSPACE Y NO SE AUTO-MONTA ──────────────
 * El que puede escribir es el que tiene el hook. `DocumentAssist` se auto-registra porque ya está
 * montado en los seis documentos, pero él no tiene los verbos: tiene el assist. Una línea por
 * workspace es explícita y deja claro quién ejecuta.
 */
import { useEffect, useMemo, useRef } from "react";
import { useRegistrarAplicadorDeDocumento, type ResultadoDelAplicador } from "./aplicador-de-documento";
import {
  aplicarOperacionesDeDocumento,
  esOperacionDeDocumento,
  verificarOperacionesDeDocumento,
  type CapacidadesDelDocumento,
  type OperacionDeDocumento,
  type SeccionActual,
  type CompletadorDeItem,
} from "@/lib/canvas/operaciones-de-documento";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { customDef } from "@/lib/landing/catalogo-de-secciones";
import { schemaParaElChat } from "@/lib/canvas/capacidades-de-documento";
import { datosDeSeccion, formatoDeSeccion } from "@/lib/landing/formato-de-seccion";
import type { SectionWithBlocks, useCanvasSections } from "@/components/canvas/useCanvasSections";

/** Lo mínimo de una def que el ejecutor necesita: el esquema y si tiene lugar fijo. */
export type DefsParaEjecutar = Record<
  string,
  {
    schema?: unknown;
    /** La superficie que el CHAT puede tocar, cuando difiere de la del agente. */
    schemaDelChat?: unknown;
    pinned?: boolean;
    /** El componente trae su propio encabezado: el rótulo de arriba no se pinta desde la columna. */
    selfTitled?: boolean;
    /** Listas que el chat corrige pero no agranda. Ver `BCSectionDef.listasSoloEdicion`. */
    listasSoloEdicion?: string[];
    /** …pero SÍ pinta lo que el motor le pasa. Ver `BCSectionDef.leeElEncabezado`. */
    leeElEncabezado?: boolean;
    empty?: unknown;
    /** Cómo se llama cada lista en pantalla: hace legible la línea del acuerdo. */
    rotulosDeListas?: Record<string, string>;
    /** El rótulo chico de la plantilla, para cuando la sección no tiene override propio. */
    eyebrow?: string;
  } | undefined
>;

/**
 * ⭐ LAS SECCIONES COMO LAS VE EL EJECUTOR — pura, y a nivel de módulo por un motivo concreto.
 *
 * Vivía adentro del `useMemo`, y con el memo no alcanza: «confirmar releyendo» tiene que mapear la
 * lectura FRESCA que devuelve `refetch`, y `cs.sections` todavía no la tiene — `setSections` es
 * asíncrono, así que dentro del mismo callback se sigue viendo la foto vieja. Con la función
 * afuera, las dos lecturas —la del render y la de la verificación— pasan por el MISMO mapeo. Si
 * fueran dos, la verificación compararía contra una forma distinta de la que se acordó.
 */
export function seccionesParaElEjecutor(
  filas: readonly SectionWithBlocks[],
  defsByKey: DefsParaEjecutar,
): SeccionActual[] {
  return filas.map((s) => {
    const def = defsByKey[s.key] ?? (esCustomKey(s.key) ? customDef(s.key, s.label) : undefined);
    const card = s.blocks.find((b) => b.blockType === "CARD");
    return {
      id: s.id,
      key: s.key,
      label: s.titleOverride?.trim() || s.label,
      data: card?.data ?? {},
      /* ⛔ La MISMA función que usa el contexto del servidor. Si uno leyera `def.schema` y el
         otro `schemaDelChat`, el chat acordaría un cambio que este editor rechaza. */
      schema: schemaParaElChat(def),
      /* ⚠ El del AGENTE va aparte: `seccion.vaciar` lo usa para no llevarse la curaduría.
         Ver `schemaDelAgente` en el vocabulario. */
      schemaDelAgente: def?.schema,
      oculta: s.hidden === true,
      esCreada: esCustomKey(s.key),
      movible: !def?.pinned,
      /* ⭐ La pregunta NO es «¿el motor le pinta encabezado?» sino «¿escribir el rótulo se va a
         VER?», y `selfTitled` contesta la primera. Falla en las dos direcciones: el cronograma y
         los procesos del kickoff son `selfTitled` y SÍ pintan lo que el motor les pasa, así que el
         chat rechazaba un rótulo que se habría visto. `leeElEncabezado` lo declara como un hecho
         en vez de inferirlo. */
      rotulable: !def?.selfTitled || !!def?.leeElEncabezado,
      rotulosDeListas: def?.rotulosDeListas,
      /* Corregir sí, agrandar no. Ver `SeccionActual.listasSoloEdicion`. */
      listasSoloEdicion: def?.listasSoloEdicion,
      /* ⚠ FALTABA, y lo necesitan dos cosas: la línea que lee la persona y la verificación de
         `seccion.rotular` al releer. El armador del SERVIDOR sí lo poblaba — otra vez el mismo dato
         calculado en dos lados y solo uno completo. */
      rotulo: (s.eyebrowOverride ?? def?.eyebrow ?? "").trim(),
      /* ⛔ El MISMO predicado que usa `LandingView` para decidir qué pinta, y el mismo que corre en
         el servidor al armar el contexto. Ver `SeccionActual.formato`: si el chat dedujera el
         formato por su cuenta, la primera divergencia sería una sección en prosa convertida en
         tarjetas — y su texto no vuelve. */
      /* ⛔ La MISMA lectura que el motor y que el servidor. Ver `datosDeSeccion`. */
      formato: formatoDeSeccion(datosDeSeccion(s.blocks)),
      /* Solo lo usa `seccion.texto`: es el cuerpo de una sección escrita en prosa. */
      bloquesDeTexto: s.blocks
        .filter((b) => b.blockType !== "CARD")
        .map((b) => ({ id: b.id, contenido: b.content ?? "" })),
    };
  });
}

/**
 * Cablea el chat con el editor de ESTE documento. Una línea por workspace.
 *
 * ⚠ `capacidades` no es decoración: ocultar tiene tres mecanismos en el motor y uno vive en otra
 * columna. Un documento que declare `puedeOcultar: true` sin tener esa puerta haría que el chat
 * diga «aplicado» sobre algo que el cliente sigue viendo.
 */
export function useEjecutarOperacionesDelChat(
  cs: ReturnType<typeof useCanvasSections>,
  defsByKey: DefsParaEjecutar,
  capacidades: CapacidadesDelDocumento,
  /**
   * Quién termina el ítem nuevo, por KEY de sección. Lo trae el workspace porque puede necesitar
   * datos que solo el navegador tiene (el directorio del equipo, un generador de ids).
   *
   * ⚠ Se lee por ref, como todo lo demás: el aplicador se registra una vez y tiene que ver el
   * directorio de AHORA, no el de cuando se montó.
   */
  completadores?: Record<string, CompletadorDeItem>,
) {
  /** Las secciones como las ve el ejecutor. Se recalcula cuando el documento cambia. */
  const secciones: SeccionActual[] = useMemo(
    () => seccionesParaElEjecutor(cs.sections, defsByKey),
    [cs.sections, defsByKey],
  );

  /* Por ref: el aplicador se registra una vez y tiene que ver SIEMPRE el documento de ahora, no el
     de cuando se montó. Sin esto, aplicar después de editar a mano escribiría sobre una foto
     vieja — y el `data` que se manda es el objeto entero de la sección. */
  const vivo = useRef({ secciones, cs, capacidades, completadores, defsByKey });
  useEffect(() => {
    vivo.current = { secciones, cs, capacidades, completadores, defsByKey };
  });

  useRegistrarAplicadorDeDocumento(async (crudas): Promise<ResultadoDelAplicador> => {
    const { secciones: secs, cs: hook, capacidades: caps, completadores: comps, defsByKey: defs } =
      vivo.current;
    const ops = crudas.filter(esOperacionDeDocumento) as OperacionDeDocumento[];
    if (ops.length === 0) {
      return { escribio: false, avisos: [], rechazadas: ["No llegó ninguna operación que este documento entienda."] };
    }

    const { plan, avisos, rechazadas } = aplicarOperacionesDeDocumento(secs, ops, caps, comps);

    /**
     * ⚠ Las creaciones van PRIMERO y en serie: el id lo genera el servidor, así que hasta que no
     * vuelve no hay a quién escribirle. Lo demás va en el orden del plan.
     *
     * ⭐ Y ahora se GUARDA lo que devuelve, indexado por el `ref` que el plan ya traía. Sin esto,
     * «creá una sección y llenala» —que es lo que el prompt le pide al modelo— creaba la sección
     * y perdía su contenido: las escrituras no tenían id al que apuntar.
     * ⛔ El id sale del POST, NUNCA de `hook.sections.find(...)`: el `refetch` es asíncrono y
     * dentro de este mismo callback puede no haber llegado.
     */
    const nacidas = new Map<string, { id: string; cardBlockId: string | null }>();
    const sinNacer: string[] = [];
    for (const e of plan) {
      if (e.tipo !== "crear") continue;
      const creada = await hook.addSection(e.titulo, e.tipoDeSeccion);
      if (creada && e.ref) nacidas.set(e.ref, { id: creada.id, cardBlockId: creada.cardBlockId });
      else if (!creada) sinNacer.push(e.titulo);
    }
    for (const e of plan) {
      switch (e.tipo) {
        case "crear":
          break;
        case "data": {
          /* Por `ref` si nació en este lote —y ahí el bloque CARD sale del POST, que ya lo
             sembró—, por id si ya existía. */
          if (e.ref) {
            const nueva = nacidas.get(e.ref);
            if (!nueva) break; /* la creación falló: ya se reporta abajo */
            await hook.upsertCardData(nueva.id, nueva.cardBlockId, e.data);
            break;
          }
          if (!e.sectionId) break;
          const s = hook.sections.find((x) => x.id === e.sectionId);
          const card = s?.blocks.find((b) => b.blockType === "CARD");
          await hook.upsertCardData(e.sectionId, card?.id ?? null, e.data);
          break;
        }
        case "texto":
          /* ⭐ El cuerpo de una sección en PROSA se escribe sobre su bloque TEXT, con el mismo
             verbo que usa el editor a mano. No es un camino de escritura nuevo: es el que ya
             existe, para el bloque que corresponde. */
          await hook.saveBlock(e.sectionId, e.blockId, { content: e.contenido });
          break;
        case "oculta":
          await hook.setHidden(e.sectionId, e.oculta);
          break;
        case "titulo":
          await hook.renameSection(e.sectionId, e.titulo);
          break;
        case "rotulo":
          await hook.setEyebrow(e.sectionId, e.rotulo);
          break;
        case "orden": {
          /* Las que nacieron en este lote entran por su `ref`; si alguna no nació, se cae de la
             lista — pero su fallo ya viaja en `rechazadas`, no en silencio. */
          const ids = e.entradas
            .map((x) => ("ref" in x ? nacidas.get(x.ref)?.id : x.sectionId))
            .filter((id): id is string => !!id);
          if (ids.length) await hook.reorderSections(ids);
          break;
        }
        case "borrar":
          await hook.removeSection(e.sectionId);
          break;
      }
    }

    /**
     * ⭐ CONFIRMAR RELEYENDO — la segunda decisión de Elías del 2026-08-23, y no cuesta un token.
     *
     * Tres veces seguidas el chat dijo «aplicado» y la pantalla no cambió. Se arregló la causa de
     * esas tres, pero el patrón «escribí y confié» seguía intacto para los otros diez documentos,
     * y su modo de falla es el peor que hay: silencioso Y con acuse de recibo.
     *
     * ⚠ `flushPending` PRIMERO: los verbos guardan optimista y sin esperar, así que releer sin
     * esperarlos leería la base ANTES de la última escritura y avisaría de un fallo inventado.
     * ⛔ Y se verifica solo lo ACEPTADO: lo rechazado ya viaja con su motivo, y volver a nombrarlo
     * acá haría que un mismo problema se lea dos veces con dos redacciones distintas.
     */
    const aplicadas = ops.filter(
      (o) =>
        !rechazadas.some((r) => r.operacion === o) &&
        /* ⚠ `.trim()`: el plan guarda el título TRIMEADO y la operación cruda puede traerlo con
           espacios. Sin esto, el mismo fallo se diría dos veces con dos redacciones distintas. */
        !(o.op === "seccion.crear" && sinNacer.includes(o.titulo.trim())),
    );
    const avisosDeVerificacion: string[] = [];
    if (aplicadas.length > 0) {
      await hook.flushPending();
      /* `null` = no se puede afirmar nada (el GET falló, o hubo escrituras más nuevas). Callarse
         es honesto; decir «no se aplicó» sobre una lectura que ya no vale sería mentir. */
      const frescas = await hook.refetch();
      if (frescas) {
        avisosDeVerificacion.push(
          ...verificarOperacionesDeDocumento(
            seccionesParaElEjecutor(frescas, defs),
            aplicadas,
            /* Las secciones cuyo ítem termina de escribir la app: ahí la identidad viva no es la
               que dijo la operación, y verificarla sería inventar un fallo. Ver el parámetro. */
            (key) => !!comps?.[key],
          ),
        );
      }
    }

    return {
      /* El plan es la lista de escrituras: si trae algo, el editor tocó el documento. */
      escribio: plan.length > 0,
      avisos: [...avisos, ...avisosDeVerificacion],
      /**
       * ⛔ Lo rechazado VIAJA AL HILO. Sin esto, «se aplicaron 3 de 5» se lee igual que «se
       * aplicaron 5» — y el modelo, que lee el hilo, propondría de nuevo lo que ya entró.
       *
       * ⚠ UNA SOLA CLAVE `rechazadas`, Y ESO ES EL ARREGLO. Acá había DOS: primero un spread
       * condicional que sumaba los «no se pudo crear «X»», y debajo esta propiedad literal. En un
       * object literal la última clave GANA, así que el spread era código muerto y una sección que
       * el servidor rechazó crear NUNCA llegaba al hilo.
       * ⛔ Y el fallo era mudo por las tres vías: el hilo no decía nada (`rechazadas` vacío ⇒
       * `ChatDelDocumento` no escribe la línea de fallo), «confirmar releyendo» tampoco —el
       * `seccion.crear` fallido se excluye de `aplicadas` a propósito—, y las escrituras de
       * contenido apuntaban al `ref` de una sección que no nació, así que hacían `break` calladas:
       * el texto que la persona aprobó se perdía sin dejar rastro.
       * ⚠ `tsc` no lo ve: con un spread en el medio, una clave repetida es LEGAL (TS2783 solo
       * dispara en el orden inverso). Lo encontró la revisión adversarial del rango, por cinco
       * lentes distintas a la vez.
       */
      rechazadas: [
        ...rechazadas.map((r) => r.motivo),
        ...sinNacer.map((t) => `no se pudo crear «${t}»`),
      ],
    };
  });
}
