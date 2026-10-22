import { useEffect } from 'react';
import './SessionRecordingsPage.css';

export default function SessionRecordingsPage() {
  useEffect(() => {
    document.title = 'Session Recordings';
  }, []);

  return (
    <main className="subpage session-recordings-page">
      <h1 className="subpage-title">Session Recordings</h1>
    </main>
  );
}
