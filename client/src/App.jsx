import React, { useState, useEffect } from 'react'
import Tabs from './components/Tabs.jsx'
import DataDownload from './pages/DataDownload.jsx'
import TeamCompare from './pages/TeamCompare.jsx'
import Rankings from './pages/Rankings.jsx'
import ConferenceRankings from './pages/ConferenceRankings.jsx'
import ThemeToggle from './components/ThemeToggle.jsx'
import { getManifest } from './store/dataState';

export default function App() {
  const [tab, setTab] = useState('rankings')
  const tabs = [
    { key: 'download', title: 'Data Download' },
    { key: 'rankings', title: 'Rankings' },
    { key: 'conf', title: 'Conference Rankings' },
    { key: 'compare', title: 'Compare Teams' },
  ]

  useEffect(() => { getManifest(2025).catch(() => {}) }, [])
  useEffect(() => { getManifest(2025).catch(() => {}) }, [tab])

  return (
    <div className="container" style={{ color: 'var(--text)' }}>
      <header
        className="card"
        style={{
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          border: '1px solid var(--border)',
          marginBottom: 12,
          background: 'var(--card)'
        }}
      >
        <div className="brand" style={{ fontWeight: 700 }}>
          🏈 CFB Computer Rankings
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ThemeToggle />
        </div>
      </header>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'download' && <DataDownload />}
      {tab === 'rankings' && <Rankings />}
      {tab === 'conf' && <ConferenceRankings />}
      {tab === 'compare' && <TeamCompare />}
    </div>
  )
}
