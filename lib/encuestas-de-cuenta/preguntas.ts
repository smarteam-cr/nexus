/**
 * lib/encuestas-de-cuenta/preguntas.ts — el registro de las preguntas sobre la cuenta (2026-10-13). CLIENT-SAFE.
 *
 * Lo que Customer Success sabe de cada cliente y nadie anota, preguntado al entrar a su ficha. Cada persona responde
 * por los clientes que ve; con «No sé», se le vuelve a preguntar la primera vez que entra después de unos días.
 *
 * Sumar una pregunta = una entrada acá (la burbuja, los resultados y la exportación salen solos). Cambiar lo que
 * pregunta = subir `version`: a quien ya respondió se le vuelve a preguntar, y cada respuesta guarda la versión y el
 * texto con que se hizo (RespuestaDeCuenta), así lo viejo se sigue leyendo bien.
 */

export const VALORES_DE_RESPUESTA = ["si", "no", "no_se"] as const;
export type ValorDeRespuesta = (typeof VALORES_DE_RESPUESTA)[number];

export const EVENTOS = ["mostrada", "respondida", "ahora_no"] as const;
export type EventoDeRespuesta = (typeof EVENTOS)[number];

export interface PreguntaSobreLaCuenta {
  /** Estable: va en la base. No se cambia nunca. */
  clave: string;
  /** Sube cuando cambia lo que se pregunta. */
  version: number;
  pregunta: string;
  descripcion: string;
  respuestas: { valor: ValorDeRespuesta; rotulo: string }[];
  /** A quién se le pregunta (TeamRole). */
  roles: readonly string[];
  /** Con «No sé», cuántos días esperar para volver a preguntar. */
  diasParaVolverConNoSe: number;
  /** Con «Ahora no», cuántos días esperar. */
  diasParaVolverConAhoraNo: number;
  /** Sin fila en EncuestaDeCuenta, ¿está activa? */
  activaPorDefecto: boolean;
}

export const PREGUNTAS_SOBRE_LA_CUENTA: readonly PreguntaSobreLaCuenta[] = [
  {
    clave: "apertura-asesoria",
    version: 1,
    pregunta: "¿Este cliente tiene apertura a la asesoría?",
    descripcion:
      "Es decir: no solo nos pide cosas para implementar, también quiere nuestra guía sobre qué hacer, en qué orden y por qué.",
    respuestas: [
      { valor: "si", rotulo: "Sí" },
      { valor: "no", rotulo: "No" },
      { valor: "no_se", rotulo: "No sé" },
    ],
    roles: ["CSE", "CSL"],
    diasParaVolverConNoSe: 7,
    diasParaVolverConAhoraNo: 1,
    activaPorDefecto: true,
  },
];

export interface PreguntaParaMostrar {
  clave: string;
  version: number;
  pregunta: string;
  descripcion: string;
  respuestas: { valor: ValorDeRespuesta; rotulo: string }[];
  /** Por qué se pregunta otra vez (para decirlo en la burbuja). */
  motivo: "nunca" | "no-sabia" | "despues" | "version-nueva";
  /** El nombre del cliente, para la burbuja. */
  cliente: string;
}

export function preguntaDe(clave: string): PreguntaSobreLaCuenta | null {
  return PREGUNTAS_SOBRE_LA_CUENTA.find((p) => p.clave === clave) ?? null;
}

export function rotuloDe(p: PreguntaSobreLaCuenta, valor: string | null): string {
  return p.respuestas.find((r) => r.valor === valor)?.rotulo ?? "—";
}
