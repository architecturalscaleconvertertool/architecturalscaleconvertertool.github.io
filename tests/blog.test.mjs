import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://architecturalscaleconvertertool.github.io';
const slugs = readdirSync(join(root, 'blog')).filter((d) => statSync(join(root, 'blog', d)).isDirectory());
const pages = [['/blog/', 'blog/index.html'], ...slugs.map((s) => [`/blog/${s}/`, `blog/${s}/index.html`])]
  .map(([path, file]) => ({ path, html: readFileSync(join(root, file), 'utf8') }));
const posts = pages.slice(1);
const attr = (html, re) => html.match(re)?.[1];

test('guides exist and /blog/ lists every one of them', () => {
  assert.ok(slugs.length >= 1);
  for (const s of slugs) assert.ok(pages[0].html.includes(`href="/blog/${s}/"`), `/blog/ misses ${s}`);
});

test('each guide page: one H1, title up to 60 characters, description 120 to 160, canonical = own URL', () => {
  for (const { path, html } of pages) {
    assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1, `${path} H1 count`);
    const title = attr(html, /<title>([^<]*)<\/title>/);
    const desc = attr(html, /<meta name="description" content="([^"]*)"/);
    assert.ok(title && title.length <= 60, `${path} title length ${title?.length}`);
    assert.ok(desc && desc.length >= 120 && desc.length <= 160, `${path} description length ${desc?.length}`);
    assert.equal(attr(html, /<link rel="canonical" href="([^"]*)"/), `${ORIGIN}${path}`);
  }
});

test('titles and descriptions are unique across guides', () => {
  const titles = pages.map((p) => attr(p.html, /<title>([^<]*)<\/title>/));
  const descs = pages.map((p) => attr(p.html, /<meta name="description" content="([^"]*)"/));
  assert.equal(new Set(titles).size, titles.length);
  assert.equal(new Set(descs).size, descs.length);
});

test('schema parses: Article + BreadcrumbList on each guide, Blog on /blog/', () => {
  for (const { path, html } of pages) {
    const graph = JSON.parse(attr(html, /<script type="application\/ld\+json">([\s\S]*?)<\/script>/))['@graph'];
    const types = graph.map((n) => n['@type']);
    assert.ok(types.includes('BreadcrumbList'), `${path} breadcrumb`);
    assert.ok(types.includes(path === '/blog/' ? 'Blog' : 'Article'), `${path} main type`);
  }
});

test('every image has alt text and its intrinsic size, and the file exists', () => {
  for (const { path, html } of posts) {
    for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
      assert.match(tag, /alt="[^"]{10,}"/, `${path} alt: ${tag}`);
      assert.match(tag, /width="\d+" height="\d+"/, `${path} size: ${tag}`);
      assert.ok(existsSync(join(root, attr(tag, /src="([^"]+)"/))), `${path} file: ${tag}`);
    }
  }
});

test('internal links resolve to a built page and headings they point at exist; guides link nowhere outside the site', () => {
  for (const { path, html } of posts) {
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith('#')) { assert.ok(html.includes(`id="${href.slice(1)}"`), `${path} anchor ${href}`); continue; }
      if (/^(https?:|mailto:)/.test(href)) {
        const article = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
        assert.ok(!article.includes(`href="${href}"`), `${path} external link inside the guide: ${href}`);
        continue;
      }
      if (href.startsWith('/assets/') || href === '/favicon.ico') continue;
      const file = href.endsWith('/') ? `${href}index.html` : href;
      assert.ok(existsSync(join(root, file.split('#')[0])), `${path} broken link ${href}`);
    }
  }
});

test('each guide links back to the converter once from its body and carries at most 6 links to other guides', () => {
  for (const { path, html } of posts) {
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    assert.equal((article.match(/<aside class="post-cta"[\s\S]*?href="\/"/g) ?? []).length, 1, `${path} CTA`);
    const out = new Set([...article.matchAll(/href="(\/blog\/[^"#]+)"/g)].map((m) => m[1]).filter((h) => h !== path));
    assert.ok(out.size >= 2 && out.size <= 6, `${path} links to ${out.size} guides`);
  }
});

test('no writer labels or empty paragraphs left in the copy', () => {
  for (const { path, html } of posts) {
    const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(visible, /\bH[1-6]:\s/, `${path} heading label`);
    assert.doesNotMatch(html, /<p>\s*<\/p>/, `${path} empty paragraph`);
  }
});
