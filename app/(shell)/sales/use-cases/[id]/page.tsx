/**
 * /sales/use-cases/[id] — la ficha de un caso del catálogo (diseño «Catálogo de casos de uso», tablero «Caso»).
 *
 * Lo que dice el cliente cuando lo necesita, lo que obtiene y los criterios de la escala que cumple al terminar,
 * palabra por palabra de la escala publicada. A la derecha, cuándo conviene, qué hace falta antes, los servicios y
 * dónde se usa. Las licencias y el precio llegan en la fase 2. La nota interna del caso (`aviso`) no se muestra.
 */
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccionesDelCaso } from "@/components/casos-de-uso/AccionesDelCaso";
import { ChipDeHerramienta, PuntoDeNivel, Salto } from "@/components/casos-de-uso/piezas";
import { PageHeader } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { casoPorId } from "@/lib/casos-de-uso/catalogo";
import { escalaDelCatalogo } from "@/lib/casos-de-uso/escala-server";
import {
  criteriosPorDimension,
  NOMBRE_DEL_TIPO,
  nombreDeLaDimension,
  nombreDelArea,
  nombreDelNivel,
  saltosPorArea,
  type EscalaDelCatalogo,
} from "@/lib/casos-de-uso/vista";
import type { Letra } from "@/lib/escala/documento/tipos";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const NIVELES_DE_RESPALDO: EscalaDelCatalogo["niveles"] = [
  { letra: "D", nombre: "Deficiente" },
  { letra: "I", nombre: "Inicial" },
  { letra: "F", nombre: "Funcional" },
  { letra: "E", nombre: "Eficiente" },
  { letra: "O", nombre: "Óptimo" },
];

const TARJETA = "flex flex-col gap-3 rounded-xl border border-line bg-surface p-5";
const LATERAL = "flex flex-col gap-2 rounded-xl border border-line bg-surface p-4";

