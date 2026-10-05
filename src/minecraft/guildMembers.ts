import Fuse from 'fuse.js'

export class GuildMembers {
  private set = new Set<string>()
  fuse = new Fuse<string>([])

  constructor(private getSelf: () => string | undefined) {}

  add(...names: string[]): void {
    for (const name of names) {
      if (!name) continue
      if (name === this.getSelf() || this.set.has(name)) continue
      this.set.add(name)
      this.fuse.add(name)
    }
  }

  remove(...names: string[]): void {
    for (const name of names) {
      this.set.delete(name)
      this.fuse.remove(item => item === name)
    }
  }

  get(): Set<string> {
    return this.set
  }
}
