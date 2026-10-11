'use strict';

/**
 * chat-llm.js — thin FreeLLM router client for the Optix Assistant chatbot.
 *
 * The router API key is read ONLY from process.env.FREELLM_API_KEY at call
 * time. It is never logged, never embedded in error messages, and never
 * persisted anywhere. Callers must ensure it is set in the server env.
 *
 * Requires Node >= 18 (global fetch). See /tmp/chatbot-markers/audit.txt.
 */

function getApiKey() {
  const key = process.env.FREELLM_API_KEY;
  if (!key || !String(key).trim()) {
    throw new Error('FREELLM_API_KEY not configured');
  }
  return key;
}

function getBaseUrl() {
  const raw = process.env.FREELLM_BASE_URL || 'http://freellmapi-freellmapi-1:3001/v1';
  return String(raw).replace(/\/+$/, ''); // strip trailing slashes
}

/**
 * Chat completion via the FreeLLM OpenAI-compatible /v1 endpoint.
 *
 * @param {Array<{role:string, content:string}>} messages - chat history
 * @param {object} [opts] - { timeoutMs }
 * @returns {Promise<string>} the assistant's reply text
 */
async function chatLlm(messages, opts) {
  const apiKey = getApiKey(); // throws if missing; never logged
  const baseUrl = getBaseUrl();
  const timeoutMs = (opts && opts.timeoutMs) || 60000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'auto',
        messages: messages,
        temperature: 0.7,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error('LLM error: HTTP ' + res.status);
    }

    const json = await res.json();
    const content =
      json && json.choices && json.choices[0] &&
      json.choices[0].message && json.choices[0].message.content;

    if (content === undefined || content === null) {
      throw new Error('LLM returned no content');
    }
    return String(content);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error('LLM request timed out');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { chatLlm };
