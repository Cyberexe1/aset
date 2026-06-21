/**
 * Redis Client — Beyond Caching
 * Used for:
 * - Agent memory (conversation context per session)
 * - Verification history (dedup + fast retrieval)
 * - Research caching (paper search results, 1-hour TTL)
 * - Rate limiting (per-IP claim verification throttle)
 * - Session store (JWT token blacklist)
 */

const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

let client = null;
let isConnected = false;

async function getRedisClient() {
  if (client && isConnected) return client;

  client = createClient({
    url: REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 5) {
          console.warn('[Redis] Max reconnect attempts reached — running without Redis');
          return false;
        }
        return Math.min(retries * 100, 3000);
      }
    }
  });

  client.on('error', (err) => {
    if (isConnected) {
      console.warn('[Redis] Connection error:', err.message);
      isConnected = false;
    }
  });

  client.on('connect', () => {
    console.log('✅ Redis connected:', REDIS_URL);
    isConnected = true;
  });

  client.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...');
  });

  try {
    await client.connect();
  } catch (err) {
    console.warn('[Redis] Could not connect:', err.message, '— Redis features will be degraded');
    isConnected = false;
  }

  return client;
}

// ─── Research Cache ──────────────────────────────────────────────────────────
// Cache paper search results for 1 hour — avoids repeated FTS queries for
// identical claims
const RESEARCH_CACHE_TTL = 60 * 60; // 1 hour

async function cacheResearchResults(claimKey, results) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;
    const key = `research:${Buffer.from(claimKey).toString('base64').substring(0, 64)}`;
    await redis.setEx(key, RESEARCH_CACHE_TTL, JSON.stringify(results));
    return true;
  } catch (err) {
    console.warn('[Redis] cacheResearchResults error:', err.message);
    return false;
  }
}

async function getResearchCache(claimKey) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return null;
    const key = `research:${Buffer.from(claimKey).toString('base64').substring(0, 64)}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('[Redis] getResearchCache error:', err.message);
    return null;
  }
}

// ─── Verification History ────────────────────────────────────────────────────
// Store verification results per user — enables fast history retrieval
// without full DB joins on large chat_history JSON blobs
const VERIFICATION_HISTORY_TTL = 60 * 60 * 24 * 30; // 30 days

async function saveVerificationHistory(userId, verificationId, result) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;

    const historyKey = `vh:user:${userId}`;
    const resultKey  = `vh:result:${verificationId}`;

    // Store full result keyed by verificationId
    await redis.setEx(resultKey, VERIFICATION_HISTORY_TTL, JSON.stringify({
      id: verificationId,
      claim: result.claim,
      verdict: result.verdict,
      verificationScore: result.verificationScore,
      confidence: result.confidence,
      summary: result.summary,
      keyFindings: result.keyFindings,
      papersAnalyzed: result.papersAnalyzed,
      timestamp: result.timestamp || new Date().toISOString()
    }));

    // Add to user's sorted set (score = timestamp for chronological order)
    await redis.zAdd(historyKey, {
      score: Date.now(),
      value: verificationId
    });

    // Keep only last 100 verifications per user
    await redis.zRemRangeByRank(historyKey, 0, -101);
    await redis.expire(historyKey, VERIFICATION_HISTORY_TTL);
    return true;
  } catch (err) {
    console.warn('[Redis] saveVerificationHistory error:', err.message);
    return false;
  }
}

async function getVerificationHistory(userId, limit = 20) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return [];

    const historyKey = `vh:user:${userId}`;
    // Get most recent N verification IDs
    const ids = await redis.zRange(historyKey, 0, limit - 1, { REV: true });
    if (!ids.length) return [];

    // Fetch all results in parallel
    const results = await Promise.all(
      ids.map(id => redis.get(`vh:result:${id}`))
    );
    return results
      .filter(Boolean)
      .map(r => JSON.parse(r));
  } catch (err) {
    console.warn('[Redis] getVerificationHistory error:', err.message);
    return [];
  }
}

// ─── Agent Memory ────────────────────────────────────────────────────────────
// Store conversation context for multi-agent sessions
// Each session gets a list of messages + metadata
const AGENT_MEMORY_TTL = 60 * 60 * 2; // 2 hours

async function saveAgentMemory(sessionId, agentName, memory) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;

    const key = `agent:mem:${sessionId}:${agentName}`;
    await redis.setEx(key, AGENT_MEMORY_TTL, JSON.stringify({
      sessionId,
      agentName,
      memory,
      updatedAt: new Date().toISOString()
    }));
    return true;
  } catch (err) {
    console.warn('[Redis] saveAgentMemory error:', err.message);
    return false;
  }
}

async function getAgentMemory(sessionId, agentName) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return null;
    const key = `agent:mem:${sessionId}:${agentName}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data).memory : null;
  } catch (err) {
    console.warn('[Redis] getAgentMemory error:', err.message);
    return null;
  }
}

