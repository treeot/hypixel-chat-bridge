import { bridge } from '@/lib/bridge'
import { requireRole } from '@/lib/session'

export async function GET(): Promise<Response> {
  try {
    await requireRole('admin')
  } catch {
    return Response.json({ error: 'Admins only' }, { status: 403 })
  }
  const res = await bridge.exportSettings()
  if (!res.ok) return Response.json({ error: res.error }, { status: res.status >= 400 ? res.status : 502 })
  return new Response(JSON.stringify(res.data, null, 2), {
    headers: { 'content-type': 'application/json', 'content-disposition': 'attachment; filename="bridge-settings.json"' }
  })
}
