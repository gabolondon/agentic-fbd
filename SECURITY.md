# Security policy

## Report a vulnerability

Report it privately through GitHub Security Advisories. Open the
[Security tab](https://github.com/gabolondon/agentic-fbd/security) of the repository and choose
"Report a vulnerability". Please do not open a public issue or pull request for a vulnerability.

Include what you found, the steps to reproduce it, and the version (the `v` tag or the commit).
You will get a reply through the advisory.

## Supported versions

Only the latest release gets security fixes. Update to the latest release before you report.

## Scope

In scope:

- **The local server.** `node dist/cli.mjs open` listens on `127.0.0.1` only, never on other network
  interfaces (`packages/cli/src/server.ts`). It serves the prebuilt viewer from `dist/viewer`,
  and a request must not reach any file outside that folder. Writes from the viewer accept only
  same-origin requests with a JSON body, so other web pages cannot write to it.
- **The files the CLI and viewer read and write.** The CLI reads the diagram you open, the other
  `*.logic.json` files in the same folder, and the files next to them (`.layout.json`,
  `.draft.json`, `.review.json`). With `validate --check-code <repo-root>` it also reads the
  source files that a diagram points to. The viewer writes only `<name>.layout.json`,
  `<name>.draft.json` and `<name>.review.json`, and `<name>.logic.json` itself when you press
  Save. All of them are in the folder of the opened file. A file name in a request must be a plain
  `*.logic.json` name with no path separator.
- **The validator.** `validate` and the viewer parse JSON that may come from an untrusted
  source, such as a diagram you received. A crash, a hang or an unexpected file access caused
  by a crafted `*.logic.json` is in scope.

Out of scope:

- Anything that needs another user on the same machine with full access to your account.
- Exposing the server on a network on purpose, for example with a port forward or a proxy.
- Vulnerabilities in Claude Code, Node.js or your browser.
- The website at `afbd.gabocodes.com` is a static site. Reports about it are welcome, but it
  holds no user data.
