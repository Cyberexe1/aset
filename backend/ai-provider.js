// Multi-key Groq provider with round-robin rotation and 429 fallback
const Groq = require('groq-sdk');

class AIProvider {
  constructor(config = {}) {
    // Collect all Groq keys from config or env
    const keys = [
      config.groqApiKey   || process.env.GROQ_API_KEY,
      config.groqApiKey2  || process.env.GROQ_API_KEY_2,
      config.groqApiKey3  || process.env.GROQ_API_KEY_3,
      config.groqApiKey4  || process.env.GROQ_API_KEY_4,
    ].filter(Boolean);

    if (keys.length === 0) {
      console.warn('⚠️  No Groq API keys configured');
    }

    // Create one Groq client per key
    this.groqClients = keys.map(key => new Groq({ apiKey: key }));
    this.keyCount = this.groqClients.length;

    // Round-robin index — shared across all requests
    this.currentIndex = 0;

    // Track which keys are rate-limited and when they recover
    // { index: recoverAtTimestamp }
    this.rateLimitedUntil = {};

    console.log(`✅ AI Provider initialized: ${this.keyCount} Groq key(s) loaded`);
  }

  // Get next available key using round-robin, skipping rate-limited ones
  _getNextClient() {
    const now = Date.now();
    const start = this.currentIndex;

    for (let i = 0; i < this.keyCount; i++) {
      const idx = (start + i) % this.keyCount;
      const blockedUntil = this.rateLimitedUntil[idx] || 0;

      if (now >= blockedUntil) {
        // Advance the shared pointer for next call
        this.currentIndex = (idx + 1) % this.keyCount;
        return { client: this.groqClients[idx], index: idx };
      }
    }

    // All keys are rate-limited — find the one that recovers soonest
    let soonestIdx = 0;
    let soonestTime = Infinity;
    for (let i = 0; i < this.keyCount; i++) {
      if ((this.rateLimitedUntil[i] || 0) < soonestTime) {
        soonestTime = this.rateLimitedUntil[i] || 0;
        soonestIdx = i;
      }
    }

    console.warn(`⚠️  All Groq keys rate-limited. Soonest recovery in ${Math.ceil((soonestTime - now) / 1000)}s`);
    this.currentIndex = (soonestIdx + 1) % this.keyCount;
    return { client: this.groqClients[soonestIdx], index: soonestIdx };
  }

  // Mark a key as rate-limited for 60 seconds
  _markRateLimited(index) {
    this.rateLimitedUntil[index] = Date.now() + 60_000;
    console.warn(`⚠️  Groq key #${index + 1} rate-limited, cooling down for 60s`);
  }

  async generateCompletion(prompt, options = {}) {
    // Try each key at most once, rotating on 429
    for (let attempt = 0; attempt < this.keyCount; attempt++) {
      const { client, index } = this._getNextClient();

      try {
        return await this._callGroq(client, index, prompt, options);
      } catch (error) {
        const is429 = error?.status === 429 ||
                      error?.message?.includes('429') ||
                      error?.message?.toLowerCase().includes('rate limit');

        if (is429) {
          this._markRateLimited(index);
          console.log(`🔄 Retrying with next Groq key (attempt ${attempt + 2}/${this.keyCount})...`);
          continue; // try next key
        }

        // Non-rate-limit error — throw immediately
        throw error;
      }
    }

    throw new Error('All Groq API keys are rate-limited. Please try again shortly.');
  }

  async _callGroq(client, index, prompt, options = {}) {
    const model      = options.model       || 'llama-3.3-70b-versatile';
    const temperature = options.temperature ?? 0.3;
    const maxTokens  = options.maxTokens   || 2000;

    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      max_tokens: maxTokens,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined
    });

    return {
      content: response.choices[0].message.content,
      provider: 'groq',
      model,
      keyIndex: index + 1, // 1-based for logging
      usage: {
        inputTokens:  response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens:  response.usage.total_tokens
      }
    };
  }

  // Batch generation for multiple prompts
  async generateBatch(prompts, options = {}) {
    const results = [];
    for (const prompt of prompts) {
      try {
        const result = await this.generateCompletion(prompt, options);
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  // Provider info for debugging
  getProviderInfo() {
    const now = Date.now();
    return {
      provider: 'groq',
      totalKeys: this.keyCount,
      currentIndex: this.currentIndex,
      keyStatus: Array.from({ length: this.keyCount }, (_, i) => ({
        key: i + 1,
        available: now >= (this.rateLimitedUntil[i] || 0),
        cooldownRemainingMs: Math.max(0, (this.rateLimitedUntil[i] || 0) - now)
      }))
    };
  }
}

module.exports = AIProvider;
