// Output Verification Loop (agentic pattern)
//
// LLMs cite "exact quotes" as evidence in the debrief. Sometimes those quotes
// are paraphrased or hallucinated. We deterministically check each quoted span
// against the source corpus (pitch transcript + Q&A turns). When a quote
// can't be grounded, we strip the quotation marks and tag it as paraphrased
// so the founder is never misled about what they actually said.

import type { DebriefOutput, Issue } from '@/agents/debrief'

const QUOTE_RE = /"([^"]{6,400})"/g // require 6+ chars to avoid trivial matches

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface EvidenceCorpus {
  transcript: string
  qaText: string
}

export interface VerifyResult {
  output: DebriefOutput
  unverifiedCount: number
  verifiedCount: number
}

function sanitizeEvidence(evidence: string, normCorpus: string): { text: string; unverified: number; verified: number } {
  let unverified = 0
  let verified = 0
  const replaced = evidence.replace(QUOTE_RE, (_full, quoted: string) => {
    const needle = normalize(quoted)
    if (!needle) return _full
    if (normCorpus.includes(needle)) {
      verified++
      return `"${quoted}"`
    }
    unverified++
    // Strip quotes; mark as paraphrased so the founder isn't misled
    return `${quoted} (paraphrased)`
  })
  return { text: replaced, unverified, verified }
}

function sanitizeIssues(issues: Issue[], normCorpus: string): { issues: Issue[]; unverified: number; verified: number } {
  let totalUnverified = 0
  let totalVerified = 0
  const out = issues.map((iss) => {
    const { text, unverified, verified } = sanitizeEvidence(iss.evidence ?? '', normCorpus)
    totalUnverified += unverified
    totalVerified += verified
    return { ...iss, evidence: text }
  })
  return { issues: out, unverified: totalUnverified, verified: totalVerified }
}

export function verifyDebriefEvidence(output: DebriefOutput, corpus: EvidenceCorpus): VerifyResult {
  const normCorpus = normalize(`${corpus.transcript}\n${corpus.qaText}`)
  const narrative = sanitizeIssues(output.narrative_issues ?? [], normCorpus)
  const delivery = sanitizeIssues(output.delivery_issues ?? [], normCorpus)
  const qa = sanitizeIssues(output.qa_vulnerabilities ?? [], normCorpus)

  return {
    output: {
      ...output,
      narrative_issues: narrative.issues,
      delivery_issues: delivery.issues,
      qa_vulnerabilities: qa.issues,
    },
    unverifiedCount: narrative.unverified + delivery.unverified + qa.unverified,
    verifiedCount: narrative.verified + delivery.verified + qa.verified,
  }
}
