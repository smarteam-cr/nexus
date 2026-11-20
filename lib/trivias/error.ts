/**
 * lib/trivias/error.ts — el error que una ruta de /api/trivia convierte en respuesta con su código (404, 409…).
 * Aparte de http.ts para que lo usen las mutaciones sin importar nada de Next.
 */
export class ErrorDeTrivias extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
