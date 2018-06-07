// @ts-check
import * as winston from 'winston'

const defaultName = 'distbin'

export const createLogger = function getLogger (name: string) {
  const logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({
        label: [defaultName, name].filter(Boolean).join('.'),
      })
    ]
  })
  if (process.env.LOG_LEVEL) {
    logger.level = process.env.LOG_LEVEL
  }
  return logger
}
