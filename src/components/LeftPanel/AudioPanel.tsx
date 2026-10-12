import { useState } from 'react'
import { Music2, Mic, Volume2, Upload, Plus } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AudioClip, MediaFile } from '../../types'

const SOUND_EFFECTS = [
  { name: 'Whoosh', duration: 0.8, icon: '💨' },
  { name: 'Pop', duration: 0.3, icon: '💥' },
  { name: 'Click', duration: 0.1, icon: '👆' },
  { name: 'Ding', duration: 0.5, icon: '🔔' },
  { name: 'Swoosh', duration: 0.6, icon: '🌬️' },
  { name: 'Transition', duration: 1.2, icon: '🎵' },
  { name: 'Applause', duration: 3.0, icon: '👏' },
  { name: 'Laughing', duration: 2.5, icon: '😄' },
]

const MUSIC_MOODS = ['Upbeat', 'Calm', 'Dramatic', 'Happy', 'Sad', 'Energetic', 'Romantic', 'Epic']

export function AudioPanel() {
  const { addMedia, addAudioClip, currentTime, project } = useEditorStore()
  const [activeTab, setActiveTab] = useState<'music' | 'effects' | 'voiceover'>('music')

  async function importAudio() {
    const paths = await window.electronAPI?.openMedia() ?? []
    for (const p of paths) {
      const ext = p.split('.').pop()?.toLowerCase() ?? ''
      if (!['mp3', 'wav', 'aac', 'm4a', 'flac'].includes(ext)) continue
      const name = p.split('/').pop() ?? p
      const mediaFile: MediaFile = { id: crypto.randomUUID(), path: p, name, type: 'audio', duration: 0, size: 0 }
      addMedia([mediaFile])
      const audioTrack = project.tracks.find(t => t.type === 'audio') ?? { id: 'main-audio' }
      const clip: AudioClip = {
        id: crypto.randomUUID(), trackId: audioTrack.id, mediaId: mediaFile.id,
        startTime: currentTime, duration: 30, mediaStart: 0, mediaEnd: 30,
        volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0,
      }
      addAudioClip(clip)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(['music', 'effects', 'voiceover'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="flex-1 py-2.5 text-xs capitalize"
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              color: activeTab === t ? 'var(--color-primary)' : 'var(--color-text-secondary)',
              borderBottom: activeTab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              fontWeight: activeTab === t ? 600 : 400,
            }}
          >
            {t === 'voiceover' ? 'Voice' : t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === 'music' && (
          <div className="p-3 flex flex-col gap-3">
            <button
              onClick={importAudio}
              className="w-full flex items-center justify-center gap-2 h-9 rounded text-sm"
              style={{ background: 'rgba(255,71,87,0.12)', color: 'var(--color-primary)', border: '1px dashed var(--color-primary)', cursor: 'pointer' }}
            >
              <Upload size={14} /> Import Audio
            </button>

            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Moods</p>
            <div className="flex flex-wrap gap-1.5">
              {MUSIC_MOODS.map(m => (
                <button key={m} className="text-xs px-2.5 py-1 rounded"
                  style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}>
                  {m}
                </button>
              ))}
            </div>

            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Recommended</p>
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--color-bg-surface)' }}>
                <div className="w-10 h-10 rounded flex items-center justify-center shrink-0"
                  style={{ background: `hsl(${i * 60},60%,30%)` }}>
                  <Music2 size={16} style={{ color: 'white' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>Music Track {i}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Upbeat · 2:30</p>
                </div>
                <button className="w-7 h-7 rounded flex items-center justify-center"
                  style={{ background: 'var(--color-primary)', border: 'none', cursor: 'pointer' }}>
                  <Plus size={12} style={{ color: 'white' }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'effects' && (
          <div className="p-3 flex flex-col gap-2">
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--color-text-secondary)' }}>Sound Effects</p>
            {SOUND_EFFECTS.map(fx => (
              <button
                key={fx.name}
                className="flex items-center gap-3 p-2 rounded w-full text-left"
                style={{ background: 'var(--color-bg-surface)', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)'}
              >
                <span className="text-xl">{fx.icon}</span>
                <div className="flex-1">
                  <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{fx.name}</p>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{fx.duration}s</p>
                </div>
                <Volume2 size={13} style={{ color: 'var(--color-text-muted)' }} />
              </button>
            ))}
          </div>
        )}

        {activeTab === 'voiceover' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,71,87,0.12)', border: '2px dashed var(--color-primary)' }}>
              <Mic size={32} style={{ color: 'var(--color-primary)' }} />
            </div>
            <p className="text-sm text-center" style={{ color: 'var(--color-text-secondary)' }}>
              Click to start recording your voiceover
            </p>
            <button className="btn-primary px-8">
              Start Recording
            </button>
            <div className="w-full mt-4">
              <p className="text-xs mb-2" style={{ color: 'var(--color-text-secondary)' }}>Voice Settings</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Noise Reduction</span>
                  <input type="checkbox" defaultChecked />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Auto Level</span>
                  <input type="checkbox" defaultChecked />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
