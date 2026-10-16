import { redirect } from 'next/navigation'

// Chat relay's switches live on Features; old links land there.
export default function RelayRedirect() {
  redirect('/settings/features')
}
