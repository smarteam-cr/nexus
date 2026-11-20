/**
 * /trivia/play/[code] — la partida en el teléfono del jugador (a esta URL lleva el QR de la pantalla del anfitrión).
 *
 * Fuera del shell a propósito (sin menú: es un teléfono) y SIN el permiso de Trivias: juega cualquiera del equipo.
 * Sin sesión, el portero ya manda al login recordando esta ruta; la guarda de acá cubre lo mismo por si acaso, y una
 * sesión que no es del equipo ve un aviso en vez de la partida.
 */
import { redirect } from "next/navigation";
import { AvisoDelJuego, PantallaDelJugador } from "@/components/trivias/PantallaDelJugador";
import { ForbiddenError, UnauthorizedError, requireInternalUser } from "@/lib/auth/supabase";
import { triviasDisponible } from "@/lib/trivias/disponible";
import { normalizarCodigo } from "@/lib/trivias/reglas";

export const dynamic = "force-dynamic";

export default async function PartidaDelJugadorPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  let ctx: Awaited<ReturnType<typeof requireInternalUser>> | null;
  try {
    ctx = await requireInternalUser();
  } catch (e) {
    if (e instanceof UnauthorizedError) redirect(`/?next=${encodeURIComponent(`/trivia/play/${code}`)}`);
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

  const codigo = normalizarCodigo(code);
  if (!codigo) {
    return (
      <AvisoDelJuego
        icono="buscar"
        titulo="Ese código no es de una partida"
        texto="El código de una partida tiene 6 letras y números. Revísalo en la pantalla de la trivia."
        enlaceAEntrar
      />
    );
  }
  // «k7m-2qx» y «K7M2QX» son la misma partida: una sola URL.
  if (codigo !== code) redirect(`/trivia/play/${codigo}`);

  if (!(await triviasDisponible())) {
    return (
      <AvisoDelJuego
        icono="reloj"
        titulo="Las trivias todavía no están disponibles"
        texto="Avísale a quien conduce la trivia: Nexus todavía no tiene listo este módulo."
      />
    );
  }

  return <PantallaDelJugador codigo={codigo} nombre={ctx.teamMember.name} />;
}
