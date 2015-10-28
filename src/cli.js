#!/usr/bin/env node

'use strict'

import globule from 'globule'
import yargs from 'yargs'
import split from 'split'
import temp from 'temp'
import {rename} from 'fs-promise'
import {createReadStream, createWriteStream} from 'fs'
import {EOL} from 'os'

const RE_WS_LEFT = /^(\s*)/
const RE_WS_RIGHT = /(\s+)$/

const argv = yargs
  .usage('Usage: $0 [options] <pattern> [pattern ...]')
  .alias('t', 'tabs').boolean('t')
  .alias('n', 'num').default('n', 2)
  .alias('r', 'trim').boolean('r')
  .alias('b', 'backup').boolean('b')
  .demand(1)
  .argv

const patterns = argv._
const useTabs = argv.tabs
const numSpaces = argv.num
const trim = argv.trim
const backup = argv.backup

const matches = globule.find(patterns)

const countWhitespace = ws => {
  let count = 0
  for (let i = 0; i < ws.length; ++i) {
    const c = ws[i]
    if (c === ' ') {
      ++count
    } else if (c === '\t') {
      count = (count + numSpaces)
      count -= count % numSpaces
    } else {
      throw new Error(`Unexpected whitespace character: ${c}`)
    }
  }
  return count
}

const repeatString = (str, num) => {
  let out = ''
  for (let i = 0; i < num; ++i) {
    out += str
  }
  return out
}

const createSpaces = numTabs => repeatString(' ', numTabs * numSpaces)

const createTabs = numTabs => repeatString('\t', numTabs)

const createWhitespace = useTabs ? createTabs : createSpaces

const trimRight = str => str.replace(RE_WS_RIGHT, '')

const processLine = line => {
  const [ws] = RE_WS_LEFT.exec(line)
  const numWs = countWhitespace(ws)
  const numTabs = Math.floor(numWs / numSpaces)
  const remainder = numWs % numSpaces
  const prefix = createWhitespace(numTabs) + repeatString(' ', remainder)
  const result = prefix + line.substr(ws.length)
  return trim ? trimRight(result) : result
}

const processFile = file => {
  return new Promise((resolve, reject) => {
    const tempFile = temp.path()
    const out = createWriteStream(tempFile)
    let changed = false
    createReadStream(file, {encoding: 'utf8'})
      .pipe(split())
      .on('data', line => {
        const processedLine = processLine(line)
        changed = changed || (line !== processedLine)
        out.write(processedLine + EOL)
      })
      .on('end', () => resolve({file: tempFile, changed}))
      .on('error', reject)
  })
}

const processFiles = async files => {
  for (let file of files) {
    console.info('Processing file: %s', file)
    const {file: outFile, changed} = await processFile(file)
    if (changed) {
      if (backup) {
        const backupFile = file + '~'
        console.info('Renaming: %s -> %s', file, backupFile)
        await rename(file, backupFile)
      }
      console.info('Renaming: %s -> %s', outFile, file)
      await rename(outFile, file)
    } else {
      console.info('Unchanged: %s', file)
    }
  }
}

if (!matches.length) {
  console.warn('No matching files')
  process.exit(0)
}

(async () => {
  try {
    await processFiles(matches)
  } catch (e) {
    console.error(e.stack)
    process.exit(1)
  }
})()
