set -e

npm run typecheck
npm start | grep '\[11:8] {{ todo }}'
