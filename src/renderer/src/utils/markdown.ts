import MarkdownIt from 'markdown-it'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function renderSimpleMarkdown(text: string): string {
  if (!text) return ''
  return md.render(text)
}

export function extractTocHeadings(text: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = []
  const lines = text.split('\n')
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim() })
    }
  }
  return headings
}
