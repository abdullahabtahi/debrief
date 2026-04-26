import { getSupabase } from './supabase'

export interface TranscribeInput {
  session_id:          string
  pitch_recording_id:  string
}

interface TranscriptQuality {
  word_count:     number
  estimated_wpm?: number
  filler_word_pct: number
}

const FILLER_WORDS = ['um', 'uh', 'like', 'you know']
const STT_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes

// mimeType → STT encoding mapping (spec table)
function sttEncoding(mimeType: string): { encoding: string; sampleRateHertz: number } {
  if (mimeType.startsWith('video/mp4') || mimeType.startsWith('video/quicktime')) {
    return { encoding: 'MP4', sampleRateHertz: 16000 }
  }
  // default: webm/opus
  return { encoding: 'WEBM_OPUS', sampleRateHertz: 48000 }
}

function computeQuality(transcript: string, durationSeconds: number | null): TranscriptQuality {
  const words = transcript.trim().split(/\s+/).filter(Boolean)
  const word_count = words.length

  let estimated_wpm: number | undefined
  if (durationSeconds && durationSeconds > 0) {
    estimated_wpm = Math.round(word_count / (durationSeconds / 60))
  }

  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z ]/g, ''))
  let fillerCount = 0
  for (const w of lowerWords) {
    if (FILLER_WORDS.includes(w)) fillerCount++
  }
  // "you know" is two words — count bigrams
  for (let i = 0; i < lowerWords.length - 1; i++) {
    if (`${lowerWords[i]} ${lowerWords[i + 1]}` === 'you know') fillerCount++
  }
  const filler_word_pct = word_count > 0 ? Math.round((fillerCount / word_count) * 100) / 100 : 0

  return { word_count, ...(estimated_wpm !== undefined ? { estimated_wpm } : {}), filler_word_pct }
}

async function generateCoachingTip(opts: {
  extracted_summary: Record<string, unknown>
  transcript_preview: string
  apiKey?: string
  projectId?: string
  location: string
}): Promise<string> {
  const { extracted_summary, transcript_preview, apiKey, projectId, location } = opts

  const prompt = `You are a pitch coach. In exactly one sentence, give this founder the single most important thing to prepare for before facing investor Q&A about this pitch.

PROJECT SUMMARY:
${JSON.stringify(extracted_summary, null, 2)}

PITCH OPENING (first 500 chars):
${transcript_preview}

Respond with exactly one sentence. No preamble. No "Here's my advice:". Just the sentence.`

  if (apiKey) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    )
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  }

  if (projectId) {
    const { VertexAI } = await import('@google-cloud/vertexai')
    const vertex = new VertexAI({ project: projectId, location })
    const model = vertex.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    return result.response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? ''
  }

  return ''
}

// transcribeInline — called in dev mode when Cloud Tasks is not configured.
// Mirrors the exact steps of the Cloud Tasks handler.
export async function transcribeInline(input: TranscribeInput): Promise<void> {
  const { session_id, pitch_recording_id } = input
  const supabase = getSupabase()

  const { data: recording } = await supabase
    .from('pitch_recordings')
    .select('mime_type, video_gcs, duration_seconds')
    .eq('id', pitch_recording_id)
    .single()

  if (!recording) {
    console.error('[transcribe] recording not found:', pitch_recording_id)
    return
  }

  const bucket    = process.env.GCS_BUCKET_NAME
  const apiKey    = process.env.VERTEX_AI_API_KEY
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  const location  = process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1'

  let transcript = ''

  if (bucket && (apiKey || projectId)) {
    // Real STT pipeline
    try {
      const { SpeechClient } = await import('@google-cloud/speech')
      const speech = new SpeechClient()
      const gcsUri = recording.video_gcs
      if (!gcsUri) throw new Error('Missing video_gcs path')

      const { encoding, sampleRateHertz } = sttEncoding(recording.mime_type ?? '')

      const [operation] = await speech.longRunningRecognize({
        config: {
          encoding:         encoding as Parameters<typeof speech.longRunningRecognize>[0]['config']['encoding'],
          sampleRateHertz,
          languageCode:     'en-US',
          model:            'chirp_3',
          enableWordTimeOffsets: false,
        },
        audio: { uri: gcsUri },
      })

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('STT timeout')), STT_TIMEOUT_MS)
      )

      const [response] = await Promise.race([
        operation.promise(),
        timeoutPromise,
      ]) as [Awaited<ReturnType<typeof operation.promise>>, never]

      transcript = (response.results ?? [])
        .map((r) => r.alternatives?.[0]?.transcript ?? '')
        .join(' ')
        .trim()
    } catch (err) {
      console.error('[transcribe] STT error:', err)
      await supabase
        .from('pitch_recordings')
        .update({ status: 'failed' })
        .eq('id', pitch_recording_id)
      return
    }
  } else {
    // Dev stub — simulate a short transcript
    transcript = 'This is a development stub transcript. In production, Google Cloud Speech-to-Text v2 Chirp 3 will transcribe the actual recording here. The founder would normally hear their full pitch transcribed word for word, enabling delivery metrics and Q&A preparation.'
  }

  // Step 1: Write transcript
  await supabase
    .from('pitch_recordings')
    .update({ transcript })
    .eq('id', pitch_recording_id)

  // Step 2: Compute and write quality metrics (best-effort)
  try {
    const quality = computeQuality(transcript, recording.duration_seconds)
    await supabase
      .from('pitch_recordings')
      .update({ transcript_quality: quality })
      .eq('id', pitch_recording_id)
  } catch (err) {
    console.error('[transcribe] quality computation error:', err)
  }

  // Step 3: Generate coaching tip inline (best-effort — never blocks status=ready)
  try {
    const { data: projectBrief } = await supabase
      .from('project_briefs')
      .select('extracted_summary')
      .eq('session_id', session_id)
      .eq('is_active', true)
      .maybeSingle()

    if (projectBrief?.extracted_summary) {
      const tip = await generateCoachingTip({
        extracted_summary: projectBrief.extracted_summary as Record<string, unknown>,
        transcript_preview: transcript.slice(0, 500),
        apiKey,
        projectId,
        location,
      })
      if (tip) {
        await supabase
          .from('sessions')
          .update({ coaching_tip: tip })
          .eq('id', session_id)
      }
    }
  } catch (err) {
    console.error('[transcribe] coaching tip error:', err)
  }

  // Step 4: Mark ready and advance session state
  await supabase
    .from('pitch_recordings')
    .update({ status: 'ready' })
    .eq('id', pitch_recording_id)

  await supabase
    .from('sessions')
    .update({ state: 'pitch_recorded' })
    .eq('id', session_id)
}
