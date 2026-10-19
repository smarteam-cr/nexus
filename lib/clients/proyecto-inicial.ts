/**
 * lib/clients/proyecto-inicial.ts — en qué proyecto abre la ficha del cliente. PURO.
 *
 * Con UN proyecto real la ficha abre en él. Con varios abría siempre en la cuenta, y quien lleva uno de ellos tenía que
 * elegirlo en el riel. Cemaco (2026-10-19): llegó de HubSpot un proyecto de Desarrollo llamado «CEMACO » y la ficha dejó
 * de abrir en «Cemaco Internacional - CRM», el de Liliana Moreno. Entró al nuevo, lo vio vacío (sin cronograma, sin
 * kickoff, sin handoff) y creyó que había perdido su trabajo, que seguía intacto en el otro.
 *
 * Ahora, con varios, abre en el proyecto cuyo encargado en HubSpot (`hubspotOwnerEmail`) es quien mira, si es uno solo.
 * Un proyecto de prueba nunca cuenta para abrir solo. Si quien mira lleva varios o ninguno, abre en la cuenta (null).
 */

export interface ProyectoParaAbrir {
  id: string;
  esPrueba: boolean;
  hubspotOwnerEmail: string | null;
}

function normalizar(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** El id del proyecto en que abre la ficha, o null para abrir en la cuenta. */
export function proyectoQueAbreLaFicha(proyectos: ProyectoParaAbrir[], emailDeQuienMira: string | null | undefined): string | null {
  const reales = proyectos.filter((p) => !p.esPrueba);
  if (reales.length === 1) return reales[0].id;
  const yo = normalizar(emailDeQuienMira);
  if (!yo) return null;
  const mios = reales.filter((p) => normalizar(p.hubspotOwnerEmail) === yo);
  return mios.length === 1 ? mios[0].id : null;
}
