/**
 * app/(shell)/escala/comentarios/page.tsx — la bandeja: todos los comentarios de la escala.
 *
 * La ve todo el equipo; el responsable de la escala, además, cambia estados y exporta los cambios
 * pendientes. El texto de cada ancla se resuelve contra la versión VIGENTE, así la bandeja marca
 * los comentarios cuyo texto cambió (o que ya no existe).
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { resolverAncla } from "@/lib/escala/documento/anclas";
import { leerDocumentoPublicado, leerEscalaVigente } from "@/lib/escala/documento/vigente";
import { leerCongelamiento } from "@/lib/escala/documento/manual";
import { comentariosDisponibles, listarComentarios } from "@/lib/escala/comentarios/consultas";
import { esResponsable } from "@/lib/escala/comentarios/reglas";
import Bandeja, { type AnclaEnLaBandeja } from "@/components/escala/Bandeja";
import EscalaSinPublicar from "@/components/escala/EscalaSinPublicar";

export const metadata: Metadata = { title: "Comentarios de la escala" };

export default async function BandejaDeLaEscala() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");

  const vigente = await leerEscalaVigente();
  const responsable = esResponsable(ctx.user.email);
  if (vigente.estado !== "ok" || !comentariosDisponibles()) {
    return (
      <div className={SHELL_DEFAULT}>
        <EscalaSinPublicar estado={vigente.estado === "ok" ? "sin-tablas" : vigente.estado} responsable={responsable} />
      </div>
    );
  }

  const [comentarios, manual] = await Promise.all([listarComentarios({}), leerDocumentoPublicado("manual")]);
  const anclas: Record<string, AnclaEnLaBandeja> = {};
  for (const id of new Set(comentarios.flatMap((c) => [c.ancla, c.dimension]))) {
    const r = resolverAncla(vigente.escala, id);
    anclas[id] = r ? { ruta: r.ruta, texto: r.texto, area: r.area.slug } : { ruta: null, texto: null, area: null };
  }

  return (
    <div className={SHELL_DEFAULT}>
      <Bandeja
        comentarios={comentarios}
        anclas={anclas}
        areas={vigente.escala.areas.map((a) => ({ id: a.id, nombre: a.nombre, slug: a.slug }))}
        version={vigente.escala.version}
        yo={{ email: ctx.user.email, nombre: ctx.teamMember.name, foto: ctx.teamMember.photoUrl }}
        esResponsable={responsable}
        congelamiento={leerCongelamiento(manual?.texto)}
      />
    </div>
  );
}
