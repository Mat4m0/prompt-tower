import { onMounted, onUnmounted } from 'vue'
import type { WebviewToExtensionMessage, ExtensionToWebviewMessage } from '../../shared/messages'

const vscode = acquireVsCodeApi()

export function useVsCodeBridge(onMessage: (message: ExtensionToWebviewMessage) => void): {
  send: (message: WebviewToExtensionMessage) => void
} {
  const listener = (event: MessageEvent) => {
    onMessage(event.data as ExtensionToWebviewMessage)
  }
  onMounted(() => window.addEventListener('message', listener))
  onUnmounted(() => window.removeEventListener('message', listener))
  return {
    send: (message) => {
      vscode.postMessage(message)
    },
  }
}
