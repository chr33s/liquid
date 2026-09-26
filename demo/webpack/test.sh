#!/usr/bin/env bash
set -e

npm run build
npm start | grep 'Webpack Demo for LiquidJS'
