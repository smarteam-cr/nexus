/**
 * components/escala/EscalaSinPublicar.tsx — la sección antes de que la escala esté en Nexus.
 *
 * Dos causas, cada una con su salida: falta aplicar el SQL, o falta publicar una versión.
 */
import { EmptyState } from "@/components/ui";

export default function EscalaSinPublicar({ estado, responsable }: { estado: "sin-tablas" | "sin-publicar"; responsable: boolean }) {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold text-fg">Escala de Rendimiento</h1>
      {estado === "sin-tablas" ? (
        <EmptyState
          variant="dashed"
          title="La escala todavía no está en Nexus"
          description="Falta aplicar el SQL de la escala (scripts/sql/2026-09-27-escala-lector-y-comentarios.sql) y publicar la primera versión."
        />
      ) : (
        <EmptyState
          variant="dashed"
          title="Todavía no hay una versión publicada"
          description={
            responsable
              ? "Para publicarla: $env:ALLOW_PROD_WRITE=\"1\"; $env:SIN_RESPALDO=\"1\"; npx tsx scripts/publicar-escala.ts --apply (primero, sin --apply, para ver qué publica)."
              : "Cuando el responsable de la escala publique la primera versión, aparece acá."
          }
        />
      )}
    </div>
  );
}
