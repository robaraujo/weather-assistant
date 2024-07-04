import moment from 'moment';
import { useEffect, useState } from 'react';

type Message = {
  content: string
  role: string
  created_at?: Date
  error?: boolean
}

type History = {
  threadId: string
  message: string
}

function parseJson(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
}

export default function Home() {
  const [currentMessage, setCurrentMessage] = useState('');
  const [historyList, setHistoryList] = useState<History[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [useStream, setUseStream] = useState(true);

  const saveToHistory = (threadId: string, message: string) => {
    if (historyList.find(h => h.threadId === threadId)) return;

    setHistoryList(h => [...h, { threadId, message }]);
  };

  const clearHistory = () => {
    localStorage.setItem('chat-history', '');
    setHistoryList([]);
  }

  const fetchHistory = async(threadId: string) => {
    try {
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId }),
      });

      const history = await res.json();
      const historyFixed = history.messages.map((h: any) => ({
        content: h.content[0].text.value,
        role: h.role,
        created_at: new Date()
      }));

      setThreadId(threadId);
      setMessages(historyFixed);
    } catch (e: any) {
      setLastMessage(e.message || 'Something went wrong while processing your data', true);
    } finally {
      setLoading(false);
    }
  };

  const addMsgs = (list: Array<Array<string>>) => {
    const newMsgs = list.map(([content, role]) => ({ content, role, created_at: new Date() }))
    setMessages(m => [...m, ...newMsgs]);
  };

  const updateLastMessage = (content: string) => {
    setMessages(list => list.map((m, i) =>
      i === list.length - 1 ? { ...m, content: m.content + content } : m
    ));
  };

  const setLastMessage = (content: string, error?: boolean) => {
    setMessages(list => list.map((m, i) =>
      i === list.length - 1 ? { ...m, content, error: error } : m
    ));
  };

  const processStream = async (res: Response) => {
    if (!res || !res.body) return false;

    const reader = res?.body?.getReader();
    const decoder = new TextDecoder();
    let result: any;

    while (!result?.done && reader) {
      result = await reader.read();
      const { event, data } = parseJson(decoder.decode(result.value));

      if (!event || !data) {
        continue;
      }

      if (event === 'thread.message.delta') {
        updateLastMessage(data.delta.content[0].text.value);
      }

      if (event === 'thread.message.completed') {
        setLastMessage(data.content[0].text.value);
        setThreadId(data.thread_id);
      }

      if (event === 'thread.run.failed') {
        setLastMessage(data.last_error.message, true);
        setThreadId(data.thread_id);
      }
    }
  }

  const processResponse = async (res: Response) => {
    const { message, threadId } = await res.json();
    setThreadId(threadId);
    updateLastMessage(message);
  };

  const postMsg = async () => {
    try {
      const url = useStream ? '/api/chat-stream' : '/api/chat';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentMessage, threadId }),
      });

      useStream ? processStream(res) : processResponse(res);
    } catch (e: any) {
      setLastMessage(e.message || 'Something went wrong while processing your data', true);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    addMsgs([[currentMessage, 'user'], ['', 'assistant']]);
    setLoading(true);
    setCurrentMessage('');
    e.preventDefault();

    postMsg();
  };

  useEffect(() => {
    threadId && saveToHistory(threadId, messages[0].content);
  }, [threadId]);

  useEffect(() => {
    historyList.length && localStorage.setItem('chat-history', JSON.stringify(historyList));
  }, [historyList]);

  useEffect(() => {
    const storage = localStorage.getItem('chat-history');
    const list = storage ? JSON.parse(storage) : [];
    setHistoryList(list);
  }, []);

  console.log({ historyList })
  return (
    <>
      <header>
        <h1 className='title'>Weather Chatbot</h1>
        <h2 className='subtitle'>How can I help you?</h2>
      </header>
      <main>
        <div className='chat-history'>
          <h2>Your History</h2>
          <ul>
            {historyList.map(history => (
              <li key={history.threadId} onClick={() => fetchHistory(history.threadId)}>{history.message}</li>
            ))}
          </ul>
          {historyList.length > 0 && <button onClick={clearHistory}>Clear</button>}
        </div>
        <div className='chat-container'>
          {messages?.filter(m => m.content).map((message: Message, i: number) => (
            <div key={i} className={`message message-${message.role} ${message.error ? 'error' : ''}`}>
              {message.content}
              <div className="message-time">{moment(message.created_at).format('hh:mm A')}</div>
            </div>
          ))}
        </div>
        {loading && <div className="loading" id="loading">Sending...</div>}
      </main>
      <footer>
        <form onSubmit={handleSubmit}>
          <div className="input-container">
            <input
              className="chat-input"
              type="text"
              placeholder={loading ? '' : 'Type a message...'}
              value={currentMessage}
              onChange={(e) => setCurrentMessage(e.target.value)}
              disabled={loading}
              required
            />
            <button disabled={loading} type="submit" className="submit-btn">Send</button>
          </div>
          <div className='stream'>
            stream: <input type='checkbox' checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
          </div>
        </form>
      </footer>
    </>
  );
}
