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

## Motion

The animations come from his job:

- **Power-on.** The lens iris opens, frame lines snap in, the camera readouts flicker on, the stat counters spin, and his name is pulled into focus.
- **Focus pull.** Point at the viewfinder to move the focus box. Light trails off the focus plane go soft, with bokeh discs, and in-focus trails get red focus peaking. The readout shows the focus distance.
- **Playback.** 8× slow (200 fps played at 25p), real time, or pause, which stops every looping animation.
- **Rewind.** "Rewind to the top" runs the tape backwards while the page scrolls up.
- **Reading.** Headings rack into focus, labels type on, the big quotes resolve word by word, and a red editing-timeline playhead runs down the career. A signal travels through the replay diagram, and the header's REC light drops to standby in the two sections about what he won't film and the people he lost. The memorial section stays still.

Visitors who ask their system for reduced motion get the complete page with none of it. Scroll reveals never hide content at rest: an element keeps its normal look until it reaches the screen.

This is an unofficial profile compiled from public sources. It is not affiliated with Jean-Michel Tibi, Formula 1 or Formula One Management. It uses no photographs.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Both languages are in the markup; CSS hides the one not selected. |
| `assets/style.css` | All styles. Colour tokens at the top, light and dark themes. |
| `assets/main.js` | Language switch, viewfinder (focus pull, playback, rewind), scroll reveals, replay diagram, career playhead, section highlighting. |
| `assets/favicon.svg` | Tab icon. |
| `assets/og-image.png` | 1200×630 image for link previews. |
| `tools/og-card.html`, `tools/render-og.js` | Source and script for the link-preview image. |

## Live site

**https://jean-michel-tibi.vercel.app**

The site is deployed on Vercel (project `jean-michel-tibi`), linked to this GitHub repository. Every push to `ccr-e84df72d-gatvo0`, the repository's default branch, redeploys production automatically. There is no build step: Vercel serves the files as they are. `.vercelignore` keeps `tools/` and this README off the public site.

To view it locally, open `index.html` in a browser.

The language follows the visitor's browser (French browsers get French). Visitors can switch with the EN / FR buttons, and links ending in `#fr` or `#en` open in that language. The page follows the system light or dark setting.

To regenerate the link-preview image after editing `tools/og-card.html`:

```sh
npm install playwright
node tools/render-og.js
```
