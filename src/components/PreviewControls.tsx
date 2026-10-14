import { useState } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize2, Minimize2, ChevronLeft, ChevronRight,
} from 'lucide-react'

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

function formatTime(s: number) {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 100)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`
}

function CtrlBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button
      title={title}
      aria-label={title}
      onClick={onClick}
      className="w-8 h-8 rounded flex items-center justify-center"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
    >
      {icon}
    </button>
  )
}

export interface PreviewControlsProps {
  currentTime: number
  duration: number
  fps: number
  isPlaying: boolean
  playbackSpeed: number
  progressPct: number
  volume: number
  muted: boolean
  isFullscreen: boolean
  onSeek: (e: React.MouseEvent<HTMLDivElement>) => void
  onPlayPause: () => void
  onSetCurrentTime: (t: number) => void
  onSetPlaybackSpeed: (s: number) => void
  onToggleMuted: () => void
  onVolume: (v: number) => void
  onToggleFullscreen: () => void
}

export function PreviewControls(p: PreviewControlsProps) {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)

  return (
    <div
      className="shrink-0 px-4 py-2"
      style={{ background: 'var(--color-bg-panel)', borderTop: '1px solid var(--color-border)' }}
    >
      {/* Progress bar */}
      <div
        className="h-1 rounded-full mb-3 cursor-pointer relative group"
        style={{ background: 'var(--color-bg-hover)' }}
        onClick={p.onSeek}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${p.progressPct}%`, background: 'var(--color-primary)' }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          style={{
            left: `${p.progressPct}%`,
            transform: 'translate(-50%, -50%)',
            background: 'var(--color-primary)',
          }}
        />
      </div>

      {/* Playback controls */}
      <div className="flex items-center gap-3">
        {/* Time */}
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-secondary)', minWidth: 80 }}>
          {formatTime(p.currentTime)}
        </span>

        {/* Main controls */}
        <div className="flex items-center gap-1 mx-auto">
          <CtrlBtn icon={<SkipBack size={16} />} onClick={() => p.onSetCurrentTime(0)} title="Go to start" />
          <CtrlBtn icon={<ChevronLeft size={16} />} onClick={() => p.onSetCurrentTime(Math.max(0, p.currentTime - 1 / p.fps))} title="Previous frame" />
          <button
            onClick={p.onPlayPause}
            title={p.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={p.isPlaying ? 'Pause' : 'Play'}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: 'var(--color-primary)', color: 'white', border: 'none', cursor: 'pointer' }}
          >
            {p.isPlaying ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <CtrlBtn icon={<ChevronRight size={16} />} onClick={() => p.onSetCurrentTime(Math.min(p.duration, p.currentTime + 1 / p.fps))} title="Next frame" />
          <CtrlBtn icon={<SkipForward size={16} />} onClick={() => p.onSetCurrentTime(p.duration)} title="Go to end" />
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 ml-auto">
          {/* Speed */}
          <div className="relative">
            <button
              className="text-xs px-2 h-7 rounded"
              style={{ background: 'var(--color-bg-surface)', color: 'var(--color-text-secondary)', border: 'none', cursor: 'pointer' }}
              onClick={() => setShowSpeedMenu(v => !v)}
              aria-label="Playback speed"
              aria-haspopup="menu"
              aria-expanded={showSpeedMenu}
            >
              {p.playbackSpeed}x
            </button>
            {showSpeedMenu && (
              <div
                role="menu"
                className="absolute bottom-9 right-0 rounded overflow-hidden shadow-lg z-50"
                style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
              >
                {PLAYBACK_SPEEDS.map(s => (
                  <button
                    key={s}
                    role="menuitem"
                    onClick={() => { p.onSetPlaybackSpeed(s); setShowSpeedMenu(false) }}
                    className="block w-full px-4 py-1.5 text-xs text-left"
                    style={{
                      background: p.playbackSpeed === s ? 'var(--color-primary)' : 'transparent',
                      color: p.playbackSpeed === s ? 'white' : 'var(--color-text-secondary)',
                      border: 'none', cursor: 'pointer',
                    }}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume */}
          <button
            onClick={p.onToggleMuted}
            title={p.muted ? 'Unmute' : 'Mute'}
            aria-label={p.muted ? 'Unmute' : 'Mute'}
            aria-pressed={p.muted}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
          >
            {p.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
          <input
            type="range" min={0} max={1} step={0.01}
            value={p.muted ? 0 : p.volume}
            onChange={e => p.onVolume(+e.target.value)}
            aria-label="Volume"
            style={{ width: 64 }}
          />

          {/* Duration */}
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)', minWidth: 60 }}>
            / {formatTime(p.duration)}
          </span>

          <CtrlBtn
            icon={p.isFullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            onClick={p.onToggleFullscreen}
            title={p.isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          />
        </div>
      </div>
    </div>
  )
}
