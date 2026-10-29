import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import App from './routes/App.jsx';import{ThemeProvider}from './contexts/ThemeContext.jsx';import{AuthProvider}from './contexts/AuthContext.jsx';import './styles.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><ThemeProvider><AuthProvider><BrowserRouter><App/></BrowserRouter></AuthProvider></ThemeProvider></React.StrictMode>);

