import { useEffect, useRef, useState } from 'react'
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
  const speedBtnRef = useRef<HTMLButtonElement>(null)
  const speedMenuRef = useRef<HTMLDivElement>(null)

  // App.tsx binds ArrowLeft/ArrowRight globally for the same seek, so this has
  // to stop propagation - otherwise one keypress moves the playhead twice.
  function onScrubberKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 5 : 1 / p.fps
    let next: number
    switch (e.key) {
      case 'ArrowLeft': next = p.currentTime - step; break
      case 'ArrowRight': next = p.currentTime + step; break
      case 'Home': next = 0; break
      case 'End': next = p.duration; break
      default: return
    }
    e.preventDefault()
    e.stopPropagation()
    p.onSetCurrentTime(Math.max(0, Math.min(p.duration, next)))
  }

  // The trigger advertises aria-haspopup="menu", so the popup has to behave like
  // one: focus moves in on open, arrow keys cycle the items, and Escape or an
  // outside click closes it and returns focus to the trigger.
  useEffect(() => {
    if (!showSpeedMenu) return
    const items = speedMenuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    items?.[Math.max(0, PLAYBACK_SPEEDS.indexOf(p.playbackSpeed))]?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        // Stop it reaching the panel-level Escape handlers, which would also
        // close menus the user did not mean to dismiss.
        e.stopPropagation()
        setShowSpeedMenu(false)
        speedBtnRef.current?.focus()
      } else if (e.key === 'Tab') {
        // Per the menu pattern Tab dismisses rather than cycling the items;
        // letting the default action run moves focus to the next control.
        setShowSpeedMenu(false)
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      if (speedMenuRef.current?.contains(target) || speedBtnRef.current?.contains(target)) return
      setShowSpeedMenu(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [showSpeedMenu, p.playbackSpeed])

  function onSpeedMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement as HTMLButtonElement)
    let next: number
    switch (e.key) {
      case 'ArrowDown': next = (current + 1) % items.length; break
      case 'ArrowUp': next = (current - 1 + items.length) % items.length; break
      case 'Home': next = 0; break
      case 'End': next = items.length - 1; break
      default: return
    }
    e.preventDefault()
    items[next]?.focus()
  }

  return (
    <div
      className="shrink-0 px-4 py-2"
      style={{ background: 'var(--color-bg-panel)', borderTop: '1px solid var(--color-border)' }}
    >
      {/* Progress bar. The hit area grew vertically only: PreviewPanel's seek
          handler reads currentTarget's bounding rect, so the element must stay
          full width for a click to map to the right time. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={p.duration}
        aria-valuenow={p.currentTime}
        aria-valuetext={formatTime(p.currentTime)}
        className="h-4 mb-1 cursor-pointer relative group flex items-center"
        onClick={p.onSeek}
        onKeyDown={onScrubberKeyDown}
      >
        <div className="w-full h-1 rounded-full relative" style={{ background: 'var(--color-bg-hover)' }}>
          <div
            className="h-full rounded-full"
            style={{ width: `${p.progressPct}%`, background: 'var(--color-primary)' }}
          />
          <div
            className="absolute top-1/2 w-3 h-3 rounded-full opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
            style={{
              left: `${p.progressPct}%`,
              transform: 'translate(-50%, -50%)',
              background: 'var(--color-primary)',
            }}
          />
        </div>
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
              ref={speedBtnRef}
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
                ref={speedMenuRef}
                role="menu"
                aria-label="Playback speed"
                onKeyDown={onSpeedMenuKeyDown}
                className="absolute bottom-9 right-0 rounded overflow-hidden shadow-lg z-50"
                style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}
              >
                {PLAYBACK_SPEEDS.map(s => (
                  <button
                    key={s}
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={p.playbackSpeed === s}
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
