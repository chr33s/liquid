import { Liquid } from '../../../src'
describe('filters/url', () => {
  const liquid = new Liquid()
  describe('url_decode', () => {
    it('should decode %xx and +', async () => {
      const html = await liquid.parseAndRender('{{ "%27Stop%21%27+said+Fred" | url_decode }}')
      expect(html).toEqual("'Stop!' said Fred")
    })
    it('should decode %2B to a literal plus', async () => {
      const html = await liquid.parseAndRender('{{ "1%2B1" | url_decode }}')
      expect(html).toEqual('1+1')
    })
    it('should keep a literal plus when round-tripped through url_encode', async () => {
      const html = await liquid.parseAndRender('{{ "a+b c" | url_encode | url_decode }}')
      expect(html).toEqual('a+b c')
    })
  })
  describe('url_encode', () => {
    it('should encode @', async () => {
      const html = await liquid.parseAndRender('{{ "john@liquid.com" | url_encode }}')
      expect(html).toEqual('john%40liquid.com')
    })
    it('should encode <space>', async () => {
      const html = await liquid.parseAndRender('{{ "Tetsuro Takara" | url_encode }}')
      expect(html).toEqual('Tetsuro+Takara')
    })
  })
})
