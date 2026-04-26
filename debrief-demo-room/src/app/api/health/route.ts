// Cloud Run startup/liveness probe target. Keep this cheap — no DB calls.
export const dynamic = 'force-dynamic'

export async function GET() {
  return Response.json({
    ok: true,
    service: 'debrief-demo-room',
    ts: new Date().toISOString(),
  })
}
