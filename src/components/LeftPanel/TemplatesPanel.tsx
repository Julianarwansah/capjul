import { useState } from 'react'
import { Search, Check } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { AspectRatio, TextClip } from '../../types'

const TEMPLATE_CATEGORIES = ['Semua', 'Travel', 'Food', 'Fashion', 'Sports', 'Wedding', 'Business']

interface TemplateTextLayer {
  text: string
  startTime: number
  duration: number
  x: number
  y: number
  fontSize: number
  fontColor: string
  fontFamily: string
  bold: boolean
  align: 'left' | 'center' | 'right'
  animation?: string
  outAnimation?: string
  strokeColor: string
  strokeWidth: number
  backgroundColor: string
  backgroundOpacity: number
}

interface TemplateDef {
  id: string
  name: string
  category: string
  durationSec: number
  ratio: AspectRatio
  color: string
  textLayers: TemplateTextLayer[]
}

const DEFAULT_TEXT: Omit<TemplateTextLayer, 'text' | 'startTime' | 'duration' | 'x' | 'y' | 'fontSize' | 'fontColor' | 'fontFamily' | 'bold' | 'align'> = {
  animation: 'fadeIn',
  outAnimation: 'fadeOut',
  strokeColor: 'transparent',
  strokeWidth: 0,
  backgroundColor: 'transparent',
  backgroundOpacity: 0,
}

