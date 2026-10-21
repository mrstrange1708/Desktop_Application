import { test } from 'node:test'
import assert from 'node:assert/strict'
import { RESTRICTED_APPS, appNames } from './processes.js'

const restricted = (names) => names.filter((n) => RESTRICTED_APPS.includes(n.toLowerCase()))

test('macOS: app bundle names, helpers and CLI tools ignored', () => {
  const ps = [
    '/Applications/Slack.app/Contents/MacOS/Slack',
    '/Applications/Slack.app/Contents/Frameworks/Slack Helper.app/Contents/MacOS/Slack Helper',
    '/Applications/Claude Office.app/Contents/MacOS/Claude Office',
    '/Users/me/.vscode/extensions/anthropic.claude-code/resources/native-binary/claude',
    '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
  ].join('\n')
  assert.deepEqual(restricted(appNames(ps, 'darwin')), ['Slack'])
})

test('Windows: tasklist csv image names', () => {
  const tasklist = '"Discord.exe","1234","Console","1","90,000 K"\r\n"explorer.exe","42","Console","1","50,000 K"\r\n'
  assert.deepEqual(restricted(appNames(tasklist, 'win32')), ['Discord'])
})
