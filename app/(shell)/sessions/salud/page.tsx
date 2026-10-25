/**
 * /sessions/salud — «Salud de las reuniones» (T1 del roadmap; diseño aprobado por Elías el 2026-10-25).
 *
 * Cada reunión con alguien de fuera: si dejó texto (transcripción o solo notas de Gemini), si Nexus sabe de qué empresa
 * es y si ya se leyó; y si no dejó nada, por qué y de quién es el arreglo. Cuatro vistas (`?vista=`) y tres periodos
 * (`?dias=14|30|90`, 14 por defecto: el del indicador 4 y de INV47).
 *
 * Quién ve qué (el gate): la líder de Customer Success y dirección (`esLiderDeCs`, lib/cs/acceso.ts, por rol y fuera de
 * la matriz, como el resto del área) ven a todo el equipo; cada persona del equipo ve solo las suyas (las que organizó o
 * a las que la invitaron), también en los números. Una reunión de una empresa que quien mira no puede abrir se ve sin
 * enlace (su página daría «no encontrada»). `?todas=<fila>` abre todas las reuniones de esa fila. Son hechos: ninguna IA.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { Alert, PageHeader } from "@/components/ui";
import { ChipDeCabecera } from "@/components/cs/piezas";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { cn } from "@/lib/cn";
import { HORAS_SIN_EMPRESA, direccionDeLaSalud, leerVistaDeLaSalud } from "@/lib/sessions/salud-de-las-reuniones";
import { saludDeLasReuniones } from "@/lib/sessions/salud-de-las-reuniones-server";
import { PeriodoDeLaSalud, PestanasDeLaSalud } from "@/components/sessions/salud/ControlesDeLaSalud";
import { MotivosSinTexto, NumerosDelPeriodo, ReunionesSinEmpresa, TablaDeGrupos } from "@/components/sessions/salud/TableroDeSalud";
import TusReuniones from "@/components/sessions/salud/TusReuniones";

export const dynamic = "force-dynamic";

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function SaludDeLasReunionesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const sp = await searchParams;
  const { vista, dias } = leerVistaDeLaSalud({ vista: primero(sp.vista), dias: primero(sp.dias) });
  const veTodo = esLiderDeCs(ctx.role);
  const email = ctx.teamMember.email.toLowerCase();
  const ahora = new Date();

  const verTodas = primero(sp.todas) ?? null;
  // Quien ve solo las suyas tiene, para comparar, el porcentaje de todo el equipo (solo el número, nada por persona).
  const { salud, delEquipo } = await saludDeLasReuniones({ dias, soloDe: veTodo ? null : email, teamMemberId: ctx.teamMember.id, verTodas, ahora });
  const t = salud.totales;
  const vencidas = t.sinEmpresaVencidas;
  const nav = { vista, dias };

  return (
    <div className={cn(SHELL_DEFAULT, "space-y-6")}>
      <PageHeader
        title={veTodo ? "Salud de las reuniones" : "Salud de tus reuniones"}
        backHref="/sessions"
        backLabel="Sesiones"
        badges={<ChipDeCabecera>{veTodo ? "Ves a todo el equipo" : "Solo tus reuniones"}</ChipDeCabecera>}
        description={
          veTodo
            ? "Cada reunión con alguien de fuera: si dejó texto, si Nexus sabe de qué empresa es y si ya se leyó."
            : "Las que organizaste o a las que te invitaron, con alguien de fuera: si dejaron texto, de qué empresa son y si ya se leyeron."
        }
        action={<PeriodoDeLaSalud vista={vista} dias={dias} />}
      />

      {t.sinEmpresaVencidas > 0 && (
        <Alert
          variant="warning"
          title={
            vencidas === 1
              ? `${veTodo ? "Una reunión" : "Una de tus reuniones"} con texto lleva más de ${HORAS_SIN_EMPRESA} horas sin empresa.`
              : `${vencidas} ${veTodo ? "" : "de tus "}reuniones con texto llevan más de ${HORAS_SIN_EMPRESA} horas sin empresa.`
          }
        >
          Hasta que alguien decida de quién son, lo que se habló no entra al contexto de ningún cliente.{" "}
          {vista !== "sin-empresa" && (
            <Link href={direccionDeLaSalud("sin-empresa", dias)} className="font-semibold underline">
              {vencidas === 1 ? "Verla →" : `Verlas (primero las de más de ${HORAS_SIN_EMPRESA} horas) →`}
            </Link>
          )}
        </Alert>
      )}

      <NumerosDelPeriodo c={t} soloTuyas={!veTodo} delEquipo={delEquipo} onVerMotivos={direccionDeLaSalud("motivos", dias)} />

      <PestanasDeLaSalud vista={vista} dias={dias} soloTuyas={!veTodo} sinEmpresa={t.sinEmpresa} />

      {vista === "personas" &&
        (veTodo ? (
          <TablaDeGrupos
            tipo="persona"
            titulo="Reuniones de cada persona"
            ayuda="Cuenta las que organizó o a las que la invitaron. Primero, quien dejó menos texto."
            filas={salud.personas}
            nav={nav}
          />
        ) : (
          <TusReuniones reuniones={salud.reuniones} dias={dias} />
        ))}
      {vista === "empresas" && (
        <TablaDeGrupos
          tipo="empresa"
          titulo="Reuniones de cada empresa"
          ayuda={`${salud.empresas.length} ${salud.empresas.length === 1 ? "empresa tuvo" : "empresas tuvieron"} reuniones en estos ${dias} días. Primero, las que dejaron menos texto.`}
          filas={salud.empresas}
          nav={nav}
        />
      )}
      {vista === "motivos" && <MotivosSinTexto grupos={salud.motivos} total={t.sinNada} nav={nav} />}
      {vista === "sin-empresa" && <ReunionesSinEmpresa reuniones={salud.sinEmpresa} />}
    </div>
  );
}
