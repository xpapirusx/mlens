# Third-party notices

mLens is MIT licensed. It contains or adapts work from the projects below.
Full license texts are in `licenses/` where required.

---

## Freelens

- Source: https://github.com/freelensapp/freelens
- License: MIT (`licenses/Freelens-MIT.txt`)
- Use: architectural study of the application shell — single application window,
  cluster hotbar, cluster sidebar, sibling resource tabs, bottom dock, details
  drawer, catalog/welcome and state-preservation model. mLens reimplements these
  mechanics in TypeScript/React; no Freelens source files are copied.

Original headers retained where concepts are documented in this repository:
Copyright (c) Freelens Authors; Copyright (c) OpenLens Authors.

---

## luci-theme-proton2025

- Source: https://github.com/ChesterGoodiny/luci-theme-proton2025
- License: Apache License 2.0 (`licenses/Apache-2.0.txt`)
- Copyright 2025-2026 ChesterGoodiny.
- Use: colour palette of the **Proton** theme — the `html.theme-proton` token
  values in `design-system/styles/themes.css`, the `mlens-proton` Monaco theme
  and the Proton terminal ANSI palette are derived from the theme's `--proton-*`
  custom properties (slate `#0F1419`, accent `#5E9EFF`, status hues) and adapted
  to mLens' token contract. Only the dark palette is ported.

---

## Synthwave '84

- Source: https://github.com/robb0wen/synthwave-vscode
- License: MIT
- Use: colour palette of the **Synthwave '84** theme — `html.theme-synthwave`
  token values, the `mlens-synthwave` Monaco theme and its terminal ANSI palette
  are derived from the VS Code theme's colours (base `#262335`, pink `#FF7EDB`,
  pink/cyan/green status hues).

---

## Dark Islands

- Source: https://github.com/bwya77/vscode-dark-islands
- License: MIT
- Use: colour palette of the **Dark Islands** theme — `html.theme-islands`,
  `mlens-islands` Monaco theme and terminal ANSI palette derived from
  `themes/islands-dark.json` (charcoal `#181A1D`, blue `#548AF7`).

---

## GitHub VS Code theme

- Source: https://github.com/primer/github-vscode-theme
- License: MIT
- Use: colour palette of the **GitHub** theme — `html.theme-github`,
  `mlens-github` Monaco theme and terminal ANSI palette derived from Primer's
  dark palette (`#0D1117`, `#161B22`, accent `#58A6FF`).

---

## Night Owl

- Source: https://github.com/sdras/night-owl-vscode-theme
- License: MIT
- Use: colour palette of the **Night Owl** theme — `html.theme-night-owl`,
  `mlens-night-owl` Monaco theme and terminal ANSI palette derived from
  `Night Owl-color-theme.json` (navy `#011627`, blue `#82AAFF`, teal `#7FDBCA`).

---

## Material Icon Theme

- Source: https://github.com/material-extensions/vscode-material-icon-theme
- License: MIT
- Use: the **Material** colour theme's blue-grey surfaces and Material accent
  palette are inspired by the icon set's Material colour family. mLens does not
  embed the icon files themselves.

---

## One Dark Pro

- Source: https://github.com/Binaryify/OneDark-Pro
- License: MIT
- Use: palette of the **One Dark Pro** theme (`html.theme-one-dark-pro`,
  `mlens-one-dark-pro` Monaco theme, terminal ANSI palette).

---

## One Dark (akamud)

- Source: https://github.com/akamud/vscode-theme-onedark
- License: MIT
- Use: palette of the **One Dark** theme (`html.theme-one-dark`,
  `mlens-one-dark` Monaco theme, terminal ANSI palette).

---

## Catppuccin VS Code

- Source: https://github.com/catppuccin/vscode
- License: MIT
- Use: palette of the **Catppuccin** theme (Mocha flavour) —
  `html.theme-catppuccin`, `mlens-catppuccin` Monaco theme, terminal ANSI palette.

---

## Jellybeans Theme

- Source: https://github.com/siwatts/jellybeans-theme-vscode
- License: MIT
- Use: palette of the **Jellybeans** theme (`html.theme-jellybeans`,
  `mlens-jellybeans` Monaco theme, terminal ANSI palette).

---

## Adwaita for VS Code

- Source: https://github.com/piousdeer/vscode-adwaita
- License: MIT
- Use: palette of the **Adwaita** theme (`html.theme-adwaita`,
  `mlens-adwaita` Monaco theme, terminal ANSI palette).

---

## Ubuntu Font Family

