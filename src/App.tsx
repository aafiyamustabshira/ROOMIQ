import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import './App.css'

type Design = {
  id: number
  name: string
  room_type: string
  interior_style: string
  color_palette: string
  furniture_plan: string
  budget_inr: number
  notes: string
  original_image_path?: string
  redesign_image_path?: string
  status?: string
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

type DashboardStats = {
  totalProjects: number
  activeBudget: number
  avgBudget: number
  recentCount: number
}

type FurnitureType =
  | 'Bed'
  | 'Wardrobe'
  | 'Sofa'
  | 'Curtain'
  | 'Dining Table'
  | 'Chair'
  | 'Lighting'
  | 'Storage'
  | 'Decoration'

type FurniturePlacement = {
  id: string
  type: FurnitureType
  label: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  color: string
}

type DragState = {
  id: string
  mode: 'move' | 'resize'
  startX: number
  startY: number
  originX: number
  originY: number
  startWidth: number
  startHeight: number
}

const navItems = ['Dashboard', 'Studio', 'Gallery', 'Planner'] as const
const roomTypeOptions = ['Living Room', 'Bedroom', 'Dining Room', 'Home Office', 'Kitchen']

const initialForm = {
  name: 'Cedar Living Refresh',
  room_type: 'Living Room',
  interior_style: 'Warm Minimal',
  color_palette: 'Ivory, walnut, sage',
  furniture_plan: 'Sofa, rug, media console, accent chairs',
  budget_inr: 185000,
  notes: 'Keep the architecture intact and soften the room with warm textures and sculptural lighting.',
}

const furnitureCatalog: Array<{ type: FurnitureType; label: string; color: string; defaultWidth: number; defaultHeight: number }> = [
  { type: 'Bed', label: 'Bed', color: '#d9c3a1', defaultWidth: 36, defaultHeight: 28 },
  { type: 'Wardrobe', label: 'Wardrobe', color: '#b7c2c8', defaultWidth: 24, defaultHeight: 20 },
  { type: 'Sofa', label: 'Sofa', color: '#b88d6c', defaultWidth: 32, defaultHeight: 22 },
  { type: 'Curtain', label: 'Curtain', color: '#dfe7f2', defaultWidth: 24, defaultHeight: 18 },
  { type: 'Dining Table', label: 'Dining Table', color: '#d7b58e', defaultWidth: 26, defaultHeight: 20 },
  { type: 'Chair', label: 'Chair', color: '#9ea6a5', defaultWidth: 14, defaultHeight: 14 },
  { type: 'Lighting', label: 'Lighting', color: '#efd69d', defaultWidth: 12, defaultHeight: 12 },
  { type: 'Storage', label: 'Storage', color: '#afb7ab', defaultWidth: 20, defaultHeight: 18 },
  { type: 'Decoration', label: 'Decoration', color: '#c8b6d4', defaultWidth: 12, defaultHeight: 12 },
]

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const getImageUrl = (path?: string) => {
  if (!path) return ''
  if (path.startsWith('http') || path.startsWith('/')) return path
  return `/api/images/${path.split('/').pop()}`
}

const buildFurnitureItem = (type: FurnitureType): FurniturePlacement => {
  const template = furnitureCatalog.find((item) => item.type === type) ?? furnitureCatalog[0]
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type,
    label: template.label,
    x: 52,
    y: 58,
    width: template.defaultWidth,
    height: template.defaultHeight,
    rotation: 0,
    color: template.color,
  }
}

