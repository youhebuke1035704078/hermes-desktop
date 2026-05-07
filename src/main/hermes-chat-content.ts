function chunkValueToText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .map((item) => chunkValueToText(item))
      .filter((item) => item.trim().length > 0)
      .join('\n')
  }
  if (!value || typeof value !== 'object') return ''
  const row = value as Record<string, unknown>
  return chunkValueToText(row.text ?? row.content ?? row.output ?? row.message ?? row.delta ?? '')
}

export function extractAssistantContentFromChunk(chunkData: unknown): string {
  if (!chunkData || typeof chunkData !== 'object') return ''
  const row = chunkData as Record<string, unknown>

  const choices = Array.isArray(row.choices) ? row.choices : []
  const firstChoice = choices[0]
  if (firstChoice && typeof firstChoice === 'object') {
    const choice = firstChoice as Record<string, unknown>
    const deltaText = chunkValueToText(choice.delta)
    if (deltaText) return deltaText
    const messageText = chunkValueToText(choice.message)
    if (messageText) return messageText
    const text = chunkValueToText(choice.text)
    if (text) return text
  }

  const responseDelta = chunkValueToText(row.delta)
  if (responseDelta) return responseDelta
  const responseText = chunkValueToText(row.output_text ?? row.text ?? row.content ?? row.message)
  if (responseText) return responseText

  return ''
}
