# Jean-Michel Tibi

A one-page profile of Jean-Michel Tibi, the French Formula 1 cameraman and director of photography known in the paddock as "the Legend" (JMT). The whole site is in English and French, with a switch in the header.

## What's on the page

- **The job**: his role at Formula One Management, his camera settings (ARRI Amira, 25p at 200 fps), a side-by-side demo of why he shoots 200 frames a second, how his slow-motion replays reach the world feed, and a Grand Prix Sunday hour by hour
- **Career**: from Paris motorbike courier (early 1980s) to his 34th F1 season (2025)
- **Shot list**: eighteen moments he filmed, from Spa 2000 to Abu Dhabi 2021, including the one he missed
- **Trust**: the shots he chooses not to take
- **In memory**: Jules Bianchi, Anthoine Hubert and his camera partner Thomas Bonnecarrère
- **Credits**: awards, *Drive to Survive*, the F1 video game, Olympics, football and French TV
- **The memoir**: *30 ans de F1 : Mes histoires secrètes* (City Éditions, 2023)
- **Shot map**: an LED-style map of the whole world with a Europe close-up. Filled pins are the eighteen moments: each jumps to its story, and a line joins them in the order they happened. Rings mark every other circuit on his Formula 1 calendar since 1997, plus Le Mans, and the list beside the maps gives the years each circuit was on the calendar. The list in `index.html` is the source the rings are drawn from.
- **Watch and listen**: the documentary, the podcast and the Matt Amys video play on the page
- **FAQ** and **Sources**: every interview and article the page draws on

## Motion

The animations come from his job:

- **Power-on.** The lens iris opens, frame lines snap in, the camera readouts flicker on, the stat counters spin, and his name is pulled into focus.
- **Focus pull.** Point at the viewfinder to move the focus box. Light trails off the focus plane go soft, with bokeh discs, and in-focus trails get red focus peaking. Out-of-focus lights in the background swell and shrink as the focus moves. The readout shows the focus distance.
- **Playback.** 8× slow (200 fps played at 25p), real time, or pause, which stops every looping animation.
- **Rewind.** "Rewind to the top" runs the tape backwards while the page scrolls up.
- **Why 200 fps.** The same pass by a car, filmed at 25 and at 200 frames a second and both played at 25p. Slowed eight times, the 25 fps car jumps and its wheels turn the wrong way; the 200 fps car glides. Switch to real time and the two look the same.
- **Reading.** Each piece of content plays in once as it reaches the screen. Headings rack into focus while frame lines lock onto them, section labels type on, career rows wipe in, shot cards are framed as they arrive, the book swings in on its spine, and the big quotes resolve word by word. A red editing-timeline playhead runs down the career, the shot-map route draws itself with each pin landing as the line reaches it, a signal travels through the replay diagram, and the header's underline glides to the section you're in. The REC light drops to standby in the two sections about what he won't film and the people he lost. The memorial section stays still.

The reveals are built to keep up with the reader. Each one is short and front-loaded, so text is legible within a fraction of a second. Content already on screen when the page loads is never hidden. On a fast scroll, what is about to arrive is shown before it gets there, so the page never goes blank or trails behind.

On phones the section links move into a full-screen menu. Videos play inline through YouTube's privacy-enhanced player; inside a frame, where embeds are blocked, the same links open YouTube instead.

Visitors who ask their system for reduced motion get the complete page with none of it; the frame-rate demo becomes a still multiple exposure of the same tenth of a second from each camera.

This is an unofficial profile compiled from public sources. It is not affiliated with Jean-Michel Tibi, Formula 1 or Formula One Management. It uses no photographs apart from YouTube’s own previews of the videos.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The page. Both languages are in the markup; CSS hides the one not selected. |
| `assets/style.css` | All styles. Colour tokens at the top; the site has one dark look. |
| `assets/main.js` | Language switch, viewfinder (focus pull, playback, rewind, background lights), shot map (land data embedded as compact bit grids), scroll reveals, replay diagram, frame-rate demo, video players, phone menu, sharing, career playhead, section highlighting. |
| `assets/favicon.svg` | Tab icon. |
| `404.html` | "No signal" page with broadcast colour bars, shown for any address that doesn't exist. |
| `vercel.json` | Security headers for the Vercel deployment. |
| `robots.txt`, `sitemap.xml` | For search engines. |
| `assets/og-image.png` | 1200×630 image for link previews. |
| `tools/og-card.html`, `tools/render-og.js` | Source and script for the link-preview image. |

## Live site

**https://jean-michel-tibi.vercel.app**

The site is deployed on Vercel (project `jean-michel-tibi`), linked to this GitHub repository. Every push to `ccr-e84df72d-gatvo0`, the repository's default branch, redeploys production automatically. There is no build step: Vercel serves the files as they are. `.vercelignore` keeps `tools/` and this README off the public site.

To view it locally, open `index.html` in a browser.

The language follows the visitor's browser (French browsers get French). Visitors can switch with the EN / FR buttons, and links ending in `#fr` or `#en` open in that language. The site is dark only, whatever the system setting.

To regenerate the link-preview image after editing `tools/og-card.html`:

```sh
npm install playwright
node tools/render-og.js
```
