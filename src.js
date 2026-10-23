(async () => {
  const SID = (location.pathname.match(/\/status\/(\d+)/) || [])[1];
  if (!/(^|\.)(x|twitter)\.com$/.test(location.hostname) || !SID) {
    alert('Open a post on x.com first (a URL with /status/...)');
    return;
  }
  if (window.__xts) return;
  window.__xts = 1;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const abs = (h) => { try { return new URL(h, location.origin).href; } catch (e) { return h; } };
  const col = () => document.querySelector('[data-testid="primaryColumn"]') || document;

  /* progress overlay */
  let stop = false;
  const ui = document.createElement('div');
  ui.style.cssText = 'position:fixed;z-index:2147483647;top:12px;right:12px;background:#1d9bf0;color:#fff;padding:10px 14px;border-radius:12px;font:600 14px system-ui;box-shadow:0 4px 20px #0006;display:flex;gap:10px;align-items:center';
  ui.innerHTML = '<span>Starting…</span><button style="border:0;border-radius:8px;padding:4px 10px;font:600 13px system-ui;cursor:pointer">Stop &amp; save</button>';
  const st = ui.firstChild;
  ui.lastChild.onclick = () => { stop = true; ui.lastChild.remove(); };
  document.body.appendChild(ui);
  const say = (t) => { st.textContent = t; };

  /* ---------- reading posts ---------- */
  // X keeps the full tweet object (full text, mp4 variants, reply ids) in React props.
  function tweetData(art) {
    const k = Object.keys(art).find((k) => k.startsWith('__reactFiber'));
    let f = k && art[k];
    for (let i = 0; f && i < 60; i++, f = f.return) if (f.memoizedProps?.tweet?.id_str) return f.memoizedProps.tweet;
    return null;
  }

  // full_text / note_tweet -> html with real links
  function textHtml(t) {
    const note = t.note_tweet?.note_tweet_results?.result || t.note_tweet;
    let txt, urls;
    if (note?.text) {
      txt = note.text;
      urls = note.entity_set?.urls || [];
    } else {
      const cps = Array.from(t.full_text || t.text || '');
      const [a, b] = t.display_text_range || [0, cps.length];
      txt = cps.slice(a, b).join('');
      urls = t.entities?.urls || [];
    }
    for (const m of t.entities?.media || []) txt = txt.split(m.url).join('');
    let h = esc(txt.trim());
    for (const u of urls) h = h.split(u.url).join(`\u0000a href="${esc(u.expanded_url)}"\u0001${esc(u.display_url || u.expanded_url)}\u0000/a\u0001`);
    h = h.replace(/(^|[^\w&])@(\w{1,15})/g, '$1\u0000a href="https://x.com/$2"\u0001@$2\u0000/a\u0001')
      .replace(/(^|[^\w&])#([\p{L}\p{N}_]+)/gu, '$1\u0000a href="https://x.com/hashtag/$2"\u0001#$2\u0000/a\u0001');
    return h.replace(/\u0000/g, '<').replace(/\u0001/g, '>').replace(/\n/g, '<br>');
  }

  function mediaOf(t) {
    const photos = [], videos = [];
    for (const m of t.extended_entities?.media || t.entities?.media || []) {
      if (m.type === 'photo') photos.push(m.media_url_https.replace(/\.(\w+)$/, '?format=$1&name=large'));
      else {
        const v = (m.video_info?.variants || []).filter((x) => x.content_type === 'video/mp4').sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
        videos.push({ poster: m.media_url_https, src: v[0]?.url || '', variants: v.map((x) => x.url), gif: m.type === 'animated_gif' });
      }
    }
    return { photos, videos };
  }

  function fromData(t) {
    const u = t.user || t.core?.user_results?.result?.legacy || {};
    const handle = u.screen_name || t.user?.core?.screen_name || '';
    return {
      id: t.id_str,
      parent: t.in_reply_to_status_id_str || '',
      url: `https://x.com/${handle}/status/${t.id_str}`,
      name: u.name || t.user?.core?.name || '',
      handle: handle ? '@' + handle : '',
      verified: !!(u.is_blue_verified || u.verified || t.user?.is_blue_verified),
      avatar: (u.profile_image_url_https || t.user?.avatar?.image_url || '').replace('_normal.', '_bigger.'),
      time: t.created_at ? new Date(t.created_at).toISOString() : '',
      replyingTo: t.in_reply_to_screen_name ? `Replying to @${t.in_reply_to_screen_name}` : '',
      html: textHtml(t),
      ...mediaOf(t),
      stats: { replies: t.reply_count, reposts: t.retweet_count, quotes: t.quote_count, likes: t.favorite_count, bookmarks: t.bookmark_count, views: t.views?.count },
      quote: t.quoted_status?.id_str ? fromData(t.quoted_status) : null,
    };
  }

  /* DOM fallback if X ever changes its internals */
  function domText(el) {
    if (!el) return '';
    let out = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) out += esc(n.textContent).replace(/\n/g, '<br>');
      else if (n.nodeName === 'IMG') out += esc(n.alt || '');
      else if (n.nodeName === 'A') out += `<a href="${esc(abs(n.getAttribute('href')))}">${esc(n.innerText)}</a>`;
      else if (n.nodeType === 1) out += domText(n);
    }
    return out;
  }
  function fromDom(art, id, link) {
    const un = art.querySelector('[data-testid="User-Name"]');
    const spans = un ? [...un.querySelectorAll('span')].map((s) => s.innerText.trim()) : [];
    return {
      id, parent: '', url: abs(link.getAttribute('href')),
      name: un?.querySelector('a')?.innerText.split('\n')[0] || '',
      handle: spans.find((t) => /^@\w+$/.test(t)) || '',
      avatar: art.querySelector('[data-testid="Tweet-User-Avatar"] img')?.src || '',
      time: art.querySelector('time')?.getAttribute('datetime') || '',
      html: domText(art.querySelector('[data-testid="tweetText"]')),
      photos: [...art.querySelectorAll('[data-testid="tweetPhoto"] img')].map((i) => i.src).filter((s) => /\/media\//.test(s)),
      videos: [...art.querySelectorAll('video')].map((v) => ({ poster: v.poster, src: v.src.startsWith('blob:') ? '' : v.src })),
      stats: {},
    };
  }

  function card(art) {
    const c = art.querySelector('[data-testid="card.wrapper"]');
    if (!c) return null;
    const a = c.querySelector('a[href]');
    return { href: a ? abs(a.getAttribute('href')) : '', text: c.innerText.trim(), img: c.querySelector('img')?.src || '' };
  }

  const tweets = new Map();
  function endMarker() {
    return [...col().querySelectorAll('h2')].find((h) => /^(Discover more|More posts|Related posts|Relevant people)/i.test(h.innerText.trim()));
  }
  function grab() {
    const end = endMarker();
    for (const art of col().querySelectorAll('article[data-testid="tweet"]')) {
      if (end && end.compareDocumentPosition(art) & Node.DOCUMENT_POSITION_FOLLOWING) continue;
      const link = art.querySelector('a[href*="/status/"] time')?.closest('a');
      const id = link && (link.getAttribute('href').match(/status\/(\d+)/) || [])[1];
      if (!id || tweets.has(id)) continue; // no permalink = ad
      if ([...art.querySelectorAll('span')].some((s) => /^(Ad|Promoted)$/.test(s.innerText.trim()))) continue;
      const d = tweetData(art);
      const t = d && d.id_str === id ? fromData(d) : fromDom(art, id, link);
      t.card = card(art);
      tweets.set(id, t);
    }
    return end;
  }

  function clickShowButtons() {
    let n = 0;
    for (const b of col().querySelectorAll('[role="button"], button')) {
      if (b.__xts) continue;
      const t = (b.innerText || '').trim();
      if (/^(Show replies|Show more replies|Show probable spam|Show additional replies.*|Show)$/i.test(t)) {
        b.__xts = 1;
        b.click();
        n++;
      }
    }
    return n;
  }

  const startUrl = location.href;
  for (let i = 0; i < 40 && !col().querySelector('article[data-testid="tweet"]'); i++) await sleep(250);
  scrollTo(0, 0);
  await sleep(1200);
  let idle = 0;
  // a hidden or covered tab stops painting, so new replies never render; wait instead of treating it as the end
  const painting = () => new Promise((r) => { requestAnimationFrame(() => r(true)); setTimeout(() => r(false), 1000); });
  for (let i = 0; i < 1500 && !stop; i++) {
    if (location.href !== startUrl) { history.back(); await sleep(2000); }
    if (!(await painting())) { say('Paused: keep this tab in front'); idle = 0; await sleep(1000); continue; }
    const before = tweets.size;
    const y = scrollY;
    grab();
    const clicked = clickShowButtons();
    if (clicked) await sleep(1500);
    scrollBy(0, innerHeight * 0.7);
    await sleep(idle ? 1500 : 700);
    const end = grab();
    const loading = col().querySelector('[role="progressbar"]');
    const atEnd = (end && end.getBoundingClientRect().top < innerHeight) || (Math.abs(scrollY - y) < 2 && tweets.size === before);
    idle = atEnd && !clicked && !loading ? idle + 1 : 0;
    say(`Collecting… ${tweets.size} posts`);
    if (idle >= 6) break;
  }

  /* ---------- media ---------- */
  const list = [...tweets.values()];
  if (!list.length) { say('No posts found'); setTimeout(() => ui.remove(), 3000); window.__xts = 0; return; }
  const main = tweets.get(SID) || list[0];

  const toData = (blob) => new Promise((r) => { const f = new FileReader(); f.onload = () => r(f.result); f.onerror = () => r(''); f.readAsDataURL(blob); });
  const cache = new Map();
  const MAX_VIDEO = 60e6;
  function inline(url, max = 20e6) {
    if (!url) return Promise.resolve('');
    if (!cache.has(url)) {
      cache.set(url, (async () => {
        const ac = new AbortController();
        try {
          const res = await fetch(url, { credentials: 'omit', signal: ac.signal });
          if (!res.ok || +res.headers.get('content-length') > max) { ac.abort(); return url; }
          const b = await res.blob();
          return b.size > max ? url : await toData(b);
        } catch (e) { return url; }
      })());
    }
    return cache.get(url);
  }

  async function inlineAll(t) {
    t.avatar = await inline(t.avatar);
    t.photos = await Promise.all(t.photos.map((p) => inline(p)));
    for (const v of t.videos) {
      v.remote = v.src;
      v.poster = await inline(v.poster);
      // best quality that fits; long 1080p videos can be over 1 GB
      for (const u of v.variants || [v.src]) {
        const d = await inline(u, MAX_VIDEO);
        if (d.startsWith('data:')) { v.src = d; v.lowres = u !== v.remote; break; }
      }
      if (v.src === v.remote) v.tooBig = true;
    }
    if (t.card?.img) t.card.img = await inline(t.card.img);
    if (t.quote) await inlineAll(t.quote);
  }
  let done = 0;
  const queue = [...list];
  await Promise.all(Array.from({ length: 6 }, async () => {
    for (let t; (t = queue.shift());) { await inlineAll(t); say(`Downloading media… ${++done}/${list.length}`); }
  }));

  /* ---------- render ---------- */
  const n = (x) => (x == null || x === '' ? '' : Number(x) >= 1e6 ? (x / 1e6).toFixed(1) + 'M' : Number(x) >= 1e4 ? (x / 1e3).toFixed(1) + 'K' : String(x));
  const fmtTime = (d) => (d ? new Date(d).toLocaleString() : '');
  const mediaHtml = (m) =>
    (m.photos.length ? `<div class="grid n${Math.min(m.photos.length, 4)}">${m.photos.map((p) => `<a href="${esc(p)}" target="_blank"><img src="${esc(p)}"></a>`).join('')}</div>` : '') +
    m.videos.map((v) => (v.src
      ? `<video controls ${v.gif ? 'autoplay loop muted playsinline' : 'preload="metadata"'} poster="${esc(v.poster)}" src="${esc(v.src)}"></video>${v.tooBig ? `<div class="note">Video too large to embed; it streams from X when online. <a href="${esc(v.remote)}">Open the original</a></div>` : v.lowres ? `<div class="note">Embedded at reduced quality. <a href="${esc(v.remote)}">Full quality on X</a></div>` : ''}`
      : `<div class="note">${v.poster ? `<img src="${esc(v.poster)}">` : ''}Video unavailable</div>`)).join('');
  const who = (u) => `<b>${esc(u.name)}</b>${u.verified ? ' <span class="ver">✔</span>' : ''} <span class="h">${esc(u.handle)}</span>`;
  const statsHtml = (s) => [['💬', s.replies], ['🔁', s.reposts], ['❝', s.quotes], ['❤️', s.likes], ['🔖', s.bookmarks], ['📊', s.views]]
    .filter((x) => Number(x[1]) > 0).map((x) => `<span>${x[0]} ${n(x[1])}</span>`).join('');

  const post = (t) => `<article class="tw${t.id === SID ? ' focal' : ''}" id="t${t.id}">
<img class="av" src="${esc(t.avatar)}">
<div class="c">
<div class="hd">${who(t)} · <a class="h" href="${esc(t.url)}">${esc(fmtTime(t.time))}</a>${t.handle && t.handle === main.handle ? ' <span class="badge">Author</span>' : ''}</div>
${t.replyingTo && t.id !== SID ? `<div class="h small">${esc(t.replyingTo)}</div>` : ''}
<div class="txt" dir="auto">${t.html}</div>
${mediaHtml(t)}
${t.card ? `<a class="card" href="${esc(t.card.href)}">${t.card.img ? `<img src="${esc(t.card.img)}">` : ''}<div dir="auto">${esc(t.card.text).replace(/\n/g, '<br>')}</div></a>` : ''}
${t.quote ? `<a class="quote" href="${esc(t.quote.url)}"><div class="hd">${who(t.quote)} · <span class="h">${esc(fmtTime(t.quote.time))}</span></div><div class="txt" dir="auto">${t.quote.html}</div>${mediaHtml(t.quote)}</a>` : ''}
<div class="st">${statsHtml(t.stats)}</div>
</div></article>`;

  // nest replies under their parent; ancestors of the focal post stay flat above it
  const kids = new Map();
  const isAncestor = new Set();
  for (let p = tweets.get(SID)?.parent; p && tweets.has(p); p = tweets.get(p).parent) isAncestor.add(p);
  const roots = [];
  for (const t of list) {
    if (t.id === SID || isAncestor.has(t.id)) continue;
    const p = t.parent && tweets.has(t.parent) && t.parent !== SID ? t.parent : null;
    if (p) (kids.get(p) || kids.set(p, []).get(p)).push(t);
    else roots.push(t);
  }
  const tree = (t, depth) => post(t) + ((kids.get(t.id) || []).length ? `<div class="kids${depth > 6 ? ' flat' : ''}">${kids.get(t.id).map((k) => tree(k, depth + 1)).join('')}</div>` : '');
  const ancestors = list.filter((t) => isAncestor.has(t.id));
  const body = ancestors.map(post).join('') + (tweets.has(SID) ? post(main) : '') +
    (roots.length ? `<h2 class="sec">Replies</h2>` : '') + roots.map((t) => `<div class="thread">${tree(t, 0)}</div>`).join('');

  const plain = main.html.replace(/<[^>]+>/g, ' ').replace(/&\w+;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(`${main.name}: ${plain.slice(0, 70)}`)}</title>
<style>
:root{--bg:#fff;--fg:#0f1419;--mut:#536471;--bd:#eff3f4;--acc:#1d9bf0;--hi:#f7f9f9}
@media(prefers-color-scheme:dark){:root{--bg:#000;--fg:#e7e9ea;--mut:#71767b;--bd:#2f3336;--hi:#16181c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:640px;margin:0 auto;border-left:1px solid var(--bd);border-right:1px solid var(--bd);min-height:100vh}
header{padding:16px;border-bottom:1px solid var(--bd)}header h1{font-size:18px;margin:0 0 4px}header p{margin:0;color:var(--mut);font-size:13px;overflow-wrap:anywhere}
a{color:var(--acc);text-decoration:none}a:hover{text-decoration:underline}
.tw{display:flex;gap:12px;padding:12px 16px}.thread,.focal{border-bottom:1px solid var(--bd)}.tw.focal{background:var(--hi)}.tw.focal .txt{font-size:18px}
.kids{margin-left:36px;border-left:2px solid var(--bd)}.kids.flat{margin-left:0;border-left:0}
.av{width:40px;height:40px;border-radius:50%;flex:none;background:var(--bd);object-fit:cover}.c{min-width:0;flex:1}
.hd{overflow-wrap:anywhere}.h,.small{color:var(--mut)}.small{font-size:13px}.ver{color:var(--acc)}
.badge{font-size:11px;background:var(--acc);color:#fff;border-radius:4px;padding:1px 5px;vertical-align:middle}
.txt{margin:4px 0;overflow-wrap:anywhere}.txt a{unicode-bidi:isolate}
.grid{display:grid;gap:2px;margin:8px 0;border-radius:16px;overflow:hidden;border:1px solid var(--bd)}.grid.n2,.grid.n3,.grid.n4{grid-template-columns:1fr 1fr}.grid.n3 a:first-child{grid-row:span 2}
.grid img{width:100%;height:100%;object-fit:cover;display:block;max-height:560px}.grid.n1 img{object-fit:contain}
video{width:100%;max-height:560px;border-radius:16px;margin:8px 0;background:#000;display:block}
.note{color:var(--mut);font-size:13px;margin:6px 0}.note img{width:100%;border-radius:16px;display:block;margin-bottom:4px}
.card,.quote{display:block;border:1px solid var(--bd);border-radius:16px;overflow:hidden;margin:8px 0;color:var(--fg)}.card img{width:100%;display:block}.card div{padding:10px;font-size:14px;color:var(--mut)}
.quote{padding:10px 12px}.quote:hover{text-decoration:none;background:var(--hi)}
.st{display:flex;gap:18px;color:var(--mut);font-size:13px;margin-top:6px;flex-wrap:wrap}
.sec{font-size:15px;margin:0;padding:12px 16px;border-bottom:1px solid var(--bd);color:var(--mut)}
</style></head><body><main>
<header><h1>${esc(main.name)} <span class="h">${esc(main.handle)}</span></h1><p>${list.length} posts · saved ${esc(new Date().toLocaleString())} from <a href="${esc(startUrl)}">${esc(startUrl)}</a></p></header>
${body}
</main></body></html>`;

  const name = `x-${(main.handle || 'thread').replace('@', '')}-${SID}.html`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 10000);
  say(`Saved ${list.length} posts → ${name} (${(html.length / 1e6).toFixed(1)} MB)`);
  setTimeout(() => ui.remove(), 6000);
  window.__xts = 0;
})();
