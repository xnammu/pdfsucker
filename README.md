# PDF Sucker

PDF Sucker is a fast and reliable desktop application built with Next.js and Tauri. It allows you to seamlessly convert PDF documents into high-quality JPG images and extract pages effortlessly.

## Features

- **PDF to Image Conversion:** Quickly convert your PDF files into individual JPG images.
- **Bulk Export:** Utilizes `jszip` to easily compress and export your extracted images as a single ZIP file.
- **Modern UI:** A sleek, responsive, and user-friendly interface built with Next.js, Tailwind CSS, and Radix UI components.
- **Cross-Platform:** Built on top of Tauri, ensuring it runs efficiently as a native desktop application with minimal resource overhead.
- **Local Processing:** All conversions happen locally on your machine, ensuring your documents remain private and secure.

## Prerequisites

Before you begin, ensure you have met the following requirements:
- **Node.js** (v18 or higher recommended)
- **pnpm** (as the package manager used in this project)
- **Rust** and **Cargo** (required for building the Tauri backend)
- Any OS-specific dependencies required by Tauri (e.g., C++ build tools on Windows). Refer to the [Tauri Prerequisites Guide](https://tauri.app/v1/guides/getting-started/prerequisites) for more details.

## Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd pdf-to-jpg-conversion
   ```

2. **Install frontend dependencies:**
   ```bash
   pnpm install
   ```

## Running the Application

### Development Mode

To run the application in development mode with hot-reloading for both the frontend and the Tauri backend:

```bash
pnpm tauri dev
```

### Production Build

To build the application for release (creates a standalone executable for your operating system):

```bash
pnpm tauri build
```
The compiled executable will be located in the `src-tauri/target/release/` directory.

## Tech Stack

- **Frontend:** [Next.js](https://nextjs.org/), [React](https://react.dev/), [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [Radix UI](https://www.radix-ui.com/), [Lucide React](https://lucide.dev/)
- **Backend/Desktop:** [Tauri](https://tauri.app/)
- **PDF Processing:** [PDF.js](https://mozilla.github.io/pdf.js/)
- **Archiving:** [JSZip](https://stuk.github.io/jszip/)

## Icon 

- **Icon Logo:** [main-logo.png](public/main-logo.png)
- **Command to generate icon:** npx tauri icon public/main-logo.png


