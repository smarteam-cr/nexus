// ── Post-processing layer between agent output and canvas card creation ──────
// Deterministic rules that clean up agent output before saving.
// Only applies to non-default canvases (Diagnóstico, Planificación, etc.)

interface RawCard {
  title: string;
  content: string;
  canvasSection?: string;
  [key: string]: unknown;
}

interface PostProcessContext {
  /** Map of section key → section label for the target canvas */
  sectionLabels: Record<string, string>;
}

/**
 * Post-process agent output cards before saving to canvas.
 * Rules:
 * 1. Strip redundant h1 from content when it matches the title
 * 2. Downgrade h1s inside content to h2 (h1 is reserved for card title)
 * 3. If card title exactly matches its section label, leave it (the agent prompt
 *    should already generate descriptive titles — this is a safety net)
 */
export function postProcessCards<T extends RawCard>(
  cards: T[],
  context: PostProcessContext
): T[] {
  return cards.map((card) => {
    let content = card.content ?? "";

    // Rule 1: Strip leading h1 that matches the card title
    const h1Match = content.match(/^#\s+(.+?)(?:\n|$)/);
    if (h1Match) {
      const h1Text = h1Match[1].trim();
      if (isSimilar(h1Text, card.title)) {
        content = content.slice(h1Match[0].length).trimStart();
      }
    }

    // Rule 2: Downgrade all h1s to h2 inside content
    content = content.replace(/^# /gm, "## ");

    // Rule 3: Strip leading h1 that matches the section label
    if (card.canvasSection && context.sectionLabels[card.canvasSection]) {
      const sectionLabel = context.sectionLabels[card.canvasSection];
      const newH1Match = content.match(/^##\s+(.+?)(?:\n|$)/);
      if (newH1Match && isSimilar(newH1Match[1].trim(), sectionLabel)) {
        content = content.slice(newH1Match[0].length).trimStart();
      }
    }

    return { ...card, content };
  });
}

/** Check if two strings are similar enough to be considered duplicates */
function isSimilar(a: string, b: string): boolean {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^a-záéíóúñü0-9\s]/g, "").trim();
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true;
  return false;
}
