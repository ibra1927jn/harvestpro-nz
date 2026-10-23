/**
 * UnifiedMessagingView — Orchestrator
 * Sub-components: MessagingSidebar, ChatWindow, NewChatModal
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useMessaging, ChatGroup, DBMessage } from '../../context/MessagingContext';
import { useAuth } from '../../context/AuthContext';
import { Role, MessagePriority } from '../../types';
import BroadcastModal from '../modals/BroadcastModal';
import { simpleMessagingService } from '../../services/simple-messaging.service';
import { messageOutbox } from '../../services/message-outbox.service';
import { logger } from '../../utils/logger';
import MessagingSidebar from './messaging/MessagingSidebar';
import ChatWindow from './messaging/ChatWindow';
import NewChatModal from './messaging/NewChatModal';
import ChatInfoPanel from './messaging/ChatInfoPanel';
import type { OutgoingAttachment } from '../../context/messaging.types';
import { useTranslation } from '@/i18n';

/** Sondeo de la barra lateral: solo red de seguridad, los cambios llegan por realtime */
const SIDEBAR_POLL_MS = 60_000;

const UnifiedMessagingView = () => {
  const { t } = useTranslation();
  const { appUser } = useAuth();
  const {
    broadcasts,
    chatGroups,
    loadConversation,
    retryMessage,
    sendMessage,
    sendAttachment,
    updateConversation,
    setConversationMuted,
    sendBroadcast,
    getOrCreateConversation,
    createChatGroup,
    refreshMessages,
    markConversationRead,
  } = useMessaging();

  const [activeTab, setActiveTab] = useState<'alerts' | 'chats'>('chats');
  const [selectedChat, setSelectedChat] = useState<ChatGroup | null>(null);
  const [messages, setMessages] = useState<DBMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<
    Array<{ id: string; name: string; role: string }>
  >([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // No leídos: vienen del servidor (antes siempre 0)
  const unreadCounts = useMemo(
    () => Object.fromEntries(chatGroups.map(g => [g.id, g.unreadCount ?? 0])),
    [chatGroups]
  );

  const isManager = appUser?.role === Role.MANAGER;
  // Gestionan cualquier grupo en el que estén (además de quien lo creó)
  const canManageAnyGroup = appUser?.role === Role.MANAGER || appUser?.role === Role.ADMIN;

  // La conversación abierta sigue a la lista (renombrar, personas, silenciar)
  useEffect(() => {
    if (!selectedChat) return;
    const fresh = chatGroups.find(g => g.id === selectedChat.id);
    if (fresh && (fresh.name !== selectedChat.name || fresh.muted !== selectedChat.muted
      || fresh.members.join(',') !== selectedChat.members.join(',') || fresh.createdBy !== selectedChat.createdBy)) {
      setSelectedChat(prev => (prev && prev.id === fresh.id ? { ...prev, ...fresh } : prev));
    }
  }, [chatGroups, selectedChat]);
  // Nombres de todas las cuentas (también dadas de baja): los mensajes antiguos siguen con nombre
  const [allNames, setAllNames] = useState<Record<string, string>>({});
  const userNameMap = useMemo(() => {
    const map: Record<string, string> = { ...allNames };
    availableUsers.forEach(u => {
      map[u.id] = u.name;
    });
    return map;
  }, [availableUsers, allNames]);

  // ── Initial Load ──
  useEffect(() => {
    refreshMessages();
    simpleMessagingService
      .getDirectory()
      .then(d => {
        setAvailableUsers(d.contacts);
        setAllNames(d.names);
      })
      .catch(e => logger.warn('[Messaging] People not loaded:', e));
  }, [refreshMessages]);

  // ── Load messages + subscribe to real-time ──
  useEffect(() => {
    if (!selectedChat) {
      setMessages([]);
      return;
    }
    loadConversation(selectedChat.id).then(setMessages);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
    const unsubscribe = simpleMessagingService.subscribeToConversation(selectedChat.id, newMsg => {
      if (newMsg.sender_id !== appUser?.id) {
        // Está abierta: el mensaje cuenta como leído
        void markConversationRead(newMsg.conversation_id);
        const dbMsg: DBMessage = {
          id: newMsg.id,
          sender_id: newMsg.sender_id,
          content: newMsg.content,
          created_at: newMsg.created_at,
          conversation_id: newMsg.conversation_id,
          priority: 'normal' as MessagePriority,
          read_by: [],
          attachment_path: newMsg.attachment_path ?? null,
          attachment_type: newMsg.attachment_type ?? null,
          attachment_name: newMsg.attachment_name ?? null,
          attachment_size: newMsg.attachment_size ?? null,
          duration_ms: newMsg.duration_ms ?? null,
        };
        // Sin duplicar si ya llegó por la recarga
        setMessages(prev => (prev.some(m => m.id === dbMsg.id) ? prev : [...prev, dbMsg]));
      }
    });
    // Bandeja de salida: al enviarse, fallar o reintentar un mensaje propio,
    // la conversación se recarga (sale como enviado / "Not sent")
    const chatId = selectedChat.id;
    const unsubscribeOutbox = messageOutbox.subscribe(() => {
      loadConversation(chatId).then(setMessages);
    });
    return () => {
      unsubscribe();
      unsubscribeOutbox();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChat?.id, loadConversation]);

  // ── Sidebar: red de seguridad por si se pierde algún evento de realtime ──
  // (los mensajes nuevos y los contadores ya llegan por realtime; antes se
  // sondeaba cada 15 s con 5-6 consultas por vuelta)
  useEffect(() => {
    let isMounted = true;
    let timerId: ReturnType<typeof setTimeout>;

    const poll = async () => {
      if (!isMounted) return;
      if (document.visibilityState === 'visible' && navigator.onLine) {
        try {
          await refreshMessages();
        } catch (e) {
          logger.error('Message refresh failed:', e);
        }
      }
      if (isMounted) {
        timerId = setTimeout(poll, SIDEBAR_POLL_MS);
      }
    };

    timerId = setTimeout(poll, SIDEBAR_POLL_MS);
    return () => {
      isMounted = false;
      clearTimeout(timerId);
    };
  }, [refreshMessages]);

  const handleSelectChat = (chat: ChatGroup) => {
    setSelectedChat(chat);
    void markConversationRead(chat.id);
  };

  const handleSend = useCallback(
    async (content: string) => {
      if (!content.trim() || !selectedChat || isSending) return;
      setIsSending(true);
      try {
        const sent = await sendMessage(selectedChat.id, content);
        if (sent) setMessages(prev => [...prev, sent]);
      } finally {
        setIsSending(false);
      }
    },
    [selectedChat, isSending, sendMessage]
  );

  const handleSendAttachment = useCallback(
    async (file: OutgoingAttachment) => {
      if (!selectedChat) return 'failed' as const;
      const { message, error } = await sendAttachment(selectedChat.id, file);
      if (message) setMessages(prev => (prev.some(m => m.id === message.id) ? prev : [...prev, message]));
      return error;
    },
    [selectedChat, sendAttachment]
  );

  const handleRetry = useCallback(
    (messageId: string) => {
      // Al momento: vuelve a "pendiente"; la recarga llega por la suscripción
      setMessages(prev => prev.map(m => (m.id === messageId ? { ...m, delivery: 'pending', failure_reason: undefined } : m)));
      retryMessage(messageId).catch(e => logger.warn('[Messaging] Retry failed:', e));
    },
    [retryMessage]
  );

  const handleStartDirectChat = useCallback(
    async (userId: string) => {
      const convId = await getOrCreateConversation(userId);
      if (convId) {
        const user = availableUsers.find(p => p.id === userId);
        setSelectedChat({
          id: convId,
          name: user?.name || 'Direct Chat',
          members: [appUser?.id || '', userId],
          isGroup: false,
          lastMsg: '',
          time: '',
        });
        setShowNewChatModal(false);
        setActiveTab('chats');
      }
    },
    [getOrCreateConversation, availableUsers, appUser?.id]
  );

  return (
    <div className="flex h-[calc(100dvh-64px)] bg-slate-50 overflow-hidden">
      <MessagingSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        chatGroups={chatGroups}
        broadcasts={broadcasts}
        selectedChat={selectedChat}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        unreadCounts={unreadCounts}
        isManager={isManager}
        onSelectChat={handleSelectChat}
        onNewChat={() => setShowNewChatModal(true)}
        onNewBroadcast={() => setShowBroadcastModal(true)}
        isSidebarOpen={isSidebarOpen}
      />

      <section
        aria-label={t('chat.conversation')}
        // Móvil: lista o conversación, nunca las dos a la vez (antes se partía la pantalla en dos)
        className={`flex-1 flex flex-col ${isSidebarOpen ? 'hidden md:flex' : 'flex'}`}
      >
        {actionError && (
          <div role="alert" className="m-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">{actionError}</div>
        )}
        {selectedChat ? (
          <ChatWindow
            selectedChat={selectedChat}
            messages={messages}
            appUserId={appUser?.id || ''}
            isManager={isManager}
            userNameMap={userNameMap}
            isSending={isSending}
            onSend={handleSend}
            onSendAttachment={handleSendAttachment}
            onOpenInfo={() => setShowInfo(true)}
            onRetry={handleRetry}
            onBack={() => {
              setSelectedChat(null);
              setIsSidebarOpen(true);
            }}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 chat-bg-pattern">
            <div className="size-28 rounded-3xl bg-gradient-to-br from-indigo-100 to-blue-100 flex items-center justify-center mb-5 shadow-sm">
              <span aria-hidden="true" className="material-symbols-outlined text-6xl text-indigo-400">forum</span>
            </div>
            <h3 className="text-xl font-black text-slate-800 mb-1">{t('chat.field_comms_title')}</h3>
            <p className="text-sm text-slate-400 font-medium text-center max-w-xs mb-6">
              {t('chat.field_comms_desc')}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowNewChatModal(true)}
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-500/20 hover:shadow-xl hover:shadow-indigo-500/30 transition active:scale-95"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-sm mr-1 align-middle">add</span>{t('chat.new_chat')}
              </button>
              {isManager && (
                <button
                  onClick={() => setShowBroadcastModal(true)}
                  className="px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:border-amber-300 hover:text-amber-600 transition active:scale-95"
                >
                  <span aria-hidden="true" className="material-symbols-outlined text-sm mr-1 align-middle">
                    campaign
                  </span>
                  {t('common.broadcast')}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {showInfo && selectedChat && (
        <ChatInfoPanel
          chat={selectedChat}
          messages={messages}
          appUserId={appUser?.id || ''}
          canManageAny={canManageAnyGroup}
          availableUsers={availableUsers.filter(u => u.id !== appUser?.id)}
          onClose={() => setShowInfo(false)}
          onUpdate={changes => updateConversation(selectedChat.id, changes)}
          onSetMuted={muted => setConversationMuted(selectedChat.id, muted)}
          onCreateGroup={async (name, ids) => {
            setActionError(null);
            try {
              const group = await createChatGroup(name, ids);
              if (group) {
                setShowInfo(false);
                setSelectedChat(group);
              }
            } catch (e) {
              setActionError(t('chat.group_not_created', { error: e instanceof Error ? e.message : t('chat.try_again') }));
              setShowInfo(false);
            }
          }}
        />
      )}
      {showNewChatModal && (
        <NewChatModal
          availableUsers={availableUsers}
          currentUserId={appUser?.id || ''}
          onClose={() => setShowNewChatModal(false)}
          onStartDirect={handleStartDirectChat}
          onCreateGroup={async (name, ids) => {
            setActionError(null);
            try {
              const group = await createChatGroup(name, ids);
              if (group) {
                setSelectedChat(group);
                setShowNewChatModal(false);
                setActiveTab('chats');
              }
            } catch (e) {
              setActionError(t('chat.group_not_created', { error: e instanceof Error ? e.message : t('chat.try_again') }));
              setShowNewChatModal(false);
            }
          }}
        />
      )}
      {showBroadcastModal && isManager && (
        <BroadcastModal
          onClose={() => setShowBroadcastModal(false)}
          onSend={async (title, content, priority, targetRoles) => {
            // Si no se guardó, el modal no se cierra y se avisa
            const ok = await sendBroadcast(title, content, priority as MessagePriority, targetRoles);
            if (!ok) {
              setActionError(t('chat.broadcast_failed'));
              throw new Error('Broadcast not sent');
            }
            setActionError(null);
            refreshMessages();
          }}
        />
      )}
    </div>
  );
};

export default UnifiedMessagingView;
