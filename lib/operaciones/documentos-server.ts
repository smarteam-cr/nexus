/**
 * lib/operaciones/documentos-server.ts — generar un ENTREGABLE del proyecto con su plantilla (fase 5 de
 * docs/nexus-sistema-de-trabajo-plan.md, 2026-10-17). SERVER-ONLY.
 *
 * Clase «propone»: el chat la deja en la lista y corre SOLO con el clic de la persona. Al aplicar, lanza la misma
 * generación que el botón «Generar» del documento (lib/entregables/lanzar-server.ts → `generarEntregable`): aparte,
 * con su corrida, su medidor y la misma celda de permiso del artifact-gate. La línea dice dónde se va a ver.
 *
 * ⛔ El proyecto se verifica contra la empresa (el `clientId` lo pone el servidor, el de la cuenta del hilo): un
 * proyecto de otra empresa no se genera desde este chat.
 *
 * El diagnóstico avisa AL PROPONER si casi nada de lo que lee está confirmado o si es un ciclo de SmartLoop sin
 * exploración (L5 etapa 3, 2026-10-24): la línea lo dice, y el clic de «aplicar» es el «generar igual» del botón. El kickoff
 * de un servicio recurrente sale sin pedirlo con la plantilla del servicio (M1).
 */
import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ENTREGABLES, TOPE_INSTRUCCIONES_DEL_PEDIDO, nombreDelEntregable, plantillaDe } from "@/lib/entregables/registro";
import { plantillaPorDefectoDelProyecto, porQueNoSePuedeGenerar } from "@/lib/entregables/generar-server";
import { loConfirmadoDelProyecto } from "@/lib/canvas/diagnostico-confirmado-server";
import { mensajeDeSupuestos } from "@/lib/canvas/diagnostico-confirmado";
import { lanzarEntregable, permisoParaGenerar, seEstaGenerando } from "@/lib/entregables/lanzar-server";
import { exigirCliente, type ContextoDeNexus } from "./contexto-server";
import type { OperacionQuePropone } from "./tipos";

const SLUGS = ENTREGABLES.map((e) => e.slug) as [string, ...string[]];

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

interface EntradaDeGenerar {
  clientId: string;
  projectId: string;
  pieza: string;
  plantilla?: string;
  instrucciones?: string;
}

interface DatosDeGenerar {
  clientId: string;
  projectId: string;
  proyecto: string;
  pieza: string;
  plantilla: string;
  instrucciones: string | null;
}

export const GENERAR_DOCUMENTO: OperacionQuePropone<EntradaDeGenerar, DatosDeGenerar, { runId: string }, ContextoDeNexus> = {
  nombre: "documento.generar",
  // Un solo literal (la guarda de lib/operaciones/operaciones.test.ts lo lee): los slugs son los de lib/entregables/registro.ts.
  paraQue:
    "Genera (o vuelve a generar) un ENTREGABLE de un proyecto de esta empresa con su plantilla, como el botón «Generar» del documento: kickoff (Kickoff), diagnosis (Diagnóstico; su plantilla es «Diagnóstico estratégico»), planning (Planificación), tech-requirements (Integraciones) o delivery (Entrega). El id del proyecto sale de la lista de proyectos del contexto. Sin plantilla, la de siempre. En instrucciones va lo que la persona pidió para esta generación, en sus palabras. Volver a generar reescribe lo que escribió la IA en ese documento: dilo al proponerlo. Corre aparte y tarda unos minutos.",
  clase: "propone",
  pide: z
    .object({
      clientId: z.string().min(1).max(60),
      projectId: z.string().min(1).max(60),
      pieza: z.enum(SLUGS),
      plantilla: z.string().min(1).max(60).optional(),
      instrucciones: z.string().max(TOPE_INSTRUCCIONES_DEL_PEDIDO).optional(),
    })
    .strict(),
  async preparar(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    const proyecto = await prisma.project.findFirst({ where: { id: e.projectId, clientId: e.clientId }, select: { id: true, name: true } });
    if (!proyecto) return { ok: false, motivo: "Ese proyecto no es de esta empresa." };
    const porDefecto = e.plantilla ? null : await plantillaPorDefectoDelProyecto(e.projectId, e.pieza).catch(() => null);
    const plantilla = plantillaDe(e.pieza, e.plantilla ?? porDefecto);
    if (!plantilla) return { ok: false, motivo: `${nombreDelEntregable(e.pieza)} no tiene la plantilla «${e.plantilla}».` };
    // Las mismas puertas que el botón, AL PROPONER: no se ofrece algo que va a fallar.
    const permiso = await permisoParaGenerar(ctx.persona, { clientId: e.clientId, projectId: e.projectId, slug: e.pieza });
    if (!permiso.ok) return { ok: false, motivo: permiso.motivo };
    const motivo = await porQueNoSePuedeGenerar(e.projectId, e.pieza);
    if (motivo) return { ok: false, motivo };
    if (await seEstaGenerando(e.projectId, e.pieza)) return { ok: false, motivo: `${nombreDelEntregable(e.pieza)} de «${proyecto.name}» ya se está generando.` };

    const documento = nombreDelEntregable(e.pieza);
    const instrucciones = e.instrucciones?.trim() || null;
    const verbo = permiso.gate?.action === "regenerate" ? "Volver a generar" : "Generar";
    const aviso = permiso.gate?.action === "regenerate" ? " (reescribe lo que escribió la IA)" : "";
    /* Lo mismo que el botón pregunta antes de generar el diagnóstico (el 409 `SUPUESTOS_SIN_VALIDAR`): acá va en la línea,
       y aplicarla es generar igual. Si el cálculo falla, no se dice nada: el aviso nunca frena. */
    const confirmado = e.pieza === "diagnosis" ? await loConfirmadoDelProyecto(e.projectId).catch(() => null) : null;
    const supuestos = confirmado?.pideConfirmacion ? ` ⚠ ${mensajeDeSupuestos(confirmado)}` : "";
    return {
      ok: true,
      datos: { clientId: e.clientId, projectId: e.projectId, proyecto: proyecto.name, pieza: e.pieza, plantilla: plantilla.id, instrucciones },
      linea:
        `${verbo} ${documento} de «${proyecto.name}» con la plantilla «${plantilla.nombre}»${aviso}` +
        `${instrucciones ? `, con tus instrucciones: «${recortar(instrucciones, 80)}»` : ""}` +
        ` — se arma en unos minutos y se ve en la ficha del cliente › ${proyecto.name} › ${documento}${supuestos}`,
    };
  },
  // El lanzador vuelve a mirar todo (proyecto, permiso, puertas, si ya corre) y tira `ErrorDelEntregable` con su motivo
  // para la persona: la capa lo reconoce por clase (lib/operaciones/contexto-server.ts).
  aplicar(ctx, d) {
    return lanzarEntregable({
      persona: ctx.persona,
      clientId: d.clientId,
      projectId: d.projectId,
      slug: d.pieza,
      plantillaId: d.plantilla,
      instrucciones: d.instrucciones,
      origen: "nexus-chat/documento",
    });
  },
};
