const API_BASE = '/api';

async function handleResponse(response) {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
    throw new Error(error.detail || 'Request failed');
  }
  return response.json();
}

export const api = {
  async getPortfolio() {
    const response = await fetch(`${API_BASE}/portfolio`);
    return handleResponse(response);
  },

  async getHoldings() {
    const response = await fetch(`${API_BASE}/holdings`);
    return handleResponse(response);
  },

  async addHolding(holding) {
    const response = await fetch(`${API_BASE}/holdings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(holding),
    });
    return handleResponse(response);
  },

  async uploadCSV(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch(`${API_BASE}/upload-csv`, {
      method: 'POST',
      body: formData,
    });
    return handleResponse(response);
  },

  async deleteHolding(id) {
    const response = await fetch(`${API_BASE}/holdings/${id}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async clearAllHoldings() {
    const response = await fetch(`${API_BASE}/holdings`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async getHistory(days = 30) {
    const response = await fetch(`${API_BASE}/portfolio/history?days=${days}`);
    return handleResponse(response);
  },

  async createSnapshot() {
    const response = await fetch(`${API_BASE}/portfolio/snapshot`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async backfillHistory(weeks = 52) {
    const response = await fetch(`${API_BASE}/portfolio/backfill?weeks=${weeks}`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async getBackfillStatus() {
    const response = await fetch(`${API_BASE}/portfolio/backfill/status`);
    return handleResponse(response);
  },

  async getRecommendations(limit = 10) {
    const response = await fetch(`${API_BASE}/recommendations?limit=${limit}`);
    return handleResponse(response);
  },

  async generateRecommendations() {
    const response = await fetch(`${API_BASE}/recommendations/generate`, {
      method: 'POST',
    });
    return handleResponse(response);
  },

  async getAIStatus() {
    const response = await fetch(`${API_BASE}/ai/status`);
    return handleResponse(response);
  },

  async getQuickAnalysis() {
    const response = await fetch(`${API_BASE}/ai/analyze`);
    return handleResponse(response);
  },

  async getStockInfo(ticker) {
    const response = await fetch(`${API_BASE}/stock/${ticker}`);
    return handleResponse(response);
  },

  async getTickerDetail(ticker) {
    const response = await fetch(`${API_BASE}/stock/${ticker}/detail`);
    return handleResponse(response);
  },

  async getStockPerformance(ticker, days = 30) {
    const response = await fetch(`${API_BASE}/stock/${ticker}/performance?days=${days}`);
    return handleResponse(response);
  },

  async getStockHistory(ticker, period = '1mo') {
    const response = await fetch(`${API_BASE}/stock/${ticker}/history?period=${period}`);
    return handleResponse(response);
  },

  async getPortfolioInsights(days = 30) {
    const response = await fetch(`${API_BASE}/insights/portfolio?days=${days}`);
    return handleResponse(response);
  },

  async getMarketInsights(days = 1, limit = 10) {
    const response = await fetch(`${API_BASE}/insights/market?days=${days}&limit=${limit}`);
    return handleResponse(response);
  },

  async getCombinedInsights(days = 1, limit = 10) {
    const response = await fetch(`${API_BASE}/insights/combined?days=${days}&limit=${limit}`);
    return handleResponse(response);
  },

  async getScreenerData(screenerType, limit = 25) {
    const response = await fetch(`${API_BASE}/insights/screener/${screenerType}?limit=${limit}`);
    return handleResponse(response);
  },

  async getAvailableScreeners() {
    const response = await fetch(`${API_BASE}/insights/screeners`);
    return handleResponse(response);
  },

  async healthCheck() {
    const response = await fetch(`${API_BASE}/health`);
    return handleResponse(response);
  },

  async chat(message, sessionId = null) {
    const response = await fetch(`${API_BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, session_id: sessionId }),
    });
    return handleResponse(response);
  },

  async getChatSessions() {
    const response = await fetch(`${API_BASE}/chat/sessions`);
    return handleResponse(response);
  },

  async getChatSession(sessionId) {
    const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`);
    return handleResponse(response);
  },

  async deleteChatSession(sessionId) {
    const response = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
      method: 'DELETE',
    });
    return handleResponse(response);
  },

  async getLLMDebugCalls(limit = 50) {
    const response = await fetch(`${API_BASE}/debug/llm-calls?limit=${limit}`);
    return handleResponse(response);
  },

  async clearLLMDebugCalls() {
    const response = await fetch(`${API_BASE}/debug/llm-calls`, { method: 'DELETE' });
    return handleResponse(response);
  },

  async getPortfolioComparison(days = 90) {
    const response = await fetch(`${API_BASE}/portfolio/comparison?days=${days}`);
    return handleResponse(response);
  },

  async getOverallPerformance(period = 'all') {
    const response = await fetch(`${API_BASE}/portfolio/overall-performance?period=${period}`);
    return handleResponse(response);
  },

  async sellLots(lots, sellDate, notes = null) {
    const response = await fetch(`${API_BASE}/holdings/sell-lots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lots, sell_date: sellDate, notes }),
    });
    return handleResponse(response);
  },

  async getRealized() {
    const response = await fetch(`${API_BASE}/realized`);
    return handleResponse(response);
  },

  async getRealizedMovements() {
    const response = await fetch(`${API_BASE}/realized/movements`);
    return handleResponse(response);
  },

  async addRealized(txn) {
    const response = await fetch(`${API_BASE}/realized`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txn),
    });
    return handleResponse(response);
  },

  async deleteRealized(id) {
    const response = await fetch(`${API_BASE}/realized/${id}`, { method: 'DELETE' });
    return handleResponse(response);
  },

  async getAlerts(unreadOnly = false, limit = 50) {
    const response = await fetch(`${API_BASE}/alerts?unread_only=${unreadOnly}&limit=${limit}`);
    return handleResponse(response);
  },

  async getUnreadAlertCount() {
    const response = await fetch(`${API_BASE}/alerts/unread-count`);
    return handleResponse(response);
  },

  async markAlertRead(alertId) {
    const response = await fetch(`${API_BASE}/alerts/${alertId}/read`, { method: 'POST' });
    return handleResponse(response);
  },

  async markAllAlertsRead() {
    const response = await fetch(`${API_BASE}/alerts/read-all`, { method: 'POST' });
    return handleResponse(response);
  },

  async checkAlerts() {
    const response = await fetch(`${API_BASE}/alerts/check`, { method: 'POST' });
    return handleResponse(response);
  },

  async getAlertSettings() {
    const response = await fetch(`${API_BASE}/settings/alerts`);
    return handleResponse(response);
  },

  async updateAlertSettings(partial) {
    const response = await fetch(`${API_BASE}/settings/alerts`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial),
    });
    return handleResponse(response);
  },
};
