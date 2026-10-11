'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

type Toast = { id: number; message: string; tone: 'ok' | 'error' }

const ToastContext = createContext<((message: string, tone?: Toast['tone']) => void) | null>(null)

/**
 * Bottom-right confirmations for form actions.
 *
 * The server actions redirect-free revalidate the page, so a save is otherwise silent —
 * the fields look identical before and after and there is nothing to tell you it landed.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: Toast['tone'] = 'ok') => {
    // Date.now() collides when two forms settle in the same millisecond; the random
    // suffix only has to be unique among the two or three toasts on screen.
    const id = Date.now() + Math.random()
    setToasts(current => [...current, { id, message, tone }])
  }, [])

  // Stable, so a new toast doesn't restart the timers of the ones already showing.
  const dismiss = useCallback((id: number) => setToasts(current => current.filter(t => t.id !== id)), [])

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col items-end gap-2">
        {toasts.map(toast => (
          <ToastItem key={toast.id} toast={toast} onDone={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDone }: { toast: Toast; onDone: (id: number) => void }) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    // Two frames: mount at opacity 0, then flip, so the transition actually runs.
    const raf = requestAnimationFrame(() => setShown(true))
    const timer = setTimeout(() => onDone(toast.id), 3200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [onDone, toast.id])

  return (
    <div
      role="status"
      className={`pointer-events-auto rounded-md border bg-surface px-4 py-2.5 text-[13px] shadow-lg transition-all duration-200 ${
        shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
      } ${toast.tone === 'error' ? 'border-[hsl(var(--danger)/0.4)] text-[hsl(var(--danger))]' : 'border-border text-foreground'}`}
    >
      {toast.message}
    </div>
  )
}

/** No-ops outside a provider so a component can be rendered in isolation. */
export function useToast() {
  return useContext(ToastContext) ?? (() => {})
}
