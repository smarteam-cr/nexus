/**
 * /para-ti — lo que le toca a cada persona en Nexus (2026-10-04, diseño «Notificaciones · diseño»).
 *
 * Sin gate: es de todo el equipo interno, y no muestra nada que la persona no pueda abrir. Junta lo que hoy está
 * repartido en cada módulo (su «Qué sigue» y su «Necesitan atención») recortado a lo SUYO —sus proyectos, sus
 * preventas, lo que le devolvieron— y a sus FRENTES («Lo que llevas», que se eligen en Equipo). A la derecha, los
 * AVISOS: lo que pasó.
 *
 * Mide fresco en cada visita (`medirParaTi`) y deja la medición guardada para el número del menú.
 */
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { medirParaTi } from "@/lib/para-ti/medir-server";
import { avisosDe } from "@/lib/para-ti/avisos-server";
import { frente } from "@/lib/para-ti/frentes";
import { plural } from "@/lib/para-ti/armar";
import ParaTiPantalla from "@/components/para-ti/ParaTiPantalla";

export const dynamic = "force-dynamic";

export default async function ParaTiPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  // Sin sesión, el shell ya mandó al inicio. Esto es una cuenta que entra pero no es del equipo: un mensaje, no un
  // redirect (el inicio la vuelve a mandar acá y quedaría dando vueltas).
  if (!ctx) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="«Para ti» es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  const alcance = await alcanceDe(ctx.teamMember);
  const [medicion, avisos, sp] = await Promise.all([medirParaTi(alcance), avisosDe(alcance.email), searchParams]);

  const partes: string[] = [];
  if (alcance.proyectos.length) partes.push(`De tus ${plural(alcance.proyectos.length, "proyecto", "proyectos")} de implementación`);
  if (alcance.frentes.length) partes.push(`${partes.length ? "y de lo que llevas" : "De lo que llevas"}: ${alcance.frentes.map((f) => frente(f).nombre).join(", ")}`);
  const resumen = partes.length ? `${partes.join(" ")}.` : "De lo tuyo en Nexus. En Equipo se elige qué más seguir.";

  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeader
        title="Para ti"
        description="Lo que te toca hoy en Nexus, lo más urgente primero. Cada cosa te lleva a la pantalla donde se hace."
      />
      <ParaTiPantalla medicion={medicion} avisos={avisos} resumen={resumen} vistaInicial={sp.ver === "equipo" ? "equipo" : "mio"} />
    </div>
  );
}
