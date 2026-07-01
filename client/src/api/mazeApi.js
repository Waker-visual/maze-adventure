const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok || data.success === false) throw new Error(data.error || 'API request failed');
  return data;
}

export async function loadSample() {
  const response = await fetch('/api/sample');
  if (!response.ok) throw new Error('sample load failed');
  return response.json();
}

export const api = {
  generate: (payload) => request('/api/maze/generate', payload),
  validate: (payload) => request('/api/maze/validate', payload),
  compare: (payload) => request('/api/maze/compare', payload),
  resourcePath: (payload) => request('/api/resource/optimal-path', payload),
  resourceCollectTest: (payload) => request('/api/resource/collect-test', payload),
  boss: (payload) => request('/api/boss/solve', payload),
  bossBattle: (payload) => request('/api/boss/battle', payload),
  ai: (payload) => request('/api/ai/simulate', payload),
  greedyBenchmark: (payload) => request('/api/ai/greedy-benchmark', payload),
  crossTest: (payload) => request('/api/cross-test', payload),
  legality: (payload) => request('/api/maze/legality', payload)
};
