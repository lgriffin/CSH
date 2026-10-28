# Releasing CSH

A release is a tag `v<version>` on `main`. Pushing it runs `.github/workflows/release.yml`, which packs the npm
package `@lgriffin/csh` and every workspace tarball at the tag's version. The workflow installs each of them outside
the repository, analyses a repository with it, and attaches them all to a GitHub release of the tag. Cutting the tag
and publishing to npm are the owner's ([ADR-36](../adr/ADR-36-npm-package.md)).

## Before the first release (once)

1. **The npm account.** Sign in to npm as `lgriffin`; the scope `@lgriffin` is that account's. Turn on two-factor
   authentication for writes.
2. **Choose how to publish.** Either by hand from your machine (step 4a), or from the workflow (step 4b). For the
   workflow, create a granular access token on npmjs.com that can read and write packages, add it to the repository as
   the secret `NPM_TOKEN` (Settings, Secrets and variables, Actions), and create an environment named `npm` (Settings,
   Environments). Add yourself as its required reviewer if you want each publish to wait for you.

## Each release

1. **Check main is green.** Every job of the last CI run on `main` passed, including `npm package` on all four systems.
2. **Set the version.** `packages/cli/package.json` holds the product's version; the release refuses a tag that differs.
   Change it with a pull request, then:

   ```text
   git checkout main && git pull
   git tag -s v1.0.0 -m "CSH 1.0.0"
   git push origin v1.0.0
   ```

3. **Watch the Release workflow.** The job `Pack and install` must pass: it is the same smoke test as CI, run at the
   tag's version. The release appears with `lgriffin-csh-1.0.0.tgz` attached.
4. **Publish.**
   - a. **By hand:** download `lgriffin-csh-1.0.0.tgz` from the release, then
     `npm publish lgriffin-csh-1.0.0.tgz --access public`.
   - b. **From the workflow:** with `NPM_TOKEN` set, the job `Publish to npm` publishes the same file with provenance,
     after your approval if the `npm` environment asks for it. Without the secret it publishes nothing and says so.
5. **Check it.** In an empty directory: `npx @lgriffin/csh --version` prints `csh 1.0.0`, and
   `npx @lgriffin/csh analyse <some repository>` writes its reports.

## Trying the package without a release

```text
node packages/testkit/src/npm-package.ts dist/npm --version 1.0.0-rc.1
.github/scripts/npm-smoke.sh dist/npm/lgriffin-csh-1.0.0-rc.1.tgz 1.0.0-rc.1
npm install --global ./dist/npm/lgriffin-csh-1.0.0-rc.1.tgz
```

A pre-release can be published under its own tag, so `npm install @lgriffin/csh` keeps the last full release:
`npm publish lgriffin-csh-1.0.0-rc.1.tgz --access public --tag next`.