const TEMPLATES: TemplateDef[] = [
  {
    id: 't1', name: 'Cinematic Intro', category: 'Travel', durationSec: 15, ratio: '16:9', color: '#1a1a2e',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'JUDUL UTAMA', startTime: 1, duration: 5, x: 0.5, y: 0.45, fontSize: 96, fontColor: '#ffffff', fontFamily: 'Georgia', bold: true, align: 'center', animation: 'fadeIn', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Subtitle di sini', startTime: 1.5, duration: 4.5, x: 0.5, y: 0.57, fontSize: 36, fontColor: '#cccccc', fontFamily: 'Arial', bold: false, align: 'center', animation: 'slideUp', outAnimation: 'fadeOut' },
    ],
  },
  {
    id: 't2', name: 'Travel Vlog', category: 'Travel', durationSec: 30, ratio: '9:16', color: '#16213e',
    textLayers: [
      { ...DEFAULT_TEXT, text: '📍 Lokasi', startTime: 0.5, duration: 4, x: 0.5, y: 0.12, fontSize: 40, fontColor: '#ffffff', fontFamily: 'Arial', bold: true, align: 'center', animation: 'slideDown', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Nama Kota, Negara', startTime: 0.8, duration: 3.5, x: 0.5, y: 0.19, fontSize: 28, fontColor: '#e0e0e0', fontFamily: 'Arial', bold: false, align: 'center' },
      { ...DEFAULT_TEXT, text: 'Tulis caption di sini...', startTime: 5, duration: 6, x: 0.5, y: 0.88, fontSize: 30, fontColor: '#ffffff', fontFamily: 'Arial', bold: false, align: 'center', backgroundColor: '#000000', backgroundOpacity: 0.5 },
    ],
  },
  {
    id: 't3', name: 'Food Reel', category: 'Food', durationSec: 20, ratio: '9:16', color: '#0f3460',
    textLayers: [
      { ...DEFAULT_TEXT, text: '🍽️ Nama Makanan', startTime: 0.3, duration: 5, x: 0.5, y: 0.82, fontSize: 52, fontColor: '#ffffff', fontFamily: 'Georgia', bold: true, align: 'center', animation: 'pop', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Restoran · Kota', startTime: 0.5, duration: 4.5, x: 0.5, y: 0.9, fontSize: 28, fontColor: '#ffdd99', fontFamily: 'Arial', bold: false, align: 'center' },
    ],
  },
  {
    id: 't4', name: 'Fashion Look', category: 'Fashion', durationSec: 25, ratio: '3:4', color: '#533483',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'OUTFIT OF THE DAY', startTime: 0.5, duration: 6, x: 0.5, y: 0.08, fontSize: 44, fontColor: '#ffffff', fontFamily: 'Arial', bold: true, align: 'center', animation: 'fadeIn' },
      { ...DEFAULT_TEXT, text: '#OOTD', startTime: 1, duration: 5, x: 0.5, y: 0.15, fontSize: 28, fontColor: '#ffaaee', fontFamily: 'Arial', bold: false, align: 'center' },
      { ...DEFAULT_TEXT, text: 'Brand · Item · Harga', startTime: 1, duration: 8, x: 0.1, y: 0.92, fontSize: 26, fontColor: '#ffffff', fontFamily: 'Arial', bold: false, align: 'left' },
    ],
  },
  {
    id: 't5', name: 'Sports Highlights', category: 'Sports', durationSec: 60, ratio: '16:9', color: '#e94560',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'HIGHLIGHTS', startTime: 0.2, duration: 3, x: 0.5, y: 0.5, fontSize: 120, fontColor: '#ffffff', fontFamily: 'Impact', bold: true, align: 'center', animation: 'zoom', outAnimation: 'fadeOut', strokeColor: '#ff0000', strokeWidth: 3 },
      { ...DEFAULT_TEXT, text: 'Tim A vs Tim B', startTime: 0.5, duration: 2.5, x: 0.5, y: 0.65, fontSize: 40, fontColor: '#ffdd00', fontFamily: 'Arial', bold: true, align: 'center' },
    ],
  },
  {
    id: 't6', name: 'Wedding Film', category: 'Wedding', durationSec: 120, ratio: '16:9', color: '#f5a7a7',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'Nama & Nama', startTime: 2, duration: 8, x: 0.5, y: 0.5, fontSize: 80, fontColor: '#ffffff', fontFamily: 'Georgia', bold: false, align: 'center', animation: 'fadeIn', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: '13 Oktober 2026', startTime: 2.5, duration: 7.5, x: 0.5, y: 0.62, fontSize: 32, fontColor: '#ffe0e0', fontFamily: 'Georgia', bold: false, align: 'center' },
    ],
  },
  {
    id: 't7', name: 'Product Ad', category: 'Business', durationSec: 15, ratio: '1:1', color: '#2d6a4f',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'NAMA PRODUK', startTime: 0.5, duration: 5, x: 0.5, y: 0.15, fontSize: 56, fontColor: '#ffffff', fontFamily: 'Arial', bold: true, align: 'center', animation: 'slideDown' },
      { ...DEFAULT_TEXT, text: 'Deskripsi singkat produk', startTime: 1, duration: 4.5, x: 0.5, y: 0.25, fontSize: 28, fontColor: '#ccffcc', fontFamily: 'Arial', bold: false, align: 'center' },
      { ...DEFAULT_TEXT, text: 'Beli Sekarang →', startTime: 8, duration: 5, x: 0.5, y: 0.85, fontSize: 36, fontColor: '#ffffff', fontFamily: 'Arial', bold: true, align: 'center', animation: 'pop', backgroundColor: '#e94560', backgroundOpacity: 0.9 },
    ],
  },
  {
    id: 't8', name: 'Travel Montage', category: 'Travel', durationSec: 45, ratio: '16:9', color: '#1b4332',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'ROAD TRIP 2026', startTime: 1, duration: 6, x: 0.5, y: 0.5, fontSize: 88, fontColor: '#ffffff', fontFamily: 'Impact', bold: true, align: 'center', animation: 'fadeIn', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Kenangan yang tak terlupakan', startTime: 1.5, duration: 5, x: 0.5, y: 0.63, fontSize: 28, fontColor: '#aaffcc', fontFamily: 'Georgia', bold: false, align: 'center', animation: 'slideUp' },
    ],
  },
  {
    id: 't9', name: 'Lyric Video', category: 'Fashion', durationSec: 30, ratio: '9:16', color: '#370617',
    textLayers: [
      { ...DEFAULT_TEXT, text: 'Baris lirik pertama', startTime: 1, duration: 3, x: 0.5, y: 0.48, fontSize: 48, fontColor: '#ffffff', fontFamily: 'Georgia', bold: false, align: 'center', animation: 'fadeIn', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Baris lirik kedua', startTime: 4, duration: 3, x: 0.5, y: 0.48, fontSize: 48, fontColor: '#ffee44', fontFamily: 'Georgia', bold: false, align: 'center', animation: 'fadeIn', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Nama Artis - Judul Lagu', startTime: 0, duration: 30, x: 0.5, y: 0.92, fontSize: 22, fontColor: '#aaaaaa', fontFamily: 'Arial', bold: false, align: 'center' },
    ],
  },
  {
    id: 't10', name: 'Birthday Wish', category: 'Business', durationSec: 15, ratio: '9:16', color: '#4a0e8f',
    textLayers: [
      { ...DEFAULT_TEXT, text: '🎉 Happy Birthday!', startTime: 0.5, duration: 6, x: 0.5, y: 0.35, fontSize: 64, fontColor: '#ffffff', fontFamily: 'Georgia', bold: true, align: 'center', animation: 'bounce', outAnimation: 'fadeOut' },
      { ...DEFAULT_TEXT, text: 'Nama Orang', startTime: 1, duration: 5.5, x: 0.5, y: 0.5, fontSize: 80, fontColor: '#ffdd00', fontFamily: 'Georgia', bold: true, align: 'center', animation: 'pop' },
      { ...DEFAULT_TEXT, text: 'Semoga panjang umur dan bahagia selalu!', startTime: 1.5, duration: 5, x: 0.5, y: 0.65, fontSize: 28, fontColor: '#ffe0ff', fontFamily: 'Arial', bold: false, align: 'center', animation: 'slideUp' },
    ],
  },
]

