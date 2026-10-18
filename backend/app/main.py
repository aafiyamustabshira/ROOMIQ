from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from backend.app.generation import generate_room_redesign, inspect_local_generation_capability

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / 'data'
UPLOAD_DIR = DATA_DIR / 'uploads'
DESIGN_DIR = DATA_DIR / 'designs'
DB_PATH = DATA_DIR / 'roomiq.db'

for directory in (DATA_DIR, UPLOAD_DIR, DESIGN_DIR):
    directory.mkdir(parents=True, exist_ok=True)

app = FastAPI(title='ROOMIQ Studio API', version='1.0.0')
app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def get_db_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_db_connection() as connection:
        connection.execute(
            '''
            CREATE TABLE IF NOT EXISTS designs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                room_type TEXT,
                interior_style TEXT,
                color_palette TEXT,
                furniture_plan TEXT,
                budget_inr INTEGER,
                notes TEXT,
                original_image_path TEXT,
                redesign_image_path TEXT,
                status TEXT DEFAULT 'draft',
                created_at TEXT,
                updated_at TEXT,
                variation_count INTEGER DEFAULT 0,
                metadata TEXT DEFAULT '{}'
            )
            '''
        )
        connection.commit()


init_db()


class DesignInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    room_type: str = Field(default='Living Room')
    interior_style: str = Field(default='Warm Minimal')
    color_palette: str = Field(default='Ivory, walnut, sage')
    furniture_plan: str = Field(default='Sofa, coffee table, accent chair')
    budget_inr: int = Field(default=150000, ge=0)
    notes: str = Field(default='')
    original_image_path: str | None = None
    redesign_image_path: str | None = None
    status: str = 'draft'
    metadata: dict[str, Any] | None = None

    @field_validator('name')
    @classmethod
    def ensure_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError('Design name cannot be empty.')
        return stripped


class DesignUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    room_type: str | None = None
    interior_style: str | None = None
    color_palette: str | None = None
    furniture_plan: str | None = None
    budget_inr: int | None = Field(default=None, ge=0)
    notes: str | None = None
    original_image_path: str | None = None
    redesign_image_path: str | None = None
    status: str | None = None
    metadata: dict[str, Any] | None = None


class GenerationRequest(BaseModel):
    room_type: str = 'Living Room'
    interior_style: str = 'Warm Minimal'
    color_palette: str = 'Ivory, walnut, sage'
    furniture_plan: str = 'Sofa, coffee table, accent chair'
    budget_inr: int = 150000
    notes: str = ''
    design_id: int | None = None
    original_image_path: str | None = None


def serialize_row(row: sqlite3.Row) -> dict[str, Any]:
    result = dict(row)
    result['metadata'] = json.loads(result.get('metadata') or '{}')
    return result


def build_generation_payload() -> dict[str, Any]:
    capability = inspect_local_generation_capability()
    status_value = 'ready' if capability['available'] else 'unavailable'
    return {
        'available': capability['available'],
        'status': status_value,
        'engine': capability['engine'],
        'message': capability['message'],
        'cuda_available': capability['cuda_available'],
        'cuda_device_count': capability['cuda_device_count'],
        'torch_installed': capability['torch_installed'],
        'diffusers_installed': capability['diffusers_installed'],
        'transformers_installed': capability['transformers_installed'],
    }


@app.get('/api/health')
def health_check() -> dict[str, Any]:
    return {
        'status': 'ok',
        'version': app.version,
        'database': 'ready',
        'generated_capability': build_generation_payload(),
    }


