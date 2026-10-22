import type { CvContent } from "../cv/types";

/** One output the user can request from a single LLM prompt. */
export const DELIVERABLE_IDS = [
  "cv",
  "coverLetter",
  "coldEmail",
  "linkedinMessage",
] as const;

export type DeliverableId = (typeof DELIVERABLE_IDS)[number];

/** Deliverables that are plain text or structured messages, not a CV. */
export type MessageDeliverableId = Exclude<DeliverableId, "cv">;

export interface Recipient {
  name: string;
  role: string;
  company: string;
  profileUrl: string;
  about: string;
  posts: string;
  relationship: string;
  intent: string;
}

export interface DeliverableSettings {
  instructions: string;
  /** Only cold email and LinkedIn use a recipient. */
  recipient?: Recipient;
}

export interface DeliverableSelection {
  selected: DeliverableId[];
  settings: Record<DeliverableId, DeliverableSettings>;
}

export interface ColdEmailContent {
  subject: string;
  body: string;
}

/** Applied message content. The CV artifact remains `Project.cv`. */
export interface DeliverableArtifacts {
  coverLetter?: string;
  coldEmail?: ColdEmailContent;
  linkedinMessage?: string;
}

/** Minimal shape needed to tell whether a deliverable already has content. */
export interface DeliverableContentSource {
  cv: CvContent;
  artifacts?: DeliverableArtifacts;
}