- Source: https://github.com/canonical/Ubuntu-fonts and Google Fonts
- License: Ubuntu Font Licence 1.0 (`licenses/Ubuntu-Font-Licence-1.0.txt`)
- Use: bundled `Ubuntu` and `Ubuntu Mono` WOFF2 subsets in
  `src/renderer/design-system/fonts/` (`fonts.css`), offered as UI and terminal
  font choices. Files were generated from the Google Fonts CSS API.

---

## Skyhook Radar

- Source: https://github.com/skyhook-io/radar
- License: Apache License 2.0 (`licenses/Apache-2.0.txt`)
- Use: the visual language and Kubernetes UX were studied at source level, and
  design-token values and component recipes were adapted:
  - colour tokens in `src/renderer/design-system/styles/tokens.css`;
  - typography, radii and status classes in `theme.css` / `components.css`;
  - the resource-table density, filter model, details tab structure, badge
    semantics, logs and terminal surface styling;
  - the kind-specific workload action matrix (scale, restart, pause/resume,
    suspend/resume) and the placement of Scale in a workload's Status section.

Portions derived from Skyhook Radar, Copyright Skyhook, licensed under
Apache-2.0; modified for mLens.

No Radar or Skyhook logos, brand names, or product names are used as mLens
marks. mLens does not include Radar's Go backend.

---

## Fonts

- **DM Sans Variable** and **DM Mono** — Copyright Google, SIL Open Font
  License 1.1 (`licenses/OFL-1.1-DM-Sans.txt`,
  `licenses/OFL-1.1-DM-Mono.txt`). Distributed via
  `@fontsource-variable/dm-sans` and `@fontsource/dm-mono`. The OFL permits
  bundling and redistribution; the fonts are not sold separately.
- **JetBrains Mono**, **Fira Code** and **Source Code Pro** — SIL Open Font
  License 1.1 (`licenses/OFL-1.1-JetBrains-Mono.txt`,
  `licenses/OFL-1.1-Fira-Code.txt`,
  `licenses/OFL-1.1-Source-Code-Pro.txt`). Bundled as unmodified WOFF2 subsets
  (latin, latin-ext, cyrillic; weights 400/700) in
  `src/renderer/design-system/fonts/`, generated from `@fontsource` 5.3.0
  packages. Copyright: JetBrains Mono © 2020 The JetBrains Mono Project Authors;
  Fira Code © 2014–2021 The Fira Code Project Authors; Source Code Pro
  © 2010–2020 Adobe.
- **Tinos** — SIL Open Font License 1.1 (`licenses/OFL-1.1-Tinos.txt`), bundled
  as unmodified WOFF2 subsets (latin, latin-ext, cyrillic; 400/700).
  Copyright © 2026 The Tinos Project Authors. Tinos is metrically compatible
  with Times New Roman and is offered only as an open substitute — the
  proprietary Times New Roman font is not bundled or redistributed.
- **Ubuntu** and **Ubuntu Mono** — Ubuntu Font Licence 1.0
  (`licenses/Ubuntu-Font-Licence-1.0.txt`), bundled WOFF2 subsets generated from
  the Google Fonts CSS API. Copyright Canonical Ltd.
- **Menlo**, **Monaco**, **SF Mono** and **Times New Roman** are only referenced
  as system font-family names; no font files are bundled or redistributed.

---

## Runtime and build libraries

| Package | License | Role |
|---|---|---|
| Electron | MIT | Desktop runtime |
| React / React DOM | MIT | UI |
| Vite / electron-vite | MIT | Build tooling |
| electron-builder | MIT | Installers |
| Tailwind CSS | MIT | Styling |
| Zustand | MIT | Renderer state |
| lucide-react | ISC | Icons |
| @xterm/xterm + addons | MIT | Terminal |
| node-pty | MIT | Local PTYs |
| @kubernetes/client-node | Apache-2.0 | Kubernetes client/auth/watch/log/exec |
| ws | MIT | WebSocket transport (transitive) |
| Monaco Editor / @monaco-editor/react | MIT | YAML editor |
| @tanstack/react-virtual | MIT | Table virtualization |
| yaml | ISC | YAML serialisation in the renderer |
| clsx / tailwind-merge | MIT | Class composition |
| @fontsource packages | OFL-1.1 / MIT | Font distribution |

Transitive dependencies retain their own licenses; production installers should
ship the license metadata generated by electron-builder for the exact dependency
tree.

---

## Trademarks

Kubernetes is a registered trademark of The Linux Foundation. Freelens, Skyhook,
Radar, Lens and their logos are trademarks of their respective owners. mLens is
an independent project and is not endorsed by or affiliated with those projects.
