// node build.js -> bookmarklet.txt + install.html
const fs = require('fs');
const { execSync } = require('child_process');

let code = fs.readFileSync(__dirname + '/src.js', 'utf8');
try {
  code = execSync('npx -y terser@5.36.0 --compress --mangle --format ascii_only=true', { input: code, maxBuffer: 1e7 }).toString().trim();
} catch (e) {
  console.warn('terser unavailable, using unminified source');
}
fs.writeFileSync(__dirname + '/dist.min.js', code);
const bookmarklet = 'javascript:' + encodeURIComponent(code);
fs.writeFileSync(__dirname + '/bookmarklet.txt', bookmarklet + '\n');

const attr = bookmarklet.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
fs.writeFileSync(__dirname + '/install.html', `<!doctype html><html><head><meta charset="utf-8"><title>Save X Thread bookmarklet</title>
<style>body{font:16px/1.5 system-ui;max-width:560px;margin:60px auto;padding:0 16px;color:#0f1419}
a.bm{display:inline-block;background:#1d9bf0;color:#fff;padding:10px 18px;border-radius:999px;font-weight:700;text-decoration:none;cursor:grab}
ol li{margin:6px 0}code{background:#eff3f4;padding:1px 5px;border-radius:4px}</style></head><body>
<h1>Save X Thread</h1>
<p>Drag this button to your bookmarks bar (show it with <code>Cmd+Shift+B</code>):</p>
<p><a class="bm" href="${attr}">💾 Save X Thread</a></p>
<ol><li>Open any post on x.com</li><li>Click the bookmark</li><li>Wait while it scrolls through the replies (or press <b>Stop &amp; save</b>)</li><li>A self-contained <code>x-&lt;handle&gt;-&lt;id&gt;.html</code> lands in Downloads</li></ol>
</body></html>\n`);
console.log(`bookmarklet: ${bookmarklet.length} chars`);
