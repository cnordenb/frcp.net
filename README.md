NB: Civ Explorer has its own [github repository](https://github.com/cnordenb/aoe2civexplorer/).

# [frcp.net](https://frcp.net/)

<img width="576" height="620" alt="image" src="https://github.com/user-attachments/assets/b77ce274-c839-4a3d-9f37-26debb78099d" />



Fresh Random Civ Picker in the browser. Ported to HTML, CSS and JavaScript from the [C++ Windows GUI version](https://github.com/cnordenb/Fresh-Random-Civ-Picker_GUI).

## Using UI elements from Age of Empires 2.
- Sourced from all 3 editions of the game using both asset files and screenshots
- Humanly handcrafted in Paint .NET to fit FRCP bespoke

## New in this version of FRCP: share civ pool with URL link.
- Example, a civ pool of AoK civs: https://frcp.net/#p=1Cg4QBAgiAl8
- Example, civ pool + draw log: https://frcp.net/#p=1Cg4QBBgiAl8.yQwJK1pF

## Tests
- Run `npm test` with Node.js 22 or newer. There's nothing to install.
- Covers the civ data and its icons, atlases and jingles, saved state, drawing and continuous freshness, share links and preset files.
- The swipe tests draw, undo, re-roll and reset with a finger in the phone layout, in the same headless browser as the WCAG tests.
- The WCAG tests check simple mode ([frcp.net/simple](https://frcp.net/simple)) against WCAG 2.2 at level AAA in a headless Chrome, Edge or Chromium, whichever the machine has (`CHROME_PATH` can point to one). They open every tab, menu and dialog at desktop, 200 % and 400 % zoom sizes, in dark mode and with WCAG's text spacing, and use the page with the keyboard and the mouse. Without a browser, or with `FRCP_NO_BROWSER` set, they skip. They use [axe-core](https://github.com/dequelabs/axe-core) 4.10.2, kept in `tests/vendor` under its own licence (MPL 2.0).
- The compatibility tests also compare data.json with the [desktop version](https://github.com/cnordenb/Fresh-Random-Civ-Picker_GUI)'s when its repository sits next to this one, or at `FRCP_DESKTOP_DIR`.
- GitHub Actions runs them on every push.

## Acknowledgements

Aoe2techtree © HSZemi. frcp.net/civpicker uses aoe2techtree for localisation and tech tree data, permissible under its [MIT license](https://github.com/SiegeEngineers/aoe2techtree/blob/master/LICENSE).

Age of Empires II © Microsoft Corporation. Fresh Random Civ Picker ([frcp.net](https://frcp.net/)) was created under Microsoft's "[Game Content Usage Rules](https://www.xbox.com/en-US/developers/rules)" using assets from Age of Empires II: The Age of Kings, Age of Empires II: HD Edition, and Age of Empires II: Definitive Edition, and it is not endorsed by or affiliated with Microsoft.

Development of frcp.net was accelerated with Claude Opus 5.5.