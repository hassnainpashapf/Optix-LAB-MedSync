/* Writes site/ads.txt from the AdSense publisher id in site/assets/js/ads-config.js.
   - id set (ca-pub-123...): writes `google.com, pub-123..., DIRECT, f08c47fec0942fa0`
   - id empty: removes site/ads.txt, so no ads.txt is published until ads are really switched on.
   Run by `npm run build` (scripts/build-web.sh) before the site is copied; safe to run by hand:  node scripts/gen-ads-txt.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = path.join(root, 'site', 'assets', 'js', 'ads-config.js');
const out = path.join(root, 'site', 'ads.txt');
try {
  const src = fs.readFileSync(cfg, 'utf8');
  const m = /client\s*:\s*['"]([^'"]*)['"]/.exec(src);
  const id = m ? m[1].trim() : '';
  if (/^ca-pub-\d{6,20}$/.test(id)) {
    fs.writeFileSync(out, `google.com, ${id.replace(/^ca-/, '')}, DIRECT, f08c47fec0942fa0\n`);
    console.log(`site/ads.txt written for ${id}`);
  } else {
    fs.rmSync(out, { force: true });
    console.log('No AdSense publisher id set in site/assets/js/ads-config.js: no ads.txt, no ads.');
  }
} catch (e) {
  console.log('ads.txt step skipped:', e.message); /* never break the build over ads */
}
