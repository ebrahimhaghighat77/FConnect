# Third-party software

FConnect's own code is MIT licensed (see `LICENSE`). The installers also bundle the programs below. FConnect runs them as separate processes and does not modify them. Each keeps its own license, and its full source code is available at the linked release.

FConnect is not affiliated with or endorsed by any of these projects.

| Component | Version | License | Source |
|---|---|---|---|
| Xray-core | 26.10.31 | Mozilla Public License 2.0 | https://github.com/XTLS/Xray-core/tree/v26.10.31 |
| sing-box | 1.14.4 | GNU GPL v3.0 or later, plus the author's name-use condition | https://github.com/SagerNet/sing-box/tree/v1.14.4 |
| ProxiFyre | 2.6.4 | GNU AGPL v3.0 | https://github.com/wiresock/proxifyre/tree/v2.6.4 |
| Windows Packet Filter (driver installer) | 3.6.2.1 | MIT (ndisapi), see the upstream release for driver terms | https://github.com/wiresock/ndisapi/releases/tag/v3.6.2 |
| Electron | 45 | MIT | https://github.com/electron/electron |

The sing-box license adds: "no derivative work may use the name or imply association with this application without prior consent." FConnect is a separate application that launches the unmodified sing-box binary. It does not use the sing-box name for its product.

`npm run cores` downloads exactly these release files and checks each SHA-256 hash, so anyone can reproduce the bundled binaries.

## Libraries compiled into the app

| Library | License |
|---|---|
| React, React DOM | MIT |
| Motion | MIT |
| Lucide icons | ISC |
| Tailwind CSS | MIT |
| Inter, Space Grotesk fonts (via Fontsource) | SIL Open Font License 1.1 |

Electron's own license and the Chromium license list ship next to `FConnect.exe` as `LICENSE.electron.txt` and `LICENSES.chromium.html`.
