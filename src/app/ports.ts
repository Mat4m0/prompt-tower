export interface TextFileSystem {
  readText(absolutePath: string): Promise<string>
  writeText(absolutePath: string, content: string): PromiseLike<void>
}

export interface Clipboard {
  writeText(text: string): PromiseLike<void>
}
