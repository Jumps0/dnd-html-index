import {
  MemoryRouter as Router,
  Routes,
  Route,
  Link,
  useNavigate,
} from 'react-router-dom';
import { useEffect } from 'react';

import NotesPage from './pages/NotesPage';
import RecapsPage from './pages/RecapsPage';
import SessionRecordingsPage from './pages/SessionRecordingsPage';
import Roll20MessagesPage from './pages/Roll20MessagesPage';
import DiscordMessagesPage from './pages/DiscordMessagesPage';

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

function NavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.electron?.ipcRenderer.on('navigate-to', (path) => {
      if (typeof path === 'string') {
        navigate(path);
      }
    });

    const handleMouseNavigation = (event: MouseEvent) => {
      if (event.button === 3) {
        event.preventDefault();
        navigate(-1);
      } else if (event.button === 4) {
        event.preventDefault();
        navigate(1);
      }
    };

    window.addEventListener('mousedown', handleMouseNavigation, true);

    return () => {
      unsubscribe?.();
      window.removeEventListener('mousedown', handleMouseNavigation, true);
    };
  }, [navigate]);

  return null;
}

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

export default function App() {
  return (
    <Router>
      <NavigationBridge />
      <Routes>
        <Route path="/" element={<Hello />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/recaps" element={<RecapsPage />} />
        <Route path="/session-recordings" element={<SessionRecordingsPage />} />
        <Route path="/roll20-messages" element={<Roll20MessagesPage />} />
        <Route path="/discord-messages" element={<DiscordMessagesPage />} />
      </Routes>
    </Router>
  );
}
