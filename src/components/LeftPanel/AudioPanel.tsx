import { useRef, useState } from 'react'
import { Mic, Upload, Square } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AudioClip, MediaFile } from '../../types'

export function AudioPanel() {
  const { addMedia, addAudioClip, currentTime, project, addTrack } = useEditorStore()
  const [activeTab, setActiveTab] = useState<'music' | 'voiceover'>('music')
  const [recording, setRecording] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        if (timerRef.current) clearInterval(timerRef.current)
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const arrayBuffer = await blob.arrayBuffer()
        const result = await window.electronAPI?.saveRecording?.(arrayBuffer)
        if (result?.ok) {
          const name = result.value.split('/').pop() ?? 'voiceover.webm'
          const mediaFile: MediaFile = { id: crypto.randomUUID(), path: result.value, name, type: 'audio', duration: recordingTime, size: blob.size }
          addMedia([mediaFile])
          const trackId = project.tracks.find(t => t.type === 'audio')?.id ?? addTrack('audio')
          const clip: AudioClip = {
            id: crypto.randomUUID(), trackId, mediaId: mediaFile.id,
            startTime: currentTime, duration: recordingTime, mediaStart: 0, mediaEnd: recordingTime,
            volume: 1, muted: false, fadein: 0, fadeout: 0, speed: 1, pitch: 0, keyframes: [],
          }
          addAudioClip(clip)
        }
        setRecordingTime(0)
        setRecording(false)
      }
      recorder.start()
      mediaRecorderRef.current = recorder
      setRecording(true)
      setRecordingTime(0)
      timerRef.current = setInterval(() => setRecordingTime(t => t + 0.1), 100)
    } catch {
      alert('Tidak bisa mengakses mikrofon.')
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop()
  }

  async function importAudio() {
    const opened = await window.electronAPI?.openMedia()
    const paths = opened?.ok ? opened.value : []
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
        keyframes: [],
      }
      addAudioClip(clip)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {(['music', 'voiceover'] as const).map(t => (
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
          </div>
        )}

        {activeTab === 'voiceover' && (
          <div className="p-6 flex flex-col items-center gap-4">
            <button
              onClick={recording ? stopRecording : startRecording}
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: recording ? 'rgba(255,71,87,0.25)' : 'rgba(255,71,87,0.12)',
                border: `2px ${recording ? 'solid' : 'dashed'} var(--color-primary)`,
                cursor: 'pointer',
                animation: recording ? 'pulse 1s infinite' : 'none',
              }}
            >
              {recording ? <Square size={28} style={{ color: 'var(--color-primary)' }} /> : <Mic size={32} style={{ color: 'var(--color-primary)' }} />}
            </button>

            {recording && (
              <div className="flex items-center gap-2">
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', animation: 'pulse 1s infinite' }} />
                <span className="text-sm font-mono" style={{ color: 'var(--color-primary)' }}>
                  {Math.floor(recordingTime / 60)}:{String(Math.floor(recordingTime % 60)).padStart(2, '0')}.{String(Math.floor((recordingTime * 10) % 10))}
                </span>
              </div>
            )}

            <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
              {recording ? 'Klik untuk berhenti merekam' : 'Klik untuk mulai merekam voiceover'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
