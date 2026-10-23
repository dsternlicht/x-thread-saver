# Save X Thread (bookmarklet)

Saves an X post with its whole thread (replies, nested replies, quotes, images, GIFs, videos) as one self-contained HTML file in Downloads. Ads are skipped.

## Install

1. `open install.html`
2. Drag the **💾 Save X Thread** button onto the bookmarks bar (Cmd+Shift+B shows it).

Alternative: create a bookmark by hand and paste the contents of `bookmarklet.txt` as its URL.

## Use

1. Open a post on x.com (a `/status/...` URL).
2. Click the bookmark. It scrolls the thread and expands every "Show replies" button.
3. Keep the tab in front while it collects (a hidden tab stops rendering, so the script pauses).
4. `x-<handle>-<id>.html` lands in Downloads. **Stop & save** cuts a long thread short.

## Files

| File | What |
| --- | --- |
| `src.js` | Source. Edit this one. |
| `build.js` | `node build.js` minifies `src.js` (terser via npx) and writes the files below. |
| `dist.min.js` | Minified code. |
| `bookmarklet.txt` | The `javascript:` URL. |
| `install.html` | Page with the drag-to-bookmarks button. |

After editing `src.js`, run `node build.js` and re-drag the button from `install.html`.

## How it works

- **Post data:** read from X's React props on each post (`memoizedProps.tweet`). That gives the full text of long posts, reply parent ids for nesting, and mp4 video variants. If X changes its internals, it falls back to reading the page, but real videos and reply nesting are lost.
- **Media:** images, avatars and videos are fetched from pbs/video.twimg.com and inlined as data URIs.
- **Video size:** a video is embedded at the best quality under 60 MB (`MAX_VIDEO`). Otherwise it links to the original.
- **Ads:** posts with no permalink timestamp, or with an "Ad"/"Promoted" label, are skipped.
- **Video lookups:** x.com's CSP blocks the public `cdn.syndication.twimg.com` endpoint, so it isn't used.
