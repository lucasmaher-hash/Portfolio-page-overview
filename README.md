# Portfolio page overview

A single offline HTML page: the **Portfolio Agent** system (orchestrator, sub-agents, review loop) on top, and below it a catalogue of the UI elements used for Lucas Maher's portfolio case studies. Content is generic, and visible `{placeholder}` areas are intentional.

**Status:** working draft for a design course. Not an approved or published case study.

- `index.html`: the built page. Fonts and images are embedded, nothing is loaded from the network.
- `src/template.html`: page source. `src/build.py` builds `index.html` from it.
- `src/shoot.mjs`, `shoot-all.sh`, `measure.mjs`, `test.mjs`: render and interaction checks in headless Chrome.

`build.py` reads components, fonts and images from the local portfolio repo (`~/TEMP/3D_Portfolio/public`), a backup of the first version, and the local Hermes profiles (chat ids for the "Chat in Hermes öffnen" links). That means it only builds on the author's machine. The `hermes://` chat links only work on a Mac running Hermes Desktop with those profiles.
