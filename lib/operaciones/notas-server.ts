/**
 * lib/operaciones/notas-server.ts — las notas de la cuenta (fase 0.4). SERVER-ONLY.
 *
 * Leer va por la lectura de la memoria (lib/notas/lectura-server.ts › notasParaLaMemoria: las más nuevas, sin ir a
 * HubSpot); anotar, por el escritor único (lib/notas/escritura-server.ts › crearNota), que escribe en Nexus y después
 * en HubSpot.
 */
import "server-only";
import { z } from "zod";
import { crearNota } from "@/lib/notas/escritura-server";
import { notasParaLaMemoria } from "@/lib/notas/lectura-server";
import { ETIQUETA_DEL_CANAL, diaDeCostaRica } from "@/lib/notas/reglas";
import { nuevaNotaSchema, type NuevaNota } from "@/lib/notas/schema";
import { fmtDia } from "@/lib/cs/formato";
import { exigirCliente, type ContextoDeNexus } from "./contexto-server";
import type { OperacionQueLee, OperacionQuePropone } from "./tipos";

const idDeCliente = z.string().min(1).max(60);

export const LEER_NOTAS_DE_LA_CUENTA: OperacionQueLee<{ clientId: string }, unknown, ContextoDeNexus> = {
  nombre: "cuenta.notas",
  paraQue: "Lee las notas más nuevas de una empresa que puedes ver: lo que el equipo anotó de llamadas, correos o reuniones en persona.",
  clase: "lee",
  pide: z.object({ clientId: idDeCliente }).strict(),
  async leer(ctx, e) {
    await exigirCliente(ctx, e.clientId);
    return notasParaLaMemoria(e.clientId);
  },
};

const recortar = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);

interface DatosDeNota {
  clientId: string;
  nota: NuevaNota;
}

export const CREAR_NOTA: OperacionQuePropone<NuevaNota & { clientId: string }, DatosDeNota, { id: string }, ContextoDeNexus> = {
  nombre: "nota.crear",
  paraQue:
    "Anota en una empresa algo que pasó fuera de una reunión grabada: por dónde fue (whatsapp, llamada, correo, en persona u otro), el día y qué pasó. Queda también en HubSpot.",
  clase: "propone",
  pide: nuevaNotaSchema.extend({ clientId: idDeCliente }).strict(),
  async preparar(ctx, e) {
    const empresa = await exigirCliente(ctx, e.clientId);
    if (e.fecha > diaDeCostaRica(ctx.ahora)) return { ok: false, motivo: "La nota cuenta lo que ya pasó: la fecha no puede ser de más adelante." };
    const { clientId, ...nota } = e;
    return {
      ok: true,
      datos: { clientId, nota },
      linea: `Anotar en ${empresa.nombre} (${ETIQUETA_DEL_CANAL[e.canal]}, ${fmtDia(e.fecha)}): «${recortar(e.texto.trim(), 90)}»`,
    };
  },
  async aplicar(ctx, d) {
    const fila = await crearNota(d.clientId, { email: ctx.persona.email, rol: ctx.persona.roleEnum }, d.nota);
    return { id: (fila as { id: string }).id };
  },
};
