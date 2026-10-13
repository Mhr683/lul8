import React, { useState, useEffect, useRef } from 'react';
import {
  MessageSquare,
  Sparkles,
  Mail,
  Phone,
  Send,
  X,
  Copy,
  Check,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Clock,
  ShieldCheck,
  Truck,
  RotateCcw,
  Headphones,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Smartphone,
  Info,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { CustomerHelplineMessage, CustomerInquiryTicket } from '../types/store';

interface CustomerHelplineDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'AI_CHAT' | 'WHATSAPP' | 'EMAIL' | 'PHONE';
  initialOrderNumber?: string;
}

export const CustomerHelplineDrawer: React.FC<CustomerHelplineDrawerProps> = ({
  isOpen,
  onClose,
  initialTab = 'AI_CHAT',
  initialOrderNumber,
}) => {
  const { settings } = useStore();
  const [activeTab, setActiveTab] = useState<'AI_CHAT' | 'WHATSAPP' | 'EMAIL' | 'PHONE'>(initialTab);

  // Sync tab if initialTab changes when opening
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  // Contact details
  const whatsappNumberRaw = settings.helplineWhatsApp || '923008472911';
  const whatsappNumberFormatted = settings.helplineWhatsAppFormatted || '+92 300 8472911';
  const emailAddress = settings.helplineEmail || 'concierge@atelieraurelia.com';
  const phoneNumber = settings.helplinePhone || '+92 (042) 3578-9000';
  const tollFreeNumber = '0800-2873542 (0800-AURELIA)';

  // ---------------------------------------------------------------------------
  // 1. AI CHAT STATE
  // ---------------------------------------------------------------------------
  const [messages, setMessages] = useState<CustomerHelplineMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content:
        'Assalam o Alaikum & Welcome to Atelier Aurelia Concierge.\n\nI am your 24/7 dedicated luxury client advisor. You can ask me in English, Urdu (اردو), or Roman Urdu regarding our collections, order tracking, Cash on Delivery (COD) in Pakistan, or immediate WhatsApp helpline assistance.\n\nHow may I assist you today?',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      suggestedActions: [
        'Track my order',
        'JazzCash & COD payment rules',
        'Swiss Watches warranty & authenticity',
        'Connect to WhatsApp agent (+92 300 8472911)',
      ],
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [orderQueryNumber, setOrderQueryNumber] = useState(initialOrderNumber || '');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'AI_CHAT') {
      scrollToBottom();
    }
  }, [messages, activeTab]);

  const handleSendAiMessage = async (textToSend?: string) => {
    const text = (textToSend || chatInput).trim();
    if (!text || isAiLoading) return;

    const userMsg: CustomerHelplineMessage = {
      id: 'usr-' + Date.now(),
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsAiLoading(true);

    try {
      const historyPayload = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch('/api/ai/customer-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload,
          orderNumber: orderQueryNumber || undefined,
        }),
      });

      const data = await res.json();

      if (data.success && data.reply) {
        const assistantMsg: CustomerHelplineMessage = {
          id: 'ast-' + Date.now(),
          role: 'assistant',
          content: data.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          suggestedActions: data.suggestedActions || [],
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        const fallbackMsg: CustomerHelplineMessage = {
          id: 'ast-fallback-' + Date.now(),
          role: 'assistant',
          content:
            data.fallbackReply ||
            `Thank you for contacting Atelier Aurelia Helpline. Our team is available 24/7 on WhatsApp (${whatsappNumberFormatted}) and email (${emailAddress}).`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, fallbackMsg]);
      }
    } catch {
      const errMsg: CustomerHelplineMessage = {
        id: 'ast-err-' + Date.now(),
        role: 'assistant',
        content: `Thank you for reaching out. Our concierge desk is standing by 24/7 on WhatsApp (${whatsappNumberFormatted}) and email (${emailAddress}).`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsAiLoading(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'msg-welcome-fresh',
        role: 'assistant',
        content:
          'Assalam o Alaikum! Conversation refreshed. How may I assist your Atelier Aurelia inquiry today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestedActions: [
          'Track my order',
          'Cash on Delivery rules in Pakistan',
          'WhatsApp concierge number',
          '30-Day return policy',
        ],
      },
    ]);
  };

  // ---------------------------------------------------------------------------
  // 2. WHATSAPP STATE
  // ---------------------------------------------------------------------------
  const [whatsappTemplate, setWhatsappTemplate] = useState(
    'Assalam o Alaikum Atelier Concierge, I would like assistance with an inquiry.'
  );
  const [copiedWhatsapp, setCopiedWhatsapp] = useState(false);

  const handleCopyWhatsapp = () => {
    navigator.clipboard.writeText(whatsappNumberFormatted);
    setCopiedWhatsapp(true);
    setTimeout(() => setCopiedWhatsapp(false), 2500);
  };

  const handleLaunchWhatsapp = (customText?: string) => {
    const text = encodeURIComponent(customText || whatsappTemplate);
    const url = `https://wa.me/${whatsappNumberRaw}?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ---------------------------------------------------------------------------
  // 3. EMAIL & TICKET FORM STATE
  // ---------------------------------------------------------------------------
  const [ticketForm, setTicketForm] = useState({
    name: '',
    email: '',
    phone: '',
    orderNumber: initialOrderNumber || '',
    category: 'ORDER_TRACKING',
    subject: '',
    message: '',
  });
  const [isSubmittingTicket, setIsSubmittingTicket] = useState(false);
  const [submittedTicket, setSubmittedTicket] = useState<CustomerInquiryTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);

  const handleCopyEmail = () => {
    navigator.clipboard.writeText(emailAddress);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2500);
  };

  const handleTicketSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketForm.name.trim() || !ticketForm.email.trim() || !ticketForm.message.trim()) {
      setTicketError('Please provide your name, email, and inquiry details.');
      return;
    }
    setTicketError(null);
    setIsSubmittingTicket(true);

    try {
      const res = await fetch('/api/helpline/contact-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...ticketForm,
          channel: 'WEB_FORM',
        }),
      });
      const data = await res.json();
      if (data.success && data.ticket) {
        setSubmittedTicket(data.ticket);
      } else {
        setTicketError(data.error || 'Failed to dispatch ticket. Please try WhatsApp or email directly.');
      }
    } catch {
      setTicketError('Network error. Please contact us directly via WhatsApp or email.');
    } finally {
      setIsSubmittingTicket(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 4. FAQS ACCORDION STATE
  // ---------------------------------------------------------------------------
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  const faqs = [
    {
      q: 'How fast is courier delivery across Pakistan?',
      a: 'We partner with TCS Express, Leopards Courier, and M&P Courier. In major cities (Lahore, Karachi, Islamabad/Rawalpindi), orders arrive within 24 to 48 hours. Other cities and tehsils arrive within 2 to 3 business days with full SMS & tracking updates.',
    },
    {
      q: 'Do you offer Cash on Delivery (COD) in Pakistan?',
      a: 'Yes, Cash on Delivery is supported for all domestic destinations up to PKR 150,000. For orders exceeding PKR 150,000, secure RAAST or Advance Bank/Card transfer is required by logistics regulations.',
    },
    {
      q: 'How do I track my order status in real time?',
      a: 'You can track orders directly through our AI Concierge by sharing your Order Number (e.g., AA-ORD-9021), or via the "Account > Orders" tab on our storefront. Real-time TCS / Leopards tracking links are also sent via Email and SMS.',
    },
    {
      q: 'What is your authentic luxury guarantee & warranty?',
      a: 'Every timepiece and leather piece is accompanied by a stamped Certificate of Authenticity with its individual serial number. Swiss mechanical timepieces include a 2-Year International Maison Warranty covering calibres and movements.',
    },
    {
      q: 'What is the return and exchange window?',
      a: 'We provide a complimentary 30-Day White-Glove inspection window. If a piece does not completely exceed your expectations, our courier will collect it securely from your doorstep for an exchange or full refund.',
    },
  ];

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Atelier Aurelia Customer Helpline and Concierge"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-[#FBFBF9] text-[#141413] w-full max-w-2xl h-[92vh] max-h-[760px] flex flex-col shadow-2xl border border-black/15 rounded-xl overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Top Header Bar */}
        <div className="bg-[#141413] text-[#FBFBF9] px-5 py-3.5 flex items-center justify-between shrink-0 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <Headphones className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display font-semibold text-base sm:text-lg tracking-tight">
                  Atelier Concierge & Helpline
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-medium border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  24/7 Live
                </span>
              </div>
              <p className="text-[11px] text-white/60">
                AI Client Advisor · WhatsApp · Email · Dedicated Helpline Desk
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-md transition-colors cursor-pointer"
            aria-label="Close Helpline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 4 Interactive Channel Tabs */}
        <div className="bg-[#F0EFEA] border-b border-black/10 px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('AI_CHAT')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'AI_CHAT'
                ? 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                : 'text-[#141413]/70 hover:text-[#141413] hover:bg-black/5'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>AI Concierge Chat</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('WHATSAPP')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'WHATSAPP'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-[#141413]/70 hover:text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>WhatsApp Helpline</span>
            <span className="px-1.5 py-0.2 rounded text-[9px] bg-white/20">Instant</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('EMAIL')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'EMAIL'
                ? 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                : 'text-[#141413]/70 hover:text-[#141413] hover:bg-black/5'
            }`}
          >
            <Mail className="w-3.5 h-3.5" />
            <span>Email & Tickets</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('PHONE')}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-all cursor-pointer ${
              activeTab === 'PHONE'
                ? 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                : 'text-[#141413]/70 hover:text-[#141413] hover:bg-black/5'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Phone & FAQs</span>
          </button>
        </div>

        {/* Tab 1: AI Concierge Chat */}
        {activeTab === 'AI_CHAT' && (
          <div className="flex-1 flex flex-col min-h-0 bg-[#FBFBF9]">
            {/* Multilingual Guidance Sub-banner */}
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-200/60 flex items-center justify-between text-[11px] text-amber-900 shrink-0">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                <strong>Aurelia AI:</strong> Speaks English, Urdu (اردو), and Roman Urdu. Order tracking & store answers.
              </span>
              <button
                type="button"
                onClick={handleClearChat}
                className="text-[10px] text-amber-800 hover:text-black underline cursor-pointer"
              >
                Clear Chat
              </button>
            </div>

            {/* Chat Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {messages.map((m) => {
                const isAssistant = m.role === 'assistant';
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${isAssistant ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-3.5 text-xs leading-relaxed whitespace-pre-wrap ${
                        isAssistant
                          ? 'bg-white text-[#141413] border border-black/10 shadow-xs'
                          : 'bg-[#141413] text-[#FBFBF9] shadow-xs'
                      }`}
                    >
                      {m.content}
                    </div>

                    <div className="flex items-center gap-2 mt-1 px-1 text-[10px] text-black/40">
                      <span>{isAssistant ? 'Aurelia Concierge' : 'You'}</span>
                      <span>·</span>
                      <span>{m.timestamp}</span>
                      {isAssistant && (
                        <button
                          type="button"
                          onClick={() => navigator.clipboard.writeText(m.content)}
                          className="hover:text-black ml-1 cursor-pointer"
                          title="Copy reply"
                        >
                          <Copy className="w-2.5 h-2.5 inline" />
                        </button>
                      )}
                    </div>

                    {/* Suggested follow-up prompt chips */}
                    {isAssistant && m.suggestedActions && m.suggestedActions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {m.suggestedActions.map((action, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSendAiMessage(action)}
                            className="px-2.5 py-1 rounded-full bg-black/5 hover:bg-black/10 border border-black/10 text-[11px] text-[#141413] transition-colors cursor-pointer text-left"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {isAiLoading && (
                <div className="flex flex-col items-start">
                  <div className="bg-white border border-black/10 rounded-lg p-3 text-xs text-black/60 flex items-center gap-2 shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></span>
                    <span>Aurelia Concierge is consulting salon knowledge...</span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick Prompt Bar */}
            <div className="px-4 py-2 border-t border-black/5 bg-[#F6F5F0] flex items-center gap-2 overflow-x-auto scrollbar-none shrink-0 text-[11px]">
              <span className="text-black/40 text-[10px] font-mono shrink-0">Suggestions:</span>
              <button
                type="button"
                onClick={() => handleSendAiMessage('Mera order kab dispatch hoga? Track status.')}
                className="px-2 py-0.5 rounded bg-white border border-black/10 hover:border-black/30 whitespace-nowrap cursor-pointer"
              >
                📦 Track Order
              </button>
              <button
                type="button"
                onClick={() => handleSendAiMessage('Cash on delivery Lahore or Karachi me available hai?')}
                className="px-2 py-0.5 rounded bg-white border border-black/10 hover:border-black/30 whitespace-nowrap cursor-pointer"
              >
                💵 COD in Pakistan
              </button>
              <button
                type="button"
                onClick={() => handleSendAiMessage('Mujhe WhatsApp support agent ka number dain.')}
                className="px-2 py-0.5 rounded bg-white border border-black/10 hover:border-black/30 whitespace-nowrap cursor-pointer"
              >
                💬 WhatsApp Number
              </button>
              <button
                type="button"
                onClick={() => handleSendAiMessage('30-day return or exchange policy kya hai?')}
                className="px-2 py-0.5 rounded bg-white border border-black/10 hover:border-black/30 whitespace-nowrap cursor-pointer"
              >
                🔄 Returns & Warranty
              </button>
            </div>

            {/* Input Bar */}
            <div className="p-3 bg-white border-t border-black/10 shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendAiMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask in English or Roman Urdu (e.g. 'Delivery kab hogi?', 'Watch warranty?')..."
                  className="flex-1 bg-[#FBFBF9] border border-black/15 focus:border-[#141413] rounded-md px-3.5 py-2.5 text-xs text-[#141413] placeholder:text-black/40 focus:outline-none"
                  disabled={isAiLoading}
                />
                <button
                  type="submit"
                  disabled={isAiLoading || !chatInput.trim()}
                  className="px-4 py-2.5 bg-[#141413] text-[#FBFBF9] rounded-md text-xs font-medium hover:bg-[#2A2A28] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Tab 2: WhatsApp Helpline */}
        {activeTab === 'WHATSAPP' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-[#FBFBF9]">
            {/* Top WhatsApp Feature Card */}
            <div className="bg-gradient-to-br from-emerald-900 via-emerald-800 to-[#0e3b2e] text-white rounded-xl p-5 sm:p-6 shadow-md border border-emerald-700/50">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-semibold border border-emerald-400/30">
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Official 24/7 WhatsApp Helpline</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-display font-semibold tracking-tight text-white">
                    Direct VIP Concierge Chat
                  </h3>
                  <p className="text-xs text-emerald-100/80 leading-relaxed max-w-md">
                    Connect directly with an Atelier client executive on WhatsApp for bespoke sizing,
                    courier tracking, custom monogramming, or instantaneous Pakistan mobile wallet verification.
                  </p>
                </div>

                <div className="hidden sm:flex flex-col items-center justify-center p-3 rounded-lg bg-white/10 backdrop-blur-xs border border-white/15 text-center shrink-0">
                  <Smartphone className="w-6 h-6 text-emerald-300 mb-1" />
                  <span className="text-[10px] font-mono text-emerald-200">Instant Launch</span>
                </div>
              </div>

              {/* Number Highlight Box */}
              <div className="mt-5 p-3.5 rounded-lg bg-black/25 border border-white/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-emerald-300">
                    Helpline WhatsApp Number
                  </span>
                  <div className="text-lg sm:text-xl font-mono font-semibold text-white tracking-wider">
                    {whatsappNumberFormatted}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyWhatsapp}
                    className="px-3 py-1.5 rounded bg-white/15 hover:bg-white/25 border border-white/20 text-xs text-white font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {copiedWhatsapp ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-300" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Number</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleLaunchWhatsapp()}
                    className="px-4 py-1.5 rounded bg-emerald-400 hover:bg-emerald-300 text-emerald-950 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Template Selector */}
            <div className="bg-white border border-black/10 rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#141413]">
                  Select Pre-filled Message or Custom Text
                </span>
                <span className="text-[11px] text-black/50">One-click send to WhatsApp</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  {
                    title: '📦 Order Status & Dispatch',
                    text: 'Assalam o Alaikum Atelier Team, please provide a tracking dispatch update for my recent order.',
                  },
                  {
                    title: '💳 Payment Transfer (JazzCash/Bank)',
                    text: 'Assalam o Alaikum, I have completed advance transfer via JazzCash / Raast and would like verification.',
                  },
                  {
                    title: '✨ Custom Monogramming & Bespoke',
                    text: 'Hello, I am interested in custom gold foil monogramming on a leather tote or briefcase.',
                  },
                  {
                    title: '🛍️ Product Inquiry & Sizing',
                    text: 'Hello Atelier Concierge, could you please provide detailed dimensions and calfskin leather care guidance?',
                  },
                ].map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setWhatsappTemplate(item.text);
                      handleLaunchWhatsapp(item.text);
                    }}
                    className="p-3 text-left border border-black/10 hover:border-emerald-600 hover:bg-emerald-50/50 rounded-lg transition-all cursor-pointer text-xs group"
                  >
                    <div className="font-medium text-[#141413] group-hover:text-emerald-800">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-black/60 line-clamp-2 mt-0.5">{item.text}</div>
                  </button>
                ))}
              </div>

              <div className="pt-2">
                <label className="block text-[11px] font-medium text-black/60 mb-1">
                  Custom WhatsApp message preview:
                </label>
                <textarea
                  rows={2}
                  value={whatsappTemplate}
                  onChange={(e) => setWhatsappTemplate(e.target.value)}
                  className="w-full bg-[#FBFBF9] border border-black/15 rounded-md p-2.5 text-xs text-[#141413] focus:outline-none focus:border-emerald-600"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => handleLaunchWhatsapp(whatsappTemplate)}
                    className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Launch Chat with Message</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Helpline Guarantee Callout */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 bg-white border border-black/10 rounded-lg space-y-1">
                <div className="font-semibold text-[#141413] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>24/7 Live Desk</span>
                </div>
                <p className="text-[11px] text-black/60">
                  Average response under 2 minutes for verified clients and tracking queries.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-black/10 rounded-lg space-y-1">
                <div className="font-semibold text-[#141413] flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Logistics Liaison</span>
                </div>
                <p className="text-[11px] text-black/60">
                  Direct connection with TCS Express & Leopards dispatch officers.
                </p>
              </div>

              <div className="p-3.5 bg-white border border-black/10 rounded-lg space-y-1">
                <div className="font-semibold text-[#141413] flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Private & Confidential</span>
                </div>
                <p className="text-[11px] text-black/60">
                  End-to-end encrypted communication for all luxury order details.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Email & Support Tickets */}
        {activeTab === 'EMAIL' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-[#FBFBF9]">
            {/* Email Header Card */}
            <div className="bg-[#141413] text-[#FBFBF9] rounded-xl p-5 sm:p-6 shadow-sm border border-black/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-mono">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Official Email Concierge</span>
                  </div>
                  <h3 className="text-xl font-display font-semibold text-[#FBFBF9]">
                    Client Service & Private Inquiries
                  </h3>
                  <div className="text-sm font-mono text-white/90">{emailAddress}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyEmail}
                    className="px-3.5 py-2 rounded bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-medium text-white transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    {copiedEmail ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Email</span>
                      </>
                    )}
                  </button>

                  <a
                    href={`mailto:${emailAddress}?subject=Atelier%20Aurelia%20Client%20Inquiry`}
                    className="px-4 py-2 rounded bg-[#FBFBF9] hover:bg-white text-[#141413] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Mail App</span>
                  </a>
                </div>
              </div>
            </div>

            {/* In-app Support Ticket Dispatch Form */}
            <div className="bg-white border border-black/10 rounded-xl p-5 sm:p-6 space-y-4">
              <div>
                <h4 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Submit Support Ticket / Inquiry
                </h4>
                <p className="text-xs text-black/60 mt-0.5">
                  Logged directly into our client management system. Our team replies within 15 minutes.
                </p>
              </div>

              {submittedTicket ? (
                <div className="p-5 rounded-lg bg-[#FAF8F5] border border-[#C5A059]/40 text-[#141413] space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-sm">Inquiry Logged & AI Auto-Replied!</span>
                    </div>
                    <span className="text-[11px] font-mono bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold border border-emerald-300">
                      {submittedTicket.ticketNumber}
                    </span>
                  </div>

                  {submittedTicket.aiAutoReply && (
                    <div className="p-3.5 bg-white border border-[#C5A059]/30 rounded-md shadow-sm space-y-2 text-left">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-[#8F7029]">
                        <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
                        <span>Instant AI Concierge Auto-Reply:</span>
                      </div>
                      <p className="text-xs text-[#2A2927] whitespace-pre-line leading-relaxed">
                        {submittedTicket.aiAutoReply}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-[#575653]">
                    A confirmation dispatch has been sent to <strong>{submittedTicket.email}</strong>. Our human concierge officers will also follow up if required.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmittedTicket(null);
                      setTicketForm({
                        name: '',
                        email: '',
                        phone: '',
                        orderNumber: '',
                        category: 'ORDER_TRACKING',
                        subject: '',
                        message: '',
                      });
                    }}
                    className="px-3.5 py-1.5 bg-emerald-800 text-white text-xs font-medium rounded hover:bg-emerald-900 transition-colors cursor-pointer"
                  >
                    Submit Another Inquiry
                  </button>
                </div>
              ) : (
                <form onSubmit={handleTicketSubmit} className="space-y-3.5">
                  {ticketError && (
                    <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{ticketError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Full Name <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={ticketForm.name}
                        onChange={(e) => setTicketForm({ ...ticketForm, name: e.target.value })}
                        placeholder="e.g. Tariq Mehmood"
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Email Address <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={ticketForm.email}
                        onChange={(e) => setTicketForm({ ...ticketForm, email: e.target.value })}
                        placeholder="e.g. tariq@example.com"
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Phone / WhatsApp (Optional)
                      </label>
                      <input
                        type="tel"
                        value={ticketForm.phone}
                        onChange={(e) => setTicketForm({ ...ticketForm, phone: e.target.value })}
                        placeholder="e.g. +92 300 1234567"
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Order Number (Optional)
                      </label>
                      <input
                        type="text"
                        value={ticketForm.orderNumber}
                        onChange={(e) => setTicketForm({ ...ticketForm, orderNumber: e.target.value })}
                        placeholder="e.g. AA-ORD-9021"
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Inquiry Category
                      </label>
                      <select
                        value={ticketForm.category}
                        onChange={(e) => setTicketForm({ ...ticketForm, category: e.target.value })}
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      >
                        <option value="ORDER_TRACKING">📦 Order Tracking & Courier Dispatch</option>
                        <option value="PAYMENT_ASSISTANCE">💳 Payment Verification (COD / Wallets)</option>
                        <option value="PRODUCT_INQUIRY">✨ Product Craftsmanship & Sizing</option>
                        <option value="RETURNS_EXCHANGES">🔄 30-Day Returns & Exchanges</option>
                        <option value="BESPOKE_REQUEST">🖋️ Bespoke Monogramming & Custom Orders</option>
                        <option value="OTHER">💬 General Client Inquiry</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-black/70 mb-1">
                        Subject
                      </label>
                      <input
                        type="text"
                        value={ticketForm.subject}
                        onChange={(e) => setTicketForm({ ...ticketForm, subject: e.target.value })}
                        placeholder="Brief summary of your question"
                        className="w-full bg-[#FBFBF9] border border-black/15 rounded-md px-3 py-2 text-xs focus:outline-none focus:border-black"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-black/70 mb-1">
                      Detailed Message <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={ticketForm.message}
                      onChange={(e) => setTicketForm({ ...ticketForm, message: e.target.value })}
                      placeholder="Please describe how we can assist you..."
                      className="w-full bg-[#FBFBF9] border border-black/15 rounded-md p-3 text-xs focus:outline-none focus:border-black"
                    />
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmittingTicket}
                      className="px-5 py-2.5 bg-[#141413] text-[#FBFBF9] text-xs font-semibold rounded-md hover:bg-[#2A2A28] disabled:opacity-50 transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      {isSubmittingTicket ? (
                        <span>Logging Ticket...</span>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Dispatch Ticket</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Tab 4: Direct Phone Lines & Helpline FAQs */}
        {activeTab === 'PHONE' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 bg-[#FBFBF9]">
            {/* Phone Directory Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="bg-white border border-black/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-black/50">
                    Direct VIP Concierge Line
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <div className="text-base font-mono font-semibold text-[#141413]">{phoneNumber}</div>
                <p className="text-[11px] text-black/60">
                  Headquarters client services for Pakistan orders, bespoke horology, and high-value inquiries.
                </p>
                <div className="pt-2">
                  <a
                    href={`tel:${phoneNumber.replace(/[^0-9+]/g, '')}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#141413] text-[#FBFBF9] rounded text-xs font-medium hover:bg-[#2A2A28] transition-colors cursor-pointer"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call Concierge Desk</span>
                  </a>
                </div>
              </div>

              <div className="bg-white border border-black/10 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-black/50">
                    Pakistan Toll-Free UAN
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                </div>
                <div className="text-base font-mono font-semibold text-[#141413]">{tollFreeNumber}</div>
                <p className="text-[11px] text-black/60">
                  Toll-free across all landlines and mobile operators in Pakistan (Mon–Sun 9 AM to 11 PM PKT).
                </p>
                <div className="pt-2">
                  <a
                    href="tel:08002873542"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded text-xs font-medium hover:bg-emerald-800 transition-colors cursor-pointer"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Dial Toll-Free</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Helpline FAQs Section */}
            <div className="bg-white border border-black/10 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#141413]" />
                <h4 className="text-sm font-semibold uppercase tracking-wider text-[#141413]">
                  Frequently Asked Questions
                </h4>
              </div>

              <div className="space-y-2.5">
                {faqs.map((faq, idx) => {
                  const isOpen = openFaqIndex === idx;
                  return (
                    <div
                      key={idx}
                      className="border border-black/10 rounded-lg overflow-hidden transition-all"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="w-full p-3.5 text-left bg-[#FBFBF9] hover:bg-[#F2F1EC] flex items-center justify-between gap-3 text-xs font-medium text-[#141413] cursor-pointer"
                      >
                        <span>{faq.q}</span>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-black/50 shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-black/50 shrink-0" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="p-3.5 bg-white text-xs text-black/70 leading-relaxed border-t border-black/5">
                          {faq.a}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Drawer Footer */}
        <div className="bg-[#F0EFEA] border-t border-black/10 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs">
          <div className="flex items-center gap-2 text-black/60 text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>
              WhatsApp: <strong>{whatsappNumberFormatted}</strong> · Email: <strong>{emailAddress}</strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleLaunchWhatsapp()}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Instant WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-black/10 hover:bg-black/20 text-[#141413] rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
