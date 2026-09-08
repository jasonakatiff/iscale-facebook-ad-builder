import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '../context/ThemeContext';
import { ToastProvider } from '../context/ToastContext';
import { WorkflowPrototype } from './WorkflowPrototype';
import '../index.css';
import './prototype.css';

createRoot(document.getElementById('root')).render(
  <ThemeProvider><ToastProvider><WorkflowPrototype /></ToastProvider></ThemeProvider>,
);
