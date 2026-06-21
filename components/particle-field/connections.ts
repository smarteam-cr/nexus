import type { DataNode } from "./particles";

const MIN_AGE_FOR_CONNECTION = 0.4;

export function drawConnections(
  ctx: CanvasRenderingContext2D,
  nodes: DataNode[],
  maxDist: number,
  color: string,
): void {
  const maxDistSq = maxDist * maxDist;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (a.age < MIN_AGE_FOR_CONNECTION) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (b.age < MIN_AGE_FOR_CONNECTION) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= maxDistSq) continue;

      const d = Math.sqrt(d2);
      const alpha = (1 - d / maxDist) * 0.14;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
}
