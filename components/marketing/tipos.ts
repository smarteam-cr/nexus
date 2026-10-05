/**
 * components/marketing/tipos.ts — las formas que devuelven las APIs de Marketing, tal como las lee la pantalla.
 * (Las fechas llegan como string ISO: son JSON.)
 */
import type {
  ContentIdeaState,
  MarketingJourneyStageValue,
  MarketingPostTypeValue,
  MarketingUsageTargetValue,
} from "@/lib/marketing/marketing-ui";

export interface FuenteDeIdea {
  post: {
    id: string;
    url: string | null;
    authorName: string | null;
    postedAt: string;
    source: { label: string | null; profileUrl: string };
  };
}

export interface IdeaRow {
  id: string;
  title: string;
  copy: string;
  imageConcept: string;
  postType: MarketingPostTypeValue;
  journeyStage: MarketingJourneyStageValue | null;
  acceptedFor: MarketingUsageTargetValue | null;
  acceptedByName: string | null;
  suggestedPillarName: string | null;
  pillar: { id: string; name: string } | null;
  selectedAt: string | null;
  usedAt: string | null;
  discardedAt: string | null;
  hubspotDraftAt: string | null;
  sources: FuenteDeIdea[];
  createdAt: string;
}

export interface ConteoPorTipo {
  total: number;
  EMPRESA: number;
  PERSONA: number;
}

export type ConteosDeIdeas = Record<ContentIdeaState, ConteoPorTipo>;

export interface CanalSocial {
  channelKey: string;
  type: string;
  name: string;
}

export type CampoEditable = "title" | "copy" | "imageConcept";
