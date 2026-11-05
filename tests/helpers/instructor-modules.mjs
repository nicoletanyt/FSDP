import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Resolve Vite's extension-free imports in memory; never load the browser's env
// or instantiate the shared Supabase client in offline API/database tests.
const sourceDirectory = new URL('../../src/lib/instructor/', import.meta.url)
const errorsUrl = new URL('errors.ts', sourceDirectory).href
const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`
const adaptersUrl = moduleUrl((await readFile(new URL('adapters.ts', sourceDirectory), 'utf8'))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl)))
const decodersUrl = moduleUrl((await readFile(new URL('decoders.ts', sourceDirectory), 'utf8'))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl))
  .replaceAll("'./adapters'", JSON.stringify(adaptersUrl)))
const apiUrl = moduleUrl((await readFile(new URL('api.ts', sourceDirectory), 'utf8'))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl))
  .replaceAll("'./decoders'", JSON.stringify(decodersUrl))
  .replaceAll("'./adapters'", JSON.stringify(adaptersUrl)))
const calendarViewUrl = moduleUrl((await readFile(new URL('calendar-view.ts', sourceDirectory), 'utf8'))
  .replaceAll("'../instructor-calendar'", JSON.stringify(new URL('../instructor-calendar.ts', sourceDirectory).href))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl))
  .replaceAll("'./adapters'", JSON.stringify(adaptersUrl)))
const calendarQueriesUrl = moduleUrl((await readFile(new URL('calendar-queries.ts', sourceDirectory), 'utf8'))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl))
  .replaceAll("'./calendar-view'", JSON.stringify(calendarViewUrl)))
const directoryUrl = moduleUrl((await readFile(new URL('directory.ts', sourceDirectory), 'utf8'))
  .replaceAll("'./decoders'", JSON.stringify(decodersUrl))
  .replaceAll("'./errors'", JSON.stringify(errorsUrl))
  .replaceAll("'./adapters'", JSON.stringify(adaptersUrl)))

export const errors = await import(errorsUrl)
export const adapters = await import(adaptersUrl)
export const decoders = await import(decodersUrl)
export const api = await import(apiUrl)
export const calendarView = await import(calendarViewUrl)
export const calendarQueries = await import(calendarQueriesUrl)
export const directory = await import(directoryUrl)
