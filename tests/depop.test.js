const mockEvaluate = jest.fn();
const mockOn = jest.fn();
const mockPage = {
  setUserAgent: jest.fn(),
  setRequestInterception: jest.fn(),
  on: mockOn,
  goto: jest.fn(),
  waitForSelector: jest.fn().mockResolvedValue(null),
  evaluate: mockEvaluate,
  close: jest.fn(),
};
const mockBrowser = {
  connected: true,
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn(),
};

jest.mock('puppeteer', () => ({
  launch: jest.fn().mockResolvedValue(mockBrowser),
}));

const { searchDepop, closeBrowser } = require('../src/depop');

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  await closeBrowser();
});

// Helper: simulate RSC response handler to return no data (forces DOM fallback)
function setupDomFallback(products) {
  // First evaluate call is RSC extraction — return null to trigger DOM fallback
  mockEvaluate.mockResolvedValueOnce(null);
  // Second evaluate call is DOM scraping
  mockEvaluate.mockResolvedValueOnce(products);
}

describe('searchDepop', () => {
  test('falls back to DOM scraping and returns products', async () => {
    setupDomFallback([
      {
        id: 'seller1-nike-dunk-low-abc1',
        title: 'Nike — nike dunk low',
        imageUrl: 'https://media-photos.depop.com/test/P6.jpg',
        price: '$45.00',
        size: 'US 10',
        url: 'https://www.depop.com/products/seller1-nike-dunk-low-abc1/',
      },
      {
        id: 'seller2-dunk-high-def2',
        title: 'Nike — dunk high',
        imageUrl: null,
        price: '$80.00',
        size: 'US 9',
        url: 'https://www.depop.com/products/seller2-dunk-high-def2/',
      },
    ]);

    const results = await searchDepop('nike dunks');

    expect(mockPage.goto).toHaveBeenCalledTimes(1);
    const calledUrl = mockPage.goto.mock.calls[0][0];
    expect(calledUrl).toContain('q=nike+dunks');
    expect(calledUrl).toContain('sort=newlyListed');

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('seller1-nike-dunk-low-abc1');
    expect(results[0].seller).toBe('seller1');
    expect(results[1].imageUrl).toBeNull();
  });

  test('passes price and category filters as query params', async () => {
    setupDomFallback([]);

    await searchDepop('jacket', { minPrice: 10, maxPrice: 50, category: 'male' });

    const calledUrl = mockPage.goto.mock.calls[0][0];
    expect(calledUrl).toContain('priceMin=10');
    expect(calledUrl).toContain('priceMax=50');
    expect(calledUrl).toContain('gender=male');
    // Size and condition are filtered client-side, not in URL
    expect(calledUrl).not.toContain('sizes');
    expect(calledUrl).not.toContain('itemConditions');
  });

  test('handles empty results', async () => {
    setupDomFallback([]);

    const results = await searchDepop('nonexistent');
    expect(results).toEqual([]);
  });

  test('closes page even on error', async () => {
    mockPage.setRequestInterception.mockRejectedValueOnce(new Error('page crashed'));

    await expect(searchDepop('test')).rejects.toThrow('page crashed');
    expect(mockPage.close).toHaveBeenCalled();
  });

  test('extracts seller from slug in DOM fallback', async () => {
    setupDomFallback([
      {
        id: 'coolseller-vintage-jacket-xyz1',
        title: 'Vintage — vintage jacket',
        imageUrl: null,
        price: '$30.00',
        size: null,
        url: 'https://www.depop.com/products/coolseller-vintage-jacket-xyz1/',
      },
    ]);

    const results = await searchDepop('vintage jacket');
    expect(results[0].seller).toBe('coolseller');
    expect(results[0].sellerUrl).toBe('https://www.depop.com/coolseller/');
  });
});