const roomBudgetSuggestions: Record<string, Array<{ name: string; tone: string; ratio: number }>> = {
  'Living Room': [
    { name: 'Statement sofa', tone: 'Core investment', ratio: 0.34 },
    { name: 'Layered lighting', tone: 'Ambience', ratio: 0.2 },
    { name: 'Textile styling', tone: 'Texture', ratio: 0.18 },
    { name: 'Accent décor', tone: 'Finishing', ratio: 0.13 },
  ],
  Bedroom: [
    { name: 'Bed frame', tone: 'Primary piece', ratio: 0.37 },
    { name: 'Wardrobe', tone: 'Storage', ratio: 0.2 },
    { name: 'Curtains', tone: 'Softening', ratio: 0.16 },
    { name: 'Bedside lighting', tone: 'Mood', ratio: 0.12 },
  ],
  'Dining Room': [
    { name: 'Dining set', tone: 'Centerpiece', ratio: 0.3 },
    { name: 'Pendant lights', tone: 'Lighting', ratio: 0.18 },
    { name: 'Display storage', tone: 'Utility', ratio: 0.15 },
    { name: 'Textile layer', tone: 'Warmth', ratio: 0.12 },
  ],
  default: [
    { name: 'Primary furniture', tone: 'Core investment', ratio: 0.3 },
    { name: 'Storage', tone: 'Utility', ratio: 0.18 },
    { name: 'Lighting', tone: 'Atmosphere', ratio: 0.16 },
    { name: 'Décor', tone: 'Finishing', ratio: 0.14 },
  ],
}

