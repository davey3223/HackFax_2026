import React, { useState } from 'react';
import axios from 'axios';
import { Search, Volume2, BookOpen } from 'lucide-react';
import './App.css';

function App() {
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    setLoading(true);
    const res = await axios.post('http://localhost:5000/api/search', { query });
    setBooks(res.data);
    setLoading(false);
  };

  const playDescription = async (text) => {
    const response = await axios.post('http://localhost:5000/api/speak', 
      { text }, { responseType: 'blob' }
    );
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const audio = new Audio(url);
    audio.play();
  };

  return (
    <div className="container">
      <header className="hero">
        <BookOpen size={40} color="white" />
        <h1>ShelfSense</h1>
        <p>Tell me what you want to read!</p>
        <div className="search-bar">
          <input 
            type="text" 
            placeholder="I want a story about space and cats..." 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button onClick={handleSearch} disabled={loading}>
            {loading ? "Thinking..." : <Search />}
          </button>
        </div>
      </header>

      <div className="results-grid">
        {books.map(book => (
          <div key={book._id} className="card">
            <img src={book.cover} alt={book.title} />
            <div className="card-content">
              <h3>{book.title}</h3>
              <button className="audio-btn" onClick={() => playDescription(book.description)}>
                <Volume2 size={16} /> Listen
              </button>
              <p>{book.description.substring(0, 100)}...</p>
              <button className="borrow-btn">Request Book</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;