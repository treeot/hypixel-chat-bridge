'use client'

import { useEffect, useRef } from 'react'

/** On a sideways-scrolling nav, bring the aria-current item into the middle whenever `key` changes. */
export function useCenterActive<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const nav = ref.current
    const active = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !active || nav.scrollWidth <= nav.clientWidth) return
    const box = nav.getBoundingClientRect()
    const item = active.getBoundingClientRect()
    nav.scrollLeft += item.left - box.left - (box.width - item.width) / 2
  }, [key])
  return ref
}