function App() {
  const [activeView, setActiveView] = useState<(typeof navItems)[number]>('Studio')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [designs, setDesigns] = useState<Design[]>([])
  const [selectedDesignId, setSelectedDesignId] = useState<number | null>(null)
  const [form, setForm] = useState(initialForm)
  const [uploadedImageUrl, setUploadedImageUrl] = useState('')
  const [uploadedImagePath, setUploadedImagePath] = useState('')
  const [generatedImageUrl, setGeneratedImageUrl] = useState('')
  const [compareValue, setCompareValue] = useState(58)
  const [searchTerm, setSearchTerm] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [notice, setNotice] = useState('Studio ready for a new room concept.')
  const [generationState, setGenerationState] = useState<{ status: string; message: string; engine: string } | null>(null)
  const [furnitureItems, setFurnitureItems] = useState<FurniturePlacement[]>([])
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [undoStack, setUndoStack] = useState<FurniturePlacement[][]>([])

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const stats: DashboardStats = useMemo(() => {
    const totalProjects = designs.length
    const activeBudget = designs.reduce((sum, design) => sum + (design.budget_inr || 0), 0)
    const avgBudget = totalProjects ? Math.round(activeBudget / totalProjects) : 0
    const recentCount = Math.min(designs.length, 3)

    return { totalProjects, activeBudget, avgBudget, recentCount }
  }, [designs])

  const filteredDesigns = useMemo(
    () =>
      designs.filter((design) => {
        const text = `${design.name} ${design.room_type} ${design.interior_style}`.toLowerCase()
        return text.includes(searchTerm.toLowerCase())
      }),
    [designs, searchTerm],
  )

  const selectedDesign = useMemo(
    () => designs.find((design) => design.id === selectedDesignId) ?? designs[0] ?? null,
    [designs, selectedDesignId],
  )

  const selectedFurniture = useMemo(
    () => furnitureItems.find((item) => item.id === selectedFurnitureId) ?? null,
    [furnitureItems, selectedFurnitureId],
  )

  const recommendations = useMemo(() => {
    const items = roomBudgetSuggestions[form.room_type] ?? roomBudgetSuggestions.default
    return items.map((item) => ({ ...item, amount: Math.round(form.budget_inr * item.ratio) }))
  }, [form.budget_inr, form.room_type])

  const budgetTotal = recommendations.reduce((sum, item) => sum + item.amount, 0)

  const applyDesignSnapshot = (design: Design) => {
    setSelectedDesignId(design.id)
    setForm({
      name: design.name,
      room_type: design.room_type || 'Living Room',
      interior_style: design.interior_style || 'Warm Minimal',
      color_palette: design.color_palette || 'Ivory, walnut, sage',
      furniture_plan: design.furniture_plan || 'Sofa, rug, media console, accent chairs',
      budget_inr: design.budget_inr || 0,
      notes: design.notes || '',
    })

    const storedFurniture = Array.isArray(design.metadata?.furniture)
      ? (design.metadata?.furniture as FurniturePlacement[])
      : []
    setFurnitureItems(storedFurniture)
    setSelectedFurnitureId(storedFurniture[0]?.id ?? null)

    if (design.original_image_path) {
      setUploadedImageUrl(getImageUrl(design.original_image_path))
      setUploadedImagePath(design.original_image_path)
    } else {
      setUploadedImageUrl('')
      setUploadedImagePath('')
    }
  }

  useEffect(() => {
    const loadDesigns = async () => {
      try {
        const response = await fetch('/api/designs')
        const payload = await response.json()
        const nextDesigns = payload.designs || []
        setDesigns(nextDesigns)
        if (nextDesigns[0]) {
          applyDesignSnapshot(nextDesigns[0])
        }
      } catch {
        setNotice('Unable to load saved designs yet—backend services may still be starting up.')
      }
    }

    const loadGeneration = async () => {
      try {
        const response = await fetch('/api/health')
        const payload = await response.json()
        const generation = payload.generated_capability
        setGenerationState({
          status: generation?.status ?? 'unavailable',
          message: generation?.message ?? 'Local AI generation is unavailable on this machine.',
          engine: generation?.engine ?? 'none',
        })
      } catch {
        setGenerationState({ status: 'unavailable', message: 'Health check failed.', engine: 'none' })
      }
    }

    void loadDesigns()
    void loadGeneration()
  }, [])

  useEffect(() => {
    if (!dragState) return undefined

    const handlePointerMove = (event: PointerEvent) => {
      const stageRect = stageRef.current?.getBoundingClientRect()
      if (!stageRect) return

      const deltaX = ((event.clientX - dragState.startX) / stageRect.width) * 100
      const deltaY = ((event.clientY - dragState.startY) / stageRect.height) * 100

      setFurnitureItems((current) =>
        current.map((item) => {
          if (item.id !== dragState.id) return item

          if (dragState.mode === 'move') {
            return {
              ...item,
              x: clamp(dragState.originX + deltaX, 10, 90),
              y: clamp(dragState.originY + deltaY, 12, 88),
            }
          }

          const nextWidth = clamp(dragState.startWidth + deltaX, 10, 62)
          const nextHeight = clamp(dragState.startHeight + deltaY, 10, 62)
          return { ...item, width: nextWidth, height: nextHeight }
        }),
      )
    }

    const handlePointerUp = () => setDragState(null)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState])

  const handleFieldChange = (field: keyof typeof initialForm, value: string | number) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const openUpload = () => fileInputRef.current?.click()

  const uploadImage = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = new Set(['png', 'jpg', 'jpeg', 'webp'])
    if (!allowed.has(extension) || !file.type.startsWith('image/')) {
      setNotice('Only JPG, JPEG, PNG, and WEBP images are supported.')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      setNotice('The uploaded image is too large. Please keep it under 12 MB.')
      return
    }

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/designs/upload', {
        method: 'POST',
        body: formData,
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'Upload failed.')

      setUploadedImageUrl(payload.url)
      setUploadedImagePath(payload.path)
      setNotice(`Uploaded ${file.name}. Ready for redesign review.`)
      setForm((current) => ({ ...current, name: `${current.room_type || 'Living Room'} Concept` }))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Image upload failed.')
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    await uploadImage(file)
    event.target.value = ''
  }

  const saveDesign = async () => {
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        original_image_path: uploadedImagePath || undefined,
        metadata: {
          furniture: furnitureItems,
          compareValue,
          activeView,
          uploadedImageUrl,
        },
      }

      const response = await fetch('/api/designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const design = await response.json()
      if (!response.ok) throw new Error(design.detail || 'Unable to save design.')

      setDesigns((current) => [design, ...current])
      setSelectedDesignId(design.id)
      setNotice(`Saved ${design.name} to the design library.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not save the design.')
    } finally {
      setIsSaving(false)
    }
  }

  const triggerGeneration = async () => {
    if (!uploadedImagePath) {
      setNotice('Upload a room photo first so the redesign process has a valid original to compare against.')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/designs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_type: form.room_type,
          interior_style: form.interior_style,
          color_palette: form.color_palette,
          furniture_plan: form.furniture_plan,
          budget_inr: form.budget_inr,
          notes: form.notes,
          original_image_path: uploadedImagePath,
        }),
      })
      const payload = await response.json()
      const generation = payload.generation
      setGeneratedImageUrl(payload.generated_image_url || '')
      setGenerationState({
        status: generation?.status ?? 'unavailable',
        message: generation?.message ?? 'Local AI generation is unavailable on this machine.',
        engine: generation?.engine ?? 'none',
      })
      setNotice(generation?.message ?? 'Image generation is not available in this environment.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Generation request failed.')
    } finally {
      setIsGenerating(false)
    }
  }

  const renameDesign = async (designId: number) => {
    const nextName = window.prompt('Rename design:', selectedDesign?.name ?? '')
    if (!nextName || !nextName.trim()) return

    try {
      const response = await fetch(`/api/designs/${designId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName.trim() }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'Rename failed.')
      setDesigns((current) => current.map((design) => (design.id === designId ? payload : design)))
      setNotice(`Renamed design to ${payload.name}.`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Rename failed.')
    }
  }

  const deleteDesign = async (designId: number) => {
    try {
      const response = await fetch(`/api/designs/${designId}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.detail || 'Delete failed.')
      setDesigns((current) => current.filter((design) => design.id !== designId))
      setNotice(payload.deleted ? 'Design removed from the studio.' : 'Design could not be removed.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Delete failed.')
    }
  }

  const downloadDesign = () => {
    const payload = { ...form, original_image_path: uploadedImageUrl, furniture: furnitureItems, created_at: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${form.name.toLowerCase().replace(/\s+/g, '-') || 'roomiq-design'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setNotice('Design brief downloaded successfully.')
  }

  const handleFurniturePointerDown = (event: ReactPointerEvent<HTMLElement>, itemId: string, mode: 'move' | 'resize') => {
    event.preventDefault()
    event.stopPropagation()
    const item = furnitureItems.find((candidate) => candidate.id === itemId)
    if (!item) return

    setSelectedFurnitureId(itemId)
    setDragState({
      id: itemId,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y,
      startWidth: item.width,
      startHeight: item.height,
    })
  }

  const addFurniture = (type: FurnitureType) => {
    const nextItem = buildFurnitureItem(type)
    setFurnitureItems((current) => [...current, nextItem])
    setSelectedFurnitureId(nextItem.id)
    setNotice(`${nextItem.label} added to the design plan.`)
  }

  const updateSelectedFurniture = (patch: Partial<FurniturePlacement>) => {
    if (!selectedFurnitureId) return
    setFurnitureItems((current) => current.map((item) => (item.id === selectedFurnitureId ? { ...item, ...patch } : item)))
  }

  const removeSelectedFurniture = () => {
    if (!selectedFurnitureId) return
    const removed = furnitureItems.find((item) => item.id === selectedFurnitureId)
    setFurnitureItems((current) => current.filter((item) => item.id !== selectedFurnitureId))
    setSelectedFurnitureId(null)
    setNotice(`${removed?.label ?? 'Furniture'} removed from the room plan.`)
  }

  const undoLastLayout = () => {
    if (!undoStack.length) {
      setNotice('No earlier layout changes to undo.')
      return
    }
    const previous = undoStack[undoStack.length - 1]
    setUndoStack((current) => current.slice(0, -1))
    setFurnitureItems(previous)
    setNotice('Last placement change was undone.')
  }

  const clearLayout = () => {
    if (!furnitureItems.length) return
    setUndoStack((current) => [...current.slice(-9), furnitureItems.map((item) => ({ ...item }))])
    setFurnitureItems([])
    setSelectedFurnitureId(null)
    setNotice('Furniture overlay cleared.')
  }

  const scrollToSection = (sectionId: string, item: (typeof navItems)[number]) => {
    setActiveView(item)
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-wrap">
          <button type="button" className="ghost icon-button" onClick={() => setSidebarOpen((open) => !open)}>
            ☰
          </button>
          <div className="brand-block">
            <span className="eyebrow">ROOMIQ</span>
            <h2>AI Interior Design Studio</h2>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="search-box">
            <span>⌕</span>
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search saved rooms" />
          </div>
          <button type="button" className="secondary-btn" onClick={downloadDesign}>
            Download brief
          </button>
          <button type="button" className="primary-btn" onClick={saveDesign} disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save design'}
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
          <div className="section-title">Workspace</div>
          {navItems.map((item) => (
            <button
              key={item}
              type="button"
              className={`nav-item ${activeView === item ? 'active' : ''}`}
              onClick={() => scrollToSection(item.toLowerCase(), item)}
            >
              {item}
            </button>
          ))}

          <div className="mini-panel">
            <div className="mini-label">Local generation</div>
            <p>{generationState?.message ?? 'Checking generator availability…'}</p>
            <span className={`pill ${generationState?.status === 'ready' ? 'success' : 'warn'}`}>
              {generationState?.status === 'ready' ? 'Verified ready' : 'Awaiting engine'}
            </span>
          </div>
        </aside>

        <main className="dashboard">
          <section className="hero-section panel" id="dashboard">
            <div>
              <span className="eyebrow alt">Design command</span>
              <h1>Transform empty rooms into polished, livable concepts.</h1>
            </div>
            <div className="hero-stats">
              <div>
                <strong>{stats.totalProjects}</strong>
                <span>Projects</span>
              </div>
              <div>
                <strong>₹{stats.avgBudget.toLocaleString('en-IN')}</strong>
                <span>Avg budget</span>
              </div>
              <div>
                <strong>{stats.recentCount}</strong>
                <span>Recent</span>
              </div>
            </div>
          </section>

          <section className="stats-grid" id="planner">
            <article className="stat-card panel">
              <span className="stat-kicker">Total budget</span>
              <strong>₹{stats.activeBudget.toLocaleString('en-IN')}</strong>
              <small>Across all saved concepts</small>
            </article>
            <article className="stat-card panel">
              <span className="stat-kicker">Style fit</span>
              <strong>94%</strong>
              <small>Architecture-preserving score</small>
            </article>
            <article className="stat-card panel">
              <span className="stat-kicker">Recent designs</span>
              <strong>{stats.recentCount}</strong>
              <small>Updated in the last 7 days</small>
            </article>
            <article className="stat-card panel">
              <span className="stat-kicker">Engagement</span>
              <strong>4.9/5</strong>
              <small>Client satisfaction index</small>
            </article>
          </section>

          <section className="studio-grid" id="studio">
            <div className="panel form-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow alt">Designer inputs</span>
                  <h3>Room brief</h3>
                </div>
                <button type="button" className="ghost-btn" onClick={() => setForm(initialForm)}>
                  Reset
                </button>
              </div>

              <div className="field-grid">
                <label>
                  Project name
                  <input value={form.name} onChange={(event) => handleFieldChange('name', event.target.value)} />
                </label>
                <label>
                  Room type
                  <select value={form.room_type} onChange={(event) => handleFieldChange('room_type', event.target.value)}>
                    {roomTypeOptions.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Interior style
                  <select value={form.interior_style} onChange={(event) => handleFieldChange('interior_style', event.target.value)}>
                    <option>Warm Minimal</option>
                    <option>Scandinavian</option>
                    <option>Contemporary Luxe</option>
                    <option>Industrial</option>
                    <option>Japandi</option>
                  </select>
                </label>
                <label>
                  Color palette
                  <input value={form.color_palette} onChange={(event) => handleFieldChange('color_palette', event.target.value)} />
                </label>
                <label className="wide">
                  Furniture plan
                  <input value={form.furniture_plan} onChange={(event) => handleFieldChange('furniture_plan', event.target.value)} />
                </label>
                <label>
                  Budget (INR)
                  <input type="number" value={form.budget_inr} onChange={(event) => handleFieldChange('budget_inr', Number(event.target.value || 0))} />
                </label>
                <label className="wide">
                  Design notes
                  <textarea value={form.notes} onChange={(event) => handleFieldChange('notes', event.target.value)} rows={4} />
                </label>
              </div>

              <div className="upload-panel">
                <div
                  className="dropzone"
                  onClick={openUpload}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault()
                    const file = event.dataTransfer.files?.[0]
                    if (file) void uploadImage(file)
                  }}
                >
                  <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={handleFileChange} />
                  <div className="upload-icon">⇪</div>
                  <strong>Drag & drop empty room image</strong>
                  <span>JPG, JPEG, PNG, and WEBP only</span>
                </div>
                <div className="upload-actions">
                  <button type="button" className="primary-btn" onClick={triggerGeneration} disabled={isGenerating}>
                    {isGenerating ? 'Generating…' : 'Generate redesign'}
                  </button>
                  <button type="button" className="secondary-btn" onClick={saveDesign} disabled={isSaving}>
                    {isSaving ? 'Saving…' : 'Save brief'}
                  </button>
                </div>
              </div>
            </div>

            <div className="panel compare-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow alt">Design review</span>
                  <h3>Before / After</h3>
                </div>
                <div className="range-value">{compareValue}%</div>
              </div>

              <div className="editor-layout">
                <div className="editor-toolbar">
                  <div className="furniture-library">
                    {furnitureCatalog.map((item) => (
                      <button key={item.type} type="button" className="catalog-chip" onClick={() => addFurniture(item.type)}>
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <div className="editor-actions">
                    <button type="button" className="secondary-btn" onClick={undoLastLayout} disabled={!undoStack.length}>
                      Undo
                    </button>
                    <button type="button" className="ghost-btn" onClick={clearLayout} disabled={!furnitureItems.length}>
                      Reset layout
                    </button>
                  </div>
                </div>

                <div className="design-stage" ref={stageRef}>
                  {uploadedImageUrl ? (
                    <img src={uploadedImageUrl} alt="Original room" className="design-base-image" />
                  ) : (
                    <div className="room-placeholder before-placeholder">
                      <span>Upload room photo</span>
                    </div>
                  )}

                  {furnitureItems.map((item) => (
                    <div
                      key={item.id}
                      className={`furniture-piece ${selectedFurnitureId === item.id ? 'selected' : ''}`}
                      onPointerDown={(event) => handleFurniturePointerDown(event, item.id, 'move')}
                      style={{
                        left: `${item.x}%`,
                        top: `${item.y}%`,
                        width: `${item.width}%`,
                        height: `${item.height}%`,
                        transform: `translate(-50%, -50%) rotate(${item.rotation}deg)`,
                        background: item.color,
                      }}
                    >
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="resize-handle"
                        aria-label={`Resize ${item.label}`}
                        onPointerDown={(event) => handleFurniturePointerDown(event, item.id, 'resize')}
                      />
                    </div>
                  ))}
                </div>

                {selectedFurniture && (
                  <div className="furniture-inspector">
                    <div>
                      <span className="eyebrow alt">Selected item</span>
                      <h4>{selectedFurniture.label}</h4>
                    </div>

                    <div className="inspector-grid">
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ rotation: selectedFurniture.rotation - 15 })}>Rotate −</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ rotation: selectedFurniture.rotation + 15 })}>Rotate +</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ x: clamp(selectedFurniture.x - 4, 10, 90) })}>←</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ x: clamp(selectedFurniture.x + 4, 10, 90) })}>→</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ y: clamp(selectedFurniture.y - 4, 12, 88) })}>↑</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ y: clamp(selectedFurniture.y + 4, 12, 88) })}>↓</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ width: clamp(selectedFurniture.width - 4, 10, 62) })}>Shrink</button>
                      <button type="button" className="secondary-btn" onClick={() => updateSelectedFurniture({ width: clamp(selectedFurniture.width + 4, 10, 62) })}>Grow</button>
                    </div>

                    <button type="button" className="ghost-btn danger" onClick={removeSelectedFurniture}>
                      Remove item
                    </button>
                  </div>
                )}
              </div>

              <div className="compare-wrap">
                <div className="compare-stage">
                  <div className="before-card">
                    {uploadedImageUrl ? <img src={uploadedImageUrl} alt="Original room" /> : <div className="room-placeholder before-placeholder"><span>Before</span></div>}
                  </div>

                  <div className="after-card" style={{ clipPath: `inset(0 ${100 - compareValue}% 0 0)` }}>
                    {generationState?.status === 'ready' && generatedImageUrl ? (
                      <img src={generatedImageUrl} alt="Redesigned room" />
                    ) : (
                      <div className="room-placeholder after-placeholder">
                        <span>AI generation unavailable</span>
                        <small>{generationState?.message ?? 'No verified local engine configured.'}</small>
                      </div>
                    )}
                  </div>

                  <div className="slider-handle" style={{ left: `${compareValue}%` }}>
                    <span>|</span>
                  </div>
                </div>

                <input type="range" min="0" max="100" value={compareValue} onChange={(event) => setCompareValue(Number(event.target.value))} className="compare-slider" />
              </div>
            </div>
          </section>

          <section className="bottom-grid" id="gallery">
            <div className="panel budget-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow alt">Budget planner</span>
                  <h3>Furnishing plan</h3>
                </div>
              </div>

              <div className="budget-list">
                {recommendations.map((item) => (
                  <div key={item.name} className="budget-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{item.tone}</span>
                    </div>
                    <em>₹{item.amount.toLocaleString('en-IN')}</em>
                  </div>
                ))}
                <div className="budget-total">
                  <span>Live total</span>
                  <strong>₹{budgetTotal.toLocaleString('en-IN')}</strong>
                </div>
              </div>
            </div>

            <div className="panel gallery-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow alt">Saved designs</span>
                  <h3>Recent gallery</h3>
                </div>
              </div>

              <div className="gallery-list">
                {filteredDesigns.slice(0, 4).map((design) => (
                  <article
                    key={design.id}
                    className={`gallery-card ${selectedDesignId === design.id ? 'selected' : ''}`}
                    onClick={() => {
                      applyDesignSnapshot(design)
                      setNotice(`${design.name} reopened from the saved library.`)
                    }}
                  >
                    <div className="gallery-thumb">
                      {design.original_image_path ? (
                        <img src={getImageUrl(design.original_image_path)} alt={design.name} />
                      ) : (
                        <div className="mini-placeholder">{design.room_type}</div>
                      )}
                    </div>
                    <div className="gallery-meta">
                      <div>
                        <strong>{design.name}</strong>
                        <span>{design.room_type}</span>
                      </div>
                      <div className="card-actions">
                        <button type="button" onClick={() => renameDesign(design.id)}>
                          Rename
                        </button>
                        <button type="button" onClick={() => deleteDesign(design.id)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
                {!filteredDesigns.length && <div className="empty-state">No saved designs match this search yet.</div>}
              </div>
            </div>
          </section>

          <div className={`notification ${notice ? 'visible' : ''}`}>{notice}</div>
        </main>
      </div>
    </div>
  )
}

export default App
