/**
 * app/(shell)/escala/probar/page.tsx — PROBAR LA ESCALA CON CUALQUIER EMPRESA (N2, 2026-10-26).
 *
 * Antes de publicar la 9.0 se prueba la escala con empresas reales (decisión 13 de docs/escala/pendiente-9-0.md).
 * Cualquiera del equipo elige una empresa que pueda ver (o llega desde su ficha o su preventa con `?cliente=`), mira el
 * nivel que le da la escala en cada área y guarda dónde cree que está. Los super admin ven, además, cómo va la prueba:
 * cuántas empresas, de qué industrias y en cuántas coinciden. Wherex no se prueba nunca.
 */
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert, Button, EmptyState, Field, Input, PageHeader } from "@/components/ui";
import PruebaDeUnaEmpresa from "@/components/escala/prueba/PruebaDeUnaEmpresa";
import ResumenDeLaPrueba from "@/components/escala/prueba/ResumenDeLaPrueba";
import { requireAccessToClient } from "@/lib/auth/access";
import { requireInternalUser } from "@/lib/auth/supabase";
import { EMPRESAS_EN_LA_LISTA, empresasParaProbar, resumenDeLaPrueba } from "@/lib/escala/prueba/servidor";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const metadata: Metadata = { title: "Probar la escala" };

type Params = Record<string, string | string[] | undefined>;
const uno = (sp: Params, k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null);

export default async function ProbarLaEscala({ searchParams }: { searchParams: Promise<Params> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const sp = await searchParams;
  const cliente = uno(sp, "cliente");
  const q = uno(sp, "q") ?? "";
  const superAdmin = ctx.role === "SUPER_ADMIN";

  // Con una empresa elegida, las mismas reglas de acceso de su ficha.
  const conAcceso = cliente ? await requireAccessToClient(cliente).then(() => true).catch(() => false) : false;
  const [{ empresas, hayMas }, resumen] = await Promise.all([
    cliente ? Promise.resolve({ empresas: [], hayMas: false }) : empresasParaProbar(ctx.user, q),
    superAdmin ? resumenDeLaPrueba() : Promise.resolve(null),
  ]);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Probar la escala"
        description="Elige una empresa, mira el nivel que le da la escala en Ventas, Marketing y Servicio, y anota dónde crees que está. Así se junta la prueba para publicar la próxima versión."
        backHref="/escala"
        backLabel="Escala de Rendimiento"
      />
      <div className="space-y-6">
        {cliente ? (
          <>
            <Link href="/escala/probar" className="text-sm font-medium text-brand hover:underline">
              ← Elegir otra empresa
            </Link>
            {conAcceso ? (
              <PruebaDeUnaEmpresa clientId={cliente} exploracionInicial={uno(sp, "exploracion")} />
            ) : (
              <Alert variant="danger">No tienes acceso a esa empresa, o no existe.</Alert>
            )}
          </>
        ) : (
          <section className="space-y-4">
            <form method="get" className="flex flex-wrap items-end gap-2">
              <Field label="Buscar una empresa" className="min-w-[260px] flex-1">
                <Input name="q" defaultValue={q} placeholder="Escribe parte del nombre" />
              </Field>
              <Button type="submit">Buscar</Button>
            </form>
            {hayMas && (
              <p className="text-xs text-fg-muted">
                Se ven las primeras {EMPRESAS_EN_LA_LISTA}, por nombre. Escribe parte del nombre para encontrar la que buscas.
              </p>
            )}
            {empresas.length === 0 ? (
              <EmptyState
                title={q ? "Ninguna empresa con ese nombre" : "No hay empresas para probar"}
                description="Salen las empresas que puedes ver y que tienen una preventa o una exploración, que es de donde salen los niveles. Una empresa sin ellas se ubica primero en su ficha, en La escala › «Actualizar escala»."
              />
            ) : (
              <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                {empresas.map((e) => (
                  <li key={e.id}>
                    <Link href={`/escala/probar?cliente=${e.id}`} className="flex flex-wrap items-baseline justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-surface-hover">
                      <span className="font-medium text-fg">{e.nombre}</span>
                      <span className="text-fg-muted">{e.industria ?? "Sin industria"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {resumen && (
          <section className="space-y-4 border-t border-line pt-6">
            <div>
              <h2 className="text-sm font-semibold text-fg">Cómo va la prueba</h2>
              <p className="text-xs text-fg-muted">Solo lo ven los super admin. Cuenta la última comparación de cada empresa y área.</p>
            </div>
            <ResumenDeLaPrueba resumen={resumen} />
          </section>
        )}
      </div>
    </div>
  );
}
