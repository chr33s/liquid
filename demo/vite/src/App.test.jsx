import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { App } from './App.jsx'

test('renders the liquid template', async () => {
  render(<App />)
  const heading = await screen.findByTestId('heading')
  expect(heading.textContent).toBe('Welcome to Liquid')
})
