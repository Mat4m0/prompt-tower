import ignore from "ignore";

export interface IgnorePatternGroups {
  builtin: readonly string[];
  gitignore: readonly string[];
  contextignore: readonly string[];
  towerignore: readonly string[];
  manual: readonly string[];
}

export function createIgnoreMatcher(patterns: IgnorePatternGroups): ignore.Ignore {
  const matcher = ignore();
  matcher.add(patterns.builtin);
  matcher.add(patterns.gitignore);
  matcher.add(patterns.contextignore);
  matcher.add(patterns.towerignore);
  matcher.add(patterns.manual);
  return matcher;
}

export function isRelativePathIgnored(
  relativePath: string,
  patterns: IgnorePatternGroups
): boolean {
  return createIgnoreMatcher(patterns).ignores(normalizeIgnorePath(relativePath));
}

export function normalizeIgnorePath(relativePath: string): string {
  return relativePath.replace(/\\/g, "/");
}
