/**
 * app/not-found.tsx — el respaldo de la raíz (2026-10-06).
 *
 * Las direcciones que no existen ya no llegan acá: el shell interno y /external tienen su propio 404
 * (app/(shell)/not-found.tsx, app/external/not-found.tsx). Esto queda para un `notFound()` fuera de
 * esos dos (las rutas de impresión). Como no sabe quién mira, va neutro y siempre claro, con el mismo
 * texto que ve el cliente: nada de Nexus por si lo ve alguien de afuera.
 */
import PaginaNoEncontradaExterna from "@/components/external/PaginaNoEncontradaExterna";

export default function NoEncontrada() {
  return (
    <div data-external-surface style={{ colorScheme: "light", background: "#ffffff", minHeight: "100vh" }}>
      <PaginaNoEncontradaExterna />
    </div>
  );
}
