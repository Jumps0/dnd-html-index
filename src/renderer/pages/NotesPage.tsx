import { useEffect } from 'react';
import './NotesPage.css';

export default function NotesPage() {
  useEffect(() => {
    document.title = 'Notes';
  }, []);

  return (
    <main className="subpage notes-page">
      <h1 className="subpage-title">Notes</h1>
    </main>
  );
}
