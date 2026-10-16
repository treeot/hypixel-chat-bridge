import { NotFoundPanel } from '@/components/not-found-panel'

export const metadata = { title: 'Page not found' }

export default function NotFound() {
  return (
    <main className="shell grid min-h-screen place-items-center">
      <div className="w-full max-w-xl">
        <NotFoundPanel />
      </div>
    </main>
  )
}
