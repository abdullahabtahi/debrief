#!/usr/bin/env node
// Smoke test: token route + Gemini Live connect + first message.
//
// Usage:
//   SESSION_ID=<uuid in pitch_recorded state> node scripts/test-qa-live.mjs
//
// Optional:
//   APP_BASE=http://localhost:3000   (default)

import { GoogleGenAI, Modality } from '@google/genai'

const APP_BASE = process.env.APP_BASE ?? 'http://localhost:3000'
const SESSION_ID = process.env.SESSION_ID

if (!SESSION_ID) {
  console.error('❌ SESSION_ID env var required (must be a session in pitch_recorded state)')
  process.exit(1)
}

function log(label, ...rest) {
  console.log(`[${new Date().toISOString().slice(11, 23)}] ${label}`, ...rest)
}

async function main() {
  // ── 1. Hit token route ──────────────────────────────────────────────
  log('STEP 1', 'POST /api/qa/token')
  const tokenRes = await fetch(`${APP_BASE}/api/qa/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: SESSION_ID }),
  })

  const tokenBody = await tokenRes.json().catch(() => null)
  if (!tokenRes.ok) {
    console.error('❌ Token route failed:', tokenRes.status, tokenBody)
    process.exit(1)
  }
  log('  ✓ token route OK', { model: tokenBody.model, qa_session_id: tokenBody.qa_session_id, token_prefix: String(tokenBody.access_token).slice(0, 16) + '...' })

  // ── 2. Init GoogleGenAI with ephemeral token ─────────────────────────
  log('STEP 2', 'GoogleGenAI init (v1alpha, ephemeral token)')
  const ai = new GoogleGenAI({
    apiKey: tokenBody.access_token,
    httpOptions: { apiVersion: 'v1alpha' },
  })

  // ── 3. Open Live session ────────────────────────────────────────────
  log('STEP 3', `live.connect model=${tokenBody.model}`)
  const messages = []
  let firstMessageResolve
  const firstMessage = new Promise((r) => { firstMessageResolve = r })

  let session
  try {
    session = await ai.live.connect({
      model: tokenBody.model,
      config: {
        responseModalities: [Modality.TEXT], // text-only for this smoke (mic/audio not relevant)
      },
      callbacks: {
        onopen:    () => log('  ✓ ws onopen'),
        onmessage: (m) => {
          messages.push(m)
          firstMessageResolve?.(m)
          firstMessageResolve = null
        },
        onerror:   (e) => log('  ⚠ ws onerror', e?.message ?? e),
        onclose:   (e) => log('  ⚠ ws onclose', { code: e?.code, reason: e?.reason }),
      },
    })
  } catch (err) {
    console.error('❌ live.connect threw:', err?.message ?? err)
    process.exit(1)
  }
  log('  ✓ session opened')

  // ── 4. Send a text turn ─────────────────────────────────────────────
  log('STEP 4', 'sendClientContent: ping')
  session.sendClientContent({
    turns: [{ role: 'user', parts: [{ text: 'You are a hackathon judge. Reply in one short sentence: ready?' }] }],
    turnComplete: true,
  })

  // ── 5. Wait for first server response (10s timeout) ─────────────────
  log('STEP 5', 'awaiting first server message (10s timeout)')
  const winner = await Promise.race([
    firstMessage.then(() => 'message'),
    new Promise((r) => setTimeout(() => r('timeout'), 10_000)),
  ])

  if (winner === 'timeout') {
    console.error('❌ Timed out waiting for first server message')
    session.close()
    process.exit(1)
  }
  log('  ✓ first message received')

  // ── 6. Drain a few more messages so we see the model output ─────────
  await new Promise((r) => setTimeout(r, 4000))
  log('STEP 6', `messages received: ${messages.length}`)

  for (const [i, m] of messages.entries()) {
    const txt = m?.serverContent?.modelTurn?.parts?.map((p) => p.text).filter(Boolean).join('') ?? ''
    const turnComplete = m?.serverContent?.turnComplete ? ' [turnComplete]' : ''
    if (txt) log(`  msg ${i}:`, txt + turnComplete)
  }

  session.close()
  console.log('\n✅ PASS — Q&A live pipeline reachable end-to-end.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Unhandled error:', err)
  process.exit(1)
})
