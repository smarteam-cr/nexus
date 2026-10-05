/**
 * lib/para-ti/fuente.ts — el contrato de una FUENTE de «Para ti». SERVER-ONLY por lo que importa.
 *
 * Una fuente mide, para UNA persona, una de las cosas que hoy cada módulo ya calcula en su «Qué sigue» o en su
 * «Necesitan atención». No inventa reglas: llama a las de su módulo. Si la regla del módulo cambia, «Para ti» cambia
 * con ella.
 *
 * · `frente: null` = PERSONAL: le llega a quien tiene algo propio (encargado, responsable, autor). `aplica` decide si
 *   vale la pena medirla para esta persona (si no aplica, tampoco sale en «al día»).
 * · `frente: "X"` = le llega a quien lleva ese frente. Nada más.
 */
import type { Alcance } from "./alcance-server";
import type { ClaveDeFrente } from "./frentes";
import type { Pendiente } from "./tipos";

export interface ContextoDeMedicion {
  ahora: Date;
  /** El día de hoy en Costa Rica, `YYYY-MM-DD`. */
  hoyISO: string;
}

export interface Fuente {
  clave: string;
  frente: ClaveDeFrente | null;
  /** El texto de «También revisé y está al día». */
  alDia: string;
  /** Solo las personales: ¿tiene sentido medirla para esta persona? Default: sí. */
  aplica?: (a: Alcance) => boolean;
  medir: (a: Alcance, c: ContextoDeMedicion) => Promise<Pendiente[]>;
}
