import React from 'react'
import ReactDOM from 'react-dom/client'
import KanbanAdvancedApp from './KanbanAdvancedApp'
import './style.css'

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <KanbanAdvancedApp />
  </React.StrictMode>,
)