// ─── Context Retrieval ───────────────────────────────────────────────────────
// Store embeddings context (claim + relevant abstract snippets) for agent use
async function saveRetrievalContext(sessionId, context) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;
    const key = `ctx:${sessionId}`;
    await redis.setEx(key, AGENT_MEMORY_TTL, JSON.stringify(context));
    return true;
  } catch (err) {
    console.warn('[Redis] saveRetrievalContext error:', err.message);
    return false;
  }
}

async function getRetrievalContext(sessionId) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return null;
    const key = `ctx:${sessionId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('[Redis] getRetrievalContext error:', err.message);
    return null;
  }
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────
// Sliding window rate limiter: max N requests per minute per IP
async function checkRateLimit(identifier, maxRequests = 10, windowSeconds = 60) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return { allowed: true, remaining: maxRequests };

    const key = `rl:${identifier}:${Math.floor(Date.now() / (windowSeconds * 1000))}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, windowSeconds);

    return {
      allowed: count <= maxRequests,
      remaining: Math.max(0, maxRequests - count),
      resetIn: windowSeconds
    };
  } catch (err) {
    console.warn('[Redis] checkRateLimit error:', err.message);
    return { allowed: true, remaining: maxRequests };
  }
}

// ─── Token Blacklist ─────────────────────────────────────────────────────────
// Invalidate JWT tokens on logout without touching DB
async function blacklistToken(token, expiresIn = 60 * 60 * 24 * 7) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;
    const key = `bl:${token.substring(token.length - 20)}`;
    await redis.setEx(key, expiresIn, '1');
    return true;
  } catch (err) {
    console.warn('[Redis] blacklistToken error:', err.message);
    return false;
  }
}

async function isTokenBlacklisted(token) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return false;
    const key = `bl:${token.substring(token.length - 20)}`;
    return !!(await redis.get(key));
  } catch (err) {
    return false;
  }
}

// ─── Analytics / Leaderboard ─────────────────────────────────────────────────
// Track top verified claims and domains in real-time
async function incrementDomainStat(domain) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return;
    await redis.zIncrBy('stats:domains', 1, domain);
  } catch (err) { /* non-critical */ }
}

async function incrementClaimStat(verdict) {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return;
    await redis.incr(`stats:verdicts:${verdict.toLowerCase().replace(/\s+/g, '_')}`);
    await redis.incr('stats:total_verifications');
  } catch (err) { /* non-critical */ }
}

async function getRedisStats() {
  try {
    const redis = await getRedisClient();
    if (!isConnected) return null;

    const [topDomains, totalVerifications] = await Promise.all([
      redis.zRangeWithScores('stats:domains', 0, 9, { REV: true }),
      redis.get('stats:total_verifications')
    ]);

    return {
      topDomains: topDomains.map(d => ({ domain: d.value, count: d.score })),
      totalVerifications: parseInt(totalVerifications || '0'),
      redisConnected: isConnected
    };
  } catch (err) {
    return { redisConnected: false };
  }
}

module.exports = {
  getRedisClient,
  // Research cache
  cacheResearchResults,
  getResearchCache,
  // Verification history
  saveVerificationHistory,
  getVerificationHistory,
  // Agent memory
  saveAgentMemory,
  getAgentMemory,
  // Context retrieval
  saveRetrievalContext,
  getRetrievalContext,
  // Rate limiting
  checkRateLimit,
  // Token blacklist
  blacklistToken,
  isTokenBlacklisted,
  // Analytics
  incrementDomainStat,
  incrementClaimStat,
  getRedisStats,
  // State
  get isConnected() { return isConnected; }
};
