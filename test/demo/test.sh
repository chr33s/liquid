# npm run build before running this check
set -e
set -x
export CI=true

if [ ! -d dist ]; then
  echo >&2 'build liquidjs before run test.sh'
  exit 1
fi

for demo in $(ls demo); do
  cd demo/$demo
  npm install

  if npm test; then
    echo "[success] demo/$demo"
  else
    echo "[fail] demo/$demo"
    exit 1
  fi
  cd -
done
