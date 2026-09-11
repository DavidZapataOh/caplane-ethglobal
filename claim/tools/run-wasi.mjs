import { readFile } from 'node:fs/promises'
import { WASI } from 'node:wasi'

const wasi = new WASI({ version: 'preview1', args: [], env: {} })
const module = await WebAssembly.compile(await readFile(process.argv[2]))
wasi.start(await WebAssembly.instantiate(module, wasi.getImportObject()))
