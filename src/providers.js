const providers = [
  {
    name: 'DonutStats.io',
    buildUrl: (username) => `https://api.donutstats.io/v1/players/${encodeURIComponent(username)}`,
    json: true,
    getHeaders: () => {
      if (!process.env.DONUTSTATS_API_KEY) {
        throw new Error('DONUTSTATS_API_KEY is not configured');
      }
      return { 'x-api-key': process.env.DONUTSTATS_API_KEY };
    },
  },
  {
    name: 'DonutAtlas',
    buildUrl: (username) => `https://donutatlas.com/api/donutsmp/player/${encodeURIComponent(username)}`,
    json: true,
  },
  {
    name: 'MCIndex',
    buildUrl: (username) => `https://mcindex.gg/donut/player/${encodeURIComponent(username)}`,
  },
  {
    name: 'DonutStats.net',
    buildUrl: (username) =>
      `https://www.donutstats.net/donutsmp-player-stats?player=${encodeURIComponent(username)}`,
  },
];

function stripHtml(value) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x27;|&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDuration(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 100000 ? Math.round(value / 3600) : Math.round(value);
  }
  if (typeof value !== 'string') return null;

  const text = value.toLowerCase().replace(/,/g, '.').trim();
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m)\b/g)];
  if (parts.length) {
    return Math.round(parts.reduce((total, [, amount, unit]) => {
      const number = Number(amount);
      if (unit.startsWith('d')) return total + number * 24;
      if (unit.startsWith('h')) return total + number;
      return total + number / 60;
    }, 0));
  }

  const numeric = text.match(/^\d+(?:\.\d+)?$/);
  if (!numeric) return null;
  const amount = Number(numeric[0]);
  return amount > 100000 ? Math.round(amount / 3600) : Math.round(amount);
}

function findPlaytime(body) {
  const jsonCandidates = [
    ...body.matchAll(/"playtime"\s*:\s*(".*?"|\d+(?:\.\d+)?)/gi),
    ...body.matchAll(/"Playtime"\s*:\s*(".*?"|\d+(?:\.\d+)?)/g),
  ];
  for (const [, raw] of jsonCandidates) {
    const parsed = parseDuration(raw.replace(/^"|"$/g, ''));
    if (parsed !== null) return parsed;
  }

  const text = stripHtml(body);
  const match = text.match(/\bplaytime\b\s*[:\-]?\s*((?:\d+(?:\.\d+)?\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m)\s*)+)/i);
  return match ? parseDuration(match[1]) : null;
}

function findJsonPlaytime(value) {
  if (!value || typeof value !== 'object') return null;
  if (Object.prototype.hasOwnProperty.call(value, 'playtime')) {
    const parsed = parseDuration(value.playtime);
    if (parsed !== null) return parsed;
  }
  for (const child of Object.values(value)) {
    const parsed = findJsonPlaytime(child);
    if (parsed !== null) return parsed;
  }
  return null;
}

async function fetchProvider(provider, username, timeoutMs) {
  const response = await fetch(provider.buildUrl(username), {
    headers: {
      'user-agent': process.env.USER_AGENT || 'DonutPlaytimeBot/1.0',
      ...(provider.getHeaders ? provider.getHeaders() : {}),
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const body = await response.text();
  let hours = null;
  if (provider.json) {
    try {
      hours = findJsonPlaytime(JSON.parse(body));
    } catch {
      throw new Error('invalid JSON response');
    }
  } else {
    hours = findPlaytime(body);
  }
  if (hours === null) throw new Error('playtime was not found on the page');
  return { provider: provider.name, hours, url: provider.buildUrl(username) };
}

async function fetchPlaytime(username, timeoutMs) {
  const errors = [];
  for (const provider of providers) {
    try {
      return await fetchProvider(provider, username, timeoutMs);
    } catch (error) {
      errors.push(`${provider.name}: ${error.message}`);
    }
  }
  throw new Error(errors.join('; '));
}

module.exports = { fetchPlaytime, parseDuration };
