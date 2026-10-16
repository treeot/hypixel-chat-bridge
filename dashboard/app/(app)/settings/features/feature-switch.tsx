'use client'

import { useOptimistic, useTransition } from 'react'
import { Switch } from '@/components/switch'
import { useToast } from '@/components/toast'
import { toggleFeature } from './actions'

export function FeatureSwitch({
  id,
  label,
  area,
  path,
  on,
  disabled
}: {
  id: string
  label?: string
  area: string
  path: string[]
  on: boolean
  disabled: boolean
}) {
  const [optimistic, setOptimistic] = useOptimistic(on)
  const [, start] = useTransition()
  const toast = useToast()
  return (
    <Switch
      name={id}
      label={label}
      checked={optimistic}
      disabled={disabled}
      onChange={next =>
        start(async () => {
          setOptimistic(next)
          const res = await toggleFeature(area, path, next)
          if (!res.ok) toast([res.error, ...(res.issues ?? [])].join(': '), 'error')
        })
      }
    />
  )
}
