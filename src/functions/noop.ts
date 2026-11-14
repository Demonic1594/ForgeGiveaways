import { ReForgeGiveawaysLogger as log } from "../utils/logger"

/** Logs an error from a fire-and-forget promise instead of crashing. */
export default (...args: any[]) => {
    log.error("Unexpected error:", ...args)
}
