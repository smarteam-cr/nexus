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
  type CapacidadesDelDocumento,
  type OperacionDeDocumento,
  type SeccionActual,
  type CompletadorDeItem,
} from "@/lib/canvas/operaciones-de-documento";
import { esCustomKey } from "@/lib/landing/custom-sections";
import { customDef } from "@/lib/landing/catalogo-de-secciones";
import { schemaParaElChat } from "@/lib/canvas/capacidades-de-documento";
import type { useCanvasSections } from "@/components/canvas/useCanvasSections";

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
    /** …pero SÍ pinta lo que el motor le pasa. Ver `BCSectionDef.leeElEncabezado`. */
    leeElEncabezado?: boolean;
    empty?: unknown;
    /** Cómo se llama cada lista en pantalla: hace legible la línea del acuerdo. */
    rotulosDeListas?: Record<string, string>;
  } | undefined
>;

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
    () =>
      cs.sections.map((s) => {
        const def =
          defsByKey[s.key] ?? (esCustomKey(s.key) ? customDef(s.key, s.label) : undefined);
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
        };
      }),
    [cs.sections, defsByKey],
  );

  /* Por ref: el aplicador se registra una vez y tiene que ver SIEMPRE el documento de ahora, no el
     de cuando se montó. Sin esto, aplicar después de editar a mano escribiría sobre una foto
     vieja — y el `data` que se manda es el objeto entero de la sección. */
  const vivo = useRef({ secciones, cs, capacidades, completadores });
  useEffect(() => {
    vivo.current = { secciones, cs, capacidades, completadores };
  });

  useRegistrarAplicadorDeDocumento(async (crudas): Promise<ResultadoDelAplicador> => {
    const { secciones: secs, cs: hook, capacidades: caps, completadores: comps } = vivo.current;
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

    return {
      /* El plan es la lista de escrituras: si trae algo, el editor tocó el documento. */
      escribio: plan.length > 0,
      avisos,
      /* ⚠ Una creación que el servidor rechazó (tope de secciones, red) se dice: sin esto el hilo
         daba por hecho que entró. */
      ...(sinNacer.length
        ? { rechazadas: [...rechazadas.map((r) => r.motivo), ...sinNacer.map((t) => `no se pudo crear «${t}»`)] }
        : {}),
      /* ⛔ Lo rechazado VIAJA AL HILO. Sin esto, «se aplicaron 3 de 5» se lee igual que «se
         aplicaron 5» — y el modelo, que lee el hilo, propondría de nuevo lo que ya entró. */
      rechazadas: rechazadas.map((r) => r.motivo),
    };
  });
}
