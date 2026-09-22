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

  describe('cgi_escape', () => {
    it('should escape CGI chars', async () => {
      const html = await liquid.parseAndRender('{{ "!\',()*\\"!" | cgi_escape }}')
      expect(html).toEqual('%21%27%2C%28%29%2A%22%21')
    })
    it('should escape space as +', async () => {
      const html = await liquid.parseAndRender('{{ "foo, bar; baz?" | cgi_escape }}')
      expect(html).toEqual('foo%2C+bar%3B+baz%3F')
    })
  })

  describe('uri_escape', () => {
    it('should escape unsupported chars for uri', async () => {
      const html = await liquid.parseAndRender('{{ "https://example.com/?q=foo, \\\\bar?" | uri_escape }}')
      expect(html).toEqual('https://example.com/?q=foo,%20%5Cbar?')
    })
    it('should not escape reserved characters', async () => {
      const reserved = "!#$&'()*+,/:;=?@[]"
      const html = await liquid.parseAndRender('{{ reserved | uri_escape }}', { reserved })
      expect(html).toEqual(reserved)
    })
  })

  describe('slugify', () => {
    describe('slugify', () => {
      it('should slugify with default mode', async () => {
        const html = await liquid.parseAndRender('{{ "The _config.yml file" | slugify }}')
        expect(html).toEqual('the-config-yml-file')
      })

      it('should slugify with pretty mode', async () => {
        const html = await liquid.parseAndRender('{{ "The _config.yml file" | slugify: "pretty" }}')
        expect(html).toEqual('the-_config.yml-file')
      })

      it('should slugify with ascii mode', async () => {
        const html = await liquid.parseAndRender('{{ "The _cönfig.yml file" | slugify: "ascii" }}')
        expect(html).toEqual('the-c-nfig-yml-file')
      })

      it('should slugify with latin mode', async () => {
        const html = await liquid.parseAndRender('{{ "The cönfig.yml file" | slugify: "latin" }}')
        expect(html).toEqual('the-config-yml-file')
      })

      it('should slugify with none mode', async () => {
        const html = await liquid.parseAndRender('{{ "The _config.yml file" | slugify: "none" }}')
        expect(html).toEqual('the _config.yml file')
      })

      it('should slugify with invalid mode', async () => {
        const html = await liquid.parseAndRender('{{ "The _config.yml file" | slugify: "invalid_mode" }}')
        expect(html).toEqual('the _config.yml file')
      })

      it('should slugify with empty string', async () => {
        const html = await liquid.parseAndRender('{{ "" | slugify }}')
        expect(html).toEqual('')
      })

      it('should slugify with cased=false', async () => {
        const html = await liquid.parseAndRender('{{ "Test String" | slugify: "pretty", false }}')
        expect(html).toEqual('test-string')
      })

      it('should slugify with cased=true', async () => {
        const html = await liquid.parseAndRender('{{ "Test String" | slugify: "pretty", true }}')
        expect(html).toEqual('Test-String')
      })
    })
  })
})
