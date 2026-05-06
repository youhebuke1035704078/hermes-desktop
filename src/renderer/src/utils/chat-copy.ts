interface CopyableStructuredMessage {
  plainTexts: string[]
  thinkings: Array<{
    text: string
    summaryText?: string
  }>
  toolCalls: Array<{
    id?: string
    name: string
    command?: string
    workdir?: string
    argumentsJson?: string
    partialJson?: string
  }>
  toolResults: Array<{
    id?: string
    name?: string
    status?: string
    content: string
  }>
  validationErrors: Array<{
    toolName: string
    issues: string[]
    argumentsText?: string
  }>
  images: Array<{
    mimeType?: string
    data?: string
    mediaPath?: string
    url?: string
  }>
}

export function collectStructuredMessageContent(structured: CopyableStructuredMessage): string {
  const sections: string[] = []

  for (const text of structured.plainTexts) {
    if (text.trim()) sections.push(text.trim())
  }

  for (const thinking of structured.thinkings) {
    const text = thinking.text.trim() || thinking.summaryText?.trim()
    if (text) sections.push(`[thinking]\n${text}`)
  }

  for (const tool of structured.toolCalls) {
    const parts = [`[tool_call] ${tool.name}`]
    if (tool.id) parts.push(`id: ${tool.id}`)
    if (tool.command) parts.push(`command: ${tool.command}`)
    if (tool.workdir) parts.push(`workdir: ${tool.workdir}`)
    if (tool.argumentsJson) parts.push(`arguments:\n${tool.argumentsJson}`)
    if (tool.partialJson) parts.push(`partial:\n${tool.partialJson}`)
    sections.push(parts.join('\n'))
  }

  for (const result of structured.toolResults) {
    const parts = [`[tool_result] ${result.name || 'unknown'}`]
    if (result.id) parts.push(`id: ${result.id}`)
    if (result.status) parts.push(`status: ${result.status}`)
    if (result.content.trim()) parts.push(result.content.trim())
    sections.push(parts.join('\n'))
  }

  for (const validation of structured.validationErrors) {
    const parts = [`[validation_error] ${validation.toolName}`]
    if (validation.issues.length) parts.push(validation.issues.map((issue) => `- ${issue}`).join('\n'))
    if (validation.argumentsText) parts.push(`arguments:\n${validation.argumentsText}`)
    sections.push(parts.join('\n'))
  }

  for (const image of structured.images) {
    const ref = image.url || image.mediaPath || (image.data ? `[base64 ${image.mimeType || 'image'}]` : '')
    if (ref) sections.push(`[image] ${ref}`)
  }

  return sections.join('\n\n')
}
