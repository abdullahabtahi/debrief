'use client'

export function ChatThreadSkeleton() {
  return (
    <div className="flex flex-col gap-6 px-10 py-8 animate-pulse">
      {/* Coach opener skeleton */}
      <div className="flex flex-col gap-2 max-w-[70%]">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa]">
          Coach
        </span>
        <div className="bg-[#f0f3ff] rounded-2xl rounded-tl-sm px-5 py-4 flex flex-col gap-2">
          <div className="h-3 bg-[#dee8ff] rounded-full w-[90%]" />
          <div className="h-3 bg-[#dee8ff] rounded-full w-[75%]" />
          <div className="h-3 bg-[#dee8ff] rounded-full w-[60%]" />
        </div>
      </div>

      {/* Founder response skeleton */}
      <div className="flex flex-col items-end gap-2 max-w-[60%] self-end">
        <div className="bg-white border border-[#dee8ff] rounded-2xl rounded-tr-sm px-5 py-4 flex flex-col gap-2 w-full">
          <div className="h-3 bg-[#dee8ff] rounded-full w-[80%]" />
          <div className="h-3 bg-[#dee8ff] rounded-full w-[55%]" />
        </div>
      </div>

      {/* Second coach bubble skeleton */}
      <div className="flex flex-col gap-2 max-w-[72%]">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8899aa]">
          Coach
        </span>
        <div className="bg-[#f0f3ff] rounded-2xl rounded-tl-sm px-5 py-4 flex flex-col gap-2">
          <div className="h-3 bg-[#dee8ff] rounded-full w-[85%]" />
          <div className="h-3 bg-[#dee8ff] rounded-full w-[70%]" />
        </div>
      </div>
    </div>
  )
}
