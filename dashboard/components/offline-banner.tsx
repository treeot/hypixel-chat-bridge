import { offlineMessage } from '@/lib/offline'

/** Pass the whole failed bridge result; the message is chosen by its status. */
export function OfflineBanner({ result }: { result: { status: number; error: string } }) {
  return (
    <div className="shell !pb-0 !pt-4">
      <div className="flash flash-error !mt-0" role="alert">
        {offlineMessage(result)}
      </div>
    </div>
  )
}
