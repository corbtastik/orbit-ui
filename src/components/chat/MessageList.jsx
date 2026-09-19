import React from 'react';
import Message from './Message.jsx';

export default function MessageList({ messages }) {
  return (
    <div className="chat__messages">
      {messages.map((m) => (
        <Message key={m.id} message={m} />
      ))}
    </div>
  );
}
