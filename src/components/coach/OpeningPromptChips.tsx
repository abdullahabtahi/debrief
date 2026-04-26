'use client'

interface Props {
  prompts: string[]
  visible: boolean
  onSelect: (prompt: string) => void
}

export function OpeningPromptChips({ prompts, visible, onSelect }: Props) {
  return (
    <div
      className={`flex flex-wrap gap-2 px-10 py-3 transition-opacity duration-300 ${
        visible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {prompts.map((prompt, i) => (
        <button
          key={i}
          onClick={() => onSelect(prompt)}
          className="text-xs text-[#334466] bg-[#f0f3ff] border border-[#dee8ff] rounded-full px-4 py-2 hover:bg-[#e4eaff] hover:border-[#c0caee] transition-colors cursor-pointer text-left max-w-[320px] truncate"
          title={prompt}
        >
          {prompt}
        </button>
      ))}
    </div>
  )
}
