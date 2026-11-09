import { t } from "../lang/index.js";
export class GitPushError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class GitError extends GitPushError {
  readonly args: readonly string[];
  readonly exitCode: number | undefined;
  readonly stderr: string;

  constructor(message: string, details: { args?: readonly string[]; exitCode?: number; stderr?: string } = {}) {
    super(message);
    this.args = details.args ?? [];
    this.exitCode = details.exitCode;
    this.stderr = details.stderr ?? "";
  }
}

export class ConfigError extends GitPushError {
  readonly path: string;
  readonly issues: readonly string[];

  constructor(path: string, issues: readonly string[]) {
    super(t("config.invalid", { path, issues: issues.map((issue) => `  - ${issue}`).join("\n") }));
    this.path = path;
    this.issues = issues;
  }
}

export type ProviderFailureReason = "timeout" | "quota" | "missing-key" | "unavailable" | "invalid-response";

export class ProviderError extends GitPushError {
  readonly provider: string;
  readonly reason: ProviderFailureReason;

  constructor(provider: string, reason: ProviderFailureReason, detail?: string) {
    super(`${provider} : ${reason}${detail ? ` (${detail})` : ""}`);
    this.provider = provider;
    this.reason = reason;
  }
}
