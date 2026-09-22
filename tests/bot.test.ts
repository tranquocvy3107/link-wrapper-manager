import { describe, expect, it } from 'vitest'
import { detectBot } from '../lib/bot'

const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1'

function headers(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('detectBot — người dùng thật', () => {
  it.each([
    ['Chrome trên Windows', CHROME],
    ['Safari trên iPhone', SAFARI_IOS],
  ])('%s không bị đánh dấu là bot', (_label, ua) => {
    expect(detectBot(headers({ 'user-agent': ua }))).toEqual({ isBot: false, reason: null })
  })
})

describe('detectBot — header nạp trước', () => {
  it.each([
    ['sec-purpose', { 'user-agent': CHROME, 'sec-purpose': 'prefetch' }],
    ['sec-purpose prerender', { 'user-agent': CHROME, 'sec-purpose': 'prefetch;prerender' }],
    ['purpose', { 'user-agent': CHROME, purpose: 'prefetch' }],
    ['x-purpose', { 'user-agent': CHROME, 'x-purpose': 'preview' }],
    ['x-moz', { 'user-agent': CHROME, 'x-moz': 'prefetch' }],
  ])('%s → bot', (_label, init) => {
    expect(detectBot(headers(init))).toEqual({ isBot: true, reason: 'prefetch' })
  })
})

describe('detectBot — bộ quét email và crawler', () => {
  it.each([
    ['Gmail image proxy', 'Mozilla/5.0 (Windows NT 5.1; rv:11.0) Gecko GoogleImageProxy'],
    ['Outlook SafeLinks', 'Mozilla/5.0 (compatible; Microsoft Office Protection; SafeLinks)'],
    ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['Slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['facebookexternalhit', 'facebookexternalhit/1.1'],
    ['curl', 'curl/8.7.1'],
    ['python-requests', 'python-requests/2.32.3'],
    ['headless Chrome', 'Mozilla/5.0 HeadlessChrome/141.0.0.0'],
    ['Proofpoint', 'Mozilla/5.0 proofpoint-urldefense'],
  ])('%s → bot', (_label, ua) => {
    expect(detectBot(headers({ 'user-agent': ua }))).toEqual({
      isBot: true,
      reason: 'user_agent',
    })
  })
})

describe('detectBot — thiếu User-Agent', () => {
  it('không có header user-agent → bot', () => {
    expect(detectBot(headers({}))).toEqual({ isBot: true, reason: 'no_user_agent' })
  })

  it('user-agent rỗng → bot', () => {
    expect(detectBot(headers({ 'user-agent': '   ' }))).toEqual({
      isBot: true,
      reason: 'no_user_agent',
    })
  })
})
