# agentic-fbd

## Purpose (do not lose sight of this)

agentic-fbd is a **logic visualizer and a two-way translation layer between logic and code**:

- What Claude understands about existing code, or plans to build, is shown as a **Function Block
  Diagram** (FBD, the IEC 61131-3 PLC language): blocks with typed inputs and outputs, wired
  together, in layers you open with a double-click. The developer reads it, questions it and
  catches logic flaws **before** code is written.
- What the developer has in mind is expressed in the same format so Claude can implement it.

One skill, two modes, same JSON format and app:
- **Understand:** explain a specific feature, section, flow, tool or pipeline, layer by layer, on
  demand.
- **Design:** propose a feature or change on top of that understanding, with what is new, modified
  and affected, and the risks.

It is **not** a tool for mapping a whole repo in one go. It explains specific things on request.

Full design: `docs/superpowers/specs/2026-10-18-logic-builder-design.md`.

## Rules for this repo

- **Everything built is in English:** code, comments, UI text, docs, examples, commit messages.
  Gabriel talks to Claude in Spanish for speed; reply in Spanish, build in English.
- This repo will be **public and open source** (GitHub, then the Claude Code plugin marketplace,
  later Codex). Never commit client or company-internal code, data or names. Examples are written
  from scratch and kept generic.
