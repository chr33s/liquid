import request from 'supertest'
import express from 'express'
import type { Application } from 'express'
import { resolve } from 'path'
import { Liquid } from '@chr33s/liquid'

describe('express()', function () {
  const root = resolve(__dirname, '../stub/root')
  const views = resolve(__dirname, '../stub/views')
  const partials = resolve(__dirname, '../stub/partials')
  let app: Application, engine: Liquid

  beforeEach(function () {
    app = express()
    engine = new Liquid({
      root,
      extname: '.html'
    })

    app.set('view engine', 'html')
    app.engine('html', engine.express())

    app.get('/name', (req, res) =>
      res.render('name', {
        name: 'harttle'
      })
    )
    app.get('/include/:file', (req, res) =>
      res.render('include', {
        file: req.params.file
      })
    )
  })
  it('should respect express views(array)', async function () {
    app.set('views', [views])
    await request(app).get('/name').expect('My name is harttle.').expect(200)
  })
  it('should respect express views(string)', async function () {
    app.set('views', views)
    await request(app).get('/include/bar').expect('BAR').expect(200)
  })
  it('should pass error when file not found', async function () {
    const view = {
      root: []
    }
    const file = '/not-exist.html'
    const ctx = {}
    const err: any = await new Promise(resolve => {
      engine.express().call(view, file, ctx, resolve)
    })
    expect(err.code).toBe('ENOENT')
    expect(err.message).toMatch(/Failed to lookup/)
  })
  it('should respect root option when lookup', async function () {
    app.set('views', [views])
    await request(app).get('/include/foo').expect('foo').expect(200)
  })
  it('should respect express views (Array) when lookup', async function () {
    app.set('views', [views, partials])
    await request(app).get('/include/bar').expect('BAR').expect(200)
  })
})
