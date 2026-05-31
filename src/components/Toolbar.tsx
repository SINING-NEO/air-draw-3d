import type { DrawMode } from '../types/hand'

const COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#fbbf24',
  '#34d399',
  '#f87171',
  '#ffffff',
]

interface ToolbarProps {
  brushColor: string
  brushWidth: number
  drawMode: DrawMode
  strokeCount: number
  trackingSensitivity: number
  rotationSensitivity: number
  zoomSensitivity: number
  onColorChange: (color: string) => void
  onWidthChange: (width: number) => void
  onModeChange: (mode: DrawMode) => void
  onTrackingSensitivityChange: (value: number) => void
  onRotationSensitivityChange: (value: number) => void
  onZoomSensitivityChange: (value: number) => void
  onClear: () => void
  onResetView: () => void
  canClear: boolean
}

export function Toolbar({
  brushColor,
  brushWidth,
  drawMode,
  strokeCount,
  trackingSensitivity,
  rotationSensitivity,
  zoomSensitivity,
  onColorChange,
  onWidthChange,
  onModeChange,
  onTrackingSensitivityChange,
  onRotationSensitivityChange,
  onZoomSensitivityChange,
  onClear,
  onResetView,
  canClear,
}: ToolbarProps) {
  return (
    <aside className="toolbar">
      <div className="toolbar-brand">
        <span className="brand-icon">✦</span>
        <div>
          <h1>Air Draw 3D</h1>
          <p>Draw in the air with your fingertips</p>
        </div>
      </div>

      <section className="toolbar-section">
        <h2>Hand gestures</h2>
        <ul className="gesture-list">
          <li><strong>Look around:</strong> turn your head — the 3D view follows your face</li>
          <li><strong>Pause:</strong> open flat hand — alone or while the other hand draws (stops head look)</li>
          <li><strong>Move:</strong> two hands — spread open palms to walk forward, together to move back</li>
          <li><strong>Draw:</strong> pinch or point — stays locked to your finger while you look around or move</li>
          <li><strong>Mouse / trackpad:</strong> drag to look around, scroll to move forward / back</li>
        </ul>
      </section>

      <section className="toolbar-section">
        <h2>Sensitivity</h2>
        <p className="hint">Stable defaults — raise for faster response, lower for extra smoothness.</p>
        <label className="range-label">
          Draw responsiveness
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={trackingSensitivity}
            onChange={(e) => onTrackingSensitivityChange(Number(e.target.value))}
          />
          <span className="range-value">{trackingSensitivity}/10</span>
        </label>
        <p className="hint">Higher = tighter follow of your fingertip. Lower = smoother but more lag.</p>
        <label className="range-label">
          Hand look (face)
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={rotationSensitivity}
            onChange={(e) => onRotationSensitivityChange(Number(e.target.value))}
          />
          <span className="range-value">{rotationSensitivity}/10</span>
        </label>
        <p className="hint">Open palm pauses head look — including while your other hand draws.</p>
        <label className="range-label">
          Move speed
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={zoomSensitivity}
            onChange={(e) => onZoomSensitivityChange(Number(e.target.value))}
          />
          <span className="range-value">{zoomSensitivity}/10</span>
        </label>
      </section>

      <section className="toolbar-section">
        <h2>Draw mode</h2>
        <div className="mode-toggle">
          <button
            type="button"
            className={drawMode === 'pinch' ? 'active' : ''}
            onClick={() => onModeChange('pinch')}
          >
            Pinch
          </button>
          <button
            type="button"
            className={drawMode === 'point' ? 'active' : ''}
            onClick={() => onModeChange('point')}
          >
            Point finger
          </button>
        </div>
        <p className="hint">
          {drawMode === 'pinch'
            ? 'Pinch thumb & index finger together to draw.'
            : 'Extend your index finger (keep others folded) to draw.'}
        </p>
      </section>

      <section className="toolbar-section">
        <h2>Color</h2>
        <div className="color-grid">
          {COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`color-swatch ${brushColor === color ? 'selected' : ''}`}
              style={{ backgroundColor: color }}
              onClick={() => onColorChange(color)}
              aria-label={`Color ${color}`}
            />
          ))}
        </div>
      </section>

      <section className="toolbar-section">
        <h2>Brush size</h2>
        <input
          type="range"
          min={0.02}
          max={0.15}
          step={0.01}
          value={brushWidth}
          onChange={(e) => onWidthChange(Number(e.target.value))}
        />
        <span className="range-value">{brushWidth.toFixed(2)}</span>
      </section>

      <section className="toolbar-section actions">
        <button
          type="button"
          className="action-btn danger"
          onClick={onClear}
          disabled={!canClear}
        >
          Clear
        </button>
        <button type="button" className="action-btn" onClick={onResetView}>
          Reset
        </button>
      </section>

      <footer className="toolbar-footer">
        <span>{strokeCount} stroke{strokeCount !== 1 ? 's' : ''}</span>
        <span>Mouse + hands work together</span>
      </footer>
    </aside>
  )
}
