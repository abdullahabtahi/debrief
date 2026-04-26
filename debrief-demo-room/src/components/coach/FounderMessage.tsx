'use client'

interface Props {
  content: string
}

export function FounderMessage({ content }: Props) {
  return (
    <div className="flex flex-col items-end gap-1.5 self-end max-w-[65%]">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa]">
        You
      </span>
      <div className="bg-white border border-[#dee8ff] rounded-2xl rounded-tr-sm px-5 py-4 text-sm text-[#111c2d] leading-relaxed whitespace-pre-wrap break-words">
        {content}
      </div>
    </div>
  )
}
