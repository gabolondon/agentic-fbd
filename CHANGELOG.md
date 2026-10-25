# Changelog — agentic-fbd

## [0.3.0] - 2026-10-24
_Previous release: 0.2.1_

### viewer 0.2.1 -> 0.3.0 (minor)
- Add a demo mode that runs from static files: a `<meta name="agentic-fbd-demo">` tag points the viewer at a list of diagrams, and edits, layouts and saves stay in the browser

### skill 0.1.2 -> 0.1.3 (patch)
- Bumped because viewer changed

### landing 0.1.2 -> 0.2.0 (minor)
- Publish the agentic-fbd website at afbd.gabocodes.com, in English and Spanish, with a top bar, statement, six features, a worked bug example, install steps and a footer
- Play a looping hero video behind the opening titles, in the page's language and in a wide or tall cut for the screen, holding on the first question long enough to read it
- Lay a faded diagram behind the statement, fading in from the middle of the width
- Add a Try it section with the live viewer on a TodoMVC diagram and on a diagram of the website itself, plus a Try it button in the top bar; phones get a picture and a link instead

### Unchanged
core 0.1.0 · cli 0.1.0 · theme 0.2.1

### Other
- The website deploys to GitHub Pages on every push to main that touches it; the hero videos come from the media-hero-1 Release

## [0.2.1] - 2026-10-24
_Previous release: 0.2.0_

### theme 0.2.0 -> 0.2.1 (patch)
- Widen the block radius token to boxes in the panels and the structure button

### viewer 0.2.0 -> 0.2.1 (patch)
- Give the Data box, wire carries, notes, risks, confirmations and the edit bar the same 4px corners as the blocks
- Give the structure button 4px corners; the other buttons stay as pills

### skill 0.1.1 -> 0.1.2 (patch)
- Bumped because viewer changed

### landing 0.1.1 -> 0.1.2 (patch)
- Bumped because theme changed

### Unchanged
core 0.1.0 · cli 0.1.0

## [0.2.0] - 2026-10-24
_Previous release: 0.1.0_

### theme 0.1.0 -> 0.2.0 (minor)
- Add the agentic-fbd design tokens: cream canvas, ink, stone, one violet accent, toned meaning colors, radii and fonts, in one CSS file shared by the viewer and the website

### viewer 0.1.0 -> 0.2.0 (minor)
- Wear the new look: cream canvas, blocks with 1px ink borders and 4px corners, 20px panels and pill buttons, and no blurred shadows
- Ship the Inter typeface with the viewer, so it renders the same offline
- Keep new, modified, risk and selection colors readable on cream

### skill 0.1.0 -> 0.1.1 (patch)
- Bumped because viewer changed

### landing 0.1.0 -> 0.1.1 (patch)
- Bumped because theme changed

### Unchanged
core 0.1.0 · cli 0.1.0

### Other
- GitHub Releases are now published automatically for each root version tag
- The bundled CLI includes fast-uri 3.1.9, which fixes its URI parsing advisories

## [0.1.0] - 2026-10-23
_Baseline: first versioned release_

### core 0.1.0
- Define the logic diagram format, its JSON Schema, type checking and the view model

### cli 0.1.0
- Validate diagrams (`validate`, with `--check-code` and `--json`) and serve them in a live viewer (`open`)

### viewer 0.1.0
- Show function block diagrams in layers, with Understand and Design modes, Before / After, risks and code locations
- Show the Data box and let you edit labels, ports, types, triggers and notes, then copy the request for the agent

### skill 0.1.0
- Teach the agent to explain or design logic as a function block diagram, as the agentic-fbd plugin for Claude Code

### landing 0.1.0
- Reserve the component for the website; nothing is published yet
