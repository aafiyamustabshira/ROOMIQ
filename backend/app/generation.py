from __future__ import annotations

import hashlib
import importlib.util
import os
import time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from pathlib import Path
from typing import Any

import torch
from PIL import Image, ImageChops, ImageOps, ImageStat


MODEL_ID = os.getenv('ROOMIQ_MODEL_ID', 'stabilityai/sd-turbo')


def inspect_local_generation_capability() -> dict:
    """Detect whether a compatible local image-generation stack is present."""
    torch_present = importlib.util.find_spec('torch') is not None
    diffusers_present = importlib.util.find_spec('diffusers') is not None
    transformers_present = importlib.util.find_spec('transformers') is not None
    accelerate_present = importlib.util.find_spec('accelerate') is not None
    pillow_present = importlib.util.find_spec('PIL') is not None

    cuda_available = False
    cuda_device_count = 0

    if torch_present:
        try:
            cuda_available = bool(torch.cuda.is_available())
            cuda_device_count = int(torch.cuda.device_count())
        except Exception:
            cuda_available = False
            cuda_device_count = 0

    status = {
        'available': False,
        'engine': 'none',
        'cuda_available': cuda_available,
        'cuda_device_count': cuda_device_count,
        'torch_installed': torch_present,
        'diffusers_installed': diffusers_present,
        'transformers_installed': transformers_present,
        'accelerate_installed': accelerate_present,
        'pillow_installed': pillow_present,
        'status': 'unavailable',
        'message': (
            'No verified local image-generation engine is available on this machine. '
            'The app remains fully usable for upload, comparison, gallery, budget planning, and saved designs.'
        ),
    }

    if torch_present and diffusers_present and pillow_present:
        status['engine'] = 'diffusers-sd-turbo-gpu' if cuda_available else 'diffusers-sd-turbo-cpu'
        status['status'] = 'ready' if cuda_available else 'cpu-eligible'
        status['available'] = True
        status['message'] = (
            'A lightweight SD-Turbo image-to-image pipeline is available. '
            'It is designed for local, free image editing and should run on CPU with slower performance than GPU.'
        )

    return status


def _room_furniture_map(room_type: str) -> str:
    room_key = (room_type or '').lower().strip()
    if 'bed' in room_key:
        return (
            'double bed with upholstered headboard, wardrobe, two bedside tables, curtains, warm wall sconces, ' 
            'neutral rug, layered bedding, compact decor, soft ambient lighting'
        )
    if 'living' in room_key:
        return (
            'L-shaped sofa, coffee table, TV console, soft rug, accent chair, floor lamp, curtain panels, ' 
            'artwork, warm neutral decor, layered lighting'
        )
    if 'dining' in room_key:
        return (
            'dining table with seating for four to six, pendant lighting above the table, display cabinet, ' 
            'woven rug, modern chairs, subtle decor, natural textures'
        )
    if 'office' in room_key or 'study' in room_key:
        return (
            'executive desk, ergonomic chair, bookcase, desk lamp, rug, pinned wall art, minimal storage, clean lighting'
        )
    if 'kitchen' in room_key:
        return (
            'modern kitchen island, cabinets, pendant lights, bar stools, countertop styling, backsplash, functional storage'
        )
    return (
        'premium furniture layout with a sofa, accent chair, coffee table, lighting, textural rug, decor accents, ' 
        'and balanced storage'
    )


def _build_generation_prompt(room_type: str, interior_style: str, color_palette: str, furniture_plan: str, notes: str) -> str:
    furniture_text = furniture_plan.strip() or _room_furniture_map(room_type)
    palette_text = color_palette.strip() or 'warm ivory, walnut, muted sage'
    style_text = interior_style.strip() or 'warm minimal'
    notes_text = notes.strip()

    prompt = (
        f"Photorealistic {room_type} interior redesign in {style_text} style. "
        f"Keep the existing walls, windows, doors, floor, ceiling height, room proportions, and camera perspective intact. "
        f"Replace the room with realistic {furniture_text}. "
        f"Use the palette {palette_text}. "
        f"Keep walking paths clear, do not block windows or doors, and preserve architectural lines. "
        f"High-end interior design, realistic materials, soft natural lighting, premium textures, balanced composition, design studio quality, coherent layout."
    )
    if notes_text:
        prompt += f" {notes_text}"
    return prompt


