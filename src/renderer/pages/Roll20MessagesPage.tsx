import { useEffect } from 'react';
import './Roll20MessagesPage.css';

export default function Roll20MessagesPage() {
  useEffect(() => {
    document.title = 'Roll20 Messages';
  }, []);

  return (
    <main className="subpage roll20-messages-page">
      <h1 className="subpage-title">Roll20 Messages</h1>
    </main>
  );
}