export function TemplatesPanel() {
  const { addTextClip, addTrack, project, setAspectRatio } = useEditorStore()
  const [activeCategory, setActiveCategory] = useState('Semua')
  const [search, setSearch] = useState('')
  const [applied, setApplied] = useState<string | null>(null)

  const filtered = TEMPLATES.filter(t =>
    (activeCategory === 'Semua' || t.category === activeCategory) &&
    (!search || t.name.toLowerCase().includes(search.toLowerCase()))
  )

  function applyTemplate(template: TemplateDef) {
    setAspectRatio(template.ratio)

    const textTrackId = project.tracks.find(t => t.type === 'text')?.id ?? addTrack('text')

    for (const layer of template.textLayers) {
      const clip: TextClip = {
        id: crypto.randomUUID(),
        trackId: textTrackId,
        startTime: layer.startTime,
        duration: layer.duration,
        text: layer.text,
        fontFamily: layer.fontFamily,
        fontSize: layer.fontSize,
        fontColor: layer.fontColor,
        backgroundColor: layer.backgroundColor,
        backgroundOpacity: layer.backgroundOpacity,
        bold: layer.bold,
        italic: false,
        underline: false,
        align: layer.align,
        x: layer.x,
        y: layer.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        animation: layer.animation,
        outAnimation: layer.outAnimation,
        letterSpacing: 0,
        lineHeight: 1.2,
        strokeColor: layer.strokeColor,
        strokeWidth: layer.strokeWidth,
        shadowColor: 'transparent',
        shadowBlur: 0,
        shadowX: 0,
        shadowY: 0,
        keyframes: [],
      }
      addTextClip(clip)
    }

    setApplied(template.id)
    setTimeout(() => setApplied(null), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="flex items-center gap-2 rounded px-2 h-7" style={{ background: 'var(--color-bg-surface)' }}>
          <Search size={13} style={{ color: 'var(--color-text-muted)' }} />
          <input
            className="flex-1 bg-transparent outline-none text-xs"
            style={{ color: 'var(--color-text-primary)' }}
            placeholder="Cari template..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex overflow-x-auto shrink-0 p-2 gap-1" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {TEMPLATE_CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className="text-xs px-2.5 py-1 rounded whitespace-nowrap"
            style={{
              background: activeCategory === cat ? 'var(--color-primary)' : 'var(--color-bg-surface)',
              color: activeCategory === cat ? 'white' : 'var(--color-text-secondary)',
              border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {filtered.map(t => {
            const isApplied = applied === t.id
            return (
              <button
                key={t.id}
                onClick={() => applyTemplate(t)}
                className="flex flex-col rounded overflow-hidden cursor-pointer text-left"
                style={{
                  background: 'var(--color-bg-surface)',
                  border: isApplied ? '1.5px solid var(--color-primary)' : '1.5px solid transparent',
                  transition: 'transform 0.1s, border-color 0.2s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'}
              >
                <div
                  style={{
                    height: 72, background: t.color, position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {isApplied ? (
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Check size={16} color="white" />
                    </div>
                  ) : (
                    <>
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', position: 'absolute', top: 4, right: 6 }}>{t.ratio}</span>
                      <div style={{ padding: '4px 8px', textAlign: 'center' }}>
                        {t.textLayers.slice(0, 2).map((layer, i) => (
                          <div key={i} style={{
                            color: layer.fontColor,
                            fontFamily: layer.fontFamily,
                            fontSize: Math.min(layer.fontSize / 24, 11),
                            fontWeight: layer.bold ? 700 : 400,
                            lineHeight: 1.3,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 110,
                          }}>
                            {layer.text}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{t.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>{t.durationSec}s · {t.ratio} · {t.textLayers.length} teks</p>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