export default async function CasoDeUsoPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const [ventas, preventa] = await Promise.all([can(ctx.teamMember, "ventas", "read"), can(ctx.teamMember, "preventa", "read")]);
  if (!ventas && !preventa) redirect("/clients");

  const { id } = await params;
  const caso = casoPorId(id);
  if (!caso) notFound();

  const leida = await escalaDelCatalogo();
  const escala = leida?.escala ?? null;
  const niveles = escala?.niveles ?? NIVELES_DE_RESPALDO;
  const nombre = (l: Letra) => nombreDelNivel({ niveles }, l);
  const area = (a: string) => (escala ? nombreDelArea(escala, a) : `Área ${a}`);
  const dimension = (d: string) => (escala ? nombreDeLaDimension(escala, d) : d);
  const saltos = saltosPorArea(caso);
  const requeridos = (caso.requiere ?? []).map((r) => casoPorId(r)).filter((c): c is NonNullable<typeof c> => !!c);
  const dentroDe = caso.dentroDe ? casoPorId(caso.dentroDe) : undefined;
  const primeraDimension = caso.mueve[0]?.dimension;

  const dondeSeUsa = saltos.length
    ? `La preventa lo sugiere en «Casos de uso» cuando ${saltos.map((s) => `${area(s.area)} está en ${nombre(s.desde)}`).join(" o ")}. La propuesta comercial lo toma como punto de partida.`
    : "La preventa y la propuesta comercial lo suman junto a otro caso: no mueve la escala por sí solo.";

  return (
    <div className={SHELL_DEFAULT}>
      <div className="mx-auto flex max-w-[1180px] flex-col gap-6">
        <header className="flex flex-col gap-2.5">
          <PageHeader className="mb-0" backHref="/sales/use-cases" backLabel="Casos de uso" title={caso.titulo} action={<AccionesDelCaso casoId={caso.id} titulo={caso.titulo} />} />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line bg-surface-hover px-[9px] py-px text-xs font-medium text-fg-secondary">{NOMBRE_DEL_TIPO[caso.tipo]}</span>
            {caso.areas.map((a) => (
              <span key={a} className="rounded-full border border-line bg-surface px-[9px] py-px text-xs font-medium text-fg-secondary">
                {area(a)}
              </span>
            ))}
            {/* Smarteam no se nombra: está en todos los casos. */}
            {caso.herramientas
              .filter((h) => h !== "smarteam")
              .map((h) => (
                <ChipDeHerramienta key={h} herramienta={h} grande />
              ))}
          </div>
          <p className="mt-1 max-w-[820px] text-lg leading-[27px] text-fg-secondary">{caso.promesa}</p>
          <p className="max-w-[820px] text-sm leading-[22px] text-fg-muted">{caso.descripcion}</p>
        </header>

        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
            <section className={TARJETA}>
              <div className="flex flex-col gap-0.5">
                <h2 className="text-sm font-semibold text-fg">Lo que dice el cliente cuando lo necesita</h2>
                <span className="text-xs text-fg-muted">Si lo escuchas en una reunión, este caso puede servir.</span>
              </div>
              <ul className="flex flex-col gap-2">
                {caso.sintomas.map((s) => (
                  <li key={s} className="text-sm text-fg-secondary">
                    «{s}»
                  </li>
                ))}
              </ul>
            </section>

            <section className={TARJETA}>
              <h2 className="text-sm font-semibold text-fg">Lo que obtiene</h2>
              <ul className="flex flex-col gap-2.5">
                {caso.obtienes.map((o) => (
                  <li key={o} className="flex gap-2.5 text-sm text-fg">
                    <span aria-hidden="true" className="flex-none text-fg-muted">
                      ✓
                    </span>
                    {o}
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                  <h2 className="text-sm font-semibold text-fg">Lo que mueve en la escala</h2>
                  <span className="text-xs text-fg-muted">
                    {caso.mueve.length
                      ? `Los criterios que el cliente cumple al terminar. Son los de la escala ${escala?.version ?? "publicada"}, palabra por palabra.`
                      : "Ninguno: este caso no mueve la escala, acompaña a otro."}
                  </span>
                </div>
                {primeraDimension && (
                  <Link href={`/sales/use-cases?vista=escala&dimension=${primeraDimension}`} className="text-xs text-brand hover:text-brand-light">
                    Ver en la escala
                  </Link>
                )}
              </div>

              {saltos.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-line bg-surface-muted px-3.5 py-3">
                  {saltos.map((s) => (
                    <div key={s.area} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="w-[76px] text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{area(s.area)}</span>
                      <Salto desde={s.desde} hasta={s.hasta} nombre={nombre} />
                      <span className="text-fg-muted">· {s.dimensiones === 1 ? "1 dimensión" : `${s.dimensiones} dimensiones`}</span>
                    </div>
                  ))}
                </div>
              )}

              {criteriosPorDimension(caso).map(({ movimiento, criterios }) => (
                <div key={movimiento.dimension} className="flex flex-col gap-2.5 border-t border-line pt-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] tabular-nums text-fg-muted">{movimiento.dimension}</span>
                    <span className="text-sm font-semibold text-fg">{dimension(movimiento.dimension)}</span>
                    <Salto className="ml-auto" desde={movimiento.desde} hasta={movimiento.hasta} nombre={nombre} />
                  </div>
                  <div className="flex flex-col gap-2">
                    {criterios.map((c) => (
                      <div key={c} className="grid grid-cols-[76px_1fr] gap-2.5 text-[13px] leading-[19px] text-fg-secondary">
                        <span className="inline-flex items-center gap-[5px] self-start text-xs tabular-nums text-fg-muted">
                          <PuntoDeNivel letra={c.split(".")[2][0] as Letra} className="h-1.5 w-1.5" />
                          {c}
                        </span>
                        {leida?.criterios[c] ?? <span className="text-fg-muted">No está en la escala publicada.</span>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>

          <aside className="flex max-w-[340px] flex-[1_1_300px] flex-col gap-3">
            {caso.cuandoConviene && (
              <section className={LATERAL}>
                <span className={ROTULO_DEL_SISTEMA}>Cuándo conviene</span>
                <span className="text-[13px] text-fg-secondary">{caso.cuandoConviene}</span>
              </section>
            )}

            {requeridos.length > 0 && (
              <section className={LATERAL}>
                <span className={ROTULO_DEL_SISTEMA}>Antes hace falta</span>
                {requeridos.map((r) => (
                  <TarjetaDeOtroCaso key={r.id} caso={r} area={area} nombre={nombre} />
                ))}
              </section>
            )}

            {dentroDe && (
              <section className={LATERAL}>
                <span className={ROTULO_DEL_SISTEMA}>Es una parte de</span>
                <TarjetaDeOtroCaso caso={dentroDe} area={area} nombre={nombre} />
              </section>
            )}

            <section className={LATERAL}>
              <span className={ROTULO_DEL_SISTEMA}>Servicios de Smarteam</span>
              <div className="flex flex-wrap gap-1.5">
                {caso.servicios.map((s) => (
                  <span key={s} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
                    {s}
                  </span>
                ))}
              </div>
            </section>

            <section className="flex flex-col gap-1 rounded-xl border border-dashed border-line bg-surface-muted p-4">
              <span className={ROTULO_DEL_SISTEMA}>Licencias y precio</span>
              <span className="text-[13px] text-fg-muted">Falta: llegan en la fase 2. Mientras tanto, los pone Ventas en la propuesta.</span>
            </section>

            <section className={LATERAL}>
              <span className={ROTULO_DEL_SISTEMA}>Dónde se usa</span>
              <span className="text-[13px] text-fg-secondary">{dondeSeUsa}</span>
            </section>

            <p className="px-1 text-xs text-fg-muted">
              Catálogo v1 · se edita en el repositorio. Si algo no calza con un cliente, usa «Sugerir un cambio».
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}

function TarjetaDeOtroCaso({
  caso,
  area,
  nombre,
}: {
  caso: NonNullable<ReturnType<typeof casoPorId>>;
  area: (a: string) => string;
  nombre: (l: Letra) => string;
}) {
  const saltos = saltosPorArea(caso);
  return (
    <Link href={`/sales/use-cases/${caso.id}`} className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5 text-fg transition-colors hover:border-fg-muted/40">
      <span className="text-[13px] font-semibold">{caso.titulo}</span>
      {saltos.map((s) => (
        <span key={s.area} className="inline-flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
          {area(s.area)}
          <Salto desde={s.desde} hasta={s.hasta} nombre={nombre} />
        </span>
      ))}
    </Link>
  );
}
