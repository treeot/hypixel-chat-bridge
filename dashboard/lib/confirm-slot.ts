/**
 * The one open question behind useConfirm. Asking again answers the earlier question "no", and
 * closing the slot (the component unmounted) answers whatever is open "no", so no caller is left
 * waiting on a promise that never settles.
 */
export function createConfirmSlot<T>() {
  let open: { options: T; resolve: (ok: boolean) => void } | null = null
  return {
    /** The open question's options, or null. */
    get current(): T | null {
      return open?.options ?? null
    },
    ask(options: T): Promise<boolean> {
      open?.resolve(false)
      return new Promise<boolean>(resolve => {
        open = { options, resolve }
      })
    },
    /** Answers the open question; does nothing when none is open. */
    settle(ok: boolean) {
      const was = open
      open = null
      was?.resolve(ok)
    },
    close() {
      this.settle(false)
    }
  }
}
