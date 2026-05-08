'use client'

import { useEffect, useState } from 'react'
import { myChannels, type Channel } from '@/lib/api'

interface Props {
  value:    string  // domain (or '' for all)
  onChange: (domain: string) => void
}

export default function ChannelSelector({ value, onChange }: Props) {
  const [channels, setChannels] = useState<Channel[]>([])

  useEffect(() => {
    myChannels().then(setChannels).catch(() => setChannels([]))
  }, [])

  return (
    <select className="inp"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={{
        minWidth: 160, fontSize: 13,
        background: '#fff',
      }}>
      <option value="">전체 채널</option>
      {channels.map(c => (
        <option key={c.id} value={c.domain}>{c.name} ({c.domain})</option>
      ))}
    </select>
  )
}
