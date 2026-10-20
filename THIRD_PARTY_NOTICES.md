# Third-party notices

Agent Office derives its local watcher/tailing design,
Tauri desktop structure and animation loop from **AgentRoom** by Yixin Liu:
https://github.com/liuyixin-louis/agentroom (main snapshot retrieved 2026-10-19).
AgentRoom's full MIT notice is preserved in [licenses/AgentRoom-MIT.txt](licenses/AgentRoom-MIT.txt).

- `src/office/gameLoop.ts` is adapted from AgentRoom's `src/office/engine/gameLoop.ts`.
- The incremental reader in `src-tauri/src/observer.rs` adapts AgentRoom's
  `FileReadState` / `read_new_lines` pattern, adding bounded byte buffering,
  UTF-8-safe partial records, replacement/truncation handling, and Codex parsing.
- AgentRoom's original game engine is based on Pixel Agents by Pablo De Lucca,
  copyright (c) 2026 Pablo De Lucca, MIT. Its notice is preserved below.
- Other references (not copied): NosytLabs/agent-office event semantics and
  ringhyacinth/Star-Office-UI's visual status/desktop concept.

No AgentRoom AI tagging, CASS submodule, account integration, LimeZu tileset or
Metro City character asset is included. The application uses installed system fonts.

The app icon (`src-tauri/icons/icon.png`) was created with OpenAI's image generation tool.

## Kenney artwork (CC0)

- Furniture Kit (2.0), by Kenney: https://kenney.nl/assets/furniture-kit
  Original notice: [licenses/Kenney-Furniture-CC0.txt](licenses/Kenney-Furniture-CC0.txt).
- Mini Characters (1.0), by Kenney: https://kenney.nl/assets/mini-characters
  Original notice: [licenses/Kenney-Mini-Characters-CC0.txt](licenses/Kenney-Mini-Characters-CC0.txt).

Both packs are released under Creative Commons Zero (CC0 1.0):
https://creativecommons.org/publicdomain/zero/1.0/

Selected source models are preserved in `art/kenney/`. The furniture palette is
adapted to this office. Custom architecture, servers, screens, books and signs are
composed with those models by `scripts/art/scene.js`. `npm run art:render` exports
the room, foreground layers and animated character sheets to `src/office/assets/`.
Three.js is used only by this development tool. The running application draws
bundled PNGs on Canvas; it downloads no assets and performs no 3D or AI rendering.

## Pixel Agents MIT License

Copyright (c) 2026 Pablo De Lucca

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
