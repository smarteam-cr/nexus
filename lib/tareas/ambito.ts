/**
 * lib/tareas/ambito.ts — ¿para quién es una tarea? CLIENT-SAFE y puro (docs/tareas-plan.md §4.1).
 *
 * Se CALCULA, sin columna, desde lo que la tarea ya guarda (su empresa y su proyecto de HubSpot) y desde datos que
 * Nexus ya tiene: `Client.kind`, la marca `proyectoInterno` que escribe el espejo de HubSpot y el criterio de trabajo
 * interno de lib/clients (`esTrabajoInterno`). No es un clasificador nuevo (invariante #2).
 *
 *   1. el proyecto de HubSpot de la tarea es interno → interno («Interno · SICOP»), aunque HubSpot lo cierre;
 *   2. si no, la empresa es INTERNO → interno («Interno · Smarteam»);
 *   3. si no, la empresa tiene proyectos clasificables y TODOS son internos → interno con el nombre de la empresa
 *      («Interno · SmartAgro»), aunque la tarea no tenga proyecto;
 *   4. con empresa → su tipo: cliente · prospecto · aliado;
 *   5. sin empresa → «Sin clasificar». No es interno: nadie lo dijo todavía.
 */

export const AMBITOS = ["cliente", "prospecto", "aliado", "interno", "sin_clasificar"] as const;
export type Ambito = (typeof AMBITOS)[number];

export const NOMBRE_DEL_AMBITO: Record<Ambito, string> = {
  cliente: "Cliente",
  prospecto: "Prospecto",
  aliado: "Aliado",
  interno: "Interno",
  sin_clasificar: "Sin clasificar",
};

export interface EmpresaParaAmbito {
  id: string;
  nombre: string;
  /** `ClientKind`: CLIENTE · PROSPECTO · ALIADO · INTERNO. */
  kind: string;
  /** La empresa tiene al menos un proyecto clasificable y todos son internos (`esTrabajoInterno`). */
  todoInterno: boolean;
}

export interface ProyectoParaAmbito {
  id: string;
  nombre: string;
  proyectoInterno: boolean;
}

export interface AmbitoCalculado {
  ambito: Ambito;
  /** «Interno · SmartAgro», «Colby», «Sin clasificar». */
  etiqueta: string;
  /** El nombre que acompaña al ámbito (la empresa o el proyecto interno), o null. */
  nombre: string | null;
}

export function ambitoDe(empresa: EmpresaParaAmbito | null, proyecto: ProyectoParaAmbito | null): AmbitoCalculado {
  if (proyecto?.proyectoInterno) return { ambito: "interno", nombre: proyecto.nombre, etiqueta: `Interno · ${proyecto.nombre}` };
  if (!empresa) return { ambito: "sin_clasificar", nombre: null, etiqueta: NOMBRE_DEL_AMBITO.sin_clasificar };
  if (empresa.kind === "INTERNO" || empresa.todoInterno) {
    return { ambito: "interno", nombre: empresa.nombre, etiqueta: `Interno · ${empresa.nombre}` };
  }
  const ambito: Ambito = empresa.kind === "PROSPECTO" ? "prospecto" : empresa.kind === "ALIADO" ? "aliado" : "cliente";
  return { ambito, nombre: empresa.nombre, etiqueta: empresa.nombre };
}
