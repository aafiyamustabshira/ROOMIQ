import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.app.generation import inspect_local_generation_capability
from backend.app.main import app

client = TestClient(app)


def test_health_check():
    response = client.get('/api/health')
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'ok'
    assert 'version' in body


def test_designs_crud_flow():
    create_response = client.post('/api/designs', json={
        'name': 'Living Room Refresh',
        'room_type': 'Living Room',
        'interior_style': 'Warm Minimal',
        'color_palette': 'Sand, Ivory, Walnut',
        'budget_inr': 180000,
        'furniture_plan': 'Sofa, rug, coffee table',
        'notes': 'Brighten the room with natural textures.',
    })
    assert create_response.status_code == 201
    design = create_response.json()
    assert design['name'] == 'Living Room Refresh'
    assert design['budget_inr'] == 180000

    list_response = client.get('/api/designs')
    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload['count'] >= 1
    assert any(item['id'] == design['id'] for item in payload['designs'])

    rename_response = client.put(f"/api/designs/{design['id']}", json={'name': 'Updated Living Room'})
    assert rename_response.status_code == 200
    assert rename_response.json()['name'] == 'Updated Living Room'

    delete_response = client.delete(f"/api/designs/{design['id']}")
    assert delete_response.status_code == 200
    assert delete_response.json()['deleted'] is True


def test_generation_status_reports_local_limitations():
    response = client.post('/api/designs/generate', json={
        'room_type': 'Bedroom',
        'interior_style': 'Scandinavian',
        'color_palette': 'Ivory, oak, charcoal',
        'budget_inr': 120000,
        'furniture_plan': 'Bedframe, side table, lamp',
    })
    assert response.status_code == 200
    body = response.json()
    assert 'generation' in body
    assert 'status' in body['generation']
    assert body['generation']['available'] is False


def test_upload_validation_and_design_metadata_round_trip():
    image_bytes = io.BytesIO()
    image_bytes.name = 'sample.png'
    from PIL import Image

    image = Image.new('RGB', (200, 200), color='lightblue')
    image.save(image_bytes, format='PNG')
    image_bytes.seek(0)

    valid_upload = client.post('/api/designs/upload', files={'file': ('sample.png', image_bytes.getvalue(), 'image/png')})
    assert valid_upload.status_code == 200
    payload = valid_upload.json()
    assert payload['filename'] == 'sample.png'
    assert payload['url'].startswith('/api/images/')

    invalid_upload = client.post('/api/designs/upload', files={'file': ('sample.gif', b'not-an-image', 'image/gif')})
    assert invalid_upload.status_code == 400
    assert 'Only PNG' in invalid_upload.json()['detail']

    create_response = client.post('/api/designs', json={
        'name': 'Bedroom Save Test',
        'room_type': 'Bedroom',
        'interior_style': 'Warm Minimal',
        'color_palette': 'Ivory, walnut, sage',
        'budget_inr': 150000,
        'furniture_plan': 'Bed, wardrobe, curtains',
        'notes': 'Keep storage simple and warm.',
        'metadata': {'furniture': [{'id': 'bed-1', 'type': 'Bed', 'label': 'Bed', 'x': 50, 'y': 58, 'width': 36, 'height': 28, 'rotation': 0, 'color': '#d9c3a1'}]},
    })
    assert create_response.status_code == 201
    design_id = create_response.json()['id']

    reopened = client.get(f'/api/designs/{design_id}')
    assert reopened.status_code == 200
    reopened_payload = reopened.json()
    assert reopened_payload['metadata']['furniture'][0]['type'] == 'Bed'


@pytest.mark.skipif(
    not inspect_local_generation_capability()['available'],
    reason='No local generation engine available on this machine.',
)
def test_output_file_created_when_model_available():
    image_path = Path('backend/data/test_room_input.png')
    assert image_path.exists(), 'Room input fixture is missing.'

    from backend.app.generation import generate_room_redesign

    output = generate_room_redesign(
        original_image_path=image_path,
        room_type='Bedroom',
        interior_style='Warm Minimal',
        color_palette='Ivory, walnut, sage',
        furniture_plan='Queen bed, wardrobe, bedside tables, curtains',
        notes='Preserve geometry and perspective.',
        output_dir='backend/data/designs',
        variation=2,
        timeout_seconds=180,
    )
    path = Path(output)
    assert path.exists(), 'Generated file was not created.'
    assert path.stat().st_size > 0, 'Generated file is empty.'
    assert path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.webp'}


@pytest.mark.skipif(
    inspect_local_generation_capability()['available'],
    reason='Real generation integration test runs only when the model is not available here.',
)
def test_generation_integration_requires_available_model():
    assert inspect_local_generation_capability()['available'] is False
