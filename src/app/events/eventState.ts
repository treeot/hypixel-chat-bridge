import { EventStateRepo, type EventStateDoc } from '../../storage/repos/eventState'
import type { Store } from '../../storage/store'

export type { EventStateDoc }
export type EventStateStore = Pick<EventStateRepo, 'list' | 'get' | 'set'>

export const createEventState = (store: Store): EventStateStore => new EventStateRepo(store)
