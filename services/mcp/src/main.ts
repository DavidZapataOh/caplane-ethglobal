import { createMcp } from './server.js'

const port = Number(process.env.PORT)
if (!Number.isFinite(port) || port === 0) throw new Error('PORT is not set')

createMcp().listen(port)
