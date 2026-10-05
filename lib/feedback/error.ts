/**
 * lib/feedback/error.ts — el error que una ruta de feedback convierte en respuesta con su código.
 *
 * Aparte de `http.ts` para que `escala-server.ts` lo use sin importar `http.ts` (que importa
 * `queries.ts`, que importa `escala-server.ts`): sin ciclos entre módulos.
 */
export class ErrorDeFeedback extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
