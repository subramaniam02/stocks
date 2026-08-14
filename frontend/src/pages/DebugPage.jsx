import { useState, useEffect } from 'react';
import { Trash2, RefreshCw, ChevronDown, ChevronRight, Clock, Zap, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
  });
}

function MessageBlock({ messages }) {
  return (
    <div className="space-y-2">
      {messages.map((m, i) => (
        <div key={i} className={`rounded-lg px-3 py-2 text-xs font-mono whitespace-pre-wrap break-words ${
          m.role === 'system'   ? 'bg-purple-950 text-purple-200 border border-purple-800' :
          m.role === 'user'     ? 'bg-blue-950 text-blue-200 border border-blue-800' :
                                  'bg-slate-800 text-slate-200 border border-slate-700'
        }`}>
          <span className="font-bold uppercase text-[10px] tracking-widest opacity-60 block mb-1">{m.role}</span>
          {m.content}
        </div>
      ))}
    </div>
  );
}

function CallRow({ call }) {
  const [expanded, setExpanded] = useState(false);
  const hasError = !!call.error;

  return (
    <div className={`border rounded-xl overflow-hidden ${hasError ? 'border-red-200 dark:border-red-800/60' : 'border-slate-200 dark:border-slate-700'}`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono font-medium text-slate-700 dark:text-slate-200 truncate max-w-xs">
              {call.session_id || 'no-session'}
            </span>
            <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{call.model}</span>
            {hasError && <span className="text-xs bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-400 px-2 py-0.5 rounded-full flex items-center gap-1"><AlertCircle className="w-3 h-3" />error</span>}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"><Clock className="w-3 h-3" />{fmtTime(call.timestamp)}</span>
            <span className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500"><Zap className="w-3 h-3" />{call.latency_ms}ms</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{call.messages_sent?.length ?? 0} msgs sent</span>
          </div>
        </div>
        {/* last user message preview */}
        <div className="hidden sm:block text-xs text-slate-400 dark:text-slate-500 truncate max-w-[200px] shrink-0">
          {call.messages_sent?.filter(m => m.role === 'user').slice(-1)[0]?.content?.slice(0, 80) ?? ''}
        </div>
      </button>

      {expanded && (
        <div className="bg-slate-950 border-t border-slate-800 p-4 space-y-4">
          {/* System prompt */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">System Prompt</h4>
            <pre className="text-xs text-purple-200 font-mono whitespace-pre-wrap break-words bg-purple-950 border border-purple-800 rounded-lg px-3 py-2">
              {call.system_prompt || '—'}
            </pre>
          </div>

          {/* Full messages */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Messages Sent to LLM</h4>
            <MessageBlock messages={call.messages_sent ?? []} />
          </div>

          {/* Response */}
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">LLM Response</h4>
            <pre className="text-xs text-emerald-200 font-mono whitespace-pre-wrap break-words bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
              {call.response || '(empty)'}
            </pre>
          </div>

          {/* Error */}
          {hasError && (
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">Error</h4>
              <pre className="text-xs text-red-300 font-mono bg-red-950 border border-red-800 rounded-lg px-3 py-2">{call.error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DebugPage({ onBack }) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.getLLMDebugCalls(100);
      setCalls(data);
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    if (!confirm('Clear all LLM debug logs?')) return;
    setClearing(true);
    try {
      await api.clearLLMDebugCalls();
      setCalls([]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">LLM Debug Log</span>
          <span className="text-xs bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full">{calls.length} entries</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
          <button onClick={handleClear} disabled={clearing || calls.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors disabled:opacity-40">
            <Trash2 className="w-4 h-4" />Clear Log
          </button>
        </div>
      </div>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="w-6 h-6 animate-spin text-slate-400 dark:text-slate-500" />
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-20 text-slate-400 dark:text-slate-500">
            <Zap className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">No LLM calls recorded yet.</p>
            <p className="text-xs mt-1">Send a message in the AI chat widget to see logs here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {calls.map(call => <CallRow key={call.id} call={call} />)}
          </div>
        )}
      </main>
    </div>
  );
}
