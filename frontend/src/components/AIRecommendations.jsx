import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, AlertCircle } from 'lucide-react';
import { api } from '../services/api';
import { ACTION_ICONS, ACTION_COLORS } from './AiActionText';

export default function AIRecommendations() {
  const [recommendations, setRecommendations] = useState([]);
  const [aiStatus, setAIStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [status, recs] = await Promise.all([
        api.getAIStatus(),
        api.getRecommendations(),
      ]);
      setAIStatus(status);
      setRecommendations(recs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      await api.generateRecommendations();
      const recs = await api.getRecommendations();
      setRecommendations(recs);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          AI Recommendations
        </h2>
        <div className="flex items-center gap-2">
          {aiStatus && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              aiStatus.available
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
            }`}>
              {aiStatus.available ? 'Ollama Connected' : 'Ollama Offline'}
            </span>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || !aiStatus?.available}
            className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
            {generating ? 'Analyzing...' : 'Generate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">Loading...</div>
      ) : recommendations.length === 0 ? (
        <div className="py-8 text-center text-gray-500 dark:text-gray-400">
          <Sparkles className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" />
          <p>No recommendations yet.</p>
          {aiStatus?.available && (
            <p className="text-sm mt-1">Click "Generate" to get AI-powered insights.</p>
          )}
          {!aiStatus?.available && (
            <p className="text-sm mt-1">
              Start Ollama locally to enable AI recommendations.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {recommendations.map((rec) => {
            const Icon = ACTION_ICONS[rec.action_type] || Sparkles;
            const colorClass = ACTION_COLORS[rec.action_type] || 'text-gray-600 bg-gray-50';
            
            return (
              <div
                key={rec.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 dark:border-gray-800 dark:hover:border-gray-700"
              >
                <div className={`p-2 rounded-lg ${colorClass}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                      {rec.action_type}
                    </span>
                    {rec.ticker && (
                      <span className="text-xs font-bold text-gray-900 bg-gray-100 dark:text-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">
                        {rec.ticker}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{rec.recommendation}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {new Date(rec.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
