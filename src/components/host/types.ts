import type { QuestionKind } from "@/server/domain/state";

export type DraftQuestion = {
  prompt: string;
  choices: string[];
  correct: number[];
  type: QuestionKind;
  weight: number;
  media?: { kind: "image" | "audio" | "video"; url: string } | null;
  correctNumeric?: number;
};
