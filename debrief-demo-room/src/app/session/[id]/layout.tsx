import { AppShell } from '@/components/shell/AppShell'

export default async function SessionLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <AppShell sessionId={id}>{children}</AppShell>
}
