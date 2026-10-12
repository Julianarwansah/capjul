// AI features derived from REA analysis of CapCut:
// Models found: mattingmodel, facebeautifymodel, humanparsingmodel, object_tracking,
// SceneEditDetection, interpolation, noise_reduction, deflicker, digital_human,
// tt_gendergan, mangamodel, oilpaintbrush, foodcomicsmodel, jypc_yunfuhua (style transfer)
import { Brain, Wand2, User, Scissors, Zap, Eye, Mic, Type } from 'lucide-react'

const AI_FEATURES = [
  {
    category: 'Background',
    items: [
      { id: 'bg-remove', name: 'Remove Background', desc: 'AI matting (mattingmodel)', icon: <Scissors size={20} />, color: '#ff4757' },
      { id: 'bg-blur', name: 'Blur Background', desc: 'Portrait mode effect', icon: <Eye size={20} />, color: '#4a9eff' },
      { id: 'bg-replace', name: 'Replace Background', desc: 'Chroma key alternative', icon: <Wand2 size={20} />, color: '#4ade80' },
    ]
  },
  {
    category: 'Face & Body',
    items: [
      { id: 'face-beauty', name: 'Face Beautify', desc: 'Smooth skin, enhance features', icon: <User size={20} />, color: '#f59e0b' },
      { id: 'face-reshape', name: 'Face Reshape', desc: 'Slim face, enlarge eyes', icon: <User size={20} />, color: '#a78bfa' },
      { id: 'body-slim', name: 'Body Slim', desc: 'Reshape body proportions', icon: <User size={20} />, color: '#f472b6' },
    ]
  },
  {
    category: 'Smart Edit',
    items: [
      { id: 'scene-detect', name: 'Scene Detection', desc: 'Auto-cut at scene changes', icon: <Zap size={20} />, color: '#ff4757' },
      { id: 'smart-crop', name: 'Smart Crop', desc: 'Auto-follow subject', icon: <Scissors size={20} />, color: '#4a9eff' },
      { id: 'interpolate', name: 'Frame Interpolation', desc: 'Smooth slow motion (umvfi)', icon: <Zap size={20} />, color: '#4ade80' },
      { id: 'stabilize', name: 'Stabilization', desc: 'Remove camera shake', icon: <Eye size={20} />, color: '#f59e0b' },
      { id: 'deflicker', name: 'Deflicker', desc: 'Remove flickering', icon: <Zap size={20} />, color: '#a78bfa' },
    ]
  },
  {
    category: 'AI Style',
    items: [
      { id: 'anime', name: 'Anime Style', desc: 'Turn video to anime', icon: <Wand2 size={20} />, color: '#f59e0b' },
      { id: 'manga', name: 'Manga', desc: 'Black & white comic style', icon: <Wand2 size={20} />, color: '#4a9eff' },
      { id: 'oil-paint', name: 'Oil Painting', desc: 'Artistic oil paint style', icon: <Wand2 size={20} />, color: '#f472b6' },
      { id: 'cartoon', name: 'Cartoon', desc: 'Cartoon / illustration style', icon: <Wand2 size={20} />, color: '#4ade80' },
    ]
  },
  {
    category: 'Audio AI',
    items: [
      { id: 'noise-reduce', name: 'Noise Reduction', desc: 'Remove background noise (rnnoise)', icon: <Mic size={20} />, color: '#ff4757' },
      { id: 'auto-caption', name: 'Auto Captions', desc: 'Speech to text (samicore)', icon: <Type size={20} />, color: '#4a9eff' },
      { id: 'tts', name: 'Text to Speech', desc: 'AI voice generation', icon: <Mic size={20} />, color: '#4ade80' },
      { id: 'vocal-remove', name: 'Vocal Removal', desc: 'Separate vocals from music', icon: <Mic size={20} />, color: '#f59e0b' },
    ]
  },
]

export function AIPanel() {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="p-3 flex items-center gap-2 shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <Brain size={16} style={{ color: 'var(--color-primary)' }} />
        <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>AI Tools</span>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-primary)', color: 'white' }}>Beta</span>
      </div>

      {/* Feature groups */}
      <div className="p-3 flex flex-col gap-4">
        {AI_FEATURES.map(group => (
          <div key={group.category}>
            <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-secondary)' }}>
              {group.category}
            </p>
            <div className="flex flex-col gap-1.5">
              {group.items.map(item => (
                <button
                  key={item.id}
                  className="flex items-center gap-3 p-2.5 rounded text-left w-full transition-all"
                  style={{ background: 'var(--color-bg-surface)', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-hover)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--color-bg-surface)'}
                >
                  <div
                    className="w-9 h-9 rounded flex items-center justify-center shrink-0"
                    style={{ background: `${item.color}22`, color: item.color }}
                  >
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{item.name}</p>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', fontSize: 10 }}>{item.desc}</p>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--color-bg-hover)', color: 'var(--color-text-muted)' }}>
                    Apply
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
