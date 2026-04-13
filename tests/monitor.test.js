const { pollWatches } = require('../src/monitor');

// Mock dependencies
jest.mock('../src/depop', () => ({
  searchDepop: jest.fn(),
}));

jest.mock('../src/db', () => ({
  getActiveWatches: jest.fn(),
  getSeenItemIds: jest.fn(),
  addSeenItems: jest.fn(),
  markSeeded: jest.fn(),
}));

const { searchDepop } = require('../src/depop');
const db = require('../src/db');

function makeItem(id) {
  return {
    id,
    title: `Item ${id}`,
    description: 'Test item',
    price: '$20.00',
    size: 'M',
    imageUrl: 'https://img.depop.com/test.jpg',
    seller: 'testseller',
    url: `https://www.depop.com/products/${id}/`,
    sellerUrl: 'https://www.depop.com/testseller/',
  };
}

function makeWatch(overrides = {}) {
  return {
    id: 1, query: 'nike', channel_id: 'chan1', user_id: 'user1',
    min_price: null, max_price: null, size: null, condition: null,
    seeded: 1,
    ...overrides,
  };
}

function mockClient() {
  const send = jest.fn();
  return {
    channels: {
      fetch: jest.fn().mockResolvedValue({ send }),
    },
    _send: send,
  };
}

afterEach(() => {
  jest.resetAllMocks();
});

describe('pollWatches', () => {
  test('seeds on first run without sending notifications', async () => {
    const client = mockClient();

    db.getActiveWatches.mockReturnValue([makeWatch({ seeded: 0 })]);
    searchDepop.mockResolvedValue([makeItem('item1'), makeItem('item2')]);

    await pollWatches(client);

    // Should save seen items but NOT send any messages
    expect(db.addSeenItems).toHaveBeenCalledWith(1, ['item1', 'item2']);
    expect(db.markSeeded).toHaveBeenCalledWith(1);
    expect(client._send).not.toHaveBeenCalled();
  });

  test('sends notifications for new items after seeding', async () => {
    const client = mockClient();

    db.getActiveWatches.mockReturnValue([makeWatch({ seeded: 1 })]);
    db.getSeenItemIds.mockReturnValue(new Set());
    searchDepop.mockResolvedValue([makeItem('item1'), makeItem('item2')]);

    await pollWatches(client);

    expect(searchDepop).toHaveBeenCalledWith('nike', { minPrice: null, maxPrice: null, size: null, condition: null });
    expect(db.addSeenItems).toHaveBeenCalledWith(1, ['item1', 'item2']);
    expect(client._send).toHaveBeenCalledTimes(2);

    const firstCall = client._send.mock.calls[0][0];
    expect(firstCall.content).toContain('<@user1>');
    expect(firstCall.content).toContain('nike');
    expect(firstCall.embeds).toHaveLength(1);
    expect(firstCall.components).toHaveLength(1);
  });

  test('skips already-seen items', async () => {
    const client = mockClient();

    db.getActiveWatches.mockReturnValue([makeWatch()]);
    db.getSeenItemIds.mockReturnValue(new Set(['item1']));
    searchDepop.mockResolvedValue([makeItem('item1'), makeItem('item2')]);

    await pollWatches(client);

    expect(db.addSeenItems).toHaveBeenCalledWith(1, ['item2']);
    expect(client._send).toHaveBeenCalledTimes(1);
  });

  test('does nothing when all items are seen', async () => {
    const client = mockClient();

    db.getActiveWatches.mockReturnValue([makeWatch()]);
    db.getSeenItemIds.mockReturnValue(new Set(['item1', 'item2']));
    searchDepop.mockResolvedValue([makeItem('item1'), makeItem('item2')]);

    await pollWatches(client);

    expect(db.addSeenItems).not.toHaveBeenCalled();
    expect(client._send).not.toHaveBeenCalled();
  });

  test('does nothing when no active watches', async () => {
    const client = mockClient();
    db.getActiveWatches.mockReturnValue([]);

    await pollWatches(client);

    expect(searchDepop).not.toHaveBeenCalled();
  });

  test('continues polling other watches if one fails', async () => {
    const client = mockClient();

    db.getActiveWatches.mockReturnValue([
      makeWatch({ id: 1, query: 'fail' }),
      makeWatch({ id: 2, query: 'nike' }),
    ]);

    searchDepop
      .mockRejectedValueOnce(new Error('API error'))
      .mockResolvedValueOnce([makeItem('item1')]);

    db.getSeenItemIds.mockReturnValue(new Set());

    await pollWatches(client);

    expect(client._send).toHaveBeenCalledTimes(1);
  });

  test('handles missing channel gracefully', async () => {
    const client = {
      channels: { fetch: jest.fn().mockResolvedValue(null) },
    };

    db.getActiveWatches.mockReturnValue([makeWatch()]);
    db.getSeenItemIds.mockReturnValue(new Set());
    searchDepop.mockResolvedValue([makeItem('item1')]);

    await pollWatches(client);
    expect(db.addSeenItems).toHaveBeenCalled();
  });
});
