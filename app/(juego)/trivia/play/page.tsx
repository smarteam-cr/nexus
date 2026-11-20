/**
 * /trivia/play — el jugador escribe el código de la partida que muestra la pantalla de la trivia.
 *
 * Fuera del shell a propósito (sin menú: es un teléfono) y SIN el permiso de Trivias: juega cualquiera del equipo.
 */
import { redirect } from "next/navigation";
import { EntrarConCodigo } from "@/components/trivias/EntrarConCodigo";
import { AvisoDelJuego } from "@/components/trivias/PantallaDelJugador";
import { ForbiddenError, UnauthorizedError, requireInternalUser } from "@/lib/auth/supabase";

export const dynamic = "force-dynamic";

export default async function EntrarATriviaPage() {
  let ctx: Awaited<ReturnType<typeof requireInternalUser>> | null;
  try {
    ctx = await requireInternalUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect(`/?next=${encodeURIComponent("/trivia/play")}`);
    // Sesión sin usuario del equipo (o cuenta desactivada): un aviso. Cualquier otra falla (la base) sube al error.
    if (!(e instanceof ForbiddenError)) throw e;
    ctx = null;
  }
  if (!ctx) {
    return (
      <AvisoDelJuego
        icono="candado"
        titulo="Esta trivia es para el equipo de Smarteam"
        texto="Entra a Nexus con tu cuenta de Smarteam para jugar."
      />
    );
  }

  return <EntrarConCodigo />;
}
