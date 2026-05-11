import { describe, expect, it } from 'bun:test'
import { buildHeaderIndex, parseReward, parseTimestamp } from './sheet-sync-helpers'

describe('sheet-sync helpers', () => {
  describe('buildHeaderIndex', () => {
    it('maps known headers to their positions', () => {
      const headers = ['Name', 'Email', 'Team']
      const headerMap = { NAME: 'Name', EMAIL: 'Email', MISSING: 'Missing' }

      expect(buildHeaderIndex(headers, headerMap)).toEqual({
        NAME: 0,
        EMAIL: 1,
      })
    })
  })

  describe('parseTimestamp', () => {
    it('parses M/D/YYYY H:MM:SS timestamps as UTC', () => {
      const date = parseTimestamp('4/5/2024 13:14:15')
      expect(date.toISOString()).toBe('2024-04-05T13:14:15.000Z')
    })

    it('parses M/D/YYYY date-only values as UTC midnight', () => {
      const date = parseTimestamp('4/5/2024')
      expect(date.toISOString()).toBe('2024-04-05T00:00:00.000Z')
    })

    it('parses Google Sheets serial dates', () => {
      const date = parseTimestamp('45386')
      expect(date.toISOString()).toBe('2024-04-04T00:00:00.000Z')
    })

    it('throws on unparseable timestamps', () => {
      expect(() => parseTimestamp('not-a-date')).toThrow('Cannot parse timestamp')
    })
  })

  describe('parseReward', () => {
    it('parses reward name and cost', () => {
      expect(parseReward('Coffee Voucher (25)')).toEqual({
        name: 'Coffee Voucher',
        cost: 25,
      })
    })

    it('throws on invalid reward format', () => {
      expect(() => parseReward('Coffee Voucher')).toThrow('Cannot parse reward')
    })
  })
})
