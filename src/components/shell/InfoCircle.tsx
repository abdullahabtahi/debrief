'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

const AXES = [
  { name: 'VC',             desc: 'Probes market size, defensibility, and whether your traction story holds up under pressure.' },
  { name: 'Domain Expert',  desc: 'Tests whether you actually understand the technical trade-offs and edge cases in your own solution.' },
  { name: 'User Advocate',  desc: 'Questions whether the problem is real, the pain is specific, and whether real users would actually switch.' },
  { name: 'Fracture Map',   desc: 'A post-Q&A breakdown of every weak point in your pitch, ranked by how badly it would hurt you on Demo Day.' },
]

export function InfoCircle() {
  const [open, setOpen] = useState(false)

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md ring-1 ring-gray-100 transition-transform hover:scale-105"
        aria-label="Evaluation framework info"
      >
        <Info className="h-4 w-4 text-gray-500" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 8 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 right-0 w-72 rounded-2xl bg-white p-5 shadow-lg ring-1 ring-gray-100"
          >
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Evaluation Framework
            </h3>
            <ul className="space-y-3">
              {AXES.map(({ name, desc }) => (
                <li key={name}>
                  <p className="text-xs font-semibold text-[#111c2d]">{name}</p>
                  <p className="text-xs text-gray-500">{desc}</p>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
