# Contributing

Development requires Node.js >= 22.18: the repo scripts under `bin/` are
TypeScript run directly by Node type stripping, which is only enabled by
default from that version. The published package itself still supports
Node.js >= 22.12.

1. Build everything and run tests to learn how to do both:
  - `npm run build`
  - `npm run test`

  Tests won't at first unless you've done a build at least once.
  Subsequent changes to tests do not need re-builds but changes to the code and
  then tests need a build to pick up the new code by the tests.

2. Make your changes and add a test for them
  - Build after you've made your changes
  - Run tests as per the above to validate your changes

3. Create a pull request
  - Run `npm run check` before pushing; it runs the build, docs build, tests,
    lint, typecheck and perf tests. CI runs the same checks on your PR.
  - Use the [conventional commits](https://www.conventionalcommits.org/) format
    for your pull request title, e.g. `feat: add my change`. The release is cut
    from merged PR titles, and CI fails the PR if the title does not parse.
  - `git switch -c your_branch_name` (do this in your fork not the main repo)
  - `git add .`
  - `git commit -m "feat: Adding my change"`
  - `git push`
  - Go to GitHub and find your fork, open a PR against the upstream from it

## Documentation

Authored Markdown lives in `docs/Home.md` and `docs/source/`. `npm run build:docs`
renders it together with the TypeScript API into `.local/wiki` and validates the
result; read the rendered pages there. A new page needs an entry in the
`children:` list of its section root (`docs/source/tutorials/index.md`,
`docs/source/tags/overview.md` or `docs/source/filters/overview.md`).

The rendered pages are published to https://github.com/chr33s/liquid/wiki from
`main`; `npm run publish:docs` does the push using your git credentials (or `GITHUB_TOKEN` when set, as in CI).

## Performance

If your change can have a performance impact, you can update and run performance cases under `benchmark/`.

1. `npm run build:cjs` to build a CommonJS bundle for the perf test.
2. `npm run perf:diff` to check whether there's a regression compared against `liquidjs@latest`

Further more, `benchmark/` contains different cases to check its ops/sec. Useful when debugging perf regressions, to use it:

- `cd benchmark` go into benchmark project
- `npm ci` install dependencies
- `npm start` run the cases
