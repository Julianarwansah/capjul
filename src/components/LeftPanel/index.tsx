import { useEditorStore } from '../../store/editorStore'
import type { LeftPanelTab } from '../../types'
import { MediaPanel } from './MediaPanel'
import { AudioPanel } from './AudioPanel'
import { TextPanel } from './TextPanel'
import { StickerPanel } from './StickerPanel'
import { EffectsPanel } from './EffectsPanel'
import { FiltersPanel } from './FiltersPanel'
import { TransitionsPanel } from './TransitionsPanel'
import { AIPanel } from './AIPanel'
import { TemplatesPanel } from './TemplatesPanel'
import {
  Film, Music, Type, Smile, Sparkles, Palette,
  GitMerge, Brain, LayoutTemplate
} from 'lucide-react'

const TABS: { id: LeftPanelTab; label: string; icon: React.ReactNode }[] = [
  { id: 'media', label: 'Media', icon: <Film size={18} /> },
  { id: 'audio', label: 'Audio', icon: <Music size={18} /> },
  { id: 'text', label: 'Text', icon: <Type size={18} /> },
  { id: 'stickers', label: 'Stickers', icon: <Smile size={18} /> },
  { id: 'effects', label: 'Effects', icon: <Sparkles size={18} /> },
  { id: 'filters', label: 'Filters', icon: <Palette size={18} /> },
  { id: 'transitions', label: 'Trans.', icon: <GitMerge size={18} /> },
  { id: 'ai', label: 'AI Tools', icon: <Brain size={18} /> },
  { id: 'templates', label: 'Templates', icon: <LayoutTemplate size={18} /> },
]

const PANEL_MAP: Record<LeftPanelTab, React.ReactNode> = {
  media: <MediaPanel />,
  audio: <AudioPanel />,
  text: <TextPanel />,
  stickers: <StickerPanel />,
  effects: <EffectsPanel />,
  filters: <FiltersPanel />,
  transitions: <TransitionsPanel />,
  ai: <AIPanel />,
  templates: <TemplatesPanel />,
}

export function LeftPanel() {
  const { activeLeftTab, setActiveLeftTab } = useEditorStore()

  return (
    <div
      className="flex h-full shrink-0"
      style={{ width: 280, borderRight: '1px solid var(--color-border)' }}
    >
      {/* Icon sidebar */}
      <div
        className="flex flex-col items-center py-2 gap-1 shrink-0"
        style={{
          width: 64,
          background: 'var(--color-bg-panel)',
          borderRight: '1px solid var(--color-border)',
        }}
      >
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveLeftTab(tab.id)}
            className="sidebar-tab"
            aria-current={activeLeftTab === tab.id ? true : undefined}
            title={tab.label}
          >
            <div className="sidebar-tab-indicator" />
            {tab.icon}
            <span style={{ fontSize: 10, fontWeight: activeLeftTab === tab.id ? 600 : 400 }}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Panel content */}
      <div
        className="flex-1 overflow-hidden flex flex-col"
        style={{ background: 'var(--color-bg-elevated)' }}
      >
        {PANEL_MAP[activeLeftTab]}
      </div>
    </div>
  )
}
