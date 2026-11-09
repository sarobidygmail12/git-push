import type { ProviderError } from "../errors.js";
import type { ProviderName } from "../config/schema.js";

export type { ProviderName };

export type CommitMessageInput = {
  diff: string;
  diffTruncated: boolean;
  files: readonly { path: string; status: string }[];
  branch: string;
  convention: "conventional" | "free";
  language: string;
  rejectedMessages: readonly string[];
};

export interface CommitMessageProvider {
  readonly name: ProviderName;
  generate(input: CommitMessageInput, signal: AbortSignal): Promise<string>;
}

export type GeneratedMessage = {
  message: string;
  provider: ProviderName;
  failures: readonly ProviderError[];
};

export interface CommitMessageGenerator {
  generate(input: CommitMessageInput): Promise<GeneratedMessage>;
}
