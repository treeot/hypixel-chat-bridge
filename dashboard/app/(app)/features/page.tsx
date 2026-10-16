import { redirect } from 'next/navigation'

// Features moved under Settings; old links and bookmarks land there.
export default function FeaturesRedirect() {
  redirect('/settings/features')
}
