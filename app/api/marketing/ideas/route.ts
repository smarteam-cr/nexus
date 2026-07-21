/**
 * /api/marketing/ideas — ideas de contenido generadas (salida NO-CRUD).
 * GET ?pillarId=&runId=&state=sugerida|seleccionada|utilizada (cualquier interno).
 * Las mutaciones son PATCH (estado + edición de campos) y DELETE (podar) en [id].
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { getIdeas } from "@/lib/marketing/queries";
import {
  CONTENT_IDEA_STATES,
  MARKETING_POST_TYPES,
  MARKETING_JOURNEY_STAGES,
  type ContentIdeaState,
  type MarketingPostTypeValue,
  type MarketingJourneyStageValue,
} from "@/lib/marketing/schema";

export async function GET(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const sp = req.nextUrl.searchParams;
  const stateParam = sp.get("state");
  const state = CONTENT_IDEA_STATES.includes(stateParam as ContentIdeaState)
    ? (stateParam as ContentIdeaState)
    : undefined;
  const postTypeParam = sp.get("postType");
  const postType = MARKETING_POST_TYPES.includes(postTypeParam as MarketingPostTypeValue)
    ? (postTypeParam as MarketingPostTypeValue)
    : undefined;
  const stageParam = sp.get("stage");
  const journeyStage = MARKETING_JOURNEY_STAGES.includes(stageParam as MarketingJourneyStageValue)
    ? (stageParam as MarketingJourneyStageValue)
    : undefined;
  const ideas = await getIdeas({
    pillarId: sp.get("pillarId") ?? undefined,
    runId: sp.get("runId") ?? undefined,
    state,
    postType,
    journeyStage,
  });
  return NextResponse.json({ ideas });
}
