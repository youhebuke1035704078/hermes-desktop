export async function writeTextToClipboard(text: string): Promise<void> {
  const value = typeof text === 'string' ? text : String(text ?? '')
  if (!value) return

  try {
    await navigator.clipboard.writeText(value)
    return
  } catch {
    // Electron renderers may not expose a usable navigator.clipboard depending
    // on protocol/permission state. Fall back to main-process clipboard IPC.
  }

  if (window.api?.clipboardWriteText) {
    const result = await window.api.clipboardWriteText(value)
    if (result?.ok) return
    throw new Error(result?.error || 'Clipboard write failed')
  }

  throw new Error('Clipboard API unavailable')
}
