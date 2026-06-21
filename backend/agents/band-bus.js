/**
 * Band Protocol Message Bus
 * 
 * Implements an inter-agent communication bus inspired by Band Protocol's
 * data relay model. Each agent publishes and subscribes to named channels.
 * 
 * In production, this can be backed by Band Protocol's oracle/relay network.
 * Locally, it uses an in-process EventEmitter with Redis Pub/Sub for
 * multi-instance deployments.
 * 
 * Agent Pipeline:
 *   ClaimExtractionAgent  --[claim.extracted]-→  ResearchAgent
 *   ResearchAgent         --[research.results]→  VerificationAgent
 *   VerificationAgent     --[verification.done]→ CitationAgent
 *   CitationAgent         --[citations.ready]→   ReportAgent
 *   ReportAgent           --[report.complete]→   (caller / user)
 */

const EventEmitter = require('events');

// Band Protocol configuration
const BAND_CONFIG = {
  chainId: process.env.BAND_CHAIN_ID || 'band-laozi-testnet6',
  endpoint: process.env.BAND_ENDPOINT || 'https://laozi-testnet6.bandchain.org/grpc-web',
  mnemonic: process.env.BAND_MNEMONIC || null,
  oracleScriptId: parseInt(process.env.BAND_ORACLE_SCRIPT_ID || '0'),
};

class BandBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50);
    this.channels = new Map();
    this.messageLog = []; // for debugging / demo
    this.bandEnabled = !!BAND_CONFIG.mnemonic;

    if (this.bandEnabled) {
      console.log(`✅ Band Protocol bus enabled [chain: ${BAND_CONFIG.chainId}]`);
    } else {
      console.log('⚡ Band Protocol bus running in local EventEmitter mode');
      console.log('   Set BAND_MNEMONIC to enable Band Protocol relay');
    }
  }

  /**
   * Publish a message to a channel
   * In Band mode: submits an oracle request to the Band chain
   * In local mode: emits an EventEmitter event
   */
  async publish(channel, data) {
    const message = {
      channel,
      data,
      timestamp: new Date().toISOString(),
      messageId: `${channel}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    };

    // Log for observability
    this.messageLog.push({
      messageId: message.messageId,
      channel,
      from: data.respondedBy || data.requestedBy || 'system',
      to: this._getChannelSubscribers(channel),
      summary: this._summarizeData(data),
      timestamp: message.timestamp
    });

    // Keep log bounded
    if (this.messageLog.length > 500) this.messageLog.shift();

    console.log(`[BandBus] 📡 ${channel} → ${JSON.stringify(this._summarizeData(data))}`);

    if (this.bandEnabled) {
      await this._publishToBand(channel, message);
    }

    // Always emit locally for in-process subscribers
    this.emit(channel, message.data);
    return message.messageId;
  }

  /**
   * Subscribe to a channel
   */
  subscribe(channel, handler) {
    if (!this.channels.has(channel)) {
      this.channels.set(channel, []);
    }
    this.channels.get(channel).push(handler);
    this.on(channel, handler);
    console.log(`[BandBus] 🔔 Subscribed to channel: ${channel}`);
  }

  /**
   * Request-response pattern: publish and wait for a response on a reply channel
   */
  async request(channel, data, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const replyChannel = `${channel}.reply.${Date.now()}`;
      const timer = setTimeout(() => {
        this.removeAllListeners(replyChannel);
        reject(new Error(`[BandBus] Timeout waiting for ${channel} response`));
      }, timeoutMs);

      this.once(replyChannel, (response) => {
        clearTimeout(timer);
        resolve(response);
      });

      this.publish(channel, { ...data, replyChannel });
    });
  }

  /**
   * Get the full message log for the agent dashboard
   */
  getMessageLog(limit = 50) {
    return this.messageLog.slice(-limit).reverse();
  }

  /**
   * Get pipeline status — shows the state of a multi-step verification
   */
  getPipelineStatus(sessionId) {
    const logs = this.messageLog.filter(m =>
      m.summary?.sessionId === sessionId ||
      JSON.stringify(m.summary).includes(sessionId)
    );
    return logs;
  }

  _getChannelSubscribers(channel) {
    return this.channels.has(channel)
      ? `${this.channels.get(channel).length} subscriber(s)`
      : 'no subscribers';
  }

  _summarizeData(data) {
    const summary = {};
    if (data.sessionId) summary.sessionId = data.sessionId;
    if (data.claim) summary.claim = data.claim.substring(0, 50);
    if (data.papers) summary.papers = data.papers.length;
    if (data.verdict) summary.verdict = data.verdict;
    if (data.respondedBy) summary.from = data.respondedBy;
    if (data.requestedBy) summary.by = data.requestedBy;
    return summary;
  }

  /**
   * Band Protocol on-chain publication
   * Submits an oracle data request to the Band chain
   */
  async _publishToBand(channel, message) {
    try {
      // Band Protocol SDK — dynamic import to avoid startup errors if not configured
      const { Client, Wallet, Transaction, Message } = await import('@bandprotocol/bandchain.js').catch(() => null);
      if (!Client) {
        console.warn('[BandBus] @bandprotocol/bandchain.js not installed');
        return;
      }

      const client = new Client(BAND_CONFIG.endpoint);
      const wallet = await Wallet.fromMnemonic(BAND_CONFIG.mnemonic);
      const sender = await wallet.getAddress();

      // Create a data source request containing the channel + message hash
      const requestMsg = new Message.MsgRequestData(
        BAND_CONFIG.oracleScriptId,
        Buffer.from(JSON.stringify({
          channel,
          messageId: message.messageId,
          // Only send metadata, not full content (keeps tx size small)
          summary: this._summarizeData(message.data)
        })),
        1, 1, // minCount, askCount
        'aset-verification',
        sender,
        [], // fee limit
        30, 0 // prepareGas, executeGas
      );

      const txn = new Transaction()
        .withMessages(requestMsg)
        .withSender(client, sender);

      const signedTx = await txn.sign(wallet);
      const txHash = await client.sendTxBlockMode(signedTx);
      console.log(`[BandBus] Band tx submitted: ${txHash} (channel: ${channel})`);
    } catch (err) {
      console.warn(`[BandBus] Band publish failed (non-critical): ${err.message}`);
      // Fall through — local EventEmitter still handles it
    }
  }
}

// Singleton bus shared across all agents
const bandBus = new BandBus();
module.exports = bandBus;
