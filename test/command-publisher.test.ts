import { describe, expect, it, vi } from 'vitest'
import { CommandPublisher } from '../src/app/commandPublisher'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(r => (resolve = r))
  return { promise, resolve }
}

describe('CommandPublisher', () => {
  it('ignores account changes before the first publish (it reads the current list anyway)', async () => {
    const publish = vi.fn(async () => undefined)
    const publisher = new CommandPublisher(publish, vi.fn())
    await publisher.changed()
    expect(publish).not.toHaveBeenCalled()
    await publisher.start()
    expect(publish).toHaveBeenCalledOnce()
  })

  it('a reconcile that lands during the first publish still republishes, after it, never in parallel', async () => {
    const first = deferred()
    const order: string[] = []
    let running = 0
    const publish = vi.fn(async () => {
      running++
      expect(running).toBe(1)
      order.push(`start ${publish.mock.calls.length}`)
      if (publish.mock.calls.length === 1) await first.promise
      order.push(`end ${publish.mock.calls.length}`)
      running--
    })
    const publisher = new CommandPublisher(publish, vi.fn())
    const started = publisher.start()
    await Promise.resolve()
    void publisher.changed()
    void publisher.changed()
    first.resolve()
    await started
    expect(publish).toHaveBeenCalledTimes(2)
    expect(order).toEqual(['start 1', 'end 1', 'start 2', 'end 2'])
  })

  it('changes after start republish once per burst and report failures without throwing', async () => {
    const onError = vi.fn()
    const publish = vi.fn(async () => undefined)
    const publisher = new CommandPublisher(publish, onError)
    await publisher.start()
    publish.mockRejectedValueOnce(new Error('rate limited'))
    await publisher.changed()
    expect(onError).toHaveBeenCalledOnce()
    await publisher.changed()
    expect(publish).toHaveBeenCalledTimes(3)
  })

  it('a failed first publish fails start', async () => {
    const publisher = new CommandPublisher(async () => Promise.reject(new Error('no application')), vi.fn())
    await expect(publisher.start()).rejects.toThrow('no application')
  })
})
