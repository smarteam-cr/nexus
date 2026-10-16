/**
 * /para-ti/correo — el correo de la mañana, en vista previa (etapa 4e de docs/mi-dia-plan.md, paso 1 de 4).
 *
 * Muestra el correo que le llegaría a la persona: sus reuniones de hoy (con «Preparar») y como mucho 5 cosas de su
 * «Para ti». NO SE ENVÍA: el paso 2 (mandárselo a una persona) llega cuando el equipo lo haya revisado. El armado es
 * puro (`lib/mi-dia/correo.ts`) y lee lo mismo que «Para ti»: nada que la persona no vea ahí, nunca Finanzas ni plata.
 */
import { headers } from "next/headers";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EmptyState, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { alcanceDe } from "@/lib/para-ti/alcance-server";
import { medirParaTi } from "@/lib/para-ti/medir-server";
import { agendaDeHoy } from "@/lib/mi-dia/agenda-server";
import { veLaAgenda } from "@/lib/equipos/registro";
import { armarCorreoDeLaManana, MAX_COSAS } from "@/lib/mi-dia/correo";
import { crDateParts } from "@/lib/jobs/time";
import { fechaLarga } from "@/lib/ventas/negocios";

export const dynamic = "force-dynamic";

async function baseDeNexus(): Promise<string> {
  if (process.env.APP_URL) return process.env.APP_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3005";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export default async function CorreoDeLaMananaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) {
    return (
      <div className={SHELL_DEFAULT}>
        <EmptyState title="El correo de la mañana es del equipo de Smarteam" description="Tu cuenta no está vinculada a una persona del equipo." />
      </div>
    );
  }
  const alcance = await alcanceDe(ctx.teamMember);
  const ahora = new Date();
  const hoyISO = crDateParts(ahora).dateKey;
  const [medicion, agenda, base] = await Promise.all([
    medirParaTi(alcance, ahora),
    veLaAgenda(alcance.rol) ? agendaDeHoy(alcance.email, ahora).catch(() => null) : Promise.resolve(null),
    baseDeNexus(),
  ]);
  const correo = armarCorreoDeLaManana({
    nombre: alcance.nombre,
    fechaLarga: fechaLarga(hoyISO),
    reuniones: agenda?.estado === "ok" ? agenda.reuniones : null,
    paraTi: medicion,
    base,
  });
  const sinAgenda = veLaAgenda(alcance.rol) && agenda?.estado !== "ok";

  return (
    <div className={`${SHELL_DEFAULT} space-y-6`}>
      <PageHeader
        title="Tu correo de la mañana"
        backHref="/para-ti"
        backLabel="Para ti"
        badges={<ChipDeCabecera>Vista previa · no se envía</ChipDeCabecera>}
        description={`Así te llegaría cada mañana: tus reuniones de hoy y como mucho ${MAX_COSAS} cosas de «Para ti». Todavía no se manda; primero lo revisamos.`}
      />

      <article className="mx-auto max-w-2xl overflow-hidden rounded-xl border border-line bg-surface">
        <header className="space-y-1 border-b border-line bg-surface-muted px-5 py-3 text-xs text-fg-muted">
          <p>
            <span className="font-semibold text-fg-secondary">Para:</span> {alcance.email}
          </p>
          <p>
            <span className="font-semibold text-fg-secondary">Asunto:</span> <span className="text-fg">{correo.asunto}</span>
          </p>
        </header>
        <div className="space-y-5 px-5 py-4 text-[13px] text-fg-secondary">
          <p className="text-fg">{correo.saludo}</p>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Tus reuniones de hoy</h2>
            {sinAgenda ? (
              <p className="text-xs text-fg-muted">No se pudo leer tu calendario: el correo saldría sin las reuniones.</p>
            ) : correo.reuniones.length === 0 ? (
              <p>No tienes reuniones hoy.</p>
            ) : (
              <ul className="space-y-1.5">
                {correo.reuniones.map((r) => (
                  <li key={`${r.hora}-${r.texto}`} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular-nums text-fg-muted">{r.hora}</span>
                    <span className="text-fg">{r.texto}</span>
                    {r.detalle && <span className="text-fg-muted">· {r.detalle}</span>}
                    <Link href={r.href} className="text-xs font-semibold text-brand hover:text-brand-light">
                      Preparar
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-fg">Para hoy</h2>
            {correo.cosas.length === 0 ? (
              <p>Nada urgente.</p>
            ) : (
              <ul className="space-y-1.5">
                {correo.cosas.map((c) => (
                  <li key={c.href + c.texto}>
                    <Link href={c.href} className="text-fg hover:text-brand">
                      {c.texto}
                    </Link>
                    {c.detalle && <span className="text-xs text-fg-muted"> · {c.detalle}</span>}
                  </li>
                ))}
              </ul>
            )}
            {correo.mas > 0 && (
              <p className="text-xs text-fg-muted">
                Y {correo.mas} {correo.mas === 1 ? "cosa más" : "cosas más"} en{" "}
                <Link href="/para-ti" className="font-semibold text-brand hover:text-brand-light">
                  «Para ti»
                </Link>
                .
              </p>
            )}
          </section>
        </div>
      </article>

      <details className="mx-auto max-w-2xl text-xs text-fg-muted">
        <summary className="cursor-pointer">Ver el texto tal como se mandaría</summary>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg border border-line bg-surface-muted p-3 font-sans text-fg-secondary">{correo.texto}</pre>
      </details>
    </div>
  );
}