@app.post('/api/designs', status_code=201)
def create_design(payload: DesignInput) -> dict[str, Any]:
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    metadata = payload.metadata or {}
    with get_db_connection() as connection:
        cursor = connection.execute(
            '''
            INSERT INTO designs (
                name, room_type, interior_style, color_palette, furniture_plan,
                budget_inr, notes, original_image_path, redesign_image_path, status,
                created_at, updated_at, variation_count, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                payload.name,
                payload.room_type,
                payload.interior_style,
                payload.color_palette,
                payload.furniture_plan,
                payload.budget_inr,
                payload.notes,
                payload.original_image_path,
                payload.redesign_image_path,
                payload.status,
                timestamp,
                timestamp,
                0,
                json.dumps(metadata),
            ),
        )
        design_id = cursor.lastrowid
        row = connection.execute('SELECT * FROM designs WHERE id = ?', (design_id,)).fetchone()
        return serialize_row(row)


@app.get('/api/designs')
def list_designs() -> dict[str, Any]:
    with get_db_connection() as connection:
        rows = connection.execute(
            'SELECT * FROM designs ORDER BY updated_at DESC, id DESC'
        ).fetchall()
        return {'count': len(rows), 'designs': [serialize_row(row) for row in rows]}


@app.get('/api/designs/{design_id}')
def get_design(design_id: int) -> dict[str, Any]:
    with get_db_connection() as connection:
        row = connection.execute('SELECT * FROM designs WHERE id = ?', (design_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Design not found.')
        return serialize_row(row)


@app.put('/api/designs/{design_id}')
def update_design(design_id: int, payload: DesignUpdate) -> dict[str, Any]:
    with get_db_connection() as connection:
        existing = connection.execute('SELECT * FROM designs WHERE id = ?', (design_id,)).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail='Design not found.')

        data = payload.model_dump(exclude_unset=True)
        if not data:
            return serialize_row(existing)

        if 'metadata' in data:
            data['metadata'] = json.dumps(data['metadata'] or {})

        set_clauses: list[str] = []
        values: list[Any] = []
        for key, value in data.items():
            set_clauses.append(f'{key} = ?')
            values.append(value)
        values.append(datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))
        values.append(design_id)

        connection.execute(
            f'UPDATE designs SET {", ".join(set_clauses)}, updated_at = ? WHERE id = ?',
            values,
        )
        connection.commit()
        row = connection.execute('SELECT * FROM designs WHERE id = ?', (design_id,)).fetchone()
        return serialize_row(row)


@app.delete('/api/designs/{design_id}')
def delete_design(design_id: int) -> dict[str, Any]:
    with get_db_connection() as connection:
        row = connection.execute('SELECT * FROM designs WHERE id = ?', (design_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail='Design not found.')

        if row['original_image_path']:
            file_path = Path(row['original_image_path'])
            if file_path.exists():
                file_path.unlink()

        if row['redesign_image_path']:
            file_path = Path(row['redesign_image_path'])
            if file_path.exists():
                file_path.unlink()

        connection.execute('DELETE FROM designs WHERE id = ?', (design_id,))
        connection.commit()
        return {'deleted': True, 'id': design_id}


@app.post('/api/designs/upload')
async def upload_design_image(file: UploadFile = File(...), design_id: int | None = None) -> dict[str, Any]:
    if not file.filename:
        raise HTTPException(status_code=400, detail='A file is required.')

    allowed = {'.png', '.jpg', '.jpeg', '.webp'}
    extension = Path(file.filename).suffix.lower()
    if extension not in allowed:
        raise HTTPException(status_code=400, detail='Only PNG, JPG, JPEG, and WEBP images are supported.')

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail='The uploaded file is empty. Please choose a valid room photo.')
    if len(content) > 12 * 1024 * 1024:
        raise HTTPException(status_code=400, detail='The uploaded image is too large. Please keep it under 12 MB.')

    safe_name = f'{datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")}_{abs(hash(file.filename))}{extension}'
    file_path = UPLOAD_DIR / safe_name
    file_path.write_bytes(content)

    if design_id is not None:
        with get_db_connection() as connection:
            connection.execute(
                'UPDATE designs SET original_image_path = ?, updated_at = ? WHERE id = ?',
                (str(file_path), datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), design_id),
            )
            connection.commit()

    return {
        'filename': file.filename,
        'path': str(file_path),
        'url': f'/api/images/{safe_name}',
    }


@app.get('/api/images/{filename}')
def get_image(filename: str):
    from fastapi.responses import FileResponse

    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='Image not found.')
    return FileResponse(file_path)


@app.post('/api/designs/generate')
def generate_design(payload: GenerationRequest) -> dict[str, Any]:
    generation_status = build_generation_payload()
    suggestion = {
        'status': generation_status['status'],
        'available': generation_status['available'],
        'message': generation_status['message'],
        'engine': generation_status['engine'],
        'room_type': payload.room_type,
        'interior_style': payload.interior_style,
        'color_palette': payload.color_palette,
        'furniture_plan': payload.furniture_plan,
        'budget_inr': payload.budget_inr,
        'notes': payload.notes,
        'generated_variations': [],
    }

    if not payload.original_image_path:
        return {
            'generation': {
                **suggestion,
                'status': 'unavailable',
                'available': False,
                'message': 'Upload a room photo before requesting a redesign. This environment does not yet have a verified local image-generation engine.',
            },
            'design_id': payload.design_id,
            'generated_image_url': '',
        }

    if not generation_status['available']:
        return {'generation': suggestion, 'design_id': payload.design_id, 'generated_image_url': ''}

    try:
        output_path = generate_room_redesign(
            original_image_path=payload.original_image_path,
            room_type=payload.room_type,
            interior_style=payload.interior_style,
            color_palette=payload.color_palette,
            furniture_plan=payload.furniture_plan,
            notes=payload.notes,
            output_dir=DESIGN_DIR,
            variation=1,
        )
        generated_url = f'/api/generated/{Path(output_path).name}'
        suggestion['generated_variations'] = [
            {
                'id': 1,
                'name': 'Signature Update',
                'summary': 'The room has been reimagined with realistic furniture, warmer materials, and polished styling that respects the architecture.',
                'budget_estimate_inr': payload.budget_inr,
                'image_url': generated_url,
            }
        ]
        suggestion['status'] = 'ready'
        suggestion['message'] = 'A real local image-to-image redesign was generated successfully from the uploaded room photo.'
        return {'generation': suggestion, 'design_id': payload.design_id, 'generated_image_url': generated_url}
    except Exception as error:  # pragma: no cover - runtime path, reported to caller
        suggestion['status'] = 'failed'
        suggestion['message'] = f'Generation failed ({type(error).__name__}): {error!r}'
        suggestion['available'] = False
        return {'generation': suggestion, 'design_id': payload.design_id, 'error': str(error), 'generated_image_url': ''}


@app.get('/api/generated/{filename}')
def get_generated_image(filename: str):
    from fastapi.responses import FileResponse

    file_path = DESIGN_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail='Generated image not found.')
    return FileResponse(file_path)


if __name__ == '__main__':
    import uvicorn

    uvicorn.run('backend.app.main:app', host='127.0.0.1', port=8000, reload=True)
