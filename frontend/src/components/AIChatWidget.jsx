import { useState, useEffect, useRef } from 'react';
import {
  Sparkles, X, Send, Plus, ChevronLeft, Loader2,
  MessageSquare, Clock, Trash2, AlertCircle, Maximize2, Minimize2,
} from 'lucide-react';
import { api } from '../services/api';
import AiActionText from './AiActionText';

const QUICK_STARTERS = [
  { command: '/portfolio-review', prompt: '/portfolio-review' },
  { command: '/profits', prompt: 'What positions should I consider taking profits on right now?' },
  { command: '/losses', prompt: 'Which positions are down the most, and should I be concerned?' },
  { command: '/harvest', prompt: 'Are there any tax-loss harvesting opportunities in my portfolio right now?' },
  { command: '/diversify', prompt: 'How diversified is my portfolio, and what should I add to improve it?' },
];

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function Message({ role, content }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div
        className={`max-w-[min(80%,42rem)] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm whitespace-pre-wrap'
            : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100 rounded-bl-sm'
        }`}
      >
        {isUser
          ? content
          : <AiActionText text={content} />}
      </div>
    </div>
  );
}

function SessionItem({ session, onLoad, onDelete }) {
  return (
    <div className="flex items-start gap-2 p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg group cursor-pointer" onClick={() => onLoad(session.session_id)}>
      <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-500 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{session.preview}</p>
        <div className="flex items-center gap-1 mt-0.5">
          <Clock className="w-3 h-3 text-slate-300 dark:text-slate-600" />
          <span className="text-xs text-slate-400 dark:text-slate-500">{formatDate(session.updated_at)}</span>
          <span className="text-xs text-slate-300 dark:text-slate-600">· {Math.floor(session.message_count / 2)} exchanges</span>
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(session.session_id); }}
        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400 rounded transition-all"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function AIChatWidget({ open: isOpen, onOpenChange }) {
  const [fullScreen, setFullScreen] = useState(false);
  const [view, setView] = useState('chat'); // 'chat' | 'history'
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [aiAvailable, setAiAvailable] = useState(null);
  const [model, setModel] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    api.getAIStatus()
      .then(s => { setAiAvailable(s.available); setModel(s.default_model); })
      .catch(() => setAiAvailable(false));
  }, []);

  useEffect(() => {
    if (isOpen && view === 'history') loadSessions();
  }, [isOpen, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && view === 'chat') inputRef.current?.focus();
  }, [isOpen, view]);

  const loadSessions = async () => {
    setSessionsLoading(true);
    try {
      const data = await api.getChatSessions();
      setSessions(data);
    } catch {
      setSessions([]);
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSession = async (id) => {
    try {
      const data = await api.getChatSession(id);
      setMessages(data.messages || []);
      setSessionId(id);
      setView('chat');
    } catch (err) {
      setError('Failed to load session');
    }
  };

  const deleteSession = async (id) => {
    try {
      await api.deleteChatSession(id);
      setSessions(prev => prev.filter(s => s.session_id !== id));
      if (sessionId === id) {
        setMessages([]);
        setSessionId(null);
      }
    } catch {
      setError('Failed to delete session');
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setView('chat');
  };

  const sendMessage = async (override) => {
    const text = (override ?? input).trim();
    if (!text || loading) return;
    setInput('');
    setError(null);

    const optimisticMessages = [...messages, { role: 'user', content: text }];
    setMessages(optimisticMessages);
    setLoading(true);

    try {
      const data = await api.chat(text, sessionId);
      setMessages(data.messages);
      setSessionId(data.session_id);
    } catch (err) {
      setError(err.message || 'Failed to get response');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setFullScreen(false);
  };

  return (
    <>
      {/* Rail toggle button */}
      <button
        onClick={() => onOpenChange(!isOpen)}
        title="AI Advisor"
        className={`relative p-2 rounded-lg transition-colors ${
          isOpen
            ? 'bg-slate-600 text-white'
            : 'text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700'
        }`}
      >
        <Sparkles className="w-4 h-4" />
        {aiAvailable === false && (
          <span className="w-2 h-2 rounded-full bg-red-400 absolute top-1 right-1" />
        )}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div className={fullScreen
          ? "fixed inset-4 z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
          : "fixed left-16 top-1/2 -translate-y-1/2 z-50 w-96 max-h-[85vh] h-[600px] bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
        }>
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 bg-slate-900 text-white shrink-0">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="font-semibold text-sm flex-1">AI Portfolio Advisor</span>
            {aiAvailable && model && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
                {model}
              </span>
            )}
            {aiAvailable !== null && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                aiAvailable ? 'bg-green-800 text-green-300' : 'bg-red-900 text-red-300'
              }`}>
                {aiAvailable ? 'Connected' : 'Offline'}
              </span>
            )}
            <button
              onClick={startNewChat}
              className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
              title="New conversation"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView(v => v === 'history' ? 'chat' : 'history')}
              className={`p-1.5 rounded-lg transition-colors ${
                view === 'history' ? 'bg-slate-600' : 'hover:bg-slate-700'
              }`}
              title="Conversation history"
            >
              <Clock className="w-4 h-4" />
            </button>
            <button
              onClick={() => setFullScreen(f => !f)}
              className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
              title={fullScreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {view === 'history' ? (
            /* History view */
            <div className="flex-1 overflow-y-auto p-3">
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setView('chat')}
                  className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Back to chat
                </button>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 ml-auto">Past conversations</span>
              </div>
              {sessionsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400 dark:text-slate-500" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center py-10 text-slate-400 dark:text-slate-500">
                  <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No past conversations</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {sessions.map(s => (
                    <SessionItem
                      key={s.session_id}
                      session={s}
                      onLoad={loadSession}
                      onDelete={deleteSession}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* Chat view */
            <>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    <Sparkles className="w-10 h-10 text-blue-200 dark:text-blue-900 mb-3" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">Portfolio AI Advisor</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Ask me anything about your portfolio — performance, diversification, risk, or what to do next.
                    </p>
                    {aiAvailable && (
                      <div className="flex flex-wrap justify-center gap-1.5 mt-4">
                        {QUICK_STARTERS.map(({ command, prompt }) => (
                          <button
                            key={command}
                            onClick={() => sendMessage(prompt)}
                            disabled={loading}
                            className="px-2.5 py-1 text-xs font-mono rounded-full border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-blue-50 hover:border-blue-200 hover:text-blue-600 dark:hover:bg-blue-950/40 dark:hover:border-blue-800 dark:hover:text-blue-400 transition-colors disabled:opacity-50"
                          >
                            {command}
                          </button>
                        ))}
                      </div>
                    )}
                    {!aiAvailable && (
                      <div className="mt-4 p-3 bg-red-50 dark:bg-red-950/40 rounded-lg text-xs text-red-600 dark:text-red-400">
                        Ollama is offline. Start it locally to enable AI chat.
                      </div>
                    )}
                  </div>
                )}
                {messages.map((msg, i) => (
                  <Message key={i} role={msg.role} content={msg.content} />
                ))}
                {loading && (
                  <div className="flex justify-start mb-3">
                    <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-700 rounded-2xl rounded-bl-sm px-3 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400 dark:text-slate-500" />
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/40 rounded-lg text-xs text-red-600 dark:text-red-400 mb-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    {error}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="shrink-0 border-t border-slate-100 dark:border-slate-800 px-3 py-3 bg-white dark:bg-slate-800">
                <div className="flex items-end gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2 dark:bg-slate-900 dark:border-slate-700">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={aiAvailable ? 'Ask about your portfolio…' : 'Ollama offline'}
                    disabled={!aiAvailable || loading}
                    rows={1}
                    className="flex-1 bg-transparent text-sm resize-none outline-none text-slate-800 placeholder-slate-400 dark:text-slate-100 dark:placeholder-slate-500 disabled:opacity-50 max-h-24"
                    style={{ lineHeight: '1.5' }}
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading || !aiAvailable}
                    className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs text-slate-300 dark:text-slate-600 mt-1.5 text-center">
                  Enter to send · Shift+Enter for new line
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
