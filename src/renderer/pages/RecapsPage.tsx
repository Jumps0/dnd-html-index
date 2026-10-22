import { useEffect } from 'react';
import './RecapsPage.css';

export default function RecapsPage() {
  useEffect(() => {
    document.title = 'Recaps';
  }, []);

  return (
    <main className="subpage recaps-page">
      <h1 className="subpage-title">Recaps</h1>
    </main>
  );
}
