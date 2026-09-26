#!/usr/bin/env bash
set -e

npm run build && npm start | grep 'TypeScript Demo for LiquidJS'
