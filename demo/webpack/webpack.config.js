const path = require('path');
const { ContextReplacementPlugin } = require('webpack')

module.exports = {
  entry: './src/index.js',
  mode: 'development',
  target: 'node',
  plugins: [
    new ContextReplacementPlugin(/@chr33s\/liquid/)
  ],
  output: {
    filename: 'index.js',
    path: path.resolve(__dirname, 'dist'),
  },
};