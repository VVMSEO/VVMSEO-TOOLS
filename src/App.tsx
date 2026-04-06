import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import SeoAssistant from './pages/SeoAssistant';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/seo-assistant" element={<SeoAssistant />} />
      </Routes>
    </HashRouter>
  );
}
