import React, { useState, useRef, useEffect } from 'react';
import { 
  Terminal, 
  Send, 
  X, 
  ShieldCheck, 
  Trash2, 
  HelpCircle, 
  Play, 
  Pause, 
  Square, 
  TrendingUp,
  Cpu
} from 'lucide-react';

interface TelegramConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface Message {
  id: string;
  sender: 'user' | 'bot';
  text: string;
  timestamp: number;
}

export const TelegramConsoleModal: React.FC<TelegramConsoleModalProps> = ({ isOpen, onClose }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init_msg',
      sender: 'bot',
      text: '🤖 <b>Battle Trade Telegram Bot</b> conectado.<br/>Escribe <code>/help</code> para ver los comandos disponibles o usa los accesos directos.',
      timestamp: Date.now()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSendCommand = async (commandToSend?: string) => {
    const text = (commandToSend || inputText).trim();
    if (!text || isSending) return;

    const userMsg: Message = {
      id: `user_${Date.now()}`,
      sender: 'user',
      text,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsSending(true);

    try {
      const res = await fetch('/api/telegram/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text })
      });

      if (res.ok) {
        const data = await res.json();
        const botResponse = data.response?.text || 'Sin respuesta del bot.';
        const formattedBotMsg = botResponse.replace(/\n/g, '<br/>');

        setMessages(prev => [
          ...prev,
          {
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: formattedBotMsg,
            timestamp: Date.now()
          }
        ]);
      } else {
        setMessages(prev => [
          ...prev,
          {
            id: `bot_err_${Date.now()}`,
            sender: 'bot',
            text: '❌ Error de comunicación con el servidor.',
            timestamp: Date.now()
          }
        ]);
      }
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `bot_err_${Date.now()}`,
          sender: 'bot',
          text: `❌ Error de red: ${err.message}`,
          timestamp: Date.now()
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleClear = () => {
    setMessages([
      {
        id: 'init_msg_cleared',
        sender: 'bot',
        text: 'Consola limpiada. Escribe <code>/help</code> para ver comandos.',
        timestamp: Date.now()
      }
    ]);
  };

  const quickCommands = [
    { label: '/status', cmd: '/status' },
    { label: '/positions', cmd: '/positions' },
    { label: '/pnl', cmd: '/pnl' },
    { label: '/risk', cmd: '/risk' },
    { label: '/regime', cmd: '/regime' },
    { label: '/top', cmd: '/top' },
    { label: '/pause', cmd: '/pause' },
    { label: '/resume', cmd: '/resume' },
    { label: '/summary', cmd: '/summary' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-cyan-400" />
            <span className="font-bold text-sm text-white">Telegram 24/7 Interactive Controller</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-rose-400 transition-colors"
              title="Limpiar consola"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quick Command Bar */}
        <div className="flex items-center gap-1.5 p-2 bg-slate-800/40 border-b border-slate-800/80 overflow-x-auto text-xs">
          {quickCommands.map(qc => (
            <button
              key={qc.cmd}
              onClick={() => handleSendCommand(qc.cmd)}
              disabled={isSending}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded border border-slate-700 whitespace-nowrap transition-colors"
            >
              {qc.label}
            </button>
          ))}
        </div>

        {/* Messages Log Container */}
        <div ref={scrollRef} className="flex-1 p-4 overflow-y-auto space-y-3 font-mono text-xs">
          {messages.map(m => {
            const isUser = m.sender === 'user';
            return (
              <div
                key={m.id}
                className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-lg p-3 leading-relaxed shadow-sm ${
                    isUser
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-200 border border-slate-700/60'
                  }`}
                  dangerouslySetInnerHTML={{ __html: m.text }}
                />
              </div>
            );
          })}
          {isSending && (
            <div className="flex justify-start">
              <div className="bg-slate-800 text-slate-400 rounded-lg px-3 py-2 text-xs animate-pulse flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                Ejecutando comando...
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSendCommand();
          }}
          className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center gap-2"
        >
          <input
            type="text"
            placeholder="Escribe comando (ej. /status, /why PEPE, /close BRETT)..."
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            disabled={isSending}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
          />
          <button
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Enviar</span>
          </button>
        </form>
      </div>
    </div>
  );
};
