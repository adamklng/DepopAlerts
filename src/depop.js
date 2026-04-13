const puppeteer = require('puppeteer');

let browser = null;

async function getBrowser() {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
  }
  return browser;
}

async function searchDepop(query, filters = {}) {
  const params = new URLSearchParams({ q: query, sort: 'newlyListed' });

  if (filters.minPrice) params.set('priceMin', filters.minPrice);
  if (filters.maxPrice) params.set('priceMax', filters.maxPrice);
  if (filters.category) {
    if (filters.category === 'male' || filters.category === 'female') {
      params.set('gender', filters.category);
    } else {
      params.set('categories', filters.category);
    }
  }
  // Size and condition are filtered client-side — Depop URL params don't work reliably

  const url = `https://www.depop.com/search/?${params.toString()}`;
  console.log(`[Depop] Searching: ${url}`);

  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    // Block heavy resources to speed up page load
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      const reqUrl = req.url();
      if (['font', 'media', 'image', 'stylesheet'].includes(type) ||
          reqUrl.includes('google') || reqUrl.includes('analytics') ||
          reqUrl.includes('sentry') || reqUrl.includes('branch.io') ||
          reqUrl.includes('pinterest') || reqUrl.includes('reddit') ||
          reqUrl.includes('facebook') || reqUrl.includes('tiktok')) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Extract products from RSC data embedded in script tags
    const rawProducts = await page.evaluate(() => {
      for (const script of document.scripts) {
        const text = script.textContent;
        if (!text || !text.includes('date_created')) continue;

        // Handle varying RSC escape levels: \\\" -> \" -> "
        let unescaped = text.replace(/\\\\\"/g, '\\"').replace(/\\"/g, '"').replace(/\\n/g, '\n');

        const marker = '"products":[{"id":';
        const idx = unescaped.indexOf(marker);
        if (idx === -1) continue;

        const arrStart = idx + '"products":'.length;
        let depth = 0;
        let arrEnd = arrStart;
        for (let i = arrStart; i < unescaped.length && i < arrStart + 500000; i++) {
          if (unescaped[i] === '[') depth++;
          if (unescaped[i] === ']') { depth--; if (depth === 0) { arrEnd = i + 1; break; } }
        }

        try {
          return JSON.parse(unescaped.slice(arrStart, arrEnd));
        } catch { continue; }
      }
      return null;
    });

    if (rawProducts && rawProducts.length > 0) {
      const products = rawProducts.map(p => {
        const price = p.pricing?.original_price?.price_breakdown?.price?.amount;
        const currency = p.pricing?.currency_name === 'USD' ? '$' : (p.pricing?.currency_name || '');
        const slug = p.slug;
        const seller = slug.split('-')[0] || 'unknown';

        return {
          id: slug,
          title: p.brand_name
            ? `${p.brand_name} — ${slug.split('-').slice(1, -1).join(' ')}`
            : slug.split('-').slice(1, -1).join(' ') || 'No title',
          description: '',
          price: price ? `${currency}${price}` : 'N/A',
          size: p.sizes?.join(', ') || null,
          imageUrl: p.preview?.['480'] || p.preview?.['320'] || null,
          seller,
          sellerUrl: `https://www.depop.com/${seller}/`,
          url: `https://www.depop.com/products/${slug}/`,
          dateCreated: p.date_created || null,
        };
      });

      console.log(`[Depop] Found ${products.length} items for "${query}" (RSC)`);
      if (products.length > 0) {
        console.log(`[Depop] First: ${products[0].title} | ${products[0].price} | ${products[0].dateCreated?.slice(0, 19)}`);
      }
      return products;
    }

    // Fallback: DOM scraping
    console.log(`[Depop] RSC extraction failed, falling back to DOM`);
    await page.waitForSelector('a[href*="/products/"]', { timeout: 10000 }).catch(() => {});

    const products = await page.evaluate(() => {
      const items = [];
      const cards = document.querySelectorAll('li[class*="listItem"]');
      const seen = new Set();

      for (const card of cards) {
        const link = card.querySelector('a[href*="/products/"]');
        if (!link) continue;
        const href = link.getAttribute('href') || '';
        const slugMatch = href.match(/\/products\/([^/]+)/);
        if (!slugMatch) continue;
        const slug = slugMatch[1];
        if (seen.has(slug)) continue;
        seen.add(slug);

        const img = card.querySelector('img[class*="mainImage"]') || card.querySelector('img');
        const brandEl = card.querySelector('p[class*="brandName"]');
        const sizeEl = card.querySelector('p[class*="sizeAttribute"]');
        const priceEl = card.querySelector('p[class*="price"]');

        let imageUrl = null;
        const srcset = img?.getAttribute('srcset');
        if (srcset) {
          const parts = srcset.split(',').map(s => s.trim());
          const pick = parts.find(s => s.includes('P6.jpg')) || parts[parts.length - 1];
          imageUrl = pick?.split(' ')[0] || null;
        }
        if (!imageUrl) imageUrl = img?.src || null;

        items.push({
          id: slug,
          title: (() => {
            const brand = brandEl?.textContent?.trim();
            const nameParts = slug.split('-').slice(1, -1);
            const slugName = nameParts.join(' ');
            if (brand && slugName) return `${brand} — ${slugName}`;
            return slugName || brand || 'No title';
          })(),
          imageUrl,
          price: priceEl?.textContent?.trim() || 'N/A',
          size: sizeEl?.textContent?.trim() || null,
          url: `https://www.depop.com/products/${slug}/`,
        });
      }
      return items;
    });

    console.log(`[Depop] Found ${products.length} items for "${query}" (DOM)`);

    return products.map(p => ({
      ...p,
      description: '',
      seller: p.id.split('-')[0] || 'unknown',
      sellerUrl: `https://www.depop.com/${p.id.split('-')[0]}/`,
      dateCreated: null,
    }));
  } finally {
    await page.close();
  }
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

module.exports = { searchDepop, closeBrowser };
