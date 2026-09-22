import { getDateTimeFormat } from './intl'
import { isString } from './underscore'

// one minute in milliseconds
const OneMinute = 60000
/**
 * Need support both ISO8601 and RFC2822 as in major browsers & NodeJS
 * RFC2822: https://datatracker.ietf.org/doc/html/rfc2822#section-3.3
 */
const TIMEZONE_PATTERN = /([zZ]|([+-])(\d{2}):?(\d{2}))$/
const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const monthNamesShort = monthNames.map(name => name.slice(0, 3))
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const dayNamesShort = dayNames.map(name => name.slice(0, 3))

/**
 * A date implementation with timezone info, just like Ruby date
 */
export class LiquidDate {
  private timezoneOffset: number
  private timezoneName: string
  private date: Date
  private displayDate: Date
  private DateTimeFormat = getDateTimeFormat()
  public timezoneFixed: boolean
  constructor(
    init: string | number | Date,
    private locale: string,
    timezone?: number | string
  ) {
    this.date = new Date(init)
    this.timezoneFixed = timezone !== undefined
    if (timezone === undefined) {
      timezone = this.date.getTimezoneOffset()
    }
    this.timezoneOffset = isString(timezone) ? LiquidDate.getTimezoneOffset(timezone, this.date) : timezone
    this.timezoneName = isString(timezone) ? timezone : ''

    if (this.timezoneFixed) {
      this.displayDate = new Date(this.date.getTime() - this.timezoneOffset * OneMinute)
    } else {
      this.displayDate = new Date(0)
      this.displayDate.setUTCFullYear(this.date.getFullYear(), this.date.getMonth(), this.date.getDate())
      this.displayDate.setUTCHours(
        this.date.getHours(),
        this.date.getMinutes(),
        this.date.getSeconds(),
        this.date.getMilliseconds()
      )
    }
  }

  getTime() {
    return this.date.getTime()
  }
  getMilliseconds() {
    return this.displayDate.getUTCMilliseconds()
  }
  getSeconds() {
    return this.displayDate.getUTCSeconds()
  }
  getMinutes() {
    return this.displayDate.getUTCMinutes()
  }
  getHours() {
    return this.displayDate.getUTCHours()
  }
  getDay() {
    return this.displayDate.getUTCDay()
  }
  getDate() {
    return this.displayDate.getUTCDate()
  }
  getMonth() {
    return this.displayDate.getUTCMonth()
  }
  getFullYear() {
    return this.displayDate.getUTCFullYear()
  }
  toLocaleString(locale?: string, init?: any) {
    if (init?.timeZone) {
      return this.date.toLocaleString(locale, init)
    }
    return this.displayDate.toLocaleString(locale, { ...init, timeZone: 'UTC' })
  }
  toLocaleTimeString(locale?: string) {
    return this.displayDate.toLocaleTimeString(locale, { timeZone: 'UTC' })
  }
  toLocaleDateString(locale?: string) {
    return this.displayDate.toLocaleDateString(locale, { timeZone: 'UTC' })
  }
  getTimezoneOffset() {
    return this.timezoneOffset!
  }
  getTimeZoneName() {
    if (this.timezoneFixed) return this.timezoneName
    if (!this.DateTimeFormat) return
    return this.DateTimeFormat().resolvedOptions().timeZone
  }
  getLongMonthName() {
    return this.format({ month: 'long' }) ?? monthNames[this.getMonth()]
  }
  getShortMonthName() {
    return this.format({ month: 'short' }) ?? monthNamesShort[this.getMonth()]
  }
  getLongWeekdayName() {
    return this.format({ weekday: 'long' }) ?? dayNames[this.getDay()]
  }
  getShortWeekdayName() {
    return this.format({ weekday: 'short' }) ?? dayNamesShort[this.getDay()]
  }
  valid() {
    return !isNaN(this.displayDate.getTime())
  }
  private format(options: Intl.DateTimeFormatOptions) {
    return (
      this.DateTimeFormat && this.DateTimeFormat(this.locale, { ...options, timeZone: 'UTC' }).format(this.displayDate)
    )
  }

  /**
   * Create a Date object fixed to it's declared Timezone. Both
   * - 2021-08-06T02:29:00.000Z and
   * - 2021-08-06T02:29:00.000+08:00
   * will always be displayed as
   * - 2021-08-06 02:29:00
   * regardless timezoneOffset in JavaScript realm
   */
  static createDateFixedToTimezone(dateString: string, locale: string): LiquidDate {
    const m = dateString.match(TIMEZONE_PATTERN)
    // representing a UTC timestamp
    if (m && m[1] === 'Z') {
      return new LiquidDate(+new Date(dateString), locale, 0)
    }
    // has a timezone specified
    if (m && m[2] && m[3] && m[4]) {
      const [, , sign, hours, minutes] = m
      const offset = (sign === '+' ? -1 : 1) * (parseInt(hours, 10) * 60 + parseInt(minutes, 10))
      return new LiquidDate(+new Date(dateString), locale, offset)
    }
    return new LiquidDate(dateString, locale)
  }
  private static getTimezoneOffset(timezoneName: string, date: Date) {
    const localDateString = date.toLocaleString('en-US', { timeZone: timezoneName })
    const utcDateString = date.toLocaleString('en-US', { timeZone: 'UTC' })

    const localDate = new Date(`${localDateString} UTC`)
    const utcDate = new Date(`${utcDateString} UTC`)
    return (+utcDate - +localDate) / (60 * 1000)
  }
}
