# Try it demo

The landing page's Try it section embeds the agentic-fbd viewer at `/demo/`, built as static files
in demo mode (see `packages/viewer/src/state/demo.ts`). The site build (`site/vite.config.ts`)
copies `dist/viewer` there with the diagrams listed in `DEMO_DIAGRAMS`, the first one opening first.

- `todomvc-react.logic.json`: an Understand diagram of the React example of
  [TodoMVC](https://github.com/tastejs/todomvc) (`examples/react`, MIT, © Addy Osmani, Sindre
  Sorhus, Pascal Hartig, Stephen Sawchuk), made with the agentic-fbd skill at commit `ff43b02`.
  It describes that code; none of it is copied here. Its `code` paths are relative to the TodoMVC
  repository.
- `logic/landing-page.logic.json` (repo root): this landing page, as living documentation.

In the demo, edits, arrangements and saves stay in the visitor's browser tab.
