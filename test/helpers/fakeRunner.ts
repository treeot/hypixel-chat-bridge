import type { ExecuteResult } from '../../src/core/contracts'
import type { ChatTrigger } from '../../src/minecraft'
import type { CommandRunner } from '../../src/app/features/guildCommand'

export class FakeRunner implements CommandRunner {
  online = true
  result: ExecuteResult = { ok: true }
  commands: string[] = []
  triggers: ChatTrigger[] = []

  execute(command: string): ExecuteResult {
    this.commands.push(command)
    return this.result
  }

  executeWithTriggers(command: string, regex: ChatTrigger[] = []): ExecuteResult {
    this.commands.push(command)
    this.triggers = regex
    return this.result
  }

  reply(line: string): void {
    for (const t of this.triggers) {
      const m = line.match(t.exp)
      if (m) {
        t.exec(m)
        return
      }
    }
  }
}
