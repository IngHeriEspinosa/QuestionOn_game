import type { PublicState } from "@/server/domain/state";

export type PlayerState = PublicState;
export type PlayerQuestion = NonNullable<PublicState["question"]>;
