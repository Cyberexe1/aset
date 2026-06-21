/**
 * Redis Integration Smoke Test
 * Run: node scripts/test-redis.js
 *
 * Tests all Redis usage patterns in ASET:
 *   1. Research cache (set + get)
 *   2. Verification history (save + retrieve)
 *   3. Agent memory (save + get)
 *   4. Rate limiting (sliding window)
 *   5. Token blacklist
 *   6. Analytics (domain + verdict stats)
 */

require('dotenv').config();
const {
  getRedisClient,
  cacheResearchResults, getResearchCache,
  saveVerificationHistory, getVerificationHistory,
  saveAgentMemory, getAgentMemory,
  checkRateLimit,
  blacklistToken, isTokenBlacklisted,
  incrementDomainStat, incrementClaimStat, getRedisStats,
  isConnected
} = require('../backend/redis-client');

const PASS = '\x1b[32m✅ PASS\x1b[0m';
const FAIL = '\x1b[31m❌ FAIL\x1b[0m';
const INFO = '\x1b[36mℹ\x1b[0m ';

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${PASS}  ${label}`);
    passed++;
  } else {
    console.log(`  ${FAIL}  ${label}`);
    failed++;
  }
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function run() {
  console.log('\n\x1b[1m🔴 ASET Redis Integration Smoke Test\x1b[0m');
  console.log('─'.repeat(45));
  console.log(`${INFO} REDIS_URL: ${process.env.REDIS_URL || 'redis://localhost:6379'}\n`);

  // Connect
  await getRedisClient();
  await sleep(500);

  if (!isConnected) {
    console.log('\x1b[33m⚠️  Redis not connected — start Redis first:\x1b[0m');
    console.log('   docker run -d -p 6379:6379 redis:alpine');
    console.log('   or: redis-server\n');
    process.exit(1);
  }

  console.log(`${INFO} Connected ✓\n`);

  // ── 1. Research Cache ────────────────────────────────────────────────────
  console.log('\x1b[1m1. Research Cache\x1b[0m');
  const testClaim = 'CRISPR can edit human genome';
  const testPapers = [
    { paperId: 'test-001', title: 'CRISPR-Cas9 paper', relevance: 9.5 },
    { paperId: 'test-002', title: 'Genome editing review', relevance: 8.2 }
  ];

  const cacheSaved = await cacheResearchResults(testClaim, testPapers);
  assert(cacheSaved === true, 'cacheResearchResults returns true');

  const cached = await getResearchCache(testClaim);
  assert(cached !== null, 'getResearchCache returns data');
  assert(Array.isArray(cached), 'cached result is an array');
  assert(cached.length === 2, `correct number of papers (${cached?.length})`);
  assert(cached[0].paperId === 'test-001', 'first paper ID matches');

  const miss = await getResearchCache('nonexistent claim xyz 999');
  assert(miss === null, 'cache miss returns null');

  // ── 2. Verification History ──────────────────────────────────────────────
  console.log('\n\x1b[1m2. Verification History\x1b[0m');
  const testUserId = 'test-user-42';
  const testVerifId = `v-test-${Date.now()}`;
  const testResult = {
    claim: testClaim,
    verdict: 'Supported',
    verificationScore: 82,
    confidence: 'High',
    summary: 'Test verification result',
    keyFindings: ['Finding 1', 'Finding 2'],
    papersAnalyzed: 5,
    timestamp: new Date().toISOString()
  };

  const historySaved = await saveVerificationHistory(testUserId, testVerifId, testResult);
  assert(historySaved === true, 'saveVerificationHistory returns true');

  const history = await getVerificationHistory(testUserId, 10);
  assert(Array.isArray(history), 'getVerificationHistory returns array');
  assert(history.length >= 1, `history has entries (${history.length})`);
  const found = history.find(h => h.id === testVerifId);
  assert(found !== undefined, 'saved verification found in history');
  assert(found?.verdict === 'Supported', `verdict matches (${found?.verdict})`);
  assert(found?.verificationScore === 82, `score matches (${found?.verificationScore})`);

  // ── 3. Agent Memory ──────────────────────────────────────────────────────
  console.log('\n\x1b[1m3. Agent Memory\x1b[0m');
  const testSessionId = `sess-test-${Date.now()}`;

  const memorySaved = await saveAgentMemory(testSessionId, 'research', {
    claim: testClaim,
    papersFound: 15,
    topPapers: [{ id: 'test-001', title: 'Test paper', relevance: 9 }]
  });
  assert(memorySaved === true, 'saveAgentMemory returns true');

  const memory = await getAgentMemory(testSessionId, 'research');
  assert(memory !== null, 'getAgentMemory returns data');
  assert(memory?.papersFound === 15, `papersFound matches (${memory?.papersFound})`);
  assert(memory?.topPapers?.length === 1, `topPapers count matches`);

  const noMemory = await getAgentMemory('nonexistent-session', 'research');
  assert(noMemory === null, 'missing agent memory returns null');

  // ── 4. Rate Limiting ─────────────────────────────────────────────────────
  console.log('\n\x1b[1m4. Rate Limiting\x1b[0m');
  const testIp = `test-ip-${Date.now()}`;

  const r1 = await checkRateLimit(testIp, 3, 60);
  assert(r1.allowed === true, `request 1 allowed (remaining: ${r1.remaining})`);

  const r2 = await checkRateLimit(testIp, 3, 60);
  assert(r2.allowed === true, `request 2 allowed (remaining: ${r2.remaining})`);

  const r3 = await checkRateLimit(testIp, 3, 60);
  assert(r3.allowed === true, `request 3 allowed (remaining: ${r3.remaining})`);

  const r4 = await checkRateLimit(testIp, 3, 60);
  assert(r4.allowed === false, `request 4 blocked (rate limit hit)`);
  assert(r4.remaining === 0, `remaining is 0 (${r4.remaining})`);

  // ── 5. Token Blacklist ───────────────────────────────────────────────────
  console.log('\n\x1b[1m5. Token Blacklist\x1b[0m');
  const fakeToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.${Date.now()}signature`;

  const notBlacklisted = await isTokenBlacklisted(fakeToken);
  assert(notBlacklisted === false, 'fresh token is not blacklisted');

  await blacklistToken(fakeToken, 60);
  const nowBlacklisted = await isTokenBlacklisted(fakeToken);
  assert(nowBlacklisted === true, 'blacklisted token is detected');

  // ── 6. Analytics ─────────────────────────────────────────────────────────
  console.log('\n\x1b[1m6. Analytics\x1b[0m');
  await incrementDomainStat('neuroscience');
  await incrementDomainStat('neuroscience');
  await incrementDomainStat('oncology');
  await incrementClaimStat('Supported');
  await incrementClaimStat('Contradicted');

  const stats = await getRedisStats();
  assert(stats !== null, 'getRedisStats returns data');
  assert(stats.redisConnected === true, 'redisConnected is true');
  assert(Array.isArray(stats.topDomains), 'topDomains is an array');
  assert(stats.totalVerifications >= 2, `totalVerifications >= 2 (${stats.totalVerifications})`);

  const neuro = stats.topDomains.find(d => d.domain === 'neuroscience');
  assert(neuro?.count >= 2, `neuroscience count >= 2 (${neuro?.count})`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(45));
  console.log(`\x1b[1mResults: ${passed} passed, ${failed} failed\x1b[0m`);

  if (failed === 0) {
    console.log('\x1b[32m🎉 All Redis tests passed!\x1b[0m\n');
  } else {
    console.log('\x1b[31m⚠️  Some tests failed — check Redis connection and config\x1b[0m\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('\x1b[31mTest runner error:\x1b[0m', err.message);
  process.exit(1);
});
