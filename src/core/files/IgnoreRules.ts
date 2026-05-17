export function normalizeIgnorePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/')
}
