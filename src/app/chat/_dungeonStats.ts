import type { ChatCommand } from '../context'
import catacombs from './catacombs'
import floor from './floor'
import essence from './essence'
import hotm from './hotm'
import kuudra from './kuudra'
import crimsonisle from './crimsonisle'
import dojo from './dojo'
import bestiary from './bestiary'
import accessories from './accessories'

export const dungeonStatCommands: ChatCommand[] = [catacombs, floor, essence, hotm, kuudra, crimsonisle, dojo, bestiary, accessories]
