# Changelog — agentic-fbd

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
