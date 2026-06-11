"use client";

/**
 * PublishKickoffButton — wrapper delgado del kickoff sobre PublishSurfaceButton
 * (D.1.5 generalizó el control: mismo cuerpo para todas las superficies
 * externas, cada una con su endpoint y su copy). Se muestra solo en el canvas
 * Kickoff (lo monta ProjectCanvasPanel cuando ese canvas está activo).
 */
import { PublishSurfaceButton } from "./PublishSurfaceButton";

export function PublishKickoffButton({ projectId }: { projectId: string }) {
  return (
    <PublishSurfaceButton
      projectId={projectId}
      endpoint="publish-kickoff"
      className="mb-4"
      copy={{
        published: "Kickoff publicado al cliente",
        unpublished: "Kickoff no publicado",
        publishedHint: "El cliente con acceso (token + contraseña) ve los bloques confirmados.",
        unpublishedHint:
          "El cliente no puede ver el Kickoff aunque tenga el acceso. Publicá cuando esté listo.",
      }}
    />
  );
}
