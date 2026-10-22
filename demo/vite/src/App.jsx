import { useEffect, useState } from 'react'
import logo from './logo.svg'
import source from './views/demo.liquid?raw'
import { engine } from './engine.js'

const template = engine.parse(source)

export function App() {
  const [html, setHtml] = useState('')

  useEffect(() => {
    let active = true
    engine.render(template, { name: 'liquid', logo }).then((rendered) => {
      if (active) setHtml(rendered)
    })
    return () => {
      active = false
    }
  }, [])

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}
