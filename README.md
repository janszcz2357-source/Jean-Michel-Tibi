# Jean-Michel Tibi

A one-page profile of Jean-Michel Tibi, the French Formula 1 cameraman and director of photography known in the paddock as "the Legend" (JMT). The whole site is in English and French, with a switch in the header.

## What's on the page

- **The job**: his role at Formula One Management, his camera settings (ARRI Amira, 25p at 200 fps), how his slow-motion replays reach the world feed, and a Grand Prix Sunday hour by hour
- **Career**: from Paris motorbike courier (early 1980s) to his 34th F1 season (2025)
- **Shot list**: eighteen moments he filmed, from Spa 2000 to Abu Dhabi 2021, including the one he missed
- **Trust**: the shots he chooses not to take
- **In memory**: Jules Bianchi, Anthoine Hubert and his camera partner Thomas Bonnecarrère
- **Credits**: awards, *Drive to Survive*, the F1 video game, Olympics, football and French TV
- **The memoir**: *30 ans de F1 : Mes histoires secrètes* (City Éditions, 2023)
- **Watch and listen**, **FAQ** and **Sources**: every interview and article the page draws on

This is an unofficial profile compiled from public sources. It is not affiliated with Jean-Michel Tibi, Formula 1 or Formula One Management. It uses no photographs.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Both languages are in the markup; CSS hides the one not selected. |
| `assets/style.css` | All styles. Colour tokens at the top, light and dark themes. |
| `assets/main.js` | Language switch, slow-motion control, viewfinder animation, section highlighting. |
| `assets/favicon.svg` | Tab icon. |
| `assets/og-image.png` | 1200×630 image for link previews. |
| `tools/og-card.html`, `tools/render-og.js` | Source and script for the link-preview image. |

## Viewing and publishing

No build step. Open `index.html` in a browser, or publish with GitHub Pages: Settings → Pages → deploy from this branch, root folder. The `og:image` URL in `index.html` assumes the Pages address `https://janszcz2357-source.github.io/Jean-Michel-Tibi/`; change it if the site lives elsewhere.

The language follows the visitor's browser (French browsers get French). Visitors can switch with the EN / FR buttons, and links ending in `#fr` or `#en` open in that language. The page follows the system light or dark setting and turns off its animation for visitors who ask for reduced motion.

To regenerate the link-preview image after editing `tools/og-card.html`:

```sh
npm install playwright
node tools/render-og.js
```
