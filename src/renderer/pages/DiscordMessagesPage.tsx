import { useEffect } from 'react';
import './DiscordMessagesPage.css';

export default function DiscordMessagesPage() {
  useEffect(() => {
    document.title = 'Discord Messages';
  }, []);

  return (
    <main className="subpage discord-messages-page">
      <h1 className="subpage-title">Discord Messages</h1>
    </main>
  );
}
