import { IconAlert } from '@/components/icons'
import { ErrorText } from '@/components/error-copy'
import { offlineError } from '@/lib/offline'

/**
 * The one bridge-down banner, shown by the app layout under the top bar. Pages that hit a
 * failed call render an EmptyState instead, so an outage never stacks two banners.
 * Pass the whole failed bridge result; the copy is chosen by its status, with technical detail folded away.
 */
export function OfflineBanner({ result }: { result: { status: number; error: string } }) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 sm:px-6">
      <div className="flash flash-error !mt-0" role="alert">
        <IconAlert className="mt-0.5 shrink-0" />
        <ErrorText copy={offlineError(result)} />
      </div>
    </div>
  )
}
