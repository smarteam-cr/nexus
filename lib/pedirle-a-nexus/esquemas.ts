/**
 * lib/pedirle-a-nexus/esquemas.ts — lo que llega por la frontera de «✨ Pedirle a Nexus» (las rutas y, después, el
 * conector). Aparte de ./contrato.ts para que la pantalla no cargue zod (lib/auth/client-safe.test.ts, C-24).
 */
import { z } from "zod";
import { MAX_CAMBIOS } from "./contrato";

export const CambioParaAplicarSchema = z.object({
  clave: z.string().min(1).max(400),
  antes: z.string().max(4000).nullable(),
  despues: z.string().max(4000).nullable(),
});

export const CambiosParaAplicarSchema = z.array(CambioParaAplicarSchema).min(1).max(MAX_CAMBIOS);
