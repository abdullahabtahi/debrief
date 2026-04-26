'use client'

import { Fragment } from 'react'
import { CoachTypingIndicator } from './CoachTypingIndicator'

interface Props {
  content: string
  isStreaming?: boolean
}

// ── Minimal markdown renderer ─────────────────────────────────────────────────
// Handles the patterns the coach agent actually produces:
//   **bold**, *italic*, `code`, bullet lists (- or *), paragraph breaks.
// Intentionally small — no external dep needed for this scope.

function renderInline(text: string): React.ReactNode {
  // Split on **bold**, *italic*, `code`
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-[#111c2d]">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="font-mono text-[12px] bg-[#e4eaff] rounded px-1 py-0.5">{part.slice(1, -1)}</code>
    }
    return <Fragment key={i}>{part}</Fragment>
  })
}

function renderContent(content: string): React.ReactNode {
  // Split into paragraphs on double newlines
  const paragraphs = content.split(/\n{2,}/)

  return paragraphs.map((para, pi) => {
    const lines = para.split('\n')
    const isBulletBlock = lines.every((l) => /^[\*\-]\s/.test(l.trim()) || l.trim() === '')

    if (isBulletBlock && lines.some((l) => /^[\*\-]\s/.test(l.trim()))) {
      return (
        <ul key={pi} className="list-none space-y-1.5 mt-0">
          {lines
            .filter((l) => /^[\*\-]\s/.test(l.trim()))
            .map((l, li) => (
              <li key={li} className="flex gap-2">
                <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#8899bb] flex-none" />
                <span>{renderInline(l.trim().replace(/^[\*\-]\s/, ''))}</span>
              </li>
            ))}
        </ul>
      )
    }

    // Mixed lines: some bullets, some text — render line by line
    const hasAnyBullet = lines.some((l) => /^[\*\-]\s/.test(l.trim()))
    if (hasAnyBullet) {
      return (
        <div key={pi} className="space-y-1">
          {lines.map((line, li) => {
            const trimmed = line.trim()
            if (!trimmed) return null
            if (/^[\*\-]\s/.test(trimmed)) {
              return (
                <div key={li} className="flex gap-2">
                  <span className="mt-[5px] w-1.5 h-1.5 rounded-full bg-[#8899bb] flex-none" />
                  <span>{renderInline(trimmed.replace(/^[\*\-]\s/, ''))}</span>
                </div>
              )
            }
            return <p key={li}>{renderInline(line)}</p>
          })}
        </div>
      )
    }

    return <p key={pi}>{renderInline(para)}</p>
  })
}

export function CoachMessage({ content, isStreaming }: Props) {
  // Show typing indicator before first token arrives
  if (isStreaming && content === '') {
    return <CoachTypingIndicator />
  }

  return (
    <div className="flex flex-col gap-1.5 max-w-[72%]">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa]">
        Coach
      </span>
      <div className="bg-[#f0f3ff] rounded-2xl rounded-tl-sm px-5 py-4 text-sm text-[#111c2d] leading-relaxed break-words space-y-3">
        {renderContent(content)}
        {isStreaming && (
          <span className="inline-block w-0.5 h-4 bg-[#8899bb] ml-0.5 align-middle animate-[blink_1s_step-end_infinite]" />
        )}
      </div>
    </div>
  )
}
