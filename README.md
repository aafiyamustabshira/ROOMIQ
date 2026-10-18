# ROOMIQ — AI Interior Design Studio

ROOMIQ is a full-stack interior design application that lets users upload a room photo, configure a redesign, and generate an AI-assisted room image using a local Stable Diffusion Turbo image-to-image pipeline.

The project combines a React and TypeScript interface, a FastAPI backend, local image generation, and SQLite-backed design storage.

## Features

- Room-photo upload and design configuration
- Interior style, colour palette, furniture, and budget controls
- Local AI image-to-image generation using `stabilityai/sd-turbo`
- GPU acceleration when a compatible CUDA-enabled PyTorch installation is available
- Saved design metadata and design-history workflows
- API endpoints for health checks, uploads, image delivery, generation, and saved designs
- Automated backend tests and a Vite production build

## Technology stack

- Frontend: React, TypeScript, Vite
- Backend: Python, FastAPI, Uvicorn
- AI image generation: PyTorch, Diffusers, Stable Diffusion Turbo
- Image processing: Pillow
- Persistence: SQLite
- Testing: Pytest

## Requirements

- Windows 10/11 or another supported Python environment
- Python 3.12 recommended
- Node.js and npm compatible with the installed Vite version
- An NVIDIA GPU with a compatible driver and CUDA-enabled PyTorch build is recommended for local GPU generation
- Internet access is required the first time the model needs to be downloaded from Hugging Face

The local GPU setup was tested with an NVIDIA GeForce RTX 2050 (4 GB VRAM), CUDA-enabled PyTorch, and the package versions listed in `requirements.txt`. Generation uses reduced image dimensions and a low inference-step count to accommodate limited GPU memory. Results and performance will vary by machine.

## Setup on Windows PowerShell

Open PowerShell in the project directory:

```powershell
cd "C:\Users\AAFIYA MUSTABSHIRA\Desktop\ROOMIQ_Studio"
```

### 1. Create a Python environment

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

### 2. Install PyTorch

Install a PyTorch build compatible with your NVIDIA driver and desired CUDA runtime. For the CUDA 12.6 package index, the command is:

```powershell
python -m pip install torch --index-url https://download.pytorch.org/whl/cu126
```

Check that CUDA is detected:

```powershell
python -c "import torch; print('PyTorch:', torch.__version__); print('CUDA available:', torch.cuda.is_available()); print('GPU:', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'Not detected')"
```

If CUDA is unavailable, check the PyTorch installation and NVIDIA driver before attempting GPU generation.

### 3. Install backend dependencies

```powershell
python -m pip install -r requirements.txt
```

### 4. Install frontend dependencies

```powershell
npm install
```

### 5. Start the backend

In the first terminal:

```powershell
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Keep this terminal running. If port 8000 is already occupied, stop the existing server or select an unused port and update the frontend API configuration accordingly.

### 6. Start the frontend

In a second terminal, from the project directory:

```powershell
npm run dev
```

Open the local URL printed by Vite, normally:

http://localhost:5173

## Development commands

Run backend tests:

```powershell
python -m pytest backend/tests/test_app.py
```

Create a frontend production build:

```powershell
npm run build
```

Check frontend lint:

```powershell
npm run lint
```

## AI generation notes

ROOMIQ uses a local Diffusers pipeline with the `stabilityai/sd-turbo` model. The first model download requires internet access. Once downloaded and cached, model inference can run locally without a paid image-generation API, provided the required model files and dependencies remain available.

Image generation can be resource-intensive. GPU compatibility, available VRAM, image dimensions, and inference settings affect output quality and runtime. A successful generation on one machine does not guarantee the same performance on another.

## Data and privacy

The application stores local application data, uploads, generated images, and database files under its configured backend storage paths. Review the backend configuration before exposing the service publicly. Do not commit personal room photographs, generated private images, local databases, credentials, or model weights.

The development server is intended for local development, not direct public production deployment.

## Project structure

```text
ROOMIQ_Studio/
├── backend/
│   ├── app/
│   │   ├── generation.py
│   │   └── main.py
│   └── tests/
├── public/
├── src/
├── index.html
├── package.json
├── requirements.txt
└── vite.config.ts
```

## Project status

Local AI image generation has been exercised on an NVIDIA RTX 2050, and the application includes a backend API and a React/Vite frontend. Run the test suite and production build in your own environment to verify the current checkout before publishing.

## License

No open-source license has been specified yet. Contact the project owner for permission before redistributing this project.
