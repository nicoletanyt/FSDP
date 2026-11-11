import Markdown from 'react-markdown'
import { memo } from 'react'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cleanChatReply } from '../../../supabase/functions/_shared/chat-output'

const allowedElements = [
  'p', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'br', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a',
]

const components: Components = {
  p: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  ul: ({ children }) => <ul className="list-disc space-y-1.5 pl-5">{children}</ul>,
  ol: ({ children, start }) => <ol start={start} className="list-decimal space-y-1.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="space-y-1 marker:text-muted-foreground">{children}</li>,
  h1: ({ children }) => <p className="font-semibold">{children}</p>,
  h2: ({ children }) => <p className="font-semibold">{children}</p>,
  h3: ({ children }) => <p className="font-semibold">{children}</p>,
  h4: ({ children }) => <p className="font-semibold">{children}</p>,
  h5: ({ children }) => <p className="font-semibold">{children}</p>,
  h6: ({ children }) => <p className="font-semibold">{children}</p>,
  blockquote: ({ children }) => <blockquote className="space-y-2 border-l border-border pl-3 text-muted-foreground">{children}</blockquote>,
  code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>,
  pre: ({ children }) => <pre className="max-w-full overflow-x-auto whitespace-pre-wrap rounded-md bg-muted p-2 [&_code]:bg-transparent [&_code]:p-0">{children}</pre>,
  hr: () => <hr className="border-border" />,
  table: ({ children }) => <div role="region" aria-label="Table in assistant reply" tabIndex={0} className="max-w-full overflow-x-auto rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-ring">
    <table className="w-full min-w-96 border-collapse text-left text-xs leading-relaxed">{children}</table>
  </div>,
  thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
  tbody: ({ children }) => <tbody className="[&_tr:last-child_td]:border-b-0">{children}</tbody>,
  th: ({ children }) => <th scope="col" className="border-b px-3 py-2 align-top font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b px-3 py-2 align-top">{children}</td>,
  // Navigation is supplied separately by the server, never by model-generated
  // URLs. Preserve link labels as text; images and raw HTML are not rendered.
  a: ({ children }) => <span>{children}</span>,
}

function ChatMarkdown({ content }: { content: string }) {
  return <div data-chat-markdown className="min-w-0 space-y-3 [overflow-wrap:anywhere]">
    <Markdown remarkPlugins={[remarkGfm]} allowedElements={allowedElements} components={components} skipHtml urlTransform={() => ''}>
      {cleanChatReply(content) || 'No answer was returned. Please retry.'}
    </Markdown>
  </div>
}

export default memo(ChatMarkdown)