def _prepare_image(image_path: str | Path, max_dimension: int = 512) -> Image.Image:
    image = Image.open(image_path).convert('RGB')
    width, height = image.size
    scale = min(1.0, max_dimension / max(width, height))
    resized = image.resize((max(1, int(width * scale)), max(1, int(height * scale))))
    return ImageOps.exif_transpose(resized)


@lru_cache(maxsize=1)
def _get_pipeline() -> Any:
    if importlib.util.find_spec('diffusers') is None:
        raise RuntimeError('diffusers is not installed.')

    from diffusers import StableDiffusionImg2ImgPipeline

    torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32
    pipe = StableDiffusionImg2ImgPipeline.from_pretrained(
        MODEL_ID,
        torch_dtype=torch_dtype,
    )
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    pipe.to(device)
    if hasattr(pipe, 'safety_checker'):
        pipe.safety_checker = None
    if hasattr(pipe, 'enable_attention_slicing'):
        pipe.enable_attention_slicing()
    return pipe


def _verify_output_difference(original_image_path: str | Path, generated_path: str | Path) -> bool:
    original = Image.open(original_image_path).convert('RGB')
    generated = Image.open(generated_path).convert('RGB')
    if original.size != generated.size:
        generated = generated.resize(original.size)

    diff = ImageChops.difference(original, generated)
    hist = diff.histogram()
    total = sum(hist[1:])
    return total > 20000


def generate_room_redesign(
    original_image_path: str | Path,
    room_type: str,
    interior_style: str,
    color_palette: str,
    furniture_plan: str,
    notes: str,
    output_dir: str | Path,
    variation: int = 1,
    timeout_seconds: int = 180,
) -> str:
    """Generate an image-to-image redesign from an uploaded room photo with a realistic prompt."""
    if importlib.util.find_spec('diffusers') is None:
        raise RuntimeError('The Diffusers image engine is not installed in the backend environment.')

    source_image = _prepare_image(original_image_path)
    prompt = _build_generation_prompt(room_type, interior_style, color_palette, furniture_plan, notes)
    negative_prompt = (
        'low detail, distorted furniture, cluttered layout, blocked windows, bad perspective, '
        'floating objects, duplicate furniture, warped walls, unrealistic scale, oversaturated colors, blurry'
    )

    def _run_generation() -> str:
        pipe = _get_pipeline()
        generation = pipe(
            prompt=prompt,
            image=source_image,
            negative_prompt=negative_prompt,
            strength=0.55,
            guidance_scale=2.0,
            num_inference_steps=2,
        )
        generated = generation.images[0]

        output_dir_path = Path(output_dir)
        output_dir_path.mkdir(parents=True, exist_ok=True)
        safe_name = f"roomiq_{hashlib.sha1(str(original_image_path).encode('utf-8')).hexdigest()[:12]}_v{variation}.png"
        output_path = output_dir_path / safe_name
        generated.save(output_path)
        return str(output_path)

    start = time.monotonic()
    with ThreadPoolExecutor(max_workers=1) as executor:
        future = executor.submit(_run_generation)
        try:
            output_path = future.result(timeout=max(10, timeout_seconds))
        except TimeoutError as exc:
            executor.shutdown(wait=False, cancel_futures=True)
            raise TimeoutError(
                f'Image generation timed out after {timeout_seconds} seconds. '
                'The machine is slower than expected, or the model is still loading on CPU.'
            ) from exc

    elapsed = time.monotonic() - start
    output_path_obj = Path(output_path)
    if not output_path_obj.exists() or output_path_obj.stat().st_size == 0:
        raise RuntimeError('The image generation step did not create a valid output file.')
    if not _verify_output_difference(original_image_path, output_path_obj):
        raise RuntimeError('The generated image was created but does not differ meaningfully from the input.')

    return str(output_path_obj)
