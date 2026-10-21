import { MemoryRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { useEffect } from 'react';
import notesImage from '../../assets/page images/notes.png';
import recapsImage from '../../assets/page images/slides.png';
import recordingsImage from '../../assets/page images/recordings.png';
import roll20Image from '../../assets/page images/roll20-logo.png';
import discordImage from '../../assets/page images/discord-logo.png';
import './App.css';

const mainPages = [
  { label: 'Notes', path: '/notes', image: notesImage },
  { label: 'Recaps', path: '/recaps', image: recapsImage },
  { label: 'Session Recordings', path: '/session-recordings', image: recordingsImage },
  { label: 'Roll20 Messages', path: '/roll20-messages', image: roll20Image },
  { label: 'Discord Messages', path: '/discord-messages', image: discordImage },
];

function Hello() {
  useEffect(() => {
    document.title = 'DnD Index';
  }, []);

  return (
    <div className="page-container">
      <div className="title-header">DnD Index</div>
      <div className="button-grid">
        {mainPages.map(({ label, path, image }) => (
          <Link
            className="main-button"
            key={label}
            to={path}
            style={{ backgroundImage: `linear-gradient(#0005, #0008), url("${image}")` }}
          >
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function TitlePage({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <main className="page-container">
      <h1 className="title-header">{title}</h1>
    </main>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
        {mainPages.map(({ label, path }) => (
          <Route key={path} path={path} element={<TitlePage title={label} />} />
        ))}
      </Routes>
    </Router>
  );
}
