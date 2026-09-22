const express = require('express')
const { Liquid, LayoutTag } = require('@chr33s/liquid')

const app = express()
const engine = new Liquid({
  root: __dirname, // for layouts and partials
  extname: '.liquid'
})
// `layout` belongs to the hosted dialect; a core engine registers it itself
engine.registerTag('layout', LayoutTag)

app.engine('liquid', engine.express()) // register liquid engine
app.set('views', ['./partials', './views']) // specify the views directory
app.set('view engine', 'liquid') // set to default

app.get('/', function (req, res) {
  const todos = ['fork and clone', 'make it better', 'make a pull request']
  res.render('todolist', {
    todos: todos,
    title: 'Welcome to LiquidJS!'
  })
})

module.exports = app
