// Pure logic extracted from judge/page.tsx — testable without React or Supabase

export type TrafficLight = 'bg-red-500' | 'bg-amber-400' | 'bg-green-500'

/**
 * Assigns a traffic-light colour to a judge brief dimension value.
 * RED  → value is blank or contains a known vulnerability flag
 * AMBER → value is too short to be meaningful (<20 chars)
 * GREEN → value is substantive and has no red flags
 */
export function getTrafficLight(text: string | null | undefined): TrafficLight {
  const t = (text ?? '').toUpperCase().trim()
  if (
    !t ||
    t.includes('MISSING') ||
    t.includes('UNVALIDATED') ||
    t.includes('UNADDRESSED') ||
    t.includes('VULNERABLE')
  ) {
    return 'bg-red-500'
  }
  if (t.length < 20) return 'bg-amber-400'
  return 'bg-green-500'
}

export interface JudgeDimension {
  label: string
  val: string | null | undefined
}

export type ReadinessLevel = 'ready' | 'caution' | 'vulnerable'

/**
 * Returns true if all dimensions are green — no red lights.
 * @deprecated Use getReadinessLevel for 3-tier assessment.
 */
export function isReadyForRoom(dimensions: JudgeDimension[]): boolean {
  return dimensions.every((d) => getTrafficLight(d.val) !== 'bg-red-500')
}

/**
 * 3-tier overall readiness:
 * - vulnerable: any red (unaddressed, missing, or flagged weakness)
 * - caution:    no red, but at least one amber (thin/vague answer)
 * - ready:      all green
 */
export function getReadinessLevel(dimensions: JudgeDimension[]): ReadinessLevel {
  const lights = dimensions.map((d) => getTrafficLight(d.val))
  if (lights.some((l) => l === 'bg-red-500')) return 'vulnerable'
  if (lights.some((l) => l === 'bg-amber-400')) return 'caution'
  return 'ready'
}
